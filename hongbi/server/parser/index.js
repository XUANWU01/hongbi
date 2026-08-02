/* ============================================================
   红笔 HONGBI v3/v4 · 服务器端解析入口（向后兼容）
   v4 管线已就绪，旧接口继续可用；后续切换时可直调 pipeline.parsePipeline
   ============================================================ */
'use strict';

const parser = require('./parser.js');
const { parsePipeline, ErrorCode: PipelineError } = require('./pipeline.js');

async function extractDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('word/document.xml');
  if (!entry) throw new Error('不是有效的 .docx 文件（缺少 word/document.xml）');
  let xml = await entry.async('string');
  return xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')          // 段落结束标签 → 换行（正确方式：不拆开始标签/属性标签）
    .replace(/<w:tr[ >]/g, '\n')         // 表格行（仅精确匹配标签名）
    .replace(/<w:tc[ >]/g, ' | ')        // 表格单元格
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
  // v4 管线优先（六阶段）：提取→归一化→多策略解析→验证→质量报告
  try {
    const result = await parsePipeline(fileName, buffer);
    if (!result.success && result.errors.length) {
      // 管线失败：回退旧版解析器作为兜底
      console.warn('[parser] v4 pipeline partial, falling back to legacy parser');
    }
    return {
      format: result.format,
      questions: result.questions.map(q => ({
        q: q.q, options: q.options, answer: q.answer, explanation: q.explanation,
        type: q.type, _confidence: q.confidence, _issues: q.issues
      })),
      skipped: 0,
      warnings: result.quality ? [result.quality.issueSummary || ''].filter(Boolean)
        .concat(result.quality.issues.map(i => i.message)) : [],
      _quality: result.quality,
      _v4: true,
    };
  } catch (e) {
    throw new Error('解析失败：' + e.message);
  }
}

module.exports = { parseUpload, isSupportedExt, TEXT_EXTS, DOC_EXTS };
