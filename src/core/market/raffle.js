// Раффлы на лимитки. Запись за 300 ₽, итоги в субботу в 12:00.
// Шанс растёт от уровня, «Связей» и размера канала — то есть от того,
// насколько ты вообще стал кем-то на рынке.

import { clamp, priceRound } from '../util.js';
import { BRANDED, MODELS } from '../data/models.js';
import { DROP_NAMES } from '../data/content.js';
import { sizesFor } from '../data/catalog.js';
import { weekdayAt } from '../time.js';
import { valueOrig } from '../economy.js';

export const ENTRY_FEE = 300;

export function winChance(S) {
  return clamp(
    0.07 + 0.011 * S.prog.lvl + 0.018 * S.prog.skills.conn + (S.tg.subs >= 1000 ? 0.03 : 0) + (S.tg.subs >= 5000 ? 0.03 : 0),
    0.07,
    0.35,
  );
}

export function newRaffle(S, rng) {
  const model = rng.weighted(
    BRANDED.filter((m) => ['shoes', 'hoodie', 'jacket', 'tee'].includes(m.cat)),
    (m) => (m.tier === 'lux' ? 0.15 : m.tier === 'mass' ? 0.3 : 1) * (0.3 + S.market.h[m.i]),
  );
  // Итоги — ближайшая суббота в 12:00.
  const dw = weekdayAt(S.t);
  const addDays = (6 - dw + 7) % 7 || 7;
  return {
    m: model.i,
    name: rng.pick(DROP_NAMES),
    retail: priceRound(model.rt * 0.88),
    resultAt: (Math.floor(S.t / 24) + addDays) * 24 + 12,
    entered: false,
    size: null,
    done: false,
    way: rng.int(0, model.ways.length - 1),
  };
}

export function raffleTitle(raffle) {
  const m = MODELS[raffle.m];
  return `${m.b} ${m.n} ${raffle.name}`;
}

export function raffleSizes(raffle) {
  return sizesFor(MODELS[raffle.m].cat);
}

/** Сколько лимитка будет стоить на ресейле сразу после релиза. */
export function resaleEstimate(S, raffle) {
  return valueOrig(S, { m: raffle.m, cond: 0, size: raffleSizes(raffle)[2] || 'M', limitedAt: S.t, boughtAt: S.t });
}
