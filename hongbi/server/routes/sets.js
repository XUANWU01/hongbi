/* ============================================================
   红笔 HONGBI v3 · 题库路由（列表/详情/创建/编辑/删除/追加/审核状态）
   公共库：source='public'（已审核通过）+ official
   待审核：source='pending'，仅上传者本人与管理可见
   ============================================================ */
'use strict';

const { db, auditLog, computeFingerprint } = require('../db.js');
const { authRequired, requireRole, uid } = require('../auth.js');
const JSZip = require('jszip');

function safeParse(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }

function qCount(setId) {
  return db.prepare('SELECT COUNT(*) AS n FROM questions WHERE set_id = ?').get(setId).n;
}

function setToJSON(r) {
  return {
    id: r.id, title: r.title, desc: r.desc, category: r.category,
    tags: safeParse(r.tags, []), source: r.source,
    reviewStatus: r.review_status, reviewReason: r.review_reason,
    owner: r.owner_type === 'user' ? 'user:' + r.owner_id : 'device:' + r.owner_id,
    isMine: null, // 由调用方填充
    createdAt: r.created_at, updatedAt: r.updated_at,
    questionCount: qCount(r.id)
  };
}

function isOwner(r, auth) { return r.owner_id === auth.ownerId && r.owner_type === auth.ownerType; }

