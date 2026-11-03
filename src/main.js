// Запуск игры: сборка состояния, действия интерфейса и игровой цикл.

import { esc, rub, num, plural, parseNum } from './core/util.js';
import { MODELS, BRANDED } from './core/data/models.js';
import { COST_ROOM_WEEK, COST_FOOD_DAY } from './core/data/progress.js';
import { SEASON_MODIFIERS, seasonDaysLeft } from './core/events.js';
import { seasonTitle, seasonMoments, seasonCarry, seasonLose } from './core/season.js';
import { RIVAL_NAME } from './core/rival.js';
import { dateLabel, dateLabelFull, clockLabel, hourIndex, nextRestock, SCHEDULE } from './core/time.js';
import {
  netWorth,
  valueOrig,
  pawnPrice,
  bookValue,
  hypePct,
  rhythmLabel,
  fastReplyBadge,
  seenItem,
} from './core/economy.js';
import { itemName, sizeLabel, shownCondition } from './core/items.js';
import { createGame, saveGame, loadGame, clearSave, restoreCounters } from './core/engine.js';
import { touch, findThread, say, installed, installApp as installAppCore } from './core/kernel.js';
import { advanceHours, advanceMinutes, sleep as sleepNight } from './core/tick.js';
import { applyUnlock } from './core/progression.js';
import { findListing } from './core/market/avito.js';
import { findSlot } from './core/market/second.js';
import { SUPPLIERS } from './core/market/suppliers.js';
import { CHANNEL_NAME_SUGGESTIONS } from './core/data/content.js';

import * as Buying from './core/actions/buying.js';
import * as Selling from './core/actions/selling.js';
import * as Items from './core/actions/items.js';
import * as Social from './core/actions/social.js';
import * as Finance from './core/actions/finance.js';
import * as Staff from './core/actions/staff.js';
import * as Showroom from './core/actions/showroom.js';
import * as Brand from './core/actions/brand.js';
import { fairPrice } from './core/brand.js';
import * as Tutorial from './core/tutorial.js';
import { tutorialActive, tutorialNext, tutorialSync, runTutorialHeadless, currentStep } from './core/tutorial.js';
import { initCoach, updateCoach, coachAfterClick } from './ui/coach.js';

import {
  UI,
  registerApp,
  registerActions,
  render,
  scheduleRender,
  go,
  back,
  goRoute,
  sheet,
  closeSheet,
  isSheetOpen,
  toast,
  pushNotification,
  bindGestures,
  bindInputGuards,
  updateClock,
  fillNotifCenter,
  isNotifOpen,
  hideBanner,
} from './ui/shell.js';
import { $ } from './ui/dom.js';

import * as AvitoApp from './ui/apps/avito.js';
import * as TgApp from './ui/apps/tg.js';
import * as PoizonApp from './ui/apps/poizon.js';
import * as SecondApp from './ui/apps/second.js';
import * as WardrobeApp from './ui/apps/wardrobe.js';
import * as BankApp from './ui/apps/bank.js';
import * as ShopApp from './ui/apps/shop.js';
import * as NotebookApp from './ui/apps/notebook.js';
import { parcels, goals, job, settings } from './ui/apps/misc.js';
import * as StoreApp from './ui/apps/store.js';
import { startDownload, finishDownload, unlocked, DOWNLOAD_MS } from './ui/apps/store.js';
import { dailyLabel } from './core/daily.js';
import { upcomingCall } from './core/tutorial.js';
import { NEWS, NEWS_VERSION } from './core/data/news.js';
import { initSfx, setPref } from './ui/sfx.js';

/* ======================= СОСТОЯНИЕ ======================= */

let S = loadGame();
if (S) {
  restoreCounters(S);
} else {
  S = createGame();
}
UI.S = S;
UI.save = () => saveGame(S);

S.onNotify = (n) => pushNotification(n);
S.onToast = (text) => toast(text);

registerApp('avito', AvitoApp);
registerApp('tg', TgApp);
registerApp('poizon', PoizonApp);
registerApp('second', SecondApp);
registerApp('wardrobe', WardrobeApp);
registerApp('bank', BankApp);
registerApp('shop', ShopApp);
registerApp('notebook', NotebookApp);
registerApp('parcels', parcels);
registerApp('goals', goals);
registerApp('job', job);
registerApp('settings', settings);
registerApp('store', StoreApp);

/* ======================= ПОМОЩНИКИ ======================= */

function after() {
  // Общая страховка для всех действий, а не только тех, где не забыли
  // afterTimeJump: если действие довело до полуночи — спать; если сезон
  // кончился или пришло банкротство, а экран итогов чем-то перекрыли —
  // вернуть его. Иначе часы стояли, а играть можно было дальше в никуда.
  if (S.flags.started && hourIndex(S.t) === SCHEDULE.sleepHour && !S.flags.seasonEnd && !S.flags.bankrupt) {
    doSleep(true);
    return;
  }
  const wasTut = tutorialActive(S);
  const wasPart = S.tut.part;
  tutorialSync(S);
  saveGame(S);
  scheduleRender();
  ensureBlockingSheet();
  if (wasTut && !tutorialActive(S)) partDoneSheet(wasPart, false);
  setTimeout(updateCoach, 0);
}

function ensureBlockingSheet() {
  if (S.flags.bankrupt && !document.querySelector('#sheet [data-act="resetOk"]')) bankruptSheet();
  else if (S.flags.seasonEnd && !S.flags.bankrupt && !document.querySelector('#sheet [data-act="newSeason"]')) seasonEndSheet();
}

function inputValue(id) {
  const el = document.getElementById(id);
  return el ? parseNum(el.value) : 0;
}

function afterTimeJump() {
  // Если во время действия наступила полночь — засыпаем.
  if (hourIndex(S.t) === SCHEDULE.sleepHour) {
    doSleep(true);
    return true;
  }
  return false;
}

/* ======================= ОКНА ======================= */

/** Что каждая глава обучения дала игроку — для итогового окна. */
const PART_DONE = {
  avito: {
    played: 'Худи продано в плюс, Самбы проверены в руках. А дальше ты уже сам выбрал вещь под заказ и поймал подмену по фото — деньги вернул через спор.',
    skipped: 'Тимур всё сделал за тебя: купил и продал худи, взял трендовые Самбы и закрыл два заказа клиентов — один с подменой и возвратом через спор.',
    learned: ['Фильтры и поиск на Авитке', 'Паль: признаки и легит-чек', 'Встреча, дефекты и торг', 'Объявление, цена и переписка', 'Доставка: чек в руках и спор за 24 часа'],
    next: () =>
      `Вечером выстави на Авитку старые вещи из шкафа. Завтра в 9:00 позвонит Тимур — покажет Телегу. Комната — ${rub(COST_ROOM_WEEK)} в понедельник, еда — ${rub(COST_FOOD_DAY)} в день.`,
  },
  tg: {
    played: 'Свой канал заведён, первая продажа в нём — деньги сразу на карте. Хайп-радар прочитан, а первый заказ подписчика ты сам нашёл и отдал с прибылью.',
    skipped: 'Тимур завёл тебе канал, продал подписчику вещь из него и закрыл для тебя первый заказ.',
    learned: ['Свой канал и витрина', 'Подписчики: репост, реклама, розыгрыши', 'Продажа в канале', 'Хайп-радар', 'Заказ подписчика: от предоплаты до передачи'],
    next: () => 'Пиши в канал, отвечай подписчикам, бери заказы. Продай что-нибудь сам — и в день завоза Тимур расскажет про секонд.',
  },
  second: {
    played: 'Ты был у дверей к открытию и выбрал раньше Мирона. Брендовое в секонде — пятьдесят на пятьдесят паль: решает главный признак, а паль продают честно.',
    skipped: 'Тимур сходил в «Мешок» к открытию, взял ориг и выставил его. Секонд теперь на телефоне.',
    learned: ['Завоз по пн и чт, открытие в 10:00', 'Осмотр на скорость: главный признак', 'Мирон у полки к открытию', 'Паль — честно как реплику'],
    next: () => 'Следующий завоз — будь у дверей к десяти. А через день-два Тимур покажет Пойзон.',
  },
  poizon: {
    played: 'Две посылки в пути: шапка Норс — ставка до хайпа по старой цене Пойзона, и Вансы 46-го — под заказ Стаса, такого размера нигде больше нет.',
    skipped: 'Тимур заказал за тебя шапку Норс до хайпа и Вансы 46-го под заказ Стаса — обе посылки в пути. Пойзон теперь на телефоне.',
    learned: ['Срок доставки у каждой вещи', 'Цена Пойзона отстаёт от хайпа', 'Ставка заранее по прогнозу', 'Любой размер — под заказ подписчика'],
    next: () => 'Посылки придут через 8–14 дней — Тимур напишет, а Вансы отдашь Стасу в переписке. А пока ты сам: расти канал, качай уровень, иди в топ перекупов Москвы.',
  },
};

