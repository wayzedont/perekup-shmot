// Окупается ли шоурум.
//
// Шоурум — это обмен денег на поток: 180 000 ₽ сразу, 30 000 ₽ в неделю и
// ещё по 45–120 тысяч за каждое вложение в место. Взамен — продажи,
// которые не требуют ни одной переписки. Проверяем, сходится ли размен,
// и не становится ли он печатным станком.
//
// Запуск: node sim/showroom-run.js [прогонов] [дней]

import { createGame } from '../src/core/engine.js';
import { advanceHours, sleep } from '../src/core/tick.js';
import { dayIndex, hourIndex } from '../src/core/time.js';
import { netWorth, valueOrig, ratingOf } from '../src/core/economy.js';
import { makeItem } from '../src/core/items.js';
import { MODELS } from '../src/core/data/models.js';
import { Rng } from '../src/core/rng.js';
import { rub } from '../src/core/util.js';
import { FITTINGS, walkInRate, walkInPriceK, comfort } from '../src/core/showroom.js';
import * as Showroom from '../src/core/actions/showroom.js';
import { buyStorage } from '../src/core/actions/finance.js';
import { listItem, acceptOffer, completeSale } from '../src/core/actions/selling.js';

const RUNS = +(process.argv[2] || 10);
const DAYS = +(process.argv[3] || 35);
const CHATS_PER_DAY = 5;

function shop(seed) {
  const S = createGame(seed);
  S.flags.started = 1;
  S.money = 900000;
  S.prog.lvl = 11;
  S.prog.storage = { rack: 1, wardrobe: 1, closet: 1, warehouse: 1 };
  S.prog.skills = { eye: 7, bargain: 6, sales: 6, smm: 5, logist: 4, conn: 4 };
  for (let i = 0; i < 40; i++) S.rep.reviews.push({ stars: 5, weight: 1, at: 0, platform: 'avito' });
  S.tg = { ...S.tg, has: true, name: 'шмот', subs: 4000, trust: 80, lastPost: 0 };

  const rng = new Rng(S.rng);
  // Склад держим заведомо большим: иначе и пустой, и обустроенный шоурум
  // упрутся в то, что продавать нечего, и разницы между ними не будет видно.
  for (let i = 0; i < 180; i++) {
    const m = rng.weighted(MODELS.filter((x) => !x.noname), (x) => 0.3 + S.market.h[x.i]);
    const item = makeItem(rng, m.i, { cond: rng.int(0, 2), real: true, q: 0, boughtAt: S.t });
    item.cost = Math.max(300, Math.round(valueOrig(S, item) * 0.5));
    item.verdict = 'orig';
    item.src = 'Закупка';
    S.items.push(item);
  }
  return S;
}

function run(seed, mode) {
  const S = shop(seed);
  if (mode !== 'none') {
    buyStorage(S, 'showroom');
    if (mode === 'full') for (const f of FITTINGS) Showroom.buyFitting(S, f.id);
  }
  const spent = 900000 - S.money;
  let guard = 0;
  while (dayIndex(S.t) < DAYS && guard++ < DAYS * 40) {
    for (const it of S.items) {
      if (!it.sale) listItem(S, it, { price: Math.round(it.cost * 2.0), asOrig: true, avito: true, tg: true });
    }
    if (hourIndex(S.t) === 19) {
      const mine = S.threads.filter((t) => t.kind === 'buyer' && !t.closed && t.data.buyer && !t.data.buyer.agreed);
      for (const th of mine.slice(0, CHATS_PER_DAY)) {
        const res = acceptOffer(S, th);
        if (res && res.state === 'agreed') completeSale(S, th);
      }
    }
    if (advanceHours(S, 1)) sleep(S);
  }
  const rent = S.tx.filter((t) => /Аренда/.test(t.reason)).reduce((s, t) => s - t.amount, 0);
  return {
    net: S.stats.profit - rent,
    spent,
    rent,
    sold: S.stats.sold,
    walkIns: S.showroom.walkIns,
    walkRevenue: S.showroom.revenue,
    perDay: walkInRate(S) * 11,
  };
}

const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rows = [];
for (const mode of ['none', 'bare', 'full']) {
  const all = [];
  for (let i = 0; i < RUNS; i++) all.push(run(3000 + i * 7919, mode));
  rows.push({
    name: { none: 'Без шоурума', bare: 'Шоурум пустой', full: 'Шоурум обустроен' }[mode],
    net: Math.round(avg(all.map((r) => r.net))),
    spent: Math.round(avg(all.map((r) => r.spent))),
    rent: Math.round(avg(all.map((r) => r.rent))),
    sold: avg(all.map((r) => r.sold)).toFixed(1),
    walkIns: avg(all.map((r) => r.walkIns)).toFixed(1),
    perDay: avg(all.map((r) => r.perDay)).toFixed(1),
  });
}

console.log(`\nМагазин 11 уровня, ${DAYS} дней, игрок отвечает ${CHATS_PER_DAY} покупателям в день`);
console.log('Чистыми = прибыль со сделок минус аренда и минус вложения в шоурум.\n');
console.log('  Вариант              Чистыми   Вложено    Аренда   Продано   С улицы   Заходят в день');
console.log('  ─────────────────   ────────   ───────   ───────   ───────   ───────   ──────────────');
const base = rows[0].net;
for (const r of rows) {
  const delta = r.net - base;
  console.log(
    '  ' + r.name.padEnd(19) +
      rub(r.net).padStart(10) +
      rub(r.spent).padStart(10) +
      rub(r.rent).padStart(10) +
      r.sold.padStart(10) +
      r.walkIns.padStart(10) +
      r.perDay.padStart(15) +
      (r.name === 'Без шоурума' ? '' : `   (${delta >= 0 ? '+' : ''}${rub(delta)})`),
  );
}
console.log('');
