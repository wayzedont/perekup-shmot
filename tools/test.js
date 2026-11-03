// Дымовой тест ядра: игра должна создаваться и крутиться без интерфейса.
// Запуск: npm test

import { createGame, restoreCounters, loadGame, saveGame } from '../src/core/engine.js';
import { advanceHours, hourTick, sleep as sleepNight } from '../src/core/tick.js';
import { dayIndex, hourIndex, weekdayAt, dateLabel, isSecondOpen as isSecondOpenAt } from '../src/core/time.js';
import { fillDefaults } from '../src/core/state.js';
import { ALL_APPS } from '../src/core/data/apps.js';
import { NEWS, NEWS_VERSION } from '../src/core/data/news.js';
import { netWorth, capacity, usedSlots } from '../src/core/economy.js';
import { MODELS } from '../src/core/data/models.js';
import { CATS } from '../src/core/data/catalog.js';
import { rub, num } from '../src/core/util.js';
import { makeItem } from '../src/core/items.js';
import { legitVerdict } from '../src/core/inspect.js';
import { rngOf, newThread, installed, notify } from '../src/core/kernel.js';
import { makeBuyer } from '../src/core/people/buyers.js';
import { listItem, completeSale, canShowProof, showProof } from '../src/core/actions/selling.js';
import { REVIEWS } from '../src/core/data/content.js';
import { estimateFor } from '../src/core/actions/items.js';
import { valueOrig as valueOrigOf } from '../src/core/economy.js';
import { DAILY, updateDaily } from '../src/core/daily.js';
import { buyUpgrade, reserveSlot, startNewSeason as startNewSeasonOf } from '../src/core/actions/finance.js';
import { UPGRADES, upgraded as upgradedOf } from '../src/core/data/apps.js';
import { poizonEta, poizonShip } from '../src/core/economy.js';
import { priceNow as secondPriceNow } from '../src/core/market/second.js';
import { acceptOrder, fulfillOrder } from '../src/core/actions/social.js';
import { checkGoals as checkGoalsOf } from '../src/core/progression.js';
import { chronicle as chronicleOf, seasonCarry as seasonCarryOf } from '../src/core/season.js';
import { collectionOf as collectionOfModel } from '../src/core/collections.js';
import { upcomingCall as upcomingCallOf } from '../src/core/tutorial.js';
import { STEPS, STEP_INDEX, runTutorialHeadless, TUT_TREND, TUT_TASK3, TUT_TASK4, TUT_SECOND, TUT_POIZON, TUT_RARE, tutorialNext, tutorialSync } from '../src/core/tutorial.js';
import { generateListing } from '../src/core/market/avito.js';
import {
  askSeller,
  photoLegit,
  photoInspect,
  handLegit,
  buyPoizon,
  confirmDelivery,
  startMeeting,
  buyAtMeeting,
  accuseFake,
  offerToSeller,
  useLever,
  buySecond,
  secondInspect,
  waitSecondOpen,
} from '../src/core/actions/buying.js';
import { unlist, declineBuyer, counterToBuyer } from '../src/core/actions/selling.js';
import { pawn, legitCheck } from '../src/core/actions/items.js';
import { createChannel } from '../src/core/actions/social.js';
import { legitCost, photoLegitCost } from '../src/core/economy.js';

let failures = 0;
let checks = 0;

function check(name, cond, extra) {
  checks++;
  if (cond) return;
  failures++;
  console.error('  ✗ ' + name + (extra ? ' — ' + extra : ''));
}

function section(name) {
  console.log('\n' + name);
}

/** Подделка localStorage, чтобы проверять загрузку сейва без браузера. */
function fakeStorage(raw) {
  return { getItem: () => raw, setItem: () => {}, removeItem: () => {} };
}

/* ---------- данные ---------- */
section('Каталог');
check('есть модели', MODELS.length >= 60, MODELS.length + ' шт');
for (const m of MODELS) {
  check('категория ' + m.full, !!CATS[m.cat], m.cat);
  check('расцветки ' + m.full, m.ways && m.ways.length > 0);
  check('цена ' + m.full, m.rt > 0);
  check('ликвидность ' + m.full, m.hype >= 0 && m.hype <= 1);
  for (const t of m.tells) {
    check('признак применим ' + m.full, CATS[m.cat].tells.includes(t), t);
  }
}
console.log(`  моделей: ${MODELS.length}, брендов: ${new Set(MODELS.map((m) => m.b)).size}`);

/* ---------- создание игры ---------- */
section('Создание игры');
const S = createGame(12345);
check('своих денег на старте нет', S.money === 0, rub(S.money));
check('обучение ждёт звонка', S.tut.active && STEPS[S.tut.step].id === 'call');
check('три вещи в шкафу', S.items.length === 3, S.items.length + '');
check('объявления есть', S.listings.length > 20, S.listings.length + '');
check('секонд не пустой', S.second.items.length > 5, S.second.items.length + '');
check('наставник на месте', S.threads.some((t) => t.kind === 'mentor'));
check('раффл создан', !!S.raffle);
check('капитал положительный', netWorth(S) > 0, rub(netWorth(S)));
check('вместимость', capacity(S) === 15, capacity(S) + '');
check('занято мест', usedSlots(S) === 3, usedSlots(S) + '');
const fresh = createGame(12345, { tutorial: 'none' });
check('новый сезон без обучения', !fresh.tut.active && fresh.money === 5000, rub(fresh.money));

/* ---------- обучение ---------- */
// Обучение идёт главами по дням. Каждая глава проходится до конца теми же
// действиями, что и у игрока, на любом сиде: случайность в ней не должна
// ничего ломать. Между главами игрок просто живёт, пока не позвонит Тимур.

/** Один шаг главы — как его делает игрок, без экрана. */
function stepOnce(T) {
  const st = STEPS[T.tut.step];
  if (st.kind === 'call' || st.kind === 'talk' || st.kind === 'tap') tutorialNext(T);
  else {
    if (!st.done(T) && st.auto) st.auto(T);
    tutorialSync(T);
  }
}

/** Прожить время до следующего звонка Тимура: днём ждать, ночью спать. */
function untilCall(T) {
  let guard = 0;
  while (!T.tut.active && !T.tut.done && guard++ < 24 * 14) {
    if (hourIndex(T.t) >= 23 || hourIndex(T.t) < 8) sleepNight(T);
    else advanceHours(T, 1);
  }
  return T.tut.active;
}

/** Все оставшиеся главы подряд. */
function playChapters(T) {
  let guard = 0;
  while (!T.tut.done && guard++ < 20) {
    if (!T.tut.active && !untilCall(T)) return false;
    if (!runTutorialHeadless(T)) return false;
  }
  return T.tut.done;
}

/** Дойти до шага — через главы и дни, как игрок. */
function reachStep(T, stop) {
  let guard = 0;
  while (!T.tut.done && guard++ < 1000) {
    if (!T.tut.active) {
      if (!untilCall(T)) return false;
      continue;
    }
    if (T.tut.step >= stop) return true;
    stepOnce(T);
  }
  return false;
}

/** После главы — обычная игра: ни вечно терпеливых продавцов, ни учебных меток. */
function leftovers(T) {
  return [
    ...T.items.filter((i) => i.tut).map(() => 'вещь'),
    ...T.shipments.flatMap((s) => s.items).filter((i) => i.tut).map(() => 'посылка'),
    ...T.listings.filter((l) => l.tutorial && (l.seller.patience > 9 || l.noBuy || l.item.tut)).map(() => 'объявление'),
    ...T.threads.filter((th) => th.data && th.data.buyer && th.data.buyer.tut).map(() => 'покупатель'),
  ];
}

