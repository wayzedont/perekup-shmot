// Продажа: объявления, переписка с покупателем, сцена с вопросом про
// подлинность и разбор претензий.

import { clamp, priceRound, rub, num } from '../util.js';
import { MODELS } from '../data/models.js';
import {
  valueOrig,
  valueFake,
  detectChance,
  buyersPerDay,
  seenItem,
} from '../economy.js';
import { itemName, makeSale, passesAsOrig } from '../items.js';
import { recordDeal } from '../notebook.js';
import {
  counterOffer,
  reactToAuthAnswer,
  authQuestion,
  AUTH_ANSWERS,
  BUYER_TYPES,
  fastReplyBonus,
  waitedTooLong,
  expectedStars,
  reviewText,
} from '../people/buyers.js';
import { postItem, scandal } from '../channel.js';
import {
  rngOf,
  pay,
  earn,
  canPay,
  notify,
  toast,
  touch,
  bump,
  say,
  closeThread,
  mentorOnce,
  mentorSay,
  addReview,
  schedule,
  dropItem,
  closeBuyersOf,
  installed,
  fx,
} from '../kernel.js';
import { checkBan, onLevelUp } from '../tick.js';
import { checkGoals } from '../progression.js';

/* ======================= ОБЪЯВЛЕНИЕ ======================= */

export function priceSuggestions(S, item, asOrig) {
  const seen = seenItem(item);
  const base = asOrig ? valueOrig(S, seen) : valueFake(S, seen);
  return {
    base,
    quick: priceRound(base * 0.86),
    market: priceRound(base),
    greedy: priceRound(base * 1.18),
  };
}

export function listItem(S, item, { price, asOrig, avito, tg }) {
  if (price < 50) {
    toast(S, 'Укажи цену');
    return null;
  }
  if (!avito && !tg) {
    toast(S, 'Выбери хотя бы одну площадку');
    return null;
  }
  if (avito && (S.rep.banUntil > S.t || !installed(S, 'avito'))) avito = false;
  if (tg && !S.tg.has) tg = false;
  if (!avito && !tg) {
    toast(S, 'Выставить негде: Авитка заблокирована или не скачана, канала нет');
    return null;
  }

  const hadTg = item.sale && item.sale.tg;
  const oldPrice = item.sale ? item.sale.price : 0;
  // Ориг стал репликой или наоборот — это другое объявление: договорённость
  // о цене оригинала не может перейти на реплику.
  if (item.sale && item.sale.asOrig !== asOrig) closeBuyersOf(S, item, null, 'Объявление изменено');
  if (item.sale) {
    item.sale.price = price;
    item.sale.asOrig = asOrig;
    item.sale.avito = avito;
    item.sale.tg = tg;
  } else {
    item.sale = makeSale(S, { price, asOrig, avito, tg });
    item.sale.photo = item.photo;
  }
  // В канал постим заново не только при первом выставлении, но и когда
  // снизил цену: пост в ленте стареет, а снижение — это новость.
  if (tg && (!hadTg || price < oldPrice * 0.97)) postItem(S, item);

  // Покупатели, которым площадка больше не подходит, уходят.
  for (const th of S.threads) {
    if (th.kind !== 'buyer' || th.closed || !th.data.buyer) continue;
    if (th.data.buyer.item !== item.id) continue;
    const gone = (th.platform === 'avito' && !avito) || (th.platform === 'tg' && !tg);
    // Учебного покупателя не прогоняем, пока идёт глава: на нём держится сценарий.
    const keep = th.data.buyer.tut && S.tut && S.tut.active;
    if (gone && !keep) closeThread(S, th, 'Объявление снято');
    else if (!th.data.buyer.agreed && price < th.data.buyer.offer) th.data.buyer.offer = price;
  }

  checkGoals(S);
  touch(S);
  return true;
}

export function unlist(S, item) {
  if (item.tut && S.tut && S.tut.active) {
    toast(S, 'Тимур: не снимай — клиент уже ищет.');
    return null;
  }
  item.sale = null;
  closeBuyersOf(S, item, null, 'Объявление снято');
  return true;
}

export function repostToChannel(S, item) {
  if (!item.sale || !item.sale.tg) return null;
  postItem(S, item);
  touch(S);
  return true;
}

