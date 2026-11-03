// Грааль недели: редкая вещь, за которой охотятся все.
//
// Сильному игроку мало «купил дешевле — продал дороже»: ему нужна охота.
// По понедельникам с 5-го уровня коллекционер пишет в личку: ищет одну
// конкретную редкую вещь и платит сильно выше рынка. Через день-два она
// один раз всплывает на Авитке — и это может оказаться очень хорошая паль.
// Мирон тоже охотится: прозевал сутки — увёл. Найти, проверить, успеть.
//
// Заказ коллекционера — обычный заказ подписчика (предоплата, срок, отзыв),
// поэтому вся механика сделки уже проверена. Здесь только охота вокруг него.

import { priceRound, rub } from './util.js';
import { MODELS, BRANDED } from './data/models.js';
import { sizesFor } from './data/catalog.js';
import { makeItem } from './items.js';
import { valueOrig } from './economy.js';
import { nextListingId } from './market/avito.js';
import { makeSeller } from './people/sellers.js';
import { makeClient } from './people/clients.js';
import { newThread, say, notify, installed, touch, fx, mentorOnce } from './kernel.js';
import { dateLabel, hourIndex, weekdayAt } from './time.js';
import { RIVAL_NAME, WARM_HOURS } from './rival.js';

export const GRAIL_LEVEL = 5;
const COLLECTORS = ['Арсений', 'Ника', 'Глеб', 'Марк', 'Ульяна', 'Тимофей'];
const CITIES = ['Санкт-Петербург', 'Казань', 'Екатеринбург', 'Нижний Новгород'];
const METRO = ['Чистые пруды', 'Курская', 'Белорусская', 'Таганская', 'Маяковская'];

/** Можно ли сейчас начинать охоту: уровень, свой канал, нет незакрытой. */
export function grailOpen(S) {
  return S.prog.lvl >= GRAIL_LEVEL && installed(S, 'tg') && installed(S, 'avito') && S.tg.has && !(S.grail && !S.grail.closed);
}

/** Понедельник, полдень: коллекционер пишет с запросом. */
export function startGrail(S, rng) {
  if (!grailOpen(S)) return null;
  // Грааль — дорогая, но подъёмная вещь: премиум и люкс, которые игрок
  // способен оплатить хотя бы с кредитом.
  const pool = BRANDED.filter((m) => (m.tier === 'prem' || m.tier === 'lux') && m.rt >= 18000 && m.rt <= 30000 + S.prog.lvl * 12000);
  if (!pool.length) return null;
  const m = rng.weighted(pool, (x) => (x.tier === 'lux' ? 0.6 : 1) * (0.4 + S.market.h[x.i]));
  const sizes = sizesFor(m.cat);
  const size = sizes[Math.min(sizes.length - 1, Math.floor(sizes.length / 2) + rng.int(-1, 1))] || sizes[0];
  const market = valueOrig(S, { m: m.i, cond: 1, size, boughtAt: S.t });

  const client = makeClient(S, rng);
  client.name = 'Коллекционер ' + rng.pick(COLLECTORS);
  client.trust = 70;
  client.collector = true;
  S.clients.push(client);

  const order = {
    clientId: client.id,
    m: m.i,
    size,
    maxCond: 1,
    budget: priceRound(market * rng.range(1.45, 1.65)),
    deadline: S.t + 7 * 24,
    createdAt: S.t,
    grail: true,
  };
  const th = newThread(S, {
    kind: 'order',
    name: client.name,
    sub: 'грааль: ' + m.b + ' ' + m.n,
    platform: 'tg',
    data: { order, clientId: client.id },
  });
  say(
    S,
    th,
    'them',
    `Добрый день. Собираю ${m.b} — не хватает ${m.n}, размер ${size}, состояние не хуже «отличного». ` +
      `Только оригинал: проверяю у своих. Плачу ${rub(order.budget)}, жду до ${dateLabel(order.deadline)}. ` +
      `Найдёте — буду брать у вас и дальше.`,
  );
  S.grail = {
    m: m.i,
    size,
    threadId: th.id,
    since: S.t,
    // Вещь всплывёт через день-два, днём.
    dropAt: S.t + rng.int(26, 54),
    listingId: null,
    snipeAt: 0,
    sniped: false,
    closed: false,
  };
  notify(S, {
    route: 'tg/thread/' + th.id,
    title: 'Грааль недели',
    text: `${m.b} ${m.n} ${size} · коллекционер даёт ${rub(order.budget)}`,
    scope: 'client',
  });
  mentorOnce(
    S,
    'grailTip',
    'Пишет коллекционер? Это грааль: такие вещи всплывают раз в неделю, и их ищут все — Мирон тоже. Следи за Авиткой, а когда найдёшь — проверяй как в первый день: хорошая паль на граалях обычное дело.',
  );
  touch(S);
  return th;
}