function registerSetRoutes(app) {
  // 题库列表（公共库 + 官方；私库/我的贡献单独过滤）
  app.get('/api/sets', authRequired, (req, res) => {
    const search = String(req.query.search || '').trim();
    const cat = String(req.query.cat || '').trim();
    const sort = String(req.query.sort || 'new');
    const scope = String(req.query.scope || 'public'); // public | mine
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const size = Math.min(50, Math.max(1, parseInt(req.query.size, 10) || 12));

    const where = [];
    const params = [];
    if (scope === 'mine') {
      where.push("(s.source IN ('private','pending') OR (s.source = 'public'))");
      where.push('s.owner_id = ? AND s.owner_type = ?');
      params.push(req.auth.ownerId, req.auth.ownerType);
    } else {
      where.push("s.source IN ('official','public')");
    }
    if (search) {
      const like = '%' + String(search).replace(/[\\%_]/g, c => '\\' + c) + '%';
      where.push("(s.title LIKE ? ESCAPE '\\' OR s.desc LIKE ? ESCAPE '\\' OR s.tags LIKE ? ESCAPE '\\' OR s.category LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    if (cat && cat !== '全部') { where.push('s.category = ?'); params.push(cat); }

    const orderSql = sort === 'count' ? 'ORDER BY qn DESC, s.created_at DESC'
      : sort === 'hot' ? 'ORDER BY an DESC, s.created_at DESC'
      : 'ORDER BY s.created_at DESC, s.id ASC';
    const whereSql = 'WHERE ' + where.join(' AND ');

    const { total } = db.prepare('SELECT COUNT(*) AS total FROM sets s ' + whereSql).get(...params);
    const rows = db.prepare(
      'SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.set_id = s.id) AS qn, ' +
      '(SELECT COUNT(*) FROM attempt_logs a WHERE a.set_id = s.id) AS an ' +
      'FROM sets s ' + whereSql + ' ' + orderSql + ' LIMIT ? OFFSET ?'
    ).all(...params, size, (page - 1) * size);

    res.json({ total, page, size, sets: rows.map(r => {
      const s = setToJSON(r);
      s.isMine = isOwner(r, req.auth);
      return s;
    }) });
  });

  // 题库详情（含题目，可分页）
  app.get('/api/sets/:id', authRequired, (req, res) => {
    const r = db.prepare('SELECT * FROM sets WHERE id = ?').get(req.params.id);
    if (!r) { res.status(404).json({ error: '题库不存在' }); return; }
    const visible = r.source === 'official' || r.source === 'public' || isOwner(r, req.auth)
      || ['admin', 'superadmin'].includes(req.auth.role);
    if (!visible) { res.status(403).json({ error: '无权查看该题库' }); return; }
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const qs = db.prepare('SELECT * FROM questions WHERE set_id = ? ORDER BY idx ASC LIMIT ? OFFSET ?')
      .all(r.id, limit, offset)
      .map(x => ({ id: x.id, q: x.q, options: safeParse(x.options, []), answer: x.answer, explanation: x.explanation, type: x.type }));
    const set = setToJSON(r);
    set.isMine = isOwner(r, req.auth);
    set.questions = qs;
    set.offset = offset;
    set.limit = limit;
    res.json(set);
  });

  // 从解析任务创建题库（visibility: public=提交审核 / private=私库）
  app.post('/api/sets', authRequired, (req, res) => {
    const { jobId, title, desc, category, tags, visibility, copyrightConfirmed } = req.body || {};
    if (!copyrightConfirmed) { res.status(400).json({ error: '请先确认版权声明' }); return; }
    const job = jobId ? db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(jobId) : null;
    if (!job || job.status !== 'done') { res.status(400).json({ error: '解析任务无效或未完成' }); return; }
    if (job.owner_id !== req.auth.ownerId || job.owner_type !== req.auth.ownerType) {
      res.status(403).json({ error: '无权使用该解析结果' }); return;
    }
    const t = String(title || '').trim();
    if (!t) { res.status(400).json({ error: '缺少标题' }); return; }
    if (t.length > 60) { res.status(400).json({ error: '标题过长（最多 60 字）' }); return; }

    const modifiedQuestions = Array.isArray((req.body || {}).questions) ? (req.body || {}).questions : null;
    const questions = (modifiedQuestions && modifiedQuestions.length > 0)
      ? modifiedQuestions.filter(q => q && q.q).map(q => ({ q: q.q, options: q.options || [], answer: q.answer || '', explanation: q.explanation || '', type: q.type || 'text' }))
      : safeParse(job.questions, []);
    const shared = visibility === 'public';
    const setId = uid('s');
    const now = Date.now();
    db.prepare('INSERT INTO sets (id, title, desc, category, tags, source, review_status, copyright_confirmed, version, owner_id, owner_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(setId, t, String(desc || '').slice(0, 200), String(category || '其他').slice(0, 20),
        JSON.stringify(Array.isArray(tags) ? tags.map(String).slice(0, 5) : []),
        shared ? 'pending' : 'private', shared ? 'pending' : 'none', 1, 1,
        req.auth.ownerId, req.auth.ownerType, now, now);
    // 记录版本快照
    db.prepare('INSERT INTO sets_versions (set_id, version, title, question_count, created_at, operator_id, operator_type) VALUES (?,?,?,?,?,?,?)')
      .run(setId, 1, t, questions.length, now, req.auth.ownerId, req.auth.ownerType);
    const insQ = db.prepare('INSERT INTO questions (id, set_id, idx, q, options, answer, explanation, type, fingerprint) VALUES (?,?,?,?,?,?,?,?,?)');
    questions.forEach((q, i) => {
      const fp = computeFingerprint(q);
      insQ.run(setId + '_q' + i, setId, i, q.q, JSON.stringify(q.options), q.answer, q.explanation, q.type, fp);
    });
    db.prepare('DELETE FROM upload_jobs WHERE id = ?').run(jobId);
    auditLog(req.auth.ownerId, req.auth.ownerType, 'set_create', 'set', setId, { title: t, questions: questions.length, visibility});
    res.json(setToJSON(db.prepare('SELECT * FROM sets WHERE id = ?').get(setId)));
  });

  // 编辑元信息（owner / admin）
  app.patch('/api/sets/:id', authRequired, (req, res) => {
    const r = db.prepare('SELECT * FROM sets WHERE id = ?').get(req.params.id);
    if (!r) { res.status(404).json({ error: '题库不存在' }); return; }
    if (r.source === 'official') { res.status(403).json({ error: '官方题库不可修改' }); return; }
    if (!isOwner(r, req.auth) && !['admin', 'superadmin'].includes(req.auth.role)) {
      res.status(403).json({ error: '只能修改自己的题库' }); return;
    }
    const b = req.body || {};
    const title = b.title !== undefined ? String(b.title).trim().slice(0, 60) : r.title;
    if (!title) { res.status(400).json({ error: '标题不能为空' }); return; }
    const desc = b.desc !== undefined ? String(b.desc).slice(0, 200) : r.desc;
    const category = b.category !== undefined ? String(b.category).slice(0, 20) : r.category;
    const tags = b.tags !== undefined ? (Array.isArray(b.tags) ? b.tags.map(String).slice(0, 5) : safeParse(r.tags, [])) : safeParse(r.tags, []);
    db.prepare('UPDATE sets SET title=?, desc=?, category=?, tags=?, updated_at=? WHERE id=?')
      .run(title, desc, category, JSON.stringify(tags), Date.now(), r.id);
    res.json({ ok: true });
  });

  // 私库转共享（提交审核）
  app.post('/api/sets/:id/share', authRequired, (req, res) => {
    const r = db.prepare('SELECT * FROM sets WHERE id = ?').get(req.params.id);
    if (!r) { res.status(404).json({ error: '题库不存在' }); return; }
    if (r.source === 'official') { res.status(403).json({ error: '官方题库无需共享' }); return; }
    if (r.source === 'public') { res.status(400).json({ error: '已在公共库中' }); return; }
    if (r.source === 'pending') { res.status(400).json({ error: '已在审核队列中' }); return; }
    if (!isOwner(r, req.auth)) { res.status(403).json({ error: '只能共享自己的题库' }); return; }
    if (r.source !== 'private') { res.status(400).json({ error: '当前状态不支持转为共享' }); return; }
    db.prepare("UPDATE sets SET source='pending', updated_at=? WHERE id=?").run(Date.now(), r.id);
    auditLog(req.auth.ownerId, req.auth.ownerType, 'set_share', 'set', r.id, { title: r.title });
    res.json({ ok: true, message: '已提交审核，管理员批准后出现在题库广场' });
  });

  app.delete('/api/sets/:id', authRequired, (req, res) => {
    const r = db.prepare('SELECT * FROM sets WHERE id = ?').get(req.params.id);
    if (!r) { res.status(404).json({ error: '题库不存在' }); return; }
    if (r.source === 'official') { res.status(403).json({ error: '官方题库不可删除' }); return; }
    if (!isOwner(r, req.auth) && !['admin', 'superadmin'].includes(req.auth.role)) {
      res.status(403).json({ error: '只能删除自己的题库' }); return;
    }
    db.prepare('DELETE FROM questions WHERE set_id = ?').run(r.id);
    db.prepare('DELETE FROM sets WHERE id = ?').run(r.id);
    res.json({ ok: true });
  });

  // 追加题目（复用上传解析任务）
  app.post('/api/sets/:id/questions', authRequired, (req, res) => {    const r = db.prepare('SELECT * FROM sets WHERE id = ?').get(req.params.id);
    if (!r) { res.status(404).json({ error: '题库不存在' }); return; }
    if (r.source === 'official') { res.status(403).json({ error: '官方题库不可追加' }); return; }
    if (!isOwner(r, req.auth) && !['admin', 'superadmin'].includes(req.auth.role)) {
      res.status(403).json({ error: '只能给自己的题库追加题目' }); return;
    }
    const { jobId } = req.body || {};
    const job = jobId ? db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(jobId) : null;
    if (!job || job.status !== 'done') { res.status(400).json({ error: '解析任务无效或未完成' }); return; }
    if (job.owner_id !== req.auth.ownerId || job.owner_type !== req.auth.ownerType) {
      res.status(403).json({ error: '无权使用该解析结果' }); return;
    }
    const newQs = safeParse(job.questions, []);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE set_id = ?').get(r.id);
    const maxQ = Number(process.env.MAX_QUESTIONS || 20000);
    if (n + newQs.length > maxQ) { res.status(400).json({ error: '题目总数超过上限 ' + maxQ }); return; }
    const ins = db.prepare('INSERT INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');
    newQs.forEach((q, i) => ins.run(r.id + '_q' + (n + i), r.id, n + i, q.q, JSON.stringify(q.options), q.answer, q.explanation, q.type));
    db.prepare('UPDATE sets SET updated_at=? WHERE id=?').run(Date.now(), r.id);
    db.prepare('DELETE FROM upload_jobs WHERE id = ?').run(jobId);
    res.json({ ok: true, added: newQs.length, total: n + newQs.length });
  });

  // 导出 Word 文档（.docx，纯文本排版）
  app.post('/api/export/docx', authRequired, async (req, res) => {
    const { setId } = (req.body || {});
    const r = db.prepare('SELECT * FROM sets WHERE id = ?').get(String(setId || ''));
    if (!r) { res.status(404).json({ error: '题库不存在' }); return; }
    const visible = r.source === 'official' || r.source === 'public' || isOwner(r, req.auth)
      || ['admin', 'superadmin'].includes(req.auth.role);
    if (!visible) { res.status(403).json({ error: '无权导出该题库' }); return; }
    const qs = db.prepare('SELECT * FROM questions WHERE set_id = ? ORDER BY idx ASC').all(r.id)
      .map(x => ({ q: x.q, options: safeParse(x.options, []), answer: x.answer, explanation: x.explanation }));
    try {
      const buf = await buildDocx(r, qs);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(r.title) + '.docx');
      res.send(buf);
    } catch (e) {
      res.status(500).json({ error: '生成文档失败：' + e.message });
    }
  });
}

function buildDocx(set, qs) {
  const escXml = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const paras = [];
  const P = (t, bold) => paras.push('<w:p>' + (bold ? '<w:pPr><w:spacing w:before="160"/></w:pPr>' : '') +
    '<w:r>' + (bold ? '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' : '') + '<w:t>' + escXml(t) + '</w:t></w:r></w:p>');
  P(set.title, true);
  if (set.desc) P(set.desc);
  P('共 ' + qs.length + ' 题');
  P('');
  qs.forEach((q, i) => {
    P((i + 1) + '. ' + q.q);
    if (q.options && q.options.length) q.options.forEach((o, j) => P('    ' + 'ABCDEFGH'[j] + '. ' + o));
    P('答案：' + (q.answer || '无'));
    if (q.explanation) P('解析：' + q.explanation);
    P('');
  });
  const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paras.join('') + '</w:body></w:document>';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  zip.file('word/document.xml', docXml);
  return zip.generateAsync({ type: 'nodebuffer' });
}

module.exports = { registerSetRoutes, setToJSON, qCount, isOwner };
