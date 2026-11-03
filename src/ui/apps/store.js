// Апстор: откуда на телефоне берутся новые приложения.
//
// Приложение можно скачать, когда до него дошло обучение: Тимур звонит и
// просит «качай». Остальные видны как «Скоро» — с подсказкой, когда
// откроются: так игрок заранее знает, что его ждёт.

import { esc, rub } from '../../core/util.js';
import { installed } from '../../core/kernel.js';
import { APP_DEFS, STORE_APPS, UPGRADES, upgraded } from '../../core/data/apps.js';
import { upgradeBlock } from '../../core/actions/finance.js';
import { icon, APP_BY_ID } from '../dom.js';

/** Сколько длится «скачивание», мс. */
export const DOWNLOAD_MS = 1600;

/** Что сейчас качается: id → когда начали. Только экран, не сейв. */
const downloads = {};

export function startDownload(id) {
  if (!downloads[id]) downloads[id] = Date.now();
}

export function finishDownload(id) {
  delete downloads[id];
}

/** Открыла ли его уже глава обучения. */
export function unlocked(S, id) {
  const T = S.tut;
  if (!T || T.done) return true;
  const part = APP_DEFS[id].unlock;
  return T.ended[part] !== undefined || (T.active && T.part === part);
}

/** Можно скачать прямо сейчас. */
export function downloadable(S) {
  return STORE_APPS.filter((id) => !installed(S, id) && unlocked(S, id));
}

function tile(id, size) {
  const a = APP_BY_ID[id];
  return `<div class="st-tile${size ? ' ' + size : ''}" style="background:${a.bg}">${icon(id)}</div>`;
}

