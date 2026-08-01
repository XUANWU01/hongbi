/* ============================================================
   红笔 HONGBI · 应用逻辑：路由 / 视图 / 刷题引擎 / 上传流程
   ============================================================ */
'use strict';

/* ---------- 工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
}

function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 6e4) return '刚刚';
  if (diff < 36e5) return Math.floor(diff / 6e4) + ' 分钟前';
  if (diff < 864e5) return Math.floor(diff / 36e5) + ' 小时前';
  if (diff < 7 * 864e5) return Math.floor(diff / 864e5) + ' 天前';
  return fmtDate(ts);
}

function uid() { return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normAnswer(s) {
  return String(s == null ? '' : s).replace(/^\s*[A-Fa-f][.、)）]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

/* ---------- Toast ---------- */
function toast(msg, type = 'ok', ms = 2600) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'err' ? 'err' : 'ok');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; }, ms - 350);
  setTimeout(() => el.remove(), ms);
}

/* ---------- Modal ---------- */
function openModal(html) {
  const root = $('#modal-root');
  root.innerHTML = '<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
  const overlay = $('.modal-overlay', root);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  return overlay;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function confirmModal({ title, body, okText = '确定', danger = false }) {
  return new Promise(resolve => {
    const overlay = openModal(
      '<div class="modal-head"><h3>' + esc(title) + '</h3>' +
      '<button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
      '<div class="modal-body">' + body + '</div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-cancel>取消</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(okText) + '</button>' +
      '</div>'
    );
    overlay.addEventListener('click', e => {
      const t = e.target.closest('[data-close-modal],[data-cancel],[data-ok]');
      if (!t) return;
      closeModal();
      resolve(t.hasAttribute('data-ok'));
    });
  });
}

/* ---------- 路由 ---------- */
function parseHash() {
  let h = location.hash.replace(/^#\/?/, '');
  if (!h) h = 'home';
  const parts = h.split('/').filter(Boolean);
  return { path: parts[0] || 'home', param: parts[1], param2: parts[2] };
}

/* ---------- 刷题会话 ---------- */
let session = null; // { set, order, pos, correct, answered, wrongIdx, mode }
let uploadState = null; // 上传流程状态

/* ============================================================
   视图渲染
   ============================================================ */
function render() {
  const { path, param, param2 } = parseHash();
  const view = $('#view');
  setActiveNav(path);

  switch (path) {
    case 'home': view.innerHTML = renderHome(); bindHome(); break;
    case 'library': view.innerHTML = renderLibrary(); bindLibrary(); break;
    case 'mine': view.innerHTML = renderMine(); break;
    case 'upload': view.innerHTML = renderUpload(); bindUpload(); break;
    case 'wrong': view.innerHTML = renderWrong(); break;
    case 'quiz': startQuiz(param, param2); return;
    default: view.innerHTML = renderHome(); bindHome(); break;
  }
  window.scrollTo(0, 0);
  refreshWrongBadge();
}

function setActiveNav(path) {
  $$('#mainnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === path));
}

/* ---------- 首页 ---------- */
function renderHome() {
  const stats = Store.get(KEY_STATS, { answered: 0, correct: 0, sessions: [] });
  const wrong = wrongCount();
  const pub = publicSets();
  const priv = privateSets();
  const totalQ = [...pub, ...priv].reduce((n, s) => n + s.questions.length, 0);
  const acc = stats.answered > 0 ? Math.round(stats.correct / stats.answered * 100) : 0;
  const lastSession = stats.sessions[0];
  const recent = stats.sessions.slice(0, 5);

  const seen = Store.get(KEY_SEEN, false);
  const onboard = seen ? '' :
    '<div class="upload-banner" style="margin-top:24px">' +
    '<span class="b-icon">✒️</span><div>' +
    '<strong>欢迎使用红笔</strong> —— 上传题库时，你可以选择把它<strong>合并到「公共主题库」</strong>，供其他有同样需求的人使用；' +
    '或选择<strong>建立自己的私库</strong>，仅自己可见。' +
    '<div style="margin-top:8px"><button class="btn btn-sm btn-ink" data-action="dismiss-seen">知道了</button></div></div></div>';

  return '' +
    '<section class="hero">' +
      '<div>' +
        '<p class="hero-eyebrow">HONGBI · QUIZ WORKBOOK</p>' +
        '<h1>把题目，写进<br><span class="hl">红笔</span>里。</h1>' +
        '<p class="hero-sub">上传你的题库文档，贡献给有同样需求的人，或建立自己的私库。红笔负责记住你的每一个错误，直到你全部掌握。</p>' +
        '<div class="hero-actions">' +
          '<a class="btn btn-primary btn-lg" href="#/upload">✒️ 上传题库</a>' +
          '<a class="btn btn-ghost btn-lg" href="#/library">开始刷题</a>' +
          (wrong > 0 ? '<a class="btn btn-danger btn-lg" href="#/wrong">错题本 · ' + wrong + '</a>' : '') +
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
        statCard('题目总数', totalQ, '公共 + 私库', '') +
        statCard('累计作答', stats.answered, '答对 ' + stats.correct + ' 题', '') +
        statCard('正确率', acc + '%', stats.answered > 0 ? '近 ' + stats.answered + ' 次作答' : '还没有作答记录', '') +
        statCard('错题本', wrong, wrong > 0 ? '待复习' : '干干净净', '') +
      '</div>' +
    '</section>';

  function statCard(label, num, foot, _) {
    return '<div class="stat-card"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-num">' + num + '</div>' +
      '<div class="stat-foot">' + foot + '</div></div>';
  }
}

function bindHome() {
  // 最近动态按钮：继续刷上次的题
  const last = Store.get(KEY_STATS, { sessions: [] }).sessions[0];
  const cont = $('#continue-btn');
  if (cont && last) cont.href = '#/quiz/' + last.setId;
}

/* ---------- 题库广场 ---------- */
let libraryFilter = { keyword: '', cat: '全部' };

function renderLibrary() {
  const all = publicSets();
  const kw = libraryFilter.keyword.trim().toLowerCase();
  const cat = libraryFilter.cat;
  const list = all.filter(s => {
    const hitKw = !kw || (s.title + ' ' + (s.desc || '') + ' ' + (s.tags || []).join(' ') + ' ' + s.category).toLowerCase().includes(kw);
    const hitCat = cat === '全部' || s.category === cat;
    return hitKw && hitCat;
  });

  const catChips = ['全部', ...CATEGORIES].map(c =>
    '<button class="cat-chip' + (c === cat ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>'
  ).join('');

  return '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>题库广场</h2>' +
    '<div class="section-sub">公共主题库 —— 官方精选 + 社区共享。大家把题库合并到这里，有同样需求的人都能刷。</div></div>' +
    '<span class="chip chip-src">' + all.length + ' 套题库 · ' + all.reduce((n, s) => n + s.questions.length, 0) + ' 题</span></div>' +
    '<div class="toolbar">' +
      '<div class="search-box"><input id="lib-search" type="search" placeholder="搜索题库、标签、分类…" value="' + esc(libraryFilter.keyword) + '"></div>' +
    '</div>' +
    '<div class="cat-chips" style="margin-bottom:18px">' + catChips + '</div>' +
    (list.length
      ? '<div class="grid-cards">' + list.map((s, i) => setCard(s, i)).join('') + '</div>'
      : emptyState('🔍', '没有找到匹配的题库', '换个关键词或分类试试，也可以上传一份新的题库。',
          '<a class="btn btn-primary btn-sm" href="#/upload">上传题库</a>')) +
    '<div class="section-head"><div><h2>共享说明</h2></div></div>' +
    '<div class="format-card" style="max-width:100%">' +
      '你上传的题库一旦<strong>同意共享</strong>，就会按主题合并进这里，任何访问本站的人都可以用来刷题；' +
      '<strong>不同意共享</strong>的题库会进入「我的题库 · 私库」，仅你自己可见。' +
    '</div>';
}

function bindLibrary() {
  const input = $('#lib-search');
  if (input) input.addEventListener('input', e => {
    libraryFilter.keyword = e.target.value;
    const view = $('#view');
    view.innerHTML = renderLibrary();
    bindLibrary();
  });
}

/* ---------- 我的题库 ---------- */
function renderMine() {
  const priv = privateSets();
  const mine = publicSets().filter(s => s.owner === '我');

  const privSection = priv.length
    ? '<div class="section-head"><div><h2>我的私库</h2><div class="section-sub">仅你自己可见的题库，来源于「不同意共享」的上传。</div></div></div>' +
      priv.map(setRow).join('')
    : '<div class="section-head"><div><h2>我的私库</h2><div class="section-sub">仅你自己可见的题库，来源于「不同意共享」的上传。</div></div></div>' +
      emptyState('🗂️', '私库还是空的', '上传题库时选择「不同意，建立我的私库」，题目就存在这里。',
        '<a class="btn btn-primary btn-sm" href="#/upload">去上传</a>');

  const mineSection = mine.length
    ? '<div class="section-head"><div><h2>我的贡献</h2><div class="section-sub">你同意共享、已合并进公共主题库的题库。</div></div></div>' + mine.map(setRow).join('')
    : '';

  return '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>我的题库</h2>' +
    '<div class="section-sub">私库自己用，贡献大家一起用。导出 JSON 可随时带走你的题库。</div></div>' +
    '<a class="btn btn-primary" href="#/upload">＋ 上传新题库</a></div>' +
    privSection +
    '<div style="height:18px"></div>' +
    mineSection;
}

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
    '<div class="set-meta"><span>' + s.questions.length + ' 题</span>' +
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
  const sub = s.questions.length + ' 题' + (pct != null ? ' · 已刷 ' + prog.answered + ' · 正确率 ' + pct + '%' : ' · 还没刷过');
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
      '<button class="btn btn-sm btn-ghost" data-action="export" data-id="' + s.id + '">导出</button>' +
      '<button class="btn btn-sm btn-danger" data-action="delete-set" data-id="' + s.id + '">删除</button>' +
    '</div>' +
  '</div>';
}

/* ---------- 错题本 ---------- */
function renderWrong() {
  const wrong = Store.get(KEY_WRONG, []);
  if (wrong.length === 0) {
    return '<div class="section-head" style="margin-top:6px"><div><h2>错题本</h2>' +
      '<div class="section-sub">刷题时标记为「不认识」或答错的题目会自动收进来。</div></div></div>' +
      emptyState('✅', '错题本是空的', '去刷一套题，答错的题目会出现在这里，直到你重新掌握。',
        '<a class="btn btn-primary btn-sm" href="#/library">去刷题</a>');
  }

  const bySet = {};
  wrong.forEach(w => { (bySet[w.setId] = bySet[w.setId] || []).push(w); });
  const sets = allSets();

  const groups = Object.entries(bySet).map(([setId, items]) => {
    const set = sets.find(s => s.id === setId);
    if (!set) return '';
    items.sort((a, b) => b.at - a.at);
    const rows = items.map(w => {
      const q = set.questions[w.qIndex];
      if (!q) return '';
      return '<div class="list-row">' +
        '<div class="row-main">' +
          '<div class="row-title" style="font-size:14px">' + esc(trunc(q.q, 60)) + '</div>' +
          '<div class="row-sub">答错 ' + w.count + ' 次 · 最近 ' + relTime(w.at) +
          (q.type === 'choice' && q.options.length ? ' · ' + q.options.length + ' 个选项' : ' · 简答') + '</div>' +
        '</div>' +
        '<div class="row-actions">' +
          '<button class="btn btn-sm btn-ghost" data-action="wrong-preview" data-id="' + setId + '" data-idx="' + w.qIndex + '">答案</button>' +
          '<button class="btn btn-sm btn-ink" data-action="wrong-learned" data-id="' + setId + '" data-idx="' + w.qIndex + '">已掌握</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<div class="section-head" style="margin-top:8px"><div><h2 style="font-size:20px">' + esc(set.title) + '</h2>' +
      '<div class="section-sub">' + items.length + ' 题未掌握</div></div>' +
      '<button class="btn btn-sm btn-primary" data-action="wrong-quiz" data-id="' + setId + '">专项重刷</button></div>' + rows;
  }).join('');

  return '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>错题本</h2>' +
    '<div class="section-sub">答错的题都在这里，逐个「已掌握」或整套专项重刷。</div></div>' +
    '<button class="btn btn-sm btn-danger" data-action="clear-wrong">清空错题本</button></div>' +
    groups;
}

/* ---------- 上传 ---------- */
function renderUpload() {
  const stepsHtml = (n) => {
    const steps = [
      { t: '选择文件', s: n > 1 ? 'done' : 'active' },
      { t: '核对解析', s: n > 2 ? 'done' : (n === 2 ? 'active' : '') },
      { t: '共享确认', s: n === 3 ? 'active' : '' }
    ];
    return '<div class="steps">' + steps.map(st =>
      '<span class="step ' + st.s + '"><span class="step-num">' + (st.s === 'done' ? '✓' : '0' + (steps.indexOf(st) + 1)) + '</span>' + st.t + '</span>'
    ).join('') + '</div>';
  };

  if (!uploadState) {
    return '' +
      '<div class="section-head" style="margin-top:6px"><div><h2>上传题库</h2>' +
      '<div class="section-sub">支持 JSON / TXT / Markdown / CSV / TSV，文件不超过 2 MB。</div></div></div>' +
      '<div class="upload-banner"><span class="b-icon">📢</span><div>' +
      '<strong>上传前请注意：</strong>所有上传都会先经过「共享确认」——你可以选择把题库<strong>合并到公共主题库</strong>供其他有同样需求的人使用，' +
      '也可以<strong>不同意并建立自己的私库</strong>。' +
      '</div></div>' +
      stepsHtml(1) +
      '<div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="选择题库文件">' +
        '<span class="dz-icon">📄</span>' +
        '<h3>把题库文档拖到这里</h3>' +
        '<p>或者点击选择文件</p>' +
        '<p class="dz-formats">.json&nbsp;&nbsp;.txt&nbsp;&nbsp;.md&nbsp;&nbsp;.csv&nbsp;&nbsp;.tsv</p>' +
        '<input type="file" id="file-input" accept=".json,.txt,.md,.markdown,.csv,.tsv" hidden>' +
      '</div>' +
      '<div class="format-help">' +
        '<div class="format-card"><b>JSON</b><br><code>{"questions":[{"q":"题目","options":["A","B"],"answer":"A","explanation":"解析"}]}</code> 或纯数组</div>' +
        '<div class="format-card"><b>TXT / Markdown</b><br>编号 + 选项行 + <code>答案：</code> / <code>解析：</code>，自动识别；问答型可每行用 <code>题目|答案</code> 或奇偶行配对</div>' +
        '<div class="format-card"><b>CSV / TSV</b><br>表头 <code>题目,答案,选项,解析</code>（选项间用 | 分隔），无表头则按此列序</div>' +
      '</div>' +
      '<div style="margin-top:22px;text-align:center">' +
        '<a class="btn btn-ghost btn-sm" href="examples/示例题库-计算机.txt" download>下载 TXT 示例</a>' +
        '&nbsp;&nbsp;<a class="btn btn-ghost btn-sm" href="examples/示例题库-前端.json" download>下载 JSON 示例</a>' +
      '</div>';
  }

  const p = uploadState.parsed;
  const samples = p.questions.slice(0, 3);
  const warnHtml = p.warnings.length
    ? '<ul class="warn-list">' + p.warnings.map(w => '<li>⚠ ' + esc(w) + '</li>').join('') + '</ul>'
    : '';

  return '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>上传题库</h2>' +
    '<div class="section-sub">已解析：' + esc(uploadState.name) + '</div></div>' +
    '<button class="btn btn-ghost btn-sm" data-action="upload-reset">重新选择</button></div>' +
    stepsHtml(2) +
    '<div class="parse-panel">' +
      '<div class="panel-card">' +
        '<h3><span class="p-num">PARSED</span>解析结果</h3>' +
        '<div class="parse-summary">' +
          '<div class="sum"><b>' + p.questions.length + '</b><span>识别题目</span></div>' +
          '<div class="sum"><b>' + (p.skipped || 0) + '</b><span>截断/跳过</span></div>' +
          '<div class="sum"><b>' + p.format + '</b><span>格式</span></div>' +
        '</div>' +
        warnHtml +
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
        '<div class="consent-box" id="consent-box">' +
          '<div class="c-head"><span>⚠</span> 共享协议 · 请确认</div>' +
          '<p class="c-body">你即将上传的题库「<b>' + esc(uploadState.title) + '</b>」' +
          '（共 <b>' + p.questions.length + '</b> 题）将<strong>合并到「公共主题库」</strong>，' +
          '其他有同样需求的人可以看到并使用它进行刷题，就像官方题库和社区题库一样。</p>' +
          '<p class="c-body" style="margin-bottom:0">请选择如何处理这份题库：</p>' +
          '<div class="consent-actions">' +
            '<button class="btn btn-primary" data-action="confirm-public" id="btn-public">同意共享 · 合并至公共主题库</button>' +
            '<button class="btn btn-ghost" data-action="confirm-private" id="btn-private">不同意 · 建立我的私库</button>' +
          '</div>' +
          '<p class="c-note">公共题库可在「题库广场」被任何人浏览和刷题；私库内容仅保存在本机浏览器中，仅供自己使用。' +
          '贡献到公共库后，删除不会影响其他用户的刷题记录。</p>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function bindUpload() {
  const dz = $('#dropzone');
  if (dz) {
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
}

function handleUploadFile(file) {
  const okExt = /\.(json|txt|md|markdown|csv|tsv)$/i.test(file.name);
  if (!okExt) { toast('不支持的文件类型：' + file.name, 'err'); return; }
  if (file.size > 2 * 1024 * 1024) { toast('文件超过 2 MB，请拆分后上传', 'err'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const res = PARSER.parseQuestionBank(file.name, String(reader.result));
      if (res.questions.length === 0) { toast('未能解析出题目，请参考格式说明', 'err'); return; }
      uploadState = {
        name: file.name,
        parsed: res,
        title: res.title || file.name.replace(/\.[^.]+$/, ''),
        cat: '其他',
        tags: '',
        desc: ''
      };
      render();
    } catch (e) {
      toast(e.message || '解析失败', 'err');
    }
  };
  reader.onerror = () => toast('读取文件失败', 'err');
  reader.readAsText(file, 'utf-8');
}

function submitUpload(shared) {
  if (!uploadState) return;
  const p = uploadState.parsed;
  const title = ($('#f-title') ? $('#f-title').value : uploadState.title).trim() || uploadState.title;
  const cat = $('#f-cat') ? $('#f-cat').value : '其他';
  const tags = ($('#f-tags') ? $('#f-tags').value : '').split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  const desc = ($('#f-desc') ? $('#f-desc').value : '').trim();

  const set = {
    id: uid(),
    title,
    desc,
    category: cat,
    tags,
    source: shared ? 'public' : 'private',
    owner: '我',
    createdAt: Date.now(),
    questions: p.questions
  };

  if (shared) Store.set(KEY_PUBLIC, [set, ...publicSets()]);
  else Store.set(KEY_PRIVATE, [set, ...privateSets()]);

  toast(shared ? '已合并进公共主题库，感谢分享 ✒️' : '已存入你的私库', 'ok');
  uploadState = null;
  location.hash = shared ? '#/library' : '#/mine';
}

/* ---------- 预览 ---------- */
function previewModal(set) {
  const list = set.questions.map((q, i) =>
    '<div class="preview-q">' +
      '<div class="pq-q">' + (i + 1) + '. ' + esc(q.q) + '</div>' +
      (q.options.length ? '<div class="pq-opts">' + esc(q.options.map((o, j) => 'ABCDEFGH'[j] + '. ' + o).join('　')) + '</div>' : '') +
      '<details><summary>查看答案</summary>' +
        '<div class="pq-ans"><b>答案：</b>' + esc(q.answer || '无') +
        (q.explanation ? '<br><b>解析：</b>' + esc(q.explanation) : '') + '</div>' +
      '</details>' +
    '</div>'
  ).join('');

  openModal(
    '<div class="modal-head"><h3>' + esc(set.title) + '</h3>' +
    '<button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body">' +
      '<p style="margin:0 0 10px;font-size:13px;color:var(--ink-2)">' +
      '<span class="chip ' + srcChipClass(set) + '" style="margin-right:6px">' + srcLabel(set) + '</span>' +
      '<span class="chip chip-cat">' + esc(set.category) + '</span>' +
      '<span style="margin-left:8px;font-family:var(--font-mono)">' + set.questions.length + ' 题</span></p>' +
      (set.desc ? '<p style="margin:0 0 10px;font-size:13.5px">' + esc(set.desc) + '</p>' : '') +
      '<div class="rule" style="margin:0 0 8px"></div>' + list +
    '</div>' +
    '<div class="modal-actions"><button class="btn btn-primary" data-close-modal data-start="' + set.id + '">开始刷题</button>' +
    '<button class="btn btn-ghost" data-close-modal>关闭</button></div>'
  );
}

function exportSet(set) {
  const data = {
    title: set.title,
    desc: set.desc,
    category: set.category,
    tags: set.tags,
    questions: set.questions
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = set.title + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('已导出 ' + set.title + '.json');
}

/* ---------- 刷题引擎 ---------- */
function startQuiz(setId, mode) {
  const set = findSet(setId);
  if (!set) { toast('题库不存在或已被删除', 'err'); location.hash = '#/home'; return; }

  let idxList;
  if (mode === 'wrong') {
    idxList = Store.get(KEY_WRONG, []).filter(w => w.setId === setId).map(w => w.qIndex);
    if (idxList.length === 0) { toast('没有待复习的错题', 'err'); location.hash = '#/wrong'; return; }
  } else {
    idxList = set.questions.map((_, i) => i);
  }

  session = {
    set,
    order: shuffle(idxList),
    pos: 0,
    correct: 0,
    answered: 0,
    wrongIdx: [],
    mode: mode === 'wrong' ? 'wrong' : 'all'
  };
  renderQuiz();
}

function renderQuiz() {
  const view = $('#view');
  const s = session;
  const total = s.order.length;

  view.innerHTML = '' +
    '<div class="quiz-wrap">' +
      '<div class="quiz-head">' +
        '<div class="qh-title"><h2>' + esc(s.set.title) + '</h2>' +
        '<div class="qh-sub">' + (s.mode === 'wrong' ? '错题专项 · 答对自动移出错题本' : '顺序随机 · 不会的题会进错题本') + '</div></div>' +
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

  let optionsHtml = '';
  let actionHtml = '';
  if (q.type === 'choice' && q.options.length >= 2) {
    optionsHtml = '<div class="q-options">' + q.options.map((o, i) =>
      '<button class="q-option" data-action="pick" data-oi="' + i + '" data-idx="' + idx + '">' +
      '<span class="opt-letter">' + 'ABCDEFGH'[i] + '</span><span>' + esc(o) + '</span></button>'
    ).join('') + '</div>';
  } else {
    actionHtml = '<button class="btn btn-primary" data-action="reveal">显示答案</button>';
  }

  body.innerHTML = '' +
    '<div class="q-card">' +
      '<div class="q-tag">' + (q.type === 'choice' ? '选择题' : '简答 / 填空') + '&nbsp;·&nbsp;' + num + ' / ' + s.order.length + '</div>' +
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
  s.pos === s.order.length - 1; // noop
  if (isCorrect) s.correct++; else { s.wrongIdx.push(idx); recordWrong(s.set.id, idx); }
  recordAnswer(s.set.id, isCorrect);
  if (isCorrect && s.mode === 'wrong') clearWrongItem(s.set.id, idx);

  const opts = $$('.q-option');
  opts.forEach((el, i) => {
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
    (s.pos >= s.order.length - 1 ? '查看成绩' : '下一题 →') + '</button>';
}

function markKnown(v) {
  const s = session;
  const { idx } = currentQ();
  s.answered++;
  const isCorrect = v === 1;
  if (isCorrect) { s.correct++; if (s.mode === 'wrong') clearWrongItem(s.set.id, idx); }
  else { s.wrongIdx.push(idx); recordWrong(s.set.id, idx); }
  recordAnswer(s.set.id, isCorrect);

  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  if (zone && actions) {
    zone.insertAdjacentHTML('beforeend',
      '<div class="q-feedback ' + (isCorrect ? 'ok' : 'bad') + '" style="margin-top:12px">' +
      (isCorrect ? '✓ 已掌握' : '✗ 已收入错题本') + '</div>');
    actions.innerHTML = '<button class="btn btn-primary" data-action="next">' +
      (s.pos >= s.order.length - 1 ? '查看成绩' : '下一题 →') + '</button>';
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
      '<div class="rh-sub">' + (total === 0 ? '退出得太早了' : '') + '</div>' +
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

/* ---------- 空状态 ---------- */
function emptyState(icon, title, sub, actionHtml) {
  return '<div class="empty"><span class="empty-icon">' + icon + '</span>' +
    '<h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p>' + actionHtml + '</div>';
}

/* ============================================================
   事件委托
   ============================================================ */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-action],[data-close-modal],[data-start],[data-cat]');
  if (!t) return;
  const action = t.dataset.action;

  if (t.hasAttribute('data-close-modal')) { closeModal(); return; }
  if (t.hasAttribute('data-start')) { const id = t.dataset.start; closeModal(); location.hash = '#/quiz/' + id; return; }
  if (t.hasAttribute('data-cat')) { libraryFilter.cat = t.dataset.cat; render(); return; }

  switch (action) {
    case 'dismiss-seen':
      Store.set(KEY_SEEN, true);
      render();
      break;

    case 'start-quiz':
      location.hash = '#/quiz/' + t.dataset.id;
      break;

    case 'wrong-quiz':
      location.hash = '#/quiz/' + t.dataset.id + '/wrong';
      break;

    case 'preview': {
      const set = findSet(t.dataset.id);
      if (set) previewModal(set);
      break;
    }

    case 'wrong-preview': {
      const set = findSet(t.dataset.id);
      if (!set) break;
      const q = set.questions[+t.dataset.idx];
      if (!q) break;
      openModal(
        '<div class="modal-head"><h3>' + esc(trunc(q.q, 26)) + '</h3>' +
        '<button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
        '<div class="modal-body"><p class="m-line"><b>答案：</b>' + esc(q.answer || '无') + '</p>' +
        (q.explanation ? '<p class="m-line"><b>解析：</b>' + esc(q.explanation) + '</p>' : '') +
        (q.options.length ? '<p class="m-note">选项：' + esc(q.options.join(' / ')) + '</p>' : '') +
        '</div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>关闭</button></div>'
      );
      break;
    }

    case 'wrong-learned':
      clearWrongItem(t.dataset.id, +t.dataset.idx);
      toast('已掌握，移出错题本 ✓');
      render();
      break;

    case 'clear-wrong': {
      const ok = await confirmModal({
        title: '清空错题本',
        body: '<p class="m-line">将移除错题本中的全部 ' + wrongCount() + ' 条记录，且无法恢复。</p>',
        okText: '清空',
        danger: true
      });
      if (ok) { clearAllWrong(); render(); toast('错题本已清空'); }
      break;
    }

    case 'export': {
      const set = findSet(t.dataset.id);
      if (set) exportSet(set);
      break;
    }

    case 'delete-set': {
      const set = findSet(t.dataset.id);
      if (!set) break;
      const ok = await confirmModal({
        title: '删除题库',
        body: '<p class="m-line">确定删除「' + esc(set.title) + '」吗？共 ' + set.questions.length + ' 题。' +
          (set.source === 'public' ? '<br><span style="color:var(--red-deep)">它是公共主题库中的共享内容，删除后其他用户将无法继续刷到它。</span>' : '') + '</p>',
        okText: '删除',
        danger: true
      });
      if (ok) {
        if (set.source === 'public') Store.set(KEY_PUBLIC, publicSets().filter(s => s.id !== set.id));
        else Store.set(KEY_PRIVATE, privateSets().filter(s => s.id !== set.id));
        toast('已删除「' + set.title + '」');
        render();
      }
      break;
    }

    case 'upload-reset':
      uploadState = null;
      render();
      break;

    case 'confirm-public':
      submitUpload(true);
      break;

    case 'confirm-private':
      submitUpload(false);
      break;

    case 'pick': {
      const s = session;
      if (!s) break;
      revealChoice(+t.dataset.oi);
      break;
    }

    case 'reveal':
      showAnswerPanel();
      break;

    case 'mark':
      markKnown(+t.dataset.v);
      break;

    case 'next':
      nextQuestion();
      break;

    case 'replay':
      location.hash = '#/quiz/' + t.dataset.id;
      break;

    case 'rewrong':
      location.hash = '#/quiz/' + t.dataset.id + '/wrong';
      break;

    case 'quiz-quit': {
      const s = session;
      const total = s.order.length;
      const ok = await confirmModal({
        title: '退出本轮刷题',
        body: '<p class="m-line">当前进度 ' + Math.min(s.pos + 1, total) + ' / ' + total + ' 题，已答对的会累计到统计中。</p>',
        okText: '退出',
        danger: true
      });
      if (ok) { session = null; location.hash = '#/home'; }
      break;
    }
  }
});

/* ============================================================
   启动
   ============================================================ */
window.addEventListener('hashchange', render);

(function boot() {
  initData();
  refreshWrongBadge();
  render();
})();
