// Ход времени и жизнь мира.
//
// Час за часом: приезжают посылки, обновляется рынок, разбирают секонд,
// пишут покупатели и клиенты. День за днём: списываются расходы, платятся
// кредиты, дрейфует ликвидность, растёт конкурент, идёт сезон.

import { clamp, priceRound, rub, num, plural } from './util.js';
import { MODELS, BRANDED } from './data/models.js';
import { TIERS, CONDS } from './data/catalog.js';
import {
  COST_FOOD_DAY,
  COST_ROOM_WEEK,
  STORAGE,
  statusOf,
} from './data/progress.js';
import { LIFE_EVENTS } from './data/content.js';
import { ONBOARDING } from './data/onboarding.js';
import {
  dayIndex,
  hourIndex,
  weekdayAt,
  dateLabel,
  SCHEDULE,
  isBuyerTime,
} from './time.js';
import {
  netWorth,
  valueOrig,
  valueFake,
  buyerRate,
  detectChance,
  ratingOf,
  capacity,
  usedSlots,
  hypePct,
  activeEvents,
  hasEvent,
  FAST_REPLY_DAYS,
} from './economy.js';
import { itemName, sizeLabel, makeItem } from './items.js';
import { recordTruth } from './notebook.js';
import {
  rngOf,
  touch,
  pay,
  earn,
  notify,
  newThread,
  say,
  findThread,
  closeThread,
  mentorSay,
  mentorOnce,
  mentorFlush,
  addReview,
  schedule,
  bump,
} from './kernel.js';
import {
  takeLoan,
  microloan,
  annuity,
  bankruptcyLine,
  depositInterest,
  debtTotal,
} from './bank.js';
import { refillMarket, expireListings, generateListing } from './market/avito.js';
import { adActive, makeIncoming, greetingFor } from './market/buyad.js';
import { restock, pickOver, isTreasure, secondItem, priceNow } from './market/second.js';
import { makePost, prunePosts, SUPPLIERS } from './market/suppliers.js';
import { makeLot, lotMessage, LOT_TYPES, pickLotType } from './market/lots.js';
import { newRaffle, winChance, raffleTitle, ENTRY_FEE } from './market/raffle.js';
import {
  driftMarket,
  generateEvent,
  applyEvent,
  calendarEvents,
  isSeasonOver,
} from './events.js';
import {
  tickRival,
  snipes,
  hunt,
  engagedWith,
  raidSize,
  raidSecond,
  blunder,
  WARM_HOURS,
  taunt,
  RIVAL_NAME,
  BACKGROUND_RIVALS,
  rankOf,
} from './rival.js';
import { dailyChannel, tickAds, post as channelPost, scandal } from './channel.js';
import { hired, wageTotal } from './staff.js';
import { staffTick, reserveAtSecond } from './actions/staff.js';
import { walkInTick } from './actions/showroom.js';
import { dropTick } from './actions/brand.js';
import {
  makeClient,
  makeOrder,
  orderText,
  canOrderAgain,
  loyalCount,
  failed as clientFailed,
} from './people/clients.js';
import { makeBuyer, greeting, buyerName, waitedTooLong, expectedStars } from './people/buyers.js';
import { checkGoals } from './progression.js';

/* ======================= ПУБЛИЧНОЕ API ВРЕМЕНИ ======================= */

export function advanceMinutes(S, mins) {
  S.min = (S.min || 0) + mins;
  while (S.min >= 60) {
    S.min -= 60;
    const slept = advanceHours(S, 1);
    if (slept) {
      S.min = 0;
      break;
    }
  }
  touch(S);
}

/** Возвращает true, если персонаж уснул по дороге. */
export function advanceHours(S, hours) {
  for (let i = 0; i < hours; i++) {
    S.t++;
    if (S.t % 24 === 0) dayTick(S);
    hourTick(S);
    if (hourIndex(S.t) === SCHEDULE.sleepHour) return true;
  }
  return false;
}

/** Сон до утра. Возвращает сводку ночи. */
export function sleep(S) {
  const h = hourIndex(S.t);
  const need = h < SCHEDULE.wakeHour ? SCHEDULE.wakeHour - h : 24 - h + SCHEDULE.wakeHour;
  S.dayLog = [];
  for (let i = 0; i < need; i++) {
    S.t++;
    if (S.t % 24 === 0) dayTick(S);
    hourTick(S);
  }
  S.min = 0;
  touch(S);
  return S.dayLog || [];
}

function logDay(S, text, amount) {
  if (!S.dayLog) S.dayLog = [];
  S.dayLog.push({ text, amount: amount || 0 });
}

/* ======================= ЧАСОВОЙ ТИК ======================= */

export function hourTick(S) {
  const rng = rngOf(S);
  const h = hourIndex(S.t);

  arriveShipments(S, rng);
  runPending(S, rng);
  expireMarketListings(S, rng);

  if (h >= 8 && h <= 23) {
    refillMarket(S, rng, (l) =>
      notify(S, {
        route: 'avito/item/' + l.id,
        title: 'Дёшево: ' + itemName(l.item),
        text: `${rub(l.ask)} · размер ${l.item.size}`,
      }),
    );
  }

  secondTick(S, rng, h);
  supplierTick(S, rng, h);
  if (h >= 9 && h <= 22) incomingTick(S, rng);
  if (h >= 9 && h <= 21) rivalHunt(S, rng);

  if (SCHEDULE.lotHours.includes(h)) maybeLot(S, rng);
  if (SCHEDULE.orderHours.includes(h)) maybeOrder(S, rng);
  if (h === SCHEDULE.briefingHour) morningBriefing(S, rng);

  onboardingTick(S);
  mentorFlush(S);
  raffleTick(S, rng);
  tickAds(S, rng);
  if (isBuyerTime(S.t)) generateBuyers(S, rng);
  if (h >= 10 && h <= 21) staffTick(S, rng);
  if (h >= 11 && h <= 21) walkInTick(S, rng);
  threadTimeouts(S, rng);
  prunePosts(S);
}

/* ---------- посылки ---------- */

