// Сборка движка: создание игры, первые минуты, сохранение и загрузка.

import { newGame, migrate, fillDefaults, SAVE_KEY, SAVE_VERSION } from './state.js';
import { rngOf, newThread, say } from './kernel.js';
import { resetIds, makeItem, hideDefects } from './items.js';
import { generateListing, resetListingIds } from './market/avito.js';
import { restock, resetSecondIds } from './market/second.js';
import { makePost, resetSupplierIds, SUPPLIERS } from './market/suppliers.js';
import { newRaffle } from './market/raffle.js';
import { MODELS } from './data/models.js';
import { netWorth } from './economy.js';
import { applyUnlock } from './progression.js';
import { runTutorialHeadless, finishTutorial, migrateTutorial } from './tutorial.js';

/* ======================= СОЗДАНИЕ ИГРЫ ======================= */

/**
 * opts.tutorial:
 *   'play' (по умолчанию) — игрок проходит обучение сам;
 *   'skip' — главы обучения проходятся без экрана теми же действиями, каждая
 *            в свой день: так стартуют боты, прогоны баланса и тесты, чтобы
 *            мерить ту игру, в которую играет человек;
 *   'none' — без обучения вовсе (новый сезон): все приложения уже стоят,
 *            прежние 5 000 ₽ на старте.
 */
export function createGame(seed, opts = {}) {
  const S = buildGame(seed);
  const mode = opts.tutorial || 'play';
  if (mode === 'skip') {
    S.tut.auto = true;
    runTutorialHeadless(S);
  }
  if (mode === 'none') {
    finishTutorial(S);
    S.money = 5000;
  }
  return S;
}

function buildGame(seed) {
  const S = newGame(seed);
  const rng = rngOf(S);

  resetIds(1);
  resetListingIds(1);
  resetSecondIds(1);
  resetSupplierIds(1);

  // Стартовый гардероб: то, с чем реально начинают.
  const find = (brand, name) => MODELS.find((m) => m.b === brand && m.n === name).i;

  const jacket = makeItem(rng, find('Адик', 'олимпийка'), {
    cond: 3,
    real: true,
    verdict: 'orig',
    size: 'M',
    src: 'Своё',
    boughtAt: 0,
  });
  hideDefects(rng, jacket, 1);
  jacket.condSeen = true;
  jacket.shownCond = jacket.cond;

  const forces = makeItem(rng, find('Найк', 'Форсы'), {
    cond: 3,
    real: true,
    verdict: 'orig',
    size: '42',
    src: 'Своё',
    boughtAt: 0,
  });
  hideDefects(rng, forces, 1);
  forces.condSeen = true;
  forces.shownCond = forces.cond;

  // Подарок брата — плохая паль, которую надо научиться распознавать.
  const techFleece = makeItem(rng, find('Найк', 'Теч Флис'), {
    cond: 1,
    real: false,
    q: 0.2,
    size: 'L',
    src: 'Подарок брата',
    boughtAt: 0,
  });
  techFleece.condSeen = true;

  S.items.push(jacket, forces, techFleece);

  // Рынок на старте.
  for (let i = 0; i < 38; i++) S.listings.push(generateListing(S, rng, { back: rng.int(0, 60) }));
  restock(S, rng, 'mini');
  S.second.lastBig = -1;

  // Поставщики: европейский доступен сразу, китайское карго открывается целью.
  S.suppliers.orig.unlocked = true;
  for (let i = 0; i < 2; i++) makePost(S, rng, 'orig', true);

  S.raffle = newRaffle(S, rng);
  S.channels.drops.posts.unshift({
    at: S.t,
    text:
      '🎟 Добро пожаловать в «Дропы и раффлы». Каждое воскресенье — новый розыгрыш лимитки. Взнос 300 ₽, итоги в субботу в 12:00.',
  });
  S.channels.radar.posts.unshift({
    at: S.t,
    text:
      'Хайп-радар на связи 📡\nКаждое утро в 9:00 — сводка: что сейчас ликвид, а что лежит мёртвым грузом.\n\nЛиквидность — это доля таких вещей, которая уходит за неделю. Девяносто процентов значит «улетит за пару дней». Пятнадцать — «будет висеть месяц и дешеветь».',
  });

  seedMentor(S);

  S.week = { nw: netWorth(S), sold: 0, profit: 0 };
  S.history.push({ day: 0, value: Math.round(netWorth(S)) });
  return S;
}

/* ======================= НАСТАВНИК ======================= */
// Тимур остаётся характером, а не инструкцией: длинную лекцию он больше
// не читает. Подсказки приходят по ходу дела, когда игрок упирается в них сам.

function seedMentor(S) {
  const th = newThread(S, {
    kind: 'mentor',
    name: 'Тимур',
    sub: 'перекуп со стажем',
    platform: 'tg',
    pinned: true,
  });
  // Знакомство — это звонок (см. tutorial.js), а в чате остаётся запись
  // всего, что Тимур сказал: перечитать можно в любой момент.
  say(S, th, 'them', 'Брат, набрал тебе. Возьми трубку 📞');
}

/* ======================= СОХРАНЕНИЕ ======================= */

export function saveGame(S, storage) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    store.setItem(SAVE_KEY, JSON.stringify(S));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame(storage) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return null;
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const S = parsed.v === SAVE_VERSION ? fillDefaults(parsed) : migrate(parsed);
    if (S) migrateTutorial(S);
    return S;
  } catch (e) {
    return null;
  }
}

export function clearSave(storage) {
  try {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (store) store.removeItem(SAVE_KEY);
  } catch (e) {
    /* молча */
  }
}

/**
 * После загрузки сейва надо восстановить счётчики id, иначе новые вещи
 * начнут конфликтовать со старыми.
 */
export function restoreCounters(S) {
  let maxItem = 0;
  const scan = (it) => {
    if (it && it.id > maxItem) maxItem = it.id;
  };
  S.items.forEach(scan);
  for (const sh of S.shipments) sh.items.forEach(scan);
  for (const l of S.listings) {
    scan(l.item);
    scan(l.photoItem);
  }
  for (const x of S.second.items) scan(x.item);
  for (const th of S.threads) {
    if (th.data && th.data.lot) th.data.lot.items.forEach(scan);
  }
  resetIds(maxItem + 1);

  let maxListing = 0;
  for (const l of S.listings) if (l.id > maxListing) maxListing = l.id;
  resetListingIds(maxListing + 1);

  let maxSlot = 0;
  for (const x of S.second.items) if (x.id > maxSlot) maxSlot = x.id;
  resetSecondIds(maxSlot + 1);

  let maxPost = 0;
  for (const key of Object.keys(SUPPLIERS)) {
    for (const p of S.suppliers[key].posts) if (p.id > maxPost) maxPost = p.id;
  }
  resetSupplierIds(maxPost + 1);

  // Разблокировки могли не примениться к полям состояния.
  for (const key of Object.keys(S.prog.unlocks)) applyUnlock(S, key);
  return S;
}
