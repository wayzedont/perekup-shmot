// Оболочка телефона: рендер, строка состояния, главный экран,
// баннеры, шторка уведомлений и жесты.

import { esc, rub, num, shortNum, plural } from '../core/util.js';
import { dateLabel, clockLabel, agoLabel, hourIndex, nextRestock, SCHEDULE } from '../core/time.js';
import { netWorth, capacity, usedSlots, ratingOf, hypePct } from '../core/economy.js';
import { unreadPeople, unreadChannels, pruneNotifications, touch } from '../core/kernel.js';
import { nextGoal } from '../core/goals.js';
import { seasonProgress, seasonDaysLeft } from '../core/events.js';
import { raffleTitle } from '../core/market/raffle.js';
import { markSeen } from '../core/market/avito.js';
import { $, icon, APPS, APP_BY_ID, DOCK } from './dom.js';

/* ======================= СОСТОЯНИЕ ОБОЛОЧКИ ======================= */

export const UI = {
  S: null,
  views: {},
  actions: {},
  lastRev: -1,
  lastKey: '',
  queue: [],
  current: null,
  bannerTimer: null,
  toastTimer: null,
  save: () => {},
};

export function registerApp(id, mod) {
  UI.views[id] = mod.view;
  if (mod.actions) Object.assign(UI.actions, mod.actions);
}

export function registerActions(map) {
  Object.assign(UI.actions, map);
}

/* ======================= РЕНДЕР ======================= */

/**
 * Перерисовка откладывается до ближайшего кадра, но не только до него.
 *
 * Раньше здесь был голый requestAnimationFrame, и это намертво вешало игру на
 * телефоне. Браузер приостанавливает кадры, когда вкладка уходит в фон,
 * гаснет экран или система решает сэкономить батарею. Нажатие в этот момент
 * выставляло флаг, кадр не приходил никогда, и дальше КАЖДЫЙ вызов выходил по
 * `if (frame) return` — экран замирал навсегда, и работала только полоска
 * «домой». Поэтому рядом с кадром всегда висит обычный таймер: что сработает
 * первым, то и рисует.
 */
let frame = null;
let timer = null;

function clearPending() {
  if (frame) cancelAnimationFrame(frame);
  if (timer) clearTimeout(timer);
  frame = null;
  timer = null;
}

export function scheduleRender() {
  if (frame || timer) return;
  const run = () => {
    clearPending();
    render();
  };
  frame = requestAnimationFrame(run);
  timer = setTimeout(run, 80);
}

/**
 * Пока игрок возится с выпадающим списком или полем ввода, перерисовывать
 * нельзя: `innerHTML` заменяет весь экран, и список захлопывается сам собой.
 * Именно отсюда брались «нажал „все модели“, оно открылось и закрылось» и
 * «листнул категории, а они вернулись обратно».
 */
function busyWithInput() {
  const a = document.activeElement;
  if (!a) return false;
  if (/INPUT|SELECT|TEXTAREA/.test(a.tagName)) return true;
  return false;
}

/**
 * Пока список прокручивается — тоже не перерисовываем.
 *
 * На компьютере это незаметно, а на телефоне видно рывок в конце прокрутки.
 * Причина в том, что перерисовка заменяет экран целиком и возвращает
 * прокрутку на то место, где она была в момент замера. Палец в этот момент
 * уже уехал дальше, инерция продолжается — и позиция дёргается назад. Хуже
 * всего в самом конце списка, где к этому добавляется отскок края.
 *
 * Поэтому ждём, пока прокрутка успокоится. Время идёт как шло, ждёт только
 * перерисовка.
 */
const SCROLL_SETTLE = 220;
/** Насколько палец должен проехать, чтобы это считалось прокруткой, а не тычком. */
const DRAG_SLOP = 8;

let dragging = false;
let lastScrollAt = 0;

function busyScrolling() {
  return dragging || Date.now() - lastScrollAt < SCROLL_SETTLE;
}

