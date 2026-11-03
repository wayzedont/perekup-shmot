// Сквозной тест обучения в настоящем браузере.
//
// Запускает безголовый Chrome в размере телефона и проходит обучение так,
// как проходит человек: жмёт подсвеченное, «Дальше», отвечает на звонок,
// листает по стрелке, если кнопка уехала за край. Заодно проверяет, что
// экран свободный (нажатие мимо подсветки работает) и что ушедшего не туда
// игрока Тимур возвращает кнопкой «Вернуться».
//
// --chaos[=доля]: игрок-хулиган. Перед каждым правильным действием с этой
// вероятностью (по умолчанию 0.25) жмёт что попало на экране — другое
// приложение, чужую вещь, «Назад», «Спать». Обучение всё равно обязано
// дойти до конца: Тимур подсвечивает и возвращает, но ничего не ломается.
// --seed=N меняет последовательность случайных нажатий.
//
// Запуск (нужен работающий `npm start`):
//   node tools/tutorial-e2e.js [ширина] [высота] [папка для скриншотов] [--touch] [--chaos] [--seed=N] [--log]

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const W = +process.argv[2] || 390;
const H = +process.argv[3] || 844;
const SHOTS = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4] : '';
const URL = 'http://localhost:8080/';
const PORT = 9300 + Math.floor(Math.random() * 400);
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'shmot-e2e-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-gpu',
  'about:blank',
]);

let ws;
let seq = 0;
const waiters = new Map();
const errors = [];

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
            errors.push(d.text + ' ' + JSON.stringify(d.exception && d.exception.description));
          }
          if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
            errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
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

// --touch: касания пальцем, как на телефоне, а не мышь. Телефон ломается
// не там, где компьютер: касание — это другие события и другой порядок.
const TOUCH = process.argv.includes('--touch');

