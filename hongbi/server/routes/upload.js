/* ============================================================
   红笔 HONGBI v3/v4 · 上传与解析任务
   v4：job 含质量报告 + stage + 指纹预留
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db } = require('../db.js');
const { authRequired, uid } = require('../auth.js');
const { parsePipeline } = require('../parser/pipeline.js');

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 100);
const UPLOAD_DIR = path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uid('f') + path.extname(file.originalname || '').toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = (String(file.originalname || '').split('.').pop() || '').toLowerCase();
    if (/^(docx|pdf|txt|md|markdown|csv|tsv|json)$/i.test(ext)) cb(null, true);
    else cb(new Error('不支持的文件类型：' + (ext || '未知')));
  }
});

function createJob(owner, fileName, filePath) {
  const job = {
    id: uid('j'), owner_id: owner.ownerId, owner_type: owner.ownerType,
    file_name: fileName, file_path: filePath, status: 'pending', created_at: Date.now()
  };
  db.prepare('INSERT INTO upload_jobs (id, owner_id, owner_type, file_name, file_path, status, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(job.id, job.owner_id, job.owner_type, job.file_name, job.file_path, job.status, job.created_at);
  return job.id;
}

async function runJob(jobId) {
  const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(jobId);
  if (!job) return;
  try {
    const buf = fs.readFileSync(job.file_path);
    const res = await parsePipeline(job.file_name, buf);
    if (!res.success && res.errors.length) throw new Error(res.errors[0].message || '未能解析出题目');
    const quality = res.quality ? { answerRate: res.quality.coverage.answerRate, confidenceAvg: res.quality.coverage.confidenceAvg, issueSummary: res.quality.issueSummary || '' } : null;
    db.prepare(`UPDATE upload_jobs SET status='done', format=?, total=?, skipped=?, samples=?, warnings=?, questions=?, quality=?, done_at=? WHERE id=?`)
      .run(res.format, res.questions.length, 0,
        JSON.stringify(res.questions.slice(0, 3).map(q => ({ q: q.q, options: q.options, answer: q.answer, explanation: q.explanation, type: q.type }))),
        JSON.stringify(res.quality ? res.quality.issues.map(i => i.message) : []),
        JSON.stringify(res.questions.map(q => ({ q: q.q, options: q.options, answer: q.answer, explanation: q.explanation, type: q.type }))),
        JSON.stringify(quality), Date.now(), jobId);
  } catch (e) {
    db.prepare('UPDATE upload_jobs SET status=?, error=?, done_at=? WHERE id=?')
      .run('failed', e.message || '解析失败', Date.now(), jobId);
  } finally {
    try { fs.unlinkSync(job.file_path); } catch (e) { /* ignore */ }
  }
}

function safeParse(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }

function jobToJSON(job) {
  return {
    id: job.id, status: job.status, fileName: job.file_name,
    format: job.format, total: job.total, skipped: job.skipped,
    samples: safeParse(job.samples, []), warnings: safeParse(job.warnings, []),
    quality: safeParse(job.quality, null), error: job.error, createdAt: job.created_at
  };
}

function registerUploadRoutes(app) {
  app.post('/api/upload', authRequired, upload.single('file'), (req, res) => {
    if (!req.file) { res.status(400).json({ error: '未收到文件' }); return; }
    const jobId = createJob(req.auth, req.file.originalname, req.file.path);
    setImmediate(() => runJob(jobId));
    res.json({ jobId });
  }, (err, req, res, next) => { res.status(400).json({ error: err.message || '上传失败' }); });

  app.get('/api/upload/:id', authRequired, (req, res) => {
    const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(req.params.id);
    if (!job) { res.status(404).json({ error: '任务不存在' }); return; }
    res.json(jobToJSON(job));
  });
}

module.exports = { registerUploadRoutes };