/** Подсказка под ценой: сколько покупателей ждать и дорого ли это. */
export function saleHint(S, item, price, asOrig, avito, tg) {
  const seen = seenItem(item);
  const probe = {
    ...seen,
    sale: {
      price,
      asOrig,
      avito,
      tg,
      listedAt: S.t,
      bumpedAt: S.t,
      boostUntil: 0,
      postedAt: S.t,
      views: 0,
      photo: item.photo,
      description: false,
    },
  };
  const perDay = buyersPerDay(S, probe);
  const base = asOrig ? valueOrig(S, seen) : valueFake(S, seen);
  const ratio = price / Math.max(1, base);
  const verdict = ratio > 1.1 ? 'дорого' : ratio < 0.88 ? 'дёшево, уйдёт быстро' : 'в рынке';
  const days = perDay > 0.02 ? Math.round(1 / perDay) : null;
  return {
    perDay,
    verdict,
    ratio,
    profit: price - item.cost,
    etaDays: days,
    etaText:
      perDay < 0.05
        ? 'почти не пишут'
        : days > 30
          ? 'больше месяца'
          : `примерно ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`,
  };
}

/* ======================= ПЕРЕПИСКА С ПОКУПАТЕЛЕМ ======================= */

function buyerItem(S, th) {
  return S.items.find((i) => i.id === th.data.buyer.item);
}

/** Общая проверка: не ушёл ли покупатель, пока игрок тянул. */
function checkLate(S, th) {
  const rng = rngOf(S);
  const b = th.data.buyer;
  // Учебный покупатель дождётся, сколько бы игрок ни тянул. Бросок всё равно
  // делаем, чтобы обучение не сдвигало случайности всей дальнейшей игры.
  const late = waitedTooLong(S, rng, b);
  if (late && !b.tut) {
    say(
      S,
      th,
      'them',
      rng.pick([
        'Долго отвечаешь, я уже взял в другом месте.',
        'Ждал больше суток — уже купил другое.',
        'Сорри, уже неактуально.',
      ]),
    );
    closeThread(S, th);
    toast(S, 'Покупатель не дождался ответа');
    touch(S);
    return true;
  }
  S.streak.answeredToday = true;
  b.lastAt = S.t;
  return false;
}

/** Нужно ли задать вопрос про подлинность перед сделкой. */
function shouldAskAuth(S, rng, th, item) {
  const b = th.data.buyer;
  if (b.asked.auth || b.noAuth) return false;
  if (!item.sale.asOrig) return false;
  const T = BUYER_TYPES[b.type];
  return rng.chance(T.askAuth);
}

export function acceptOffer(S, th) {
  const item = buyerItem(S, th);
  if (!item || !item.sale) {
    toast(S, 'Вещь уже не в продаже');
    return null;
  }
  if (checkLate(S, th)) return null;
  const rng = rngOf(S);
  const b = th.data.buyer;
  const bonus = fastReplyBonus(S, b);
  b.fast = bonus.starBonus;
  say(S, th, 'me', `Согласен на ${rub(b.offer)}`);

  if (shouldAskAuth(S, rng, th, item)) {
    b.asked.auth = true;
    b.pendingPrice = b.offer;
    say(S, th, 'them', authQuestion(rng, b, item));
    touch(S);
    return { state: 'authQuestion' };
  }

  b.agreed = true;
  b.price = b.offer;
  say(
    S,
    th,
    'them',
    th.platform === 'tg' ? 'Супер, кидай реквизиты, переведу.' : 'Отлично, оформляю через доставку!',
  );
  touch(S);
  return { state: 'agreed', price: b.price };
}

export function counterToBuyer(S, th, amount) {
  const item = buyerItem(S, th);
  if (!item) return null;
  if (amount < 50) {
    toast(S, 'Введи цену');
    return null;
  }
  const rng = rngOf(S);
  const b = th.data.buyer;
  say(S, th, 'me', `Могу за ${rub(amount)}`);
  if (checkLate(S, th)) return null;

  const res = counterOffer(rng, b, amount);
  say(S, th, 'them', res.reply);
  if (res.state === 'left') {
    closeThread(S, th);
    touch(S);
    return res;
  }
  if (res.state === 'agreed') {
    if (shouldAskAuth(S, rng, th, item)) {
      b.asked.auth = true;
      b.pendingPrice = res.price;
      b.agreed = false;
      say(S, th, 'them', authQuestion(rng, b, item));
      touch(S);
      return { state: 'authQuestion' };
    }
  }
  touch(S);
  return res;
}

