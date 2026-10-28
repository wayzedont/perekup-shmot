// Постоянные клиенты.
//
// Это главный мотор возвращения в игру. Выполненный заказ превращает
// случайного подписчика в контакт: у него есть имя, размер, вкус и память.
// Он пишет снова, приводит друзей и помнит, обманул ты его или нет.
// Именно здесь честность впервые становится выгодной вдолгую.

import { clamp, priceRound, plural } from '../util.js';
import { FIRST_NAMES } from '../data/content.js';
import { MODELS, BRANDED, BRANDS } from '../data/models.js';
import { CAT_KEYS, sizesFor } from '../data/catalog.js';

export const CLIENT_STATUS = {
  new: { n: 'новый', k: 1.0 },
  regular: { n: 'постоянный', k: 1.12 },
  vip: { n: 'свой', k: 1.3 },
  lost: { n: 'ушёл', k: 0 },
};

export function makeClient(S, rng) {
  const favBrands = rng.sample(BRANDS, rng.int(1, 3));
  const favCats = rng.sample(CAT_KEYS, rng.int(1, 2));
  return {
    id: 'c' + (S.nextClientId = (S.nextClientId || 0) + 1),
    name: rng.pick(FIRST_NAMES),
    clothSize: rng.weighted(sizesFor('tee'), (s) => (s === 'M' || s === 'L' ? 3 : 1)),
    shoeSize: rng.weighted(sizesFor('shoes'), (s) => (['41', '42', '43'].includes(s) ? 3 : 1)),
    brands: favBrands,
    cats: favCats,
    trust: rng.int(45, 65),
    done: 0,
    failed: 0,
    since: S.t,
    lastAt: S.t,
    status: 'new',
    referrals: 0,
    note: '',
  };
}

export function sizeForClient(client, cat) {
  const set = sizesFor(cat);
  if (set.length === 1) return set[0];
  return cat === 'shoes' ? client.shoeSize : client.clothSize;
}

export function statusK(client) {
  return CLIENT_STATUS[client.status].k;
}

export function promote(client) {
  if (client.status === 'lost') return;
  if (client.done >= 4) client.status = 'vip';
  else if (client.done >= 1) client.status = 'regular';
}

/**
 * Подбор модели под вкус клиента.
 *
 * Заказ должен быть выполнимым, иначе механика мертва: клиент просит то,
 * что реально достать. Поэтому вес сильно растёт, если такая вещь уже лежит
 * у игрока в шкафу, висит на Авитке или есть у поставщика — и ещё раз растёт,
 * если игрок эту модель знает по записной книжке.
 */
export function pickWantedModel(S, rng, client) {
  const pool = BRANDED.filter((m) => {
    if (m.tier === 'lux' && client.status !== 'vip') return false;
    return true;
  });

  // Что сейчас вообще достижимо.
  const inWardrobe = new Set(S.items.map((i) => i.m));
  const onMarket = new Set(S.listings.filter((l) => l.declared === 'orig').map((l) => l.item.m));
  const atSupplier = new Set(
    S.suppliers.orig.unlocked ? S.suppliers.orig.posts.map((p) => p.m) : [],
  );

  return rng.weighted(pool, (m) => {
    let w = 0.2 + S.market.h[m.i] * S.market.h[m.i] * 2;
    if (client.brands.includes(m.b)) w *= 3.2;
    if (client.cats.includes(m.cat)) w *= 2.2;
    if (m.tier === 'lux') w *= 0.3;
    if (m.tier === 'prem') w *= 0.85;
    // Достижимость: именно она делает заказ игрой, а не лотереей.
    if (inWardrobe.has(m.i)) w *= 5;
    else if (onMarket.has(m.i)) w *= 2.6;
    else if (atSupplier.has(m.i)) w *= 2.2;
    if (S.notebook[m.i]) w *= 1.6;
    return w;
  });
}

/**
 * Создаёт заказ. Бюджет выше рынка — за то, что ты ищешь вещь за клиента.
 * Срок короткий, поэтому Пойзон со своими двумя неделями часто не успевает:
 * приходится искать у поставщиков, на Авито и в секонде.
 */
