// Покупка: переписка и торг на Авитке, встреча у метро, секонд,
// Пойзон, поставщики и лоты в личке.

import { clamp, priceRound, rub, num } from '../util.js';
import { MODELS } from '../data/models.js';
import { CONDS } from '../data/catalog.js';
import {
  valueOrig,
  valueFake,
  freeSlots,
  capacity,
  usedSlots,
  poizonPrice,
  poizonEta,
  poizonShip,
  legitCost,
} from '../economy.js';
import { itemName, sizeLabel, shownCondition, makeItem, revealCondition, pickSize } from '../items.js';
import { tellsFor, legitVerdict, suspicion } from '../inspect.js';
import { recordTruth, recordPurchase } from '../notebook.js';
import {
  applyLever,
  offerPrice,
  answerQuestion,
  defectAnswer,
  QUESTIONS,
  LEVERS,
  SELLER_TYPES,
} from '../people/sellers.js';
import {
  rngOf,
  pay,
  earn,
  canPay,
  notify,
  toast,
  touch,
  bump,
  newThread,
  say,
  findThread,
  closeThread,
  mentorOnce,
  mentorSay,
  schedule,
} from '../kernel.js';
import { advanceMinutes, advanceHours } from '../tick.js';
import { findListing, deliveryFee } from '../market/avito.js';
import { findSlot, priceNow } from '../market/second.js';
import { canPostAd, planResponses } from '../market/buyad.js';
import { post as channelPost } from '../channel.js';
import { SUPPLIERS, findPost, postTotal, buildOrderItems, shipUnit, trapFakeRate } from '../market/suppliers.js';
import { inspectTell, inspectCondition } from './items.js';
import { checkGoals } from '../progression.js';
import { canMeet, isSecondOpen, SCHEDULE } from '../time.js';

/* ======================= ПЕРЕПИСКА С ПРОДАВЦОМ ======================= */

export function sellerThread(S, listing) {
  let th = listing.threadId && findThread(S, listing.threadId);
  if (th && th.closed && !listing.seller.blocked) {
    th.closed = false;
    th.hidden = false;
  }
  if (!th) {
    th = newThread(S, {
      kind: 'seller',
      name: listing.seller.name,
      sub: itemName(listing.item),
      platform: 'avito',
      data: { listingId: listing.id },
    });
    listing.threadId = th.id;
    if (!listing.seenAt) listing.seenAt = S.t;
    say(S, th, 'system', itemName(listing.item) + ' · ' + rub(listing.ask));
  }
  return th;
}

export function askSeller(S, listing, q) {
  const rng = rngOf(S);
  const th = sellerThread(S, listing);
  const s = listing.seller;
  if (s.asked[q]) return null;
  s.asked[q] = true;
  say(S, th, 'me', QUESTIONS[q]);

  if (q === 'photos') {
    listing.photosAsked = true;
    if (s.type === 'scam') {
      say(S, th, 'them', 'Фото в объявлении, этого достаточно.');
      say(S, th, 'system', 'Продавец не прислал фото');
      listing.photoNote = 'Продавец отказался присылать фото';
    } else {
      say(S, th, 'them', 'Скинул 📷');
      say(
        S,
        th,
        'system',
        'Пришли фото бирок и швов. Теперь часть признаков можно осмотреть прямо из переписки — но по фото ошибиться проще.',
      );
      listing.photoNote = 'Фото получены';
    }
    advanceMinutes(S, 10);
    touch(S);
    return { photos: true };
  }

  if (q === 'defects') {
    const res = defectAnswer(rng, listing);
    say(S, th, 'them', res.text);
    for (const id of res.revealed) {
      // Продавец сам назвал дефект — он перестаёт быть скрытым.
      const d = listing.item.defects.find((x) => x.id === id);
      if (d) d.revealed = true;
    }
    if (res.revealed.length) {
      listing.item.condSeen = true;
      listing.item.shownCond = listing.item.cond;
      say(S, th, 'system', 'Продавец признался в дефектах. Это можно использовать в торге.');
    }
    advanceMinutes(S, 10);
    touch(S);
    return { defects: res.revealed };
  }

  const answer = answerQuestion(rng, listing, q, listing.item.real);
  say(S, th, 'them', answer);
  if (q === 'orig' && s.type === 'replica') listing.item.verdict = 'fake';
  advanceMinutes(S, 10);
  touch(S);
  return { answer };
}

