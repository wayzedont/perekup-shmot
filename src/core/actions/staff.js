// Работа помощника: наём, увольнение и то, что он делает сам.
//
// Помощник разбирает переписки, до которых у тебя не дошли руки, и держит
// очередь в секонд. Делает он это хуже тебя — в этом весь смысл выбора:
// руки освобождаются, маржа падает.

import { clamp, rub, priceRound } from '../util.js';
import { MODELS } from '../data/models.js';
import { itemName } from '../items.js';
import { STAFF_BY_ID, hired, canHire, chatsPerHour, HANDOFF_HOURS, blunderChance } from '../staff.js';
import { valueOrig, valueFake, legitCost, daysHeld, buyersPerDay } from '../economy.js';
import { rngOf, pay, notify, toast, touch, say, closeThread, mentorOnce, bump } from '../kernel.js';
import { acceptOffer, counterToBuyer, declineBuyer, completeSale, answerAuth, listItem } from './selling.js';
import { legitCheck, bumpListing } from './items.js';
import { hourIndex } from '../time.js';

/* ======================= НАЁМ ======================= */

export function hire(S, id) {
  const check = canHire(S, id);
  if (!check.ok) {
    toast(S, check.why);
    return null;
  }
  const def = STAFF_BY_ID[id];
  // Первая неделя вперёд: человек выходит не бесплатно.
  if (!canPayWage(S, def.wage)) {
    toast(S, 'Не хватает на первую неделю зарплаты');
    return null;
  }
  pay(S, def.wage, 'Зарплата вперёд: ' + def.n);
  S.staff = { id, since: S.t, sold: 0, blunders: 0, reserved: null };
  mentorOnce(
    S,
    'staffHired',
    'Взял помощника — молодец, но помни: он всегда продаёт дешевле тебя и иногда косячит. Отдавай ему мелочь, а крупные сделки веди сам.',
  );
  touch(S);
  return { name: def.n };
}

function canPayWage(S, wage) {
  return S.money >= wage;
}

export function fire(S) {
  const def = hired(S);
  if (!def) return null;
  S.staff = { id: null, since: 0, sold: 0, blunders: 0, reserved: null };
  touch(S);
  return { name: def.n };
}

/* ======================= ЧАТЫ ПОКУПАТЕЛЕЙ ======================= */

/**
 * Переписки, до которых у игрока руки так и не дошли: последним написал
 * покупатель, и с тех пор прошло несколько часов. Прочитал и не ответил —
 * тоже считается: помощник нужен именно для этого.
 */
function stale(S) {
  return S.threads.filter((th) => {
    if (th.kind !== 'buyer' || th.closed) return false;
    if (!th.data.buyer || th.data.buyer.agreed) return false;
    if (S.t - th.lastAt < HANDOFF_HOURS) return false;
    const last = th.messages[th.messages.length - 1];
    return !!last && last.from === 'them';
  });
}

/**
 * Помощник закрывает одну переписку: соглашается, торгуется или отказывает.
 * Планку он держит свою, более низкую, — отсюда и потеря маржи.
 */
function handleChat(S, rng, def, th) {
  const b = th.data.buyer;
  const item = S.items.find((i) => i.id === b.item);
  if (!item || !item.sale) {
    closeThread(S, th);
    return;
  }
  const ask = item.sale.price;
  const target = Math.round(ask * def.targetShare);
  const floor = Math.round(ask * def.floorShare);
  say(S, th, 'system', `${def.n} ведёт эту переписку`);

  if (b.offer >= target) {
    // Сразу дают столько, сколько он хотел, — берём и не умничаем.
    const res = acceptOffer(S, th);
    if (res && res.state === 'authQuestion') {
      finishAuth(S, rng, def, th, item);
      return;
    }
  } else {
    // Иначе сначала пробует свою цену. В этом и разница между стажёром,
    // который отдаёт за сколько предложили, и управляющим, который держит
    // планку почти как ты.
    const res = counterToBuyer(S, th, priceRound(target));
    if (res && res.state === 'authQuestion') {
      finishAuth(S, rng, def, th, item);
      return;
    }
    if (!res || res.state !== 'agreed') {
      // Не сошлись. Если предложение всё-таки выше его планки — соглашается.
      if (b.offer >= floor && !th.closed) {
        const ok = acceptOffer(S, th);
        if (ok && ok.state === 'authQuestion') {
          finishAuth(S, rng, def, th, item);
          return;
        }
      } else if (!th.closed) {
        declineBuyer(S, th);
        return;
      }
    }
  }
  closeByStaff(S, rng, def, th, item);
}

/** Ответ на вопрос «это точно ориг?» — без твоей смекалки. */
function finishAuth(S, rng, def, th, item) {
  const sure = item.verdict === 'orig';
  const key = sure ? 'sayOrig' : item.verdict === 'fake' ? 'confess' : rng.chance(def.sloppy) ? 'sayOrig' : 'hedge';
  answerAuth(S, th, key);
  const b = th.data.buyer;
  if (b && b.agreed) closeByStaff(S, rng, def, th, item);
}

