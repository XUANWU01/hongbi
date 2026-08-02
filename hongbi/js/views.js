/* ============================================================
   红笔 HONGBI v2 · 视图层：所有页面渲染 + 刷题引擎
   ============================================================ */
'use strict';

let session = null;       // 刷题会话
let uploadState = null;   // 上传/追加流程
const libraryState = { keyword: '', cat: '全部', sort: 'new', page: 1 };
const PAGE_SIZE = 12;

/* ============================================================
   首页
   ============================================================ */
function renderHome() {
  const stats = Store.get(KEY_STATS, { answered: 0, correct: 0, sessions: [], daily: {} });
  const wrong = wrongCount();
  const pub = publicSets();
  const priv = privateSets();
  const totalQ = [...pub, ...priv].reduce((n, s) => n + (s.questionCount != null ? s.questionCount : (s.questions ? s.questions.length : 0)), 0);
  const acc = stats.answered > 0 ? Math.round(stats.correct / stats.answered * 100) : 0;
  const last = stats.sessions[0];
  const recent = stats.sessions.slice(0, 5);

  const onboard = Store.get(KEY_SEEN, false) ? '' :
    '<div class="upload-banner" style="margin-top:24px"><span class="b-icon">✒️</span><div>' +
    '<strong>欢迎使用红笔</strong> —— 上传题库时，你可以选择把它<strong>合并到「公共主题库」</strong>，供其他有同样需求的人使用；' +
    '或选择<strong>建立自己的私库</strong>，仅自己可见。' +
    '<div style="margin-top:8px"><button class="btn btn-sm btn-ink" data-action="dismiss-seen">知道了</button></div></div></div>';

  return '' +
    '<section class="hero">' +
      '<div>' +
        '<p class="hero-eyebrow">HONGBI · QUIZ WORKBOOK v2</p>' +
        '<h1>把题目，写进<br><span class="hl">红笔</span>里。</h1>' +
        '<p class="hero-sub">上传你的题库文档，贡献给有同样需求的人，或建立自己的私库。红笔负责记住你的每一个错误，直到你全部掌握。</p>' +
        '<div class="hero-actions">' +
          '<a class="btn btn-primary btn-lg" href="#/upload">✒️ 上传题库</a>' +
          '<a class="btn btn-ghost btn-lg" href="#/library">开始刷题</a>' +
          (wrong > 0 ? '<a class="btn btn-danger btn-lg" href="#/wrong">错题本 · ' + wrong + '</a>' : '') +
        '</div>' +
        '<div class="quick-row">' +
          (last ? '<button class="btn btn-ghost btn-sm" data-action="quick-continue">↻ 继续上次刷题</button>' : '') +
          '<button class="btn btn-ghost btn-sm" data-action="quick-daily">🎲 每日一练</button>' +
        '</div>' +
      '</div>' +
      '<div class="hero-note" aria-hidden="true">' +
        '<p class="note-q">Q. 二进制数 1011 是多少？</p>' +
        '<p class="note-line">你填了：<span class="note-x">12 ✗</span></p>' +
        '<p class="note-line" style="font-size:12.5px;color:var(--ink-3)">参考答案：11（8+2+1）</p>' +
        '<div class="note-foot"><span class="stamp">待复习</span><span class="stamp stamp-green">已掌握</span></div>' +
      '</div>' +
    '</section>' + onboard +

    '<section>' +
      '<div class="stats-grid">' +
        statCard('题目总数', totalQ, '公共 + 私库') +
        statCard('累计作答', stats.answered, '答对 ' + stats.correct + ' 题') +
        statCard('正确率', acc + '%', stats.answered > 0 ? '近 ' + stats.answered + ' 次作答' : '还没有作答记录') +
        statCard('错题本', wrong, wrong > 0 ? '待复习' : '干干净净') +
      '</div>' +
    '</section>' +

    '<div class="home-cols">' +
      '<section><div class="section-head"><div><h2 style="font-size:20px">近 7 天正确率</h2></div></div>' + trendHtml(stats) + '</section>' +
      '<section><div class="section-head"><div><h2 style="font-size:20px">最近动态</h2></div></div>' +
        (recent.length
          ? recent.map(s => '<div class="list-row" style="padding:10px 14px"><div class="row-main">' +
              '<div class="row-title" style="font-size:14px">' + esc(s.setTitle) + '</div>' +
              '<div class="row-sub">' + relTime(s.at) + ' · 答对 ' + s.correct + ' / ' + s.total + '</div></div>' +
              '<button class="btn btn-sm btn-ghost" data-action="replay-set" data-id="' + s.setId + '">再刷</button></div>').join('')
          : emptyState('🕐', '还没有刷题记录', '去题库广场挑一套题开始吧。', '<a class="btn btn-primary btn-sm" href="#/library">去刷题</a>')) +
      '</section>' +
    '</div>';

  function statCard(label, num, foot) {
    return '<div class="stat-card"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-num">' + num + '</div><div class="stat-foot">' + foot + '</div></div>';
  }
}

function trendHtml(stats) {
  const daily = stats.daily || {};
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const v = daily[key] || { a: 0, c: 0 };
    days.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), a: v.a, pct: v.a ? Math.round(v.c / v.a * 100) : 0 });
  }
  const hasAny = days.some(d => d.a > 0);
  if (!hasAny) return '<div class="trend-empty">刷几道题后，这里会画出你的正确率曲线。</div>';
  const maxH = Math.max(...days.map(d => d.pct), 10);
  return '<div class="trend">' + days.map(d =>
    '<div class="trend-col" title="' + d.label + ' · ' + d.a + ' 题 · 正确率 ' + d.pct + '%">' +
      '<div class="trend-bar" style="height:' + Math.round(d.pct / maxH * 100) + '%"><span>' + (d.a ? d.pct : '') + '</span></div>' +
      '<div class="trend-label">' + d.label + '</div>' +
    '</div>').join('') + '</div>';
}

/* ============================================================
   题库卡片 / 行
   ============================================================ */
function qCount(s) { return s.questionCount != null ? s.questionCount : (s.questions ? s.questions.length : 0); }