/** Доступные ходы в торге с учётом того, что игрок уже знает. */
export function availableLevers(S, listing) {
  const s = listing.seller;
  const item = listing.item;
  const out = [];
  for (const key of Object.keys(LEVERS)) {
    if (s.used[key]) continue;
    if (key === 'defect') {
      const known = item.defects.some((d) => d.revealed) || item.condSeen;
      if (!known || !item.defects.length) continue;
    }
    if (key === 'knowledge' && s.type !== 'collector' && S.prog.skills.bargain < 3) continue;
    out.push({ key, ...LEVERS[key] });
  }
  return out;
}

export function useLever(S, listing, key) {
  const rng = rngOf(S);
  const th = sellerThread(S, listing);
  const s = listing.seller;
  if (s.blocked) return null;

  const texts = {
    today: 'Заберу сегодня, наличкой. Скиньте немного.',
    market: 'На Авитке такие же дешевле. Почему у вас дороже?',
    polite: 'Очень выручите, правда. Коплю давно.',
    defect:
      'Там же дефект: ' +
      (listing.item.defects.map((d) => d.n.toLowerCase()).join(', ') || 'видно по фото') +
      '. Это другая цена.',
    knowledge:
      'Это же ' +
      MODELS[listing.item.m].full +
      ', расцветка ' +
      (MODELS[listing.item.m].ways[listing.item.way] || { n: '' }).n.toLowerCase() +
      '. Я в теме, давайте по-честному.',
    walk: 'Понял. Я подумаю.',
  };
  say(S, th, 'me', texts[key] || LEVERS[key].n);

  const strength = key === 'defect' ? 1 + listing.item.defects.length * 0.15 : 1;
  const res = applyLever(rng, s, key, S.prog.skills.bargain, { strength });
  if (!res) return null;
  say(S, th, 'them', res.reply);

  if (res.walked) {
    if (s.willCallBack) {
      schedule(S, S.t + rng.int(3, 10), 'callback', { listingId: listing.id });
    }
    closeThread(S, th);
  }
  if (res.blocked || s.patience <= 0) {
    s.blocked = true;
    say(S, th, 'them', 'Всё, хватит. Не пишите больше.');
    closeThread(S, th, 'Продавец заблокировал вас');
  }
  advanceMinutes(S, 10);
  if (!s.blocked) rivalPressure(S, rng, listing, th);
  touch(S);
  return res;
}

/**
 * У горячего объявления покупатель не один.
 * Чем дольше торгуешься, тем выше шанс, что продавцу напишет кто-то ещё —
 * и тогда цена идёт не вниз, а вверх. Это цена жадности.
 */
