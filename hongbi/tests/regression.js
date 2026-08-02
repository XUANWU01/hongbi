/* ============================================================
   红笔 HONGBI v4 · 回归测试套件入口
   npm test → 语法检查 + 解析器回归 + 答案格式 + 全题型 + 文字提取
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL [' + name + ']', extra || ''); }
};

/* ---------- 1. 语法检查 ---------- */
console.log('=== 语法检查 ===');
const srcFiles = [
  'js/core.js', 'js/api.js', 'js/views.js', 'js/app.js',
  'server/server.js', 'server/db.js', 'server/auth.js',
  'server/routes/upload.js', 'server/routes/sets.js', 'server/routes/quiz.js', 'server/routes/admin.js',
  'server/parser/pipeline.js', 'server/parser/DocumentModel.js', 'server/parser/QualityReport.js',
  'server/parser/config.js', 'server/parser/normalize.js', 'server/parser/validate.js', 'server/parser/answer.js',
  'server/parser/strategies/index.js',
  'server/parser/extract/index.js', 'server/parser/extract/docx.js', 'server/parser/extract/pdf.js',
  'scripts/backup.js', 'scripts/recover.js'
];
for (const f of srcFiles) {
  try {
    require('child_process').execSync('node --check ' + path.join(__dirname, '..', f), { timeout: 5000 });
    check('syntax:' + f, true);
  } catch (e) {
    check('syntax:' + f, false, e.stderr ? String(e.stderr).slice(0, 80) : e.message.slice(0, 80));
  }
}

/* ---------- 2. 解析器回归（文本状态机） ---------- */
console.log('\n=== 解析器回归（8 用例） ===');
(function parser3() {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'parser.js'), 'utf8') + ';module.exports = PARSER;';
  const sb = { console, module: { exports: {} } };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  const P = sb.module.exports;

  // 1. 英文 e. 不误拆
  let r = P.parseQuestionBank('t.txt', '1. 根据要求修改 Hadoop 相关文件（hadoop-env.sh、core-site.xml、hdfs-site.xml、mapred-site.xml、yarn-site.xml），初始化 Hadoop，截图初始化结果；\n2. 配置 HDFS 的副本数为 2，并截图验证；\n答案：按操作步骤完成');
  check('英文 e. 不误拆', r.questions.length === 2 && r.questions[0].options.length === 0 && r.questions[0].type === 'text');

  // 2. 同行选项
  r = P.parseQuestionBank('t2.txt', '1. 下列哪个是输出设备？A.键盘 B.鼠标 C.显示器 D.打印机\n答案：C');
  check('同行选项', r.questions.length === 1 && r.questions[0].type === 'choice' && r.questions[0].options.length === 4 && r.questions[0].answer === '显示器');

  // 3. 全角点同行
  r = P.parseQuestionBank('t3.txt', '1. HTTP 默认端口是？A．21 B．80 C．443 D．8080\n答案：B');
  check('全角点同行选项', r.questions[0].type === 'choice' && r.questions[0].answer === '80');

  // 4. 分行选项
  r = P.parseQuestionBank('t4.txt', '1、二进制 1011 转十进制？\nA、9\nB、10\nC、11\nD、12\n答案：C');
  check('分行选项', r.questions[0].type === 'choice' && r.questions[0].options.length === 4 && r.questions[0].answer === '11');

  // 5. 行首 e. 不误拆
  r = P.parseQuestionBank('t5.txt', '1. 描述一下流程：\ne.g. 先启动服务，再检查日志\n答案：见操作');
  check('行首 e. 不误拆', r.questions[0].options.length === 0);

  // 6. JSON 内嵌选项
  r = P.parseQuestionBank('t6.json', JSON.stringify({ questions: [{ q: '中国的首都是？A.上海 B.北京 C.广州 D.深圳', answer: 'B' }] }));
  check('JSON 内嵌选项', r.questions[0].type === 'choice' && r.questions[0].answer === '北京');

  // 7. 实操题警告
  r = P.parseQuestionBank('t7.txt', '1. 安装 Hadoop 并完成配置\n2. 启动集群\n');
  check('实操题警告', r.questions.length === 2 && r.warnings.length === 2);

  // 8. 英文分行/同行选项
  r = P.parseQuestionBank('t8.txt', '1. Which of the following is NOT an input device?\nA. Keyboard\nB. Scanner\nC. Printer\nD. Camera\nAnswer: C\n2. How many MB in 1 GB? A. 1000 B. 1024 C. 512 D. 2048\nAnswer: B');
  check('英文分行/同行选项', r.questions[0].type === 'choice' && r.questions[0].options.length === 4 && r.questions[1].type === 'choice' && r.questions[1].options.length === 4 && r.questions[1].answer === '1024');
})();