function setCard(s, i) {
  const prog = Store.get(KEY_PROGRESS, {})[s.id];
  const pct = prog && prog.answered > 0 ? Math.round(prog.correct / prog.answered * 100) : null;
  return '<article class="set-card" data-src="' + s.source + '" style="--i:' + (i % 8) + '">' +
    '<div class="set-card-top">' +
      '<span class="chip chip-cat">' + esc(s.category || '未分类') + '</span>' +
      '<span class="chip ' + srcChipClass(s) + '">' + srcLabel(s) + '</span>' +
      (pct != null ? '<span class="chip">正确率 ' + pct + '%</span>' : '') +
    '</div>' +
    '<h3>' + esc(s.title) + '</h3>' +
    '<p class="set-desc">' + esc(s.desc || '暂无描述') + '</p>' +
    '<div class="set-meta"><span>' + qCount(s) + ' 题</span>' +
    (s.tags && s.tags.length ? '<span>#' + esc(s.tags.join(' #')) + '</span>' : '') + '</div>' +
    '<div class="set-actions">' +
      '<button class="btn btn-primary btn-sm" data-action="start-quiz" data-id="' + s.id + '">开始刷题</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="preview" data-id="' + s.id + '">预览</button>' +
    '</div>' +
  '</article>';
}

function setRow(s) {
  const prog = Store.get(KEY_PROGRESS, {})[s.id];
  const pct = prog && prog.answered > 0 ? Math.round(prog.correct / prog.answered * 100) : null;
  const sub = qCount(s) + ' 题' + (pct != null ? ' · 已刷 ' + prog.answered + ' · 正确率 ' + pct + '%' : ' · 还没刷过');
  return '<div class="list-row" data-src="' + s.source + '">' +
    '<div class="row-main">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
        '<span class="row-title">' + esc(s.title) + '</span>' +
        '<span class="chip ' + srcChipClass(s) + '">' + srcLabel(s) + '</span>' +
      '</div>' +
      '<div class="row-sub">' + sub + '</div>' +
    '</div>' +
    (pct != null ? '<div class="progress-mini" title="正确率 ' + pct + '%"><i style="width:' + pct + '%"></i></div>' : '') +
    '<div class="row-actions">' +
      '<button class="btn btn-sm btn-primary" data-action="start-quiz" data-id="' + s.id + '">刷题</button>' +
      '<button class="btn btn-sm btn-ghost" data-action="preview" data-id="' + s.id + '">预览</button>' +
      '<button class="btn btn-sm btn-ghost" data-action="export" data-id="' + s.id + '">JSON</button>' +
      '<button class="btn btn-sm btn-ghost" data-action="export-csv" data-id="' + s.id + '">CSV</button>' +
      (s.source !== 'official' && isMine(s) ? '<button class="btn btn-sm btn-ghost" data-action="edit-set" data-id="' + s.id + '">编辑</button>' : '') +
      (s.source !== 'official' && isMine(s) ? '<button class="btn btn-sm btn-ghost" data-action="append-set" data-id="' + s.id + '">追加</button>' : '') +
      (s.source !== 'official' ? '<button class="btn btn-sm btn-danger" data-action="delete-set" data-id="' + s.id + '">删除</button>' : '') +
    '</div>' +
  '</div>';
}

/* ============================================================
   题库广场（云端：服务端搜索分页；本地：客户端过滤分页）
   ============================================================ */
async function libraryQuery() {
  const kw = libraryState.keyword.trim();
  if (typeof ServerAPI !== 'undefined' && ServerAPI.online) {
    const data = await ServerAPI.search({
      search: kw, cat: libraryState.cat, sort: libraryState.sort,
      page: libraryState.page, size: PAGE_SIZE
    });
    return data;
  }
  const all = publicSets().filter(s => {
    const hitKw = !kw || (s.title + ' ' + (s.desc || '') + ' ' + (s.tags || []).join(' ') + ' ' + s.category).toLowerCase().includes(kw.toLowerCase());
    const hitCat = libraryState.cat === '全部' || s.category === libraryState.cat;
    return hitKw && hitCat;
  });
  if (libraryState.sort === 'count') all.sort((a, b) => qCount(b) - qCount(a));
  const total = all.length;
  const start = (libraryState.page - 1) * PAGE_SIZE;
  return { total, page: libraryState.page, size: PAGE_SIZE, sets: all.slice(start, start + PAGE_SIZE) };
}

