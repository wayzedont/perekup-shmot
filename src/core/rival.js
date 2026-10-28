// Мирон — живой конкурент вместо строчки в таблице.
//
// Он охотится за теми же вещами: перехватывает дешёвые объявления, приезжает
// в секонд к открытию и комментирует твой канал. Конфликт с именем работает
// совсем не так, как конфликт с числом в рейтинге.

import { clamp } from './util.js';
import { MODELS } from './data/models.js';
import { itemName } from './items.js';
import { netWorth } from './economy.js';

export const RIVAL_NAME = 'Мирон';

export function rivalGrowth(S) {
  // Растёт сам, но подстраивается: если сильно отстал — ускоряется,
  // если сильно впереди — притормаживает. Гонка остаётся гонкой.
  const mine = netWorth(S);
  const his = S.rival.nw;
  const ratio = clamp(mine / Math.max(1, his), 0.2, 5);
  const base = 0.021;
  const catchUp = ratio > 1.3 ? 1.35 : ratio < 0.7 ? 0.7 : 1;
  return base * catchUp;
}

export function tickRival(S, rng) {
  S.rival.nw = Math.round(S.rival.nw * (1 + rivalGrowth(S) + rng.range(-0.02, 0.018)));
  if (S.rival.nw < 15000) S.rival.nw = 15000;
}

/* ======================= ОСЕЧКИ ======================= */
//
// Соперник, который никогда не ошибается, читается как скрипт, а не как
// человек. Мирон торгует на том же рынке, значит, и влетает на том же:
// берёт паль за дорого, получает единицу, зависает с партией. Про свои
// осечки он пишет сам — злобно и не признавая вины, потому что так и
// пишут настоящие люди. Для игрока это и утешение, и подсказка: вот так
// бывает, когда не проверяешь.

export const BLUNDERS = [
  {
    id: 'fake',
    hit: 0.1,
    text: [
      'Взял {item} за {price}. Прислали — паль. Легит-чек подтвердил. Ну и рынок пошёл, конечно.',
      'Купил {item}, отдал {price}. Оказалось паль, причём дешёвая. Продавец уже не отвечает.',
    ],
  },
  {
    id: 'review',
    hit: 0.07,
    text: [
      'Прилетела единица: «продал реплику под видом оригинала». Я-то откуда знал. Рейтинг теперь чинить месяц.',
      'Один умник написал в отзыве, что у него подошва разошлась через неделю. Единица. За честную вещь, между прочим.',
    ],
  },
  {
    id: 'stuck',
    hit: 0.06,
    text: [
      'Взял партию {item}. Висит третью неделю, никто не берёт. Сливаю в ноль, если не хуже.',
      'Затарился {item} перед тем, как модель умерла. Теперь это просто коробки у меня дома.',
    ],
  },
  {
    id: 'scam',
    hit: 0.12,
    text: [
      'Перевёл {price} на карту за {item}. Угадай, приехало ли. Вот и я не угадал.',
      'Кинули на {price}. Я, конечно, сам дурак, что без доставки взял.',
    ],
  },
];

/**
 * Разыгрывает осечку Мирона.
 * Возвращает {text, loss} либо null. Чем он наглее (heat), тем чаще влетает:
 * тот, кто хватает всё подряд не глядя, рано или поздно нарвётся.
 */
export function blunder(S, rng) {
  // Пока ты никто, он с тобой и не разговаривает.
  if (S.t < HUNT_FROM_DAY * 24) return null;
  const chance = clamp(0.055 + 0.012 * S.rival.heat, 0.055, 0.17);
  if (!rng.chance(chance)) return null;

  const kind = rng.pick(BLUNDERS);
  const loss = Math.round(S.rival.nw * kind.hit * rng.range(0.6, 1.3));
  S.rival.nw = Math.max(15000, S.rival.nw - loss);
  // Обжёгшись, он на время притихает.
  S.rival.heat = clamp(S.rival.heat - 1.2, 0, 10);
  S.rival.lastBlunder = S.t;
  return { kind: kind.id, text: rng.pick(kind.text), loss };
}