function rivalPressure(S, rng, listing, th) {
  const s = listing.seller;
  if (!listing.isDeal || listing.incoming || s.type === 'scam') return;
  if (s.pressured) return;
  // Когда уже стоишь перед продавцом, второй покупатель взяться неоткуда.
  if (listing.met) return;
  const rounds = Object.keys(s.used).length;
  if (rounds < 3) return;
  const chance = clamp(0.06 + 0.05 * rounds + 0.01 * S.rival.heat, 0, 0.3);
  if (!rng.chance(chance)) return;

  s.pressured = true;
  const up = Math.max(200, priceRound(s.current * rng.range(0.05, 0.12)));
  s.floor = priceRound(s.floor + up);
  s.current = priceRound(Math.max(s.current + up, s.floor));
  s.agreed = false;
  s.patience = Math.max(1, s.patience - 1);
  say(
    S,
    th,
    'them',
    rng.pick([
      `Слушайте, мне тут ещё человек написал, готов забрать без торга. Если берёте — то за ${rub(s.current)}.`,
      `Мне предложили больше. ${rub(s.current)} — и вещь ваша, иначе отдам ему.`,
      `Появился второй покупатель. Цена теперь ${rub(s.current)}, уж извините.`,
    ]),
  );
  say(S, th, 'system', 'Вещь уплывает. Решай быстро.');
  mentorOnce(
    S,
    'pressureTip',
    'Чем дольше торгуешься за дешёвую вещь, тем выше шанс, что её заберёт кто-то другой. На хорошей цене выгоднее быстро согласиться, чем выбить ещё пятьсот.',
  );
}

export function offerToSeller(S, listing, amount) {
  if (amount < 50) {
    toast(S, 'Введи цену');
    return null;
  }
  const rng = rngOf(S);
  const th = sellerThread(S, listing);
  say(S, th, 'me', `Отдадите за ${rub(amount)}?`);

  if (listing.seller.type === 'scam') {
    say(S, th, 'them', 'Цена окончательная. Переведите на карту, и я сразу отправлю почтой.');
    listing.scamPush = true;
    advanceMinutes(S, 10);
    touch(S);
    return { state: 'scam' };
  }

  const res = offerPrice(rng, listing.seller, amount, S.prog.skills.bargain);
  say(S, th, 'them', res.reply);
  if (res.state === 'blocked') closeThread(S, th, 'Продавец заблокировал вас');
  advanceMinutes(S, 10);
  touch(S);
  return res;
}

/* ======================= ПОКУПКА С ДОСТАВКОЙ ======================= */

export function buyWithDelivery(S, listing) {
  const s = listing.seller;
  if (s.blocked) {
    toast(S, 'Продавец тебя заблокировал');
    return null;
  }
  if (s.type === 'scam') {
    const th = sellerThread(S, listing);
    say(S, th, 'me', 'Оформляю Авитка Доставку');
    say(S, th, 'them', 'Я не работаю через доставку, там комиссия съедает всё. Переведите на карту, отправлю сразу.');
    listing.scamPush = true;
    touch(S);
    return { state: 'scamPush', threadId: th.id };
  }
  if (listing.mode === 'meet') {
    const th = sellerThread(S, listing);
    say(S, th, 'me', 'Можете отправить Авитка Доставкой?');
    say(S, th, 'them', 'Нет, только встреча у м. ' + listing.metro + '.');
    touch(S);
    return { state: 'meetOnly', threadId: th.id };
  }
  if (freeSlots(S) < 1) {
    toast(S, 'Шкаф забит. Продай что-нибудь или возьми место в «Магазине»');
    return null;
  }
  const price = s.current;
  const fee = deliveryFee(price);
  return { state: 'ready', price, fee, total: price + fee };
}

export function confirmDelivery(S, listing) {
  const quote = buyWithDelivery(S, listing);
  if (!quote || quote.state !== 'ready') return null;
  if (!canPay(S, quote.total)) return null;
  const rng = rngOf(S);
  pay(S, quote.total, 'Авитка: ' + itemName(listing.item));

  const item = listing.item;
  item.cost = quote.total;
  item.src = 'Авитка, доставка';
  if (listing.declared === 'fake') item.verdict = 'fake';

  const days = listing.mode === 'ship' ? rng.range(2, 4) : rng.range(1, 2);
  S.shipments.push({
    id: 'S' + (S.nextShipId = (S.nextShipId || 0) + 1),
    name: itemName(item) + ' · Авитка',
    items: [item],
    start: S.t,
    eta: S.t + Math.round(days * 24),
    fromChina: false,
    replica: false,
    protection: { declared: listing.declared, paid: quote.total, seller: listing.seller.name },
  });

  S.listings = S.listings.filter((l) => l !== listing);
  const th = listing.threadId && findThread(S, listing.threadId);
  if (th) closeThread(S, th, 'Заказ оформлен. Посылка уже едет.');
  bump(S, 'bought');
  recordPurchase(S, item);
  checkGoals(S);
  touch(S);
  return { total: quote.total, eta: S.t + Math.round(days * 24) };
}

