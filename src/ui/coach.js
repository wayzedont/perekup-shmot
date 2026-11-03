// Обучение на экране: входящий звонок и Тимур, который подсказывает.
//
// Экран не блокируется: нужная кнопка обведена пульсирующей рамкой, а
// нажимать и листать игрок может что угодно — как в настоящей игре. Если
// кнопка уехала за край прокрутки, вместо рамки стрелка «листай сюда»; если
// игрок ушёл не туда, в пузыре появляется «Вернуться».
//
// Обучение идёт главами по дням (Авитка, Телега, Секонд, Пойзон), каждая
// начинается звонком и скачиванием приложения в Апсторе.
//
// Сценарий, условия шагов и защита от «сломал сценарий» живут в ядре
// (core/tutorial.js). Здесь — только что подсветить на каждом шаге.

import { esc } from '../core/util.js';
import {
  tutorialActive,
  currentStep,
  stepText,
  chapterOf,
  STEPS,
  TUT_TASK3,
  TUT_TASK4,
  TUT_ORDER2,
  TUT_SECOND,
  TUT_POIZON,
  TUT_RARE,
} from '../core/tutorial.js';
import { poizonPrice, poizonShip } from '../core/economy.js';
import { MODELS } from '../core/data/models.js';
import { sizesFor } from '../core/data/catalog.js';
import { photoSubject } from '../core/market/avito.js';
import { sellerThread } from '../core/actions/buying.js';
import { suspicion } from '../core/inspect.js';
import { UI, hideBanner } from './shell.js';
import { $ } from './dom.js';
import { ringing } from './sfx.js';

/* ======================= ЧТО ПОДСВЕЧИВАТЬ ======================= */
// sel — что подсветить (строка или список: тогда рамка охватывает всё);
// tap — что нажать на tap-шаге (по умолчанию то же, что sel);
// recover — что сделать, если подсвечивать нечего дольше секунды.

const row = (id) => `[data-route="avito/item/${id}"]`;
const ids = (S) => S.tut.ids;
const HOME = '#homebtn';
const BACK = '.app-head .back';
/** Иконка приложения на главном экране — в сетке или в доке. */
const appIcon = (app) => `.app-ico[data-app="${app}"]`;

// Куда вернуть игрока, если он оказался не на том экране.
const toFake1 = (S) => `avito/item/${ids(S).fake1}`;
const toOrig1 = (S) => `avito/item/${ids(S).orig1}`;
const toMeet = (S) => `avito/meeting/${ids(S).orig1}`;
const toBought = (S) => `wardrobe/item/${ids(S).orig1Item}`;
const toBuyer = (S) => `avito/thread/${ids(S).buyerThread}`;
const toTgBuyer = (S) => `tg/thread/${ids(S).tgBuyer}`;
const toOrder = (S) => `tg/thread/${ids(S).orderThread}`;
const toFake2 = (S) => `avito/item/${ids(S).fake2}`;
const toOrig2 = (S) => `avito/item/${ids(S).orig2}`;
// Переписка с продавцом учебного объявления. Её могли закрыть крестиком —
// тогда открываем заново (или начинаем новую), как кнопка «Написать».
const toChat = (key) => (S) => {
  const l = S.listings.find((x) => x.id === ids(S)[key]);
  return l ? `avito/thread/${sellerThread(S, l).id}` : `avito/item/${ids(S)[key]}`;
};
const WRITE = '.foot [data-act="openSellerChat"]';
const ASK_PHOTOS = '.foot [data-act="askSeller"][data-q="photos"]';

/** Где игрок сейчас — откуда до нужного места: домой, к иконке, или уже тут. */
const fromHome = (target) => (S) => (S.ui.app ? HOME : target);

/**
 * Установка приложения главы — одинаковая во всех главах: Апстор,
 * «Загрузить» (пока качается — кольцо), «Открыть».
 */
function installTargets(p, app) {
  return {
    [p + '_store']: { sel: (S) => (S.ui.app && S.ui.app !== 'store' ? HOME : appIcon('store')), recover: 'home' },
    [p + '_get']: {
      sel: [`[data-act="installApp"][data-app="${app}"]`, `[data-tut="store-${app}"] .st-btn.ring`],
      recover: 'store',
    },
    [p + '_open']: {
      sel: (S) =>
        S.ui.app === 'store' ? `[data-tut="store-${app}"] [data-act="openApp"]` : S.ui.app ? HOME : appIcon(app),
      recover: 'home',
    },
  };
}

/** Баннер уведомления, если он ещё на экране, иначе строка переписки в списке. */
const bannerOr = (route) => (S) => (isShown('#banner') ? '#banner' : `[data-route="${route(S)}"]`);