async function renderLibrary() {
  const view = $('#view');
  view.innerHTML = '<div class="loading">正在加载题库…</div>';
  let data;
  try { data = await libraryQuery(); }
  catch (e) { data = { total: 0, page: 1, size: PAGE_SIZE, sets: [] }; toast('加载题库失败：' + e.message, 'err'); }

  const { total, page, size, sets } = data;
  const pages = Math.max(1, Math.ceil(total / size));
  const catChips = ['全部', ...CATEGORIES].map(c =>
    '<button class="cat-chip' + (c === libraryState.cat ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>').join('');
  const sortSel = '<select id="lib-sort" class="sort-select">' +
    ['new|最新', 'count|题量最多', 'hot|最热门'].map(([v, l]) => '<option value="' + v + '"' + (v === libraryState.sort ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  const pager = total > size
    ? '<div class="pager"><button class="btn btn-sm btn-ghost" data-action="page-prev" ' + (page <= 1 ? 'disabled' : '') + '>← 上一页</button>' +
      '<span class="pager-info">第 ' + page + ' / ' + pages + ' 页 · 共 ' + total + ' 套</span>' +
      '<button class="btn btn-sm btn-ghost" data-action="page-next" ' + (page >= pages ? 'disabled' : '') + '>下一页 →</button></div>'
    : '';

  const online = typeof ServerAPI !== 'undefined' && ServerAPI.online;
  view.innerHTML = '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>题库广场</h2>' +
    '<div class="section-sub">公共主题库 —— 官方精选 + 社区共享' + (online ? '（云端实时同步）' : '（本地模式）') + '。</div></div>' +
    '<span class="chip chip-src">' + total + ' 套题库</span></div>' +
    '<div class="toolbar">' +
      '<div class="search-box"><input id="lib-search" type="search" placeholder="搜索题库、标签、分类…" value="' + esc(libraryState.keyword) + '"></div>' +
      sortSel +
    '</div>' +
    '<div class="cat-chips" style="margin-bottom:18px">' + catChips + '</div>' +
    (sets.length
      ? '<div class="grid-cards">' + sets.map((s, i) => setCard(s, i)).join('') + '</div>' + pager
      : emptyState('🔍', '没有找到匹配的题库', '换个关键词或分类试试，也可以上传一份新的题库。',
          '<a class="btn btn-primary btn-sm" href="#/upload">上传题库</a>')) +
    '<div class="section-head"><div><h2>共享说明</h2></div></div>' +
    '<div class="format-card" style="max-width:100%">' +
      (online
        ? '当前为<strong>云端共享模式</strong>：公共主题库由服务器统一维护，任何访问者上传的题库都会实时合并到这里；' +
          '<strong>不同意共享</strong>的题库仍只存在你自己设备上的私库。'
        : '你上传的题库一旦<strong>同意共享</strong>，就会按主题合并进这里（当前为本地模式）；' +
          '<strong>不同意共享</strong>的题库会进入「我的题库 · 私库」。运行 <code>node server/server.js</code> 开启多用户共享。') +
    '</div>';
  bindLibraryInputs();
}

function bindLibraryInputs() {
  const input = $('#lib-search');
  if (input) {
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { libraryState.keyword = input.value; libraryState.page = 1; render(); }, 300);
    });
  }
  const sort = $('#lib-sort');
  if (sort) sort.addEventListener('change', () => { libraryState.sort = sort.value; libraryState.page = 1; render(); });
}

/* ============================================================
   我的题库 / 错题本 / 收藏
   ============================================================ */
function renderMine() {
  const priv = privateSets();
  const mine = publicSets().filter(isMine);

  const privSection = '<div class="section-head"><div><h2>我的私库</h2><div class="section-sub">仅你自己可见，来源于「不同意共享」的上传。</div></div></div>' +
    (priv.length ? priv.map(setRow).join('')
      : emptyState('🗂️', '私库还是空的', '上传题库时选择「不同意，建立我的私库」，题目就存在这里。', '<a class="btn btn-primary btn-sm" href="#/upload">去上传</a>'));

  const mineSection = '<div class="section-head"><div><h2>我的贡献</h2><div class="section-sub">你同意共享、已合并进公共主题库的题库，可编辑描述或追加题目。</div></div></div>' +
    (mine.length ? mine.map(setRow).join('')
      : emptyState('📤', '还没有贡献过', '上传时选择「同意共享」，你的题库就会帮助到有同样需求的人。', '<a class="btn btn-primary btn-sm" href="#/upload">去贡献</a>'));

  return '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>我的题库</h2>' +
    '<div class="section-sub">私库自己用，贡献大家一起用。可导出 JSON / CSV 随时带走。</div></div>' +
    '<a class="btn btn-primary" href="#/upload">＋ 上传新题库</a></div>' +
    privSection +
    '<div style="height:22px"></div>' +
    mineSection;
}

async function renderWrong() {
  const view = $('#view');
  const wrong = Store.get(KEY_WRONG, []);
  if (wrong.length === 0) {
    view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>错题本</h2>' +
      '<div class="section-sub">刷题时标记为「不认识」或答错的题会自动收进来。</div></div></div>' +
      emptyState('✅', '错题本是空的', '去刷一套题，答错的题目会出现在这里，直到你重新掌握。', '<a class="btn btn-primary btn-sm" href="#/library">去刷题</a>');
    return;
  }
  view.innerHTML = '<div class="loading">正在加载错题…</div>';

  const bySet = {};
  wrong.forEach(w => { (bySet[w.setId] = bySet[w.setId] || []).push(w); });
  const ids = Object.keys(bySet);
  const loaded = {};
  await Promise.all(ids.map(async id => {
    try { loaded[id] = await ensureSet(id); } catch (e) { loaded[id] = null; }
  }));

  const groups = ids.map(setId => {
    const set = loaded[setId];
    if (!set) return '';
    const items = bySet[setId].sort((a, b) => b.count - a.count || b.at - a.at);
    const rows = items.map(w => {
      const q = (set.questions || [])[w.qIndex];
      if (!q) return '';
      const urgent = w.count >= 3;
      return '<div class="list-row">' +
        '<div class="row-main">' +
          '<div class="row-title" style="font-size:14px">' + esc(trunc(q.q, 60)) + '</div>' +
          '<div class="row-sub">答错 <b>' + w.count + '</b> 次 · 最近 ' + relTime(w.at) +
          (q.options && q.options.length >= 2 ? ' · 选择题' : ' · 简答') + '</div>' +
        '</div>' +
        (urgent ? '<span class="stamp" style="transform:none">加急</span>' : '') +
        '<div class="row-actions">' +
          '<button class="btn btn-sm btn-ghost" data-action="wrong-preview" data-id="' + setId + '" data-idx="' + w.qIndex + '">答案</button>' +
          '<button class="btn btn-sm btn-ink" data-action="wrong-learned" data-id="' + setId + '" data-idx="' + w.qIndex + '">已掌握</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="section-head" style="margin-top:8px"><div><h2 style="font-size:20px">' + esc(set.title) + '</h2>' +
      '<div class="section-sub">' + items.length + ' 题未掌握（答错 ≥3 次标「加急」）</div></div>' +
      '<button class="btn btn-sm btn-primary" data-action="wrong-quiz" data-id="' + setId + '">专项重刷</button></div>' + rows;
  }).join('');

  view.innerHTML = '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>错题本</h2>' +
    '<div class="section-sub">按答错次数排序，优先复习「加急」题目。</div></div>' +
    '<button class="btn btn-sm btn-danger" data-action="clear-wrong">清空错题本</button></div>' +
    groups;
}

async function renderFav() {
  const view = $('#view');
  const favs = Store.get(KEY_FAV, []);
  if (favs.length === 0) {
    view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>我的收藏</h2>' +
      '<div class="section-sub">刷题时按 F 或点星标收藏的题目都在这里。</div></div></div>' +
      emptyState('⭐', '还没有收藏题目', '刷题时给想回看的题目点个星标。', '<a class="btn btn-primary btn-sm" href="#/library">去刷题</a>');
    return;
  }
  view.innerHTML = '<div class="loading">正在加载收藏…</div>';
  const bySet = {};
  favs.forEach(f => { (bySet[f.setId] = bySet[f.setId] || []).push(f); });
  const loaded = {};
  await Promise.all(Object.keys(bySet).map(async id => {
    try { loaded[id] = await ensureSet(id); } catch (e) { loaded[id] = null; }
  }));

  const groups = Object.entries(bySet).map(([setId, items]) => {
    const set = loaded[setId];
    if (!set) return '';
    items.sort((a, b) => b.at - a.at);
    const rows = items.map(f => {
      const q = (set.questions || [])[f.qIndex];
      if (!q) return '';
      return '<div class="list-row">' +
        '<div class="row-main"><div class="row-title" style="font-size:14px">' + esc(trunc(q.q, 60)) + '</div>' +
        '<div class="row-sub">收藏于 ' + relTime(f.at) + '</div></div>' +
        '<div class="row-actions">' +
          '<button class="btn btn-sm btn-ghost" data-action="preview-question" data-id="' + setId + '" data-idx="' + f.qIndex + '">答案</button>' +
          '<button class="btn btn-sm btn-danger" data-action="unfav" data-id="' + setId + '" data-idx="' + f.qIndex + '">取消收藏</button>' +
        '</div></div>';
    }).join('');
    return '<div class="section-head" style="margin-top:8px"><div><h2 style="font-size:20px">' + esc(set.title) + '</h2></div>' +
      '<button class="btn btn-sm btn-primary" data-action="start-quiz" data-id="' + setId + '">去刷这套</button></div>' + rows;
  }).join('');

  view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>我的收藏</h2>' +
    '<div class="section-sub">共 ' + favs.length + ' 题。</div></div></div>' + groups;
}

/* ============================================================
   上传 / 追加
   ============================================================ */
function renderUpload() {
  const stepsHtml = (n) => {
    const steps = [
      { t: '选择文件', s: n > 1 ? 'done' : 'active' },
      { t: '核对解析', s: n > 2 ? 'done' : (n === 2 ? 'active' : '') },
      { t: uploadState && uploadState.appendSetId ? '确认追加' : '共享确认', s: n === 3 ? 'active' : '' }
    ];
    return '<div class="steps">' + steps.map((st, i) =>
      '<span class="step ' + st.s + '"><span class="step-num">' + (st.s === 'done' ? '✓' : '0' + (i + 1)) + '</span>' + st.t + '</span>'
    ).join('') + '</div>';
  };

  // 第一步（选择文件）：新建上传 或 追加流程未选文件时都走这里
  if (!uploadState || (uploadState.appendSetId && !uploadState.parsed)) {
    const appendBanner = uploadState && uploadState.appendSetId
      ? '<div class="upload-banner" style="border-color:var(--blue);background:var(--blue-bg)"><span class="b-icon">➕</span><div>' +
        '正在<strong>追加题目</strong>到「' + esc(uploadState.appendTitle) + '」（现有 ' + uploadState.appendCount + ' 题）。选择一个题库文档，解析后确认追加即可。' +
        '</div></div>'
      : '';
    return '' +
      '<div class="section-head" style="margin-top:6px"><div><h2>上传题库</h2>' +
      '<div class="section-sub">支持 JSON / TXT / Markdown / CSV / TSV / PDF / Word(.docx)；文本 ≤2MB，PDF·Word ≤20MB。</div></div></div>' +
      '<div class="upload-banner"><span class="b-icon">📢</span><div>' +
      '<strong>上传前请注意：</strong>所有上传都会先经过「共享确认」——你可以选择把题库<strong>合并到公共主题库</strong>供其他有同样需求的人使用，' +
      '也可以<strong>不同意并建立自己的私库</strong>。</div></div>' +
      stepsHtml(1) + appendBanner +
      '<div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="选择题库文件">' +
        '<span class="dz-icon">📄</span><h3>把题库文档拖到这里</h3><p>或者点击选择文件</p>' +
        '<p class="dz-formats">.json&nbsp;&nbsp;.txt&nbsp;&nbsp;.md&nbsp;&nbsp;.csv&nbsp;&nbsp;.tsv&nbsp;&nbsp;.pdf&nbsp;&nbsp;.docx</p>' +
        '<input type="file" id="file-input" accept=".json,.txt,.md,.markdown,.csv,.tsv,.pdf,.docx" hidden>' +
      '</div>' +
      '<div class="format-help">' +
        '<div class="format-card"><b>JSON</b><br><code>{"questions":[{"q":"题目","options":["A","B"],"answer":"A","explanation":"解析"}]}</code> 或纯数组</div>' +
        '<div class="format-card"><b>TXT / Markdown</b><br>编号 + 选项行 + <code>答案：</code> / <code>解析：</code>；问答型可 <code>题目|答案</code> 或奇偶行配对</div>' +
        '<div class="format-card"><b>CSV / TSV</b><br>表头 <code>题目,答案,选项,解析</code>（选项用 | 分隔），无表头按此列序</div>' +
        '<div class="format-card"><b>PDF / Word(.docx)</b><br>自动提取文字后按文本解析（需联网加载解析库）；扫描版 PDF 无法识别文字</div>' +
      '</div>' +
      '<div style="margin-top:22px;text-align:center">' +
        '<a class="btn btn-ghost btn-sm" href="examples/示例题库-计算机.txt" download>下载 TXT 示例</a>' +
        '&nbsp;&nbsp;<a class="btn btn-ghost btn-sm" href="examples/示例题库-前端.json" download>下载 JSON 示例</a>' +
      '</div>';
  }

  const p = uploadState.parsed;
  const samples = p.questions.slice(0, 3);
  const warnHtml = p.warnings.length
    ? '<ul class="warn-list">' + p.warnings.slice(0, 5).map(w => '<li>⚠ ' + esc(w) + '</li>').join('') +
      (p.warnings.length > 5 ? '<li style="color:var(--ink-2)">… 另有 ' + (p.warnings.length - 5) + ' 条提示已折叠</li>' : '') + '</ul>'
    : '';
  const appendBanner = uploadState.appendSetId
    ? '<div class="upload-banner" style="border-color:var(--blue);background:var(--blue-bg)"><span class="b-icon">➕</span><div>' +
      '正在<strong>追加题目</strong>到「' + esc(uploadState.appendTitle) + '」（现有 ' + uploadState.appendCount + ' 题）。解析出的题目将追加到末尾，不重新生成共享确认。' +
      '</div></div>'
    : '';

  return '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>上传题库</h2>' +
    '<div class="section-sub">已解析：' + esc(uploadState.name) + '</div></div>' +
    '<button class="btn btn-ghost btn-sm" data-action="upload-reset">重新选择</button></div>' +
    stepsHtml(2) + appendBanner +
    '<div class="parse-panel">' +
      '<div class="panel-card">' +
        '<h3><span class="p-num">PARSED</span>解析结果</h3>' +
        '<div class="parse-summary">' +
          '<div class="sum"><b>' + p.questions.length + '</b><span>识别题目</span></div>' +
          '<div class="sum"><b>' + (p.skipped || 0) + '</b><span>截断/跳过</span></div>' +
          '<div class="sum"><b>' + p.format + '</b><span>格式</span></div>' +
        '</div>' + warnHtml +
        samples.map((q, i) =>
          '<div class="sample-q"><span class="sq-num">SAMPLE ' + (i + 1) + '</span>' +
          '<div class="sq-q">' + esc(q.q) + '</div>' +
          (q.options.length ? '<div class="sq-a" style="color:var(--ink-2)">' + esc(q.options.join('  /  ')) + '</div>' : '') +
          '<div class="sq-a">答案：' + esc(trunc(q.answer || '（未检测到）', 40)) + '</div></div>'
        ).join('') +
        (p.questions.length > 3 ? '<div style="font-size:12px;color:var(--ink-3)">… 其余 ' + (p.questions.length - 3) + ' 题已解析</div>' : '') +
      '</div>' +
      '<div>' +
        '<div class="panel-card">' +
          '<h3><span class="p-num">META</span>题库信息</h3>' +
          '<div class="form-grid">' +
            '<div class="field"><label for="f-title">题库标题 *</label>' +
            '<input id="f-title" maxlength="40" value="' + esc(uploadState.title) + '"></div>' +
            '<div class="field"><label for="f-cat">分类</label>' +
            '<select id="f-cat">' + CATEGORIES.map(c => '<option' + (c === uploadState.cat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
            '<div class="field"><label for="f-tags">标签（逗号分隔）</label>' +
            '<input id="f-tags" placeholder="如：考试, 高频" value="' + esc(uploadState.tags) + '"></div>' +
            '<div class="field"><label for="f-desc">描述（可选）</label>' +
            '<textarea id="f-desc" maxlength="120" placeholder="这套题覆盖什么范围？">' + esc(uploadState.desc) + '</textarea></div>' +
          '</div>' +
        '</div>' +
        (uploadState.appendSetId
          ? '<div class="consent-box" style="border-color:var(--blue);background:var(--blue-bg)"><div class="c-head" style="color:var(--blue)"><span>➕</span> 确认追加</div>' +
            '<p class="c-body">将 <b>' + p.questions.length + '</b> 题追加到「' + esc(uploadState.appendTitle) + '」末尾。</p>' +
            '<div class="consent-actions">' +
              '<button class="btn btn-primary" data-action="confirm-append">确认追加</button>' +
              '<button class="btn btn-ghost" data-action="upload-reset">取消</button>' +
            '</div></div>'
          : '<div class="consent-box" id="consent-box"><div class="c-head"><span>⚠</span> 共享协议 · 请确认</div>' +
            '<p class="c-body">你即将上传的题库「<b>' + esc(uploadState.title) + '</b>」（共 <b>' + p.questions.length + '</b> 题）将<strong>合并到「公共主题库」</strong>，' +
            '其他有同样需求的人可以看到并使用它刷题。</p>' +
            '<p class="c-body" style="margin-bottom:0">请选择如何处理这份题库：</p>' +
            '<div class="consent-actions">' +
              '<button class="btn btn-primary" data-action="confirm-public">同意共享 · 合并至公共主题库</button>' +
              '<button class="btn btn-ghost" data-action="confirm-private">不同意 · 建立我的私库</button>' +
            '</div>' +
            '<p class="c-note">公共题库可在「题库广场」被任何人浏览和刷题；私库仅保存在本机浏览器。贡献到公共库后，删除不影响其他用户的刷题记录。</p></div>') +
      '</div>' +
    '</div>';
}

function bindUpload() {
  const dz = $('#dropzone');
  if (!dz) return;
  const input = $('#file-input');
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { if (input.files[0]) handleUploadFile(input.files[0]); });
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleUploadFile(f);
  });
}

const CDN_PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const CDN_JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

async function extractPDF(file) {
  await loadScript(CDN_PDFJS);
  const buf = await file.arrayBuffer();
  pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_PDFJS.replace('pdf.min.js', 'pdf.worker.min.js');
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
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

async function extractDocx(file) {
  await loadScript(CDN_JSZIP);
  const buf = await file.arrayBuffer();
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

function handleUploadFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const textExt = /^(json|txt|md|markdown|csv|tsv)$/i.test(ext);
  const docExt = /^(pdf|docx)$/i.test(ext);
  if (!textExt && !docExt) { toast('不支持的文件类型：' + file.name, 'err'); return; }
  const limit = textExt ? 2 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > limit) { toast('文件超过大小限制（文本 2MB / PDF·Word 20MB）', 'err'); return; }

  const done = (text, formatLabel) => {
    try {
      const res = PARSER.parseQuestionBank(file.name.replace(/\.[^.]+$/, '') + '.txt', text);
      res.format = formatLabel || res.format;
      if (res.questions.length === 0) { toast('未能解析出题目，请参考格式说明', 'err'); return; }
      uploadState = {
        name: file.name,
        parsed: res,
        title: res.title || file.name.replace(/\.[^.]+$/, ''),
        cat: '其他',
        tags: '',
        desc: '',
        appendSetId: uploadState && uploadState.appendSetId ? uploadState.appendSetId : null,
        appendTitle: uploadState && uploadState.appendTitle || '',
        appendCount: uploadState && uploadState.appendCount || 0
      };
      render();
    } catch (e) { toast(e.message || '解析失败', 'err'); }
  };

  if (textExt) {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result), null);
    reader.onerror = () => toast('读取文件失败', 'err');
    reader.readAsText(file, 'utf-8');
    return;
  }
  toast('正在解析 ' + (ext === 'pdf' ? 'PDF' : 'Word') + '，首次使用需联网加载解析库…');
  const task = ext === 'pdf' ? extractPDF(file) : extractDocx(file);
  task.then(text => done(text, ext === 'pdf' ? 'PDF 文本提取' : 'Word 文本提取'))
      .catch(err => toast(err.message || '解析 ' + ext + ' 失败', 'err'));
}