export function render() {
  const S = UI.S;
  if (!S) return;
  if (busyWithInput() || busyScrolling()) {
    // Перерисуем, как только список закроется или прокрутка встанет:
    // слушатели ниже разбудят, а если нет — следующий тик часов.
    UI.dirty = true;
    return;
  }
  UI.dirty = false;
  UI.lastRev = S.rev;
  const screen = $('#screen');
  const key = S.ui.app + '/' + S.ui.view + '/' + S.ui.id;
  const prevBody = screen.querySelector('.body');
  const keepScroll = key === UI.lastKey && prevBody ? prevBody.scrollTop : 0;
  // Горизонтальные ленты категорий и вкладок тоже держат прокрутку, иначе
  // она отскакивает в начало на каждом игровом тике.
  const keepStrips = key === UI.lastKey ? [...screen.querySelectorAll('.chips, .tabs')].map((el) => el.scrollLeft) : [];

  renderStatusbar(S);
  // Ошибка внутри одного экрана не должна убивать игру целиком. Раньше
  // исключение при отрисовке оставляло пустой `#screen`, и дальше не
  // нажималось вообще ничего, кроме полоски «домой», — прогресс при этом был
  // цел, но добраться до него было нельзя. Теперь падает только этот экран,
  // а из него есть выход.
  try {
    screen.innerHTML = S.ui.app ? renderApp(S) : renderHome(S);
  } catch (e) {
    console.error('Ошибка отрисовки экрана', S.ui.app, S.ui.view, e);
    screen.innerHTML = `<div class="app" style="--acc:#b23b3b;--acc-ink:#fff;--acc-text:#b23b3b">
      <div class="app-head"><button class="back" data-act="back" aria-label="Назад">‹</button><h1>Ошибка экрана</h1></div>
      <div class="body">
        <div class="callout danger">Этот экран не отрисовался: ${esc(String((e && e.message) || e))}</div>
        <div class="muted">Прогресс цел и сохранён. Вернись назад или на главный экран — остальная игра работает.</div>
        <button class="btn full" data-act="goHome">На главный экран</button>
      </div></div>`;
  }

  const body = screen.querySelector('.body');
  if (body) {
    if (S.ui.view === 'thread') body.scrollTop = body.scrollHeight;
    else body.scrollTop = keepScroll;
  }
  if (keepStrips.length) {
    const strips = screen.querySelectorAll('.chips, .tabs');
    for (let i = 0; i < strips.length && i < keepStrips.length; i++) {
      if (keepStrips[i]) strips[i].scrollLeft = keepStrips[i];
    }
  }
  if (!S.ui.app) fitHome();
  UI.lastKey = key;
}

/**
 * Следим за тем, когда перерисовывать нельзя, и дорисовываем отложенное,
 * как только станет можно.
 */
export function bindInputGuards() {
  const wake = () => {
    if (UI.dirty) scheduleRender();
  };
  const later = () => setTimeout(wake, 0);

  document.addEventListener('focusout', later, true);
  document.addEventListener('change', later, true);

  // Событие прокрутки не всплывает, но до слушателя на фазе перехвата
  // доходит из любого вложенного элемента — поэтому один слушатель покрывает
  // и списки, и ленты категорий, которые пересоздаются при каждой отрисовке.
  document.addEventListener(
    'scroll',
    () => {
      lastScrollAt = Date.now();
      setTimeout(wake, SCROLL_SETTLE + 20);
    },
    true,
  );

  // Пока палец ВЕДЁТ, не перерисовываем вовсе: иначе список уезжает из-под
  // пальца. Но простой тычок задерживать нельзя — иначе каждое нажатие
  // отвечало бы через четверть секунды, и игра казалась бы тормозной.
  // Поэтому прокруткой считается только движение дальше нескольких пикселей.
  let sx = 0;
  let sy = 0;
  document.addEventListener(
    'touchstart',
    (e) => {
      const t = e.touches && e.touches[0];
      sx = t ? t.clientX : 0;
      sy = t ? t.clientY : 0;
      dragging = false;
    },
    { passive: true, capture: true },
  );
  document.addEventListener(
    'touchmove',
    (e) => {
      if (dragging) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - sx) > DRAG_SLOP || Math.abs(t.clientY - sy) > DRAG_SLOP) {
        dragging = true;
        lastScrollAt = Date.now();
      }
    },
    { passive: true, capture: true },
  );
  const release = () => {
    if (dragging) {
      // Палец отпустили на ходу — дальше пойдёт инерция, ждём её конца.
      lastScrollAt = Date.now();
      setTimeout(wake, SCROLL_SETTLE + 20);
    } else {
      // Это был тычок: рисуем сразу, без задержки.
      later();
    }
    dragging = false;
  };
  document.addEventListener('touchend', release, { passive: true, capture: true });
  document.addEventListener('touchcancel', release, { passive: true, capture: true });
}

