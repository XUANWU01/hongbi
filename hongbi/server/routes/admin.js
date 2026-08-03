/* ============================================================
   红笔 HONGBI v3 · 管理端路由（贡献审核队列）
   权限：admin / superadmin
   ============================================================ */
'use strict';

const { db, auditLog, createNotification } = require('../db.js');
const { authRequired, requireRole, uid } = require('../auth.js');
const { qCount, safeParse } = require('./sets.js');

/** 修复 Windows/multer 中文文件名双重编码 */
function fixFileName(name) {
  try { return Buffer.from(String(name || ''), 'latin1').toString('utf8'); }
  catch (e) { return String(name || ''); }
}

function registerAdminRoutes(app) {
  // 审核队列（pending 列表，按时间倒序）
  app.get('/api/admin/reviews', authRequired, requireRole('admin', 'superadmin'), (req, res) => {
    const status = String(req.query.status || 'pending');
    const rows = db.prepare(
      "SELECT * FROM sets WHERE source = 'pending' AND review_status = ? ORDER BY created_at DESC LIMIT 100"
    ).all(status);
    res.json({ items: rows.map(r => ({
      id: r.id, title: r.title, desc: r.desc, category: r.category,
      tags: (() => { try { return JSON.parse(r.tags); } catch (e) { return []; } })(),
      owner: r.owner_id, createdAt: r.created_at, questionCount: qCount(r.id)
    })) });
  });

  // 审核预览（含题目样例）
  app.get('/api/admin/reviews/:id', authRequired, requireRole('admin', 'superadmin'), (req, res) => {
    const r = db.prepare("SELECT * FROM sets WHERE id = ? AND source = 'pending'").get(req.params.id);
    if (!r) { res.status(404).json({ error: '待审核题库不存在' }); return; }
    const qs = db.prepare('SELECT * FROM questions WHERE set_id = ? ORDER BY idx ASC LIMIT 5').all(r.id)
      .map(x => ({ q: x.q, options: (() => { try { return JSON.parse(x.options); } catch (e) { return []; } })(), answer: x.answer, type: x.type }));
    res.json({ id: r.id, title: r.title, desc: r.desc, category: r.category, questionCount: qCount(r.id), samples: qs });
  });

  // 批准 → 进入公共库
  app.post('/api/admin/reviews/:id/approve', authRequired, requireRole('admin', 'superadmin'), (req, res) => {
    const r = db.prepare("SELECT * FROM sets WHERE id = ? AND source = 'pending'").get(req.params.id);
    if (!r) { res.status(404).json({ error: '待审核题库不存在' }); return; }
    db.prepare("UPDATE sets SET source='public', review_status='approved', updated_at=? WHERE id=?")
      .run(Date.now(), r.id);
    res.json({ ok: true });
  });

  // 驳回（必须填原因）
  app.post('/api/admin/reviews/:id/reject', authRequired, requireRole('admin', 'superadmin'), (req, res) => {
    const r = db.prepare("SELECT * FROM sets WHERE id = ? AND source = 'pending'").get(req.params.id);
    if (!r) { res.status(404).json({ error: '待审核题库不存在' }); return; }
    const reason = String((req.body || {}).reason || '').trim();
    if (!reason) { res.status(400).json({ error: '必须填写驳回原因' }); return; }
    db.prepare("UPDATE sets SET source='private', review_status='rejected', review_reason=?, updated_at=? WHERE id=?")
      .run(reason.slice(0, 200), Date.now(), r.id);
    res.json({ ok: true });
    auditLog(req.auth.ownerId, req.auth.ownerType, 'review_reject', 'set', r.id, { reason });
  });

  // 审计日志查询（superadmin）
  app.get('/api/admin/audit', authRequired, requireRole('superadmin'), (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(req.query.size, 10) || 20));
    const { total } = db.prepare('SELECT COUNT(*) AS total FROM audit_logs').get();
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?').all(size, (page - 1) * size);
    res.json({ total, page, size, items: rows.map(r => ({
      id: r.id, actor: r.actor_type + ':' + r.actor_id, action: r.action,
      target: r.target_type + '/' + r.target_id, detail: r.detail, createdAt: r.created_at
    })) });
  });

  // 解析质量看板（admin）
  app.get('/api/admin/stats/parser', authRequired, requireRole('admin', 'superadmin'), (req, res) => {
    const total = db.prepare('SELECT COUNT(*) AS n FROM upload_jobs').get().n;
    const success = db.prepare("SELECT COUNT(*) AS n FROM upload_jobs WHERE status = 'done'").get().n;
    const failed = db.prepare("SELECT COUNT(*) AS n FROM upload_jobs WHERE status = 'failed'").get().n;
    const avgCoverage = db.prepare("SELECT AVG(CAST(json_extract(quality, '$.answerRate') AS INTEGER)) AS avg FROM upload_jobs WHERE quality != ''").get();
    res.json({ total, success, failed, avgCoverage: Math.round(avgCoverage.avg || 0) });
  });

  // 列出所有解析任务（供官方题库创建时选择素材）
  app.get('/api/admin/jobs', authRequired, requireRole('superadmin'), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const status = String(req.query.status || 'done');
    const rows = db.prepare(
      "SELECT id, file_name, format, total, skipped, status, created_at FROM upload_jobs WHERE status=? ORDER BY created_at DESC LIMIT ?"
    ).all(status, limit);
    res.json(rows.map(r => ({
      id: r.id, fileName: fixFileName(r.file_name), format: r.format, total: r.total, skipped: r.skipped,
      status: r.status, createdAt: r.created_at
    })));
  });

  // ===== 用户管理（仅 superadmin） =====

  // 列出所有用户
  app.get('/api/admin/users', authRequired, requireRole('superadmin'), (req, res) => {
    const rows = db.prepare('SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at ASC').all();
    // 附加每个用户的统计
    const result = rows.map(u => {
      const attempts = db.prepare('SELECT COUNT(*) AS n FROM attempt_logs WHERE owner_id = ? AND owner_type = ?')
        .get(u.id, 'user').n;
      const sets = db.prepare('SELECT COUNT(*) AS n FROM sets WHERE owner_id = ? AND owner_type = ?')
        .get(u.id, 'user').n;
      return { id: u.id, username: u.username, nickname: u.nickname || '', role: u.role,
        attempts, sets, createdAt: u.created_at };
    });
    res.json(result);
  });

  // 修改用户角色
  app.patch('/api/admin/users/:id/role', authRequired, requireRole('superadmin'), (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) { res.status(404).json({ error: '用户不存在' }); return; }
    const { role } = req.body || {};
    if (!['user', 'admin'].includes(role)) { res.status(400).json({ error: '无效角色：仅支持 user/admin（不可降级 superadmin）' }); return; }
    if (user.role === 'superadmin') { res.status(403).json({ error: '不可修改超级管理员的角色' }); return; }
    if (user.role === role) { res.status(400).json({ error: '角色未改变' }); return; }
    db.prepare('UPDATE users SET role=? WHERE id=?').run(role, user.id);
    auditLog(req.auth.ownerId, req.auth.ownerType, 'user_role_change', 'user', user.id,
      { username: user.username, from: user.role, to: role });
    res.json({ ok: true, role });
  });

  // 将社区题库直接升级为官方（不克隆，无重复存储）
  app.post('/api/admin/official/upgrade', authRequired, requireRole('superadmin'), (req, res) => {
    const { setId } = req.body || {};
    if (!setId) { res.status(400).json({ error: '缺少题库 ID' }); return; }
    const r = db.prepare('SELECT * FROM sets WHERE id = ?').get(String(setId));
    if (!r) { res.status(404).json({ error: '题库不存在' }); return; }
    if (r.source === 'official') { res.status(400).json({ error: '已是官方题库' }); return; }
    if (r.source !== 'public' && r.source !== 'pending') { res.status(400).json({ error: '仅可升级已公开或待审核的题库' }); return; }
    db.prepare("UPDATE sets SET source='official', review_status='approved', updated_at=? WHERE id=?").run(Date.now(), r.id);
    auditLog(req.auth.ownerId, req.auth.ownerType, 'set_official_upgrade', 'set', r.id, { title: r.title });
    // 非本人题库 → 通知原作者
    if (r.owner_id && r.owner_type === 'user' && r.owner_id !== req.auth.ownerId) {
      createNotification(r.owner_id, 'official_upgrade',
        '你的题库被收录为官方精选',
        '「' + r.title + '」已被超级管理员升级为官方精选题库，所有人可在题库广场查看。', r.id);
    }
    res.json({ ok: true, message: '已升级为官方题库' });
  });

  // ===== 官方精选题库（仅 superadmin） =====

  // 列出所有官方题库（支持分页）
  app.get('/api/admin/official', authRequired, requireRole('superadmin'), (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(req.query.size) || 20));
    const total = db.prepare("SELECT COUNT(*) AS n FROM sets WHERE source='official'").get().n;
    const rows = db.prepare("SELECT * FROM sets WHERE source='official' ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .all(size, (page - 1) * size);
    res.json({
      items: rows.map(r => ({
        id: r.id, title: r.title, desc: r.desc, category: r.category,
        source: r.source, questionCount: qCount(r.id), createdAt: r.created_at
      })), total, page, size
    });
  });

  // 从解析任务创建官方题库
  app.post('/api/admin/official', authRequired, requireRole('superadmin'), (req, res) => {
    const { jobId, title, category, desc } = req.body || {};
    if (!jobId) { res.status(400).json({ error: '缺少解析任务 ID' }); return; }
    if (!title) { res.status(400).json({ error: '缺少题库标题' }); return; }
    const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(jobId);
    if (!job || job.status !== 'done') { res.status(400).json({ error: '解析任务无效或未完成' }); return; }
    const questions = safeParse(job.questions, []);
    if (!questions.length) { res.status(400).json({ error: '解析任务无题目' }); return; }
    const setId = uid('s');
    const now = Date.now();
    db.prepare('INSERT INTO sets (id, title, desc, category, tags, source, review_status, copyright_confirmed, version, owner_id, owner_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(setId, String(title).slice(0, 60), String(desc || '').slice(0, 200), String(category || '常识/百科').slice(0, 20),
        JSON.stringify(['官方']), 'official', 'approved', 1, 1,
        req.auth.ownerId, req.auth.ownerType, now, now);
    const insQ = db.prepare('INSERT INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');
    questions.forEach((q, i) => insQ.run(setId + '_q' + i, setId, i, q.q, JSON.stringify(q.options || []), q.answer, q.explanation, q.type || 'text'));
    db.prepare('DELETE FROM upload_jobs WHERE id = ?').run(jobId);
    auditLog(req.auth.ownerId, req.auth.ownerType, 'set_official', 'set', setId, { title, questionCount: questions.length });
    res.json({ ok: true, id: setId, questionCount: questions.length });
  });

  // 从已有题库复制为官方题库

  // 将官方题库降回社区
  app.post('/api/admin/official/:id/downgrade', authRequired, requireRole('superadmin'), (req, res) => {
    const r = db.prepare("SELECT * FROM sets WHERE id = ? AND source='official'").get(req.params.id);
    if (!r) { res.status(404).json({ error: '官方题库不存在' }); return; }
    db.prepare("UPDATE sets SET source='public', updated_at=? WHERE id=?").run(Date.now(), r.id);
    auditLog(req.auth.ownerId, req.auth.ownerType, 'set_official_downgrade', 'set', r.id, { title: r.title });
    res.json({ ok: true, message: '已降为社区题库' });
  });

  // 可升级题库列表（社区/待审，供官方页浏览升级）
  app.get('/api/admin/upgradeable', authRequired, requireRole('superadmin'), (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.min(100, Math.max(1, Number(req.query.size) || 20));
    const keyword = String(req.query.keyword || '').trim();
    let where = "(s.source='public' OR s.source='pending')";
    const params = [];
    if (keyword) { where += " AND (s.title LIKE ? OR s.category LIKE ?)"; params.push('%' + keyword + '%', '%' + keyword + '%'); }
    const total = db.prepare('SELECT COUNT(*) AS n FROM sets s WHERE ' + where).get(...params).n;
    const rows = db.prepare('SELECT * FROM sets s WHERE ' + where + ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?')
      .all(...params, size, (page - 1) * size);
    res.json({
      items: rows.map(r => ({ id: r.id, title: r.title, desc: r.desc, category: r.category,
        source: r.source, questionCount: qCount(r.id), owner_id: r.owner_id, createdAt: r.created_at })),
      total, page, size
    });
  });

  // 删除官方题库
  app.delete('/api/admin/official/:id', authRequired, requireRole('superadmin'), (req, res) => {
    const r = db.prepare("SELECT * FROM sets WHERE id = ? AND source='official'").get(req.params.id);
    if (!r) { res.status(404).json({ error: '官方题库不存在' }); return; }
    db.prepare('DELETE FROM questions WHERE set_id = ?').run(r.id);
    db.prepare('DELETE FROM sets WHERE id = ?').run(r.id);
    auditLog(req.auth.ownerId, req.auth.ownerType, 'set_official_delete', 'set', r.id, { title: r.title });
    res.json({ ok: true });
  });
}

module.exports = { registerAdminRoutes };
