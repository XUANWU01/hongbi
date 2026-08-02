/* ============================================================
   红笔 HONGBI v3 · 刷题数据（无状态会话：前端决定题目顺序）
   答题记录 → 稀疏进度 / 错题本 / 收藏 / 统计
   ============================================================ */
'use strict';

const { db } = require('../db.js');
const { authRequired } = require('../auth.js');

function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function checkQuestion(setId, questionId) {
  return db.prepare('SELECT * FROM questions WHERE id = ? AND set_id = ?').get(questionId, setId) || null;
}

function registerQuizRoutes(app) {
  // 提交答题记录（选择题判对由前端提交，服务器存流水 + 更新进度/错题/统计）
  app.post('/api/quiz/answer', authRequired, (req, res) => {
    const { setId, questionId, correct, userAnswer } = req.body || {};
    if (!setId || !questionId) { res.status(400).json({ error: '参数缺失' }); return; }
    const q = checkQuestion(setId, questionId);
    if (!q) { res.status(404).json({ error: '题目不存在' }); return; }
    const auth = req.auth;
    const isCorrect = correct ? 1 : 0;
    const now = Date.now();

    // 答题流水（热度统计，记录简答/填空的用户作答）
    db.prepare('INSERT INTO attempt_logs (owner_id, owner_type, set_id, question_id, correct, answer_text, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(auth.ownerId, auth.ownerType, setId, questionId, isCorrect, String(userAnswer || '').slice(0, 4000), now);

    // 稀疏进度（只记录答过的题）
    const p = db.prepare('SELECT * FROM progress WHERE owner_id=? AND owner_type=? AND question_id=?')
      .get(auth.ownerId, auth.ownerType, questionId);
    if (p) {
      db.prepare('UPDATE progress SET correct_count=correct_count+?, wrong_count=wrong_count+?, state=?, updated_at=? WHERE owner_id=? AND owner_type=? AND question_id=?')
        .run(isCorrect, 1 - isCorrect, isCorrect ? 1 : 2, now, auth.ownerId, auth.ownerType, questionId);
    } else {
      db.prepare('INSERT INTO progress (owner_id, owner_type, question_id, state, correct_count, wrong_count, updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(auth.ownerId, auth.ownerType, questionId, isCorrect ? 1 : 2, isCorrect, 1 - isCorrect, now);
    }

    // 错题本
    if (!isCorrect) {
      db.prepare(`INSERT INTO wrong_items (owner_id, owner_type, question_id, count, last_at) VALUES (?,?,?,1,?)
                 ON CONFLICT(owner_id, owner_type, question_id) DO UPDATE SET count = count + 1, last_at = excluded.last_at`)
        .run(auth.ownerId, auth.ownerType, questionId, now);
    } else {
      // 答对：若处于「错题专项」重刷，前端会另行调用已掌握接口；这里仅当有错题记录时保留
      // （前端专项重刷答对时调用 /api/wrong/:questionId DELETE）
    }

    // 每日统计
    const day = dayKey();
    db.prepare(`INSERT INTO stats_daily (owner_id, owner_type, day, answered, correct) VALUES (?,?,?,1,?)
               ON CONFLICT(owner_id, owner_type, day) DO UPDATE SET answered = answered + 1, correct = correct + excluded.correct`)
      .run(auth.ownerId, auth.ownerType, day, isCorrect);

    res.json({ ok: true });
  });

  /* ---------- 错题本 ---------- */
  app.get('/api/wrong', authRequired, (req, res) => {
    const rows = db.prepare(
      `SELECT w.question_id, w.count, w.last_at, q.set_id, q.q, q.type, q.options, q.answer, q.explanation, s.title AS set_title,
              (SELECT a.answer_text FROM attempt_logs a
                WHERE a.question_id = w.question_id AND a.owner_id = w.owner_id AND a.owner_type = w.owner_type
                ORDER BY a.id DESC LIMIT 1) AS user_answer
       FROM wrong_items w
       JOIN questions q ON q.id = w.question_id
       JOIN sets s ON s.id = q.set_id
       WHERE w.owner_id = ? AND w.owner_type = ?
       ORDER BY w.count DESC, w.last_at DESC`
    ).all(req.auth.ownerId, req.auth.ownerType);
    res.json({ total: rows.length, items: rows.map(r => ({
      questionId: r.question_id, count: r.count, lastAt: r.last_at,
      setId: r.set_id, setTitle: r.set_title, q: r.q, type: r.type,
      options: (() => { try { return JSON.parse(r.options); } catch (e) { return []; } })(),
      answer: r.answer, explanation: r.explanation,
      userAnswer: r.user_answer || ''
    })) });
  });

  // 已掌握（移除错题）
  app.delete('/api/wrong/:questionId', authRequired, (req, res) => {
    db.prepare('DELETE FROM wrong_items WHERE owner_id=? AND owner_type=? AND question_id=?')
      .run(req.auth.ownerId, req.auth.ownerType, req.params.questionId);
    res.json({ ok: true });
  });

  // 清空错题本
  app.delete('/api/wrong', authRequired, (req, res) => {
    db.prepare('DELETE FROM wrong_items WHERE owner_id=? AND owner_type=?')
      .run(req.auth.ownerId, req.auth.ownerType);
    res.json({ ok: true });
  });

  /* ---------- 收藏 ---------- */
  app.get('/api/favorites', authRequired, (req, res) => {
    const rows = db.prepare(
      `SELECT f.question_id, f.created_at, q.set_id, q.q, q.type, q.options, q.answer, q.explanation, s.title AS set_title
       FROM favorites f JOIN questions q ON q.id = f.question_id JOIN sets s ON s.id = q.set_id
       WHERE f.owner_id = ? AND f.owner_type = ? ORDER BY f.created_at DESC`
    ).all(req.auth.ownerId, req.auth.ownerType);
    res.json({ total: rows.length, items: rows.map(r => ({
      questionId: r.question_id, createdAt: r.created_at, setId: r.set_id, setTitle: r.set_title,
      q: r.q, type: r.type, options: (() => { try { return JSON.parse(r.options); } catch (e) { return []; } })(),
      answer: r.answer, explanation: r.explanation
    })) });
  });

  app.post('/api/favorites', authRequired, (req, res) => {
    const { questionId } = req.body || {};
    if (!questionId || !db.prepare('SELECT id FROM questions WHERE id = ?').get(questionId)) {
      res.status(400).json({ error: '题目不存在' }); return;
    }
    db.prepare('INSERT OR IGNORE INTO favorites (owner_id, owner_type, question_id, created_at) VALUES (?,?,?,?)')
      .run(req.auth.ownerId, req.auth.ownerType, questionId, Date.now());
    res.json({ ok: true });
  });

  app.delete('/api/favorites/:questionId', authRequired, (req, res) => {
    db.prepare('DELETE FROM favorites WHERE owner_id=? AND owner_type=? AND question_id=?')
      .run(req.auth.ownerId, req.auth.ownerType, req.params.questionId);
    res.json({ ok: true });
  });

  /* ---------- 统计 ---------- */
  app.get('/api/stats/me', authRequired, (req, res) => {
    const { answered, correct } = db.prepare(
      'SELECT COALESCE(SUM(answered),0) AS answered, COALESCE(SUM(correct),0) AS correct FROM stats_daily WHERE owner_id=? AND owner_type=?'
    ).get(req.auth.ownerId, req.auth.ownerType);
    const wrong = db.prepare('SELECT COUNT(*) AS n FROM wrong_items WHERE owner_id=? AND owner_type=?').get(req.auth.ownerId, req.auth.ownerType).n;
    const daily = db.prepare('SELECT day, answered, correct FROM stats_daily WHERE owner_id=? AND owner_type=? ORDER BY day DESC LIMIT 7')
      .all(req.auth.ownerId, req.auth.ownerType);
    const sessions = db.prepare('SELECT COUNT(DISTINCT set_id) AS n FROM attempt_logs WHERE owner_id=? AND owner_type=?').get(req.auth.ownerId, req.auth.ownerType).n;
    res.json({ answered, correct, wrong, sessions, daily });
  });

  app.get('/api/stats/global', authRequired, (req, res) => {
    const sets = db.prepare("SELECT COUNT(*) AS n FROM sets WHERE source IN ('official','public')").get().n;
    const questions = db.prepare('SELECT COUNT(*) AS n FROM questions').get().n;
    res.json({ sets, questions });
  });

  /* ---------- 旧数据导入（题库标私库；错题/收藏按 setId_qIdx 映射） ---------- */
  app.post('/api/import', authRequired, (req, res) => {
    const data = req.body || {};
    const setsIn = [];
    if (Array.isArray(data.public)) setsIn.push(...data.public);
    if (Array.isArray(data.private)) setsIn.push(...data.private);
    let importedSets = 0, importedQuestions = 0;

    const insSet = db.prepare('INSERT OR IGNORE INTO sets (id, title, desc, category, tags, source, review_status, owner_id, owner_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    const insQ = db.prepare('INSERT OR IGNORE INTO questions (id, set_id, idx, q, options, answer, explanation, type) VALUES (?,?,?,?,?,?,?,?)');

    for (const s of setsIn) {
      if (!s || !s.title || !Array.isArray(s.questions) || s.questions.length === 0) continue;
      let id = String(s.id || '');
      if (!id || db.prepare('SELECT id FROM sets WHERE id = ?').get(id)) id = 'imp' + Date.now().toString(36) + importedSets;
      insSet.run(id, String(s.title).slice(0, 60), String(s.desc || '').slice(0, 200), String(s.category || '其他').slice(0, 20),
        JSON.stringify(Array.isArray(s.tags) ? s.tags.slice(0, 5) : []),
        'private', 'none', req.auth.ownerId, req.auth.ownerType, Date.now(), Date.now());
      s.questions.forEach((q, i) => {
        if (!q || !q.q) return;
        const options = Array.isArray(q.options) ? q.options.map(String) : [];
        insQ.run(id + '_q' + i, id, i, String(q.q).slice(0, 5000), JSON.stringify(options),
          String(q.answer || '').slice(0, 2000), String(q.explanation || '').slice(0, 3000),
          options.length >= 2 ? 'choice' : 'text');
      });
      importedSets++;
      importedQuestions += s.questions.length;
    }

    // 错题/收藏（旧格式：{setId, qIndex} → questionId = setId_q{qIndex}）
    const addWrong = db.prepare('INSERT OR IGNORE INTO wrong_items (owner_id, owner_type, question_id, count, last_at) VALUES (?,?,?,?,?)');
    for (const w of Array.isArray(data.wrong) ? data.wrong : []) {
      if (w && w.setId && w.qIndex != null) {
        const qid = w.setId + '_q' + w.qIndex;
        if (db.prepare('SELECT id FROM questions WHERE id = ?').get(qid)) {
          addWrong.run(req.auth.ownerId, req.auth.ownerType, qid, Math.max(1, w.count || 1), w.at || Date.now());
        }
      }
    }
    const addFav = db.prepare('INSERT OR IGNORE INTO favorites (owner_id, owner_type, question_id, created_at) VALUES (?,?,?,?)');
    for (const f of Array.isArray(data.fav) ? data.fav : []) {
      if (f && f.setId && f.qIndex != null) {
        const qid = f.setId + '_q' + f.qIndex;
        if (db.prepare('SELECT id FROM questions WHERE id = ?').get(qid)) {
          addFav.run(req.auth.ownerId, req.auth.ownerType, qid, f.at || Date.now());
        }
      }
    }

    res.json({ ok: true, sets: importedSets, questions: importedQuestions });
  });
}

module.exports = { registerQuizRoutes };
