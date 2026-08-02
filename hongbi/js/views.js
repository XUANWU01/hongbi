/* ============================================================
   红笔 HONGBI v3 · 视图层（全部数据来自服务器 API）
   ============================================================ */
'use strict';

const libraryState = { keyword: '', cat: '全部', sort: 'new', page: 1 };
const PAGE_SIZE = 12;
let session = null;         // 刷题会话
let uploadState = null;     // 上传流程
let quizCache = {};         // 题目缓存 {setId: {idx: question}}

/* ============================================================
   首页
   ============================================================ */
async function renderHome() {
  const view = $('#view');
  view.innerHTML = loadingHtml('正在读取统计数据…');
  let stats = null;
  try { stats = await ServerAPI.getStats(); } catch (e) { /* ignore */ }
  const acc = stats && stats.answered > 0 ? Math.round(stats.correct / stats.answered * 100) : 0;

  view.innerHTML = '' +
    '<section class="hero">' +
      '<div class="hero-text">' +
        '<p class="hero-eyebrow">HONGBI · QUIZ PLATFORM v3</p>' +
        '<h1>数据驱动的<br><span class="hl">刷题引擎</span></h1>' +
        '<p class="hero-sub">题库上云、解析上云、进度上云。你的每一次作答都在服务器留下轨迹，换设备也不丢。</p>' +
        '<div class="hero-actions">' +
          '<a class="btn btn-primary btn-lg" href="#/upload">✒️ 上传题库</a>' +
          '<a class="btn btn-ghost btn-lg" href="#/library">进入题库广场</a>' +
          (stats && stats.wrong > 0 ? '<a class="btn btn-danger btn-lg" href="#/wrong">错题本 · ' + stats.wrong + '</a>' : '') +
        '</div>' +
      '</div>' +
      '<div class="hero-holo" aria-hidden="true">' +
        '<div class="holo-ring"><div class="holo-num">' + (stats ? stats.answered : 0) + '</div><div class="holo-label">累计作答</div></div>' +
        '<div class="holo-chip hc1">正确率 <b>' + acc + '%</b></div>' +
        '<div class="holo-chip hc2">错题 <b>' + (stats ? stats.wrong : 0) + '</b></div>' +
        '<div class="holo-scan"></div>' +
      '</div>' +
    '</section>' +

    '<section>' +
      '<div class="stats-grid">' +
        statCard('累计作答', stats ? stats.answered : 0, '服务器云端记录') +
        statCard('正确率', acc + '%', stats && stats.answered > 0 ? '近 ' + stats.answered + ' 次作答' : '还没有作答记录') +
        statCard('错题本', stats ? stats.wrong : 0, stats && stats.wrong > 0 ? '待复习' : '干干净净') +
        statCard('刷过题库', stats ? stats.sessions : 0, '套') +
      '</div>' +
    '</section>' +

    '<div class="home-cols">' +
      '<section><div class="section-head"><div><h2 style="font-size:19px">近 7 天正确率</h2></div></div>' + trendHtml(stats ? stats.daily : null) + '</section>' +
      '<section><div class="section-head"><div><h2 style="font-size:19px">快捷指令</h2></div></div>' +
        '<div class="cmd-grid">' +
          '<button class="cmd-card" data-action="quick-daily"><span>🎲</span><b>每日一练</b><p>随机抽 10 题热身</p></button>' +
          '<button class="cmd-card" data-action="quick-library"><span>▦</span><b>题库广场</b><p>浏览公共主题库</p></button>' +
          '<button class="cmd-card" data-action="quick-import"><span>⇪</span><b>导入旧数据</b><p>迁移本地题库</p></button>' +
          (ServerAPI.isAdmin() ? '<button class="cmd-card" data-action="quick-admin"><span>⚑</span><b>审核队列</b><p>处理贡献审核</p></button>' : '') +
        '</div>' +
      '</section>' +
    '</div>';

  function statCard(label, num, foot) {
    return '<div class="stat-card"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-num">' + num + '</div><div class="stat-foot">' + foot + '</div></div>';
  }
}

function trendHtml(daily) {
  if (!daily) return '<div class="trend-empty">刷几道题后，这里会画出你的正确率曲线。</div>';
  const map = {};
  daily.forEach(d => { map[d.day] = d; });
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const v = map[key] || { answered: 0, correct: 0 };
    days.push({ label: (d.getMonth() + 1) + '/' + d.getDate(), a: v.answered, pct: v.answered ? Math.round(v.correct / v.answered * 100) : 0 });
  }
  const hasAny = days.some(d => d.a > 0);
  if (!hasAny) return '<div class="trend-empty">刷几道题后，这里会画出你的正确率曲线。</div>';
  const maxH = Math.max(...days.map(d => d.pct), 10);
  return '<div class="trend">' + days.map(d =>
    '<div class="trend-col" title="' + d.label + ' · ' + d.a + ' 题 · ' + d.pct + '%">' +
      '<div class="trend-bar" style="height:' + Math.round(d.pct / maxH * 100) + '%"><span>' + (d.a ? d.pct : '') + '</span></div>' +
      '<div class="trend-label">' + d.label + '</div></div>').join('') + '</div>';
}

function loadingHtml(msg) { return '<div class="loading">' + esc(msg || '加载中…') + '</div>'; }
function emptyState(icon, title, sub, actionHtml) {
  return '<div class="empty"><span class="empty-icon">' + icon + '</span><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p>' + actionHtml + '</div>';
}

/* ============================================================
   题库卡片
   ============================================================ */
function srcBadge(s) {
  if (s.source === 'official') return '<span class="chip chip-official">官方</span>';
  if (s.source === 'public') return '<span class="chip chip-public">社区</span>';
  if (s.source === 'pending') return '<span class="chip chip-pending">待审核</span>';
  if (s.reviewStatus === 'rejected') return '<span class="chip chip-rejected" title="' + esc(s.reviewReason || '') + '">已驳回</span>';
  return '<span class="chip chip-private">私密</span>';
}