/**
 * Завершение сделки руками помощника.
 *
 * Если вещь заявлена оригиналом, а он в ней не уверен, то толковый сначала
 * отправит её на легит-чек и не отдаст паль покупателю. Небрежный отдаст
 * не глядя — и это главный риск делегирования: единицу за паль получишь ты,
 * а не он.
 */
function closeByStaff(S, rng, def, th, item) {
  const b = th.data.buyer;
  if (!b || !b.agreed) return;
  const risky = item.sale.asOrig && item.verdict !== 'orig' && !MODELS[item.m].noname;

  if (risky && !rng.chance(blunderChance(S, def))) {
    const cost = legitCost(S, item);
    if (S.money >= cost) legitCheck(S, item);
    if (item.verdict === 'fake') {
      // Проверил, честно сказал и перевыставил как реплику: так вещь
      // остаётся в обороте, а рейтинг — целым.
      say(S, th, 'me', 'Извините, по проверке вещь оказалась не оригиналом. Отменяю сделку.');
      say(S, th, 'them', rng.pick(['Жаль. Ну ладно, спасибо за честность.', 'Понятно. Удачи.']));
      closeThread(S, th);
      listItem(S, item, {
        price: Math.round(valueFake(S, item) * 0.95),
        asOrig: false,
        avito: item.sale.avito,
        tg: item.sale.tg,
      });
      notify(S, {
        route: 'wardrobe/item/' + item.id,
        title: def.n + ' поймал паль',
        text: `${itemName(item)} оказалась репликой. Сделка отменена, вещь перевыставлена честно.`,
      });
      touch(S);
      return;
    }
  }

  const fakeAsOrig = !item.real && item.sale.asOrig;
  const res = completeSale(S, th);
  if (!res) return;
  S.staff.sold++;
  if (fakeAsOrig) {
    S.staff.blunders++;
    notify(S, {
      route: 'shop',
      title: def.n + ' отдал вещь без проверки',
      text: `${itemName(item)} ушла как оригинал. Если покупатель разберётся, единицу получишь ты.`,
    });
  }
}

/* ======================= ОЧЕРЕДЬ В СЕКОНД ======================= */

/**
 * Помощник занимает очередь к открытию и откладывает тебе одну вещь.
 * Чем он толковее, тем вероятнее отложит действительно лучшее.
 */
export function reserveAtSecond(S, rng, treasures) {
  const def = hired(S);
  if (!def || !def.goesToSecond || !treasures.length) return null;
  const idx = rng.chance(def.taste) ? 0 : rng.int(0, treasures.length - 1);
  const slot = treasures[idx];
  slot.reserved = S.t + 10;
  S.staff.reserved = slot.id;
  notify(S, {
    route: 'second',
    title: def.n + ' занял очередь',
    text: `Отложил тебе ${itemName(slot.item)} за ${rub(slot.price)}. Держат до вечера.`,
  });
  return slot;
}

/* ======================= ВИТРИНА ======================= */

/**
 * Ежедневная рутина управляющего: залежавшееся дешевеет, живое поднимается.
 * Руками игрок делает ровно это каждый день — и именно за это стоит платить.
 */
function manageStock(S, rng, def) {
  let touched = 0;
  for (const item of S.items) {
    if (!item.sale || touched >= 4) continue;
    const days = daysHeld(S, item);
    const perDay = buyersPerDay(S, item);

    if (days >= 6) {
      const steps = Math.floor((days - 6) / 4);
      const k = Math.max(0.7, 0.93 - steps * 0.06);
      const base = item.sale.asOrig ? valueOrig(S, item) : valueFake(S, item);
      const target = Math.round(base * k);
      if (target < item.sale.price * 0.97) {
        listItem(S, item, {
          price: target,
          asOrig: item.sale.asOrig,
          avito: item.sale.avito,
          tg: item.sale.tg,
        });
        touched++;
        continue;
      }
    }
    // Поднять живое объявление дешевле, чем держать мёртвые деньги.
    if (item.sale.avito && item.sale.boostUntil <= S.t && days >= 3 && perDay > 0.08) {
      const cost = Math.round(Math.min(1800, Math.max(99, item.sale.price * 0.012)));
      if (S.money > cost * 15) {
        bumpListing(S, item);
        touched++;
      }
    }
  }
  if (touched) touch(S);
}

/* ======================= ЧАСОВОЙ ХОД ======================= */

export function staffTick(S, rng) {
  const def = hired(S);
  if (!def) return;
  if (def.managesStock && hourIndex(S.t) === 11) manageStock(S, rng, def);
  const list = stale(S);
  if (!list.length) return;
  const n = Math.min(chatsPerHour(def), list.length);
  for (let i = 0; i < n; i++) handleChat(S, rng, def, list[i]);
  touch(S);
}