const STORE_APP_IDS = ['avito', 'tg', 'second', 'poizon'];

section('Обучение');
for (const seed of [1, 7, 42, 777, 2024, 9001, 31337]) {
  const T = createGame(seed);
  const tag = ' · сид ' + seed;
  check('на телефоне только системные приложения' + tag, installed(T, 'store') && installed(T, 'bank') && !STORE_APP_IDS.some((a) => installed(T, a)));

  // Глава «Авитка»: понедельник.
  const ok = runTutorialHeadless(T);
  check('глава «Авитка» проходится до конца' + tag, ok && T.tut.part === 'tg' && !T.tut.active, 'встала на ' + STEPS[T.tut.step].id);
  if (!ok) continue;
  const deal = T.deals.find((d) => d.label === 'Кархарт худи');
  check('учебная продажа в плюс' + tag, deal && deal.profit > 0, deal ? rub(deal.profit) : 'нет сделки');
  check('деньги за неё пришли сразу' + tag, !T.pending.some((e) => e.type === 'payout'));
  check('после главы есть на еду' + tag, T.money >= 1200, rub(T.money));
  check('Самбы приехали и проверены в руках' + tag, T.items.some((i) => i.m === TUT_TREND.m && i.legitDone && i.verdict === 'orig'));
  check('заказ Нюб отдан клиенту' + tag, !T.items.some((i) => i.m === TUT_TASK3.m) && !T.shipments.length);
  check('подменённое худи вернули через спор' + tag, T.stats.disputesWon >= 1 && !T.items.some((i) => i.m === TUT_TASK4.m));
  check('Авитка скачана, Телеги ещё нет' + tag, installed(T, 'avito') && !installed(T, 'tg') && !installed(T, 'second') && !installed(T, 'poizon'));
  check('все учебные покупки — ориг' + tag, T.items.every((i) => i.src !== 'Авитка, с рук' || i.real));
  check('мир снова живой' + tag, !T.tut.active && T.mentorQueue.length === 0);
  check('учебные поблажки сняты после «Авитки»' + tag, !leftovers(T).length, leftovers(T).join(', '));

  // Глава «Телега»: на следующее утро.
  const endedDay = dayIndex(T.tut.ended.avito);
  untilCall(T);
  check('Тимур звонит про Телегу на следующее утро' + tag, T.tut.active && T.tut.part === 'tg' && dayIndex(T.t) === endedDay + 1 && hourIndex(T.t) === 9, `${dateLabel(T.t)}, ${hourIndex(T.t)}:00`);
  const okTg = runTutorialHeadless(T);
  check('глава «Телега» проходится до конца' + tag, okTg && T.tut.part === 'second', 'встала на ' + STEPS[T.tut.step].id);
  if (!okTg) continue;
  check('канал заведён, Телега скачана' + tag, T.tg.has && installed(T, 'tg'));
  check('продажа в канале — деньги сразу' + tag, T.deals.some((d) => d.platform === 'tg'));
  const orderDeal = T.deals.find((d) => d.isOrder);
  check('первый заказ подписчика выполнен в плюс' + tag, !!(orderDeal && orderDeal.profit > 0), orderDeal ? rub(orderDeal.profit) : 'нет сделки');
  check('заказчик стал постоянным клиентом' + tag, T.clients.some((c) => c.done >= 1));
  check('учебные поблажки сняты после «Телеги»' + tag, !leftovers(T).length, leftovers(T).join(', '));

  // Глава «Секонд»: звонок в день завоза в девять — успеть к открытию.
  untilCall(T);
  check('про секонд Тимур звонит в 9:00 дня завоза' + tag, T.tut.part === 'second' && hourIndex(T.t) === 9 && [1, 4].includes(weekdayAt(T.t)), `${dateLabel(T.t)}, ${hourIndex(T.t)}:00`);
  const okSecond = runTutorialHeadless(T);
  check('глава «Секонд» проходится до конца' + tag, okSecond && T.tut.part === 'poizon', 'встала на ' + STEPS[T.tut.step].id);
  const find = T.items.find((i) => i.id === T.tut.ids.sec6RealItem);
  check('в секонде взят ориг и выставлен как ориг' + tag, !!(find && find.sale && find.sale.asOrig) || T.deals.some((d) => d.label === 'Теч Флис'), find ? JSON.stringify(find.sale) : 'нет вещи');
  check('Мирон пришёл к открытию и написал' + tag, T.threads.some((th) => th.kind === 'rival' && th.messages.length) && T.rival.raidDay === dayIndex(T.tut.ended.second));
  check('учебных вещей на полке не осталось' + tag, !T.second.items.some((x) => x.tut));

  // Глава «Пойзон»: ставка на то, что загорится через неделю.
  untilCall(T);
  const okPz = runTutorialHeadless(T);
  check('глава «Пойзон» проходится до конца' + tag, okPz && T.tut.done, 'встала на ' + STEPS[T.tut.step].id);
  const bet = T.shipments.find((sh) => sh.tut === 'poizon');
  check('ставка на Пойзоне заказана' + tag, !!bet && bet.items.every((it) => it.m === TUT_POIZON.m));
  const wave = T.events.find((e) => e.type === 'wave' && e.m === TUT_POIZON.m);
  check('волна придёт раньше посылки' + tag, !!wave && !!bet && wave.start < bet.eta && wave.end > bet.eta);
  check('Тимур скинул скрин из PRO' + tag, T.threads.some((th) => th.kind === 'mentor' && th.messages.some((m) => m.text.includes('PRO'))));
  {
    let g = 0;
    while (T.shipments.some((sh) => sh.tut === 'poizon') && g++ < 24 * 20) {
      if (hourIndex(T.t) >= 23 || hourIndex(T.t) < 8) sleepNight(T);
      else advanceHours(T, 1);
    }
    const hat = T.items.find((i) => i.tutPoizon);
    check('посылка приехала в разгар хайпа' + tag, !!hat && T.market.h[TUT_POIZON.m] >= 0.75, hat ? T.market.h[TUT_POIZON.m].toFixed(2) : 'нет');
    check('по приезде ставка в плюсе' + tag, !!hat && valueOrigOf(T, hat) > hat.cost, hat ? valueOrigOf(T, hat) + ' против ' + hat.cost : '');
    check('Тимур написал, что хайп пришёл' + tag, T.threads.some((th) => th.kind === 'mentor' && th.messages.some((m) => m.text.includes('приехали'))));
    // Заказ Стаса на редкий размер: принят, заказан на Пойзоне, приехал — отдаём.
    const rareTh = T.threads.find((th) => th.id === T.tut.ids.rareThread);
    check('заказ на редкий размер взят с предоплатой' + tag, !!rareTh && !!rareTh.data.order.accepted);
    let gr = 0;
    while (T.shipments.some((sh) => sh.tut === 'rare') && gr++ < 24 * 20) {
      if (hourIndex(T.t) >= 23 || hourIndex(T.t) < 8) sleepNight(T);
      else advanceHours(T, 1);
    }
    const vans = T.items.find((i) => i.m === TUT_RARE.m && i.size === TUT_RARE.size);
    check('Вансы 46-го приехали до срока заказа' + tag, !!vans && !!rareTh && T.t < rareTh.data.order.deadline && !rareTh.closed);
    const done = vans && rareTh ? fulfillOrder(T, rareTh, vans) : null;
    check('отданы Стасу с прибылью' + tag, !!done && T.deals.some((d) => d.isOrder && d.label.includes(MODELS[TUT_RARE.m].n) && d.profit > 0), JSON.stringify(done));
  }
  const rest = T.tut.done;
  check('секонд и Пойзон приходят звонками, обучение кончается' + tag, rest && T.tut.done && STORE_APP_IDS.every((a) => installed(T, a)));
  check('про секонд Тимур звонит в день завоза' + tag, [1, 4].includes(weekdayAt(T.tut.ended.second)), dateLabel(T.tut.ended.second));
  check('Пойзон — не раньше чем на следующий день после секонда' + tag, dayIndex(T.tut.ended.poizon) > dayIndex(T.tut.ended.second));
}

