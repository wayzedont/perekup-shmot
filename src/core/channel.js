// Свой канал в Телеге.
//
// Аудитория и доверие — две разные шкалы. Можно нагнать десять тысяч подписчиков
// рекламой и при этом иметь нулевое доверие: тогда они просто смотрят.
// Покупают там, где верят.

import { clamp } from './util.js';
import { ratingOf } from './economy.js';
import { MODELS } from './data/models.js';
import { AD_CHANNELS } from './data/content.js';
import { itemName, sizeLabel, shownCondition } from './items.js';
import { rub } from './util.js';

export function createChannel(S, name) {
  S.tg.has = true;
  S.tg.name = name;
  S.tg.subs = 9;
  S.tg.trust = 60;
  S.tg.lastPost = S.t;
  S.tg.posts = [
    {
      at: S.t,
      kind: 'hello',
      text: `Всем привет! Это ${name}. Оригинальные шмотки по нормальным ценам, без палева. Скоро первые позиции 🔥`,
    },
  ];
}

export function post(S, kind, text, extra) {
  S.tg.posts.unshift({ at: S.t, kind, text, ...(extra || {}) });
  if (S.tg.posts.length > 60) S.tg.posts.length = 60;
  S.tg.lastPost = S.t;
}

export function postItem(S, item) {
  const price = item.sale.price;
  const head = item.sale.asOrig ? '🔥 В наличии' : '⚡ Реплика, качество топ';
  post(
    S,
    'item',
    `${head}: ${itemName(item)}\nРазмер ${sizeLabel(item)} · ${shownCondition(item).short}\n${rub(price)} · пишите в личку`,
    { item: item.id },
  );
  item.sale.postedAt = S.t;
}

/**
 * Ежедневная жизнь канала.
 *
 * Рост складывается из двух вещей. Первая — приток от того, что канал живой:
 * есть свежие посты, есть что смотреть, у продавца приличный рейтинг. Он
 * не зависит от размера, поэтому маленький канал тоже растёт — раньше там
 * было плоское «плюс ноль-два в день» независимо ни от чего, и первые
 * двести подписчиков набирались месяц, то есть вести канал в начале игры
 * не имело смысла. Вторая — сарафан, который пропорционален аудитории.
 */
export function dailyChannel(S, rng) {
  if (!S.tg.has) return null;
  const quiet = S.t - S.tg.lastPost;
  if (quiet > 48) {
    const rate = Math.max(0.008, 0.032 - 0.0028 * S.prog.skills.smm);
    const lost = Math.round(S.tg.subs * rate);
    S.tg.subs = Math.max(0, S.tg.subs - lost);
    if (lost) return { lost };
  } else {
    const rating = ratingOf(S);
    const rep = rating === null ? 0.7 : clamp(rating / 4.6, 0.35, 1.15);
    // Витрина важнее слов: пустой канал читать незачем.
    const shelf = clamp(S.items.filter((i) => i.sale && i.sale.tg).length / 6, 0.3, 1.4);
    const inflow = (4.5 + 1.1 * S.prog.skills.smm) * rep * shelf * (quiet <= 24 ? 1 : 0.6);
    const viral = S.tg.subs * 0.0055 * (S.tg.trust / 60);
    const growth = Math.round(inflow + viral) + rng.int(0, 2);
    S.tg.subs += growth;
    if (growth) return { gained: growth };
  }
  // Доверие медленно возвращается к норме.
  if (S.tg.trust < 60) S.tg.trust = clamp(S.tg.trust + 0.6, 0, 100);
  return null;
}

/** Подписчики с рекламы приходят в течение суток. */
export function tickAds(S, rng) {
  let total = 0;
  for (const run of S.tg.adRuns) {
    if (run.left <= 0) continue;
    const n = Math.min(run.left, Math.max(1, Math.round((run.total / 24) * rng.range(0.5, 1.5))));
    run.left -= n;
    S.tg.subs += n;
    total += n;
  }
  S.tg.adRuns = S.tg.adRuns.filter((r) => r.left > 0);
  return total;
}

export function buyAd(S, rng, index) {
  const ad = AD_CHANNELS[index];
  if (!ad) return null;
  const quality = ad.q * (1 + 0.1 * S.prog.skills.smm);
  // Пустой канал конвертит хуже: людям не на что смотреть.
  const contentK = S.tg.posts.length > 3 ? 1 : 0.55;
  const gained = Math.round(ad.subs * rng.range(0.006, 0.014) * quality * contentK);
  S.tg.adRuns.push({ total: gained, left: gained, name: ad.n });
  return { ad, gained };
}

export function trendPost(S, rng) {
  const top = MODELS.slice()
    .filter((m) => !m.noname)
    .sort((a, b) => S.market.h[b.i] - S.market.h[a.i])
    .slice(0, 3);
  const gained = Math.round((3 + S.tg.subs * rng.range(0.01, 0.03)) * (1 + 0.1 * S.prog.skills.smm));
  S.tg.subs += gained;
  S.tg.lastTrendPost = S.t;
  post(
    S,
    'trend',
    `🔥 Что сейчас носят:\n${top.map((m) => '• ' + m.b + ' ' + m.n).join('\n')}\nПишите в личку — достану любой размер.`,
  );
  return gained;
}

export function giveaway(S, rng, item, value) {
  const base = 40 + value / 32;
  const scale = S.tg.subs < 200 ? 1 : 1 + Math.log10(S.tg.subs / 200);
  const gained = Math.round(base * rng.range(0.7, 1.3) * (1 + 0.12 * S.prog.skills.smm) * scale);
  S.tg.adRuns.push({ total: gained, left: gained, name: 'розыгрыш' });
  S.tg.trust = clamp(S.tg.trust + 5, 0, 100);
  post(
    S,
    'giveaway',
    `🎁 РОЗЫГРЫШ: ${itemName(item)}, размер ${sizeLabel(item)}!\nПодпишись и сделай репост — итоги через сутки.`,
  );
  return gained;
}

export function scandal(S, reason) {
  const lost = Math.round(S.tg.subs * 0.15);
  S.tg.subs = Math.max(0, S.tg.subs - lost);
  S.tg.trust = clamp(S.tg.trust - 15, 0, 100);
  post(S, 'scandal', `💬 В комментариях разбор: подписчик пишет, что ему продали паль под видом оригинала.`);
  return lost;
}

export function trustLabel(trust) {
  if (trust >= 85) return { n: 'железное', tone: 'good' };
  if (trust >= 65) return { n: 'хорошее', tone: 'good' };
  if (trust >= 45) return { n: 'среднее', tone: 'flat' };
  if (trust >= 25) return { n: 'шаткое', tone: 'warn' };
  return { n: 'подорвано', tone: 'bad' };
}

export const PRO_PRICE = 1490;
export const PRO_DAYS = 7;
