// Экран переписки. Общий для Авитки и Телеги.
// Низ экрана меняется в зависимости от того, с кем ты говоришь:
// у продавца это ходы в торге, у покупателя — ответы, у клиента — подбор вещи.

import { esc, rub, num, priceRound } from '../core/util.js';
import { MODELS } from '../core/data/models.js';
import { dateLabel, clockLabel, untilLabel } from '../core/time.js';
import { valueOrig, valueFake } from '../core/economy.js';
import { itemName, sizeLabel, shownCondition } from '../core/items.js';
import { findThread } from '../core/kernel.js';
import { findListing } from '../core/market/avito.js';
import { QUESTIONS, SELLER_TYPES } from '../core/people/sellers.js';
import { BUYER_TYPES } from '../core/people/buyers.js';
import { availableLevers, canRequestSupply, supplyQuote } from '../core/actions/buying.js';
import { authOptions } from '../core/actions/selling.js';
import { orderMatches, DEPOSIT_SHARE } from '../core/actions/social.js';
import { LOT_TYPES } from '../core/market/lots.js';
import { thumb, avatar, join } from './components.js';

export function threadView(S, id) {
  const th = findThread(S, id);
  if (!th) return { title: 'Чат', body: '<div class="empty">Диалог не найден</div>' };
  th.unread = 0;

  let context = '';
  if (th.kind === 'seller') {
    const l = findListing(S, th.data.listingId);
    if (l) {
      context = `<button class="chat-context" data-act="go" data-route="avito/item/${l.id}">
        ${thumb(l.item)}
        <div><b>${esc(itemName(l.item))}</b>
        <div class="muted">${rub(l.seller.current)} · ${esc(sizeLabel(l.item))}</div></div></button>`;
    }
  }
  if (th.kind === 'buyer') {
    const item = S.items.find((i) => i.id === th.data.buyer.item);
    if (item) {
      context = `<button class="chat-context" data-act="go" data-route="wardrobe/item/${item.id}">
        ${thumb(item)}
        <div><b>${esc(itemName(item))}</b>
        <div class="muted">${esc(sizeLabel(item))} · твоя цена ${item.sale ? rub(item.sale.price) : '—'}</div></div></button>`;
    }
  }
  if (th.kind === 'order') {
    const m = MODELS[th.data.order.m];
    context = `<div class="card tight"><div class="row between"><b>${esc(m.b + ' ' + m.n)}</b><span class="money">${rub(th.data.order.budget)}</span></div>
      <div class="muted">Размер ${esc(th.data.order.size)} · ${th.data.order.maxCond === 0 ? 'только новое с биркой' : 'новое или как новое'} · ${esc(untilLabel(S.t, th.data.order.deadline))}</div></div>`;
  }

  const who = describeCounterpart(S, th);
  const chat = `<div class="chat">${th.messages
    .map((m) => `<div class="bubble ${m.from}">${esc(m.text)}</div>`)
    .join('')}</div>`;

  return {
    title: th.name,
    aside: who,
    body: context + chat,
    foot: threadFoot(S, th),
  };
}

function describeCounterpart(S, th) {
  if (th.kind === 'seller') {
    const l = findListing(S, th.data.listingId);
    if (!l) return '';
    return esc(SELLER_TYPES[l.seller.type].label);
  }
  if (th.kind === 'buyer' && th.data.buyer) {
    const T = BUYER_TYPES[th.data.buyer.type];
    return esc(T.n);
  }
  if (th.kind === 'order') {
    const c = S.clients.find((x) => x.id === th.data.clientId);
    if (!c) return '';
    return c.status === 'vip' ? 'свой клиент' : c.status === 'regular' ? 'постоянный' : 'подписчик';
  }
  return '';
}

/* ======================= НИЗ ЭКРАНА ======================= */

function threadFoot(S, th) {
  if (th.kind === 'mentor' || th.kind === 'system' || th.kind === 'rival') return '';
  if (th.closed) return '<div class="muted" style="text-align:center">Переписка закрыта</div>';

  if (th.kind === 'seller') return sellerFoot(S, th);
  if (th.kind === 'buyer') return buyerFoot(S, th);
  if (th.kind === 'lot') return lotFoot(S, th);
  if (th.kind === 'order') return orderFoot(S, th);
  if (th.kind === 'claim') return claimFoot(S, th);
  return '';
}

