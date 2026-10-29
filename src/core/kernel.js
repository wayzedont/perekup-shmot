// Ядро состояния: деньги, опыт, уведомления, переписки.
// Ничего игрового здесь нет — только аккуратные операции над состоянием.

import { Rng } from './rng.js';
import { clamp, rub } from './util.js';
import { REVIEW_XP, xpToNext, statusOf, MAX_LEVEL, MAX_SKILL } from './data/progress.js';
import { TIERS } from './data/catalog.js';
import { MODELS } from './data/models.js';

/* ======================= БАЗА ======================= */

export const rngOf = (S) => new Rng(S.rng);

/** Пометить состояние изменённым — интерфейс перерисуется один раз за кадр. */
export function touch(S) {
  S.rev = (S.rev || 0) + 1;
}

/* ======================= ДЕНЬГИ ======================= */

export function pay(S, amount, reason) {
  S.money -= amount;
  S.tx.unshift({ at: S.t, amount: -amount, reason });
  if (S.tx.length > 120) S.tx.length = 120;
  touch(S);
}

export function earn(S, amount, reason) {
  S.money += amount;
  S.tx.unshift({ at: S.t, amount, reason });
  if (S.tx.length > 120) S.tx.length = 120;
  touch(S);
}

/** Проверка «хватает ли», с объяснением, если нет. */
export function canPay(S, amount) {
  if (S.money >= amount) return true;
  toast(S, `Не хватает ${rub(amount - S.money)}. Кредит — в «Банке»`);
  return false;
}

/* ======================= УВЕДОМЛЕНИЯ ======================= */
// Ни одно уведомление не теряется: всё падает в журнал, а баннеры
// показываются по очереди. Клиентские живут два дня, остальные сутки.

export function notify(S, { route, title, text, scope, icon }) {
  const n = {
    id: S.nextNotifId++,
    route: route || null,
    title: title || '',
    text: text || '',
    scope: scope || 'system',
    icon: icon || null,
    at: S.t,
  };
  S.notif.unshift(n);
  if (S.notif.length > 80) S.notif.length = 80;
  if (S.onNotify) S.onNotify(n);
  touch(S);
  return n;
}

/** Короткая подсказка без записи в журнал. */
export function toast(S, text) {
  if (S.onToast) S.onToast(text);
}

export function pruneNotifications(S) {
  S.notif = S.notif.filter((n) => {
    if (n.scope === 'client') {
      const m = n.route && n.route.match(/thread\/(\d+)/);
      if (m) {
        const th = findThread(S, +m[1]);
        if (!th || th.closed || th.hidden) return false;
      }
      return S.t - n.at < 48;
    }
    return S.t - n.at < 24;
  });
}

/* ======================= ПЕРЕПИСКИ ======================= */

export function newThread(S, { kind, name, sub, platform, data, pinned }) {
  const th = {
    id: (S.nextThreadId = (S.nextThreadId || 0) + 1),
    kind,
    name,
    sub: sub || '',
    platform: platform || 'tg',
    messages: [],
    unread: 0,
    lastAt: S.t,
    closed: false,
    hidden: false,
    pinned: !!pinned,
    data: data || {},
  };
  S.threads.unshift(th);
  touch(S);
  return th;
}

/** Длинная переписка никому не нужна целиком, а в сейве занимает место. */
const MAX_MESSAGES = 80;

export function say(S, th, from, text, extra) {
  th.messages.push({ from, text, at: S.t, ...(extra || {}) });
  // Вечные диалоги — с Тимуром и с Мироном — иначе растут весь сезон.
  if (th.messages.length > MAX_MESSAGES) th.messages.splice(0, th.messages.length - MAX_MESSAGES);
  th.lastAt = S.t;
  if (from === 'them' && !(S.ui.view === 'thread' && S.ui.id === th.id)) th.unread++;
  touch(S);
}

export const findThread = (S, id) => S.threads.find((t) => t.id === +id);

export function closeThread(S, th, finalLine) {
  if (!th || th.closed) return;
  if (finalLine) say(S, th, 'system', finalLine);
  th.closed = true;
  th.unread = 0;
  touch(S);
}

/** Диалог виден в списке, пока он живой или непрочитанный. */
export const threadVisible = (S, th) =>
  !th.hidden && (th.pinned || !th.closed || th.unread > 0 || (S.ui.view === 'thread' && S.ui.id === th.id));