function setCard(s, i) {
  return '<article class="set-card" style="--i:' + (i % 8) + '">' +
    '<div class="set-card-top">' +
      '<span class="chip chip-cat">' + esc(s.category || '未分类') + '</span>' + srcBadge(s) +
    '</div>' +
    '<h3>' + esc(s.title) + '</h3>' +
    '<p class="set-desc">' + esc(s.desc || '暂无描述') + '</p>' +
    '<div class="set-meta"><span>' + s.questionCount + ' 题</span>' +
    (s.tags && s.tags.length ? '<span>#' + esc(s.tags.join(' #')) + '</span>' : '') + '</div>' +
    '<div class="set-actions">' +
      '<button class="btn btn-primary btn-sm" data-action="start-quiz" data-id="' + s.id + '">开始刷题</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="preview" data-id="' + s.id + '">预览</button>' +
    '</div></article>';
}

/* ============================================================
   题库广场
   ============================================================ */
async function renderLibrary() {
  const view = $('#view');
  view.innerHTML = loadingHtml('正在连接题库服务器…');
  let data;
  try {
    data = await ServerAPI.listSets({
      search: libraryState.keyword, cat: libraryState.cat, sort: libraryState.sort,
      page: libraryState.page, size: PAGE_SIZE
    });
  } catch (e) { view.innerHTML = emptyState('✗', '加载失败', e.message, '<button class="btn btn-primary btn-sm" data-action="retry">重试</button>'); return; }

  const { total, page, size, sets } = data;
  const pages = Math.max(1, Math.ceil(total / size));
  const catChips = ['全部', ...CATEGORIES].map(c =>
    '<button class="cat-chip' + (c === libraryState.cat ? ' active' : '') + '" data-cat="' + c + '">' + c + '</button>').join('');
  const sortSel = '<select id="lib-sort" class="sort-select">' +
    [['new', '最新'], ['count', '题量最多'], ['hot', '最热门']]
      .map(([v, l]) => '<option value="' + v + '"' + (v === libraryState.sort ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>';
  const pager = total > size
    ? '<div class="pager"><button class="btn btn-sm btn-ghost" data-action="page-prev" ' + (page <= 1 ? 'disabled' : '') + '>← 上一页</button>' +
      '<span class="pager-info">' + page + ' / ' + pages + ' · 共 ' + total + ' 套</span>' +
      '<button class="btn btn-sm btn-ghost" data-action="page-next" ' + (page >= pages ? 'disabled' : '') + '>下一页 →</button></div>'
    : '';

  view.innerHTML = '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>题库广场</h2>' +
    '<div class="section-sub">官方精选 + 社区共享（共享内容经管理员审核后可见）</div></div>' +
    '<span class="chip chip-public">' + total + ' 套</span></div>' +
    '<div class="toolbar">' +
      '<div class="search-box"><input id="lib-search" type="search" placeholder="搜索题库、标签、分类…" value="' + esc(libraryState.keyword) + '"></div>' + sortSel +
    '</div>' +
    '<div class="cat-chips">' + catChips + '</div>' +
    (sets.length
      ? '<div class="grid-cards">' + sets.map((s, i) => setCard(s, i)).join('') + '</div>' + pager
      : emptyState('▦', '没有找到匹配的题库', '换个关键词试试，或上传一份新题库。', '<a class="btn btn-primary btn-sm" href="#/upload">上传题库</a>')) +
    '<div class="section-head"><div><h2>共享说明</h2></div></div>' +
    '<div class="format-card" style="max-width:100%">' +
      '上传时选择<strong>同意共享</strong>，题库进入<strong>审核队列</strong>，管理员批准后所有人可见；' +
      '<strong>不同意</strong>则进入你的私库，仅自己可见。题库与进度全部存储在服务器，换设备不丢。</div>';

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
   我的题库
   ============================================================ */
async function renderMine() {
  const view = $('#view');
  view.innerHTML = loadingHtml('正在加载我的题库…');
  let data;
  try { data = await ServerAPI.listSets({ scope: 'mine', size: 100 }); }
  catch (e) { view.innerHTML = emptyState('✗', '加载失败', e.message, ''); return; }
  const mine = data.sets;
  const priv = mine.filter(s => s.source === 'private' && s.reviewStatus !== 'rejected');
  const contrib = mine.filter(s => s.source !== 'private');

  view.innerHTML = '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>我的题库</h2>' +
    '<div class="section-sub">私库自己用 · 共享需审核 · 全部云端存储</div></div>' +
    '<a class="btn btn-primary" href="#/upload">＋ 上传新题库</a></div>' +
    '<div class="section-head"><div><h2>我的私库</h2></div></div>' +
    (priv.length ? priv.map(setRow).join('')
      : emptyState('▤', '私库还是空的', '上传时选择「不同意，建立我的私库」，题库只属于你。', '<a class="btn btn-primary btn-sm" href="#/upload">去上传</a>')) +
    '<div style="height:20px"></div>' +
    '<div class="section-head"><div><h2>我的贡献</h2><div class="section-sub">共享题库需管理员审核，可查看状态与驳回原因</div></div></div>' +
    (contrib.length ? contrib.map(setRow).join('')
      : emptyState('⇪', '还没有贡献过', '上传时选择「同意共享」，帮助有同样需求的人。', '<a class="btn btn-primary btn-sm" href="#/upload">去贡献</a>'));
}

function setRow(s) {
  const statusBadge = s.source === 'pending' ? '<span class="chip chip-pending">⏳ 待审核</span>'
    : s.reviewStatus === 'rejected' ? '<span class="chip chip-rejected" title="驳回原因：' + esc(s.reviewReason || '') + '">✗ 已驳回</span>'
    : s.source === 'public' ? '<span class="chip chip-public">✓ 已通过</span>'
    : '<span class="chip chip-private">私密</span>';
  return '<div class="list-row">' +
    '<div class="row-main">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="row-title">' + esc(s.title) + '</span>' + statusBadge + '</div>' +
      (s.reviewStatus === 'rejected' && s.reviewReason ? '<div class="row-sub" style="color:var(--red)">驳回原因：' + esc(s.reviewReason) + '</div>' : '') +
      '<div class="row-sub">' + s.questionCount + ' 题 · ' + relTime(s.createdAt) + '</div>' +
    '</div>' +
    '<div class="row-actions">' +
      '<button class="btn btn-sm btn-primary" data-action="start-quiz" data-id="' + s.id + '">刷题</button>' +
      '<button class="btn btn-sm btn-ghost" data-action="preview" data-id="' + s.id + '">预览</button>' +
      (s.isMine && s.source !== 'official' ? '<button class="btn btn-sm btn-ghost" data-action="edit-set" data-id="' + s.id + '">编辑</button>' : '') +
      (s.isMine && s.source !== 'official' ? '<button class="btn btn-sm btn-danger" data-action="delete-set" data-id="' + s.id + '">删除</button>' : '') +
    '</div></div>';
}

/* ============================================================
   错题本 / 收藏
   ============================================================ */
async function renderWrong() {
  const view = $('#view');
  view.innerHTML = loadingHtml('正在加载错题本…');
  let data;
  try { data = await ServerAPI.getWrong(); } catch (e) { view.innerHTML = emptyState('✗', '加载失败', e.message, ''); return; }
  const items = data.items;
  if (!items.length) {
    view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>错题本</h2></div></div>' +
      emptyState('✓', '错题本是空的', '答错的题目会同步到服务器，直到你重新掌握。', '<a class="btn btn-primary btn-sm" href="#/library">去刷题</a>');
    return;
  }
  const bySet = {};
  items.forEach(w => { (bySet[w.setId] = bySet[w.setId] || []).push(w); });
  const groups = Object.entries(bySet).map(([setId, list]) =>
    '<div class="section-head" style="margin-top:8px"><div><h2 style="font-size:18px">' + esc(list[0].setTitle) + '</h2>' +
    '<div class="section-sub">' + list.length + ' 题未掌握（≥3 次标「加急」）</div></div>' +
    '<button class="btn btn-sm btn-primary" data-action="wrong-quiz" data-id="' + setId + '">专项重刷</button></div>' +
    list.map(w => {
      const urgent = w.count >= 3;
      return '<div class="list-row">' +
        '<div class="row-main"><div class="row-title" style="font-size:14px">' + esc(trunc(w.q, 60)) + '</div>' +
        (w.userAnswer ? '<div class="row-sub ans-echo">你的作答：' + esc(trunc(w.userAnswer, 60)) + '</div>' : '') +
        '<div class="row-sub">答错 <b>' + w.count + '</b> 次 · 最近 ' + relTime(w.lastAt) + '</div></div>' +
        (urgent ? '<span class="stamp">加急</span>' : '') +
        '<div class="row-actions">' +
          '<button class="btn btn-sm btn-ghost" data-action="preview-question" data-qid="' + w.questionId + '">答案</button>' +
          '<button class="btn btn-sm btn-ink" data-action="wrong-learned" data-qid="' + w.questionId + '">已掌握</button>' +
        '</div></div>';
    }).join('')).join('');

  view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>错题本</h2>' +
    '<div class="section-sub">按答错次数排序 · 云端同步</div></div>' +
    '<button class="btn btn-sm btn-danger" data-action="clear-wrong">清空</button></div>' + groups;
}

async function renderFav() {
  const view = $('#view');
  view.innerHTML = loadingHtml('正在加载收藏…');
  let data;
  try { data = await ServerAPI.getFavs(); } catch (e) { view.innerHTML = emptyState('✗', '加载失败', e.message, ''); return; }
  const items = data.items;
  if (!items.length) {
    view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>我的收藏</h2></div></div>' +
      emptyState('★', '还没有收藏题目', '刷题时点星标或按 F 收藏。', '<a class="btn btn-primary btn-sm" href="#/library">去刷题</a>');
    return;
  }
  view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>我的收藏</h2><div class="section-sub">共 ' + items.length + ' 题</div></div></div>' +
    items.map(f => '<div class="list-row">' +
      '<div class="row-main"><div class="row-title" style="font-size:14px">' + esc(trunc(f.q, 60)) + '</div>' +
      '<div class="row-sub">' + esc(f.setTitle) + ' · 收藏于 ' + relTime(f.createdAt) + '</div></div>' +
      '<div class="row-actions">' +
        '<button class="btn btn-sm btn-ghost" data-action="preview-question" data-qid="' + f.questionId + '">答案</button>' +
        '<button class="btn btn-sm btn-danger" data-action="unfav" data-qid="' + f.questionId + '">取消</button>' +
      '</div></div>').join('');
}

/* ============================================================
   审核队列（管理员）
   ============================================================ */
async function renderAdmin() {
  const view = $('#view');
  if (!ServerAPI.isAdmin()) {
    view.innerHTML = emptyState('⚑', '需要管理员权限', '只有管理员或超级管理员可以访问审核队列。', '');
    return;
  }
  view.innerHTML = loadingHtml('正在加载审核队列…');
  let data;
  try { data = await ServerAPI.getReviews('pending'); } catch (e) { view.innerHTML = emptyState('✗', '加载失败', e.message, ''); return; }
  const items = data.items;
  view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>贡献审核队列</h2>' +
    '<div class="section-sub">批准后进入公共主题库 · 驳回必须填写原因</div></div>' +
    '<span class="chip chip-pending">待审 ' + items.length + '</span></div>' +
    (items.length
      ? items.map((s, i) => '<div class="review-card">' +
          '<div class="row-main"><div class="row-title">' + esc(s.title) + '</div>' +
          '<div class="row-sub">' + s.questionCount + ' 题 · ' + esc(s.category) + ' · 提交于 ' + relTime(s.createdAt) +
          (s.desc ? ' · ' + esc(trunc(s.desc, 40)) : '') + '</div></div>' +
          '<div class="row-actions">' +
            '<button class="btn btn-sm btn-ghost" data-action="review-preview" data-id="' + s.id + '">预览</button>' +
            '<button class="btn btn-sm btn-primary" data-action="review-approve" data-id="' + s.id + '">批准</button>' +
            '<button class="btn btn-sm btn-danger" data-action="review-reject" data-id="' + s.id + '">驳回</button>' +
          '</div></div>').join('')
      : emptyState('✓', '队列是空的', '没有待审核的贡献。', ''));
}

/* ============================================================
   上传 / 追加（job 轮询）
   ============================================================ */
function renderUpload() {
  const view = $('#view');
  const stepsHtml = n => {
    const steps = [
      { t: '选择文件', s: n > 1 ? 'done' : 'active' },
      { t: '云端解析', s: n > 2 ? 'done' : (n === 2 ? 'active' : '') },
      { t: uploadState && uploadState.appendSetId ? '确认追加' : '共享确认', s: n === 3 ? 'active' : '' }
    ];
    return '<div class="steps">' + steps.map((st, i) =>
      '<span class="step ' + st.s + '"><span class="step-num">' + (st.s === 'done' ? '✓' : '0' + (i + 1)) + '</span>' + st.t + '</span>').join('') + '</div>';
  };

  if (!uploadState) {
    view.innerHTML = '' +
      '<div class="section-head" style="margin-top:6px"><div><h2>上传题库</h2>' +
      '<div class="section-sub">支持 .docx / .pdf / .txt / .md / .csv / .tsv / .json，最大 100MB，由服务器解析</div></div></div>' +
      '<div class="upload-banner"><span class="b-icon">☁</span><div>' +
      '<strong>上传前请注意：</strong>文件将上传至服务器解析；「同意共享」的题库进入<strong>审核队列</strong>，管理员批准后所有人可见。</div></div>' +
      stepsHtml(1) +
      '<div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="选择题库文件">' +
        '<span class="dz-icon">⇪</span><h3>把题库文档拖到这里</h3><p>或者点击选择文件</p>' +
        '<p class="dz-formats">.docx&nbsp;.pdf&nbsp;.txt&nbsp;.md&nbsp;.csv&nbsp;.tsv&nbsp;.json</p>' +
        '<input type="file" id="file-input" accept=".docx,.pdf,.txt,.md,.markdown,.csv,.tsv,.json" hidden>' +
      '</div>' +
      '<div style="margin-top:22px;text-align:center">' +
        '<a class="btn btn-ghost btn-sm" href="examples/示例题库-计算机.txt" download>下载 TXT 示例</a>' +
        '&nbsp;&nbsp;<a class="btn btn-ghost btn-sm" href="examples/示例题库-前端.json" download>下载 JSON 示例</a>' +
      '</div>';
    bindUpload();
    return;
  }

  // 解析中
  if (uploadState.status === 'parsing') {
    view.innerHTML = '<div class="section-head" style="margin-top:6px"><div><h2>上传题库</h2>' +
      '<div class="section-sub">' + esc(uploadState.fileName) + '</div></div></div>' + stepsHtml(2) +
      '<div class="parse-wait">' +
        '<div class="scan-line"></div>' +
        '<h3>服务器解析中…</h3>' +
        '<p>' + esc(uploadState.message || '正在提取题目结构') + '</p>' +
        '<div class="wait-bar"><i style="width:' + uploadState.progress + '%"></i></div>' +
        '<div class="wait-pct">' + uploadState.progress + '%</div>' +
      '</div>';
    return;
  }

  // 解析完成预览
  const p = uploadState.job;
  const warnHtml = p.warnings && p.warnings.length
    ? '<ul class="warn-list">' + p.warnings.slice(0, 5).map(w => '<li>⚠ ' + esc(w) + '</li>').join('') +
      (p.warnings.length > 5 ? '<li>… 另有 ' + (p.warnings.length - 5) + ' 条提示</li>' : '') + '</ul>' : '';
  const appendBanner = uploadState.appendSetId
    ? '<div class="upload-banner" style="border-color:var(--cyan)"><span class="b-icon">＋</span><div>追加到「' + esc(uploadState.appendTitle) + '」（现有 ' + uploadState.appendCount + ' 题）</div></div>' : '';

  view.innerHTML = '' +
    '<div class="section-head" style="margin-top:6px"><div><h2>上传题库</h2>' +
    '<div class="section-sub">已解析：' + esc(uploadState.fileName) + '</div></div>' +
    '<button class="btn btn-ghost btn-sm" data-action="upload-reset">重新选择</button></div>' +
    stepsHtml(3) + appendBanner +
    '<div class="parse-panel">' +
      '<div class="panel-card"><h3><span class="p-num">PARSED</span>解析结果</h3>' +
        '<div class="parse-summary">' +
          '<div class="sum"><b>' + p.total + '</b><span>识别题目</span></div>' +
          '<div class="sum"><b>' + (p.skipped || 0) + '</b><span>截断/跳过</span></div>' +
          '<div class="sum"><b>' + esc(p.format) + '</b><span>格式</span></div>' +
        '</div>' + warnHtml +
        (p.samples || []).map((q, i) => '<div class="sample-q"><span class="sq-num">SAMPLE ' + (i + 1) + '</span>' +
          '<div class="sq-q">' + esc(q.q) + '</div>' +
          (q.options && q.options.length ? '<div class="sq-a" style="color:var(--ink-2)">' + esc(q.options.join(' / ')) + '</div>' : '') +
          '<div class="sq-a">答案：' + esc(trunc(q.answer || '（未检测到）', 40)) + '</div></div>').join('') +
      '</div>' +
      '<div>' +
        '<div class="panel-card"><h3><span class="p-num">META</span>题库信息</h3><div class="form-grid">' +
          '<div class="field"><label for="f-title">题库标题 *</label><input id="f-title" maxlength="40" value="' + esc(uploadState.title) + '"></div>' +
          '<div class="field"><label for="f-cat">分类</label><select id="f-cat">' + CATEGORIES.map(c => '<option' + (c === uploadState.cat ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></div>' +
          '<div class="field"><label for="f-tags">标签（逗号分隔）</label><input id="f-tags" placeholder="如：考试, 高频" value="' + esc(uploadState.tags) + '"></div>' +
          '<div class="field"><label for="f-desc">描述（可选）</label><textarea id="f-desc" maxlength="120">' + esc(uploadState.desc) + '</textarea></div>' +
        '</div></div>' +
        (uploadState.appendSetId
          ? '<div class="consent-box" style="border-color:var(--cyan)"><div class="c-head"><span>＋</span> 确认追加</div>' +
            '<p class="c-body">将 ' + p.total + ' 题追加到「' + esc(uploadState.appendTitle) + '」末尾。</p>' +
            '<div class="consent-actions"><button class="btn btn-primary" data-action="confirm-append">确认追加</button>' +
            '<button class="btn btn-ghost" data-action="upload-reset">取消</button></div></div>'
          : '<div class="consent-box"><div class="c-head"><span>⚠</span> 共享协议 · 请确认</div>' +
            '<p class="c-body">题库「<b>' + esc(uploadState.title) + '</b>」（共 <b>' + p.total + '</b> 题）' +
            '若<strong>同意共享</strong>将进入<strong>审核队列</strong>，管理员批准后合并进公共主题库供所有人使用。</p>' +
            '<div class="consent-actions">' +
              '<button class="btn btn-primary" data-action="confirm-public">同意共享 · 提交审核</button>' +
              '<button class="btn btn-ghost" data-action="confirm-private">不同意 · 建立我的私库</button>' +
            '</div>' +
            '<p class="c-note">驳回会附带原因；私库仅你自己可见。</p></div>') +
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

async function handleUploadFile(file) {
  if (file.size > 100 * 1024 * 1024) { toast('文件超过 100MB 限制', 'err'); return; }
  uploadState = { fileName: file.name, status: 'parsing', progress: 0, message: '上传中…' };
  render();
  try {
    const { jobId } = await ServerAPI.upload(file, pct => {
      uploadState.progress = pct;
      uploadState.message = '上传中… ' + pct + '%';
      const bar = $('.wait-bar i'); if (bar) bar.style.width = pct + '%';
      const pctEl = $('.wait-pct'); if (pctEl) pctEl.textContent = pct + '%';
    });
    uploadState.message = '服务器解析中…';
    uploadState.progress = 100;
    render();
    const job = await ServerAPI.pollJob(jobId, { onStatus: j => {
      if (j.status === 'failed') throw new Error(j.error || '解析失败');
    }});
    uploadState = {
      name: file.name, fileName: file.name, status: 'preview', job,
      title: file.name.replace(/\.[^.]+$/, ''),
      cat: '其他', tags: '', desc: '',
      appendSetId: uploadState.appendSetId || null,
      appendTitle: uploadState.appendTitle || '',
      appendCount: uploadState.appendCount || 0
    };
    render();
  } catch (e) {
    toast('上传/解析失败：' + e.message, 'err');
    uploadState = null;
    render();
  }
}

async function submitUpload(shared) {
  if (!uploadState || !uploadState.job) return;
  const title = ($('#f-title') ? $('#f-title').value : '').trim() || uploadState.title;
  const cat = $('#f-cat') ? $('#f-cat').value : '其他';
  const tags = ($('#f-tags') ? $('#f-tags').value : '').split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5);
  const desc = $('#f-desc') ? $('#f-desc').value.trim() : '';
  try {
    await ServerAPI.createSet({
      jobId: uploadState.job.id, title, category: cat, tags, desc,
      visibility: shared ? 'public' : 'private'
    });
    toast(shared ? '已提交共享审核，等待管理员批准 ⏳' : '已存入你的私库');
    uploadState = null;
    location.hash = shared ? '#/mine' : '#/mine';
  } catch (e) { toast('提交失败：' + e.message, 'err'); }
}

async function submitAppend() {
  if (!uploadState || !uploadState.appendSetId) return;
  try {
    const r = await ServerAPI.appendQuestions(uploadState.appendSetId, uploadState.job.id);
    toast('已追加 ' + r.added + ' 题，共 ' + r.total + ' 题');
    uploadState = null;
    location.hash = '#/mine';
  } catch (e) { toast('追加失败：' + e.message, 'err'); }
}

/* ============================================================
   预览 / 编辑 / 导入
   ============================================================ */
async function previewModal(setId) {
  try {
    const set = await ServerAPI.getSet(setId, { limit: 100 });
    const qs = set.questions || [];
    const list = qs.map((q, i) => '<div class="preview-q"><div class="pq-q">' + (i + 1) + '. ' + esc(q.q) + '</div>' +
      (q.options && q.options.length ? '<div class="pq-opts">' + esc(q.options.map((o, j) => 'ABCDEFGH'[j] + '. ' + o).join('　')) + '</div>' : '') +
      '<details><summary>查看答案</summary><div class="pq-ans"><b>答案：</b>' + esc(q.answer || '无') +
      (q.explanation ? '<br><b>解析：</b>' + esc(q.explanation) : '') + '</div></details></div>').join('');
    openModal(
      '<div class="modal-head"><h3>' + esc(set.title) + '</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
      '<div class="modal-body">' +
        '<p style="margin:0 0 10px;font-size:13px;color:var(--ink-2)"><span class="chip chip-cat">' + esc(set.category) + '</span>' + srcBadge(set) +
        '<span style="margin-left:8px;font-family:var(--font-mono)">' + set.questionCount + ' 题</span></p>' +
        (set.desc ? '<p style="margin:0 0 10px;font-size:13.5px">' + esc(set.desc) + '</p>' : '') +
        '<div class="rule" style="margin:0 0 8px"></div>' + (list || '<p style="color:var(--ink-3)">暂无题目</p>') +
      '</div>' +
      '<div class="modal-actions"><button class="btn btn-primary" data-close-modal data-start="' + set.id + '">开始刷题</button>' +
      '<button class="btn btn-ghost" data-close-modal>关闭</button></div>'
    );
  } catch (e) { toast(e.message, 'err'); }
}

function questionModal(question) {
  if (!question) return;
  openModal(
    '<div class="modal-head"><h3>' + esc(trunc(question.q, 26)) + '</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body"><p class="m-line"><b>答案：</b>' + esc(question.answer || '无') + '</p>' +
    (question.explanation ? '<p class="m-line"><b>解析：</b>' + esc(question.explanation) + '</p>' : '') +
    (question.options && question.options.length ? '<p class="m-note">选项：' + esc(question.options.join(' / ')) + '</p>' : '') +
    '</div><div class="modal-actions"><button class="btn btn-ghost" data-close-modal>关闭</button></div>'
  );
}

function editModal(setId) {
  ServerAPI.getSet(setId, { limit: 1 }).then(set => {
    const overlay = openModal(
      '<div class="modal-head"><h3>编辑题库信息</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
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
      try {
        await ServerAPI.patchSet(setId, { title, category: $('#e-cat').value, tags: $('#e-tags').value.split(/[,，]/).map(s => s.trim()).filter(Boolean).slice(0, 5), desc: $('#e-desc').value.trim() });
        closeModal(); toast('已保存'); render();
      } catch (err) { toast('保存失败：' + err.message, 'err'); }
    });
  }).catch(e => toast(e.message, 'err'));
}

function importModal() {
  const overlay = openModal(
    '<div class="modal-head"><h3>导入本地旧数据</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body">' +
      '<p class="m-line">从旧版红笔（浏览器本地存储）导入题库、错题与收藏，导入的题库将标为<strong>私库</strong>。</p>' +
      '<div id="import-status" style="font-size:13px;color:var(--ink-2);margin-bottom:10px"></div>' +
      '<button class="btn btn-primary btn-block" id="import-run">开始导入</button>' +
    '</div>' +
    '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>关闭</button></div>'
  );
  const run = $('#import-run');
  run.addEventListener('click', async () => {
    const payload = {};
    try { payload.public = JSON.parse(localStorage.getItem('hb_public') || '[]'); } catch (e) { payload.public = []; }
    try { payload.private = JSON.parse(localStorage.getItem('hb_private') || '[]'); } catch (e) { payload.private = []; }
    try { payload.wrong = JSON.parse(localStorage.getItem('hb_wrong') || '[]'); } catch (e) { payload.wrong = []; }
    try { payload.fav = JSON.parse(localStorage.getItem('hb_fav') || '[]'); } catch (e) { payload.fav = []; }
    const total = payload.public.length + payload.private.length;
    if (total === 0) { $('#import-status').textContent = '没有找到旧数据。'; return; }
    run.disabled = true;
    $('#import-status').textContent = '正在导入 ' + total + ' 套题库…';
    try {
      const r = await ServerAPI.importData(payload);
      localStorage.removeItem('hb_public');
      localStorage.removeItem('hb_private');
      localStorage.removeItem('hb_wrong');
      localStorage.removeItem('hb_fav');
      $('#import-status').textContent = '导入完成：' + r.sets + ' 套题库 / ' + r.questions + ' 题，旧数据已清理。';
      run.textContent = '完成';
      setTimeout(() => { closeModal(); render(); }, 1200);
    } catch (e) { $('#import-status').textContent = '导入失败：' + e.message; run.disabled = false; }
  });
}

/* ============================================================
   刷题引擎（分批加载）
   ============================================================ */
async function renderQuizView(setId, mode) {
  const view = $('#view');
  view.innerHTML = loadingHtml('正在准备题库…');
  let set;
  try { set = await ServerAPI.getSet(setId, { limit: 1 }); }
  catch (e) { view.innerHTML = emptyState('✗', '题库不存在', e.message, '<a class="btn btn-primary btn-sm" href="#/library">返回</a>'); return; }

  if (session && session.setId === setId && !session.done) { renderQuiz(); return; }

  if (mode === 'wrong') {
    const wrong = await ServerAPI.getWrong();
    const items = wrong.items.filter(w => w.setId === setId);
    if (!items.length) { toast('没有待复习的错题', 'err'); location.hash = '#/wrong'; return; }
    session = { setId, setTitle: set.title, order: items.map(w => w.questionId), questions: items.map(w => ({ id: w.questionId, q: w.q, options: w.options, answer: w.answer, explanation: w.explanation, type: w.type })), pos: 0, correct: 0, answered: 0, wrongIdx: [], mode: 'wrong', done: false };
    renderQuiz();
    return;
  }

  view.innerHTML = '' +
    '<div class="quiz-wrap"><div class="quiz-head"><div class="qh-title"><h2>' + esc(set.title) + '</h2>' +
    '<div class="qh-sub">' + set.questionCount + ' 题 · ' + srcBadge(set) + '</div></div>' +
    '<a class="btn btn-ghost btn-sm" href="#/library">返回</a></div>' +
    '<div class="mode-panel"><div class="mode-head">选择刷题模式</div>' +
    '<div class="mode-grid">' +
      '<button class="mode-card" data-action="start-mode" data-mode="order" data-id="' + setId + '"><span class="mode-icon">➡</span><b>顺序刷</b><p>按题目顺序一题一题过</p></button>' +
      '<button class="mode-card" data-action="start-mode" data-mode="random" data-id="' + setId + '"><span class="mode-icon">⚄</span><b>随机刷</b><p>打乱顺序，全部题目</p></button>' +
      '<button class="mode-card" data-action="start-mode" data-mode="daily" data-id="' + setId + '"><span class="mode-icon">◔</span><b>每日一练</b><p>随机抽 ' + Math.min(10, set.questionCount) + ' 题热身</p></button>' +
    '</div></div></div>';
}

async function startSessionMode(setId, mode) {
  const view = $('#view');
  view.innerHTML = loadingHtml('正在加载题目索引…');
  const set = await ServerAPI.getSet(setId, { limit: 1 });
  const total = set.questionCount;
  quizCache[setId] = {};
  let order;
  if (mode === 'order') order = Array.from({ length: total }, (_, i) => i);
  else if (mode === 'daily') order = shuffle(Array.from({ length: total }, (_, i) => i)).slice(0, Math.min(10, total));
  else order = shuffle(Array.from({ length: total }, (_, i) => i));
  session = { setId, setTitle: set.title, questionCount: total, order, pos: 0, correct: 0, answered: 0, wrongIdx: [], mode, done: false };
  renderQuiz();
}

async function ensureQuizQuestion(setId, idx) {
  if (!quizCache[setId]) quizCache[setId] = {};
  if (quizCache[setId][idx]) return quizCache[setId][idx];
  // 按 20 题一批加载
  const offset = Math.floor(idx / 20) * 20;
  const set = await ServerAPI.getSet(setId, { offset, limit: 20 });
  (set.questions || []).forEach((q, i) => { quizCache[setId][offset + i] = q; });
  return quizCache[setId][idx] || null;
}

function renderQuiz() {
  const view = $('#view');
  const s = session;
  const total = s.order.length;
  const modeLabel = s.mode === 'wrong' ? '错题专项' : s.mode === 'daily' ? '每日一练' : s.mode === 'order' ? '顺序刷' : '随机刷';
  view.innerHTML = '' +
    '<div class="quiz-wrap">' +
      '<div class="quiz-head"><div class="qh-title"><h2>' + esc(s.setTitle) + '</h2>' +
      '<div class="qh-sub">' + modeLabel + (s.mode === 'wrong' ? ' · 答对自动移出错题本' : ' · A-D 选答案 / 空格看答案 / 回车下一题 / F 收藏 / Esc 退出') + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" data-action="quiz-quit">退出</button></div>' +
      '<div class="quiz-progress"><div class="bar"><i style="width:' + (s.pos / total * 100) + '%"></i></div>' +
      '<div class="pq"><small>已答对</small> ' + s.correct + ' <small>/</small> ' + total + '</div></div>' +
      '<div id="quiz-body"></div>' +
    '</div>';
  window.scrollTo(0, 0);
  renderQuizBody();
}

function renderQuizBody() {
  const body = $('#quiz-body');
  const s = session;
  if (!body) return;
  if (s.pos >= s.order.length) { renderQuizResult(); return; }

  const ref = s.order[s.pos];
  const q = s.mode === 'wrong' ? s.questions[s.pos] : null;
  const num = s.pos + 1;
  const total = s.order.length;

  const renderQ = (qq, isChoice) => {
    const isFav = false;
    body.innerHTML = '' +
      '<div class="q-card q-enter">' +
        '<div class="q-card-top">' +
          '<div class="q-tag">' + (isChoice ? '选择题' : '简答 / 填空') + ' · ' + num + ' / ' + total + '</div>' +
          '<button class="fav-btn" data-action="fav" data-qid="' + esc(qq.id) + '">☆</button>' +
        '</div>' +
        '<p class="q-text">' + esc(qq.q) + '</p>' +
        (isChoice
          ? '<div class="q-options">' + qq.options.map((o, i) =>
              '<button class="q-option" data-action="pick" data-oi="' + i + '" data-qid="' + esc(qq.id) + '">' +
              '<span class="opt-letter">' + 'ABCDEFGH'[i] + '</span><span>' + esc(o) + '</span></button>').join('') + '</div>'
          : '<div class="q-input"><textarea id="q-input-box" rows="3" placeholder="在这里写下你的答案…（提交后对照参考答案）"></textarea>' +
            '<div class="q-input-actions"><button class="btn btn-primary" data-action="submit-text">提交答案</button>' +
            '<button class="btn btn-ghost btn-sm" data-action="reveal">直接看答案</button></div></div>') +
        '<div id="q-answer-zone"></div>' +
        '<div class="q-actions" id="q-actions"></div>' +
      '</div>';
    session._curQ = qq;
    session._curIsChoice = isChoice;
  };

  if (q) renderQ(q, q.options && q.options.length >= 2);
  else {
    body.innerHTML = '<div class="loading">正在加载题目…</div>';
    ensureQuizQuestion(s.setId, ref).then(qq => {
      if (!qq) { toast('题目加载失败', 'err'); renderQuizResult(); return; }
      renderQ(qq, qq.options && qq.options.length >= 2);
    }).catch(e => toast(e.message, 'err'));
  }
}

function submitText() {
  const s = session;
  const q = s._curQ;
  const box = $('#q-input-box');
  if (!q) return;
  const userAnswer = box ? box.value.trim() : '';
  if (!userAnswer) { toast('先写下你的答案吧 ✍️', 'err'); box && box.focus(); return; }
  s._userAnswer = userAnswer;
  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  if (!zone || !actions) return;
  const ms = matchScore(userAnswer, q.answer);
  const matchHtml = ms
    ? '<div class="match-box ' + (ms.pct >= 80 ? 'good' : ms.pct >= 50 ? 'mid' : 'bad') + '">' +
      '<div class="match-head"><span>自动判分提示</span><b>' + (ms.total > 1 ? '命中 ' + ms.hit + ' / ' + ms.total + ' 个要点' : '') + ' · ' + ms.pct + '%</b></div>' +
      '<div class="match-bar"><i style="width:' + ms.pct + '%"></i></div>' +
      '<div class="match-hint">' + esc(ms.hint) + '</div></div>'
    : '';
  zone.innerHTML = matchHtml +
    '<div class="q-answer">' +
    '<div class="ans-label">YOUR ANSWER</div>' +
    '<div class="ans-user">' + esc(userAnswer) + '</div>' +
    '<div class="ans-label" style="margin-top:14px">REFERENCE ANSWER</div>' +
    '<div class="ans-text">' + esc(q.answer || '（本题未提供参考答案）') + '</div>' +
    (q.explanation ? '<div class="ans-exp">' + esc(q.explanation) + '</div>' : '') +
    '</div>';
  actions.innerHTML = '<button class="btn btn-ink" data-action="mark" data-v="1">答对了 ✓</button>' +
    '<button class="btn btn-danger" data-action="mark" data-v="0">答错了 ✗</button>';
}

function showAnswerPanel() {
  const q = session._curQ;
  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  if (!zone || !actions || !q) return;
  zone.innerHTML = '<div class="q-answer"><div class="ans-label">ANSWER</div>' +
    '<div class="ans-text">' + esc(q.answer || '（本题未提供答案）') + '</div>' +
    (q.explanation ? '<div class="ans-exp">' + esc(q.explanation) + '</div>' : '') + '</div>';
  actions.innerHTML = '<button class="btn btn-ink" data-action="mark" data-v="1">认识 ✓</button>' +
    '<button class="btn btn-danger" data-action="mark" data-v="0">不认识 ✗</button>';
}

function revealChoice(oi) {
  const s = session;
  const q = s._curQ;
  if (!q || !q.options || oi >= q.options.length) return;
  const isCorrect = normAnswer(q.options[oi]) === normAnswer(q.answer);
  s.answered++;
  if (isCorrect) s.correct++; else { s.wrongIdx.push(q.id); }
  ServerAPI.answer(s.setId, q.id, isCorrect).catch(() => {});
  refreshWrongBadge();
  if (isCorrect && s.mode === 'wrong') ServerAPI.learnedWrong(q.id).catch(() => {});

  $$('.q-option').forEach((el, i) => {
    el.disabled = true;
    if (normAnswer(q.options[i]) === normAnswer(q.answer)) el.classList.add('correct');
    else if (i === oi) el.classList.add('wrong');
    else el.classList.add('missed');
  });
  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  zone.innerHTML = '<div class="q-answer"><div class="q-feedback ' + (isCorrect ? 'ok' : 'bad') + '">' + (isCorrect ? '✓ 回答正确' : '✗ 回答错误') + '</div>' +
    '<div class="ans-label" style="margin-top:8px">ANSWER</div><div class="ans-text">' + esc(q.answer) + '</div>' +
    (q.explanation ? '<div class="ans-exp">' + esc(q.explanation) + '</div>' : '') + '</div>';
  actions.innerHTML = '<button class="btn btn-primary" data-action="next">' + (s.pos >= s.order.length - 1 ? '查看成绩' : '下一题 →') + '</button>';
}

function markKnown(v) {
  const s = session;
  const q = s._curQ;
  if (!q) return;
  s.answered++;
  const isCorrect = v === 1;
  if (isCorrect) { s.correct++; if (s.mode === 'wrong') ServerAPI.learnedWrong(q.id).catch(() => {}); }
  else s.wrongIdx.push(q.id);
  ServerAPI.answer(s.setId, q.id, isCorrect, s._userAnswer || '').catch(() => {});
  refreshWrongBadge();
  const zone = $('#q-answer-zone');
  const actions = $('#q-actions');
  if (zone && actions) {
    zone.insertAdjacentHTML('beforeend', '<div class="q-feedback ' + (isCorrect ? 'ok' : 'bad') + '" style="margin-top:12px">' + (isCorrect ? '✓ 已掌握' : '✗ 已收入错题本') + '</div>');
    actions.innerHTML = '<button class="btn btn-primary" data-action="next">' + (s.pos >= s.order.length - 1 ? '查看成绩' : '下一题 →') + '</button>';
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
  s.done = true;
  const wrongCount = s.wrongIdx.length;
  const body = $('#quiz-body');
  body.innerHTML = '' +
    '<div class="result-hero">' +
      '<p style="margin:0;color:var(--ink-2);font-size:13px">本轮完成 · ' + esc(s.setTitle) + '</p>' +
      '<div class="rh-title">' + (total === 0 ? '本轮没有作答' : (acc >= 80 ? '漂亮，继续加油' : acc >= 50 ? '还行，再巩固一下' : '别灰心，错题会帮你')) + '</div>' +
      '<div class="ring" style="background:conic-gradient(var(--cyan) ' + acc + '%, var(--line) 0)">' +
        '<div class="ring-inner"><div class="ring-num">' + acc + '%</div><div class="ring-label">正确率</div></div></div>' +
      '<div class="result-stats">' +
        '<div class="rs"><b>' + total + '</b><span>已作答</span></div>' +
        '<div class="rs"><b>' + s.correct + '</b><span>答对</span></div>' +
        '<div class="rs"><b>' + wrongCount + '</b><span>答错/不认识</span></div>' +
      '</div>' +
      '<div class="result-actions">' +
        (wrongCount && s.mode !== 'wrong' ? '<button class="btn btn-danger" data-action="rewrong" data-id="' + s.setId + '">重刷错题</button>' : '') +
        '<button class="btn btn-primary" data-action="replay" data-id="' + s.setId + '">再刷一轮</button>' +
        '<a class="btn btn-ghost" href="#/library">返回题库</a>' +
      '</div>' +
    '</div>';
  session = null;
}
