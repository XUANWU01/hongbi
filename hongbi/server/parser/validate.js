/* ============================================================
   红笔 HONGBI v4 · 验证层：规则校验 + 质量报告生成
   ============================================================ */
'use strict';

const { QualityReport } = require('./QualityReport.js');

function validate(questions, document, options = {}) {
  const issues = [];
  let validCount = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.q) validCount++;
    for (const issue of (q.issues || [])) {
      issues.push({ severity: 'warn', questionIndex: i + 1, message: issue });
    }
  }

  const total = questions.length;
  const withAnswer = questions.filter(q => q.answer).length;
  const withOptions = questions.filter(q => q.options && q.options.length >= 2).length;
  const confidenceSum = questions.reduce((s, q) => s + (q.confidence || 0), 0);

  const coverage = {
    answerRate: total > 0 ? Math.round(withAnswer / total * 100) : 0,
    optionRate: total > 0 ? Math.round(withOptions / total * 100) : 0,
    confidenceAvg: total > 0 ? Math.round(confidenceSum / total * 100) : 0
  };

  let issueSummary = '';
  if (total === 0) {
    issueSummary = '未能识别出有效题目';
  } else if (coverage.answerRate < 50) {
    issueSummary = `题库存在大量无答案的题目（仅 ${coverage.answerRate}% 有答案），可能缺少答案标注`;
  } else if (coverage.confidenceAvg < 50) {
    issueSummary = '题目置信度普遍偏低，可能有较多格式异常';
  }

  return new QualityReport({ total, valid: validCount, coverage, issues, issueSummary });
}

module.exports = { validate };
