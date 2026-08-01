/* ============================================================
   红笔 HONGBI · 后端服务（零依赖：Node 自带 http + node:sqlite）
   职责：
     1. 静态托管 hongbi/ 前端
     2. REST API：公共主题库的跨用户共享（题库 CRUD）
   运行：node server/server.js   （默认端口 8712）
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { SEED_SETS } = require('./seed.js');

const ROOT = path.resolve(__dirname, '..');            // hongbi/
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'hongbi.db');
const PORT = Number(process.env.PORT || 8712);
const HOST = process.env.HOST || '0.0.0.0';            // 默认监听所有网卡，方便局域网共享
const ADMIN_KEY = process.env.HONGBI_ADMIN_KEY || '';  // 设置后，删除接口需携带 x-admin-key
const MAX_BODY = 5 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

/* ---------- 建表与种子 ---------- */
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
    questions TEXT NOT NULL
  );
`);

function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM sets').get();
  if (n > 0) return;
  const ins = db.prepare('INSERT INTO sets (id, title, desc, category, tags, source, owner, created_at, questions) VALUES (?,?,?,?,?,?,?,?,?)');
  for (const s of SEED_SETS) {
    ins.run(s.id, s.title, s.desc, s.category, JSON.stringify(s.tags), s.source, s.owner, s.createdAt || Date.now(), JSON.stringify(s.questions));
  }
  console.log('[seed] 已写入 ' + SEED_SETS.length + ' 套官方题库');
}
seedIfEmpty();

/* ---------- 工具 ---------- */
function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-key'
  });
  res.end(body);
}

function rowToSet(r) {
  return {
    id: r.id,
    title: r.title,
    desc: r.desc,
    category: r.category,
    tags: safeParse(r.tags, []),
    source: r.source,
    owner: r.owner,
    createdAt: r.created_at,
    questions: safeParse(r.questions, [])
  };
}
function safeParse(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }

function listSets() {
  return db.prepare('SELECT * FROM sets ORDER BY created_at DESC, id ASC').all().map(rowToSet);
}

function validateSet(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw '请求体格式错误';
  const title = String(body.title || '').trim();
  if (!title) throw '缺少标题';
  if (title.length > 60) throw '标题过长（最多 60 字）';
  const questions = Array.isArray(body.questions) ? body.questions.slice(0, 800) : [];
  if (questions.length === 0) throw '题目为空，无法上传';
  const qs = questions.map(q => ({
    q: String((q && q.q) || '').slice(0, 2000),
    options: Array.isArray(q && q.options) ? q.options.map(o => String(o).slice(0, 500)).slice(0, 10) : [],
    answer: String((q && q.answer) || '').slice(0, 2000),
    explanation: String((q && q.explanation) || '').slice(0, 3000),
    type: (q && q.type === 'choice' && Array.isArray(q.options) && q.options.length >= 2) ? 'choice' : 'text'
  }));
  return {
    title,
    desc: String(body.desc || '').slice(0, 200),
    category: String(body.category || '其他').slice(0, 20),
    tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 5) : [],
    questions: qs,
    owner: String(body.clientId || 'anonymous').slice(0, 64)
  };
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

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') { sendJSON(res, 204, {}); return; }

  try {
    // GET /api/health
    if (p === '/api/health' && req.method === 'GET') {
      sendJSON(res, 200, { ok: true, name: 'hongbi-api', sets: db.prepare('SELECT COUNT(*) AS n FROM sets').get().n });
      return;
    }
    // GET /api/sets
    if (p === '/api/sets' && req.method === 'GET') {
      sendJSON(res, 200, { sets: listSets() });
      return;
    }
    // GET /api/sets/:id
    const mGet = p.match(/^\/api\/sets\/([^/]+)$/);
    if (mGet && req.method === 'GET') {
      const row = db.prepare('SELECT * FROM sets WHERE id = ?').get(mGet[1]);
      if (!row) { sendJSON(res, 404, { error: '题库不存在' }); return; }
      sendJSON(res, 200, rowToSet(row));
      return;
    }
    // POST /api/sets
    if (p === '/api/sets' && req.method === 'POST') {
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw); } catch (e) { sendJSON(res, 400, { error: '请求体不是合法 JSON' }); return; }
      const v = validateSet(body);
      const set = {
        id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        title: v.title,
        desc: v.desc,
        category: v.category,
        tags: v.tags,
        source: 'public',
        owner: v.owner,
        createdAt: Date.now(),
        questions: v.questions
      };
      db.prepare('INSERT INTO sets (id, title, desc, category, tags, source, owner, created_at, questions) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(set.id, set.title, set.desc, set.category, JSON.stringify(set.tags), set.source, set.owner, set.createdAt, JSON.stringify(set.questions));
      console.log('[api] + 新共享题库「' + set.title + '」' + set.questions.length + ' 题 (by ' + v.owner + ')');
      sendJSON(res, 200, set);
      return;
    }
    // DELETE /api/sets/:id
    const mDel = p.match(/^\/api\/sets\/([^/]+)$/);
    if (mDel && req.method === 'DELETE') {
      if (ADMIN_KEY && req.headers['x-admin-key'] !== ADMIN_KEY) {
        sendJSON(res, 403, { error: '需要管理员密钥（设置 HONGBI_ADMIN_KEY 后开启）' });
        return;
      }
      const row = db.prepare('SELECT * FROM sets WHERE id = ?').get(mDel[1]);
      if (!row) { sendJSON(res, 404, { error: '题库不存在' }); return; }
      if (row.source === 'official') { sendJSON(res, 403, { error: '官方题库不可删除' }); return; }
      db.prepare('DELETE FROM sets WHERE id = ?').run(mDel[1]);
      console.log('[api] - 删除共享题库「' + row.title + '」');
      sendJSON(res, 200, { ok: true });
      return;
    }
    // 其余走静态文件
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
  console.log('  红笔 HONGBI 服务已启动');
  console.log('  本机访问：  http://localhost:' + PORT);
  console.log('  局域网访问：http://<本机IP>:' + PORT);
  console.log('  数据库：    ' + DB_PATH);
  if (ADMIN_KEY) console.log('  管理密钥：  已启用（删除接口需 x-admin-key）');
  console.log('════════════════════════════════════════');
});
