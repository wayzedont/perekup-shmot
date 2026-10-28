// Секонд «Мешок»: полка с вещами и карточка каждой вещи с осмотром.
// Осмотр стоит времени, а хорошее разбирают по часам — поэтому
// «что смотреть» это главное решение утра понедельника.

import { esc, rub, num, plural, dur } from '../../core/util.js';
import { MODELS } from '../../core/data/models.js';
import { TIERS, CONDS } from '../../core/data/catalog.js';
import { hourIndex, dayIndex, nextRestock, isSecondOpen, weekdayAt, SCHEDULE } from '../../core/time.js';
import { RIVAL_NAME } from '../../core/rival.js';
import { valueOrig, valueFake, freeSlots, hypePct } from '../../core/economy.js';
import { itemName, sizeLabel, shownCondition, colorwayName } from '../../core/items.js';
import { findSlot, priceNow, discountK, assortmentLabel, secondPool } from '../../core/market/second.js';
import { inspectMinutes } from '../../core/inspect.js';
import { knowledgeOf } from '../../core/notebook.js';
import {
  thumb,
  bigPhoto,
  itemRow,
  authTag,
  hypeTag,
  defectTag,
  inspectPanel,
  emptyState,
  sectionLabel,
} from '../components.js';

export const view = (S) => {
  if (S.ui.view === 'item') return slotView(S, S.ui.id);

  const open = isSecondOpen(S.t);
  const h = hourIndex(S.t);
  const dw = weekdayAt(S.t);
  const restock = nextRestock(S.t);
  const disc = Math.round((1 - discountK(S)) * 100);
  const isRestockDay = dw === 1 || dw === 4;

  const headline = isRestockDay
    ? h < 10
      ? 'Завоз в 10:00'
      : dw === 1
        ? 'Большой завоз!'
        : 'Подвоз'
    : disc > 0
      ? `Скидка −${disc}%`
      : 'Обычный день';

  const inspected = S.second.items.filter((x) => Object.keys(x.item.seen || {}).length).length;
  const mins = inspectMinutes(S);

  const hero = `<div class="hero" style="background:#e0661c">
    <div class="label">Секонд «Мешок» · ${open ? 'открыто до 21:00' : 'закрыто, откроемся в 10:00'}</div>
    <div style="font-family:var(--f-disp);font-size:24px">${esc(headline)}</div>
    <div class="sub">Ценник ставят по бирке, поэтому оригинал и паль стоят одинаково. Половина брендовых вещей — подделка.</div>
    <div class="sub">Следующий завоз: ${esc(restock.label)}</div>
  </div>`;

  const info = `<div class="card tight">
    <div class="kv"><span>Ассортимент сейчас</span><span>${esc(assortmentLabel(S))}</span></div>
    <div class="kv"><span>На осмотр одного признака</span><span>${esc(dur(mins))}</span></div>
    <div class="kv"><span>Осмотрел вещей</span><span>${inspected} из ${S.second.items.length}</span></div>
    <div class="muted">Хорошее разберут за несколько часов. Всё не осмотришь — выбирай, во что вложить время.</div>
  </div>`;

  // Гонка с Мироном должна быть видна там, где она происходит.
  const rival = isRestockDay
    ? h < SCHEDULE.secondOpen
      ? `<div class="callout">${esc(RIVAL_NAME)} будет здесь к открытию. Кто приехал к десяти, тот и выбирает первым.</div>`
      : h === SCHEDULE.secondOpen
        ? `<div class="callout good">Ты здесь к открытию — выбираешь наравне с ${esc(RIVAL_NAME)}ом.</div>`
        : S.rival.raidDay === dayIndex(S.t)
          ? `<div class="callout warn">${esc(RIVAL_NAME)} был тут в десять. Лучшее он уже снял.</div>`
          : ''
    : '';

  const list = S.second.items.slice().reverse();
  const rows = list
    .map((slot) => {
      const it = slot.item;
      const m = MODELS[it.m];
      const seen = Object.keys(it.seen || {}).length;
      const tags = [
        slot.reserved && slot.reserved > S.t ? '<span class="tag vip">отложено для тебя</span>' : '',
        m.noname ? '<span class="tag">Ноунейм</span>' : authTag(it),
        m.noname ? '' : hypeTag(S, it),
        defectTag(it),
        seen ? `<span class="tag info">осмотрено ${seen}</span>` : '',
      ].join('');
      return itemRow(it, {
        price: rub(priceNow(S, slot)),
        meta: m.noname ? '' : `как ориг ~${rub(valueOrig(S, { ...it, cond: it.shownCond }))}`,
        tags,
        route: `second/item/${slot.id}`,
      });
    })
    .join('');

  return {
    body:
      hero +
      info +
      rival +
      (open ? '' : '<div class="callout">Секонд закрыт. Работает с 10:00 до 21:00.</div>') +
      (rows || emptyState('Всё разобрали. Приходи к следующему завозу.')),
  };
};

/* ======================= КАРТОЧКА НА ПОЛКЕ ======================= */

function slotView(S, id) {
  const slot = findSlot(S, id);
  if (!slot) return { title: 'Вещь', body: emptyState('Эту вещь уже забрали.') };
  const item = slot.item;
  const m = MODELS[item.m];
  const price = priceNow(S, slot);
  const shown = { ...item, cond: item.shownCond };
  const asOrig = valueOrig(S, shown);
  const asFake = valueFake(S, item);
  const open = isSecondOpen(S.t);
  const know = knowledgeOf(S, item.m);

  const stickers = [m.noname ? '<span class="tag">Ноунейм</span>' : authTag(item), defectTag(item)].join('');

  const body = `
    ${bigPhoto(item, stickers)}
    <div class="card">
      <h3>${esc(itemName(item))}</h3>
      <div class="money" style="font-size:25px">${rub(price)}</div>
      <div class="spec">
        <div><span>Размер</span>${esc(sizeLabel(item))}</div>
        <div><span>Состояние на бирке</span>${esc(shownCondition(item).n)}</div>
        <div><span>Расцветка</span>${esc(colorwayName(item) || '—')}</div>
        <div><span>Сегмент</span>${esc(TIERS[m.tier].n)}</div>
      </div>
      ${
        m.noname
          ? '<div class="muted">Ноунейм. Подделывать такое некому, но и спрос соответствующий.</div>'
          : `<div class="kv"><span>Если оригинал</span><span class="pos">~${rub(asOrig)}</span></div>
             <div class="kv"><span>Если паль</span><span class="neg">~${rub(asFake)}</span></div>
             <div class="tags">${hypeTag(S, item)}</div>`
      }
    </div>
    ${inspectPanel(S, item, { mode: 'hand', act: 'inspectSlot', ctx: slot.id })}
    ${
      know
        ? `<div class="card tight"><h4>Из твоей книжки</h4>
          <div class="muted">${esc(itemName(item))}: проверено ${know.checked} ${plural(know.checked, 'раз', 'раза', 'раз')}, паль была ${know.fakes} ${plural(know.fakes, 'раз', 'раза', 'раз')}.</div></div>`
        : ''
    }`;

  const foot = `<button class="btn full" data-act="buySecond" data-id="${slot.id}" ${open && freeSlots(S) > 0 ? '' : 'disabled'}>
      Купить за ${rub(price)}
    </button>
    <div class="muted" style="text-align:center">${
      !open ? 'Секонд закрыт' : freeSlots(S) <= 0 ? 'Шкаф забит' : 'Ценник по бирке: продавщицы не отличают ориг от пали'
    }</div>`;

  return { title: 'Секонд', body, foot };
}