/* ======================= ВСТРЕЧА У МЕТРО ======================= */

export function startMeeting(S, listing) {
  const s = listing.seller;
  if (s.blocked) {
    toast(S, 'Продавец тебя заблокировал');
    return null;
  }
  if (s.type === 'scam') {
    const th = sellerThread(S, listing);
    say(S, th, 'me', 'Можно встретиться, посмотреть вживую?');
    say(S, th, 'them', 'Я сейчас не в Москве, могу только отправить. Переведите на карту.');
    listing.scamPush = true;
    touch(S);
    return { state: 'scamPush', threadId: th.id };
  }
  if (listing.mode === 'ship') {
    toast(S, `Продавец не в Москве (${listing.city}), только доставка`);
    return null;
  }
  if (!canMeet(S.t)) {
    toast(S, 'Продавцы встречаются с 9:00 до 20:00');
    return null;
  }
  // Тот, кто пришёл по твоему объявлению, сам подъезжает к тебе:
  // это и есть главное удобство объявления о скупке.
  const fare = listing.incoming ? 0 : 150;
  if (fare && !canPay(S, fare)) return null;
  if (fare) pay(S, fare, 'Метро');
  listing.expiresAt = Math.max(listing.expiresAt, S.t + 5);
  const slept = advanceHours(S, listing.incoming ? 1 : 2);
  bump(S, 'meetings');
  if (slept) return { state: 'slept' };
  if (!findListing(S, listing.id)) {
    toast(S, 'Пока ехал, вещь продали');
    return { state: 'gone' };
  }
  listing.met = true;
  touch(S);
  return { state: 'ok' };
}

/** На встрече доступны все признаки, включая запах. */
export function meetInspect(S, listing, tell) {
  return inspectTell(S, listing.item, tell, 'hand');
}

export function meetInspectCondition(S, listing) {
  const res = inspectCondition(S, listing.item);
  if (res && res.defects.length) {
    const th = sellerThread(S, listing);
    say(
      S,
      th,
      'system',
      'Ты нашёл: ' + res.defects.map((d) => d.n.toLowerCase()).join(', ') + '. Теперь можно давить на цену.',
    );
    mentorOnce(
      S,
      'defectTip',
      'Нашёл дефект — это главный козырь в торге. Продавцы почти всегда уступают, когда ты показываешь, что именно не так.',
    );
  }
  return res;
}

export function meetLegit(S, listing) {
  const item = listing.item;
  const cost = legitCost(S, item);
  if (listing.photoLegit) return null;
  if (!canPay(S, cost)) return null;
  pay(S, cost, 'Легит-чек по фото');
  const rng = rngOf(S);
  listing.photoLegit = true;
  item.verdict = legitVerdict(rng, item, 0.93);
  item.legitDone = true;
  bump(S, 'legitChecks');
  recordTruth(S, item);
  advanceMinutes(S, 20);
  checkGoals(S);
  touch(S);
  return { verdict: item.verdict, cost };
}