/** Сколько КЛИЕНТОВ написали — именно клиентов, а не сообщений. */
export function unreadPeople(S, platform) {
  return S.threads.filter((t) => t.platform === platform && t.unread > 0 && !t.hidden).length;
}

export function unreadChannels(S) {
  let n = 0;
  for (const k of Object.keys(S.channels)) if (S.channels[k].unread > 0) n++;
  for (const k of Object.keys(S.suppliers)) if (S.suppliers[k].unread > 0) n++;
  return n;
}

export function mentorThread(S) {
  return S.threads.find((t) => t.kind === 'mentor');
}

export function mentorSay(S, text) {
  const th = mentorThread(S);
  if (!th) return;
  say(S, th, 'them', text);
  notify(S, { route: 'tg/thread/' + th.id, title: 'Тимур', text, scope: 'client' });
}

/**
 * Подсказка наставника, которая срабатывает один раз.
 *
 * Встаёт в очередь, а не вываливается сразу. Иначе за одну минуту можно
 * получить три сообщения подряд: выставил вещь — подсказка, пришёл лот —
 * подсказка, Мирон забрал вещь — ещё одна. Живой человек так не пишет, да и
 * читать это невозможно. Флаг ставится сразу, поэтому повториться она не
 * может, даже если доставка отложится на час.
 */
export function mentorOnce(S, flag, text, opts) {
  if (S.flags[flag]) return false;
  S.flags[flag] = 1;
  if (!S.mentorQueue) S.mentorQueue = [];
  // Шаги онбординга идут вперёд очереди: иначе случайная подсказка про
  // ликвидность приезжает раньше, чем то, к чему она следует, и разговор
  // читается задом наперёд.
  if (opts && opts.first) S.mentorQueue.unshift(text);
  else S.mentorQueue.push(text);
  touch(S);
  return true;
}

/** Отдаёт из очереди одно сообщение. Вызывается раз в игровой час. */
export function mentorFlush(S) {
  if (!S.mentorQueue || !S.mentorQueue.length) return false;
  mentorSay(S, S.mentorQueue.shift());
  return true;
}

/* ======================= ОПЫТ И УРОВНИ ======================= */

export function addXp(S, amount, onLevel) {
  S.prog.xp = Math.max(0, S.prog.xp + Math.round(amount));
  let leveled = 0;
  while (S.prog.lvl < MAX_LEVEL && S.prog.xp >= xpToNext(S.prog.lvl)) {
    S.prog.xp -= xpToNext(S.prog.lvl);
    S.prog.lvl++;
    S.prog.sp++;
    leveled++;
    if (onLevel) onLevel(S.prog.lvl);
  }
  touch(S);
  return leveled;
}

/** Опыт за отзыв с поправкой на сегмент: расти выгоднее, чем гриндить футболки. */
export function reviewXp(stars, tierKey) {
  const base = REVIEW_XP[stars] || 0;
  const k = TIERS[tierKey] ? TIERS[tierKey].xp : 1;
  return base >= 0 ? base * k : base * Math.max(1, k * 0.8);
}

export function addReview(S, { stars, weight, text, platform, tierKey }, onLevel) {
  S.rep.reviews.unshift({ stars, weight: weight || 1, text, platform, at: S.t });
  if (S.rep.reviews.length > 100) S.rep.reviews.length = 100;
  const xp = reviewXp(stars, tierKey || 'street');
  addXp(S, xp, onLevel);
  touch(S);
  return xp;
}

export function spendSkillPoint(S, key) {
  if (S.prog.sp <= 0) return false;
  if (S.prog.skills[key] >= MAX_SKILL) return false;
  S.prog.sp--;
  S.prog.skills[key]++;
  touch(S);
  return true;
}

export function unlock(S, key) {
  if (S.prog.unlocks[key]) return false;
  S.prog.unlocks[key] = S.t;
  touch(S);
  return true;
}

/* ======================= ОТЛОЖЕННЫЕ СОБЫТИЯ ======================= */

export function schedule(S, at, type, data) {
  S.pending.push({ at, type, done: false, ...data });
}

/* ======================= СТАТИСТИКА ======================= */

export function bump(S, key, by) {
  S.stats[key] = (S.stats[key] || 0) + (by === undefined ? 1 : by);
}

export const statusLabel = (S) => statusOf(S.prog.lvl);

export const tierOfModel = (mi) => MODELS[mi].tier;
