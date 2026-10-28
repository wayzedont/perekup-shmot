// Разбор одного прогона: куда уходят деньги и время.
// Запуск: node sim/inspect-run.js [стратегия] [дней] [сид]

import { createGame } from '../src/core/engine.js';
import { netWorth, valueOrig, buyersPerDay, capacity, usedSlots } from '../src/core/economy.js';
import { debtTotal } from '../src/core/bank.js';
import { MODELS } from '../src/core/data/models.js';
import { sizeDemand } from '../src/core/data/catalog.js';
import { rub, num, quantiles } from '../src/core/util.js';
import { dayIndex, hourIndex } from '../src/core/time.js';
import { advanceHours, sleep } from '../src/core/tick.js';
import { STRATEGIES, botStep } from './bots.js';

const KEY = process.argv[2] || 'careful';
const DAYS = Number(process.argv[3] || 30);
const SEED = Number(process.argv[4] || 1000);

const S = createGame(SEED);
S.flags.started = 1;
const bot = STRATEGIES[KEY];

const spend = {};
const earned = {};
let lastTx = 0;

function collectTx() {
  // S.tx растёт сверху; берём всё новое.
  const fresh = S.tx.length - lastTx;
  for (let i = 0; i < Math.min(fresh, S.tx.length); i++) {
    const x = S.tx[i];
    const key = x.reason.split(':')[0].trim();
    if (x.amount < 0) spend[key] = (spend[key] || 0) + -x.amount;
    else earned[key] = (earned[key] || 0) + x.amount;
  }
  lastTx = Math.min(S.tx.length, 120);
}

let guard = 0;
const daily = [];
while (dayIndex(S.t) < DAYS && guard++ < DAYS * 40) {
  if (S.flags.bankrupt) break;
  const before = S.t * 60 + S.min;
  botStep(S, bot, null);
  collectTx();
  const after = S.t * 60 + S.min;
  if (after === before) {
    const slept = advanceHours(S, 1);
    if (slept) sleep(S);
  } else if (hourIndex(S.t) === 0) {
    sleep(S);
  }
  const d = dayIndex(S.t);
  if (!daily[d]) {
    daily[d] = {
      day: d,
      nw: Math.round(netWorth(S)),
      money: Math.round(S.money),
      debt: Math.round(debtTotal(S)),
      items: S.items.length,
      listed: S.items.filter((i) => i.sale).length,
      sold: S.stats.sold,
      xp: S.prog.xp,
      lvl: S.prog.lvl,
      reviews: S.rep.reviews.length,
    };
  }
}

console.log(`\nСтратегия: ${bot.name}, сид ${SEED}, ${DAYS} дней\n`);

console.log('  день  капитал    карта     долг  вещей  в прод.  продано  отзывов  опыт  ур.');
for (const d of daily.filter(Boolean)) {
  if (d.day % 3 !== 0 && d.day !== DAYS - 1) continue;
  console.log(
    '  ' +
      String(d.day).padStart(4) +
      String(num(d.nw)).padStart(9) +
      String(num(d.money)).padStart(9) +
      String(num(d.debt)).padStart(9) +
      String(d.items).padStart(7) +
      String(d.listed).padStart(9) +
      String(d.sold).padStart(9) +
      String(d.reviews).padStart(9) +
      String(d.xp).padStart(6) +
      String(d.lvl).padStart(5),
  );
}

console.log('\n  Куда ушли деньги:');
const spendRows = Object.entries(spend).sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [k, v] of spendRows) console.log('    ' + k.padEnd(34) + rub(v).padStart(12));

console.log('\n  Откуда пришли:');
const earnRows = Object.entries(earned).sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [k, v] of earnRows) console.log('    ' + k.padEnd(34) + rub(v).padStart(12));

console.log('\n  Сделки:');
const profits = S.deals.map((d) => d.profit);
if (profits.length) {
  const q = quantiles(profits);
  console.log(`    продано: ${S.deals.length}`);
  console.log(`    прибыль на сделку: мед. ${rub(q.med)}, от ${rub(q.min)} до ${rub(q.max)}`);
  console.log(`    суммарная прибыль: ${rub(profits.reduce((a, b) => a + b, 0))}`);
  const byPlat = S.deals.reduce((m, d) => ((m[d.platform] = (m[d.platform] || 0) + 1), m), {});
  console.log(`    площадки: ${JSON.stringify(byPlat)}`);
  const fakes = S.deals.filter((d) => !d.real).length;
  console.log(`    из них паль: ${fakes}`);
} else {
  console.log('    ни одной');
}

console.log('\n  Что осталось в шкафу:');
for (const it of S.items) {
  const m = MODELS[it.m];
  const days = ((S.t - it.boughtAt) / 24).toFixed(0);
  console.log(
    `    ${m.full.padEnd(28)} ${String(it.size).padEnd(10)} вложено ${rub(it.cost).padStart(10)}  рынок ${rub(
      valueOrig(S, it),
    ).padStart(10)}  лежит ${days} дн  покупателей/день ${it.sale ? buyersPerDay(S, it).toFixed(2) : '—'}  ${
      it.real ? 'ориг' : 'ПАЛЬ'
    }`,
  );
}

console.log(`\n  Итог: капитал ${rub(netWorth(S))}, долг ${rub(debtTotal(S))}, мест ${usedSlots(S)}/${capacity(S)}`);
console.log(`  Смен отработано: ${S.stats.shifts}, осмотров: ${S.stats.inspections}, легит-чеков: ${S.stats.legitChecks}`);
console.log(`  Куплено: ${S.stats.bought}, продано: ${S.stats.sold}, в скупку: ${S.stats.bought - S.stats.sold - S.items.length}`);
console.log('');