const TARGETS = {
  bank_open: { sel: fromHome(appIcon('bank')), recover: 'home' },
  bank_card: { sel: '.app .hero', recover: 'bank' },
  bank_history: { sel: '[data-tut="history"]', recover: 'bank' },
  go_home1: { sel: HOME, recover: 'home' },
  ...installTargets('avito', 'avito'),
  f_cat: { sel: '[data-act="filterCat"][data-val="hoodie"]', recover: 'avito' },
  f_model: { sel: 'select[data-change="model"]', recover: 'avito' },
  f_size: { sel: 'select[data-change="size"]', recover: 'avito' },
  results: { sel: (S) => [row(ids(S).fake1), row(ids(S).orig1)], recover: 'avito' },
  open_fake: { sel: (S) => row(ids(S).fake1), recover: 'avito' },
  fake_look: { sel: ['[data-tut="price"]', '[data-tut="desc"]'], recover: toFake1 },
  fake_chat: { sel: WRITE, recover: toFake1 },
  fake_photos: { sel: ASK_PHOTOS, recover: toChat('fake1') },
  fake_photos_seen: { sel: '[data-tut="photos"]', recover: toChat('fake1') },
  fake_tag: { sel: '[data-act="inspectListing"][data-tell="tag"]', recover: toChat('fake1') },
  fake_tag_seen: { sel: '[data-tellrow="tag"]', recover: toChat('fake1') },
  fake_print: { sel: '[data-act="inspectListing"][data-tell="print"]', recover: toChat('fake1') },
  fake_legit: { sel: '[data-act="legitListing"]', recover: toChat('fake1') },
  fake_verdict: { sel: ['#sheet .verdict-big', '#sheet [data-act="closeSheet"]'], tap: '#sheet [data-act="closeSheet"]', recover: 'skip' },
  fake_back: { sel: BACK, recover: 'avito' },
  open_orig: { sel: (S) => row(ids(S).orig1), recover: 'avito' },
  orig_look: { sel: '[data-tut="seller"]', recover: toOrig1 },
  orig_meet: { sel: '.foot [data-act="meet"]', recover: toOrig1 },
  meet_tag: { sel: '[data-act="inspectMeet"][data-tell="tag"]', recover: toMeet },
  meet_stitch: { sel: '[data-act="inspectMeet"][data-tell="stitch"]', recover: toMeet },
  meet_ok: { sel: ['[data-tellrow="tag"]', '[data-tellrow="stitch"]'], recover: toMeet },
  meet_cond: { sel: '[data-act="inspectMeetCond"]', recover: toMeet },
  meet_defect: { sel: '[data-tut="cond-result"]', recover: toMeet },
  meet_lever: { sel: '[data-act="useLever"][data-lever="defect"]', recover: toMeet },
  meet_buy: { sel: '[data-act="buyMeeting"]', recover: toMeet },
  bought: { sel: '.app .photo', recover: toBought },
  sell_open: { sel: '[data-act="sellSheet"]', recover: toBought },
  sell_kind: { sel: '[data-tut="sell-kind"]', recover: 'sell' },
  sell_price: { sel: '[data-tut="market"]', recover: 'sell' },
  sell_hint: { sel: '#sellHint', recover: 'sell' },
  sell_publish: { sel: '[data-act="sellOk"]', recover: 'sell' },
  wait_buyer: { sel: null },
  buyer_open: { sel: bannerOr((S) => `avito/thread/${ids(S).buyerThread}`), recover: 'buyer' },
  buyer_counter: { sel: '.foot .inline-form', recover: toBuyer },
  buyer_send: { sel: '[data-act="completeSale"]', recover: toBuyer },
  sold: { sel: ['#sheet h2', '#sheet [data-act="closeSheet"]'], tap: '#sheet [data-act="closeSheet"]', recover: 'skip' },
  paid: { sel: null },
  ship_intro: { sel: null },
  trend_search: {
    sel: (S) => (S.ui.app === 'avito' ? BACK : S.ui.app ? HOME : appIcon('avito')),
    recover: 'avito',
  },
  trend_cat: { sel: '[data-act="filterCat"][data-val="shoes"]', recover: 'avito' },
  trend_model: { sel: 'select[data-change="model"]', recover: 'avito' },
  trend_size: { sel: 'select[data-change="size"]', recover: 'avito' },
  trend_mode: { sel: 'select[data-change="mode"]', recover: 'avito' },
  trend_results: { sel: (S) => [row(ids(S).fake2), row(ids(S).orig2)], recover: 'avito' },
  trend_fake: { sel: (S) => row(ids(S).fake2), recover: 'avito' },
  trend_fake_look: { sel: '[data-tut="signals"]', recover: toFake2 },
  trend_fake_chat: { sel: WRITE, recover: toFake2 },
  trend_fake_photos: { sel: ASK_PHOTOS, recover: toChat('fake2') },
  trend_fake_sole: { sel: '[data-act="inspectListing"][data-tell="sole"]', recover: toChat('fake2') },
  trend_fake_verdict: { sel: '[data-tellrow="sole"]', recover: toChat('fake2') },
  trend_back: { sel: BACK, recover: 'avito' },
  trend_orig: { sel: (S) => row(ids(S).orig2), recover: 'avito' },
  trend_orig_chat: { sel: WRITE, recover: toOrig2 },
  trend_orig_photos: { sel: ASK_PHOTOS, recover: toChat('orig2') },
  trend_orig_sole: { sel: '[data-act="inspectListing"][data-tell="sole"]', recover: toChat('orig2') },
  trend_orig_shape: { sel: '[data-act="inspectListing"][data-tell="shape"]', recover: toChat('orig2') },
  trend_legit: { sel: '[data-act="legitListing"]', recover: toChat('orig2') },
  trend_legit_ok: { sel: ['#sheet .verdict-big', '#sheet [data-act="closeSheet"]'], tap: '#sheet [data-act="closeSheet"]', recover: 'skip' },
  trend_buy: { sel: '.foot [data-act="buyDelivery"]', tap: '.foot [data-act="buyDelivery"]', recover: toChat('orig2') },
  trend_pay: { sel: ['#sheet .callout.info', '#sheet [data-act="confirmDelivery"]'], recover: 'pay' },
  avito_end: { sel: null },

  /* --- Телега --- */
  ...installTargets('tg', 'tg'),
  tg_pinned: { sel: '.thread-row.pinned', recover: 'tg' },
  tg_channels: { sel: '[data-act="tgTab"][data-val="channels"]', recover: 'tg' },
  tg_create: { sel: '[data-act="createChannelSheet"]', recover: 'tgChannels' },
  tg_name: { sel: ['#channelName', '[data-act="createChannelOk"]'], recover: 'channel' },
  tg_own: { sel: '[data-tut="own-hero"]', recover: 'tgOwn' },
  tg_trust: { sel: '[data-tut="own-trust"]', recover: 'tgOwn' },
  tg_repost: { sel: '[data-tut="own-hero"]', recover: 'tgOwn' },
  tg_ads: { sel: '[data-tut="own-ads"]', recover: 'tgOwn' },
  tg_free: { sel: '[data-act="trendPost"]', recover: 'tgOwn' },
  tg_wait_buyer: { sel: null },
  tg_buyer_open: { sel: bannerOr((S) => `tg/thread/${ids(S).tgBuyer}`), recover: toTgBuyer },
  tg_buyer_deal: { sel: '.foot .inline-form', recover: toTgBuyer },
  tg_buyer_send: { sel: '[data-act="completeSale"]', recover: toTgBuyer },
  tg_sold: { sel: null },
  radar_back: { sel: BACK, recover: 'tgChannels' },
  radar_open: { sel: '[data-act="openChannel"][data-chan="radar"]', recover: 'tgChannels' },
  radar_read: { sel: '[data-tut="post0"]', recover: 'radar' },
  order_wait: { sel: null },
  order_open: { sel: bannerOr((S) => `tg/thread/${ids(S).orderThread}`), recover: toOrder },
  order_accept: { sel: '[data-act="acceptOrder"]', recover: toOrder },
  tg_end: { sel: null },

  /* --- Секонд и Пойзон --- */
  ...installTargets('second', 'second'),
  second_shelf: {
    sel: (S) => [`[data-route="second/item/${ids(S).sec6Real}"]`, `[data-route="second/item/${ids(S).sec6Fake}"]`],
    recover: 'second',
  },
  second_real: { sel: null },
  second_fake: { sel: null },
  second_rival: { sel: null },
  second_end: { sel: null },
  ...installTargets('poizon', 'poizon'),
  poizon_eta: { sel: null },
  poizon_tip: { sel: null },
  rare_intro: { sel: null },
  poizon_wait: { sel: null },
  poizon_end: { sel: null },
};

