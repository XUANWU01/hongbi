/* ============================================================
   红笔 HONGBI v4 · docx 提取器（段落级提取，不拆 run）
   - 宏检测与剥离（vbaProject.bin → 警告）
   - 表格按 <w:tr>/<w:tc> 转换
   - 段落按 </w:p> 结尾标签换行（不误拆 <w:pPr>/<w:pStyle>）
   ============================================================ */
'use strict';

const JSZip = require('jszip');
const { DocumentModel, LineModel } = require('../DocumentModel.js');

async function extractDocx(buffer, fileName) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    const err = new Error('文件损坏或不是有效的 Word 文档（无法解压）');
    err.code = 'BAD_ZIP';
    throw err;
  }

  // 宏检测与剥离
  let hasMacro = false;
  if (zip.file('word/vbaProject.bin') || zip.file('word/vbaData.xml')) {
    hasMacro = true;
    zip.remove('word/vbaProject.bin');
    zip.remove('word/vbaData.xml');
  }

  const entry = zip.file('word/document.xml');
  if (!entry) {
    const err = new Error('不是有效的 .docx 文件（缺少 word/document.xml）');
    err.code = 'BAD_ZIP';
    throw err;
  }

  let xml = await entry.async('string');
  const text = xml
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<w:br[^>]*\/>/g, '\n')
    // 段落结束标签 → 换行（正确方式：不拆 <w:pPr>/<w:pStyle> 等属性标签）
    .replace(/<\/w:p>/g, '\n')
    // 表格行/单元格
    .replace(/<w:tr[ >]/g, '\n')
    .replace(/<w:tc[ >]/g, ' | ')
    // 清除所有剩余标签
    .replace(/<[^>]+>/g, '')
    // 实体解码
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00A0')
    // 合并连续空行
    .replace(/\n{3,}/g, '\n\n');

  const lines = text.split(/\r?\n/)
    .filter(l => l.trim())
    .map(l => new LineModel(l));

  const meta = { fileName };
  if (hasMacro) meta.warnings = ['文档含有宏内容，已自动移除（不影响题目文本）'];

  return new DocumentModel({ sourceType: 'docx', encoding: 'utf8', lines, meta });
}

module.exports = { extractDocx };
