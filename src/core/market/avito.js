// Авитка: объявления, поиск, фильтры.

import { clamp, priceRound } from '../util.js';
import { MODELS } from '../data/models.js';
import { CATS, CONDS, TIERS } from '../data/catalog.js';
import { METRO, CITIES } from '../data/content.js';
import { makeItem, hideDefects, itemName, shownCondition } from '../items.js';
import { makeSeller, rollSignals, SELLER_TYPES, SELLER_KEYS } from '../people/sellers.js';
import { valueOrig, valueFake, netWorth } from '../economy.js';

let listingCounter = 1;
export function resetListingIds(from) {
  listingCounter = from || 1;
}
export function nextListingId() {
  return listingCounter++;
}

/** Какие модели вообще может предложить рынок при текущем капитале игрока. */
function affordablePool(S) {
  const cap = Math.max(26000, netWorth(S) * 1.6);
  return MODELS.filter((m) => m.rt * 1.1 <= cap || m.tier === 'mass');
}

export function generateListing(S, rng, opts = {}) {
  const type = opts.type || rng.weighted(SELLER_KEYS, (k) => SELLER_TYPES[k].w);
  const T = SELLER_TYPES[type];
  const pool = affordablePool(S);

  // Магазины реплик и вруны не возятся с ноунеймом.
  const candidates = pool.filter((m) => {
    if ((type === 'replica' || type === 'liar' || type === 'collector') && m.noname) return false;
    return true;
  });
  const model = rng.weighted(candidates.length ? candidates : pool, (m) => {
    let w = (m.noname ? 0.4 : 1) * (0.3 + S.market.h[m.i]);
    if (m.tier === 'lux') w *= 0.25;
    if (m.tier === 'prem') w *= 0.7;
    if (type === 'collector' && (m.tier === 'prem' || m.tier === 'lux')) w *= 3;
    if (type === 'parent' && m.tier === 'lux') w *= 0.1;
    return w;
  });

  const cond =
    type === 'replica'
      ? 0
      : rng.weighted([0, 1, 2, 3], (c) => [0.14, 0.3, 0.36, 0.2][c]);

  const real = !(type === 'replica' || type === 'liar' || rng.chance(T.fakeChance));
  const q = real ? 0 : type === 'replica' ? rng.range(0.55, 0.95) : rng.range(0.25, 0.95);

  const item = makeItem(rng, model.i, {
    cond,
    real,
    q,
    hasBox: cond === 0 && rng.chance(0.7),
    boughtAt: S.t,
  });
  // Б/у вещи с рынка часто скрывают дефекты: в объявлении состояние лучше, чем есть.
  if (cond > 0) hideDefects(rng, item, type === 'shop' ? 0.3 : type === 'collector' ? 0.1 : 0.45);
  if (type === 'replica') item.verdict = 'fake';

  const declared = T.declares === 'fake' ? 'fake' : 'orig';
  // Цена ставится от того, ЧТО ЗАЯВЛЕНО, и от видимого состояния.
  const shownItem = { ...item, cond: item.shownCond };
  const fairPrice = declared === 'fake' ? valueFake(S, shownItem) : valueOrig(S, shownItem);
  const ask = priceRound(Math.max(200, fairPrice * rng.range(T.askK[0], T.askK[1])));

  const mode =
    type === 'scam'
      ? 'ship'
      : type === 'replica'
        ? rng.pick(['both', 'ship'])
        : rng.weighted(['both', 'meet', 'ship'], (k) => ({ both: 0.48, meet: 0.27, ship: 0.25 })[k]);

  const priceRatio = ask / Math.max(1, valueOrig(S, shownItem));
  const back = opts.back || 0;
  const listing = {
    id: nextListingId(),
    item,
    declared,
    ask,
    fair: fairPrice,
    mode,
    city: mode === 'ship' ? rng.pick(CITIES) : 'Москва',
    metro: mode === 'ship' ? '' : rng.pick(METRO),
    postedAt: S.t - back,
    seller: makeSeller(rng, type, ask, S.prog.skills.bargain),
    signals: rollSignals(rng, type, priceRatio, mode),
    photosAsked: false,
    photoNote: '',
    photoLegit: false,
    threadId: null,
    inspectedRemote: false,
    sniped: false,
  };

  // Дешёвые объявления живут недолго: их перехватывают другие перекупы.
  const isDeal = declared === 'orig' && priceRatio < 0.68 && type !== 'scam';
  listing.expiresAt = isDeal
    ? S.t + rng.int(4, 14)
    : S.t - back + rng.int(30, 130);
  if (listing.expiresAt <= S.t) listing.expiresAt = S.t + rng.int(10, 48);
  listing.isDeal = isDeal;
  listing.description = describe(rng, listing);
  return listing;
}

