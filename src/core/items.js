// Создание вещей и работа с их состоянием.
//
// У вещи две правды: подлинность и состояние. Обе скрыты, обе проверяются
// отдельно и за время. На фотографиях состояние не видно — поэтому встреча
// у метро наконец имеет смысл, а «почему так дёшево» получает честный ответ.

import { clamp } from './util.js';
import { CONDS, sizesFor, sizeDemand } from './data/catalog.js';
import { MODELS } from './data/models.js';
import { makeFlaws } from './inspect.js';

/* ======================= ДЕФЕКТЫ ======================= */
// step — на сколько ступеней состояния вещь хуже, чем кажется.
// fixable — убирается химчисткой или чисткой кроссовок.

export const DEFECTS = [
  { id: 'heel', n: 'Затёртая пятка', step: 1, cats: ['shoes'], fixable: false },
  { id: 'crease', n: 'Глубокие заломы', step: 1, cats: ['shoes'], fixable: false },
  { id: 'yellow', n: 'Пожелтевшая подошва', step: 1, cats: ['shoes'], fixable: true },
  { id: 'dirt', n: 'Въевшаяся грязь', step: 1, cats: ['shoes', 'jacket', 'puffer', 'pants'], fixable: true },
  { id: 'smell', n: 'Запах, который не выветривается', step: 1, cats: null, fixable: true },
  { id: 'pills', n: 'Катышки по всей ткани', step: 1, cats: ['hoodie', 'knit', 'tee', 'polo'], fixable: true },
  { id: 'hole', n: 'Дырка, зашита ниткой не в тон', step: 2, cats: ['hoodie', 'knit', 'tee', 'pants', 'jacket'], fixable: false },
  { id: 'stain', n: 'Пятно, которое не отстирали', step: 1, cats: null, fixable: true },
  { id: 'zipper', n: 'Молния заедает', step: 1, cats: ['jacket', 'puffer', 'hoodie', 'bag'], fixable: false },
  { id: 'repaint', n: 'Перекрашено кустарно', step: 2, cats: ['shoes', 'bag'], fixable: false },
  { id: 'fade', n: 'Выгорело на солнце', step: 1, cats: ['hoodie', 'tee', 'jacket', 'cap'], fixable: false },
  { id: 'resole', n: 'Подошва переклеена', step: 2, cats: ['shoes'], fixable: false },
];

export function defectsFor(cat) {
  return DEFECTS.filter((d) => !d.cats || d.cats.includes(cat));
}

/* ======================= СОЗДАНИЕ ======================= */

export function pickSize(rng, cat) {
  const list = sizesFor(cat);
  return rng.weighted(list, (s) => 0.35 + sizeDemand(s));
}

let nextId = 1;
export function resetIds(from) {
  nextId = from || 1;
}
export function newId() {
  return nextId++;
}

/**
 * Создаёт вещь.
 * opts: {size, cond, way, real, q, cost, src, hasBox, defects, limitedName}
 */
export function makeItem(rng, modelIndex, opts = {}) {
  const m = MODELS[modelIndex];
  const real = opts.real !== undefined ? opts.real : true;
  const q = real ? 0 : opts.q !== undefined ? opts.q : rng.range(0.2, 0.9);
  const cond = opts.cond !== undefined ? opts.cond : 2;

  const item = {
    id: opts.id || newId(),
    m: modelIndex,
    size: opts.size || pickSize(rng, m.cat),
    cond: clamp(cond, 0, CONDS.length - 1),
    shownCond: clamp(cond, 0, CONDS.length - 1),
    way: opts.way !== undefined ? opts.way : rng.int(0, m.ways.length - 1),
    real,
    q,
    flaws: m.noname ? {} : makeFlaws(rng, modelIndex, real, q),
    seen: {},
    verdict: 'unknown',
    legitDone: false,
    hasBox: opts.hasBox !== undefined ? opts.hasBox : cond === 0,
    defects: opts.defects || [],
    condSeen: opts.condSeen || false,
    cost: opts.cost || 0,
    src: opts.src || '',
    boughtAt: opts.boughtAt !== undefined ? opts.boughtAt : 0,
    sale: null,
    photo: false,
    cleaned: false,
  };
  if (opts.verdict) item.verdict = opts.verdict;
  if (opts.limitedName) {
    item.limitedName = opts.limitedName;
    item.limitedAt = opts.limitedAt || 0;
  }
  return item;
}

