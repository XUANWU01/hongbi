/* ============================================================
   红笔 HONGBI v3 · 上传与解析任务
   大文件（≤100MB，可配）→ 临时文件 → 异步解析 job → 轮询取预览
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db } = require('../db.js');
const { authRequired, uid } = require('../auth.js');
const { parseUpload, isSupportedExt } = require('../parser/index.js');

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
    if (isSupportedExt(ext)) cb(null, true);
    else cb(new Error('不支持的文件类型：' + (ext || '未知')));
  }
});

function createJob(owner, fileName, filePath) {
  const job = {
    id: uid('j'),
    owner_id: owner.ownerId,
    owner_type: owner.ownerType,
    file_name: fileName,
    file_path: filePath,
    status: 'pending',
    created_at: Date.now()
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
    const res = await parseUpload(job.file_name, buf);
    if (res.questions.length === 0) throw new Error('未能解析出题目，请检查文件内容或格式');
    db.prepare(`UPDATE upload_jobs SET status='done', format=?, total=?, skipped=?, samples=?, warnings=?, questions=?, done_at=? WHERE id=?`)
      .run(res.format, res.questions.length, res.skipped || 0,
        JSON.stringify(res.questions.slice(0, 3)), JSON.stringify(res.warnings),
        JSON.stringify(res.questions), Date.now(), jobId);
  } catch (e) {
    db.prepare(`UPDATE upload_jobs SET status='failed', error=?, done_at=? WHERE id=?`)
      .run(e.message || '解析失败', Date.now(), jobId);
  } finally {
    // 清理临时文件
    try { fs.unlinkSync(job.file_path); } catch (e) { /* ignore */ }
  }
}

function jobToJSON(job) {
  return {
    id: job.id,
    status: job.status,
    fileName: job.file_name,
    format: job.format,
    total: job.total,
    skipped: job.skipped,
    samples: safeParse(job.samples, []),
    warnings: safeParse(job.warnings, []),
    error: job.error,
    createdAt: job.created_at
  };
}
function safeParse(s, fb) { try { return JSON.parse(s); } catch (e) { return fb; } }

function registerUploadRoutes(app) {
  // 上传文件 → 返回 jobId（异步解析）
  app.post('/api/upload', authRequired, upload.single('file'), (req, res) => {
    if (!req.file) { res.status(400).json({ error: '未收到文件' }); return; }
    const jobId = createJob(req.auth, req.file.originalname, req.file.path);
    // 后台解析（不阻塞响应）
    setImmediate(() => runJob(jobId));
    res.json({ jobId });
  }, (err, req, res, next) => { // multer 错误处理
    res.status(400).json({ error: err.message || '上传失败' });
  });

  // 轮询解析结果
  app.get('/api/upload/:id', authRequired, (req, res) => {
    const job = db.prepare('SELECT * FROM upload_jobs WHERE id = ?').get(req.params.id);
    if (!job) { res.status(404).json({ error: '任务不存在' }); return; }
    if (job.owner_id !== req.auth.ownerId || job.owner_type !== req.auth.ownerType) {
      res.status(403).json({ error: '无权查看' }); return;
    }
    res.json(jobToJSON(job));
  });
}

module.exports = { registerUploadRoutes };