// «Пропустить» можно нажать на любом шаге любой главы: пропуск доигрывает
// главу с того места, где игрок остановился, и всё обучение доходит до конца.
{
  let broken = [];
  for (let stop = 1; stop < STEPS.length; stop += 3) {
    const T = createGame(500 + stop);
    if (!reachStep(T, stop) || !runTutorialHeadless(T) || !playChapters(T)) broken.push(STEPS[T.tut.step].id);
  }
  check('пропуск с любого шага доходит до конца', !broken.length, broken.join(', '));
}
// Экран свободный: по пути игрок может спустить деньги заказа на разрешённое
// (такси на встречу, лишний чек). Обучение не должно встать из-за денег —
// на учебные траты Тимур докидывает. Проверяем «на мели» с каждого шага.
{
  let broken = [];
  for (let stop = 1; stop < STEPS.length; stop += 2) {
    const T = createGame(700 + stop);
    if (!reachStep(T, stop)) {
      broken.push('не дошли до ' + STEPS[stop].id);
      continue;
    }
    T.money = 0;
    if (!runTutorialHeadless(T)) broken.push(STEPS[T.tut.step].id);
  }
  check('без денег на любом шаге глава доходит до конца', !broken.length, broken.join(', '));
}
// Вторая половина «Авитки» — игрок сам. Если на вещи 3 он выбрал паль,
// обучение не ломается, а учит возврату прямо на ней. И пока оно идёт,
// деньги клиента на постороннее не тратятся.
{
  const T = createGame(4321);
  reachStep(T, STEP_INDEX.task3_buy);
  check('дошли до заказа «сам»', STEPS[T.tut.step].id === 'task3_buy');
  const before = T.money;
  check('пока идёт обучение, Пойзон закрыт', buyPoizon(T, 5, 'M', 1) === null && T.money === before);
  const fake = T.listings.find((l) => l.id === T.tut.ids.fake3);
  askSeller(T, fake, 'photos');
  confirmDelivery(T, fake);
  tutorialSync(T);
  const ok = runTutorialHeadless(T);
  check('купил паль сам — обучение учит возврату и доходит до конца', ok && T.stats.disputesWon >= 2, `споров ${T.stats.disputesWon}`);
}
// Глава «Секонд»: в девять ждёшь у дверей и к открытию стоишь у полки.
// Взял паль — выставить её как ориг нельзя, только честно как реплику.
{
  const T = createGame(4400);
  reachStep(T, STEP_INDEX.second_door);
  check('дошли до дверей секонда', STEPS[T.tut.step].id === 'second_door' && hourIndex(T.t) === 9, STEPS[T.tut.step].id + ' ' + hourIndex(T.t));
  const w = waitSecondOpen(T);
  tutorialSync(T);
  check('ожидание у дверей — ровно к 10:00', !!w && hourIndex(T.t) === 10 && T.min === 0);
  stepOnce(T);
  check('на полке две обведённые вещи', STEPS[T.tut.step].id === 'second_find' && T.second.items.filter((x) => x.tut).length === 2);
  advanceHours(T, 4);
  check('пока идёт урок, учебные вещи никто не забирает', T.second.items.filter((x) => x.tut).length === 2);
  const fakeSlot = T.second.items.find((x) => x.id === T.tut.ids.sec6Fake);
  secondInspect(T, fakeSlot.id, TUT_SECOND.fake.tell);
  check('главный признак пали виден сразу', fakeSlot.item.seen && fakeSlot.item.seen[TUT_SECOND.fake.tell] === 'bad', JSON.stringify(fakeSlot.item.seen));
  buySecond(T, fakeSlot.id);
  tutorialSync(T);
  while (STEPS[T.tut.step].kind === 'talk') tutorialNext(T);
  check('купил паль — Тимур объясняет и просит выставить', STEPS[T.tut.step].id === 'second_list');
  const fk = T.items.find((i) => i.id === T.tut.ids.sec6FakeItem);
  listItem(T, fk, { price: 9000, asOrig: true, avito: true, tg: false });
  tutorialSync(T);
  check('паль как ориг урок не засчитывает', STEPS[T.tut.step].id === 'second_list');
  unlist(T, fk);
  listItem(T, fk, { price: 1500, asOrig: false, avito: true, tg: false });
  tutorialSync(T);
  check('паль честно как реплику — урок идёт дальше', STEPS[T.tut.step].id !== 'second_list', STEPS[T.tut.step].id);
  check('глава доходит до конца после пали', runTutorialHeadless(T) && T.tut.part === 'poizon');
}

// Игрок завис на втором шаге и проспал месяц (так делал автотест случайными
// нажатиями): учебные объявления не должны истечь, а «Пропустить» — упасть.
{
  const Z = createGame(4600);
  reachStep(Z, STEP_INDEX.bank_card);
  for (let d = 0; d < 35; d++) sleepNight(Z);
  check('проспал месяц на обучении — учебные объявления на месте', !!Z.listings.find((l) => l.id === Z.tut.ids.orig1) && !!Z.listings.find((l) => l.id === Z.tut.ids.fake1));
  let ok = false;
  try {
    ok = runTutorialHeadless(Z);
  } catch (e) {
    ok = 'исключение: ' + e.message;
  }
  check('и глава после этого доигрывается', ok === true, String(ok));
}

// Шкаф забит к главе — учебная покупка всё равно проходит: сценарий Тимура
// не должен упираться в лимит мест.
{
  const F = createGame(4500);
  reachStep(F, STEP_INDEX.second_find);
  while (usedSlots(F) < capacity(F)) F.items.push(makeItem(rngOf(F), 30, { cond: 2, real: true }));
  check('шкаф забит к «Секонду»', usedSlots(F) >= capacity(F));
  check('с забитым шкафом «Секонд» доходит до конца', runTutorialHeadless(F) && F.tut.part === 'poizon');
  untilCall(F);
  while (usedSlots(F) < capacity(F)) F.items.push(makeItem(rngOf(F), 30, { cond: 2, real: true }));
  check('с забитым шкафом «Пойзон» доходит до конца', runTutorialHeadless(F) && F.tut.done && F.shipments.some((sh) => sh.tut === 'poizon'));
}