/** Дела Тимура на сегодня — в утренней сводке, чтобы день начинался с плана. */
function dailyBlock(S) {
  const D = S.daily;
  if (!D || D.day !== Math.floor(S.t / 24) || !D.tasks.length) return '';
  return `<div class="card tight daily">
      <div class="row between"><h4>Дела Тимура</h4><span class="streak ${D.streak ? 'on' : ''}">🔥 ${D.streak}</span></div>
      ${D.tasks.map((t) => `<div class="goal"><div class="mark"></div><div class="gn">${esc(dailyLabel(S, t))}</div><span></span></div>`).join('')}
      <div class="muted">${D.lost ? `Серия в ${D.lost} дн. сгорела — начинай заново. ` : ''}Все три до полуночи — серия +1.</div>
    </div>`;
}

/** Глава обучения кончилась: что умеешь, какие главы позади и что дальше. */
function partDoneSheet(part, skipped) {
  const P = PART_DONE[part];
  if (!P) return;
  const parts = Tutorial.PARTS.map((p) => {
    const done = S.tut.ended[p.id] !== undefined;
    return `<span class="part-chip${done ? ' done' : ''}${p.id === part ? ' now' : ''}">${done ? '✓ ' : ''}${esc(p.n)}</span>`;
  }).join('');
  const last = part === 'poizon';
  sheet(`<h2>${last ? 'Ты в деле 🔥' : `Глава «${esc(Tutorial.PARTS.find((p) => p.id === part).n)}» ${skipped ? 'пропущена' : 'пройдена'}`}</h2>
    <div class="part-chips">${parts}</div>
    <p>${esc(skipped ? P.skipped : P.played)}</p>
    <div class="card tight">${P.learned.map((x) => `<div class="kv"><span>${esc(x)}</span><span class="pos">✓</span></div>`).join('')}</div>
    <div class="callout info"><b>Что дальше</b><br>${P.next(S)}${
      part === 'avito' ? ' Время снова идёт: секунда — минута.' : ''
    }</div>
    <button class="btn full" data-act="closeSheet">${last ? 'Погнали' : 'Понял'}</button>`);
}

function timeSheet() {
  const h = hourIndex(S.t);
  sheet(`<h2>${esc(clockLabel(S.t, S.min))} · ${esc(dateLabel(S.t))}</h2>
    <p>Одна реальная секунда — одна игровая минута. Покупатели пишут с 9 до 23, продавцы встречаются с 9 до 20, секонд работает с 10 до 21. В полночь ты вырубаешься.</p>
    <div class="seg">${[1, 2, 4]
      .map((k) => `<button class="${S.ui.speed === k ? 'on' : ''}" data-act="setSpeed" data-val="${k}">×${k}</button>`)
      .join('')}</div>
    <div class="stack">
      <button class="btn sec full" data-act="waitClose" data-h="1">Подождать час</button>
      <button class="btn sec full" data-act="waitClose" data-h="3">Подождать 3 часа</button>
      ${h >= 7 && h < 19 ? `<button class="btn sec full" data-act="waitClose" data-h="${19 - h}">До 19:00</button>` : ''}
      <button class="btn full" data-act="sleep">Спать до утра</button>
    </div>`);
}

/**
 * Утренняя сводка. С неё начинается игровая сессия: что случилось ночью,
 * кто ждёт ответа, что сегодня на рынке и чем заняться в первую очередь.
 */
function morningSheet(log) {
  const rows = log
    .map(
      (e) => `<div class="kv"><span>${esc(e.text)}</span><span class="${e.amount > 0 ? 'pos' : ''}">${
        e.amount ? (e.amount > 0 ? '+' : '') + rub(e.amount) : ''
      }</span></div>`,
    )
    .join('');

  // Кто ждёт ответа.
  const waitingBuyers = S.threads.filter((t) => t.kind === 'buyer' && !t.closed && t.unread > 0).length;
  const orders = S.threads.filter((t) => t.kind === 'order' && !t.closed);
  const claims = S.threads.filter((t) => t.kind === 'claim' && !t.closed).length;
  const lots = S.threads.filter((t) => t.kind === 'lot' && !t.closed).length;

  const waiting = [];
  if (waitingBuyers) waiting.push(`${waitingBuyers} ${plural(waitingBuyers, 'покупатель', 'покупателя', 'покупателей')} ждут ответа`);
  if (orders.length) {
    const soon = orders.filter((t) => t.data.order.deadline - S.t < 48).length;
    waiting.push(`${orders.length} ${plural(orders.length, 'заказ', 'заказа', 'заказов')} в работе${soon ? ` (${soon} горит)` : ''}`);
  }
  if (claims) waiting.push(`${claims} ${plural(claims, 'претензия', 'претензии', 'претензий')} без ответа`);
  if (lots) waiting.push(`${lots} ${plural(lots, 'лот', 'лота', 'лотов')} в личке`);

  // Что сегодня.
  const today = [];
  const restock = nextRestock(S.t);
  if (restock.label === 'сегодня в 10:00' && installed(S, 'second')) {
    today.push(restock.big ? 'В 10:00 большой завоз в секонде' : 'В 10:00 подвоз в секонде');
  }
  const dw = new Date(2026, 8, 7 + Math.floor(S.t / 24)).getDay();
  if (dw === 1) today.push(`Сегодня понедельник: спишется аренда и платежи по кредитам`);
  // Ритм недели: в начале закупаются, в конце покупают. Это надо говорить вслух,
  // иначе игрок решит, что спрос просто случайный.
  today.push(
    rhythmLabel(S).n.charAt(0).toUpperCase() +
      rhythmLabel(S).n.slice(1) +
      (dw === 5 || dw === 6 ? ': зарплата и выходные' : dw === 1 || dw === 2 ? ' — зато на рынке есть что взять' : ''),
  );
  if (installed(S, 'tg') && S.raffle && S.raffle.entered && !S.raffle.done && S.raffle.resultAt - S.t < 24) today.push('Сегодня итоги раффла');
  // Звонок Тимура сегодня — первым делом в план дня.
  const call = upcomingCall(S);
  if (call && call.text.startsWith('Сегодня')) today.unshift(call.text);
  if (fastReplyBadge(S)) today.push(`Значок «отвечает быстро» держится ${S.streak.days} ${plural(S.streak.days, 'день', 'дня', 'дней')} подряд`);
  if (S.rep.banUntil > S.t) today.push('Авитка заблокирована — работай через канал');
  const arriving = S.shipments.filter((sh) => sh.eta - S.t < 24).length;
  if (arriving) today.push(`${arriving} ${plural(arriving, 'посылка придёт', 'посылки придут', 'посылок придёт')} сегодня`);

  // Рынок.
  const hot = BRANDED.map((m) => ({ m, h: hypePct(S, m.i) }))
    .sort((a, b) => b.h - a.h)
    .slice(0, 3);

  // Что стоит сделать.
  const stale = S.items.filter((i) => i.sale && daysHeldDays(i) > 12).length;
  const unlisted = S.items.filter((i) => !i.sale).length;
  let nudge = '';
  if (claims) nudge = 'Сначала разберись с претензиями: молчание стоит дороже возврата.';
  else if (orders.some((t) => t.data.order.deadline - S.t < 48)) nudge = 'У заказа горит срок. Клиенты помнят, кто подвёл.';
  else if (unlisted) nudge = `В шкафу ${unlisted} ${plural(unlisted, 'вещь', 'вещи', 'вещей')} без объявления. Деньги в них не работают.`;
  else if (stale) nudge = `${stale} ${plural(stale, 'вещь залежалась', 'вещи залежались', 'вещей залежались')}. Сбрось цену или сдай в скупку.`;
  else if (restock.label === 'сегодня в 10:00' && installed(S, 'second')) nudge = 'Завоз в десять. Приличное разберут за несколько часов — думай быстро.';
  else nudge = 'Посмотри, что в ликвиде, и реши, во что вкладываться.';

  sheet(`<h2>Доброе утро</h2>
    <p class="muted">${esc(dateLabelFull(S.t))}, 08:00 · сезон ${S.season.no}, осталось ${seasonDaysLeft(S)} ${plural(seasonDaysLeft(S), 'день', 'дня', 'дней')}</p>
    ${rows || '<div class="muted">Ночь прошла спокойно.</div>'}
    ${
      waiting.length
        ? `<div class="callout info"><b>Ждут тебя</b><br>${waiting.map(esc).join('<br>')}</div>`
        : ''
    }
    ${today.length ? `<div class="callout"><b>Сегодня</b><br>${today.map(esc).join('<br>')}</div>` : ''}
    ${dailyBlock(S)}
    <div class="card tight">
      <h4>Сейчас в ликвиде</h4>
      ${hot.map((x) => `<div class="kv"><span>${esc(x.m.full)}</span><span>${x.h}%</span></div>`).join('')}
      ${S.tg.proUntil > S.t ? '<div class="muted">Прогноз PRO пришёл в Хайп-радар.</div>' : ''}
    </div>
    <div class="callout ok">${esc(nudge)}</div>
    <button class="btn full" data-act="closeSheet">Начать день</button>`);
}

