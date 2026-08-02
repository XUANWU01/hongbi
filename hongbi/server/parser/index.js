/* ============================================================
   红笔 HONGBI v3 · 服务器端解析入口
   docx（jszip）/ pdf（pdfjs-dist）提取文字后，走文本状态机解析
   ============================================================ */
'use strict';

const parser = require('./parser.js');
const JSZip = require('jszip');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

async function extractDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('不是有效的 .docx 文件（缺少 word/document.xml）');
  let xml = await entry.async('string');
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:tr[^>]*>/g, '\n')
    .replace(/<w:tc[^>]*>/g, ' | ')
    .replace(/<w:p[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

async function extractPdf(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let line = '';
    for (const item of tc.items) {
      line += (item.str || ' ');
      if (item.hasEOL) { out += line + '\n'; line = ''; }
    }
    if (line.trim()) out += line + '\n';
  }
  return out;
}

const TEXT_EXTS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json'];
const DOC_EXTS = ['docx', 'pdf'];

function isSupportedExt(ext) { return TEXT_EXTS.includes(ext) || DOC_EXTS.includes(ext); }

async function parseUpload(fileName, buffer) {
  const ext = (String(fileName).split('.').pop() || '').toLowerCase();
  if (!isSupportedExt(ext)) throw new Error('不支持的文件类型：' + ext);
  let text = null;
  let format = null;
  if (ext === 'docx') { text = await extractDocx(buffer); format = 'Word 文本提取'; }
  else if (ext === 'pdf') { text = await extractPdf(buffer); format = 'PDF 文本提取'; }
  else {
    text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    format = ext === 'json' ? 'JSON' : ext === 'csv' ? 'CSV' : ext === 'tsv' ? 'TSV' : '文本';
  }
  const res = parser.parseQuestionBank(fileName.replace(/\.[^.]+$/, '') + '.txt', text);
  res.format = format;
  return res;
}

module.exports = { parseUpload, isSupportedExt, TEXT_EXTS, DOC_EXTS };
