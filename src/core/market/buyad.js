// Объявление «скупаю шмот».
//
// Обратная сторона рынка: не ты ищешь вещи, а их приносят тебе.
// Это обычный пост в собственном канале, поэтому он бесплатный — платить
// самому себе не за что. Повторять его можно раз в неделю: если постить
// каждый день, подписчики перестанут читать.
//
// Откликаются подписчики, поэтому объявление стоит не рублей, а выращенного
// канала. Но растёт от канала не количество людей, а то, ЧТО они несут.
//
// Это важная развилка. Если бы десять тысяч подписчиков давали сотню
// откликов в неделю, игра превратилась бы в конвейер одинаковых встреч:
// каждая стоит час и осмотр, разобрать столько физически нельзя, и вместо
// интересных решений получается клик-работа. Поэтому людей всегда немного —
// от одного до шести в неделю, — а канал меняет другое: тебе начинают
// приносить вещи дороже, ликвиднее и реже палёные. Один и тот же час
// встречи приносит то четыре тысячи, то сорок.

import { clamp, priceRound } from '../util.js';
import { MODELS } from '../data/models.js';
import { METRO } from '../data/content.js';
import { makeItem, hideDefects } from '../items.js';
import { valueOrig, valueFake, netWorth } from '../economy.js';
import { makeSeller, rollSignals } from '../people/sellers.js';
import { nextListingId } from './avito.js';

/** Раз в неделю — чаще канал не выдержит. */
export const AD_DAYS = 7;

/** Больше шести встреч за неделю никто не разберёт. */
export const MAX_RESPONSES = 6;

export function canPostAd(S) {
  if (!S.tg.has) return { ok: false, why: 'Сначала нужен свой канал' };
  const next = (S.buyAd && S.buyAd.postedAt ? S.buyAd.postedAt : -99999) + AD_DAYS * 24;
  if (S.t < next) {
    const h = Math.ceil(next - S.t);
    return { ok: false, why: `Ещё рано: такое объявление можно раз в неделю, осталось ${Math.ceil(h / 24)} дн.` };
  }
  return { ok: true };
}

/** Через сколько часов объявление можно повторить. */
export function cooldownLeft(S) {
  const next = (S.buyAd && S.buyAd.postedAt ? S.buyAd.postedAt : -99999) + AD_DAYS * 24;
  return Math.max(0, next - S.t);
}

/** Объявление ещё работает: кто-то из откликнувшихся пока не написал. */
export function adActive(S) {
  return !!(S.buyAd && S.buyAd.queue && S.buyAd.queue.length);
}

export function adHoursLeft(S) {
  if (!adActive(S)) return 0;
  return Math.max(0, Math.max(...S.buyAd.queue) - S.t);
}

/**
 * Насколько серьёзно к тебе относятся как к скупщику: от 0 до 1.
 *
 * Это и есть главный рычаг объявления. Складывается из размера канала
 * (с насыщением — после нескольких тысяч подписчиков дальше почти не растёт)
 * и доверия: люди, которые тебя читают и верят, несут вещи получше и реже
 * пытаются подсунуть паль.
 */
export function pull(S) {
  if (!S.tg.has) return 0;
  const fame = clamp(Math.log(1 + (S.tg.subs || 0) / 90) / Math.log(70), 0, 1);
  const trust = clamp((S.tg.trust || 0) / 100, 0.15, 1);
  return clamp(fame * 0.68 + trust * 0.32, 0, 1);
}

/**
 * Сколько человек откликнется за неделю.
 * Кривая с насыщением: от одного на маленьком канале до шести на большом.
 */
export function responderRange(S) {
  if (!S.tg.has) return { lo: 0, hi: 0 };
  const n = 1.2 * Math.log(1 + (S.tg.subs || 0) / 55);
  const hi = clamp(Math.round(n) + 1, 1, MAX_RESPONSES);
  // Хотя бы один человек откликается всегда: даже на канал из десяти человек
  // кто-нибудь да напишет. Вопрос только в том, что он принесёт.
  const lo = clamp(Math.floor(n), 1, hi);
  return { lo, hi };
}

/**
 * Расписывает отклики по неделе: кто-то напишет завтра, кто-то в пятницу.
 * Пишут днём, с десяти до девяти вечера.
 */
export function planResponses(S, rng) {
  const { lo, hi } = responderRange(S);
  if (hi < 1) return [];
  const count = rng.int(lo, hi);
  const queue = [];
  for (let i = 0; i < count; i++) {
    const day = rng.int(0, AD_DAYS - 1);
    const hour = rng.int(10, 21);
    const base = Math.floor(S.t / 24) * 24;
    const at = base + day * 24 + hour;
    queue.push(at <= S.t ? S.t + rng.int(2, 8) : at);
  }
  return queue.sort((a, b) => a - b);
}

/** Кто из очереди уже должен написать. */
export function dueResponses(S) {
  if (!adActive(S)) return 0;
  return S.buyAd.queue.filter((at) => at <= S.t).length;
}

/** Что именно тебе несут — словами, чтобы связь с каналом была видна. */
export function pullLabel(S) {
  const p = pull(S);
  if (p < 0.3) return { n: 'что попало из шкафа', tone: 'bad' };
  if (p < 0.45) return { n: 'масс-маркет и простой стритвир', tone: 'flat' };
  if (p < 0.6) return { n: 'ходовые вещи, иногда приличные', tone: 'flat' };
  if (p < 0.78) return { n: 'ликвид и недорогой премиум', tone: 'good' };
  if (p < 0.92) return { n: 'дорогое и ходовое', tone: 'good' };
  return { n: 'всё, вплоть до люкса', tone: 'good' };
}