export function declineBuyer(S, th) {
  if (th.data.buyer && th.data.buyer.tut && S.tut && S.tut.active) {
    toast(S, 'Тимур: не отказывай, это мой клиент. Поторгуйся.');
    return null;
  }
  const rng = rngOf(S);
  say(S, th, 'me', 'Нет, спасибо');
  say(S, th, 'them', rng.pick(['Ну как хотите', 'Ок, удачи']));
  closeThread(S, th);
  touch(S);
  return true;
}

/** Варианты ответа на вопрос про подлинность. */
export function authOptions(S, th) {
  const item = buyerItem(S, th);
  if (!item) return [];
  const hasProof = item.legitDone && item.verdict === 'orig';
  const keys = [];
  // Есть чек — есть что прислать, и врать про него больше незачем: вариант
  // «клянусь, чек делал» из лжи превращается в правду, поэтому вместо него
  // стоит сам чек.
  if (hasProof) keys.push('proof');
  else keys.push('swearOrig');
  keys.push('sayOrig', 'hedge');
  // Признаться можно только если это и правда реплика или есть сомнения.
  if (item.verdict === 'fake' || item.verdict === 'unknown') keys.push('confess');
  return keys.map((k) => ({ key: k, ...AUTH_ANSWERS[k] }));
}

export function answerAuth(S, th, key) {
  const item = buyerItem(S, th);
  if (!item || !item.sale) return null;
  const rng = rngOf(S);
  const b = th.data.buyer;
  const A = AUTH_ANSWERS[key];
  if (!A) return null;

  say(S, th, 'me', A.said || A.n);
  const hasProof = item.legitDone && item.verdict === 'orig';
  const res = reactToAuthAnswer(rng, b, key, item, hasProof);
  say(S, th, 'them', res.reply);
  item.sale.pressure = Math.max(item.sale.pressure || 0, b.pressure);

  if (res.leaves) {
    if (res.burned) {
      // Соврал про чек параноику — он расскажет об этом в отзывах.
      say(S, th, 'them', 'И да, я напишу в отзыве, что вы врёте про легит-чек.');
      addReview(
        S,
        {
          stars: 2,
          weight: 2,
          text: 'Врёт про легит-чек, которого нет. Будьте осторожны.',
          platform: th.platform,
          tierKey: MODELS[item.m].tier,
        },
        (lvl) => onLevelUp(S, lvl),
      );
    }
    closeThread(S, th);
    touch(S);
    return { state: 'left' };
  }

  if (res.convertToReplica) {
    const fair = priceRound(valueFake(S, item) * rng.range(0.95, 1.1));
    b.price = Math.min(b.pendingPrice || item.sale.price, fair);
    b.agreed = true;
    b.asReplica = true;
    item.sale.asOrig = false;
    say(S, th, 'me', `Тогда ${rub(b.price)}.`);
    say(S, th, 'them', 'Беру.');
    touch(S);
    return { state: 'agreed', price: b.price, asReplica: true };
  }

  let price = b.pendingPrice || item.sale.price;
  if (res.discount) price = priceRound(price * (1 - res.discount));
  b.price = price;
  b.agreed = true;
  touch(S);
  return { state: 'agreed', price };
}

/** Есть ли что прислать покупателю прямо сейчас, не дожидаясь вопроса. */
export function canShowProof(S, th) {
  const item = buyerItem(S, th);
  const b = th.data.buyer;
  if (!item || !item.sale || !item.sale.asOrig || !b || b.agreed || b.asked.auth) return false;
  return item.legitDone && item.verdict === 'orig';
}

/**
 * Прислать чек первым. Параноик спрашивает про чек в первом же сообщении,
 * а кнопка с ним появлялась только после «согласен» — когда он задаёт
 * вопрос второй раз. Чек, присланный заранее, снимает вопрос совсем.
 */
export function showProof(S, th) {
  if (!canShowProof(S, th)) return null;
  const rng = rngOf(S);
  const b = th.data.buyer;
  const item = buyerItem(S, th);
  say(S, th, 'me', AUTH_ANSWERS.proof.said);
  say(
    S,
    th,
    'them',
    rng.pick(['О, с чеком — другое дело.', 'Вижу проверку, вопросов нет.', 'Отлично, что проверено.']) +
      ` ${rub(b.offer)} в силе.`,
  );
  b.asked.auth = true;
  b.proofShown = true;
  b.pressure = clamp(b.pressure + AUTH_ANSWERS.proof.pressure, -1, 1);
  touch(S);
  return true;
}