async function submitUpload(shared) {
  if (!uploadState) return;
  const p = uploadState.parsed;
  const title = ($('#f-title') ? $('#f-title').value : uploadState.title).trim() || uploadState.title;
  const cat = $('#f-cat') ? $('#f-cat').value : '其他';
  const tags = ($('#f-tags') ? $('#f-tags').value : '').split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  const desc = ($('#f-desc') ? $('#f-desc').value : '').trim();

  if (shared && typeof ServerAPI !== 'undefined' && ServerAPI.online) {
    try {
      await ServerAPI.create({ title, desc, category: cat, tags, questions: p.questions });
      toast('已合并进公共主题库（云端），感谢分享 ✒️');
      uploadState = null;
      location.hash = '#/library';
    } catch (err) {
      toast('云端同步失败：' + (err.message || '未知错误') + '，可稍后重试或存入私库', 'err');
    }
    return;
  }

  const set = {
    id: uid(), title, desc, category: cat, tags,
    source: shared ? 'public' : 'private', owner: '我',
    createdAt: Date.now(), questions: p.questions
  };
  if (shared) Store.set(KEY_PUBLIC, [set, ...publicSets()]);
  else Store.set(KEY_PRIVATE, [set, ...privateSets()]);
  toast(shared ? '已合并进公共主题库（本地），感谢分享 ✒️' : '已存入你的私库');
  uploadState = null;
  location.hash = shared ? '#/library' : '#/mine';
}

