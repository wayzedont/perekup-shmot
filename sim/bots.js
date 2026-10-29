// Боты для балансовых прогонов.
//
// Четыре стратегии, которые по-разному ломают экономику:
// аккуратный честный, жадный «паль как ориг», ленивый и кредитный маньяк.
// Боты работают с тем же ядром, что и игра, поэтому их цифры — это
// настоящие цифры игры, а не отдельная модель.

import { MODELS } from '../src/core/data/models.js';
import { sizeDemand, CONDS } from '../src/core/data/catalog.js';
import { hourIndex, dayIndex, isSecondOpen, weekdayAt, canMeet } from '../src/core/time.js';
import {
  netWorth,
  valueOrig,
  valueFake,
  freeSlots,
  buyersPerDay,
  legitCost,
  pawnPrice,
  staleK,
  daysHeld,
} from '../src/core/economy.js';
import { suspicion, tellsFor } from '../src/core/inspect.js';
import { sortedTells } from '../src/core/notebook.js';
import { priceNow, findSlot } from '../src/core/market/second.js';
import { poizonPrice, poizonShip, poizonEta, bookValue, TUNE } from '../src/core/economy.js';
import { sizesFor } from '../src/core/data/catalog.js';
import { filterListings, findListing, deliveryFee } from '../src/core/market/avito.js';
import { canPostAd } from '../src/core/market/buyad.js';
import { closeThread } from '../src/core/kernel.js';
import { SUPPLIERS, shipUnit, trapFakeRate } from '../src/core/market/suppliers.js';
import { available, debtTotal } from '../src/core/bank.js';
import { winChance } from '../src/core/market/raffle.js';
import { STORAGE } from '../src/core/data/progress.js';
import { advanceHours, sleep } from '../src/core/tick.js';

import * as Buying from '../src/core/actions/buying.js';
import * as Selling from '../src/core/actions/selling.js';
import * as Items from '../src/core/actions/items.js';
import * as Social from '../src/core/actions/social.js';
import * as Finance from '../src/core/actions/finance.js';
import * as Staff from '../src/core/actions/staff.js';
import { STAFF, hired } from '../src/core/staff.js';

/* ======================= НАСТРОЙКИ СТРАТЕГИЙ ======================= */

export const STRATEGIES = {
  careful: {
    name: 'Аккуратный честный',
    inspectBudget: 26, // сколько вещей готов осмотреть за визит в секонд
    tellsPerItem: 2,
    maxSuspicion: 0.12,
    maxPriceRatio: 0.62, // доля рынка, дороже не берёт
    minHype: 0.28,
    minSize: 0.7,
    minMargin: 1300,
    maxSpendShare: 0.85,
    sellAsOrig: 'honest', // паль продаёт как реплику
    priceK: 0.92, // ставит чуть ниже рынка ради оборота
    legitBeforeSale: true,
    useCredit: 'careful',
    worksShifts: true,
    usesChannel: true,
    cutsStale: true,
    usesPoizon: true,
    usesBuyAd: true, // объявление о скупке — не оптимальная игра, а обычная
  },
  smart: {
    name: 'Сильный игрок',
    inspectBudget: 34,
    tellsPerItem: 2,
    maxSuspicion: 0.12,
    maxPriceRatio: 0.64,
    minHype: 0.3,
    minSize: 0.75,
    minMargin: 1200,
    maxSpendShare: 0.9,
    sellAsOrig: 'honest',
    priceK: 0.93,
    legitBeforeSale: true,
    useCredit: 'careful',
    worksShifts: true,
    usesChannel: true,
    cutsStale: true,
    cutsHard: true, // режет цену рано и ступенями, неликвид выносит
    usesPoizon: true,
    usesPro: true, // платит за прогноз и закупается до хайпа
    sourcesOrders: true, // ищет вещь под заказ, а не ждёт её в шкафу
    usesSuppliers: true,
    entersRaffles: true,
    growsChannel: true,
    usesBuyAd: true, // держит объявление «скупаю шмот» и отвечает тем, кто пришёл
  },
  busy: {
    // Тот же сильный игрок, но с человеческим лимитом внимания: на все
    // переписки за день рук не хватает. Именно на нём и видно, что даёт
    // помощник.
    name: 'Сильный, но занятой',
    inspectBudget: 34,
    tellsPerItem: 2,
    maxSuspicion: 0.12,
    maxPriceRatio: 0.64,
    minHype: 0.3,
    minSize: 0.75,
    minMargin: 1200,
    maxSpendShare: 0.9,
    sellAsOrig: 'honest',
    priceK: 0.93,
    legitBeforeSale: true,
    useCredit: 'careful',
    worksShifts: true,
    usesChannel: true,
    cutsStale: true,
    cutsHard: true,
    usesPoizon: true,
    usesPro: true,
    sourcesOrders: true,
    usesSuppliers: true,
    entersRaffles: true,
    growsChannel: true,
    usesBuyAd: true,
    chatsPerDay: 12,
  },
  greedy: {
    name: 'Жадный: паль как ориг',
    inspectBudget: 18,
    tellsPerItem: 1,
    maxSuspicion: 1,
    maxPriceRatio: 0.7,
    minHype: 0.3,
    minSize: 0.6,
    minMargin: 700,
    maxSpendShare: 0.85,
    sellAsOrig: 'always',
    priceK: 1.06,
    legitBeforeSale: false,
    useCredit: 'bold',
    worksShifts: true,
    usesChannel: true,
    cutsStale: false,
    usesPoizon: true,
  },
  lazy: {
    name: 'Ленивый',
    inspectBudget: 6,
    tellsPerItem: 1,
    maxSuspicion: 1,
    maxPriceRatio: 0.65,
    minHype: 0,
    minSize: 0,
    minMargin: 400,
    maxSpendShare: 0.5,
    sellAsOrig: 'honest',
    priceK: 1.1,
    legitBeforeSale: false,
    useCredit: 'none',
    worksShifts: true,
    usesChannel: false,
    cutsStale: false,
  },
  leveraged: {
    name: 'Кредитный маньяк',
    inspectBudget: 24,
    tellsPerItem: 1,
    maxSuspicion: 0.4,
    maxPriceRatio: 0.72,
    minHype: 0.4,
    minSize: 0.7,
    minMargin: 1200,
    maxSpendShare: 1,
    sellAsOrig: 'honest',
    priceK: 1.0,
    legitBeforeSale: false,
    useCredit: 'max',
    worksShifts: false,
    usesChannel: true,
    cutsStale: true,
    usesPoizon: true,
    usesBuyAd: true,
  },
};

