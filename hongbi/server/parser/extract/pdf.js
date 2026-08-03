/* ============================================================
   红笔 HONGBI v4 · PDF 提取器（pdfjs + tesseract.js OCR）
   ============================================================ */
'use strict';

const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
const { DocumentModel, LineModel } = require('../DocumentModel.js');

/* 获取 tesseract.js（懒加载，避免空跑时占用内存）*/
function getTesseract() {
  try { return require('tesseract.js'); } catch (e) { return null; }
}

/* 获取 canvas 模块（可能不可用）*/
function getCanvas() {
  try { return require('canvas'); } catch (e) { return null; }
}

/** 将 PDF 单页渲染为 PNG Buffer（需要 canvas 模块）*/
async function renderPageToPNG(page, scale = 2.0) {
  const Canvas = getCanvas();
  if (!Canvas) throw new Error('canvas 模块不可用，无法渲染 PDF 页面为图片');
  const vp = page.getViewport({ scale });
  const canvas = Canvas.createCanvas(vp.width, vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas.toBuffer('image/png');
}

/** OCR 识别单页图片 */
async function ocrPage(imageBuf, pageNum, totalPages) {
  const T = getTesseract();
  if (!T) throw new Error('tesseract.js 未安装，无法 OCR');
  const { data: { text } } = await T.recognize(imageBuf, 'chi_sim+eng', {
    logger: m => {
      if (m.status === 'recognizing text' && m.progress) {
        process.stdout.write('\r[ocr] 第 ' + pageNum + '/' + totalPages + ' 页: ' + Math.round(m.progress * 100) + '%');
      }
    }
  });
  return text;
}

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
    if (tc.items.length > 0) {
      textFound = true;
      let cur = '';
      for (const item of tc.items) {
        cur += (item.str || ' ');
        if (item.hasEOL) { lines.push(cur.trim()); cur = ''; }
      }
      if (cur.trim()) lines.push(cur.trim());
    }
  }

  if (!textFound) {
    // 扫描件 → OCR 回退
    const T = getTesseract();
    if (!T) {
      const err = new Error('此 PDF 为扫描件（无文字层）。安装 OCR 支持：npm install tesseract.js canvas');
      err.code = 'NO_TEXT_LAYER';
      throw err;
    }
    const Canvas = getCanvas();
    if (!Canvas) {
      const err = new Error('此 PDF 为扫描件（无文字层）。canvas 模块不可用（Node.js 版本可能太新），请尝试 npm install canvas@2.11.2 --build-from-source 或降级 Node.js。');
      err.code = 'NO_TEXT_LAYER';
      throw err;
    }

    console.log('[pdf] 无文字层，启动 OCR 识别（共 ' + doc.numPages + ' 页）……');
    const ocrLines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      try {
        const png = await renderPageToPNG(page, 2.0);
        const text = await ocrPage(png, p, doc.numPages);
        const pageLines = text.split('\n').map(l => l.trim()).filter(Boolean);
        ocrLines.push(...pageLines);
      } catch (e) {
        console.log('[ocr] 第 ' + p + ' 页失败: ' + e.message);
      }
    }

    if (ocrLines.length === 0) {
      const err = new Error('PDF 扫描件 OCR 识别失败，请使用带文字层的 PDF');
      err.code = 'OCR_FAILED';
      throw err;
    }

    console.log('\n[pdf] OCR 完成，识别 ' + ocrLines.length + ' 行文字');
    return new DocumentModel({
      sourceType: 'pdf-ocr',
      encoding: 'utf8',
      lines: ocrLines.map(l => new LineModel(l)),
      meta: { fileName, pages: doc.numPages, ocr: true }
    });
  }

  return new DocumentModel({
    sourceType: 'pdf',
    encoding: 'utf8',
    lines: lines.map(l => new LineModel(l)),
    meta: { fileName, pages: doc.numPages }
  });
}

module.exports = { extractPdf };