function arriveShipments(S, rng) {
  for (const sh of S.shipments.slice()) {
    if (S.t < sh.eta) continue;
    S.shipments = S.shipments.filter((x) => x !== sh);
    if (sh.replica) {
      const chance = clamp(
        (0.05 + (hasEvent(S, 'customs') ? 0.18 : 0)) * (1 - 0.04 * S.prog.skills.logist),
        0.01,
        0.3,
      );
      if (rng.chance(chance)) {
        bump(S, 'seized');
        notify(S, {
          route: 'parcels',
          title: 'Таможня изъяла посылку',
          text: `${sh.name}: партия реплик конфискована. Деньги не вернут.`,
        });
        mentorOnce(
          S,
          'seizeTip',
          'Таможня забрала партию? Бывает, это риск карго с палью. Никогда не вкладывай в одну посылку всё, что есть.',
        );
        continue;
      }
    }
    for (const it of sh.items) {
      it.boughtAt = S.t;
      if (sh.protection) {
        it.protect = {
          until: S.t + 24,
          declared: sh.protection.declared,
          paid: sh.protection.paid,
          seller: sh.protection.seller,
        };
      }
      S.items.push(it);
    }
    notify(S, {
      route: 'wardrobe',
      title: 'Посылка получена',
      text: sh.name + (sh.items.length > 1 ? ` · ${sh.items.length} шт` : '') + ' — уже в шкафу',
    });
    if (sh.protection) {
      mentorOnce(
        S,
        'protectTip',
        'Получил вещь с Авитки? У тебя ровно 24 часа на легит-чек. Если окажется паль, а продавец писал «ориг» — откроешь спор и вернёшь деньги. Потом уже никак.',
      );
    }
  }
}

/* ---------- отложенные события ---------- */

function runPending(S, rng) {
  for (const e of S.pending) {
    if (e.done || e.at > S.t) continue;
    e.done = true;
    handlePending(S, rng, e);
  }
  S.pending = S.pending.filter((e) => !e.done);
}

function dealById(S, id) {
  return S.deals.find((d) => d.id === id);
}

function handlePending(S, rng, e) {
  if (e.type === 'payout') {
    if (e.cancelled) return;
    earn(S, e.amount, 'Авитка: выплата за ' + e.label);
    notify(S, { route: 'bank', title: 'Деньги пришли', text: `+${rub(e.amount)} · ${e.label}` });
  }
  if (e.type === 'review') {
    const xp = addReview(
      S,
      { stars: e.stars, weight: 1, text: e.text, platform: e.platform, tierKey: e.tierKey },
      (lvl) => onLevelUp(S, lvl),
    );
    const r = ratingOf(S);
    notify(S, {
      route: 'shop',
      title: 'Новый отзыв ' + '★'.repeat(e.stars),
      text:
        'Рейтинг ' + (r === null ? '—' : r.toFixed(2)) + (xp ? ` · ${xp > 0 ? '+' : ''}${Math.round(xp)} опыта` : ' · опыт без изменений'),
    });
  }
  if (e.type === 'dispute') {
    const d = dealById(S, e.dealId);
    if (!d) return;
    d.disputed = true;
    S.stats.profit -= d.price;
    bump(S, 'caught');
    addReview(
      S,
      {
        stars: 1,
        weight: 3,
        text: 'Продавец — мошенник! Продал ПАЛЬ под видом оригинала. Авитка вернула деньги.',
        platform: 'avito',
        tierKey: d.tierKey,
      },
      (lvl) => onLevelUp(S, lvl),
    );
    S.rep.complaints++;
    const th = newThread(S, { kind: 'system', name: 'Авитка · Поддержка', platform: 'avito' });
    say(
      S,
      th,
      'them',
      `Покупатель открыл спор по заказу «${d.label}»: товар не является оригиналом. Экспертиза подтвердила подделку. Деньги возвращены покупателю, товар едет обратно.\nЖалоб на вас: ${S.rep.complaints} из 3.`,
    );
    closeThread(S, th);
    returnItemLater(S, d, 48);
    cancelPayout(S, d.id);
    notify(S, {
      route: 'avito',
      title: 'Спор проигран: ' + d.label,
      text: 'Покупатель доказал, что это паль. Деньги вернули ему, тебе — единица',
    });
    checkBan(S);
  }
  if (e.type === 'claim') {
    const d = dealById(S, e.dealId);
    if (!d) return;
    const th = newThread(S, {
      kind: 'claim',
      name: d.buyer || buyerName(rng),
      sub: d.label,
      platform: e.platform,
      data: { dealId: d.id, expiresAt: S.t + 36 },
    });
    say(
      S,
      th,
      'them',
      rng.pick([
        `Слышь, я сделал легит-чек на ${d.label}. Это ПАЛЬ. Ты продавал как оригинал. Верни ${rub(d.price)}, вещь отдам.`,
        `Мне в легит-сервисе сказали, что ${d.label} — подделка. Возвращай деньги, или пишу отзыв и жалобу.`,
      ]),
    );
    notify(S, {
      route: (e.platform === 'tg' ? 'tg' : 'avito') + '/thread/' + th.id,
      title: 'Покупатель: это паль!',
      text: d.label + ' · требует вернуть деньги',
      scope: 'client',
    });
  }
  if (e.type === 'sizeReturn') {
    const d = dealById(S, e.dealId);
    if (!d || d.disputed) return;
    d.disputed = true;
    d.returned = true;
    S.stats.profit -= d.price;
    bump(S, 'returns');
    cancelPayout(S, d.id);
    returnItemLater(S, d, 36, true);
    notify(S, {
      route: 'avito',
      title: 'Возврат: ' + d.label,
      text: 'Покупателю не подошёл размер. Деньги не придут, вещь вернётся',
    });
  }
  if (e.type === 'itemReturn') {
    const it = e.item;
    it.id = undefined;
    const fresh = { ...it, id: (S.nextItemId = (S.nextItemId || 100000) + 1), sale: null };
    if (!e.keepVerdict) fresh.verdict = 'fake';
    fresh.boughtAt = S.t;
    S.items.push(fresh);
    notify(S, {
      route: 'wardrobe',
      title: 'Вещь вернулась',
      text: itemName(fresh) + ' снова в шкафу',
    });
  }
  if (e.type === 'callback') {
    const l = S.listings.find((x) => x.id === e.listingId);
    if (!l || l.seller.blocked) return;
    const th = l.threadId && findThread(S, l.threadId);
    if (!th) return;
    const better = priceRound(l.seller.current * rng.range(0.88, 0.95));
    l.seller.current = better;
    l.seller.calledBack = true;
    th.closed = false;
    th.hidden = false;
    say(S, th, 'them', rng.pick([
      `Слушай, ладно. ${rub(better)} — заберёшь?`,
      `Передумал. Отдам за ${rub(better)}, если ещё актуально.`,
    ]));
    notify(S, {
      route: 'avito/thread/' + th.id,
      title: l.seller.name + ' передумал',
      text: 'Готов отдать за ' + rub(better),
      scope: 'client',
    });
  }
}