/* ---------- 3. 答案格式（11 用例） ---------- */
console.log('\n=== 答案格式回归（11 用例） ===');
(function parser4() {
  const vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'parser.js'), 'utf8') + ';module.exports = PARSER;';
  const sb = { console, module: { exports: {} } };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  const P = sb.module.exports;

  const cases = [
    ['正确答案：C', '丙'], ['正确答案:C', '丙'], ['参考答案：B', '乙'],
    ['【答案】D', '丁'], ['【正确答案】A', '甲'], ['标准答案：B', '乙'], ['答案：C', '丙'],
  ];
  for (const [line, want] of cases) {
    const r = P.parseQuestionBank('t.txt', '1. 测试题？\nA. 甲\nB. 乙\nC. 丙\nD. 丁\n' + line);
    check('答案格式「' + line + '」→ ' + want, r.questions[0] && r.questions[0].answer === want);
  }

  // 标准格式回归
  let r = P.parseQuestionBank('t2.txt', '1. 二进制 1011 转十进制？\nA. 9\nB. 10\nC. 11\nD. 12\n答案：C\n解析：8+2+1=11');
  check('标准格式回归', r.questions[0].type === 'choice' && r.questions[0].answer === '11' && r.questions[0].explanation.includes('8+2+1'));

  // 英文 e. 回归
  r = P.parseQuestionBank('t3.txt', '1. 修改 Hadoop 配置（core-site.xml、hdfs-site.xml），初始化后截图；\n答案：见操作');
  check('英文 e. 回归', r.questions[0].options.length === 0 && r.questions[0].type === 'text');

  // 同行选项+正确答案
  r = P.parseQuestionBank('t4.txt', '1. HTTP 默认端口？A．21 B．80 C．443 D．8080\n正确答案：B');
  check('同行选项+正确答案', r.questions[0].type === 'choice' && r.questions[0].answer === '80');

  // 实操题警告回归
  r = P.parseQuestionBank('t5.txt', '1. 安装 Hadoop\n2. 启动集群\n');
  check('实操题回归', r.questions.length === 2 && r.warnings.length === 2);
})();

/* ---------- 4. v4 管线：全题型 18 题 ---------- */
console.log('\n=== v4 管线：全题型 fixture ===');
(async () => {
  let parsePipeline;
  try {
    const mod = require('../server/parser/pipeline.js');
    parsePipeline = mod.parsePipeline;
  } catch (e) { check('pipeline加载', false, e.message); return; }

  try {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'examples', '测试文档-全题型题库.txt'));
    const r = await parsePipeline('fulltypes.txt', buf);
    check('管线：≥18 题', r.questions.length >= 18);
    check('管线：choice 题', r.questions.filter(q => q.type === 'choice').length >= 5);
    check('管线：multi 题', r.questions.filter(q => q.type === 'multi').length >= 4);
    check('管线：答案覆盖率 ≥70%', r.quality.coverage.answerRate >= 70);
    check('管线：置信度均值 ≥70%', r.quality.coverage.confidenceAvg >= 70);
  } catch (e) {
    check('管线全题型', false, e.message);
  }

  /* ---------- 5. v4 管线：答案规范化单元 ---------- */
  console.log('\n=== 答案规范化单元测试 ===');
  try {
    const { normalizeAnswer } = require('../server/parser/answer.js');
    const opts = ['键盘', '鼠标', '显示器', '打印机', '扫描仪'];
    
    let a = normalizeAnswer('C', opts);
    check('答案-单字母', a.answerText === '显示器' && a.answerIndexes[0] === 2 && !a.isMulti);
    
    a = normalizeAnswer('BDE', opts);
    check('答案-连续多字母', a.isMulti && a.answerLetters === 'B、D、E');
    
    a = normalizeAnswer('B,D,E', opts);
    check('答案-逗号多字母', a.isMulti && a.answerIndexes.length === 3);
    
    a = normalizeAnswer('B、D、E', opts);
    check('答案-顿号多字母', a.isMulti);
    
    a = normalizeAnswer('显示器', opts);
    check('答案-整段文本', a.answerText === '显示器' && a.answerLetters === 'C');
    
    a = normalizeAnswer('显示器、打印机', opts);
    check('答案-多文本拼接', a.isMulti && a.answerIndexes.length === 2);
  } catch (e) {
    check('答案规范化', false, e.message);
  }

  /* ---------- 6. v4 管线：提取层 docx ---------- */
  console.log('\n=== 提取层 docx 测试 ===');
  try {
    const testDocx = path.join(__dirname, '..', '.cowork-temp', 'gongan-test.docx');
    if (fs.existsSync(testDocx)) {
      const buf = fs.readFileSync(testDocx);
      const r2 = await parsePipeline('gongan.docx', buf);
      check('docx提取：≥150 题', r2.questions.length >= 150);
      check('docx提取：答案覆盖率 ≥80%', r2.quality.coverage.answerRate >= 80);
    } else {
      console.log('  (docx fixture 不存在，跳过)');
    }
  } catch (e) {
    check('docx提取', false, e.message);
  }

  /* ---------- 报告 ---------- */
  const total = passed + failed;
  console.log('\n══════════════════════════════════');
  console.log('  结果：' + passed + ' / ' + total + ' 通过  ' + (failed ? failed + ' 失败' : '✓ 全部通过'));
  console.log('══════════════════════════════════');
  process.exit(failed ? 1 : 0);
})();
