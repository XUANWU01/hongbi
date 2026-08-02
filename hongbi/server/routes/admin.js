/* ============================================================
   红笔 HONGBI v3 · 管理端路由（贡献审核队列）
   权限：admin / superadmin
   ============================================================ */
'use strict';

const { db, auditLog } = require('../db.js');
const { authRequired, requireRole } = require('../auth.js');
const { qCount } = require('./sets.js');

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
}

module.exports = { registerAdminRoutes };