function cancelPayout(S, dealId) {
  for (const p of S.pending) if (p.type === 'payout' && p.dealId === dealId) p.cancelled = true;
}

function returnItemLater(S, deal, hours, keepVerdict) {
  schedule(S, S.t + hours, 'itemReturn', { item: deal.itemSnapshot, keepVerdict: !!keepVerdict });
}

export function checkBan(S) {
  if (S.rep.complaints < 3) return;
  // Блокировки нарастают: второй раз — две недели, третий — до конца сезона.
  S.rep.bans = (S.rep.bans || 0) + 1;
  const days = S.rep.bans === 1 ? 5 : S.rep.bans === 2 ? 14 : 400;
  S.rep.banUntil = S.t + days * 24;
  S.flags.unbanned = 0;
  for (const it of S.items) {
    if (!it.sale) continue;
    it.sale.avito = false;
    if (!it.sale.tg) it.sale = null;
  }
  for (const th of S.threads) {
    if (th.kind === 'buyer' && th.platform === 'avito' && !th.closed) {
      closeThread(S, th, 'Аккаунт продавца заблокирован');
    }
  }
  notify(S, {
    route: 'avito',
    title: 'Авитка заблокировала аккаунт',
    text: days >= 400 ? 'Насовсем. Остался только канал' : `На ${days} дней из-за жалоб`,
  });
  mentorSay(
    S,
    days >= 400
      ? 'Всё, Авитка тебя закрыла насовсем. Остался только канал — и там тебе тоже не особо верят. Это то, чем всегда кончается торговля палью под видом оригинала.'
      : days >= 14
        ? 'Второй бан, уже на две недели. Третий будет последним. Завязывай.'
        : 'Брат, тебе Авитку заблочили на пять дней из-за жалоб. Пока работай через канал. И завязывай толкать паль как ориг — рейтинг потом не отмоешь.',
  );
}

/* ---------- объявления ---------- */

function expireMarketListings(S, rng) {
  expireListings(S, (l) => {
    const th = l.threadId && findThread(S, l.threadId);
    if (l.incoming) {
      // Человек пришёл сам — и так же сам ушёл, если ему не ответили.
      if (th && !th.closed) {
        say(S, th, 'them', rng.pick([
          'Ладно, я уже продал. В другой раз.',
          'Долго не отвечаешь, отдал знакомому.',
          'Всё, передумал продавать.',
        ]));
        closeThread(S, th);
      }
      return;
    }
    const taken = snipes(S, rng, l);
    if (th && !th.closed) {
      closeThread(S, th, taken ? 'Объявление снято: вещь забрал другой покупатель' : 'Объявление снято: вещь продали');
    }
    // Про чужие объявления он треплется редко: иначе за болтовнёй
    // не слышно настоящих перехватов.
    if (taken && rng.chance(0.1)) {
      rivalTaunt(S, rng, 'snipe', { item: itemName(l.item), price: rub(l.ask) });
    }
  });
}

/**
 * Мирон влетел.
 * Он торгует на том же рынке и попадается на том же: паль за дорого, единица
 * в отзывах, зависшая партия, перевод на карту кидале. Пишет об этом сам —
 * и по его осечкам видно, что рынок одинаково суров ко всем.
 */
function rivalBlunder(S, rng) {
  const res = blunder(S, rng);
  if (!res) return;
  const pool = BRANDED.filter((m) => S.market.h[m.i] > 0.3);
  const name = pool.length ? itemName({ m: rng.pick(pool).i, way: 0, size: 'M', cond: 0 }) : 'вещь';
  const text = res.text
    .replace('{item}', name)
    .replace('{price}', rub(Math.max(3000, Math.round(res.loss * rng.range(0.5, 1.1)))));
  // Именно Мирон: в чатах той же природы могут сидеть партнёры по коллабу.
  let th = S.threads.find((t) => t.kind === 'rival' && t.name === RIVAL_NAME);
  if (!th) {
    th = newThread(S, { kind: 'rival', name: RIVAL_NAME, sub: 'конкурент', platform: 'tg' });
  }
  th.closed = false;
  say(S, th, 'them', text);
  notify(S, {
    route: 'tg/thread/' + th.id,
    title: RIVAL_NAME + ' влетел',
    text: text.length > 90 ? text.slice(0, 88) + '…' : text,
    scope: 'client',
  });
  logDay(S, `${RIVAL_NAME} потерял ${rub(res.loss)}`);
}

function rivalTaunt(S, rng, kind, vars) {
  const text = taunt(S, rng, kind, { ...vars, nw: rub(S.rival.nw) });
  if (!text) return;
  // Именно Мирон: в чатах той же природы могут сидеть партнёры по коллабу.
  let th = S.threads.find((t) => t.kind === 'rival' && t.name === RIVAL_NAME);
  if (!th) {
    th = newThread(S, {
      kind: 'rival',
      name: RIVAL_NAME,
      sub: 'конкурент',
      platform: 'tg',
    });
  }
  th.closed = false;
  th.hidden = false;
  say(S, th, 'them', text);
  notify(S, { route: 'tg/thread/' + th.id, title: RIVAL_NAME, text, scope: 'client' });
}

/* ---------- секонд ---------- */

function secondTick(S, rng, h) {
  if (h === SCHEDULE.secondOpen) {
    const dw = weekdayAt(S.t);
    if (dw === 1) {
      restock(S, rng, 'big');
      notify(S, {
        route: 'second',
        title: 'Секонд: большой завоз!',
        text: 'Ликвид разберут за несколько часов. Осмотр стоит времени — выбирай, что смотреть',
      });
    } else if (dw === 4) {
      restock(S, rng, 'mini');
      notify(S, { route: 'second', title: 'Секонд: небольшой подвоз', text: 'Пара приличных вещей' });
    } else if (rng.chance(0.35)) {
      S.second.items.push(secondItem(S, rng, true, false));
    }
  }
  rivalAtSecond(S, rng, h);
  pickOver(S, rng);
}

/**
 * Мирон стоит у «Мешка» к открытию.
 * Пришёл вместе с ним — выбираете наравне, и он уносит заметно меньше.
 * Проспал — он снимает с полки лучшее и обязательно об этом напишет.
 */
