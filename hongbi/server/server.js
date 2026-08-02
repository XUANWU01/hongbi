/* ============================================================
   红笔 HONGBI v2 · 后端服务（零依赖：Node 内置 http + node:sqlite）
   职责：
     1. 静态托管 hongbi/ 前端
     2. REST API：题库/题目/答题/收藏 分层管理，跨用户共享
   运行：node server/server.js   （默认端口 8712，监听 0.0.0.0）
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { SEED_SETS } = require('./seed.js');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'hongbi.db');
const PORT = Number(process.env.PORT || 8712);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_KEY = process.env.HONGBI_ADMIN_KEY || '';
const MAX_BODY = 5 * 1024 * 1024;
const MAX_QUESTIONS_PER_SET = 3000;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

/* ---------- Schema ---------- */
db.exec(`
  CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    desc TEXT DEFAULT '',
    category TEXT DEFAULT '其他',
    tags TEXT DEFAULT '[]',
    source TEXT DEFAULT 'public',
    owner TEXT DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    q TEXT NOT NULL,
    options TEXT DEFAULT '[]',
    answer TEXT DEFAULT '',
    explanation TEXT DEFAULT '',
    type TEXT DEFAULT 'text'
  );
  CREATE INDEX IF NOT EXISTS idx_questions_set ON questions(set_id);
  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    set_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    client_id TEXT DEFAULT '',
    correct INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS favorites (
    id TEXT PRIMARY KEY,
    set_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

/* ---------- v1 → v2 迁移：补列 + sets.questions(JSON) → questions 表 ---------- */
function migrateV1() {
  const cols = db.prepare('PRAGMA table_info(sets)').all().map(c => c.name);
  if (!cols.includes('updated_at')) {
    db.exec('ALTER TABLE sets ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('questions')) return; // 已是 v2 结构
  const hasQ = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
  if (hasQ > 0) return;
  const rows = db.prepare("SELECT id, questions FROM sets WHERE questions IS NOT NULL AND questions != ''").all();
  const ins = db.prepare('INSERT OR IGNORE INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');
  let total = 0;
  for (const r of rows) {
    let qs = [];
    try { qs = JSON.parse(r.questions); } catch (e) { continue; }
    if (!Array.isArray(qs)) continue;
    qs.forEach((q, i) => {
      if (!q || !q.q) return;
      const options = Array.isArray(q.options) ? q.options.map(String) : [];
      ins.run(
        (r.id + '_q' + i),
        r.id, i,
        String(q.q || '').slice(0, 2000),
        JSON.stringify(options),
        String(q.answer || '').slice(0, 2000),
        String(q.explanation || '').slice(0, 3000),
        options.length >= 2 ? 'choice' : 'text'
      );
      total++;
    });
  }
  if (total > 0) console.log('[migrate] v1 题库迁移完成：' + rows.length + ' 套 / ' + total + ' 题');
  try { db.exec('ALTER TABLE sets DROP COLUMN questions'); } catch (e) { /* 忽略 */ }
}
migrateV1();

/* ---------- 种子 ---------- */
function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM sets').get();
  if (n > 0) return;
  const insSet = db.prepare('INSERT INTO sets (id, title, desc, category, tags, source, owner, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const insQ = db.prepare('INSERT INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');
  for (const s of SEED_SETS) {
    const now = Date.now();
    insSet.run(s.id, s.title, s.desc, s.category, JSON.stringify(s.tags), s.source, s.owner, 0, now);
    s.questions.forEach((q, i) => {
      const options = Array.isArray(q.options) ? q.options.map(String) : [];
      insQ.run(s.id + '_q' + i, s.id, i, String(q.q), JSON.stringify(options), String(q.answer || ''), String(q.explanation || ''), options.length >= 2 ? 'choice' : 'text');
    });
  }
  console.log('[seed] 已写入 ' + SEED_SETS.length + ' 套官方题库');
}
seedIfEmpty();

/* ---------- 工具 ---------- */
function sendJSON(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key'
  });
  res.end(JSON.stringify(obj));
}
function safeParse(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }
function escLike(s) { return String(s).replace(/[\\%_]/g, c => '\\' + c); }
// 管理员判定：仅当配置了 HONGBI_ADMIN_KEY 且请求头匹配时才视为管理员；
// 未配置密钥时，权限校验只认题库 owner。
function isAdmin(req) { return !!ADMIN_KEY && req.headers['x-admin-key'] === ADMIN_KEY; }

function getSet(id) {
  return db.prepare('SELECT * FROM sets WHERE id = ?').get(id);
}
function getQuestions(setId) {
  return db.prepare('SELECT * FROM questions WHERE set_id = ? ORDER BY idx ASC').all(setId)
    .map(r => ({ id: r.id, q: r.q, options: safeParse(r.options, []), answer: r.answer, explanation: r.explanation, type: r.type }));
}
function setToJSON(r) {
  return {
    id: r.id, title: r.title, desc: r.desc, category: r.category,
    tags: safeParse(r.tags, []), source: r.source, owner: r.owner,
    createdAt: r.created_at, updatedAt: r.updated_at
  };
}

function validateQuestions(list) {
  if (!Array.isArray(list)) throw '题目格式错误';
  const qs = list.slice(0, MAX_QUESTIONS_PER_SET).map(q => {
    const options = Array.isArray(q && q.options) ? q.options.map(o => String(o).slice(0, 500)).slice(0, 10) : [];
    return {
      q: String((q && q.q) || '').slice(0, 2000),
      options,
      answer: String((q && q.answer) || '').slice(0, 2000),
      explanation: String((q && q.explanation) || '').slice(0, 3000),
      type: options.length >= 2 ? 'choice' : 'text'
    };
  }).filter(q => q.q);
  return qs;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ---------- API 路由 ---------- */
async function handleAPI(req, res, p, url) {
  const method = req.method;

  // GET /api/health
  if (p === '/api/health' && method === 'GET') {
    sendJSON(res, 200, {
      ok: true, name: 'hongbi-api-v2',
      sets: db.prepare('SELECT COUNT(*) AS n FROM sets').get().n,
      questions: db.prepare('SELECT COUNT(*) AS n FROM questions').get().n
    });
    return true;
  }

  // GET /api/stats/global
  if (p === '/api/stats/global' && method === 'GET') {
    sendJSON(res, 200, {
      sets: db.prepare('SELECT COUNT(*) AS n FROM sets').get().n,
      questions: db.prepare('SELECT COUNT(*) AS n FROM questions').get().n,
      contributors: db.prepare('SELECT COUNT(DISTINCT owner) AS n FROM sets WHERE source = ?').get('public').n
    });
    return true;
  }

  // GET /api/sets  （分页搜索）
  if (p === '/api/sets' && method === 'GET') {
    const search = String(url.searchParams.get('search') || '').trim();
    const cat = String(url.searchParams.get('cat') || '').trim();
    const sort = String(url.searchParams.get('sort') || 'new');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(url.searchParams.get('size') || '12', 10) || 12));

    const where = [];
    const params = [];
    if (search) {
      const like = '%' + escLike(search) + '%';
      where.push('(s.title LIKE ? ESCAPE \'\\\' OR s.desc LIKE ? ESCAPE \'\\\' OR s.tags LIKE ? ESCAPE \'\\\' OR s.category LIKE ? ESCAPE \'\\\')');
      params.push(like, like, like, like);
    }
    if (cat && cat !== '全部') { where.push('s.category = ?'); params.push(cat); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const orderSql = sort === 'count' ? 'ORDER BY qn DESC, s.created_at DESC'
      : sort === 'hot' ? 'ORDER BY an DESC, s.created_at DESC'
      : 'ORDER BY s.created_at DESC, s.id ASC';

    const { total } = db.prepare(
      'SELECT COUNT(*) AS total FROM sets s ' + whereSql
    ).get(...params);
    const rows = db.prepare(
      'SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.set_id = s.id) AS qn, ' +
      '(SELECT COUNT(*) FROM attempts a WHERE a.set_id = s.id) AS an ' +
      'FROM sets s ' + whereSql + ' ' + orderSql + ' LIMIT ? OFFSET ?'
    ).all(...params, size, (page - 1) * size);

    sendJSON(res, 200, {
      total, page, size,
      sets: rows.map(r => Object.assign(setToJSON(r), { questionCount: r.qn, hot: r.an }))
    });
    return true;
  }

  // GET /api/sets/:id
  let m = p.match(/^\/api\/sets\/([^/]+)$/);
  if (m && method === 'GET') {
    const r = getSet(m[1]);
    if (!r) { sendJSON(res, 404, { error: '题库不存在' }); return true; }
    sendJSON(res, 200, Object.assign(setToJSON(r), { questions: getQuestions(m[1]) }));
    return true;
  }

  // POST /api/sets
  if (p === '/api/sets' && method === 'POST') {
    const body = safeParse(await readBody(req), null);
    if (!body || typeof body !== 'object') { sendJSON(res, 400, { error: '请求体格式错误' }); return true; }
    const title = String(body.title || '').trim();
    if (!title) { sendJSON(res, 400, { error: '缺少标题' }); return true; }
    if (title.length > 60) { sendJSON(res, 400, { error: '标题过长（最多 60 字）' }); return true; }
    const questions = validateQuestions(body.questions);
    if (questions.length === 0) { sendJSON(res, 400, { error: '题目为空，无法上传' }); return true; }

    // 重复检测：同标题 + 同题数
    const dup = db.prepare('SELECT id FROM sets WHERE title = ? AND source = ?').get(title, 'public');
    if (dup) {
      const n = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE set_id = ?').get(dup.id).n;
      if (n === questions.length) {
        sendJSON(res, 409, { error: '已存在同名同题数的题库，可能重复贡献' });
        return true;
      }
    }

    const clientId = String(body.clientId || 'anonymous').slice(0, 64);
    db.prepare('INSERT OR IGNORE INTO clients (id, created_at) VALUES (?, ?)').run(clientId, Date.now());
    const set = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title,
      desc: String(body.desc || '').slice(0, 200),
      category: String(body.category || '其他').slice(0, 20),
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 5) : [],
      source: 'public',
      owner: clientId,
      createdAt: Date.now()
    };
    db.prepare('INSERT INTO sets (id, title, desc, category, tags, source, owner, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(set.id, set.title, set.desc, set.category, JSON.stringify(set.tags), set.source, set.owner, set.createdAt, set.createdAt);
    insertQuestions(set.id, questions);
    console.log('[api] + 新共享题库「' + set.title + '」' + questions.length + ' 题 (by ' + clientId + ')');
    sendJSON(res, 200, Object.assign(set, { questions }));
    return true;
  }

  // PATCH /api/sets/:id  （改元信息，owner/admin）
  m = p.match(/^\/api\/sets\/([^/]+)$/);
  if (m && method === 'PATCH') {
    const r = getSet(m[1]);
    if (!r) { sendJSON(res, 404, { error: '题库不存在' }); return true; }
    if (r.source === 'official') { sendJSON(res, 403, { error: '官方题库不可修改' }); return true; }
    const body = safeParse(await readBody(req), null);
    const clientId = String((body && body.clientId) || '').slice(0, 64);
    if (!(r.owner === clientId || isAdmin(req))) { sendJSON(res, 403, { error: '只能修改自己的贡献' }); return true; }
    const title = body.title !== undefined ? String(body.title).trim().slice(0, 60) : r.title;
    if (!title) { sendJSON(res, 400, { error: '标题不能为空' }); return true; }
    const desc = body.desc !== undefined ? String(body.desc).slice(0, 200) : r.desc;
    const category = body.category !== undefined ? String(body.category).slice(0, 20) : r.category;
    const tags = body.tags !== undefined ? (Array.isArray(body.tags) ? body.tags.map(String).slice(0, 5) : safeParse(r.tags, [])) : safeParse(r.tags, []);
    db.prepare('UPDATE sets SET title = ?, desc = ?, category = ?, tags = ?, updated_at = ? WHERE id = ?')
      .run(title, desc, category, JSON.stringify(tags), Date.now(), m[1]);
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // DELETE /api/sets/:id
  if (m && method === 'DELETE') {
    const r = getSet(m[1]);
    if (!r) { sendJSON(res, 404, { error: '题库不存在' }); return true; }
    if (r.source === 'official') { sendJSON(res, 403, { error: '官方题库不可删除' }); return true; }
    const clientId = String((req.headers['x-client-id'] || '')).slice(0, 64);
    if (!(r.owner === clientId || isAdmin(req))) { sendJSON(res, 403, { error: '只能删除自己的贡献' }); return true; }
    db.prepare('DELETE FROM questions WHERE set_id = ?').run(m[1]);
    db.prepare('DELETE FROM sets WHERE id = ?').run(m[1]);
    console.log('[api] - 删除共享题库「' + r.title + '」');
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // POST /api/sets/:id/questions  （追加题目，owner/admin）
  m = p.match(/^\/api\/sets\/([^/]+)\/questions$/);
  if (m && method === 'POST') {
    const r = getSet(m[1]);
    if (!r) { sendJSON(res, 404, { error: '题库不存在' }); return true; }
    if (r.source === 'official') { sendJSON(res, 403, { error: '官方题库不可追加' }); return true; }
    const body = safeParse(await readBody(req), null);
    const clientId = String((body && body.clientId) || '').slice(0, 64);
    if (!(r.owner === clientId || isAdmin(req))) { sendJSON(res, 403, { error: '只能给自己的贡献追加题目' }); return true; }
    const newQs = validateQuestions(body && body.questions);
    if (newQs.length === 0) { sendJSON(res, 400, { error: '没有可追加的题目' }); return true; }
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE set_id = ?').get(m[1]);
    if (n + newQs.length > MAX_QUESTIONS_PER_SET) { sendJSON(res, 400, { error: '题目总数超过上限 ' + MAX_QUESTIONS_PER_SET }); return true; }
    const startIdx = n;
    const ins = db.prepare('INSERT INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');
    newQs.forEach((q, i) => {
      ins.run(m[1] + '_q' + (startIdx + i), m[1], startIdx + i,
        q.q, JSON.stringify(q.options), q.answer, q.explanation, q.type);
    });
    db.prepare('UPDATE sets SET updated_at = ? WHERE id = ?').run(Date.now(), m[1]);
    sendJSON(res, 200, { ok: true, added: newQs.length, total: startIdx + newQs.length });
    return true;
  }

  // POST /api/attempts  （答题流水，用于"人气"统计）
  if (p === '/api/attempts' && method === 'POST') {
    const body = safeParse(await readBody(req), null);
    const setId = String((body && body.setId) || '');
    const questionId = String((body && body.questionId) || '');
    const clientId = String((body && body.clientId) || '').slice(0, 64);
    if (!setId || !questionId) { sendJSON(res, 400, { error: '参数缺失' }); return true; }
    db.prepare('INSERT INTO attempts (set_id, question_id, client_id, correct, created_at) VALUES (?,?,?,?,?)')
      .run(setId, questionId, clientId, body && body.correct ? 1 : 0, Date.now());
    sendJSON(res, 200, { ok: true });
    return true;
  }

  // POST /api/favorites  /  DELETE /api/favorites/:id
  if (p === '/api/favorites' && method === 'POST') {
    const body = safeParse(await readBody(req), null);
    const setId = String((body && body.setId) || '');
    const questionId = String((body && body.questionId) || '');
    const clientId = String((body && body.clientId) || '').slice(0, 64);
    if (!setId || !questionId || !clientId) { sendJSON(res, 400, { error: '参数缺失' }); return true; }
    const id = setId + ':' + questionId + ':' + clientId;
    db.prepare('INSERT OR IGNORE INTO favorites (id, set_id, question_id, client_id, created_at) VALUES (?,?,?,?,?)')
      .run(id, setId, questionId, clientId, Date.now());
    sendJSON(res, 200, { ok: true, id });
    return true;
  }
  m = p.match(/^\/api\/favorites\/([^/]+)$/);
  if (m && method === 'DELETE') {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(decodeURIComponent(m[1]));
    sendJSON(res, 200, { ok: true });
    return true;
  }

  return false;
}

/* ---------- 静态托管 ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
function serveStatic(req, res, urlPath) {
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(ROOT, '.' + urlPath);
  if (!file.startsWith(path.resolve(ROOT))) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

function insertQuestions(setId, qs) {
  const ins = db.prepare('INSERT INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');
  qs.forEach((q, i) => ins.run(setId + '_q' + i, setId, i, q.q, JSON.stringify(q.options), q.answer, q.explanation, q.type));
}

/* ---------- 服务器 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = decodeURIComponent(url.pathname);
  if (req.method === 'OPTIONS') { sendJSON(res, 204, {}); return; }
  try {
    if (p.startsWith('/api/')) {
      const handled = await handleAPI(req, res, p, url);
      if (!handled) sendJSON(res, 404, { error: '接口不存在' });
      return;
    }
    if (req.method === 'GET') { serveStatic(req, res, p); return; }
    sendJSON(res, 405, { error: '不支持的请求方式' });
  } catch (e) {
    const msg = typeof e === 'string' ? e : (e && e.message ? e.message : '服务器错误');
    console.error('[api] error:', msg);
    sendJSON(res, 400, { error: msg });
  }
});

server.listen(PORT, HOST, () => {
  console.log('════════════════════════════════════════');
  console.log('  红笔 HONGBI v2 服务已启动');
  console.log('  本机访问：  http://localhost:' + PORT);
  console.log('  局域网访问：http://<本机IP>:' + PORT);
  console.log('  数据库：    ' + DB_PATH);
  if (ADMIN_KEY) console.log('  管理密钥：  已启用');
  console.log('════════════════════════════════════════');
});
