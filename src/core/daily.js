// Дела на день от Тимура: три маленьких дела каждое утро и серия дней.
//
// Торговля сама даёт поводы зайти, но не даёт ритма. Три дела на день — это
// маленькие победы в каждой сессии и причина вернуться завтра: пропустил
// день — серия сгорела. Награды — не деньги и не опыт (опыт только за
// отзывы): талоны на бесплатный легит-чек и дни Хайп-радара PRO. Они
// экономят и подсказывают, но не печатают деньги — ранний баланс хрупкий.
//
// Дела выбираются своим генератором от сида и дня: основной поток случайности
// игры от них не сдвигается, а значит, не плывут и балансовые прогоны.

import { Rng, rngState } from './rng.js';
import { dayIndex, hourIndex, SCHEDULE } from './time.js';
import { installed, notify, touch, fx } from './kernel.js';
import { rub, plural } from './util.js';

/** Сколько постов игрок опубликовал в своём канале с момента t. */
const postsSince = (S, t) => (S.tg.posts || []).filter((p) => p.at >= t && p.kind !== 'scandal').length;

/**
 * Пул дел. stat — счётчик из S.stats, прирост которого считается; count —
 * свой способ посчитать. group — из одной группы в день не больше одного.
 * Только то, что игрок может сделать сам, без удачи: «закрой заказ» или
 * «найди дефект» сюда не годятся — заказа может просто не прийти.
 */
export const DAILY = [
  { id: 'sell', group: 'sell', n: () => 'Продай вещь', stat: 'sold', need: () => 1, w: 3 },
  { id: 'sell2', group: 'sell', n: () => 'Продай две вещи', stat: 'sold', need: () => 2, lvl: 4, w: 2 },
  {
    id: 'profit',
    group: 'money',
    n: (t) => `Заработай на продажах ${rub(t.need)}`,
    stat: 'profit',
    need: (S) => Math.round((1500 + 700 * S.prog.lvl) / 500) * 500,
    w: 2,
  },
  { id: 'inspect', group: 'eye', n: () => 'Осмотри три признака у вещей', stat: 'inspections', need: () => 3, w: 2 },
  { id: 'legit', group: 'eye', n: () => 'Проверь вещь легит-чеком', stat: 'legitChecks', need: () => 1, w: 1 },
  { id: 'meet', group: 'buy', n: () => 'Встреться с продавцом у метро', stat: 'meetings', need: () => 1, app: 'avito', w: 2 },
  { id: 'second', group: 'buy', n: () => 'Купи вещь в секонде', stat: 'secondBuys', need: () => 1, app: 'second', w: 2 },
  { id: 'poizon', group: 'buy', n: () => 'Закажи что-нибудь на Пойзоне', stat: 'poizonOrders', need: () => 1, app: 'poizon', lvl: 3, w: 1 },
  {
    id: 'post',
    group: 'channel',
    n: () => 'Опубликуй пост в своём канале',
    count: (S, t) => postsSince(S, t.at),
    need: () => 1,
    app: 'tg',
    when: (S) => S.tg.has,
    w: 2,
  },
];

const DEF = Object.fromEntries(DAILY.map((d) => [d.id, d]));
export const PER_DAY = 3;

/** Награды за серию: на 3-й, 5-й, 7-й, 10-й, 14-й день, дальше каждую неделю. */
const MILESTONES = {
  3: { legit: 1 },
  5: { pro: 2 },
  7: { legit: 2 },
  10: { pro: 3 },
  14: { legit: 2, pro: 4 },
};
export function streakReward(n) {
  if (MILESTONES[n]) return MILESTONES[n];
  if (n > 14 && n % 7 === 0) return { legit: 1, pro: 3 };
  return null;
}
/** Ближайшая награда впереди: на каком дне серии и что. */
export function nextReward(streak) {
  for (let n = streak + 1; n < streak + 30; n++) {
    const r = streakReward(n);
    if (r) return { at: n, r };
  }
  return null;
}
export function rewardText(r) {
  const parts = [];
  if (r.legit) parts.push(r.legit === 1 ? 'талон на легит-чек' : `${r.legit} талона на легит-чек`);
  if (r.pro) parts.push(`${r.pro} дн. Хайп-радара PRO`);
  return parts.join(' и ');
}

export const dailyLabel = (S, t) => DEF[t.id].n(t);

/** Сколько уже сделано по делу. */
export function progressOf(S, t) {
  const d = DEF[t.id];
  if (!d) return 0;
  const v = d.count ? d.count(S, t) : (S.stats[d.stat] || 0) - t.base;
  return Math.max(0, Math.min(t.need, v));
}