function sellerFoot(S, th) {
  const l = findListing(S, th.data.listingId);
  if (!l) return '<div class="muted" style="text-align:center">Объявление снято</div>';
  const s = l.seller;
  if (s.blocked) return '<div class="muted" style="text-align:center">Продавец тебя заблокировал</div>';

  if (l.scamPush) {
    return `<div class="callout danger">Продавец требует перевод на карту и отказывается от Авитка Доставки. Решай сам.</div>
      <button class="btn bad full" data-act="payScam" data-id="${l.id}">Перевести ${rub(s.current)} на карту</button>`;
  }

  const questions = Object.keys(QUESTIONS)
    .filter((q) => !s.asked[q])
    .map((q) => `<button class="chip" data-act="askSeller" data-id="${l.id}" data-q="${q}">${esc(QUESTIONS[q])}</button>`)
    .join('');

  const levers = availableLevers(S, l)
    .filter((lv) => lv.key !== 'walk')
    .map(
      (lv) => `<button class="lever ${lv.key === 'defect' ? 'strong' : ''}" data-act="useLever" data-id="${l.id}" data-lever="${lv.key}">
        <b>${esc(lv.n)}</b><span>${esc(lv.hint)}</span></button>`,
    )
    .join('');

  const canShip = l.mode !== 'meet';
  const canMeetHere = l.mode !== 'ship';
  const agreedText = s.agreed ? ' за ' + rub(s.current) : '';

  return `
    ${questions ? `<div class="chips">${questions}</div>` : ''}
    ${levers ? `<div class="stack">${levers}</div>` : ''}
    <div class="inline-form">
      <input class="inp num" id="offerInput" inputmode="numeric" placeholder="Своя цена, ₽" value="${priceRound(s.current * 0.85)}" aria-label="Твоя цена">
      <button class="btn" data-act="offerSeller" data-id="${l.id}">Предложить</button>
    </div>
    <div class="row">
      ${canShip ? `<button class="btn ${s.agreed ? 'good' : 'sec'} grow" data-act="buyDelivery" data-id="${l.id}">Доставкой${agreedText}</button>` : ''}
      ${canMeetHere ? `<button class="btn ${s.agreed && l.mode === 'meet' ? 'good' : 'sec'} grow" data-act="meet" data-id="${l.id}">Встретиться${l.mode === 'meet' ? agreedText : ''}</button>` : ''}
    </div>
    ${!s.used.walk ? `<button class="btn ghost" data-act="useLever" data-id="${l.id}" data-lever="walk">Я подумаю · может перезвонить</button>` : ''}`;
}

function buyerFoot(S, th) {
  const b = th.data.buyer;
  const item = S.items.find((i) => i.id === b.item);
  if (!item) return '<div class="muted" style="text-align:center">Вещи больше нет</div>';

  if (b.phishing) {
    return `<div class="callout danger">Он утверждает, что уже оплатил, и просит ввести данные карты по ссылке.</div>
      <button class="btn bad full" data-act="phishGo" data-id="${th.id}">Перейти по ссылке</button>
      <button class="btn sec full" data-act="phishBlock" data-id="${th.id}">Это развод, заблокировать</button>`;
  }

  // Сцена с вопросом про подлинность.
  if (b.asked.auth && !b.agreed) {
    const options = authOptions(S, th)
      .map(
        (o) => `<button class="choice ${o.key === 'swearOrig' ? 'risky' : o.key === 'confess' ? 'safe' : ''}"
          data-act="answerAuth" data-id="${th.id}" data-key="${o.key}">
          <b>${esc(o.n)}</b><span>${esc(o.d)}</span></button>`,
      )
      .join('');
    return `<div class="section-label">Что ответишь</div><div class="stack">${options}</div>`;
  }

  if (b.agreed) {
    return `<button class="btn good full" data-act="completeSale" data-id="${th.id}">
        ${th.platform === 'tg' ? 'Получить оплату и отправить' : 'Отправить Авитка Доставкой'} · ${rub(b.price)}
      </button>
      <button class="btn ghost" data-act="declineBuyer" data-id="${th.id}">Передумать</button>`;
  }

  return `<div class="row">
      <button class="btn good grow" data-act="acceptOffer" data-id="${th.id}">Согласен на ${rub(b.offer)}</button>
      <button class="btn sec" data-act="declineBuyer" data-id="${th.id}">Нет</button>
    </div>
    <div class="inline-form">
      <input class="inp num" id="offerInput" inputmode="numeric" placeholder="Своя цена, ₽" value="${priceRound((b.offer + item.sale.price) / 2)}" aria-label="Твоя цена">
      <button class="btn" data-act="counterBuyer" data-id="${th.id}">Ответить</button>
    </div>`;
}

function lotFoot(S, th) {
  const lot = th.data.lot;
  return `<div class="muted" style="text-align:center">Предложение в силе до ${esc(clockLabel(lot.expiresAt, 0))}, ${esc(dateLabel(lot.expiresAt))}</div>
    <button class="btn full" data-act="takeLot" data-id="${th.id}">Забрать за ${rub(lot.price)} · 1 ч</button>
    <div class="row">
      ${lot.haggled ? '' : `<button class="btn sec grow" data-act="haggleLot" data-id="${th.id}">Скинь 15%</button>`}
      <button class="btn sec grow" data-act="declineLot" data-id="${th.id}">Отказаться</button>
    </div>`;
}