const daysHeldDays = (item) => Math.max(0, (S.t - (item.boughtAt || 0)) / 24);

function bankruptSheet() {
  sheet(`<h2>Банкротство</h2>
    <p>Долги выросли настолько, что банк подал в суд. Коллекторы забрали всё, карьера перекупа закончилась.</p>
    <div class="kv"><span>Дней в деле</span><span>${Math.floor(S.t / 24) + 1}</span></div>
    <div class="kv"><span>Продано вещей</span><span>${S.stats.sold}</span></div>
    <div class="kv"><span>Долг</span><span class="neg">${rub(S.loans.reduce((a, l) => a + l.principal, 0))}</span></div>
    <p class="muted">В следующий раз не вкладывай в одну сделку всё и не тяни с кредитом.</p>
    <button class="btn bad full" data-act="resetOk">Начать заново</button>`);
}

/**
 * Итоги сезона. Сначала кем ты стал и что с тобой произошло, потом цифры:
 * четыре месяца игры заслуживают истории, а не только таблицы.
 */
function seasonEndSheet() {
  const sum = Finance.seasonSummary(S);
  const title = seasonTitle(S);
  const moments = seasonMoments(S);
  const carry = seasonCarry(S);

  sheet(`<h2>Сезон ${sum.no}: ${esc(title.n)}</h2>
    <p class="muted">31 декабря, ${sum.days} ${plural(sum.days, 'день', 'дня', 'дней')} в деле. Рынок замер, пора считать.</p>
    <p>${esc(title.d)}</p>
    ${
      moments.length
        ? `<div class="card tight">${moments
            .map((m) => `<div class="kv"><span><b style="color:var(--ink)">${esc(m.n)}</b><small>${esc(m.t)}</small></span></div>`)
            .join('')}</div>`
        : ''
    }
    <div class="card tight">
      <div class="kv"><span>Капитал</span><span class="money">${rub(sum.netWorth)}</span></div>
      <div class="kv"><span>Прибыль за сезон</span><span class="${sum.profit >= 0 ? 'pos' : 'neg'}">${rub(sum.profit)}</span></div>
      <div class="kv"><span>Продано вещей</span><span>${sum.sold}</span></div>
      <div class="kv"><span>Уровень</span><span>${sum.level} · ${esc(sum.status)}</span></div>
      <div class="kv"><span>Место в топе</span><span>${sum.rivalBeaten ? 'выше ' + esc(RIVAL_NAME) + 'а' : 'ниже ' + esc(RIVAL_NAME) + 'а'}</span></div>
    </div>
    <p class="muted"><b style="color:var(--ink)">Переносится:</b> ${esc(carry.join('; '))}.<br><b style="color:var(--ink)">Остаётся в прошлом:</b> ${esc(seasonLose(S).join('; '))}.</p>
    <p>Выбери, с чем войдёшь в новый.</p>
    <div class="stack">${SEASON_MODIFIERS.map(
      (m) => `<button class="choice" data-act="newSeason" data-id="${m.id}"><b>${esc(m.n)}</b><span>${esc(m.d)}</span></button>`,
    ).join('')}</div>`);
}

function sellSheet(itemId) {
  const item = S.items.find((i) => i.id === +itemId);
  if (!item) return;
  const m = MODELS[item.m];
  const sm =
    S.ui.sell && S.ui.sell.id === item.id
      ? S.ui.sell
      : (S.ui.sell = {
          id: item.id,
          asOrig: item.sale ? item.sale.asOrig : item.verdict !== 'fake',
          avito: item.sale ? item.sale.avito : S.rep.banUntil <= S.t,
          tg: item.sale ? item.sale.tg : S.tg.has,
          price: item.sale ? item.sale.price : 0,
        });

  const prices = Selling.priceSuggestions(S, item, sm.asOrig);
  if (!sm.price) sm.price = prices.market;
  const hint = Selling.saleHint(S, item, sm.price, sm.asOrig, sm.avito, sm.tg);

  let warning = '';
  if (sm.asOrig && item.verdict === 'fake') {
    warning = '<div class="callout danger">Ты знаешь, что это паль. Продавать её как оригинал — обман. Покупатель может спросить напрямую, и тогда придётся решать, врать или нет.</div>';
  } else if (sm.asOrig && item.verdict === 'unknown' && !m.noname) {
    warning = '<div class="callout">Подлинность не проверена. Если это окажется паль, отвечать всё равно тебе.</div>';
  } else if (!sm.asOrig && !m.noname) {
    warning = '<div class="callout">Честная реплика — это нормально, но покупатели ставят 3–4★, и рейтинг растёт медленнее.</div>';
  }

  sheet(`<h2>${item.sale ? 'Изменить объявление' : 'Выставить на продажу'}</h2>
    <p>${esc(itemName(item))} · ${esc(sizeLabel(item))} · ${esc(shownCondition(item).short)} · вложено ${rub(item.cost)}</p>
    ${
      m.noname
        ? ''
        : `<div class="seg" data-tut="sell-kind">
            <button class="${sm.asOrig ? 'on' : ''}" data-act="sellSet" data-key="asOrig" data-val="1">Оригинал</button>
            <button class="${!sm.asOrig ? 'on' : ''}" data-act="sellSet" data-key="asOrig" data-val="0">Реплика</button>
          </div>`
    }
    ${warning}
    <div class="muted">Рынок ${sm.asOrig ? 'оригиналов' : 'реплик'} сейчас: ~${rub(prices.base)}</div>
    <div class="row wrap">
      <button class="chip" data-act="sellPrice" data-val="${prices.quick}">Быстро · ${rub(prices.quick)}</button>
      <button class="chip ${sm.price === prices.market ? 'on' : ''}" data-tut="market" data-act="sellPrice" data-val="${prices.market}">Рынок · ${rub(prices.market)}</button>
      <button class="chip" data-act="sellPrice" data-val="${prices.greedy}">Жадно · ${rub(prices.greedy)}</button>
    </div>
    <input class="inp num" id="sellPriceInput" data-input="sellPrice" inputmode="numeric" value="${sm.price}" aria-label="Цена">
    <button class="check ${sm.avito ? 'on' : ''}" data-act="sellSet" data-key="avito" ${S.rep.banUntil > S.t ? 'disabled' : ''}>
      <i>${sm.avito ? '✓' : ''}</i>Авитка${S.rep.banUntil > S.t ? ' (заблокирована)' : ''}</button>
    <button class="check ${sm.tg ? 'on' : ''}" data-act="sellSet" data-key="tg" ${S.tg.has ? '' : 'disabled'}>
      <i>${sm.tg ? '✓' : ''}</i>Мой канал${S.tg.has ? ` · ${num(S.tg.subs)} подп.` : ' (сначала создай)'}</button>
    <div class="muted" id="sellHint">${hint.perDay < 0.05 ? 'По такой цене почти никто не напишет' : `≈ ${hint.perDay.toFixed(1)} покупателя в день, ждать ${esc(hint.etaText)}`} · ${esc(hint.verdict)} · прибыль ${hint.profit >= 0 ? '+' : ''}${rub(hint.profit)}</div>
    <button class="btn full" data-act="sellOk" ${sm.avito || sm.tg ? '' : 'disabled'}>${item.sale ? 'Сохранить' : 'Опубликовать'}</button>
    <button class="btn ghost" data-act="closeSheet">Отмена</button>`);
}

