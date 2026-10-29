// Начальное состояние игры и миграции сейвов.
//
// Миграции — не формальность: в прototипе любая смена версии стирала прогресс,
// а в игру играют неделями. Здесь сейв переносится из версии в версию.

import { Rng, rngState } from './rng.js';
import { clamp } from './util.js';
import { MODELS } from './data/models.js';
import { SKILL_KEYS } from './data/progress.js';
import { BACKGROUND_RIVALS } from './rival.js';

export const SAVE_KEY = 'perekup_shmot_save';
export const SAVE_VERSION = 1;

/** Длина сезона: 7 сентября — 31 декабря. */
export const SEASON_DAYS = 115;

export function emptyStats() {
  return {
    bought: 0,
    sold: 0,
    revenue: 0,
    profit: 0,
    bestDeal: 0,
    secondBuys: 0,
    legitChecks: 0,
    inspections: 0,
    poizonOrders: 0,
    bulkOrders: 0,
    adsBought: 0,
    adBuys: 0,
    luxSold: 0,
    fakeAsOrig: 0,
    caught: 0,
    refunds: 0,
    scammed: 0,
    rafflesWon: 0,
    ordersDone: 0,
    lotsBought: 0,
    shifts: 0,
    returns: 0,
    seized: 0,
    disputesWon: 0,
    meetings: 0,
    defectsFound: 0,
    clientsLoyal: 0,
  };
}

export function newGame(seed) {
  const s = seed || Math.floor(Math.random() * 0xffffffff);
  const rs = rngState(s);
  const rng = new Rng(rs);

  const n = MODELS.length;
  const h = new Array(n);
  const hT = new Array(n);
  const hP = new Array(n);
  const until = new Array(n).fill(0);
  const rate = new Array(n).fill(0.14);
  const pzNoise = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = clamp(MODELS[i].hype + rng.range(-0.1, 0.1), 0.04, 1);
    h[i] = v;
    hT[i] = v;
    hP[i] = v;
    pzNoise[i] = rng.range(0.95, 1.05);
  }

  const skills = {};
  for (const k of SKILL_KEYS) skills[k] = 0;

  return {
    v: SAVE_VERSION,
    seed: s,
    rng: rs,
    t: 8,
    min: 0,
    rev: 0,

    money: 5000,
    deposit: 0,
    loans: [],
    credit: { paidClean: 0, missed: 0 },
    tx: [],

    items: [],
    shipments: [],
    listings: [],
    threads: [],
    deals: [],
    pending: [],
    notif: [],
    nextNotifId: 1,

    second: { items: [], lastBig: -1, lastMini: -1, lastSeen: -999 },
    suppliers: {
      orig: { posts: [], unread: 0, unlocked: false },
      rep: { posts: [], unread: 0, unlocked: false },
    },
    channels: {
      radar: { posts: [], unread: 0 },
      drops: { posts: [], unread: 0 },
    },
    tg: {
      has: false,
      name: '',
      subs: 0,
      trust: 60,
      lastPost: -999,
      lastTrendPost: -999,
      posts: [],
      adRuns: [],
      proUntil: 0,
    },
    clients: [],
    notebook: {},

    market: { h, hT, hP, until, rate, pzNoise, fx: 12 },
    events: [],
    nextEventAt: 8 + 36,

    season: { no: 1, startDay: 0, endDay: SEASON_DAYS, modifiers: [], finished: false },

    rival: { name: 'Мирон', nw: 42000, heat: 0, lastAt: 0, sniped: 0 },
    bgRivals: BACKGROUND_RIVALS.map(([n, nw, g]) => ({
      name: n,
      nw: Math.round(nw * rng.range(0.85, 1.15)),
      growth: g * rng.range(0.9, 1.1),
    })),

    week: null,
    dayLog: [],
    nextThreadId: 0,
    nextItemId: 100000,
    nextLoanId: 0,
    nextClientId: 0,

    rep: { reviews: [], complaints: 0, banUntil: 0 },

    prog: {
      xp: 0,
      lvl: 1,
      sp: 0,
      skills,
      unlocks: {},
      storage: {},
    },

    stats: emptyStats(),
    goals: {},
    flags: {},
    mentorQueue: [],
    history: [],

    staff: { id: null, since: 0, sold: 0, blunders: 0, reserved: null },
    showroom: { fittings: {}, walkIns: 0, revenue: 0, window: [], windowAt: -9999 },
    brand: {
      name: '',
      drop: null,
      hits: 0,
      flops: 0,
      collabHits: 0,
      cheated: 0,
      lastDropAt: 0,
      lastCollabAt: 0,
      drops: [],
    },

    jobDay: -1,
    streak: { days: 0, lastDay: -1, best: 0 },
    raffle: null,
    buyAd: { postedAt: 0, queue: [] },

    ui: {
      app: null,
      view: 'main',
      id: null,
      stack: [],
      tgTab: 'chats',
      wardrobeTab: 'all',
      limit: 24,
      filters: {
        cat: 'all',
        model: 'all',
        size: 'all',
        mode: 'all',
        sort: 'new',
        q: '',
        onlyDeals: false,
      },
      poizon: { cat: 'all', tier: 'all', sort: 'pop', q: '' },
      qty: {},
      sizeChoice: {},
      speed: 1,
    },
  };
}

/** Обёртка над ГСЧ текущей игры. */
export function rngOf(S) {
  return new Rng(S.rng);
}

/* ======================= МИГРАЦИИ ======================= */
// Каждая функция поднимает сейв на одну версию. Добавляя версию,
// допиши сюда шаг — и ничей прогресс не пропадёт.

const MIGRATIONS = {
  // 1 -> 2: пример будущего шага.
  // 2(S) { S.someNewField = defaultValue; return S; },
};

export function migrate(save) {
  if (!save || typeof save !== 'object') return null;
  let S = save;
  let guard = 0;
  while (S.v < SAVE_VERSION && guard++ < 50) {
    const step = MIGRATIONS[S.v + 1];
    if (!step) {
      // Шага нет — честно признаём, что перенести не можем.
      return null;
    }
    S = step(S);
    S.v = S.v + 1;
  }
  if (S.v !== SAVE_VERSION) return null;
  return fillDefaults(S);
}

/** Дозаполняет поля, которые могли не сохраниться. Дёшево и спасает от падений. */
export function fillDefaults(S) {
  const fresh = newGame(S.seed || 1);
  const walk = (target, source) => {
    for (const k of Object.keys(source)) {
      if (target[k] === undefined) {
        target[k] = source[k];
      } else if (
        source[k] &&
        typeof source[k] === 'object' &&
        !Array.isArray(source[k]) &&
        target[k] &&
        typeof target[k] === 'object' &&
        !Array.isArray(target[k])
      ) {
        walk(target[k], source[k]);
      }
    }
  };
  walk(S, fresh);
  // Длина рыночных массивов могла измениться вместе с каталогом.
  const n = MODELS.length;
  for (const key of ['h', 'hT', 'hP', 'until', 'rate', 'pzNoise']) {
    const arr = S.market[key];
    if (!Array.isArray(arr)) {
      S.market[key] = fresh.market[key];
      continue;
    }
    while (arr.length < n) arr.push(fresh.market[key][arr.length]);
    if (arr.length > n) arr.length = n;
  }
  return S;
}
