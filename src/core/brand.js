// Свой бренд и свои дропы.
//
// Вся игра до этого — продавать чужое. Бренд переворачивает роль: теперь
// шьёшь ты, а перекупы стоят в очереди за твоим. Дроп — самая крупная
// ставка в игре: производство оплачивается вперёд, и если аудитория не
// выкупит, на складе останется партия худи, которую придётся сливать.
//
// Что решает исход: сколько у тебя подписчиков и верят ли они тебе,
// какое качество ты заказал, какую цену поставил и не частишь ли с дропами.
// То есть ровно то, что игрок строил всю игру.

import { clamp, priceRound } from './util.js';
import { CATS } from './data/catalog.js';
import { ratingOf } from './economy.js';

export const BRAND_LEVEL = 15;
export const BRAND_PRICE = 1200000;

/** Качество пошива: от чего зависит и цена производства, и отзывы. */
export const QUALITY = [
  {
    id: 'cheap',
    n: 'Китай, как у всех',
    d: 'Дёшево и быстро. Люди увидят, что это дёшево.',
    costK: 0.18,
    appeal: 0.72,
    // Как ставят звёзды те, кто купил: [5★, 4★, 3★, 2★].
    // Дешёвый пошив видно сразу, и отзывы это покажут.
    stars: [0.05, 0.3, 0.4, 0.25],
  },
  {
    id: 'normal',
    n: 'Нормальная фабрика',
    d: 'Среднее по рынку: плотность держит, швы ровные.',
    costK: 0.28,
    appeal: 1,
    stars: [0.35, 0.45, 0.17, 0.03],
  },
  {
    id: 'premium',
    n: 'Мелкая мастерская',
    d: 'Дорого, медленно и очень хорошо. За такое и платят.',
    costK: 0.45,
    appeal: 1.32,
    stars: [0.65, 0.3, 0.05, 0],
  },
];

export const QUALITY_BY_ID = Object.fromEntries(QUALITY.map((q) => [q.id, q]));

/** Что можно выпускать. Базовая цена — ориентир, от неё считается всё. */
export const DROP_CATS = ['hoodie', 'tee', 'pants', 'jacket', 'cap', 'bag'];

export function hasBrand(S) {
  return !!S.flags.brand;
}

export function activeDrop(S) {
  return S.brand && S.brand.drop && S.brand.drop.left > 0 && S.brand.drop.endsAt > S.t
    ? S.brand.drop
    : null;
}

/**
 * Репутация бренда: сколько людей готовы платить премию за твоё имя.
 * Растёт за удачные дропы и падает за провальные.
 */
export function brandRep(S) {
  const b = S.brand || {};
  return clamp(1 + 0.12 * (b.hits || 0) - 0.18 * (b.flops || 0), 0.6, 2.2);
}

/** Цена, которую твоё имя держит без усилий, для вещи этой категории. */
export function fairPrice(S, cat) {
  const base = CATS[cat] ? CATS[cat].ship * 16 : 4000;
  return priceRound(base * brandRep(S));
}

/** Во сколько обойдётся производство одной штуки. */
export function unitCost(S, cat, qualityId) {
  const q = QUALITY_BY_ID[qualityId] || QUALITY[1];
  const base = CATS[cat] ? CATS[cat].ship * 16 : 4000;
  return priceRound(Math.max(300, base * q.costK * (1 - 0.015 * S.prog.skills.logist)));
}

/**
 * Сколько штук аудитория реально готова выкупить.
 *
 * Потолок — подписчики: без аудитории дроп не продать ни за какие деньги.
 * Дальше всё режется доверием, качеством, ценой и тем, как давно был
 * прошлый дроп: частить нельзя, люди не покупают по худи в неделю.
 */
export function demandFor(S, { cat, price, quality, partnerReach }) {
  if (!S.tg.has) return 0;
  const q = QUALITY_BY_ID[quality] || QUALITY[1];

  // Аудитория даёт покупателей с затуханием: удвоение подписчиков не
  // удваивает тираж. Иначе дроп превратился бы в кнопку «ещё денег», а канал
  // всё равно упирается в то, сколько людей в стране готовы носить твоё имя.
  const reach = 0.3 * (1 + 0.04 * S.prog.skills.smm);
  const base = reach * Math.pow(Math.max(0, S.tg.subs), 0.6);

  const rating = ratingOf(S);
  const trust = clamp(S.tg.trust / 100, 0.1, 1) * (rating === null ? 0.6 : clamp(rating / 5, 0.4, 1));

  const fair = fairPrice(S, cat) * q.appeal;
  // Цена выше честной рубит спрос резко, ниже — поднимает, но не бесконечно.
  const priceK = clamp(Math.pow(fair / Math.max(1, price), 1.8), 0.05, 2.2);

  // Насыщение: каждый дроп подряд продаётся хуже предыдущего.
  const since = S.brand && S.brand.lastDropAt ? (S.t - S.brand.lastDropAt) / 24 : 999;
  const rest = clamp(since / 21, 0.35, 1);

  // Партнёр по коллабу приводит свою аудиторию поверх твоей.
  const collab = 1 + (partnerReach || 0);

  return Math.max(0, Math.round(base * trust * priceK * rest * collab));
}

/** Насколько прогноз может не сбыться. Дроп — ставка, а не расчёт. */
export const DEMAND_SPREAD = 0.35;

/**
 * Прогноз для экрана.
 * Показываем именно вилку, а не одно число: точной цифры у игрока быть
 * не должно, иначе тираж считается калькулятором и риска не остаётся.
 */
export function forecast(S, params) {
  const cost = unitCost(S, params.cat, params.quality);
  const demand = demandFor(S, params);
  const lo = Math.round(demand * (1 - DEMAND_SPREAD));
  const hi = Math.round(demand * (1 + DEMAND_SPREAD));
  const expected = Math.min(params.qty, demand);
  // В коллабе ты платишь свою долю производства и получаешь свою долю выручки.
  const mine = 1 - (params.partnerShare || 0);
  const spend = Math.round(cost * params.qty * mine);
  const revenue = Math.round(expected * params.price * mine);
  return {
    cost,
    spend,
    demand,
    lo,
    hi,
    expected,
    revenue,
    mine,
    worst: Math.round(Math.min(params.qty, lo) * params.price * mine) - spend,
    best: Math.round(Math.min(params.qty, hi) * params.price * mine) - spend,
    profit: revenue - spend,
    sellThrough: params.qty ? expected / params.qty : 0,
  };
}

export const DROP_DAYS = 14;

/** Остатки после дропа уходят в аутлет за бесценок. */
export const SALVAGE_K = 0.25;
