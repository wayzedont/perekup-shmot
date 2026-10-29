// Авитка: поиск, карточка объявления, мои объявления, чаты.

import { esc, rub, num, plural, priceRound } from '../../core/util.js';
import { MODELS } from '../../core/data/models.js';
import { CATS, TIERS, SIZE_SETS, sizesFor, CONDS } from '../../core/data/catalog.js';
import { agoLabel, dateLabel } from '../../core/time.js';
import { valueOrig, valueFake, ratingOf, isTrusted, legitCost } from '../../core/economy.js';
import { itemName, sizeLabel, shownCondition, colorwayName } from '../../core/items.js';
import { threadVisible } from '../../core/kernel.js';
import { filterListings, findListing, deliveryFee, dealLevel } from '../../core/market/avito.js';
import { canPostAd, cooldownLeft, responderRange, pullLabel, fakeShare } from '../../core/market/buyad.js';
import { SELLER_TYPES, SIGNALS } from '../../core/people/sellers.js';
import { availableLevers } from '../../core/actions/buying.js';
import { suspicionLabel, tellsFor } from '../../core/inspect.js';
import { thumb, bigPhoto, itemRow, authTag, hypeTag, defectTag, inspectPanel, avatar, emptyState } from '../components.js';
import { threadView, threadRow } from '../thread.js';

export const view = (S) => {
  const v = S.ui.view;
  if (v === 'item') return listingView(S, S.ui.id);
  if (v === 'meeting') return meetingView(S, S.ui.id);
  if (v === 'thread') return threadView(S, S.ui.id);

  const unread = S.threads.filter((t) => t.platform === 'avito' && t.unread > 0 && !t.hidden).length;
  const tabs = `<div class="tabs">
    <button class="${v === 'main' ? 'on' : ''}" data-act="nav" data-view="main">Поиск</button>
    <button class="${v === 'mine' ? 'on' : ''}" data-act="nav" data-view="mine">Мои</button>
    <button class="${v === 'chats' ? 'on' : ''}" data-act="nav" data-view="chats">Чаты${unread ? `<span class="n">${unread}</span>` : ''}</button>
  </div>`;

  if (v === 'chats') {
    const list = S.threads
      .filter((t) => t.platform === 'avito' && threadVisible(S, t))
      .sort((a, b) => b.lastAt - a.lastAt);
    return { tabs, body: list.map((t) => threadRow(S, t)).join('') || emptyState('Чатов пока нет') };
  }

  if (v === 'mine') return myListings(S, tabs);
  return searchView(S, tabs);
};

/* ======================= ПОИСК ======================= */

