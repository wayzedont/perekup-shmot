// Осмотр вещи по признакам — ядро всей глубины.
//
// В прототипе осмотр был бесплатным, мгновенным и безлимитным, поэтому игрок
// бесплатно получал почти точную информацию и риска не существовало.
// Теперь каждый признак проверяется отдельно и стоит игровых минут.
// Что именно смотреть — и есть решение. А чтобы смотреть правильно,
// надо помнить, по чему палится эта конкретная модель: это копит записная книжка.

import { clamp } from './util.js';
import { CATS, TELLS } from './data/catalog.js';
import { MODELS } from './data/models.js';

/** Признаки, которые невозможно проверить по фотографии. */
export const PHYSICAL_ONLY = ['smell'];

/** Сколько минут уходит на один признак. */
export function inspectMinutes(S) {
  return Math.max(5, Math.round(15 - 0.95 * S.prog.skills.eye));
}

/** Вероятность ошибиться в наблюдении. */
export function inspectError(S, mode) {
  const base = clamp(0.24 - 0.021 * S.prog.skills.eye, 0.03, 0.24);
  return mode === 'photo' ? Math.min(0.55, base * 1.9) : base;
}

/** Какие признаки применимы к этой вещи. */
export function tellsFor(item, mode) {
  const m = MODELS[item.m];
  if (m.noname) return [];
  let list = CATS[m.cat].tells.slice();
  if (!item.hasBox) list = list.filter((t) => t !== 'box');
  if (mode === 'photo') list = list.filter((t) => !PHYSICAL_ONLY.includes(t));
  return list;
}

/**
 * Генерирует «насколько кривой» каждый признак у подделки.
 * Для оригинала остаются околонулевые значения — но шум осмотра
 * на низком «Глазе» всё равно может заставить усомниться.
 */
export function makeFlaws(rng, modelIndex, real, q) {
  const m = MODELS[modelIndex];
  const applicable = CATS[m.cat].tells;
  const flaws = {};
  for (const tell of applicable) {
    if (real) {
      // У настоящей вещи огрехов почти нет: сомнения рождает шум осмотра,
      // а не сама вещь. Иначе прокачанный глаз начинал бы браковать оригиналы.
      flaws[tell] = rng.range(0, 0.05);
      continue;
    }
    const idx = m.tells.indexOf(tell);
    // Первый признак в списке модели — её фирменное палево.
    const weight = idx < 0 ? 0.33 : Math.max(0.3, 1 - 0.22 * idx);
    flaws[tell] = clamp((1 - q) * weight * rng.range(0.65, 1.35), 0, 1);
  }
  return flaws;
}

const BUCKETS = ['ok', 'odd', 'bad'];

/**
 * Порог чувствительности. Главное, что даёт «Глаз», — не меньше ошибок,
 * а способность заметить мелочь: новичок пропускает хорошую копию,
 * опытный видит, что шрифт на бирке на полмиллиметра не тот.
 */
function thresholds(S) {
  const eye = S.prog.skills.eye;
  return {
    ok: 0.21 - 0.014 * eye, // eye 0: 0.21, eye 10: 0.07
    odd: 0.54 - 0.018 * eye, // eye 0: 0.54, eye 10: 0.36
  };
}

function bucketOf(f, th) {
  if (f < th.ok) return 'ok';
  if (f < th.odd) return 'odd';
  return 'bad';
}

/**
 * Осмотреть один признак. Меняет item.seen и возвращает наблюдение.
 * Время списывает вызывающая сторона — здесь только логика.
 */
export function observeTell(S, rng, item, tell, mode) {
  if (!item.seen) item.seen = {};
  if (item.seen[tell]) return item.seen[tell];
  const trueFlaw = (item.flaws && item.flaws[tell]) !== undefined ? item.flaws[tell] : 0.05;
  let idx = BUCKETS.indexOf(bucketOf(trueFlaw, thresholds(S)));
  if (rng.chance(inspectError(S, mode))) {
    idx = clamp(idx + (rng.chance(0.5) ? 1 : -1), 0, 2);
  }
  const result = BUCKETS[idx];
  item.seen[tell] = result;
  return result;
}

/**
 * Насколько вещь выглядит подозрительно по всему, что игрок уже посмотрел.
 * Один явно кривой признак — это приговор, сколько бы чистых рядом ни было:
 * поэтому берём худшее наблюдение, а чистые лишь добавляют уверенности.
 * 0 — выглядит как оригинал, 1 — явная паль. null — ничего не смотрели.
 */
