// Телега: чаты, каналы, свой канал и клиенты.

import { esc, rub, num, shortNum, plural } from '../../core/util.js';
import { MODELS, BRANDED } from '../../core/data/models.js';
import { AD_CHANNELS } from '../../core/data/content.js';
import { dateLabel, clockLabel, agoLabel, untilLabel } from '../../core/time.js';
import { valueOrig, hypePct, poizonPrice } from '../../core/economy.js';
import { itemName, sizeLabel } from '../../core/items.js';
import { threadVisible, mentorThread } from '../../core/kernel.js';
import { SUPPLIERS, postTotal, shipUnit, trapFakeRate } from '../../core/market/suppliers.js';
import { raffleTitle, raffleSizes, winChance, resaleEstimate, ENTRY_FEE } from '../../core/market/raffle.js';
import { trustLabel, PRO_PRICE } from '../../core/channel.js';
import { clientRows } from '../../core/actions/social.js';
import { CLIENT_STATUS } from '../../core/people/clients.js';
import { thumb, bigPhoto, itemRow, hypeTag, emptyState, avatar, sectionLabel, barRow } from '../components.js';
import { threadView, threadRow } from '../thread.js';

const CHANNEL_META = {
  radar: {
    n: 'Хайп-радар 📡',
    color: '#2a9fd6',
    about: 'Каждое утро — что сейчас в ликвиде и что лежит. PRO присылает прогноз на неделю вперёд.',
  },
  drops: {
    n: 'Дропы и раффлы 🎟',
    color: '#d94a2a',
    about: 'Лимитированные релизы. Записываешься в раффл и, если повезёт, выкупаешь по ретейлу.',
  },
};

export const view = (S) => {
  const v = S.ui.view;
  if (v === 'thread') return threadView(S, S.ui.id);
  if (v === 'channel') return channelView(S, S.ui.channel);
  if (v === 'own') return ownChannelView(S);
  if (v === 'client') return clientView(S, S.ui.id);

  const tab = S.ui.tgTab || 'chats';
  const unreadChats = S.threads.filter((t) => t.platform === 'tg' && t.unread > 0 && !t.hidden).length;
  let unreadChans = 0;
  for (const k of Object.keys(S.channels)) if (S.channels[k].unread) unreadChans++;
  for (const k of Object.keys(S.suppliers)) if (S.suppliers[k].unread) unreadChans++;

  const tabs = `<div class="tabs">
    <button class="${tab === 'chats' ? 'on' : ''}" data-act="tgTab" data-val="chats">Чаты${unreadChats ? `<span class="n">${unreadChats}</span>` : ''}</button>
    <button class="${tab === 'channels' ? 'on' : ''}" data-act="tgTab" data-val="channels">Каналы${unreadChans ? `<span class="n">${unreadChans}</span>` : ''}</button>
    <button class="${tab === 'clients' ? 'on' : ''}" data-act="tgTab" data-val="clients">Клиенты</button>
  </div>`;

  if (tab === 'channels') return { tabs, body: channelsList(S) };
  if (tab === 'clients') return { tabs, body: clientsList(S) };

  const mentor = mentorThread(S);
  const pinned = mentor ? threadRow(S, mentor) : '';
  const chats = S.threads
    .filter((t) => t.platform === 'tg' && t.kind !== 'mentor' && threadVisible(S, t))
    .sort((a, b) => b.lastAt - a.lastAt);

  return {
    tabs,
    body:
      pinned +
      (chats.map((t) => threadRow(S, t)).join('') ||
        emptyState('Клиентов пока нет. Заведи канал и выставляй вещи — подписчики начнут писать сюда.')),
  };
};

/* ======================= СПИСОК КАНАЛОВ ======================= */

