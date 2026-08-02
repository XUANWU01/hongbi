// 从前端 js/parser.js 生成服务器版：导出方式改为 CommonJS，题数上限读环境变量
const fs = require('fs');
const src = fs.readFileSync('C:/Users/34940/lobsterai/project/hongbi/js/parser.js', 'utf8');
let out = src
  .replace('const MAX_QUESTIONS = 3000;', "const MAX_QUESTIONS = (process.env.MAX_QUESTIONS && Number(process.env.MAX_QUESTIONS)) || 20000;")
  .replace('const PARSER = (() => {', 'module.exports = (() => {');
fs.writeFileSync('C:/Users/34940/lobsterai/project/hongbi/server/parser/parser.js', out);
console.log('generated, bytes:', out.length);
