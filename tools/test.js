// Дымовой тест ядра: игра должна создаваться и крутиться без интерфейса.
// Запуск: npm test

import { createGame, restoreCounters, loadGame } from '../src/core/engine.js';
import { advanceHours, dayTick, hourTick } from '../src/core/tick.js';
import { netWorth, capacity, usedSlots, ratingOf } from '../src/core/economy.js';
import { MODELS } from '../src/core/data/models.js';
import { CATS, SIZE_SETS, sizesFor } from '../src/core/data/catalog.js';
import { rub, num } from '../src/core/util.js';

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
check('деньги на старте', S.money === 5000, rub(S.money));
check('три вещи в шкафу', S.items.length === 3, S.items.length + '');
check('объявления есть', S.listings.length > 20, S.listings.length + '');
check('секонд не пустой', S.second.items.length > 5, S.second.items.length + '');
check('наставник на месте', S.threads.some((t) => t.kind === 'mentor'));
check('раффл создан', !!S.raffle);
check('капитал положительный', netWorth(S) > 0, rub(netWorth(S)));
check('вместимость', capacity(S) === 15, capacity(S) + '');
check('занято мест', usedSlots(S) === 3, usedSlots(S) + '');

/* ---------- детерминизм ---------- */
section('Детерминизм');
const a = createGame(777);
const b = createGame(777);
check('одинаковый капитал', Math.round(netWorth(a)) === Math.round(netWorth(b)));
check('одинаковое число объявлений', a.listings.length === b.listings.length);
check(
  'одинаковая первая вещь на рынке',
  a.listings[0].item.m === b.listings[0].item.m && a.listings[0].ask === b.listings[0].ask,
);

/* ---------- прогон времени ---------- */
section('Прогон 60 дней');
const G = createGame(42);
let error = null;
const t0 = Date.now();
try {
  for (let day = 0; day < 60; day++) {
    for (let h = 0; h < 24; h++) {
      G.t++;
      if (G.t % 24 === 0) dayTick(G);
      hourTick(G);
    }
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
  check('время шло', G.t === 8 + 60 * 24, G.t + '');
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

/* ---------- итог ---------- */
console.log('\n' + (failures ? `✗ провалено проверок: ${failures} из ${checks}` : `✓ все ${checks} проверок прошли`));
process.exit(failures ? 1 : 0);
