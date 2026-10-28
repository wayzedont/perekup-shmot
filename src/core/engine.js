// Сборка движка: создание игры, первые минуты, сохранение и загрузка.

import { newGame, migrate, fillDefaults, SAVE_KEY, SAVE_VERSION } from './state.js';
import { rngOf, newThread, say, notify, touch } from './kernel.js';
import { resetIds, makeItem, hideDefects } from './items.js';
import { generateListing, resetListingIds } from './market/avito.js';
import { restock, resetSecondIds } from './market/second.js';
import { makePost, resetSupplierIds, SUPPLIERS } from './market/suppliers.js';
import { newRaffle } from './market/raffle.js';
import { MODELS } from './data/models.js';
import { netWorth } from './economy.js';
import { applyUnlock } from './progression.js';

/* ======================= СОЗДАНИЕ ИГРЫ ======================= */

export function createGame(seed) {
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
  say(S, th, 'them', 'О, здорово! Слышал, решил шмотом заняться. Ну давай, расскажу главное, остальное по ходу.');
  say(
    S,
    th,
    'them',
    'Смысл простой: берёшь дешевле, продаёшь дороже. Берут в секонде, на Авитке у тех, кто не шарит, и в Китае. Продают на Авитке и в своём канале.',
  );
  say(
    S,
    th,
    'them',
    'Но главное тут не цена, а две вещи: ликвид и паль.\n\nЛиквид — это что сейчас носят. Горячая вещь улетает за два дня, мёртвая висит месяц и дешевеет у тебя в шкафу.\n\nПаль — это половина рынка. Бывает такая, что видно сразу, а бывает один в один.',
  );
  say(
    S,
    th,
    'them',
    'Отличать паль научишься руками. В карточке вещи есть осмотр: смотришь бирку, швы, подошву — по одному признаку за раз, и каждый отнимает минут пятнадцать. Поэтому выбирай, что смотреть.',
  );
  say(
    S,
    th,
    'them',
    'И записывай, по чему палится какая модель. У тебя для этого книжка есть, она сама запоминает. Через пару недель будешь видеть палево с порога.',
  );
  say(
    S,
    th,
    'them',
    'Кстати, брат тебе Теч Флис подарил? Посмотри его внимательно. Что-то он мутный 😏',
  );
  say(
    S,
    th,
    'them',
    'Сегодня понедельник, в десять в «Мешке» завоз. Приличное разберут часа за четыре, так что думай быстро. Погнали!',
  );
  th.unread = 1;
  notify(S, {
    route: 'tg/thread/' + th.id,
    title: 'Тимур',
    text: 'Расскажу главное, остальное по ходу',
    scope: 'client',
  });
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
    if (parsed.v === SAVE_VERSION) return fillDefaults(parsed);
    return migrate(parsed);
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
  for (const l of S.listings) scan(l.item);
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