/* ======================= СОСТОЯНИЕ ЭКРАНА ======================= */

const C = {
  stepId: null,
  typing: null,
  missingSince: 0,
  lost: false,
  scrolledFor: null,
  confirmSkip: false,
  chapter: null,
  waitTimer: null,
  folded: false,
  hintText: null,
  call: null,
};

let actions = {};

export function initCoach(acts) {
  actions = acts;
  setInterval(() => updateCoach(), 160);
  window.addEventListener('resize', () => updateCoach());
  document.addEventListener('scroll', () => updateCoach(), true);
}

function isShown(sel) {
  const el = document.querySelector(sel);
  if (!el || el.hidden) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

function phoneBox() {
  const phone = $('#phone');
  const r = phone.getBoundingClientRect();
  return { x: r.left + phone.clientLeft, y: r.top + phone.clientTop, w: phone.clientWidth, h: phone.clientHeight };
}

function resolveSel(S, def) {
  if (!def || !def.sel) return [];
  const v = typeof def.sel === 'function' ? def.sel(S) : def.sel;
  return (Array.isArray(v) ? v : [v]).filter(Boolean);
}

/**
 * Первый видимый элемент. Закрытое окно хранит старую разметку внутри
 * себя — её кнопки не считаются, иначе Тимур «видит» кнопку, которой нет.
 */
function visibleEl(sel) {
  for (const el of document.querySelectorAll(sel)) {
    if (el.closest('[hidden]') || !el.getClientRects().length) continue;
    return el;
  }
  return null;
}

/** Рамка вокруг всех найденных элементов, в координатах телефона. */
function targetRect(sels) {
  const P = phoneBox();
  let box = null;
  for (const sel of sels) {
    const el = visibleEl(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const b = { l: r.left - P.x, t: r.top - P.y, r: r.right - P.x, b: r.bottom - P.y };
    box = box ? { l: Math.min(box.l, b.l), t: Math.min(box.t, b.t), r: Math.max(box.r, b.r), b: Math.max(box.b, b.b) } : b;
  }
  if (!box) return null;
  // Тонкой кнопке (полоска «домой») — запас, чтобы рамку было видно.
  const pad = 5;
  const minH = 34;
  let { l, t, r, b } = box;
  l -= pad;
  r += pad;
  t -= pad;
  b += pad;
  if (b - t < minH) {
    const mid = (t + b) / 2;
    t = mid - minH / 2;
    b = mid + minH / 2;
  }
  return { l: Math.max(0, l), t: Math.max(0, t), r: Math.min(P.w, r), b: Math.min(P.h, b) };
}

function firstEl(sels) {
  for (const sel of sels) {
    const el = visibleEl(sel);
    if (el) return el;
  }
  return null;
}

/** Где спрятан элемент относительно своей прокрутки: null, если виден. */
function offscreen(el) {
  const box = el.closest('.body, .chips, .sheet-card');
  if (!box) return null;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (r.height >= b.height) return null;
  if (r.bottom > b.bottom + 1) return { dir: 'down', box: b };
  if (r.top < b.top - 1) return { dir: 'up', box: b };
  if (r.right > b.right + 1) return { dir: 'right', box: b };
  if (r.left < b.left - 1) return { dir: 'left', box: b };
  return null;
}

/* ======================= ВОЗВРАТ НА МЕСТО ======================= */
// Экран свободный: игрок может уйти куда угодно. Тимур не тащит его назад
// сам, а предлагает кнопку «Вернуться».

function recover(S, how) {
  const A = actions;
  const open = (app, view = 'main', id = null) => {
    A.closeSheet();
    S.ui.app = app;
    S.ui.view = view;
    S.ui.id = id;
    A.refresh();
  };
  if (typeof how === 'function') {
    A.closeSheet();
    A.go({ route: how(S) });
  } else if (how === 'home') A.goHome({});
  else if (how === 'bank') open('bank');
  else if (how === 'tg') {
    S.ui.tgTab = 'chats';
    open('tg');
  } else if (how === 'tgChannels') {
    S.ui.tgTab = 'channels';
    open('tg');
  } else if (how === 'tgOwn') open('tg', 'own');
  else if (how === 'radar') {
    S.ui.channel = 'radar';
    open('tg', 'channel');
  } else if (how === 'avito') open('avito');
  else if (how === 'store') open('store');
  else if (how === 'sell') A.sellSheetKeep({ id: ids(S).orig1Item });
  else if (how === 'channel') A.createChannelSheet({});
  else if (how === 'pay') A.buyDelivery({ id: ids(S).orig2 });
  else if (how === 'buyer') A.go({ route: `avito/thread/${ids(S).buyerThread}` });
}

/* ======================= ЧТО ПОДСВЕТИТЬ СЕЙЧАС ======================= */
// У ведомых шагов — заранее известная кнопка (TARGETS). У шагов «сам» —
// следующее действие, вычисленное по экрану и состоянию (HINTS): игрок
// может идти своим путём, подсказка подстраивается под него.

function currentHint(S, step) {
  let h;
  if (step.kind === 'goal') {
    const g = (HINTS[step.id] || (() => null))(S) || { text: '', sel: null };
    h = { text: g.text, sels: g.sel ? [g.sel] : [], pick: g.pick, recover: null };
  } else {
    const def = TARGETS[step.id] || {};
    h = { text: '', sels: resolveSel(S, def), recover: def.recover || null };
  }
  // Открытое окно закрывает всё под собой: если нужная кнопка не в нём —
  // сначала закрыть окно, потом остальное.
  const close = '#sheet [data-act="closeSheet"]';
  if (sheetOpen() && (h.sels.length || step.kind === 'goal') && visibleEl(close)) {
    const el = firstEl(h.sels);
    if (!el || !el.closest('#sheet')) h = { text: 'Закрой окно.', sels: [close], pick: null, recover: null };
  }
  return h;
}

/* ======================= ОТРИСОВКА ======================= */

function ensureLayer() {
  let el = $('#coach');
  if (!el) {
    el = document.createElement('div');
    el.id = 'coach';
    el.innerHTML = `<div class="c-ring" hidden></div><button class="c-arrow" hidden></button>
      <div class="c-bubble"></div><div class="c-burst"></div>`;
    $('#phone').appendChild(el);
    el.querySelector('.c-bubble').addEventListener('click', onBubbleClick);
    el.querySelector('.c-arrow').addEventListener('click', () => {
      const S = UI.S;
      const step = currentStep(S);
      const t = step && firstEl(currentHint(S, step).sels);
      if (t) t.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    });
  }
  return el;
}

function hideLayer() {
  const el = $('#coach');
  if (el) el.hidden = true;
}

export function updateCoach() {
  const S = UI.S;
  if (!S || !tutorialActive(S)) {
    hideLayer();
    hideCall();
    return;
  }
  const step = currentStep(S);
  if (!step) return;
  if (step.kind === 'call') {
    hideLayer();
    showCall();
    return;
  }
  hideCall();

  // Не каждое действие игры зовёт общий after() (окно продажи, например,
  // просто открывается). Если условие шага уже выполнено — двигаемся сами.
  if ((step.kind === 'do' || step.kind === 'wait' || step.kind === 'goal') && step.done(S)) {
    actions.refresh({});
    return;
  }

  const layer = ensureLayer();
  layer.hidden = false;
  if (C.stepId !== step.id) enterStep(S, step);

  const hint = currentHint(S, step);
  window.__coachHint = hint;
  setHintLine(hint.text);
  const el = firstEl(hint.sels);

  // Подсвечивать нечего: игрок ушёл с нужного экрана или закрыл окно.
  if (hint.sels.length && !el) {
    if (!C.missingSince) C.missingSince = Date.now();
    else if (Date.now() - C.missingSince > 1200) {
      if (hint.recover === 'skip') {
        // Окно с результатом закрыли мимо кнопки — шаг и так пройден.
        C.missingSince = 0;
        actions.tutNext({});
        return;
      }
      setLost(!!hint.recover);
    }
  } else {
    C.missingSince = 0;
    setLost(false);
  }

  // Один раз за подсказку подвозим кнопку в поле зрения. Дальше игрок
  // листает сам — тогда вместо рамки стрелка «листай сюда».
  const scrollKey = step.id + '|' + hint.sels.join(',');
  if (el && C.scrolledFor !== scrollKey) {
    if (offscreen(el)) el.scrollIntoView({ block: 'center', inline: 'center' });
    C.scrolledFor = scrollKey;
  }

  const P = phoneBox();
  const ring = layer.querySelector('.c-ring');
  const arrow = layer.querySelector('.c-arrow');
  const away = el ? offscreen(el) : null;
  const rect = el && !away ? targetRect(hint.sels) : null;
  ring.hidden = !rect;
  if (rect) {
    place(ring, rect.l, rect.t, rect.r - rect.l, rect.b - rect.t);
    ring.classList.toggle('soft', step.kind === 'talk');
  }
  arrow.hidden = !away;
  if (away) {
    const b = away.box;
    const label = { down: '↓ Листай вниз', up: '↑ Листай вверх', right: 'Листай вбок →', left: '← Листай вбок' }[away.dir];
    if (arrow.textContent !== label) arrow.textContent = label;
    const mid = b.top - P.y + (b.bottom - b.top) / 2 - 18;
    const y = away.dir === 'up' ? b.top - P.y + 8 : away.dir === 'down' ? b.bottom - P.y - 44 : mid;
    arrow.style.top = Math.max(8, Math.min(P.h - 50, y)) + 'px';
  }
  placeBubble(layer, P, rect, away);
}

function place(node, x, y, w, h) {
  node.style.left = x + 'px';
  node.style.top = y + 'px';
  node.style.width = Math.max(0, w) + 'px';
  node.style.height = Math.max(0, h) + 'px';
}

/**
 * Пузырь — у дальнего края экрана от подсветки: так он закрывает меньше
 * того, что рядом с нужной кнопкой. Стрелка «листай» внизу — пузырь наверх.
 * Подсвечивать нечего, а снизу открыто окно — тоже наверх, чтобы не закрыть
 * текст окна. Мешает — его можно свернуть.
 */
function placeBubble(layer, P, rect, away) {
  const bubble = layer.querySelector('.c-bubble');
  const h = bubble.offsetHeight || 140;
  let top;
  if (rect) top = (rect.t + rect.b) / 2 > P.h * 0.5;
  else if (away) top = away.dir !== 'up';
  else top = sheetOpen();
  bubble.style.top = Math.max(50, top ? 50 : P.h - h - 30) + 'px';
}

function enterStep(S, step) {
  const prev = C.chapter;
  C.stepId = step.id;
  C.scrolledFor = null;
  C.missingSince = 0;
  C.lost = false;
  C.confirmSkip = false;
  C.folded = false;
  C.hintText = null;
  clearTimeout(C.waitTimer);
  // Раздел главы пройден — короткий салют с его названием.
  if (prev && prev.id !== step.ch && prev.part === step.part) burst(prev.name);
  C.chapter = { id: step.ch, part: step.part, name: chapterOf(step).name };
  renderBubble(S, step);
  typeText(S, step);
  // Пауза перед тем, как «напишет» покупатель: несколько секунд ожидания
  // делают его сообщение событием, а не строчкой, которая была всегда.
  if (step.kind === 'wait') {
    C.waitTimer = setTimeout(() => {
      if (currentStep(UI.S) === step) actions.tutWait({});
    }, 2200);
  }
}

function renderBubble(S, step) {
  const bubble = ensureLayer().querySelector('.c-bubble');
  const ch = chapterOf(step);
  const pct = Math.round(((ch.i + (S.tut.step - firstOfChapter(step.ch)) / chapterLen(step.ch)) / ch.n) * 100);
  const foot =
    step.kind === 'talk'
      ? `<button class="c-next" data-coach="next">${isLastStep(step) ? 'Погнали' : 'Дальше'}</button>`
      : step.kind === 'wait'
        ? '<span class="c-dots"><i></i><i></i><i></i></span>'
        : '';
  bubble.classList.toggle('folded', C.folded);
  bubble.innerHTML = `<div class="c-head">
      <div class="c-ava">Т</div>
      <div class="c-who"><b>Тимур</b><span>${esc(ch.part)} · ${esc(ch.name)}</span></div>
      <button class="c-skip" data-coach="skip">${C.confirmSkip ? 'Точно пропустить?' : 'Пропустить'}</button>
      <button class="c-fold" data-coach="fold" aria-label="${C.folded ? 'Развернуть' : 'Свернуть'}">${C.folded ? '▴' : '▾'}</button>
    </div>
    <div class="c-bar"><i style="width:${pct}%"></i></div>
    <div class="c-text"></div>
    <div class="c-hintline" hidden></div>
    <div class="c-lost" hidden>Ты ушёл не туда. <button data-coach="back">Вернуться</button></div>
    ${foot ? `<div class="c-foot">${foot}</div>` : ''}`;
}

/** Подсказка «что делать дальше» у шагов «сам» — меняется на ходу. */
function setHintLine(text) {
  if (C.hintText === text) return;
  C.hintText = text;
  const el = document.querySelector('#coach .c-hintline');
  if (!el) return;
  el.hidden = !text;
  el.textContent = text ? '💡 ' + text : '';
}

function setLost(on) {
  if (C.lost === on) return;
  C.lost = on;
  const el = document.querySelector('#coach .c-lost');
  if (el) el.hidden = !on;
}

const firstOfChapter = (ch) => STEPS.findIndex((s) => s.ch === ch);
const chapterLen = (ch) => STEPS.filter((s) => s.ch === ch).length;
const isLastStep = (step) => !!step.end;

/** Текст печатается, как в мессенджере. Тап по пузырю — сразу целиком. */
function typeText(S, step) {
  clearInterval(C.typing);
  const full = stepText(S, step);
  let typed = 0;
  const foot = document.querySelector('#coach .c-foot');
  if (foot) foot.style.visibility = step.kind === 'talk' ? 'hidden' : '';
  C.typing = setInterval(() => {
    typed = Math.min(full.length, typed + 2);
    const el = document.querySelector('#coach .c-text');
    if (el) el.textContent = full.slice(0, typed);
    if (typed >= full.length) {
      clearInterval(C.typing);
      C.typing = null;
      const f = document.querySelector('#coach .c-foot');
      if (f) f.style.visibility = '';
    }
  }, 16);
}

function finishTyping() {
  const S = UI.S;
  const step = currentStep(S);
  if (!step || !C.typing) return false;
  clearInterval(C.typing);
  C.typing = null;
  const el = document.querySelector('#coach .c-text');
  if (el) el.textContent = stepText(S, step);
  const f = document.querySelector('#coach .c-foot');
  if (f) f.style.visibility = '';
  return true;
}

function onBubbleClick(e) {
  const S = UI.S;
  const btn = e.target.closest('[data-coach]');
  const what = btn && btn.dataset.coach;
  if (what === 'skip') {
    if (!C.confirmSkip) {
      C.confirmSkip = true;
      btn.textContent = 'Точно пропустить?';
      return;
    }
    actions.tutSkip({});
    return;
  }
  if (what === 'fold') {
    // Свернуть пузырь, чтобы не мешал смотреть экран, — и обратно.
    const step = currentStep(S);
    if (!step) return;
    C.folded = !C.folded;
    C.typing && finishTyping();
    renderBubble(S, step);
    const el = document.querySelector('#coach .c-text');
    if (el) el.textContent = stepText(S, step);
    C.hintText = null;
    C.lost = false;
    updateCoach();
    return;
  }
  if (what === 'back') {
    const step = currentStep(S);
    const how = step && currentHint(S, step).recover;
    if (how) recover(S, how);
    return;
  }
  if (finishTyping()) return;
  if (what === 'next') actions.tutNext({});
}

/** Нажатие на подсвеченную кнопку tap-шага закрывает шаг. */
export function coachAfterClick(el) {
  const S = UI.S;
  const step = currentStep(S);
  if (!step || step.kind !== 'tap') return false;
  const def = TARGETS[step.id] || {};
  const sel = def.tap || resolveSel(S, def)[0];
  if (!sel || !el.matches(sel)) return false;
  actions.tutNext({});
  return true;
}

/** Глава пройдена — короткий салют, чтобы прогресс чувствовался. */
function burst(name) {
  const el = document.querySelector('#coach .c-burst');
  if (!el) return;
  const bits = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const d = 70 + (i % 3) * 26;
    return `<i style="--x:${Math.round(Math.cos(a) * d)}px;--y:${Math.round(Math.sin(a) * d)}px;--c:${['#7a46d6', '#00a046', '#f5b400', '#2a9fd6'][i % 4]}"></i>`;
  }).join('');
  el.innerHTML = `<div class="c-done">✓ ${esc(name)}</div>${bits}`;
  el.classList.remove('go');
  el.getBoundingClientRect();
  el.classList.add('go');
}