async function submitAppend() {
  if (!uploadState || !uploadState.appendSetId) return;
  const p = uploadState.parsed;
  const setId = uploadState.appendSetId;
  try {
    const set = findSet(setId);
    const isServerSet = typeof ServerAPI !== 'undefined' && ServerAPI.online && set && set.source === 'public';
    if (isServerSet) {
      const r = await ServerAPI.appendQuestions(setId, p.questions);
      toast('已追加 ' + r.added + ' 题，共 ' + r.total + ' 题');
    } else {
      // 本地追加：基于同一次读取的数组操作并写回（避免 JSON.parse 新对象导致写入丢失）
      const key = set && set.source === 'public' ? KEY_PUBLIC : KEY_PRIVATE;
      const list = Store.get(key, []);
      const target = list.find(x => x.id === setId);
      if (!target) throw new Error('题库不存在');
      const start = target.questions.length;
      target.questions.push(...p.questions.map((q, i) => Object.assign({}, q, { id: setId + '_q' + (start + i) })));
      Store.set(key, list);
      toast('已追加 ' + p.questions.length + ' 题，共 ' + target.questions.length + ' 题');
    }
    uploadState = null;
    location.hash = '#/mine';
  } catch (err) {
    toast('追加失败：' + err.message, 'err');
  }
}

