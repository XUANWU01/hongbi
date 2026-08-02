/* ============================================================
   红笔 HONGBI v3 · 服务端 API 客户端
   会话：设备匿名登录（默认）→ 可注册/登录账号并自动合并
   ============================================================ */
'use strict';

const ServerAPI = {
  identity: null,   // {type:'user'|'device', id, role, username?}

  /* 启动：先恢复本地 token 身份，失败则设备匿名登录 */
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
    try { await apiPost('api/auth/logout'); } catch (e) { /* ignore */ }
    localStorage.removeItem('hb_token');
    this.identity = null;
    return this.deviceLogin();
  },

  isAdmin() { return this.identity && (this.identity.role === 'admin' || this.identity.role === 'superadmin'); },
  roleLabel() {
    if (!this.identity) return '未登录';
    if (this.identity.role === 'superadmin') return '超级管理员';
    if (this.identity.role === 'admin') return '管理员';
    return this.identity.type === 'user' ? this.identity.username : '访客';
  },

  /* ---------- 题库 ---------- */
  listSets(params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, v); });
    return apiGet('api/sets?' + qs.toString());
  },
  getSet(id, params = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, v); });
    return apiGet('api/sets/' + encodeURIComponent(id) + (qs.toString() ? '?' + qs : ''));
  },
  createSet(payload) { return apiPost('api/sets', payload); },
  patchSet(id, fields) { return apiPatch('api/sets/' + encodeURIComponent(id), fields); },
  deleteSet(id) { return apiDelete('api/sets/' + encodeURIComponent(id)); },
  shareSet(id) { return apiPost('api/sets/' + encodeURIComponent(id) + '/share', {}); },
  unshareSet(id) { return apiPost('api/sets/' + encodeURIComponent(id) + '/unshare', {}); },
  appendQuestions(id, jobId) { return apiPost('api/sets/' + encodeURIComponent(id) + '/questions', { jobId }); },

  /* ---------- 上传解析 ---------- */
  upload(file, onProgress) { return apiUpload(file, onProgress); },
  pollJob(jobId, opts) { return pollJob(jobId, opts); },

  /* ---------- 刷题 ---------- */
  answer(setId, questionId, correct, userAnswer) {
    return apiPost('api/quiz/answer', { setId, questionId, correct: correct ? 1 : 0, userAnswer: userAnswer || '' });
  },
  getWrong() { return apiGet('api/wrong'); },
  learnedWrong(questionId) { return apiDelete('api/wrong/' + encodeURIComponent(questionId)); },
  clearWrong() { return apiDelete('api/wrong'); },
  getFavs() { return apiGet('api/favorites'); },
  addFav(questionId) { return apiPost('api/favorites', { questionId }); },
  removeFav(questionId) { return apiDelete('api/favorites/' + encodeURIComponent(questionId)); },
  getStats() { return apiGet('api/stats/me'); },
  getGlobalStats() { return apiGet('api/stats/global'); },

  /* ---------- 审核（管理员） ---------- */
  getReviews(status = 'pending') { return apiGet('api/admin/reviews?status=' + encodeURIComponent(status)); },
  approveReview(id) { return apiPost('api/admin/reviews/' + encodeURIComponent(id) + '/approve', {}); },
  rejectReview(id, reason) { return apiPost('api/admin/reviews/' + encodeURIComponent(id) + '/reject', { reason }); },

  /* ---------- 官方精选题库 ---------- */
  getOfficialSets() { return apiGet('api/admin/official'); },
  createOfficialSet({ jobId, title, category, desc }) { return apiPost('api/admin/official', { jobId, title, category, desc }); },
  cloneOfficialSet({ setId, title, category }) { return apiPost('api/admin/official/clone', { setId, title, category }); },
  deleteOfficialSet(id) { return apiDelete('api/admin/official/' + encodeURIComponent(id)); },

  /* ---------- 用户 ---------- */
  getProfile() { return apiGet('api/user/profile'); },
  updateProfile(data) { return apiPut('api/user/profile', data); },

  /* ---------- 导入 ---------- */
  importData(payload) { return apiPost('api/import', payload); }
};
