/* ============================================================
   红笔 HONGBI v3 · 核心工具层：DOM / 格式化 / Toast / 模态 / 请求封装
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

const CATEGORIES = [
  // 公务员 & 事业编
  '公务员（行测/申论）', '事业单位', '选调/三支一扶',
  // 教师
  '教师资格证', '教师招聘',
  // 考研
  '考研政治', '考研数学', '考研英语', '考研专业课',
  // 法律 & 公安
  '法律职业资格（法考）', '公安/辅警',
  // 财会 & 金融
  '会计（初级/中级/CPA）', '银行招聘', '证券/基金/期货从业', '经济师',
  // 建筑 & 工程
  '建造师（一建/二建）', '消防/安全工程师', '造价/监理工程师',
  // 医药卫生
  '执业医师/药师', '护士/护理', '健康管理师',
  // 语言
  '英语四六级', '雅思/托福', '日语', '普通话',
  // IT
  '计算机等级/软考', '编程（前端/后端）',
  // 其他
  '驾照', '导游', '常识/百科', '其他'
];

/* ---------- 主题系统 ---------- */
const THEMES = [
  { id: 'dark-neon', name: '暗夜科技', desc: '深空霓虹 · 默认', icon: '◈' },
  { id: 'paper', name: '纸墨经典', desc: '暖纸红笔 · 护眼', icon: '✒' },
  { id: 'dawn', name: '晨雾', desc: '清爽浅蓝 · 极简', icon: '☁' },
  { id: 'cyber', name: '赛博脉冲', desc: '紫红霓虹 · 深色', icon: '◉' }
];
function getTheme() { return localStorage.getItem('hb_theme') || 'dark-neon'; }
function applyTheme(id) {
  const t = id || getTheme();
  localStorage.setItem('hb_theme', t);
  document.documentElement.dataset.theme = t;
  const btn = $('#theme-btn');
  if (btn) { const m = THEMES.find(x => x.id === t); btn.textContent = m ? m.icon : '◈'; btn.title = '切换主题（当前：' + (m ? m.name : '') + '）'; }
}

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

/* 简答模糊判分：把参考答案拆成要点，检查用户作答命中几个（提示性质，不替代自评） */
function matchScore(userAnswer, referenceAnswer) {
  const norm = s => String(s == null ? '' : s)
    .replace(/[\s，。；、,.!?！？:：()（）“”"'『』「」【】\-—]/g, '')
    .toLowerCase();
  const ua = norm(userAnswer);
  const ra = norm(referenceAnswer);
  if (!ua || !ra) return null;
  if (ua === ra) return { hit: 1, total: 1, pct: 100, hint: '完全一致' };
  // 按分隔符拆要点
  const parts = String(referenceAnswer).split(/[，,、；;。\n]+/).map(s => norm(s)).filter(s => s.length >= 2);
  if (parts.length <= 1) {
    // 单要点：子串包含或字符重叠率
    const hit = ua.includes(ra) || ra.includes(ua);
    return { hit: hit ? 1 : 0, total: 1, pct: hit ? 90 : 20, hint: hit ? '基本一致' : '与参考答案差异较大' };
  }
  let hit = 0;
  parts.forEach(p => { if (ua.includes(p) || p.includes(ua)) hit++; });
  const pct = Math.round(hit / parts.length * 100);
  const hint = pct >= 80 ? '要点基本齐全，很棒' : pct >= 50 ? '命中部分要点，还差一些' : hit === 0 ? '没有命中要点，差异较大' : '只命中少数要点';
  return { hit, total: parts.length, pct, hint };
}

function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

/* ---------- Toast ---------- */
function toast(msg, type = 'ok', ms = 2800) {
  const root = $('#toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'err' ? 'err' : 'ok');
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; }, ms - 400);
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

/* ---------- 请求封装（带 token 与错误处理） ---------- */
async function api(method, path, body) {
  const headers = {};
  const token = localStorage.getItem('hb_token');
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem('hb_token'); }
    throw new Error((data && data.error) || '请求失败(' + res.status + ')');
  }
  return data;
}
const apiGet = (p) => api('GET', p);
const apiPost = (p, b) => api('POST', p, b);
const apiPatch = (p, b) => api('PATCH', p, b);
const apiPut = (p, b) => api('PUT', p, b);
const apiDelete = (p) => api('DELETE', p);

/* ---------- 上传文件（multipart，带进度回调） ---------- */
function apiUpload(file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = localStorage.getItem('hb_token');
    xhr.open('POST', 'api/upload');
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = e => { if (onProgress && e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(data.error || '上传失败'));
        else resolve(data);
      } catch (e) { reject(new Error('上传失败')); }
    };
    xhr.onerror = () => reject(new Error('网络错误'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

/* ---------- 解析任务轮询 ---------- */
async function pollJob(jobId, { interval = 1500, maxWait = 120000, onStatus } = {}) {
  const start = Date.now();
  for (;;) {
    const job = await apiGet('api/upload/' + jobId);
    if (onStatus) onStatus(job);
    if (job.status === 'done' || job.status === 'failed') return job;
    if (Date.now() - start > maxWait) throw new Error('解析超时，请稍后重试');
    await new Promise(r => setTimeout(r, interval));
  }
}
