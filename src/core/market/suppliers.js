// Поставщики в Телеге.
//
// «Ориг из Европы» — поштучно и дёшево, но иногда присылают паль.
// Чем выше уровень и «Связи», тем реже тебе подсовывают.
// «Китай Опт» — партии реплик от пяти штук, карго две недели и риск таможни.

import { clamp, priceRound } from '../util.js';
import { MODELS, BRANDED } from '../data/models.js';
import { CONDS } from '../data/catalog.js';
import { valueOrig, valueFake, cargoShip } from '../economy.js';
import { makeItem } from '../items.js';

export const SUPPLIERS = {
  orig: {
    id: 'orig',
    n: 'Ориг из Европы 🇪🇺',
    color: '#2a6bd1',
    kind: 'trap',
    about:
      'Оригинал из аутлетов Европы, всё с чеками 💯 Отправка СДЭКом, 3–6 дней. Поштучно.',
    tiers: ['street', 'prem', 'lux'],
    priceK: [0.56, 0.78],
    eta: [3, 6],
    minQty: 1,
    stock: [1, 3],
    ship: 500,
    fakeQuality: [0.55, 0.93],
  },
  rep: {
    id: 'rep',
    n: 'Китай Опт · реплики',
    color: '#c2402e',
    kind: 'rep',
    about:
      'Реплики с фабрик Путяня, партии от 5 штук. Есть эконом и топ 1:1. Карго до Москвы 10–16 дней. Бывает таможня.',
    eta: [10, 16],
    minQty: 5,
    stock: [30, 150],
    ship: 'cargo',
  },
};

/** Доля подделок у «Ориг из Европы»: падает с уровнем и связями. */
export function trapFakeRate(S) {
  return clamp(0.3 - 0.013 * S.prog.lvl - 0.018 * S.prog.skills.conn, 0.07, 0.3);
}

let nextPostId = 1;
export function resetSupplierIds(from) {
  nextPostId = from || 1;
}

export function makePost(S, rng, key, silent) {
  const C = SUPPLIERS[key];
  let model;
  if (C.kind === 'rep') {
    model = rng.weighted(BRANDED, (m) => 0.15 + S.market.h[m.i] * S.market.h[m.i] * 2.2);
  } else {
    const pool = BRANDED.filter(
      (m) => C.tiers.includes(m.tier) && (m.tier !== 'lux' || S.prog.lvl >= 6),
    );
    model = rng.weighted(pool, (m) => 0.3 + S.market.h[m.i]);
  }

  const cond = C.kind === 'trap' ? rng.weighted([0, 1], (c) => [0.75, 0.25][c]) : 0;
  const template = makeItem(rng, model.i, { cond, hasBox: cond === 0 });

  let price;
  let quality = 0;
  let top = false;
  if (C.kind === 'rep') {
    top = rng.chance(0.5);
    quality = top ? rng.range(0.78, 0.96) : rng.range(0.15, 0.45);
    price = Math.max(300, priceRound(model.rt * (top ? rng.range(0.09, 0.13) : rng.range(0.03, 0.05))));
  } else {
    price = priceRound(valueOrig(S, template) * rng.range(C.priceK[0], C.priceK[1]) * (1 - 0.015 * S.prog.skills.conn));
  }

  const headline = {
    trap: rng.pick(['🔥 Новое поступление из Европы', 'В наличии, ориг с чеком', 'Свежая поставка из аутлета 💯']),
    rep: rng.pick(['Новая партия с фабрики', 'Топ продаж этой недели', 'Качество 1:1, все бирки']),
  }[C.kind];

  const post = {
    id: nextPostId++,
    at: S.t,
    m: model.i,
    cond,
    way: template.way,
    price,
    left: rng.int(C.stock[0], C.stock[1]),
    quality,
    top,
    fakeRate: C.kind === 'trap' ? trapFakeRate(S) : 0,
    size: C.minQty === 1 ? template.size : null,
    text:
      `${headline}\n${model.b} ${model.n}` +
      (C.kind === 'rep' ? (top ? ' · реплика ТОП 1:1' : ' · реплика эконом') : '') +
      `\n${CONDS[cond].n}` +
      (C.minQty === 1 ? ` · размер ${template.size}` : ' · размерная сетка'),
  };

  const ch = S.suppliers[key];
  ch.posts.unshift(post);
  if (ch.posts.length > 14) ch.posts.length = 14;
  if (!silent) ch.unread++;
  return post;
}

export function prunePosts(S) {
  for (const key of Object.keys(SUPPLIERS)) {
    const ch = S.suppliers[key];
    ch.posts = ch.posts.filter((p) => S.t - p.at < 96 && p.left > 0);
  }
}

/** Собрать вещи по заказу у поставщика. */
export function buildOrderItems(S, rng, key, post, qty, unitCost) {
  const C = SUPPLIERS[key];
  const items = [];
  for (let i = 0; i < qty; i++) {
    const opts = {
      cond: post.cond,
      way: post.way,
      size: post.size || undefined,
      cost: unitCost,
      src: C.n,
      hasBox: post.cond === 0,
      boughtAt: S.t,
    };
    if (C.kind === 'rep') {
      opts.real = false;
      opts.q = clamp(post.quality + rng.range(-0.05, 0.05), 0.03, 0.98);
      opts.verdict = 'fake';
    } else if (rng.chance(post.fakeRate)) {
      opts.real = false;
      opts.q = rng.range(C.fakeQuality[0], C.fakeQuality[1]);
    }
    items.push(makeItem(rng, post.m, opts));
  }
  return items;
}

export function postTotal(S, key, post, qty) {
  const C = SUPPLIERS[key];
  const shipping = C.ship === 'cargo' ? cargoShip(S, post.m) * qty : C.ship;
  return post.price * qty + shipping;
}

export function shipUnit(S, key, post) {
  const C = SUPPLIERS[key];
  return C.ship === 'cargo' ? cargoShip(S, post.m) : C.ship;
}

export const findPost = (S, key, id) => S.suppliers[key].posts.find((p) => p.id === +id);

/** Риск, что таможня заберёт карго с репликами. */
export function seizureChance(S, hasCustomsEvent) {
  const base = 0.05 + (hasCustomsEvent ? 0.18 : 0);
  return clamp(base * (1 - 0.04 * S.prog.skills.logist), 0.01, 0.3);
}
