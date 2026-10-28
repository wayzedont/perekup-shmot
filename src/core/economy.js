// Экономика: сколько вещь стоит и как быстро её купят.
//
// Главное отличие от прототипа — ликвидность теперь кусается.
// Между мёртвой моделью и горячей разница в спросе примерно двадцатикратная,
// а не трёхкратная. Из-за этого неликвид реально висит и ест место в шкафу,
// а Хайп-радар превращается из украшения в инструмент.

import { clamp, priceRound } from './util.js';
import { CATS, CONDS, TIERS, seasonK, sizeDemand } from './data/catalog.js';
import { MODELS } from './data/models.js';
import { MAX_SKILL, STORAGE, BASE_CAPACITY } from './data/progress.js';

const STORAGE_BY_ID = Object.fromEntries(STORAGE.map((s) => [s.id, s]));

/* ======================= НАСТРОЙКИ БАЛАНСА ======================= */
// Всё, что крутится при настройке, собрано здесь. Симулятор дёргает
// именно эти числа, логика ниже не меняется.

export const TUNE = {
  // Спрос
  demandBase: 0.16, // покупателей в час у горячей вещи по рынку, до всех множителей
  liqPower: 1.67, // степень влияния ликвидности: даёт разброс ~20x
  priceSteep: 6.5, // насколько жадная цена убивает спрос
  avitoShare: 1.0, // доля спроса, идущая с Авитки
  tgSubMax: 0.62, // потолок вклада подписчиков в спрос канала
  tgSubValue: 0.00038, // сколько даёт один подписчик: потолок берётся к ~1600

  // Цена
  hypePriceLo: 0.62, // цена мёртвой модели от ретейла
  hypePriceHi: 0.58, // надбавка за полную ликвидность
  seasonPriceK: 0.28, // насколько сезон двигает цену (спрос двигает сильнее)
  staleAfterDays: 10, // со скольких дней вещь начинает «протухать»
  stalePerDay: 0.015,
  staleFloor: 0.74,

  // Подделки
  fakeBase: 0.065, // цена эконом-реплики от оригинала
  fakeQualityK: 0.21, // прибавка за качество копии

  // Лимитки
  limPeak: 1.3,
  limBonus: 0.85,
  limHalfLifeDays: 19,
};

/* ======================= ВРЕМЯ И РЫНОК ======================= */

export const dayOf = (S) => Math.floor(S.t / 24);
export const hourOf = (S) => S.t % 24;

/** Текущая ликвидность модели 0..1. */
export const hypeOf = (S, mi) => S.market.h[mi];

/** Ликвидность в процентах для интерфейса. */
export const hypePct = (S, mi) => Math.round(S.market.h[mi] * 100);

/** Ликвидность, которую «видит» Пойзон: она отстаёт от реальной на пару недель. */
export const hypeLag = (S, mi) => S.market.hP[mi];

/** Месяц от 0. Старт — 7 сентября. */
export function monthOf(S) {
  return dateOf(S).getMonth();
}

export function dateOf(S, t) {
  const tt = t === undefined ? S.t : t;
  return new Date(2026, 8, 7 + Math.floor(tt / 24));
}

/* ======================= СТОИМОСТЬ ВЕЩИ ======================= */

/** Сколько дней вещь лежит у игрока. */
export function daysHeld(S, item) {
  return Math.max(0, (S.t - (item.boughtAt || 0)) / 24);
}

/** Множитель «вещь залежалась»: замороженный капитал должен жечь. */
export function staleK(S, item) {
  const d = daysHeld(S, item);
  if (d <= TUNE.staleAfterDays) return 1;
  return clamp(1 - (d - TUNE.staleAfterDays) * TUNE.stalePerDay, TUNE.staleFloor, 1);
}

/** Надбавка за лимитку: после релиза дорогая, за месяц сползает. */
export function limitK(S, item) {
  if (!item.limitedAt) return 1;
  const days = (S.t - item.limitedAt) / 24;
  return TUNE.limPeak + TUNE.limBonus * Math.exp(-days / TUNE.limHalfLifeDays);
}

/** Ликвидность вещи: у лимиток она всегда высокая. */
export function itemHype(S, item) {
  const h = hypeOf(S, item.m);
  return item.limitedAt ? Math.max(h, 0.92) : h;
}

/** Рыночная цена оригинала. */
export function valueOrig(S, item) {
  const m = MODELS[item.m];
  const h = itemHype(S, item);
  const cond = CONDS[item.cond].k;
  const hypeK = TUNE.hypePriceLo + TUNE.hypePriceHi * h;
  const season = 1 - TUNE.seasonPriceK + TUNE.seasonPriceK * seasonK(m.cat, monthOf(S));
  const size = 0.9 + 0.12 * sizeDemand(item.size);
  return priceRound(m.rt * cond * hypeK * season * size * limitK(S, item) * staleK(S, item));
}