/**
 * Главный экран обязан помещаться целиком: он не прокручивается.
 * Поэтому после отрисовки замеряем и, если нужно, ужимаем —
 * сначала умеренно, потом сильно. Работает на любом размере экрана.
 */
function fitHome() {
  const home = document.querySelector('.home');
  if (!home) return;
  home.classList.remove('compact', 'tiny');
  const overflows = () => home.scrollHeight > home.clientHeight + 1;
  if (!overflows()) return;
  home.classList.add('compact');
  if (!overflows()) return;
  home.classList.remove('compact');
  home.classList.add('tiny');
}

function renderStatusbar(S) {
  const bar = $('#statusbar');
  const dark = !S.ui.app;
  bar.className = dark ? 'on-dark' : 'on-light';
  $('#homebar').className = dark ? 'on-dark' : '';
  const speed = S.ui.speed > 1 ? `<span class="speed">×${S.ui.speed}</span>` : '';
  bar.innerHTML = `<button class="clock" data-act="timeSheet" aria-label="Время и ожидание">${clockLabel(S.t, S.min)}</button>
    <div class="right">${speed}<span>5G</span><span class="batt"><i></i></span></div>`;
}

function renderApp(S) {
  const app = APP_BY_ID[S.ui.app];
  const view = UI.views[S.ui.app];
  const V = (view ? view(S) : null) || { body: '<div class="empty">Пока пусто</div>' };
  const accText = app.text || app.bg;
  return `<div class="app" style="--acc:${app.bg};--acc-ink:${app.ink || '#fff'};--acc-text:${accText}">
    <div class="app-head">
      <button class="back" data-act="back" aria-label="Назад">‹</button>
      <h1>${esc(V.title || app.n)}</h1>
      <div class="head-aside">${V.aside || ''}</div>
    </div>
    ${V.tabs || ''}
    <div class="body">${V.body || ''}</div>
    ${V.foot ? `<div class="foot">${V.foot}</div>` : ''}
  </div>`;
}

/* ======================= ГЛАВНЫЙ ЭКРАН ======================= */

function badgeFor(S, id) {
  if (id === 'avito') return unreadPeople(S, 'avito');
  if (id === 'tg') return unreadPeople(S, 'tg') + unreadChannels(S);
  if (id === 'shop') return S.prog.sp;
  if (id === 'wardrobe') return S.items.filter((i) => i.protect && i.protect.until > S.t && i.verdict === 'unknown').length;
  if (id === 'parcels') return 0;
  return 0;
}

function appIcon(S, app) {
  const n = badgeFor(S, app.id);
  return `<button class="app-ico" data-act="openApp" data-app="${app.id}">
    <div class="tile" style="background:${app.bg}">${icon(app.id)}</div>
    <span>${esc(app.n)}</span>
    ${n ? `<span class="badge">${n > 99 ? '99+' : n}</span>` : ''}
  </button>`;
}