export function accuseFake(S, listing) {
  const rng = rngOf(S);
  const s = listing.seller;
  const item = listing.item;
  if (s.accused) return null;
  s.accused = true;
  const th = sellerThread(S, listing);
  say(S, th, 'me', 'Это же паль.');

  if (!item.real) {
    const fairFake = priceRound(valueFake(S, item) * rng.range(1, 1.3));
    s.current = Math.min(s.current, fairFake);
    s.floor = Math.min(s.floor, s.current);
    s.agreed = true;
    item.verdict = 'fake';
    recordTruth(S, item);
    say(
      S,
      th,
      'them',
      s.type === 'liar'
        ? `Ну... ладно, реплика. Отдам за ${rub(s.current)}.`
        : `Да ладно... Не знал, честно. Ну давайте ${rub(s.current)}.`,
    );
    touch(S);
    return { right: true, price: s.current };
  }

  s.blocked = true;
  say(S, th, 'them', 'Сам ты паль. Иди отсюда, ничего не продам.');
  closeThread(S, th, 'Продавец ушёл');
  touch(S);
  return { right: false };
}

export function buyAtMeeting(S, listing) {
  const price = listing.seller.current;
  if (freeSlots(S) < 1) {
    toast(S, 'Шкаф забит');
    return null;
  }
  if (!canPay(S, price)) return null;
  pay(S, price, 'Наличные: ' + itemName(listing.item));
  const item = listing.item;
  item.cost = price + 150;
  item.src = listing.incoming ? 'Принесли по объявлению' : 'Авитка, с рук';
  item.boughtAt = S.t;
  if (listing.incoming) bump(S, 'adBuys');
  if (listing.declared === 'fake') item.verdict = 'fake';
  S.items.push(item);
  S.listings = S.listings.filter((l) => l !== listing);
  const th = listing.threadId && findThread(S, listing.threadId);
  if (th) closeThread(S, th, 'Сделка у метро. Вещь твоя.');
  bump(S, 'bought');
  recordPurchase(S, item);
  checkGoals(S);
  touch(S);
  return { price, itemId: item.id };
}

/* ======================= КИДАЛА ======================= */

export function payScammer(S, listing) {
  const price = listing.seller.current;
  if (!canPay(S, price)) return null;
  pay(S, price, 'Перевод продавцу: ' + itemName(listing.item));
  const th = sellerThread(S, listing);
  say(S, th, 'me', `Перевёл ${rub(price)}`);
  say(S, th, 'system', 'Пользователь удалил аккаунт.');
  closeThread(S, th);
  S.listings = S.listings.filter((l) => l !== listing);
  bump(S, 'scammed');
  mentorSay(
    S,
    'Ты перевёл деньги на карту? Смотри на признаки вместе, а не по одному: свежий аккаунт, ноль отзывов, цена вдвое ниже рынка и отказ от Авитка Доставки. По отдельности бывает у кого угодно, но все сразу — это всегда кидала.',
  );
  touch(S);
  return { lost: price };
}

/* ======================= СЕКОНД ======================= */

/** Отмечает, что игрок сейчас у полки: от этого зависит, сколько унесёт Мирон. */
export function visitSecond(S) {
  S.second.lastSeen = S.t;
}

export function secondInspect(S, slotId, tell) {
  const slot = findSlot(S, slotId);
  if (!slot) return null;
  if (!isSecondOpen(S.t)) {
    toast(S, 'Секонд закрыт');
    return null;
  }
  visitSecond(S);
  return inspectTell(S, slot.item, tell, 'hand');
}

export function secondInspectCondition(S, slotId) {
  const slot = findSlot(S, slotId);
  if (!slot) return null;
  if (!isSecondOpen(S.t)) {
    toast(S, 'Секонд закрыт');
    return null;
  }
  visitSecond(S);
  return inspectCondition(S, slot.item);
}

export function buySecond(S, slotId) {
  const slot = findSlot(S, slotId);
  if (!slot) return null;
  if (!isSecondOpen(S.t)) {
    toast(S, 'Секонд закрыт. Работает с 10:00 до 21:00');
    return null;
  }
  if (freeSlots(S) < 1) {
    toast(S, 'Шкаф забит');
    return null;
  }
  const price = priceNow(S, slot);
  if (!canPay(S, price)) return null;
  pay(S, price, 'Секонд: ' + itemName(slot.item));
  const item = slot.item;
  item.cost = price;
  item.src = 'Секонд «Мешок»';
  item.boughtAt = S.t;
  S.items.push(item);
  S.second.items = S.second.items.filter((x) => x !== slot);
  visitSecond(S);
  bump(S, 'secondBuys');
  bump(S, 'bought');
  recordPurchase(S, item);
  advanceMinutes(S, 5);
  checkGoals(S);
  touch(S);
  return { price, itemId: item.id };
}

