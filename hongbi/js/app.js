/* ============================================================
   红笔 HONGBI v3 · 应用入口：路由 / 事件 / 登录 / 快捷键
   ============================================================ */
'use strict';

/* ---------- 路由 ---------- */
function parseHash() {
  let h = location.hash.replace(/^#\/?/, '');
  if (!h) h = 'home';
  const parts = h.split('/').filter(Boolean);
  return { path: parts[0] || 'home', param: parts[1], param2: parts[2] };
}

function setActiveNav(path) {
  const map = { home: 'home', library: 'library', mine: 'mine', wrong: 'wrong', fav: 'fav', upload: 'upload', admin: 'admin' };
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
}

/* ---------- 身份 UI ---------- */
async function refreshWrongBadge() {
  const badge = $('#wrong-badge');
  if (!badge) return;
  try {
    const data = await ServerAPI.getWrong();
    const n = data.total || 0;
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : n;
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
    btn.textContent = ServerAPI.roleLabel();
    btn.classList.add('is-user');
    if (conn) { conn.classList.add('on'); conn.title = '已连接服务器'; }
    if (adminNav) { adminNav.hidden = !ServerAPI.isAdmin(); }
  } else {
    btn.textContent = '登录';
    btn.classList.remove('is-user');
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
      closeModal();
      refreshIdentityUI();
      toast('欢迎，' + ServerAPI.roleLabel() + ' ✒️');
      render();
    } catch (e) {
      $('#auth-msg').textContent = e.message;
    }
  });
}

/* ============================================================
   全局事件
   ============================================================ */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-action],[data-close-modal],[data-start],[data-cat],[data-edit-ok]');
  if (!t) return;
  if (t.hasAttribute('data-close-modal')) { closeModal(); return; }
  if (t.hasAttribute('data-start')) { closeModal(); location.hash = '#/quiz/' + t.dataset.start; return; }
  if (t.hasAttribute('data-cat')) { libraryState.cat = t.dataset.cat; libraryState.page = 1; render(); return; }
  if (t.hasAttribute('data-edit-ok')) return;

  const action = t.dataset.action;
  switch (action) {
    case 'retry': render(); break;
    case 'open-auth': openAuthModal(); break;
    case 'open-theme': openThemeModal(); break;
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

    /* 上传 */
    case 'upload-reset': uploadState = null; render(); break;
    case 'confirm-public': await submitUpload(true); break;
    case 'confirm-private': await submitUpload(false); break;
    case 'confirm-append': await submitAppend(); break;

    /* 刷题 */
    case 'pick': if (session) revealChoice(+t.dataset.oi); break;
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
      const ok = await confirmModal({ title: '退出本轮刷题', body: '<p class="m-line">已作答 ' + s.answered + ' 题，进度已同步服务器。</p>', okText: '退出', danger: true });
      if (ok) {
        session = null;
        const qt = '#/quiz/' + s.setId;
        if (location.hash === qt) render(); else location.hash = qt;
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