function orderFoot(S, th) {
  const order = th.data.order;
  const matches = orderMatches(S, order);
  const m = MODELS[order.m];
  const list = matches
    .map(
      (it) => `<button class="btn ${it.verdict === 'fake' ? 'bad' : it.verdict === 'orig' ? 'good' : ''} full split"
        data-act="fulfillOrder" data-id="${th.id}" data-item="${it.id}">
        <span>Отдать: ${esc(shownCondition(it).short)}${it.verdict === 'orig' ? ' · проверено ✓' : it.verdict === 'fake' ? ' · это ПАЛЬ' : ' · не проверено'}</span>
        <span>${rub(order.budget)}</span></button>`,
    )
    .join('');
  if (list) {
    const risky = matches.some((it) => it.verdict !== 'orig');
    return (
      list +
      (risky
        ? '<div class="callout danger">Клиент обязательно сделает легит-чек. Непроверенная вещь — это риск единицы в отзывах и потерянного клиента. Проверь сам в «Шкафу».</div>'
        : '') +
      `<button class="btn ghost" data-act="declineOrder" data-id="${th.id}">Отказаться от заказа</button>`
    );
  }

  // Нечего отдать — показываем, где это можно достать и успеть к сроку.
  const hoursLeft = order.deadline - S.t;

  // Предоплата: деньги вперёд в обмен на обязательство.
  const depositBlock = order.accepted
    ? `<div class="callout ok">Заказ в работе. Предоплата ${rub(order.deposit)} уже у тебя, остальное — при передаче вещи.</div>`
    : `<button class="btn full split" data-act="acceptOrder" data-id="${th.id}">
        <span>Взять заказ и получить предоплату</span>
        <span>${rub(Math.round(order.budget * DEPOSIT_SHARE))}</span></button>
      <div class="muted" style="text-align:center">Будет на что искать, но сорвать заказ станет дороже: предоплату придётся вернуть.</div>`;
  const gate = canRequestSupply(S);
  const quote = supplyQuote(S, order.m, order.size, order.maxCond);
  const fits = hoursLeft > quote.etaDays[1] * 24;
  const profit = order.budget - quote.total;

  const supplyBlock = S.suppliers.orig.unlocked
    ? `<button class="btn ${fits && profit > 0 ? '' : 'sec'} full split" data-act="requestSupply" data-id="${th.id}"
        ${gate.ok && quote.available ? '' : 'disabled'}>
        <span>Попросить поставщика достать · ${quote.etaDays[0]}–${quote.etaDays[1]} дн</span>
        <span>${rub(quote.total)}</span></button>
      <div class="muted" style="text-align:center">${
        !quote.available
          ? 'Люкс он возит только своим — нужен 6 уровень'
          : !gate.ok
            ? esc(gate.why)
            : !fits
              ? 'Не успеет к сроку'
              : profit > 0
                ? `Останется ${rub(profit)} сверху. Паль проскакивает примерно в ${Math.round(quote.fakeRate * 100)}% заказов`
                : 'Выйдет дороже, чем клиент готов заплатить'
      }</div>`
    : '<div class="muted" style="text-align:center">Поставщик из Европы пока тебе не пишет</div>';

  return `<div class="muted" style="text-align:center">Подходящей вещи в шкафу нет</div>
    ${depositBlock}
    ${supplyBlock}
    <div class="row">
      <button class="btn sec grow" data-act="searchModel" data-model="${order.m}">Искать на Авитке</button>
      <button class="btn sec grow" data-act="go" data-route="poizon/item/${order.m}">Пойзон</button>
    </div>
    <button class="btn ghost" data-act="declineOrder" data-id="${th.id}">
      ${order.accepted ? `Отказаться и вернуть ${rub(order.deposit)}` : 'Отказаться от заказа'}</button>`;
}

function claimFoot(S, th) {
  const deal = S.deals.find((d) => d.id === th.data.dealId);
  return `<div class="muted" style="text-align:center">Если не ответишь до ${esc(clockLabel(th.data.expiresAt, 0))}, ${esc(dateLabel(th.data.expiresAt))} — он сочтёт это отказом</div>
    <button class="btn good full" data-act="refundClaim" data-id="${th.id}">Вернуть ${deal ? rub(deal.price) : ''} и забрать вещь</button>
    <button class="btn bad full" data-act="refuseClaim" data-id="${th.id}">Отказать</button>`;
}

/* ======================= СПИСОК ДИАЛОГОВ ======================= */

export function threadRow(S, th) {
  const last = th.messages[th.messages.length - 1];
  const closable = th.kind !== 'mentor' && th.kind !== 'claim';
  const route = (th.platform === 'tg' ? 'tg' : 'avito') + '/thread/' + th.id;
  return `<div class="thread-wrap">
    ${closable ? `<button class="thread-x" data-act="closeThread" data-id="${th.id}" aria-label="Закрыть диалог">×</button>` : ''}
    <button class="thread-row ${closable ? 'has-x' : ''} ${th.pinned ? 'pinned' : ''}" data-act="go" data-route="${route}">
      ${avatar(th.name, th.id)}
      <div style="min-width:0">
        <div class="nm">${th.pinned ? '📌 ' : ''}${esc(th.name)}${th.sub ? ` <span class="muted">· ${esc(th.sub)}</span>` : ''}</div>
        <div class="pv">${last ? (last.from === 'me' ? 'Вы: ' : '') + esc(last.text.split('\n')[0]) : ''}</div>
      </div>
      ${th.unread ? `<span class="unread-pill">${th.unread}</span>` : th.closed ? '<span class="muted">✓</span>' : ''}
    </button></div>`;
}