/** Перехватил ли Мирон объявление, которое просто истекло само. */
export function snipes(S, rng, listing) {
  if (!listing.isDeal) return false;
  const aggression = 0.3 + 0.08 * S.rival.heat;
  return rng.chance(clamp(aggression, 0.3, 0.8));
}

/* ======================= ОХОТА ЗА ОБЪЯВЛЕНИЯМИ ======================= */
// Мирон смотрит ту же ленту, что и ты. Самое обидное — потерять вещь,
// которую уже открыл и на которую уже торгуешься: именно это и моделируем.

/** Игрок как-то повозился с объявлением: написал, посмотрел, поосматривал. */
export function engagedWith(listing) {
  if (listing.seenAt) return true;
  if (listing.threadId) return true;
  return Object.keys(listing.item.seen || {}).length > 0;
}

/** Сколько часов можно думать над вещью безнаказанно: почти сутки. */
export const GRACE_HOURS = 20;
/** Пока ты никто, Мирон за тобой и не следит. */
export const HUNT_FROM_DAY = 7;
/** Сколько часов переписка считается живой — пока она жива, вещь за тобой. */
export const WARM_HOURS = 4;
/** Как часто Мирон вообще может кого-то перехватить. */
export const HUNT_COOLDOWN = 48;

/**
 * Насколько Мирон опасен для конкретного объявления прямо сейчас.
 *
 * Правило, которое игрок должен выучить за один раз: Мирон забирает только
 * то, что ты открыл и бросил. Пока переписка живая — вещь за тобой.
 * Договорился о цене — тем более. А вот объявление, которое ты открыл вчера
 * и забыл, он найдёт обязательно.
 */
export function huntChance(S, listing, warm) {
  if (!listing.isDeal || listing.incoming) return 0;
  if (listing.seller.type === 'scam') return 0;
  if (!engagedWith(listing)) return 0;
  if (listing.seller.agreed) return 0;
  if (warm) return 0;
  const waited = S.t - (listing.seenAt || listing.postedAt) - GRACE_HOURS;
  if (waited <= 0) return 0;
  // «Связи» — это и есть то, почему ты узнаёшь о вещах раньше него.
  const conn = clamp(1 - 0.06 * S.prog.skills.conn, 0.5, 1);
  const base = 0.07 + 0.01 * S.rival.heat;
  return clamp(base * (1 + waited * 0.25) * conn, 0, 0.35);
}

/**
 * Раз в пару дней Мирон может забрать одно объявление.
 * Берёт самое вкусное из брошенного.
 */