/* ======================= ПОЙЗОН ======================= */

export function buyPoizon(S, modelIndex, size, qty) {
  const m = MODELS[modelIndex];
  const rng = rngOf(S);
  const bulk = qty >= 5 && S.prog.lvl >= 4;
  const ship = poizonShip(S, modelIndex, qty);
  if (freeSlots(S) < qty) {
    toast(S, `Не влезет: свободно ${freeSlots(S)} мест`);
    return null;
  }
  const plan = [];
  let total = 0;
  for (let i = 0; i < qty; i++) {
    // «Сетка» — разные ходовые размеры, иначе все одного.
    const sz = size === 'mix' ? pickSize(rng, m.cat) : size;
    const price = poizonPrice(S, modelIndex, sz);
    const unit = (bulk ? priceRound(price * 0.9) : price) + ship;
    plan.push({ size: sz, unit });
    total += unit;
  }
  if (!canPay(S, total)) return null;
  pay(S, total, `Пойзон: ${m.b} ${m.n} ×${qty}`);

  const items = plan.map((p) =>
    makeItem(rng, modelIndex, {
      cond: 0,
      real: true,
      verdict: 'orig',
      size: p.size,
      cost: p.unit,
      src: 'Пойзон',
      hasBox: true,
      boughtAt: S.t,
    }),
  );
  for (const it of items) it.legitDone = true;

  const [lo, hi] = poizonEta(S);
  const days = rng.range(lo, hi);
  S.shipments.push({
    id: 'S' + (S.nextShipId = (S.nextShipId || 0) + 1),
    name: `Пойзон: ${m.b} ${m.n}${qty > 1 ? ' ×' + qty : ''}`,
    items,
    start: S.t,
    eta: S.t + Math.round(days * 24),
    fromChina: true,
    replica: false,
  });
  bump(S, 'poizonOrders');
  bump(S, 'bought', qty);
  if (qty >= 5) bump(S, 'bulkOrders');
  checkGoals(S);
  touch(S);
  return { total, eta: S.t + Math.round(days * 24) };
}

/* ======================= ПОСТАВЩИКИ ======================= */

export function buyFromSupplier(S, key, postId, qty) {
  const C = SUPPLIERS[key];
  const post = findPost(S, key, postId);
  if (!post) return null;
  const n = clamp(qty, C.minQty, post.left);
  if (freeSlots(S) < n) {
    toast(S, `Не влезет: свободно ${freeSlots(S)} мест`);
    return null;
  }
  const total = postTotal(S, key, post, n);
  if (!canPay(S, total)) return null;
  const rng = rngOf(S);
  const m = MODELS[post.m];
  pay(S, total, `${C.n}: ${m.b} ${m.n} ×${n}`);
  post.left -= n;
  const unit = Math.round(total / n);
  const items = buildOrderItems(S, rng, key, post, n, unit);

  const days = rng.range(C.eta[0], C.eta[1]) * (C.ship === 'cargo' ? 1 - 0.04 * S.prog.skills.logist : 1);
  S.shipments.push({
    id: 'S' + (S.nextShipId = (S.nextShipId || 0) + 1),
    name: `${m.b} ${m.n}${n > 1 ? ' ×' + n : ''}`,
    items,
    start: S.t,
    eta: S.t + Math.round(days * 24),
    fromChina: C.ship === 'cargo',
    replica: C.kind === 'rep',
  });
  bump(S, 'bought', n);
  if (n >= 5) bump(S, 'bulkOrders');
  checkGoals(S);
  touch(S);

  if (C.kind === 'trap') {
    mentorOnce(
      S,
      'trapTip',
      'Брал у «Ориг из Европы»? Ребята нормальные, но паль иногда проскакивает. Как придёт — сразу проверь. Чем выше твой уровень и связи, тем реже подсовывают.',
    );
  }
  return { total, eta: S.t + Math.round(days * 24), count: n };
}

