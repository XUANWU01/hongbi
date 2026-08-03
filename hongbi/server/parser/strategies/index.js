/* ============================================================
   红笔 HONGBI v4 · 策略引擎（三防线答案匹配）
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
  questions = typeAwareMatch(questions);
  questions = mergeAnswerKeys(questions);
  questions = residualCleanup(questions);
  return { questions, unreconciledLines: [] };
}

/* ================================================================
   防线 1：题型感知匹配
   - tf 优先（最窄特征）→ fill → choice/multi → text（最宽兜底）
   ================================================================ */
function typeAwareMatch(qs) {
  if (qs.length < 8) return qs;

  const classify = q => {
    const t = q.q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim();
    if (!t) return null;
    if (/^[A-Fa-f]([、,，\s]+[A-Fa-f])+$/.test(t)) return 'multi';
    if (/^[A-Fa-f]$/.test(t)) return 'choice';
    if (/^[×Xx√✓✔]+$/.test(t) || /^\([×Xx√✓]\)$/.test(t) || /^(正确|错误|对|错)$/i.test(t)) return 'tf';
    if (t.length <= 10 && !/[。！？；，：]/.test(t)) return 'fill';
    return 'text';
  };

  const answerItems = [];
  for (let i = 0; i < qs.length; i++) {
    if (qs[i].answer || (qs[i].options && qs[i].options.length > 0)) continue;
    const cat = classify(qs[i]);
    if (cat) answerItems.push({ idx: i, cat, val: qs[i].q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim() });
  }
  if (answerItems.length < 5) return qs;

  let run = 0, maxRun = 0;
  for (let i = 1; i < answerItems.length; i++) {
    if (answerItems[i].idx === answerItems[i-1].idx + 1) run++; else run = 0;
    maxRun = Math.max(maxRun, run);
  }
  if (maxRun < 3) return qs;

  const answerMap = { choice: [], multi: [], tf: [], fill: [], text: [] };
  for (const ai of answerItems) answerMap[ai.cat].push(ai);

  const toRemove = new Set();
  // tf最窄先匹配 → fill匹配含括号占位符的 → choice/multi匹配有选项的 → text兜底
  for (const cat of ['tf', 'fill', 'choice', 'multi', 'text']) {
    const answers = answerMap[cat];
    if (answers.length === 0) continue;
    const unmatched = [];
    for (let i = 0; i < qs.length; i++) {
      if (qs[i].answer || toRemove.has(i)) continue;
      const hasOpts = qs[i].options && qs[i].options.length >= 2;
      if (cat === 'choice' || cat === 'multi') {
        if (hasOpts) unmatched.push(i);
      } else if (cat === 'tf') {
        if (!hasOpts && /\(\)|（\s*）|【\s*】|[\\(（][×Xx√✓\\)）]/.test(qs[i].q)) unmatched.push(i);
      } else if (cat === 'fill') {
        if (!hasOpts && /\((\s*)\)|（\s*）/.test(qs[i].q)) unmatched.push(i);
      } else {
        if (!hasOpts) unmatched.push(i);
      }
    }
    let ai = answers.length - 1;
    for (let ui = unmatched.length - 1; ui >= 0 && ai >= 0; ui--) {
      qs[unmatched[ui]].answer = answers[ai].val;
      toRemove.add(answers[ai].idx);
      ai--;
    }
  }

  if (toRemove.size > 0) {
    const sorted = [...toRemove].sort((a, b) => b - a);
    for (const idx of sorted) qs.splice(idx, 1);
  }
  return qs;
}

/* ================================================================
   防线 2：尾块匹配
   ================================================================ */
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

/* ================================================================
   防线 3：残值清扫
   ================================================================ */
function residualCleanup(qs) {
  if (qs.length < 5) return qs;
  const isAnswerOnly = q => {
    if (q.answer || (q.options && q.options.length > 0)) return false;
    const t = q.q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim();
    if (!t) return false;
    if (/^[A-Fa-f]([、,，\s]+[A-Fa-f])*$/.test(t)) return true;
    if (/^[×Xx√✓✔]+$/.test(t) || /^\([×Xx√✓]\)$/.test(t) || /^(正确|错误|对|错)$/i.test(t)) return true;
    return t.length <= 15 && !/[。！？；，：]/.test(t);
  };
  const residues = [];
  for (let i = 0; i < qs.length; i++) if (isAnswerOnly(qs[i])) residues.push({ idx: i, val: qs[i].q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim() });
  if (residues.length < 2) return qs;
  const unanswered = [];
  for (let i = 0; i < qs.length; i++) if (!qs[i].answer && !residues.some(r => r.idx === i)) unanswered.push(i);
  if (unanswered.length === 0) return qs;
  const toRemove = [];
  let ri = residues.length - 1;
  for (let ui = unanswered.length - 1; ui >= 0 && ri >= 0; ui--) {
    qs[unanswered[ui]].answer = residues[ri].val;
    toRemove.push(residues[ri].idx);
    ri--;
  }
  if (toRemove.length > 0) {
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
module.exports = { parseBlocks, computeConfidence, detectIssues, mergeAnswerKeys, typeAwareMatch, residualCleanup };
