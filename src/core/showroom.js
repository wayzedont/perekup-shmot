// Шоурум.
//
// В прототипе это была строчка «+300 мест»: купил и забыл. Между тем
// физическое место — единственный канал продаж, который не требует
// переписки вообще. Человек зашёл, померил, забрал, ушёл. Денег меньше,
// чем выторговал бы ты сам, зато времени — ноль.
//
// Поэтому шоурум здесь не склад, а оборудование: каждое вложение
// превращает деньги в поток людей. Это и есть то, во что имеет смысл
// вкладывать на поздней игре, когда капитал уже некуда девать.

import { clamp } from './util.js';
import { ratingOf } from './economy.js';

export const SHOWROOM_ID = 'showroom';

export function hasShowroom(S) {
  return !!S.prog.storage[SHOWROOM_ID];
}

/**
 * Что можно поставить в шоуруме.
 * flow — насколько чаще заходят люди, price — насколько охотнее платят
 * полную цену. Числа маленькие осознанно: всё вместе даёт примерно
 * удвоение потока, а не десятикратный скачок.
 */
export const FITTINGS = [
  {
    id: 'repair',
    n: 'Ремонт и свет',
    d: 'Вместо подвала — помещение, куда не стыдно позвать.',
    price: 90000,
    flow: 0.3,
    price_k: 0.03,
  },
  {
    id: 'racks',
    n: 'Витрины и стойки',
    d: 'Вещи видно, а не свалены в коробках.',
    price: 60000,
    flow: 0.22,
    price_k: 0.02,
  },
  {
    id: 'fitting',
    n: 'Примерочная',
    d: 'Померил — значит, уже почти купил.',
    price: 70000,
    flow: 0.12,
    price_k: 0.05,
  },
  {
    id: 'sign',
    n: 'Вывеска на улицу',
    d: 'Мимо проходят тысячи, а знают о тебе десять человек.',
    price: 120000,
    flow: 0.45,
    price_k: 0,
  },
  {
    id: 'lounge',
    n: 'Кофе и диван',
    d: 'Человек задерживается — и уходит не с пустыми руками.',
    price: 45000,
    flow: 0.05,
    price_k: 0.04,
  },
  {
    id: 'sound',
    n: 'Звук и атмосфера',
    d: 'Не магазин, а место, куда заходят просто так.',
    price: 55000,
    flow: 0.18,
    price_k: 0.02,
  },
];

export const FITTING_BY_ID = Object.fromEntries(FITTINGS.map((f) => [f.id, f]));

export function fittingsOwned(S) {
  return FITTINGS.filter((f) => S.showroom && S.showroom.fittings && S.showroom.fittings[f.id]);
}

/** Насколько шоурум обустроен: от 0 до 1. */
export function comfort(S) {
  const total = FITTINGS.reduce((s, f) => s + f.flow, 0);
  const have = fittingsOwned(S).reduce((s, f) => s + f.flow, 0);
  return total ? have / total : 0;
}

/**
 * Сколько человек в час заходит с улицы.
 * Поток держится на трёх вещах: репутации, известности канала и том,
 * как выглядит само место.
 */
export function walkInRate(S) {
  if (!hasShowroom(S)) return 0;
  const rating = ratingOf(S);
  const trust = rating === null ? 0.5 : clamp((rating - 3) / 2, 0.15, 1.15);
  const fame = clamp(0.7 + S.tg.subs / 9000, 0.7, 1.9);
  // Обустройство удваивает поток, но не больше: у района есть предел.
  const fit = 1 + 0.5 * fittingsOwned(S).reduce((s, f) => s + f.flow, 0);
  // Должно быть что показывать: пустая витрина никого не удержит.
  const stock = clamp(S.items.filter((i) => i.sale).length / 25, 0, 1);
  return 0.09 * trust * fame * fit * stock * windowBonus(S);
}

/**
 * Какую долю от твоей цены платит зашедший.
 *
 * Меньше, чем выторговал бы ты сам, и это главное: шоурум продаёт
 * не дороже, а быстрее и без твоего участия. Если бы с улицы платили
 * полную цену, остальная игра стала бы не нужна.
 */
export function walkInPriceK(S) {
  const base = 0.78;
  const bonus = fittingsOwned(S).reduce((s, f) => s + f.price_k, 0);
  const skill = 0.004 * S.prog.skills.sales;
  return clamp(base + bonus + skill, 0.76, 0.95);
}

/* ======================= ВИТРИНА ======================= */
//
// Три вещи на подиуме у входа. Прохожие смотрят именно на них, поэтому
// витрина делает две вещи сразу: приводит больше людей с улицы и почти
// предопределяет, что они снимут с вешалки.
//
// Решение тут неочевидное, и в этом смысл. Поставить на подиум ходовое —
// значит продать то, что и так продастся. Поставить залежавшееся — значит
// вытащить замороженные деньги. Переставлять можно раз в сутки, так что
// это ровно то маленькое решение, ради которого стоит зайти утром.

export const WINDOW_SLOTS = 3;

export function windowIds(S) {
  return (S.showroom && S.showroom.window) || [];
}

/** Вещи на подиуме: только те, что ещё в продаже. */
export function windowItems(S) {
  const ids = windowIds(S);
  return S.items.filter((i) => ids.includes(i.id) && i.sale);
}

export function onWindow(S, item) {
  return windowIds(S).includes(item.id);
}

/** Через сколько часов витрину можно переставить. */
export function windowCooldown(S) {
  const set = (S.showroom && S.showroom.windowAt) || -9999;
  return Math.max(0, set + 24 - S.t);
}

export function canSetWindow(S) {
  if (!hasShowroom(S)) return { ok: false, why: 'Сначала нужен шоурум' };
  const left = windowCooldown(S);
  if (left > 0) return { ok: false, why: `Витрину меняют раз в сутки: ещё ${Math.ceil(left)} ч` };
  return { ok: true };
}

/** Насколько оформленная витрина добавляет людей с улицы. */
export function windowBonus(S) {
  const n = windowItems(S).length;
  if (!n) return 1;
  return 1 + 0.1 * n;
}

/**
 * Вес вещи с подиума при выборе.
 *
 * Именно вес, а не множитель: человек у входа видит эти три вещи, а не всю
 * вешалку, и его выбор почти не зависит от того, в моде модель или нет.
 * Множитель бы здесь не сработал — у мёртвой модели вес 0,25, у горячей
 * 1,25, и даже вчетверо усиленный неликвид проигрывал бы ходовому с вешалки.
 * А витрина нужна ровно для того, чтобы вытаскивать залежавшееся.
 */
export const WINDOW_WEIGHT = 3.2;

export function canBuyFitting(S, id) {
  const f = FITTING_BY_ID[id];
  if (!f) return { ok: false, why: 'Нет такого' };
  if (!hasShowroom(S)) return { ok: false, why: 'Сначала нужен шоурум' };
  if (S.showroom.fittings[id]) return { ok: false, why: 'Уже стоит' };
  return { ok: true };
}
