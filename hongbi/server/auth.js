/* ============================================================
   红笔 HONGBI v4 · 认证、角色与速率限制
   ============================================================ */
'use strict';

const crypto = require('crypto');
const { db } = require('./db.js');

const ADMIN_KEY = process.env.HONGBI_ADMIN_KEY || '';
const TOKEN_TTL = 7 * 24 * 3600 * 1000;
const RATE_UPLOAD_PER_HOUR = Number(process.env.RATE_UPLOAD_PER_HOUR || 20);
const RATE_BYTES_PER_DAY = Number(process.env.RATE_BYTES_PER_DAY || 500) * 1024 * 1024;

function uid(prefix) { return prefix + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}
function normalizeUsername(u) { return String(u || '').trim().toLowerCase(); }

/* ---------- 用户/设备 ---------- */
function createUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: uid('u'), username: normalizeUsername(username),
    pass_hash: hashPassword(password, salt), salt,
    role: role || 'user', created_at: Date.now()
  };
  db.prepare('INSERT INTO users (id, username, pass_hash, salt, role, created_at) VALUES (?,?,?,?,?,?)')
    .run(user.id, user.username, user.pass_hash, user.salt, user.role, user.created_at);
  return user;
}
function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(normalizeUsername(username)) || null;
}
function getUserById(id) { return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null; }
function createDevice() {
  const d = { id: uid('d'), created_at: Date.now() };
  db.prepare('INSERT INTO devices (id, created_at) VALUES (?,?)').run(d.id, d.created_at);
  return d;
}

/* ---------- 会话 ---------- */
function createSession(ownerId, ownerType) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, owner_id, owner_type, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(token, ownerId, ownerType, Date.now(), Date.now() + TOKEN_TTL);
  return token;
}
function resolveSession(token) {
  const s = db.prepare('SELECT * FROM sessions WHERE token = ?').get(String(token || ''));
  if (!s) return null;
  if (s.expires_at < Date.now()) { db.prepare('DELETE FROM sessions WHERE token = ?').run(s.token); return null; }
  return s;
}

/* ---------- 设备数据合并 ---------- */
function mergeDeviceIntoUser(deviceId, userId) {
  const tables = ['sets', 'progress', 'wrong_items', 'favorites', 'attempt_logs', 'stats_daily'];
  for (const t of tables) {
    db.prepare(`UPDATE ${t} SET owner_id = ?, owner_type = 'user' WHERE owner_id = ? AND owner_type = 'device'`)
      .run(userId, deviceId);
  }
  db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
}

/* ---------- 速率限制（内存计数） ---------- */
const rateMemory = new Map();
function rateLimitUpload(auth, fileSize) {
  const key = (auth && auth.ownerId) || 'anon';
  const now = Date.now();
  let entry = rateMemory.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, bytes: 0, resetAt: now + 3600000, dayReset: now + 86400000 };
    rateMemory.set(key, entry);
  }
  if (now > entry.dayReset) { entry.bytes = 0; entry.dayReset = now + 86400000; }
  if (entry.count >= RATE_UPLOAD_PER_HOUR) throw Object.assign(new Error('每小时上传次数超限'), { code: 'RATE_LIMIT' });
  if (entry.bytes + (fileSize || 0) > RATE_BYTES_PER_DAY) throw Object.assign(new Error('每日容量超限'), { code: 'SIZE_QUOTA' });
  entry.count++;
  entry.bytes += (fileSize || 0);
  return true;
}

/* ---------- 认证中间件 ---------- */
function authRequired(req, res, next) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const s = m ? resolveSession(m[1]) : null;
  if (!s) { res.status(401).json({ error: '未登录或登录已过期' }); return; }
  req.auth = { ownerId: s.owner_id, ownerType: s.owner_type, token: s.token };
  if (s.owner_type === 'user') {
    const u = getUserById(s.owner_id);
    if (!u) { res.status(401).json({ error: '账号不存在' }); return; }
    req.auth.role = u.role;
  } else { req.auth.role = 'user'; }
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: '权限不足' }); return;
    }
    next();
  };
}

/** 必须已注册用户，拒绝设备和访客 */
function requireUser(req, res, next) {
  if (!req.auth || req.auth.ownerType !== 'user') {
    res.status(403).json({ error: '请先注册账号后再上传题库' }); return;
  }
  next();
}

