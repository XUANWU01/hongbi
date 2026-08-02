/* ============================================================
   红笔 HONGBI · 题库文档解析器
   支持：JSON / TXT / Markdown / CSV / TSV
   返回：{ format, questions, skipped, warnings, title }
   ============================================================ */
'use strict';

const PARSER = (() => {

  const MAX_QUESTIONS = 3000;

  function clean(t) {
    return String(t == null ? '' : t)
      .replace(/\*\*/g, '')
      .replace(/^[\s#>*\-•·]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…' : s; }

  /* 同行选项提取：题目行内带 "A.甲 B.乙 C.丙 D.丁"（含全角点 A．甲）时拆出选项
     安全校验：选项字母必须从 A 开始、严格递增且不重复，避免正文中的 e. / d. 等英文片段误触发
     allowEmptyQ=true：选项独占一行（无题干）时也接受 */
  function extractInlineOptions(t, allowEmptyQ) {
    const str = String(t == null ? '' : t);
    const re = /[A-Fa-f]\s*[.、)）．]/g;
    const marks = [];
    let m;
    while ((m = re.exec(str)) !== null) {
      marks.push({ letter: m[0][0].toUpperCase(), idx: m.index });
      if (marks.length > 8) break;
    }
    if (marks.length < 2) return null;
    let expect = 'A'.charCodeAt(0);
    for (const mm of marks) {
      if (mm.letter.charCodeAt(0) !== expect) return null;
      expect++;
    }
    // 只在校验通过的位置切分
    const parts = [];
    let last = 0;
    marks.forEach(mm => { parts.push(str.slice(last, mm.idx)); last = mm.idx; });
    parts.push(str.slice(last));
    const q = clean(parts[0]);
    const opts = parts.slice(1).map(p => clean(p.replace(/^[A-Fa-f]\s*[.、)）．]\s*/, '')));
    if (opts.length < 2 || (!allowEmptyQ && !q) || opts.some(o => !o)) return null;
    return { q, opts };
  }

  /* 行内答案提取：题干行内带「。答案是：C」时拆出（判断题支持 正确/错误；分号分隔如 答案是; ABC 也支持） */
  function extractInlineAnswer(t) {
    const str = String(t == null ? '' : t);
    const m = str.match(/(.+?)(?:答案(?:是|为)?\s*[:：;；]\s*)([A-Fa-f][A-Fa-f,，、\s]{0,14}|正确|错误|对|错)$/);
    if (!m) return null;
    return { q: clean(m[1]), answer: clean(m[2]) };
  }

  /* 答案行拆分：把【答案】B。解析：xxx / 答案：B 解析：xxx 拆成 答案字母 + 解析 */
  function splitAnswerLine(s) {
    const str = String(s == null ? '' : s).trim();
    const m = str.match(/^([A-Fa-f,，、\s]{1,12}|正确|错误|对|错)\。?\s*(?:解析\s*[:：]?)?(.*)$/);
    if (!m) return { answer: clean(str), explanation: '' };
    return { answer: clean(m[1]), explanation: clean(m[2]) };
  }

  /* 通用归一化：字母答案 -> 选项文本、推断题型；选项缺失时尝试从题干中拆分 */
  function normalize(q) {
    let options = Array.isArray(q.options) ? q.options.map(clean).filter(Boolean) : [];
    let qText = clean(q.q);
    if (options.length < 2) {
      const inline = extractInlineOptions(qText);
      if (inline) { qText = inline.q; options = inline.opts; }
    }
    let answer = clean(q.answer);
    let type = 'text';
    if (options.length >= 2) {
      type = 'choice';
      const idx = letterToIndex(answer);
      if (idx >= 0 && idx < options.length) answer = options[idx];
      else if (/^[A-Fa-f][A-Fa-f,，、\s]+$/.test(answer)) {
        // 多选答案（BCD / B,C,D）：转为选项文本拼接，标记为多选题型（multi）
        const letters = answer.match(/[A-Fa-f]/g) || [];
        const texts = letters.map(l => options[l.toUpperCase().charCodeAt(0) - 65]).filter(Boolean);
        if (texts.length === letters.length && texts.length > 0) {
          answer = texts.join('、');
          type = 'multi';
        }
      }
    }
    return { q: qText, options, answer, explanation: clean(q.explanation), type };
  }

  function letterToIndex(s) {
    const m = String(s == null ? '' : s).trim().match(/^([A-Fa-f])[.、)）．]?\s*$/);
    return m ? m[1].toUpperCase().charCodeAt(0) - 65 : -1;
  }

  /* ---------- JSON ---------- */
  function parseJSON(text, warnings) {
    let data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error('JSON 解析失败：' + e.message); }

    let list = [], title = null;
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.questions)) { list = data.questions; title = data.title; }
    else throw new Error('JSON 结构无法识别：应为题目数组，或 { title, questions: [...] }');

    const questions = [];
    list.forEach((raw, i) => {
      if (typeof raw !== 'object' || raw === null) { warnings.push('第 ' + (i + 1) + ' 条不是对象，已跳过'); return; }
      const q = raw.q ?? raw.question ?? raw.题目 ?? raw.题干 ?? raw.title ?? '';
      if (!q) { warnings.push('第 ' + (i + 1) + ' 条缺少题目，已跳过'); return; }
      let options = raw.options ?? raw.选项 ?? null;
      if (typeof options === 'string') options = splitOptionString(options);
      const n = normalize({
        q,
        options: Array.isArray(options) ? options : [],
        answer: raw.a ?? raw.answer ?? raw.ans ?? raw.答案 ?? raw.答 ?? '',
        explanation: raw.explanation ?? raw.解析 ?? raw.note ?? ''
      });
      if (!n.answer) warnings.push('第 ' + (i + 1) + ' 题未检测到答案');
      questions.push(n);
    });
    return { questions, title };
  }

  function splitOptionString(s) {
    return String(s)
      .split(/[\n|;；]/)
      .map(clean)
      .filter(Boolean);
  }

  /* ---------- CSV / TSV ---------- */
  function parseCSV(text, delim, warnings) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length === 0) return { questions: [], warnings };

    const rows = lines.map(l => splitRow(l, delim));
    let colQ = 0, colA = 1, colO = 2, colE = 3, header = false;

    const head = rows[0];
    const find = re => head.findIndex(c => re.test(c));
    const iq = find(/^(题目|题干|问题|question|q)$/i);
    const ia = find(/^(答案|answer|ans|a)$/i);
    if (iq >= 0 || ia >= 0) {
      header = true;
      colQ = iq >= 0 ? iq : (ia === 0 ? 1 : 0);
      colA = ia >= 0 ? ia : (iq === 0 ? 1 : 0);
      const io = find(/^(选项|options)$/i); colO = io >= 0 ? io : -1;
      const ie = find(/^(解析|解释|explanation|note)$/i); colE = ie >= 0 ? ie : -1;
    }

    const questions = [];
    rows.slice(header ? 1 : 0).forEach((r, i) => {
      const q = clean(r[colQ] ?? '');
      if (!q) { warnings.push('第 ' + (i + 1) + ' 行缺少题目，已跳过'); return; }
      let options = colO >= 0 && r[colO] ? splitOptionString(r[colO]) : [];
      const n = normalize({ q, options, answer: colA >= 0 ? (r[colA] ?? '') : '', explanation: colE >= 0 ? (r[colE] ?? '') : '' });
      if (!n.answer) warnings.push('第 ' + (i + 1) + ' 题未检测到答案');
      questions.push(n);
    });
    return { questions, warnings };
  }

  function splitRow(line, delim) {
    if (delim === '\t') return line.split('\t').map(s => s.trim());
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === delim) { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  /* ---------- TXT / Markdown ---------- */
  function parseText(text, warnings) {
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const nonEmpty = lines.filter(Boolean);

    // 工具：统计能拆出「题目|答案」两格的有效行数（排除解析/答案/选项行，避免正文中的 | 误触发）
    const countPairs = (sepRe) => nonEmpty.filter(l => {
      const m = l.split(sepRe);
      return m.length >= 2 && clean(m[0]) && clean(m[1]) && !/^(解析|答案|选项|说明)/.test(clean(m[0]));
    }).length;
    const enough = (n) => n >= 2 && n * 2 >= nonEmpty.length;

    // 预检测 1：单行分隔符（制表符 / 竖线），需过半行数可拆才启用
    const sepTabPipe = countPairs(/[\t|]/);
    if (enough(sepTabPipe)) {
      const qs = [];
      for (const l of nonEmpty) {
        const m = l.split(/[\t|]/);
        if (m.length >= 2 && clean(m[0]) && clean(m[1])) {
          qs.push(normalize({ q: m[0], answer: m.slice(1).join(' '), options: [] }));
        }
      }
      if (qs.length >= 2) return { questions: qs, warnings };
    }

    // 预检测 2：长横线 "——" 分隔
    const sepDash = countPairs(/——|----/);
    if (enough(sepDash)) {
      const qs = [];
      for (const l of nonEmpty) {
        const m = l.split(/——|----/);
        if (m.length >= 2 && clean(m[0]) && clean(m[1])) {
          qs.push(normalize({ q: m[0], answer: m.slice(1).join(' '), options: [] }));
        }
      }
      if (qs.length >= 2) return { questions: qs, warnings };
    }

    // 预检测 3：同行 "Q：xxx A：xxx"
    const inlineQA = [];
    for (const l of nonEmpty) {
      const m = l.match(/^[Q问题目][:：]?\s*(.+?)\s+[A答][:：]\s*(.+)$/i);
      if (m) inlineQA.push(normalize({ q: m[1], answer: m[2], options: [] }));
    }
    if (inlineQA.length >= 1) return { questions: inlineQA, warnings };

    // 状态机解析块状格式（警告先收集，仅当最终采用本结果时才输出）
    const questions = [];
    const smWarnings = [];
    let cur = null;

    const flush = () => {
      if (!cur) return;
      const n = normalize(cur);
      if (!n.q && !n.answer && n.options.length === 0) { cur = null; return; }
      if (!n.q) { cur = null; return; } // 空题干丢弃（如孤立答案行/页眉）
      if (!n.answer && n.options.length === 0) smWarnings.push('「' + trunc(n.q, 16) + '」未检测到答案');
      questions.push(n);
      cur = null;
    };
    const pushQ = (t) => { flush(); cur = { q: t, options: [], answer: '', explanation: '', _optExpect: 65 }; };
    // 新题目行：优先拆行内答案（「。答案是：C」），再尝试行内选项（题目 A.甲 B.乙）
    const pushLineQ = (t) => {
      let qText = t, answer = '';
      const ia = extractInlineAnswer(t);
      if (ia) { qText = ia.q; answer = ia.answer; }
      const inline = extractInlineOptions(qText);
      if (inline) { flush(); cur = { q: inline.q, options: inline.opts, answer, explanation: '', _optExpect: 65 }; }
      else pushQ(qText);
      if (answer) cur.answer = answer;
    };

    const RE_NUM   = /^\d{1,4}[.、)）．]\s*(.+)/;
    const RE_QMARK = /^(q|问|题目|题干)\s*[:：]\s*(.+)/i;
    const RE_AMARK = /^(?:(?:正确|参考|标准)?答案|answer|ans)(?:是|为)?\s*[:：;；]\s*(.+)/i;
    const RE_AMARK2 = /^【(?:正确|参考|标准)?答案】\s*(.+)/;
    const RE_SECTION = /^(?:单选|多选|判断|简答|填空|论述)题\s*[\d，,、 ]*道?题?$/;
    const RE_NOISE = /^(学员专用|请勿外泄|微信公众|公众号|全国辅警|第[一二三四五六]部分|(?:一|二|三|四|五|六)、|考情分析|真题展示|材料\s*[:：]?$|[-——]?\s*\d+\s*[-—]?$|第\s*\d+\s*页)/;
    const RE_EMARK = /^(解析|解释|说明|explanation|note)\s*[:：]\s*(.+)/i;
    const RE_OPT   = /^([A-Fa-f])\s*[.、)）．]\s*(.+)/;

    for (const raw of lines) {
      if (!raw) { continue; }
      let m;

      if ((m = raw.match(RE_SECTION))) { continue; } // 分节标题（单选题/多选题/判断题…）直接跳过
      if (RE_NOISE.test(raw)) { continue; } // 页眉/页脚/水印噪音行
      if ((m = raw.match(RE_AMARK)) || (m = raw.match(RE_AMARK2))) {
        const sp = splitAnswerLine(m[1]);
        if (!cur) pushQ('');
        cur.answer = (cur.answer ? cur.answer + ' ' : '') + sp.answer;
        if (sp.explanation) cur.explanation = (cur.explanation ? cur.explanation + ' ' : '') + sp.explanation;
        continue;
      }
      if ((m = raw.match(RE_EMARK))) {
        if (!cur) pushQ('');
        cur.explanation = (cur.explanation ? cur.explanation + ' ' : '') + m[2];
        continue;
      }
      if ((m = raw.match(RE_NUM))) { pushLineQ(clean(m[1])); continue; }
      if ((m = raw.match(RE_QMARK))) { pushLineQ(clean(m[2])); continue; }
      // 同行选项行（A.80 B.96 C.124 D.168 在一行）：整行拆成选项（优先于行首单选项）
      if (/^[A-Fa-f]\s*[.、)）．]/.test(raw) && ((raw.match(/[A-Fa-f]\s*[.、)）．]/g) || []).length >= 2)) {
        const inline = extractInlineOptions(raw, true);
        if (inline && inline.opts.length >= 2) {
          if (!cur) pushQ('');
          cur.options.push(...inline.opts);
          if (!cur.q && inline.q) cur.q = inline.q;
          continue;
        }
      }
      if ((m = raw.match(RE_OPT))) {
        if (!cur) pushQ('');
        const letter = m[1].toUpperCase().charCodeAt(0);
        if (letter === (cur._optExpect || 65)) {
          cur.options.push(clean(m[2]));
          cur._optExpect = letter + 1;
        } else {
          // 不是预期选项字母（如正文英文 e. / d. 片段），当作普通文本处理，防止误拆
          if (cur.options.length === 0 && !cur.answer) cur.q += ' ' + clean(raw);
          else if (!cur.answer) cur.options[cur.options.length - 1] += ' ' + clean(raw);
          else cur.explanation = (cur.explanation ? cur.explanation + ' ' : '') + clean(raw);
        }
        continue;
      }
      // 判断题选项行（正确/错误/对/错）：收集为选项，避免污染题干或解析
      if ((raw === '正确' || raw === '错误' || raw === '对' || raw === '错') && cur) {
        if (!cur.options.includes(raw)) cur.options.push(raw);
        continue;
      }
      // 普通文本
      if (!cur) pushLineQ(clean(raw));
      else if (cur.options.length > 0 && !cur.answer) cur.options[cur.options.length - 1] += ' ' + clean(raw);
      else if (!cur.answer) cur.q += ' ' + clean(raw);
      else cur.explanation = (cur.explanation ? cur.explanation + ' ' : '') + clean(raw);
    }
    flush();

    // 兜底：奇偶行配对（奇数行题目，偶数行答案）——仅在题目数 < 2 或首题无答案时尝试，避免误伤正常题库
    const needPair = questions.length === 0 || (questions.length === 1 && !questions[0].answer);
    if (needPair) {
      if (nonEmpty.length >= 2 && nonEmpty.length % 2 === 0 && nonEmpty.every(l => l.length <= 60)) {
        const qs = [];
        for (let i = 0; i < nonEmpty.length; i += 2) {
          const q = clean(nonEmpty[i]), a = clean(nonEmpty[i + 1]);
          if (q && a) qs.push(normalize({ q, answer: a, options: [] }));
        }
        if (qs.length >= 1) return { questions: qs, warnings };
      }
    }
    if (questions.length === 0) smWarnings.push('未能识别出题目格式，请参考「格式说明」调整后重试');
    warnings.push(...smWarnings);
    return { questions, warnings };
  }

  /* ---------- 入口 ---------- */
  function parseQuestionBank(filename, text) {
    const warnings = [];
    const ext = (filename.split('.').pop() || '').toLowerCase();
    text = String(text || '').replace(/^\uFEFF/, '');

    if (!text.trim()) throw new Error('文件内容为空');

    let result = { questions: [], warnings, title: null };
    let format;

    if (ext === 'json') {
      format = 'JSON';
      result = parseJSON(text, warnings);
    } else if (ext === 'csv') {
      format = 'CSV';
      result = parseCSV(text, ',', warnings);
    } else if (ext === 'tsv') {
      format = 'TSV';
      result = parseCSV(text, '\t', warnings);
    } else {
      format = /\.(md|markdown)$/i.test(ext) ? 'Markdown' : '文本';
      result = parseText(text, warnings);
    }

    let { questions } = result;
    const skipped = Math.max(0, questions.length - MAX_QUESTIONS);
    if (skipped > 0) {
      warnings.push('题目超过 ' + MAX_QUESTIONS + ' 条，已截取前 ' + MAX_QUESTIONS + ' 条');
      questions = questions.slice(0, MAX_QUESTIONS);
    }

    return {
      format,
      questions,
      skipped,
      warnings,
      title: result.title || null
    };
  }

  return { parseQuestionBank };
})();