/* ======================= ДЕЙСТВИЯ ======================= */

const A = {};

/* --- навигация --- */
A.goHome = () => {
  closeSheet();
  go(null);
  after();
};
A.back = () => {
  back();
  after();
};
A.openApp = (d) => {
  // Первое открытие гасит синюю точку «новое» у иконки.
  const a = S.apps && S.apps[d.app];
  if (a && a.fresh) delete a.fresh;
  go(d.app, 'main');
  after();
};
/** «Загрузить» в Апсторе: кольцо загрузки, потом приложение на телефоне. */
A.installApp = (d) => {
  const id = d.app;
  if (installed(S, id) || !unlocked(S, id)) return;
  startDownload(id);
  scheduleRender();
  setTimeout(() => {
    finishDownload(id);
    installAppCore(S, id);
    after();
  }, DOWNLOAD_MS);
};
A.go = (d) => {
  goRoute(d.route);
  after();
};
A.nav = (d) => {
  S.ui.view = d.view;
  S.ui.id = null;
  touch(S);
  after();
};
A.tgTab = (d) => {
  S.ui.tgTab = d.val;
  touch(S);
  after();
};
A.wardrobeTab = (d) => {
  S.ui.wardrobeTab = d.val;
  touch(S);
  after();
};
A.openChannel = (d) => {
  S.ui.channel = d.chan;
  S.ui.tgTab = 'channels';
  go('tg', 'channel', null);
  after();
};
A.showMore = () => {
  S.ui.limit += 24;
  touch(S);
  after();
};
/** «Что нового» — один раз для тех, кто играл до обновления. */
function newsSheet() {
  S.news = NEWS_VERSION;
  touch(S);
  sheet(`<h2>Что нового</h2>
    <p class="muted">Пока тебя не было, в игре появилось:</p>
    ${NEWS.map(
      (x) => `<button class="card tight full-btn" data-act="newsGo" data-app="${x.where}">
        <div class="row"><span style="font-size:22px">${x.icon}</span><b>${esc(x.n)}</b></div>
        <div class="muted">${esc(x.t)}</div></button>`,
    ).join('')}
    <button class="btn full" data-act="closeSheet">Понял, играть</button>`);
}

A.newsGo = (d) => {
  closeSheet();
  go(d.app);
  after();
};

A.closeSheet = () => {
  closeSheet();
};
A.refresh = () => {
  touch(S);
  after();
};

/* --- обучение --- */
A.tutNext = () => {
  const was = tutorialActive(S);
  const part = S.tut.part;
  tutorialNext(S);
  after();
  if (was && !tutorialActive(S)) partDoneSheet(part, false);
};
/** Пауза кончилась — шаг ожидания делает своё (покупатель пишет). */
A.tutWait = () => {
  const step = currentStep(S);
  if (step && step.kind === 'wait' && step.auto) step.auto(S);
  after();
};
/** «Пропустить» — эту главу. Следующие придут своим звонком. */
A.tutSkip = () => {
  if (!tutorialActive(S)) return;
  const part = S.tut.part;
  closeSheet();
  // Тимур доигрывает главу без экрана. Его уведомления за это время уходят
  // только в шторку — иначе после пропуска пачка старых баннеров («Перевод
  // от Тимура», «Покупатель пишет»…) ехала бы поверх итогового окна.
  const onNotify = S.onNotify;
  S.onNotify = null;
  runTutorialHeadless(S);
  S.onNotify = onNotify;
  UI.queue = [];
  hideBanner();
  go(null);
  saveGame(S);
  scheduleRender();
  partDoneSheet(part, true);
  setTimeout(updateCoach, 0);
};
/** Открыть окно продажи заново, не сбрасывая то, что игрок уже выбрал. */
A.sellSheetKeep = (d) => sellSheet(d.id);

/* --- фильтры --- */
A.search = () => {
  const el = document.getElementById('searchInput');
  S.ui.filters.q = el ? el.value : '';
  S.ui.limit = 24;
  touch(S);
  after();
};
A.filterCat = (d) => {
  S.ui.filters.cat = d.val;
  S.ui.filters.model = 'all';
  S.ui.filters.size = 'all';
  S.ui.limit = 24;
  touch(S);
  after();
};
A.toggleDeals = () => {
  S.ui.filters.onlyDeals = !S.ui.filters.onlyDeals;
  touch(S);
  after();
};
A.resetFilters = () => {
  S.ui.filters = { cat: 'all', model: 'all', size: 'all', mode: 'all', sort: S.ui.filters.sort, q: '', onlyDeals: false };
  touch(S);
  after();
};
A.searchModel = (d) => {
  S.ui.filters = { cat: 'all', model: d.model, size: 'all', mode: 'all', sort: 'deal', q: '', onlyDeals: false };
  go('avito', 'main');
  after();
};
A.poizonSearch = () => {
  const el = document.getElementById('poizonSearch');
  S.ui.poizon.q = el ? el.value : '';
  touch(S);
  after();
};
A.poizonCat = (d) => {
  S.ui.poizon.cat = d.val;
  touch(S);
  after();
};
A.pzSize = (d) => {
  S.ui.sizeChoice[d.model] = d.val;
  touch(S);
  after();
};
A.pzWay = (d) => {
  S.ui.sizeChoice['way' + d.model] = +d.val;
  touch(S);
  after();
};
A.qty = (d) => {
  const key = d.key;
  const min = +d.min || 1;
  const max = +d.max || 50;
  const current = S.ui.qty[key] || min;
  S.ui.qty[key] = Math.max(min, Math.min(max, current + +d.d));
  touch(S);
  after();
};
A.raffleSize = (d) => {
  S.ui.raffleSize = d.val;
  touch(S);
  after();
};

/* --- время --- */
A.wait = (d) => {
  const slept = advanceHours(S, +d.h);
  if (slept) doSleep(true);
  else after();
};
A.waitClose = (d) => {
  closeSheet();
  A.wait(d);
};
A.sleep = () => {
  closeSheet();
  doSleep(false);
};
A.timeSheet = () => timeSheet();
A.buyUpgrade = (d) => {
  if (Finance.buyUpgrade(S, d.id)) toast('Подключено ✓');
  after();
};

A.reserveSlot = (d) => {
  Finance.reserveSlot(S, S.second.items.find((x) => x.id === +d.id));
  after();
};

A.setPref = (d) => {
  setPref(d.key, d.val === '1');
  render();
};

A.setSpeed = (d) => {
  S.ui.speed = +d.val;
  touch(S);
  after();
};

function doSleep(forced) {
  const log = sleepNight(S);
  closeSheet();
  go(null);
  render();
  saveGame(S);
  if (S.flags.bankrupt) {
    bankruptSheet();
    return;
  }
  if (S.flags.seasonEnd) {
    seasonEndSheet();
    return;
  }
  morningSheet(log);
}