/** Примерная доля пали среди принесённого — её стоит показывать честно. */
export function fakeShare(S) {
  return clamp(0.47 - 0.27 * pull(S), 0.18, 0.47);
}

/** Кто и зачем несёт вещь. */
const WHY = [
  { id: 'money', text: 'Срочно нужны деньги, отдам быстро.', k: [0.3, 0.45], patience: 'soft' },
  { id: 'moving', text: 'Переезжаю, разбираю шкаф. Что не нужно — продаю.', k: [0.35, 0.55], patience: 'soft' },
  { id: 'gift', text: 'Подарили, но не моё. Хочу поменять на деньги.', k: [0.4, 0.6], patience: 'normal' },
  { id: 'size', text: 'Не подошёл размер, возврат уже не сделать.', k: [0.45, 0.65], patience: 'normal' },
  { id: 'bored', text: 'Надоело, висит без дела.', k: [0.4, 0.62], patience: 'normal' },
  { id: 'reseller', text: 'Сам беру-продаю, но это зависло. Отдам с запасом тебе.', k: [0.5, 0.7], patience: 'hard' },
];

/**
 * Создаёт человека, который пришёл к тебе с вещью.
 * Возвращает объявление в том же формате, что и на Авитке, — поэтому
 * весь торг, осмотр и встреча работают без изменений.
 */
export function makeIncoming(S, rng) {
  const p = pull(S);

  // Что именно тебе готовы принести. Про скупщика олимпиек никто не подумает,
  // что ему можно предложить Биркин, — а про известного перекупа подумает.
  // Поэтому потолок цены растёт и от капитала, и от канала: один и тот же час
  // встречи на большом канале стоит в разы дороже.
  const cap = Math.max(9000, netWorth(S) * (0.35 + 1.05 * p));
  const pool = MODELS.filter((m) => m.rt * 1.1 <= cap || m.tier === 'mass');
  const model = rng.weighted(pool.length ? pool : MODELS, (m) => {
    // Читатели канала знают, что ты берёшь, — чем сильнее канал, тем точнее
    // несут ликвид, а не то, что просто валялось дома.
    let w = (m.noname ? 0.5 - 0.35 * p : 1) * Math.pow(0.3 + S.market.h[m.i], 1 + 1.2 * p);
    // И тем серьёзнее вещи. На нулевом канале несут что попало, на большом —
    // дорогое: к известному скупщику с футболкой за полторы тысячи не поедут.
    w *= Math.pow(m.rt / 8000, 1.1 * p);
    if (m.tier === 'lux') w *= 0.15 + 0.5 * p;
    if (m.tier === 'prem') w *= 0.6 + 0.5 * p;
    return Math.max(0, w);
  });

  const cond = rng.weighted([0, 1, 2, 3], (c) => [0.1, 0.3, 0.37, 0.23][c]);
  // Паль несут и честно заблуждаясь, и сознательно. Но тот, кто читает твой
  // канал и верит тебе, знает, что ты проверяешь, — и подсовывать стесняется.
  const fakeRate = clamp(0.47 - 0.27 * p, 0.18, 0.47);
  const real = model.noname ? true : !rng.chance(fakeRate);
  const q = real ? 0 : rng.chance(0.55) ? rng.range(0.15, 0.5) : rng.range(0.5, 0.9);

  const item = makeItem(rng, model.i, { cond, real, q, hasBox: cond === 0 && rng.chance(0.5), boughtAt: S.t });
  if (cond > 0) hideDefects(rng, item, 0.5);

  const why = rng.pick(WHY);
  const shown = { ...item, cond: item.shownCond };
  const fair = valueOrig(S, shown);
  const ask = priceRound(Math.max(200, fair * rng.range(why.k[0], why.k[1])));

  // Тип продавца подбираем под причину: от этого зависит, какие ходы работают.
  const type = why.patience === 'soft' ? 'hurry' : why.patience === 'hard' ? 'shop' : 'owner';
  const seller = makeSeller(rng, type, ask, S.prog.skills.bargain);
  // Пришёл сам — уступает охотнее.
  seller.floor = priceRound(seller.floor * 0.92);
  seller.mood = 0.2;

  const listing = {
    id: nextListingId(),
    item,
    declared: 'orig',
    ask,
    fair,
    mode: 'meet',
    city: 'Москва',
    metro: rng.pick(METRO),
    postedAt: S.t,
    seller,
    signals: rollSignals(rng, type, ask / Math.max(1, fair), 'meet'),
    photosAsked: true, // фото он прислал сразу
    photoNote: 'Прислал фото сам',
    photoLegit: false,
    threadId: null,
    incoming: true,
    why: why.text,
    expiresAt: S.t + rng.int(20, 54),
    isDeal: ask < fair * 0.55,
  };
  listing.description =
    `${why.text} ${model.b} ${model.n}${item.size === 'One size' ? '' : `, размер ${item.size}`}. ` +
    `Состояние: ${['новое с биркой', 'как новое', 'хорошее', 'ношеное', 'убитое'][item.shownCond]}. ` +
    `Могу подъехать к м. ${listing.metro}.`;
  return listing;
}

export const greetingFor = (listing) =>
  `Привет! Увидел твоё объявление, что скупаешь шмот. ${listing.why} ` +
  `${MODELS[listing.item.m].b} ${MODELS[listing.item.m].n}, прошу ${priceRound(listing.ask).toLocaleString('ru-RU')} ₽. Интересно?`;