/* ---------- Подсказка «когда позвонит Тимур» ---------- */
// Подсказка на главном экране обязана говорить правду о дне: вечером —
// «завтра в 9:00», утром того же дня — уже «сегодня».
{
  const U = createGame(141);
  runTutorialHeadless(U);
  check('вечером после «Авитки»: завтра в 9:00 про Телегу', (upcomingCallOf(U) || {}).text === 'Завтра в 9:00 позвонит Тимур — про Телегу', (upcomingCallOf(U) || {}).text);
  sleepNight(U);
  check('утром: сегодня в 9:00 про Телегу', (upcomingCallOf(U) || {}).text === 'Сегодня в 9:00 позвонит Тимур — про Телегу', (upcomingCallOf(U) || {}).text);
  untilCall(U);
  runTutorialHeadless(U);
  U.stats.sold += 1;
  const c = upcomingCallOf(U) || {};
  check('после «Телеги» и продажи: день недели завоза в 9:00', /^(Сегодня|Завтра|В понедельник|В четверг) в 9:00 позвонит Тимур — про секонд$/.test(c.text || ''), c.text);
  untilCall(U);
  check('и Тимур правда звонит в 9:00 дня завоза', U.tut.part === 'second' && hourIndex(U.t) === 9 && [1, 4].includes(weekdayAt(U.t)));
}

/* ---------- Дела на день ---------- */
// Три дела каждое утро, серия дней, награды талонами и днями PRO.
section('Дела на день');
{
  const D1 = createGame(61);
  check('в первый день дел нет — там Тимур', !D1.daily.tasks.length);
  runTutorialHeadless(D1);
  updateDaily(D1);
  check('вечером после «Авитки» дел ещё нет', !D1.daily.tasks.length, hourIndex(D1.t) + ':00');
  sleepNight(D1);
  const day = dayIndex(D1.t);
  check('наутро после «Авитки» — три дела', D1.daily.day === day && D1.daily.tasks.length === 3, JSON.stringify(D1.daily.tasks.map((x) => x.id)));
  const groups = new Set(D1.daily.tasks.map((x) => DAILY.find((d) => d.id === x.id).group));
  check('дела из разных групп', groups.size === 3);
  check('дела только для скачанных приложений', D1.daily.tasks.every((x) => { const d = DAILY.find((y) => y.id === x.id); return !d.app || installed(D1, d.app); }));
  const D2 = createGame(61);
  runTutorialHeadless(D2);
  sleepNight(D2);
  check('дела детерминированы сидом и днём', JSON.stringify(D2.daily.tasks) === JSON.stringify(D1.daily.tasks));

  // Закрываем все три вручную: счётчики растут — дела закрываются.
  const closeAll = (G) => {
    for (const x of G.daily.tasks) {
      const d = DAILY.find((y) => y.id === x.id);
      if (d.stat) G.stats[d.stat] = (G.stats[d.stat] || 0) + x.need;
      else G.tg.posts.unshift({ at: G.t, kind: 'item', text: 'тест' });
    }
    updateDaily(G);
  };
  closeAll(D1);
  check('все дела закрыты — серия 1', D1.daily.tasks.every((x) => x.done) && D1.daily.streak === 1, 'серия ' + D1.daily.streak);
  let streakOk = true;
  for (let k = 2; k <= 3; k++) {
    sleepNight(D1);
    closeAll(D1);
    if (D1.daily.streak !== k) streakOk = false;
  }
  check('серия растёт день за днём', streakOk && D1.daily.streak === 3, 'серия ' + D1.daily.streak);
  check('на 3-й день — талон на легит-чек', D1.daily.legitFree === 1);
  // Тимур мог позвонить с «Телегой» — дослушиваем главу.
  if (D1.tut.active) runTutorialHeadless(D1);
  const it = makeItem(rngOf(D1), 30, { cond: 1, real: true });
  D1.items.push(it);
  const before = D1.money;
  const lr = legitCheck(D1, it);
  check('легит-чек по талону бесплатный', !!lr && D1.money === before && D1.daily.legitFree === 0, `${rub(before - D1.money)}, lr ${JSON.stringify(lr)}, талонов ${D1.daily.legitFree}, обучение ${D1.tut.active}`);
  sleepNight(D1);
  sleepNight(D1);
  check('пропустил день — серия сгорела', D1.daily.streak === 0 && D1.daily.lost === 3, `серия ${D1.daily.streak}, сгорело ${D1.daily.lost}`);
}

/* ---------- Старые сейвы посреди новых глав ---------- */
// Главы «Секонд» и «Пойзон» стали длиннее: номер шага из старого сейва
// внутри них указывает не туда. Такой сейв начинает главу со звонка.
{
  const memory = () => {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => (m[k] = String(v)), removeItem: (k) => delete m[k] };
  };
  const O = createGame(91);
  reachStep(O, STEP_INDEX.second_find);
  check('дошли до середины «Секонда»', STEPS[O.tut.step].id === 'second_find');
  delete O.tut.sv;
  O.tut.step = STEP_INDEX.second_find + 2;
  const store = memory();
  saveGame(O, store);
  const back = loadGame(store);
  check('старый сейв посреди «Секонда» — глава заново со звонка', !!back && STEPS[back.tut.step].id === 'second_call' && back.tut.active, back ? STEPS[back.tut.step].id : 'не загрузился');
  check('и доигрывается до конца', runTutorialHeadless(back) && back.tut.part === 'poizon');
  const A = createGame(92);
  reachStep(A, STEP_INDEX.tg_post);
  delete A.tut.sv;
  const store2 = memory();
  saveGame(A, store2);
  const back2 = loadGame(store2);
  check('старый сейв в «Телеге» продолжает с того же шага', !!back2 && back2.tut.step === A.tut.step && !back2.tut.stale);
}

/* ---------- «Что нового» ---------- */
{
  const memory = () => {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => (m[k] = String(v)), removeItem: (k) => delete m[k] };
  };
  const N = createGame(131, { tutorial: 'none' });
  check('новой игре «Что нового» не показывают', N.news === NEWS_VERSION);
  delete N.news;
  const st = memory();
  saveGame(N, st);
  const old = loadGame(st);
  check('старому сейву — показывают один раз', !!old && old.news === 0);
  check('в «Что нового» каждый пункт ведёт в приложение', NEWS.every((x) => ALL_APPS.includes(x.where)));
}

/* ---------- Прокачка в Апсторе ---------- */
section('Прокачка');
{
  const U = createGame(71, { tutorial: 'skip' });
  let g = 0;
  while (!U.tut.done && g++ < 24 * 30) {
    if (hourIndex(U.t) >= 23 || hourIndex(U.t) < 8) sleepNight(U);
    else advanceHours(U, 1);
  }
  U.money = 50000;
  U.prog.lvl = 2;
  check('Пойзон Plus до 4 уровня не купить', !buyUpgrade(U, 'poizonPlus') && !U.upgrades.poizonPlus);
  U.prog.lvl = 4;
  const eta0 = poizonEta(U);
  const ship0 = poizonShip(U, 30, 1);
  const m0 = U.money;
  check('Пойзон Plus покупается за свою цену', buyUpgrade(U, 'poizonPlus') && m0 - U.money === UPGRADES.poizonPlus.price);
  const eta1 = poizonEta(U);
  check('с Plus доставка на 2 дня быстрее и дешевле', eta1[0] === eta0[0] - 2 && eta1[1] === eta0[1] - 2 && poizonShip(U, 30, 1) < ship0, `${eta0} → ${eta1}`);
  check('второй раз не купить', !buyUpgrade(U, 'poizonPlus'));
  const slot = U.second.items.find((x) => !x.tut);
  const p0 = secondPriceNow(U, slot);
  buyUpgrade(U, 'secondClub');
  check('Мешок-клуб: −10% на кассе', secondPriceNow(U, slot) < p0, `${p0} → ${secondPriceNow(U, slot)}`);
  check('отложить вещь — раз в день', !!reserveSlot(U, slot) && slot.reserved > U.t && !reserveSlot(U, U.second.items.find((x) => x !== slot)));
  U.tg.has = U.tg.has || !!createChannel(U, 'тест');
  buyUpgrade(U, 'tgPremium');
  U.tg.lastPost = U.t - 30;
  const posts0 = U.tg.posts.length;
  let k = 0;
  while (hourIndex(U.t) !== 12 && k++ < 30) {
    if (hourIndex(U.t) >= 23 || hourIndex(U.t) < 8) sleepNight(U);
    else advanceHours(U, 1);
  }
  check('Телега Premium сама постит после суток тишины', U.tg.posts.length > posts0 && U.tg.posts[0].kind === 'trend');
}

