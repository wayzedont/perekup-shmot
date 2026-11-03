// Случайные нажатия в настоящем браузере: во время обучения и после него.
//
// Безголовый Chrome в размере телефона, свежая игра. Сначала сотни случайных
// нажатий прямо в обучении (Тимур не должен ломаться, что бы игрок ни жал),
// потом обучение пропускается и игра разгоняется деньгами и уровнем, чтобы
// случайные нажатия добрались до переписок, сделок и поздних экранов.
// Ловит исключения, ошибки в консоли, экран «Ошибка экрана» и мусор вроде NaN.
//
// Запуск (нужен работающий `npm start`):
//   node tools/ui-random.js [ширина] [высота] [нажатий в обучении] [нажатий после]

import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = +process.argv[2] || 390;
const H = +process.argv[3] || 844;
const TUT_CLICKS = +process.argv[4] || 400;
const FREE_CLICKS = +process.argv[5] || 800;
const URL = 'http://localhost:8080/';
const PORT = 9700 + Math.floor(Math.random() * 200);
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'shmot-ui-'))}`,
  '--no-first-run',
  '--disable-gpu',
  'about:blank',
]);

let ws;
let seq = 0;
const waiters = new Map();
const consoleErrors = [];

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r, j) => {
          ws.onopen = r;
          ws.onerror = j;
        });
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.id && waiters.has(m.id)) {
            waiters.get(m.id)(m);
            waiters.delete(m.id);
          }
          if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            consoleErrors.push(d.text + ' ' + (d.exception && d.exception.description));
          }
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '));
          }
        };
        return;
      }
    } catch (e) {
      /* браузер ещё поднимается */
    }
    await sleep(200);
  }
  throw new Error('Chrome не поднялся');
}

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => waiters.set(id, r));
}

async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails));
  return r.result && r.result.result ? r.result.result.value : undefined;
}

async function main() {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: W < 600 });
  await send('Page.navigate', { url: URL });
  await sleep(800);
  await js('localStorage.clear()');
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 50 && !(await js('!!window.__game')); i++) await sleep(100);

  // 1. Обучение. Сначала берём трубку и дослушиваем Тимура (у звонка свои
  // кнопки, кликер их не жмёт), потом жмём что попало, кроме «Пропустить» —
  // иначе обучение кончится сразу.
  await js(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 300; i++) {
      const call = document.querySelector('#call');
      if (!call || call.hidden) return;
      const vis = (sel) => { const el = call.querySelector(sel); return el && el.getClientRects().length ? el : null; };
      const el = vis('[data-call="accept"]') || vis('[data-call="choose"]') || vis('[data-call="hang"]') || vis('.call-lines');
      if (el) el.click();
      await sleep(250);
    }
  })()`);
  const tut = await js(
    `import('/tools/uitest.js').then(m => m.run(${TUT_CLICKS}, { seed: false, block: ['tutSkip'] }))`,
  );
  const tutState = await js('({ active: !!(__game.S.tut && __game.S.tut.active), step: __game.S.tut && __game.S.tut.step })');

  // 2. Пропуск главы — той же кнопкой, что у игрока: итоговое окно, а не
  // пачка старых баннеров. Потом свободная игра с разогнанным состоянием
  // (следующие главы придут своими звонками, если время до них дойдёт).
  if (await js('!!(__game.S.tut && __game.S.tut.active)')) await js('__game.actions.tutSkip({})');
  await sleep(600);
  const skip = await js(`({
    active: !!(__game.S.tut && __game.S.tut.active),
    sheet: (() => { const s = document.querySelector('#sheet'); return s && !s.hidden ? (s.querySelector('h2') || {}).textContent : null; })(),
    banner: (() => { const b = document.querySelector('#banner'); return b && !b.hidden ? b.textContent.trim().slice(0, 60) : null; })(),
  })`);
  await js('__game.actions.closeSheet({})');
  const free = await js(`import('/tools/uitest.js').then(m => m.run(${FREE_CLICKS}))`);

  const report = { size: `${W}×${H}`, tutorial: { ...tut, viewsVisited: tut.viewsVisited.length, state: tutState }, skip, free: { ...free, viewsVisited: free.viewsVisited.length }, consoleErrors: consoleErrors.slice(0, 10) };
  console.log(JSON.stringify(report, null, 1));
  const skipOk = !skip.active && /пропущена/.test(skip.sheet || '') && !skip.banner;
  const ok = !tut.errorCount && !free.errorCount && !consoleErrors.length && skipOk;
  console.log(ok ? '✓ случайные нажатия: ни ошибок, ни мусора' : '✗ найдены ошибки');
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      ws && ws.close();
    } catch (e) {
      /* уже закрыт */
    }
    chrome.kill();
  });