function renderHome(S) {
  const rating = ratingOf(S);
  const h = hourIndex(S.t);
  const forSale = S.items.filter((i) => i.sale).length;
  const tips = [];

  const goal = nextGoal(S);
  if (goal) {
    tips.push(`<button class="tip" data-act="openApp" data-app="goals">${icon('goals')}<span>Цель: <b>${esc(goal.n)}</b></span></button>`);
  }
  if (S.rep.banUntil > S.t) {
    tips.push(`<button class="tip" data-act="openApp" data-app="avito">${icon('alert')}<span>Авитка заблокирована до ${esc(dateLabel(S.rep.banUntil))}</span></button>`);
  }
  const restock = nextRestock(S.t);
  const dw = new Date(2026, 8, 7 + Math.floor(S.t / 24)).getDay();
  if ((dw === 1 || dw === 4) && h < 16) {
    tips.push(
      `<button class="tip" data-act="openApp" data-app="second">${icon('second')}<span>${
        h < 10 ? 'Сегодня в 10:00 завоз в секонде' : 'В секонде завоз — хорошее разбирают по часам'
      }</span></button>`,
    );
  }
  if (S.raffle && !S.raffle.done && !S.raffle.entered) {
    tips.push(
      `<button class="tip" data-act="openChannel" data-chan="drops">${icon('spark')}<span>Раффл: <b>${esc(raffleTitle(S.raffle))}</b></span></button>`,
    );
  }
  const hotOrders = S.threads.filter((t) => t.kind === 'order' && !t.closed).length;
  if (hotOrders) {
    tips.push(
      `<button class="tip" data-act="openApp" data-app="tg">${icon('user')}<span>Заказов в работе: <b>${hotOrders}</b></span></button>`,
    );
  }

  const seasonPct = Math.round(seasonProgress(S) * 100);
  const daysLeft = seasonDaysLeft(S);

  return `<div class="home">
    <div class="widget">
      <div class="widget-top">
        <div>
          <div class="w-date">${esc(dateLabel(S.t))}</div>
          <div class="w-clock" id="homeclock">${clockLabel(S.t, S.min)}</div>
        </div>
        <div class="w-stats">
          <span>${rating === null ? 'нет отзывов' : '★ ' + rating.toFixed(2)} · ур. ${S.prog.lvl}</span>
          <span>Шкаф ${usedSlots(S)}/${capacity(S)} · в продаже ${forSale}</span>
          <span>${S.shipments.length ? 'посылок ' + S.shipments.length : ''}${S.shipments.length && S.tg.has ? ' · ' : ''}${S.tg.has ? shortNum(S.tg.subs) + ' подп.' : ''}</span>
        </div>
      </div>
      <div class="w-season">
        <span>Сезон ${S.season.no}</span>
        <span class="track"><i style="width:${seasonPct}%"></i></span>
        <span>${daysLeft} ${plural(daysLeft, 'день', 'дня', 'дней')}</span>
      </div>
      <div class="w-btns">
        <button data-act="wait" data-h="1">+1 ч</button>
        <button data-act="wait" data-h="3">+3 ч</button>
        ${h >= 7 && h < 19 ? `<button data-act="wait" data-h="${19 - h}">До 19:00</button>` : ''}
        <button class="primary" data-act="sleep">Спать</button>
      </div>
    </div>
    <div class="app-grid">${APPS.map((a) => appIcon(S, a)).join('')}</div>
    <div class="tips">${tips.join('')}</div>
  </div>
  <div class="dock">${DOCK.map((id) => appIcon(S, APP_BY_ID[id])).join('')}</div>`;
}

/* ======================= НАВИГАЦИЯ ======================= */

export function go(app, view = 'main', id = null, push = true) {
  const S = UI.S;
  if (push && S.ui.app) S.ui.stack.push([S.ui.app, S.ui.view, S.ui.id]);
  if (!app) S.ui.stack = [];
  S.ui.app = app;
  S.ui.view = view;
  S.ui.id = id;
  if (view === 'main') S.ui.limit = 24;
  // Что игрок открыл — то он и видел. Мирон охотится именно за этим,
  // а в секонде важно, стоял ли игрок у полки в этот час.
  if (app === 'second') S.second.lastSeen = S.t;
  if (app === 'avito' && view === 'item' && id) markSeen(S, id);
  touch(S);
}

