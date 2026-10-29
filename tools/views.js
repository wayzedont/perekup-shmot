// Проверка всех экранов на падение.
//
// Нужна потому, что автотест случайными нажатиями однажды полдня не замечал
// забытый импорт: экран шкафа с выставленной вещью падал с
// «rhythmLabel is not defined», игра после этого не отвечала ни на что, кроме
// полоски «домой», — а кликер просто редко туда доходил.
//
// Здесь экраны вызываются поимённо и все сразу, на заведомо богатом
// состоянии: с товаром, объявлениями, перепиской, заказами, помощником,
// шоурумом, брендом и живым дропом. Это детерминированно, в отличие от
// надежды на случайный тык.
//
// Запуск: node tools/views.js

import { createGame } from '../src/core/engine.js';
import { listItem } from '../src/core/actions/selling.js';
import { legitCheck } from '../src/core/actions/items.js';
import { sellerThread } from '../src/core/actions/buying.js';
import { hire } from '../src/core/actions/staff.js';
import { buyFitting, setWindow } from '../src/core/actions/showroom.js';
import { launchBrand, startDrop } from '../src/core/actions/brand.js';
import { buyStorage } from '../src/core/actions/finance.js';
import { makeBuyer, buyerName } from '../src/core/people/buyers.js';
import { makeClient, makeOrder } from '../src/core/people/clients.js';
import { makeLot, pickLotType } from '../src/core/market/lots.js';
import { newThread, say, rngOf } from '../src/core/kernel.js';
import { itemName } from '../src/core/items.js';
import { valueOrig } from '../src/core/economy.js';
import { fairPrice } from '../src/core/brand.js';
import { MODELS } from '../src/core/data/models.js';

import * as AvitoApp from '../src/ui/apps/avito.js';
import * as TgApp from '../src/ui/apps/tg.js';
import * as PoizonApp from '../src/ui/apps/poizon.js';
import * as SecondApp from '../src/ui/apps/second.js';
import * as WardrobeApp from '../src/ui/apps/wardrobe.js';
import * as BankApp from '../src/ui/apps/bank.js';
import * as ShopApp from '../src/ui/apps/shop.js';
import * as NotebookApp from '../src/ui/apps/notebook.js';
import { parcels, goals, job, settings } from '../src/ui/apps/misc.js';

/** Состояние, в котором есть всё, что умеет показывать интерфейс. */
function richState() {
  const S = createGame(4242);
  S.flags.started = 1;
  S.money = 3000000;
  S.prog.lvl = 16;
  S.prog.sp = 2;
  S.prog.skills = { eye: 7, bargain: 6, sales: 6, smm: 6, logist: 5, conn: 5 };
  for (let i = 0; i < 40; i++) {
    S.rep.reviews.push({ stars: i % 7 === 0 ? 1 : 5, weight: i % 7 === 0 ? 3 : 1, at: S.t, text: 'Отзыв', platform: 'avito' });
  }
  S.tg = { ...S.tg, has: true, name: 'шмот', subs: 12000, trust: 85, proUntil: S.t + 48 };
  S.prog.unlocks = { supplierOrig: 1, supplierRep: 1, legitDiscount: 1, slotBonus: 1, insiderLots: 1, showcase: 1, fastLegit: 1 };
  S.suppliers.orig.unlocked = true;
  S.suppliers.rep.unlocked = true;

  const rng = rngOf(S);

  // Товар: выставленный, проверенный, залежавшийся, паль.
  buyStorage(S, 'rack');
  for (const it of S.items) listItem(S, it, { price: Math.max(500, Math.round(valueOrig(S, it) * 0.9)), asOrig: true, avito: true, tg: true });
  legitCheck(S, S.items[0]);
  S.items[1].boughtAt = S.t - 24 * 30;

  // Переписки всех видов.
  const listing = S.listings[0];
  if (listing) {
    sellerThread(S, listing);
    listing.photosAsked = true;
    listing.met = true;
  }
  const item = S.items[0];
  const buyer = makeBuyer(S, rng, item, 'avito', item.sale.price);
  buyer.asked = { auth: true };
  buyer.pendingPrice = item.sale.price;
  const bth = newThread(S, { kind: 'buyer', name: buyerName(rng), sub: itemName(item), platform: 'avito', data: { buyer } });
  say(S, bth, 'them', 'Это точно оригинал?');

  const client = makeClient(S, rng);
  S.clients.push(client);
  const order = makeOrder(S, rng, client, (mi, cond, size) => valueOrig(S, { m: mi, cond, size, boughtAt: S.t }));
  const oth = newThread(S, { kind: 'order', name: client.name, sub: 'заказ', platform: 'tg', data: { order, clientId: client.id } });
  say(S, oth, 'them', 'Нужна вещь, возьмёшься?');

  const lot = makeLot(S, rng, pickLotType(S, rng));
  if (lot) {
    const lth = newThread(S, { kind: 'lot', name: 'Лот', sub: 'предложение', platform: 'tg', data: { lot } });
    say(S, lth, 'them', 'Есть мешок, интересно?');
  }

  // Эндгейм.
  buyStorage(S, 'wardrobe');
  buyStorage(S, 'closet');
  buyStorage(S, 'warehouse');
  buyStorage(S, 'showroom');
  for (const f of ['repair', 'racks', 'sign']) buyFitting(S, f);
  setWindow(S, S.items.filter((i) => i.sale).map((i) => i.id));
  hire(S, 'manager');
  launchBrand(S, 'ПОДВАЛ');
  startDrop(S, { cat: 'hoodie', name: 'Зима', qty: 60, price: fairPrice(S, 'hoodie'), quality: 'normal' });

  S.raffle = S.raffle || null;
  return S;
}

