/* ============================================================
   红笔 HONGBI v4 · 答案规范化模块（独立，消除散落各处的正则）
   输入：原始答案文本 + 选项列表
   输出：{ answerText, answerLetters, answerIndexes }
   ============================================================ */
'use strict';

function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }

/**
 * 从任意答案文本中提取「字母索引 + 选项文本」的标准表示
 * 策略链（按优先级）：
 *   1) 纯字母（ABC / B,D,E / B、D、E / B D E）→ 按字母映射
 *   2) 选项整段匹配（答案含完整选项文本）→ 收集命中选项
 *   3) 分隔符拆段精确匹配 → 兜底
 */
function normalizeAnswer(rawAnswer, options) {
  if (!rawAnswer || !options || options.length === 0) {
    return { answerText: '', answerLetters: '', answerIndexes: [], isMulti: false };
  }

  const normOpts = options.map(clean);

  // 策略 1：纯字母答案
  const letters = String(rawAnswer).match(/[A-Fa-f]/g) || [];
  const residue = String(rawAnswer).replace(/[A-Fa-f]/g, '').replace(/[、,，。;；.\s·\-—]+/g, '');
  if (letters.length >= 1 && residue === '') {
    const idxes = letters.map(l => l.toUpperCase().charCodeAt(0) - 65);
    if (idxes.every(i => i >= 0 && i < options.length)) {
      const uniq = [...new Set(idxes)];
      const texts = uniq.map(i => options[i]).filter(Boolean);
      return {
        answerText: texts.join('、'),
        answerLetters: uniq.map(i => 'ABCDEFGH'[i]).join('、'),
        answerIndexes: uniq,
        isMulti: uniq.length >= 2
      };
    }
  }

  // 策略 2：选项整段匹配
  const ansNorm = clean(rawAnswer);
  const hitIdxes = [];
  normOpts.forEach((o, i) => { if (o.length >= 4 && ansNorm.includes(o)) hitIdxes.push(i); });
  if (hitIdxes.length >= 2) {
    return {
      answerText: hitIdxes.map(i => options[i]).join('、'),
      answerLetters: hitIdxes.map(i => 'ABCDEFGH'[i]).join('、'),
      answerIndexes: hitIdxes,
      isMulti: true
    };
  }
  if (hitIdxes.length === 1) {
    return {
      answerText: options[hitIdxes[0]],
      answerLetters: 'ABCDEFGH'[hitIdxes[0]],
      answerIndexes: [hitIdxes[0]],
      isMulti: false
    };
  }

  // 策略 3：分隔符拆段精确匹配（兜底）
  const parts = ansNorm.split(/[、,，]/).filter(Boolean);
  const partIdxes = parts.map(p => normOpts.findIndex(o => o === p)).filter(i => i >= 0);
  const uniq = [...new Set(partIdxes)];
  if (uniq.length > 0) {
    return {
      answerText: uniq.map(i => options[i]).join('、'),
      answerLetters: uniq.map(i => 'ABCDEFGH'[i]).join('、'),
      answerIndexes: uniq,
      isMulti: uniq.length >= 2
    };
  }

  // 无匹配 → 保留原文
  return { answerText: String(rawAnswer), answerLetters: '', answerIndexes: [], isMulti: false };
}

module.exports = { normalizeAnswer };