/** Рыночная цена честно заявленной реплики. */
export function valueFake(S, item) {
  const m = MODELS[item.m];
  const q = item.q || 0.4;
  const h = hypeOf(S, item.m);
  const cond = CONDS[item.cond].k;
  const season = 1 - TUNE.seasonPriceK + TUNE.seasonPriceK * seasonK(m.cat, monthOf(S));
  const base = m.rt * cond * (TUNE.fakeBase + TUNE.fakeQualityK * q) * (0.65 + 0.45 * h) * season;
  return priceRound(Math.max(250, base * staleK(S, item)));
}

/** Цена, по которой вещь имеет смысл выставлять, с учётом того, что игрок о ней знает. */
export function marketValue(S, item) {
  return item.verdict === 'fake' ? valueFake(S, item) : valueOrig(S, item);
}

/**
 * Честная ценность для расчёта капитала.
 * Учитываем две скидки: на непроверенную подлинность и на то, что
 * неликвид не продать. Вещь, которую никто не купит, стоит столько,
 * сколько за неё даст скупщик, — и не рублём больше.
 */
export function bookValue(S, item) {
  const m = MODELS[item.m];
  let v;
  if (item.verdict === 'fake') v = valueFake(S, item) * 0.85;
  else if (item.verdict === 'orig') v = valueOrig(S, item) * 0.95;
  else if (m.noname) v = valueOrig(S, item) * 0.85;
  else v = (valueOrig(S, item) * 0.62 + valueFake(S, item) * 0.38) * 0.9;

  // Насколько эту вещь вообще реально продать.
  const h = itemHype(S, item);
  const season = seasonK(m.cat, monthOf(S));
  const sell = clamp(0.3 + 0.7 * Math.pow(h, 0.7) * Math.min(1.2, season) * (0.75 + 0.25 * sizeDemand(item.size)), 0.3, 1);
  return Math.max(pawnPrice(S, item), v * sell);
}

/* ======================= СПРОС ======================= */

/** Коэффициент цены: насколько она отпугивает. r = цена / рынок. */
export function priceFactor(r) {
  return clamp(Math.exp(-TUNE.priceSteep * (r - 0.95)), 0.02, 3.2);
}

/** Множитель рейтинга магазина. Ниже четырёх — покупатели почти не пишут. */
export function ratingFactor(S) {
  const r = ratingOf(S);
  if (r === null) return 0.78; // новичку верят меньше, но шанс есть
  return clamp(Math.pow(Math.max(0, (r - 1) / 4), 1.7) * 1.08, 0.08, 1.1);
}

/** Рейтинг: взвешенное среднее последних 40 отзывов, единица весит втрое. */
export function ratingOf(S) {
  const rs = S.rep.reviews.slice(0, 40);
  if (!rs.length) return null;
  let a = 0;
  let w = 0;
  for (const r of rs) {
    a += r.stars * r.weight;
    w += r.weight;
  }
  return a / w;
}

export function isTrusted(S) {
  const r = ratingOf(S);
  return S.rep.reviews.length >= 15 && r !== null && r >= 4.8;
}

/** Общий множитель спроса от событий и месяца. */
export function demandClimate(S) {
  const mo = monthOf(S);
  let k = mo === 11 ? 1.3 : mo === 0 ? 0.78 : mo === 10 ? 1.1 : 1;
  for (const e of activeEvents(S, 'demand')) k *= e.val;
  return k;
}

export function activeEvents(S, type) {
  return S.events.filter((e) => e.type === type && S.t >= e.start && S.t < e.end);
}

export const hasEvent = (S, type) => activeEvents(S, type).length > 0;

/**
 * Сколько покупателей в час напишет по этой вещи на площадке.
 * Возвращает вероятность события в час (обычно сильно меньше единицы).
 */
/**
 * Ритм недели.
 *
 * У игры должен быть план на неделю, а не ровный гул: в понедельник завоз в
 * секонде, к четвергу вещи осмотрены и выставлены, а покупают в пятницу
 * вечером и в выходные — когда у людей зарплата и свободное время. Это
 * единственная причина заходить во вторник: вторник это день закупки, а не
 * день продаж, и это надо почувствовать.
 *
 * Пн 0,92 · Вт 0,90 · Ср 0,95 · Чт 0,98 · Пт 1,08 · Сб 1,12 · Вс 1,05
 * Среднее по неделе ровно единица — общий спрос не изменился, изменилась
 * только его форма.
 *
 * Первая версия была вдвое контрастнее (от 0,74 до 1,38), и это сломало
 * обещание «раньше третьей недели не разбогатеть»: самый удачливый прогон
 * добирался до пятидесяти тысяч на 13-й день вместо 23-го — выходные
 * превращались в пушку. Ритм должен чувствоваться, а не решать за игру.
 */