function searchView(S, tabs) {
  const f = S.ui.filters;
  const list = filterListings(S);
  const models = MODELS.filter((m) => f.cat === 'all' || m.cat === f.cat).sort((a, b) =>
    a.full.localeCompare(b.full, 'ru'),
  );
  const sizes = f.cat === 'all' ? [...SIZE_SETS.cloth, ...SIZE_SETS.shoe, 'One size'] : sizesFor(f.cat);
  const anyFilter = f.q || f.model !== 'all' || f.size !== 'all' || f.mode !== 'all' || f.cat !== 'all' || f.onlyDeals;

  const body = `
    <div class="inline-form">
      <input class="inp" id="searchInput" type="search" placeholder="Данки, Стусси, худи…" value="${esc(f.q || '')}" aria-label="Поиск по объявлениям">
      <button class="btn" data-act="search">Найти</button>
    </div>
    <div class="chips">
      <button class="chip ${f.cat === 'all' ? 'on' : ''}" data-act="filterCat" data-val="all">Все категории</button>
      ${Object.entries(CATS).map(([k, c]) => `<button class="chip ${f.cat === k ? 'on' : ''}" data-act="filterCat" data-val="${k}">${esc(c.n)}</button>`).join('')}
    </div>
    <div class="field2">
      <select class="sel" data-change="model" aria-label="Модель">
        <option value="all">Все модели</option>
        ${models.map((m) => `<option value="${m.i}"${String(f.model) === String(m.i) ? ' selected' : ''}>${esc(m.full)}</option>`).join('')}
      </select>
      <select class="sel" data-change="size" aria-label="Размер">
        <option value="all">Любой размер</option>
        ${sizes.map((z) => `<option value="${z}"${f.size === z ? ' selected' : ''}>${esc(z)}</option>`).join('')}
      </select>
      <select class="sel" data-change="mode" aria-label="Способ получения">
        ${[['all', 'Доставка и встреча'], ['ship', 'С доставкой'], ['meet', 'Личная встреча']]
          .map(([k, n]) => `<option value="${k}"${f.mode === k ? ' selected' : ''}>${n}</option>`)
          .join('')}
      </select>
      <select class="sel" data-change="sort" aria-label="Сортировка">
        ${[['new', 'Сначала новые'], ['deal', 'Сначала выгодные'], ['cheap', 'Дешевле'], ['expensive', 'Дороже']]
          .map(([k, n]) => `<option value="${k}"${f.sort === k ? ' selected' : ''}>${n}</option>`)
          .join('')}
      </select>
    </div>
    <div class="row between">
      <button class="chip ${f.onlyDeals ? 'on' : ''}" data-act="toggleDeals">Только выгодные</button>
      <span class="muted">${list.length} ${plural(list.length, 'объявление', 'объявления', 'объявлений')}</span>
      ${anyFilter ? '<button class="btn ghost sm" data-act="resetFilters">Сбросить</button>' : ''}
    </div>
    ${
      list
        .slice(0, S.ui.limit)
        .map((l) => listingCard(S, l))
        .join('') || emptyState('Ничего не нашлось. Новые объявления появляются каждый час.')
    }
    ${list.length > S.ui.limit ? '<button class="btn sec full" data-act="showMore">Показать ещё</button>' : ''}`;

  return { tabs, body };
}

function listingCard(S, l) {
  const level = dealLevel(l);
  const tags = [];
  tags.push(
    l.mode === 'ship'
      ? '<span class="tag info">Только доставка</span>'
      : l.mode === 'meet'
        ? '<span class="tag">Только встреча</span>'
        : '<span class="tag info">Доставка</span>',
  );
  if (l.declared === 'fake') tags.push('<span class="tag bad">Реплика</span>');
  if (level === 'hot') tags.push('<span class="tag good">Сильно дешевле рынка</span>');
  else if (level === 'good') tags.push('<span class="tag good">Дёшево</span>');
  if (l.seller.type === 'shop' || l.seller.type === 'replica') tags.push('<span class="tag">Магазин</span>');
  if (l.threadId) tags.push('<span class="tag info">Чат</span>');
  if (Object.keys(l.item.seen || {}).length || l.item.verdict !== 'unknown') tags.push(authTag(l.item));

  return itemRow(l.item, {
    price: rub(l.seller.agreed ? l.seller.current : l.ask),
    meta: `${l.mode === 'ship' ? esc(l.city) : 'м. ' + esc(l.metro)} · ${esc(agoLabel(S.t, l.postedAt))}`,
    tags: tags.join(''),
    route: `avito/item/${l.id}`,
  });
}

/* ======================= КАРТОЧКА ОБЪЯВЛЕНИЯ ======================= */

