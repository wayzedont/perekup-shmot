// Звук, вибрация и маленькие праздники экрана.
//
// Без файлов: каждый звук собирается из пары осцилляторов WebAudio. Ядро игры
// только говорит «случилась продажа» (fx из kernel.js), а здесь решается,
// как это прозвучит и как дёрнется телефон в руке. Настройки — свои у
// каждого устройства (localStorage), поэтому «Начать заново» их не трогает.

import { onFx } from '../core/kernel.js';
import { $ } from './dom.js';
import { rub } from '../core/util.js';

const PREFS_KEY = 'perekup_shmot_prefs';

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return { sound: true, vibro: true, ...(raw ? JSON.parse(raw) : {}) };
  } catch (e) {
    return { sound: true, vibro: true };
  }
}

export const prefs = readPrefs();

export function setPref(key, val) {
  prefs[key] = !!val;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    /* приватный режим: настройка живёт до перезагрузки */
  }
  if (key === 'sound' && val) play('task');
  if (key === 'vibro' && val) buzz([20, 40, 20]);
}

/* ======================= СИНТЕЗ ======================= */

let ctx = null;
let master = null;

/** Браузер даёт звук только после касания: заводим контекст на первом. */
function unlock() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  } catch (e) {
    ctx = null;
  }
}

function tone(freq, at, dur, { type = 'sine', gain = 0.2, slide = 0 } = {}) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

const SOUNDS = {
  // Уведомление: короткий «дзынь» в две ноты.
  notify: () => {
    tone(988, 0, 0.1, { gain: 0.16 });
    tone(1319, 0.08, 0.16, { gain: 0.14 });
  },
  // Продажа: монетка.
  sale: () => {
    tone(1568, 0, 0.07, { type: 'square', gain: 0.05 });
    tone(2093, 0.06, 0.32, { type: 'square', gain: 0.05 });
    tone(3136, 0.06, 0.22, { gain: 0.04 });
  },
  // Деньги пришли на карту — две монетки.
  coins: () => {
    SOUNDS.sale();
    tone(2349, 0.2, 0.28, { type: 'square', gain: 0.035 });
  },
  // Купил: мягкий «тук-тук» вниз.
  buy: () => {
    tone(523, 0, 0.07, { type: 'triangle', gain: 0.2 });
    tone(392, 0.06, 0.12, { type: 'triangle', gain: 0.18 });
  },
  // Проверка показала оригинал.
  ok: () => {
    tone(659, 0, 0.09, { type: 'triangle', gain: 0.18 });
    tone(988, 0.08, 0.2, { type: 'triangle', gain: 0.18 });
  },
  // Паль, претензия, Мирон увёл вещь: низкий гудок.
  bad: () => {
    tone(220, 0, 0.2, { type: 'sawtooth', gain: 0.06, slide: 0.7 });
    tone(165, 0.16, 0.3, { type: 'sawtooth', gain: 0.06, slide: 0.7 });
  },
  // Новый уровень, выигранный раффл: арпеджио вверх.
  level: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.18, { type: 'triangle', gain: 0.17 }));
    tone(1319, 0.36, 0.5, { type: 'triangle', gain: 0.15 });
  },
  // Дело на день сделано.
  task: () => tone(1175, 0, 0.12, { gain: 0.14 }),
  // Серия: искры.
  streak: () => [784, 1047, 1319, 1568].forEach((f, i) => tone(f, i * 0.06, 0.14, { gain: 0.12 })),
  // Звонок: два гудка.
  ring: () => {
    for (let k = 0; k < 2; k++) {
      tone(1046, k * 0.32, 0.13, { gain: 0.13 });
      tone(1318, k * 0.32 + 0.14, 0.13, { gain: 0.13 });
    }
  },
};

const VIBES = {
  notify: 15,
  sale: [20, 40, 20],
  coins: [20, 40, 20],
  buy: 12,
  ok: 15,
  bad: [90, 50, 90],
  level: [30, 40, 30, 40, 120],
  task: 15,
  streak: [20, 30, 20, 30, 60],
  ring: [250, 150, 250],
};

