// Шкаф: список вещей и карточка вещи с осмотром, проверкой и продажей.

import { esc, rub, num, plural, dur } from '../../core/util.js';
import { MODELS } from '../../core/data/models.js';
import { TIERS, CONDS, TELLS } from '../../core/data/catalog.js';
import { agoLabel, dateLabel } from '../../core/time.js';
import {
  valueOrig,
  valueFake,
  capacity,
  usedSlots,
  legitCost,
  legitMinutes,
  cleanCost,
  bumpCost,
  pawnPrice,
  daysHeld,
  staleK,
  buyersPerDay,
  hypePct,
  rhythmLabel,
} from '../../core/economy.js';
import { itemName, sizeLabel, shownCondition, colorwayName } from '../../core/items.js';
import { knowledgeOf } from '../../core/notebook.js';
import { saleHint } from '../../core/actions/selling.js';
import {
  thumb,
  bigPhoto,
  itemRow,
  authTag,
  hypeTag,
  defectTag,
  limitedTag,
  inspectPanel,
  emptyState,
  sectionLabel,
} from '../components.js';

export const view = (S) => {
  if (S.ui.view === 'item') return itemView(S, S.ui.id);

  const tab = S.ui.wardrobeTab;
  const items = S.items.filter((i) => (tab === 'all' ? true : tab === 'sale' ? i.sale : !i.sale));
  const tabs = `<div class="tabs">
    <button class="${tab === 'all' ? 'on' : ''}" data-act="wardrobeTab" data-val="all">Все · ${S.items.length}</button>
    <button class="${tab === 'sale' ? 'on' : ''}" data-act="wardrobeTab" data-val="sale">В продаже</button>
    <button class="${tab === 'idle' ? 'on' : ''}" data-act="wardrobeTab" data-val="idle">Лежат</button>
  </div>`;

  const used = usedSlots(S);
  const cap = capacity(S);
  const head = `<div class="card tight">
    <div class="row between"><h3>Место</h3><span class="num">${used}/${cap}</span></div>
    <div class="bar"><i style="width:${Math.min(100, (used / cap) * 100)}%"></i></div>
    <div class="muted">Считая посылки в пути. Больше места — в «Магазине».</div>
  </div>`;

  const sorted = items.slice().sort((a, b) => daysHeld(S, b) - daysHeld(S, a));
  const rows = sorted
    .map((it) => {
      const stale = staleK(S, it);
      const days = Math.floor(daysHeld(S, it));
      const tags = [
        authTag(it),
        limitedTag(it) || hypeTag(S, it),
        defectTag(it),
        it.sale ? (it.sale.avito ? '<span class="tag good">Авитка</span>' : '') : '',
        it.sale && it.sale.tg ? '<span class="tag info">Канал</span>' : '',
        it.sale && !it.sale.asOrig ? '<span class="tag bad">как реплика</span>' : '',
        it.protect && it.protect.until > S.t ? `<span class="tag warn">Защита ${it.protect.until - S.t} ч</span>` : '',
        stale < 0.99 ? `<span class="tag warn">Залежалась −${Math.round((1 - stale) * 100)}%</span>` : '',
      ].join('');
      return itemRow(it, {
        price: it.sale ? rub(it.sale.price) : '~' + rub(valueOrig(S, it)),
        meta: `вложено ${rub(it.cost)}${days >= 3 ? ' · лежит ' + days + ' ' + plural(days, 'день', 'дня', 'дней') : ''}`,
        tags,
        route: `wardrobe/item/${it.id}`,
      });
    })
    .join('');

  return {
    tabs,
    body: head + (rows || emptyState('Пусто. Закупись в секонде, на Авитке или на Пойзоне.')),
  };
};

/* ======================= КАРТОЧКА ВЕЩИ ======================= */

