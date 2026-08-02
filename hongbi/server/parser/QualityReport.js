/* ============================================================
   红笔 HONGBI v4 · QualityReport — 验证后的质量报告
   ============================================================ */
'use strict';

class QualityReport {
  constructor({ total, valid, coverage, issues = [], issueSummary = '' }) {
    this.total = total;
    this.valid = valid;
    this.coverage = coverage;   // { answerRate, optionRate, confidenceAvg }
    this.issues = issues;       // [{ severity, questionIndex?, message }]
    this.issueSummary = issueSummary;
  }
}

module.exports = { QualityReport };