function channelsList(S) {
  const rows = [];

  rows.push(
    S.tg.has
      ? `<button class="thread-row" data-act="go" data-route="tg/own">
          <div class="avatar" style="background:#7a46d6">${esc((S.tg.name || 'М')[0])}</div>
          <div style="min-width:0"><div class="nm">${esc(S.tg.name)} <span class="muted">· мой канал</span></div>
          <div class="pv">${shortNum(S.tg.subs)} подписчиков · доверие ${esc(trustLabel(S.tg.trust).n)}</div></div><span></span></button>`
      : `<button class="thread-row" data-act="createChannelSheet">
          <div class="avatar" style="background:#7a46d6">+</div>
          <div style="min-width:0"><div class="nm">Создать свой канал</div>
          <div class="pv">Продавай подписчикам без комиссии и получай заказы</div></div><span></span></button>`,
  );

  const entries = [];
  for (const key of Object.keys(CHANNEL_META)) {
    const ch = S.channels[key];
    entries.push({ key, meta: CHANNEL_META[key], ch, last: ch.posts[0] ? ch.posts[0].at : 0 });
  }
  for (const key of Object.keys(SUPPLIERS)) {
    const ch = S.suppliers[key];
    if (!ch.unlocked) continue;
    entries.push({
      key,
      meta: { n: SUPPLIERS[key].n, color: SUPPLIERS[key].color, about: SUPPLIERS[key].about },
      ch,
      last: ch.posts[0] ? ch.posts[0].at : 0,
    });
  }
  entries.sort((a, b) => b.last - a.last);

  for (const e of entries) {
    const p = e.ch.posts[0];
    rows.push(`<button class="thread-row" data-act="openChannel" data-chan="${e.key}">
      <div class="avatar" style="background:${e.meta.color}">${esc(e.meta.n[0])}</div>
      <div style="min-width:0"><div class="nm">${esc(e.meta.n)}</div>
      <div class="pv">${p ? esc(p.text.split('\n')[0]) : 'пока пусто'}</div></div>
      ${e.ch.unread ? `<span class="unread-pill">${e.ch.unread}</span>` : '<span></span>'}</button>`);
  }

  const locked = Object.keys(SUPPLIERS).filter((k) => !S.suppliers[k].unlocked);
  if (locked.length) {
    rows.push(
      `<div class="card tight"><div class="muted">Закрытые каналы поставщиков открываются по мере роста: китайское карго — когда продашь десять вещей.</div></div>`,
    );
  }

  return rows.join('');
}

/* ======================= КАНАЛ ======================= */

function channelView(S, key) {
  if (SUPPLIERS[key]) return supplierView(S, key);
  const meta = CHANNEL_META[key];
  const ch = S.channels[key];
  if (!meta || !ch) return { title: 'Канал', body: emptyState('Канал не найден') };
  ch.unread = 0;

  const head = `<div class="card person">
    <div class="avatar" style="background:${meta.color}">${esc(meta.n[0])}</div>
    <div class="grow"><b>${esc(meta.n)}</b><div class="muted">${esc(meta.about)}</div></div>
  </div>`;

  let extra = '';
  if (key === 'radar') {
    extra =
      S.tg.proUntil > S.t
        ? `<div class="card"><div class="row between"><h3>PRO активна</h3><span class="tag good">до ${esc(dateLabel(S.tg.proUntil))}</span></div>
            <div class="muted">Каждое утро в 9:00 приходит прогноз: что будет в ликвиде через несколько дней.</div>
            <button class="btn sec full" data-act="buyPro">Продлить на 7 дней · ${rub(PRO_PRICE)}</button></div>
           ${proTable(S)}`
        : `<div class="card"><h3>Хайп-радар PRO</h3>
            <div class="muted">Бесплатно видно только то, что в ликвиде уже сейчас — а это значит, что на Пойзоне цена уже поднялась. Подписка присылает прогноз заранее.</div>
            <button class="btn full" data-act="buyPro">Подписаться · ${rub(PRO_PRICE)} на 7 дней</button></div>`;
  }
  if (key === 'drops') extra = raffleCard(S);

  const posts = ch.posts
    .map(
      (p) => `<div class="post ${p.kind === 'pro' ? 'pro' : p.kind === 'rumor' ? 'rumor' : ''}">
        <div class="ptext">${esc(p.text)}</div>
        <div class="pmeta"><span>${esc(dateLabel(p.at))}, ${esc(clockLabel(p.at, 0))}</span></div></div>`,
    )
    .join('');

  return { title: meta.n, body: head + extra + posts };
}

