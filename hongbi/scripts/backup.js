#!/usr/bin/env node
/* 红笔 HONGBI · 数据库备份
   用法：npm run backup  或  node scripts/backup.js
   输出：backups/hongbi-YYYYMMDD-HHmm.db（保留最近 7 份） */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DB = path.join(__dirname, '..', 'server', 'data', 'hongbi.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

if (!fs.existsSync(DB)) { console.error('数据库文件不存在：' + DB); process.exit(1); }
fs.mkdirSync(BACKUP_DIR, { recursive: true });

// WAL checkpoint（确保数据完整）
try {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
} catch (e) { console.warn('WAL checkpoint 跳过：' + e.message); }

// 复制到备份目录
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const dest = path.join(BACKUP_DIR, 'hongbi-' + ts + '.db');
fs.copyFileSync(DB, dest);

// 清理旧备份（保留最近 7 份）
const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.db')).sort();
while (files.length > 7) {
  const old = files.shift();
  fs.unlinkSync(path.join(BACKUP_DIR, old));
  console.log('删除旧备份：' + old);
}

const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log('备份完成：' + dest + ' (' + size + ' MB, 保留最近 7 份)');