/* --- Авитка: покупка --- */
A.openSellerChat = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const th = Buying.sellerThread(S, l);
  go('avito', 'thread', th.id);
  after();
};
A.askSeller = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  Buying.askSeller(S, l, d.q);
  if (afterTimeJump()) return;
  if (S.ui.view !== 'thread' && d.q !== 'photos') {
    const th = Buying.sellerThread(S, l);
    go('avito', 'thread', th.id);
  }
  after();
};
A.useLever = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const res = Buying.useLever(S, l, d.lever);
  if (afterTimeJump()) return;
  if (res && res.walked) {
    toast(res.ok ? 'Ушёл. Возможно, перезвонит' : 'Продавец не стал уговаривать');
    go('avito', 'main');
  }
  after();
};
A.offerSeller = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const amount = inputValue('offerInput');
  Buying.offerToSeller(S, l, amount);
  if (afterTimeJump()) return;
  after();
};
A.buyDelivery = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const quote = Buying.buyWithDelivery(S, l);
  if (!quote) return after();
  if (quote.state === 'scamPush' || quote.state === 'meetOnly') {
    go('avito', 'thread', quote.threadId);
    return after();
  }
  if (quote.state !== 'ready') return after();
  sheet(`<h2>Авитка Доставка</h2>
    <p>${esc(itemName(l.item))} · ${esc(sizeLabel(l.item))} · ${esc(shownCondition(l.item).short)}</p>
    <div class="kv"><span>Цена</span><span>${rub(quote.price)}</span></div>
    <div class="kv"><span>Комиссия сервиса</span><span>${rub(quote.fee)}</span></div>
    <div class="kv"><span><b>Итого</b></span><span><b>${rub(quote.total)}</b></span></div>
    <div class="callout info">После получения у тебя 24 часа на легит-чек. Если продавец писал «оригинал», а это паль — вернёшь деньги через спор. Потом уже никак.</div>
    <button class="btn full" style="background:#00a046" data-act="confirmDelivery" data-id="${l.id}">Оплатить ${rub(quote.total)}</button>
    <button class="btn sec full" data-act="closeSheet">Отмена</button>`);
};
A.confirmDelivery = (d) => {
  const l = findListing(S, d.id);
  closeSheet();
  if (!l) return;
  const res = Buying.confirmDelivery(S, l);
  if (res) {
    toast('Заказ оформлен');
    go('parcels', 'main');
  }
  after();
};
A.meet = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const res = Buying.startMeeting(S, l);
  if (!res) return after();
  if (res.state === 'scamPush') {
    go('avito', 'thread', res.threadId);
    return after();
  }
  if (res.state === 'slept') return doSleep(true);
  if (res.state === 'gone') {
    go('avito', 'main');
    return after();
  }
  go('avito', 'meeting', l.id);
  after();
};
A.inspectMeet = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  Buying.meetInspect(S, l, d.tell);
  if (afterTimeJump()) return;
  after();
};
A.inspectMeetCond = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  Buying.meetInspectCondition(S, l);
  if (afterTimeJump()) return;
  after();
};
A.legitMeet = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const res = Buying.handLegit(S, l);
  if (res) {
    sheet(`<h2>Легит-чек вживую</h2>
      <div class="verdict-big ${res.verdict === 'orig' ? 'pos' : 'neg'}">${res.verdict === 'orig' ? 'ОРИГИНАЛ ✓' : 'ПАЛЬ ✗'}</div>
      <p>${esc(itemName(l.item))}. Вещь у тебя в руках — подменить её уже нельзя, ответ точный.${
        res.verdict === 'orig' ? ' Чек остаётся у вещи: его можно показать покупателю.' : ''
      }</p>
      <button class="btn full" data-act="closeSheet">Понятно</button>`);
  }
  if (afterTimeJump()) return;
  after();
};
A.accuse = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const res = Buying.accuseFake(S, l);
  if (res && res.right) toast('Признался и сбросил цену до ' + rub(res.price));
  else if (res) {
    toast('Это был оригинал. Продавец ушёл');
    go('avito', 'main');
  }
  after();
};
A.buyMeeting = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const res = Buying.buyAtMeeting(S, l);
  if (res) {
    go('wardrobe', 'item', res.itemId);
    toast('Вещь твоя');
  }
  after();
};
A.payScam = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const res = Buying.payScammer(S, l);
  if (res) {
    toast('Деньги ушли');
    go('avito', 'main');
  }
  after();
};
A.inspectListing = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  Buying.photoInspect(S, l, d.tell);
  if (afterTimeJump()) return;
  after();
};
A.inspectListingCond = () => {
  toast('Состояние по фото не оценить. Нужна встреча');
};
A.legitListing = (d) => {
  const l = findListing(S, d.id);
  if (!l) return;
  const res = Buying.photoLegit(S, l);
  if (res) {
    sheet(`<h2>Легит-чек по фото</h2>
      <div class="verdict-big ${res.verdict === 'orig' ? 'pos' : 'neg'}">${res.verdict === 'orig' ? 'НА ФОТО ОРИГИНАЛ' : 'ПАЛЬ ✗'}</div>
      <p>${
        res.verdict === 'orig'
          ? 'Сервис проверил снимки, а не вещь. Бывает, присылают фото чужого оригинала, а отправляют паль, — и хорошая копия на фото тоже иногда проходит. Пришла посылка — проверь её ещё раз в шкафу, пока идут сутки защиты.'
          : 'Сервис нашёл паль на снимках. Тут ошибки нет: паль на фото — паль и в посылке.'
      }</p>
      <button class="btn full" data-act="closeSheet">Понятно</button>`);
  }
  if (afterTimeJump()) return;
  after();
};

/* --- секонд --- */
A.inspectSlot = (d) => {
  const slot = findSlot(S, d.id);
  if (!slot) return;
  Buying.secondInspect(S, d.id, d.tell);
  if (afterTimeJump()) return;
  after();
};
A.inspectSlotCond = (d) => {
  Buying.secondInspectCondition(S, d.id);
  if (afterTimeJump()) return;
  after();
};
A.buySecond = (d) => {
  const res = Buying.buySecond(S, d.id);
  if (res) {
    toast('Куплено');
    go('second', 'main');
  }
  after();
};
A.waitSecondOpen = () => {
  const res = Buying.waitSecondOpen(S);
  if (res && res.slept) {
    doSleep(true);
    return;
  }
  if (res) toast('Открылись! Ты у полки первым');
  after();
};

/* --- Пойзон и поставщики --- */
A.buyPoizon = (d) => {
  const qty = S.ui.qty['pz' + d.model] || 1;
  const res = Buying.buyPoizon(S, +d.model, d.size, qty);
  if (res) {
    toast('Заказ оформлен · приедет ' + dateLabel(res.eta));
    S.ui.qty['pz' + d.model] = 1;
    go('parcels', 'main');
  }
  after();
};
A.buySupplier = (d) => {
  const C = SUPPLIERS[d.chan];
  const qty = S.ui.qty[d.id] || C.minQty;
  const res = Buying.buyFromSupplier(S, d.chan, +d.id, qty);
  if (res) {
    toast(`Оплачено · приедет ${dateLabel(res.eta)}`);
    go('parcels', 'main');
  }
  after();
};

