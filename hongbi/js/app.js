/* ============================================================
   红笔 HONGBI v3 · 应用入口：路由 / 事件 / 登录 / 快捷键
   ============================================================ */
'use strict';

/* ---------- 路由 ---------- */
function parseHash() {
  let h = location.hash.replace(/^#\/?/, '');
  if (!h) h = 'home';
  // 分离 query string
  h = h.split('?')[0];
  const parts = h.split('/').filter(Boolean);
  return { path: parts[0] || 'home', param: parts[1], param2: parts[2] };
}

function setActiveNav(path) {
  const map = { home:'home', library:'library', mine:'mine', wrong:'wrong', fav:'fav', upload:'upload', admin:'admin', parser:'admin', backend:'backend', audit:'backend', users:'backend', official:'backend' };
  $$('#mainnav a, .bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === map[path]));
}

async function render() {
  const { path, param, param2 } = parseHash();
  const view = $('#view');
  setActiveNav(path);
  try {
    switch (path) {
      case 'home': await renderHome(); break;
      case 'library': await renderLibrary(); break;
      case 'mine': await renderMine(); break;
      case 'upload': renderUpload(); break;
      case 'wrong': await renderWrong(); break;
      case 'fav': await renderFav(); break;
      case 'admin': await renderAdmin(); break;
      case 'audit': await renderAudit(); break;
      case 'parser': await renderParserStats(); break;
      case 'official': await renderOfficial(); break;
      case 'users': await renderUsers(); break;
      case 'backend': await renderBackend(); break;
      case 'profile': await renderProfile(); break;
      case 'quiz': await renderQuizView(param, param2); return;
      default: await renderHome(); break;
    }
  } catch (e) {
    console.error(e);
    if (e.message && e.message.includes('未登录')) { openAuthModal(); return; }
    view.innerHTML = emptyState('✗', '页面出错了', e.message || '未知错误', '<button class="btn btn-primary btn-sm" data-action="retry">重试</button>');
  }
  window.scrollTo(0, 0);
  refreshWrongBadge();
  refreshNotifBadge();
  refreshReviewBadge();
}

/* ---------- 身份 UI ---------- */
async function refreshWrongBadge() {
  const badge = $('#wrong-badge');
  if (!badge) return;
  if (!ServerAPI.identity) { badge.hidden = true; return; }
  try {
    const data = await ServerAPI.getWrong();
    const n = data.total || 0;
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : n;
  } catch (e) { badge.hidden = true; }
}

async function refreshNotifBadge() {
  const btn = $('#notif-btn');
  const badge = $('#notif-badge');
  if (!btn) return;
  // 仅注册用户显示铃铛
  if (!ServerAPI.identity || ServerAPI.identity.type !== 'user') {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  try {
    const data = await ServerAPI.getNotifications();
    const n = data.unread || 0;
    if (badge) {
      if (n > 0) { badge.removeAttribute('hidden'); badge.textContent = n > 99 ? '99+' : n; }
      else { badge.setAttribute('hidden', ''); }
    }
  } catch (e) { if (badge) badge.setAttribute('hidden', ''); }
}

async function refreshReviewBadge() {
  const badge = $('#review-badge');
  const adminNav = $('#admin-nav');
  if (!badge || !adminNav || adminNav.hidden) { if (badge) badge.hidden = true; return; }
  if (!ServerAPI.isAdmin()) { badge.hidden = true; return; }
  try {
    const data = await ServerAPI.getReviews('pending');
    const n = (data.items || []).length;
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : (n || '');
  } catch (e) { /* 静默 */ }
}

function openThemeModal() {
  const overlay = openModal(
    '<div class="modal-head"><h3>选择主题</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body"><p class="m-note" style="margin-bottom:12px">选择你喜欢的界面风格，选择后立即生效并自动记住。</p>' +
    '<div class="theme-grid">' + THEMES.map(t =>
      '<button class="theme-card" data-theme-id="' + t.id + '" data-current="' + (getTheme() === t.id ? '1' : '0') + '">' +
      '<span class="theme-icon">' + t.icon + '</span><b>' + t.name + '</b><p>' + t.desc + '</p></button>'
    ).join('') + '</div></div>'
  );
  overlay.addEventListener('click', e => {
    const t = e.target.closest('[data-theme-id]');
    if (!t) return;
    applyTheme(t.dataset.themeId);
    $$('.theme-card', overlay).forEach(c => c.dataset.current = c.dataset.themeId === t.dataset.themeId ? '1' : '0');
    toast('已切换主题：' + (THEMES.find(x => x.id === t.dataset.themeId) || {}).name);
  });
}

function refreshIdentityUI() {
  const btn = $('#auth-btn');
  const conn = $('#conn-dot');
  const adminNav = $('#admin-nav');
  if (!btn) return;
  if (ServerAPI.identity) {
    if (ServerAPI.identity.type === 'device') {
      btn.textContent = '登录';
      btn.classList.remove('is-user');
    } else {
      btn.textContent = ServerAPI.roleLabel();
      btn.classList.add('is-user');
    }
    if (conn) { conn.classList.add('on'); conn.title = '已连接服务器'; }
    if (adminNav) { adminNav.hidden = !ServerAPI.isAdmin(); }
    const backendNav = $('#backend-nav');
    if (backendNav) backendNav.hidden = !(ServerAPI.identity && ServerAPI.identity.role === 'superadmin');
    refreshNotifBadge();
    refreshReviewBadge();
  } else {
    btn.textContent = '登录';
    btn.classList.remove('is-user');
    if (adminNav) adminNav.hidden = true;
    if ($('#backend-nav')) $('#backend-nav').hidden = true;
    if ($('#notif-btn')) $('#notif-btn').hidden = true;
    if ($('#wrong-badge')) $('#wrong-badge').hidden = true;
    if ($('#review-badge')) $('#review-badge').hidden = true;
    if ($('#notif-badge')) $('#notif-badge').hidden = true;
  }
}

function openAuthModal() {
  const overlay = openModal(
    '<div class="modal-head"><h3>登录红笔</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body">' +
      '<div class="auth-tabs">' +
        '<button class="auth-tab active" data-auth-tab="login">登录</button>' +
        '<button class="auth-tab" data-auth-tab="register">注册</button>' +
      '</div>' +
      '<div class="form-grid" style="margin-top:14px">' +
        '<div class="field"><label>用户名</label><input id="a-user" autocomplete="username" placeholder="2-30 个字符"></div>' +
        '<div class="field"><label>密码</label><input id="a-pass" type="password" autocomplete="current-password" placeholder="至少 6 位"></div>' +
        '<div id="auth-msg" style="font-size:12.5px;color:var(--red);min-height:18px"></div>' +
        '<button class="btn btn-primary btn-block" id="auth-submit">登录</button>' +
        '<p class="m-note" style="text-align:center">登录后自动合并当前设备的题库与进度；<br>不注册也可以继续以「访客」身份使用。</p>' +
      '</div>' +
    '</div>'
  );
  const deviceToken = localStorage.getItem('hb_token');

  $$('.auth-tab', overlay).forEach(tab => tab.addEventListener('click', () => {
    $$('.auth-tab', overlay).forEach(t => t.classList.toggle('active', t === tab));
    $('#auth-submit').textContent = tab.dataset.authTab === 'register' ? '注册' : '登录';
  }));

  $('#auth-submit').addEventListener('click', async () => {
    const username = $('#a-user').value.trim();
    const password = $('#a-pass').value;
    const isRegister = $('#auth-submit').textContent === '注册';
    try {
      if (isRegister) await ServerAPI.register(username, password, deviceToken);
      else await ServerAPI.login(username, password, deviceToken);
      // 存储近期登录用户
      saveRecentUser(username);
      closeModal();
      refreshIdentityUI();
      toast('欢迎，' + ServerAPI.roleLabel() + ' ✒️');
      render();
    } catch (e) {
      $('#auth-msg').textContent = e.message;
    }
  });
}

/* 近期登录用户存储 */
function getRecentUsers() {
  try { return JSON.parse(localStorage.getItem('hb_recent_users') || '[]'); }
  catch (e) { return []; }
}
function saveRecentUser(username) {
  const list = getRecentUsers().filter(u => u !== username);
  list.unshift(username);
  localStorage.setItem('hb_recent_users', JSON.stringify(list.slice(0, 8)));
}

/* 切换账号弹窗：显示近期用户 */
function showSwitchAccountModal() {
  const recents = getRecentUsers();
  const deviceToken = localStorage.getItem('hb_token');
  const usersHtml = recents.length
    ? '<div class="recent-users">' +
        '<div class="ru-title">最近登录过的账号</div>' +
        recents.map((u, i) =>
          '<button class="ru-card" data-switch-user="' + escAttr(u) + '">' +
            '<span class="ru-avatar">' + esc(u).slice(0, 1).toUpperCase() + '</span>' +
            '<span class="ru-name">' + esc(u) + '</span>' +
          '</button>').join('') +
      '</div>'
    : emptyState('👤', '还没有登录记录', '登录后这里会显示最近用过的账号', '');

  const overlay = openModal(
    '<div class="modal-head"><h3>切换账号</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
    '<div class="modal-body">' + usersHtml +
      '<div class="hr" style="margin:16px 0"></div>' +
      '<div class="form-grid">' +
        '<div class="field"><label>用户名</label><input id="sw-user" placeholder="输入其他账号名"></div>' +
        '<div class="field"><label>密码</label><input id="sw-pass" type="password" placeholder="至少 6 位"></div>' +
        '<div id="sw-msg" style="font-size:12.5px;color:var(--red);min-height:18px"></div>' +
        '<button class="btn btn-primary btn-block" id="sw-login">登录</button>' +
        '<p class="m-note" style="text-align:center;margin-top:8px">或者<button class="btn-link" data-action="open-auth">注册新账号</button> · <button class="btn-link" data-action="device-switch">设备模式</button></p>' +
      '</div>' +
    '</div>'
  );

  // 点击近期用户 → 自动填用户名
  $$('[data-switch-user]', overlay).forEach(card => {
    card.addEventListener('click', () => {
      $('#sw-user').value = card.dataset.switchUser;
      $('#sw-pass').focus();
    });
  });

  // 登录按钮
  $('#sw-login').addEventListener('click', async () => {
    const username = $('#sw-user').value.trim();
    const password = $('#sw-pass').value;
    if (!username) { $('#sw-msg').textContent = '请输入用户名'; return; }
    if (!password) { $('#sw-msg').textContent = '请输入密码'; return; }
    try {
      await ServerAPI.login(username, password, deviceToken);
      saveRecentUser(username);
      closeModal();
      refreshIdentityUI();
      toast('欢迎回来，' + username + ' ✒️');
      location.hash = '#/home';
    } catch (e) { $('#sw-msg').textContent = e.message; }
  });
}

/* ============================================================
   全局事件
   ============================================================ */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-action],[data-close-modal],[data-start],[data-cat],[data-edit-ok]');
  if (!t) {
    // 点击外部关闭通知下拉
    const nd = $('#notif-dropdown'); if (nd && !nd.hidden) nd.hidden = true;
    return;
  }
  if (t.hasAttribute('data-close-modal')) { closeModal(); return; }
  if (t.hasAttribute('data-start')) { closeModal(); location.hash = '#/quiz/' + t.dataset.start; return; }
  if (t.hasAttribute('data-cat')) { libraryState.cat = t.dataset.cat; libraryState.page = 1; render(); return; }
  if (t.hasAttribute('data-edit-ok')) return;

  const action = t.dataset.action;
  switch (action) {
    case 'retry': render(); break;
    case 'open-auth':
      if (ServerAPI.identity && ServerAPI.identity.type === 'user') { location.hash = '#/profile'; break; }
      openAuthModal(); break;
    case 'open-theme': openThemeModal(); break;
    case 'toggle-notifications': {
      const dd = $('#notif-dropdown');
      if (!dd || !ServerAPI.identity || ServerAPI.identity.type !== 'user') break;
      if (!dd.hidden) { dd.hidden = true; break; }
      dd.innerHTML = loadingHtml('加载通知…');
      dd.hidden = false;
      try {
        const data = await ServerAPI.getNotifications();
        const items = data.items || [];
        dd.innerHTML = items.length
          ? '<div class="notif-list">' +
              items.map(n => '<div class="notif-item' + (n.isRead ? '' : ' unread') + '" data-action="read-notif" data-id="' + n.id + '">' +
                '<div class="notif-title">' + esc(n.title) + '</div>' +
                '<div class="notif-body">' + esc(n.body) + '</div>' +
                '<div class="notif-time">' + relTime(n.createdAt) + '</div></div>').join('') +
              '<div class="notif-footer"><button class="btn btn-ghost btn-sm" data-action="mark-all-read">全部已读</button></div>' +
            '</div>'
          : '<div class="notif-empty">暂无通知</div>';
      } catch (e) { dd.innerHTML = '<div class="notif-empty">加载失败</div>'; }
    } break;
    case 'read-notif': {
      await ServerAPI.markRead(t.dataset.id);
      const dd = $('#notif-dropdown');
      if (dd) dd.hidden = true;
      refreshNotifBadge();
      // 如果是官方升级通知，可跳转题库广场
      const item = document.querySelector('[data-id="' + t.dataset.id + '"]');
      if (item && item.querySelector('.notif-title')?.textContent?.includes('官方')) location.hash = '#/library';
    } break;
    case 'mark-all-read': {
      await ServerAPI.markAllRead();
      $('#notif-dropdown').hidden = true;
      refreshNotifBadge();
    } break;
    case 'go-home': location.hash = '#/home'; break;

    /* 首页快捷 */
    case 'quick-daily': {
      const data = await ServerAPI.listSets({ size: 50 });
      const cand = data.sets.filter(s => s.questionCount > 0);
      if (!cand.length) { toast('题库是空的', 'err'); location.hash = '#/upload'; break; }
      location.hash = '#/quiz/' + cand[Math.floor(Math.random() * cand.length)].id + '/daily';
      break;
    }
    case 'quick-library': location.hash = '#/library'; break;
    case 'quick-import': importModal(); break;
    case 'quick-admin': location.hash = '#/admin'; break;

    /* 题库 */
    case 'start-quiz': location.hash = '#/quiz/' + t.dataset.id; break;
    case 'start-mode': await startSessionMode(t.dataset.id, t.dataset.mode); break;
    case 'preview': await previewModal(t.dataset.id); break;
    case 'preview-question': {
      try {
        const w = (await ServerAPI.getWrong()).items.find(x => x.questionId === t.dataset.qid);
        const f = w || (await ServerAPI.getFavs()).items.find(x => x.questionId === t.dataset.qid);
        questionModal(w || f);
      } catch (e) { toast(e.message, 'err'); }
      break;
    }
    case 'page-prev': if (libraryState.page > 1) { libraryState.page--; render(); } break;
    case 'page-next': libraryState.page++; render(); break;

    /* 我的题库 */
    case 'export': await exportSet(t.dataset.id, false); break;
    case 'export-csv': await exportSet(t.dataset.id, true); break;
    case 'export-docx': await exportDocx(t.dataset.id); break;
    case 'export-pdf': await exportPdf(t.dataset.id); break;

    case 'edit-set': editModal(t.dataset.id); break;
    case 'append-set': {
      uploadState = { appendSetId: t.dataset.id, appendTitle: t.dataset.title || '', appendCount: Number(t.dataset.count || 0) };
      location.hash = '#/upload';
      break;
    }
    case 'delete-set': {
      const ok = await confirmModal({ title: '删除题库', body: '<p class="m-line">确定删除该题库吗？删除后不可恢复。</p>', okText: '删除', danger: true });
      if (!ok) break;
      try { await ServerAPI.deleteSet(t.dataset.id); toast('已删除'); render(); }
      catch (e) { toast('删除失败：' + e.message, 'err'); }
      break;
    }
    case 'share-set': {
      const ok = await confirmModal({ title: '共享到题库广场', body: '<p class="m-line">将该私库提交到公共审核队列？</p><p style="font-size:12px;color:var(--ink-3)">管理员批准后，题库将出现在「题库广场」供所有人使用。</p>', okText: '提交审核' });
      if (!ok) break;
      try { await ServerAPI.shareSet(t.dataset.id); toast('已提交审核，管理员批准后出现 ✓'); render(); }
      catch (e) { toast('提交失败：' + e.message, 'err'); }
      break;
    }
    case 'copy-id': {
      navigator.clipboard.writeText(t.dataset.id).then(() => toast('题库 ID 已复制 ✓')).catch(() => toast('复制失败，请手动复制', 'err'));
      break;
    }
    case 'unshare-set': {
      const label = document.querySelector('[data-id="' + t.dataset.id + '"] .chip')?.textContent || '共享';
      const ok = await confirmModal({ title: '转回私库', body: '<p class="m-line">将该题库从' + label + '状态转回私库？</p><p style="font-size:12px;color:var(--ink-3)">转回后仅在「我的题库」可见，不再出现在题库广场。</p>', okText: '确认转入私库' });
      if (!ok) break;
      try { await ServerAPI.unshareSet(t.dataset.id); toast('已转回私库 ✓'); render(); }
      catch (e) { toast('操作失败：' + e.message, 'err'); }
      break;
    }

    /* 错题 / 收藏 */
    case 'wrong-quiz': location.hash = '#/quiz/' + t.dataset.id + '/wrong'; break;
    case 'wrong-learned':
      try { await ServerAPI.learnedWrong(t.dataset.qid); toast('已掌握，移出错题本 ✓'); render(); }
      catch (e) { toast(e.message, 'err'); }
      break;
    case 'clear-wrong': {
      const ok = await confirmModal({ title: '清空错题本', body: '<p class="m-line">将清空全部错题记录，且无法恢复。</p>', okText: '清空', danger: true });
      if (ok) { await ServerAPI.clearWrong(); toast('错题本已清空'); render(); }
      break;
    }
    case 'unfav':
      try { await ServerAPI.removeFav(t.dataset.qid); toast('已取消收藏'); render(); }
      catch (e) { toast(e.message, 'err'); }
      break;

    /* 审核 */
    case 'review-preview': {
      const r = await ServerAPI.getReviews('pending');
      const s = r.items.find(x => x.id === t.dataset.id);
      if (s) previewModal(s.id);
      break;
    }
    case 'review-approve': {
      const ok = await confirmModal({ title: '批准共享', body: '<p class="m-line">批准后该题库将进入公共主题库，所有人可见。</p>', okText: '批准' });
      if (!ok) break;
      try { await ServerAPI.approveReview(t.dataset.id); toast('已批准，题库已进入公共库'); render(); }
      catch (e) { toast(e.message, 'err'); }
      break;
    }
    case 'review-reject': {
      const overlay = openModal(
        '<div class="modal-head"><h3>驳回贡献</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
        '<div class="modal-body"><div class="field"><label>驳回原因（必填，将反馈给上传者）</label>' +
        '<textarea id="reject-reason" maxlength="200" placeholder="如：题目格式混乱 / 存在重复 / 内容不完整"></textarea></div></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>取消</button>' +
        '<button class="btn btn-danger" id="reject-ok">确认驳回</button></div>'
      );
      $('#reject-ok').addEventListener('click', async () => {
        const reason = $('#reject-reason').value.trim();
        if (!reason) { toast('必须填写驳回原因', 'err'); return; }
        try { await ServerAPI.rejectReview(t.dataset.id, reason); closeModal(); toast('已驳回并反馈原因'); render(); }
        catch (e) { toast(e.message, 'err'); }
      });
      break;
    }

    /* 官方精选题库 */
    case 'create-official': {
      const title = $('#of-title')?.value.trim();
      const cat = $('#of-cat')?.value || '常识/百科';
      const desc = $('#of-desc')?.value.trim();
      if (!title) { toast('请输入题库标题', 'err'); break; }
      const jobId = $('#of-source')?.value;
      const fileInput = $('#of-file');
      const file = fileInput?.files?.[0];
      if (!jobId && !file) { toast('请选择已有解析任务或上传文件', 'err'); break; }
      let useJobId = jobId;
      if (file && !jobId) {
        // 直接上传文件 → 解析 → 创建官方题库
        toast('正在上传并解析文件…');
        try {
          const fd = new FormData(); fd.append('file', file);
          const token = localStorage.getItem('hb_token');
          const res = await fetch('api/upload', { method: 'POST', headers: { Authorization: '***' + token }, body: fd });
          if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
          const { jobId: newJobId } = await res.json();
          // 轮询解析结果
          let job, attempts = 0;
          while (attempts < 120) {
            await new Promise(r => setTimeout(r, 1000));
            job = await (await fetch('api/upload/' + newJobId, { headers: { Authorization: '***' + token } })).json();
            if (job.status === 'done' || job.status === 'failed') break;
            attempts++;
          }
          if (!job || job.status === 'failed') throw new Error(job?.error || '解析失败');
          useJobId = newJobId;
        } catch (e) { toast('上传失败：' + e.message, 'err'); break; }
      }
      if (!useJobId) { toast('素材无效', 'err'); break; }
      try { const r = await ServerAPI.createOfficialSet({ jobId: useJobId, title, category: cat, desc }); toast('已创建官方题库「' + title + '」（' + r.questionCount + '题）'); render(); }
      catch (e) { toast('创建失败：' + e.message, 'err'); }
      break;
    }
    case 'clone-official': {
      // 移除：克隆功能已废弃，使用「升级为官方」替代
      break;
    }
    case 'do-clone-official': {
      // 移除：克隆功能已废弃
      break;
    }
    case 'upgrade-official-id': {
      const setId = $('#clone-id')?.value.trim();
      if (!setId) { toast('请输入题库 ID（从卡片上灰色ID点击复制）', 'err'); break; }
      if (!/^sm/.test(setId)) { toast('无效的题库 ID（应以 sm 开头，请从卡片上点击复制）', 'err'); break; }
      try { await ServerAPI.upgradeOfficialSet(setId); toast('已升级为官方题库 ✓'); render(); }
      catch (e) { toast('升级失败：' + e.message, 'err'); }
      break;
    }
    case 'upgrade-official-quick': {
      try { await ServerAPI.upgradeOfficialSet(t.dataset.id); toast('「' + esc(t.dataset.title) + '」已升为官方 ✓'); render(); }
      catch (e) { toast('升级失败：' + e.message, 'err'); }
      break;
    }
    case 'downgrade-official': {
      const ok = await confirmModal({ title: '降为社区题库', body: '<p class="m-line">将官方题库「' + esc(t.dataset.title) + '」降回社区？</p><p style="font-size:12px;color:var(--ink-3)">降级后恢复为普通公开题库，不再显示为官方精选。</p>', okText: '确认降级', danger: true });
      if (!ok) break;
      try { await ServerAPI.downgradeOfficialSet(t.dataset.id); toast('已降为社区题库 ✓'); render(); }
      catch (e) { toast('降级失败：' + e.message, 'err'); }
      break;
    }
    case 'official-prev': {
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      const p = Math.max(1, Number(params.get('page') || 1) - 1);
      params.set('page', p);
      location.hash = '#/official?' + params.toString();
      break;
    }
    case 'official-next': {
      const params = new URLSearchParams(location.hash.split('?')[1] || '');
      const p = Number(params.get('page') || 1) + 1;
      params.set('page', p);
      location.hash = '#/official?' + params.toString();
      break;
    }
    case 'upgrade-official': {
      const ok = await confirmModal({ title: '升级为官方题库', body: '<p class="m-line">将「' + esc(t.dataset.title) + '」直接升级为官方题库？</p><p style="font-size:12px;color:var(--ink-3)">不克隆、无重复存储。社区题库直接改为官方，原作者会收到通知。</p>', okText: '确认升级' });
      if (!ok) break;
      try { await ServerAPI.upgradeOfficialSet(t.dataset.id); toast('已升级为官方题库 ✓'); render(); }
      catch (e) { toast('升级失败：' + e.message, 'err'); }
      break;
    }
    case 'delete-official': {
      const ok = await confirmModal({ title: '删除官方题库', body: '<p class="m-line">确定删除官方题库「' + esc(t.dataset.title) + '」？此操作不可恢复。</p>', okText: '删除', danger: true });
      if (!ok) break;
      try { await ServerAPI.deleteOfficialSet(t.dataset.id); toast('已删除'); render(); }
      catch (e) { toast('删除失败：' + e.message, 'err'); }
      break;
    }

    /* 用户管理 */
    case 'promote-user': {
      const ok = await confirmModal({ title: '提升为管理员', body: '<p class="m-line">将「' + esc(t.dataset.name) + '」提升为管理员？</p><p style="font-size:12px;color:var(--ink-3)">管理员可以审核题库贡献、查看解析质量。</p>', okText: '确认提升' });
      if (!ok) break;
      try { await ServerAPI.setUserRole(t.dataset.id, 'admin'); toast('已提升为管理员 ✓'); render(); }
      catch (e) { toast('操作失败：' + e.message, 'err'); }
      break;
    }
    case 'demote-user': {
      const ok = await confirmModal({ title: '降为普通用户', body: '<p class="m-line">将「' + esc(t.dataset.name) + '」降为普通用户？</p><p style="font-size:12px;color:var(--ink-3)">降级后该用户将无法访问管理功能。</p>', okText: '确认降级', danger: true });
      if (!ok) break;
      try { await ServerAPI.setUserRole(t.dataset.id, 'user'); toast('已降为普通用户 ✓'); render(); }
      catch (e) { toast('操作失败：' + e.message, 'err'); }
      break;
    }

    /* 用户信息 */
    case 'edit-profile': {
      try {
        const data = await ServerAPI.getProfile();
        const u = data.user;
        const overlay = openModal(
          '<div class="modal-head"><h3>编辑个人资料</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
          '<div class="modal-body"><div class="form-grid">' +
            '<div class="field"><label>用户名（不可修改）</label><input value="' + esc(u.username) + '" disabled style="opacity:.6"></div>' +
            '<div class="field"><label for="ep-nickname">显示昵称</label><input id="ep-nickname" maxlength="30" value="' + esc(u.nickname || '') + '" placeholder="给朋友看的名字"></div>' +
            '<div class="field"><label for="ep-bio">简介</label><textarea id="ep-bio" maxlength="200" placeholder="介绍一下你自己…">' + esc(u.bio || '') + '</textarea></div>' +
          '</div></div>' +
          '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>取消</button>' +
            '<button class="btn btn-primary" id="ep-save">保存</button></div>'
        );
        $('#ep-save').addEventListener('click', async () => {
          const nickname = $('#ep-nickname').value.trim();
          const bio = $('#ep-bio').value.trim();
          try { await ServerAPI.updateProfile({ nickname, bio }); closeModal(); toast('资料已更新 ✓'); render(); }
          catch (e) { toast('保存失败：' + e.message, 'err'); }
        });
      } catch (e) { toast('获取用户数据失败', 'err'); }
      break;
    }
    case 'change-password': {
      const overlay = openModal(
        '<div class="modal-head"><h3>修改密码</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
        '<div class="modal-body"><div class="form-grid">' +
          '<div class="field"><label for="cp-old">旧密码</label><div style="display:flex;gap:4px"><input id="cp-old" type="password" placeholder="当前密码" style="flex:1"><button class="btn btn-ghost btn-sm pw-toggle" data-target="cp-old" type="button">👁</button></div></div>' +
          '<div class="field"><label for="cp-new">新密码</label><div style="display:flex;gap:4px"><input id="cp-new" type="password" placeholder="至少 6 位" style="flex:1"><button class="btn btn-ghost btn-sm pw-toggle" data-target="cp-new" type="button">👁</button></div></div>' +
          '<div class="field"><label for="cp-new2">确认新密码</label><div style="display:flex;gap:4px"><input id="cp-new2" type="password" placeholder="再次输入" style="flex:1"><button class="btn btn-ghost btn-sm pw-toggle" data-target="cp-new2" type="button">👁</button></div></div>' +
          '<div id="cp-msg" style="font-size:12.5px;color:var(--red);min-height:18px"></div>' +
        '</div></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" data-close-modal>取消</button>' +
          '<button class="btn btn-primary" id="cp-save">修改密码</button></div>'
      );
      // 密码显隐切换
      overlay.querySelectorAll('.pw-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const input = document.getElementById(btn.dataset.target);
          if (input) {
            input.type = input.type === 'password' ? 'text' : 'password';
            btn.textContent = input.type === 'password' ? '👁' : '🙈';
          }
        });
      });
      $('#cp-save').addEventListener('click', async () => {
        const oldPwd = $('#cp-old').value;
        const newPwd = $('#cp-new').value;
        const newPwd2 = $('#cp-new2').value;
        if (!oldPwd || !newPwd) { $('#cp-msg').textContent = '请填写旧密码和新密码'; return; }
        if (newPwd !== newPwd2) { $('#cp-msg').textContent = '两次新密码不一致'; return; }
        try { await ServerAPI.changePassword(oldPwd, newPwd); closeModal(); toast('密码已修改 ✓'); }
        catch (e) { $('#cp-msg').textContent = e.message; }
      });
      break;
    }
    case 'logout-account': {
      try { await ServerAPI.logout(); } catch (e) { /* ignore */ }
      localStorage.removeItem('hb_token');
      ServerAPI.identity = null;
      toast('已退出登录');
      location.hash = '#/home';
      refreshIdentityUI();
      break;
    }
    case 'device-switch': {
      closeModal();
      try { await ServerAPI.logout(); } catch (e) { /* ignore */ }
      localStorage.removeItem('hb_token');
      ServerAPI.identity = null;
      try { await ServerAPI.init(); } catch (e) { /* ignore */ }
      refreshIdentityUI();
      if (ServerAPI.identity) toast('已切换为设备（访客）模式');
      else toast('设备模式启动失败，请刷新页面', 'err');
      location.hash = '#/home';
      break;
    }
    case 'switch-account': {
      try { await ServerAPI.logout(); } catch (e) { /* ignore */ }
      localStorage.removeItem('hb_token');
      ServerAPI.identity = null;
      refreshIdentityUI();
      showSwitchAccountModal();
      break;
    }

    /* 上传 */
    case 'open-editor': openQuestionEditor(); break;
    case 'editor-del': {
      if (!uploadState || !uploadState.editedQuestions) break;
      const idx = +t.dataset.idx;
      uploadState.editedQuestions.splice(idx, 1);
      toast('已删除第 ' + (idx + 1) + ' 题');
      openQuestionEditor();
      break;
    }
    case 'editor-merge': {
      if (!uploadState || !uploadState.editedQuestions) break;
      const idx = +t.dataset.idx;
      if (idx <= 0) break;
      const qs = uploadState.editedQuestions;
      // 合并到上一题：将当前题的题干追加到上一题
      qs[idx - 1].q = (qs[idx - 1].q || '') + ' ' + (qs[idx].q || '');
      qs.splice(idx, 1);
      toast('已合并到第 ' + idx + ' 题');
      openQuestionEditor();
      break;
    }
    case 'editor-add': {
      if (!uploadState || !uploadState.editedQuestions) break;
      // 弹出选题型
      const overlay = openModal(
        '<div class="modal-head"><h3>添加题目 · 选择题型</h3><button class="modal-close" data-close-modal aria-label="关闭">✕</button></div>' +
        '<div class="modal-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<button class="btn btn-primary" data-add-type="choice" style="padding:14px">📝 单选题<br><small style="opacity:.6">4 选项可编辑</small></button>' +
          '<button class="btn btn-ghost" data-add-type="multi" style="padding:14px">📋 多选题<br><small style="opacity:.6">4 选项可编辑</small></button>' +
          '<button class="btn btn-ghost" data-add-type="fill" style="padding:14px">✏️ 填空题<br><small style="opacity:.6">无选项</small></button>' +
          '<button class="btn btn-ghost" data-add-type="tf" style="padding:14px">⚖️ 判断题<br><small style="opacity:.6">无选项</small></button>' +
          '<button class="btn btn-ghost" data-add-type="text" style="padding:14px;grid-column:1/-1">📄 简答题<br><small style="opacity:.6">无选项</small></button>' +
        '</div></div>'
      );
      const btns = overlay.querySelectorAll('[data-add-type]');
      btns.forEach(b => b.addEventListener('click', () => {
        const type = b.dataset.addType;
        const isChoice = type === 'choice' || type === 'multi';
        const q = {
          q: '新题目',
          options: isChoice ? ['选项 A', '选项 B', '选项 C', '选项 D'] : [],
          answer: '', explanation: '',
          type: type === 'multi' ? 'multi' : type === 'fill' || type === 'tf' ? 'text' : type
        };
        uploadState.editedQuestions.push(q);
        closeModal();
        toast('已添加' + ({ choice: '单选题', multi: '多选题', fill: '填空题', tf: '判断题', text: '简答题' })[type]);
        openQuestionEditor();
      }));
      break;
    }
    case 'upload-reset': uploadState = null; render(); break;
    case 'confirm-public': await submitUpload(true); break;
    case 'confirm-private': await submitUpload(false); break;
    case 'confirm-append': await submitAppend(); break;

    /* 刷题 */
    case 'pick': if (session) revealChoice(+t.dataset.oi); break;
    case 'toggle': {
      const opt = $('.q-option[data-oi="' + t.dataset.oi + '"]');
      if (!opt || opt.disabled) break;
      opt.classList.toggle('selected');
      const n = $$('.q-option.selected').length;
      const c = $('#multi-count');
      if (c) c.innerHTML = '已选 <b>' + n + '</b> 项';
      break;
    }
    case 'submit-multi': submitMulti(); break;
    case 'submit-text': submitText(); break;
    case 'reveal': showAnswerPanel(); break;
    case 'mark': markKnown(+t.dataset.v); break;
    case 'next': nextQuestion(); break;
    case 'fav': {
      const qid = t.dataset.qid;
      if (!qid || !session) break;
      const btn = $('[data-action="fav"][data-qid="' + qid + '"]');
      const isOn = btn && btn.textContent === '★';
      try {
        if (isOn) { await ServerAPI.removeFav(qid); toast('已取消收藏'); if (btn) btn.textContent = '☆'; }
        else { await ServerAPI.addFav(qid); toast('已收藏 ⭐'); if (btn) btn.textContent = '★'; }
      } catch (e) { toast(e.message, 'err'); }
      break;
    }
    case 'replay': {
      session = null;
      const rt = '#/quiz/' + t.dataset.id;
      if (location.hash === rt) render(); else location.hash = rt;
      break;
    }
    case 'rewrong': location.hash = '#/quiz/' + t.dataset.id + '/wrong'; break;
    case 'quiz-quit': {
      const s = session;
      const ok = await confirmModal({ title: '退出本轮刷题', body: '<p class="m-line">已作答 ' + s.answered + ' 题，进度已同步服务器。<br><span style="color:var(--cyan-2)">下次进入将从第 ' + (s.pos + 1) + ' 题继续。</span></p>', okText: '退出', danger: true });
      if (ok) {
        saveQuizSession();
        session = null;
        location.hash = '#/library';
      }
      break;
    }
    case 'quiz-reset': {
      if (!session) break;
      const ok = await confirmModal({ title: '重新开始', body: '<p class="m-line">将清除当前进度从头开始刷题？</p>', okText: '确认重置', danger: true });
      if (ok) {
        clearQuizSession();
        session.pos = 0; session.correct = 0; session.answered = 0; session.wrongIdx = []; session.done = false;
        renderQuiz();
      }
      break;
    }

  }
});

