/* ============================================================
   红笔 HONGBI v2 · 应用入口：路由 / 全局事件 / 键盘快捷键 / 启动
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
  const map = { home: 'home', library: 'library', mine: 'mine', wrong: 'wrong', fav: 'fav', upload: 'upload' };
  $$('#mainnav a, .bottom-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === map[path]);
  });
}

async function render() {
  const { path, param, param2 } = parseHash();
  const view = $('#view');
  setActiveNav(path);
  try {
    switch (path) {
      case 'home': view.innerHTML = renderHome(); break;
      case 'library': await renderLibrary(); break;
      case 'mine': view.innerHTML = renderMine(); break;
      case 'upload': view.innerHTML = renderUpload(); bindUpload(); break;
      case 'wrong': await renderWrong(); break;
      case 'fav': await renderFav(); break;
      case 'quiz': await renderQuizView(param, param2); return;
      default: view.innerHTML = renderHome(); break;
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = emptyState('💥', '页面出错了', e.message || '未知错误', '<button class="btn btn-primary btn-sm" data-action="go-home">返回工作台</button>');
  }
  window.scrollTo(0, 0);
  refreshWrongBadge();
}

/* ---------- 服务模式指示 ---------- */
function updateServerPill() {
  const pill = $('#server-pill');
  if (!pill) return;
  const online = typeof ServerAPI !== 'undefined' && ServerAPI.online;
  pill.className = 'server-pill ' + (online ? 'online' : 'offline');
  pill.textContent = online ? '☁ 云端共享' : '本地模式';
  pill.title = online ? '已连接服务器：公共主题库实时同步' : '未连接服务器：数据仅保存在本机（node server/server.js 开启共享）';
}

