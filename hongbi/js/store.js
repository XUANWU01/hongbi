/* ============================================================
   红笔 HONGBI v2 · 数据层：本地存储 / 题库访问 / 进度 / 错题 / 收藏 / 偏好
   ============================================================ */
'use strict';

const KEY_PUBLIC   = 'hb_public';    // 本地模式下的公共主题库
const KEY_PRIVATE  = 'hb_private';   // 我的私库
const KEY_WRONG    = 'hb_wrong';     // 错题本 [{setId, qIndex, count, at}]
const KEY_FAV      = 'hb_fav';       // 收藏 [{setId, qIndex, at}]
const KEY_STATS    = 'hb_stats';     // 累计统计 {answered, correct, sessions:[], daily:{}}
const KEY_PROGRESS = 'hb_progress';  // 每套题进度 {setId: {answered, correct}}
const KEY_PREF     = 'hb_pref';      // 偏好 {dark: bool}
const KEY_SEEN     = 'hb_seen';

const CATEGORIES = ['计算机', '前端', '语言学习', '数学', '历史', '职场', '常识', '其他'];

const Store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 存储满等异常 */ }
  }
};

/* ---------- 集合访问（云端优先） ---------- */
function publicSets() {
  if (typeof ServerAPI !== 'undefined' && ServerAPI.online) return ServerAPI.sets;
  return Store.get(KEY_PUBLIC, []);
}
function privateSets() { return Store.get(KEY_PRIVATE, []); }
function allSets() { return [...publicSets(), ...privateSets()]; }
function findSet(id) { return allSets().find(s => s.id === id) || null; }

function isMine(s) {
  return s.owner === '我' ||
    (typeof ServerAPI !== 'undefined' && ServerAPI.online && ServerAPI.clientId && s.owner === ServerAPI.clientId);
}

function srcLabel(s) {
  if (s.source === 'private') return '私密';
  if (s.source === 'public') return isMine(s) ? '我的贡献' : '社区共享';
  return '官方精选';
}
function srcChipClass(s) {
  if (s.source === 'private') return 'chip-src is-private';
  if (s.source === 'public') return 'chip-src';
  return 'chip-official';
}

/* ---------- 会话记录 ---------- */
function recordSession(setId, setTitle, correct, total) {
  const stats = normalizeStats(Store.get(KEY_STATS, { answered: 0, correct: 0, sessions: [], daily: {} }));
  stats.sessions.unshift({ at: Date.now(), setId, setTitle, correct, total });
  stats.sessions = stats.sessions.slice(0, 20);
  Store.set(KEY_STATS, stats);
}

function recordWrong(setId, qIndex) {
  const w = Store.get(KEY_WRONG, []);
  const item = w.find(x => x.setId === setId && x.qIndex === qIndex);
  if (item) { item.count++; item.at = Date.now(); }
  else w.push({ setId, qIndex, count: 1, at: Date.now() });
  Store.set(KEY_WRONG, w);
  refreshWrongBadge();
}
function clearWrongItem(setId, qIndex) {
  Store.set(KEY_WRONG, Store.get(KEY_WRONG, []).filter(x => !(x.setId === setId && x.qIndex === qIndex)));
  refreshWrongBadge();
}
function clearAllWrong() { Store.set(KEY_WRONG, []); refreshWrongBadge(); }
function wrongCount() { return Store.get(KEY_WRONG, []).length; }

/* ---------- 收藏（本地 + 云端同步） ---------- */
function isFav(setId, qIndex) {
  return Store.get(KEY_FAV, []).some(f => f.setId === setId && f.qIndex === qIndex);
}
function toggleFav(setId, qIndex, questionId) {
  const favs = Store.get(KEY_FAV, []);
  const i = favs.findIndex(f => f.setId === setId && f.qIndex === qIndex);
  if (i >= 0) {
    favs.splice(i, 1);
    if (typeof ServerAPI !== 'undefined' && ServerAPI.online && questionId) {
      ServerAPI.unfav(setId + ':' + questionId + ':' + ServerAPI.clientId).catch(() => {});
    }
  } else {
    favs.push({ setId, qIndex, at: Date.now() });
    if (typeof ServerAPI !== 'undefined' && ServerAPI.online && questionId) {
      ServerAPI.fav(setId, questionId).catch(() => {});
    }
  }
  Store.set(KEY_FAV, favs);
  return i < 0;
}

/* ---------- 偏好 ---------- */
function pref() { return Store.get(KEY_PREF, {}); }
function applyTheme() {
  const dark = !!pref().dark;
  document.documentElement.classList.toggle('dark', dark);
  const btn = $('#theme-btn');
  if (btn) { btn.textContent = dark ? '☀' : '☾'; btn.title = dark ? '切换到浅色模式' : '切换到深色模式'; }
}

/* ---------- 答题统计（本地，兼容 v1 旧数据结构） ---------- */
function normalizeStats(stats) {
  if (!stats || typeof stats !== 'object') stats = {};
  if (!stats.daily || typeof stats.daily !== 'object') stats.daily = {};
  if (!Array.isArray(stats.sessions)) stats.sessions = [];
  if (typeof stats.answered !== 'number') stats.answered = 0;
  if (typeof stats.correct !== 'number') stats.correct = 0;
  return stats;
}

function recordAnswer(setId, isCorrect) {
  const stats = normalizeStats(Store.get(KEY_STATS, { answered: 0, correct: 0, sessions: [], daily: {} }));
  stats.answered++;
  if (isCorrect) stats.correct++;
  const key = todayKey();
  const d = stats.daily[key] || { a: 0, c: 0 };
  d.a++; if (isCorrect) d.c++;
  stats.daily[key] = d;
  Store.set(KEY_STATS, stats);

  const prog = Store.get(KEY_PROGRESS, {});
  const p = prog[setId] || { answered: 0, correct: 0 };
  p.answered++;
  if (isCorrect) p.correct++;
  prog[setId] = p;
  Store.set(KEY_PROGRESS, prog);
}

function refreshWrongBadge() {
  const n = wrongCount();
  const badge = $('#wrong-badge');
  if (!badge) return;
  badge.hidden = n === 0;
  badge.textContent = n > 99 ? '99+' : n;
}

/* ---------- 初始化 ---------- */
function initData() {
  const pub = Store.get(KEY_PUBLIC, []);
  if (pub.length === 0) Store.set(KEY_PUBLIC, []);
  if (!localStorage.getItem(KEY_PRIVATE)) Store.set(KEY_PRIVATE, []);
  if (!localStorage.getItem(KEY_WRONG)) Store.set(KEY_WRONG, []);
  if (!localStorage.getItem(KEY_FAV)) Store.set(KEY_FAV, []);
  if (!localStorage.getItem(KEY_STATS)) Store.set(KEY_STATS, { answered: 0, correct: 0, sessions: [], daily: {} });
  if (!localStorage.getItem(KEY_PROGRESS)) Store.set(KEY_PROGRESS, {});
  if (!localStorage.getItem(KEY_PREF)) Store.set(KEY_PREF, { dark: false });
  applyTheme();
}
