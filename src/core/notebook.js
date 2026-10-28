// Записная книжка перекупа.
//
// Каждый раз, когда правда о вещи подтверждается — легит-чеком, спором,
// претензией покупателя — игра записывает, по какому признаку палилась подделка.
// Через пару недель книжка превращается в настоящее знание: «у Данок смотри
// подошву, у Теч Флиса — молнию». Это прогресс, который не покупается уровнем.

import { MODELS } from './data/models.js';
import { TELLS } from './data/catalog.js';
import { plural } from './util.js';

export function emptyNotebook() {
  return {};
}

function entry(S, mi) {
  let e = S.notebook[mi];
  if (!e) {
    e = { checked: 0, fakes: 0, tells: {}, lastAt: 0, bought: 0, sold: 0, profit: 0 };
    S.notebook[mi] = e;
  }
  return e;
}

/** Запомнить подтверждённую правду о вещи. */
export function recordTruth(S, item) {
  const e = entry(S, item.m);
  e.checked++;
  e.lastAt = S.t;
  if (!item.real) {
    e.fakes++;
    // Какие признаки у этой подделки реально были кривыми.
    for (const tell of Object.keys(item.flaws || {})) {
      if (item.flaws[tell] >= 0.5) e.tells[tell] = (e.tells[tell] || 0) + 1;
    }
  }
}

/** Запомнить сделку — для статистики «что приносит деньги». */
export function recordDeal(S, item, profit) {
  const e = entry(S, item.m);
  e.sold++;
  e.profit += profit;
}

export function recordPurchase(S, item) {
  entry(S, item.m).bought++;
}

/** Что игрок знает об этой модели. */
export function knowledgeOf(S, mi) {
  const e = S.notebook[mi];
  if (!e || !e.checked) return null;
  const tells = Object.entries(e.tells)
    .map(([tell, n]) => ({ tell, n, name: TELLS[tell].n }))
    .sort((a, b) => b.n - a.n);
  return {
    checked: e.checked,
    fakes: e.fakes,
    fakeRate: e.checked ? e.fakes / e.checked : 0,
    tells,
    bought: e.bought,
    sold: e.sold,
    profit: e.profit,
    confident: e.fakes >= 3,
  };
}

/** Подсказка, с какого признака начинать осмотр этой модели. */
export function hintFor(S, mi) {
  const k = knowledgeOf(S, mi);
  if (!k || !k.tells.length || k.fakes < 2) return null;
  const top = k.tells[0];
  return {
    tell: top.tell,
    text: `Чаще всего палится по признаку «${top.name.toLowerCase()}»: ${top.n} из ${k.fakes} ${plural(
      k.fakes,
      'подделки',
      'подделок',
      'подделок',
    )}.`,
  };
}

/** Признаки, отсортированные так, чтобы сначала шли самые полезные. */
export function sortedTells(S, mi, tells) {
  const k = knowledgeOf(S, mi);
  if (!k) return tells;
  const rank = {};
  for (const t of k.tells) rank[t.tell] = t.n;
  return tells.slice().sort((a, b) => (rank[b] || 0) - (rank[a] || 0));
}

/** Сводка для приложения «Книжка»: по каким моделям есть знание. */
export function notebookRows(S) {
  const rows = [];
  for (const mi of Object.keys(S.notebook)) {
    const k = knowledgeOf(S, +mi);
    if (!k) continue;
    rows.push({ model: MODELS[+mi], ...k });
  }
  return rows.sort((a, b) => b.checked - a.checked);
}

/** Сколько моделей изучено «уверенно» — для целей и статуса. */
export function studiedCount(S) {
  return notebookRows(S).filter((r) => r.confident).length;
}