/* ======================= ДАЛЬШЕ САМ: ЧТО ДЕЛАТЬ ======================= */
// Во второй части у Тимура нет заранее известного пути: он смотрит, где
// игрок сейчас, и подсвечивает следующий шаг именно оттуда.

const sheetOpen = () => !document.querySelector('#sheet').hidden;
const homeHint = (where) => ({ text: `Выйди на главный экран — ${where}.`, sel: HOME });

/** Игрок уже видел, что это паль: по чеку или по осмотру фото. */
const looksFake = (l) => l.item.verdict === 'fake' || (suspicion(photoSubject(l)) || 0) >= 0.35;

/** Найти, проверить и купить с доставкой одну из вещей задания. */
function buyHint(S, keys, f) {
  const ls = keys.map((k) => S.listings.find((l) => l.id === ids(S)[k])).filter(Boolean);
  const ui = S.ui;
  if (sheetOpen() && document.querySelector('#sheet [data-act="confirmDelivery"]')) {
    return { text: 'Всё верно — оплачивай.', sel: '#sheet [data-act="confirmDelivery"]' };
  }
  if (ui.app === 'avito' && ui.view === 'thread') {
    const l = ls.find((x) => x.threadId === ui.id);
    if (!l) return { text: 'Это не тот чат. Назад.', sel: BACK };
    if (!l.photosAsked) return { text: 'Попроси у продавца фото бирок и швов.', sel: ASK_PHOTOS };
    const seen = Object.keys(photoSubject(l).seen || {}).length;
    if (l.photosSent && !seen) return { text: 'Фото пришли. Осмотри под ними главный признак этой модели.', sel: '[data-act="inspectListing"]' };
    if (looksFake(l)) return { text: 'Тут паль — по фото видно. Назад, смотри другое объявление.', sel: BACK };
    return { text: 'Чисто? Бери «Доставкой». Хочешь спокойнее — сначала легит-чек по фото.', sel: '.foot [data-act="buyDelivery"]' };
  }
  if (ui.app === 'avito' && ui.view === 'item') {
    const l = ls.find((x) => x.id === ui.id);
    if (!l) return { text: 'Это не то объявление. Назад, к поиску.', sel: BACK };
    if (looksFake(l)) return { text: 'Это ты уже проверил — паль. Назад, к другому.', sel: BACK };
    return { text: 'Пиши продавцу: фото попросишь в чате.', sel: WRITE };
  }
  if (ui.app === 'avito' && ui.view === 'main') {
    const fl = ui.filters;
    if (fl.cat !== f.cat) return { text: `Фильтры! Категория — «${f.catName}».`, sel: `[data-act="filterCat"][data-val="${f.cat}"]` };
    if (String(fl.model) !== String(f.m)) return { text: `Модель — «${f.modelName}».`, sel: 'select[data-change="model"]', pick: f.m };
    if (fl.size !== f.size) return { text: `Размер — ${f.size}.`, sel: 'select[data-change="size"]', pick: f.size };
    if (fl.mode === 'meet') return { text: 'Убери «Личная встреча» — эти только с доставкой.', sel: 'select[data-change="mode"]', pick: 'all' };
    const next = ls.find((l) => !looksFake(l)) || ls[0];
    return { text: 'Вот они. Открывай и сравнивай — не бери первое попавшееся.', sel: next ? row(next.id) : null };
  }
  if (ui.app === 'avito') return { text: 'Тебе в поиск.', sel: '[data-act="nav"][data-view="main"]' };
  if (ui.app) return homeHint('тебе в Авитку');
  return { text: 'Открывай Авитку.', sel: appIcon('avito') };
}