function listingView(S, id) {
  const l = findListing(S, id);
  if (!l) return { title: 'Объявление', body: emptyState('Объявление снято с публикации.') };
  const item = l.item;
  const m = MODELS[item.m];
  const price = l.seller.agreed ? l.seller.current : l.ask;
  const fee = deliveryFee(price);
  const canShip = l.mode !== 'meet';
  const canMeetHere = l.mode !== 'ship';

  const stickers = [
    l.declared === 'fake' ? '<span class="tag bad">Реплика</span>' : '',
    authTag(item),
    defectTag(item),
  ].join('');

  const signalRows = l.signals.length
    ? `<div class="card"><h3>На что обратить внимание</h3>
        ${l.signals.map((s) => `<div class="kv"><span>${esc(SIGNALS[s].n)}</span><span></span></div>`).join('')}
        <div class="muted">Каждый пункт по отдельности встречается и у честных продавцов. Опасно, когда их сразу несколько.</div></div>`
    : '';

  const inspect = l.photosAsked
    ? inspectPanel(S, item, { mode: 'photo', act: 'inspectListing', ctx: l.id, title: 'Осмотр по фото' })
    : `<div class="card"><h3>Осмотр</h3>
        <div class="muted">Чтобы что-то рассмотреть, попроси у продавца фото бирок и швов — или договорись о встрече.</div>
        <button class="btn sec full" data-act="askSeller" data-id="${l.id}" data-q="photos">Попросить фото бирок</button></div>`;

  const body = `
    ${bigPhoto(item, stickers)}
    <div class="card">
      <h3>${esc(itemName(item))}</h3>
      <div class="money" style="font-size:25px">${rub(price)}</div>
      ${l.seller.agreed ? `<div class="muted">Договорились · в объявлении было ${rub(l.ask)}</div>` : ''}
      <div class="muted">Похожие ${l.declared === 'fake' ? 'реплики' : 'вещи'} уходят примерно за ${rub(l.fair)}</div>
      <div class="tags">${hypeTag(S, item)}</div>
    </div>
    <div class="card"><div class="spec">
      <div><span>Размер</span>${esc(sizeLabel(item))}</div>
      <div><span>Состояние</span>${esc(shownCondition(item).n)}</div>
      <div><span>Расцветка</span>${esc(colorwayName(item) || '—')}</div>
      <div><span>Сегмент</span>${esc(TIERS[m.tier].n)}</div>
      <div><span>Где</span>${l.mode === 'ship' ? esc(l.city) : 'м. ' + esc(l.metro)}</div>
      <div><span>Получение</span>${l.mode === 'ship' ? 'только доставка' : l.mode === 'meet' ? 'только встреча' : 'доставка или встреча'}</div>
    </div></div>
    <div class="card"><h3>Описание</h3><p class="note">${esc(l.description)}</p>
      ${l.photoNote ? `<div class="muted">📷 ${esc(l.photoNote)}</div>` : ''}
      ${l.photoLegit ? `<div class="callout ${item.verdict === 'orig' ? 'ok' : 'danger'}">Легит-чек по фото: <b>${item.verdict === 'orig' ? 'оригинал' : 'паль'}</b></div>` : ''}
    </div>
    <div class="card person">
      ${avatar(l.seller.name, l.id)}
      <div class="grow"><b>${esc(l.seller.name)}</b>
        <div class="muted">${esc(SELLER_TYPES[l.seller.type].n)} · на Авитке с ${esc(l.seller.since)} · ${l.seller.reviews} ${plural(l.seller.reviews, 'отзыв', 'отзыва', 'отзывов')}</div></div>
    </div>
    ${signalRows}
    ${inspect}
    ${l.photosAsked && !l.photoLegit && !m.noname ? `<button class="btn sec full split" data-act="legitListing" data-id="${l.id}">
      <span>Легит-чек по фото · 20 мин</span><span>${rub(legitCost(S, item))}</span></button>` : ''}`;

  const foot = `<div class="row">
      <button class="btn sec grow" data-act="openSellerChat" data-id="${l.id}">Написать</button>
      ${canShip ? `<button class="btn grow" data-act="buyDelivery" data-id="${l.id}">Купить с доставкой</button>` : `<button class="btn grow" data-act="meet" data-id="${l.id}">Встретиться · 2 ч</button>`}
    </div>
    ${canShip && canMeetHere ? `<button class="btn ghost" data-act="meet" data-id="${l.id}">Встретиться у м. ${esc(l.metro)} · 2 ч</button>` : ''}
    <div class="muted" style="text-align:center">${
      canShip
        ? `Доставка: +${rub(fee)} комиссия, ${l.mode === 'ship' ? '2–4 дня' : '1–2 дня'}. После получения 24 часа на проверку`
        : 'Продавец не отправляет. Зато на встрече можно осмотреть всё, включая состояние'
    }</div>`;

  return { title: 'Объявление', body, foot };
}

