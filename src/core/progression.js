// Проверка целей и выдача разблокировок.

import { GOALS } from './goals.js';
import { UNLOCKS } from './data/progress.js';
import { netWorth, ratingOf } from './economy.js';
import { notify, unlock, touch } from './kernel.js';
import { updateDaily } from './daily.js';
import { checkCollections } from './collections.js';

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
  // Коллекция засчитывается раньше целей: цель «Собери коллекцию» видит её сразу.
  checkCollections(S);
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
        grantUnlock(S, g.reward.unlock);
      }
    }
    if (g.reward && g.reward.skill) {
      S.prog.sp += g.reward.skill;
      rewardText = ' · очко навыка';
    }
    notify(S, { route: 'goals', title: 'Цель выполнена', text: g.n + rewardText });
  }
  updateDaily(S);
  touch(S);
}

/**
 * Что разблокировка включает в состоянии. Можно звать сколько угодно раз:
 * так делают загрузка сейва и новый сезон.
 */
export function applyUnlock(S, key) {
  if (key === 'supplierRep') {
    S.suppliers.rep.unlocked = true;
  }
  if (key === 'supplierOrig') {
    S.suppliers.orig.unlocked = true;
  }
}

/**
 * Разовый подарок в момент получения. Отдельно от applyUnlock потому, что
 * загрузка сейва звала applyUnlock для всех разблокировок — и каждая
 * перезагрузка страницы дарила ещё неделю PRO.
 */
export function grantUnlock(S, key) {
  if (key === 'proTrial') {
    S.tg.proUntil = Math.max(S.tg.proUntil, S.t) + 7 * 24;
    // Без объяснения подарок выглядел как баг: PRO включалась «сама».
    S.tg.proGift = 'цель «100 подписчиков в канале»';
    S.channels.radar.posts.unshift({
      at: S.t,
      kind: 'pro',
      text: '🎁 У тебя 100 подписчиков — неделя PRO в подарок. Прогноз будет приходить каждое утро в 9:00.',
    });
    S.channels.radar.unread++;
  }
}