function proTable(S) {
  const rows = BRANDED.map((m) => ({ m, h: S.market.h[m.i], target: S.market.hT[m.i] }))
    .sort((a, b) => b.h - a.h)
    .slice(0, 24);
  return `<div class="card"><h3>Ликвидность на ${esc(dateLabel(S.t))}</h3>
    <div class="muted">Стрелка — куда движется тренд. Расти начинает раньше, чем это видно всем.</div>
    ${rows
      .map((r) => {
        const pct = Math.round(r.h * 100);
        const dir = r.target - r.h;
        const arrow = dir > 0.05 ? '<span class="pos">↑</span>' : dir < -0.05 ? '<span class="neg">↓</span>' : '';
        const color = pct >= 80 ? 'var(--good)' : pct <= 25 ? '#b9b4c0' : 'var(--acc)';
        return barRow(esc(r.m.full), pct, pct + '% ' + arrow, color);
      })
      .join('')}</div>`;
}

function raffleCard(S) {
  const R = S.raffle;
  if (!R || R.done) return emptyState('Сейчас раффлов нет. Новый откроется в воскресенье.');
  const m = MODELS[R.m];
  const sizes = raffleSizes(R);
  const chosen = R.size || S.ui.raffleSize || sizes[Math.floor(sizes.length / 2)];
  return `<div class="post">
    ${thumb({ m: R.m, way: R.way, cond: 0, shownCond: 0, condSeen: true, defects: [] })}
    <div class="ptext"><b>${esc(raffleTitle(R))}</b>\nЛимитированный релиз</div>
    <div class="kv"><span>Цена по ретейлу</span><span>${rub(R.retail)}</span></div>
    <div class="kv"><span>На ресейле после релиза</span><span>~${rub(resaleEstimate(S, R))}</span></div>
    <div class="kv"><span>Итоги</span><span>${esc(dateLabel(R.resultAt))}, 12:00</span></div>
    <div class="kv"><span>Твой шанс</span><span>${Math.round(winChance(S) * 100)}%</span></div>
    ${
      R.entered
        ? `<div class="callout ok">Ты в списке, размер ${esc(R.size)}. Держи ${rub(R.retail)} на карте к итогам — при победе спишут автоматически.</div>`
        : `<div class="size-grid">${sizes
            .map((z) => `<button class="size-btn ${z === chosen ? 'on' : ''}" data-act="raffleSize" data-val="${z}"><b>${esc(z)}</b></button>`)
            .join('')}</div>
           <button class="btn full" data-act="enterRaffle" data-val="${chosen}">Участвовать · ${rub(ENTRY_FEE)}</button>
           <div class="muted">Шанс растёт с уровнем, навыком «Связи» и размером канала.</div>`
    }
  </div>`;
}

/* ======================= ПОСТАВЩИК ======================= */