/** Дойти до вещи в шкафу и нажать там нужную кнопку. */
function wardrobeHint(S, itemId, act, text) {
  const ui = S.ui;
  if (ui.app === 'wardrobe' && ui.view === 'item' && ui.id === itemId) return { text, sel: `[data-act="${act}"]` };
  if (ui.app === 'wardrobe') {
    if (ui.view === 'item') return { text: 'Не та вещь. Назад.', sel: BACK };
    return { text: 'Открой её в шкафу.', sel: `[data-route="wardrobe/item/${itemId}"]` };
  }
  if (ui.app) return homeHint('вещи лежат в «Шкафу»');
  return { text: 'Открывай «Шкаф».', sel: appIcon('wardrobe') };
}

function waitHint(S) {
  if (S.ui.app) return homeHint('время двигают кнопки там');
  return { text: 'Жми «+1 ч» — посылка в пути.', sel: '[data-act="wait"][data-h="1"]' };
}

const boughtId = (S, task) => ids(S)[task + 'Bought'];
const FILTER3 = { cat: 'shoes', catName: 'Обувь', modelName: 'Нюбы 550' };
const FILTER4 = { cat: 'hoodie', catName: 'Худи и свитшоты', modelName: 'Стусси худи' };

/** Выставить вещь в свой канал: шкаф → вещь → окно продажи → «Мой канал». */
function postHint(S) {
  const ui = S.ui;
  if (sheetOpen() && ui.sell && document.querySelector('#sheet [data-act="sellOk"]')) {
    if (!ui.sell.tg) return { text: 'Отметь «Мой канал».', sel: '#sheet [data-act="sellSet"][data-key="tg"]' };
    return { text: 'Публикуй.', sel: '#sheet [data-act="sellOk"]' };
  }
  const best = S.items.find((i) => i.id === ids(S).orig2Item && !(i.sale && i.sale.tg)) || S.items.find((i) => !(i.sale && i.sale.tg) && i.verdict !== 'fake');
  if (ui.app === 'wardrobe' && ui.view === 'item') {
    const it = S.items.find((i) => i.id === ui.id);
    if (it && !(it.sale && it.sale.tg) && it.verdict !== 'fake') return { text: 'Жми «Выставить» — или «Изменить», если вещь уже на Авитке.', sel: '[data-act="sellSheet"]' };
    return { text: 'Эту не надо. Назад.', sel: BACK };
  }
  if (ui.app === 'wardrobe') return { text: 'Открой вещь — лучше Самбы.', sel: best ? `[data-route="wardrobe/item/${best.id}"]` : null };
  if (ui.app === 'tg' && ui.view === 'own') return { text: 'Отсюда — прямо в шкаф.', sel: '[data-route="wardrobe/main"]' };
  if (ui.app) return homeHint('вещи лежат в «Шкафу»');
  return { text: 'Открывай «Шкаф».', sel: appIcon('wardrobe') };
}