function rivalAtSecond(S, rng, h) {
  // Разбираем час открытия в начале следующего: только так видно,
  // был игрок у полки или проспал.
  const sinceOpen = h - SCHEDULE.secondOpen - 1;
  if (sinceOpen !== 0) return;
  const freshDay = weekdayAt(S.t) === 1 || weekdayAt(S.t) === 4;
  if (!freshDay) return;

  // «Игрок здесь» — значит, он в час открытия что-то делал в секонде.
  const playerHere = S.t - (S.second.lastSeen || -999) < 2;

  const treasures = S.second.items
    .filter((x) => isTreasure(S, x))
    .map((x) => ({ x, gain: valueOrig(S, x.item) - priceNow(S, x) }))
    .sort((a, b) => b.gain - a.gain)
    .map((v) => v.x);

  if (playerHere) {
    // Приехал к открытию — первым выбираешь ты, а он уходит с тем, что осталось.
    S.rival.heat = Math.min(10, S.rival.heat + 0.1);
    if (rng.chance(0.4)) {
      const mine = S.items.filter((i) => i.src === 'Секонд «Мешок»' && S.t - i.boughtAt < 3);
      if (mine.length) rivalTaunt(S, rng, 'raidClose', { item: itemName(rng.pick(mine)), price: '' });
      else rivalTaunt(S, rng, 'second', {});
    }
    return;
  }

  // Помощник стоит в очереди вместо тебя и откладывает одну вещь.
  // Остальное Мирон всё равно заберёт — но главное уже не уйдёт.
  const held = reserveAtSecond(S, rng, treasures);
  const rest = held ? treasures.filter((x) => x !== held) : treasures;

  const count = raidSize(S, sinceOpen, playerHere);
  if (count <= 0 || !rest.length) return;

  const taken = raidSecond(S, rest, count);
  if (!taken.length) return;
  S.rival.raidDay = dayIndex(S.t);
  const ids = new Set(taken.map((t) => t.id));
  S.second.items = S.second.items.filter((x) => !ids.has(x.id));

  const first = taken[0];
  const name = itemName(first.item);
  const price = rub(priceNow(S, first));
  {
    rivalTaunt(S, rng, 'raid', { item: name, price });
    notify(S, {
      route: 'second',
      title: 'Мирон был в «Мешке»',
      text: `Снял с полки ${name}. Кто к десяти, тот и выбирает.`,
    });
    mentorOnce(
      S,
      'rivalSecond',
      'Мирон в секонде к десяти как на работу. Хочешь ликвид — будь там к открытию сам, иначе будешь покупать то, что он не взял.',
    );
  }
}

/* ---------- Тимур ведёт первые часы ---------- */
//
// За раз приходит только один шаг — первый несработавший, у которого
// выполнено условие. Поэтому игрок, который сразу побежал в секонд, не
// получит сначала лекцию про шкаф, а все шаги не свалятся кучей.

function onboardingTick(S) {
  for (const step of ONBOARDING) {
    if (S.flags[step.id]) continue;
    if (!step.when(S)) continue;
    mentorOnce(S, step.id, step.text, { first: true });
    return;
  }
}

/* ---------- Мирон охотится за объявлениями ---------- */
// Самое обидное в перекупе — упустить вещь, над которой уже сидел.
// Здесь это обидно по-настоящему, но и лечится понятным способом:
// не душить продавца ради последних трёхсот рублей.

function rivalHunt(S, rng) {
  // Живая переписка — защита: Мирон не лезет туда, где человек уже торгуется.
  const warm = (l) => {
    const th = l.threadId && findThread(S, l.threadId);
    return !!(th && !th.closed && S.t - th.lastAt < WARM_HOURS);
  };
  const l = hunt(S, rng, warm);
  if (!l) return;
  const engaged = engagedWith(l);
  const price = rub(Math.round(l.seller.current * rng.range(0.97, 1.03)));
  const name = itemName(l.item);

  const th = l.threadId && findThread(S, l.threadId);
  if (th && !th.closed) {
    say(S, th, 'them', rng.pick([
      'Извините, уже продал. Человек приехал и забрал.',
      'Всё, вещь ушла. Другой покупатель оказался быстрее.',
      'Продано. Он не торговался, просто приехал с деньгами.',
    ]));
    closeThread(S, th);
  }
  S.listings = S.listings.filter((x) => x !== l);

  if (engaged) {
    rivalTaunt(S, rng, 'intercept', { item: name, price });
    notify(S, {
      route: 'tg/thread/rival',
      title: 'Мирон перехватил вещь',
      text: `${name} за ${price}. Ты над ней думал.`,
    });
    mentorOnce(
      S,
      'rivalSnipe',
      'Видишь цену сильно ниже рынка — бери, а не выторговывай последние триста рублей. На такие объявления охотится не только Мирон.',
    );
  } else if (rng.chance(0.25)) {
    rivalTaunt(S, rng, 'snipe', { item: name, price });
  }
}

/* ---------- к тебе несут вещи ---------- */

function incomingTick(S, rng) {
  if (!adActive(S)) return;
  // Кто из откликнувшихся дошёл до переписки именно сейчас.
  const dueAt = S.buyAd.queue.find((at) => at <= S.t);
  if (dueAt === undefined) return;
  // Больше четырёх таких переписок разом не ведём — иначе это каша.
  // Человек из очереди подождёт пару часов, а не пропадёт.
  const open = S.threads.filter((t) => t.kind === 'seller' && !t.closed && t.data.incoming).length;
  if (open >= 4) return;
  S.buyAd.queue = S.buyAd.queue.filter((at) => at !== dueAt);

  const listing = makeIncoming(S, rng);
  S.listings.push(listing);
  const th = newThread(S, {
    kind: 'seller',
    name: listing.seller.name,
    sub: itemName(listing.item),
    platform: 'avito',
    data: { listingId: listing.id, incoming: true },
  });
  listing.threadId = th.id;
  say(S, th, 'them', greetingFor(listing));
  notify(S, {
    route: 'avito/thread/' + th.id,
    title: 'Несут вещь: ' + itemName(listing.item),
    text: `${listing.seller.name} просит ${rub(listing.ask)} · рынок ~${rub(listing.fair)}`,
    scope: 'client',
  });
  mentorOnce(
    S,
    'buyAdTip',
    'К тебе пишут по объявлению «скупаю»? Это лучшая позиция в торге: человеку нужны деньги, а тебе некуда спешить. Встречайся, осматривай всё подряд и дави на дефекты. И помни: половина того, что несут, — паль, причём сами они об этом часто не знают.',
  );
}

