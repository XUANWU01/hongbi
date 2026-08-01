// 极简静态文件服务器（仅用于本地测试）
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = 'C:/Users/34940/lobsterai/project/hongbi';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const rootResolved = path.resolve(ROOT);
  const file = path.resolve(ROOT, '.' + urlPath);
  if (!file.startsWith(rootResolved)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8712, '127.0.0.1', () => console.log('serving on http://127.0.0.1:8712'));
