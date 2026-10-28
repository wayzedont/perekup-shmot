// Сидируемый генератор случайных чисел.
// Весь недетерминизм игры проходит через него, поэтому любой прогон
// воспроизводится по номеру сида — это то, на чём держатся балансовые симуляции.

/** @typedef {{s:number}} RngState */

/** Создаёт состояние ГСЧ из сида. */
export function rngState(seed) {
  return { s: (seed >>> 0) || 1 };
}

/** mulberry32 — быстрый, короткий период не важен, зато состояние это одно число. */
function next(r) {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Обёртка с игровыми помощниками. Один объект на игру, живёт в состоянии.
 */
export class Rng {
  constructor(state) {
    this.st = state;
  }
  /** [0,1) */
  f() {
    return next(this.st);
  }
  /** Дробное в [a,b). */
  range(a, b) {
    return a + this.f() * (b - a);
  }
  /** Целое в [a,b] включительно. */
  int(a, b) {
    return Math.floor(a + this.f() * (b - a + 1));
  }
  /** Истина с вероятностью p. */
  chance(p) {
    return this.f() < p;
  }
  /** Случайный элемент массива. */
  pick(arr) {
    return arr[Math.floor(this.f() * arr.length)];
  }
  /** Случайный элемент с весами: wf(item) -> вес. */
  weighted(items, wf) {
    let total = 0;
    const w = new Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const x = Math.max(0, wf(items[i], i));
      w[i] = x;
      total += x;
    }
    if (total <= 0) return items[Math.floor(this.f() * items.length)];
    let r = this.f() * total;
    for (let i = 0; i < items.length; i++) {
      r -= w[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
  /** Нормальное распределение (сумма четырёх равномерных — достаточно близко). */
  gauss(mean, sd) {
    return mean + sd * (this.f() + this.f() + this.f() + this.f() - 2) * 1.22;
  }
  /** Перемешивание на месте. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  /** Несколько разных элементов. */
  sample(arr, n) {
    const copy = arr.slice();
    this.shuffle(copy);
    return copy.slice(0, Math.min(n, copy.length));
  }
}

/** Детерминированный хеш строки — для стабильных «случайностей», привязанных к id. */
export function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
