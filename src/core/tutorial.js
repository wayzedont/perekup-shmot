// Обучение: Тимур звонит и берёт тебя помощником.
//
// Обучение идёт главами по дням, и каждая начинается звонком Тимура и
// скачиванием нового приложения в Апсторе:
//   «Авитка» — понедельник, сразу: купить, проверить, продать, доставка, подмена;
//   «Телега» — на следующее утро: свой канал, витрина, подписчики, продажа
//              своим, Хайп-радар и первый заказ подписчика;
//   «Секонд» — в ближайший день завоза, когда игрок продал что-то сам;
//   «Пойзон» — через день-два после секонда.
// Между главами игрок играет сам. Когда звонить, решает `tutorialSchedule`.
//
// Внутри главы всё по сценарию. Одни и те же вещи, одни и те же результаты
// осмотра, одна и та же уступка в торге и один и тот же покупатель.
// Случайность здесь только мешала бы: игрок учится на том, что ему
// показывают, а не на кубике. Пока идёт глава, мир молчит — Мирон не
// охотится, новых объявлений и случайных покупателей нет, часы стоят, кроме
// времени самих действий.
//
// Ядро знает только шаги, их условия и то, как пройти каждый шаг без экрана
// (`auto`). Это нужно трём вещам: кнопке «пропустить», ботам балансовых
// прогонов и тесту, который проверяет, что сценарий проходится до конца.
// Что подсвечивать на экране, решает интерфейс (ui/coach.js) по id шага.
//
// Виды шагов:
//   call — звонок, своя сцена в интерфейсе;
//   talk — Тимур говорит, игрок жмёт «Дальше»;
//   tap  — нажать подсвеченную кнопку (шаг закрывается самим нажатием);
//   do   — сделать то, что проверяет `done`;
//   wait — короткая пауза, потом шаг делает своё сам (покупатель «пишет»).

import { priceRound, rub } from './util.js';
import { MODELS } from './data/models.js';
import { sizesFor } from './data/catalog.js';
import { APP_DEFS, ALL_APPS } from './data/apps.js';
import { valueOrig, legitCost, photoLegitCost, poizonPrice, poizonShip } from './economy.js';
import { makeItem, DEFECTS, itemName } from './items.js';
import { nextListingId, findListing, deliveryFee } from './market/avito.js';
import { makeSeller } from './people/sellers.js';
import { makeBuyer } from './people/buyers.js';
import { makeClient, orderText } from './people/clients.js';
import { dayIndex, hourIndex, weekdayAt, dateLabel, isSecondOpen } from './time.js';
import { takeSlotId, isTreasure } from './market/second.js';
import { RIVAL_NAME } from './rival.js';
import {
  earn,
  pay,
  notify,
  newThread,
  say,
  touch,
  mentorThread,
  mentorSay,
  rngOf,
  dropItem,
  installed,
  installApp,
  syncApps,
} from './kernel.js';
import { advanceHours } from './tick.js';
import { priceSuggestions, listItem, counterToBuyer, completeSale } from './actions/selling.js';
import {
  askSeller,
  startMeeting,
  meetInspectCondition,
  photoLegit,
  photoInspect,
  sellerThread,
  useLever,
  buyAtMeeting,
  confirmDelivery,
  secondInspect,
  buySecond,
  waitSecondOpen,
  visitSecond,
  buyPoizon,
} from './actions/buying.js';
import { inspectTell, legitCheck, openDispute } from './actions/items.js';
import { createChannel, acceptOrder, fulfillOrder } from './actions/social.js';

const model = (b, n) => MODELS.find((m) => m.b === b && m.n === n).i;

/** Заказ Тимура и вещь из Хайп-радара — всегда одни и те же. */
export const TUT_ORDER = { m: model('Кархарт', 'худи'), size: 'L' };
export const TUT_TREND = { m: model('Адик', 'Самбы'), size: '42' };
const TREND_HYPE = 0.94;

export function tutorialActive(S) {
  return !!(S.tut && S.tut.active);
}

/* ======================= СЦЕНА ЗВОНКА ======================= */
// Реплики звонков, у каждой главы свой. `choice` — ответ игрока: обе кнопки
// ведут дальше, но выбор — это то, что игрок делает сам, и Тимур отвечает
// по-разному.

export const CALLS = {
  avito: [
    { who: 't', text: 'Алло, братан! Слышал, ты работу ищешь?' },
    {
      who: 't',
      text: 'Короче. Я шмотом занимаюсь — перекупаю. Беру дешевле, продаю дороже. Заказов валом, рук не хватает. Пойдёшь ко мне помощником?',
    },
    {
      who: 'me',
      choice: [
        { text: 'Давай! Что делать?', reply: 'Вот это разговор 🔥' },
        { text: 'А это вообще законно?', reply: 'Законно, если паль за ориг не толкать 😄 Этому тоже научу.' },
      ],
    },
    {
      who: 't',
      text: 'Есть заказ: клиенту нужно худи Кархарт, размер L. Скину деньги — найди на Авитке. Только смотри: НЕ ПАЛЬ. Паль мне клиента угробит.',
    },
    { who: 't', text: 'Перевёл. Проверь банк, потом качай Авитку — и погнали. Я на связи, буду подсказывать.' },
  ],
  tg: [
    { who: 't', text: 'Доброе! Вчера ты красава, честно. Сегодня покажу, где лежат настоящие деньги.' },
    {
      who: 't',
      text: 'На Авитке ты один из сотни продавцов: покупатель тебя не знает, а деньги идут сутки. А в Телеге можно завести свой канал — там свои люди: платят сразу и сами пишут заказы.',
    },
    {
      who: 'me',
      choice: [
        { text: 'Свой магазин? Хочу!', reply: 'Вот и я про то 😎' },
        { text: 'А кто на меня подпишется?', reply: 'Сначала друзья, потом их друзья. Покажу, как растить.' },
      ],
    },
    { who: 't', text: 'Качай Телегу — я там закреплён. Самбы вчерашние как раз туда и выставим.' },
  ],
  second: [
    { who: 't', text: 'Здоров! Сегодня завоз в «Мешке» — в десять. Это секонд, и это лучшие цены в городе, если глаз намётан.' },
    {
      who: 't',
      text: 'Ценник там ставят по бирке: оригинал и паль стоят одинаково. Вся игра — успеть первым и не взять паль.',
    },
    {
      who: 'me',
      choice: [
        { text: 'Погнали, я готов', reply: 'Огонь. Глаз у тебя уже есть — проверим в деле.' },
        { text: 'А если возьму паль?', reply: 'Возьмёшь — продашь честно как реплику. Но лучше не бери 😄' },
      ],
    },
    {
      who: 't',
      text: 'И ещё: Мирон, перекуп, приезжает к открытию и снимает с полки лучшее. Опоздаешь — останутся пакеты. Качай «Секонд» и будь у дверей к десяти.',
    },
  ],
  poizon: [
    { who: 't', text: 'Слушай, ты уже нормально так крутишься. Пора показать Пойзон.' },
    { who: 't', text: 'Секонд — это охота: кто раньше встал. Пойзон — это расчёт: кто раньше узнал.' },
    {
      who: 't',
      text: 'Там всё оригинал и любые размеры, но везут неделю-две. И цена на Пойзоне догоняет хайп с опозданием.',
    },
    {
      who: 'me',
      choice: [
        { text: 'Две недели — это долго', reply: 'Долго, если брать то, что горит сегодня. Фишка — брать то, что загорится через неделю.' },
        { text: 'А как узнать заранее?', reply: 'Хайп-радар PRO. У меня он есть — сегодня покажу, что там.' },
      ],
    },
    { who: 't', text: 'Качай Пойзон. Сделаем одну ставку вместе.' },
  ],
};

/* ======================= ВСПОМОГАТЕЛЬНОЕ ======================= */

const ids = (S) => S.tut.ids;
/**
 * Учебное объявление. Экран свободный: игрок мог уже купить вещь, и
 * объявления больше нет. Тогда — пустышка, на которой условия шагов просто
 * не выполняются, а «перескок» по вехам доводит до того места, где игрок
 * на самом деле. Падать здесь нельзя.
 */
const GONE = { ask: 0, item: { seen: {}, defects: [] }, seller: { used: {}, current: 0 }, photosAsked: false, gone: true };
const listing = (S, key) => findListing(S, ids(S)[key]) || GONE;
const itemOf = (S, key) => {
  const l = listing(S, key);
  if (!l.gone) return l.item;
  return S.items.find((i) => i.id === ids(S)[key + 'Item']) || null;
};
/** Осмотрен ли признак учебной вещи — по фото продавца или вживую. */
const seenTell = (S, key, tell) => {
  const l = listing(S, key);
  const subject = l.gone ? itemOf(S, key) : l.photoItem || l.item;
  return !!(subject && subject.seen && subject.seen[tell]);
};
const ui = (S) => S.ui;
const at = (S, app, view, id) =>
  ui(S).app === app && (view === undefined || ui(S).view === view) && (id === undefined || ui(S).id === id);

function go(S, app, view = 'main', id = null) {
  S.ui.app = app;
  S.ui.view = view;
  S.ui.id = id;
  touch(S);
}

/** Открыта ли переписка с продавцом этого объявления. */
const inChat = (S, key) => {
  const l = listing(S, key);
  return !!(l && l.threadId) && at(S, 'avito', 'thread', l.threadId);
};

function openChat(S, key) {
  const l = listing(S, key);
  if (l.gone) return;
  const th = sellerThread(S, l);
  go(S, 'avito', 'thread', th.id);
}

/** Тимур пишет в чат то же, что сказал: всё сказанное можно перечитать. */
function timurWrites(S, text) {
  const th = mentorThread(S);
  if (th) say(S, th, 'them', text);
}

/**
 * Учебное объявление. Результаты осмотра заданы заранее (`script`), чек
 * отвечает правдой, продавец уступает по сценарию.
 */
function tutorialListing(S, rng, o) {
  const item = makeItem(rng, o.m, {
    real: o.real,
    q: o.real ? 0 : 0.28,
    cond: o.cond,
    size: o.size,
    way: o.way,
    hasBox: o.hasBox || false,
    boughtAt: S.t,
  });
  item.script = o.script;
  // Учебная вещь: пока идёт обучение, её не снять с продажи и не сдать в
  // скупку — на ней держится сценарий.
  item.tut = true;
  if (o.defect) {
    const d = DEFECTS.find((x) => x.id === o.defect);
    item.defects = [{ ...d }];
    item.cond = o.cond + d.step;
    item.shownCond = o.cond;
    item.condSeen = false;
  }
  const shown = { ...item, cond: item.shownCond };
  const fair = valueOrig(S, shown);
  const ask = o.ask(fair);
  const seller = makeSeller(rng, o.seller, ask, 0);
  seller.name = o.name;
  seller.since = o.since;
  seller.reviews = o.reviews;
  seller.floor = priceRound(ask * 0.8);
  // Экран в обучении свободный: сколько бы игрок ни торговался, учебный
  // продавец не обидится и не заблокирует — иначе сценарий встанет.
  seller.patience = 99;
  if (o.lever) seller.script = o.lever;
  // Подмена: фото чужого оригинала с чистыми признаками.
  const photoItem = o.decoy
    ? Object.assign(makeItem(rng, o.m, { real: true, cond: o.cond, size: o.size, way: o.way, hasBox: o.hasBox || false, boughtAt: S.t }), {
        script: o.decoy,
      })
    : null;
  return {
    id: nextListingId(),
    item,
    declared: 'orig',
    ask,
    fair,
    mode: o.mode,
    city: o.mode === 'ship' ? o.city : 'Москва',
    metro: o.mode === 'ship' ? '' : o.metro,
    postedAt: S.t - o.ago,
    seller,
    signals: o.signals || [],
    photosAsked: false,
    photoNote: '',
    photoItem,
    photoVerdict: null,
    handLegit: false,
    threadId: null,
    inspectedRemote: false,
    sniped: false,
    expiresAt: S.t + 24 * 30,
    isDeal: false,
    description: o.description,
    tutorial: true,
    freeLegit: !!o.freeLegit,
    // Паль из ведомой части купить нельзя вовсе, честную вещь — только когда
    // до неё дошёл сценарий.
    noBuy: !!o.noBuy,
    buyFrom: o.buyFrom || null,
  };
}

/**
 * Можно ли сейчас купить учебную вещь (или поехать за ней). Возвращает
 * реплику Тимура, если нельзя. Экран в обучении свободный, поэтому порядок
 * держат не тени вокруг кнопки, а этот замок.
 */
export function tutorialBuyGate(S, listing) {
  if (!tutorialActive(S) || !listing || !listing.tutorial) return null;
  if (listing.noBuy) {
    return listing.item.verdict === 'fake' ? 'Тимур: это паль — не бери.' : 'Тимур: погоди, сначала проверим.';
  }
  if (listing.buyFrom && S.tut.step < STEP_INDEX[listing.buyFrom]) return 'Тимур: погоди, не спеши — сначала проверим.';
  return null;
}

/** Убрать с рынка всё, что мешает сценарию: в выдаче ровно две вещи. */
function clearModel(S, m, size) {
  S.listings = S.listings.filter((l) => !(l.item.m === m && l.item.size === size));
}

/* ======================= ПОДГОТОВКА ГЛАВ ======================= */

