/* ============================================================
   红笔 HONGBI v4 · 策略引擎（双防线答案匹配）
   ============================================================ */
'use strict';

const legacyParser = require('../parser.js');

function parseBlocks(document, options = {}) {
  const text = document.lines.map(l => l.text).join('\n');
  const raw = legacyParser.parseQuestionBank(document.meta.fileName || 'unknown.txt', text);
  let questions = (raw.questions || []).map((q, i) => ({
    id: null, idx: i, q: q.q, options: q.options || [], answer: q.answer || '',
    explanation: q.explanation || '', type: q.type || 'text',
    confidence: computeConfidence(q), issues: detectIssues(q), raw: q.q, media: []
  }));
  questions = mergeAnswerKeys(questions);   // 防线1：旧尾块
  questions = crossSectionMatch(questions); // 防线2：新跨区
  return { questions, unreconciledLines: [] };
}

/* 防线1：尾块匹配（原算法） */
function mergeAnswerKeys(qs) {
  if (qs.length < 3) return qs;
  let tail = 0;
  for (let i = qs.length - 1; i >= 0; i--) {
    if (qs[i].q.length < 10 && (!qs[i].options || qs[i].options.length === 0) && !qs[i].answer) tail++;
    else break;
  }
  if (tail < 3) return qs;
  const removed = qs.splice(qs.length - tail, tail);
  let j = 0;
  for (let i = qs.length - 1; i >= 0 && j < removed.length; i--) {
    if (!qs[i].answer) { qs[i].answer = removed[j].q; j++; }
  }
  return qs;
}

/* 防线2：跨区块扫描 */
function crossSectionMatch(qs) {
  if (qs.length < 6) return qs;

  /* 纯答案值特征 */
  const isAnswerVal = q => {
    if (q.answer || (q.options && q.options.length > 0)) return false;
    let t = q.q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim();
    if (!t) return false;
    if (/^[A-Fa-f]([、,，\s]+[A-Fa-f])*$/.test(t)) return true;
    if (/^[×Xx✕✖√✓✔]+$/.test(t)) return true;
    if (/^(正确|错误|对|错)$/i.test(t)) return true;
    if (/^\([×Xx√✓]\)$/.test(t)) return true;
    return t.length <= 5 && !/[。！？；，]/.test(t);
  };

  /* 候选答案行（含短文本，排除正常题干） */
  const isAnswerLike = q => {
    if (q.answer || (q.options && q.options.length > 0)) return false;
    const t = q.q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim();
    return t.length <= 25 || isAnswerVal(q);
  };

  /* 已确认答案块后，所有无答案无选项的都继续纳入 */
  const isExtend = q => !q.answer && (!q.options || q.options.length === 0);

  /* 找所有答案块：3+ 个纯答案值开头 → 向后全量扩展 */
  const blocks = [];
  let i = 0;
  while (i < qs.length - 2) {
    if (isAnswerVal(qs[i]) && isAnswerVal(qs[i+1]) && isAnswerVal(qs[i+2])) {
      let start = i; let end = i + 3;
      while (start > 0 && isAnswerLike(qs[start - 1])) start--;
      while (end < qs.length && isExtend(qs[end])) end++;
      blocks.push({ start, end });
      i = end;
    } else i++;
  }
  if (blocks.length === 0) return qs;

  /* 处理每个块（从后往前避免索引错乱）*/
  for (let b = blocks.length - 1; b >= 0; b--) {
    const { start, end } = blocks[b];
    const unanswered = [];
    for (let j = start - 1; j >= 0; j--) if (!qs[j].answer) unanswered.unshift(j);
    if (!unanswered.length) continue;
    const blockSize = end - start;
    const fillN = Math.min(blockSize, unanswered.length);
    const toRemove = [];
    let bi = blockSize - 1;
    for (let ui = unanswered.length - 1; ui >= 0 && bi >= 0; ui--) {
      qs[unanswered[ui]].answer = qs[start + bi].q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim();
      toRemove.push(start + bi);
      bi--;
    }
    toRemove.sort((a, b) => b - a);
    for (const idx of toRemove) qs.splice(idx, 1);
  }
  return qs;
}

function computeConfidence(q) {
  let score = 0; if (q.q) score += 0.3; if (q.options && q.options.length >= 2) score += 0.3;
  if (q.answer) score += 0.3; if (q.type === 'choice' || q.type === 'multi') score += 0.1; return Math.min(1, score);
}
function detectIssues(q) {
  const issues = []; if (!q.q) issues.push('题干为空'); if (!q.answer) issues.push('答案缺失');
  if (q.type === 'choice' && (!q.options || q.options.length < 2)) issues.push('选项不足'); return issues;
}
module.exports = { parseBlocks, computeConfidence, detectIssues, mergeAnswerKeys, crossSectionMatch };