/* --- шкаф --- */
A.inspectItem = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  Items.inspectTell(S, item, d.tell, 'hand');
  if (afterTimeJump()) return;
  after();
};
A.inspectItemCond = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  Items.inspectCondition(S, item);
  if (afterTimeJump()) return;
  after();
};
A.legitCheck = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  const res = Items.legitCheck(S, item);
  if (res) {
    sheet(`<h2>Легит-чек</h2>
      <div class="verdict-big ${res.verdict === 'orig' ? 'pos' : 'neg'}">${res.verdict === 'orig' ? 'ОРИГИНАЛ ✓' : 'ПАЛЬ ✗'}</div>
      <p>${esc(itemName(item))} · ${esc(sizeLabel(item))}. Вещь у сервиса в руках: бирки, швы, коды — ответ точный.</p>
      ${res.canDispute ? '<div class="callout danger">Продавец писал «оригинал». Можно открыть спор и вернуть деньги — но только пока идут 24 часа защиты.</div>' : ''}
      <div class="callout ok">Записал в книжку: теперь ты знаешь, чего ждать от этой модели.</div>
      <button class="btn full" data-act="closeSheet">Понятно</button>`);
  }
  if (afterTimeJump()) return;
  after();
};
A.dispute = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  const res = Items.openDispute(S, item);
  if (res) {
    go('wardrobe', 'main');
    sheet(`<h2>Спор выигран</h2>
      <p>Авитка вернула ${rub(res.amount)}. Вещь уехала обратно продавцу ${esc(res.seller || '')}.</p>
      <button class="btn full" data-act="closeSheet">Отлично</button>`);
  }
  after();
};
A.cleanItem = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  const res = Items.cleanUp(S, item);
  if (res) toast(res.fixed ? `Убрал ${res.fixed} ${plural(res.fixed, 'дефект', 'дефекта', 'дефектов')}` : 'Почистил');
  if (afterTimeJump()) return;
  after();
};
A.photoshoot = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  if (Items.photoshoot(S, item)) toast('Фото как в журнале · покупатели пишут чаще');
  if (afterTimeJump()) return;
  after();
};
A.writeDesc = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  if (Items.writeDescription(S, item)) toast('Описание добавлено');
  if (afterTimeJump()) return;
  after();
};
A.bumpListing = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  if (Items.bumpListing(S, item)) toast('Объявление в топе на сутки');
  after();
};
A.repost = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  if (Selling.repostToChannel(S, item)) toast('Запостил в канал');
  after();
};
A.unlist = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  Selling.unlist(S, item);
  after();
};
A.pawnSheet = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  const price = pawnPrice(S, item);
  sheet(`<h2>Скупка</h2>
    <p>Скупщик осмотрел ${esc(itemName(item))}.${item.verdict === 'fake' ? ' «Это паль, брат. Больше не дам.»' : ''}</p>
    <div class="kv"><span>Предлагает</span><span>${rub(price)}</span></div>
    <div class="kv"><span>Ты вложил</span><span>${rub(item.cost)}</span></div>
    <div class="kv"><span>Рынок</span><span>~${rub(valueOrig(S, seenItem(item)))}</span></div>
    <p class="muted">Быстрые деньги вместо ожидания. Иногда это разумно: место в шкафу тоже стоит денег.</p>
    <button class="btn full" data-act="pawnOk" data-id="${item.id}">Сдать за ${rub(price)}</button>
    <button class="btn sec full" data-act="closeSheet">Не надо</button>`);
};
A.pawnOk = (d) => {
  const item = Items.findItem(S, d.id);
  closeSheet();
  if (!item) return;
  const res = Items.pawn(S, item);
  go('wardrobe', 'main');
  if (res) toast('Сдано за ' + rub(res.price));
  after();
};
A.sellSheet = (d) => {
  S.ui.sell = null;
  sellSheet(d.id);
};
A.sellSet = (d) => {
  const sm = S.ui.sell;
  if (!sm) return;
  const el = document.getElementById('sellPriceInput');
  if (el) sm.price = parseNum(el.value);
  if (d.key === 'asOrig') {
    const next = d.val === '1';
    if (next !== sm.asOrig) {
      sm.asOrig = next;
      sm.price = 0;
    }
  } else {
    sm[d.key] = !sm[d.key];
  }
  sellSheet(sm.id);
};
A.sellPrice = (d) => {
  const sm = S.ui.sell;
  if (!sm) return;
  sm.price = +d.val;
  sellSheet(sm.id);
};
A.sellOk = () => {
  const sm = S.ui.sell;
  if (!sm) return;
  const item = S.items.find((i) => i.id === sm.id);
  if (!item) return closeSheet();
  const price = inputValue('sellPriceInput') || sm.price;
  const ok = Selling.listItem(S, item, { price, asOrig: sm.asOrig, avito: sm.avito, tg: sm.tg });
  if (ok) {
    closeSheet();
    toast('Опубликовано · покупатели пишут с 9 до 23');
  }
  after();
};
A.giveawaySheet = (d) => {
  const item = Items.findItem(S, d.id);
  if (!item) return;
  sheet(`<h2>Розыгрыш в канале</h2>
    <p>Отдаёшь вещь бесплатно за подписку и репост. Чем ценнее вещь, тем больше придёт людей — и тем выше доверие канала.</p>
    <div class="kv"><span>Вещь</span><span>${esc(itemName(item))}</span></div>
    <div class="kv"><span>Её стоимость</span><span>${rub(bookValue(S, item))}</span></div>
    <button class="btn full" data-act="giveawayOk" data-id="${item.id}">Разыграть</button>
    <button class="btn sec full" data-act="closeSheet">Отмена</button>`);
};
A.giveawayOk = (d) => {
  const item = Items.findItem(S, d.id);
  closeSheet();
  if (!item) return;
  const res = Social.giveaway(S, item);
  go('tg', 'own');
  if (res) toast(`Розыгрыш запущен · придёт ~${res.gained} человек`);
  after();
};

/* --- покупатели и чаты --- */
A.closeThread = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  if (!th.closed && th.data.buyer && th.data.buyer.tut && tutorialActive(S)) {
    toast('Тимур: не закрывай — это мой клиент.');
    return;
  }
  if (!th.closed) {
    if (th.kind === 'order' && !Social.declineOrder(S, th)) return;
    if (th.kind === 'lot') say(S, th, 'me', 'Не интересно.');
    if (th.kind === 'buyer' && th.data.buyer && th.data.buyer.agreed) say(S, th, 'me', 'Извините, передумал.');
  }
  th.closed = true;
  th.unread = 0;
  th.hidden = true;
  touch(S);
  after();
};
A.acceptOffer = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.acceptOffer(S, th);
  after();
};
A.counterBuyer = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.counterToBuyer(S, th, inputValue('offerInput'));
  after();
};
A.declineBuyer = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.declineBuyer(S, th);
  after();
};
A.answerAuth = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.answerAuth(S, th, d.key);
  after();
};
A.showProof = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.showProof(S, th);
  after();
};
A.completeSale = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  const res = Selling.completeSale(S, th);
  if (res) {
    const deal = res.deal;
    sheet(`<h2>Продано</h2>
      <p>${esc(deal.label)} · ${esc(deal.size)}${res.bonus ? ' · ' + esc(res.bonus) : ''}</p>
      <div class="kv"><span>Цена продажи</span><span>${rub(deal.price)}</span></div>
      <div class="kv"><span>Себестоимость</span><span>${rub(deal.cost)}</span></div>
      <div class="kv"><span>Прибыль</span><span class="${deal.profit >= 0 ? 'pos' : 'neg'}">${deal.profit >= 0 ? '+' : ''}${rub(deal.profit)}</span></div>
      ${deal.platform === 'avito' ? '<div class="muted">Деньги придут через день-два, когда покупатель заберёт посылку.</div>' : ''}
      ${
        deal.asOrig && deal.knownFake
          ? '<div class="callout danger">Ты продал паль под видом оригинала. Если покупатель проверит — прилетит.</div>'
          : deal.asOrig && deal.unchecked
            ? '<div class="callout">Вещь ушла как оригинал без легит-чека. Если это была паль и покупатель проверит — прилетит.</div>'
            : ''
      }
      <button class="btn full" data-act="closeSheet">Отлично</button>`);
  }
  after();
};
A.phishGo = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  const res = Selling.phishingFollow(S, th);
  if (res) toast('С карты списали ' + rub(res.loss));
  after();
};
A.phishBlock = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.phishingBlock(S, th);
  after();
};
A.takeLot = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  const res = Buying.takeLot(S, th);
  if (res) {
    const branded = res.items.filter((i) => !MODELS[i.m].noname).length;
    sheet(`<h2>Лот твой</h2>
      <p>${res.items.length} ${plural(res.items.length, 'вещь', 'вещи', 'вещей')}, брендовых: ${branded}.</p>
      ${res.items.map((i) => `<div class="kv"><span>${esc(itemName(i))} · ${esc(sizeLabel(i))}</span><span>${esc(shownCondition(i).short)}</span></div>`).join('')}
      <div class="muted">Подлинность не проверена. Загляни в шкаф и реши, что смотреть в первую очередь.</div>
      <button class="btn full" data-act="closeSheet">Разобрать</button>`);
  }
  if (afterTimeJump()) return;
  after();
};
A.haggleLot = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Buying.haggleLot(S, th);
  after();
};
A.declineLot = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Buying.declineLot(S, th);
  after();
};
A.fulfillOrder = (d) => {
  const th = findThread(S, d.id);
  const item = S.items.find((i) => i.id === +d.item);
  if (!th || !item) return;
  const res = Social.fulfillOrder(S, th, item);
  if (res && res.state === 'done') {
    sheet(`<h2>Заказ выполнен</h2>
      <p>${esc(res.client.name)} доволен.</p>
      <div class="kv"><span>Клиент заплатил</span><span>${rub(res.budget)}</span></div>
      <div class="kv"><span>Прибыль</span><span class="${res.profit >= 0 ? 'pos' : 'neg'}">${res.profit >= 0 ? '+' : ''}${rub(res.profit)}</span></div>
      ${res.referrals ? `<div class="kv"><span>Привёл друзей</span><span>+${res.referrals}</span></div>` : ''}
      <div class="callout ok">Он вернётся. Постоянные клиенты платят выше рынка и не торгуются.</div>
      <button class="btn full" data-act="closeSheet">Отлично</button>`);
  } else if (res && res.state === 'fake') {
    toast('Клиент сделал легит-чек и вернул вещь');
  }
  after();
};
A.postBuyAd = () => {
  const res = Buying.postBuyAd(S);
  if (res) toast('Объявление размещено · люди начнут писать');
  after();
};
A.acceptOrder = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  const res = Social.acceptOrder(S, th);
  if (res) toast('Предоплата получена: ' + rub(res.deposit));
  after();
};
A.requestSupply = (d) => {
  const th = findThread(S, d.id);
  if (!th || !th.data.order) return;
  const o = th.data.order;
  const res = Buying.requestSupply(S, o.m, o.size, o.maxCond);
  if (res) {
    say(S, th, 'me', 'Нашёл канал, привезут. Жди несколько дней.');
    toast(`Поставщик везёт · приедет ${dateLabel(res.eta)}`);
    go('parcels', 'main');
  }
  if (afterTimeJump()) return;
  after();
};
A.declineOrder = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Social.declineOrder(S, th);
  after();
};
A.refundClaim = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.refundClaim(S, th);
  after();
};
A.refuseClaim = (d) => {
  const th = findThread(S, d.id);
  if (!th) return;
  Selling.refuseClaim(S, th);
  after();
};