function supplierView(S, key) {
  const C = SUPPLIERS[key];
  const ch = S.suppliers[key];
  ch.unread = 0;

  const head = `<div class="card person">
    <div class="avatar" style="background:${C.color}">${esc(C.n[0])}</div>
    <div class="grow"><b>${esc(C.n)}</b><div class="muted">${esc(C.about)}</div></div>
  </div>`;

  const warn =
    C.kind === 'trap'
      ? `<div class="callout">Примерно в ${Math.round(trapFakeRate(S) * 100)}% заказов приходит паль. Чем выше уровень и «Связи», тем реже. Проверяй сразу.</div>`
      : '<div class="callout">Таможня иногда изымает карго с репликами. Не вкладывай в одну посылку всё.</div>';

  const posts = ch.posts
    .map((p) => {
      const m = MODELS[p.m];
      const qty = Math.max(C.minQty, Math.min(p.left, S.ui.qty[p.id] || C.minQty));
      const unitShip = shipUnit(S, key, p);
      const total = postTotal(S, key, p, qty);
      return `<div class="post">
        ${thumb({ m: p.m, way: p.way, cond: p.cond, defects: [] })}
        <div class="ptext">${esc(p.text)}</div>
        <div class="row between">
          <span class="money" style="font-size:18px">${rub(p.price)}${C.minQty > 1 ? '<span class="muted" style="font-family:var(--f-ui);font-size:12px"> / шт</span>' : ''}</span>
          <span class="muted">${C.kind === 'rep' ? '' : hypeTag(S, { m: p.m })} в наличии ${p.left}</span>
        </div>
        <div class="muted">${
          C.ship === 'cargo'
            ? `Карго ${rub(unitShip)}/шт · ${C.eta[0]}–${C.eta[1]} дней · от ${C.minQty} шт`
            : `Доставка ${rub(C.ship)} · ${C.eta[0]}–${C.eta[1]} дн`
        }${C.kind !== 'rep' ? ` · на Авитке ~${rub(valueOrig(S, { m: p.m, cond: p.cond, size: p.size || 'M', boughtAt: S.t }))}` : ''}</div>
        <div class="row between">
          ${
            p.left > C.minQty
              ? `<div class="stepper">
                  <button data-act="qty" data-key="${p.id}" data-d="-1" data-min="${C.minQty}" data-max="${p.left}" aria-label="Меньше">−</button>
                  <b>${qty}</b>
                  <button data-act="qty" data-key="${p.id}" data-d="1" data-min="${C.minQty}" data-max="${p.left}" aria-label="Больше">+</button>
                </div>`
              : `<span class="muted">${qty} шт</span>`
          }
          <button class="btn sm" data-act="buySupplier" data-chan="${key}" data-id="${p.id}">Купить · ${rub(total)}</button>
        </div>
        <div class="pmeta"><span>${esc(agoLabel(S.t, p.at))}</span><span>${p.size ? 'размер ' + esc(p.size) : 'размеры вразброс'}</span></div>
      </div>`;
    })
    .join('');

  return { title: C.n, body: head + warn + (posts || emptyState('Новых постов пока нет. Поставщики постят днём.')) };
}

/* ======================= СВОЙ КАНАЛ ======================= */

function ownChannelView(S) {
  const T = S.tg;
  const forSale = S.items.filter((i) => i.sale && i.sale.tg);
  const canTrend = S.t - T.lastTrendPost >= 20;
  const trust = trustLabel(T.trust);
  const quiet = S.t - T.lastPost;

  const body = `
    <div class="hero" style="background:#7a46d6">
      <div class="label">Мой канал</div>
      <div style="font-family:var(--f-disp);font-size:19px">${esc(T.name)}</div>
      <div class="money">${shortNum(T.subs)} <span style="font-family:var(--f-ui);font-size:14px">подписчиков</span></div>
      <div class="sub">Доверие: ${esc(trust.n)} (${Math.round(T.trust)}/100) · ${
        quiet > 48 ? 'давно не было постов, люди отписываются' : 'последний пост ' + esc(agoLabel(S.t, T.lastPost))
      }</div>
    </div>
    <div class="card">
      <h3>Аудитория и доверие — разные вещи</h3>
      <div class="muted">Подписчиков можно нагнать рекламой, но покупают только там, где верят. Доверие растёт от честных продаж и розыгрышей, падает от реплик и скандалов.</div>
      <button class="btn full" data-act="go" data-route="wardrobe/main">Выставить вещь из шкафа</button>
      <button class="btn sec full split" data-act="trendPost" ${canTrend ? '' : 'disabled'}>
        <span>Пост-обзор трендов · 1 ч</span><span>${canTrend ? '+подписчики' : 'завтра'}</span></button>
    </div>
    <div class="card">
      <h3>Реклама в каналах</h3>
      <div class="muted">Подписчики приходят в течение суток. Важен не охват, а попадание в аудиторию.</div>
      ${AD_CHANNELS.map(
        (a, i) => `<button class="btn sec full split" data-act="buyAd" data-i="${i}">
          <span>${esc(a.n)} · ${shortNum(a.subs)}<br><small class="muted">${esc(a.about)}</small></span>
          <span>${rub(a.price)}</span></button>`,
      ).join('')}
      ${T.adRuns.length ? `<div class="muted">Идёт реклама: придёт ещё ~${num(T.adRuns.reduce((x, r) => x + r.left, 0))} человек</div>` : ''}
    </div>
    <div class="card"><h3>В продаже в канале · ${forSale.length}</h3>
      ${
        forSale
          .map(
            (it) => `<button class="btn sec full split" data-act="go" data-route="wardrobe/item/${it.id}">
              <span>${esc(itemName(it))} · ${esc(sizeLabel(it))}</span><span>${rub(it.sale.price)}</span></button>`,
          )
          .join('') || '<div class="muted">Пусто</div>'
      }
    </div>
    ${sectionLabel('Лента канала')}
    ${T.posts
      .slice(0, 20)
      .map(
        (p) => `<div class="post"><div class="ptext">${esc(p.text)}</div>
          <div class="pmeta"><span>${esc(dateLabel(p.at))}, ${esc(clockLabel(p.at, 0))}</span>
          <span>👁 ${num(Math.max(3, Math.round(T.subs * 0.35)))}</span></div></div>`,
      )
      .join('')}`;

  return { title: 'Мой канал', body };
}

