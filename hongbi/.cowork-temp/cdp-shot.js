// 通过 CDP 截图保存到本地文件
const fs = require('fs');
const CDP_HTTP = 'http://127.0.0.1:18800';
const OUT_DIR = 'C:/Users/34940/lobsterai/project/hongbi/.cowork-temp/shots';

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const targets = await (await fetch(CDP_HTTP + '/json')).json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('8712'));
  if (!page) { console.log('NO_PAGE'); return; }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params = {}) => new Promise(res => {
    const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const shot = async (name, opts = {}) => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...opts });
    const base64 = r.result.data;
    fs.writeFileSync(OUT_DIR + '/' + name + '.png', Buffer.from(base64, 'base64'));
    console.log('SAVED', name);
  };
  await send('Page.enable');
  await shot('shot');
  // 全页截图
  const metrics = await send('Page.getLayoutMetrics');
  const { width, height } = metrics.result.cssContentSize;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await shot('shot-full');
  ws.close();
  console.log('DONE');
}
main().catch(e => { console.error(e); process.exit(1); });