function itemView(S, id) {
  const item = S.items.find((i) => i.id === +id);
  if (!item) return { title: 'Вещь', body: emptyState('Этой вещи больше нет') };
  const m = MODELS[item.m];
  const asOrig = valueOrig(S, item);
  const asFake = valueFake(S, item);
  const buyers = S.threads.filter(
    (t) => t.kind === 'buyer' && !t.closed && t.data.buyer && t.data.buyer.item === item.id,
  );
  const stale = staleK(S, item);
  const days = Math.floor(daysHeld(S, item));
  const know = knowledgeOf(S, item.m);

  const stickers = [authTag(item), limitedTag(item) || hypeTag(S, item), defectTag(item)].join('');

  const actions = [];
  if (item.sale) {
    actions.push(`<button class="btn" data-act="sellSheet" data-id="${item.id}">Изменить объявление</button>`);
    actions.push(`<button class="btn sec" data-act="unlist" data-id="${item.id}">Снять с продажи</button>`);
  } else {
    actions.push(`<button class="btn" data-act="sellSheet" data-id="${item.id}">Выставить на продажу</button>`);
  }
  if (item.sale && item.sale.avito) {
    actions.push(`<button class="btn sec split" data-act="bumpListing" data-id="${item.id}" ${item.sale.boostUntil > S.t ? 'disabled' : ''}>
      <span>${item.sale.boostUntil > S.t ? 'Поднято в поиске' : 'Поднять на Авитке'}</span><span>${rub(bumpCost(item))}</span></button>`);
  }
  if (item.sale && item.sale.tg && S.tg.has) {
    actions.push(`<button class="btn sec" data-act="repost" data-id="${item.id}">Запостить в канал ещё раз</button>`);
  }
  if (!m.noname && !item.legitDone) {
    actions.push(`<button class="btn sec split" data-act="legitCheck" data-id="${item.id}">
      <span>Легит-чек · ${esc(dur(legitMinutes(S)))}</span><span>${rub(legitCost(S, item))}</span></button>`);
  }
  if (item.protect && item.protect.until > S.t && item.verdict === 'fake' && item.protect.declared === 'orig') {
    actions.push(`<button class="btn bad" data-act="dispute" data-id="${item.id}">Открыть спор и вернуть ${rub(item.protect.paid)}</button>`);
  }
  if (!item.photo) {
    actions.push(`<button class="btn sec split" data-act="photoshoot" data-id="${item.id}">
      <span>Фотосессия на белом фоне</span><span>${rub(500)}</span></button>`);
  }
  if (item.sale && !item.sale.description) {
    actions.push(`<button class="btn sec" data-act="writeDesc" data-id="${item.id}">Написать подробное описание · 20 мин</button>`);
  }
  const fixable = item.defects.filter((d) => d.fixable).length;
  if ((item.cond >= 3 || fixable) && !item.cleaned) {
    actions.push(`<button class="btn sec split" data-act="cleanItem" data-id="${item.id}">
      <span>${m.cat === 'shoes' ? 'Чистка кроссовок' : 'Химчистка'} · 3 ч</span><span>${rub(cleanCost(S, item))}</span></button>`);
  }
  if (S.tg.has && !item.sale) {
    actions.push(`<button class="btn sec" data-act="giveawaySheet" data-id="${item.id}">Разыграть в канале</button>`);
  }
  actions.push(`<button class="btn sec split" data-act="pawnSheet" data-id="${item.id}">
    <span>Сдать в скупку сразу</span><span>${rub(pawnPrice(S, item))}</span></button>`);

  const body = `
    ${bigPhoto(item, stickers)}
    <div class="card">
      <h3>${esc(itemName(item))}</h3>
      <div class="spec">
        <div><span>Размер</span>${esc(sizeLabel(item))}</div>
        <div><span>Состояние</span>${esc(shownCondition(item).n)}</div>
        <div><span>Расцветка</span>${esc(colorwayName(item) || '—')}</div>
        <div><span>Сегмент</span>${esc(TIERS[m.tier].n)}</div>
        <div><span>Откуда</span>${esc(item.src || '—')}</div>
        <div><span>Лежит</span>${days} ${plural(days, 'день', 'дня', 'дней')}</div>
      </div>
      <div class="kv"><span>Себестоимость</span><span>${rub(item.cost)}</span></div>
      <div class="kv"><span>На рынке как оригинал</span><span>~${rub(asOrig)}</span></div>
      ${m.noname ? '' : `<div class="kv"><span>Как реплика</span><span>~${rub(asFake)}</span></div>`}
      <div class="kv"><span>Ликвидность модели</span><span>${hypePct(S, item.m)}%</span></div>
      ${stale < 0.99 ? `<div class="callout">Вещь залежалась: цена уже на ${Math.round((1 - stale) * 100)}% ниже. Замороженные деньги — это тоже убыток.</div>` : ''}
      ${
        item.protect && item.protect.until > S.t
          ? `<div class="callout info">Защита покупателя Авитки: ещё ${item.protect.until - S.t} ч. Продавец писал «${item.protect.declared === 'orig' ? 'оригинал' : 'реплика'}». Успей проверить.</div>`
          : ''
      }
    </div>
    ${inspectPanel(S, item, { mode: 'hand', act: 'inspectItem', ctx: item.id })}
    ${
      know
        ? `<div class="card tight"><h4>Из твоей книжки</h4>
          <div class="muted">Проверено ${know.checked} ${plural(know.checked, 'раз', 'раза', 'раз')}, из них паль — ${know.fakes}.${
            know.tells.length ? ' Чаще всего палится по признаку «' + know.tells[0].name.toLowerCase() + '».' : ''
          }</div></div>`
        : ''
    }
    ${
      buyers.length
        ? `<div class="card"><h3>Покупатели</h3>${buyers
            .map(
              (t) => `<button class="btn sec full split" data-act="go" data-route="${t.platform}/thread/${t.id}">
                <span>${esc(t.name)} · ${t.platform === 'tg' ? 'канал' : 'Авитка'}</span>
                <span>${t.data.buyer.agreed ? 'договорились ' + rub(t.data.buyer.price) : rub(t.data.buyer.offer)}</span></button>`,
            )
            .join('')}</div>`
        : ''
    }
    ${item.sale ? saleCard(S, item) : ''}
    <div class="card"><h3>Действия</h3><div class="stack">${actions.join('')}</div></div>`;

  return { title: m.b + ' ' + m.n, body };
}

