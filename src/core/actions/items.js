// Действия с вещами: осмотр по признакам, легит-чек, чистка, скупка, спор.

import { MODELS } from '../data/models.js';
import {
  legitCost,
  legitMinutes,
  valueOrig,
  valueFake,
  cleanCost,
  photoCost,
  bumpCost,
  pawnPrice,
  seenItem,
} from '../economy.js';
import {
  observeTell,
  inspectMinutes,
  tellsFor,
  tellNote,
  handVerdict,
} from '../inspect.js';
import { revealCondition, cleanItem, itemName, shownCondition } from '../items.js';
import { recordTruth } from '../notebook.js';
import { rngOf, pay, earn, canPay, toast, touch, bump, dropItem, tutorialLock, fx } from '../kernel.js';
import { advanceMinutes } from '../tick.js';
import { tutorialTopUp } from '../tutorial.js';
import { checkGoals } from '../progression.js';
import { useLegitTicket } from '../daily.js';

export const findItem = (S, id) => S.items.find((i) => i.id === +id);

/* ======================= ОСМОТР ======================= */

/**
 * Осмотреть один признак. Тратит игровые минуты — в этом вся суть починки:
 * информация больше не бесплатна.
 */
export function inspectTell(S, item, tell, mode) {
  if (!item || !item.flaws) return null;
  const allowed = tellsFor(item, mode);
  if (!allowed.includes(tell)) return null;
  if (item.seen && item.seen[tell]) return tellNote(item, tell);

  const mins = inspectMinutes(S);
  const rng = rngOf(S);
  observeTell(S, rng, item, tell, mode);
  bump(S, 'inspections');
  advanceMinutes(S, mins);
  checkGoals(S);
  touch(S);
  return { ...tellNote(item, tell), minutes: mins };
}

/** Осмотреть состояние: вскрывает скрытые дефекты. */
export function inspectCondition(S, item) {
  if (!item || item.condSeen) return null;
  const mins = Math.max(4, Math.round(inspectMinutes(S) * 0.6));
  const before = shownCondition(item).short;
  const defects = revealCondition(item);
  if (defects.length) bump(S, 'defectsFound', 1);
  advanceMinutes(S, mins);
  checkGoals(S);
  touch(S);
  return { defects, before, after: shownCondition(item).short, minutes: mins };
}

/* ======================= ЛЕГИТ-ЧЕК ======================= */

/**
 * byStaff: проверку отправил помощник. Тогда час уходит у него, а не у
 * игрока, — и время не двигается изнутри часового такта: раньше это
 * прокручивало мир на час посреди обработки предыдущего часа.
 */
export function legitCheck(S, item, { byStaff } = {}) {
  if (!item || item.legitDone) return null;
  const m = MODELS[item.m];
  if (m.noname) {
    toast(S, 'Ноунейм никто не подделывает — проверять нечего');
    return null;
  }
  if (S.tut && S.tut.active && !item.tut && !byStaff) {
    // Деньги на карте сейчас — деньги клиентов Тимура.
    toast(S, 'Тимур: свои вещи проверишь потом — сейчас деньги клиента.');
    return null;
  }
  // Талон за серию дел Тимура — чек бесплатно.
  const ticket = !item.tut && !byStaff && useLegitTicket(S);
  const cost = ticket ? 0 : legitCost(S, item);
  if (item.tut) tutorialTopUp(S, cost);
  if (!canPay(S, cost)) return null;
  if (cost) pay(S, cost, 'Легит-чек: ' + itemName(item));
  // Вещь в руках у сервиса — ответ точный.
  const verdict = handVerdict(item);
  item.verdict = verdict;
  item.legitDone = true;
  bump(S, 'legitChecks');
  if (!byStaff) fx(verdict === 'fake' ? 'bad' : 'ok');
  // Книжка запоминает, по чему палилась эта модель.
  recordTruth(S, item);
  if (!byStaff) advanceMinutes(S, legitMinutes(S));
  checkGoals(S);
  touch(S);
  return {
    verdict,
    cost,
    canDispute: !!(item.protect && item.protect.until > S.t && item.protect.declared === 'orig' && verdict === 'fake'),
  };
}

/* ======================= СПОР ПО ДОСТАВКЕ ======================= */

export function openDispute(S, item) {
  if (!item || !item.protect || item.protect.until <= S.t) return null;
  if (item.verdict !== 'fake' || item.protect.declared !== 'orig') return null;
  const amount = item.protect.paid;
  earn(S, amount, 'Авитка: возврат по спору');
  dropItem(S, item);
  bump(S, 'disputesWon');
  checkGoals(S);
  touch(S);
  return { amount, seller: item.protect.seller };
}

/* ======================= УХОД ЗА ВЕЩЬЮ ======================= */

export function cleanUp(S, item) {
  if (tutorialLock(S)) return null;
  const cost = cleanCost(S, item);
  if (!canPay(S, cost)) return null;
  pay(S, cost, 'Чистка: ' + itemName(item));
  item.cost += cost;
  const fixed = cleanItem(item);
  advanceMinutes(S, 180);
  touch(S);
  return { fixed, cost, condition: shownCondition(item).n };
}

export function photoshoot(S, item) {
  if (tutorialLock(S)) return null;
  const cost = photoCost();
  if (item.photo) return null;
  if (!canPay(S, cost)) return null;
  pay(S, cost, 'Фотосессия: ' + itemName(item));
  item.cost += cost;
  item.photo = true;
  if (item.sale) item.sale.photo = true;
  advanceMinutes(S, 90);
  touch(S);
  return { cost };
}

export function writeDescription(S, item) {
  if (!item.sale || item.sale.description) return null;
  item.sale.description = true;
  advanceMinutes(S, 20);
  touch(S);
  return true;
}

/* ======================= СКУПКА ======================= */

export function pawn(S, item) {
  // Пока идёт глава обучения, в скупку ничего не сдаём: на вещах из шкафа
  // держится сценарий (в Телеге — вещь для канала).
  if (item.tut && S.tut && S.tut.active) {
    toast(S, 'Тимур: эту не сдавай — она для дела.');
    return null;
  }
  if (tutorialLock(S)) return null;
  const price = pawnPrice(S, item);
  earn(S, price, 'Скупка: ' + itemName(item));
  S.stats.profit += price - item.cost;
  dropItem(S, item);
  return { price };
}

/* ======================= ОБЪЯВЛЕНИЕ ======================= */

export function bumpListing(S, item) {
  if (tutorialLock(S)) return null;
  if (!item.sale || !item.sale.avito) return null;
  if (item.sale.boostUntil > S.t) return null;
  const cost = bumpCost(item, S);
  if (!canPay(S, cost)) return null;
  pay(S, cost, 'Поднятие объявления');
  item.sale.boostUntil = S.t + 24;
  item.sale.bumpedAt = S.t;
  touch(S);
  return { cost };
}

/* ======================= ПОДСКАЗКИ ======================= */

export function estimateFor(S, item) {
  const seen = seenItem(item);
  return {
    orig: valueOrig(S, seen),
    fake: valueFake(S, seen),
  };
}
