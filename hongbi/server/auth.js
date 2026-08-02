/* ============================================================
   红笔 HONGBI v3 · 认证与角色（scrypt 哈希 + token 会话）
   角色：superadmin（超级管理员）/ admin（管理员）/ user（用户）
   设备匿名登录：自动创建 device，token 绑定；注册/登录后自动合并设备数据
   ============================================================ */
'use strict';

const crypto = require('crypto');
const { db } = require('./db.js');

const ADMIN_KEY = process.env.HONGBI_ADMIN_KEY || '';
const TOKEN_TTL = 7 * 24 * 3600 * 1000; // 7 天

function uid(prefix) { return prefix + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 32).toString('hex');
}

function normalizeUsername(u) { return String(u || '').trim().toLowerCase(); }

/* ---------- 用户/设备 ---------- */
function createUser(username, password, role) {
  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id: uid('u'),
    username: normalizeUsername(username),
    pass_hash: hashPassword(password, salt),
    salt,
    role: role || 'user',
    created_at: Date.now()
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

/* ---------- 设备数据合并到账号 ---------- */
function mergeDeviceIntoUser(deviceId, userId) {
  const tables = ['sets', 'progress', 'wrong_items', 'favorites', 'attempt_logs', 'stats_daily'];
  for (const t of tables) {
    db.prepare(`UPDATE ${t} SET owner_id = ?, owner_type = 'user' WHERE owner_id = ? AND owner_type = 'device'`)
      .run(userId, deviceId);
  }
  db.prepare('DELETE FROM devices WHERE id = ?').run(deviceId);
}

/* ---------- 认证中间件 ---------- */
function authRequired(req, res, next) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  const s = m ? resolveSession(m[1]) : null;
  if (!s) { res.status(401).json({ error: '未登录或登录已过期' }); return; }
  req.auth = { ownerId: s.owner_id, ownerType: s.owner_type, token: s.token };
  // 附带用户信息（若是账号）
  if (s.owner_type === 'user') {
    const u = getUserById(s.owner_id);
    if (!u) { res.status(401).json({ error: '账号不存在' }); return; }
    req.auth.role = u.role;
  } else {
    req.auth.role = 'user';
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: '权限不足' });
      return;
    }
    next();
  };
}

/* ---------- 路由 ---------- */
function registerAuthRoutes(app) {
  // 设备匿名登录
  app.post('/api/auth/device', (req, res) => {
    const dev = createDevice();
    const token = createSession(dev.id, 'device');
    res.json({ token, identity: { type: 'device', id: dev.id, role: 'user' } });
  });

  // 注册（首位注册者为 superadmin；配置 ADMIN_KEY 时可携带 key 升级）
  app.post('/api/auth/register', (req, res) => {
    const { username, password, deviceToken, key } = req.body || {};
    const uname = normalizeUsername(username);
    if (uname.length < 2 || uname.length > 30) { res.status(400).json({ error: '用户名需 2-30 个字符' }); return; }
    if (!password || String(password).length < 6) { res.status(400).json({ error: '密码至少 6 位' }); return; }
    if (getUserByUsername(uname)) { res.status(409).json({ error: '用户名已被占用' }); return; }

    let role = 'user';
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
    if (n === 0) role = 'superadmin';
    else if (ADMIN_KEY && key && String(key) === ADMIN_KEY) role = 'superadmin';

    const user = createUser(uname, password, role);

    // 绑定并合并设备数据
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

  // 登录（可携带 deviceToken 合并设备数据）
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

  // 管理员密钥升级当前账号（配置了 ADMIN_KEY 时）
  app.post('/api/auth/claim-admin', authRequired, (req, res) => {
    if (!ADMIN_KEY) { res.status(400).json({ error: '服务器未配置管理密钥' }); return; }
    if ((req.body || {}).key !== ADMIN_KEY) { res.status(403).json({ error: '密钥错误' }); return; }
    if (req.auth.ownerType !== 'user') { res.status(400).json({ error: '请先注册账号' }); return; }
    db.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?").run(req.auth.ownerId);
    res.json({ ok: true, role: 'superadmin' });
  });

  // 退出
  app.post('/api/auth/logout', (req, res) => {
    const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (m) db.prepare('DELETE FROM sessions WHERE token = ?').run(m[1]);
    res.json({ ok: true });
  });

  // 当前身份
  app.get('/api/auth/me', authRequired, (req, res) => {
    res.json({
      identity: req.auth.ownerType === 'user'
        ? { type: 'user', id: req.auth.ownerId, role: req.auth.role, username: getUserById(req.auth.ownerId).username }
        : { type: 'device', id: req.auth.ownerId, role: 'user' }
    });
  });
}

module.exports = { registerAuthRoutes, authRequired, requireRole, uid, ADMIN_KEY };