export function back() {
  const S = UI.S;
  const prev = S.ui.stack.pop();
  if (prev) {
    S.ui.app = prev[0];
    S.ui.view = prev[1];
    S.ui.id = prev[2];
    touch(S);
  } else {
    go(null);
  }
}

export function goRoute(route) {
  if (!route) return;
  const S = UI.S;
  if (route.startsWith('chan/')) {
    S.ui.channel = route.slice(5);
    S.ui.tgTab = 'channels';
    go('tg', 'channel', null);
    return;
  }
  const [app, view, id] = route.split('/');
  go(app, view || 'main', id ? +id : null);
}

/* ======================= ОКНА СНИЗУ ======================= */

export function sheet(html) {
  const el = $('#sheet');
  el.innerHTML = `<div class="sheet-card" role="dialog" aria-modal="true">${html}</div>`;
  el.hidden = false;
}

export function closeSheet() {
  const el = $('#sheet');
  el.hidden = true;
  el.innerHTML = '';
}

export const isSheetOpen = () => !$('#sheet').hidden;

/* ======================= ПОДСКАЗКИ ======================= */

export function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(UI.toastTimer);
  UI.toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

/* ======================= БАННЕРЫ ======================= */

export function pushNotification(n) {
  if (UI.queue.some((x) => x.id === n.id)) return;
  UI.queue.push(n);
  if (UI.queue.length > 14) UI.queue.splice(0, UI.queue.length - 14);
  if (!UI.current) showNextBanner();
}

function showNextBanner() {
  const n = UI.queue.shift();
  if (!n) return;
  UI.current = n;
  const appId = routeApp(n.route);
  const app = APP_BY_ID[appId] || APP_BY_ID.tg;
  const el = $('#banner');
  el.innerHTML = `<div class="bi" style="background:${app.bg}">${icon(app.id)}</div>
    <div><b>${esc(n.title || app.n)}</b><span>${esc(n.text)}</span>
    ${UI.queue.length ? `<small>ещё ${UI.queue.length}</small>` : ''}</div>`;
  el.hidden = false;
  clearTimeout(UI.bannerTimer);
  UI.bannerTimer = setTimeout(hideBanner, UI.queue.length ? 2800 : 4200);
}

export function hideBanner() {
  const el = $('#banner');
  el.hidden = true;
  el.style.transform = '';
  el.style.opacity = '';
  UI.current = null;
  clearTimeout(UI.bannerTimer);
  if (UI.queue.length) {
    UI.bannerTimer = setTimeout(() => {
      if (!UI.current && UI.queue.length) showNextBanner();
    }, 240);
  }
}

function routeApp(route) {
  if (!route) return 'settings';
  if (route.startsWith('chan/')) return 'tg';
  return route.split('/')[0];
}

/* ======================= ШТОРКА ======================= */

export function notifCenterHTML() {
  const S = UI.S;
  pruneNotifications(S);
  const list = S.notif;
  return `<div class="nc-head"><b>Уведомления</b>
    ${list.length ? '<button class="btn sm" style="background:rgba(255,255,255,.18);color:#fff" data-act="clearNotif">Очистить</button>' : ''}</div>
  <div class="nc-list">${
    list
      .map((n) => {
        const app = APP_BY_ID[routeApp(n.route)] || APP_BY_ID.tg;
        return `<div class="nc-item" data-nid="${n.id}" role="button" tabindex="0">
          <div class="bi" style="background:${app.bg}">${icon(app.id)}</div>
          <div style="min-width:0">
            <div class="row between"><span class="t">${esc(n.title || app.n)}</span><small>${esc(agoLabel(S.t, n.at))}</small></div>
            <div class="x">${esc(n.text)}</div>
          </div></div>`;
      })
      .join('') || '<div class="empty" style="color:rgba(255,255,255,.6)">Нет уведомлений</div>'
  }</div>
  <div class="nc-foot"><div class="nc-grab"></div>
    <div class="nc-hint">Смахни вверх — закрыть · влево или вправо — убрать</div></div>`;
}

