/* ============================================================
   红笔 HONGBI v2 · 服务端 API 客户端
   云端共享模式：公共题库与服务器同步（分页搜索/详情缓存/收藏/答题流水）；
   本地模式：自动回退 localStorage。
   ============================================================ */
'use strict';

const ServerAPI = {
  online: false,
  sets: [],        // 列表缓存（含 questionCount）
  cache: {},       // id -> 完整题库（含 questions）

  clientId: (() => {
    let id = localStorage.getItem('hb_client_id');
    if (!id) {
      id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('hb_client_id', id);
    }
    return id;
  })(),

  async check() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch('api/health', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('bad status');
      this.online = true;
      await this.fetchAll();
    } catch (e) {
      this.online = false;
      this.sets = [];
    }
    return this.online;
  },

  async fetchAll() {
    const res = await fetch('api/sets?size=200');
    if (!res.ok) throw new Error('拉取题库失败');
    const data = await res.json();
    this.sets = data.sets || [];
    this.cache = {};
  },

  /* 广场搜索（服务端分页） */
  async search(params = {}) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.cat && params.cat !== '全部') qs.set('cat', params.cat);
    if (params.sort) qs.set('sort', params.sort);
    qs.set('page', params.page || 1);
    qs.set('size', params.size || 12);
    const res = await fetch('api/sets?' + qs.toString());
    if (!res.ok) throw new Error('搜索失败');
    return res.json();
  },

  /* 题库详情（含题目），带缓存 */
  async fetchSet(id) {
    if (this.cache[id]) return this.cache[id];
    const res = await fetch('api/sets/' + encodeURIComponent(id));
    if (!res.ok) throw new Error('题库不存在');
    const set = await res.json();
    this.cache[id] = set;
    return set;
  },

  async create(payload) {
    const res = await fetch('api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, payload, { clientId: this.clientId }))
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || '上传失败');
    const set = await res.json();
    this.sets.unshift({ id: set.id, title: set.title, desc: set.desc, category: set.category, tags: set.tags, source: set.source, owner: set.owner, createdAt: set.createdAt, questionCount: set.questions.length });
    this.cache[set.id] = set;
    return set;
  },

  async patch(id, fields) {
    const res = await fetch('api/sets/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, fields, { clientId: this.clientId }))
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || '修改失败');
    const s = this.sets.find(x => x.id === id);
    if (s) Object.assign(s, fields);
    if (this.cache[id]) Object.assign(this.cache[id], fields);
    return true;
  },

  async remove(id) {
    const res = await fetch('api/sets/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { 'x-client-id': this.clientId }
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || '删除失败');
    this.sets = this.sets.filter(s => s.id !== id);
    delete this.cache[id];
  },

  async appendQuestions(id, questions) {
    const res = await fetch('api/sets/' + encodeURIComponent(id) + '/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions, clientId: this.clientId })
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))).error) || '追加失败');
    const r = await res.json();
    const s = this.sets.find(x => x.id === id);
    if (s) s.questionCount = r.total;
    delete this.cache[id];
    return r;
  },

  /* 答题流水（云端"人气"统计，静默上报） */
  attempt(setId, questionId, correct) {
    if (!this.online) return;
    fetch('api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setId, questionId, correct: correct ? 1 : 0, clientId: this.clientId })
    }).catch(() => {});
  },

  async fav(setId, questionId) {
    const res = await fetch('api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setId, questionId, clientId: this.clientId })
    });
    if (!res.ok) throw new Error('收藏失败');
  },
  async unfav(id) {
    await fetch('api/favorites/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {});
  },

  async globalStats() {
    const res = await fetch('api/stats/global');
    if (!res.ok) return null;
    return res.json();
  }
};

/* 确保拿到某套题库的完整题目：云端取详情/缓存（私库等本地数据取不到时回退本地） */
async function ensureSet(id) {
  if (typeof ServerAPI !== 'undefined' && ServerAPI.online) {
    try { return await ServerAPI.fetchSet(id); } catch (e) { /* 私库或已删除：回退本地 */ }
  }
  return findSet(id) || null;
}