/** Звонок закончился: деньги на карте, на Авитке ждут две вещи. */
export function startTutorial(S) {
  const rng = rngOf(S);
  heatTrend(S);
  clearModel(S, TUT_ORDER.m, TUT_ORDER.size);

  const fake = tutorialListing(S, rng, {
    m: TUT_ORDER.m,
    size: TUT_ORDER.size,
    real: false,
    cond: 1,
    way: 0,
    seller: 'liar',
    name: 'Денис',
    since: '2026',
    reviews: 2,
    mode: 'both',
    metro: 'Выхино',
    ago: 1,
    ask: (fair) => priceRound(fair * 0.6),
    description: 'Оригинал, брал в ЦУМе, чек потерялся. Отдаю дёшево — срочно нужны деньги. Размер L. Состояние: как новое.',
    signals: ['tooCheap', 'urgentStory'],
    script: { tag: 'bad', print: 'bad', stitch: 'odd' },
    freeLegit: true,
    noBuy: true,
  });
  const orig = tutorialListing(S, rng, {
    m: TUT_ORDER.m,
    size: TUT_ORDER.size,
    real: true,
    cond: 1,
    way: 1,
    seller: 'owner',
    name: 'Артём',
    since: '2018',
    reviews: 146,
    mode: 'meet',
    metro: 'Сокол',
    ago: 5,
    // Цены подобраны так, чтобы учебная сделка честно была в плюс даже
    // после того, как найденный дефект уронит рыночную цену: иначе Тимур
    // хвалит за продажу, а на экране прибыль с минусом.
    ask: (fair) => priceRound(fair * 0.74),
    description: 'Носил пару раз, не мой размер. Размер L. Состояние: как новое. Только личная встреча у м. Сокол, не отправляю.',
    script: { tag: 'ok', print: 'ok', stitch: 'ok' },
    defect: 'pills',
    lever: { defect: { cut: 0.15, reply: 'Блин, и правда катышки… Ладно, справедливо.' } },
    buyFrom: 'orig_look',
  });
  S.listings.unshift(fake, orig);
  ids(S).fake1 = fake.id;
  ids(S).orig1 = orig.id;
  ids(S).orig1Item = orig.item.id;

  // Тимур переводит ровно столько, чтобы хватило на честный вариант со
  // встречей, — и ни рублём больше. Своих денег у героя нет.
  const transfer = Math.ceil((orig.ask + 150) / 500) * 500;
  ids(S).transfer = transfer;
  earn(S, transfer, 'Перевод от Тимура');
  notify(S, { route: 'bank', title: 'Перевод от Тимура', text: '+' + rub(transfer) + ' · «на худи, не паль!»', tut: true });
  timurWrites(
    S,
    `Заказ: худи Кархарт, размер L. Скинул ${rub(transfer)}. Главное — не паль! Если забудешь, что я говорил, — всё будет тут.`,
  );
  S.flags.started = 1;
  touch(S);
}

/**
 * Самбы на пике с самого начала и до радара во второй главе: иначе
 * утренняя сводка показывает их на 67%, а пост Тимура строчкой выше — на 94%.
 */
function heatTrend(S) {
  const m = TUT_TREND.m;
  S.market.h[m] = TREND_HYPE;
  S.market.hT[m] = TREND_HYPE;
  S.market.until[m] = S.t + 24 * 10;
}

/**
 * Пост Хайп-радара про Самбы. Пишется в главе «Телега», когда до радара
 * дошли: иначе утренняя сводка ложится сверху, и Тимур показывает не тот пост.
 */
function radarPost(S) {
  heatTrend(S);
  S.channels.radar.posts.unshift({
    at: S.t,
    kind: 'tut',
    text:
      '🔥 Ликвид недели · ' +
      'Адик Самбы — ' +
      Math.round(TREND_HYPE * 100) +
      '%\n\nСамбы снова везде: их ищут быстрее, чем выставляют. Ходовые размеры — 41–43. Пойзон пока не поднял цены — окно на неделю-две.',
  });
  S.channels.radar.unread++;
  touch(S);
}

/** Глава «Авитка», доставка: Самбы на пике, на Авитке снова двое. */
function setupTrend(S) {
  const rng = rngOf(S);
  const m = TUT_TREND.m;
  heatTrend(S);
  clearModel(S, m, TUT_TREND.size);
  const fake = tutorialListing(S, rng, {
    m,
    size: TUT_TREND.size,
    real: false,
    cond: 0,
    way: 0,
    hasBox: true,
    seller: 'liar',
    name: 'Ринат',
    since: '2026',
    reviews: 0,
    mode: 'ship',
    city: 'Казань',
    ago: 1,
    ask: (fair) => priceRound(fair * 0.52),
    description: 'Оригинал, новые, в коробке! Привёз партию, отдаю ниже рынка. Отправка Авитка Доставкой. Размер 42.',
    signals: ['newAccount', 'noReviews', 'tooCheap', 'manyItems'],
    script: { sole: 'bad', shape: 'bad', tag: 'odd', box: 'odd' },
    noBuy: true,
  });
  // Ношеные, зато на пике тренда: сделка честно в плюс, но без подарка —
  // первая версия отдавала их на треть ниже рынка, и прогоны показали, что
  // старт стал заметно легче (быстрые прогоны богатели к 16-му дню вместо
  // 20-го). На карте после покупки остаётся на еду до продажи. Если вдруг
  // денег меньше, чем рассчитано, цена подстраивается — сценарий не должен
  // упираться в «не хватает».
  const budget = S.money - 590 - 1500;
  const orig = tutorialListing(S, rng, {
    m,
    size: TUT_TREND.size,
    real: true,
    cond: 3,
    way: 0,
    hasBox: true,
    seller: 'owner',
    name: 'Лиза',
    since: '2016',
    reviews: 87,
    mode: 'ship',
    city: 'Санкт-Петербург',
    ago: 3,
    ask: (fair) => priceRound(Math.min(fair * 0.84, budget / 1.05)),
    description: 'Самбы, носила всё лето, надоели. Коробка есть. Отправлю Авитка Доставкой. Размер 42. Состояние: ношеное, но живое.',
    script: { sole: 'ok', shape: 'ok', tag: 'ok', box: 'ok', stitch: 'ok' },
    buyFrom: 'trend_orig',
  });
  S.listings.unshift(fake, orig);
  ids(S).fake2 = fake.id;
  ids(S).orig2 = orig.id;
  ids(S).orig2Item = orig.item.id;
  touch(S);
}

/* ======================= ВТОРАЯ ЧАСТЬ: САМ ======================= */

export const TUT_TASK3 = { m: model('Нюбы', '550'), size: '43' };
export const TUT_TASK4 = { m: model('Стусси', 'худи'), size: 'M' };

const heldItem = (S, id) => (id ? S.items.find((i) => i.id === id) || null : null);

/** Подвинуть время, пока не случится нужное (для прохождения без экрана). */
function waitFor(S, cond) {
  for (let i = 0; i < 12 && !cond(); i++) advanceHours(S, 1);
}

/**
 * Какую вещь игрок купил по заданию — он выбирает сам. Запоминаем при первой
 * встрече, потому что после спора вещь из шкафа исчезает.
 */
function bought(S, task) {
  const d = ids(S);
  if (d[task + 'Bought']) return d[task + 'Bought'];
  const keys =
    task === 'task3' ? ['fake3', 'orig3'] : task === 'task5' ? ['orig5'] : task === 'task6' ? ['sec6Real', 'sec6Fake'] : ['swap4'];
  for (const k of keys) {
    const id = d[k + 'Item'];
    const sh = S.shipments.find((x) => x.items.some((i) => i.id === id));
    if (sh || S.items.some((i) => i.id === id)) {
      d[task + 'Bought'] = id;
      d[task + 'Paid'] = sh && sh.protection ? sh.protection.paid : 0;
      return id;
    }
  }
  return null;
}

const boughtReal = (S, task) => bought(S, task) === ids(S).orig3Item;
const disputed = (S, task) =>
  !!bought(S, task) && !heldItem(S, bought(S, task)) && S.stats.disputesWon > (ids(S)[task + 'Disputes'] || 0);

/** Вещь уходит клиенту Тимура, игроку — за работу. */
function handToClient(S, task, fee) {
  const it = heldItem(S, bought(S, task));
  if (it) dropItem(S, it);
  if (fee) {
    earn(S, fee, 'Тимур: за заказ');
    notify(S, { route: 'bank', title: 'Тимур', text: `+${rub(fee)} за заказ`, tut: true });
  }
}

/** Вернувшиеся по спору деньги — клиенту: они были его. */
function refundToClient(S, task, fee) {
  const back = Math.min(S.money, ids(S)[task + 'Paid'] || 0);
  if (back > 0) pay(S, back, 'Вернул деньги клиенту Тимура');
  if (fee) {
    earn(S, fee, 'Тимур: за то, что не растерялся');
    notify(S, { route: 'bank', title: 'Тимур', text: `+${rub(fee)} — молодец`, tut: true });
  }
}

/** Клиент переводит ровно на заказ: вещь, комиссию доставки, чек по фото и чек в шкафу. */
function clientTransfer(S, key, l) {
  const need = l.ask + deliveryFee(l.ask) + photoLegitCost(S, l.item) + legitCost(S, l.item);
  const sum = Math.ceil(need / 500) * 500;
  ids(S)[key] = sum;
  earn(S, sum, 'Перевод от клиента Тимура');
  notify(S, { route: 'bank', title: 'Перевод от клиента', text: '+' + rub(sum), tut: true });
}

/** Вещь 3: паль подешевле и честный ориг — выбор за игроком. */
function setupTask3(S) {
  const rng = rngOf(S);
  const { m, size } = TUT_TASK3;
  clearModel(S, m, size);
  const fake = tutorialListing(S, rng, {
    m,
    size,
    real: false,
    cond: 1,
    way: 0,
    hasBox: true,
    seller: 'liar',
    name: 'Артур',
    since: '2026',
    reviews: 1,
    mode: 'ship',
    city: 'Самара',
    ago: 2,
    ask: (fair) => priceRound(fair * 0.55),
    description: 'Оригинал, носил пару раз. Отдаю дёшево — нужны деньги. Отправка Авитка Доставкой. Размер 43.',
    signals: ['newAccount', 'tooCheap'],
    script: { sole: 'bad', shape: 'odd', tag: 'odd', box: 'odd' },
  });
  const orig = tutorialListing(S, rng, {
    m,
    size,
    real: true,
    cond: 1,
    way: 1,
    hasBox: true,
    seller: 'owner',
    name: 'Глеб',
    since: '2019',
    reviews: 64,
    mode: 'ship',
    city: 'Тула',
    ago: 6,
    ask: (fair) => priceRound(fair * 0.85),
    description: 'Нюбы 550, взял не тот размер, надел пару раз. Коробка есть. Отправлю Авитка Доставкой. Размер 43.',
    script: { sole: 'ok', shape: 'ok', tag: 'ok', box: 'ok', stitch: 'ok' },
  });
  S.listings.unshift(orig, fake);
  Object.assign(ids(S), { fake3: fake.id, fake3Item: fake.item.id, orig3: orig.id, orig3Item: orig.item.id });
  ids(S).task3Disputes = S.stats.disputesWon;
  clientTransfer(S, 'transfer3', orig);
  timurWrites(S, `Заказ: Нюбы 550, размер 43. Клиент перевёл ${rub(ids(S).transfer3)}. Найди сам, проверь, закажи с доставкой.`);
}

/** Вещь 4: единственное объявление — с фото чужого оригинала. */
function setupTask4(S) {
  const rng = rngOf(S);
  const { m, size } = TUT_TASK4;
  clearModel(S, m, size);
  const swap = tutorialListing(S, rng, {
    m,
    size,
    real: false,
    cond: 1,
    way: 0,
    seller: 'shop',
    name: 'Brand Outlet SPB',
    since: '2023',
    reviews: 23,
    mode: 'ship',
    city: 'Санкт-Петербург',
    ago: 3,
    ask: (fair) => priceRound(fair * 0.8),
    description: 'Оригинал, в наличии. Отправка в день оплаты Авитка Доставкой. Размер M. Состояние: как новое.',
    signals: ['stockPhoto'],
    decoy: { tag: 'ok', print: 'ok', stitch: 'ok' },
  });
  S.listings.unshift(swap);
  Object.assign(ids(S), { swap4: swap.id, swap4Item: swap.item.id });
  ids(S).task4Disputes = S.stats.disputesWon;
  clientTransfer(S, 'transfer4', swap);
  timurWrites(S, `Заказ: худи Стусси, размер M. Клиент перевёл ${rub(ids(S).transfer4)}.`);
}

/** Покупатель, который напишет сразу после публикации. */
export function spawnTutorialBuyer(S) {
  const item = S.items.find((i) => i.id === ids(S).orig1Item);
  if (!item || !item.sale || ids(S).buyerThread) return null;
  const rng = rngOf(S);
  const price = item.sale.price;
  const buyer = makeBuyer(S, rng, item, 'avito', price);
  Object.assign(buyer, {
    type: 'normal',
    full: false,
    offer: priceRound(price * 0.86),
    max: priceRound(price * 0.97),
    patience: 99,
    expiresAt: S.t + 24 * 30,
    // Учебный покупатель не уходит, не обижается и не исчезает по таймеру.
    tut: true,
    // Про подлинность он не спрашивает: эта сцена — отдельный урок, а здесь
    // учимся торговаться.
    noAuth: true,
  });
  const th = newThread(S, { kind: 'buyer', name: 'Олег', sub: 'Кархарт худи', platform: 'avito', data: { buyer } });
  say(S, th, 'them', `Здравствуйте! Худи ещё актуально? Отдадите за ${rub(buyer.offer)}? Заберу доставкой сегодня.`);
  notify(S, {
    route: 'avito/thread/' + th.id,
    title: 'Олег · Кархарт худи',
    text: 'Предлагает ' + rub(buyer.offer),
    scope: 'client',
    tut: true,
    sticky: true,
  });
  ids(S).buyerThread = th.id;
  touch(S);
  return th;
}