/** Объявление с граалем: один раз, недолго, может быть хорошей палью. */
function dropGrail(S, rng) {
  const G = S.grail;
  const m = MODELS[G.m];
  const real = rng.chance(0.55);
  const item = makeItem(rng, G.m, {
    cond: rng.chance(0.6) ? 1 : 0,
    real,
    // Паль на граалях — дорогая и хорошая: по фото её почти не отличить.
    q: real ? 0 : rng.range(0.84, 0.95),
    size: G.size,
    hasBox: rng.chance(0.6),
    boughtAt: S.t,
  });
  const shown = { ...item, cond: item.shownCond };
  const fair = valueOrig(S, shown);
  const ask = priceRound(fair * rng.range(0.86, 1.02));
  const ship = rng.chance(0.4);
  const seller = makeSeller(rng, real ? 'collector' : 'liar', ask, S.prog.skills.bargain);
  const listing = {
    id: nextListingId(),
    item,
    declared: 'orig',
    ask,
    fair,
    mode: ship ? 'ship' : 'both',
    city: ship ? rng.pick(CITIES) : 'Москва',
    metro: ship ? '' : rng.pick(METRO),
    postedAt: S.t,
    seller,
    signals: real ? [] : rng.chance(0.5) ? ['stockPhoto'] : [],
    photosAsked: false,
    photoNote: '',
    photoItem: null,
    photoVerdict: null,
    handLegit: false,
    threadId: null,
    inspectedRemote: false,
    sniped: false,
    expiresAt: S.t + 72,
    isDeal: false,
    grail: true,
    description: `${m.b} ${m.n}, размер ${G.size}. Из личной коллекции, редкость. Торг уместен, но несерьёзных прошу не писать.`,
  };
  S.listings.unshift(listing);
  G.listingId = listing.id;
  // Мирон тоже следит: сутки на всё — найти, проверить, купить.
  G.snipeAt = S.t + rng.int(18, 30);
  fx('notify');
  notify(S, {
    route: 'avito/item/' + listing.id,
    title: 'Грааль на Авитке!',
    text: `${m.b} ${m.n} ${G.size} · ${rub(ask)} · Мирон тоже смотрит`,
  });
}

/** Раз в час: всплыть граалю, Мирону увести его, закрыть охоту. */
export function grailTick(S, rng) {
  const h = hourIndex(S.t);
  if (h === 12 && weekdayAt(S.t) === 1) startGrail(S, rng);
  const G = S.grail;
  if (!G || G.closed) return;
  const th = S.threads.find((t) => t.id === G.threadId);
  // Заказ закрыт — сделкой, отказом или сроком: охота кончилась.
  if (!th || th.closed) {
    G.closed = true;
    return;
  }
  if (!G.listingId && S.t >= G.dropAt && h >= 10 && h <= 20) dropGrail(S, rng);
  if (G.listingId && !G.sniped && S.t >= G.snipeAt) {
    const l = S.listings.find((x) => x.id === G.listingId);
    if (!l) return; // купил игрок — или продавец снял сам
    // Те же правила, что у обычного перехвата: договорился с продавцом или
    // переписка живая — вещь за тобой, Мирон ждёт.
    const th = l.threadId && S.threads.find((x) => x.id === l.threadId);
    const warm = !!(th && !th.closed && S.t - th.lastAt < WARM_HOURS);
    if ((l.seller && l.seller.agreed) || warm) {
      G.snipeAt = S.t + 3;
      return;
    }
    S.listings = S.listings.filter((x) => x !== l);
    G.sniped = true;
    S.rival.sniped = (S.rival.sniped || 0) + 1;
    fx('bad');
    notify(S, {
      route: 'tg/thread/rival',
      title: `${RIVAL_NAME} увёл грааль`,
      text: `${MODELS[G.m].b} ${MODELS[G.m].n} — пока ты думал, он купил.`,
    });
  }
}
