#!/usr/bin/env node
/* 红笔 HONGBI · 数据库恢复
   用法：npm run restore <backups/hongbi-xxx.db>
   警告：会替换当前数据库！使用前请停止服务。 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (!args.length) { console.error('用法：npm run restore <备份文件路径>'); process.exit(1); }

const src = path.resolve(args[0]);
if (!fs.existsSync(src)) { console.error('备份文件不存在：' + src); process.exit(1); }

const DB = path.join(__dirname, '..', 'server', 'data', 'hongbi.db');

console.log('正在恢复数据库…');
console.log('  源文件：' + src);
console.log('  目标：' + DB);
console.log('  请确保服务已停止！(Ctrl+C 取消)');

// 覆盖
fs.copyFileSync(src, DB);
console.log('恢复完成！重启服务即可。');
