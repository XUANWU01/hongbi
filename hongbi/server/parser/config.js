/* ============================================================
   红笔 HONGBI v4 · 解析器配置（可配置，不硬编码）
   ============================================================ */
'use strict';

const config = {
  /* 噪音行过滤规则（正则数组，宽松/严格可加减） */
  noise: {
    patterns: [
      /^(学员专用|请勿外泄)/,
      /^(微信公众|公众号|全国辅警)/,
      /^第[一二三四五六七八九十]+部分/,
      /^(一|二|三|四|五|六)、/,
      /^(考情分析|真题展示)/,
      /^材料\s*[:：]?$/,
      /^[-—]?\s*\d+\s*[-—]?$/,
      /^第\s*\d+\s*页/,
    ]
  },

  /* 解析器参数 */
  parse: {
    maxQuestions: Number(process.env.MAX_QUESTIONS) || 20000,
    maxConfidence: 0.95,
    minConfidenceForValid: 0.3,
  },

  /* 提取器参数 */
  extract: {
    docxMaxSize: 100 * 1024 * 1024,
    pdfMaxSize:  100 * 1024 * 1024,
    textMaxSize:   2 * 1024 * 1024,
  }
};

module.exports = config;