/**
 * Добавляет вещи скрытые дефекты и делает так, чтобы в объявлении
 * она выглядела лучше, чем есть. Применяется к б/у вещам с рынка.
 */
export function hideDefects(rng, item, chance) {
  const m = MODELS[item.m];
  if (item.cond === 0) return item;
  if (!rng.chance(chance)) return item;
  const pool = defectsFor(m.cat);
  if (!pool.length) return item;
  const count = rng.chance(0.75) ? 1 : 2;
  const picked = rng.sample(pool, count);
  let steps = 0;
  for (const d of picked) {
    item.defects.push({ ...d });
    steps += d.step;
  }
  // Продавец показывает состояние на несколько ступеней лучше.
  item.shownCond = clamp(item.cond - steps, 0, CONDS.length - 1);
  item.condSeen = false;
  return item;
}

/**
 * Состояние, которое игрок видит сейчас.
 * Устойчиво к «облегчённым» описаниям вещи, которые интерфейс иногда
 * собирает для превью (например, карточка модели на Пойзоне).
 */
export function shownCondition(item) {
  const idx = item.condSeen ? item.cond : item.shownCond;
  const safe = typeof idx === 'number' ? idx : typeof item.cond === 'number' ? item.cond : 0;
  return CONDS[clamp(safe, 0, CONDS.length - 1)] || CONDS[0];
}

/** Проверить состояние: вскрывает дефекты. */
export function revealCondition(item) {
  item.condSeen = true;
  item.shownCond = item.cond;
  return item.defects;
}

/** Починить то, что чинится. */
export function cleanItem(item) {
  const before = item.defects.length;
  item.defects = item.defects.filter((d) => !d.fixable);
  const fixed = before - item.defects.length;
  // Чистка поднимает состояние, но не выше «хорошего» для ношеных вещей.
  if (item.cond >= 3) item.cond = 2;
  else if (fixed) item.cond = clamp(item.cond - 1, 0, CONDS.length - 1);
  item.shownCond = item.cond;
  item.cleaned = true;
  return fixed;
}

/* ======================= ИМЕНА И ОПИСАНИЯ ======================= */

export function itemName(item) {
  const m = MODELS[item.m];
  let n = m.b + ' ' + m.n;
  if (item.limitedName) n += ' ' + item.limitedName;
  return n;
}

export function colorwayName(item) {
  const m = MODELS[item.m];
  const way = m.ways[item.way % m.ways.length];
  return way ? way.n : '';
}

export function itemFullName(item) {
  const cw = colorwayName(item);
  return itemName(item) + (cw ? ', ' + cw.toLowerCase() : '');
}

export const sizeLabel = (item) => (item.size === 'One size' ? 'один размер' : item.size);

/** Короткая строка характеристик для списков. */
export function itemSubtitle(item) {
  return sizeLabel(item) + ' · ' + shownCondition(item).short;
}

/* ======================= ПРОДАЖА ======================= */

export function makeSale(S, { price, asOrig, avito, tg }) {
  return {
    price,
    asOrig,
    avito: !!avito,
    tg: !!tg,
    listedAt: S.t,
    bumpedAt: S.t,
    boostUntil: 0,
    postedAt: tg ? S.t : 0,
    views: 0,
    photo: false,
    description: false,
    // Насколько нагло игрок врал в переписке про подлинность.
    pressure: 0,
  };
}

export const isListed = (item) => !!item.sale;
