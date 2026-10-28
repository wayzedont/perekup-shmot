// Что реально лежит на завозе и что из этого может позволить себе новичок.

import { createGame } from '../src/core/engine.js';
import { rngOf } from '../src/core/kernel.js';
import { MODELS } from '../src/core/data/models.js';
import { sizeDemand } from '../src/core/data/catalog.js';
import { valueOrig, netWorth } from '../src/core/economy.js';
import { restock, priceNow, secondPool } from '../src/core/market/second.js';
import { rub, num, quantiles } from '../src/core/util.js';
import { advanceHours } from '../src/core/tick.js';

const S = createGame(Number(process.argv[2] || 1000));
S.flags.started = 1;
advanceHours(S, 2); // до 10:00, завоз

console.log(`\nЗавоз понедельника. Денег: ${rub(S.money)}, уровень ${S.prog.lvl}`);
console.log(`Моделей в пуле уровня: ${secondPool(S).length} из ${MODELS.filter((m) => !m.noname).length}\n`);

const rows = S.second.items
  .map((slot) => {
    const it = slot.item;
    const m = MODELS[it.m];
    const price = priceNow(S, slot);
    const shown = { ...it, cond: it.shownCond };
    const vo = valueOrig(S, shown);
    return {
      name: m.full,
      noname: m.noname,
      price,
      vo,
      ratio: vo ? price / vo : 0,
      h: S.market.h[it.m],
      size: it.size,
      sz: sizeDemand(it.size),
      real: it.real,
      margin: Math.round(vo * 0.92 - price),
    };
  })
  .sort((a, b) => b.margin - a.margin);

const branded = rows.filter((r) => !r.noname);
console.log(`Всего на полке: ${rows.length}, брендовых: ${branded.length}`);
console.log(`Из брендовых оригиналов: ${branded.filter((r) => r.real).length}`);

const affordable = branded.filter((r) => r.price <= 5000);
console.log(`Брендовых по карману (до 5 000 ₽): ${affordable.length}`);

const good = affordable.filter((r) => r.h >= 0.45 && r.sz >= 0.85 && r.ratio <= 0.58);
console.log(`Из них проходят фильтр новичка (ликвид ≥45%, ходовой размер, цена ≤58% рынка): ${good.length}\n`);

console.log('  Лучшие 14 по марже:');
console.log('  ' + 'модель'.padEnd(28) + 'размер'.padEnd(10) + 'цена'.padStart(9) + 'рынок'.padStart(10) + '  доля  ликвид  маржа      что это');
console.log('  ' + '─'.repeat(104));
for (const r of branded.slice(0, 14)) {
  console.log(
    '  ' +
      r.name.padEnd(28) +
      String(r.size).padEnd(10) +
      num(r.price).padStart(9) +
      num(r.vo).padStart(10) +
      ('  ' + Math.round(r.ratio * 100) + '%').padStart(7) +
      ('  ' + Math.round(r.h * 100) + '%').padStart(8) +
      num(r.margin).padStart(8) +
      '      ' +
      (r.real ? 'ориг' : 'ПАЛЬ'),
  );
}

const margins = affordable.map((r) => r.margin);
if (margins.length) {
  const q = quantiles(margins);
  console.log(`\n  Маржа по доступным: мед. ${rub(q.med)}, от ${rub(q.min)} до ${rub(q.max)}`);
}
console.log('');