export function suspicion(item) {
  if (!item.seen) return null;
  const keys = Object.keys(item.seen);
  if (!keys.length) return null;
  let worst = 0;
  let clean = 0;
  for (const k of keys) {
    const v = item.seen[k];
    if (v === 'bad') worst = Math.max(worst, 1);
    else if (v === 'odd') worst = Math.max(worst, 0.5);
    else clean++;
  }
  return clamp(worst - clean * 0.1, -0.3, 1);
}

/** Словесный вердикт по осмотру — то, что видит игрок в карточке. */
export function suspicionLabel(item) {
  if (item.verdict === 'orig') return { k: 'orig', n: 'Оригинал ✓', tone: 'good' };
  if (item.verdict === 'fake') return { k: 'fake', n: 'Паль ✗', tone: 'bad' };
  const s = suspicion(item);
  if (s === null) return { k: 'unknown', n: 'Не смотрел', tone: 'flat' };
  if (s >= 0.7) return { k: 'likely-fake', n: 'Почти точно паль', tone: 'bad' };
  if (s >= 0.35) return { k: 'doubt', n: 'Что-то не то', tone: 'warn' };
  if (s >= 0.1) return { k: 'doubt', n: 'Есть сомнения', tone: 'warn' };
  if (s <= -0.15) return { k: 'likely-orig', n: 'Похоже на ориг', tone: 'good' };
  return { k: 'plain', n: 'Вроде чисто', tone: 'flat' };
}

/** Что показать про конкретное наблюдение. */
export function tellNote(item, tell) {
  const v = item.seen && item.seen[tell];
  if (!v) return null;
  const t = TELLS[tell];
  const texts = {
    tag: {
      ok: 'Бирка ровная, шрифт правильный, артикул на месте.',
      odd: 'Шрифт на бирке чуть поплыл. Может быть партия, а может и нет.',
      bad: 'Бирка кривая: шрифт не тот, артикул не бьётся.',
    },
    stitch: {
      ok: 'Швы ровные, шаг стежка одинаковый, нитки в тон.',
      odd: 'Пара швов гуляет. Бывает и на оригинале, но настораживает.',
      bad: 'Швы кривые, нитки торчат, шаг пляшет.',
    },
    sole: {
      ok: 'Протектор чёткий, резина упругая, клея не видно.',
      odd: 'Рисунок протектора чуть замылен.',
      bad: 'Подошва не та: рисунок мягкий, по краям клей.',
    },
    smell: {
      ok: 'Пахнет нормально — кожей и складом.',
      odd: 'Лёгкая химия. Возможно, просто долго лежало в пакете.',
      bad: 'Шибает химией. Так пахнет дешёвое производство.',
    },
    box: {
      ok: 'Коробка плотная, этикетка совпадает с вещью.',
      odd: 'Этикетка напечатана небрежно.',
      bad: 'Коробка картонка, артикул на этикетке не совпадает.',
    },
    hardware: {
      ok: 'Молнии ходят мягко, на бегунке есть клеймо.',
      odd: 'Бегунок туговат, клейма не видно.',
      bad: 'Фурнитура дешёвая: молния цепляет, кнопки болтаются.',
    },
    print: {
      ok: 'Принт плотный, края чёткие.',
      odd: 'Края принта слегка размыты.',
      bad: 'Принт растровый, краска поверх ткани лежит коркой.',
    },
    shape: {
      ok: 'Посадка правильная, пропорции как на витрине.',
      odd: 'Силуэт немного другой. Или это другая партия.',
      bad: 'Лекала не те: вещь сидит иначе, чем оригинал.',
    },
  };
  return { tell, name: t.n, state: v, text: (texts[tell] || {})[v] || t.d };
}

/* ======================= ЛЕГИТ-ЧЕК ======================= */

/**
 * Профессиональная проверка. Точная, но не абсолютная:
 * суперкопии иногда проходят, а по одним фото ошибиться проще.
 */
export function legitVerdict(rng, item, accuracy) {
  if (item.real) return rng.chance(accuracy + 0.03) ? 'orig' : 'fake';
  // Чем лучше копия, тем выше шанс, что она пройдёт проверку.
  const slip = clamp((item.q - 0.82) * 1.3, 0, 0.3);
  if (rng.chance(slip)) return 'orig';
  return rng.chance(accuracy) ? 'fake' : 'orig';
}
