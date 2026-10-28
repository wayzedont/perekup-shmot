// Насколько точен осмотр: сколько подделок ловится и сколько оригиналов
// ошибочно забраковано — по уровням «Глаза» и числу осмотренных признаков.

import { createGame } from '../src/core/engine.js';
import { rngOf } from '../src/core/kernel.js';
import { makeItem } from '../src/core/items.js';
import { BRANDED } from '../src/core/data/models.js';
import { observeTell, suspicion, tellsFor, inspectError, inspectMinutes } from '../src/core/inspect.js';
import { sortedTells } from '../src/core/notebook.js';

const S = createGame(4242);
const rng = rngOf(S);
const THRESHOLD = Number(process.argv[2] || 0.12);
const N = 4000;

console.log(`\nТочность осмотра. Порог подозрения: ${THRESHOLD}\n`);
console.log('  Глаз  признаков  поймал пали  забраковал ориг  время  доля «не ясно»');
console.log('  ' + '─'.repeat(72));

for (const eye of [0, 2, 4, 6, 8, 10]) {
  S.prog.skills.eye = eye;
  for (const tellCount of [1, 2, 3]) {
    let fakeCaught = 0;
    let fakeTotal = 0;
    let origRejected = 0;
    let origTotal = 0;
    let unclear = 0;

    for (let i = 0; i < N; i++) {
      const m = rng.pick(BRANDED);
      const real = rng.chance(0.5);
      // Качество копии как в секонде: часто плохая, иногда хорошая.
      const q = real ? 0 : rng.chance(0.62) ? rng.range(0.12, 0.5) : rng.range(0.5, 0.92);
      const item = makeItem(rng, m.i, { real, q, cond: 1 });
      const order = tellsFor(item, 'hand');
      for (let t = 0; t < tellCount && t < order.length; t++) {
        observeTell(S, rng, item, order[t], 'hand');
      }
      const s = suspicion(item);
      const rejected = s !== null && s > THRESHOLD;
      if (real) {
        origTotal++;
        if (rejected) origRejected++;
      } else {
        fakeTotal++;
        if (rejected) fakeCaught++;
      }
      if (s !== null && s > -0.05 && s <= THRESHOLD) unclear++;
    }

    const mins = inspectMinutes(S) * tellCount;
    console.log(
      '  ' +
        String(eye).padEnd(6) +
        String(tellCount).padEnd(11) +
        (Math.round((fakeCaught / fakeTotal) * 100) + '%').padEnd(13) +
        (Math.round((origRejected / origTotal) * 100) + '%').padEnd(18) +
        (mins + ' мин').padEnd(7) +
        Math.round((unclear / N) * 100) + '%',
    );
  }
}

/* Какой множитель даёт стратегия «осмотрел и купил, если чисто» */
console.log('\n  Экономика закупки в секонде при цене 46% от рынка:\n');
console.log('  Глаз  признаков  доля пали среди купленного  множитель на вложенное');
console.log('  ' + '─'.repeat(70));

for (const eye of [0, 3, 6, 10]) {
  S.prog.skills.eye = eye;
  for (const tellCount of [1, 2, 3]) {
    let bought = 0;
    let boughtFake = 0;
    for (let i = 0; i < N; i++) {
      const m = rng.pick(BRANDED);
      const real = rng.chance(0.5);
      const q = real ? 0 : rng.chance(0.62) ? rng.range(0.12, 0.5) : rng.range(0.5, 0.92);
      const item = makeItem(rng, m.i, { real, q, cond: 1 });
      const order = tellsFor(item, 'hand');
      for (let t = 0; t < tellCount && t < order.length; t++) observeTell(S, rng, item, order[t], 'hand');
      const s = suspicion(item);
      if (s !== null && s > THRESHOLD) continue;
      bought++;
      if (!real) boughtFake++;
    }
    const fakeShare = bought ? boughtFake / bought : 0;
    // Покупка за 0.46 рынка, продажа оригинала за 0.92, пали как реплики за 0.20.
    const mult = ((1 - fakeShare) * 0.92 + fakeShare * 0.2) / 0.46;
    console.log(
      '  ' +
        String(eye).padEnd(6) +
        String(tellCount).padEnd(11) +
        (Math.round(fakeShare * 100) + '%').padEnd(27) +
        mult.toFixed(2) + '×',
    );
  }
}
console.log('');