/* --- Телега --- */
A.createChannelSheet = () => {
  const suggestion = CHANNEL_NAME_SUGGESTIONS[Math.floor(Math.random() * CHANNEL_NAME_SUGGESTIONS.length)];
  sheet(`<h2>Свой канал</h2>
    <p>Канал — это твоя витрина для своих: платят сразу, а главное — пишут заказы. Подписчики начнут писать: «ищу такие-то, размер такой-то, плачу столько». Это лучшие деньги в игре.</p>
    <input class="inp" id="channelName" maxlength="28" value="${esc(suggestion)}" aria-label="Название канала">
    <button class="btn full" style="background:#2a9fd6" data-act="createChannelOk">Создать</button>
    <button class="btn ghost" data-act="closeSheet">Потом</button>`);
};
A.createChannelOk = () => {
  const el = document.getElementById('channelName');
  Social.createChannel(S, el ? el.value : '');
  closeSheet();
  go('tg', 'own');
  after();
};
A.trendPost = () => {
  const res = Social.postTrends(S);
  if (res) toast(`Пост вышел · +${res.gained} подписчиков`);
  if (afterTimeJump()) return;
  after();
};
A.buyAd = (d) => {
  const res = Social.buyAd(S, +d.i);
  if (res) toast(`Реклама вышла · ждём ~${res.gained} подписчиков за сутки`);
  after();
};
A.buyPro = () => {
  const res = Social.buyPro(S);
  if (res) toast('PRO подключена до ' + dateLabel(res.until));
  after();
};
A.enterRaffle = (d) => {
  const res = Social.enterRaffle(S, d.val);
  if (res) toast(`Ты в списке · шанс ${Math.round(res.chance * 100)}%`);
  after();
};

/* --- банк --- */
A.takeLoan = () => {
  const amount = inputValue('loanAmount') || S.ui.loan.amount;
  const res = Finance.takeCredit(S, amount, S.ui.loan.weeks);
  if (res) toast('Деньги на карте: +' + rub(res.amount));
  after();
};
A.loanMax = () => {
  S.ui.loan.amount = 1e9;
  touch(S);
  after();
};
A.loanTerm = (d) => {
  const el = document.getElementById('loanAmount');
  if (el) S.ui.loan.amount = parseNum(el.value);
  S.ui.loan.weeks = +d.val;
  touch(S);
  after();
};
A.repayPart = (d) => {
  const res = Finance.repayPart(S, d.id, inputValue('repay' + d.id));
  if (res) toast(res.closed ? 'Кредит закрыт' : 'Внесено ' + rub(res.paid));
  after();
};
A.repayAll = (d) => {
  const res = Finance.repayAll(S, d.id);
  if (res) toast('Кредит закрыт');
  after();
};
A.deposit = (d) => {
  Finance.depositMoney(S, +d.val);
  after();
};
A.withdraw = () => {
  Finance.withdrawDeposit(S);
  after();
};

/* --- магазин --- */
A.spendSkill = (d) => {
  const res = Finance.spendSkill(S, d.key);
  if (res) toast('Навык прокачан');
  after();
};
A.buyStorage = (d) => {
  const res = Finance.buyStorage(S, d.id);
  if (res) toast(`${res.name} — теперь ${res.capacity} мест`);
  after();
};
A.buyFitting = (d) => {
  const res = Showroom.buyFitting(S, d.id);
  if (res) toast(res.name + ' — поставили');
  after();
};
A.windowPick = (d) => {
  const id = +d.id;
  const cur = (S.ui.windowPick || S.showroom.window || []).slice();
  const at = cur.indexOf(id);
  if (at >= 0) cur.splice(at, 1);
  else if (cur.length < 3) cur.push(id);
  else cur[cur.length - 1] = id;
  S.ui.windowPick = cur;
  touch(S);
  after();
};
A.setWindow = () => {
  const res = Showroom.setWindow(S, S.ui.windowPick || []);
  if (res) {
    S.ui.windowPick = null;
    toast(res.count ? `На витрине ${res.count} ${plural(res.count, 'вещь', 'вещи', 'вещей')}` : 'Витрина пустая');
  }
  after();
};
A.hireStaff = (d) => {
  const res = Staff.hire(S, d.id);
  if (res) toast(`${res.name} выходит с завтрашнего дня`);
  after();
};
A.fireStaff = () => {
  const res = Staff.fire(S);
  if (res) toast(`${res.name} больше у тебя не работает`);
  after();
};
/* --- свой бренд и дропы --- */
A.launchBrandAsk = () => {
  sheet(`<h2>Как назовёшь лейбл?</h2>
    <p class="muted">Это имя будет стоять на бирках и в постах канала. Поменять потом нельзя.</p>
    <input class="inp" id="brandName" maxlength="24" placeholder="Название бренда" value="${esc(S.tg.name || '')}">
    <button class="btn full" data-act="launchBrand">Запустить</button>
    <button class="btn sec full" data-act="closeSheet">Потом</button>`);
};
A.launchBrand = () => {
  const name = ($('#brandName') || {}).value || '';
  const res = Brand.launchBrand(S, name);
  if (res) {
    sheet(`<h2>«${esc(res.name)}»</h2>
      <p>Ты начинал с потёртой олимпийки, стоптанных Форсов и мутного Теч Флиса от брата. Теперь у тебя свой лейбл.</p>
      <div class="kv"><span>Продано вещей</span><span>${res.stats.sold}</span></div>
      <div class="kv"><span>Прибыль</span><span>${rub(res.stats.profit)}</span></div>
      <div class="kv"><span>Дней в деле</span><span>${res.days}</span></div>
      <p class="muted">Дальше — дропы. Тираж оплачивается вперёд, так что первый делай небольшим.</p>
      <button class="btn full" data-act="closeSheet">Дальше</button>`);
  }
  after();
};
A.dropCat = (d) => {
  S.ui.dropCat = d.val;
  // Цена привязана к категории: при смене берём ту, что держит имя.
  S.ui.dropPrice = 0;
  touch(S);
  after();
};
A.dropQuality = (d) => {
  S.ui.dropQuality = d.val;
  touch(S);
  after();
};
A.dropPartner = (d) => {
  S.ui.dropPartner = d.val || null;
  touch(S);
  after();
};
A.dropQty = (d) => {
  S.ui.dropQty = Math.max(20, Math.min(1000, (S.ui.dropQty || 50) + +d.d));
  touch(S);
  after();
};
A.dropPrice = (d) => {
  const cat = S.ui.dropCat || 'hoodie';
  const base = S.ui.dropPrice || fairPrice(S, cat);
  S.ui.dropPrice = Math.max(300, base + +d.d);
  touch(S);
  after();
};
A.startDrop = () => {
  const cat = S.ui.dropCat || 'hoodie';
  const res = Brand.startDrop(S, {
    cat,
    name: ($('#dropName') || {}).value || '',
    qty: S.ui.dropQty || 50,
    price: S.ui.dropPrice || fairPrice(S, cat),
    quality: S.ui.dropQuality || 'normal',
    partner: S.ui.dropPartner || null,
  });
  if (res) {
    S.ui.dropPartner = null;
    toast(res.drop.partner ? 'Коллаб запущен. Продажи пойдут по дням' : 'Дроп запущен. Продажи пойдут по дням');
  }
  after();
};

