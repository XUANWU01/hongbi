/* ============================================================
   红笔 HONGBI v4 · 解析管线入口
   编排：Extract → Normalize → Parse → Validate → QualityReport
   返回 ParseResult = { document, questions[], quality, errors[] }
   ============================================================ */
'use strict';

const { DocumentModel } = require('./DocumentModel.js');
const { detectAndExtract } = require('./extract/index.js');
const { normalize } = require('./normalize.js');
const { parseBlocks } = require('./strategies/index.js');
const { validate } = require('./validate.js');
const { QualityReport } = require('./QualityReport.js');

/* 错误码体系 */
const ErrorCode = {
  EMPTY:           'EMPTY',           // 空文件/无内容
  ENCRYPTED:       'ENCRYPTED',       // 加密文档
  NO_TEXT_LAYER:   'NO_TEXT_LAYER',   // 扫描件 PDF 无文字层
  BAD_ZIP:         'BAD_ZIP',         // docx 损坏
  UNSUPPORTED:     'UNSUPPORTED',     // 不支持的类型
  PARSE_TIMEOUT:   'PARSE_TIMEOUT',   // 解析超时
  SIZE_LIMIT:      'SIZE_LIMIT',      // 文件过大
  BAD_FORMAT:      'BAD_FORMAT',      // 格式无法识别
  PARTIAL_SUCCESS: 'PARTIAL_SUCCESS', // 部分成功（质量报告有内容，但覆盖率低）
};

/**
 * 一次解析：文件 Buffer → 结构化结果
 * @param {string} fileName - 原始文件名（用于类型识别）
 * @param {Buffer} buffer - 文件内容
 * @param {object} options - { maxQuestions?, timeoutMs? }
 * @returns {ParseResult}
 */
async function parsePipeline(fileName, buffer, options = {}) {
  const errors = [];
  let document = null;
  let questions = [];
  let quality = null;

  // 阶段 1：提取
  try {
    document = await detectAndExtract(fileName, buffer);
    if (!document || !document.lines.length) {
      errors.push({ code: ErrorCode.EMPTY, message: '文件无有效文本内容' });
      return new ParseResult({ document, questions, quality, errors });
    }
  } catch (e) {
    const code = e.code || ErrorCode.BAD_FORMAT;
    errors.push({ code, message: e.message || '文件提取失败' });
    return new ParseResult({ document, questions, quality, errors });
  }

  // 阶段 2：归一化
  document = normalize(document);

  // 阶段 3：多策略解析
  try {
    const result = parseBlocks(document, options);
    questions = result.questions || [];
    document.unreconciledLines = result.unreconciledLines || [];
  } catch (e) {
    errors.push({ code: ErrorCode.BAD_FORMAT, message: '解析引擎异常：' + e.message });
    return new ParseResult({ document, questions, quality, errors });
  }

  // 阶段 4：验证
  quality = validate(questions, document, options);
  if (questions.length === 0) {
    errors.push({ code: ErrorCode.PARTIAL_SUCCESS, message: quality.issueSummary || '未能识别出有效题目' });
  }

  return new ParseResult({ document, questions, quality, errors });
}

class ParseResult {
  constructor({ document, questions, quality, errors }) {
    this.document = document;       // DocumentModel
    this.questions = questions;     // ParsedQuestion[]
    this.quality = quality;         // QualityReport
    this.errors = errors;           // [{ code, message }]
  }

  get success() { return this.questions.length > 0; }
  get format() { return (this.document && this.document.sourceType) || '未知'; }
}

module.exports = { parsePipeline, ParseResult, ErrorCode };