/** Деньги за учебную продажу приходят сразу: ждать сутки посреди урока — скучно. */
function payNow(S) {
  for (const e of S.pending) {
    if (e.type !== 'payout' || e.done || e.cancelled) continue;
    if (e.label !== 'Кархарт худи') continue;
    e.done = true;
    earn(S, e.amount, 'Авитка: выплата за ' + e.label);
    notify(S, { route: 'bank', title: 'Деньги пришли', text: `+${rub(e.amount)} · ${e.label}`, tut: true });
  }
  S.pending = S.pending.filter((e) => !e.done);
  touch(S);
}

/* ======================= ГЛАВА «ТЕЛЕГА» ======================= */

/** Первый заказ подписчика — всегда один и тот же. */
export const TUT_ORDER2 = { m: model('Кортейз', 'футболка'), size: 'M' };
/** Сколько людей приводит репост Тимура. */
const TIMUR_REPOST = 35;

/** Что можно выставить в канал: вещь в шкафу, которой там ещё нет. */
const forChannel = (S) => S.items.filter((i) => !(i.sale && i.sale.tg) && i.verdict !== 'fake');

/** Что разумнее выставить: вчерашние Самбы, если ещё у тебя, иначе самое ценное. */
function bestForChannel(S) {
  const c = forChannel(S);
  return c.find((i) => i.id === ids(S).orig2Item) || c.sort((a, b) => valueOrig(S, b) - valueOrig(S, a))[0] || null;
}

/** Выставлять нечего (всё продал вчера) — Тимур подкидывает вещь. */
function ensureListable(S) {
  if (forChannel(S).length || S.items.some((i) => i.sale && i.sale.tg)) return;
  const rng = rngOf(S);
  const it = makeItem(rng, TUT_ORDER.m, { cond: 1, real: true, verdict: 'orig', size: 'M', src: 'От Тимура', boughtAt: S.t });
  it.condSeen = true;
  S.items.push(it);
  ids(S).giftItem = it.id;
  timurWrites(S, 'Шкаф пустой? Держи худи Кархарт — у меня лишнее. Выставишь в канал — деньги твои.');
}

/** Репост Тимура: первые живые подписчики. */
function timurRepost(S) {
  if (ids(S).reposted) return;
  ids(S).reposted = true;
  S.tg.subs += TIMUR_REPOST;
  S.tg.posts.unshift({ at: S.t, kind: 'news', text: `📣 Тимур поделился каналом у себя. +${TIMUR_REPOST} подписчиков` });
  touch(S);
}

/**
 * Вещь выставлена в канал — на ней держится остаток главы: её купит первый
 * подписчик. До конца главы её не сдать в скупку и не снять (учебная метка
 * снимается вместе с остальными поблажками).
 */
function markPosted(S) {
  const it = S.items.find((i) => i.id === ids(S).tgItem) || S.items.find((i) => i.sale && i.sale.tg);
  if (!it) return;
  it.tut = true;
  ids(S).tgItem = it.id;
}

/** Подписчик пишет про вещь, которую выставили в канал. */
function spawnChannelBuyer(S) {
  if (ids(S).tgBuyer) return null;
  const item = S.items.find((i) => i.id === ids(S).tgItem && i.sale) || S.items.find((i) => i.sale && i.sale.tg);
  if (!item) return null;
  const rng = rngOf(S);
  const price = item.sale.price;
  const buyer = makeBuyer(S, rng, item, 'tg', price);
  Object.assign(buyer, {
    type: 'normal',
    full: false,
    offer: priceRound(price * 0.9),
    max: priceRound(price * 0.97),
    patience: 99,
    expiresAt: S.t + 24 * 30,
    tut: true,
    noAuth: true,
  });
  const name = itemName(item);
  const th = newThread(S, { kind: 'buyer', name: 'Кирилл', sub: name, platform: 'tg', data: { buyer } });
  say(S, th, 'them', `Привет! Увидел в канале: ${name}. Ещё у тебя? За ${rub(buyer.offer)} заберу сегодня.`);
  notify(S, {
    route: 'tg/thread/' + th.id,
    title: 'Кирилл · ' + name,
    text: 'Предлагает ' + rub(buyer.offer),
    scope: 'client',
    tut: true,
    sticky: true,
  });
  ids(S).tgBuyer = th.id;
  ids(S).tgItem = item.id;
  touch(S);
  return th;
}

/**
 * Первый заказ подписчика. Под него на Авитке лежит честный ориг с
 * доставкой — найти, проверить по фото и заказать игрок умеет со вчера.
 * Мирон учебные объявления не трогает (они не бывают для него «выгодными»).
 */
function spawnFirstOrder(S) {
  if (ids(S).orderThread) return null;
  const rng = rngOf(S);
  const { m, size } = TUT_ORDER2;
  clearModel(S, m, size);
  const orig = tutorialListing(S, rng, {
    m,
    size,
    real: true,
    cond: 1,
    way: 0,
    seller: 'owner',
    name: 'Марк',
    since: '2020',
    reviews: 38,
    mode: 'ship',
    city: 'Подольск',
    ago: 4,
    ask: (fair) => priceRound(fair * 0.8),
    description: 'Кортейз, надевал пару раз — не мой размер. Размер M. Отправлю Авитка Доставкой сегодня же.',
    script: { print: 'ok', tag: 'ok', stitch: 'ok' },
  });
  S.listings.unshift(orig);

  const client = makeClient(S, rng);
  client.name = 'Даня';
  S.clients.push(client);
  const base = valueOrig(S, { m, cond: 1, size, boughtAt: S.t });
  const order = {
    clientId: client.id,
    m,
    size,
    maxCond: 1,
    budget: priceRound(base * 1.3),
    deadline: S.t + 24 * 3,
    createdAt: S.t,
  };
  const th = newThread(S, {
    kind: 'order',
    name: client.name,
    sub: 'заказ: ' + MODELS[m].b + ' ' + MODELS[m].n,
    platform: 'tg',
    data: { order, clientId: client.id },
  });
  say(S, th, 'them', orderText(order, client).replace('{budget}', rub(order.budget)).replace('{deadline}', dateLabel(order.deadline)));
  notify(S, {
    route: 'tg/thread/' + th.id,
    title: 'Заказ от подписчика',
    text: `${MODELS[m].b} ${MODELS[m].n} ${size} · ${rub(order.budget)}`,
    scope: 'client',
    tut: true,
    sticky: true,
  });
  Object.assign(ids(S), { orderThread: th.id, orig5: orig.id, orig5Item: orig.item.id, orderSold: S.stats.ordersDone });
  touch(S);
  return th;
}

/** Отдать заказ клиенту: та вещь, что купили под него. */
function giveOrder(S) {
  const th = S.threads.find((t) => t.id === ids(S).orderThread);
  const it = heldItem(S, bought(S, 'task5'));
  if (th && it && !th.closed) fulfillOrder(S, th, it);
}

const orderOf = (S) => {
  const th = S.threads.find((t) => t.id === ids(S).orderThread);
  return th ? th.data.order : null;
};

/* ======================= ШАГИ ======================= */
// text может быть функцией от состояния: в репликах живые цифры.

const sell = (S) => S.ui.sell && S.ui.sell.id === ids(S).orig1Item;
const marketPrice = (S) => {
  const it = S.items.find((i) => i.id === ids(S).orig1Item);
  return it ? priceSuggestions(S, it, true).market : 0;
};
const threadOf = (S, key) => S.threads.find((t) => t.id === ids(S)[key]);
const buyerOf = (S, key = 'buyerThread') => {
  const th = threadOf(S, key);
  return th && th.data.buyer;
};
const soldItem = (S, key, platform) =>
  S.deals.some((d) => d.itemSnapshot && d.itemSnapshot.id === ids(S)[key] && (!platform || d.platform === platform));

/**
 * Скачать приложение главы: открыть Апстор, нажать «Загрузить», открыть.
 * Одинаково в каждой главе — меняются только приложение и слова.
 */
function installSteps(p, app, ch, { first, open, opened }) {
  const name = APP_DEFS[app].n;
  return [
    {
      id: p + '_store',
      ch,
      kind: 'do',
      text: first,
      done: (S) => at(S, 'store') || installed(S, app),
      auto: (S) => go(S, 'store'),
    },
    {
      id: p + '_get',
      ch,
      kind: 'do',
      text: `Вот она — «${name}». Жми «Загрузить».`,
      done: (S) => installed(S, app),
      auto: (S) => installApp(S, app),
    },
    {
      id: p + '_open',
      ch,
      kind: 'do',
      text: open,
      done: opened,
      auto: (S) => go(S, app),
    },
  ];
}