/* ============================================================
   全局事件（事件委托）
   ============================================================ */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-action],[data-close-modal],[data-start],[data-cat],[data-edit-ok]');
  if (!t) return;

  if (t.hasAttribute('data-close-modal')) { closeModal(); return; }
  if (t.hasAttribute('data-start')) { const id = t.dataset.start; closeModal(); location.hash = '#/quiz/' + id; return; }
  if (t.hasAttribute('data-cat')) { libraryState.cat = t.dataset.cat; libraryState.page = 1; render(); return; }
  if (t.hasAttribute('data-edit-ok')) return; // 由 editModal 内部处理

  const action = t.dataset.action;
  const online = typeof ServerAPI !== 'undefined' && ServerAPI.online;

  switch (action) {
    case 'go-home': location.hash = '#/home'; break;

    case 'dismiss-seen': Store.set(KEY_SEEN, true); render(); break;

    case 'theme-toggle':
      Store.set(KEY_PREF, Object.assign(pref(), { dark: !pref().dark }));
      applyTheme();
      break;

    /* ---- 首页 ---- */
    case 'quick-continue': {
      const last = Store.get(KEY_STATS, { sessions: [] }).sessions[0];
      if (last) location.hash = '#/quiz/' + last.setId;
      else toast('还没有刷题记录', 'err');
      break;
    }
    case 'quick-daily': {
      const sets = allSets();
      const cand = sets.filter(s => qCount(s) > 0);
      if (!cand.length) { toast('还没有题库，先上传一份吧', 'err'); location.hash = '#/upload'; break; }
      location.hash = '#/quiz/' + cand[Math.floor(Math.random() * cand.length)].id + '/daily';
      break;
    }
    case 'replay-set': location.hash = '#/quiz/' + t.dataset.id; break;

    /* ---- 题库 ---- */
    case 'start-quiz': location.hash = '#/quiz/' + t.dataset.id; break;
    case 'start-mode': {
      const set = await ensureSet(t.dataset.id);
      if (set) startSessionMode(set, t.dataset.mode);
      break;
    }
    case 'resume-quiz': {
      if (session) renderQuiz();
      else { location.hash = '#/quiz/' + t.dataset.id; }
      break;
    }
    case 'preview': {
      const set = await ensureSet(t.dataset.id);
      if (set) previewModal(set);
      break;
    }
    case 'preview-question': {
      const set = await ensureSet(t.dataset.id);
      if (set) questionAnswerModal(set, (set.questions || [])[+t.dataset.idx]);
      break;
    }
    case 'page-prev': if (libraryState.page > 1) { libraryState.page--; render(); } break;
    case 'page-next': libraryState.page++; render(); break;

    /* ---- 我的题库 ---- */
    case 'export': { const set = await ensureSet(t.dataset.id); if (set) exportSet(set, false); break; }
    case 'export-csv': { const set = await ensureSet(t.dataset.id); if (set) exportSet(set, true); break; }
    case 'edit-set': { const set = await ensureSet(t.dataset.id); if (set) editModal(set); break; }
    case 'append-set': {
      const set = await ensureSet(t.dataset.id);
      if (!set) break;
      uploadState = { appendSetId: set.id, appendTitle: set.title, appendCount: qCount(set) };
      location.hash = '#/upload';
      break;
    }
    case 'delete-set': {
      const set = await ensureSet(t.dataset.id);
      if (!set) break;
      const blockReason = (online && set.source === 'official') ? '官方精选题库不可删除。'
        : (online && set.source === 'public' && !isMine(set)) ? '云端模式下只能删除自己的贡献。' : null;
      if (blockReason) { toast(blockReason, 'err'); break; }
      const ok = await confirmModal({
        title: '删除题库',
        body: '<p class="m-line">确定删除「' + esc(set.title) + '」吗？共 ' + qCount(set) + ' 题。' +
          (set.source === 'public' ? '<br><span style="color:var(--red-deep)">它是公共主题库中的共享内容，删除后其他用户将无法继续刷到它。</span>' : '') + '</p>',
        okText: '删除', danger: true
      });
      if (!ok) break;
      try {
        if (set.source === 'public' && online) { await ServerAPI.remove(set.id); toast('已从云端删除「' + set.title + '」'); }
        else {
          if (set.source === 'public') Store.set(KEY_PUBLIC, publicSets().filter(s => s.id !== set.id));
          else Store.set(KEY_PRIVATE, privateSets().filter(s => s.id !== set.id));
          toast('已删除「' + set.title + '」');
        }
        render();
      } catch (err) { toast('删除失败：' + err.message, 'err'); }
      break;
    }

    /* ---- 错题 / 收藏 ---- */
    case 'wrong-quiz': location.hash = '#/quiz/' + t.dataset.id + '/wrong'; break;
    case 'wrong-preview': {
      const set = await ensureSet(t.dataset.id);
      if (set) questionAnswerModal(set, (set.questions || [])[+t.dataset.idx]);
      break;
    }
    case 'wrong-learned':
      clearWrongItem(t.dataset.id, +t.dataset.idx);
      toast('已掌握，移出错题本 ✓');
      render();
      break;
    case 'clear-wrong': {
      const ok = await confirmModal({ title: '清空错题本', body: '<p class="m-line">将移除错题本中的全部 ' + wrongCount() + ' 条记录，且无法恢复。</p>', okText: '清空', danger: true });
      if (ok) { clearAllWrong(); render(); toast('错题本已清空'); }
      break;
    }
    case 'fav': {
      const s = session;
      if (!s) break;
      const idx = +t.dataset.idx;
      const added = toggleFav(s.set.id, idx, (s.set.questions[idx] || {}).id);
      toast(added ? '已收藏 ⭐' : '已取消收藏');
      const btn = $('[data-action="fav"][data-idx="' + idx + '"]');
      if (btn) { btn.classList.toggle('on', added); btn.textContent = added ? '★' : '☆'; }
      break;
    }
    case 'unfav': {
      const idx = +t.dataset.idx;
      const favs = Store.get(KEY_FAV, []);
      Store.set(KEY_FAV, favs.filter(f => !(f.setId === t.dataset.id && f.qIndex === idx)));
      toast('已取消收藏');
      render();
      break;
    }

    /* ---- 上传 / 追加 ---- */
    case 'upload-reset': uploadState = null; render(); break;
    case 'confirm-public': await submitUpload(true); break;
    case 'confirm-private': await submitUpload(false); break;
    case 'confirm-append': await submitAppend(); break;

    /* ---- 刷题 ---- */
    case 'pick': if (session) revealChoice(+t.dataset.oi); break;
    case 'reveal': showAnswerPanel(); break;
    case 'mark': markKnown(+t.dataset.v); break;
    case 'next': nextQuestion(); break;
    case 'replay': location.hash = '#/quiz/' + t.dataset.id; break;
    case 'rewrong': location.hash = '#/quiz/' + t.dataset.id + '/wrong'; break;
    case 'quiz-quit': {
      const s = session;
      const total = s.order.length;
      const ok = await confirmModal({
        title: '退出本轮刷题',
        body: '<p class="m-line">当前进度 ' + Math.min(s.pos + 1, total) + ' / ' + total + ' 题，已答对的会累计到统计中。</p>',
        okText: '退出', danger: true
      });
      if (ok) { session = null; location.hash = '#/quiz/' + s.set.id; }
      break;
    }
  }
});

/* ---------- 键盘快捷键（刷题中） ---------- */
document.addEventListener('keydown', e => {
  if (!session || session.done) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if ($('#modal-root').innerHTML) return;
  const tag = $('.q-tag');
  if (!tag) return;
  const isChoice = !!$('.q-option');
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

/* ============================================================
   启动
   ============================================================ */
window.addEventListener('hashchange', render);

(async function boot() {
  initData();
  refreshWrongBadge();
  updateServerPill();
  await render();
  if (typeof ServerAPI !== 'undefined') {
    const ok = await ServerAPI.check();
    updateServerPill();
    if (ok) {
      // 云端题库可能已变化：刷新广场/首页等依赖列表的视图
      const { path } = parseHash();
      if (path === 'library' || path === 'mine' || path === 'home') render();
      toast('已连接服务器，公共主题库实时共享中 ☁');
    }
  }
})();
