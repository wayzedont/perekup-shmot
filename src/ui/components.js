// Общие куски разметки: карточки вещей, метки, панель осмотра.

import { esc, rub, num, plural, dur } from '../core/util.js';
import { MODELS } from '../core/data/models.js';
import { TELLS, CONDS, TIERS, CATS } from '../core/data/catalog.js';
import { itemName, colorwayName, sizeLabel, shownCondition } from '../core/items.js';
import { suspicionLabel, tellsFor, tellNote, inspectMinutes } from '../core/inspect.js';
import { hypePct, itemHype } from '../core/economy.js';
import { hintFor, sortedTells, knowledgeOf } from '../core/notebook.js';
import { itemArt, artBackdrop } from './art.js';
import { avatar, join } from './dom.js';

/* ======================= МЕТКИ ======================= */

export function authTag(item) {
  const v = suspicionLabel(item);
  const cls = v.tone === 'good' ? 'good' : v.tone === 'bad' ? 'bad' : v.tone === 'warn' ? 'warn' : '';
  return `<span class="tag ${cls}">${esc(v.n)}</span>`;
}

export function hypeTag(S, item) {
  const m = MODELS[item.m];
  if (m.noname) return '';
  const h = Math.round(itemHype(S, item) * 100);
  if (h >= 80) return `<span class="tag good">Ликвид ${h}%</span>`;
  if (h >= 55) return `<span class="tag info">Ходовая ${h}%</span>`;
  if (h <= 25) return `<span class="tag">Неликвид ${h}%</span>`;
  return `<span class="tag">${h}%</span>`;
}

export function defectTag(item) {
  if (!item.defects || !item.defects.length) return '';
  if (!item.condSeen) return '';
  return `<span class="tag warn">${item.defects.length} ${plural(item.defects.length, 'дефект', 'дефекта', 'дефектов')}</span>`;
}

export function limitedTag(item) {
  return item.limitedName ? '<span class="tag vip">Лимитка</span>' : '';
}

/* ======================= КАРТОЧКИ ======================= */

export function thumb(item) {
  return `<div class="thumb" style="background:${artBackdrop(item)}">${itemArt(item)}</div>`;
}

export function bigPhoto(item, stickers, corner) {
  return `<div class="photo" style="background:${artBackdrop(item)}">${itemArt(item)}
    ${stickers ? `<div class="stickers">${stickers}</div>` : ''}
    ${corner ? `<div class="corner">${corner}</div>` : ''}</div>`;
}

/**
 * Строка-карточка вещи.
 * opts: { price, meta, tags, route, action, id }
 */
export function itemRow(item, opts = {}) {
  const cw = colorwayName(item);
  const inner = `${thumb(item)}
    <div class="item-info">
      <div class="item-title">${esc(itemName(item))}</div>
      ${opts.price !== undefined ? `<div class="item-price">${opts.price}</div>` : ''}
      <div class="item-meta">${esc(sizeLabel(item))} · ${esc(shownCondition(item).short)}${cw ? ' · ' + esc(cw.toLowerCase()) : ''}</div>
      ${opts.meta ? `<div class="item-meta">${opts.meta}</div>` : ''}
      ${opts.tags ? `<div class="tags">${opts.tags}</div>` : ''}
    </div>`;
  if (opts.route) {
    return `<button class="item-row" data-act="go" data-route="${opts.route}">${inner}</button>`;
  }
  if (opts.action) {
    return `<button class="item-row" data-act="${opts.action}" data-id="${opts.id !== undefined ? opts.id : item.id}">${inner}</button>`;
  }
  return `<div class="item-row">${inner}</div>`;
}

/* ======================= ПАНЕЛЬ ОСМОТРА ======================= */

/**
 * Сетка признаков. mode: 'hand' | 'photo'.
 * act — действие на клик, ctx — что передать (id вещи или слота).
 */