/* --- подработка --- */
A.workShift = (d) => {
  const res = Finance.workShift(S, d.id);
  if (res) toast(`Смена закончилась: +${rub(res.money)}${res.extras.length ? ' · ' + res.extras.join(', ') : ''}`);
  if (afterTimeJump()) return;
  after();
};

/* --- служебное --- */
A.clearNotif = () => {
  const items = Array.from(document.querySelectorAll('#notifcenter .nc-item'));
  items.forEach((el, i) =>
    setTimeout(() => {
      el.style.transition = 'transform .2s ease, opacity .2s ease';
      el.style.transform = 'translateX(120%)';
      el.style.opacity = '0';
    }, i * 35),
  );
  setTimeout(() => {
    S.notif = [];
    saveGame(S);
    fillNotifCenter();
  }, items.length * 35 + 220);
};
A.resetAsk = () =>
  sheet(`<h2>Начать заново?</h2>
    <p>Весь прогресс удалится: деньги, вещи, канал, рейтинг, клиенты и записная книжка.</p>
    <button class="btn bad full" data-act="resetOk">Да, начать заново</button>
    <button class="btn sec full" data-act="closeSheet">Отмена</button>`);
A.resetOk = () => {
  clearSave();
  S = createGame();
  UI.S = S;
  S.onNotify = (n) => pushNotification(n);
  S.onToast = (text) => toast(text);
  S.flags.started = 1;
  closeSheet();
  go(null);
  after();
};
A.newSeason = (d) => {
  const next = Finance.startNewSeason(S, d.id);
  const seeded = createGame(next.seed, { tutorial: 'none' });
  // Переносим то, что должно пережить сезон.
  seeded.season = next.season;
  seeded.notebook = next.notebook;
  seeded.prog.skills = next.prog.skills;
  seeded.prog.lvl = next.prog.lvl;
  seeded.clients = next.clients;
  seeded.prog.unlocks = next.prog.unlocks;
  seeded.rep = next.rep;
  seeded.tg = { ...seeded.tg, ...next.tg };
  seeded.rival.heat = next.rival.heat;
  seeded.upgrades = next.upgrades;
  seeded.daily = next.daily;
  for (const key of Object.keys(seeded.prog.unlocks)) applyUnlock(seeded, key);
  seeded.flags.started = 1;
  S = seeded;
  UI.S = S;
  S.onNotify = (n) => pushNotification(n);
  S.onToast = (text) => toast(text);
  closeSheet();
  go(null);
  after();
};
A.exportSave = () => {
  try {
    navigator.clipboard.writeText(JSON.stringify(S));
    toast('Сейв скопирован в буфер');
  } catch (e) {
    toast('Не получилось скопировать');
  }
};

registerActions(A);

/* ======================= СОБЫТИЯ ======================= */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = UI.actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try {
    fn(el.dataset, el);
    coachAfterClick(el);
  } catch (err) {
    console.error('Ошибка в действии ' + el.dataset.act, err);
    toast('Что-то пошло не так');
  }
});

document.addEventListener('change', (e) => {
  const key = e.target.dataset.change;
  if (!key) return;
  const v = e.target.value;
  if (key === 'model') S.ui.filters.model = v;
  else if (key === 'size') S.ui.filters.size = v;
  else if (key === 'mode') S.ui.filters.mode = v;
  else if (key === 'sort') S.ui.filters.sort = v;
  else if (key === 'pzTier') S.ui.poizon.tier = v;
  else if (key === 'pzSort') S.ui.poizon.sort = v;
  else return;
  // Выбор сделан — список закрыт. Снимаем фокус, иначе перерисовка ждёт, пока
  // игрок коснётся чего-то ещё, и выдача на экране остаётся старой.
  if (e.target.tagName === 'SELECT') e.target.blur();
  S.ui.limit = 24;
  touch(S);
  after();
});

document.addEventListener('input', (e) => {
  const key = e.target.dataset.input;
  if (key === 'loanAmount' && S.ui.loan) {
    S.ui.loan.amount = parseNum(e.target.value);
    const preview = Finance.creditPreview(S, S.ui.loan.amount, S.ui.loan.weeks);
    const pay = document.getElementById('loanPayment');
    const over = document.getElementById('loanOverpay');
    if (pay) pay.textContent = rub(preview.payment);
    if (over) over.textContent = rub(preview.overpay);
  }
  if (key === 'sellPrice' && S.ui.sell) {
    const sm = S.ui.sell;
    sm.price = parseNum(e.target.value);
    const item = S.items.find((i) => i.id === sm.id);
    const el = document.getElementById('sellHint');
    if (item && el) {
      const hint = Selling.saleHint(S, item, sm.price, sm.asOrig, sm.avito, sm.tg);
      el.textContent =
        (hint.perDay < 0.05 ? 'По такой цене почти никто не напишет' : `≈ ${hint.perDay.toFixed(1)} покупателя в день, ждать ${hint.etaText}`) +
        ` · ${hint.verdict} · прибыль ${hint.profit >= 0 ? '+' : ''}${rub(hint.profit)}`;
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const id = e.target.id;
  if (id === 'searchInput') return A.search();
  if (id === 'poizonSearch') return A.poizonSearch();
  if (id === 'channelName') return A.createChannelOk();
  if (id === 'offerInput') {
    const btn = e.target.parentElement.querySelector('[data-act]');
    if (btn) btn.click();
  }
});

bindGestures();
bindInputGuards();

/* ======================= ИГРОВОЙ ЦИКЛ ======================= */

let lastRev = -1;
setInterval(() => {
  if (!S || !S.flags.started) return;
  if (S.flags.bankrupt || S.flags.seasonEnd) {
    if (!isNotifOpen()) ensureBlockingSheet();
    return;
  }
  if (document.hidden) return;
  // Пока идёт обучение, часы стоят: время двигают только сами действия.
  if (isSheetOpen() || isNotifOpen() || tutorialActive(S)) {
    updateClock();
    return;
  }
  const before = S.t;
  advanceMinutes(S, S.ui.speed || 1);
  if (hourIndex(S.t) === SCHEDULE.sleepHour && S.t !== before) {
    doSleep(true);
    return;
  }
  if (S.t !== before) {
    saveGame(S);
    // Проверку фокуса делает сам render(): он знает про выпадающие списки.
    scheduleRender();
  } else {
    updateClock();
  }
}, 1000);

// Перерисовка при любом изменении состояния.
setInterval(() => {
  if (S && S.rev !== lastRev) {
    lastRev = S.rev;
    scheduleRender();
  }
}, 120);

/* ======================= ОБНОВЛЕНИЕ ======================= */
// Игра — одна страница и сама не перезагружается, поэтому после правок
// телефон продолжал показывать старую версию. Сервер разработки отдаёт
// версию файлов; изменилась — предлагаем обновиться. На другом сервере
// адреса нет, и проверка просто молчит.

let gameVersion = null;
async function checkVersion() {
  try {
    const r = await fetch('/__version', { cache: 'no-store' });
    if (!r.ok) return;
    const v = (await r.text()).trim();
    if (gameVersion === null) gameVersion = v;
    else if (v !== gameVersion) showUpdatePill();
  } catch (e) {
    /* нет сети или другой сервер — не мешаем играть */
  }
}

function showUpdatePill() {
  if ($('#updatePill')) return;
  const el = document.createElement('button');
  el.id = 'updatePill';
  el.textContent = 'Новая версия — обновить';
  el.addEventListener('click', () => {
    saveGame(S);
    location.reload();
  });
  $('#phone').appendChild(el);
}

checkVersion();
setInterval(checkVersion, 20000);

/* ======================= СТАРТ ======================= */

render();
initCoach(A);
initSfx();
if (tutorialActive(S)) updateCoach();
else if (S.flags.bankrupt) bankruptSheet();
else if (S.flags.seasonEnd) seasonEndSheet();
else if ((S.news || 0) < NEWS_VERSION) newsSheet();

window.__game = {
  get S() {
    return S;
  },
  actions: A,
  core: { Buying, Selling, Items, Social, Finance },
  tutorial: Tutorial,
  netWorth,
  render,
};
