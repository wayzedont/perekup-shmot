// Какое поведение помогает, а какое вредит.
// Отключаем по одной способности и смотрим, что меняется.
// Запуск: node sim/ablation.js [стратегия] [прогонов] [дней]

import { createGame } from '../src/core/engine.js';
import { netWorth } from '../src/core/economy.js';
import { debtTotal } from '../src/core/bank.js';
import { dayIndex, hourIndex } from '../src/core/time.js';
import { advanceHours, sleep } from '../src/core/tick.js';
import { quantiles, rub, num } from '../src/core/util.js';
import { STRATEGIES, botStep } from './bots.js';

const BASE = process.argv[2] || 'smart';
const RUNS = Number(process.argv[3] || 16);
const DAYS = Number(process.argv[4] || 60);

function runWith(bot, days, seed) {
  const S = createGame(seed);
  S.flags.started = 1;
  let guard = 0;
  while (dayIndex(S.t) < days && guard++ < days * 45) {
    if (S.flags.bankrupt) break;
    const before = S.t * 60 + S.min;
    try {
      botStep(S, bot, null);
    } catch (e) {
      return { error: e, S };
    }
    const after = S.t * 60 + S.min;
    if (after === before) {
      if (advanceHours(S, 1)) sleep(S);
    } else if (hourIndex(S.t) === 0) {
      sleep(S);
    }
  }
  return { S };
}

function measure(patch, label) {
  const bot = { ...STRATEGIES[BASE], ...patch };
  const nw = [];
  const sold = [];
  const debt = [];
  let bankrupt = 0;
  let err = null;
  for (let i = 0; i < RUNS; i++) {
    const r = runWith(bot, DAYS, 1000 + i * 7919);
    if (r.error) {
      err = r.error;
      continue;
    }
    nw.push(Math.round(netWorth(r.S)));
    sold.push(r.S.stats.sold);
    debt.push(Math.round(debtTotal(r.S)));
    if (r.S.flags.bankrupt) bankrupt++;
  }
  if (err) console.log('  ОШИБКА: ' + err.message + '\n    ' + (err.stack || '').split('\n')[1]);
  const q = quantiles(nw);
  return { label, med: q.med, q1: q.q1, q3: q.q3, sold: quantiles(sold).med, debt: quantiles(debt).med, bankrupt };
}

const variants = [
  [{}, 'всё включено'],
  [{ usesPro: false }, 'без подписки PRO'],
  [{ sourcesOrders: false }, 'без поиска под заказ'],
  [{ usesSuppliers: false }, 'без поставщиков'],
  [{ usesPoizon: false }, 'без Пойзона'],
  [{ growsChannel: false }, 'без рекламы канала'],
  [{ cutsHard: false }, 'без жёсткой уценки'],
  [{ entersRaffles: false }, 'без раффлов'],
  [{ usesChannel: false }, 'без канала вообще'],
  [{ worksShifts: false }, 'без подработки'],
];

console.log(`\nРазбор стратегии «${STRATEGIES[BASE].name}»: ${RUNS} прогонов × ${DAYS} дней\n`);
const rows = [];
for (const [patch, label] of variants) rows.push(measure(patch, label));

const base = rows[0];
const w = Math.max(...rows.map((r) => r.label.length));
console.log('  ' + 'вариант'.padEnd(w) + '   медиана      25%      75%  продано   долг  банкр.  разница');
console.log('  ' + '─'.repeat(w + 62));
for (const r of rows) {
  const diff = r === base ? '' : (r.med >= base.med ? '+' : '') + num(Math.round(r.med - base.med));
  console.log(
    '  ' +
      r.label.padEnd(w) +
      num(Math.round(r.med)).padStart(10) +
      num(Math.round(r.q1)).padStart(9) +
      num(Math.round(r.q3)).padStart(9) +
      String(Math.round(r.sold)).padStart(9) +
      num(Math.round(r.debt)).padStart(7) +
      (Math.round((r.bankrupt / RUNS) * 100) + '%').padStart(8) +
      diff.padStart(9),
  );
}
console.log('');
