/* ============================================================
   红笔 HONGBI v4 · 策略引擎（含答案区合并——按章节匹配）
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
 * 答案区合并：扫描末尾连续的「N. 短答案」行块，匹配到前方无答案的题目
 * 格式如：二、多选题  1.A  2.A、B  3.A、B  （这些行不合题意，是纯答案列表）
 */
function mergeAnswerKeys(qs) {
  if (qs.length < 3) return qs;
  // 从后往前找「纯答案」块：连续 N 行都是 <10 字符的短文本、无选项、无答案
  let tail = 0;
  for (let i = qs.length - 1; i >= 0; i--) {
    const q = qs[i];
    if (q.q.length < 10 && (!q.options || q.options.length === 0) && !q.answer) {
      tail++;
    } else break;
  }
  if (tail < 3) return qs;
  // 去掉纯答案行
  const removed = qs.splice(qs.length - tail, tail);
  // 将去掉的答案回填到前方无答案的题（按同指数匹配）
  let j = 0;
  for (let i = qs.length - 1; i >= 0 && j < removed.length; i--) {
    if (!qs[i].answer) {
      qs[i].answer = removed[j].q;
      j++;
    }
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