/* ---------- поставщики ---------- */

function supplierTick(S, rng, h) {
  if (!SCHEDULE.supplierHours.includes(h)) return;
  for (const key of Object.keys(SUPPLIERS)) {
    const ch = S.suppliers[key];
    if (!ch.unlocked) continue;
    const base = 0.45 + 0.04 * S.prog.skills.conn + (S.prog.unlocks.insiderLots ? 0.1 : 0);
    if (rng.chance(base)) makePost(S, rng, key, false);
  }
}

/* ---------- лоты ---------- */

function maybeLot(S, rng) {
  const open = S.threads.filter((t) => t.kind === 'lot' && !t.closed).length;
  if (open >= 2) return;
  const chance = 0.14 + 0.025 * S.prog.skills.conn + (S.prog.unlocks.insiderLots ? 0.08 : 0);
  if (!rng.chance(chance)) return;
  const type = pickLotType(S, rng);
  if (!type) return;
  const lot = makeLot(S, rng, type);
  const th = newThread(S, {
    kind: 'lot',
    name: lot.person,
    sub: LOT_TYPES[type].n,
    platform: 'tg',
    data: { lot },
  });
  say(S, th, 'them', lotMessage(lot));
  notify(S, {
    route: 'tg/thread/' + th.id,
    title: lot.person,
    text: LOT_TYPES[type].title + ' за ' + rub(lot.price),
    scope: 'client',
  });
  mentorOnce(
    S,
    'lotTip',
    'Тебе в личку пишут с лотами? Мешок — чистая лотерея: бывает пусто, бывает Стонник за копейки. Гардероб обычно выгоднее, но паль попадается и там.',
  );
}

/* ---------- заказы клиентов ---------- */

function maybeOrder(S, rng) {
  if (!S.tg.has || S.tg.subs < 25) return;
  const open = S.threads.filter((t) => t.kind === 'order' && !t.closed).length;
  if (open >= 3) return;

  // Сначала пробуем постоянного клиента — они и есть смысл всей системы.
  const regulars = S.clients.filter((c) => canOrderAgain(S, c));
  let client = null;
  if (regulars.length && rng.chance(0.65)) {
    client = rng.pick(regulars);
  } else {
    // Чем больше аудитория, тем чаще пишут новые люди. Это главная причина
    // вкладываться в канал: заказы платят выше рынка.
    const chance = 0.1 + Math.min(0.42, S.tg.subs / 6000) * (0.6 + 0.4 * (S.tg.trust / 100));
    if (!rng.chance(chance)) return;
    client = makeClient(S, rng);
    S.clients.push(client);
  }

  const order = makeOrder(S, rng, client, (mi, cond, size) =>
    valueOrig(S, { m: mi, cond, size, boughtAt: S.t }),
  );
  const th = newThread(S, {
    kind: 'order',
    name: client.name,
    sub: 'заказ: ' + MODELS[order.m].b + ' ' + MODELS[order.m].n,
    platform: 'tg',
    data: { order, clientId: client.id },
  });
  const text = orderText(order, client)
    .replace('{budget}', rub(order.budget))
    .replace('{deadline}', dateLabel(order.deadline));
  say(S, th, 'them', text);
  notify(S, {
    route: 'tg/thread/' + th.id,
    title: (client.status === 'new' ? 'Заказ от подписчика' : 'Заказ от ' + client.name),
    text: `${MODELS[order.m].b} ${MODELS[order.m].n} ${order.size} · ${rub(order.budget)}`,
    scope: 'client',
  });
  mentorOnce(
    S,
    'orderTip',
    'Заказы подписчиков — лучшие деньги в этой игре: платят выше рынка. Но срок короткий, и Пойзон со своими двумя неделями часто не успевает. Ищи у поставщиков, на Авито или в секонде.',
  );
}

/* ---------- покупатели ---------- */

function generateBuyers(S, rng) {
  for (const it of S.items) {
    if (!it.sale) continue;
    const open = S.threads.filter(
      (t) => t.kind === 'buyer' && !t.closed && t.data.buyer && t.data.buyer.item === it.id,
    ).length;
    if (open >= 3) continue;
    for (const platform of ['avito', 'tg']) {
      if (platform === 'avito' && !it.sale.avito) continue;
      if (platform === 'tg' && !it.sale.tg) continue;
      if (platform === 'avito') it.sale.views += rng.int(0, 4);
      if (!rng.chance(buyerRate(S, it, platform))) continue;
      spawnBuyer(S, rng, it, platform);
      break;
    }
  }
}

function spawnBuyer(S, rng, item, platform) {
  const base = item.sale.asOrig ? valueOrig(S, item) : valueFake(S, item);
  const buyer = makeBuyer(S, rng, item, platform, base);
  const th = newThread(S, {
    kind: 'buyer',
    name: buyerName(rng),
    sub: itemName(item),
    platform,
    data: { buyer },
  });

  // Фишинг: «я оплатил, перейдите по ссылке».
  if (platform === 'avito' && S.stats.sold >= 1 && rng.chance(0.06)) {
    buyer.phishing = true;
    say(S, th, 'them', 'Здравствуйте! Беру за вашу цену. Я уже оплатил через Авитка Доставку 👍');
    say(
      S,
      th,
      'them',
      'Чтобы получить деньги, перейдите по ссылке и введите данные карты: avitka-dostavka-pay.ru/get',
    );
    notify(S, {
      route: 'avito/thread/' + th.id,
      title: th.name + ' · ' + itemName(item),
      text: 'Оплатил, просит перейти по ссылке',
      scope: 'client',
    });
    return;
  }

  say(S, th, 'them', greeting(rng, buyer, item));
  notify(S, {
    route: (platform === 'tg' ? 'tg' : 'avito') + '/thread/' + th.id,
    title: th.name + ' · ' + itemName(item),
    text: buyer.full ? 'Готов купить за твою цену' : 'Предлагает ' + rub(buyer.offer),
    scope: 'client',
  });
}

/* ---------- таймауты переписок ---------- */