/** Дойти до своего канала: Телега → «Каналы» → свой. */
function ownHint(S) {
  const ui = S.ui;
  if (ui.app === 'tg' && ui.view === 'main') {
    if (ui.tgTab !== 'channels') return { text: 'Вкладка «Каналы».', sel: '[data-act="tgTab"][data-val="channels"]' };
    return { text: 'Твой канал — первый в списке.', sel: '[data-route="tg/own"]' };
  }
  if (ui.app === 'tg') return { text: 'Назад, к списку.', sel: BACK };
  if (ui.app) return homeHint('тебе в Телегу');
  return { text: 'Открывай Телегу.', sel: appIcon('tg') };
}

/** Отдать заказ: Телега → «Чаты» → переписка с клиентом → «Отдать». */
function giveHint(S) {
  const ui = S.ui;
  const id = ids(S).orderThread;
  if (ui.app === 'tg' && ui.view === 'thread' && ui.id === id) return { text: 'Жми «Отдать» — клиент заплатит остаток.', sel: '[data-act="fulfillOrder"]' };
  if (ui.app === 'tg' && ui.view === 'main') {
    if (ui.tgTab !== 'chats') return { text: 'Вкладка «Чаты».', sel: '[data-act="tgTab"][data-val="chats"]' };
    return { text: 'Переписка с Даней.', sel: `[data-route="tg/thread/${id}"]` };
  }
  if (ui.app === 'tg') return { text: 'Назад, к чатам.', sel: BACK };
  if (ui.app) return homeHint('заказ — в Телеге');
  return { text: 'Открывай Телегу.', sel: appIcon('tg') };
}

const FILTER5 = { cat: 'tee', catName: 'Футболки', modelName: 'Кортейз футболка' };

/** К дверям «Мешка» — и ждать открытия. */
function doorHint(S) {
  const ui = S.ui;
  if (ui.app === 'second' && ui.view === 'main') return { text: 'Жми «Ждать открытия у дверей».', sel: '[data-act="waitSecondOpen"]' };
  if (ui.app === 'second') return { text: 'Назад, к полке.', sel: BACK };
  if (ui.app) return homeHint('тебе в «Секонд»');
  return { text: 'Открывай «Секонд».', sel: appIcon('second') };
}

/** Осмотреть два обведённых и взять чистое. */
function secondFindHint(S) {
  const ui = S.ui;
  const T = TUT_SECOND;
  const slots = [
    { key: 'sec6Real', tell: T.real.tell, name: T.real.tellName },
    { key: 'sec6Fake', tell: T.fake.tell, name: T.fake.tellName },
  ]
    .map((x) => ({ ...x, slot: S.second.items.find((s) => s.id === ids(S)[x.key]) }))
    .filter((x) => x.slot);
  if (ui.app === 'second' && ui.view === 'item') {
    const cur = slots.find((x) => x.slot.id === ui.id);
    if (!cur) return { text: 'Это не те. Назад, к обведённым.', sel: BACK };
    const it = cur.slot.item;
    if (!it.seen[cur.tell]) return { text: `Осмотри ${cur.name} — с неё начинают.`, sel: `[data-act="inspectSlot"][data-tell="${cur.tell}"]` };
    if ((suspicion(it) || 0) >= 0.35) return { text: 'Палево видно. Назад — смотри вторую.', sel: BACK };
    return { text: 'Чисто. Бери, пока Мирон не взял.', sel: '[data-act="buySecond"]' };
  }
  if (ui.app === 'second') {
    const next = slots.find((x) => !x.slot.item.seen[x.tell]) || slots.find((x) => (suspicion(x.slot.item) || 0) < 0.35) || slots[0];
    return { text: 'Открывай обведённую.', sel: next ? `[data-route="second/item/${next.slot.id}"]` : null };
  }
  if (ui.app) return homeHint('тебе в «Секонд»');
  return { text: 'Открывай «Секонд».', sel: appIcon('second') };
}

