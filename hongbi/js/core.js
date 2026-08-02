/* ============================================================
   红笔 HONGBI v2 · 核心工具层：DOM / 格式化 / Toast / 模态
   ============================================================ */
'use strict';

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
  return String(s == null ? '' : s).replace(/^\s*[A-Fa-f][.、)）．]\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- Toast ---------- */
function toast(msg, type = 'ok', ms = 2600) {
  const root = $('#toast-root');
  if (!root) return;
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
  const firstFocus = $('input,select,textarea,button', $('.modal', root));
  if (firstFocus) setTimeout(() => firstFocus.focus(), 60);
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

/* ---------- 在线脚本加载（PDF/Word 解析库） ---------- */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('加载在线解析库失败，请检查网络后重试'));
    document.head.appendChild(s);
  });
}