function threadTimeouts(S, rng) {
  for (const th of S.threads) {
    if (th.closed) continue;
    if (th.kind === 'buyer' && th.data.buyer) {
      const b = th.data.buyer;
      if (b.phishing) continue;
      if (!b.agreed && S.t > b.expiresAt) {
        say(S, th, 'them', 'Уже неактуально, нашёл другой вариант.');
        closeThread(S, th);
      } else if (b.agreed && S.t - b.lastAt > 48) {
        say(S, th, 'them', 'Так и не отправили… Ладно, неактуально.');
        closeThread(S, th);
      }
    }
    if (th.kind === 'claim' && S.t > th.data.expiresAt) {
      autoResolveClaim(S, th);
    }
    if (th.kind === 'lot' && S.t > th.data.lot.expiresAt) {
      say(S, th, 'them', rng.pick(['Всё, забрали уже.', 'Отдал другому, сорян.']));
      closeThread(S, th);
    }
    if (th.kind === 'order' && S.t > th.data.order.deadline) {
      const client = S.clients.find((c) => c.id === th.data.clientId);
      const order = th.data.order;
      if (order.accepted && order.deposit) {
        // Брал предоплату и не успел — деньги приходится вернуть.
        const back = Math.min(order.deposit, Math.max(0, S.money));
        if (back > 0) pay(S, back, 'Возврат предоплаты: ' + MODELS[order.m].full);
        if (back < order.deposit) {
          // Нечем отдать — банк выдаёт микрозайм, клиент уходит навсегда.
          const need = order.deposit - back;
          microloan(S, Math.ceil(need / 500) * 500);
          earn(S, Math.ceil(need / 500) * 500, 'Микрозайм на возврат предоплаты');
          pay(S, need, 'Возврат предоплаты: ' + MODELS[order.m].full);
        }
        say(S, th, 'them', 'Срок вышел. Верни предоплату и давай без обид.');
        if (client) clientFailed(S, client, 'broke-promise');
        S.tg.trust = clamp(S.tg.trust - 4, 0, 100);
        notify(S, {
          route: 'tg',
          title: 'Заказ сорван',
          text: `${MODELS[order.m].full} · вернул предоплату ${rub(order.deposit)}`,
          scope: 'client',
        });
      } else {
        say(S, th, 'them', 'Нашёл в другом месте. Жаль, ждал тебя.');
        if (client) clientFailed(S, client, 'late');
        S.tg.trust = clamp(S.tg.trust - 2, 0, 100);
      }
      closeThread(S, th);
    }
  }
}

function autoResolveClaim(S, th) {
  const d = dealById(S, th.data.dealId);
  say(S, th, 'system', 'Ты не ответил покупателю');
  say(S, th, 'them', 'Ясно. Жди отзыв и жалобу, мошенник.');
  addReview(
    S,
    {
      stars: 1,
      weight: 3,
      text: 'МОШЕННИК! Продал паль как оригинал и отказался вернуть деньги.',
      platform: th.platform,
      tierKey: d ? d.tierKey : 'street',
    },
    (lvl) => onLevelUp(S, lvl),
  );
  bump(S, 'caught');
  if (th.platform === 'avito') {
    S.rep.complaints++;
    checkBan(S);
  } else {
    const lost = scandal(S);
    notify(S, { route: 'tg', title: 'Скандал в канале', text: `Отписались ${num(lost)} человек` });
  }
  closeThread(S, th);
}

/* ---------- раффл ---------- */

function raffleTick(S, rng) {
  const R = S.raffle;
  if (!R || R.done || S.t < R.resultAt) return;
  R.done = true;
  const title = raffleTitle(R);
  S.channels.drops.posts.unshift({
    at: S.t,
    text: `🏁 Итоги раффла ${title}: победителям пришли письма. Следующий откроется в воскресенье.`,
  });
  S.channels.drops.unread++;
  if (!R.entered) return;

  if (rng.chance(winChance(S))) {
    if (S.money >= R.retail && usedSlots(S) < capacity(S)) {
      pay(S, R.retail, 'Раффл: ' + title);
      const it = makeItem(rng, R.m, {
        cond: 0,
        real: true,
        verdict: 'orig',
        size: R.size,
        way: R.way,
        cost: R.retail + ENTRY_FEE,
        src: 'Раффл',
        hasBox: true,
        boughtAt: S.t,
        limitedName: R.name,
        limitedAt: S.t,
      });
      it.legitDone = true;
      S.items.push(it);
      bump(S, 'rafflesWon');
      notify(S, {
        route: 'wardrobe/item/' + it.id,
        title: 'Ты выиграл раффл! 🎉',
        text: title + ' · размер ' + R.size + ' уже в шкафу',
      });
    } else {
      notify(S, {
        route: 'tg',
        title: 'Раффл выигран, но…',
        text: S.money < R.retail ? 'Не хватило денег на выкуп — место ушло другому' : 'Шкаф забит — место ушло другому',
      });
    }
  } else {
    notify(S, { route: 'tg', title: 'Раффл: не повезло', text: title + ' · в следующий раз' });
  }
}

/* ---------- утренняя сводка ---------- */

function morningBriefing(S, rng) {
  const ranked = BRANDED.map((m) => ({ m, h: hypePct(S, m.i) })).sort((a, b) => b.h - a.h);
  const top = ranked.slice(0, 5);
  const bottom = ranked.slice(-3).reverse();
  const month = new Date(2026, 8, 7 + dayIndex(S.t)).getMonth();
  const seasonNote =
    month >= 8 && month <= 10
      ? 'Осень: куртки и свитеры дорожают каждую неделю, футболки уже никому не нужны.'
      : month === 11 || month <= 1
        ? 'Зима: пуховики на пике. Летние вещи не продать вообще.'
        : month <= 4
          ? 'Весна: ветровки и кроссы в цене, пуховики валятся.'
          : 'Лето: футболки и поло, пуховики можно не доставать.';

  S.channels.radar.posts.unshift({
    at: S.t,
    kind: 'daily',
    text:
      `📊 Что сейчас в ликвиде · ${dateLabel(S.t)}\n\n🔥 Ликвид:\n` +
      top.map((x) => `• ${x.m.b} ${x.m.n} — ${x.h}%`).join('\n') +
      `\n\n🧊 Лежит:\n` +
      bottom.map((x) => `• ${x.m.b} ${x.m.n} — ${x.h}%`).join('\n') +
      `\n\n${seasonNote}`,
  });
  if (S.channels.radar.posts.length > 40) S.channels.radar.posts.length = 40;
  S.channels.radar.unread++;

  if (S.tg.proUntil > S.t) proForecast(S);
}