/* ---------- 路由 ---------- */
function registerAuthRoutes(app) {
  app.post('/api/auth/device', (req, res) => {
    const dev = createDevice();
    const token = createSession(dev.id, 'device');
    res.json({ token, identity: { type: 'device', id: dev.id, role: 'user' } });
  });
  app.post('/api/auth/register', (req, res) => {
    const { username, password, deviceToken, key } = req.body || {};
    const uname = normalizeUsername(username);
    if (uname.length < 2 || uname.length > 30) { res.status(400).json({ error: '用户名需 2-30 个字符' }); return; }
    if (!password || String(password).length < 6) { res.status(400).json({ error: '密码至少 6 位' }); return; }
    if (getUserByUsername(uname)) { res.status(409).json({ error: '用户名已被占用' }); return; }
    let role = 'user';
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
    if (n === 0) role = 'superadmin';
    // ADMIN_KEY 注册页已废弃，后续管理员请到「后台管理→用户管理」提升
    const user = createUser(uname, password, role);
    if (deviceToken) {
      const s = resolveSession(deviceToken);
      if (s && s.owner_type === 'device') {
        mergeDeviceIntoUser(s.owner_id, user.id);
        db.prepare('DELETE FROM sessions WHERE token = ?').run(s.token);
      }
    }
    const token = createSession(user.id, 'user');
    res.json({ token, identity: { type: 'user', id: user.id, username: user.username, role: user.role } });
  });
  app.post('/api/auth/login', (req, res) => {
    const { username, password, deviceToken } = req.body || {};
    const user = getUserByUsername(username);
    if (!user) { res.status(401).json({ error: '用户名或密码错误' }); return; }
    if (hashPassword(password, user.salt) !== user.pass_hash) { res.status(401).json({ error: '用户名或密码错误' }); return; }
    if (deviceToken) {
      const s = resolveSession(deviceToken);
      if (s && s.owner_type === 'device') {
        mergeDeviceIntoUser(s.owner_id, user.id);
        db.prepare('DELETE FROM sessions WHERE token = ?').run(s.token);
      }
    }
    const token = createSession(user.id, 'user');
    res.json({ token, identity: { type: 'user', id: user.id, username: user.username, role: user.role } });
  });
  // 管理密钥提升（已废弃，推荐在「后台管理 → 用户管理」页面操作）
  app.post('/api/auth/claim-admin', authRequired, (req, res) => {
    if (!ADMIN_KEY) { res.status(400).json({ error: '管理密钥未配置，请在「后台管理→用户管理」中管理角色' }); return; }
    if ((req.body || {}).key !== ADMIN_KEY) { res.status(403).json({ error: '密钥错误' }); return; }
    if (req.auth.ownerType !== 'user') { res.status(400).json({ error: '请先注册账号' }); return; }
    db.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?").run(req.auth.ownerId);
    res.json({ ok: true, role: 'superadmin' });
  });
  app.post('/api/auth/logout', (req, res) => {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (m) db.prepare('DELETE FROM sessions WHERE token = ?').run(m[1]);
    res.json({ ok: true });
  });
  app.get('/api/auth/me', authRequired, (req, res) => {
    res.json({
      identity: req.auth.ownerType === 'user'
        ? { type: 'user', id: req.auth.ownerId, role: req.auth.role, username: getUserById(req.auth.ownerId).username }
        : { type: 'device', id: req.auth.ownerId, role: 'user' }
    });
  });

  // ===== 用户信息板块 =====

  // 获取个人资料 + 统计数据
  app.get('/api/user/profile', authRequired, (req, res) => {
    const user = getUserById(req.auth.ownerId);
    if (!user) { res.status(404).json({ error: '用户不存在' }); return; }
    // 统计数据
    const attempts = db.prepare('SELECT COUNT(*) AS n FROM attempt_logs WHERE owner_id = ? AND owner_type = ?')
      .get(req.auth.ownerId, req.auth.ownerType).n;
    const correct = db.prepare('SELECT COUNT(*) AS n FROM attempt_logs WHERE owner_id = ? AND owner_type = ? AND correct = 1')
      .get(req.auth.ownerId, req.auth.ownerType).n;
    const wrong = db.prepare('SELECT COUNT(*) AS n FROM wrong_items WHERE owner_id = ? AND owner_type = ?')
      .get(req.auth.ownerId, req.auth.ownerType).n;
    const favs = db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE owner_id = ? AND owner_type = ?')
      .get(req.auth.ownerId, req.auth.ownerType).n;
    const sets = db.prepare('SELECT COUNT(*) AS n FROM sets WHERE owner_id = ? AND owner_type = ?')
      .get(req.auth.ownerId, req.auth.ownerType).n;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayStats = db.prepare('SELECT answered, correct AS c FROM stats_daily WHERE owner_id = ? AND owner_type = ? AND day = ?')
      .get(req.auth.ownerId, req.auth.ownerType, today);
    // 连续打卡天数
    let streak = 0;
    let checkDay = new Date();
    while (true) {
      const day = checkDay.toISOString().slice(0, 10).replace(/-/g, '');
      const d = db.prepare('SELECT answered FROM stats_daily WHERE owner_id = ? AND owner_type = ? AND day = ?')
        .get(req.auth.ownerId, req.auth.ownerType, day);
      if (d && d.answered > 0) { streak++; checkDay.setDate(checkDay.getDate() - 1); }
      else break;
    }
    // 近30天热力图
    const heatmap = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const day = d.toISOString().slice(0, 10).replace(/-/g, '');
      const s = db.prepare('SELECT answered, correct FROM stats_daily WHERE owner_id = ? AND owner_type = ? AND day = ?')
        .get(req.auth.ownerId, req.auth.ownerType, day);
      heatmap.push({ day, answered: s ? s.answered : 0, correct: s ? s.correct : 0 });
    }
    res.json({
      user: {
        id: user.id, username: user.username, nickname: user.nickname || '',
        bio: user.bio || '', role: user.role, createdAt: user.created_at
      },
      stats: {
        attempts, correct, wrong, favs, sets,
        accuracy: attempts > 0 ? Math.round(correct / attempts * 100) : 0,
        streak,
        today: todayStats ? todayStats.answered : 0,
        todayCorrect: todayStats ? todayStats.c : 0
      },
      heatmap
    });
  });

  // 更新个人资料
  app.put('/api/user/profile', authRequired, (req, res) => {
    const user = getUserById(req.auth.ownerId);
    if (!user) { res.status(404).json({ error: '用户不存在' }); return; }
    const { nickname, bio } = req.body || {};
    const n = nickname !== undefined ? String(nickname).trim().slice(0, 30) : (user.nickname || '');
    const b = bio !== undefined ? String(bio).trim().slice(0, 200) : (user.bio || '');
    db.prepare('UPDATE users SET nickname=?, bio=? WHERE id=?').run(n, b, user.id);
    res.json({ ok: true, nickname: n, bio: b });
  });

  // ===== 通知 =====

  app.get('/api/notifications', authRequired, (req, res) => {
    const rows = db.prepare(
      'SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 50'
    ).all(req.auth.ownerId);
    const unread = db.prepare(
      'SELECT COUNT(*) AS n FROM notifications WHERE recipient_id = ? AND is_read = 0'
    ).get(req.auth.ownerId).n;
    res.json({ items: rows.map(r => ({
      id: r.id, type: r.type, title: r.title, body: r.body, relatedId: r.related_id,
      isRead: !!r.is_read, createdAt: r.created_at
    })), unread });
  });

  app.patch('/api/notifications/:id/read', authRequired, (req, res) => {
    db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND recipient_id=?')
      .run(req.params.id, req.auth.ownerId);
    res.json({ ok: true });
  });

  app.patch('/api/notifications/read-all', authRequired, (req, res) => {
    db.prepare('UPDATE notifications SET is_read=1 WHERE recipient_id=? AND is_read=0')
      .run(req.auth.ownerId);
    res.json({ ok: true });
  });

  // 限流兜底
  app.use('/api/upload', (req, res, next) => {
    try { rateLimitUpload(req.auth, Number(req.headers['content-length']) || 0); next(); }
    catch (e) { res.status(429).json({ error: e.message }); }
  });
}

module.exports = { registerAuthRoutes, authRequired, requireRole, requireUser, rateLimitUpload, uid, ADMIN_KEY };
