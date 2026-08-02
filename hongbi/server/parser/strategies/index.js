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
 * 答案区合并：识别「纯答案块」——从最后一个分节标记到末尾的无答案题目视为答案列表
 * 策略：找到答案块起止 → 块内每个题的值填回前方同类未答题目 → 移除块
 */
function mergeAnswerKeys(qs) {
  if (qs.length < 5) return qs;
  // 1. 找到答案块（连续无答案+无选项的行，含长文本）
  let blockStart = -1;
  for (let i = qs.length - 1; i >= 0; i--) {
    const q = qs[i];
    if (!q.answer && (!q.options || q.options.length === 0)) {
      blockStart = i;
    } else if (q.answer || (q.options && q.options.length > 0)) {
      break;
    }
  }
  if (blockStart < 0) blockStart = qs.length;
  const blockCount = qs.length - blockStart;
  if (blockCount < 5) return qs;  // 块太小
  // 2. 块内答案去重（相同答案出现多次说明是答案列表，非真实题目）
  const values = qs.slice(blockStart).map(q => q.q);
  const unique = new Set(values);
  if (unique.size > values.length * 0.8) return qs;  // 太分散，不像答案列表

  // 3. 把答案回填到前方无答案的题目
  const removed = qs.splice(blockStart, blockCount);
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