/* ======================= КЛИЕНТЫ ======================= */

function clientsList(S) {
  if (!S.clients.length) {
    return emptyState(
      'Клиентов пока нет. Выполни первый заказ подписчика — и он начнёт возвращаться, платить больше и приводить друзей.',
    );
  }
  const rows = clientRows(S);
  const head = `<div class="card tight">
    <div class="kv"><span>Всего знакомых</span><span>${S.clients.length}</span></div>
    <div class="kv"><span>Постоянных</span><span>${rows.filter((c) => c.status === 'regular' || c.status === 'vip').length}</span></div>
    <div class="muted">Постоянный клиент платит выше рынка и почти не торгуется. Обманешь — расскажет всем.</div>
  </div>`;
  return (
    head +
    rows
      .map((c) => {
        const tagCls = c.status === 'vip' ? 'vip' : c.status === 'regular' ? 'good' : c.status === 'lost' ? 'bad' : '';
        return `<button class="client" data-act="go" data-route="tg/client/${c.id}">
          ${avatar(c.name, 3)}
          <div style="min-width:0"><div class="nm">${esc(c.name)}</div><div class="nt">${esc(c.note)}</div></div>
          <span class="tag ${tagCls}">${esc(CLIENT_STATUS[c.status].n)}</span></button>`;
      })
      .join('')
  );
}

function clientView(S, id) {
  const c = S.clients.find((x) => x.id === id);
  if (!c) return { title: 'Клиент', body: emptyState('Клиент не найден') };
  const open = S.threads.find((t) => t.kind === 'order' && !t.closed && t.data.clientId === c.id);
  return {
    title: c.name,
    body: `<div class="card person">${avatar(c.name, 3)}
        <div class="grow"><b>${esc(c.name)}</b><div class="muted">${esc(CLIENT_STATUS[c.status].n)} · с нами с ${esc(dateLabel(c.since))}</div></div></div>
      <div class="card">
        <div class="kv"><span>Доверие</span><span>${Math.round(c.trust)}/100</span></div>
        <div class="kv"><span>Выполнено заказов</span><span>${c.done}</span></div>
        <div class="kv"><span>Сорвано</span><span>${c.failed}</span></div>
        <div class="kv"><span>Размер одежды</span><span>${esc(c.clothSize)}</span></div>
        <div class="kv"><span>Размер обуви</span><span>${esc(c.shoeSize)}</span></div>
        <div class="kv"><span>Привёл людей</span><span>${c.referrals}</span></div>
      </div>
      <div class="card"><h3>Что любит</h3>
        <div class="muted">Бренды: ${esc(c.brands.join(', ') || '—')}</div>
        <div class="muted">Категории: ${esc(c.cats.map((k) => k).join(', '))}</div>
        <div class="muted">Зная вкусы клиента, можно закупаться заранее — его заказы предсказуемы.</div>
      </div>
      ${open ? `<button class="btn full" data-act="go" data-route="tg/thread/${open.id}">Открыть активный заказ</button>` : ''}`,
  };
}