export function fillNotifCenter() {
  const el = $('#notifcenter');
  el.innerHTML = notifCenterHTML();
  bindNotifItems();
}

function setNC(y, animate) {
  const el = $('#notifcenter');
  el.style.transition = animate ? 'transform .26s cubic-bezier(.2,.8,.2,1)' : 'none';
  el.style.transform = `translateY(${y}px)`;
}

export function openNotifCenter() {
  const el = $('#notifcenter');
  fillNotifCenter();
  el.hidden = false;
  setNC(-el.offsetHeight, false);
  el.getBoundingClientRect();
  setNC(0, true);
  hideBanner();
}

export function closeNotifCenter(instant) {
  const el = $('#notifcenter');
  if (el.hidden) return;
  if (instant) {
    el.hidden = true;
    setNC(0, false);
    return;
  }
  setNC(-el.offsetHeight, true);
  setTimeout(() => {
    el.hidden = true;
    setNC(0, false);
  }, 260);
}

export const isNotifOpen = () => !$('#notifcenter').hidden;

function removeNotifItem(el, dir) {
  const id = +el.dataset.nid;
  el.style.transition = 'transform .2s ease, opacity .2s ease';
  el.style.transform = `translateX(${dir > 0 ? 120 : -120}%)`;
  el.style.opacity = '0';
  setTimeout(() => {
    el.style.transition = 'max-height .18s ease, padding .18s ease, margin .18s ease';
    el.style.maxHeight = el.offsetHeight + 'px';
    el.getBoundingClientRect();
    el.style.maxHeight = '0px';
    el.style.paddingTop = '0px';
    el.style.paddingBottom = '0px';
    setTimeout(() => {
      UI.S.notif = UI.S.notif.filter((n) => n.id !== id);
      UI.save();
      el.remove();
      if (!UI.S.notif.length) fillNotifCenter();
    }, 190);
  }, 200);
}

function bindNotifItems() {
  for (const el of document.querySelectorAll('#notifcenter .nc-item')) {
    let x0 = null;
    let y0 = 0;
    let dx = 0;
    let dy = 0;
    let horiz = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      x0 = e.clientX;
      y0 = e.clientY;
      dx = dy = 0;
      horiz = false;
      el.style.transition = 'none';
    });
    el.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      dy = e.clientY - y0;
      if (!horiz && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        horiz = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch (err) {
          /* не критично */
        }
      }
      if (horiz) {
        el.style.transform = `translateX(${dx}px)`;
        el.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / 260));
      }
    });
    const reset = () => {
      el.style.transition = 'transform .2s ease, opacity .2s ease';
      el.style.transform = '';
      el.style.opacity = '';
    };
    el.addEventListener('pointerup', () => {
      if (x0 === null) return;
      x0 = null;
      if (horiz && Math.abs(dx) > 80) removeNotifItem(el, dx);
      else if (!horiz && Math.abs(dx) < 6 && Math.abs(dy) < 6) {
        const n = UI.S.notif.find((x) => x.id === +el.dataset.nid);
        closeNotifCenter(true);
        if (n && n.route) {
          goRoute(n.route);
          render();
        }
      } else reset();
    });
    el.addEventListener('pointercancel', () => {
      x0 = null;
      reset();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const n = UI.S.notif.find((x) => x.id === +el.dataset.nid);
        closeNotifCenter(true);
        if (n && n.route) {
          goRoute(n.route);
          render();
        }
      }
      if (e.key === 'Delete') removeNotifItem(el, 1);
    });
  }
}

/* ======================= ЖЕСТЫ ======================= */

