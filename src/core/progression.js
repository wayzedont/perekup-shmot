// Проверка целей и выдача разблокировок.

import { GOALS } from './goals.js';
import { UNLOCKS } from './data/progress.js';
import { netWorth, ratingOf } from './economy.js';
import { notify, unlock, touch } from './kernel.js';

/** Контекст, который дорого считать на каждую цель отдельно. */
function context(S) {
  const nw = netWorth(S);
  const all = [...(S.bgRivals || []).map((r) => r.nw), S.rival.nw];
  return {
    nw,
    rating: ratingOf(S),
    rank: 1 + all.filter((v) => v > nw).length,
  };
}

export function checkGoals(S) {
  const ctx = context(S);
  for (const g of GOALS) {
    if (S.goals[g.id]) continue;
    let ok = false;
    try {
      ok = !!g.check(S, ctx);
    } catch (e) {
      ok = false;
    }
    if (!ok) continue;
    S.goals[g.id] = S.t;
    let rewardText = '';
    if (g.reward && g.reward.unlock) {
      if (unlock(S, g.reward.unlock)) {
        const u = UNLOCKS[g.reward.unlock];
        rewardText = ' · ' + (u ? u.n : g.reward.unlock);
        applyUnlock(S, g.reward.unlock);
      }
    }
    if (g.reward && g.reward.skill) {
      S.prog.sp += g.reward.skill;
      rewardText = ' · очко навыка';
    }
    notify(S, { route: 'goals', title: 'Цель выполнена', text: g.n + rewardText });
  }
  touch(S);
}

/** Немедленные последствия разблокировки. */
export function applyUnlock(S, key) {
  if (key === 'supplierRep') {
    S.suppliers.rep.unlocked = true;
  }
  if (key === 'supplierOrig') {
    S.suppliers.orig.unlocked = true;
  }
  if (key === 'proTrial') {
    S.tg.proUntil = Math.max(S.tg.proUntil, S.t) + 7 * 24;
  }
}
