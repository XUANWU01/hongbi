/* ============================================================
   红笔 HONGBI v4 · 策略引擎（旧答案区合并 + 新跨区块匹配器）
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

  // 第 1 道防线：旧算法（尾块匹配）
  questions = mergeAnswerKeys(questions);
  // 第 2 道防线：新算法（全文扫描 + 分节匹配）
  questions = crossSectionMatch(questions);
  return { questions, unreconciledLines: [] };
}

/* ================================================================
   第 1 道防线：尾块匹配（原算法，不动）
   ================================================================ */
function mergeAnswerKeys(qs) {
  if (qs.length < 3) return qs;
  let tail = 0;
  for (let i = qs.length - 1; i >= 0; i--) {
    const q = qs[i];
    if (q.q.length < 10 && (!q.options || q.options.length === 0) && !q.answer) {
      tail++;
    } else break;
  }
  if (tail < 3) return qs;
  const removed = qs.splice(qs.length - tail, tail);
  let j = 0;
  for (let i = qs.length - 1; i >= 0 && j < removed.length; i--) {
    if (!qs[i].answer) {
      qs[i].answer = removed[j].q;
      j++;
    }
  }
  return qs;
}

/* ================================================================
   第 2 道防线：跨区块匹配（全文扫描 + 分节识别）
   识别「N. 答案」行块并匹配到前方同节未标注答案的题目
   ================================================================ */
function crossSectionMatch(qs) {
  if (qs.length < 6) return qs;

  /* 判断一行是否像纯答案值（被解析器误判为题干） */
  const isAnswerVal = q => {
    if (q.answer) return false;
    if (q.options && q.options.length > 0) return false;
    let t = q.q.trim();
    // 去掉数字前缀: "1. A" → "A", "12. B、C" → "B、C"
    t = t.replace(/^\d+\s*[.、．)\s-]+\s*/, '').trim();
    if (t.length === 0) return false;
    // 纯字母答案: A / BDE / A、B / A,B
    if (/^[A-Fa-f]([、,，\s]+[A-Fa-f])*$/.test(t)) return true;
    // 判断题: × / √ / 正确 / 错误 / 对 / 错
    if (/^[×Xx✕✖√✓✔]+$/.test(t)) return true;
    if (/^(正确|错误|对|错|True|False)$/i.test(t)) return true;
    // 短填空答案: ≤5 字
    if (t.length <= 5 && !/[。！？；，]/.test(t) && !/^(第|一|二|三|四|五|六|七|八|九|十)/.test(t)) return true;
    // 带括号的判断题: (×) (√)
    if (/^\([×Xx√✓]\)$/.test(t)) return true;
    return false;
  };

  /* 判断一行是否可能是答案值（宽松版，含略长文本）*/
  const isAnswerLike = q => {
    if (q.answer) return false;
    if (q.options && q.options.length > 0) return false;
    let t = q.q.trim();
    // 去掉数字前缀
    t = t.replace(/^\d+\s*[.、．)\s-]+\s*/, '').trim();
    if (t.length <= 20) return true;  // 短文本
    if (isAnswerVal(q)) return true;
    return false;
  };

  // 1. 找到所有连续的答案值块（3+ 行）
  const blocks = [];
  let i = 0;
  while (i < qs.length - 2) {
    if (isAnswerLike(qs[i]) && isAnswerLike(qs[i+1]) && isAnswerLike(qs[i+2])) {
      let end = i + 3;
      while (end < qs.length && isAnswerLike(qs[end])) end++;
      // 确认块内有足够的答案值（≥ 块大小的 40%）
      const vals = qs.slice(i, end).filter(isAnswerVal).length;
      if (vals >= (end - i) * 0.3) {
        blocks.push({ start: i, end });
      }
      i = end;
    } else {
      i++;
    }
  }

  if (blocks.length === 0) return qs;

  // 2. 处理每个块：匹配到前方未答题目
  // 从后往前处理，避免索引错乱
  for (let b = blocks.length - 1; b >= 0; b--) {
    const { start, end } = blocks[b];
    const blockItems = qs.slice(start, end);
    const blockSize = end - start;

    // 找到该块之前的所有未标注答案的题目
    const unanswered = [];
    for (let j = start - 1; j >= 0; j--) {
      if (!qs[j].answer) unanswered.unshift(j);
    }

    if (unanswered.length === 0) continue;

    // 3. 从块末端向前匹配：块内最后一项填到前方最后一个未答题目
    //    这样可以处理「题在前 答案在后」的标准格式
    const fillCount = Math.min(blockSize, unanswered.length);
    const toRemove = [];
    let bi = blockSize - 1;
    for (let ui = unanswered.length - 1; ui >= 0 && bi >= 0; ui--) {
      qs[unanswered[ui]].answer = qs[start + bi].q;
      toRemove.push(start + bi);
      bi--;
    }

    // 4. 移除已匹配的答案行
    if (toRemove.length > 0) {
      toRemove.sort((a, b) => b - a);
      for (const idx of toRemove) qs.splice(idx, 1);
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

module.exports = { parseBlocks, computeConfidence, detectIssues, mergeAnswerKeys, crossSectionMatch };
