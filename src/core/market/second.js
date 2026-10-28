// Секонд «Мешок».
//
// Завоз большой в понедельник и маленький в четверг. Ценник продавщицы ставят
// по бирке, поэтому оригинал и подделка стоят одинаково — и ровно в этом вся игра.
// Хорошее разбирают по часам, а осмотр теперь стоит игровых минут:
// за три часа до того, как ликвид разметут, успеваешь посмотреть десяток вещей
// из полусотни. Что именно смотреть — и есть решение.

import { clamp, priceRound } from '../util.js';
import { MODELS, BRANDED } from '../data/models.js';
import { CATS, CONDS } from '../data/catalog.js';
import { makeItem, hideDefects } from '../items.js';
import { valueOrig } from '../economy.js';
import { weekdayAt, hourIndex } from '../time.js';

let nextSecId = 1;
export function resetSecondIds(from) {
  nextSecId = from || 1;
}

/** Что вообще попадает на завоз при текущем уровне магазина. */
export function secondPool(S) {
  const lvl = S.prog.lvl;
  return BRANDED.filter((m) => {
    if (lvl >= 8) return true;
    if (lvl >= 4) return m.tier !== 'lux' && (m.tier !== 'prem' || m.rt <= 30000);
    return (m.tier === 'mass' || m.tier === 'street') && m.rt <= 13000;
  });
}

export function assortmentLabel(S) {
  const lvl = S.prog.lvl;
  if (lvl < 4) return 'масс-маркет и простой стритвир';
  if (lvl < 8) return 'стритвир и недорогой премиум';
  return 'вплоть до люкса';
}

/**
 * Одна вещь на полке.
 * good — «хорошая находка»: ликвидный бренд. Половина из них всё равно паль.
 */
export function secondItem(S, rng, good, forceReal) {
  let model;
  let cond;
  if (good) {
    const pool = secondPool(S);
    model = rng.weighted(pool, (m) => {
      const h = S.market.h[m.i];
      return (m.tier === 'lux' ? 0.12 : m.tier === 'prem' ? 0.5 : 1) * h * h;
    });
    cond = rng.weighted([1, 2, 3], (c) => [0.3, 0.45, 0.25][c - 1]);
  } else {
    const branded = rng.chance(0.22);
    const pool = branded ? secondPool(S) : MODELS.filter((m) => m.noname || m.tier === 'mass');
    model = rng.weighted(pool, (m) => (m.tier === 'lux' ? 0.08 : m.tier === 'prem' ? 0.4 : 1));
    cond = rng.weighted([1, 2, 3], (c) => [0.18, 0.44, 0.38][c - 1]);
  }

  // Брендовая вещь в секонде — ровно пятьдесят на пятьдесят.
  let real = true;
  let q = 0;
  if (!model.noname && !forceReal && rng.chance(0.5)) {
    real = false;
    q = rng.chance(good ? 0.5 : 0.65) ? rng.range(0.12, 0.5) : rng.range(0.5, 0.92);
  }

  const item = makeItem(rng, model.i, { cond, real, q, hasBox: false, boughtAt: S.t });
  hideDefects(rng, item, 0.55);

  // Ценник по бирке: от рыночной цены ОРИГИНАЛА в видимом состоянии.
  // На первых уровнях продавщицы не разбираются и ставят дешевле —
  // именно здесь у новичка и появляется оборотный капитал.
  const lvl = S.prog.lvl;
  const lo = lvl < 4 ? 0.3 : lvl < 8 ? 0.38 : 0.46;
  const hi = lvl < 4 ? 0.52 : lvl < 8 ? 0.62 : 0.7;
  const shown = { ...item, cond: item.shownCond };
  const base = model.noname
    ? Math.round((CATS[model.cat].ship * rng.range(0.8, 1.9)) / 10) * 10
    : Math.max(250, priceRound(valueOrig(S, shown) * rng.range(lo, hi)));

  return {
    id: nextSecId++,
    item,
    price: base,
    addedAt: S.t,
    good,
    taken: false,
  };
}

/** Ликвидный брендовый оригинал — то, за чем и приходят к открытию. */
export function isTreasure(S, slot) {
  const it = slot.item;
  return it.real && !MODELS[it.m].noname && S.market.h[it.m] >= 0.45;
}

export function restock(S, rng, kind) {
  if (kind === 'big') {
    // Остатки прошлой недели частично уезжают.
    S.second.items = S.second.items.filter((x) => x.addedAt > S.t - 24 * 7).slice(-12);
    const junk = rng.int(38, 48);
    for (let i = 0; i < junk; i++) S.second.items.push(secondItem(S, rng, false));
    const good = rng.int(5, 7);
    for (let i = 0; i < good; i++) S.second.items.push(secondItem(S, rng, true));
    S.second.lastBig = Math.floor(S.t / 24);
  } else {
    const junk = rng.int(10, 16);
    for (let i = 0; i < junk; i++) S.second.items.push(secondItem(S, rng, false));
    const good = rng.int(1, 2);
    for (let i = 0; i < good; i++) S.second.items.push(secondItem(S, rng, true));
    S.second.lastMini = Math.floor(S.t / 24);
  }
}

/**
 * Каждый час другие покупатели разбирают полку.
 * Ликвидный оригинал уходит почти весь за первые четыре-пять часов.
 */
export function pickOver(S, rng) {
  const h = hourIndex(S.t);
  if (h < 10 || h >= 21) return [];
  const sinceOpen = h - 10;
  // В первые часы после завоза толпа плотнее.
  const freshDay = weekdayAt(S.t) === 1 || weekdayAt(S.t) === 4;
  const crowd = freshDay ? clamp(1.5 - sinceOpen * 0.12, 0.5, 1.5) : 0.5;
  const taken = [];
  for (const slot of S.second.items) {
    if (slot.taken) continue;
    // Отложенное помощником на кассе никто не трогает.
    if (slot.reserved && slot.reserved > S.t) continue;
    const it = slot.item;
    const m = MODELS[it.m];
    const h2 = S.market.h[it.m];
    let p;
    if (isTreasure(S, slot)) p = 0.4 * crowd;
    else if (it.real && !m.noname) p = (0.06 + 0.12 * h2) * crowd;
    else if (!it.real && it.q > 0.8 && !m.noname) p = 0.05 * h2 * crowd;
    else p = 0.012 * crowd;
    // Дешёвое относительно рынка забирают охотнее.
    const shown = { ...it, cond: it.shownCond };
    const ratio = slot.price / Math.max(1, valueOrig(S, shown));
    if (ratio < 0.5) p *= 1.5;
    if (rng.chance(p)) {
      slot.taken = true;
      taken.push(slot);
    }
  }
  S.second.items = S.second.items.filter((x) => !x.taken);
  if (S.second.items.length > 80) S.second.items = S.second.items.slice(-80);
  return taken;
}

/** Скидка к выходным: чем ближе к следующему завозу, тем дешевле остатки. */
export function discountK(S) {
  const dw = weekdayAt(S.t);
  return [0.82, 1, 0.96, 0.92, 1, 0.92, 0.86][dw];
}

export function priceNow(S, slot) {
  return Math.max(50, Math.round((slot.price * discountK(S)) / 10) * 10);
}

export const findSlot = (S, id) => S.second.items.find((x) => x.id === +id);

/** Сколько вещей игрок уже успел осмотреть на этом завозе — для подсказки. */
export function inspectedCount(S) {
  return S.second.items.filter((x) => Object.keys(x.item.seen || {}).length > 0).length;
}