function proForecast(S) {
  const rows = BRANDED.map((m) => {
    const now = S.market.h[m.i];
    let future = S.market.hT[m.i];
    for (const e of S.events) {
      if (e.start > S.t - 24 && e.start < S.t + 7 * 24) {
        if (e.type === 'wave' && e.m === m.i) future = 0.97;
        if (e.type === 'brand' && m.b === e.brand) future = Math.min(1, future + 0.28);
        if (e.type === 'dead' && e.m === m.i) future = 0.12;
      }
    }
    return { m, now, future, score: future + 1.25 * (future - now) };
  })
    .filter((r) => r.future >= 0.55)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  S.channels.radar.posts.unshift({
    at: S.t,
    kind: 'pro',
    text:
      `🔮 PRO · ${dateLabel(S.t)}\nТоп-5 вещей, которые будут в ликвиде:\n\n` +
      rows
        .map(
          (r, i) =>
            `${i + 1}. ${r.m.b} ${r.m.n} — сейчас ${Math.round(r.now * 100)}% → ~${Math.round(
              r.future * 100,
            )}%${r.future - r.now > 0.08 ? ' 📈' : ''}`,
        )
        .join('\n') +
      '\n\nЗакупайся, пока Пойзон не подтянул цены.',
  });
  S.channels.radar.unread++;
  notify(S, {
    route: 'chan/radar',
    title: 'Хайп-радар PRO',
    text: 'Топ-5 вещей, которые скоро будут в ликвиде',
  });
}

/* ======================= ДНЕВНОЙ ТИК ======================= */

export function dayTick(S) {
  const rng = rngOf(S);
  S.dayLog = [];
  const day = dayIndex(S.t);
  const dw = weekdayAt(S.t);

  if (dw === 1 && S.week) {
    const soldWeek = S.stats.sold - S.week.sold;
    const profitWeek = S.stats.profit - S.week.profit;
    logDay(
      S,
      `Итоги недели: продано ${soldWeek} ${plural(soldWeek, 'вещь', 'вещи', 'вещей')}, прибыль ${rub(profitWeek)}`,
    );
    logDay(S, 'Капитал за неделю', Math.round(netWorth(S) - S.week.nw));
  }

  mustPay(S, COST_FOOD_DAY, 'Еда и проезд');
  dropTick(S, rng);

  if (S.deposit > 0) {
    const i = depositInterest(S);
    S.deposit += i;
    if (i) logDay(S, 'Проценты по вкладу', i);
  }

  if (dw === 1) {
    for (const loan of S.loans.slice()) weeklyLoan(S, loan);
    const rent = S.season.modifiers.includes('cheapRent') ? COST_ROOM_WEEK / 2 : COST_ROOM_WEEK;
    mustPay(S, rent, 'Аренда комнаты');
    for (const st of STORAGE) {
      if (S.prog.storage[st.id] && st.rent) mustPay(S, st.rent, 'Аренда: ' + st.n);
    }
    const staffDef = hired(S);
    if (staffDef) mustPay(S, wageTotal(S), 'Зарплата: ' + staffDef.n);
    S.loans = S.loans.filter((l) => l.principal > 0.5);
    S.week = { nw: netWorth(S), sold: S.stats.sold, profit: S.stats.profit };
  }

  // Мелкие бытовые события — чтобы деньги не были абстракцией.
  if (rng.chance(0.08)) lifeEvent(S, rng);

  driftMarket(S, rng);
  calendarEvents(S, (text) => {
    S.channels.radar.posts.unshift({ at: S.t, text });
    S.channels.radar.unread++;
  });

  if (S.t >= S.nextEventAt) {
    generateEvent(S, rng, (text) => {
      S.channels.radar.posts.unshift({ at: S.t, kind: 'rumor', text });
      S.channels.radar.unread++;
    });
    S.nextEventAt = S.t + rng.int(3, 5) * 24;
  }
  for (const e of S.events) {
    if (e.announced || S.t < e.start) continue;
    e.announced = true;
    applyEvent(S, rng, e);
    S.channels.radar.posts.unshift({ at: S.t, kind: 'event', text: '⚡ ' + e.title + '\n\n' + e.text });
    S.channels.radar.unread++;
    logDay(S, 'Новость: ' + e.title);
  }
  S.events = S.events.filter((e) => e.end > S.t - 24 * 10);

  const chan = dailyChannel(S, rng);
  if (chan && chan.lost) logDay(S, `Канал без постов — отписались ${chan.lost}`);

  if (S.rep.banUntil && S.rep.banUntil <= S.t && !S.flags.unbanned) {
    S.flags.unbanned = 1;
    S.rep.complaints = 0;
    logDay(S, 'Авитка сняла блокировку');
  }

  // Конкуренты.
  const beforeRank = currentRank(S);
  tickRival(S, rng);
  rivalBlunder(S, rng);
  for (const r of S.bgRivals) {
    r.nw = Math.round(r.nw * (1 + r.growth + rng.range(-0.022, 0.018)));
    r.growth *= 0.9935;
  }
  const afterRank = currentRank(S);
  if (afterRank < beforeRank) logDay(S, 'Ты поднялся в топе перекупов: №' + afterRank);
  else if (afterRank > beforeRank) logDay(S, 'Тебя обогнали: теперь №' + afterRank);

  const mine = netWorth(S);
  if (!S.flags.passedRival && mine > S.rival.nw) {
    S.flags.passedRival = 1;
    rivalTaunt(S, rng, 'behind', {});
  } else if (S.flags.passedRival && mine < S.rival.nw * 0.8) {
    S.flags.passedRival = 0;
    rivalTaunt(S, rng, 'ahead', {});
  }

  // Воскресенье — новый раффл.
  if (dw === 0 && (!S.raffle || S.raffle.done)) {
    S.raffle = newRaffle(S, rng);
    S.channels.drops.posts.unshift({
      at: S.t,
      text:
        `🎟 Раффл: ${raffleTitle(S.raffle)}\nЛимитированный релиз. Цена по ретейлу ${rub(
          S.raffle.retail,
        )}, на ресейле уйдёт заметно дороже.\nЗапись до ${dateLabel(S.raffle.resultAt)}, 12:00. Взнос ${rub(ENTRY_FEE)}.`,
    });
    S.channels.drops.unread++;
  }

  // Серия «на связи»: отвечать клиентам каждый день.
  updateStreak(S, day);

  // Банкротство.
  if (dw === 1) {
    const line = bankruptcyLine(S);
    if (mine < line) S.flags.bankrupt = 1;
    else if (mine < line / 2) {
      mentorSay(
        S,
        'Брат, долги уже больше, чем всё твоё добро. Ещё немного — и банкротство. Срочно гаси микрозайм: продавай быстро и выходи на подработку.',
      );
    }
  }

  // Чистка диалогов и уведомлений.
  S.threads = S.threads.filter(
    (th) => th.pinned || !th.closed || th.unread > 0 || S.t - th.lastAt < 48,
  );

  S.history.push({ day, value: Math.round(netWorth(S)) });
  if (S.history.length > 200) S.history.shift();

  if (isSeasonOver(S) && !S.season.finished) {
    S.season.finished = true;
    S.flags.seasonEnd = 1;
  }

  checkGoals(S);
}