/* ======================= «СКУПАЮ ШМОТ» ======================= */

export function postBuyAd(S) {
  const check = canPostAd(S);
  if (!check.ok) {
    toast(S, check.why);
    return null;
  }
  const rng = rngOf(S);
  const queue = planResponses(S, rng);
  S.buyAd = { postedAt: S.t, queue };
  channelPost(
    S,
    'buyad',
    'СКУПАЮ ШМОТ 💸\n\nБренды, ориг и приличные реплики. Смотрю сам, деньги на месте, подъеду куда удобно.\nКидайте фото в личку — оценю честно.',
  );
  advanceMinutes(S, 20);
  touch(S);
  mentorOnce(
    S,
    'buyAdPosted',
    'Объявление о скупке — это другая сторона рынка: теперь вещи несут тебе, а не наоборот. Откликаются твои же подписчики, примерно один на сотню, так что растить канал выгодно вдвойне. Повторять чаще раза в неделю не надо — отпишутся.',
  );
  return { count: queue.length };
}

/* ======================= ЗАКАЗ ПОСТАВЩИКУ ======================= */
//
// Главный способ выполнить заказ клиента в срок. Поставщик из Европы
// привозит именно то, что просили, за три-шесть дней — но дороже своей же
// витрины и с чуть большим риском пали. Пойзон за неделю не успевает,
// а на Авитке нужного размера может не быть вовсе.

export const REQUEST_COOLDOWN = 6; // часов между запросами

export function canRequestSupply(S) {
  if (!S.suppliers.orig.unlocked) return { ok: false, why: 'Поставщик тебе ещё не пишет' };
  const last = S.flags.lastSupplyRequest || -999;
  if (S.t - last < REQUEST_COOLDOWN) {
    return { ok: false, why: `Он ответит не раньше чем через ${REQUEST_COOLDOWN - (S.t - last)} ч` };
  }
  return { ok: true };
}

/** Во сколько обойдётся просьба достать конкретную вещь. */
export function supplyQuote(S, modelIndex, size, maxCond) {
  const m = MODELS[modelIndex];
  const cond = maxCond === 0 ? 0 : 1;
  const probe = { m: modelIndex, cond, size, boughtAt: S.t, way: 0 };
  const base = valueOrig(S, probe);
  // Чем выше «Связи», тем лояльнее цена. Люкс поставщик берёт только с 6 уровня.
  const k = clamp(0.84 - 0.016 * S.prog.skills.conn, 0.66, 0.84);
  const price = priceRound(base * k);
  // Под заказ везут быстрее витрины — иначе короткие сроки клиентов
  // были бы невыполнимы в принципе. «Логистика» ускоряет ещё.
  const lo = Math.max(1, 2 - Math.floor(S.prog.skills.logist / 6));
  const hi = Math.max(lo + 1, 5 - Math.floor(S.prog.skills.logist / 4));
  return {
    model: m,
    cond,
    size,
    price,
    ship: SUPPLIERS.orig.ship,
    total: price + SUPPLIERS.orig.ship,
    etaDays: [lo, hi],
    // Под заказ он старается: репутацией перед постоянным покупателем
    // рисковать невыгодно. Поэтому пали здесь меньше, чем на витрине.
    fakeRate: clamp(trapFakeRate(S) * 0.75, 0.05, 0.3),
    available: m.tier !== 'lux' || S.prog.lvl >= 6,
  };
}