const WEEK_RHYTHM = [1.05, 0.92, 0.9, 0.95, 0.98, 1.08, 1.12];

export function weekRhythm(S) {
  // День недели считаем от той же даты, что и всё остальное в экономике,
  // чтобы не тянуть сюда зависимость от модуля времени.
  return WEEK_RHYTHM[dateOf(S).getDay()];
}

/**
 * Значок «отвечает быстро».
 *
 * На настоящем Авито скорость ответа видна всем и влияет на то, кому пишут.
 * Здесь так же: отвечаешь покупателям каждый день — значок держится и
 * приводит людей, пропал на сутки — слетает и собирается заново. Это и есть
 * честная причина заходить завтра: не подарок за вход, а репутация, которая
 * живёт, только пока ты в рынке.
 */
export const FAST_REPLY_DAYS = 3;

export function fastReplyBadge(S) {
  return (S.streak.days || 0) >= FAST_REPLY_DAYS;
}

/**
 * Множитель спроса от значка. Держим его маленьким осознанно: боты в
 * симуляциях отвечают всем мгновенно и значок не теряют никогда, поэтому
 * весь баланс посчитан с ним. Если бы значок давал много, живой игрок,
 * пропустивший день, играл бы в заметно более тяжёлую игру, чем измеренная.
 */
export function replyFactor(S) {
  const d = S.streak.days || 0;
  if (d < FAST_REPLY_DAYS) return 1;
  return clamp(1 + 0.015 * (d - FAST_REPLY_DAYS + 1), 1, 1.08);
}

/** Как называется сегодняшний день для подсказки в интерфейсе. */
export function rhythmLabel(S) {
  const k = weekRhythm(S);
  if (k >= 1.3) return { n: 'покупателей много', tone: 'good' };
  if (k >= 1.15) return { n: 'покупателей больше обычного', tone: 'good' };
  if (k >= 0.92) return { n: 'покупателей как обычно', tone: 'flat' };
  if (k >= 0.8) return { n: 'покупателей меньше обычного', tone: 'warn' };
  return { n: 'покупателей мало: день закупки, а не продаж', tone: 'warn' };
}

export function buyerRate(S, item, platform) {
  const sale = item.sale;
  if (!sale) return 0;
  const m = MODELS[item.m];
  const base = sale.asOrig ? valueOrig(S, item) : valueFake(S, item);
  if (base <= 0) return 0;

  const h = itemHype(S, item);
  const liq = Math.pow(h, TUNE.liqPower);
  const season = seasonK(m.cat, monthOf(S));
  const size = sizeDemand(item.size);
  const tier = TIERS[m.tier].demand;
  const price = priceFactor(sale.price / base);
  const photo = sale.photo ? 1.3 : 1;
  const desc = sale.description ? 1.12 : 1;
  const skill = 1 + 0.055 * S.prog.skills.sales;
  const showroom = S.prog.storage.showroom ? 1.3 : 1;

  let rate =
    TUNE.demandBase * liq * season * size * tier * price * photo * desc * skill * showroom * demandClimate(S) * weekRhythm(S);

  if (platform === 'avito') {
    if (S.rep.banUntil > S.t) return 0;
    const bumped = Math.max(sale.listedAt, sale.bumpedAt || 0);
    const fresh = 0.34 + 0.66 * Math.exp(-(S.t - bumped) / 96);
    rate *= ratingFactor(S) * fresh * TUNE.avitoShare * replyFactor(S);
    if (isTrusted(S)) rate *= 1.22;
    if (sale.boostUntil > S.t) rate *= 2.1;
    if (!sale.asOrig && hasEvent(S, 'avitoPurge')) rate *= 0.4;
  } else {
    if (!S.tg.has) return 0;
    const fresh = Math.exp(-(S.t - (sale.postedAt || 0)) / 60);
    const audience = clamp(S.tg.subs * TUNE.tgSubValue, 0, TUNE.tgSubMax);
    const trust = clamp(S.tg.trust / 60, 0.2, 1.45);
    rate *= audience * trust * (0.25 + 0.75 * fresh);
    if (S.prog.unlocks.showcase) rate *= 1.25;
  }
  return Math.min(rate, 0.55);
}

/** Сколько покупателей в день ожидать — для подсказки в интерфейсе. */
export function buyersPerDay(S, item) {
  let r = 0;
  if (item.sale && item.sale.avito) r += buyerRate(S, item, 'avito');
  if (item.sale && item.sale.tg) r += buyerRate(S, item, 'tg');
  return r * 15;
}