/* ---------- Гардероб в секонде ---------- */
// Слух «в секонд завезли чей-то гардероб» раньше ничего не делал. Теперь
// гардероб приезжает к открытию, а в дни без завоза его иногда сдают днём.
section('Гардероб в секонде');
{
  const C = createGame(101, { tutorial: 'skip' });
  const live = (hours) => {
    for (let k = 0; k < hours; k++) {
      if (hourIndex(C.t) >= 23 || hourIndex(C.t) < 8) sleepNight(C);
      else advanceHours(C, 1);
    }
  };
  let g = 0;
  while (!C.tut.done && g++ < 24 * 30) live(1);
  // Слух на завтра: событие с окном на сутки.
  g = 0;
  while (hourIndex(C.t) !== 12 && g++ < 30) live(1);
  C.events.push({ type: 'secondJackpot', start: C.t + 6, end: C.t + 30, title: 'тест', text: 'тест', announced: true });
  const before = C.second.items.filter((x) => x.rush).length;
  g = 0;
  while (!(hourIndex(C.t) === 10) && g++ < 30) live(1);
  const drop = C.second.items.filter((x) => x.rush);
  check('слух сбылся: гардероб приехал к открытию', drop.length - before >= 4, `${drop.length - before} вещей`);
  check('в гардеробе — хорошее брендовое', drop.every((x) => x.good));
  live(1);
  check('первые два часа гардероб почти не трогают', C.second.items.filter((x) => x.rush).length >= drop.length - 1);
  live(5);
  check('потом его разбирают', C.second.items.filter((x) => x.rush).length < drop.length);
  // Днём в день без завоза.
  C.prog.lvl = 3;
  C.second.closetAt = C.t + 1;
  const n0 = C.second.items.filter((x) => x.rush && x.rush > C.t).length;
  const open = isSecondOpenAt(C.t + 1);
  live(1);
  check('днём сдали чей-то шкаф — две вещи', !open || C.second.items.filter((x) => x.rush && x.rush > C.t).length - n0 === 2);
}

/* ---------- Коллекции ---------- */
section('Коллекции');
{
  const K = createGame(111, { tutorial: 'skip' });
  let g = 0;
  while (!K.tut.done && g++ < 24 * 30) {
    if (hourIndex(K.t) >= 23 || hourIndex(K.t) < 8) sleepNight(K);
    else advanceHours(K, 1);
  }
  if (!K.tg.has) createChannel(K, 'сет');
  const mi = MODELS.findIndex((m) => !m.noname && m.ways.length === 3);
  const add = (way, verdict) => {
    const it = makeItem(rngOf(K), mi, { cond: 1, real: verdict === 'orig', way, verdict });
    it.legitDone = verdict !== 'unknown';
    K.items.push(it);
    checkGoalsOf(K);
    return it;
  };
  add(0, 'orig');
  add(1, 'orig');
  add(2, 'unknown');
  check('непроверенная расцветка в коллекцию не идёт', !K.collections[mi] && collectionOfModel(K, mi).have.size === 2);
  const subs0 = K.tg.subs;
  add(2, 'orig');
  check('все расцветки оригиналами — коллекция собрана', !!K.collections[mi] && K.stats.collections === 1);
  check('пост в канал и подписчики', K.tg.subs > subs0 && K.tg.posts[0].kind === 'collection');
  check('цель «Собери коллекцию»', !!K.goals.collection1);
  add(0, 'orig');
  check('второй раз на ту же модель — не считается', K.stats.collections === 1);
  check('в хронике есть коллекции', chronicleOf(K).some((m) => m.n === 'Коллекции'));
}

/* ---------- Грааль недели ---------- */
section('Грааль недели');
{
  const G = createGame(81, { tutorial: 'skip' });
  const live = (hours) => {
    for (let k = 0; k < hours; k++) {
      if (hourIndex(G.t) >= 23 || hourIndex(G.t) < 8) sleepNight(G);
      else advanceHours(G, 1);
    }
  };
  let g = 0;
  while (!G.tut.done && g++ < 24 * 30) live(1);
  G.prog.lvl = 4;
  if (!G.tg.has) createChannel(G, 'грааль');
  g = 0;
  while (!(weekdayAt(G.t) === 1 && hourIndex(G.t) === 13) && g++ < 24 * 8) live(1);
  check('до 5 уровня коллекционеры не пишут', !G.grail);
  G.prog.lvl = 5;
  live(1);
  g = 0;
  while (!(weekdayAt(G.t) === 1 && hourIndex(G.t) === 13) && g++ < 24 * 8) live(1);
  const hunt = G.grail;
  const th = hunt && G.threads.find((x) => x.id === hunt.threadId);
  check('с 5 уровня в понедельник пишет коллекционер', !!th && th.kind === 'order' && th.data.order.grail);
  check('коллекционер платит сильно выше рынка', !!th && th.data.order.budget > valueOrigOf(G, { m: hunt.m, cond: 1, size: hunt.size, boughtAt: G.t }) * 1.4);
  g = 0;
  while (!hunt.listingId && g++ < 24 * 4) live(1);
  const gl = G.listings.find((l) => l.id === hunt.listingId);
  check('через день-два грааль всплывает на Авитке', !!gl && gl.item.m === hunt.m && gl.item.size === hunt.size && gl.grail);
  gl.seller.agreed = true;
  live(30);
  check('договорился с продавцом — Мирон грааль не уводит', !hunt.sniped && G.listings.includes(gl));
  gl.seller.agreed = false;
  g = 0;
  while (!hunt.sniped && g++ < 40) live(1);
  check('прозевал — Мирон увёл грааль', hunt.sniped && !G.listings.some((l) => l.id === hunt.listingId));
  // Вторая попытка: вещь нашлась — отдаём коллекционеру.
  acceptOrder(G, th);
  const it = makeItem(rngOf(G), hunt.m, { cond: 1, real: true, size: hunt.size, verdict: 'orig' });
  it.legitDone = true;
  it.cost = 1000;
  G.items.push(it);
  const res = fulfillOrder(G, th, it);
  checkGoalsOf(G);
  check('грааль добыт: трофей и цель', !!res && G.stats.grails === 1 && !!G.goals.grail1, JSON.stringify(res));
  const story = chronicleOf(G);
  check('хроника: с чего началось и граали', story.some((m) => m.n === 'С чего началось') && story.some((m) => m.n === 'Граали'), story.map((m) => m.n).join(', '));
}

