/* ============================================================
   红笔 HONGBI · 服务端 API 客户端
   在线（云端共享）模式：公共主题库与服务器同步，跨用户实时可见；
   离线（本地）模式：自动回退到 localStorage。
   ============================================================ */
'use strict';

const ServerAPI = {
  online: false,
  sets: [],
  clientId: (() => {
    let id = localStorage.getItem('hb_client_id');
    if (!id) {
      id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('hb_client_id', id);
    }
    return id;
  })(),

  /* 探测服务端（同源 /api/health，2.5s 超时） */
  async check() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      const res = await fetch('api/health', { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('bad status');
      this.online = true;
      await this.refresh();
    } catch (e) {
      this.online = false;
      this.sets = [];
    }
    return this.online;
  },

  async refresh() {
    const res = await fetch('api/sets');
    if (!res.ok) throw new Error('拉取题库失败');
    const data = await res.json();
    this.sets = data.sets || [];
  },

  /* 同意共享：提交到公共主题库 */
  async create(payload) {
    const res = await fetch('api/sets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, payload, { clientId: this.clientId }))
    });
    if (!res.ok) {
      let msg = '上传失败';
      try { msg = (await res.json()).error || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    const set = await res.json();
    this.sets.unshift(set);
    return set;
  },

  async remove(id) {
    const res = await fetch('api/sets/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok) {
      let msg = '删除失败';
      try { msg = (await res.json()).error || msg; } catch (e) { /* ignore */ }
      throw new Error(msg);
    }
    this.sets = this.sets.filter(s => s.id !== id);
  }
};
