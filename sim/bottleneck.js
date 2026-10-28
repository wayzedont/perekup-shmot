// Что именно упирается в плато: место в шкафу, деньги или спрос.
// Запуск: node sim/bottleneck.js [стратегия] [дней] [сид]

import { createGame } from '../src/core/engine.js';
import {
  netWorth,
  capacity,
  usedSlots,
  freeSlots,
  buyersPerDay,
  bookValue,
  ratingOf,
} from '../src/core/economy.js';
import { debtTotal, available } from '../src/core/bank.js';
import { dayIndex, hourIndex } from '../src/core/time.js';
import { advanceHours, sleep } from '../src/core/tick.js';
import { rub, num, quantiles } from '../src/core/util.js';
import { STRATEGIES, botStep } from './bots.js';

const KEY = process.argv[2] || 'smart';
const DAYS = Number(process.argv[3] || 90);
const SEED = Number(process.argv[4] || 1000);

const S = createGame(SEED);
S.flags.started = 1;
const bot = STRATEGIES[KEY];

const log = [];
let guard = 0;
let lastDay = -1;

while (dayIndex(S.t) < DAYS && guard++ < DAYS * 45) {
  if (S.flags.bankrupt) break;
  const before = S.t * 60 + S.min;
  botStep(S, bot, null);
  const after = S.t * 60 + S.min;
  if (after === before) {
    if (advanceHours(S, 1)) sleep(S);
  } else if (hourIndex(S.t) === 0) {
    sleep(S);
  }
  const d = dayIndex(S.t);
  if (d !== lastDay) {
    lastDay = d;
    const listed = S.items.filter((i) => i.sale);
    log.push({
      day: d,
      nw: Math.round(netWorth(S)),
      cash: Math.round(S.money),
      stock: Math.round(S.items.reduce((a, i) => a + bookValue(S, i), 0)),
      slots: usedSlots(S) + '/' + capacity(S),
      free: freeSlots(S),
      listed: listed.length,
      demand: +listed.reduce((a, i) => a + buyersPerDay(S, i), 0).toFixed(2),
      subs: S.tg.subs,
      lvl: S.prog.lvl,
      eye: S.prog.skills.eye,
      credit: Math.round(available(S)),
      debt: Math.round(debtTotal(S)),
      rating: ratingOf(S),
      sold: S.stats.sold,
      orders: S.stats.ordersDone,
      clients: S.clients.filter((c) => c.status === 'regular' || c.status === 'vip').length,
    });
  }
}

console.log(`\nУзкое место: «${bot.name}», сид ${SEED}, ${DAYS} дней\n`);
console.log(
  '  день  капитал    карта    товар  места  св.  в прод.  спрос/д  подп.  ур.  глаз  кредит    долг  рейт  продано  заказы  клиенты',
);
for (const r of log) {
  if (r.day % 5 !== 0) continue;
  console.log(
    '  ' +
      String(r.day).padStart(4) +
      num(r.nw).padStart(9) +
      num(r.cash).padStart(9) +
      num(r.stock).padStart(9) +
      String(r.slots).padStart(7) +
      String(r.free).padStart(5) +
      String(r.listed).padStart(9) +
      String(r.demand).padStart(9) +
      num(r.subs).padStart(7) +
      String(r.lvl).padStart(5) +
      String(r.eye).padStart(6) +
      num(r.credit).padStart(8) +
      num(r.debt).padStart(8) +
      String(r.rating === null ? '—' : r.rating.toFixed(1)).padStart(6) +
      String(r.sold).padStart(9) +
      String(r.orders).padStart(8) +
      String(r.clients).padStart(9),
  );
}

/* Чего не хватало чаще всего */
const half = log.slice(Math.floor(log.length / 3));
const noSlots = half.filter((r) => r.free <= 1).length;
const noCash = half.filter((r) => r.cash < 3000 && r.credit < 2000).length;
const lowDemand = half.filter((r) => r.listed > 0 && r.demand / r.listed < 0.15).length;
const idleCash = half.filter((r) => r.cash > 25000 && r.free > 3).length;

console.log('\n  Во второй половине прогона (' + half.length + ' дней):');
console.log('    дней без места в шкафу:     ' + noSlots + ' (' + Math.round((noSlots / half.length) * 100) + '%)');
console.log('    дней без денег и кредита:   ' + noCash + ' (' + Math.round((noCash / half.length) * 100) + '%)');
console.log('    дней со слабым спросом:     ' + lowDemand + ' (' + Math.round((lowDemand / half.length) * 100) + '%)');
console.log('    дней с лежачими деньгами:   ' + idleCash + ' (' + Math.round((idleCash / half.length) * 100) + '%)');

const last = log[log.length - 1] || {};
console.log(
  `\n  Итог: капитал ${rub(last.nw || 0)}, уровень ${last.lvl}, глаз ${last.eye}, подписчиков ${num(last.subs || 0)}, ` +
    `постоянных клиентов ${last.clients}, заказов ${last.orders}, продано ${last.sold}`,
);
console.log('');