/** Найти ставку урока на Пойзоне и заказать: на две не хватает — одну. */
function poizonHint(S, order) {
  const ui = S.ui;
  const mi = TUT_POIZON.m;
  const m = MODELS[mi];
  const row = `[data-route="poizon/item/${mi}"]`;
  if (ui.app === 'poizon' && ui.view === 'item') {
    if (+ui.id !== mi) return { text: 'Не та модель. Назад.', sel: BACK };
    if (!order) return { text: 'Она.', sel: '.foot [data-act="buyPoizon"]' };
    const qty = ui.qty['pz' + mi] || 1;
    const size = sizesFor(m.cat)[0];
    const total = (poizonPrice(S, mi, size) + poizonShip(S, mi, qty)) * qty;
    if (qty > 2) return { text: 'Больше двух на первый раз не надо. Убавь.', sel: `[data-act="qty"][data-key="pz${mi}"][data-d="-1"]` };
    if (qty > 1 && S.money < total) return { text: 'На две не хватает — убавь до одной.', sel: `[data-act="qty"][data-key="pz${mi}"][data-d="-1"]` };
    if (qty > 1) return { text: 'Заказывай обе.', sel: '.foot [data-act="buyPoizon"]' };
    const two = (poizonPrice(S, mi, size) + poizonShip(S, mi, 2)) * 2;
    return { text: S.money >= two ? 'Заказывай. Хватает и на две — можно прибавить.' : 'Заказывай одну.', sel: '.foot [data-act="buyPoizon"]' };
  }
  if (ui.app === 'poizon') {
    if (document.querySelector(row)) return { text: `Вот ${m.n} ${m.b}. Открывай.`, sel: row };
    if (ui.poizon.cat !== m.cat) return { text: 'Категория «Головные уборы» — или набери «Норс» в поиске.', sel: `[data-act="poizonCat"][data-val="${m.cat}"]` };
    if (document.querySelector('[data-act="showMore"]')) return { text: 'Тут её не видно — листай вниз и жми «Показать ещё».', sel: '[data-act="showMore"]' };
    return { text: 'Сбрось поиск — или набери «Норс».', sel: '#poizonSearch' };
  }
  if (ui.app) return homeHint('тебе в Пойзон');
  return { text: 'Открывай Пойзон.', sel: appIcon('poizon') };
}

/** Заказ Стаса: переписка в Телеге → «Беру» → Пойзон, размер 46, заказ. */
function rareHint(S, stage) {
  const ui = S.ui;
  const id = ids(S).rareThread;
  if (stage !== 'buy') {
    if (ui.app === 'tg' && ui.view === 'thread' && ui.id === id) return { text: 'Жми «Взять заказ».', sel: '[data-act="acceptOrder"]' };
    if (ui.app === 'tg' && ui.view === 'main') {
      if (ui.tgTab !== 'chats') return { text: 'Вкладка «Чаты».', sel: '[data-act="tgTab"][data-val="chats"]' };
      return { text: 'Переписка со Стасом.', sel: `[data-route="tg/thread/${id}"]` };
    }
    if (ui.app === 'tg') return { text: 'Назад, к чатам.', sel: BACK };
    if (ui.app) return homeHint('заказ — в Телеге');
    return { text: 'Открывай Телегу.', sel: appIcon('tg') };
  }
  const mi = TUT_RARE.m;
  const m = MODELS[mi];
  const row = `[data-route="poizon/item/${mi}"]`;
  // Из переписки с заказом — прямо кнопкой «Пойзон»: она ведёт сразу на модель.
  if (ui.app === 'tg' && ui.view === 'thread' && ui.id === id && document.querySelector(`.foot ${row}`)) return { text: 'Жми «Пойзон» — откроется прямо эта модель.', sel: `.foot ${row}` };
  if (ui.app === 'poizon' && ui.view === 'item') {
    if (+ui.id !== mi) return { text: 'Не та модель. Назад.', sel: BACK };
    if ((ui.sizeChoice[mi] || '') !== TUT_RARE.size) return { text: 'Размер — 46.', sel: `[data-act="pzSize"][data-model="${mi}"][data-val="${TUT_RARE.size}"]` };
    if ((ui.qty['pz' + mi] || 1) > 1) return { text: 'Одна пара. Убавь.', sel: `[data-act="qty"][data-key="pz${mi}"][data-d="-1"]` };
    return { text: 'Заказывай.', sel: '.foot [data-act="buyPoizon"]' };
  }
  if (ui.app === 'poizon') {
    if (document.querySelector(row)) return { text: `Вот ${m.b} ${m.n}. Открывай.`, sel: row };
    if (ui.poizon.cat !== m.cat) return { text: 'Категория «Обувь» — или набери «Вансы» в поиске.', sel: `[data-act="poizonCat"][data-val="${m.cat}"]` };
    if (document.querySelector('[data-act="showMore"]')) return { text: 'Тут её не видно — листай вниз и жми «Показать ещё».', sel: '[data-act="showMore"]' };
    return { text: 'Набери «Вансы» в поиске.', sel: '#poizonSearch' };
  }
  if (ui.app) return homeHint('тебе в Пойзон');
  return { text: 'Открывай Пойзон.', sel: appIcon('poizon') };
}