function describe(rng, listing) {
  const { item, seller, mode } = listing;
  const m = MODELS[item.m];
  const sizeText = item.size === 'One size' ? '' : ` Размер ${item.size}.`;
  const base = {
    owner: rng.pick([
      'Продаю, не подошёл размер.',
      'Носил пару раз, надоело.',
      'Разбираю шкаф, всё лишнее отдаю.',
      'Брал себе, но не мой стиль.',
    ]),
    shop: 'В наличии! Ориг 100%. Отправка в день оплаты Авитка Доставкой. Больше товаров в профиле.',
    parent: rng.pick([
      'Сын вырос, вещи остались. Не знаю, что за фирма, вроде хорошая.',
      'Разбираю вещи сына, он уехал учиться. Отдам недорого, торг.',
    ]),
    replica: 'Реплика премиум-качества 1:1. Все бирки, коробка. Не оригинал, честно предупреждаю!',
    liar: rng.pick([
      'Ориг, брал в ЦУМе, чек потерялся. Срочно, нужны деньги.',
      '100% оригинал. Продаю ниже рынка — срочно переезжаю.',
      'Оригинал, покупал за границей. Дёшево, потому что срочно.',
    ]),
    collector: `${m.b} ${m.n}. Состояние честное, всё как на фото. Торг уместен для понимающих.`,
    hurry: rng.pick([
      'Срочно! Нужны деньги сегодня. Кто первый, тому отдам.',
      'Продаю срочно, уезжаю в пятницу. Забрать надо быстро.',
    ]),
    scam: 'Оригинал, новый. Цена ниже рынка — переезд. Пишите только сюда, звонки не беру.',
  }[seller.type];

  const where =
    mode === 'ship'
      ? ' Отправлю Авитка Доставкой, встретиться не получится.'
      : mode === 'meet'
        ? ` Только личная встреча у м. ${listing.metro}, не отправляю.`
        : ` Отправлю доставкой или встретимся у м. ${listing.metro}.`;

  let extra = '';
  if (listing.signals.includes('noCalls')) extra += ' Звонки не беру, только сообщения.';
  if (item.hasBox) extra += ' Коробка в наличии.';

  return base + sizeText + ' Состояние: ' + shownCondition(item).short + '.' + extra + where;
}

/* ======================= ЖИЗНЬ РЫНКА ======================= */

export const MARKET_SIZE = 42;

export function refillMarket(S, rng, notify) {
  const own = S.listings.filter((l) => l.incoming).length;
  const need = MARKET_SIZE + own - S.listings.length;
  if (need <= 0) return;
  const add = Math.min(3, need);
  for (let i = 0; i < add; i++) {
    if (!rng.chance(0.6)) continue;
    const l = generateListing(S, rng);
    S.listings.push(l);
    if (l.isDeal && rng.chance(0.18 + 0.05 * S.prog.skills.conn) && notify) {
      notify(l);
    }
  }
}

export function expireListings(S, onExpire) {
  const keep = [];
  for (const l of S.listings) {
    if (l.expiresAt > S.t) {
      keep.push(l);
      continue;
    }
    if (onExpire) onExpire(l);
  }
  S.listings = keep;
}

/* ======================= ПОИСК ======================= */

export function filterListings(S) {
  const f = S.ui.filters;
  const q = (f.q || '').toLowerCase().trim();
  let list = S.listings.filter((l) => {
    // Те, кто пришёл по твоему объявлению «скупаю», живут в чатах,
    // а не в общей ленте поиска.
    if (l.incoming) return false;
    const m = MODELS[l.item.m];
    if (f.cat !== 'all' && m.cat !== f.cat) return false;
    if (f.model !== 'all' && l.item.m !== +f.model) return false;
    if (f.size !== 'all' && l.item.size !== f.size) return false;
    if (f.mode === 'ship' && l.mode === 'meet') return false;
    if (f.mode === 'meet' && l.mode === 'ship') return false;
    if (f.onlyDeals && !l.isDeal) return false;
    if (q) {
      const hay = (m.b + ' ' + m.n + ' ' + CATS[m.cat].n + ' ' + TIERS[m.tier].n).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const sorts = {
    new: (a, b) => b.postedAt - a.postedAt,
    cheap: (a, b) => a.ask - b.ask,
    expensive: (a, b) => b.ask - a.ask,
    deal: (a, b) => a.ask / a.fair - b.ask / b.fair,
  };
  list.sort(sorts[f.sort] || sorts.new);
  return list;
}

export const findListing = (S, id) => S.listings.find((l) => l.id === +id);

/** Игрок открыл карточку. С этого момента объявление для него «на примете». */
export function markSeen(S, id) {
  const l = findListing(S, id);
  if (l && !l.seenAt) l.seenAt = S.t;
  return l;
}

export function deliveryFee(price) {
  return Math.max(199, Math.round(price * 0.05));
}

export function listingTitle(l) {
  return itemName(l.item);
}

/** Признак «дёшево» для карточки. */
export function dealLevel(l) {
  const r = l.ask / Math.max(1, l.fair);
  if (r < 0.62) return 'hot';
  if (r < 0.78) return 'good';
  if (r > 1.14) return 'pricey';
  return 'fair';
}