/* ============================================================
   预览 / 导出 / 编辑
   ============================================================ */
function previewModal(set) {
  const qs = set.questions || [];
  const list = qs.map((q, i) =>
    '<div class="preview-q">' +
      '<div class="pq-q">' + (i + 1) + '. ' + esc(q.q) + '</div>' +
      (q.options && q.options.length ? '<div class="pq-opts">' + esc(q.options.map((o, j) => 'ABCDEFGH'[j] + '. ' + o).join('　')) + '</div>' : '') +
      '<details><summary>查看答案</summary>' +
        '<div class="pq-ans"><b>答案：</b>' + esc(q.answer || '无') +
        (q.explanation ? '<br><b>解析：</b>' + esc(q.explanation) : '') + '</div>' +
      '</details>' +
    '</div>').join('');
  openModal(
    '<div class="modal-head"><h3>' + esc(set.title) + '</h3>' +
    '<button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body">' +
      '<p style="margin:0 0 10px;font-size:13px;color:var(--ink-2)">' +
      '<span class="chip ' + srcChipClass(set) + '" style="margin-right:6px">' + srcLabel(set) + '</span>' +
      '<span class="chip chip-cat">' + esc(set.category) + '</span>' +
      '<span style="margin-left:8px;font-family:var(--font-mono)">' + qs.length + ' 题</span></p>' +
      (set.desc ? '<p style="margin:0 0 10px;font-size:13.5px">' + esc(set.desc) + '</p>' : '') +
      '<div class="rule" style="margin:0 0 8px"></div>' + list +
    '</div>' +
    '<div class="modal-actions"><button class="btn btn-primary" data-close-modal data-start="' + set.id + '">开始刷题</button>' +
    '<button class="btn btn-ghost" data-close-modal>关闭</button></div>'
  );
}

function questionAnswerModal(set, q) {
  openModal(
    '<div class="modal-head"><h3>' + esc(trunc(q.q, 26)) + '</h3>' +
    '<button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body"><p class="m-line"><b>答案：</b>' + esc(q.answer || '无') + '</p>' +
    (q.explanation ? '<p class="m-line"><b>解析：</b>' + esc(q.explanation) + '</p>' : '') +
    (q.options && q.options.length ? '<p class="m-note">选项：' + esc(q.options.join(' / ')) + '</p>' : '') +
    '</div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>关闭</button></div>'
  );
}

function exportSet(set, asCsv) {
  const qs = set.questions || [];
  let content, name, mime;
  if (asCsv) {
    const rows = [['题目', '答案', '选项', '解析']];
    qs.forEach(q => rows.push([q.q, q.answer, (q.options || []).join('|'), q.explanation]));
    content = rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    name = set.title + '.csv';
    mime = 'text/csv;charset=utf-8';
  } else {
    content = JSON.stringify({ title: set.title, desc: set.desc, category: set.category, tags: set.tags, questions: qs }, null, 2);
    name = set.title + '.json';
    mime = 'application/json;charset=utf-8';
  }
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('已导出 ' + name);
}