const AVITO_STEPS = [
  { id: 'call', ch: 'call', kind: 'call', lines: CALLS.avito, start: (S) => startTutorial(S) },

  /* --- банк --- */
  {
    id: 'bank_open',
    ch: 'bank',
    kind: 'do',
    text: 'Деньги кинул 💸 Открой «Банк» — проверь, дошли ли.',
    done: (S) => at(S, 'bank'),
    auto: (S) => go(S, 'bank'),
  },
  {
    id: 'bank_card',
    ch: 'bank',
    kind: 'talk',
    text: 'Вот твоя карта. Деньги в игре видно только здесь, больше нигде — запомни. В минус карта не уходит: что есть, то и тратишь.',
  },
  {
    id: 'bank_history',
    ch: 'bank',
    kind: 'talk',
    text: (S) =>
      `Ниже история: кто, сколько и за что. Вот мои ${rub(ids(S).transfer)}. Кредиты здесь тоже дают, но это потом, когда раскрутишься.`,
  },
  {
    id: 'go_home1',
    ch: 'store',
    kind: 'do',
    text: 'Теперь качаем Авитку. Выходи на главный экран.',
    done: (S) => !ui(S).app || installed(S, 'avito'),
    auto: (S) => go(S, null),
  },
  ...installSteps('avito', 'avito', 'store', {
    first: 'Телефон у тебя пустой 😄 Открывай Апстор — там все приложения.',
    open: 'Скачалась! Открывай Авитку.',
    opened: (S) => at(S, 'avito', 'main'),
  }),

  /* --- поиск --- */
  {
    id: 'f_cat',
    ch: 'search',
    kind: 'do',
    text: 'Тут тысячи объявлений. Листать всё подряд — день убить. Фильтруй! Сначала категория: «Худи и свитшоты».',
    done: (S) => ui(S).filters.cat === 'hoodie',
    auto: (S) => Object.assign(ui(S).filters, { cat: 'hoodie', model: 'all', size: 'all' }),
  },
  {
    id: 'f_model',
    ch: 'search',
    kind: 'do',
    text: 'Теперь модель — «Кархарт худи».',
    done: (S) => String(ui(S).filters.model) === String(TUT_ORDER.m),
    auto: (S) => (ui(S).filters.model = TUT_ORDER.m),
  },
  {
    id: 'f_size',
    ch: 'search',
    kind: 'do',
    text: 'И размер L — клиенту другой не нужен.',
    done: (S) => ui(S).filters.size === TUT_ORDER.size,
    auto: (S) => (ui(S).filters.size = TUT_ORDER.size),
  },
  {
    id: 'results',
    ch: 'search',
    kind: 'talk',
    text: (S) =>
      `Осталось два. Одно за ${rub(listing(S, 'fake1').ask)}, другое за ${rub(listing(S, 'orig1').ask)}. Дешёвое манит, да? 😏 С него и начнём.`,
  },
  {
    id: 'open_fake',
    ch: 'check',
    kind: 'do',
    text: 'Открывай дешёвое.',
    done: (S) => at(S, 'avito', 'item', ids(S).fake1),
    auto: (S) => go(S, 'avito', 'item', ids(S).fake1),
  },

  /* --- проверка пали --- */
  {
    id: 'fake_look',
    ch: 'check',
    kind: 'talk',
    text: 'Смотри: цена сильно ниже рынка, а в описании «брал в ЦУМе, чек потерялся». Это звоночки. Но звоночки — ещё не доказательство. Проверяем.',
  },
  {
    id: 'fake_chat',
    ch: 'check',
    kind: 'do',
    text: 'Фото в объявлении — для красоты. Пиши продавцу.',
    done: (S) => inChat(S, 'fake1'),
    auto: (S) => openChat(S, 'fake1'),
  },
  {
    id: 'fake_photos',
    ch: 'check',
    kind: 'do',
    text: 'Попроси фото бирок и швов — это бесплатно.',
    done: (S) => listing(S, 'fake1').photosAsked,
    auto: (S) => askSeller(S, listing(S, 'fake1'), 'photos'),
  },
  {
    id: 'fake_photos_seen',
    ch: 'check',
    kind: 'talk',
    text: 'Прислал. Под снимками — осмотр: что разглядывать на фото. Запах по фото не проверишь, а ошибиться проще, чем вживую.',
  },
  {
    id: 'fake_tag',
    ch: 'check',
    kind: 'do',
    text: 'У Кархарта первым делом смотрят бирку. Жми.',
    done: (S) => seenTell(S, 'fake1', 'tag'),
    auto: (S) => photoInspect(S, listing(S, 'fake1'), 'tag'),
  },
  {
    id: 'fake_tag_seen',
    ch: 'check',
    kind: 'talk',
    text: 'Видишь? Шрифт поплыл, артикул не бьётся. Красный флаг. Один такой признак — уже почти приговор.',
  },
  {
    id: 'fake_print',
    ch: 'check',
    kind: 'do',
    text: 'Глянь ещё принт — для уверенности.',
    done: (S) => seenTell(S, 'fake1', 'print'),
    auto: (S) => photoInspect(S, listing(S, 'fake1'), 'print'),
  },
  {
    id: 'fake_legit',
    ch: 'check',
    kind: 'do',
    text: 'Для верности — легит-чек по фото. Сервис смотрит снимки двадцать минут. Обычно платно, но первый за мой счёт.',
    done: (S) => !!listing(S, 'fake1').photoVerdict,
    auto: (S) => photoLegit(S, listing(S, 'fake1')),
  },
  {
    id: 'fake_verdict',
    ch: 'check',
    kind: 'tap',
    text: 'ПАЛЬ. Вот так и разводят: дёшево, «чек потерялся», кривая бирка. Запомни: если чек по фото сказал «паль» — это паль точно. Закрывай — идём ко второму.',
  },
  {
    id: 'fake_back',
    ch: 'check',
    kind: 'do',
    text: 'Назад к поиску — стрелкой в углу, пока не увидишь список.',
    done: (S) => at(S, 'avito', 'main'),
    auto: (S) => go(S, 'avito'),
  },
  {
    id: 'open_orig',
    ch: 'check',
    kind: 'do',
    text: 'Открывай второе.',
    done: (S) => at(S, 'avito', 'item', ids(S).orig1),
    auto: (S) => go(S, 'avito', 'item', ids(S).orig1),
  },
  {
    id: 'orig_look',
    ch: 'deal',
    kind: 'talk',
    text: 'Дороже — но глянь на продавца: живой человек, полторы сотни отзывов, «носил пару раз». И продаёт только при встрече — не боится, что посмотришь вживую. Хороший знак.',
  },
  {
    id: 'orig_meet',
    ch: 'deal',
    kind: 'do',
    text: 'Назначай встречу. Вживую видно всё: бирку, швы, запах и дефекты, которых нет на фото.',
    done: (S) => at(S, 'avito', 'meeting', ids(S).orig1),
    auto: (S) => {
      startMeeting(S, listing(S, 'orig1'));
      go(S, 'avito', 'meeting', ids(S).orig1);
    },
  },

  /* --- встреча --- */
  {
    id: 'meet_tag',
    ch: 'deal',
    kind: 'do',
    text: 'Он на месте. Начинай с бирки.',
    done: (S) => seenTell(S, 'orig1', 'tag'),
    auto: (S) => inspectTell(S, itemOf(S, 'orig1'), 'tag', 'hand'),
  },
  {
    id: 'meet_stitch',
    ch: 'deal',
    kind: 'do',
    text: 'Ровная. Теперь швы.',
    done: (S) => seenTell(S, 'orig1', 'stitch'),
    auto: (S) => inspectTell(S, itemOf(S, 'orig1'), 'stitch', 'hand'),
  },
  {
    id: 'meet_ok',
    ch: 'deal',
    kind: 'talk',
    text: 'Чисто. Похоже на ориг. Но перед тем как платить, всегда смотри состояние: на фото дефектов не видно.',
  },
  {
    id: 'meet_cond',
    ch: 'deal',
    kind: 'do',
    text: 'Осмотри состояние.',
    done: (S) => !!(itemOf(S, 'orig1') || {}).condSeen,
    auto: (S) => meetInspectCondition(S, listing(S, 'orig1')),
  },
  {
    id: 'meet_defect',
    ch: 'deal',
    kind: 'talk',
    text: 'Катышки по ткани! Продавец про них не писал. Это твой козырь: ткни в дефект — и цена поедет.',
  },
  {
    id: 'meet_lever',
    ch: 'deal',
    kind: 'do',
    text: 'Жми «Тут дефект».',
    done: (S) => !!listing(S, 'orig1').seller.used.defect,
    auto: (S) => useLever(S, listing(S, 'orig1'), 'defect'),
  },
  {
    id: 'meet_buy',
    milestone: true,
    ch: 'deal',
    kind: 'do',
    text: (S) => `${rub(listing(S, 'orig1').seller.current)} вместо ${rub(listing(S, 'orig1').ask)}. Красава! Забирай.`,
    done: (S) => S.items.some((i) => i.id === ids(S).orig1Item),
    auto: (S) => {
      buyAtMeeting(S, listing(S, 'orig1'));
      go(S, 'wardrobe', 'item', ids(S).orig1Item);
    },
  },

  /* --- продажа --- */
  {
    id: 'bought',
    ch: 'sell',
    kind: 'talk',
    text: 'Ориг, да ещё со скидкой 🔥 Теперь фокус: мой клиент ищет именно на Авитке — ему нужна доставка с гарантией. Выставляй, он сам напишет. Заодно научишься продавать.',
  },
  {
    id: 'sell_open',
    ch: 'sell',
    kind: 'do',
    text: 'Жми «Выставить на продажу».',
    done: (S) => sell(S),
    auto: (S) => {
      const it = S.items.find((i) => i.id === ids(S).orig1Item);
      S.ui.sell = { id: it.id, asOrig: true, avito: true, tg: false, price: priceSuggestions(S, it, true).market };
    },
  },
  {
    id: 'sell_kind',
    ch: 'sell',
    kind: 'talk',
    text: 'Сначала — что продаёшь: оригинал или реплику. Вживую всё было чисто — ставим «Оригинал». Жёлтая плашка — про легит-чек: его не делали, отвечаем своим глазом. А паль за ориг не выдавай никогда: поймают — рейтинг в ноль.',
  },
  {
    id: 'sell_price',
    ch: 'sell',
    kind: 'do',
    text: 'Цена решает всё. «Быстро» — уйдёт за день, «Жадно» — провисит неделями. Я бы ставил «Рынок».',
    done: (S) => (sell(S) && S.ui.sell.price === marketPrice(S)) || !!(itemOf(S, 'orig1') && itemOf(S, 'orig1').sale) || !itemOf(S, 'orig1'),
    auto: (S) => (S.ui.sell.price = marketPrice(S)),
  },
  {
    id: 'sell_hint',
    ch: 'sell',
    kind: 'talk',
    text: 'Под ценой подсказка: сколько людей в день напишет и сколько заработаешь. Смотри туда, а не в потолок.',
  },
  {
    id: 'sell_publish',
    milestone: true,
    ch: 'sell',
    kind: 'do',
    text: 'Публикуй.',
    done: (S) => !!(itemOf(S, 'orig1') && itemOf(S, 'orig1').sale),
    auto: (S) => listItem(S, itemOf(S, 'orig1'), { price: S.ui.sell.price, asOrig: true, avito: true, tg: false }),
  },
  {
    id: 'wait_buyer',
    ch: 'sell',
    kind: 'wait',
    text: 'Опубликовано. Покупатели пишут с 9 до 23 — подождём…',
    done: (S) => !!ids(S).buyerThread,
    auto: (S) => spawnTutorialBuyer(S),
  },
  {
    id: 'buyer_open',
    ch: 'sell',
    kind: 'do',
    text: 'О, уже пишут! Жми на уведомление.',
    done: (S) => at(S, 'avito', 'thread', ids(S).buyerThread),
    auto: (S) => go(S, 'avito', 'thread', ids(S).buyerThread),
  },
  {
    id: 'buyer_counter',
    ch: 'sell',
    kind: 'do',
    text: 'Сбивает цену — классика. Не соглашайся сразу и не отказывай: предложи середину. Я уже вписал.',
    done: (S) => !!(buyerOf(S) && buyerOf(S).agreed),
    auto: (S) => {
      const th = threadOf(S, 'buyerThread');
      const it = itemOf(S, 'orig1');
      if (th && it && it.sale) counterToBuyer(S, th, priceRound((th.data.buyer.offer + it.sale.price) / 2));
    },
  },
  {
    id: 'buyer_send',
    milestone: true,
    ch: 'sell',
    kind: 'do',
    text: 'Договорились! Отправляй Авитка Доставкой.',
    // «Продано» — это сделка по вещи, а не «вещи нет в шкафу»: в начале
    // её там тоже нет, и сценарий перескочил бы сразу сюда.
    done: (S) => soldItem(S, 'orig1Item'),
    auto: (S) => completeSale(S, threadOf(S, 'buyerThread')),
  },
  {
    id: 'sold',
    ch: 'sell',
    kind: 'tap',
    text: (S) => {
      const d = S.deals.find((x) => x.label === 'Кархарт худи');
      return `Продано${d && d.profit > 0 ? `, ${rub(d.profit)} в плюс` : ''}! Жёлтая плашка — честное предупреждение: легит-чека не было. Мы смотрели вживую, бирка и швы чистые, так что спим спокойно. Жми «Отлично».`;
    },
    leave: (S) => payNow(S),
  },
  {
    id: 'paid',
    ch: 'sell',
    kind: 'talk',
    text: 'Обычно деньги с Авитки идут день-два, пока покупатель заберёт посылку. Но клиент мой — забрал сразу, деньги уже на карте 💸 Слушай, ты справился лучше, чем я думал. Оставь всё себе — на развитие. Считай, первая зарплата.',
  },

  /* --- доставка: Самбы себе --- */
  {
    id: 'ship_intro',
    ch: 'ship',
    kind: 'talk',
    text: 'Ещё урок, пока прёт. Самбы сейчас ищут все — сметают за день. Возьми себе пару, 42-й: завтра покажу, где их продать дороже, чем ты думаешь.',
    leave: (S) => setupTrend(S),
  },
  {
    id: 'trend_search',
    ch: 'ship',
    kind: 'do',
    text: 'Теперь в поиск Авитки — за Самбами.',
    done: (S) => at(S, 'avito', 'main'),
    auto: (S) => go(S, 'avito'),
  },
  {
    id: 'trend_cat',
    ch: 'ship',
    kind: 'do',
    text: 'Фильтры помнишь? Категория — «Обувь».',
    done: (S) => ui(S).filters.cat === 'shoes',
    auto: (S) => Object.assign(ui(S).filters, { cat: 'shoes', model: 'all', size: 'all' }),
  },
  {
    id: 'trend_model',
    ch: 'ship',
    kind: 'do',
    text: 'Модель — «Адик Самбы».',
    done: (S) => String(ui(S).filters.model) === String(TUT_TREND.m),
    auto: (S) => (ui(S).filters.model = TUT_TREND.m),
  },
  {
    id: 'trend_size',
    ch: 'ship',
    kind: 'do',
    text: 'Размер — 42.',
    done: (S) => ui(S).filters.size === TUT_TREND.size,
    auto: (S) => (ui(S).filters.size = TUT_TREND.size),
  },
  {
    id: 'trend_mode',
    ch: 'ship',
    kind: 'do',
    text: 'Самбы везут со всей страны. Поставь «С доставкой» — увидишь и другие города.',
    done: (S) => ui(S).filters.mode === 'ship',
    auto: (S) => (ui(S).filters.mode = 'ship'),
  },
  {
    id: 'trend_results',
    ch: 'ship',
    kind: 'talk',
    text: 'Опять двое 😄 Теперь сам знаешь, с какого начинать.',
  },
  {
    id: 'trend_fake',
    ch: 'ship',
    kind: 'do',
    text: 'Открывай дешёвые.',
    done: (S) => at(S, 'avito', 'item', ids(S).fake2),
    auto: (S) => go(S, 'avito', 'item', ids(S).fake2),
  },
  {
    id: 'trend_fake_look',
    ch: 'ship',
    kind: 'talk',
    text: 'Смотри на блок «На что обратить внимание»: аккаунт свежий, ноль отзывов, цена вдвое ниже, десятки одинаковых объявлений. По отдельности бывает у кого угодно. Всё сразу — почти всегда паль.',
  },
  {
    id: 'trend_fake_chat',
    ch: 'ship',
    kind: 'do',
    text: 'Проверим. Пиши продавцу.',
    done: (S) => inChat(S, 'fake2'),
    auto: (S) => openChat(S, 'fake2'),
  },
  {
    id: 'trend_fake_photos',
    ch: 'ship',
    kind: 'do',
    text: 'Проси фото.',
    done: (S) => listing(S, 'fake2').photosAsked,
    auto: (S) => askSeller(S, listing(S, 'fake2'), 'photos'),
  },
  {
    id: 'trend_fake_sole',
    ch: 'ship',
    kind: 'do',
    text: 'У кроссовок первым делом палится подошва. Смотри.',
    done: (S) => seenTell(S, 'fake2', 'sole'),
    auto: (S) => photoInspect(S, listing(S, 'fake2'), 'sole'),
  },
  {
    id: 'trend_fake_verdict',
    ch: 'ship',
    kind: 'talk',
    text: 'Рисунок мягкий, по краям клей — паль. Легит-чек тут не нужен, и так всё ясно. Деньги экономь.',
  },
  {
    id: 'trend_back',
    ch: 'ship',
    kind: 'do',
    text: 'Назад к поиску.',
    done: (S) => at(S, 'avito', 'main'),
    auto: (S) => go(S, 'avito'),
  },
  {
    id: 'trend_orig',
    ch: 'ship',
    kind: 'do',
    text: 'Открывай вторые.',
    done: (S) => at(S, 'avito', 'item', ids(S).orig2),
    auto: (S) => go(S, 'avito', 'item', ids(S).orig2),
  },
  {
    id: 'trend_orig_chat',
    ch: 'ship',
    kind: 'do',
    text: 'Продавец в Питере — встретиться не выйдет. Значит, проверяем по фото. Пиши.',
    done: (S) => inChat(S, 'orig2'),
    auto: (S) => openChat(S, 'orig2'),
  },
  {
    id: 'trend_orig_photos',
    ch: 'ship',
    kind: 'do',
    text: 'Проси фото.',
    done: (S) => listing(S, 'orig2').photosAsked,
    auto: (S) => askSeller(S, listing(S, 'orig2'), 'photos'),
  },
  {
    id: 'trend_orig_sole',
    ch: 'ship',
    kind: 'do',
    text: 'Подошва?',
    done: (S) => seenTell(S, 'orig2', 'sole'),
    auto: (S) => photoInspect(S, listing(S, 'orig2'), 'sole'),
  },
  {
    id: 'trend_orig_shape',
    ch: 'ship',
    kind: 'do',
    text: 'Чётко. Теперь силуэт — у Самб его копируют хуже всего.',
    done: (S) => seenTell(S, 'orig2', 'shape'),
    auto: (S) => photoInspect(S, listing(S, 'orig2'), 'shape'),
  },
  {
    id: 'trend_legit',
    ch: 'ship',
    kind: 'do',
    text: 'Всё чисто. Вещь не копеечная — возьмём чек по фото. Он дешевле обычного. Плати сам, это уже твой бизнес 😉',
    done: (S) => !!listing(S, 'orig2').photoVerdict,
    auto: (S) => photoLegit(S, listing(S, 'orig2')),
  },
  {
    id: 'trend_legit_ok',
    ch: 'ship',
    kind: 'tap',
    text: 'На фото — оригинал. Но запомни главное: чек по фото проверяет снимки, а не то, что приедет. Бывает, шлют фото чужой вещи, а отправляют паль. Поэтому, когда придёт, — проверь ещё раз: на это у тебя сутки защиты Авитки.',
  },
  {
    id: 'trend_buy',
    ch: 'ship',
    kind: 'tap',
    text: 'Берём. Жми «Доставкой».',
  },
  {
    id: 'trend_pay',
    milestone: true,
    ch: 'ship',
    kind: 'do',
    text: 'Видишь синий блок? После получения у тебя сутки на проверку: окажется паль — вернёшь деньги через спор. Оплачивай.',
    done: (S) => S.shipments.some((sh) => sh.items.some((i) => i.id === ids(S).orig2Item)),
    auto: (S) => {
      confirmDelivery(S, listing(S, 'orig2'));
      go(S, 'parcels');
    },
  },
  {
    id: 'self_intro',
    ch: 'self',
    kind: 'talk',
    text: 'Едут! Учебная экспресс-доставка — часа через два. А дальше ты сам: я больше не веду за руку, только подсвечиваю, куда жать.',
  },

  /* --- дальше сам: Самбы приехали --- */
  {
    id: 'wait_samba',
    milestone: true,
    ch: 'self',
    kind: 'goal',
    text: 'Дождись Самбы. Время двигают кнопки «+1 ч» и «+3 ч» на главном экране.',
    done: (S) => S.items.some((i) => i.id === ids(S).orig2Item),
    auto: (S) => waitFor(S, () => S.items.some((i) => i.id === ids(S).orig2Item)),
  },
  {
    id: 'legit_samba',
    milestone: true,
    ch: 'self',
    kind: 'goal',
    text: 'Самбы приехали. Помнишь, что я говорил про чек по фото? Проверь их в руках: легит-чек в шкафу.',
    done: (S) => !!(heldItem(S, ids(S).orig2Item) || {}).legitDone,
    auto: (S) => legitCheck(S, heldItem(S, ids(S).orig2Item)),
  },
  {
    id: 'samba_ok',
    ch: 'self',
    kind: 'talk',
    text: 'Оригинал ✓ — и теперь это правда: вещь в руках, подменить её уже нельзя. Чек остаётся у вещи: покажешь покупателю, и вопрос «а точно ориг?» закрыт. Самбы твои — завтра покажу, куда их выставить.',
    leave: (S) => setupTask3(S),
  },

  /* --- вещь 3: сам находит и заказывает --- */
  {
    id: 'task3_buy',
    milestone: true,
    ch: 'self',
    kind: 'goal',
    text: (S) =>
      `Новый заказ! Клиенту нужны Нюбы 550, размер 43. Перевёл ${rub(ids(S).transfer3)}. Найди на Авитке, проверь и закажи с доставкой. Только не паль.`,
    done: (S) => !!bought(S, 'task3'),
    auto: (S) => {
      const l = listing(S, 'orig3');
      askSeller(S, l, 'photos');
      photoInspect(S, l, 'sole');
      confirmDelivery(S, l);
    },
  },
  {
    id: 'task3_wait',
    milestone: true,
    ch: 'self',
    kind: 'goal',
    text: 'Заказал! Дождись посылку — «+1 ч» на главном.',
    done: (S) => !!heldItem(S, bought(S, 'task3')),
    auto: (S) => waitFor(S, () => !!heldItem(S, bought(S, 'task3'))),
  },
  {
    id: 'task3_legit',
    milestone: true,
    ch: 'self',
    kind: 'goal',
    text: 'Пришли Нюбы. Что делаем с посылкой с Авитки первым делом?',
    done: (S) => !!(heldItem(S, bought(S, 'task3')) || {}).legitDone,
    auto: (S) => legitCheck(S, heldItem(S, bought(S, 'task3'))),
  },
  {
    id: 'task3_ok',
    ch: 'self',
    kind: 'talk',
    skip: (S) => !boughtReal(S, 'task3'),
    text: 'Ориг ✓ Чисто сработал — сам нашёл, сам проверил. Курьер клиента заберёт их, а тебе пятьсот за работу.',
    leave: (S) => handToClient(S, 'task3', 500),
  },
  {
    id: 'task3_dispute',
    milestone: true,
    ch: 'self',
    kind: 'goal',
    skip: (S) => boughtReal(S, 'task3'),
    text: 'Паль! Ничего, бывает. Продавец писал «оригинал», и сутки ещё не прошли — открывай спор в карточке вещи и возвращай деньги.',
    done: (S) => disputed(S, 'task3'),
    auto: (S) => openDispute(S, heldItem(S, bought(S, 'task3'))),
  },
  {
    id: 'task3_refund',
    ch: 'self',
    kind: 'talk',
    skip: (S) => boughtReal(S, 'task3'),
    text: 'Деньги вернулись — их я отдам клиенту. Запомни, что тебя обмануло: дешевле рынка, свежий аккаунт, кривая подошва на фото. В следующий раз видно будет сразу.',
    leave: (S) => refundToClient(S, 'task3'),
  },

  /* --- вещь 4: подмена --- */
  {
    id: 'task4_intro',
    ch: 'swap',
    kind: 'talk',
    text: (S) => `Последний на сегодня. Клиенту нужно худи Стусси, размер M. Перевёл ${rub(ids(S).transfer4)}. Действуй сам.`,
    enter: (S) => setupTask4(S),
  },
  {
    id: 'task4_buy',
    milestone: true,
    ch: 'swap',
    kind: 'goal',
    text: 'Найди худи Стусси, размер M, проверь и закажи с доставкой.',
    done: (S) => !!bought(S, 'task4'),
    auto: (S) => {
      const l = listing(S, 'swap4');
      askSeller(S, l, 'photos');
      photoInspect(S, l, 'tag');
      photoLegit(S, l);
      confirmDelivery(S, l);
    },
  },
  {
    id: 'task4_wait',
    milestone: true,
    ch: 'swap',
    kind: 'goal',
    text: 'Ждём посылку.',
    done: (S) => !!heldItem(S, bought(S, 'task4')),
    auto: (S) => waitFor(S, () => !!heldItem(S, bought(S, 'task4'))),
  },
  {
    id: 'task4_legit',
    milestone: true,
    ch: 'swap',
    kind: 'goal',
    text: 'Пришло. Знаешь, что делать.',
    done: (S) => !!(heldItem(S, bought(S, 'task4')) || {}).legitDone,
    auto: (S) => legitCheck(S, heldItem(S, bought(S, 'task4'))),
  },
  {
    id: 'task4_swap',
    ch: 'swap',
    kind: 'talk',
    text: 'Стоп. На фото был оригинал, бирка чистая, чек по фото — «оригинал». А в руках паль. Тебе прислали ДРУГУЮ вещь: сфоткали чужой ориг, отправили копию. Вот зачем проверять посылку ещё раз.',
  },
  {
    id: 'task4_dispute',
    milestone: true,
    ch: 'swap',
    kind: 'goal',
    text: 'Сутки защиты ещё идут, продавец писал «оригинал». Открывай спор в карточке вещи и возвращай деньги.',
    done: (S) => disputed(S, 'task4'),
    auto: (S) => openDispute(S, heldItem(S, bought(S, 'task4'))),
  },
  {
    id: 'avito_end',
    ch: 'swap',
    kind: 'talk',
    end: true,
    text: 'Деньги вернулись — отдам их клиенту, а тебе триста за то, что не растерялся. Всё, на сегодня хватит! Вечером попробуй сам: выстави на Авитку старые вещи из шкафа. А завтра в девять наберу — покажу Телегу 😉',
    leave: (S) => refundToClient(S, 'task4', 300),
  },
];