export function hunt(S, rng, isWarm) {
  if (S.t < HUNT_FROM_DAY * 24) return null;
  if (S.t - (S.rival.lastAt || -999) < HUNT_COOLDOWN) return null;
  const targets = S.listings
    .map((l) => ({ l, p: huntChance(S, l, isWarm ? isWarm(l) : false) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p);
  for (const { l, p } of targets.slice(0, 3)) {
    if (!rng.chance(p)) continue;
    S.rival.sniped++;
    S.rival.heat = clamp(S.rival.heat + 0.4, 0, 10);
    S.rival.lastAt = S.t;
    return l;
  }
  return null;
}

/* ======================= СЕКОНД К ОТКРЫТИЮ ======================= */

/**
 * Сколько лучших вещей Мирон успевает снять с полки за прошедший час.
 * Правило простое и читаемое: он берёт одну вещь в час открытия — но только
 * если тебя у полки не было. Пришёл к десяти — первым выбираешь ты.
 */
export function raidSize(S, hoursSinceOpen, playerHere) {
  if (hoursSinceOpen !== 0) return 0;
  if (playerHere) return 0;
  // Пока ты торгуешь олимпийками с рук, Мирон тебя не замечает — как и в
  // охоте за объявлениями. Первая неделя должна учить, а не наказывать.
  if (S.t < HUNT_FROM_DAY * 24) return 0;
  return 1;
}

/**
 * Мирон снимает с полки лучшее.
 * Возвращает забранные места, чтобы вызывающий сам решил, что рассказать.
 */
export function raidSecond(S, slots, count) {
  if (!slots.length || count <= 0) return [];
  const taken = slots.slice(0, count);
  S.rival.sniped += taken.length;
  S.rival.heat = clamp(S.rival.heat + 0.2 * taken.length, 0, 10);
  S.rival.lastAt = S.t;
  return taken;
}

export const TAUNTS = {
  snipe: [
    'Видел {item} за {price}? Уже у меня 😎',
    'Спасибо, что тормозишь. {item} поехала ко мне.',
    'Пока ты думал — я купил. {item}, если что.',
  ],
  // Перехват того, над чем игрок уже сидел: тут можно и поконкретнее.
  intercept: [
    'Ты там {item} выторговывал? Я взял за {price}. Не надо было душить человека.',
    '{item} — моя. Пока ты переписывался, я просто приехал и забрал.',
    'Продавец {item} сказал, что ты долго думаешь. Я думал недолго — {price}.',
    'Лайфхак: когда видишь цену ниже рынка, надо брать, а не торговаться. {item} уже у меня.',
  ],
  second: [
    'Был сегодня в «Мешке» к открытию. Хорошее забрал, тебе оставил пакеты.',
    'В секонде, кстати, уже ничего нет. Я был в десять.',
  ],
  // Он уносит с полки конкретную вещь.
  raid: [
    'В «Мешке» снял {item} за {price}. Спал, да?',
    'Был в десять, взял {item}. Тебе там пакеты остались.',
    '{item} из секонда за {price} — это даже неприлично. Надо раньше вставать.',
  ],
  // Игрок стоял рядом и всё равно взял своё.
  raidClose: [
    'Видел тебя в «Мешке». Ладно, {item} твоя, я взял другое.',
    'Ты сегодня быстрее был, признаю. Но это один раз.',
  ],
  ahead: [
    'Глянул топ. Ты там где-то внизу, да?',
    'У меня {nw}. У тебя сколько, напомни?',
    'Не расстраивайся, перекуп — это не для всех.',
  ],
  behind: [
    'Ну ладно, признаю, растёшь.',
    'Слушай, а ты неплохо идёшь. Но это пока.',
    'Хм. Обогнал. Временно.',
  ],
  fake: [
    'Слышал, тебе единицу прилетело за паль. Бывает 🙃',
    'Говорят, ты палью торгуешь. Я-то что, мне же легче.',
  ],
};

export function taunt(S, rng, kind, vars) {
  const list = TAUNTS[kind];
  if (!list) return null;
  let text = rng.pick(list);
  for (const k of Object.keys(vars || {})) text = text.replace('{' + k + '}', vars[k]);
  return text;
}


export function rankOf(S, rivals) {
  const mine = netWorth(S);
  return 1 + rivals.filter((r) => r.nw > mine).length;
}

/** Остальные перекупы остаются фоном, но уже без претензии на характер. */
export const BACKGROUND_RIVALS = [
  ['hype_boy', 28000, 0.021],
  ['Шмот у Тёмы', 44000, 0.02],
  ['Лиза Винтаж', 64000, 0.0195],
  ['Кросс-Король', 88000, 0.019],
  ['sneaker_dima', 128000, 0.0185],
  ['Кархарт Сева', 176000, 0.018],
  ['Стас Перекуп', 275000, 0.0172],
  ['Resell Mafia', 480000, 0.0162],
  ['Опт Гоша', 980000, 0.0152],
  ['ЦУМ на минималках', 2100000, 0.0142],
  ['Бренд «Подвал»', 4800000, 0.0132],
];

export function describeItem(item) {
  return itemName(item);
}