function buzz(pattern) {
  if (!prefs.vibro || !pattern) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {
    /* не поддерживается */
  }
}

let lastAt = 0;
let lastName = '';

/** Сыграть звук и дёрнуть телефон. Не чаще одного «события» за 120 мс. */
export function play(name) {
  const now = performance.now();
  if (now - lastAt < 120 && name === 'notify') return;
  lastAt = now;
  lastName = name;
  buzz(VIBES[name]);
  if (!prefs.sound || !SOUNDS[name]) return;
  unlock();
  if (!ctx || ctx.state !== 'running') return;
  try {
    SOUNDS[name]();
  } catch (e) {
    /* звук — украшение, игра без него живёт */
  }
}

/** Только что прозвучало что-то своё — тогда обычный «дзынь» баннера лишний. */
export const playedRecently = (ms = 500) => performance.now() - lastAt < ms && lastName !== 'notify';

/* ======================= ЗВОНОК ======================= */

let ringTimer = null;
const RING_MS = 30000;

export function ringing(on) {
  clearInterval(ringTimer);
  ringTimer = null;
  if (!on) {
    try {
      if (navigator.vibrate) navigator.vibrate(0);
    } catch (e) {
      /* нет вибро */
    }
    return;
  }
  play('ring');
  // Как настоящий телефон: погудел полминуты и замолчал, экран звонка остаётся.
  const started = Date.now();
  ringTimer = setInterval(() => {
    if (Date.now() - started > RING_MS) {
      clearInterval(ringTimer);
      ringTimer = null;
      return;
    }
    play('ring');
  }, 2200);
}

/* ======================= ПРАЗДНИКИ ЭКРАНА ======================= */

/** Конфетти поверх телефона: новый уровень, раффл, серия. */
export function confetti(count = 46) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const phone = $('#phone');
  if (!phone) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  const colors = ['#ff6b35', '#ffd23f', '#3bceac', '#7b61ff', '#ee4266', '#0ead69'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + '%';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.35 + 's';
    p.style.animationDuration = 1.1 + Math.random() * 0.9 + 's';
    p.style.setProperty('--dx', (Math.random() * 2 - 1) * 60 + 'px');
    p.style.setProperty('--rot', Math.random() * 720 - 360 + 'deg');
    layer.appendChild(p);
  }
  phone.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}

/** Иконка «Банка» подпрыгивает, когда пришли деньги: суммы вне банка не видно. */
function pulseBank() {
  const ico = document.querySelector('.app-ico[data-app="bank"]');
  if (!ico) return;
  ico.classList.remove('pulse');
  void ico.offsetWidth;
  ico.classList.add('pulse');
}

/* ======================= СЧЁТЧИК В БАНКЕ ======================= */

let shownMoney = null;

/** После каждой отрисовки: в «Банке» сумма докручивается до новой, как на табло. */
export function afterRender(S) {
  const el = S.ui.app === 'bank' ? document.querySelector('.hero .money') : null;
  if (!el) {
    shownMoney = S.money;
    return;
  }
  const from = shownMoney === null ? S.money : shownMoney;
  const to = S.money;
  shownMoney = to;
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const start = performance.now();
  const dur = Math.min(900, 300 + Math.abs(to - from) / 40);
  el.classList.add(to > from ? 'up' : 'down');
  const step = (now) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = rub(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
    else el.classList.remove('up', 'down');
  };
  requestAnimationFrame(step);
}

/* ======================= ПОДПИСКА НА ЯДРО ======================= */

export function initSfx() {
  // Первое касание открывает звук: без него браузер молчит.
  const first = () => unlock();
  document.addEventListener('pointerdown', first, { capture: true, passive: true });
  document.addEventListener('keydown', first, { capture: true });
  onFx((name) => {
    play(name);
    if (name === 'sale' || name === 'coins') pulseBank();
    if (name === 'level') confetti(60);
    if (name === 'streak') confetti(28);
  });
}
