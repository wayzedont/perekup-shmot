// Канал, заказы клиентов, раффлы и подписка на прогноз.

import { clamp, rub } from '../util.js';
import { MODELS } from '../data/models.js';
import { AD_CHANNELS } from '../data/content.js';
import { bookValue } from '../economy.js';
import { itemName, sizeLabel, passesAsOrig } from '../items.js';
import { recordTruth, recordDeal } from '../notebook.js';
import {
  createChannel as makeChannel,
  trendPost,
  giveaway as runGiveaway,
  buyAd as runAd,
  PRO_PRICE,
  PRO_DAYS,
} from '../channel.js';
import { channelAllowed } from '../tutorial.js';
import { matchesOrder, fulfilled, failed as clientFailed, clientNote } from '../people/clients.js';
import { winChance, ENTRY_FEE, raffleTitle } from '../market/raffle.js';
import {
  rngOf,
  pay,
  earn,
  canPay,
  toast,
  touch,
  bump,
  say,
  closeThread,
  mentorOnce,
  mentorSay,
  addReview,
  dropItem,
  closeBuyersOf,
  tutorialLock,
  needApp,
  fx,
  notify,
} from '../kernel.js';
import { advanceHours } from '../tick.js';
import { onLevelUp } from '../tick.js';
import { checkGoals } from '../progression.js';

/* ======================= КАНАЛ ======================= */

export function createChannel(S, name) {
  if (needApp(S, 'tg')) return null;
  if (!channelAllowed(S)) {
    toast(S, 'Тимур: погоди, сейчас покажу, где канал.');
    return null;
  }
  const clean = (name || '').trim().slice(0, 28) || 'Мой шмот';
  makeChannel(S, clean);
  mentorSay(
    S,
    'Создал канал? Красава. Пока там только друзья. Купи рекламу в маленьком канале, постись хотя бы раз в пару дней — и подписчики начнут писать с заказами. Заказы, кстати, лучшие деньги тут.',
  );
  checkGoals(S);
  touch(S);
  return true;
}

export function postTrends(S) {
  if (needApp(S, 'tg')) return null;
  if (S.t - S.tg.lastTrendPost < 20) {
    toast(S, 'Пост-обзор можно делать раз в сутки');
    return null;
  }
  const rng = rngOf(S);
  advanceHours(S, 1);
  const gained = trendPost(S, rng);
  touch(S);
  return { gained };
}

export function giveaway(S, item) {
  if (needApp(S, 'tg')) return null;
  if (tutorialLock(S)) return null;
  const rng = rngOf(S);
  const value = bookValue(S, item);
  const gained = runGiveaway(S, rng, item, value);
  dropItem(S, item);
  return { gained };
}

export function buyAd(S, index) {
  if (needApp(S, 'tg')) return null;
  if (tutorialLock(S)) return null;
  const ad = AD_CHANNELS[index];
  if (!ad) return null;
  if (!canPay(S, ad.price)) return null;
  pay(S, ad.price, 'Реклама: ' + ad.n);
  const rng = rngOf(S);
  const res = runAd(S, rng, index);
  bump(S, 'adsBought');
  checkGoals(S);
  touch(S);
  return res;
}

export function buyPro(S) {
  if (needApp(S, 'tg')) return null;
  if (tutorialLock(S)) return null;
  if (!canPay(S, PRO_PRICE)) return null;
  pay(S, PRO_PRICE, 'Хайп-радар PRO');
  S.tg.proUntil = Math.max(S.tg.proUntil, S.t) + PRO_DAYS * 24;
  S.tg.proGift = '';
  S.channels.radar.unread = 0;
  touch(S);
  return { until: S.tg.proUntil };
}

/* ======================= ЗАКАЗЫ КЛИЕНТОВ ======================= */

export function orderMatches(S, order) {
  return S.items.filter((it) => matchesOrder(order, it));
}

export const DEPOSIT_SHARE = 0.4;

/**
 * Взять заказ в работу и получить предоплату.
 *
 * Это обоюдное обязательство: клиент даёт деньги вперёд, чтобы тебе было
 * на что искать вещь, но теперь сорвать заказ стоит заметно дороже —
 * придётся вернуть предоплату и объясняться.
 */
export function acceptOrder(S, th) {
  if (needApp(S, 'tg')) return null;
  const order = th.data.order;
  const client = S.clients.find((c) => c.id === th.data.clientId);
  if (!order || !client || th.closed || order.accepted) return null;
  const deposit = Math.round(order.budget * DEPOSIT_SHARE);
  order.accepted = S.t;
  order.deposit = deposit;
  earn(S, deposit, 'Предоплата за заказ: ' + MODELS[order.m].full);
  say(S, th, 'me', 'Беру. Найду до срока.');
  say(
    S,
    th,
    'them',
    `Отлично, скинул предоплату ${rub(deposit)}. Остальное при получении. Только не подведи.`,
  );
  mentorOnce(
    S,
    'depositTip',
    'Взял предоплату — теперь это обязательство. Не найдёшь к сроку — придётся вернуть деньги, и клиент это запомнит. Зато есть на что искать.',
  );
  touch(S);
  return { deposit };
}

