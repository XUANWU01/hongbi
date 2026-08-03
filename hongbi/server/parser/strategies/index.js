/* ============================================================
   红笔 HONGBI v4 · 策略引擎（含答案区合并——多区块识别）
   ============================================================ */
'use strict';

const legacyParser = require('../parser.js');

function parseBlocks(document, options = {}) {
  const text = document.lines.map(l => l.text).join('\n');
  const raw = legacyParser.parseQuestionBank(document.meta.fileName || 'unknown.txt', text);

  let questions = (raw.questions || []).map((q, i) => ({
    id: null, idx: i,
    q: q.q, options: q.options || [], answer: q.answer || '', explanation: q.explanation || '',
    type: q.type || 'text',
    confidence: computeConfidence(q),
    issues: detectIssues(q),
    raw: q.q, media: []
  }));

  questions = mergeAnswerKeys(questions);
  return { questions, unreconciledLines: [] };
}

/**
 * 答案区合并（多区块版）：
 * 识别多个「纯答案区块」——连续 3+ 个无答案无选项的短题目。
 * 每个区块尝试匹配到前方同区内未标注答案的题目，匹配后移除区块。
 */
function mergeAnswerKeys(qs) {
  if (qs.length < 4) return qs;
  // 判断一个已解析的「题目」是否像答案行
  const isAnswerLike = q => {
    if (q.answer) return false;
    if (q.options && q.options.length > 0) return false;
    const t = q.q.trim();
    if (t.length <= 20) return true; // 短文本
    // 长文本也可能（如简答题/分析题答案），但需要额外检查
    return false;
  };
  // 判断是否像单个答案值（非题目题干）
  const isAnswerValue = t => {
    // 纯字母/数字答案: A, B, A、B, A B
    if (/^[A-Fa-f][、,，\s]?[A-Fa-f、,，\s]*$/.test(t.trim())) return true;
    // 判断题: ×, x, √, 正确, 错误, 对, 错
    if (/^[×Xx✔✖√✓]+$/.test(t.trim()) || /^[正确错对]{1,2}$/.test(t.trim())) return true;
    // 短填空答案: < 5 字
    if (t.trim().length <= 5 && !/[。！？；]/.test(t.trim())) return true;
    return false;
  };

  // 1. 从后往前找答案区块（连续 answer-like 行）
  for (let i = qs.length - 3; i >= 0; i--) {
    // 找到连续 3+ 行全是 answer-like 的区块
    let end = i + 3;
    while (end < qs.length && isAnswerLike(qs[end])) end++;
    let start = end;
    while (start > 0 && isAnswerLike(qs[start - 1])) start--;

    const blockSize = end - start;
    if (blockSize < 3) { i = start - 1; continue; }

    // 检查是否至少有一部分是 answer-value（字母/判断/短填空）
    const vals = qs.slice(start, end).map(q => q.q.trim());
    const valCount = vals.filter(isAnswerValue).length;
    if (valCount === 0 && blockSize < 10) { i = start - 1; continue; }
    if (valCount < blockSize * 0.3 && blockSize < 15) {
      // 块内长文本太多，可能不是答案区
      i = start - 1; continue;
    }

    // 2. 找到前方未答题目（在 start 之前的无答案项）
    const unanswered = [];
    for (let j = start - 1; j >= 0; j--) {
      if (!qs[j].answer) unanswered.unshift(j);
    }
    if (unanswered.length === 0) { i = start - 1; continue; }

    // 3. 尝试填充：按答案块顺序匹配最近的未答题
    const removed = qs.splice(start, blockSize);
    let ri = 0;
    for (let ui = unanswered.length - 1; ui >= 0 && ri < removed.length; ui--) {
      qs[unanswered[ui]].answer = removed[ri].q;
      ri++;
    }
    // 跳转到新的位置继续扫描
    i = start - 1;
  }

  return qs;
}

function computeConfidence(q) {
  let score = 0;
  if (q.q) score += 0.3;
  if (q.options && q.options.length >= 2) score += 0.3;
  if (q.answer) score += 0.3;
  if (q.type === 'choice' || q.type === 'multi') score += 0.1;
  return Math.min(1, score);
}

function detectIssues(q) {
  const issues = [];
  if (!q.q) issues.push('题干为空');
  if (!q.answer) issues.push('答案缺失');
  if (q.type === 'choice' && (!q.options || q.options.length < 2)) issues.push('选项不足');
  return issues;
}

module.exports = { parseBlocks, computeConfidence, detectIssues, mergeAnswerKeys };