export function inspectPanel(S, item, { mode, act, ctx, title }) {
  const m = MODELS[item.m];
  if (m.noname) {
    return `<div class="card"><h3>Осмотр</h3><div class="muted">Ноунейм никто не подделывает. Смотреть нечего — только состояние.</div>
      ${conditionButton(S, item, act + 'Cond', ctx)}</div>`;
  }
  const available = tellsFor(item, mode);
  const ordered = sortedTells(S, item.m, available);
  const hint = hintFor(S, item.m);
  const mins = inspectMinutes(S);

  const rows = ordered
    .map((t) => {
      const seen = item.seen && item.seen[t];
      const note = seen ? tellNote(item, t) : null;
      const isHint = hint && hint.tell === t && !seen;
      const cls = join([`tell`, seen || '', isHint ? 'hint-top' : ''], ' ');
      const inner = `
        <div class="dot"></div>
        <div>
          <div class="tn">${esc(TELLS[t].n)}</div>
          <div class="td">${esc(note ? note.text : TELLS[t].d)}</div>
        </div>
        <div class="cost">${seen ? '' : dur(mins)}</div>`;
      return seen
        ? `<div class="${cls}">${inner}</div>`
        : `<button class="${cls}" data-act="${act}" data-id="${ctx}" data-tell="${t}">${inner}</button>`;
    })
    .join('');

  const missing = mode === 'photo' ? '<div class="muted">По фото запах не проверить, а ошибиться проще. На встрече видно всё.</div>' : '';

  return `<div class="card">
    <div class="row between"><h3>${esc(title || 'Осмотр')}</h3><span class="muted">${esc(suspicionLabel(item).n)}</span></div>
    ${hint ? `<div class="tell-hint">💡 ${esc(hint.text)}</div>` : ''}
    <div class="tell-grid">${rows}</div>
    ${missing}
    ${conditionButton(S, item, act + 'Cond', ctx)}
  </div>`;
}

export function conditionButton(S, item, act, ctx) {
  if (item.condSeen) {
    if (!item.defects.length) return '<div class="muted">Состояние проверено: скрытых дефектов нет.</div>';
    return `<div class="callout">Нашёл: ${esc(item.defects.map((d) => d.n.toLowerCase()).join(', '))}. Состояние на деле «${esc(CONDS[item.cond].short)}».</div>`;
  }
  const mins = Math.max(4, Math.round(inspectMinutes(S) * 0.6));
  return `<button class="btn sec full split" data-act="${act}" data-id="${ctx}">
    <span>Осмотреть состояние</span><span class="muted">${esc(dur(mins))}</span></button>`;
}

/* ======================= ПРОЧЕЕ ======================= */

export function starsRow(n) {
  return `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
}

export function barRow(label, pct, right, color) {
  return `<div class="liq-row"><span>${label}</span>
    <div class="bar"><i style="width:${Math.max(2, Math.min(100, pct))}%${color ? ';background:' + color : ''}"></i></div>
    <b class="num">${right}</b></div>`;
}

export function emptyState(text, action) {
  return `<div class="empty"><div>${text}</div>${action || ''}</div>`;
}

export function sectionLabel(text) {
  return `<div class="section-label">${esc(text)}</div>`;
}

export function moneyLine(label, value, cls) {
  return `<div class="kv"><span>${esc(label)}</span><span class="${cls || ''}">${value}</span></div>`;
}

/** Компактный график капитала. */
export function sparkline(history, color) {
  if (!history || history.length < 2) return '';
  const vals = history.map((h) => h.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const W = 300;
  const H = 100;
  const pts = history.map((h, i) => [
    (i / (history.length - 1)) * W,
    H - 8 - ((h.value - min) / (max - min || 1)) * (H - 20),
  ]);
  const line = pts.map((pt) => pt[0].toFixed(1) + ',' + pt[1].toFixed(1)).join(' ');
  const area = `M0 ${H} ` + pts.map((pt) => `L${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' ') + ` L${W} ${H}Z`;
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${area}" fill="${color}22"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/>
  </svg></div>`;
}

export { avatar, join };