const argOf = (name) => {
  const a = process.argv.find((x) => x === '--' + name || x.startsWith('--' + name + '='));
  return a === undefined ? null : a.includes('=') ? a.split('=')[1] : '';
};
const CHAOS = argOf('chaos') === null ? 0 : +argOf('chaos') || 0.25;
let seedState = (+argOf('seed') || 1) >>> 0;
/** mulberry32: повторяемая случайность для хулигана. */
function rand() {
  seedState = (seedState + 0x6d2b79f5) >>> 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Что угодно видимое и нажимаемое, кроме сброса игры, пропуска обучения
// и самого пузыря Тимура (его кнопки жмёт «правильная» часть теста).
const NO_CHAOS = ['resetAsk', 'resetOk', 'tutSkip', 'payScam', 'phishGo', 'newSeason', 'exportSave', 'launchBrand'];
const randomTarget = (r) => `(() => {
  const bad = new Set(${JSON.stringify(NO_CHAOS)});
  const els = [...document.querySelectorAll('[data-act], [data-app], #homebar button')].filter((el) => {
    if (bad.has(el.dataset.act) || el.closest('#coach') || el.closest('#call')) return false;
    const r = el.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  });
  if (!els.length) return null;
  const el = els[Math.floor(${r} * els.length)];
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, act: el.dataset.act || el.dataset.app || 'home' };
})()`;

async function click(x, y) {
  if (TOUCH) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(220);
    return;
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(140);
}

let shotN = 0;
async function shot(name) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`), Buffer.from(r.result.data, 'base64'));
}

/** Что сейчас на экране обучения. */
const STATE = `(() => {
  const g = window.__game, S = g.S;
  const step = S.tut && S.tut.active ? g.tutorial.STEPS[S.tut.step] : null;
  const rect = (sel) => { const el = document.querySelector(sel); if (!el || el.hidden || el.closest('[hidden]')) return null;
    const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; };
  const call = document.querySelector('#call');
  const ring = document.querySelector('#coach .c-ring');
  const ringBox = ring && !ring.hidden ? ring.getBoundingClientRect() : null;
  const onTop = (el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit)); };
  // Что внутри подсветки нажимает человек: кнопку, а не середину рамки.
  const hint = window.__coachHint || { sels: [] };
  const target = hint.sels.map((s) => document.querySelector(s)).find(Boolean);
  let act = null;
  if (ringBox) {
    const inside = [...document.querySelectorAll('[data-act], select')].filter((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      return r.width && cx > ringBox.left && cx < ringBox.right && cy > ringBox.top && cy < ringBox.bottom && onTop(el);
    });
    const el = inside.find((e) => target && (e === target || target.contains(e))) || inside[inside.length - 1];
    if (el) { const r = el.getBoundingClientRect(); act = { x: r.left + r.width / 2, y: r.top + r.height / 2, select: el.tagName === 'SELECT' ? el.dataset.change : null }; }
    else if (target && onTop(target)) { const r = target.getBoundingClientRect(); act = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  }
  return {
    active: !!(S.tut && S.tut.active), done: !!(S.tut && S.tut.done), part: S.tut && S.tut.part,
    hour: S.t % 24, home: !S.ui.app,
    wait3: rect('.home [data-act="wait"][data-h="3"]'), sleepBtn: rect('.home [data-act="sleep"]'), homeBtn: rect('#homebtn'),
    step: step && step.id, kind: step && step.kind,
    callClass: call && !call.hidden ? call.className : null,
    ring: ringBox ? { x: ringBox.left + ringBox.width / 2, y: ringBox.top + ringBox.height / 2 } : null,
    act, pick: hint.pick,
    arrow: rect('#coach .c-arrow'),
    next: rect('#coach [data-coach="next"]'),
    lost: rect('#coach .c-lost [data-coach="back"]'),
    footVisible: (() => { const f = document.querySelector('#coach .c-foot'); return !f || f.style.visibility !== 'hidden'; })(),
    bubble: rect('#coach .c-bubble'),
    accept: rect('#call [data-call="accept"]'),
    choose: rect('#call [data-call="choose"]'),
    hang: rect('#call [data-call="hang"]'),
    callArea: rect('#call .call-lines'),
    sheetClose: rect('#sheet:not([hidden]) [data-act="closeSheet"]'),
    view: S.ui.app + '/' + S.ui.view,
    garbage: (document.body.innerText.match(/\\bNaN\\b|\\bundefined\\b|\\[object |Этот экран не отрисовался/) || [null])[0],
  };
})()`;

/** Выбор в выпадающем списке: нативный список в безголовом браузере не открыть. */
const PICK = {
  f_model: (g) => g.tutorial.TUT_ORDER.m,
  f_size: (g) => g.tutorial.TUT_ORDER.size,
  trend_model: (g) => g.tutorial.TUT_TREND.m,
  trend_size: (g) => g.tutorial.TUT_TREND.size,
  trend_mode: () => 'ship',
};

async function pickSelect(change, value) {
  // Как палец: список получает фокус, потом выбор. Фокус после выбора на нём
  // и остаётся — так ловится «выдача не обновилась, пока не тронешь экран».
  // Списка уже может не быть: «хулиган» успел уйти с экрана.
  await js(`(() => { const el = document.querySelector('select[data-change="${change}"]'); if (!el) return;
    el.focus(); el.value = ${JSON.stringify(String(value))}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(250);
}

async function run() {
  await connect();
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
  if (TOUCH) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: URL });
  for (let i = 0; i < 100; i++) {
    if (await js('!!(window.__game && window.__game.S)')) break;
    await sleep(200);
  }

  const log = [];
  let last = null;
  let same = 0;
  const t0 = Date.now();
  let freeOk = null;
  let lostOk = null;
  let focusTried = false;
  const chaos = [];
  let garbage = null;
  const patience = CHAOS ? 1 / (1 - CHAOS) : 1;
  const parts = [];
  let gap = 0;

  for (let i = 0; i < 1400 * patience * patience; i++) {
    const s = await js(STATE);
    if (s.garbage && !garbage) {
      garbage = s.garbage + ' на ' + s.view + ' (шаг ' + s.step + ')';
      await shot('GARBAGE-' + s.step);
    }
    if (!s.active) {
      if (s.done) {
        log.push('обучение завершено');
        break;
      }
      // Между главами — как игрок: закрыть итоговое окно, выйти на главный
      // и ждать кнопками времени (ночью — спать), пока не позвонит Тимур.
      const key = 'gap|' + s.part;
      if (last !== key) {
        last = key;
        gap = 0;
        parts.push(s.part);
        log.push(`— пауза до главы «${s.part}» —`);
        await shot('gap-' + s.part);
      }
      if (++gap > 400) {
        await shot('GAP-STUCK-' + s.part);
        throw new Error('Тимур так и не позвонил про ' + s.part + ' · ' + JSON.stringify(s));
      }
      if (s.sheetClose && s.sheetClose.y > H - 8) {
        // Кнопка окна за краем экрана — листаем окно, как листал бы человек.
        await js(`document.querySelector('#sheet [data-act="closeSheet"]').scrollIntoView({ block: 'end' })`);
        await sleep(200);
      } else if (s.sheetClose) await click(s.sheetClose.x, s.sheetClose.y);
      else if (!s.home && s.homeBtn) await click(s.homeBtn.x, s.homeBtn.y);
      else if ((s.hour >= 21 || s.hour < 8) && s.sleepBtn) await click(s.sleepBtn.x, s.sleepBtn.y);
      else if (s.wait3) await click(s.wait3.x, s.wait3.y);
      await sleep(250);
      continue;
    }
    const key = s.step + '|' + (s.callClass || '');
    if (key === last) same++;
    else {
      same = 0;
      last = key;
      log.push(`${s.step} (${s.kind})`);
      await shot(s.step + (s.callClass ? '-' + s.callClass : ''));
    }
    // С «хулиганом» шаг, которому нужно открытое окно, может долго ходить по
    // кругу «Вернуться — хулиган закрыл окно — снова Вернуться»: терпения больше.
    if (same > (s.kind === 'goal' ? 90 : 40) * patience * patience * (CHAOS ? 2 : 1)) {
      await shot('STUCK-' + s.step);
      throw new Error('застряли на шаге ' + s.step + ' · ' + JSON.stringify(s));
    }

    if (s.kind === 'call') {
      if (s.callClass === 'ringing' && s.accept) await click(s.accept.x, s.accept.y);
      else if (s.choose) await click(s.choose.x, s.choose.y);
      else if (s.hang) await click(s.hang.x, s.hang.y);
      else if (s.callArea) await click(s.callArea.x, s.callArea.y);
      else await sleep(300);
      continue;
    }

    // Экран свободный: нажать можно не только подсвеченное. Один раз уходим
    // не туда (с фильтров Авитки — домой) и проверяем, что Тимур вернёт.
    // Проверка нужна на экране поиска без окон: «хулиган» мог увести
    // игрока куда-то ещё.
    if (s.step === 'f_cat' && freeOk === null && s.view === 'avito/main' && !s.sheetClose && s.homeBtn) {
      await click(s.homeBtn.x, s.homeBtn.y);
      freeOk = (await js('window.__game.S.ui.app')) === null;
      await sleep(1700);
      const back = (await js(STATE)).lost;
      if (back) {
        await click(back.x, back.y);
        await sleep(300);
        lostOk = (await js('window.__game.S.ui.app')) === 'avito';
      } else lostOk = false;
      continue;
    }

    // Хулиган: вместо правильного действия — что попало.
    if (CHAOS && rand() < CHAOS) {
      const t = await js(randomTarget(rand()));
      if (t) {
        await click(t.x, t.y);
        chaos.push(t.act);
      }
      continue;
    }

    if (s.kind === 'talk') {
      if (!s.footVisible && s.bubble) {
        await click(s.bubble.x, s.bubble.y); // допечатать текст
        continue;
      }
      if (s.next) await click(s.next.x, s.next.y);
      else await sleep(200);
      continue;
    }
    if (s.kind === 'wait') {
      await sleep(400);
      continue;
    }
    if (s.lost) {
      await click(s.lost.x, s.lost.y);
      continue;
    }
    // Кнопка уехала за край — листаем, как листал бы человек.
    if (!s.ring && s.arrow) {
      await click(s.arrow.x, s.arrow.y);
      await sleep(400);
      continue;
    }
    if (!s.ring || !s.act) {
      await sleep(250);
      continue;
    }
    // Так было у автора на телефоне: курсор в поле цены, и «Опубликовать»
    // не нажималось. Теперь фокус ни на что не влияет.
    if (s.step === 'sell_publish' && !focusTried) {
      focusTried = true;
      await js(`(() => { const el = document.getElementById('sellPriceInput'); if (el) el.focus(); })()`);
      await sleep(300);
      continue;
    }
    if (s.act.select) {
      const value = s.kind === 'goal' ? s.pick : PICK[s.step] ? await js(`String((${PICK[s.step].toString()})(window.__game))`) : null;
      if (value !== null && value !== undefined) await pickSelect(s.act.select, value);
      else await sleep(250);
      continue;
    }
    const at = s.kind === 'tap' && s.sheetClose ? s.sheetClose : s.act;
    await click(at.x, at.y);
    await sleep(120);
  }

  const end = await js(STATE);
  const summary = await js(`(() => { const S = window.__game.S; return {
    money: S.money, items: S.items.length, shipments: S.shipments.map((s) => s.name), channel: S.tg.has,
    sold: S.stats.sold, disputes: S.stats.disputesWon, apps: Object.keys(S.apps || {}).join(','),
    day: Math.floor(S.t / 24), clock: document.querySelector('#statusbar .clock').textContent,
    sheet: !document.querySelector('#sheet').hidden ? document.querySelector('#sheet h2').textContent : null,
    garbage: (document.body.innerText.match(/\\bNaN\\b|\\bundefined\\b|\\[object /) || [null])[0] }; })()`);
  await shot('finish');
  if (!garbage && summary.garbage) garbage = summary.garbage + ' в конце';
  const chaosInfo = CHAOS ? { clicks: chaos.length, kinds: [...new Set(chaos)].length } : undefined;
  return { done: end.done, parts, steps: log.length, seconds: Math.round((Date.now() - t0) / 1000), freeOk, lostOk, garbage, chaos: chaosInfo, summary, log };
}

run()
  .then((r) => {
    console.log(JSON.stringify({ ...r, log: undefined }, null, 1));
    if (process.argv.includes('--log')) console.log(r.log.join('\n'));
    if (errors.length) console.log('Ошибки в консоли:\n' + errors.join('\n'));
    // С «хулиганом» шаг с фильтром мог пройти, пока игрок был не на экране
    // поиска, — тогда проверку свободы не засчитываем, но и не валим.
    const freeChecked = r.freeOk !== null;
    const freeOk = CHAOS && !freeChecked ? true : r.freeOk && r.lostOk;
    const ok = r.done && freeOk && !errors.length && !r.garbage;
    console.log(ok ? '✓ обучение пройдено' : '✗ обучение не пройдено');
    chrome.kill();
    process.exit(ok ? 0 : 1);
  })
  .catch((e) => {
    console.error('✗', e.message);
    if (errors.length) console.log('Ошибки в консоли:\n' + errors.join('\n'));
    chrome.kill();
    process.exit(1);
  });
