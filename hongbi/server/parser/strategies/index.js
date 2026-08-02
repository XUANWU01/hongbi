/* ============================================================
   红笔 HONGBI v4 · 策略引擎（多策略注册 + 区块选择）
   当前策略：继承现有 parser.js 状态机作为 textBlocks 策略
   后续扩展：inlineQA / pairLines / json / csv / bracket 独立策略
   ============================================================ */
'use strict';

// 复用现有解析器（作为基础策略）
const legacyParser = require('../parser.js');

/**
 * 区块级解析：全文走 textBlocks 策略（当前等价于现有解析器）
 * 返回 { questions: ParsedQuestion[], unreconciledLines: string[] }
 */
function parseBlocks(document, options = {}) {
  const text = document.lines.map(l => l.text).join('\n');
  const raw = legacyParser.parseQuestionBank(document.meta.fileName || 'unknown.txt', text);

  const questions = (raw.questions || []).map((q, i) => ({
    id: null,
    idx: i,
    q: q.q,
    options: q.options || [],
    answer: q.answer || '',
    explanation: q.explanation || '',
    type: q.type || 'text',
    confidence: computeConfidence(q),
    issues: detectIssues(q),
    raw: q.q,
    media: []
  }));

  // 未解析行：全文都参与了，不计未解析区（后续区块化时启用）
  const unreconciledLines = [];

  return { questions, unreconciledLines };
}

/* 置信度计算（简版，后续升级） */
function computeConfidence(q) {
  let score = 0;
  if (q.q) score += 0.3;
  if (q.options && q.options.length >= 2) score += 0.3;
  if (q.answer) score += 0.3;
  if (q.type === 'choice' || q.type === 'multi') score += 0.1;
  return Math.min(1, score);
}

/* 逐题问题检测 */
function detectIssues(q) {
  const issues = [];
  if (!q.q) issues.push('题干为空');
  if (!q.answer) issues.push('答案缺失');
  if (q.type === 'choice' && (!q.options || q.options.length < 2)) issues.push('选项不足');
  if (q.options && new Set(q.options.map(String)).size !== q.options.length) issues.push('选项重复');
  return issues;
}

module.exports = { parseBlocks, computeConfidence, detectIssues };