/**
 * Дела начинаются со второго дня: в первый день у игрока есть Тимур, а глава
 * «Авитка» кончается поздно вечером — три дела на два часа до сна ни к чему.
 */
function started(S, day) {
  if (!S.tut) return true;
  const end = S.tut.ended && S.tut.ended.avito;
  if (end !== undefined) return day > dayIndex(end);
  return !!S.tut.done;
}

function rollDaily(S, day) {
  const D = S.daily;
  // Вчера не закрыл все три — серия сгорела.
  // Новый сезон: серия перенесена, день старого сезона засчитан как вчерашний.
  if (D.carried !== undefined) {
    delete D.carried;
    D.lastFull = day - 1;
  }
  if (D.streak && D.lastFull < day - 1) {
    D.lost = D.streak;
    D.streak = 0;
  } else D.lost = 0;
  const rng = new Rng(rngState(((S.seed || 1) * 131 + day * 7919) >>> 0));
  const pool = DAILY.filter(
    (d) => (!d.app || installed(S, d.app)) && (!d.lvl || S.prog.lvl >= d.lvl) && (!d.when || d.when(S)),
  );
  const picked = [];
  const groups = new Set();
  for (let k = 0; k < PER_DAY; k++) {
    const left = pool.filter((d) => !groups.has(d.group) && !picked.includes(d));
    if (!left.length) break;
    const d = rng.weighted(left, (x) => x.w);
    picked.push(d);
    groups.add(d.group);
  }
  D.day = day;
  D.tasks = picked.map((d) => ({
    id: d.id,
    need: d.need(S),
    base: d.stat ? S.stats[d.stat] || 0 : 0,
    at: S.t,
    done: false,
  }));
}

function grant(S, r) {
  const D = S.daily;
  if (r.pro && !installed(S, 'tg')) r = { legit: (r.legit || 0) + 1 };
  if (r.legit) D.legitFree = (D.legitFree || 0) + r.legit;
  if (r.pro) {
    S.tg.proUntil = Math.max(S.tg.proUntil, S.t) + r.pro * 24;
    S.tg.proGift = 'серия дел Тимура';
  }
}

/**
 * Проверить дела после любого действия и раз в час. Утром — новые дела.
 * Возвращает true, если что-то поменялось.
 */
export function updateDaily(S) {
  if (!S.daily) return false;
  const D = S.daily;
  const day = dayIndex(S.t);
  if (!started(S, day)) return false;
  let changed = false;
  if (D.day !== day && hourIndex(S.t) >= SCHEDULE.wakeHour) {
    rollDaily(S, day);
    changed = true;
  }
  if (D.day !== day) return changed;
  let fresh = 0;
  for (const t of D.tasks) {
    if (t.done || progressOf(S, t) < t.need) continue;
    t.done = true;
    fresh++;
    changed = true;
  }
  if (fresh) {
    const n = D.tasks.filter((t) => t.done).length;
    if (n < D.tasks.length) {
      notify(S, { route: 'goals', title: 'Дело сделано', text: `${n} из ${D.tasks.length} на сегодня` });
      fx('task');
    } else if (D.lastFull !== day) {
      D.streak = (D.lastFull === day - 1 ? D.streak : 0) + 1;
      D.best = Math.max(D.best || 0, D.streak);
      D.lastFull = day;
      D.lost = 0;
      const r = streakReward(D.streak);
      if (r) grant(S, r);
      fx('streak');
      notify(S, {
        route: 'goals',
        title: `🔥 Серия ${D.streak} ${plural(D.streak, 'день', 'дня', 'дней')}`,
        text: r ? `Все дела на сегодня закрыты · ${rewardText(r)}` : 'Все дела на сегодня закрыты. Завтра — новые.',
      });
    }
  }
  if (changed) touch(S);
  return changed;
}

/** Бесплатный легит-чек по талону: есть ли он сейчас. */
export const hasLegitTicket = (S) => !!(S.daily && S.daily.legitFree > 0);

export function useLegitTicket(S) {
  if (!hasLegitTicket(S)) return false;
  S.daily.legitFree--;
  return true;
}

/** Для экрана: сколько дел сегодня не сделано (бейдж на «Целях»). */
export function dailyLeft(S) {
  const D = S.daily;
  if (!D || D.day !== dayIndex(S.t)) return 0;
  return D.tasks.filter((t) => !t.done).length;
}

export const emptyDaily = () => ({ day: -1, tasks: [], streak: 0, best: 0, lastFull: -9, lost: 0, legitFree: 0 });