export function makeOrder(S, rng, client, valueOf) {
  const m = pickWantedModel(S, rng, client);
  let size = sizeForClient(client, m.cat);
  // «Как новое» просят чаще: иначе под заказ подходит только Пойзон,
  // который за неделю не успевает.
  let maxCond = rng.chance(0.35) ? 0 : 1;

  // Если такая вещь у игрока уже лежит — клиент просит именно её размер
  // и готов на её состояние. Это превращает «повезло» в «я подготовился»:
  // знаешь вкусы клиентов — держишь нужное на полке.
  const owned = S.items.filter((i) => i.m === m.i && !i.defects.length && i.cond <= 2);
  if (owned.length) {
    const pick = rng.pick(owned);
    size = pick.size;
    maxCond = Math.max(maxCond, pick.cond);
  }

  const base = valueOf(m.i, maxCond, size);
  const premium = rng.range(1.14, 1.34) * statusK(client);
  // Срок такой, чтобы успеть привезти от поставщика, но не с Пойзона:
  // быстрый канал поставки — это и есть ценность связей.
  const days = rng.int(6, 13);
  return {
    clientId: client.id,
    m: m.i,
    size,
    maxCond,
    budget: priceRound(base * premium),
    deadline: S.t + days * 24,
    createdAt: S.t,
  };
}

/** Подходит ли вещь под заказ. */
export function matchesOrder(order, item) {
  return (
    item.m === order.m &&
    item.size === order.size &&
    item.cond <= order.maxCond &&
    !item.defects.length
  );
}

export function orderText(order, client) {
  const m = MODELS[order.m];
  const condText = order.maxCond === 0 ? 'только новые с биркой' : 'новые или как новые';
  const sizeText = order.size === 'One size' ? '' : `размер ${order.size}, `;
  const intro =
    client.status === 'vip'
      ? 'Привет! Опять я. '
      : client.status === 'regular'
        ? 'Привет, это снова я. '
        : 'Привет! Подписан на твой канал. ';
  return `${intro}Ищу ${m.b} ${m.n}, ${sizeText}${condText}. Готов отдать {budget}. Нужно до {deadline}. Только оригинал!`;
}

/* ======================= ПОСЛЕДСТВИЯ ======================= */

export function fulfilled(S, client, rng) {
  client.done++;
  client.trust = clamp(client.trust + 12, 0, 100);
  client.lastAt = S.t;
  promote(client);
  // Довольный клиент приводит друзей.
  const refs = client.status === 'vip' ? rng.int(2, 6) : rng.int(0, 3);
  client.referrals += refs;
  return refs;
}

export function failed(S, client, severity) {
  client.failed++;
  // Обмануть хуже, чем не найти; нарушить обещание с предоплатой —
  // между этими двумя.
  const hit = severity === 'fake' ? 45 : severity === 'broke-promise' ? 25 : 14;
  client.trust = clamp(client.trust - hit, 0, 100);
  client.lastAt = S.t;
  if (client.trust <= 10) client.status = 'lost';
  return client.status === 'lost';
}

/** Как часто этот клиент готов снова заказывать. */
export function orderCooldown(client) {
  if (client.status === 'vip') return 24 * 4;
  if (client.status === 'regular') return 24 * 7;
  return 24 * 12;
}

export function canOrderAgain(S, client) {
  return client.status !== 'lost' && S.t - client.lastAt >= orderCooldown(client);
}

/** Заметка в карточке клиента — то, что игрок про него «знает». */
export function clientNote(client) {
  const parts = [];
  if (client.brands.length) parts.push('любит ' + client.brands.join(', '));
  parts.push('одежда ' + client.clothSize + ', обувь ' + client.shoeSize);
  if (client.done) parts.push(client.done + ' ' + plural(client.done, 'заказ', 'заказа', 'заказов'));
  return parts.join(' · ');
}

export function loyalCount(S) {
  return S.clients.filter((c) => c.status === 'regular' || c.status === 'vip').length;
}
