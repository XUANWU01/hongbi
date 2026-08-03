/* ============================================================
   红笔 HONGBI v4 · 策略引擎（题型感知答案匹配）
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
  // 先题型感知匹配（更精准），再尾块兜底
  questions = typeAwareMatch(questions);
  questions = mergeAnswerKeys(questions);
  return { questions, unreconciledLines: [] };
}

/* ================================================================
   防线 1：尾块匹配（原算法，处理简单情况）
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
   防线 2：题型感知匹配（按题型分组，同类匹配）
   处理「文档分两段：前半题目+后半答案区」的标准题库格式
   ================================================================ */
function typeAwareMatch(qs) {
  if (qs.length < 8) return qs;

  /* 答案值类型判断 */
  const classify = q => {
    const t = q.q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim();
    if (!t) return null;
    // 多选：多字母如 A、B 或 B、C、D
    if (/^[A-Fa-f]([、,，\s]+[A-Fa-f])+$/.test(t)) return 'multi';
    // 单选：单字母 A-F
    if (/^[A-Fa-f]$/.test(t)) return 'choice';
    // 判断：× / √ 或 (×) (√)
    if (/^[×Xx√✓✔]+$/.test(t) || /^\([×Xx√✓]\)$/.test(t) || /^(正确|错误|对|错)$/i.test(t)) return 'tf';
    // 填空：短文本（≤10字）
    if (t.length <= 10 && !/[。！？；，：]/.test(t)) return 'fill';
    // 简答：长文本
    return 'text';
  };

  /* 收集所有"纯答案行"及其分类 */
  const answerItems = [];
  for (let i = 0; i < qs.length; i++) {
    if (qs[i].answer || (qs[i].options && qs[i].options.length > 0)) continue;
    const cat = classify(qs[i]);
    if (cat) answerItems.push({ idx: i, cat, val: qs[i].q.trim().replace(/^\d+\s*[\.、．\)\s-]+\s*/, '').trim() });
  }

  if (answerItems.length < 5) return qs;  // 太少，不是答案区

  /* 根据连续性和分类确认这是答案区 */
  // 检查是否有连续段且分类多样
  let consecutiveRun = 0, maxRun = 0;
  const cats = new Set();
  for (let i = 1; i < answerItems.length; i++) {
    if (answerItems[i].idx === answerItems[i-1].idx + 1) { consecutiveRun++; }
    else consecutiveRun = 0;
    maxRun = Math.max(maxRun, consecutiveRun);
    cats.add(answerItems[i].cat);
  }
  if (maxRun < 4 || cats.size < 2) return qs;  // 不太像答案区

  /* 统计各类答案数量 */
  const answerMap = { choice: [], multi: [], tf: [], fill: [], text: [] };
  for (const ai of answerItems) answerMap[ai.cat].push(ai);

  /* 匹配：找到前方未答题目，按同类匹配 */
  const toRemove = new Set();
  const groups = ['choice', 'multi', 'tf', 'fill', 'text'];

  for (const cat of groups) {
    const answers = answerMap[cat];
    if (answers.length === 0) continue;

    // 找该类型的未答题目（choice=有选项，multi=有选项，tf/fill/text=无选项）
    const unmatched = [];
    for (let i = 0; i < qs.length; i++) {
      if (qs[i].answer) continue;  // 已有答案，跳过
      if (toRemove.has(i)) continue;  // 已被匹配为答案行，跳过
      // 类型判断
      const isChoice = qs[i].options && qs[i].options.length >= 2;
      if (cat === 'choice' || cat === 'multi') {
        if (isChoice) unmatched.push(i);
      } else if (cat === 'tf' || cat === 'fill') {
        // 判断/填空：无选项的短题干（排除大题干）
        if (!isChoice && qs[i].q.length < 50) unmatched.push(i);
      } else if (cat === 'text') {
        // 简答：无选项的长题干
        if (!isChoice) unmatched.push(i);
      }
    }

    // 从后往前匹配
    let ai = answers.length - 1;
    for (let ui = unmatched.length - 1; ui >= 0 && ai >= 0; ui--) {
      qs[unmatched[ui]].answer = answers[ai].val;
      toRemove.add(answers[ai].idx);
      ai--;
    }
  }

  // 移除已匹配的答案行
  if (toRemove.size > 0) {
    const sorted = [...toRemove].sort((a, b) => b - a);
    for (const idx of sorted) qs.splice(idx, 1);
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
module.exports = { parseBlocks, computeConfidence, detectIssues, mergeAnswerKeys, typeAwareMatch };