/* ======================= ПОДДЕЛКИ ======================= */

/** Вероятность, что покупатель полезет проверять подлинность. */
export function detectChance(S, item, pressure) {
  const m = MODELS[item.m];
  const q = item.q || 0.4;
  let p = 0.1 + 0.8 * Math.pow(1 - q, 1.15);
  p += { lux: 0.26, prem: 0.13, street: 0, mass: -0.04 }[m.tier];
  if (hasEvent(S, 'avitoPurge')) p += 0.1;
  // Как ты вёл себя в переписке: наглая ложь повышает шанс проверки.
  p += (pressure || 0) * 0.22;
  return clamp(p, 0.04, 0.97);
}

/* ======================= ДЕНЬГИ ======================= */

export function capacity(S) {
  let c = BASE_CAPACITY;
  for (const id of Object.keys(S.prog.storage)) {
    if (!S.prog.storage[id]) continue;
    const def = STORAGE_BY_ID[id];
    if (def) c += def.cap;
  }
  if (S.prog.unlocks.slotBonus) c += 5;
  return c;
}

export function usedSlots(S) {
  let n = S.items.length;
  for (const sh of S.shipments) n += sh.items.length;
  return n;
}

export function freeSlots(S) {
  return Math.max(0, capacity(S) - usedSlots(S));
}

/** Капитал: деньги, вклад, ожидаемые выплаты, вещи и посылки минус долги. */
export function netWorth(S) {
  let v = S.money + S.deposit;
  for (const p of S.pending) {
    if (p.type === 'payout' && !p.cancelled) v += p.amount;
  }
  for (const it of S.items) v += bookValue(S, it);
  for (const sh of S.shipments) for (const it of sh.items) v += bookValue(S, it) * 0.9;
  for (const id of Object.keys(S.prog.storage)) {
    const def = STORAGE_BY_ID[id];
    if (S.prog.storage[id] && def && def.price) v += def.price * 0.5;
  }
  for (const l of S.loans) v -= l.principal;
  return v;
}

/* ======================= ЛЕГИТ-ЧЕК ======================= */

export function legitCost(S, item) {
  const m = MODELS[item.m];
  let c = TIERS[m.tier].legit * (1 - 0.045 * S.prog.skills.eye);
  if (S.prog.unlocks.legitDiscount) c *= 0.75;
  return Math.round(c / 10) * 10;
}

export function legitMinutes(S) {
  return S.prog.unlocks.fastLegit ? 15 : 60;
}

/* ======================= ДОСТАВКА ======================= */

export function poizonPrice(S, mi, size) {
  const m = MODELS[mi];
  const lag = hypeLag(S, mi);
  const sizeK = size == null || size === 'mix' ? 1 : 0.88 + 0.14 * sizeDemand(size);
  const sale = hasEvent(S, 'poizonSale') ? 0.85 : 1;
  return priceRound(
    m.rt * (0.58 + 0.34 * lag) * (S.market.fx / 12) * S.market.pzNoise[mi] * sizeK * sale,
  );
}

export function poizonEta(S) {
  const k = 1 - 0.035 * S.prog.skills.logist;
  return [Math.max(5, Math.round(8 * k)), Math.max(7, Math.round(14 * k))];
}

export function poizonShip(S, mi, qty) {
  const m = MODELS[mi];
  const w = CATS[m.cat].w;
  let s = (320 + 680 * w) * (1 - 0.055 * S.prog.skills.logist);
  if (qty >= 5 && S.prog.lvl >= 4) s *= 0.7;
  return Math.round(s / 10) * 10;
}

export function cargoShip(S, mi) {
  const m = MODELS[mi];
  const w = CATS[m.cat].w;
  return Math.round(((160 + 400 * w) * (1 - 0.055 * S.prog.skills.logist)) / 10) * 10;
}

/* ======================= ПРОЧЕЕ ======================= */

export function skillK(S, key, per) {
  return 1 + per * (S.prog.skills[key] / MAX_SKILL);
}

export function cleanCost(S, item) {
  const cat = MODELS[item.m].cat;
  return cat === 'shoes' ? 900 : cat === 'puffer' ? 1500 : 700;
}

export function photoCost() {
  return 500;
}

export function bumpCost(item) {
  return Math.round(clamp(99 + item.sale.price * 0.012, 99, 1800) / 10) * 10;
}

/** Цена, по которой скупщик заберёт вещь прямо сейчас. */
export function pawnPrice(S, item) {
  const real = item.real;
  const v = real ? valueOrig(S, item) * 0.44 : valueFake(S, item) * 0.36;
  return Math.round(Math.max(100, v) / 10) * 10;
}