const TG_STEPS = [
  { id: 'tg_call', ch: 'tcall', kind: 'call', lines: CALLS.tg },
  ...installSteps('tg', 'tg', 'tstore', {
    first: 'Открывай Апстор.',
    open: 'Скачалась! Открывай Телегу.',
    opened: (S) => at(S, 'tg', 'main'),
  }),

  /* --- свой канал --- */
  {
    id: 'tg_pinned',
    ch: 'tchannel',
    kind: 'talk',
    text: 'Я тут, закреплён наверху. Всё, что я тебе говорил, — в нашем чате: забудешь — перечитай.',
  },
  {
    id: 'tg_channels',
    ch: 'tchannel',
    kind: 'do',
    text: 'Переходи во вкладку «Каналы».',
    done: (S) => at(S, 'tg', 'main') && ui(S).tgTab === 'channels',
    auto: (S) => (S.ui.tgTab = 'channels'),
  },
  {
    id: 'tg_create',
    ch: 'tchannel',
    kind: 'tap',
    text: 'Создавай свой канал.',
  },
  {
    id: 'tg_name',
    milestone: true,
    ch: 'tchannel',
    kind: 'do',
    text: 'Придумай название — или оставь это. Жми «Создать».',
    done: (S) => S.tg.has,
    auto: (S) => {
      createChannel(S, 'Шмот с Тимуром');
      go(S, 'tg', 'own');
    },
  },
  {
    id: 'tg_own',
    ch: 'tchannel',
    kind: 'talk',
    text: 'Вот он, твой канал. На Авитке ты один из сотни: покупатель тебя не знает, торгуется, а деньги идут сутки. Сюда приходят свои — платят сразу, а лучшие пишут заказы: «ищу такое-то, плачу столько». Это самые жирные деньги в игре.',
  },
  {
    id: 'tg_trust',
    ch: 'tchannel',
    kind: 'talk',
    text: 'Подписчиков можно нагнать рекламой, но покупают только там, где верят. Честно продаёшь — доверие растёт. Паль за ориг — падает.',
  },

  /* --- витрина --- */
  {
    id: 'tg_post',
    milestone: true,
    ch: 'tpost',
    kind: 'goal',
    text: 'Канал без вещей — пустая витрина. Выставь сюда вещь из шкафа — лучше Самбы, они в тренде. В окне продажи отметь «Мой канал».',
    enter: (S) => ensureListable(S),
    leave: (S) => markPosted(S),
    done: (S) => S.items.some((i) => i.sale && i.sale.tg),
    auto: (S) => {
      ensureListable(S);
      const it = bestForChannel(S);
      if (!it) return;
      listItem(S, it, {
        price: it.sale ? it.sale.price : priceSuggestions(S, it, true).market,
        asOrig: true,
        avito: it.sale ? it.sale.avito : false,
        tg: true,
      });
    },
  },
  {
    id: 'tg_posted',
    ch: 'tpost',
    kind: 'goal',
    text: 'Готово — пост ушёл подписчикам: каждая вещь в канале — пост в ленте, свои видят её первыми. Открой свой канал — глянь на витрину.',
    done: (S) => at(S, 'tg', 'own'),
    auto: (S) => go(S, 'tg', 'own'),
  },

  /* --- подписчики --- */
  {
    id: 'tg_repost',
    ch: 'tsubs',
    kind: 'talk',
    text: `Только подписчиков у тебя пока — одни друзья. Репостнул тебя у себя 👊 Лови народ: плюс ${TIMUR_REPOST}.`,
    leave: (S) => timurRepost(S),
  },
  {
    id: 'tg_ads',
    ch: 'tsubs',
    kind: 'talk',
    text: 'Дальше растишь сам. Реклама в других каналах — подписчики за деньги, приходят за сутки. Бери маленькие каналы про шмот: дешевле и прямо в цель.',
  },
  {
    id: 'tg_free',
    ch: 'tsubs',
    kind: 'talk',
    text: 'Бесплатно — пост-обзор трендов раз в день. И розыгрыш: отдаёшь вещь из шкафа — получаешь и подписчиков, и доверие. Больше подписчиков — больше покупок и заказов.',
  },

  /* --- первая продажа в канале --- */
  {
    id: 'tg_wait_buyer',
    ch: 'tsale',
    kind: 'wait',
    text: 'Пост висит… подписчики листают ленту.',
    done: (S) => !!ids(S).tgBuyer,
    auto: (S) => spawnChannelBuyer(S),
  },
  {
    id: 'tg_buyer_open',
    ch: 'tsale',
    kind: 'do',
    text: 'Пишут! Жми на уведомление.',
    done: (S) => at(S, 'tg', 'thread', ids(S).tgBuyer),
    auto: (S) => go(S, 'tg', 'thread', ids(S).tgBuyer),
  },
  {
    id: 'tg_buyer_deal',
    ch: 'tsale',
    kind: 'do',
    text: 'Торгуется — как вчера: не соглашайся сразу, предложи середину. Я вписал.',
    done: (S) => !!(buyerOf(S, 'tgBuyer') && buyerOf(S, 'tgBuyer').agreed),
    auto: (S) => {
      const th = threadOf(S, 'tgBuyer');
      const it = S.items.find((i) => i.id === ids(S).tgItem);
      if (th && it && it.sale) counterToBuyer(S, th, priceRound((th.data.buyer.offer + it.sale.price) / 2));
    },
  },
  {
    id: 'tg_buyer_send',
    milestone: true,
    ch: 'tsale',
    kind: 'do',
    text: 'Договорились. Отправляй.',
    done: (S) => soldItem(S, 'tgItem', 'tg'),
    auto: (S) => completeSale(S, threadOf(S, 'tgBuyer')),
  },
  {
    id: 'tg_sold',
    ch: 'tsale',
    kind: 'talk',
    text: 'Деньги уже на карте — не через сутки, как с Авитки. И это твой подписчик: он увидит и следующие вещи. Вот зачем канал.',
  },

  /* --- Хайп-радар --- */
  {
    id: 'radar_back',
    ch: 'tradar',
    kind: 'do',
    text: 'А теперь — откуда я вчера знал про Самбы. Назад, к каналам.',
    enter: (S) => radarPost(S),
    done: (S) => at(S, 'tg', 'main'),
    auto: (S) => {
      S.ui.tgTab = 'channels';
      go(S, 'tg');
    },
  },
  {
    id: 'radar_open',
    ch: 'tradar',
    kind: 'do',
    text: 'Открывай «Хайп-радар» во вкладке «Каналы».',
    done: (S) => at(S, 'tg', 'channel') && ui(S).channel === 'radar',
    auto: (S) => {
      S.ui.channel = 'radar';
      go(S, 'tg', 'channel');
    },
  },
  {
    id: 'radar_read',
    ch: 'tradar',
    kind: 'talk',
    text: `Видишь? Самбы — ${Math.round(TREND_HYPE * 100)}%: почти все уйдут за неделю. Бесплатно радар показывает, что горит сейчас. PRO присылает прогноз — что загорится через несколько дней. Подпишешься, когда раскрутишься.`,
  },

  /* --- первый заказ подписчика --- */
  {
    id: 'order_wait',
    ch: 'torder',
    kind: 'wait',
    text: 'А теперь главное, ради чего всё это…',
    done: (S) => !!ids(S).orderThread,
    auto: (S) => spawnFirstOrder(S),
  },
  {
    id: 'order_open',
    ch: 'torder',
    kind: 'do',
    text: 'Заказ от подписчика! Открывай.',
    done: (S) => at(S, 'tg', 'thread', ids(S).orderThread),
    auto: (S) => go(S, 'tg', 'thread', ids(S).orderThread),
  },
  {
    id: 'order_accept',
    milestone: true,
    ch: 'torder',
    kind: 'do',
    text: (S) => {
      const o = orderOf(S);
      return `Видишь бюджет? ${o ? rub(o.budget) : ''} — выше рынка: человек платит за то, что ищешь ты, а не он. И даёт предоплату — будет на что купить. Бери заказ.`;
    },
    done: (S) => !!(orderOf(S) && orderOf(S).accepted),
    auto: (S) => acceptOrder(S, threadOf(S, 'orderThread')),
  },
  {
    id: 'order_buy',
    milestone: true,
    ch: 'torder',
    kind: 'goal',
    text: 'Теперь найди ему вещь — сам. Кортейз футболка, размер M, на Авитке. Проверь по фото и закажи доставкой: клиент сделает легит-чек, паль не прокатит.',
    done: (S) => !!bought(S, 'task5'),
    auto: (S) => {
      const l = listing(S, 'orig5');
      askSeller(S, l, 'photos');
      photoInspect(S, l, 'print');
      confirmDelivery(S, l);
    },
  },
  {
    id: 'order_parcel',
    milestone: true,
    ch: 'torder',
    kind: 'goal',
    text: 'Заказал. Посылка едет — «+1 ч» на главном.',
    done: (S) => !!heldItem(S, bought(S, 'task5')),
    auto: (S) => waitFor(S, () => !!heldItem(S, bought(S, 'task5'))),
  },
  {
    id: 'order_give',
    milestone: true,
    ch: 'torder',
    kind: 'goal',
    text: 'Пришла. Отдавай заказ — в переписке с Даней.',
    done: (S) => S.stats.ordersDone > (ids(S).orderSold || 0),
    auto: (S) => giveOrder(S),
  },
  {
    id: 'tg_end',
    ch: 'torder',
    kind: 'talk',
    end: true,
    text: (S) => {
      const d = S.deals.find((x) => x.isOrder && x.itemSnapshot && x.itemSnapshot.id === bought(S, 'task5'));
      return `${d ? `Купил за ${rub(d.cost)}, отдал за ${rub(d.price)} — ${rub(d.profit)} чистыми. ` : ''}Вот это и есть канал: свои люди, свои заказы, и Даня теперь будет писать ещё. Пару дней без меня: продавай, расти канал. А в день завоза в секонде наберу — покажу, где вещи дешевле всего 😉`;
    },
  },
];

