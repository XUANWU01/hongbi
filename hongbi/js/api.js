/* ============================================================
   红笔 HONGBI v3 · 服务端 API 客户端
   ============================================================ */
'use strict';

const ServerAPI = {
  identity: null,   // {type:'user'|'device', id, role, username?}

  async init() {
    const token = localStorage.getItem('hb_token');
    if (token) {
      try {
        const me = await apiGet('api/auth/me');
        this.identity = me.identity;
        return true;
      } catch (e) { /* token 失效，走设备登录 */ }
    }
    return this.deviceLogin();
  },

  async deviceLogin() {
    const data = await apiPost('api/auth/device');
    localStorage.setItem('hb_token', data.token);
    this.identity = data.identity;
    return true;
  },

  async register(username, password, deviceToken) {
    const data = await apiPost('api/auth/register', { username, password, deviceToken: deviceToken || null });
    localStorage.setItem('hb_token', data.token);
    this.identity = data.identity;
    return data.identity;
  },

  async login(username, password, deviceToken) {
    const data = await apiPost('api/auth/login', { username, password, deviceToken: deviceToken || null });
    localStorage.setItem('hb_token', data.token);
    this.identity = data.identity;
    return data.identity;
  },

  async logout() {
    try { await apiPost('api/auth/logout', {}); } catch (e) { /* ignore */ }
    localStorage.removeItem('hb_token');
    this.identity = null;
    return this.deviceLogin();
  },

  async claimAdmin(key) {
    const data = await apiPost('api/auth/claim-admin', { key });
    this.identity.role = data.role;
    return data;
  },

  isAdmin() { return this.identity && (this.identity.role === 'admin' || this.identity.role === 'superadmin'); },
  roleLabel() {
    if (!this.identity) return '未登录';
    if (this.identity.role === 'superadmin') return '超级管理员';
    if (this.identity.role === 'admin') return '管理员';
    return this.identity.type === 'user' ? this.identity.username : '访客';
  },

  /* ---------- 题库 ---------- */
  listSets(opts = {}) {
    const qs = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, v); });
    return apiGet('api/sets?' + qs.toString());
  },
  getSet(id, opts = {}) {
    const qs = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, v); });
    return apiGet('api/sets/' + encodeURIComponent(id) + (qs.toString() ? '?' + qs.toString() : ''));
  },
  patchSet(id, data) { return apiPatch('api/sets/' + encodeURIComponent(id), data); },
  deleteSet(id) { return apiDelete('api/sets/' + encodeURIComponent(id)); },
  shareSet(id) { return apiPost('api/sets/' + encodeURIComponent(id) + '/share', {}); },
  unshareSet(id) { return apiPost('api/sets/' + encodeURIComponent(id) + '/unshare', {}); },

  /* ---------- 刷题 ---------- */
  answer(setId, questionId, correct, answerText) {
    return apiPost('api/quiz/answer', { setId, questionId, correct, answerText: answerText || '' });
  },
  getWrong() { return apiGet('api/wrong'); },
  learnedWrong(qid) { return apiDelete('api/wrong/' + encodeURIComponent(qid)); },
  getFavs() { return apiGet('api/favorites'); },
  toggleFav(questionId) { return apiPost('api/favorites', { questionId }); },
  getStats() { return apiGet('api/stats/me'); },

  /* ---------- 上传 ---------- */
  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'api/upload');
      const token = localStorage.getItem('hb_token');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => {
        try { const r = JSON.parse(xhr.responseText); resolve(r); }
        catch (e) { reject(new Error('解析响应失败')); }
      };
      xhr.onerror = () => reject(new Error('上传失败'));
      xhr.send(fd);
    });
  },
  async pollJob(jobId, { onStatus } = {}) {
    while (true) {
      const job = await apiGet('api/upload/' + encodeURIComponent(jobId));
      if (onStatus) onStatus(job);
      if (job.status === 'done' || job.status === 'failed') return job;
      await new Promise(r => setTimeout(r, job.status === 'pending' ? 2000 : 800));
    }
  },
  cancelJob(jobId) { return apiPost('api/upload/' + encodeURIComponent(jobId) + '/cancel', {}); },
  retryJob(jobId) { return apiPost('api/upload/' + encodeURIComponent(jobId) + '/retry', {}); },
  uploadMulti(files) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      files.forEach(f => fd.append('files', f));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'api/uploads');
      const token = localStorage.getItem('hb_token');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onload = () => {
        try { const r = JSON.parse(xhr.responseText); resolve(r); }
        catch (e) { reject(new Error('解析响应失败')); }
      };
      xhr.onerror = () => reject(new Error('上传失败'));
      xhr.send(fd);
    });
  },
  uploadZip(file) {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'api/upload/zip');
      const token = localStorage.getItem('hb_token');
      if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.onload = () => {
        try { const r = JSON.parse(xhr.responseText); resolve(r); }
        catch (e) { reject(new Error('解析响应失败')); }
      };
      xhr.onerror = () => reject(new Error('上传失败'));
      xhr.send(fd);
    });
  },
  createSet(data) { return apiPost('api/sets', data); },
  appendQuestions(setId, jobId) { return apiPost('api/sets/' + encodeURIComponent(setId) + '/questions', { jobId }); },
  importData(payload) { return apiPost('api/sets/import', payload); },

  /* ---------- 管理 ---------- */
  getReviews(status) { return apiGet('api/admin/reviews?status=' + encodeURIComponent(status || 'pending')); },
  approveReview(id) { return apiPost('api/admin/reviews/' + encodeURIComponent(id) + '/approve', {}); },
  rejectReview(id, reason) { return apiPost('api/admin/reviews/' + encodeURIComponent(id) + '/reject', { reason }); },

  /* ---------- 官方精选题库 ---------- */
  getOfficialSets(opts = {}) {
    const qs = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => { if (v !== undefined && v !== null) qs.set(k, v); });
    return apiGet('api/admin/official?' + qs.toString());
  },
  createOfficialSet({ jobId, title, category, desc }) { return apiPost('api/admin/official', { jobId, title, category, desc }); },
  deleteOfficialSet(id) { return apiDelete('api/admin/official/' + encodeURIComponent(id)); },
  upgradeOfficialSet(setId) { return apiPost('api/admin/official/upgrade', { setId }); },
  downgradeOfficialSet(id) { return apiPost('api/admin/official/' + encodeURIComponent(id) + '/downgrade', {}); },

  /* ---------- 用户管理 ---------- */
  getUsers() { return apiGet('api/admin/users'); },
  setUserRole(userId, role) { return apiPatch('api/admin/users/' + encodeURIComponent(userId) + '/role', { role }); },

  /* ---------- 用户 ---------- */
  getProfile() { return apiGet('api/user/profile'); },
  updateProfile(data) { return apiPut('api/user/profile', data); },

  /* ---------- 通知 ---------- */
  getNotifications() { return apiGet('api/notifications'); },
  markRead(notifId) { return apiPatch('api/notifications/' + encodeURIComponent(notifId) + '/read', {}); },
  markAllRead() { return apiPatch('api/notifications/read-all', {}); },

  /* ---------- 导入 ---------- */
  getTemplates() { return apiGet('api/templates/list'); },
};
