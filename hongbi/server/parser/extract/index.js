/* ============================================================
   红笔 HONGBI v4 · 提取层：文档类型检测 + 分发到对应提取器
   所有提取器输出统一的 DocumentModel
   ============================================================ */
'use strict';

const { DocumentModel, LineModel } = require('../DocumentModel.js');
const { extractDocx } = require('./docx.js');
const { extractPdf } = require('./pdf.js');

const ErrorCode = {
  UNSUPPORTED:  'UNSUPPORTED',
  EMPTY:        'EMPTY',
  SIZE_LIMIT:   'SIZE_LIMIT',
  BAD_FORMAT:   'BAD_FORMAT',
};

/* 魔数校验表（偏移量、魔术字节、匹配类型） */
const MAGIC = [
  { offset: 0, bytes: [0x50, 0x4B, 0x03, 0x04], type: 'zip' },  // PK..
  { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46], type: 'pdf' },  // %PDF
];

function checkMagic(buffer, magic) {
  if (buffer.length < magic.offset + magic.bytes.length) return false;
  return magic.bytes.every((b, i) => buffer[magic.offset + i] === b);
}

function extOf(name) { return (String(name || '').split('.').pop() || '').toLowerCase(); }

const TEXT_EXTS = ['txt', 'md', 'markdown'];
const CSV_EXTS  = ['csv', 'tsv'];
const DOC_EXTS  = ['docx', 'pdf'];
const JSON_EXT  = 'json';

function isSupportedExt(ext) {
  return TEXT_EXTS.includes(ext) || CSV_EXTS.includes(ext) || DOC_EXTS.includes(ext) || ext === JSON_EXT;
}

/**
 * 检测文档类型并分发提取
 * @returns {DocumentModel}
 */
async function detectAndExtract(fileName, buffer) {
  const ext = extOf(fileName);
  if (!isSupportedExt(ext)) {
    const e = new Error('不支持的文件类型：' + (ext || '未知'));
    e.code = ErrorCode.UNSUPPORTED;
    throw e;
  }

  // 魔数校验
  const isZipLike  = checkMagic(buffer, MAGIC.find(m => m.type === 'zip'));
  const isPdfLike  = checkMagic(buffer, MAGIC.find(m => m.type === 'pdf'));

  // docx 必须是 ZIP
  if (ext === 'docx' && !isZipLike) {
    const e = new Error('文件内容与扩展名不符：不是有效的 Word 文档');
    e.code = ErrorCode.BAD_FORMAT;
    throw e;
  }
  // pdf 必须是 PDF 魔数
  if (ext === 'pdf' && !isPdfLike && buffer.length > 8) {
    const e = new Error('文件内容与扩展名不符：不是有效的 PDF 文件');
    e.code = ErrorCode.BAD_FORMAT;
    throw e;
  }

  // 分发
  if (ext === 'docx') return extractDocx(buffer, fileName);
  if (ext === 'pdf')  return extractPdf(buffer, fileName);
  if (ext === JSON_EXT) return extractJson(buffer, fileName);
  if (CSV_EXTS.includes(ext)) return extractCsv(buffer, ext, fileName);
  return extractText(buffer, fileName);  // txt / md / 兜底
}

/* ---------- 纯文本 ---------- */
function extractText(buffer, fileName) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) {
    const e = new Error('文件无有效文本内容');
    e.code = ErrorCode.EMPTY;
    throw e;
  }
  const lines = text.split(/\r?\n/).map(l => new LineModel(l));
  return new DocumentModel({ sourceType: 'txt', encoding: 'utf8', lines, meta: { fileName } });
}

/* ---------- JSON ---------- */
function extractJson(buffer, fileName) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  // JSON 格式：保留原文本走文档提取，标志为 json
  // 解析阶段会优先用 json 策略
  const lines = text.split(/\r?\n/).map(l => new LineModel(l));
  return new DocumentModel({ sourceType: 'json', encoding: 'utf8', lines, meta: { fileName, rawJson: text } });
}

/* ---------- CSV / TSV ---------- */
function extractCsv(buffer, ext, fileName) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const delim = ext === 'tsv' ? '\t' : ',';
  const lines = text.split(/\r?\n/)
    .filter(l => l.trim())
    .map(l => new LineModel(l.split(delim).join(delim === ',' ? ' , ' : '\t'), 'body'));
  return new DocumentModel({
    sourceType: ext,
    encoding: 'utf8',
    lines,
    meta: { fileName, delimiter: delim, rawText: text }
  });
}

module.exports = { detectAndExtract, isSupportedExt, ErrorCode, checkMagic, extOf };
