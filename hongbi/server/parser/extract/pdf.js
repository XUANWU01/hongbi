/* ============================================================
   红笔 HONGBI v4 · PDF 提取器（pdfjs-dist，保留行结构）
   ============================================================ */
'use strict';

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const { DocumentModel, LineModel } = require('../DocumentModel.js');

async function extractPdf(buffer, fileName) {
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch (e) {
    if (e.message && /wrong password/i.test(e.message)) {
      const err = new Error('PDF 已加密，无法提取文字');
      err.code = 'ENCRYPTED';
      throw err;
    }
    const err = new Error('无法解析该 PDF 文件：' + e.message);
    err.code = 'BAD_FORMAT';
    throw err;
  }

  const lines = [];
  let textFound = false;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    if (tc.items.length === 0) continue;
    textFound = true;

    let cur = '';
    for (const item of tc.items) {
      cur += (item.str || ' ');
      if (item.hasEOL) {
        lines.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) lines.push(cur.trim());
  }

  if (!textFound) {
    const err = new Error('此 PDF 可能为扫描件（无文字层），建议使用带文字层的 PDF 或转换为 TXT 后上传');
    err.code = 'NO_TEXT_LAYER';
    throw err;
  }

  return new DocumentModel({
    sourceType: 'pdf',
    encoding: 'utf8',
    lines: lines.map(l => new LineModel(l)),
    meta: { fileName, pages: doc.numPages }
  });
}

module.exports = { extractPdf };