function saleCard(S, item) {
  const hint = saleHint(S, item, item.sale.price, item.sale.asOrig, item.sale.avito, item.sale.tg);
  const stale = S.t - Math.max(item.sale.listedAt, item.sale.bumpedAt || 0) > 48;
  return `<div class="card">
    <h3>Объявление</h3>
    <div class="kv"><span>Цена</span><span>${rub(item.sale.price)}</span></div>
    <div class="kv"><span>Заявлено как</span><span class="${item.sale.asOrig && item.verdict === 'fake' ? 'neg' : ''}">${item.sale.asOrig ? 'оригинал' : 'реплика'}</span></div>
    <div class="kv"><span>Где</span><span>${[item.sale.avito ? 'Авитка' : '', item.sale.tg ? 'канал' : ''].filter(Boolean).join(', ')}</span></div>
    <div class="kv"><span>Просмотры</span><span>${item.sale.views}</span></div>
    <div class="kv"><span>Ждать покупателя</span><span>${esc(hint.etaText)}</span></div>
    <div class="kv"><span>Сегодня</span><span class="${rhythmLabel(S).tone === 'good' ? 'pos' : rhythmLabel(S).tone === 'warn' ? 'neg' : ''}">${esc(rhythmLabel(S).n)}</span></div>
    ${stale && item.sale.avito && !(item.sale.boostUntil > S.t) ? '<div class="callout">Объявление опустилось в поиске. Подними его.</div>' : ''}
    <div class="muted">${hint.perDay < 0.05 ? 'По этой цене почти никто не пишет' : `≈ ${hint.perDay.toFixed(1)} покупателя в день`} · ${esc(hint.verdict)} · прибыль ${hint.profit >= 0 ? '+' : ''}${rub(hint.profit)}</div>
  </div>`;
}