/* ---------- Новый сезон: что переносится ---------- */
// В Апсторе написано «покупка навсегда», а серия дел — про игрока, а не про
// сезон. Новый сезон не должен ни то, ни другое отнимать.
{
  const P = createGame(121, { tutorial: 'none' });
  P.upgrades = { avitoPro: 10, secondClub: 20 };
  P.daily.streak = 6;
  P.daily.best = 9;
  P.daily.legitFree = 2;
  P.daily.lastFull = dayIndex(P.t);
  const next = startNewSeasonOf(P, null);
  const fresh = createGame(next.seed, { tutorial: 'none' });
  fresh.upgrades = next.upgrades;
  fresh.daily = next.daily;
  check('новый сезон: Pro-версии остаются', upgradedOf(fresh, 'avitoPro') && upgradedOf(fresh, 'secondClub'));
  check('в итогах сезона это сказано', seasonCarryOf(P).some((x) => x.includes('Pro-версии')));
  updateDaily(fresh);
  if (!fresh.daily.tasks.length) {
    sleepNight(fresh);
    updateDaily(fresh);
  }
  check('новый сезон: серия и талоны не сгорают', fresh.daily.streak === 6 && fresh.daily.best === 9 && fresh.daily.legitFree === 2, JSON.stringify({ s: fresh.daily.streak, lost: fresh.daily.lost }));
}

/* ---------- Апстор ---------- */
// Приложения приходят с главами. Чего нет на телефоне — того нет и в игре:
// ни действий, ни уведомлений. Старые сейвы и новый сезон — всё сразу.
section('Апстор и звонки');
{
  const T = createGame(31);
  check('до своей главы Пойзон не работает', buyPoizon(T, 5, 'M', 1) === null);
  runTutorialHeadless(T);
  const n0 = T.notif.length;
  notify(T, { route: 'second', title: 'Завоз' });
  check('уведомления секонда не приходят, пока его нет', T.notif.length === n0);
  check('без приложения секонд не купить', buySecond(T, T.second.items[0].id) === null);
  check('канал без Телеги не завести', createChannel(T, 'тест') === null && !T.tg.has);
  // Ночью Тимур не звонит, утром до девяти тоже.
  let rang = false;
  while (hourIndex(T.t) !== 8 && !rang) {
    if (hourIndex(T.t) >= 23 || hourIndex(T.t) < 8) sleepNight(T);
    else advanceHours(T, 1);
    rang = T.tut.active;
  }
  check('ночью Тимур не звонит', !rang, `${dateLabel(T.t)}, ${hourIndex(T.t)}:00`);
  check('лотов в личке нет, пока нет Телеги', !T.threads.some((t) => t.kind === 'lot'));
  advanceHours(T, 3);
  check('звонок останавливает перемотку времени', T.tut.active && hourIndex(T.t) === 9, `${hourIndex(T.t)}:00`);

  // Не продал ничего — про секонд Тимур всё равно позвонит, но позже.
  const L = createGame(33);
  runTutorialHeadless(L);
  untilCall(L);
  runTutorialHeadless(L);
  const tgDay = dayIndex(L.tut.ended.tg);
  untilCall(L);
  check('лентяй получает звонок про секонд через завоз', L.tut.part === 'second' && dayIndex(L.t) - tgDay >= 4 && [1, 4].includes(weekdayAt(L.t)), dateLabel(L.t));

  const old = createGame(34, { tutorial: 'skip' });
  delete old.apps;
  old.tut = { active: true, step: 40, done: false, ids: old.tut.ids };
  const mig = fillDefaults(JSON.parse(JSON.stringify(old)));
  check('старый сейв: обучение закрыто, все приложения стоят', mig.tut.done && !mig.tut.active && ALL_APPS.every((a) => installed(mig, a)));
  const season = createGame(35, { tutorial: 'none' });
  check('новый сезон: все приложения сразу', ALL_APPS.every((a) => installed(season, a)) && season.tut.done);
}

/* ---------- детерминизм ---------- */
section('Детерминизм');
const a = createGame(777, { tutorial: 'skip' });
const b = createGame(777, { tutorial: 'skip' });
check('одинаковый капитал', Math.round(netWorth(a)) === Math.round(netWorth(b)));
check('одинаковое число объявлений', a.listings.length === b.listings.length);
check(
  'одинаковая первая вещь на рынке',
  a.listings[0].item.m === b.listings[0].item.m && a.listings[0].ask === b.listings[0].ask,
);

/* ---------- прогон времени ---------- */
section('Прогон 60 дней');
const G = createGame(42, { tutorial: 'skip' });
const gameStart = G.t;
let error = null;
const t0 = Date.now();
try {
  for (let day = 0; day < 60; day++) {
    for (let h = 0; h < 24; h++) advanceHours(G, 1);
  }
} catch (e) {
  error = e;
}
check('прогон без ошибок', !error, error ? error.message + '\n' + error.stack : '');
if (!error) {
  console.log(`  60 дней за ${Date.now() - t0} мс`);
  console.log(`  капитал: ${rub(netWorth(G))}`);
  console.log(`  уровень: ${G.prog.lvl}, опыт ${G.prog.xp}`);
  console.log(`  объявлений на рынке: ${G.listings.length}`);
  console.log(`  вещей в секонде: ${G.second.items.length}`);
  console.log(`  диалогов: ${G.threads.length}, уведомлений: ${G.notif.length}`);
  console.log(`  событий: ${G.events.length}, долг: ${rub(G.loans.reduce((x, l) => x + l.principal, 0))}`);
  check('рынок не опустел', G.listings.length > 10, G.listings.length + '');
  check('секонд живой', G.second.items.length > 3, G.second.items.length + '');
  check('уведомления не копятся бесконечно', G.notif.length <= 80, G.notif.length + '');
  check('диалоги чистятся', G.threads.length < 60, G.threads.length + '');
  // Главы обучения у ботов идут сами и тоже двигают время (ждут посылку).
  check('время шло', G.t >= gameStart + 60 * 24 && G.t < gameStart + 62 * 24, G.t - gameStart + ' ч');
}

/* ---------- отсутствие NaN ---------- */
section('Числа');
function findBadNumbers(obj, path, out, depth) {
  if (depth > 8 || out.length > 20) return out;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(path + ' = ' + obj);
    return out;
  }
  if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(obj)) {
    findBadNumbers(obj[k], path + '.' + k, out, depth + 1);
  }
  return out;
}
const bad = findBadNumbers(G, 'S', [], 0);
check('нет NaN и Infinity в состоянии', bad.length === 0, bad.join(', '));

/* ---------- сохранение ---------- */
section('Сейв');
const json = JSON.stringify(G);
const back = JSON.parse(json);
check('сейв сериализуется', json.length > 1000, num(json.length) + ' символов');
check('после разбора состояние живое', back.t === G.t);
restoreCounters(back);

// Перезагрузка страницы — не событие в игре: она не должна ничего дарить и
// не должна сбивать счётчики. Оба бага жили именно здесь.
{
  const R = createGame(11, { tutorial: 'skip' });
  R.prog.unlocks.proTrial = 1;
  R.tg.proUntil = R.t + 24;
  const reload = (X) => {
    const Y = loadGame(fakeStorage(JSON.stringify(X)));
    restoreCounters(Y);
    return Y;
  };
  const R2 = reload(reload(R));
  check('перезагрузка не продлевает PRO', R2.tg.proUntil === R.t + 24, `${R2.tg.proUntil - R.t} ч`);

  const it = R2.items[0];
  R2.pending.push({ at: R2.t + 1, type: 'itemReturn', item: JSON.parse(JSON.stringify(it)), keepVerdict: true });
  hourTick((R2.t++, R2));
  const R3 = reload(R2);
  const fresh = makeItem(rngOf(R3), 9, {});
  const all = [...R3.items.map((i) => i.id), fresh.id];
  check('после возврата и перезагрузки id не повторяются', new Set(all).size === all.length);
}
let tickError = null;
try {
  hourTick(back);
} catch (e) {
  tickError = e;
}
check('загруженный сейв тикает', !tickError, tickError ? tickError.message : '');