/* ======================= ВСПОМОГАТЕЛЬНОЕ ======================= */

function safeMoney(S) {
  // Подушка на обязательные платежи: еда на пару дней плюс аренда,
  // если понедельник уже завтра.
  const toMonday = (8 - weekdayAt(S.t)) % 7 || 7;
  return 1000 + (toMonday <= 1 ? 5000 : 0);
}

function spendable(S, bot) {
  return Math.max(0, (S.money - safeMoney(S)) * bot.maxSpendShare);
}

/** Хватает ли денег на сделку, если взять кредит. */
function fundFor(S, bot, amount) {
  if (spendable(S, bot) >= amount) return true;
  if (bot.useCredit === 'none') return false;
  const need = Math.ceil((amount + safeMoney(S) - S.money) / 1000) * 1000;
  const limit = available(S);
  if (limit < 1000 || need > limit) return false;
  // Берём в долг только под конкретную сделку.
  Finance.takeCredit(S, Math.min(limit, need), 4);
  return spendable(S, bot) >= amount;
}

/* ======================= СЕКОНД ======================= */

function doSecond(S, bot, rng) {
  if (!isSecondOpen(S.t)) return false;
  if (freeSlots(S) < 1) return false;
  // В бюджет входит и доступный кредит: именно под сделку его и берут.
  const budget = spendable(S, bot) + (bot.useCredit === 'none' ? 0 : available(S) * bot.maxSpendShare);
  if (budget < 300) return false;

  // Сначала смотрим то, что выглядит выгодным по витрине.
  const candidates = S.second.items
    .map((slot) => {
      const it = slot.item;
      const m = MODELS[it.m];
      if (m.noname) return null;
      const price = priceNow(S, slot);
      if (price > budget) return null;
      const shown = { ...it, cond: it.shownCond };
      const vo = valueOrig(S, shown);
      if (!vo) return null;
      const ratio = price / vo;
      const h = S.market.h[it.m];
      const sz = sizeDemand(it.size);
      if (ratio > bot.maxPriceRatio) return null;
      if (h < bot.minHype) return null;
      if (sz < bot.minSize) return null;
      // Важна не доля скидки, а сколько рублей принесёт сделка:
      // одна удачная пара кроссовок стоит десятка шапок.
      const margin = vo * 0.92 - price;
      if (margin < (bot.minMargin || 0)) return null;
      return { slot, price, vo, ratio, score: margin * h * Math.min(1.2, sz) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, bot.inspectBudget);

  let acted = false;
  for (const c of candidates) {
    if (!isSecondOpen(S.t)) break;
    if (!findSlot(S, c.slot.id)) continue; // разобрали
    if (freeSlots(S) < 1) break;
    const it = c.slot.item;
    // Осмотр: по подсказкам книжки, самые информативные признаки первыми.
    const order = sortedTells(S, it.m, tellsFor(it, 'hand'));
    for (let i = 0; i < bot.tellsPerItem && i < order.length; i++) {
      Buying.secondInspect(S, c.slot.id, order[i]);
      acted = true;
      if (!isSecondOpen(S.t)) break;
    }
    if (!findSlot(S, c.slot.id)) continue;
    // Состояние проверяем всегда: скрытый дефект съедает треть цены,
    // а стоит это девять минут.
    if (!it.condSeen) {
      Buying.secondInspectCondition(S, c.slot.id);
      acted = true;
    }
    if (!findSlot(S, c.slot.id)) continue;
    const s = suspicion(it);
    if (s !== null && s > bot.maxSuspicion) continue;
    // Цена могла измениться после вскрытия дефектов.
    const shown = { ...it, cond: it.shownCond };
    const vo = valueOrig(S, shown);
    const price = priceNow(S, c.slot);
    if (vo && price / vo > bot.maxPriceRatio) continue;
    if (!fundFor(S, bot, price)) continue;
    if (Buying.buySecond(S, c.slot.id)) acted = true;
  }
  return acted;
}

/* ======================= АВИТКА: ПОКУПКА ======================= */

function doAvitoBuy(S, bot, rng) {
  if (freeSlots(S) < 1) return false;
  const budget = spendable(S, bot) + (bot.useCredit === 'none' ? 0 : available(S) * bot.maxSpendShare);
  if (budget < 500) return false;
  // Живой игрок между завозами в секонде не сидит сложа руки, а торгуется
  // на Авитке — поэтому и бот ведёт несколько переписок разом.
  if (S.threads.filter((t) => t.kind === 'seller' && !t.closed).length >= 4) return false;

  const deals = S.listings
    .map((l) => {
      if (l.incoming) return null; // этих разбирает doBuyAd
      if (l.declared === 'fake' && bot.sellAsOrig !== 'always') return null;
      const vo = valueOrig(S, { ...l.item, cond: l.item.shownCond });
      if (!vo) return null;
      const ratio = l.ask / vo;
      const h = S.market.h[l.item.m];
      const sz = sizeDemand(l.item.size);
      if (ratio > bot.maxPriceRatio) return null;
      if (h < bot.minHype) return null;
      if (sz < bot.minSize) return null;
      if (l.ask + deliveryFee(l.ask) > budget) return null;
      // Мутных продавцов аккуратный бот обходит.
      if (bot.useCredit !== 'bold' && l.signals.length >= 4) return null;
      const expected = (vo * 0.92 - l.ask) * h * Math.min(1.2, sz);
      return { l, ratio, score: expected };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const pick = deals[0];
  if (!pick) return false;
  const l = pick.l;

  // Немного поторговаться: пара ходов и предложение цены.
  Buying.askSeller(S, l, 'orig');
  if (!findListing(S, l.id)) return true;
  for (const lever of ['today', 'market']) {
    if (!findListing(S, l.id)) return true;
    if (l.seller.blocked) return true;
    Buying.useLever(S, l, lever);
  }
  if (!findListing(S, l.id) || l.seller.blocked) return true;
  Buying.offerToSeller(S, l, Math.round(l.seller.current * 0.88));
  if (!findListing(S, l.id) || l.seller.blocked) return true;

  if (l.mode === 'meet' || (l.mode === 'both' && canMeet(S.t) && pick.ratio < 0.5)) {
    const res = Buying.startMeeting(S, l);
    if (!res || res.state !== 'ok') return true;
    const order = sortedTells(S, l.item.m, tellsFor(l.item, 'hand'));
    for (let i = 0; i < bot.tellsPerItem && i < order.length; i++) Buying.meetInspect(S, l, order[i]);
    Buying.meetInspectCondition(S, l);
    if (!findListing(S, l.id)) return true;
    if (l.item.defects.length) Buying.useLever(S, l, 'defect');
    const s = suspicion(l.item);
    if (s !== null && s > bot.maxSuspicion) return true;
    if (!fundFor(S, bot, l.seller.current)) return true;
    Buying.buyAtMeeting(S, l);
    return true;
  }

  if (l.mode !== 'meet') {
    const s = suspicion(l.item);
    if (s !== null && s > bot.maxSuspicion) return true;
    if (!fundFor(S, bot, l.seller.current + deliveryFee(l.seller.current))) return true;
    Buying.confirmDelivery(S, l);
  }
  return true;
}

/* ======================= «СКУПАЮ ШМОТ» ======================= */
// Объявление — плата за поток: вещи приносят сами, дешевле рынка,
// но пали среди них заметно больше. Проверяем, окупается ли это.

function doBuyAd(S, bot) {
  if (!bot.usesBuyAd) return false;

  // Пост бесплатный, так что держим его всегда, когда есть куда складывать:
  // единственная цена — что он занимает место в ленте канала.
  if (canPostAd(S).ok && freeSlots(S) >= 2) {
    if (Buying.postBuyAd(S)) return true;
  }

  const open = S.threads.filter((t) => t.kind === 'seller' && t.data.incoming && !t.closed);
  if (!open.length) return false;

  for (const th of open) {
    const l = findListing(S, th.data.listingId);
    if (!l) {
      closeThread(S, th);
      continue;
    }
    const vo = valueOrig(S, { ...l.item, cond: l.item.shownCond });
    const h = S.market.h[l.item.m];
    const sz = sizeDemand(l.item.size);
    // Приносят много мусора — отказываться надо быстро, иначе встречи съедят день.
    if (!vo || l.ask > vo * bot.maxPriceRatio || h < bot.minHype || sz < bot.minSize) {
      closeThread(S, th);
      continue;
    }
    if (freeSlots(S) < 1) return true;
    if (!canMeet(S.t)) return false;

    Buying.useLever(S, l, 'today');
    if (!findListing(S, l.id) || l.seller.blocked) continue;
    Buying.offerToSeller(S, l, Math.round(l.seller.current * 0.85));
    if (!findListing(S, l.id) || l.seller.blocked) continue;

    const res = Buying.startMeeting(S, l);
    if (!res || res.state !== 'ok') return true;
    const order = sortedTells(S, l.item.m, tellsFor(l.item, 'hand'));
    // Здесь осматривать стоит тщательнее: доля пали выше рыночной.
    for (let i = 0; i < bot.tellsPerItem + 1 && i < order.length; i++) Buying.meetInspect(S, l, order[i]);
    Buying.meetInspectCondition(S, l);
    if (!findListing(S, l.id)) return true;
    if (l.item.defects.length) Buying.useLever(S, l, 'defect');
    const s = suspicion(l.item);
    if (s !== null && s > bot.maxSuspicion) {
      closeThread(S, th);
      return true;
    }
    if (!fundFor(S, bot, l.seller.current)) return true;
    Buying.buyAtMeeting(S, l);
    return true;
  }
  return true;
}

/* ======================= ПОЙЗОН ======================= */
// Пойзон выгоден только тогда, когда ликвидность уже выросла, а цена там
// ещё не догнала. Это и есть ценность прогноза: купить до того, как все узнали.

function doPoizon(S, bot) {
  if (!bot.usesPoizon) return false;
  if (freeSlots(S) < 2) return false;
  const budget = spendable(S, bot);
  if (budget < 8000) return false;

  const hasPro = bot.usesPro && S.tg.proUntil > S.t;
  const pool = hasPro ? risingModels(S, bot) : MODELS;
  let best = null;
  for (const m of pool) {
    if (m.noname) continue;
    const h = S.market.h[m.i];
    const lag = S.market.hP[m.i];
    const target = S.market.hT[m.i];
    if (!hasPro && (h < 0.55 || h < lag + 0.08)) continue; // цена уже догнала
    const sizes = sizesFor(m.cat);
    const size = sizes.length === 1 ? sizes[0] : sizes[Math.floor(sizes.length / 2)];
    const unit = poizonPrice(S, m.i, size) + poizonShip(S, m.i, 1);
    if (unit > budget) continue;
    const now = valueOrig(S, { m: m.i, cond: 0, size, boughtAt: S.t });
    // С прогнозом считаем не сегодняшнюю цену, а ту, что будет на пике.
    const kNow = TUNE.hypePriceLo + TUNE.hypePriceHi * h;
    const kFut = TUNE.hypePriceLo + TUNE.hypePriceHi * Math.max(h, target);
    const sell = (hasPro ? (now * kFut) / kNow : now) * 0.92;
    const margin = sell - unit;
    if (margin < 1500) continue;
    const score = margin * Math.max(h, hasPro ? target : h);
    if (!best || score > best.score) best = { m, size, unit, margin, score, target };
  }
  if (!best) return false;
  const qty = Math.max(1, Math.min(5, Math.floor(budget / best.unit), freeSlots(S) - 1));
  S.ui.qty['pz' + best.m.i] = qty;
  const res = Buying.buyPoizon(S, best.m.i, best.size, qty);
  if (res && hasPro && best.target > S.market.h[best.m.i] + 0.1) {
    // Ставка на прогноз: держим вещь, пока хайп не придёт.
    if (!S.__hypeBets) S.__hypeBets = {};
    S.__hypeBets[best.m.i] = { until: best.target * 0.85, deadline: S.t + 22 * 24 };
  }
  return !!res;
}

/** Ждём ли мы по этой модели прихода хайпа. */
function holdingForHype(S, item) {
  const bet = S.__hypeBets && S.__hypeBets[item.m];
  if (!bet) return false;
  if (S.t > bet.deadline) {
    delete S.__hypeBets[item.m];
    return false;
  }
  if (S.market.h[item.m] >= bet.until) {
    delete S.__hypeBets[item.m];
    return false;
  }
  return true;
}

/* ======================= ПРОГНОЗ И ХАЙП ======================= */
// Сильный игрок платит за информацию и покупает до того, как все узнали.
// Без подписки прогноз недоступен — бот честно смотрит только то,
// что видно в интерфейсе: отставание цены Пойзона от текущей ликвидности.

function doPro(S, bot) {
  if (!bot.usesPro) return false;
  if (S.tg.proUntil > S.t + 24) return false;
  // Прогноз нужен тому, кто может на него закупиться: Пойзон и опт
  // открываются с четвёртого уровня, раньше подписка не отобьётся.
  if (S.prog.lvl < 4) return false;
  if (spendable(S, bot) < 30000) return false;
  return !!Social.buyPro(S);
}

/** Модели, которые вот-вот пойдут вверх. С подпиской видно цель тренда. */
function risingModels(S, bot) {
  const hasPro = S.tg.proUntil > S.t;
  return MODELS.filter((m) => {
    if (m.noname) return false;
    const h = S.market.h[m.i];
    const lag = S.market.hP[m.i];
    if (hasPro) {
      // Прогноз: цель тренда заметно выше текущей ликвидности.
      const target = S.market.hT[m.i];
      return target > h + 0.1 && target > 0.6;
    }
    // Без подписки — только то, что уже видно: хайп обогнал цену Пойзона.
    return h > lag + 0.1 && h > 0.6;
  });
}

/* ======================= ЗАКАЗЫ КЛИЕНТОВ ======================= */
// Заказ платит выше рынка, но вещь ещё надо найти к сроку.
// Сильный игрок идёт искать, а не ждёт, что нужное само окажется в шкафу.

function doOrderSourcing(S, bot) {
  if (!bot.sourcesOrders) return false;
  const orders = S.threads.filter((t) => t.kind === 'order' && !t.closed);
  if (!orders.length) return false;

  for (const th of orders) {
    const order = th.data.order;
    if (Social.orderMatches(S, order).length) continue; // уже есть в шкафу
    if (freeSlots(S) < 1) continue;
    const hoursLeft = order.deadline - S.t;
    if (hoursLeft < 12) continue;

    // Берём предоплату: именно она и даёт деньги на поиск. Но только если
    // заказ реально выполним — иначе придётся возвращать.
    if (!order.accepted) {
      const q = Buying.supplyQuote(S, order.m, order.size, order.maxCond);
      const doable =
        q.available &&
        hoursLeft > (q.etaDays[1] + 1) * 24 &&
        order.budget > q.total * 1.1;
      if (doable) Social.acceptOrder(S, th);
    }
    const budget = Math.min(spendable(S, bot), order.budget * 0.75);
    if (budget < 1000) continue;
    const m = MODELS[order.m];

    // 1. Авитка: ищем нужную модель и размер среди объявлений.
    const listing = S.listings
      .filter(
        (l) =>
          l.item.m === order.m &&
          l.item.size === order.size &&
          l.item.cond <= order.maxCond &&
          l.declared === 'orig' &&
          l.ask + deliveryFee(l.ask) <= budget &&
          l.signals.length < 4,
      )
      .sort((a, b) => a.ask - b.ask)[0];
    if (listing) {
      const shipHours = listing.mode === 'ship' ? 96 : 48;
      if (hoursLeft > shipHours) {
        Buying.askSeller(S, listing, 'orig');
        if (findListing(S, listing.id) && !listing.seller.blocked) {
          Buying.offerToSeller(S, listing, Math.round(listing.seller.current * 0.92));
        }
        if (findListing(S, listing.id) && !listing.seller.blocked) {
          if (listing.mode === 'meet' && canMeet(S.t)) {
            const res = Buying.startMeeting(S, listing);
            if (res && res.state === 'ok') {
              Buying.meetInspectCondition(S, listing);
              if (findListing(S, listing.id)) Buying.buyAtMeeting(S, listing);
            }
          } else if (listing.mode !== 'meet') {
            Buying.confirmDelivery(S, listing);
          }
        }
        return true;
      }
    }

    // 2. Поставщик из Европы: витрина, если нужное там уже есть.
    const post = S.suppliers.orig.unlocked
      ? S.suppliers.orig.posts.find(
          (p) => p.m === order.m && (!p.size || p.size === order.size) && p.price <= budget && p.left > 0,
        )
      : null;
    if (post && hoursLeft > 7 * 24) {
      if (Buying.buyFromSupplier(S, 'orig', post.id, 1)) return true;
    }

    // 3. Попросить достать под заказ: дороже витрины, зато именно то и быстро.
    const gate = Buying.canRequestSupply(S);
    if (gate.ok) {
      const quote = Buying.supplyQuote(S, order.m, order.size, order.maxCond);
      const fits = hoursLeft > (quote.etaDays[1] + 1) * 24;
      // Ожидание: оригинал — чистая прибыль, паль — убыток за вычетом того,
      // что за неё дадут как за реплику.
      const probe = { m: order.m, cond: quote.cond, size: order.size, real: false, q: 0.7, boughtAt: S.t };
      const salvage = valueFake(S, probe) * 0.9;
      const expected =
        (1 - quote.fakeRate) * (order.budget - quote.total) +
        quote.fakeRate * (salvage - quote.total);
      if (quote.available && fits && expected > 1200 && fundFor(S, bot, quote.total)) {
        if (Buying.requestSupply(S, order.m, order.size, order.maxCond)) return true;
      }
    }

    // 4. Пойзон: гарантированный оригинал, но две недели в пути.
    const [lo, hi] = poizonEta(S);
    if (hoursLeft > (hi + 1) * 24) {
      const unit = poizonPrice(S, order.m, order.size) + poizonShip(S, order.m, 1);
      if (unit <= budget && order.maxCond === 0) {
        S.ui.qty['pz' + order.m] = 1;
        if (Buying.buyPoizon(S, order.m, order.size, 1)) return true;
      }
    }
  }
  return false;
}

/* ======================= ПОСТАВЩИКИ ======================= */

function doSuppliers(S, bot) {
  if (!bot.usesSuppliers) return false;
  if (freeSlots(S) < 2) return false;
  const budget = spendable(S, bot);
  if (budget < 5000) return false;

  // Китайское карго: партия реплик окупается только при честной продаже
  // и только если место под неё есть.
  const repCh = S.suppliers.rep;
  if (repCh.unlocked && freeSlots(S) >= 8 && budget > 25000) {
    const post = repCh.posts
      .filter((p) => p.top && p.left >= 5)
      .map((p) => {
        const m = MODELS[p.m];
        const probe = { m: p.m, cond: 0, real: false, q: p.quality, size: 'M', boughtAt: S.t };
        const sell = valueFake(S, probe) * 0.92;
        const unit = p.price + shipUnit(S, 'rep', p);
        return { p, margin: sell - unit, unit };
      })
      .filter((x) => x.margin > x.unit * 0.5)
      .sort((a, b) => b.margin - a.margin)[0];
    if (post) {
      const qty = Math.min(8, Math.floor(budget / (post.unit * 1.1)), freeSlots(S) - 2);
      if (qty >= 5) {
        S.ui.qty[post.p.id] = qty;
        if (Buying.buyFromSupplier(S, 'rep', post.p.id, qty)) return true;
      }
    }
  }

  // Европа: поштучно и дёшево, но в трети заказов приходит паль.
  const origCh = S.suppliers.orig;
  if (!origCh.unlocked) return false;
  const fakeRate = trapFakeRate(S);
  const best = origCh.posts
    .map((p) => {
      const probe = { m: p.m, cond: p.cond, size: p.size || 'M', boughtAt: S.t };
      const sell = valueOrig(S, probe) * 0.92;
      const unit = p.price + SUPPLIERS.orig.ship;
      // Ожидание с поправкой на риск пали: паль продаём как реплику.
      const expected = (1 - fakeRate) * sell + fakeRate * valueFake(S, { ...probe, real: false, q: 0.7 }) * 0.9;
      return { p, unit, gain: expected - unit, h: S.market.h[p.m] };
    })
    .filter((x) => x.gain > 2000 && x.unit <= budget && x.h > 0.45)
    .sort((a, b) => b.gain - a.gain)[0];
  if (best) {
    S.ui.qty[best.p.id] = 1;
    return !!Buying.buyFromSupplier(S, 'orig', best.p.id, 1);
  }
  return false;
}

/* ======================= РАФФЛЫ ======================= */

function doRaffle(S, bot) {
  if (!bot.entersRaffles) return false;
  const R = S.raffle;
  if (!R || R.done || R.entered) return false;
  if (S.money < R.retail + 3000) return false;
  // Взнос окупается только когда шанс уже приличный.
  if (winChance(S) < 0.15) return false;
  const sizes = sizesFor(MODELS[R.m].cat);
  const size = sizes.length === 1 ? sizes[0] : sizes[Math.floor(sizes.length / 2)];
  return !!Social.enterRaffle(S, size);
}

/* ======================= ПРОДАЖА ======================= */

function doListing(S, bot) {
  let acted = false;
  for (const item of S.items) {
    if (item.sale) continue;
    // Ставка на прогноз: не продаём, пока хайп не пришёл.
    if (holdingForHype(S, item)) continue;
    const m = MODELS[item.m];
    const cost = legitCost(S, item);

    // Главное правило честной торговли: не выставлять как оригинал то,
    // что ты сам не смотрел. Осмотр стоит только времени.
    if (!m.noname && bot.sellAsOrig !== 'always' && item.verdict === 'unknown') {
      const order = sortedTells(S, item.m, tellsFor(item, 'hand'));
      const seen = Object.keys(item.seen || {}).length;
      if (seen < 2 && order.length) {
        for (let i = 0; i < 2 && i < order.length; i++) Items.inspectTell(S, item, order[i], 'hand');
        acted = true;
      }
      if (!item.condSeen) {
        Items.inspectCondition(S, item);
        acted = true;
      }
    }

    const doubt = suspicion(item);
    const seenCount = Object.keys(item.seen || {}).length;

    // Если осмотр оставил сомнения, а вещь дорогая — проверяем в сервисе.
    if (
      bot.legitBeforeSale &&
      !m.noname &&
      !item.legitDone &&
      item.verdict === 'unknown' &&
      doubt !== null &&
      doubt > 0 &&
      valueOrig(S, item) > cost * 10 &&
      S.money > cost + 1200
    ) {
      Items.legitCheck(S, item);
      acted = true;
    }

    // Оригиналом называем только то, в чём уверены.
    const confirmed =
      item.verdict === 'orig' || (item.verdict === 'unknown' && seenCount >= 2 && doubt !== null && doubt <= 0);
    const asOrig = bot.sellAsOrig === 'always' ? true : m.noname || confirmed;
    const base = asOrig ? valueOrig(S, item) : valueFake(S, item);
    if (base < 100) continue;
    const price = Math.round(base * bot.priceK);
    Selling.listItem(S, item, { price, asOrig, avito: true, tg: S.tg.has });
    acted = true;
  }
  return acted;
}

/**
 * Работа с залежавшимся товаром. Замороженные деньги — это убыток,
 * поэтому цену режем по ступеням, а безнадёжное выносим из шкафа.
 */
function doPriceCuts(S, bot) {
  if (!bot.cutsStale) return false;
  let acted = false;
  const aggressive = !!bot.cutsHard;
  for (const item of S.items) {
    if (!item.sale) continue;
    const days = daysHeld(S, item);
    const perDay = buyersPerDay(S, item);

    // Ступенчатое снижение: чем дольше висит, тем ниже ставим.
    const firstCut = aggressive ? 4 : 8;
    if (days >= firstCut) {
      const steps = Math.floor((days - firstCut) / (aggressive ? 3 : 5));
      const k = Math.max(0.68, 0.93 - steps * 0.06);
      const base = item.sale.asOrig ? valueOrig(S, item) : valueFake(S, item);
      const target = Math.round(base * k);
      if (target < item.sale.price * 0.97) {
        Selling.listItem(S, item, {
          price: target,
          asOrig: item.sale.asOrig,
          avito: item.sale.avito,
          tg: item.sale.tg,
        });
        acted = true;
      }
    }

    // Поднять объявление дешевле, чем держать мёртвый капитал.
    if (aggressive && item.sale.avito && item.sale.boostUntil <= S.t && days >= 3 && perDay > 0.08) {
      const cost = Math.round(Math.min(1800, Math.max(99, item.sale.price * 0.012)));
      if (S.money > cost * 12) {
        Items.bumpListing(S, item);
        acted = true;
      }
    }

    // Безнадёжное выносим: место в шкафу тоже стоит денег.
    const hopeless = perDay < (aggressive ? 0.05 : 0.04);
    const tooLong = days > (aggressive ? 16 : 24);
    if (hopeless && tooLong) {
      const pawn = pawnPrice(S, item);
      // Если в канале доверие важнее денег — разыгрываем, иначе в скупку.
      if (aggressive && S.tg.has && S.tg.trust < 75 && pawn < 2500) {
        Social.giveaway(S, item);
      } else {
        Items.pawn(S, item);
      }
      acted = true;
      break;
    }
  }
  return acted;
}

function doChats(S, bot, rng) {
  let acted = false;
  // Живой человек не отвечает всем и сразу: у него есть работа, сон и
  // терпение. Ограничение на число переписок за день — это и есть то узкое
  // место, ради которого вообще нанимают помощника.
  let budget = bot.chatsPerDay || Infinity;
  if (budget !== Infinity) {
    const day = dayIndex(S.t);
    if (S.botChatDay !== day) {
      S.botChatDay = day;
      S.botChatsLeft = budget;
    }
    budget = S.botChatsLeft;
    if (budget <= 0) return false;
  }
  const spend = () => {
    if (bot.chatsPerDay) S.botChatsLeft--;
  };

  for (const th of S.threads.slice()) {
    if (th.closed) continue;
    if (bot.chatsPerDay && S.botChatsLeft <= 0) break;

    if (th.kind === 'buyer') {
      spend();
      const b = th.data.buyer;
      if (b.phishing) {
        Selling.phishingBlock(S, th);
        acted = true;
        continue;
      }
      if (b.asked.auth && !b.agreed) {
        const item = S.items.find((i) => i.id === b.item);
        const key =
          bot.sellAsOrig === 'always'
            ? 'swearOrig'
            : item && item.verdict === 'fake'
              ? 'confess'
              : 'hedge';
        Selling.answerAuth(S, th, key);
        acted = true;
        continue;
      }
      if (b.agreed) {
        Selling.completeSale(S, th);
        acted = true;
        continue;
      }
      const item = S.items.find((i) => i.id === b.item);
      if (!item || !item.sale) continue;
      // Соглашаемся, если предложение близко к цене, иначе встречное.
      if (b.offer >= item.sale.price * 0.92) {
        Selling.acceptOffer(S, th);
      } else {
        Selling.counterToBuyer(S, th, Math.round((b.offer + item.sale.price) / 2));
      }
      acted = true;
      continue;
    }

    if (th.kind === 'claim') {
      // Возврат дешевле единицы в отзывах.
      if (bot.sellAsOrig === 'always' && S.money < 5000) Selling.refuseClaim(S, th);
      else Selling.refundClaim(S, th);
      acted = true;
      continue;
    }

    if (th.kind === 'order') {
      const matches = Social.orderMatches(S, th.data.order);
      if (!matches.length) continue;
      if (bot.sellAsOrig === 'always') {
        Social.fulfillOrder(S, th, matches[0]);
        acted = true;
        continue;
      }
      // Клиент обязательно проверит вещь. Отдать ему паль — это единица
      // в отзывах и потерянный клиент, поэтому сначала проверяем сами.
      const verified = matches.find((i) => i.verdict === 'orig');
      if (verified) {
        Social.fulfillOrder(S, th, verified);
        acted = true;
        continue;
      }
      const candidate = matches.find((i) => i.verdict === 'unknown');
      if (candidate && bot.legitBeforeSale) {
        const cost = legitCost(S, candidate);
        if (S.money > cost + 500) {
          Items.legitCheck(S, candidate);
          acted = true;
          continue;
        }
      }
      // Проверенная паль под заказ не идёт — честнее отказаться.
      if (matches.every((i) => i.verdict === 'fake')) {
        Social.declineOrder(S, th);
        acted = true;
      }
      continue;
    }

    if (th.kind === 'lot') {
      const lot = th.data.lot;
      if (!lot) continue;
      // Лот вслепую — лотерея: больше трети оборотных денег в него не вкладываем.
      const value = lot.items.reduce((a, it) => a + valueOrig(S, { ...it, cond: it.shownCond }) * 0.4, 0);
      const cap = Math.min(value, spendable(S, bot) * 0.45);
      if (lot.price < cap && freeSlots(S) >= lot.items.length) {
        if (!lot.haggled) Buying.haggleLot(S, th);
        Buying.takeLot(S, th);
        acted = true;
      } else {
        Buying.declineLot(S, th);
        acted = true;
      }
      continue;
    }
  }
  return acted;
}

/* ======================= ДЕНЬГИ ======================= */

function doFinance(S, bot) {
  let acted = false;
  const debt = debtTotal(S);

  if (bot.useCredit !== 'none') {
    const limit = available(S);
    const wantMore =
      bot.useCredit === 'max'
        ? limit >= 1000 && freeSlots(S) >= 2 && S.money < 15000
        : bot.useCredit === 'bold'
          ? limit >= 2000 && S.money < 4000
          : limit >= 2000 && S.money < 1500 && debt === 0;
    if (wantMore) {
      Finance.takeCredit(S, limit, bot.useCredit === 'max' ? 8 : 4);
      acted = true;
    }
  }

  // Гасим дорогие займы при свободных деньгах.
  const micro = S.loans.find((l) => l.name === 'Микрозайм');
  if (micro && S.money > micro.principal + safeMoney(S) + 3000) {
    Finance.repayAll(S, micro.id);
    acted = true;
  } else if (bot.useCredit === 'careful') {
    const loan = S.loans[0];
    if (loan && S.money > loan.principal + safeMoney(S) + 8000) {
      Finance.repayAll(S, loan.id);
      acted = true;
    }
  }
  return acted;
}

function doShift(S, bot) {
  if (!bot.worksShifts) return false;
  // Смена — это шесть потерянных часов. Идём туда, только когда торговать
  // уже не на что: ни денег, ни кредита, ни товара в обороте.
  const canTrade = spendable(S, bot) >= 1200 || (bot.useCredit !== 'none' && available(S) >= 1500);
  if (canTrade) return false;
  if (S.money > 2500) return false;
  const jobs = Finance.availableJobs(S);
  const job = jobs.find((j) => j.available);
  if (!job) return false;
  Finance.workShift(S, job.id);
  return true;
}

/* ======================= КАНАЛ ======================= */

function doChannel(S, bot) {
  if (!bot.usesChannel) return false;
  if (!S.tg.has) {
    if (S.stats.sold >= 2) {
      Social.createChannel(S, 'Бот Шоп');
      return true;
    }
    return false;
  }
  if (S.t - S.tg.lastTrendPost >= 24) {
    Social.postTrends(S);
    return true;
  }

  // Пост в ленте стареет: раз в пару дней поднимаем позиции заново.
  if (bot.growsChannel) {
    const stale = S.items.find(
      (i) => i.sale && i.sale.tg && S.t - (i.sale.postedAt || 0) > 48,
    );
    if (stale) {
      Selling.repostToChannel(S, stale);
      return true;
    }
  }

  if (!bot.growsChannel) {
    if (S.money > safeMoney(S) + 20000 && S.tg.adRuns.length === 0) {
      Social.buyAd(S, 1);
      return true;
    }
    return false;
  }

  // Канал — это не витрина, а источник заказов: чем больше аудитория,
  // тем чаще пишут клиенты. Но реклама — разовое вложение, а не подписка:
  // покупать её каждый день значит просто выносить деньги из оборота.
  if (S.tg.adRuns.length) return false;
  if (S.t - (S.__lastAd || -999) < 7 * 24) return false;
  // Аудитория уже насыщена — дальше растить незачем.
  if (S.tg.subs >= 2600) return false;
  // Реклама окупается, только когда есть что продавать и чем платить.
  if (S.items.filter((i) => i.sale).length < 3) return false;
  const free = spendable(S, bot);
  const pick = free > 70000 ? 2 : free > 26000 ? 1 : free > 9000 ? 0 : -1;
  if (pick < 0) return false;
  if (Social.buyAd(S, pick)) {
    S.__lastAd = S.t;
    return true;
  }
  return false;
}

/** Наём помощника: имеет смысл только когда переписок больше, чем рук. */
function doStaff(S, bot) {
  if (!bot.hiresStaff) return false;
  if (hired(S)) return false;
  // Берём лучшего, на кого стабильно хватает: зарплата идёт каждую неделю.
  const pick = [...STAFF]
    .reverse()
    .find((st) => S.prog.lvl >= st.lvl && spendable(S, bot) >= st.wage * 4);
  if (!pick) return false;
  return !!Staff.hire(S, pick.id);
}

function doSkills(S, bot) {
  if (S.prog.sp <= 0) return false;
  // Сначала «Глаз»: он напрямую режет долю пали в закупке.
  // Дальше продажи и связи — спрос и поток лотов с заказами.
  const order = bot && bot.growsChannel
    ? ['eye', 'eye', 'sales', 'bargain', 'conn', 'smm', 'logist']
    : ['eye', 'bargain', 'sales', 'conn', 'logist', 'smm'];
  const caps = { eye: 10, sales: 8, bargain: 6, conn: 6, smm: 5, logist: 5 };
  for (const k of order) {
    if (S.prog.skills[k] < (caps[k] || 6)) {
      Finance.spendSkill(S, k);
      return true;
    }
  }
  Finance.spendSkill(S, 'eye');
  return true;
}

function doStorage(S, bot) {
  if (freeSlots(S) > 2) return false;
  const next = ['rack', 'wardrobe', 'closet', 'warehouse'].find((id) => !S.prog.storage[id]);
  if (!next) return false;
  const def = STORAGE.find((s) => s.id === next);
  if (!def || S.prog.lvl < def.lvl) return false;
  // Аренду берём, только если оборот её окупает: склад за 12 000 в неделю
  // при пустых полках — верный способ разориться.
  if (def.rent) {
    const weeklyProfit = S.stats.profit / Math.max(1, dayIndex(S.t) / 7);
    if (weeklyProfit < def.rent * 3) return false;
  }
  if (def.price && spendable(S, bot) < def.price) return false;
  return !!Finance.buyStorage(S, next);
}

/* ======================= ХОД БОТА ======================= */

export function botStep(S, bot, rng) {
  const h = hourIndex(S.t);
  let acted = false;

  acted = doChats(S, bot, rng) || acted;
  acted = doSkills(S, bot) || acted;
  acted = doStaff(S, bot) || acted;
  acted = doFinance(S, bot) || acted;
  acted = doListing(S, bot) || acted;
  acted = doPriceCuts(S, bot) || acted;
  acted = doStorage(S, bot) || acted;
  acted = doRaffle(S, bot) || acted;

  if (h >= 9 && h <= 22) {
    // Заказы в первую очередь: у них срок и лучшая цена.
    acted = doOrderSourcing(S, bot) || acted;
    acted = doPro(S, bot) || acted;
  }
  if (h >= 10 && h < 20) {
    acted = doSecond(S, bot, rng) || acted;
    acted = doBuyAd(S, bot) || acted;
    acted = doAvitoBuy(S, bot, rng) || acted;
    acted = doPoizon(S, bot) || acted;
    acted = doSuppliers(S, bot) || acted;
  }
  if (h >= 9 && h <= 21) acted = doChannel(S, bot) || acted;
  if (h >= 8 && h <= 15) acted = doShift(S, bot) || acted;

  return acted;
}

/* ======================= ПРОГОН ======================= */

export function runBot(S, strategyKey, days) {
  const bot = STRATEGIES[strategyKey];
  const snapshots = [];
  let guard = 0;

  while (dayIndex(S.t) < days && guard++ < days * 40) {
    if (S.flags.bankrupt) break;
    const before = S.t * 60 + S.min;
    try {
      botStep(S, bot, null);
    } catch (e) {
      return { error: e, snapshots, bankrupt: false };
    }
    const after = S.t * 60 + S.min;
    if (after === before) {
      const slept = advanceHours(S, 1);
      if (slept) sleep(S);
    } else if (hourIndex(S.t) === 0) {
      sleep(S);
    }
    // Снимок на конце дня.
    const d = dayIndex(S.t);
    if (!snapshots[d]) {
      snapshots[d] = {
        day: d,
        netWorth: Math.round(netWorth(S)),
        money: Math.round(S.money),
        level: S.prog.lvl,
        sold: S.stats.sold,
        debt: Math.round(debtTotal(S)),
        items: S.items.length,
      };
    }
  }

  return { snapshots: snapshots.filter(Boolean), bankrupt: !!S.flags.bankrupt };
}