/* ======================= ГЛАВА «СЕКОНД» ======================= */
// Гонка у полки: к десяти у дверей, на завозе полсотни вещей, Тимур обводит
// две — ориг и паль одной цены. Осмотр стоит минут, Мирон рядом. Взял ориг —
// разница в кармане; взял паль — урок честной продажи реплики.

/** Ориг, ради которого встают к десяти, и паль-приманка по той же цене. */
export const TUT_SECOND = {
  real: { m: model('Найк', 'Теч Флис'), size: 'M', tell: 'hardware', tellName: 'молнию' },
  fake: { m: model('Нюбы', '9060'), size: '42', tell: 'sole', tellName: 'подошву' },
};

/** Вещь на полку «Мешка» — с заданным исходом осмотра и ценником по бирке. */
function secondSlot(S, rng, o, tag) {
  const item = makeItem(rng, o.m, { cond: o.cond, real: o.real, size: o.size, hasBox: false, boughtAt: S.t });
  item.script = o.script;
  item.tut = true;
  const price = tag || Math.max(250, priceRound(valueOrig(S, { ...item, cond: item.shownCond }) * o.k));
  return { id: takeSlotId(), item, price, addedAt: S.t, good: true, taken: false, tut: true };
}

/** Завоз открылся: кладём на полку две вещи, которые Тимур обведёт. */
function setupSecondFind(S) {
  if (ids(S).sec6Real) return;
  const rng = rngOf(S);
  const { real, fake } = TUT_SECOND;
  // Ориг поношенный — плюс скромный, пара тысяч: ранний капитал в игре дорог,
  // и находка урока не должна сократить игроку путь на неделю (проверено sim/run.js).
  // Паль висит рядом за тот же ценник: продавщицы клеят его по бирке.
  const r = secondSlot(S, rng, { ...real, real: true, cond: 3, k: 0.6, script: { hardware: 'ok', tag: 'ok', shape: 'ok', print: 'ok' } });
  const f = secondSlot(S, rng, { ...fake, real: false, cond: 1, script: { sole: 'bad', shape: 'odd', tag: 'odd' } }, r.price);
  // Новое на полке — сверху списка.
  S.second.items.push(f, r);
  Object.assign(ids(S), { sec6Real: r.id, sec6RealItem: r.item.id, sec6Fake: f.id, sec6FakeItem: f.item.id });
  visitSecond(S);
  touch(S);
}

const slotOf = (S, key) => S.second.items.find((x) => x.id === ids(S)[key]) || null;
const boughtSecondReal = (S) => bought(S, 'task6') === ids(S).sec6RealItem;

/** Мирон забирает с полки остальное хорошее — и пишет об этом. */
function rivalStrike(S) {
  if (ids(S).rivalStruck) return;
  ids(S).rivalStruck = true;
  const mine = bought(S, 'task6');
  S.second.items = S.second.items.filter((x) => (x.tut ? x.item.id === mine : !isTreasure(S, x)));
  S.rival.raidDay = dayIndex(S.t);
  let th = S.threads.find((t) => t.kind === 'rival' && t.name === RIVAL_NAME);
  if (!th) th = newThread(S, { kind: 'rival', name: RIVAL_NAME, sub: 'конкурент', platform: 'tg' });
  th.closed = false;
  th.hidden = false;
  const text = 'Видел тебя у «Мешка», новенький 😏 Ладно, свою вещь ты взял. Остальное хорошее — моё. В понедельник посмотрим, кто раньше встанет.';
  say(S, th, 'them', text);
  notify(S, { route: 'tg/thread/' + th.id, title: RIVAL_NAME, text, scope: 'client', tut: true });
  touch(S);
}

/** Выставить вещь из секонда: ориг — как оригинал, паль — честно как реплику. */
function listSecondFind(S) {
  const it = heldItem(S, bought(S, 'task6'));
  if (!it) return;
  const asOrig = it.id === ids(S).sec6RealItem;
  listItem(S, it, { price: priceSuggestions(S, it, asOrig).market, asOrig, avito: true, tg: S.tg.has });
}

const SECOND_STEPS = [
  { id: 'second_call', ch: 'scall', kind: 'call', lines: CALLS.second },
  ...installSteps('second', 'second', 'sstore', {
    first: 'Открывай Апстор.',
    open: 'Открывай «Секонд».',
    opened: (S) => at(S, 'second'),
  }),
  {
    id: 'second_door',
    milestone: true,
    ch: 'sshop',
    kind: 'goal',
    text: 'Пока закрыто — откроются в десять, Мирон будет к открытию. Жди у дверей: кто стоит у входа, тот и выбирает первым.',
    // Веха: без установленного приложения у дверей не стоят.
    done: (S) => installed(S, 'second') && isSecondOpen(S.t),
    auto: (S) => waitSecondOpen(S),
  },
  {
    id: 'second_shelf',
    ch: 'sshop',
    kind: 'talk',
    enter: (S) => setupSecondFind(S),
    text: 'Открылись! Полсотни вещей, и половина брендового — паль. «Как ориг ~…» — столько вещь стоит, если она настоящая. Две я бы глянул первыми — обвёл. Ценник у обеих одинаковый.',
  },
  {
    id: 'second_find',
    milestone: true,
    ch: 'sshop',
    kind: 'goal',
    text: `Осмотри обе и возьми чистую. У Теч Флиса первым делом смотри ${TUT_SECOND.real.tellName}, у Нюб — ${TUT_SECOND.fake.tellName}. Каждый признак — минуты, Мирон рядом.`,
    done: (S) => !!bought(S, 'task6'),
    auto: (S) => {
      const slot = slotOf(S, 'sec6Real');
      if (!slot) return;
      // Закрыто (игрок прождал до вечера) — Тимур ждёт следующего открытия.
      if (!isSecondOpen(S.t)) {
        if (!waitSecondOpen(S)) advanceHours(S, 1);
        return;
      }
      secondInspect(S, slot.id, TUT_SECOND.real.tell);
      buySecond(S, slot.id);
    },
  },
  {
    id: 'second_real',
    ch: 'sshop',
    kind: 'talk',
    skip: (S) => !boughtSecondReal(S),
    text: (S) => {
      const it = heldItem(S, ids(S).sec6RealItem);
      return `Ориг! Молния ровная, не то что у братовой пали. Взял за ${rub(it ? it.cost : 0)}, а на Авитке такие уходят тысяч за ${it ? Math.round(valueOrig(S, it) / 1000) : '…'}. Вот она, разница, ради которой встают к десяти.${S.mentorDebt ? ` Что я докинул — ${rub(S.mentorDebt)} — вернёшь с продажи, само спишется.` : ''}`;
    },
  },
  {
    id: 'second_fake',
    ch: 'sshop',
    kind: 'talk',
    skip: (S) => boughtSecondReal(S),
    text: (S) => `Паль — подошва же поплыла, видел? Ничего, в секонде так у всех: брендовое — пятьдесят на пятьдесят. Не выбрасывай, продай честно как реплику: немного, но твоё.${S.mentorDebt ? ` Мои ${rub(S.mentorDebt)} вернёшь, когда будут.` : ''}`,
  },
  {
    id: 'second_list',
    milestone: true,
    ch: 'sshop',
    kind: 'goal',
    text: (S) =>
      boughtSecondReal(S)
        ? 'Выставляй — как оригинал, цену «Рынок». Теч Флис сейчас в ликвиде, уйдёт быстро.'
        : 'Выставляй как реплику: в окне продажи жми «Реплика». Обманешь, что ориг, — поймают, и рейтинг в ноль.',
    done: (S) => {
      const it = heldItem(S, bought(S, 'task6'));
      return !!(it && it.sale && (boughtSecondReal(S) || !it.sale.asOrig)) || (!!bought(S, 'task6') && !it);
    },
    auto: (S) => listSecondFind(S),
  },
  {
    id: 'second_rival',
    ch: 'sshop',
    kind: 'talk',
    enter: (S) => rivalStrike(S),
    text: 'О, кто пишет. Мирон к десяти тоже был — остальное хорошее унёс он. Сегодня успел ты, в другой раз — кто раньше встал.',
  },
  {
    id: 'second_end',
    ch: 'sshop',
    kind: 'talk',
    end: true,
    text: 'Завоз — по понедельникам большой, по четвергам поменьше. К вечеру остаются паль и неликвид, к выходным всё дешевеет. Через пару дней покажу Пойзон.',
  },
];