const APPS = {
  avito: { mod: AvitoApp, views: ['main', 'mine', 'chats', 'item', 'meeting', 'thread'] },
  tg: { mod: TgApp, views: ['main', 'thread', 'channel', 'own', 'client'] },
  poizon: { mod: PoizonApp, views: ['main', 'item'] },
  second: { mod: SecondApp, views: ['main', 'item'] },
  wardrobe: { mod: WardrobeApp, views: ['main', 'item'] },
  bank: { mod: BankApp, views: ['main'] },
  shop: { mod: ShopApp, views: ['main', 'showroom', 'brand'] },
  notebook: { mod: NotebookApp, views: ['main', 'item'] },
  parcels: { mod: parcels, views: ['main'] },
  goals: { mod: goals, views: ['main'] },
  job: { mod: job, views: ['main'] },
  settings: { mod: settings, views: ['main'] },
};

const GARBAGE = /\bNaN\b|\bundefined\b|\[object |\bInfinity\b/;

const S = richState();
let checked = 0;
let failed = 0;

/** Какие id подставлять, чтобы экран карточки получил настоящий объект. */
function idsFor(app) {
  if (app === 'avito') return [S.listings[0] ? S.listings[0].id : null, null];
  if (app === 'wardrobe') return [S.items[0] ? S.items[0].id : null, null];
  if (app === 'second') return [S.second.items[0] ? S.second.items[0].id : null, null];
  if (app === 'poizon') return [MODELS[0].i, null];
  if (app === 'notebook') return [MODELS[0].i, null];
  if (app === 'tg') return [...S.threads.map((t) => t.id), null];
  return [null];
}

for (const [app, { mod, views }] of Object.entries(APPS)) {
  for (const view of views) {
    for (const id of idsFor(app)) {
      S.ui.app = app;
      S.ui.view = view;
      S.ui.id = id;
      S.ui.channel = 'radar';
      checked++;
      let res = null;
      try {
        res = mod.view(S);
      } catch (e) {
        failed++;
        console.error(`  ✗ ${app}/${view}${id === null ? '' : ' #' + id} — ${e.message}`);
        continue;
      }
      const html = [res && res.title, res && res.tabs, res && res.aside, res && res.body, res && res.foot]
        .filter(Boolean)
        .join(' ');
      if (!html) {
        failed++;
        console.error(`  ✗ ${app}/${view}${id === null ? '' : ' #' + id} — пустой экран`);
        continue;
      }
      const text = html.replace(/<[^>]*>/g, ' ');
      const bad = text.match(GARBAGE);
      if (bad) {
        failed++;
        console.error(`  ✗ ${app}/${view}${id === null ? '' : ' #' + id} — на экране «${bad[0]}»`);
      }
    }
  }
}

console.log(
  failed
    ? `\n✗ экранов с ошибкой: ${failed} из ${checked}`
    : `\n✓ все ${checked} вызовов экранов отрисовались без ошибок и мусора`,
);
process.exit(failed ? 1 : 0);
