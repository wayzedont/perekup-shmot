// Аудит экранов в настоящем браузере.
//
// Безголовый Chrome в размере телефона, игра на «богатом» состоянии (обучение
// пройдено, три-четыре недели жизни), и обход всех экранов: главный, каждое
// приложение, карточки вещей, переписки, Pro-версии. На каждом ищем:
//   • элементы, вылезающие за край телефона (горизонтальная прокрутка);
//   • переполнение главного экрана (он обязан помещаться без прокрутки);
//   • мусор в тексте: NaN, undefined, null, [object …];
//   • ошибки в консоли.
//
// Запуск (нужен работающий `npm start`):
//   node tools/audit-screens.js [ширина] [высота] [дней жизни]
// AUDIT_SHOTS=папка — сохранить скриншоты экранов с замечаниями.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = +process.argv[2] || 375;
const H = +process.argv[3] || 667;
const DAYS = +process.argv[4] || 26;
const URL = 'http://127.0.0.1:8080/';
const PORT = 9700 + Math.floor(Math.random() * 200);
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shmot-audit-'))}`,
  '--no-first-run',
  '--disable-gpu',
  'about:blank',
]);

let ws;
let seq = 0;
const waiters = new Map();
const errors = [];

for (let i = 0; i < 60 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = list.find((x) => x.type === 'page');
    if (page) {
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => (ws.onopen = r));
    }
  } catch (e) {
    /* поднимается */
  }
  if (!ws) await sleep(200);
}
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && waiters.has(m.id)) {
    waiters.get(m.id)(m);
    waiters.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => waiters.set(id, r));
};
const js = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result && r.result.result ? r.result.result.value : undefined;
};

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: URL });
for (let i = 0; i < 60; i++) {
  if ((await js('!!window.__game')) === true) break;
  await sleep(200);
}

// Новая игра с нуля, обучение доигрывает Тимур, дальше живёт сильный бот.
const setup = await js(`(async () => {
  localStorage.clear();
  const G = window.__game; const S = G.S; const T = G.tutorial;
  const tick = await import('/src/core/tick.js');
  const time = await import('/src/core/time.js');
  S.tut.auto = true;
  // Сильный бот из симуляции живёт за игрока: шкаф, переписки, канал, уровни.
  const bots = await import('/sim/bots.js');
  bots.runBot(S, 'smart', ${DAYS});
  S.money = Math.max(S.money, 30000);
  // AUDIT_WORST: все подсказки главного экрана сразу — бан, раффл, дела.
  if (${!!process.env.AUDIT_WORST}) {
    S.rep.banUntil = S.t + 48;
    if (S.raffle) { S.raffle.done = false; S.raffle.entered = false; }
    S.daily.day = time.dayIndex(S.t); S.daily.tasks.forEach((x) => (x.done = false));
  }
  return 'день ' + time.dayIndex(S.t) + ', ур. ' + S.prog.lvl + ', вещей ' + S.items.length + ', диалогов ' + S.threads.length;
})()`);
console.log(setup);

const routes = await js(`(() => {
  const S = window.__game.S;
  const r = [[null, 'main', null]];
  for (const a of ['store', 'wardrobe', 'bank', 'goals', 'job', 'settings', 'avito', 'tg', 'second', 'poizon', 'parcels', 'notebook', 'shop']) r.push([a, 'main', null]);
  for (const it of S.items.slice(0, 5)) r.push(['wardrobe', 'item', it.id]);
  for (const l of S.listings.slice(0, 4)) r.push(['avito', 'item', l.id]);
  for (const th of S.threads.filter((x) => !x.closed).slice(0, 8)) r.push([th.platform === 'avito' ? 'avito' : 'tg', 'thread', th.id]);
  for (const s of S.second.items.slice(0, 3)) r.push(['second', 'item', s.id]);
  r.push(['poizon', 'item', 30], ['tg', 'own', null], ['store', 'up-avitoPro', null], ['store', 'avito', null], ['shop', 'chronicle', null]);
  return r;
})()`);

const report = [];
for (const [app, view, id] of routes) {
  const res = await js(`(async () => {
    const G = window.__game; const S = G.S;
    S.ui.app = ${JSON.stringify(app)}; S.ui.view = ${JSON.stringify(view)}; S.ui.id = ${JSON.stringify(id)};
    await new Promise((r) => setTimeout(r, 450));
    G.render();
    await new Promise((r) => setTimeout(r, 80));
    const P = document.querySelector('#phone').getBoundingClientRect();
    const bad = [];
    for (const el of document.querySelectorAll('#screen *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (el.closest('.chips, .tabs, .size-grid')) continue;
      // Обрезано предком с overflow: hidden (увеличенное фото внутри рамки) — на экране не видно.
      let clipped = false;
      for (let x = el.parentElement; x && x.id !== 'screen'; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (cs.overflowX !== 'visible') {
          const q = x.getBoundingClientRect();
          if (q.right <= P.right + 1 && q.left >= P.left - 1) {
            clipped = true;
            break;
          }
        }
      }
      if (clipped) continue;
      if (r.right > P.right + 1 || r.left < P.left - 1) { const path = []; for (let x = el; x && x.id !== 'screen' && path.length < 4; x = x.parentElement) path.unshift(typeof x.className === 'string' && x.className ? '.' + x.className.split(' ')[0] : x.tagName.toLowerCase()); bad.push(path.join('>') + ' +' + Math.round(Math.max(r.right - P.right, P.left - r.left)) + 'px'); }
    }
    const scr = document.querySelector('#screen');
    const home = !S.ui.app && scr.scrollHeight > scr.clientHeight + 2 ? 'главный экран не влез: ' + scr.scrollHeight + ' > ' + scr.clientHeight : '';
    const text = scr.innerText;
    const junk = ['NaN', 'undefined', 'null', '[object'].filter((w) => text.includes(w));
    return [bad.slice(0, 4).join(', '), home, junk.length ? 'мусор: ' + junk.join(',') : ''].filter(Boolean).join(' | ');
  })()`);
  if (res) report.push(`${app || 'home'}/${view}${id !== null ? '/' + id : ''} → ${res}`);
  if (res && process.env.AUDIT_SHOTS) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(process.env.AUDIT_SHOTS, `${app || 'home'}-${view}-${id}.png`), Buffer.from(shot.result.data, 'base64'));
  }
}
console.log(`экранов: ${routes.length}`);
console.log(report.length ? report.join('\n') : '✓ ничего не вылезает, мусора нет');
console.log(errors.length ? '✗ ошибки консоли:\n' + errors.slice(0, 6).join('\n') : '✓ консоль чистая');
chrome.kill();
process.exit(report.length || errors.length ? 1 : 0);
