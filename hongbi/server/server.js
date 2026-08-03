/* ============================================================
   红笔 HONGBI v3 · 服务器入口（Express）
   运行：npm install && node server/server.js
   环境变量：PORT(8712) HOST(0.0.0.0) HONGBI_ADMIN_KEY MAX_UPLOAD_MB(100) MAX_QUESTIONS(20000)
   ============================================================ */
'use strict';

const path = require('path');
const express = require('express');
const { db } = require('./db.js');
const { SEED_SETS } = require('./seed.js');
const { registerAuthRoutes } = require('./auth.js');
const { registerUploadRoutes } = require('./routes/upload.js');
const { registerSetRoutes } = require('./routes/sets.js');
const { registerQuizRoutes } = require('./routes/quiz.js');
const { registerAdminRoutes } = require('./routes/admin.js');

const ROOT = path.resolve(__dirname, '..'); // hongbi/
const PORT = Number(process.env.PORT || 8712);
const HOST = process.env.HOST || '0.0.0.0';

/* ---------- v2 → v3 迁移 ---------- */
function migrateV2() {
  const cols = db.prepare('PRAGMA table_info(sets)').all().map(c => c.name);
  if (!cols.includes('review_status')) db.exec("ALTER TABLE sets ADD COLUMN review_status TEXT DEFAULT 'none'");
  // 答题流水补充 answer_text 列（记录简答/填空的用户作答）
  const acols = db.prepare('PRAGMA table_info(attempt_logs)').all().map(c => c.name);
  if (!acols.includes('answer_text')) db.exec("ALTER TABLE attempt_logs ADD COLUMN answer_text TEXT DEFAULT ''");
  // v4 新增列
  const qcols = db.prepare('PRAGMA table_info(questions)').all().map(c => c.name);
  if (!qcols.includes('fingerprint')) db.exec("ALTER TABLE questions ADD COLUMN fingerprint TEXT DEFAULT ''");
  if (!qcols.includes('status')) db.exec("ALTER TABLE questions ADD COLUMN status TEXT DEFAULT 'active'");
  const jcols = db.prepare('PRAGMA table_info(upload_jobs)').all().map(c => c.name);
  if (!jcols.includes('quality')) db.exec("ALTER TABLE upload_jobs ADD COLUMN quality TEXT DEFAULT ''");
  const scols = cols; // sets 表列（已在上面取过）
  if (!scols.includes('copyright_confirmed')) db.exec("ALTER TABLE sets ADD COLUMN copyright_confirmed INTEGER DEFAULT 0");
  if (!scols.includes('version')) db.exec("ALTER TABLE sets ADD COLUMN version INTEGER DEFAULT 1");
  if (!cols.includes('review_reason')) db.exec("ALTER TABLE sets ADD COLUMN review_reason TEXT DEFAULT ''");
  if (!cols.includes('owner_id')) db.exec("ALTER TABLE sets ADD COLUMN owner_id TEXT DEFAULT ''");
  if (!cols.includes('owner_type')) db.exec("ALTER TABLE sets ADD COLUMN owner_type TEXT DEFAULT ''");
  // 用户表：v4 新增昵称/简介字段
  const ucols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!ucols.includes('nickname')) db.exec("ALTER TABLE users ADD COLUMN nickname TEXT DEFAULT ''");
  if (!ucols.includes('bio')) db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
  // 通知表
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    related_id TEXT DEFAULT '',
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`);
  // 旧数据回填：官方题不动；其余 owner 映射为 device
  db.exec(`UPDATE sets SET owner_id = owner, owner_type = 'device'
           WHERE source != 'official' AND owner_id = '' AND owner != ''`);
  // v2 遗留 favorites 表（client_id 结构）→ 重建为 v3 结构
  const favCols = db.prepare('PRAGMA table_info(favorites)').all().map(c => c.name);
  if (!favCols.includes('owner_id')) {
    db.exec(`DROP TABLE IF EXISTS favorites`);
    db.exec(`CREATE TABLE favorites (
      owner_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      question_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (owner_id, owner_type, question_id)
    )`);
    console.log('[migrate] favorites 表已重建为 v3 结构');
  }
}
migrateV2();

/* ---------- 种子（仅空库） ---------- */
function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM sets').get();
  if (n > 0) return;
  const insSet = db.prepare('INSERT INTO sets (id, title, desc, category, tags, source, review_status, owner_id, owner_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const insQ = db.prepare('INSERT INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');
  for (const s of SEED_SETS) {
    insSet.run(s.id, s.title, s.desc, s.category, JSON.stringify(s.tags), 'official', 'none', '', '', 0, Date.now());
    s.questions.forEach((q, i) => {
      const options = Array.isArray(q.options) ? q.options.map(String) : [];
      insQ.run(s.id + '_q' + i, s.id, i, String(q.q), JSON.stringify(options), String(q.answer || ''), String(q.explanation || ''), options.length >= 2 ? 'choice' : 'text');
    });
  }
  console.log('[seed] 已写入 ' + SEED_SETS.length + ' 套官方题库');
}
seedIfEmpty();

/* ---------- 应用 ---------- */
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

// CORS — 允许局域网/公网访问
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

registerAuthRoutes(app);
registerUploadRoutes(app);
registerSetRoutes(app);
registerQuizRoutes(app);
registerAdminRoutes(app);

// 公开健康检查（前端启动探测）
app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'hongbi-api-v4' });
});

// 模板下载
app.get('/api/templates/:type', (req, res) => {
  const map = { txt: '测试文档-全题型题库.txt', json: '示例题库-前端.json' };
  const fn = map[req.params.type];
  if (!fn) { res.status(404).json({ error: '未知模板类型' }); return; }
  res.download(path.join(ROOT, 'examples', fn), fn);
});

// 静态托管前端
app.use(express.static(ROOT, { etag: true, maxAge: 0 }));

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) res.status(404).json({ error: '接口不存在' });
  else res.status(404).send('not found');
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[error]', err.stack || err.message);
  res.status(500).json({ error: err.message || '服务器错误' });
});

// 解析任务自动清理（每 6 小时清理 7 天前的过期任务及文件）
const CLEAN_AFTER_DAYS = 7;
setInterval(() => {
  const cutoff = Date.now() - CLEAN_AFTER_DAYS * 86400000;
  const old = db.prepare("SELECT id, file_path FROM upload_jobs WHERE created_at < ?").all(cutoff);
  for (const j of old) {
    try { if (j.file_path) fs.unlinkSync(j.file_path); } catch (e) { /* ignore */ }
    db.prepare('DELETE FROM upload_jobs WHERE id = ?').run(j.id);
  }
  if (old.length) console.log('[cleanup] 清理 ' + old.length + ' 个过期解析任务');
}, 6 * 3600 * 1000);

app.listen(PORT, HOST, () => {
  console.log('════════════════════════════════════════');
  console.log('  红笔 HONGBI v3 服务已启动');
  console.log('  本机访问：  http://localhost:' + PORT);
  console.log('  局域网访问：http://<本机IP>:' + PORT);
  console.log('  上传上限：  ' + (process.env.MAX_UPLOAD_MB || 100) + ' MB');
  console.log('  题数上限：  ' + (process.env.MAX_QUESTIONS || 20000));
  if (process.env.HONGBI_ADMIN_KEY) console.log('  管理密钥：  已启用');
  console.log('════════════════════════════════════════');
});
