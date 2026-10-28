// Цели.
//
// Денег за цели больше не дают: в прототипе они выдавали по пять тысяч ровно
// тогда, когда ранний баланс этого не переживал. Вместо денег — возможности:
// доступ к поставщику, скидка в легит-сервисе, место под вещи, контакты.

import { netWorth, capacity } from './economy.js';
import { loyalCount } from './people/clients.js';
import { studiedCount } from './notebook.js';
import { debtTotal } from './bank.js';

/**
 * reward: { unlock } — что открывается, { skill } — очко навыка.
 * Ни одна цель не выдаёт деньги напрямую.
 */
export const GOALS = [
  {
    id: 'sell1',
    n: 'Продай первую вещь',
    hint: 'Выстави что-нибудь из шкафа на Авитку',
    check: (S) => S.stats.sold >= 1,
  },
  {
    id: 'inspect5',
    n: 'Осмотри 5 вещей',
    hint: 'Осмотр по признакам — в карточке вещи',
    check: (S) => S.stats.inspections >= 5,
  },
  {
    id: 'legit1',
    n: 'Сделай первый легит-чек',
    check: (S) => S.stats.legitChecks >= 1,
  },
  {
    id: 'second1',
    n: 'Купи вещь в секонде',
    check: (S) => S.stats.secondBuys >= 1,
  },
  {
    id: 'defect1',
    n: 'Найди скрытый дефект до покупки',
    hint: 'Осмотри состояние на встрече у метро',
    check: (S) => S.stats.defectsFound >= 1,
    reward: { unlock: 'legitDiscount' },
  },
  {
    id: 'channel',
    n: 'Заведи свой канал в Телеге',
    check: (S) => S.tg.has,
  },
  {
    id: 'profit10k',
    n: 'Заработай 10 000 ₽ прибыли',
    check: (S) => S.stats.profit >= 10000,
    reward: { unlock: 'slotBonus' },
  },
  {
    id: 'meet1',
    n: 'Купи вещь на встрече у метро',
    check: (S) => S.stats.meetings >= 1,
  },
  {
    id: 'poizon1',
    n: 'Закажи вещь на Пойзоне',
    check: (S) => S.stats.poizonOrders >= 1,
  },
  {
    id: 'sold10',
    n: 'Продай 10 вещей',
    check: (S) => S.stats.sold >= 10,
    reward: { unlock: 'supplierRep' },
  },
  {
    id: 'subs100',
    n: '100 подписчиков в канале',
    check: (S) => S.tg.subs >= 100,
    reward: { unlock: 'proTrial' },
  },
  {
    id: 'order1',
    n: 'Выполни заказ подписчика',
    check: (S) => S.stats.ordersDone >= 1,
  },
  {
    id: 'lot1',
    n: 'Купи лот в личке',
    check: (S) => S.stats.lotsBought >= 1,
  },
  {
    id: 'study3',
    n: 'Изучи 3 модели в записной книжке',
    hint: 'Проверяй подлинность — книжка запоминает, по чему палится модель',
    check: (S) => studiedCount(S) >= 3,
    reward: { unlock: 'fastLegit' },
  },
  {
    id: 'rating48',
    n: 'Рейтинг 4.8 и хотя бы 10 отзывов',
    check: (S, ctx) => S.rep.reviews.length >= 10 && ctx.rating !== null && ctx.rating >= 4.8,
    reward: { unlock: 'showcase' },
  },
  {
    id: 'loyal3',
    n: 'Трое постоянных клиентов',
    check: (S) => loyalCount(S) >= 3,
    reward: { unlock: 'insiderLots' },
  },
  {
    id: 'raffle0',
    n: 'Запишись на раффл',
    check: (S) => !!(S.raffle && S.raffle.entered) || S.stats.rafflesWon > 0,
  },
  {
    id: 'ad1',
    n: 'Купи рекламу своего канала',
    check: (S) => S.stats.adsBought >= 1,
  },
  {
    id: 'nw100k',
    n: 'Капитал 100 000 ₽',
    check: (S, ctx) => ctx.nw >= 100000,
    reward: { skill: 1 },
  },
  {
    id: 'bulk1',
    n: 'Возьми партию от 5 штук',
    check: (S) => S.stats.bulkOrders >= 1,
  },
  {
    id: 'dispute1',
    n: 'Выиграй спор на Авитке',
    hint: 'Проверь вещь в первые 24 часа после получения',
    check: (S) => S.stats.disputesWon >= 1,
  },
  {
    id: 'subs1k',
    n: '1 000 подписчиков',
    check: (S) => S.tg.subs >= 1000,
  },
  {
    id: 'study10',
    n: 'Изучи 10 моделей',
    check: (S) => studiedCount(S) >= 10,
    reward: { skill: 1 },
  },
  {
    id: 'raffleWin',
    n: 'Выиграй раффл',
    check: (S) => S.stats.rafflesWon >= 1,
  },
  {
    id: 'lux1',
    n: 'Продай вещь из люкса',
    check: (S) => S.stats.luxSold >= 1,
  },
  {
    id: 'orders10',
    n: 'Выполни 10 заказов клиентов',
    check: (S) => S.stats.ordersDone >= 10,
    reward: { skill: 1 },
  },
  {
    id: 'nw500k',
    n: 'Капитал 500 000 ₽',
    check: (S, ctx) => ctx.nw >= 500000,
  },
  {
    id: 'vip1',
    n: 'Доведи клиента до статуса «свой»',
    check: (S) => S.clients.some((c) => c.status === 'vip'),
  },
  {
    id: 'sold50',
    n: 'Продай 50 вещей',
    check: (S) => S.stats.sold >= 50,
  },
  {
    id: 'debtFree',
    n: 'Закрой кредит досрочно',
    check: (S) => S.credit.paidClean >= 1,
  },
  {
    id: 'beatRival',
    n: `Обгони Мирона по капиталу`,
    check: (S, ctx) => ctx.nw > S.rival.nw,
  },
  {
    id: 'showroom',
    n: 'Открой шоурум',
    check: (S) => !!S.prog.storage.showroom,
  },
  {
    id: 'nw1m',
    n: 'Капитал 1 000 000 ₽',
    check: (S, ctx) => ctx.nw >= 1000000,
  },
  {
    id: 'top1',
    n: 'Стань первым среди перекупов Москвы',
    check: (S, ctx) => ctx.rank === 1,
  },
  {
    id: 'brand',
    n: 'Запусти свой бренд',
    check: (S) => !!S.flags.brand,
  },
];

export const GOALS_BY_ID = Object.fromEntries(GOALS.map((g) => [g.id, g]));

export function openGoals(S) {
  return GOALS.filter((g) => !S.goals[g.id]);
}

export function doneGoals(S) {
  return GOALS.filter((g) => S.goals[g.id]);
}

export function nextGoal(S) {
  return openGoals(S)[0] || null;
}