function verticalSwipe(el, { capture, onMove, onEnd }) {
  let y0 = null;
  let dy = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    y0 = e.clientY;
    dy = 0;
    if (capture) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* не критично */
      }
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    dy = e.clientY - y0;
    if (onMove) onMove(dy);
  });
  el.addEventListener('pointerup', () => {
    if (y0 === null) return;
    const d = dy;
    y0 = null;
    onEnd(d);
  });
  el.addEventListener('pointercancel', () => {
    y0 = null;
    if (onMove) onMove(0);
  });
}

export function bindGestures() {
  const banner = $('#banner');
  verticalSwipe(banner, {
    capture: true,
    onMove: (dy) => {
      banner.style.transform = dy < 0 ? `translateY(${dy}px)` : '';
      banner.style.opacity = dy < 0 ? String(Math.max(0.2, 1 + dy / 120)) : '';
    },
    onEnd: (d) => {
      banner.style.transform = '';
      banner.style.opacity = '';
      if (d < -25) hideBanner();
      else if (d > 40) openNotifCenter();
      else if (Math.abs(d) < 8) {
        const route = UI.current && UI.current.route;
        hideBanner();
        closeNotifCenter(true);
        if (route) {
          goRoute(route);
          render();
        }
      }
    },
  });
  banner.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const route = UI.current && UI.current.route;
      hideBanner();
      if (route) {
        goRoute(route);
        render();
      }
    }
  });

  const pull = $('#pulltab');
  let pulling = false;
  verticalSwipe(pull, {
    capture: true,
    onMove: (dy) => {
      const nc = $('#notifcenter');
      if (dy > 6) {
        if (!pulling) {
          pulling = true;
          fillNotifCenter();
          nc.hidden = false;
          hideBanner();
        }
        setNC(Math.min(0, dy - nc.offsetHeight), false);
      }
    },
    onEnd: (d) => {
      const nc = $('#notifcenter');
      if (pulling) {
        pulling = false;
        if (d > 90) setNC(0, true);
        else {
          setNC(-nc.offsetHeight, true);
          setTimeout(() => {
            nc.hidden = true;
            setNC(0, false);
          }, 260);
        }
      } else if (Math.abs(d) < 8) {
        const act = UI.actions.timeSheet;
        if (act) act({});
      }
    },
  });

  const nc = $('#notifcenter');
  let cy = null;
  let cdy = 0;
  nc.addEventListener('pointerdown', (e) => {
    if (e.button > 0 || e.target.closest('.nc-item') || e.target.closest('button')) return;
    cy = e.clientY;
    cdy = 0;
    try {
      nc.setPointerCapture(e.pointerId);
    } catch (err) {
      /* не критично */
    }
  });
  nc.addEventListener('pointermove', (e) => {
    if (cy === null) return;
    cdy = Math.min(0, e.clientY - cy);
    setNC(cdy, false);
  });
  nc.addEventListener('pointerup', () => {
    if (cy === null) return;
    cy = null;
    if (cdy < -70) closeNotifCenter();
    else setNC(0, true);
  });
  nc.addEventListener('pointercancel', () => {
    cy = null;
    setNC(0, true);
  });
  nc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNotifCenter();
  });

  $('#sheet').addEventListener('click', (e) => {
    if (e.target.id === 'sheet' && !UI.S.flags.bankrupt && !UI.S.flags.seasonEnd) closeSheet();
  });

  // Повернули телефон или поменяли размер окна — подгоняем главный экран заново.
  window.addEventListener('resize', () => scheduleRender());
  window.addEventListener('orientationchange', () => setTimeout(() => render(), 120));
}

/* ======================= ЧАСЫ ======================= */

export function updateClock() {
  const S = UI.S;
  const label = clockLabel(S.t, S.min);
  const a = document.querySelector('#statusbar .clock');
  if (a) a.textContent = label;
  const b = document.getElementById('homeclock');
  if (b) b.textContent = label;
}