/* --- Пойзон: заказать заранее то, что загорится --- */

/** Ставка урока: зимняя шапка накануне холодов. Дёшево, легко, с понятной историей. */
export const TUT_POIZON = { m: model('Норс', 'шапка'), days: 4, length: 16 };

/**
 * Тимур скидывает скрин из своего PRO-радара — и волна правда придёт:
 * через четыре дня шапка станет главным хайпом недели. Посылка едет
 * 8–14 дней, так что приедет как раз в разгар.
 */
function poizonTip(S) {
  if (ids(S).pzTipAt !== undefined) return;
  ids(S).pzTipAt = S.t;
  const mi = TUT_POIZON.m;
  const m = MODELS[mi];
  const start = S.t + TUT_POIZON.days * 24;
  // Своя волна вместо случайной: «мёртвая» модель в прогнозе Тимура — обман.
  S.events = S.events.filter((e) => !(e.m === mi && !e.announced));
  // Волна урока занимает место случайного события: событий в мире не прибавляется.
  S.nextEventAt = Math.max(S.nextEventAt || 0, start);
  S.events.push({
    type: 'wave',
    m: mi,
    start,
    end: start + TUT_POIZON.length * 24,
    title: `${m.b} ${m.n} — главный хайп недели`,
    text: 'Ударили холода, а у рэпера в новом клипе — именно эта шапка. Ликвидность улетает под сотню. Пойзон ещё не подтянул цены.',
  });
  const th = mentorThread(S);
  if (!th) return;
  const text = `📸 Скрин из моего PRO:
🔮 ${m.b} ${m.n} — сейчас ${Math.round(S.market.h[mi] * 100)}% → ~97% 📈

Холода плюс один рэпер в новом клипе. А Пойзон пока продаёт по старой цене.`;
  say(S, th, 'them', text);
  notify(S, { route: 'tg/thread/' + th.id, title: 'Тимур', text: 'Скрин из PRO-радара', scope: 'client', tut: true });
  touch(S);
}

/** На шаге заказа Пойзон открыт — но только для ставки урока. */
export function poizonAllowed(S, mi) {
  const st = currentStep(S);
  if (!st) return false;
  if (st.id === 'poizon_find' || st.id === 'poizon_order') return mi === TUT_POIZON.m;
  if (st.id === 'rare_buy') return mi === TUT_RARE.m;
  return false;
}

/* --- Пойзон: любой размер — под заказ подписчика --- */

/** Сорок шестой Вансов: на Авитке и в секонде такого не бывает, на Пойзоне — есть. */
export const TUT_RARE = { m: model('Вансы', 'Олд Скул'), size: '46', days: 16 };

const rareThread = (S) => S.threads.find((x) => x.id === ids(S).rareThread) || null;

/** Пишет подписчик Стас: редкий размер, длинный срок, предоплата. */
function spawnRareOrder(S) {
  if (ids(S).rareThread) return;
  const rng = rngOf(S);
  const { m, size } = TUT_RARE;
  // Чтобы урок был честным: сорок шестых Вансов нет ни на Авитке, ни в «Мешке».
  S.listings = S.listings.filter((l) => !(l.item.m === m && l.item.size === size));
  S.second.items = S.second.items.filter((x) => !(x.item.m === m && x.item.size === size));
  const client = makeClient(S, rng);
  client.name = 'Стас';
  client.shoeSize = size;
  S.clients.push(client);
  const base = valueOrig(S, { m, cond: 0, size, boughtAt: S.t });
  const order = {
    clientId: client.id,
    m,
    size,
    maxCond: 0,
    budget: priceRound(base * 1.3),
    deadline: S.t + TUT_RARE.days * 24,
    createdAt: S.t,
  };
  const th = newThread(S, {
    kind: 'order',
    name: client.name,
    sub: 'заказ: ' + MODELS[m].b + ' ' + MODELS[m].n + ', ' + size,
    platform: 'tg',
    data: { order, clientId: client.id },
  });
  say(
    S,
    th,
    'them',
    `Привет! Ищу ${MODELS[m].b} ${MODELS[m].n}, ${size}-й — нога большая, нигде нет. Новые, только оригинал. Не горит: до ${dateLabel(order.deadline)}. Даю ${rub(order.budget)}, предоплату скину сразу.`,
  );
  notify(S, { route: 'tg/thread/' + th.id, title: 'Заказ от подписчика', text: `${MODELS[m].b} ${MODELS[m].n} ${size} · ${rub(order.budget)}`, scope: 'client', tut: true });
  ids(S).rareThread = th.id;
  touch(S);
}

const rareOrdered = (S) =>
  S.shipments.some((sh) => sh.tut === 'rare') || S.items.some((it) => it.m === TUT_RARE.m && it.size === TUT_RARE.size && it.src === 'Пойзон');

/** Вансы для Стаса приехали: отдать заказ — в переписке. */
export function rareArrived(S) {
  const th = rareThread(S);
  if (!th || th.closed) return;
  mentorSay(S, `Вансы для ${th.name}а приехали. Отдавай в переписке — он доплатит остаток. Вот это и есть «любой размер»: ни на Авитке, ни в секонде такого не было.`);
}

const pzOrdered = (S) =>
  S.shipments.some((sh) => sh.tut === 'poizon') || S.items.some((it) => it.tutPoizon);

/** Посылка урока приехала — хайп в разгаре. Тимур показывает цифры. */
export function poizonArrived(S, sh) {
  const it = sh.items[0];
  if (!it) return;
  for (const x of sh.items) x.tutPoizon = true;
  const m = MODELS[it.m];
  const now = Math.round(S.market.h[it.m] * 100);
  const value = valueOrig(S, it);
  const pz = poizonPrice(S, it.m, it.size);
  const was = sh.pzPrice || pz;
  const pzLine =
    pz > was * 1.04
      ? `На Пойзоне она была по ${rub(was)}, а теперь ${rub(pz)} — подтянулся, но поздно.`
      : `А на Пойзоне всё ещё ${rub(pz)}: он видит хайп с опозданием в пару недель.`;
  mentorSay(
    S,
    `Шапки приехали? 🔥 ${m.b} ${m.n} сейчас ${now}% ликвидности, на Авитке такие уходят по ~${rub(value)}, а тебе одна обошлась в ${rub(it.cost)} с доставкой. ` +
      pzLine +
      ' Вот так работает прогноз. Выставляй по «Рынку», пока горит.',
  );
}

const POIZON_STEPS = [
  { id: 'poizon_call', ch: 'pcall', kind: 'call', lines: CALLS.poizon },
  ...installSteps('poizon', 'poizon', 'pstore', {
    first: 'Открывай Апстор.',
    open: 'Открывай Пойзон.',
    opened: (S) => at(S, 'poizon'),
  }),
  {
    id: 'poizon_eta',
    ch: 'pshop',
    kind: 'talk',
    text: 'Тут всё — оригинал, любой размер. Но у каждой вещи написан срок: неделя-две. Всё это время деньги лежат в пути.',
  },
  {
    id: 'poizon_tip',
    ch: 'pbet',
    kind: 'talk',
    enter: (S) => poizonTip(S),
    text: (S) => {
      const m = MODELS[TUT_POIZON.m];
      return `Скинул тебе в Телегу скрин из моего PRO-радара: ${m.b} ${m.n}. Сейчас ликвидность ${Math.round(S.market.h[TUT_POIZON.m] * 100)}%, а через неделю будут рвать. Цена тут пока старая — это и есть окно.`;
    },
  },
  {
    id: 'poizon_find',
    milestone: true,
    ch: 'pbet',
    kind: 'goal',
    text: 'Найди шапку Норс: в поиске набери «Норс» или выбери «Головные уборы».',
    done: (S) => (at(S, 'poizon') && S.ui.view === 'item' && +S.ui.id === TUT_POIZON.m) || pzOrdered(S),
    auto: (S) => go(S, 'poizon', 'item', TUT_POIZON.m),
  },
  {
    id: 'poizon_order',
    milestone: true,
    ch: 'pbet',
    kind: 'goal',
    text: 'Смотри: «Ликвидность» и «Пойзон видит» — цена тут живёт по второй. Закажи две, если хватает, одну — если нет. Не хватит и на одну — займу.',
    done: (S) => pzOrdered(S),
    auto: (S) => {
      const mi = TUT_POIZON.m;
      const size = sizesFor(MODELS[mi].cat)[0];
      const two = (poizonPrice(S, mi, size) + poizonShip(S, mi, 2)) * 2;
      buyPoizon(S, mi, size, S.money >= two ? 2 : 1);
    },
  },
  {
    id: 'rare_intro',
    ch: 'prare',
    kind: 'talk',
    enter: (S) => spawnRareOrder(S),
    text: 'О, тебе подписчик пишет — Стас. Вансы сорок шестого: на Авитке такого днём с огнём, а на Пойзоне есть любой размер. И срок у него длинный — посылка успеет.',
  },
  {
    id: 'rare_open',
    ch: 'prare',
    kind: 'goal',
    text: 'Открой переписку со Стасом в Телеге.',
    done: (S) => (!!rareThread(S) && at(S, 'tg', 'thread', ids(S).rareThread)) || !!(rareThread(S) && rareThread(S).data.order.accepted),
    auto: (S) => go(S, 'tg', 'thread', ids(S).rareThread),
  },
  {
    id: 'rare_accept',
    ch: 'prare',
    kind: 'goal',
    text: 'Сроки сходятся: Пойзон везёт до двух недель, а Стас ждёт шестнадцать дней. Бери заказ — предоплата сразу придёт на карту.',
    done: (S) => !!(rareThread(S) && rareThread(S).data.order.accepted),
    auto: (S) => acceptOrder(S, rareThread(S)),
  },
  {
    id: 'rare_buy',
    milestone: true,
    ch: 'prare',
    kind: 'goal',
    text: 'Теперь на Пойзон: Вансы Олд Скул, размер 46, одна пара. Предоплаты почти хватает — остальное своими.',
    done: (S) => rareOrdered(S),
    auto: (S) => buyPoizon(S, TUT_RARE.m, TUT_RARE.size, 1),
  },
  {
    id: 'poizon_wait',
    ch: 'pbet',
    kind: 'talk',
    text: 'Всё, обе посылки едут: шапка — под хайп, Вансы — под заказ Стаса. Видно в «Посылках». Шапки загорятся через четыре дня, а приедут — напишу.',
  },
  {
    id: 'poizon_end',
    ch: 'pbet',
    kind: 'talk',
    end: true,
    text: 'Запомни расчёт: Пойзон берут либо заранее, под хайп, либо под заказ с длинным сроком — когда клиенту нужен размер, которого больше нигде нет. Всё, теперь ты знаешь всё, что знаю я. Дальше — сам. Я на связи 🤝',
  },
];

/* ======================= ГЛАВЫ ======================= */

export const PARTS = [
  { id: 'avito', n: 'Авитка', app: 'avito' },
  { id: 'tg', n: 'Телега', app: 'tg' },
  { id: 'second', n: 'Секонд', app: 'second' },
  { id: 'poizon', n: 'Пойзон', app: 'poizon' },
];

/** Разделы глав — полоска прогресса в пузыре Тимура. */
export const CHAPTERS = [
  { id: 'call', n: 'Звонок', part: 'avito' },
  { id: 'bank', n: 'Банк', part: 'avito' },
  { id: 'store', n: 'Апстор', part: 'avito' },
  { id: 'search', n: 'Поиск', part: 'avito' },
  { id: 'check', n: 'Проверка', part: 'avito' },
  { id: 'deal', n: 'Сделка', part: 'avito' },
  { id: 'sell', n: 'Продажа', part: 'avito' },
  { id: 'ship', n: 'Доставка', part: 'avito' },
  { id: 'self', n: 'Сам', part: 'avito' },
  { id: 'swap', n: 'Подмена', part: 'avito' },
  { id: 'tcall', n: 'Звонок', part: 'tg' },
  { id: 'tstore', n: 'Апстор', part: 'tg' },
  { id: 'tchannel', n: 'Свой канал', part: 'tg' },
  { id: 'tpost', n: 'Витрина', part: 'tg' },
  { id: 'tsubs', n: 'Подписчики', part: 'tg' },
  { id: 'tsale', n: 'Продажа', part: 'tg' },
  { id: 'tradar', n: 'Хайп-радар', part: 'tg' },
  { id: 'torder', n: 'Заказ', part: 'tg' },
  { id: 'scall', n: 'Звонок', part: 'second' },
  { id: 'sstore', n: 'Апстор', part: 'second' },
  { id: 'sshop', n: 'Секонд', part: 'second' },
  { id: 'pcall', n: 'Звонок', part: 'poizon' },
  { id: 'pstore', n: 'Апстор', part: 'poizon' },
  { id: 'pshop', n: 'Пойзон', part: 'poizon' },
  { id: 'pbet', n: 'Ставка', part: 'poizon' },
  { id: 'prare', n: 'Редкий размер', part: 'poizon' },
];
const CHAPTER_PART = Object.fromEntries(CHAPTERS.map((c) => [c.id, c.part]));

export const STEPS = [...AVITO_STEPS, ...TG_STEPS, ...SECOND_STEPS, ...POIZON_STEPS];
for (const s of STEPS) s.part = CHAPTER_PART[s.ch];

export const STEP_INDEX = Object.fromEntries(STEPS.map((s, i) => [s.id, i]));
const firstStepOf = (part) => STEPS.findIndex((s) => s.part === part);