function stars(r) {
  const full = Math.round(r);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function actionButton(S, id) {
  if (installed(S, id)) return `<button class="st-btn open" data-act="openApp" data-app="${id}">Открыть</button>`;
  if (downloads[id]) {
    const spent = Math.min(DOWNLOAD_MS, Date.now() - downloads[id]);
    return `<span class="st-btn ring" aria-label="Загрузка"><svg viewBox="0 0 36 36">
        <circle class="track" cx="18" cy="18" r="15"/>
        <circle class="prog" cx="18" cy="18" r="15" style="animation-duration:${DOWNLOAD_MS}ms;animation-delay:-${spent}ms"/>
      </svg><i></i></span>`;
  }
  if (unlocked(S, id)) return `<button class="st-btn get" data-act="installApp" data-app="${id}">Загрузить</button>`;
  return '<span class="st-btn soon">Скоро</span>';
}

function row(S, id) {
  const d = APP_DEFS[id];
  const soon = !installed(S, id) && !unlocked(S, id);
  return `<div class="st-row" data-tut="store-${id}">
    <button class="st-main" data-act="go" data-route="store/${id}">
      ${tile(id)}
      <span class="st-text"><b>${esc(d.n)}</b><span>${esc(soon ? d.soon : d.tagline)}</span>
        <small>${stars(d.rating)} ${d.rating.toFixed(1)} · ${d.size} МБ</small></span>
    </button>
    ${actionButton(S, id)}
  </div>`;
}

/* --- Прокачка: Pro-версии стоящих приложений --- */

function upButton(S, id) {
  if (upgraded(S, id)) return '<span class="st-btn soon">Есть</span>';
  const why = upgradeBlock(S, id);
  if (why) return '<span class="st-btn soon">Скоро</span>';
  return `<button class="st-btn get" data-act="go" data-route="store/up-${id}">${esc(rub(UPGRADES[id].price))}</button>`;
}

function upRow(S, id) {
  const u = UPGRADES[id];
  const why = !upgraded(S, id) && upgradeBlock(S, id);
  return `<div class="st-row">
    <button class="st-main" data-act="go" data-route="store/up-${id}">
      ${tile(u.app)}
      <span class="st-text"><b>${esc(u.n)} <i class="st-pro">PRO</i></b><span>${esc(u.tagline)}</span>
        <small>${esc(why || (upgraded(S, id) ? 'Подключено' : 'Навсегда, без подписки'))}</small></span>
    </button>
    ${upButton(S, id)}
  </div>`;
}

function upgradeView(S, id) {
  const u = UPGRADES[id];
  if (!u) return mainView(S);
  const why = upgradeBlock(S, id);
  const own = upgraded(S, id);
  return {
    title: u.n,
    body: `<div class="st-detail">
        ${tile(u.app, 'huge')}
        <div class="st-text"><b>${esc(u.n)} <i class="st-pro">PRO</i></b><span>${esc(APP_DEFS[u.app].dev)}</span></div>
      </div>
      <div class="card"><h3>Что даёт</h3>
        ${u.perks.map((p) => `<div class="goal"><div class="mark">${own ? '✓' : ''}</div><div class="gn">${esc(p)}</div><span></span></div>`).join('')}
        <div class="muted">Покупка навсегда. Деньги спишутся с карты.</div>
      </div>`,
    foot: own
      ? '<button class="btn full" disabled>Уже подключено</button>'
      : why
        ? `<button class="btn full" disabled>${esc(why)}</button>`
        : `<button class="btn full" data-act="buyUpgrade" data-id="${id}">Купить за ${esc(rub(u.price))}</button>`,
  };
}

function mainView(S) {
  const ready = downloadable(S);
  const featured = ready[0];
  const hero = featured
    ? `<div class="st-hero" data-tut="store-hero">
        <div class="st-label">Тимур советует</div>
        <div class="st-hero-row">${tile(featured, 'big')}
          <div class="st-text"><b>${esc(APP_DEFS[featured].n)}</b><span>${esc(APP_DEFS[featured].tagline)}</span></div>
        </div>
        <div class="st-hero-btn">${actionButton(S, featured)}</div>
      </div>`
    : '';
  const installedCount = STORE_APPS.filter((id) => installed(S, id)).length;
  return {
    title: 'Апстор',
    body: `${hero}
      <div class="st-sec">Для перекупа</div>
      <div class="card st-list">${STORE_APPS.map((id) => row(S, id)).join('')}</div>
      ${
        STORE_APPS.some((id) => installed(S, id) && unlocked(S, id)) && (!S.tut || S.tut.done || S.tut.ended.tg !== undefined)
          ? `<div class="st-sec">Прокачка</div>
            <div class="card st-list">${Object.keys(UPGRADES).map((id) => upRow(S, id)).join('')}</div>`
          : ''
      }
      <div class="muted st-note">${
        installedCount === STORE_APPS.length
          ? 'Всё нужное для дела уже на телефоне.'
          : 'Новые приложения открываются, когда Тимур про них рассказывает.'
      }</div>`,
  };
}

function detailView(S, id) {
  const d = APP_DEFS[id];
  if (!d || !STORE_APPS.includes(id)) return mainView(S);
  const soon = !installed(S, id) && !unlocked(S, id);
  return {
    title: d.n,
    body: `<div class="st-detail">
        ${tile(id, 'huge')}
        <div class="st-text"><b>${esc(d.n)}</b><span>${esc(d.dev)}</span>${actionButton(S, id)}</div>
      </div>
      <div class="st-stats">
        <div><b>${d.rating.toFixed(1)}</b><span>${stars(d.rating)}</span><small>${esc(d.votes)} оценок</small></div>
        <div><b>${esc(d.age)}</b><span>возраст</span></div>
        <div><b>${d.size}</b><span>МБ</span></div>
      </div>
      ${soon ? `<div class="callout">${esc(d.soon)}</div>` : ''}
      <div class="card"><h3>Описание</h3><div class="muted">${esc(d.about)}</div></div>`,
  };
}

export const view = (S) => {
  const v = S.ui.view;
  if (v && v.startsWith('up-')) return upgradeView(S, v.slice(3));
  return v && v !== 'main' ? detailView(S, v) : mainView(S);
};
