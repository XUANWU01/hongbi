/* ============================================================
   红笔 HONGBI v4 · 归一化层：行清洗 + 噪音过滤
   ============================================================ */
'use strict';

const { LineModel } = require('./DocumentModel.js');
const noiseConfig = require('./config.js').noise;

function normalize(document) {
  const cleaned = [];
  const warnings = [];

  for (const line of document.lines) {
    let text = line.text.trim();
    // 全半角转换（仅 ASCII 字母数字）
    text = text.replace(/[ａ-ｚＡ-Ｚ０-９]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xFF40 + 0x40)
    );
    if (!text) continue;

    // 噪音过滤
    if (noiseConfig.patterns.some(p => p.test(text))) continue;

    cleaned.push(new LineModel(text, line.kind));
  }

  document.lines = cleaned;
  return document;
}

module.exports = { normalize };