function editModal(set) {
  const overlay = openModal(
    '<div class="modal-head"><h3>编辑题库信息</h3>' +
    '<button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body"><div class="form-grid">' +
      '<div class="field"><label for="e-title">标题 *</label><input id="e-title" maxlength="40" value="' + esc(set.title) + '"></div>' +
      '<div class="field"><label for="e-cat">分类</label><select id="e-cat">' + CATEGORIES.map(c => '<option' + (c === set.category ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
      '<div class="field"><label for="e-tags">标签（逗号分隔）</label><input id="e-tags" value="' + esc((set.tags || []).join(',')) + '"></div>' +
      '<div class="field"><label for="e-desc">描述</label><textarea id="e-desc" maxlength="120">' + esc(set.desc || '') + '</textarea></div>' +
    '</div></div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>取消</button>' +
    '<button class="btn btn-primary" data-edit-ok>保存</button></div>'
  );
  overlay.addEventListener('click', async e => {
    const t = e.target.closest('[data-edit-ok]');
    if (!t) return;
    const title = $('#e-title').value.trim();
    if (!title) { toast('标题不能为空', 'err'); return; }
    const fields = {
      title,
      category: $('#e-cat').value,
      tags: $('#e-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5),
      desc: $('#e-desc').value.trim()
    };
    try {
      if (typeof ServerAPI !== 'undefined' && ServerAPI.online) await ServerAPI.patch(set.id, fields);
      else {
        // 本地编辑：写回对应存储
        const key = set.source === 'public' ? KEY_PUBLIC : KEY_PRIVATE;
        const list = Store.get(key, []);
        const target = list.find(x => x.id === set.id);
        if (target) Object.assign(target, fields);
        Store.set(key, list);
      }
      closeModal();
      toast('已保存');
      render();
    } catch (err) { toast('保存失败：' + err.message, 'err'); }
  });
}

/* ============================================================
   刷题引擎
   ============================================================ */
async function renderQuizView(setId, mode) {
  const view = $('#view');
  view.innerHTML = '<div class="loading">正在加载题库…</div>';
  let set;
  try { set = await ensureSet(setId); } catch (e) { set = null; }
  if (!set || !set.questions || set.questions.length === 0) {
    toast('题库不存在或为空', 'err');
    location.hash = '#/library';
    return;
  }

  // 进行中的会话：继续
  if (session && session.set.id === setId && !session.done) { renderQuiz(); return; }

  const total = set.questions.length;

  // 专项重刷
  if (mode === 'wrong') {
    const wrongIdx = Store.get(KEY_WRONG, []).filter(w => w.setId === setId).map(w => w.qIndex);
    if (wrongIdx.length === 0) { toast('没有待复习的错题', 'err'); location.hash = '#/wrong'; return; }
    session = { set, order: shuffle(wrongIdx), pos: 0, correct: 0, answered: 0, wrongIdx: [], mode: 'wrong', done: false, qid: [] };
    renderQuiz();
    return;
  }

  // 模式选择页
  view.innerHTML = '' +
    '<div class="quiz-wrap">' +
      '<div class="quiz-head"><div class="qh-title"><h2>' + esc(set.title) + '</h2>' +
      '<div class="qh-sub">' + total + ' 题 · ' + srcLabel(set) + '</div></div>' +
      '<a class="btn btn-ghost btn-sm" href="#/library">返回</a></div>' +
      '<div class="mode-panel">' +
        '<div class="mode-head">选择刷题模式</div>' +
        '<div class="mode-grid">' +
          '<button class="mode-card" data-action="start-mode" data-mode="order" data-id="' + setId + '"><span class="mode-icon">➡️</span><b>顺序刷</b><p>按题目顺序一题一题过</p></button>' +
          '<button class="mode-card" data-action="start-mode" data-mode="random" data-id="' + setId + '"><span class="mode-icon">🎲</span><b>随机刷</b><p>打乱顺序，全部题目</p></button>' +
          '<button class="mode-card" data-action="start-mode" data-mode="daily" data-id="' + setId + '"><span class="mode-icon">📅</span><b>每日一练</b><p>随机抽 ' + Math.min(10, total) + ' 题热身</p></button>' +
        '</div>' +
        (session && session.set.id === setId ? '<button class="btn btn-primary btn-block" data-action="resume-quiz" data-id="' + setId + '">继续上次未完成的刷题</button>' : '') +
      '</div>' +
    '</div>';
}

function startSessionMode(set, mode) {
  const total = set.questions.length;
  let order;
  if (mode === 'order') order = set.questions.map((_, i) => i);
  else if (mode === 'daily') order = shuffle(set.questions.map((_, i) => i)).slice(0, Math.min(10, total));
  else order = shuffle(set.questions.map((_, i) => i));
  session = { set, order, pos: 0, correct: 0, answered: 0, wrongIdx: [], mode, done: false };
  renderQuiz();
}

function renderQuiz() {
  const view = $('#view');
  const s = session;
  const total = s.order.length;
  const modeLabel = s.mode === 'wrong' ? '错题专项' : s.mode === 'daily' ? '每日一练' : s.mode === 'order' ? '顺序刷' : '随机刷';

  view.innerHTML = '' +
    '<div class="quiz-wrap">' +
      '<div class="quiz-head">' +
        '<div class="qh-title"><h2>' + esc(s.set.title) + '</h2>' +
        '<div class="qh-sub">' + modeLabel + (s.mode === 'wrong' ? ' · 答对自动移出错题本' : ' · 快捷键：A-D 选答案 / 空格看答案 / 回车下一题 / F 收藏 / Esc 退出') + '</div></div>' +
        '<button class="btn btn-ghost btn-sm" data-action="quiz-quit">退出</button>' +
      '</div>' +
      '<div class="quiz-progress">' +
        '<div class="bar"><i style="width:' + (s.pos / total * 100) + '%"></i></div>' +
        '<div class="pq"><small>已答对</small> ' + s.correct + ' <small>/</small> ' + total + '</div>' +
      '</div>' +
      '<div id="quiz-body"></div>' +
    '</div>';
  window.scrollTo(0, 0);
  renderQuizBody();
}

function currentQ() {
  const s = session;
  const idx = s.order[s.pos];
  return { idx, q: s.set.questions[idx] };
}

function renderQuizBody() {
  const body = $('#quiz-body');
  const s = session;
  if (!body) return;
  if (s.pos >= s.order.length) { renderQuizResult(); return; }

  const { idx, q } = currentQ();
  const num = s.pos + 1;
  const isChoice = Array.isArray(q.options) && q.options.length >= 2;
  const fav = isFav(s.set.id, idx);

  let optionsHtml = '';
  let actionHtml = '';
  if (isChoice) {
    optionsHtml = '<div class="q-options">' + q.options.map((o, i) =>
      '<button class="q-option" data-action="pick" data-oi="' + i + '" data-idx="' + idx + '">' +
      '<span class="opt-letter">' + 'ABCDEFGH'[i] + '</span><span>' + esc(o) + '</span></button>'
    ).join('') + '</div>';
  } else {
    actionHtml = '<button class="btn btn-primary" data-action="reveal">显示答案 <kbd>空格</kbd></button>';
  }

  body.innerHTML = '' +
    '<div class="q-card">' +
      '<div class="q-card-top">' +
        '<div class="q-tag">' + (isChoice ? '选择题' : '简答 / 填空') + '&nbsp;·&nbsp;' + num + ' / ' + s.order.length + '</div>' +
        '<button class="fav-btn ' + (fav ? 'on' : '') + '" data-action="fav" data-idx="' + idx + '" title="收藏本题 (F)" aria-label="收藏本题">' + (fav ? '★' : '☆') + '</button>' +
      '</div>' +
      '<p class="q-text">' + esc(q.q) + '</p>' +
      optionsHtml +
      '<div id="q-answer-zone"></div>' +
      '<div class="q-actions" id="q-actions">' + actionHtml + '</div>' +
    '</div>';
}

function showAnswerPanel() {
  const { q } = currentQ();
  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  if (!zone || !actions) return;
  zone.innerHTML = '' +
    '<div class="q-answer">' +
      '<div class="ans-label">ANSWER</div>' +
      '<div class="ans-text">' + esc(q.answer || '（本题未提供答案）') + '</div>' +
      (q.explanation ? '<div class="ans-exp">' + esc(q.explanation) + '</div>' : '') +
    '</div>';
  actions.innerHTML = '' +
    '<button class="btn btn-ink" data-action="mark" data-v="1">认识 ✓</button>' +
    '<button class="btn btn-danger" data-action="mark" data-v="0">不认识 ✗</button>';
}

function revealChoice(oi) {
  const s = session;
  const { idx, q } = currentQ();
  if (!q.options || oi >= q.options.length) return;
  const isCorrect = normAnswer(q.options[oi]) === normAnswer(q.answer);
  s.answered++;
  if (isCorrect) s.correct++;
  else { s.wrongIdx.push(idx); recordWrong(s.set.id, idx); }
  recordAnswer(s.set.id, isCorrect);
  if (isCorrect && s.mode === 'wrong') clearWrongItem(s.set.id, idx);
  if (typeof ServerAPI !== 'undefined' && ServerAPI.online) ServerAPI.attempt(s.set.id, q.id, isCorrect);

  $$('.q-option').forEach((el, i) => {
    el.disabled = true;
    if (normAnswer(q.options[i]) === normAnswer(q.answer)) el.classList.add('correct');
    else if (i === oi) el.classList.add('wrong');
    else el.classList.add('missed');
  });

  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  zone.innerHTML = '' +
    '<div class="q-answer">' +
      '<div class="q-feedback ' + (isCorrect ? 'ok' : 'bad') + '">' + (isCorrect ? '✓ 回答正确' : '✗ 回答错误') + '</div>' +
      '<div class="ans-label" style="margin-top:8px">ANSWER</div>' +
      '<div class="ans-text">' + esc(q.answer) + '</div>' +
      (q.explanation ? '<div class="ans-exp">' + esc(q.explanation) + '</div>' : '') +
    '</div>';
  actions.innerHTML = '<button class="btn btn-primary" data-action="next">' +
    (s.pos >= s.order.length - 1 ? '查看成绩 <kbd>回车</kbd>' : '下一题 → <kbd>回车</kbd>') + '</button>';
}

function markKnown(v) {
  const s = session;
  const { idx } = currentQ();
  s.answered++;
  const isCorrect = v === 1;
  if (isCorrect) { s.correct++; if (s.mode === 'wrong') clearWrongItem(s.set.id, idx); }
  else { s.wrongIdx.push(idx); recordWrong(s.set.id, idx); }
  recordAnswer(s.set.id, isCorrect);
  if (typeof ServerAPI !== 'undefined' && ServerAPI.online) ServerAPI.attempt(s.set.id, s.set.questions[idx].id, isCorrect);

  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  if (zone && actions) {
    zone.insertAdjacentHTML('beforeend',
      '<div class="q-feedback ' + (isCorrect ? 'ok' : 'bad') + '" style="margin-top:12px">' +
      (isCorrect ? '✓ 已掌握' : '✗ 已收入错题本') + '</div>');
    actions.innerHTML = '<button class="btn btn-primary" data-action="next">' +
      (s.pos >= s.order.length - 1 ? '查看成绩 <kbd>回车</kbd>' : '下一题 → <kbd>回车</kbd>') + '</button>';
  }
}

function nextQuestion() {
  const s = session;
  s.pos++;
  renderQuizBody();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuizResult() {
  const s = session;
  const total = s.answered;
  const acc = total > 0 ? Math.round(s.correct / total * 100) : 0;
  if (total > 0) recordSession(s.set.id, s.set.title, s.correct, total);
  s.done = true;

  const wrongQs = s.wrongIdx.map(i => s.set.questions[i]).filter(Boolean);
  const wrongHtml = wrongQs.length
    ? '<div class="wrong-list"><h3>错题回顾</h3>' + wrongQs.slice(0, 8).map((q, i) =>
        '<div class="sample-q"><span class="sq-num">WRONG ' + (i + 1) + '</span>' +
        '<div class="sq-q">' + esc(q.q) + '</div>' +
        '<div class="sq-a">答案：' + esc(q.answer || '无') + '</div></div>'
      ).join('') + (wrongQs.length > 8 ? '<div style="font-size:12px;color:var(--ink-3)">… 其余 ' + (wrongQs.length - 8) + ' 题已进错题本</div>' : '') + '</div>'
    : '';

  const body = $('#quiz-body');
  body.innerHTML = '' +
    '<div class="result-hero">' +
      '<p style="margin:0;color:var(--ink-2);font-size:13px">本轮完成 · ' + (s.mode === 'wrong' ? '错题专项' : s.set.title) + '</p>' +
      '<div class="rh-title">' + (total === 0 ? '本轮没有作答' : (acc >= 80 ? '漂亮，继续加油' : acc >= 50 ? '还行，再巩固一下' : '别灰心，错题会帮你')) + '</div>' +
      '<div class="ring" style="background:conic-gradient(var(--blue) ' + acc + '%, var(--paper-2) 0)">' +
        '<div class="ring-inner"><div class="ring-num">' + acc + '%</div><div class="ring-label">正确率</div></div>' +
      '</div>' +
      '<div class="result-stats">' +
        '<div class="rs"><b>' + total + '</b><span>已作答</span></div>' +
        '<div class="rs"><b>' + s.correct + '</b><span>答对</span></div>' +
        '<div class="rs"><b>' + wrongQs.length + '</b><span>答错/不认识</span></div>' +
      '</div>' +
      '<div class="result-actions">' +
        (wrongQs.length ? '<button class="btn btn-danger" data-action="rewrong" data-id="' + s.set.id + '">重刷错题（' + wrongQs.length + '）</button>' : '') +
        '<button class="btn btn-primary" data-action="replay" data-id="' + s.set.id + '">再刷一轮</button>' +
        '<a class="btn btn-ghost" href="#/library">返回题库</a>' +
      '</div>' +
    '</div>' + wrongHtml;
  session = null;
}

/* ============================================================
   空状态
   ============================================================ */
function emptyState(icon, title, sub, actionHtml) {
  return '<div class="empty"><span class="empty-icon">' + icon + '</span>' +
    '<h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p>' + actionHtml + '</div>';
}