/* ======================= «СКУПАЮ ШМОТ» ======================= */
// Обратная сторона рынка: вещи приносят тебе. Торговаться из позиции
// покупателя куда приятнее — человеку нужны деньги, а тебе спешить некуда.

/**
 * Объявление «скупаю шмот» — пост в собственном канале, поэтому бесплатный.
 * Людей всегда немного; канал меняет не их число, а то, что они несут.
 * Карточка это и показывает: встреч столько же, а товар другой.
 */
function buyAdCard(S) {
  const { lo, hi } = responderRange(S);
  const check = canPostAd(S);
  const waiting = S.threads.filter((t) => t.kind === 'seller' && !t.closed && t.data.incoming).length;
  const queued = S.buyAd && S.buyAd.queue ? S.buyAd.queue.length : 0;
  const wait = cooldownLeft(S);
  const what = pullLabel(S);
  const fakes = Math.round(fakeShare(S) * 100);

  const howMany =
    hi < 1
      ? 'никто: канал пока слишком маленький'
      : lo === hi
        ? `${hi} ${plural(hi, 'человек', 'человека', 'человек')} за неделю`
        : `${lo}–${hi} ${plural(hi, 'человек', 'человека', 'человек')} за неделю`;

  return `<div class="card">
    <div class="row between"><h3>«Скупаю шмот»</h3>
      ${queued ? `<span class="tag good">ещё напишут: ${queued}</span>` : ''}</div>
    <div class="muted">Пост в своём канале: не ты ищешь вещи, а их приносят тебе. Просят 30–70% рынка, потому что деньги нужны сегодня, приезжают сами и осмотреть дают всё без спешки.</div>
    <div class="kv"><span>Откликнется</span><span>${esc(howMany)}</span></div>
    <div class="kv"><span>Понесут</span><span class="${what.tone === 'bad' ? 'neg' : what.tone === 'good' ? 'pos' : ''}">${esc(what.n)}</span></div>
    <div class="kv"><span>Из них паль</span><span class="${fakes > 35 ? 'neg' : ''}">примерно ${fakes}%</span></div>
    ${waiting ? `<div class="kv"><span>Сейчас в переписке</span><span>${waiting}</span></div>` : ''}
    <div class="kv"><span>Подписчиков</span><span>${num(S.tg.subs)}</span></div>
    ${
      check.ok
        ? '<button class="btn full" data-act="postBuyAd">Выложить объявление</button>'
        : `<button class="btn full" disabled>${wait > 0 ? `Повторить можно через ${Math.ceil(wait / 24)} ${plural(Math.ceil(wait / 24), 'день', 'дня', 'дней')}` : esc(check.why)}</button>`
    }
    <div class="muted">Раз в неделю, чаще канал не выдержит. Людей всегда немного — растёт не их число, а то, что они несут: с большим каналом к тебе везут дорогое и реже пытаются подсунуть паль.</div>
  </div>`;
}

/* ======================= ВСТРЕЧА У МЕТРО ======================= */
// Здесь, и только здесь, видно всё: запах, состояние, скрытые дефекты.
// Поэтому встреча — не просто минус 150 ₽ и два часа.

