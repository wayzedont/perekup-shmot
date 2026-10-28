// Записная книжка перекупа.
//
// Здесь копится то, что нельзя купить за деньги: знание, по какому признаку
// палится какая модель. Через пару недель игры эта страница и есть твой
// настоящий прогресс — не уровень, а то, что ты реально понимаешь.

import { esc, rub, num, plural } from '../../core/util.js';
import { MODELS } from '../../core/data/models.js';
import { TELLS, TIERS, CATS } from '../../core/data/catalog.js';
import { dateLabel } from '../../core/time.js';
import { notebookRows, studiedCount } from '../../core/notebook.js';
import { hypePct } from '../../core/economy.js';
import { thumb, emptyState, sectionLabel, barRow } from '../components.js';

export const view = (S) => {
  const rows = notebookRows(S);
  const studied = studiedCount(S);

  const head = `<div class="card">
    <h3>Что ты уже понял про рынок</h3>
    <div class="kv"><span>Моделей проверено</span><span>${rows.length}</span></div>
    <div class="kv"><span>Изучено уверенно</span><span>${studied}</span></div>
    <div class="kv"><span>Всего осмотров</span><span>${S.stats.inspections}</span></div>
    <div class="muted">Книжка сама запоминает, по какому признаку палилась подделка — после каждого легит-чека, спора или претензии. Чем больше проверяешь, тем точнее подсказки на осмотре.</div>
  </div>`;

  if (!rows.length) {
    return {
      title: 'Книжка',
      body:
        head +
        emptyState(
          'Пока пусто. Сделай легит-чек любой брендовой вещи — и здесь появится первая запись.',
          '<button class="btn sm" data-act="go" data-route="wardrobe/main">Открыть шкаф</button>',
        ),
    };
  }

  const cards = rows
    .map((r) => {
      const m = r.model;
      const probe = { m: m.i, way: 0, cond: 0, shownCond: 0, condSeen: true, defects: [] };
      const fakePct = Math.round(r.fakeRate * 100);
      const bars = r.tells.length
        ? `<div class="tell-bars">${r.tells
            .map((t) => {
              const pct = r.fakes ? Math.round((t.n / r.fakes) * 100) : 0;
              return `<div class="tell-bar"><span>${esc(t.name)}</span>
                <div class="bar"><i style="width:${Math.max(4, pct)}%;background:var(--bad)"></i></div>
                <b class="num">${t.n}/${r.fakes}</b></div>`;
            })
            .join('')}</div>`
        : '<div class="muted">Подделок этой модели ты ещё не ловил.</div>';

      return `<div class="note-row">
        <div class="nh">
          <span class="nm">${esc(m.full)}</span>
          <span class="muted">${esc(TIERS[m.tier].n)} · ликвид ${hypePct(S, m.i)}%</span>
        </div>
        <div class="kv"><span>Проверено</span><span>${r.checked} ${plural(r.checked, 'раз', 'раза', 'раз')}</span></div>
        <div class="kv"><span>Из них паль</span><span class="${fakePct > 50 ? 'neg' : ''}">${r.fakes} (${fakePct}%)</span></div>
        ${bars}
        ${
          r.confident && r.tells.length
            ? `<div class="callout ok">Запомнил: у этой модели в первую очередь смотри «${esc(r.tells[0].name.toLowerCase())}».</div>`
            : r.fakes >= 1
              ? '<div class="muted">Нужно поймать ещё пару подделок, чтобы закономерность стала надёжной.</div>'
              : ''
        }
        ${
          r.sold
            ? `<div class="kv"><span>Продано</span><span>${r.sold} шт, ${r.profit >= 0 ? '+' : ''}${rub(r.profit)}</span></div>`
            : ''
        }
      </div>`;
    })
    .join('');

  return { title: 'Книжка', body: head + sectionLabel('По моделям') + cards };
};
