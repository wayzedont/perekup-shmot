// Совместные дропы.
//
// В таблице перекупов до сих пор был живым только Мирон, остальные — строчки
// с цифрами. Коллаб превращает их в людей, с которыми можно договориться:
// они приводят свою аудиторию, ты делишь с ними тираж и выручку.
//
// Размен тут не «больше денег», а «больше денег, но не всё под твоим
// контролем». Крупный партнёр приведёт много людей, но заберёт львиную долю
// и будет диктовать цену. Мелкий возьмёт немного — зато может просто
// пропасть с твоей половиной товара. Чем мельче партнёр, тем выше этот риск,
// и в этом вся суть выбора: тот же компромисс, что между палью и оригиналом.

import { clamp } from '../util.js';
import { netWorth } from '../economy.js';
import { RIVAL_NAME } from '../rival.js';

/**
 * Собирает список тех, с кем вообще можно сделать коллаб.
 * Партнёр должен быть сопоставим: мелочь тебя не усилит, а гигант не
 * станет разговаривать.
 */
export function partners(S) {
  // «Калибр» для коллаба — это не банковский счёт, а то, сколько людей тебя
  // слушает. Перекуп с большим каналом интересен партнёру, даже если он сидит
  // в долгах; без аудитории не поможет и полный сейф.
  const mine = Math.max(20000, netWorth(S), (S.tg.subs || 0) * 300);
  const all = [
    ...S.bgRivals.map((r) => ({ name: r.name, nw: r.nw, rival: false })),
    { name: RIVAL_NAME, nw: S.rival.nw, rival: true },
  ];
  return all
    .filter((r) => r.nw >= mine * 0.25 && r.nw <= mine * 6)
    .map((r) => {
      const scale = clamp(r.nw / mine, 0.25, 6);

      // Сколько людей он приводит сверх твоей аудитории.
      const reach = clamp(0.35 + 0.55 * Math.log2(scale + 1), 0.35, 1.6);

      // Доля считается от того, сколько он приносит, плюс наценка за то, что
      // аудитория его. Наценка растёт, если он крупнее тебя: у него и
      // переговорная позиция сильнее. Из-за неё коллаб в среднем приносит
      // меньше, чем свой дроп, — и правильно: платишь за чужой охват и за то,
      // что рискуешь вдвое меньшими деньгами.
      const fair = reach / (1 + reach);
      const premium = clamp(0.05 + 0.05 * Math.log2(scale + 1), 0.05, 0.14);
      const share = clamp(fair + premium, 0.3, 0.68);

      // Риск — от веса партнёра в абсолюте, а не относительно тебя: кто
      // построил имя на миллионы, тем дорожит независимо от твоего капитала.
      // Мирон рискованнее любого при том же весе: вы друг другу не друзья.
      const fame = clamp(Math.log10(Math.max(1, r.nw) / 20000) / Math.log10(250), 0, 1);
      const risk = clamp((0.22 - 0.19 * fame) * (r.rival ? 1.6 : 1), 0.02, 0.3);
      return { ...r, share, reach, risk, scale };
    })
    .sort((a, b) => b.nw - a.nw);
}

export const findPartner = (S, name) => partners(S).find((p) => p.name === name) || null;

/** Словами: насколько партнёру можно верить. */
export function riskLabel(p) {
  if (p.risk < 0.07) return { n: 'репутацией дорожит', tone: 'good' };
  if (p.risk < 0.12) return { n: 'вроде надёжный', tone: 'flat' };
  if (p.risk < 0.2) return { n: 'мутноватый', tone: 'warn' };
  return { n: 'может кинуть', tone: 'bad' };
}

/** Чем он полезен — тоже словами. */
export function reachLabel(p) {
  if (p.reach >= 1.2) return 'приведёт больше людей, чем твой канал';
  if (p.reach >= 0.8) return 'почти удвоит аудиторию дропа';
  if (p.reach >= 0.5) return 'заметно добавит аудитории';
  return 'немного добавит аудитории';
}

export const COLLAB_COOLDOWN_DAYS = 10;

export function canCollab(S) {
  if (!S.flags.brand) return { ok: false, why: 'Сначала нужен свой бренд' };
  const last = S.brand.lastCollabAt || -99999;
  if (S.t - last < COLLAB_COOLDOWN_DAYS * 24) {
    const d = Math.ceil((COLLAB_COOLDOWN_DAYS * 24 - (S.t - last)) / 24);
    return { ok: false, why: `Повторно договариваться рано: ещё ${d} дн.` };
  }
  if (!partners(S).length) return { ok: false, why: 'Пока не с кем: нет перекупов твоего калибра' };
  return { ok: true };
}
