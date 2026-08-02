/* ============================================================
   红笔 HONGBI v4 · 上传任务（含批量 / ZIP / 取消 / 重试 / 排队）
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const JSZip = require('jszip');
const { db } = require('../db.js');
const { authRequired, uid, rateLimitUpload } = require('../auth.js');
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
    if (/^(docx|pdf|txt|md|markdown|csv|tsv|json|zip)$/i.test(ext)) cb(null, true);
    else cb(new Error('不支持的文件类型：' + (ext || '未知')));
  }
});
const uploadMulti = multer({
  storage,
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const ext = (String(file.originalname || '').split('.').pop() || '').toLowerCase();
    if (/^(docx|pdf|txt|md|markdown|csv|tsv|json)$/i.test(ext)) cb(null, true);
    else cb(null, false); // 跳过不支持的文件
  }
});

function createJob(owner, fileName, filePath) {
  // 修复 Windows/multer 中文文件名编码：Latin-1 字节 → UTF-8
  const safeName = decodeFileName(fileName);
  const job = { id: uid('j'), owner_id: owner.ownerId, owner_type: owner.ownerType,
    file_name: safeName, file_path: filePath, status: 'pending', created_at: Date.now() };
  db.prepare('INSERT INTO upload_jobs (id, owner_id, owner_type, file_name, file_path, status, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(job.id, job.owner_id, job.owner_type, job.file_name, job.file_path, job.status, job.created_at);
  return job.id;
}

/** multer/busboy 在 Windows 上把 UTF-8 文件名当作 Latin-1 解析，需反向还原 */
function decodeFileName(name) {
  try {
    return Buffer.from(String(name || ''), 'latin1').toString('utf8');
  } catch (e) { return String(name || ''); }
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
    questions: safeParse(job.questions, []),
    quality: safeParse(job.quality, null), error: job.error, createdAt: job.created_at
  };
}

function registerUploadRoutes(app) {
  // 单文件上传（速率限制已屏蔽，后续按需启用）
  app.post('/api/upload', authRequired, upload.single('file'), (req, res) => {
    if (!req.file) { res.status(400).json({ error: '未收到文件' }); return; }
    const jobId = createJob(req.auth, req.file.originalname, req.file.path);
    setImmediate(() => runJob(jobId));
    res.json({ jobId });
  }, (err, req, res, next) => { res.status(400).json({ error: err.message || '上传失败' }); });

  // 批量上传（多文件，一次最多 20 个）
  app.post('/api/uploads', authRequired, uploadMulti.array('files', 20), (req, res) => {
    if (!req.files || !req.files.length) { res.status(400).json({ error: '未收到有效文件' }); return; }
    const jobs = req.files.map(f => {
      const jobId = createJob(req.auth, f.originalname, f.path);
      setImmediate(() => runJob(jobId));
      return { jobId, fileName: f.originalname };
    });
    res.json({ jobs, total: jobs.length });
  }, (err, req, res, next) => { res.status(400).json({ error: err.message || '上传失败' }); });

  // 获取单个 job 状态（含排队位置）
  app.get('/api/upload/:id', authRequired, (req, res) => {
    const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(req.params.id);
    if (!job) { res.status(404).json({ error: '任务不存在' }); return; }
    const json = jobToJSON(job);
    if (job.status === 'pending') {
      json.queuePosition = db.prepare("SELECT COUNT(*) AS n FROM upload_jobs WHERE status='pending' AND created_at < ?").get(job.created_at).n + 1;
    }
    res.json(json);
  });

  // 取消任务
  app.post('/api/upload/:id/cancel', authRequired, (req, res) => {
    const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(req.params.id);
    if (!job) { res.status(404).json({ error: '任务不存在' }); return; }
    if (job.status !== 'pending') { res.status(400).json({ error: '只能取消排队中的任务' }); return; }
    db.prepare("UPDATE upload_jobs SET status='failed', error='用户取消', done_at=? WHERE id=?").run(Date.now(), job.id);
    try { fs.unlinkSync(job.file_path); } catch(e){}
    res.json({ ok: true });
  });

  // 重试失败任务
  app.post('/api/upload/:id/retry', authRequired, (req, res) => {
    const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(req.params.id);
    if (!job) { res.status(404).json({ error: '任务不存在' }); return; }
    if (job.status !== 'failed') { res.status(400).json({ error: '只能重试失败的任务' }); return; }
    db.prepare("UPDATE upload_jobs SET status='pending', error='', done_at=0 WHERE id=?").run(job.id);
    setImmediate(() => runJob(job.id));
    res.json({ ok: true });
  });

  // ZIP 上传解析
  app.post('/api/upload/zip', authRequired, upload.single('file'), async (req, res) => {
    if (!req.file || !/zip$/i.test(req.file.originalname || '')) { res.status(400).json({ error: '请上传 ZIP 文件' }); return; }
    try {
      const buf = fs.readFileSync(req.file.path);
      const zip = await JSZip.loadAsync(buf);
      const jobs = [];
      const exts = ['docx', 'pdf', 'txt', 'md', 'csv', 'tsv', 'json'];
      for (const [relPath, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const ext = (relPath.split('.').pop() || '').toLowerCase();
        if (!exts.includes(ext)) continue;
        const data = await entry.async('nodebuffer');
        const tmpPath = path.join(UPLOAD_DIR, uid('z'));
        fs.writeFileSync(tmpPath, data);
        const jobId = createJob(req.auth, path.basename(relPath), tmpPath);
        setImmediate(() => runJob(jobId));
        jobs.push({ jobId, fileName: path.basename(relPath) });
      }
      try { fs.unlinkSync(req.file.path); } catch(e){}
      res.json({ jobs, total: jobs.length, note: jobs.length === 0 ? 'ZIP 内未找到支持的题库文件（.docx/.pdf/.txt/.csv/.json 等）' : null });
    } catch (e) { res.status(400).json({ error: 'ZIP 解压失败：' + e.message }); }
  });
}

module.exports = { registerUploadRoutes };
