// Действия с вещами: осмотр по признакам, легит-чек, чистка, скупка, спор.

import { rub, num } from '../util.js';
import { MODELS } from '../data/models.js';
import { TELLS } from '../data/catalog.js';
import {
  legitCost,
  legitMinutes,
  valueOrig,
  valueFake,
  cleanCost,
  photoCost,
  bumpCost,
  pawnPrice,
} from '../economy.js';
import {
  observeTell,
  inspectMinutes,
  tellsFor,
  tellNote,
  legitVerdict,
  suspicionLabel,
} from '../inspect.js';
import { revealCondition, cleanItem, itemName, shownCondition } from '../items.js';
import { recordTruth } from '../notebook.js';
import { rngOf, pay, earn, canPay, notify, toast, touch, bump, closeThread, mentorOnce } from '../kernel.js';
import { advanceMinutes } from '../tick.js';
import { checkGoals } from '../progression.js';

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

export function legitCheck(S, item) {
  if (!item || item.legitDone) return null;
  const m = MODELS[item.m];
  if (m.noname) {
    toast(S, 'Ноунейм никто не подделывает — проверять нечего');
    return null;
  }
  const cost = legitCost(S, item);
  if (!canPay(S, cost)) return null;
  pay(S, cost, 'Легит-чек: ' + itemName(item));
  const rng = rngOf(S);
  const verdict = legitVerdict(rng, item, 0.97);
  item.verdict = verdict;
  item.legitDone = true;
  bump(S, 'legitChecks');
  // Книжка запоминает, по чему палилась эта модель.
  recordTruth(S, item);
  advanceMinutes(S, legitMinutes(S));
  checkGoals(S);
  touch(S);

  mentorOnce(
    S,
    'legitTip',
    'Легит-чек почти не ошибается, но стоит денег. На дешёвых вещах он съедает всю прибыль — там придётся полагаться на глаз и на книжку.',
  );

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
  S.items = S.items.filter((x) => x !== item);
  bump(S, 'disputesWon');
  checkGoals(S);
  touch(S);
  return { amount, seller: item.protect.seller };
}

/* ======================= УХОД ЗА ВЕЩЬЮ ======================= */

export function cleanUp(S, item) {
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
  const price = pawnPrice(S, item);
  earn(S, price, 'Скупка: ' + itemName(item));
  S.stats.profit += price - item.cost;
  for (const th of S.threads) {
    if (th.kind === 'buyer' && !th.closed && th.data.buyer && th.data.buyer.item === item.id) {
      closeThread(S, th, 'Вещь уже продана');
    }
  }
  S.items = S.items.filter((x) => x !== item);
  touch(S);
  return { price };
}

/* ======================= ОБЪЯВЛЕНИЕ ======================= */

export function bumpListing(S, item) {
  if (!item.sale || !item.sale.avito) return null;
  if (item.sale.boostUntil > S.t) return null;
  const cost = bumpCost(item);
  if (!canPay(S, cost)) return null;
  pay(S, cost, 'Поднятие объявления');
  item.sale.boostUntil = S.t + 24;
  item.sale.bumpedAt = S.t;
  touch(S);
  return { cost };
}

/* ======================= ПОДСКАЗКИ ======================= */

export function tellLabel(tell) {
  return TELLS[tell] ? TELLS[tell].n : tell;
}

export function itemVerdictLabel(item) {
  return suspicionLabel(item);
}

export function estimateFor(S, item) {
  return {
    orig: valueOrig(S, item),
    fake: valueFake(S, item),
  };
}
