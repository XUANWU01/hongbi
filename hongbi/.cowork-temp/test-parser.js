const fs = require('fs');
const vm = require('vm');

// 加载 parser.js（浏览器全局写法，用 vm 提供 window-less 环境）
const parserSrc = fs.readFileSync('C:/Users/34940/lobsterai/project/hongbi/js/parser.js', 'utf8') + ';module.exports = PARSER;';
const sandbox = { console, module: { exports: {} } };
vm.createContext(sandbox);
vm.runInContext(parserSrc, sandbox);
const PARSER = sandbox.module.exports;

function run(name, text) {
  try {
    const r = PARSER.parseQuestionBank(name, text);
    console.log('==', name, '| format:', r.format, '| questions:', r.questions.length, '| warnings:', r.warnings.length);
    r.warnings.forEach(w => console.log('   WARN:', w));
    r.questions.slice(0, 2).forEach((q, i) => console.log('   Q' + (i + 1) + ':', q.type, '|', String(q.q).slice(0, 28), '| ans:', String(q.answer).slice(0, 22), '| opts:', q.options.length));
  } catch (e) {
    console.log('==', name, '| ERROR:', e.message);
  }
}

run('示例题库-计算机.txt', fs.readFileSync('C:/Users/34940/lobsterai/project/hongbi/examples/示例题库-计算机.txt', 'utf8'));
run('示例题库-前端.json', fs.readFileSync('C:/Users/34940/lobsterai/project/hongbi/examples/示例题库-前端.json', 'utf8'));
run('配对.txt', '上海是哪个城市？\n直辖市\n北京是哪个国家的首都？\n中国');
run('字母答案.md', '1. 测试题\nA. 甲\nB. 乙\nC. 丙\n答案：B');
run('表格.tsv', '题目\t答案\t解析\n1+1?\t2\t常识\n2+2?\t4\t常识');
run('CSV.csv', '题目,答案,选项,解析\n中国的首都是？,北京,上海|北京|广州|深圳,常识\n, , ,');
run('坏文件.txt', '随便写点啥\n没有格式');
run('空文件.txt', '');
console.log('DONE');
