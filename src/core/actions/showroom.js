// Жизнь шоурума: люди с улицы и обустройство.
//
// Заход с улицы — единственная продажа без переписки вообще. Человек
// пришёл, померил, забрал. Денег чуть меньше, времени — ноль.

import { rub, clamp } from '../util.js';
import { MODELS } from '../data/models.js';
import { itemName } from '../items.js';
import { FITTING_BY_ID, canBuyFitting, walkInRate, walkInPriceK, hasShowroom } from '../showroom.js';
import { rngOf, pay, notify, toast, touch, newThread, say, closeThread, mentorOnce } from '../kernel.js';
import { makeBuyer, buyerName } from '../people/buyers.js';
import { completeSale } from './selling.js';

/* ======================= ОБУСТРОЙСТВО ======================= */

export function buyFitting(S, id) {
  const check = canBuyFitting(S, id);
  if (!check.ok) {
    toast(S, check.why);
    return null;
  }
  const f = FITTING_BY_ID[id];
  if (S.money < f.price) {
    toast(S, 'Не хватает денег');
    return null;
  }
  pay(S, f.price, 'Шоурум: ' + f.n);
  S.showroom.fittings[id] = S.t;
  mentorOnce(
    S,
    'showroomTip',
    'Шоурум — это не склад, а поток. Чем приличнее место, тем чаще туда заходят с улицы, а зашедшему не надо писать два дня в переписке.',
  );
  touch(S);
  return { name: f.n };
}

/* ======================= ЛЮДИ С УЛИЦЫ ======================= */

/**
 * Кто-то зашёл и сразу забрал вещь.
 * Переписка создаётся и тут же закрывается: вся бухгалтерия сделки,
 * отзывы и возможные претензии работают ровно как в обычной продаже,
 * а в списке чатов она не висит.
 */
export function walkInTick(S, rng) {
  if (!hasShowroom(S)) return;
  if (!rng.chance(walkInRate(S))) return;

  const onSale = S.items.filter((i) => i.sale);
  if (!onSale.length) return;
  // Выбирают глазами: чем ликвиднее вещь, тем вероятнее её снимут с вешалки.
  const item = rng.weighted(onSale, (i) => 0.25 + S.market.h[i.m]);
  const k = walkInPriceK(S);
  const price = Math.round(item.sale.price * k);

  const buyer = makeBuyer(S, rng, item, 'avito', price);
  buyer.agreed = true;
  buyer.price = price;
  buyer.full = false;
  buyer.walkIn = true;
  // Он держит вещь в руках и мерит её на себе. Сбыть паль через витрину
  // проще по времени, но не безопаснее: вблизи видно больше, чем по фото.
  buyer.pressure = 0.3;

  const th = newThread(S, {
    kind: 'buyer',
    name: buyerName(rng),
    sub: itemName(item),
    platform: 'showroom',
    data: { buyer },
  });
  say(S, th, 'system', 'Зашёл в шоурум с улицы');
  say(
    S,
    th,
    'them',
    rng.pick([
      'Померил — сидит. Беру.',
      'Как раз это и искал. Забираю.',
      'Давно присматривался к такой. Наличкой можно?',
      'Друг сказал, у тебя тут нормальные вещи. Беру эту.',
    ]),
  );
  const res = completeSale(S, th);
  if (!res) {
    closeThread(S, th);
    return;
  }
  S.showroom.walkIns = (S.showroom.walkIns || 0) + 1;
  S.showroom.revenue = (S.showroom.revenue || 0) + price;
  notify(S, {
    route: 'shop/showroom',
    title: 'Продажа в шоуруме',
    text: `${itemName(item)} — ${rub(price)}. Забрали прямо с вешалки.`,
  });
  touch(S);
}
