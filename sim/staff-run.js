// Сколько стоит помощник и сколько он приносит.
//
// Мерить его на обычных ботах бесполезно: они и так отвечают всем сразу,
// поэтому помощнику нечего делать. Смысл он имеет для того, у кого
// переписок больше, чем рук, — такого игрока здесь и моделируем:
// крупный склад, всё выставлено, в чаты игрок заходит редко.
//
// Запуск: node sim/staff-run.js [прогонов] [дней]

import { createGame } from '../src/core/engine.js';
import { advanceHours, sleep } from '../src/core/tick.js';
import { dayIndex, hourIndex } from '../src/core/time.js';
import { netWorth, freeSlots, ratingOf, valueOrig } from '../src/core/economy.js';
import { makeItem } from '../src/core/items.js';
import { MODELS } from '../src/core/data/models.js';
import { Rng } from '../src/core/rng.js';
import { rub } from '../src/core/util.js';
import { STAFF } from '../src/core/staff.js';
import * as Staff from '../src/core/actions/staff.js';
import { listItem } from '../src/core/actions/selling.js';
import { acceptOffer, completeSale } from '../src/core/actions/selling.js';

const RUNS = +(process.argv[2] || 8);
const DAYS = +(process.argv[3] || 28);

/** Магазин поздней игры: уровень, склад, рейтинг, канал и полный шкаф. */
function endgameShop(seed) {
  const S = createGame(seed);
  S.flags.started = 1;
  S.money = 600000;
  S.prog.lvl = 13;
  S.prog.storage = { rack: 1, wardrobe: 1, closet: 1, warehouse: 1 };
  S.prog.skills = { eye: 7, bargain: 6, sales: 6, smm: 5, logist: 4, conn: 4 };
  for (let i = 0; i < 40; i++) S.rep.reviews.push({ stars: 5, weight: 1, at: 0, platform: 'avito' });
  S.tg = { ...S.tg, has: true, name: 'шмот', subs: 4000, trust: 80, lastPost: 0 };

  // Полный склад, как у живого магазина: большая часть проверена, но треть
  // лежит непроверенной, и половина из неё — паль. Именно на этой трети
  // и видно, чем аккуратный помощник отличается от небрежного.
  const rng = new Rng(S.rng);
  for (let i = 0; i < 60; i++) {
    const m = rng.weighted(MODELS.filter((x) => !x.noname), (x) => 0.3 + S.market.h[x.i]);
    const checked = i % 3 !== 0;
    const real = checked || rng.chance(0.5);
    const item = makeItem(rng, m.i, {
      cond: rng.int(0, 2),
      real,
      q: real ? 0 : rng.range(0.5, 0.9),
      boughtAt: S.t,
    });
    // Цена закупки должна считаться от состояния, иначе ношеная вещь
    // изначально выставлена выше рынка и любая уценка уводит её в минус.
    item.cost = Math.max(300, Math.round(valueOrig(S, item) * 0.5));
    item.verdict = checked ? 'orig' : 'unknown';
    item.src = 'Закупка';
    S.items.push(item);
  }
  return S;
}

/** Игрок, у которого руки заняты: выставляет всё, но в чаты заходит редко. */
function runShop(seed, staffId, chatsPerDay) {
  const S = endgameShop(seed);
  if (staffId) Staff.hire(S, staffId);
  const startNw = netWorth(S);
  let guard = 0;
  while (dayIndex(S.t) < DAYS && guard++ < DAYS * 40) {
    for (const it of S.items) {
      // Выставляем только то, что ещё не выставлено, и не переигрываем за помощником.
      if (!it.sale) {
        const asOrig = it.verdict !== 'fake';
        listItem(S, it, { price: Math.round(it.cost * (asOrig ? 2.0 : 0.8)), asOrig, avito: true, tg: true });
      }
    }
    // Сам игрок успевает ответить лишь нескольким покупателям за день.
    if (hourIndex(S.t) === 19) {
      const mine = S.threads.filter((t) => t.kind === 'buyer' && !t.closed && t.data.buyer && !t.data.buyer.agreed);
      for (const th of mine.slice(0, chatsPerDay)) {
        const res = acceptOffer(S, th);
        if (res && res.state === 'agreed') completeSale(S, th);
      }
    }
    if (advanceHours(S, 1)) sleep(S);
  }
  // Считать изменение капитала здесь нельзя: товар на старте уже посчитан
  // в капитале, и продажа просто превращает его в деньги. Мерим то, что
  // действительно создано за период: прибыль со сделок минус то, что
  // пришлось заплатить помощнику и за проверки.
  // Легит-чеки не записываем в счёт помощнику: проверять сомнительное перед
  // продажей — это политика хозяина, игрок делает то же самое сам.
  const wages = S.tx.filter((t) => /Зарплата/.test(t.reason)).reduce((s, t) => s - t.amount, 0);
  const checks = S.tx.filter((t) => /Легит-чек/.test(t.reason)).reduce((s, t) => s - t.amount, 0);
  const boosts = S.tx.filter((t) => /Поднять|Поднятие/.test(t.reason)).reduce((s, t) => s - t.amount, 0);
  return {
    net: S.stats.profit - wages - boosts,
    checks,
    profit: S.stats.profit,
    wages,
    sold: S.stats.sold,
    byStaff: S.staff.sold || 0,
    blunders: S.staff.blunders || 0,
    rating: ratingOf(S) || 0,
  };
}

const CHATS_PER_DAY = 3;
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const rows = [];
for (const staffId of [null, ...STAFF.map((s) => s.id)]) {
  const all = [];
  for (let i = 0; i < RUNS; i++) all.push(runShop(2000 + i * 7919, staffId, CHATS_PER_DAY));
  rows.push({
    name: staffId ? STAFF.find((s) => s.id === staffId).n : 'Без помощника',
    net: Math.round(avg(all.map((r) => r.net))),
    wages: Math.round(avg(all.map((r) => r.wages))),
    sold: avg(all.map((r) => r.sold)).toFixed(1),
    byStaff: avg(all.map((r) => r.byStaff)).toFixed(1),
    blunders: avg(all.map((r) => r.blunders)).toFixed(1),
    rating: avg(all.map((r) => r.rating)).toFixed(2),
  });
}

console.log(`\nМагазин поздней игры, ${DAYS} дней, игрок отвечает ${CHATS_PER_DAY} покупателям в день`);
console.log('Считаем прибыль со сделок минус зарплата и поднятия объявлений.');
console.log('Рейтинг важнее, чем кажется: он тянет за собой спрос в следующие недели.\n');
console.log('  Помощник            Чистыми за период   Зарплата   Продано   Из них им   Пали как ориг   Рейтинг');
console.log('  ─────────────────   ─────────────────   ────────   ───────   ─────────   ─────────────   ───────');
const base = rows[0].net;
for (const r of rows) {
  const delta = r.net - base;
  console.log(
    '  ' + r.name.padEnd(19) +
      rub(r.net).padStart(17) +
      rub(r.wages).padStart(12) +
      r.sold.padStart(10) +
      r.byStaff.padStart(12) +
      r.blunders.padStart(16) +
      r.rating.padStart(10) +
      (r.name === 'Без помощника' ? '' : `   (${delta >= 0 ? '+' : ''}${rub(delta)})`),
  );
}
console.log('');