/* ---------- сейв переживает обновление версии ---------- */
// Главный случай: вышла новая версия, в ней появились поля, которых в старом
// сейве нет. Прогресс игрока при этом обязан остаться.
const old = JSON.parse(json);
// Поля, которых в старой версии ещё не было.
delete old.buyAd;
delete old.stats.adBuys;
delete old.streak;
delete old.staff;
delete old.showroom;
delete old.brand;
delete old.second.lastSeen;
old.market.h = old.market.h.slice(0, 5); // каталог вещей вырос
old.market.pzNoise = null; // массив вообще потерялся
const oldMoney = old.money;
const oldItems = old.items.length;

let migrated = null;
let migError = null;
try {
  migrated = loadGame(fakeStorage(JSON.stringify(old)));
} catch (e) {
  migError = e;
}
check('сейв старой версии загружается', !!migrated && !migError, migError ? migError.message : '');
if (migrated) {
  check('деньги не потерялись', migrated.money === oldMoney, num(migrated.money) + ' ₽');
  check('вещи не потерялись', migrated.items.length === oldItems, migrated.items.length + ' шт');
  check(
    'новые поля подставились',
    !!migrated.buyAd &&
      migrated.stats.adBuys === 0 &&
      !!migrated.streak &&
      !!migrated.staff &&
      !!migrated.showroom &&
      !!migrated.brand &&
      migrated.second.lastSeen !== undefined,
  );
  check(
    'рыночные массивы выросли под новый каталог',
    migrated.market.h.length === MODELS.length && migrated.market.pzNoise.length === MODELS.length,
    migrated.market.h.length + ' моделей',
  );
  let migTickError = null;
  try {
    restoreCounters(migrated);
    hourTick(migrated);
  } catch (e) {
    migTickError = e;
  }
  check('перенесённый сейв тикает', !migTickError, migTickError ? migTickError.message : '');
}

// И обратный случай: версия выросла, а шага миграции нет — тогда честно
// отказываемся, а не отдаём битое состояние.
const future = JSON.parse(json);
future.v = -1;
check('сейв без шага миграции не выдаётся за рабочий', loadGame(fakeStorage(JSON.stringify(future))) === null);

/* ---------- подлинность при продаже ---------- */
// Жалобы автора: оригинал из Пойзона назвали подделкой, чек «паль» на
// настоящей вещи, отзыв «реплика как реплика» за вещь, проданную как ориг.
section('Подлинность при продаже');
{
  const L = createGame(9, { tutorial: 'skip' });
  const lr = rngOf(L);
  let falseFake = 0;
  for (let i = 0; i < 3000; i++) {
    const it = makeItem(lr, 9, { real: true });
    if (legitVerdict(lr, it, 0.93) === 'fake') falseFake++;
  }
  check('легит-чек не называет оригинал палью', falseFake === 0, falseFake + ' из 3000');

  const replicaTexts = new Set(Object.values(REVIEWS.replica).flat());
  const sell = (seed, opts) => {
    const G2 = createGame(seed, { tutorial: 'skip' });
    const it = makeItem(rngOf(G2), opts.m || 9, opts);
    if (opts.legit) it.legitDone = true;
    G2.items.push(it);
    listItem(G2, it, { price: 10000, asOrig: true, avito: true, tg: false });
    const buyer = makeBuyer(G2, rngOf(G2), it, 'avito', 10000);
    buyer.agreed = true;
    buyer.price = 10000;
    const th = newThread(G2, { kind: 'buyer', name: 'Тест', sub: '', platform: 'avito', data: { buyer } });
    completeSale(G2, th);
    return G2.pending;
  };
  let poizonClaims = 0;
  let superClaims = 0;
  let wrongText = 0;
  let fakeReviews = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const p1 = sell(seed, { real: true, cond: 0, verdict: 'orig', legit: true, src: 'Пойзон' });
    if (p1.some((e) => e.type === 'claim' || e.type === 'dispute')) poizonClaims++;
    const p2 = sell(seed, { real: false, q: 0.95, verdict: 'orig', legit: true });
    if (p2.some((e) => e.type === 'claim' || e.type === 'dispute')) superClaims++;
    const p3 = sell(seed, { real: false, q: 0.3, cond: 2, defects: [{ n: 'Пятно', step: 1 }] });
    for (const e of p3) {
      if (e.type !== 'review') continue;
      fakeReviews++;
      if (replicaTexts.has(e.text) || e.stars < 2) wrongText++;
    }
  }
  check('оригинал из Пойзона не ловят на пали', poizonClaims === 0, poizonClaims + ' из 300');
  check('суперкопию, прошедшую твой чек, не ловят', superClaims === 0, superClaims + ' из 300');
  check('незамеченная паль как ориг — отзыв как за оригинал', fakeReviews > 0 && wrongText === 0, `${wrongText} из ${fakeReviews}`);

  const P = createGame(3, { tutorial: 'skip' });
  const pit = makeItem(rngOf(P), 9, { real: true, verdict: 'orig' });
  pit.legitDone = true;
  P.items.push(pit);
  listItem(P, pit, { price: 10000, asOrig: true, avito: true, tg: false });
  const pb = makeBuyer(P, rngOf(P), pit, 'avito', 10000);
  pb.type = 'paranoid';
  const pth = newThread(P, { kind: 'buyer', name: 'Тест', sub: '', platform: 'avito', data: { buyer: pb } });
  check('чек можно скинуть с первого сообщения', canShowProof(P, pth));
  showProof(P, pth);
  check('после чека вопрос про подлинность не повторяется', pb.asked.auth && !canShowProof(P, pth));

  // Скрытое не должно читаться по цене: оценки на экране у оригинала и у
  // непроверенной копии того же вида одинаковы, а скрытый дефект не виден.
  const E = createGame(5, { tutorial: 'skip' });
  const er = rngOf(E);
  const real = makeItem(er, 9, { real: true, cond: 1, size: 'M', way: 0 });
  const copy = makeItem(er, 9, { real: false, q: 0.9, cond: 1, size: 'M', way: 0 });
  const hidden = makeItem(er, 9, { real: true, cond: 3, size: 'M', way: 0 });
  hidden.shownCond = 1;
  hidden.defects = [{ n: 'Пятно', step: 2 }];
  const a = estimateFor(E, real);
  const c = estimateFor(E, copy);
  const h = estimateFor(E, hidden);
  check('оценка не выдаёт паль', a.orig === c.orig && a.fake === c.fake, `${a.fake} / ${c.fake}`);
  check('оценка не выдаёт скрытый дефект', a.orig === h.orig, `${a.orig} / ${h.orig}`);
  copy.verdict = 'fake';
  check('известная паль оценивается по своему качеству', estimateFor(E, copy).fake !== a.fake);
}