export function requestSupply(S, modelIndex, size, maxCond) {
  const gate = canRequestSupply(S);
  if (!gate.ok) {
    toast(S, gate.why);
    return null;
  }
  const quote = supplyQuote(S, modelIndex, size, maxCond);
  if (!quote.available) {
    toast(S, 'Люкс он возит только своим — нужен 6 уровень');
    return null;
  }
  if (freeSlots(S) < 1) {
    toast(S, 'Шкаф забит');
    return null;
  }
  if (!canPay(S, quote.total)) return null;

  const rng = rngOf(S);
  pay(S, quote.total, `Под заказ: ${quote.model.b} ${quote.model.n}`);
  S.flags.lastSupplyRequest = S.t;

  const real = !rng.chance(quote.fakeRate);
  const item = makeItem(rng, modelIndex, {
    cond: quote.cond,
    size,
    real,
    q: real ? 0 : rng.range(SUPPLIERS.orig.fakeQuality[0], SUPPLIERS.orig.fakeQuality[1]),
    cost: quote.total,
    src: 'Под заказ из Европы',
    hasBox: quote.cond === 0,
    boughtAt: S.t,
  });

  const days = rng.range(quote.etaDays[0], quote.etaDays[1]);
  S.shipments.push({
    id: 'S' + (S.nextShipId = (S.nextShipId || 0) + 1),
    name: `Под заказ: ${quote.model.b} ${quote.model.n}`,
    items: [item],
    start: S.t,
    eta: S.t + Math.round(days * 24),
    fromChina: false,
    replica: false,
  });

  bump(S, 'bought');
  bump(S, 'supplyRequests');
  recordPurchase(S, item);
  advanceMinutes(S, 20);
  checkGoals(S);
  touch(S);

  mentorOnce(
    S,
    'requestTip',
    'Попросил достать конкретную вещь? Вот для чего нужны связи. Это дороже витрины, зато привезут именно то и за несколько дней — Пойзон бы не успел. Только помни: под заказ паль проскакивает чуть чаще.',
  );

  return { total: quote.total, eta: S.t + Math.round(days * 24), model: quote.model };
}

/* ======================= ЛОТЫ ======================= */

export function takeLot(S, th) {
  const lot = th.data.lot;
  if (!lot || th.closed) return null;
  if (freeSlots(S) < lot.items.length) {
    toast(S, `Не влезет: свободно ${freeSlots(S)} мест`);
    return null;
  }
  if (!canPay(S, lot.price)) return null;
  pay(S, lot.price, 'Лот: ' + th.sub);
  const unit = Math.round(lot.price / lot.items.length);
  for (const it of lot.items) {
    it.cost = unit;
    it.src = th.name;
    it.boughtAt = S.t;
    S.items.push(it);
    recordPurchase(S, it);
  }
  say(S, th, 'me', 'Беру.');
  closeThread(S, th, 'Встретились, забрал. Вещи в шкафу.');
  bump(S, 'lotsBought');
  bump(S, 'bought', lot.items.length);
  advanceHours(S, 1);
  checkGoals(S);
  touch(S);
  return { items: lot.items, price: lot.price };
}

export function haggleLot(S, th) {
  const lot = th.data.lot;
  if (!lot || lot.haggled || th.closed) return null;
  lot.haggled = true;
  const rng = rngOf(S);
  const asked = priceRound(lot.price * 0.85);
  say(S, th, 'me', `А за ${rub(asked)} отдашь?`);
  if (rng.chance(0.45 + 0.04 * S.prog.skills.bargain)) {
    lot.price = asked;
    say(S, th, 'them', 'Ладно, давай.');
    touch(S);
    return { ok: true, price: asked };
  }
  say(S, th, 'them', 'Нет, цена окончательная.');
  touch(S);
  return { ok: false };
}

export function declineLot(S, th) {
  say(S, th, 'me', 'Не, не интересно.');
  closeThread(S, th);
  touch(S);
  return true;
}
