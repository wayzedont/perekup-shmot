// Ядро состояния: деньги, опыт, уведомления, переписки.
// Ничего игрового здесь нет — только аккуратные операции над состоянием.

import { Rng } from './rng.js';
import { rub } from './util.js';
import { REVIEW_XP, xpToNext, MAX_LEVEL, MAX_SKILL } from './data/progress.js';
import { TIERS } from './data/catalog.js';
import { APP_DEFS } from './data/apps.js';

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

/**
 * tut — уведомление из сценария обучения: только такие показываются
 * баннером, пока идёт обучение (остальные тихо ложатся в шторку).
 * sticky — баннер не уезжает сам, пока его не нажмут.
 */
export function notify(S, { route, title, text, scope, icon, tut, sticky }) {
  // Приложения нет на телефоне — нет и его уведомлений: завоз в секонде не
  // дразнит, пока Тимур про секонд не рассказал, а сообщение, которое не
  // открыть, не висит в шторке.
  const head = route ? route.split('/')[0] : null;
  const app = head === 'chan' ? 'tg' : head;
  if (app && APP_DEFS[app] && !installed(S, app) && !tut) return null;
  const n = {
    id: S.nextNotifId++,
    route: route || null,
    title: title || '',
    text: text || '',
    scope: scope || 'system',
    icon: icon || null,
    at: S.t,
  };
  if (tut) n.tut = true;
  if (sticky) n.sticky = true;
  S.notif.unshift(n);
  trimNotifications(S);
  if (S.onNotify) S.onNotify(n);
  touch(S);
  return n;
}

const MAX_NOTIF = 80;

/**
 * Журнал не бесконечный, но клиентские уведомления из него не выпадают:
 * раньше ежечасные «Дёшево: …» с Авитки выталкивали из шторки сообщение
 * покупателя, а требование — ни одно сообщение клиента не теряется.
 * Сначала уходят самые старые системные.
 */
function trimNotifications(S) {
  let extra = S.notif.length - MAX_NOTIF;
  for (let i = S.notif.length - 1; i >= 0 && extra > 0; i--) {
    if (S.notif[i].scope !== 'client') {
      S.notif.splice(i, 1);
      extra--;
    }
  }
  if (extra > 0) S.notif.length = MAX_NOTIF;
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

/**
 * Пока идёт обучение, деньги на карте — деньги клиентов Тимура. Тратить их
 * на постороннее нельзя, иначе заказ не на что купить и сценарий встаёт.
 * allow — это учебное действие, его пропускаем. Возвращает true, если
 * действие запрещено.
 */
export function tutorialLock(S, allow) {
  if (!S.tut || !S.tut.active || allow) return false;
  toast(S, S.tut.part === 'avito' ? 'Тимур: сначала заказы клиентов — остальное потом' : 'Тимур: погоди, дослушай — пять минут, и всё твоё');
  return true;
}

/* ======================= ПРИЛОЖЕНИЯ ======================= */
// Что стоит на телефоне. Без `S.apps` (состояние из старых тестов) — всё.

/* ======================= ЗВУК И ВИБРАЦИЯ ======================= */
// Ядро не знает про динамики: оно только сообщает о моменте («продажа»,
// «паль»), а интерфейс решает, как его сыграть. У ботов и тестов слушателей
// нет — вызов ничего не стоит.
const fxListeners = [];
export function onFx(fn) {
  fxListeners.push(fn);
}
export function fx(name) {
  for (const f of fxListeners) {
    try {
      f(name);
    } catch (e) {
      /* звук не должен ронять игру */
    }
  }
}

export const installed = (S, id) => !S.apps || !!S.apps[id];

const AUTO_TEXT = {
  parcels: 'всё, что едет, и когда приедет',
  notebook: 'по чему палится каждая модель — копится само',
  shop: 'уровень, отзывы, навыки и склады',
};

/** Поставить приложение. Возвращает true, если его не было. */
export function installApp(S, id) {
  if (!S.apps || !APP_DEFS[id] || S.apps[id]) return false;
  S.apps[id] = { at: S.t, fresh: true };
  if (APP_DEFS[id].how === 'auto') {
    notify(S, { route: id, title: 'Новое приложение: ' + APP_DEFS[id].n, text: AUTO_TEXT[id] || '' });
  }
  touch(S);
  return true;
}

/** Действие из приложения, которого нет: подсказка и запрет. */
export function needApp(S, id) {
  if (installed(S, id)) return false;
  const def = APP_DEFS[id];
  toast(S, def && def.how === 'store' ? `Сначала скачай «${def.n}» в Апсторе` : `Нет приложения «${def ? def.n : id}»`);
  return true;
}

/**
 * Приложения, которые ставятся сами, когда становятся нужны. Отзывы и
 * книжка ставят своё приложение прямо в момент события (`addReview`,
 * `recordTruth`), здесь — то, что удобно проверить по состоянию.
 */
export function syncApps(S) {
  if (!S.apps) return;
  if (!S.apps.parcels && S.shipments.length) installApp(S, 'parcels');
  if (!S.apps.shop && S.rep.reviews.length) installApp(S, 'shop');
  if (!S.apps.notebook) {
    for (const k in S.notebook) {
      if (S.notebook[k].checked) {
        installApp(S, 'notebook');
        break;
      }
    }
  }
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

/**
 * Убрать вещь из шкафа вместе со всеми, кто о ней пишет.
 * Одна функция на все пути — продажа, заказ, розыгрыш, скупщик, спор: в
 * розыгрыше и споре закрыть переписки забыли, и покупатель торговался за
 * вещь, которой уже не было. `except` — переписка, которая закроется сама.
 */
export function dropItem(S, item, except) {
  S.items = S.items.filter((x) => x !== item);
  closeBuyersOf(S, item, except, 'Вещь уже продана');
}

/** Закрыть переписки покупателей об этой вещи: она продана или снята. */
export function closeBuyersOf(S, item, except, line) {
  for (const th of S.threads) {
    if (th === except || th.closed || th.kind !== 'buyer') continue;
    if (th.data.buyer && th.data.buyer.item === item.id) {
      // Учебного покупателя не прогоняем, пока идёт обучение.
      if (th.data.buyer.tut && S.tut && S.tut.active && line !== 'Вещь уже продана') continue;
      closeThread(S, th, line || 'Вещь снята с продажи');
    }
  }
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
  // Тимур пишет в Телегу: пока её нет, советы ждут в очереди.
  if (!installed(S, 'tg')) return false;
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
  // Первый отзыв ставит «Магазин»: там рейтинг, отзывы и уровень.
  installApp(S, 'shop');
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
