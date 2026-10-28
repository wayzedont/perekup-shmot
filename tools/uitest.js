// Автотест интерфейса: случайные нажатия и поиск мусора на экране.
//
// Подключается прямо в игре:
//   import('/tools/uitest.js').then(m => m.run(800))
// Проверяет, что ни одно нажатие не роняет страницу и что на экране
// не появляется NaN, undefined, [object Object] и прочий мусор.

const BLOCKED = new Set([
  'resetOk',
  'resetAsk',
  'payScam',
  'phishGo',
  'newSeason',
  'exportSave',
  'launchBrand',
]);

const GARBAGE = /\bNaN\b|\bundefined\b|\[object |\bInfinity\b|\bnull\b|\bNo n\b/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Разгоняет состояние, чтобы автотест добрался до переписок и сделок. */
export async function seed(S, core) {
  S.flags.started = 1;
  S.money = 250000;
  S.prog.lvl = 6;
  S.prog.sp = 3;
  S.prog.skills.eye = 4;
  S.prog.skills.bargain = 3;
  S.tg.has = true;
  S.tg.name = 'Тестовый канал';
  S.tg.subs = 3000;
  S.tg.trust = 70;
  S.tg.proUntil = S.t + 200;
  S.suppliers.rep.unlocked = true;
  S.prog.storage.rack = 1;
  S.prog.storage.wardrobe = 1;
  S.prog.unlocks.showcase = 1;
}

export async function run(clicks = 600, opts = {}) {
  const g = window.__game;
  if (!g) throw new Error('Игра не загружена');
  const S = g.S;
  if (opts.seed !== false) await seed(S, g.core);
  g.render();

  const errors = [];
  const acts = new Set();
  const views = new Set();
  let clicked = 0;

  const onError = (e) => errors.push({ kind: 'js', text: String(e.message || e.reason || e) });
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onError);

  for (let i = 0; i < clicks; i++) {
    const candidates = Array.from(document.querySelectorAll('[data-act]')).filter(
      (el) => !el.disabled && !BLOCKED.has(el.dataset.act) && el.offsetParent !== null,
    );
    if (!candidates.length) {
      g.actions.goHome({});
      await sleep(20);
      continue;
    }
    const el = candidates[(Math.random() * candidates.length) | 0];
    acts.add(el.dataset.act);
    try {
      el.click();
      clicked++;
    } catch (e) {
      errors.push({ kind: 'click', act: el.dataset.act, text: e.message });
    }
    await sleep(10);

    views.add((S.ui.app || 'home') + '/' + S.ui.view);
    const text = document.body.innerText || '';
    const hit = text.match(GARBAGE);
    if (hit) {
      const at = text.indexOf(hit[0]);
      errors.push({
        kind: 'мусор на экране',
        act: el.dataset.act,
        view: (S.ui.app || 'home') + '/' + S.ui.view,
        found: hit[0],
        around: text.slice(Math.max(0, at - 70), at + 70).replace(/\n/g, ' | '),
      });
    }
    if (i % 50 === 49) {
      g.actions.goHome({});
      await sleep(16);
    }
  }

  window.removeEventListener('error', onError);
  window.removeEventListener('unhandledrejection', onError);

  return {
    clicked,
    actsCovered: acts.size,
    viewsVisited: Array.from(views).sort(),
    errorCount: errors.length,
    errors: errors.slice(0, 12),
  };
}