/**
 * Сейв со старой раскладкой шагов. «Авитка» и «Телега» не менялись — там
 * игрок продолжает с того же места. Внутри «Секонда» и «Пойзона» номер шага
 * больше ничего не значит: глава начинается заново, со звонка Тимура.
 */
export function migrateTutorial(S) {
  const T = S.tut;
  if (!T || !T.stale) return;
  delete T.stale;
  if (T.done || !T.active) return;
  if (T.part === 'second' || T.part === 'poizon') T.step = firstStepOf(T.part);
}

export function currentStep(S) {
  return tutorialActive(S) ? STEPS[S.tut.step] || null : null;
}

export function stepText(S, step) {
  if (!step || !step.text) return '';
  return typeof step.text === 'function' ? step.text(S) : step.text;
}

/** Раздел шага внутри его главы — для полоски прогресса. */
export function chapterOf(step) {
  const list = CHAPTERS.filter((c) => c.part === step.part);
  const i = list.findIndex((c) => c.id === step.ch);
  const part = PARTS.find((p) => p.id === step.part);
  return { i, n: list.length, name: list[i] ? list[i].n : '', part: part ? part.n : '' };
}

/* ======================= ДВИЖЕНИЕ ПО ШАГАМ ======================= */

/** Цель «сам» проверяется так же, как do-шаг: по состоянию игры. */
const checked = (step) => step.kind === 'do' || step.kind === 'wait' || step.kind === 'goal';

function advance(S) {
  const step = STEPS[S.tut.step];
  if (step && step.leave) step.leave(S);
  if (!tutorialActive(S)) return;
  if (step && step.end) {
    endPart(S);
    return;
  }
  S.tut.step++;
  // Ветки: шаги, которые к этому прохождению не относятся, пропускаем
  // (купил ориг — спор не нужен; купил паль — «клиент доволен» не нужен).
  while (STEPS[S.tut.step] && STEPS[S.tut.step].skip && STEPS[S.tut.step].skip(S)) S.tut.step++;
  const next = STEPS[S.tut.step];
  if (next && next.enter) next.enter(S);
  touch(S);
}

/** Закрыть talk/tap/call-шаг: игрок нажал «Дальше» или подсвеченную кнопку. */
export function tutorialNext(S) {
  if (!tutorialActive(S)) return false;
  const step = STEPS[S.tut.step];
  if (!step) return false;
  if (step.kind === 'call' && step.start) step.start(S);
  advance(S);
  tutorialSync(S);
  return true;
}

/**
 * Проверить do- и wait-шаги после любого действия игрока. Проходит сразу
 * несколько шагов, если игрок сделал больше, чем просили.
 */
export function tutorialSync(S) {
  syncApps(S);
  let moved = false;
  let guard = 0;
  while (tutorialActive(S) && guard++ < STEPS.length * 2) {
    const step = STEPS[S.tut.step];
    if (!step) break;
    if (checked(step) && step.done(S)) {
      advance(S);
      moved = true;
      continue;
    }
    // Экран свободный: игрок мог сам уйти вперёд — купить, выставить,
    // продать раньше, чем дошли объяснения. Тогда догоняем его до самой
    // дальней пройденной вехи (по пути отрабатывают все leave/enter).
    const ahead = furthestMilestone(S);
    if (ahead > S.tut.step) {
      while (tutorialActive(S) && S.tut.step < ahead) advance(S);
      moved = true;
      continue;
    }
    break;
  }
  return moved;
}

/** Самая дальняя пройденная веха — только внутри текущей главы. */
function furthestMilestone(S) {
  const part = STEPS[S.tut.step].part;
  let best = -1;
  for (let i = S.tut.step + 1; i < STEPS.length && STEPS[i].part === part; i++) {
    const s = STEPS[i];
    if (s.milestone && !(s.skip && s.skip(S)) && s.done(S)) best = i;
  }
  return best;
}

/**
 * Экран свободный, и игрок мог потратить деньги заказа на что-то по пути
 * (чек на встрече, лишний чек по фото). Сценарий не должен встать из-за
 * этого: на учебную покупку Тимур докидывает недостающее.
 */
export function tutorialTopUp(S, need, loan) {
  if (!tutorialActive(S) || S.money >= need) return;
  const add = Math.ceil((need - S.money) / 100) * 100;
  if (loan) {
    // Находка в секонде — уже не учебные деньги, а настоящая сделка:
    // Тимур выручает, но в долг, и заберёт с продажи.
    S.mentorDebt = (S.mentorDebt || 0) + add;
    earn(S, add, 'Тимур одолжил');
    notify(S, { route: 'bank', title: 'Тимур одолжил', text: `+${rub(add)} · «с продажи вернёшь»`, tut: true });
    return;
  }
  earn(S, add, 'Тимур докинул');
  notify(S, { route: 'bank', title: 'Тимур докинул', text: `+${rub(add)} · «не хватало — держи»`, tut: true });
}

/** Долг Тимуру уходит сам, как только на карте есть с запасом на еду. */
export function repayMentor(S) {
  const debt = S.mentorDebt || 0;
  if (debt <= 0 || S.money < debt + MENTOR_CUSHION) return;
  pay(S, debt, 'Вернул Тимуру');
  S.mentorDebt = 0;
  notify(S, { route: 'bank', title: 'Тимур', text: `Вернул ${rub(debt)} · «красавчик, с тобой можно дела вести 🤝»` });
}
const MENTOR_CUSHION = 1500;

/** Свой канал заводим в своей главе, а не когда игрок наткнулся на кнопку. */
export function channelAllowed(S) {
  if (!installed(S, 'tg')) return false;
  return !tutorialActive(S) || S.tut.part !== 'tg' || S.tut.step >= STEP_INDEX.tg_channels;
}

/**
 * Учебные поблажки снимаются, как только глава кончилась: продавцы из
 * обучения снова обижаются на наглый торг, покупатель снова может не
 * дождаться, учебные метки стираются.
 */
function dropLeniency(S) {
  for (const l of S.listings) {
    if (!l.tutorial) continue;
    l.seller.patience = Math.min(l.seller.patience, 9);
    l.noBuy = false;
    l.buyFrom = null;
    delete l.item.tut;
  }
  for (const it of S.items) delete it.tut;
  for (const sh of S.shipments) for (const it of sh.items) delete it.tut;
  for (const th of S.threads) {
    const b = th.data && th.data.buyer;
    if (!b || !b.tut) continue;
    delete b.tut;
    b.patience = Math.min(b.patience, 9);
    b.expiresAt = Math.min(b.expiresAt, S.t + 48);
  }
  // Подсказки, которые действия обучения поставили в очередь, Тимур уже
  // сказал голосом — второй раз текстом они не нужны.
  S.mentorQueue = [];
}

/** Глава кончилась: мир оживает, следующая ждёт своего звонка. */
function endPart(S) {
  const part = STEPS[S.tut.step].part;
  dropLeniency(S);
  S.tut.ended[part] = S.t;
  S.tut.mark[part] = { sold: S.stats.sold, secondBuys: S.stats.secondBuys };
  S.tut.active = false;
  S.flags.started = 1;
  // Фильтры поиска, выставленные под урок, сбрасываем: иначе после главы
  // игрок открывает Авитку и видит «0 объявлений» по чужому запросу.
  if (S.ui && S.ui.filters) Object.assign(S.ui.filters, { cat: 'all', model: 'all', size: 'all', mode: 'all', sort: 'new', q: '', onlyDeals: false });
  if (S.ui && S.ui.poizon) Object.assign(S.ui.poizon, { q: '', cat: 'all', tier: 'all' });
  const i = PARTS.findIndex((p) => p.id === part);
  const next = PARTS[i + 1];
  if (next) {
    S.tut.part = next.id;
    S.tut.step = firstStepOf(next.id);
  } else {
    S.tut.part = null;
    S.tut.done = true;
    S.tut.finishedAt = S.t;
  }
  touch(S);
}

/**
 * Всё обучение разом: новый сезон и старые сейвы. Все главы считаются
 * пройденными, все приложения — скачанными.
 */
export function finishTutorial(S) {
  if (!S.tut) return;
  dropLeniency(S);
  for (const p of PARTS) if (S.tut.ended[p.id] === undefined) S.tut.ended[p.id] = S.t;
  S.tut.active = false;
  S.tut.done = true;
  S.tut.part = null;
  S.tut.finishedAt = S.t;
  for (const id of ALL_APPS) if (S.apps && !S.apps[id]) S.apps[id] = { at: S.t };
  S.flags.started = 1;
  touch(S);
}

/* ======================= КОГДА ЗВОНИТЬ ======================= */
// Глава приходит не по таймеру, а «не раньше и когда готов»: Телега — на
// следующее утро после Авитки; секонд — в 9:00 дня завоза, за час до
// открытия (глава — гонка к полке с Мироном), когда игрок продал
// хоть что-то сам (не продал — всё равно позвонит через завоз); Пойзон —
// на следующий день после секонда, днём (покупка в секонде была в самой главе).

const isDeliveryDay = (t) => [1, 4].includes(weekdayAt(t));

function partReady(S, part) {
  const h = hourIndex(S.t);
  const day = dayIndex(S.t);
  const E = S.tut.ended;
  const M = S.tut.mark;
  if (part === 'tg') return E.avito !== undefined && day > dayIndex(E.avito) && h >= 9 && h < 21;
  if (part === 'second') {
    // Только в девять: глава — гонка к открытию в десять.
    if (E.tg === undefined || !isDeliveryDay(S.t) || h !== 9) return false;
    const since = day - dayIndex(E.tg);
    return since >= 1 && (S.stats.sold > M.tg.sold || since >= 4);
  }
  if (part === 'poizon') {
    if (E.second === undefined || h < 11 || h >= 20) return false;
    // Покупка в секонде уже была в самой главе — назавтра, днём.
    return day - dayIndex(E.second) >= 1;
  }
  return false;
}

/** Пора ли Тимуру звонить со следующей главой. Зовётся каждый игровой час. */
export function tutorialSchedule(S) {
  const T = S.tut;
  if (!T || T.v !== 2 || T.active || T.done || !T.part || T.part === 'avito') return false;
  if (S.flags.seasonEnd || S.flags.bankrupt) return false;
  if (!partReady(S, T.part)) return false;
  T.active = true;
  T.calledAt = S.t;
  touch(S);
  return true;
}

/** Подсказка на главный экран: когда и про что позвонит Тимур. */
const WEEKDAY_IN = ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"];

/** «Сегодня», «завтра» или «в четверг» — когда наступит день `target`. */
function whenDay(S, target) {
  const d = target - dayIndex(S.t);
  if (d <= 0) return 'Сегодня';
  if (d === 1) return 'Завтра';
  const w = WEEKDAY_IN[weekdayAt(target * 24)];
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Подсказка на главном экране: когда и про что позвонит Тимур. Точная — с днём. */
export function upcomingCall(S) {
  const T = S.tut;
  if (!T || T.active || T.done || !T.part || T.part === 'avito') return null;
  const E = T.ended;
  const day = dayIndex(S.t);
  if (T.part === 'tg') {
    const target = Math.max(day, dayIndex(E.avito) + 1);
    return { text: `${whenDay(S, target)} в 9:00 позвонит Тимур — про Телегу` };
  }
  if (T.part === 'second') {
    const sold = S.stats.sold - T.mark.tg.sold;
    if (sold < 1 && day - dayIndex(E.tg) < 4) return { text: 'Продай вещь сам — и Тимур расскажет про секонд', progress: '0/1' };
    // Ближайший день завоза (пн/чт), не раньше следующего дня после «Телеги»;
    // сегодняшний — только если девять ещё не пробило.
    let target = Math.max(day, dayIndex(E.tg) + 1);
    if (target === day && hourIndex(S.t) >= 9) target++;
    while (![1, 4].includes(weekdayAt(target * 24))) target++;
    return { text: `${whenDay(S, target)} в 9:00 позвонит Тимур — про секонд` };
  }
  if (T.part === 'poizon') {
    const ready = Math.max(day, dayIndex(E.second) + 1);
    return { text: `${whenDay(S, ready)} днём позвонит Тимур — про Пойзон` };
  }
  return null;
}

/* ======================= БЕЗ ЭКРАНА ======================= */

/**
 * Пройти текущую главу без экрана — ровно теми же действиями, что и игрок.
 * Нужно кнопке «пропустить», ботам и тесту. Возвращает true, если глава
 * дошла до конца.
 */
export function runTutorialHeadless(S) {
  let guard = 0;
  while (tutorialActive(S) && guard++ < STEPS.length * 3) {
    const step = STEPS[S.tut.step];
    if (step.kind === 'call' || step.kind === 'talk' || step.kind === 'tap') {
      tutorialNext(S);
      continue;
    }
    if (!step.done(S) && step.auto) step.auto(S);
    if (!tutorialSync(S)) {
      // Шаг не закрылся своим действием — сценарий сломан. Не зависаем.
      return false;
    }
  }
  return !tutorialActive(S);
}

/**
 * Боты, прогоны баланса и тесты (`tut.auto`): глава, до которой дошло
 * время, проходится сразу, теми же действиями. Зовётся из хода времени —
 * снаружи часового такта, поэтому вложенных тактов не бывает.
 */
let autoplaying = false;
export function tutorialAutoplay(S) {
  if (autoplaying || !S.tut || !S.tut.auto || !tutorialActive(S)) return;
  autoplaying = true;
  try {
    runTutorialHeadless(S);
  } finally {
    autoplaying = false;
  }
}