/* ======================= ЗАВЕРШЕНИЕ СДЕЛКИ ======================= */

export function completeSale(S, th) {
  const item = buyerItem(S, th);
  if (!item || !item.sale) {
    toast(S, 'Вещь уже не в продаже');
    return null;
  }
  const b = th.data.buyer;
  if (!b.agreed) return null;
  const rng = rngOf(S);
  const m = MODELS[item.m];
  const platform = th.platform;
  const bonus = fastReplyBonus(S, b);
  const price = Math.round(b.price * bonus.priceK);
  const asOrig = item.sale.asOrig;
  const fakeAsOrig = !passesAsOrig(item) && asOrig;
  const hiddenDefect = item.defects.length > 0 && !item.condSeen;

  const deal = {
    id: 'D' + (S.nextDealId = (S.nextDealId || 0) + 1),
    label: itemName(item),
    size: item.size,
    cost: item.cost,
    price,
    profit: price - item.cost,
    platform,
    at: S.t,
    asOrig,
    real: item.real,
    fakeAsOrig,
    // Что игрок знал о вещи в момент продажи: экран итога не должен
    // выдавать правду, которой у него не было.
    knownFake: item.verdict === 'fake',
    unchecked: item.verdict === 'unknown' && !m.noname,
    src: item.src,
    buyer: th.name,
    tierKey: m.tier,
    itemSnapshot: JSON.parse(JSON.stringify({ ...item, sale: null })),
  };
  S.deals.unshift(deal);
  if (S.deals.length > 200) S.deals.length = 200;
  // Первая продажа — начало истории в Хронике; список сделок со временем обрезается.
  if (!S.firstDeal) S.firstDeal = { label: deal.label, price: deal.price, profit: deal.profit, at: deal.at };

  bump(S, 'sold');
  fx('sale');
  S.stats.revenue += price;
  S.stats.profit += deal.profit;
  S.stats.bestDeal = Math.max(S.stats.bestDeal, deal.profit);
  if (m.tier === 'lux') bump(S, 'luxSold');
  if (fakeAsOrig) bump(S, 'fakeAsOrig');
  recordDeal(S, item, deal.profit);

  dropItem(S, item, th);
  say(
    S,
    th,
    'system',
    platform === 'avito'
      ? 'Отправлено Авитка Доставкой. Деньги придут после получения.'
      : platform === 'showroom'
        ? `Забрал из шоурума, заплатил ${rub(price)} на месте.`
        : `Покупатель перевёл ${rub(price)}. Отправлено СДЭКом.`,
  );
  closeThread(S, th);

  const payoutAt = S.t + rng.int(20, 40);
  if (platform === 'avito') {
    schedule(S, payoutAt, 'payout', { dealId: deal.id, amount: price, label: deal.label });
  } else if (platform === 'showroom') {
    // Наличкой на месте: за это шоурум и держат.
    earn(S, price, 'Шоурум: ' + deal.label);
  } else {
    earn(S, price, 'Телега: ' + deal.label);
  }

  const after = platform === 'avito' ? payoutAt : S.t + rng.int(24, 48);

  // Последствия.
  if (fakeAsOrig && rng.chance(detectChance(S, item, item.sale ? item.sale.pressure : b.pressure))) {
    if (platform === 'avito' && rng.chance(0.5)) {
      schedule(S, payoutAt - rng.int(2, 8), 'dispute', { dealId: deal.id });
    } else {
      schedule(S, after + rng.int(12, 110), 'claim', { dealId: deal.id, platform });
    }
  } else if (platform === 'avito' && rng.chance(0.04)) {
    schedule(S, payoutAt - 1, 'sizeReturn', { dealId: deal.id });
  } else {
    // Сюда попадаем, когда покупатель ничего не заподозрил: претензий нет,
    // отзыв обычный. Пойманный обман разбирается веткой выше.
    const stars = expectedStars(rng, {
      honest: true,
      asReplica: !asOrig,
      fast: b.fast,
      hadDefectHidden: hiddenDefect,
    });
    schedule(S, after + rng.int(2, 20), 'review', {
      stars,
      text: reviewText(rng, stars, { asReplica: !asOrig, hadDefectHidden: hiddenDefect }),
      platform,
      tierKey: m.tier,
    });
  }

  if (platform === 'tg') {
    S.tg.trust = clamp(S.tg.trust + (asOrig ? 1 : -2), 0, 100);
  }

  mentorOnce(
    S,
    'firstSale',
    deal.profit > 0
      ? 'Первая продажа! Красава. Деньги не держи на карте — сразу пускай в оборот.'
      : 'Первая продажа, пусть и в минус. Бывает. Главное — понять, почему.',
  );

  checkGoals(S);
  touch(S);
  return { deal, bonus: bonus.label };
}