/* ---------- 键盘快捷键 ---------- */
document.addEventListener('keydown', e => {
  if (!session || session.done) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if ($('#modal-root').innerHTML) return;
  if (!$('.q-tag')) return;
  const isChoice = session._curIsChoice;
  const answered = !!$('[data-action="next"]');

  if (/^[a-dA-D]$/.test(e.key) && isChoice && !answered) {
    const i = e.key.toLowerCase().charCodeAt(0) - 97;
    const opt = $('.q-option[data-oi="' + i + '"]');
    if (opt) { e.preventDefault(); opt.click(); }
    return;
  }
  if (e.key === ' ') {
    const reveal = $('[data-action="reveal"]');
    if (reveal && !answered) { e.preventDefault(); reveal.click(); }
    return;
  }
  if (e.key === 'Enter') {
    if (session._curIsMulti && !answered) {
      const sub = $('[data-action="submit-multi"]');
      if (sub) { e.preventDefault(); sub.click(); }
      return;
    }
    const next = $('[data-action="next"]');
    if (next) { e.preventDefault(); next.click(); }
    return;
  }
  if (/^[fF]$/.test(e.key)) {
    const fav = $('[data-action="fav"]');
    if (fav) { e.preventDefault(); fav.click(); }
    return;
  }
  if (e.key === 'Escape') {
    const quit = $('[data-action="quiz-quit"]');
    if (quit) { e.preventDefault(); quit.click(); }
  }
});

/* ---------- 启动 ---------- */
window.addEventListener('hashchange', render);

(async function boot() {
  // 连接探测（公开接口，无需 token）
  try {
    const res = await fetch('api/health', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error('bad');
  } catch (e) {
    const conn = $('#conn-dot');
    if (conn) { conn.classList.add('off'); conn.title = '无法连接服务器'; }
  }
  // 身份初始化：恢复 token 或设备匿名登录
  try {
    await ServerAPI.init();
  } catch (e) {
    toast('无法连接服务器：' + e.message, 'err');
  }
  applyTheme();
  refreshIdentityUI();
  refreshWrongBadge();
  await render();
})();