function lifeEvent(S, rng) {
  const e = rng.weighted(LIFE_EVENTS, (x) => x.w);
  const amount = Math.round(rng.range(e.cost[0], e.cost[1]) / 50) * 50;
  if (amount > 0) {
    mustPay(S, amount, e.n);
  } else {
    earn(S, -amount, e.n);
    logDay(S, e.n, -amount);
  }
}

function mustPay(S, amount, reason) {
  if (S.money < amount) {
    const need = Math.ceil((amount - S.money) / 500) * 500;
    microloan(S, need);
    earn(S, need, 'Микрозайм');
    logDay(S, 'Не хватило денег — банк выдал микрозайм', need);
    notify(S, {
      route: 'bank',
      title: 'Микрозайм ' + rub(need),
      text: 'Не хватило на «' + reason + '». 10% в неделю — верни поскорее',
    });
  }
  pay(S, amount, reason);
  logDay(S, reason, -amount);
}

function weeklyLoan(S, loan) {
  const interest = Math.round(loan.principal * loan.rate);
  const due = Math.min(loan.payment, Math.ceil(loan.principal + interest));
  if (S.money >= due) {
    pay(S, due, loan.name + ': платёж');
    loan.principal = Math.max(0, loan.principal + interest - due);
    loan.paidTotal += due;
    loan.missed = 0;
    logDay(S, loan.name + ': платёж', -due);
    if (loan.principal <= 0.5 && loan.name !== 'Микрозайм') {
      S.credit.paidClean++;
      logDay(S, 'Кредит закрыт — банк поднял лимит');
    }
  } else {
    loan.missed++;
    S.credit.missed++;
    const fine = Math.round(due * 0.1);
    loan.principal += interest + fine;
    logDay(S, `${loan.name}: просрочка! +${rub(interest + fine)} к долгу`);
    notify(S, {
      route: 'bank',
      title: 'Просрочка по кредиту',
      text: 'Проценты и штраф добавлены к долгу' + (loan.missed >= 2 ? '. Пришли коллекторы' : ''),
    });
    if (loan.missed >= 2) collectors(S, loan, due);
  }
}

function collectors(S, loan, need) {
  let got = 0;
  const taken = [];
  const sorted = S.items.slice().sort((a, b) => valueOrig(S, b) - valueOrig(S, a));
  for (const it of sorted) {
    if (got >= need) break;
    got += Math.round((valueOrig(S, it) * 0.4) / 10) * 10;
    taken.push(itemName(it));
    S.items = S.items.filter((x) => x !== it);
    for (const th of S.threads) {
      if (th.kind === 'buyer' && !th.closed && th.data.buyer && th.data.buyer.item === it.id) {
        closeThread(S, th, 'Вещь уже продана');
      }
    }
  }
  const fromCard = Math.min(S.money, Math.max(0, need - got));
  if (fromCard > 0) {
    pay(S, fromCard, 'Коллекторы списали с карты');
    got += fromCard;
  }
  loan.principal = Math.max(0, loan.principal - got);
  loan.missed = 0;
  logDay(S, 'Коллекторы забрали: ' + (taken.join(', ') || 'деньги с карты'));
}

/**
 * Значок «отвечает быстро»: держится, пока ты каждый день отвечаешь тем,
 * кто написал. Если за день не написал никто — значок не слетает: это не
 * твоя вина. Слетает он только тогда, когда человек ждал, а ты не ответил.
 */
function updateStreak(S, day) {
  const ignored = S.threads.some(
    (th) => th.kind === 'buyer' && !th.closed && th.unread > 0 && S.t - th.lastAt >= 10,
  );
  const had = S.streak.answeredToday || ignored;

  if (S.streak.answeredToday) {
    S.streak.days++;
    S.streak.best = Math.max(S.streak.best, S.streak.days);
    if (S.streak.days === FAST_REPLY_DAYS) {
      notify(S, {
        route: 'shop',
        title: 'Значок «отвечает быстро»',
        text: 'Авитка отметила, что ты отвечаешь без задержек. Таким продавцам пишут охотнее.',
      });
    }
  } else if (ignored && S.streak.days > 0) {
    const lost = S.streak.days >= FAST_REPLY_DAYS;
    S.streak.days = 0;
    if (lost) {
      notify(S, {
        route: 'avito/chats',
        title: 'Значок «отвечает быстро» слетел',
        text: 'Покупатель ждал ответа весь день. Собирать значок заново — три дня.',
      });
    }
  }
  // Если писать было некому, цепочка просто стоит на месте.
  if (!had) S.streak.best = Math.max(S.streak.best, S.streak.days);

  S.streak.lastDay = day;
  S.streak.answeredToday = false;
}

export function currentRank(S) {
  const mine = netWorth(S);
  const all = [...S.bgRivals.map((r) => r.nw), S.rival.nw];
  return 1 + all.filter((v) => v > mine).length;
}

export function onLevelUp(S, lvl) {
  notify(S, {
    route: 'shop',
    title: 'Уровень магазина ' + lvl,
    text: `${statusOf(lvl)} · очко навыка, лимит кредита вырос`,
  });
  if (lvl === 2) {
    mentorSay(
      S,
      'Второй уровень. Теперь банк даст побольше, а в «Мешке» тебе начнут откладывать вещи поприличнее. И посмотри в книжку — там уже что-то про модели накопилось.',
    );
  }
  if (lvl === 4) {
    mentorSay(
      S,
      'Четвёртый. На Пойзоне открылся опт от пяти штук: скидка и доставка дешевле. Только помни — пока посылка едет две недели, тренд может пройти.',
    );
  }
  if (lvl === 8) {
    mentorSay(
      S,
      'Восьмой уровень. В секонде теперь попадается премиум, а иногда и люкс. Но и цены там кусаются: продавщицы тоже шарят.',
    );
  }
  if (lvl === 12) {
    mentorSay(S, 'Ты дорос до шоурума. Загляни в «Магазин» — свой угол с витриной это уже уровень.');
  }
}