export function fulfillOrder(S, th, item) {
  const order = th.data.order;
  const client = S.clients.find((c) => c.id === th.data.clientId);
  if (!order || !client || th.closed) return null;
  const rng = rngOf(S);

  say(S, th, 'me', `Есть! ${itemName(item)}, ${sizeLabel(item)}, ${item.cond === 0 ? 'новое с биркой' : 'как новое'}.`);

  // Клиент обязательно проверяет: он платил выше рынка именно за оригинал.
  if (!passesAsOrig(item)) {
    say(S, th, 'them', 'Сделал легит-чек — это паль. Ты серьёзно? Забирай обратно.');
    item.verdict = 'fake';
    item.sale = null;
    closeBuyersOf(S, item);
    recordTruth(S, item);
    const lost = clientFailed(S, client, 'fake');
    S.tg.trust = clamp(S.tg.trust - 12, 0, 100);
    addReview(
      S,
      {
        stars: 1,
        weight: 3,
        text: 'Заказал оригинал, прислали паль. Не рекомендую.',
        platform: 'tg',
        tierKey: MODELS[item.m].tier,
      },
      (lvl) => onLevelUp(S, lvl),
    );
    closeThread(S, th);
    touch(S);
    return { state: 'fake', clientLost: lost };
  }

  dropItem(S, item);
  // Предоплату уже получили — теперь остаток.
  const rest = order.budget - (order.deposit || 0);
  earn(S, rest, 'Заказ: ' + itemName(item));
  const profit = order.budget - item.cost;
  S.deals.unshift({
    id: 'D' + (S.nextDealId = (S.nextDealId || 0) + 1),
    label: itemName(item),
    size: item.size,
    cost: item.cost,
    price: order.budget,
    profit,
    platform: 'tg',
    at: S.t,
    asOrig: true,
    real: true,
    buyer: client.name,
    tierKey: MODELS[item.m].tier,
    isOrder: true,
    itemSnapshot: JSON.parse(JSON.stringify({ ...item, sale: null })),
  });
  bump(S, 'sold');
  bump(S, 'ordersDone');
  if (order.grail) {
    // Грааль добыт: трофей и коллекционер в постоянных клиентах.
    bump(S, 'grails');
    fx('level');
    notify(S, { route: 'shop', title: '🏆 Грааль добыт', text: `${itemName(item)} — у коллекционера. Трофеев: ${S.stats.grails}` });
  }
  S.stats.revenue += order.budget;
  S.stats.profit += profit;
  S.stats.bestDeal = Math.max(S.stats.bestDeal, profit);
  if (MODELS[item.m].tier === 'lux') bump(S, 'luxSold');
  recordDeal(S, item, profit);

  const refs = fulfilled(S, client, rng);
  S.tg.trust = clamp(S.tg.trust + 3, 0, 100);
  if (refs) S.tg.adRuns.push({ total: refs, left: refs, name: 'по рекомендации ' + client.name });

  addReview(
    S,
    {
      stars: 5,
      weight: 1,
      text: 'Нашёл то, что я искал, и быстро. Лучший магаз.',
      platform: 'tg',
      tierKey: MODELS[item.m].tier,
    },
    (lvl) => onLevelUp(S, lvl),
  );

  const thanks =
    client.status === 'vip'
      ? 'Как всегда, огонь 🔥 Буду ещё писать.'
      : client.status === 'regular'
        ? 'Спасибо! Ты уже мой постоянный продавец 👍'
        : 'Огонь, спасибо! Всем друзьям расскажу 🔥';
  say(S, th, 'them', thanks);
  closeThread(S, th);

  if (client.status === 'regular' && client.done === 1) {
    mentorOnce(
      S,
      'loyalTip',
      'Этот человек теперь твой постоянный клиент. Он будет писать снова, платить больше и приводить друзей. Веди список — в «Клиентах» видно, кто что носит.',
    );
  }

  checkGoals(S);
  touch(S);
  return { state: 'done', profit, budget: order.budget, referrals: refs, client };
}

export function declineOrder(S, th) {
  // Первый заказ подписчика — урок главы «Телега»: пока она идёт, не отказываемся.
  if (S.tut && S.tut.active && S.tut.ids && th.id === S.tut.ids.orderThread) {
    toast(S, 'Тимур: не отказывайся — это твой первый заказ, разберёмся.');
    return null;
  }
  const client = S.clients.find((c) => c.id === th.data.clientId);
  const order = th.data.order;
  const deposit = order && order.accepted ? order.deposit || 0 : 0;

  if (deposit) {
    // Обещал и не сделал: деньги назад, и это помнят.
    if (S.money < deposit) {
      toast(S, `Нужно вернуть предоплату ${rub(deposit)}, а их нет`);
      return null;
    }
    pay(S, deposit, 'Возврат предоплаты: ' + MODELS[order.m].full);
    say(S, th, 'me', 'Не смог найти. Предоплату возвращаю.');
    say(S, th, 'them', 'Деньги получил. Но в следующий раз подумаю, к кому идти.');
    if (client) clientFailed(S, client, 'broke-promise');
    S.tg.trust = clamp(S.tg.trust - 4, 0, 100);
  } else {
    say(S, th, 'me', 'Сорри, не смогу найти.');
    say(S, th, 'them', 'Ок, жаль.');
    if (client) clientFailed(S, client, 'decline');
  }
  closeThread(S, th);
  touch(S);
  return true;
}

/* ======================= РАФФЛ ======================= */

export function enterRaffle(S, size) {
  if (needApp(S, 'tg')) return null;
  if (tutorialLock(S)) return null;
  const R = S.raffle;
  if (!R || R.done || R.entered) return null;
  if (!canPay(S, ENTRY_FEE)) return null;
  pay(S, ENTRY_FEE, 'Взнос за раффл');
  R.entered = true;
  R.size = size;
  checkGoals(S);
  touch(S);
  return { chance: winChance(S), title: raffleTitle(R) };
}

/* ======================= КЛИЕНТЫ ======================= */

export function clientRows(S) {
  return S.clients
    .slice()
    .sort((a, b) => {
      const rank = { vip: 0, regular: 1, new: 2, lost: 3 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      return b.done - a.done;
    })
    .map((c) => ({ ...c, note: clientNote(c) }));
}