const HINTS = {
  rare_open: (S) => rareHint(S, 'open'),
  rare_accept: (S) => rareHint(S, 'accept'),
  rare_buy: (S) => rareHint(S, 'buy'),
  poizon_find: (S) => poizonHint(S, false),
  poizon_order: (S) => poizonHint(S, true),
  tg_post: postHint,
  tg_posted: ownHint,
  order_buy: (S) => buyHint(S, ['orig5'], { ...FILTER5, m: TUT_ORDER2.m, size: TUT_ORDER2.size }),
  order_parcel: waitHint,
  order_give: giveHint,
  second_door: doorHint,
  second_find: secondFindHint,
  second_list: (S) => {
    const id = boughtId(S, 'task6');
    const real = id === ids(S).sec6RealItem;
    const ui = S.ui;
    if (sheetOpen() && ui.sell && ui.sell.id === id && document.querySelector('#sheet [data-act="sellOk"]')) {
      if (!real && ui.sell.asOrig) return { text: 'Жми «Реплика» — честно.', sel: '#sheet [data-act="sellSet"][data-key="asOrig"][data-val="0"]' };
      return { text: 'Публикуй.', sel: '#sheet [data-act="sellOk"]' };
    }
    return wardrobeHint(S, id, 'sellSheet', 'Жми «Выставить на продажу».');
  },
  wait_samba: waitHint,
  legit_samba: (S) => wardrobeHint(S, ids(S).orig2Item, 'legitCheck', 'Жми «Легит-чек»: в руках — правда.'),
  task3_buy: (S) => buyHint(S, ['fake3', 'orig3'], { ...FILTER3, m: TUT_TASK3.m, size: TUT_TASK3.size }),
  task3_wait: waitHint,
  task3_legit: (S) => wardrobeHint(S, boughtId(S, 'task3'), 'legitCheck', 'Посылка с Авитки — сразу легит-чек, пока идут сутки защиты.'),
  task3_dispute: (S) => wardrobeHint(S, boughtId(S, 'task3'), 'dispute', 'Жми «Открыть спор» — деньги вернутся.'),
  task4_buy: (S) => buyHint(S, ['swap4'], { ...FILTER4, m: TUT_TASK4.m, size: TUT_TASK4.size }),
  task4_wait: waitHint,
  task4_legit: (S) => wardrobeHint(S, boughtId(S, 'task4'), 'legitCheck', 'Пришло — проверь в руках.'),
  task4_dispute: (S) => wardrobeHint(S, boughtId(S, 'task4'), 'dispute', 'Жми «Открыть спор».'),
};

/* ======================= ЗВОНОК ======================= */

const HANDSET = `<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="currentColor"
  d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/></svg>`;

function callLayer() {
  let el = $('#call');
  if (!el) {
    el = document.createElement('div');
    el.id = 'call';
    $('#phone').appendChild(el);
    el.addEventListener('click', onCallClick);
  }
  return el;
}

function hideCall() {
  ringing(false);
  const el = $('#call');
  if (el && !el.hidden) el.hidden = true;
  if (C.call && C.call.timer) clearInterval(C.call.timer);
  if (C.call) C.call = null;
}

function showCall() {
  const el = callLayer();
  if (!C.call) {
    C.call = { phase: 'ring', line: 0, shown: [], started: 0, timer: null, declined: 0 };
    el.hidden = false;
    // Баннеры, накопившиеся до звонка, в главу не тащим: они уже в шторке.
    UI.queue = UI.queue.filter((n) => n.tut);
    if (UI.current && !UI.current.tut) hideBanner();
    // Звонок приходит не сразу: секунда тишины на главном экране делает его событием.
    el.className = 'waiting';
    el.innerHTML = '';
    setTimeout(() => {
      if (C.call && C.call.phase === 'ring') {
        drawCall();
        ringing(true);
      }
    }, 900);
  }
}

function drawCall() {
  const el = callLayer();
  const c = C.call;
  if (!c) return;
  if (c.phase === 'ring') {
    el.className = 'ringing';
    el.innerHTML = `<div class="call-top">
        <div class="call-ava"><span>Т</span><i></i><i></i></div>
        <div class="call-name">Тимур</div>
        <div class="call-sub">${c.declined ? 'звонит снова…' : 'мобильный · входящий вызов'}</div>
      </div>
      <div class="call-btns">
        <button class="call-btn no" data-call="decline" aria-label="Отклонить"><span>${HANDSET}</span><small>Отклонить</small></button>
        <button class="call-btn yes" data-call="accept" aria-label="Ответить"><span>${HANDSET}</span><small>Ответить</small></button>
      </div>`;
    return;
  }
  const secs = Math.floor((Date.now() - c.started) / 1000);
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const line = callLines()[c.line];
  const done = c.line >= callLines().length;
  let controls = '';
  if (done) controls = '<button class="call-hang" data-call="hang">Положить трубку</button>';
  else if (line.choice) {
    controls = `<div class="call-choice">${line.choice
      .map((o, i) => `<button data-call="choose" data-i="${i}">${esc(o.text)}</button>`)
      .join('')}</div>`;
  } else controls = '<div class="call-tap">нажми, чтобы слушать дальше</div>';
  el.className = 'talking';
  el.innerHTML = `<div class="call-top small">
      <div class="call-ava"><span>Т</span></div>
      <div class="call-name">Тимур</div>
      <div class="call-sub" id="callClock">${clock}</div>
    </div>
    <div class="call-lines">${c.shown
      .map((l) => `<div class="call-line ${l.who}">${esc(l.text)}</div>`)
      .join('')}</div>
    <div class="call-controls">${controls}</div>`;
  const list = el.querySelector('.call-lines');
  if (list) list.scrollTop = list.scrollHeight;
}

/** Реплики звонка текущей главы: у каждой главы свой разговор. */
function callLines() {
  const step = currentStep(UI.S);
  return (step && step.lines) || [];
}

/** Следующая реплика звонка: Тимур говорит, пока не дойдёт до выбора. */
function callAdvance() {
  const c = C.call;
  if (!c) return;
  const line = callLines()[c.line];
  if (!line || line.choice) return;
  c.shown.push({ who: line.who, text: line.text });
  c.line++;
  drawCall();
}

function onCallClick(e) {
  const c = C.call;
  if (!c) return;
  const b = e.target.closest('[data-call]');
  const act = b && b.dataset.call;
  if (c.phase === 'ring') {
    if (act === 'decline') {
      // Тимур так просто не отстанет — и это первая шутка игры.
      c.declined++;
      const el = callLayer();
      el.className = 'waiting';
      el.innerHTML = '';
      ringing(false);
      setTimeout(() => {
        if (!C.call) return;
        drawCall();
        ringing(true);
      }, 1200);
    }
    if (act === 'accept') {
      ringing(false);
      c.phase = 'talk';
      c.started = Date.now();
      c.timer = setInterval(() => {
        const k = document.getElementById('callClock');
        if (!k || !C.call) return;
        const s = Math.floor((Date.now() - C.call.started) / 1000);
        k.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      }, 500);
      if (c.declined) c.shown.push({ who: 't', text: 'Э, ты чего трубку бросаешь? 😄' });
      callAdvance();
    }
    return;
  }
  if (act === 'choose') {
    const line = callLines()[c.line];
    const o = line.choice[+b.dataset.i];
    c.shown.push({ who: 'me', text: o.text });
    c.shown.push({ who: 't', text: o.reply });
    c.line++;
    drawCall();
    return;
  }
  if (act === 'hang') {
    actions.tutNext({});
    return;
  }
  callAdvance();
}