/* ======================= ФИШИНГ ======================= */

export function phishingFollow(S, th) {
  const rng = rngOf(S);
  const loss = Math.min(Math.max(S.money, 0), rng.int(5, 15) * 1000);
  pay(S, loss, 'Списание: avitka-dostavka-pay.ru');
  say(S, th, 'me', 'Ввёл данные карты');
  say(S, th, 'system', `С карты списали ${rub(loss)}. Это был фишинг.`);
  closeThread(S, th);
  bump(S, 'scammed');
  mentorSay(
    S,
    'Тебя развели по ссылке. Запомни раз и навсегда: Авитка никогда не просит вводить карту, чтобы ПОЛУЧИТЬ деньги. Покупатель с такой ссылкой — всегда мошенник.',
  );
  touch(S);
  return { loss };
}

export function phishingBlock(S, th) {
  say(S, th, 'me', 'Это развод. Блокирую.');
  say(S, th, 'system', 'Пользователь заблокирован');
  closeThread(S, th);
  if (!S.flags.phishBlocked) {
    S.flags.phishBlocked = 1;
    mentorSay(S, 'Молодец, что не повёлся. Таких по весне особенно много.');
  }
  touch(S);
  return true;
}

/* ======================= ПРЕТЕНЗИИ ======================= */

export function refundClaim(S, th) {
  const deal = S.deals.find((d) => d.id === th.data.dealId);
  if (!deal) return null;
  if (!canPay(S, deal.price)) return null;
  pay(S, deal.price, 'Возврат денег: ' + deal.label);
  S.stats.profit -= deal.price;
  bump(S, 'refunds');
  bump(S, 'caught');
  say(S, th, 'me', 'Ладно, возвращаю деньги. Отправь вещь обратно.');
  say(S, th, 'them', 'Ок, отправил.');
  addReview(
    S,
    {
      stars: 2,
      weight: 2,
      text: 'Продал паль под видом оригинала. Деньги вернул, но осадочек остался.',
      platform: th.platform,
      tierKey: deal.tierKey,
    },
    (lvl) => onLevelUp(S, lvl),
  );
  schedule(S, S.t + 48, 'itemReturn', { item: deal.itemSnapshot });
  if (th.platform === 'tg') S.tg.trust = clamp(S.tg.trust - 5, 0, 100);
  closeThread(S, th);
  mentorOnce(S, 'claimTip', 'Вернул деньги — правильно. Рейтинг просел, но не в ноль. Отказ стоил бы втрое дороже.');
  touch(S);
  return { refunded: deal.price };
}

export function refuseClaim(S, th) {
  const deal = S.deals.find((d) => d.id === th.data.dealId);
  say(S, th, 'me', 'Ничего не верну. Ориг всё.');
  say(S, th, 'them', 'Ясно. Жди отзыв и жалобу, мошенник.');
  bump(S, 'caught');
  addReview(
    S,
    {
      stars: 1,
      weight: 3,
      text: 'МОШЕННИК! Продал паль как оригинал и отказался вернуть деньги.',
      platform: th.platform,
      tierKey: deal ? deal.tierKey : 'street',
    },
    (lvl) => onLevelUp(S, lvl),
  );
  if (th.platform === 'avito') {
    S.rep.complaints++;
    checkBan(S);
  } else {
    const lost = scandal(S);
    notify(S, { route: 'tg', title: 'Скандал в канале', text: `Отписались ${num(lost)} человек` });
  }
  closeThread(S, th);
  mentorOnce(
    S,
    'claimTip',
    'Отказал покупателю? Единица в отзывах весит как три пятёрки. Ещё пара таких — и с тобой никто работать не будет.',
  );
  touch(S);
  return true;
}