/* ---------- обучение под хаосом ---------- */
// Экран в обучении свободный: между шагами игрок может делать что угодно —
// торговаться до посинения, отказывать покупателю, снимать вещь с продажи,
// сдавать в скупку, лезть в паль, ждать часами. Сценарий обязан это пережить
// и дойти до конца, а деньги — не уйти в минус.
section('Обучение под хаосом');
{
  const rnd = (() => {
    let x = 99;
    return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  })();
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const TELL_KEYS = ['tag', 'stitch', 'sole', 'print', 'hardware', 'shape', 'box', 'smell'];
  const tutListings = (T) => T.listings.filter((l) => l.tutorial);
  const CHAOS = [
    (T) => { const l = pick(T.listings); if (l) askSeller(T, l, pick(['photos', 'orig', 'why', 'defects', 'actual'])); },
    (T) => { const l = pick(tutListings(T)); if (l) photoInspect(T, l, pick(TELL_KEYS)); },
    (T) => { const l = pick(tutListings(T)); if (l) photoLegit(T, l); },
    (T) => { const l = pick(tutListings(T)); if (l) startMeeting(T, l); },
    (T) => { const l = pick(tutListings(T)); if (l && l.met) handLegit(T, l); },
    (T) => { const l = pick(tutListings(T)); if (l) confirmDelivery(T, l); },
    (T) => { const l = pick(tutListings(T)); if (l && l.met) buyAtMeeting(T, l); },
    (T) => { const l = pick(tutListings(T)); if (l && l.met) accuseFake(T, l); },
    (T) => { const l = pick(tutListings(T)); if (l) offerToSeller(T, l, 100); },
    (T) => { const l = pick(tutListings(T)); if (l) useLever(T, l, pick(['today', 'market', 'polite', 'walk'])); },
    (T) => { const it = pick(T.items); if (it) unlist(T, it); },
    (T) => { const it = pick(T.items); if (it) pawn(T, it); },
    (T) => { const it = pick(T.items); if (it) legitCheck(T, it); },
    (T) => { const it = pick(T.items); if (it) listItem(T, it, { price: 1000 + Math.floor(rnd() * 20000), asOrig: rnd() < 0.5, avito: true, tg: false }); },
    (T) => { const th = T.threads.find((t) => t.kind === 'buyer' && !t.closed); if (th) declineBuyer(T, th); },
    (T) => { const th = T.threads.find((t) => t.kind === 'buyer' && !t.closed); if (th) counterToBuyer(T, th, 99999); },
    (T) => buyPoizon(T, 30, 'mix', 1),
    (T) => createChannel(T, 'хаос'),
    (T) => advanceHours(T, 1 + Math.floor(rnd() * 3)),
  ];
  let broken = [];
  let negative = 0;
  for (let seed = 11; seed <= 26; seed++) {
    const T = createGame(seed);
    let guard = 0;
    // Все главы: хаос внутри каждой, между главами — просто жизнь до звонка.
    while (!T.tut.done && guard++ < 1500) {
      if (!T.tut.active) {
        if (!untilCall(T)) break;
        continue;
      }
      for (let k = 0; k < 5; k++) {
        try {
          pick(CHAOS)(T);
        } catch (e) {
          broken.push(`сид ${seed}: исключение «${e.message}»`);
        }
        if (T.money < 0) negative++;
      }
      tutorialSync(T);
      if (!T.tut.active) continue;
      stepOnce(T);
    }
    if (!T.tut.done) broken.push(`сид ${seed}: встал на «${STEPS[T.tut.step].id}»`);
  }
  check('обучение переживает свободного игрока', !broken.length, broken.slice(0, 4).join('; '));
  check('деньги в обучении не уходят в минус', negative === 0, negative + ' раз');
}

/* ---------- фото от продавца ---------- */
// Фото присылают в переписке; часть продавцов пали шлёт фото чужого
// оригинала. Чек по фото ловит паль, но «оригинал» по фото — не гарантия.
// Чек в руках (встреча, шкаф) — всегда правда.
section('Фото и легит-чек');
{
  const F = createGame(77, { tutorial: 'skip' });
  const fr = rngOf(F);
  let fakesShipped = 0;
  let swaps = 0;
  let swapOnMeetOnly = 0;
  let swapOnReal = 0;
  for (let i = 0; i < 4000; i++) {
    const l = generateListing(F, fr);
    if (!l.item.real && l.declared === 'orig' && l.mode !== 'meet') fakesShipped++;
    if (l.photoItem) {
      swaps++;
      if (l.mode === 'meet') swapOnMeetOnly++;
      if (l.item.real) swapOnReal++;
    }
  }
  const share = swaps / Math.max(1, fakesShipped);
  check('подмена фото — только у пали с доставкой', !swapOnMeetOnly && !swapOnReal);
  check('подмена — у заметной, но не большей части такой пали', share > 0.12 && share < 0.4, Math.round(share * 100) + '%');

  // Подменённое объявление: чек по фото говорит «оригинал», но вещь в
  // шкафу от этого не становится проверенной, а приедет паль.
  F.money = 100000;
  let swapListing = null;
  for (let i = 0; i < 4000 && !swapListing; i++) {
    const l = generateListing(F, fr);
    if (l.photoItem) swapListing = l;
  }
  F.listings.push(swapListing);
  askSeller(F, swapListing, 'photos');
  const pv = photoLegit(F, swapListing);
  check('чек по фото чужой вещи говорит «оригинал»', pv && pv.verdict === 'orig');
  check('оригинал по фото — не доказательство', swapListing.item.verdict === 'unknown' && !swapListing.item.legitDone);
  const th = F.threads.find((t) => t.id === swapListing.threadId);
  check('фото пришли сообщением в переписку', th.messages.some((m) => m.photos));

  // На встрече подменить нельзя: чек в руках — правда.
  let hand = 0;
  let handRight = 0;
  for (let i = 0; i < 300; i++) {
    const l = generateListing(F, fr);
    if (l.mode === 'ship' || MODELS[l.item.m].noname || l.seller.type === 'scam') continue;
    F.listings.push(l);
    l.met = true;
    const r = handLegit(F, l);
    if (!r) continue;
    hand++;
    if ((r.verdict === 'orig') === l.item.real) handRight++;
  }
  check('легит-чек вживую всегда прав', hand > 50 && hand === handRight, `${handRight} из ${hand}`);
  check('чек по фото дешевле чека в руках', photoLegitCost(F, swapListing.item) < legitCost(F, swapListing.item));

  // Продавец может не прислать фото. Подменщик присылает всегда — в этом
  // ловушка, кидала не присылает никогда, остальные — по-разному.
  const sent = {};
  const asked = {};
  let swapRefused = 0;
  for (let i = 0; i < 6000; i++) {
    const l = generateListing(F, fr);
    F.listings.push(l);
    askSeller(F, l, 'photos');
    const t = l.seller.type;
    asked[t] = (asked[t] || 0) + 1;
    if (l.photosSent) sent[t] = (sent[t] || 0) + 1;
    if (l.photoItem && !l.photosSent) swapRefused++;
    F.listings = F.listings.filter((x) => x !== l);
  }
  const rate = (t) => (sent[t] || 0) / Math.max(1, asked[t]);
  check('подменщик фото присылает всегда', swapRefused === 0);
  check('кидала фото не присылает', rate('scam') === 0);
  check('пали прячут фото чаще, чем коллекционеры', rate('liar') < rate('collector'), `${Math.round(rate('liar') * 100)}% / ${Math.round(rate('collector') * 100)}%`);
  check('большинство продавцов фото присылает', rate('owner') > 0.75, Math.round(rate('owner') * 100) + '%');
}

/* ---------- итог ---------- */
console.log('\n' + (failures ? `✗ провалено проверок: ${failures} из ${checks}` : `✓ прошли все проверки: ${checks}`));
process.exit(failures ? 1 : 0);