function meetingView(S, id) {
  const l = findListing(S, id);
  if (!l) return { title: 'Встреча', body: emptyState('Пока ехал, вещь продали.') };
  const item = l.item;
  const m = MODELS[item.m];
  const price = l.seller.current;
  const suspicious = suspicionLabel(item);
  const canAccuse = l.declared === 'orig' && !l.seller.accused && !m.noname;

  const body = `
    <div class="card tight">
      <div class="row"><b>${esc(l.seller.name)}</b><span class="muted">м. ${esc(l.metro)}</span></div>
      <div class="muted">Показывает ${esc(itemName(item))}, размер ${esc(sizeLabel(item))}. Стоит рядом и ждёт.</div>
    </div>
    ${bigPhoto(item, [authTag(item), defectTag(item)].join(''))}
    <div class="card">
      <div class="row between"><h3>Цена сейчас</h3><span class="money" style="font-size:22px">${rub(price)}</span></div>
      <div class="muted">В объявлении было ${rub(l.ask)}. Похожие уходят за ${rub(l.fair)}.</div>
    </div>
    ${inspectPanel(S, item, { mode: 'hand', act: 'inspectMeet', ctx: l.id, title: 'Осмотр вживую' })}
    ${
      !l.photoLegit && !m.noname
        ? `<button class="btn sec full split" data-act="legitMeet" data-id="${l.id}">
            <span>Легит-чек по фото · 20 мин</span><span>${rub(legitCost(S, item))}</span></button>`
        : ''
    }
    ${
      canAccuse
        ? `<button class="btn sec full" data-act="accuse" data-id="${l.id}">Сказать, что это паль</button>
           <div class="muted" style="text-align:center">Если прав — скинет до цены реплики. Если нет — обидится и уйдёт.</div>`
        : ''
    }
    <div class="card"><h3>Торг вживую</h3>
      ${
        availableLevers(S, l)
          .filter((lv) => lv.key !== 'walk')
          .map(
            (lv) => `<button class="lever ${lv.key === 'defect' ? 'strong' : ''}" data-act="useLever" data-id="${l.id}" data-lever="${lv.key}">
              <b>${esc(lv.n)}</b><span>${esc(lv.hint)}</span></button>`,
          )
          .join('') || '<div class="muted">Ходы кончились. Остаётся называть цену.</div>'
      }
      <div class="inline-form">
        <input class="inp num" id="offerInput" inputmode="numeric" value="${priceRound(price * 0.88)}" aria-label="Твоя цена">
        <button class="btn" data-act="offerSeller" data-id="${l.id}">Предложить</button>
      </div>
    </div>`;

  const foot = `<button class="btn good full" data-act="buyMeeting" data-id="${l.id}">Купить за ${rub(price)} наличными</button>
    <button class="btn ghost" data-act="go" data-route="avito/main">Уйти</button>`;

  return { title: 'Встреча у метро', body, foot };
}

/* ======================= МОИ ОБЪЯВЛЕНИЯ ======================= */

function myListings(S, tabs) {
  const mine = S.items.filter((i) => i.sale && i.sale.avito);
  const rating = ratingOf(S);
  const head = `<div class="card">
    <div class="row between"><h3>Мой профиль</h3><span class="stars">${rating === null ? 'нет отзывов' : '★ ' + rating.toFixed(2)}</span></div>
    <div class="muted">${S.rep.reviews.length} ${plural(S.rep.reviews.length, 'отзыв', 'отзыва', 'отзывов')} · жалоб ${S.rep.complaints} из 3${
      S.rep.banUntil > S.t ? ` · <b class="neg">заблокирован до ${esc(dateLabel(S.rep.banUntil))}</b>` : ''
    }</div>
    ${
      isTrusted(S)
        ? '<span class="tag good">Надёжный продавец · покупатели пишут чаще</span>'
        : '<div class="muted">Значок «Надёжный продавец» дают за 15 отзывов и рейтинг от 4,8.</div>'
    }
  </div>
  ${buyAdCard(S)}`;

  const rows = mine
    .map((it) => {
      const stale = S.t - Math.max(it.sale.listedAt, it.sale.bumpedAt || 0) > 48;
      const tags = [
        it.sale.asOrig ? '' : '<span class="tag bad">Реплика</span>',
        it.sale.boostUntil > S.t ? '<span class="tag good">Поднято</span>' : stale ? '<span class="tag warn">Опустилось в поиске</span>' : '',
      ].join('');
      return itemRow(it, {
        price: rub(it.sale.price),
        meta: `${it.sale.views} ${plural(it.sale.views, 'просмотр', 'просмотра', 'просмотров')} · ${esc(agoLabel(S.t, it.sale.listedAt))}`,
        tags,
        route: `wardrobe/item/${it.id}`,
      });
    })
    .join('');

  return {
    tabs,
    body:
      head +
      (rows ||
        emptyState(
          'Нет объявлений. Выставить вещь можно из шкафа.',
          '<button class="btn sm" data-act="go" data-route="wardrobe/main">Открыть шкаф</button>',
        )),
  };
}
