/* ============================================================
   红笔 HONGBI v4 · DocumentModel — 解析管线的统一中间表示
   所有提取器输出此模型，格式差异到此为止
   ============================================================ */
'use strict';

class DocumentModel {
  constructor({ sourceType, encoding, lines = [], meta = {} }) {
    this.sourceType = sourceType;      // 'docx'|'pdf'|'txt'|'csv'|'tsv'|'json'
    this.encoding = encoding || null;
    this.lines = lines;                // LineModel[]
    this.meta = meta;                  // { pages?, warnings[], imageCount? }
    this.unreconciledLines = [];       // 无法归入任何题块的原文行（填充于解析后）
  }
}

class LineModel {
  constructor(text, kind = 'body') {
    this.text = String(text == null ? '' : text);
    this.kind = kind;    // 'heading'|'body'|'options'|'noise'|'page'|'separator'
  }
}

module.exports = { DocumentModel, LineModel };
