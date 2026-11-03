// Фаззер ядра: случайный игрок жмёт любые действия подряд, а после каждого
// проверяются инварианты, которые игра обязана держать всегда.
//
// Боты играют осмысленно и поэтому ходят по одним и тем же тропинкам.
// Здесь наоборот: продать вещь, которой уже нет, взять кредит в полночь,
// дважды ответить покупателю, отдать на заказ вещь из посылки.
//
// Запуск: node sim/fuzz.js [прогонов] [дней]

import { createGame, loadGame, restoreCounters } from '../src/core/engine.js';
import { advanceHours, sleep, tickHealth } from '../src/core/tick.js';
import { capacity, usedSlots } from '../src/core/economy.js';
import { creditLimit } from '../src/core/bank.js';
import { MODELS } from '../src/core/data/models.js';
import { TELLS } from '../src/core/data/catalog.js';
import { hourIndex } from '../src/core/time.js';
import * as Buy from '../src/core/actions/buying.js';
import * as Sell from '../src/core/actions/selling.js';
import * as Items from '../src/core/actions/items.js';
import * as Fin from '../src/core/actions/finance.js';
import * as Soc from '../src/core/actions/social.js';
import * as Staff from '../src/core/actions/staff.js';
import * as Room from '../src/core/actions/showroom.js';
import * as Brand from '../src/core/actions/brand.js';
import { fairPrice } from '../src/core/brand.js';
import { STORAGE } from '../src/core/data/progress.js';
import { pruneNotifications } from '../src/core/kernel.js';

const RUNS = +process.argv[2] || 40;
const DAYS = +process.argv[3] || 40;

let seedState = 1;
const rnd = () => ((seedState = (seedState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => (a && a.length ? a[(rnd() * a.length) | 0] : undefined);
const tells = Object.keys(TELLS);

const open = (S, kind) => S.threads.filter((t) => !t.closed && (!kind || t.kind === kind));

/** Все действия игрока. Каждое само выбирает, к чему его применить. */
const ACTIONS = {
  ask: (S) => { const l = pick(S.listings); if (!l) return; Buy.askSeller(S, l, pick(['photos', 'defects', 'orig', 'why', 'actual'])); if (l.photosAsked) { Buy.photoInspect(S, l, pick(tells)); if (rnd() < 0.3) Buy.photoLegit(S, l); } },
  lever: (S) => { const l = pick(S.listings); if (!l) return; const lv = pick(Buy.availableLevers(S, l)); lv && Buy.useLever(S, l, lv.key || lv); },
  offer: (S) => { const l = pick(S.listings); l && Buy.offerToSeller(S, l, Math.round(l.ask * (0.5 + rnd() * 0.6))); },
  ship: (S) => { const l = pick(S.listings); l && Buy.buyWithDelivery(S, l); },
  confirm: (S) => { const l = pick(S.listings); l && Buy.confirmDelivery(S, l); },
  meet: (S) => { const l = pick(S.listings); if (!l) return; Buy.startMeeting(S, l); if (l.met) { Buy.meetInspect(S, l, pick(tells)); if (rnd() < 0.3) Buy.handLegit(S, l); if (rnd() < 0.2) Buy.accuseFake(S, l); if (rnd() < 0.3) Buy.meetInspectCondition(S, l); if (rnd() < 0.5) Buy.buyAtMeeting(S, l); } },
  scam: (S) => { const l = pick(S.listings.filter((x) => x.scamPush)); l && rnd() < 0.2 && Buy.payScammer(S, l); },
  second: (S) => { const s = pick(S.second.items); if (!s) return; Buy.secondInspect(S, s.id, pick(tells)); if (rnd() < 0.3) Buy.secondInspectCondition(S, s.id); if (rnd() < 0.4) Buy.buySecond(S, s.id); },
  poizon: (S) => { const m = pick(MODELS); Buy.buyPoizon(S, m.i, 'mix', pick([1, 1, 2, 5])); },
  supplier: (S) => { const k = pick(['orig', 'rep']); const p = pick(S.suppliers[k].posts); p && Buy.buyFromSupplier(S, k, p.id, pick([1, 5, 6])); },
  buyAd: (S) => Buy.postBuyAd(S),
  supply: (S) => { const m = pick(MODELS); Buy.canRequestSupply(S) && Buy.requestSupply(S, m.i, undefined, 1); },
  lot: (S) => { const th = pick(open(S, 'lot')); if (!th) return; pick([Buy.takeLot, Buy.haggleLot, Buy.declineLot])(S, th); },

  inspect: (S) => { const it = pick(S.items); it && Items.inspectTell(S, it, pick(tells), 'hand'); },
  cond: (S) => { const it = pick(S.items); it && Items.inspectCondition(S, it); },
  legit: (S) => { const it = pick(S.items); it && Items.legitCheck(S, it); },
  dispute: (S) => { const it = pick(S.items); it && Items.openDispute(S, it); },
  clean: (S) => { const it = pick(S.items); it && Items.cleanUp(S, it); },
  photo: (S) => { const it = pick(S.items); it && Items.photoshoot(S, it); },
  desc: (S) => { const it = pick(S.items); it && Items.writeDescription(S, it); },
  pawn: (S) => { const it = pick(S.items); it && rnd() < 0.2 && Items.pawn(S, it); },
  bump: (S) => { const it = pick(S.items.filter((i) => i.sale)); it && Items.bumpListing(S, it); },

  list: (S) => { const it = pick(S.items); if (!it) return; const p = Sell.priceSuggestions(S, it, rnd() < 0.7); Sell.listItem(S, it, { price: Math.max(100, Math.round((p.base || 1000) * (0.8 + rnd() * 0.5))), asOrig: rnd() < 0.7, avito: rnd() < 0.8, tg: S.tg.has && rnd() < 0.6 }); },
  unlist: (S) => { const it = pick(S.items.filter((i) => i.sale)); it && rnd() < 0.2 && Sell.unlist(S, it); },
  repost: (S) => { const it = pick(S.items.filter((i) => i.sale)); it && Sell.repostToChannel(S, it); },
  buyer: (S) => {
    const th = pick(open(S, 'buyer'));
    if (!th) return;
    const b = th.data.buyer;
    if (b.phishing) return void (rnd() < 0.1 ? Sell.phishingFollow(S, th) : Sell.phishingBlock(S, th));
    if (Sell.canShowProof(S, th) && rnd() < 0.5) Sell.showProof(S, th);
    if (b.asked && b.asked.auth && !b.agreed) { const o = pick(Sell.authOptions(S, th)); o && Sell.answerAuth(S, th, o.key); }
    else if (b.agreed) rnd() < 0.85 ? Sell.completeSale(S, th) : Sell.declineBuyer(S, th);
    else pick([() => Sell.acceptOffer(S, th), () => Sell.counterToBuyer(S, th, Math.round(b.offer * (1 + rnd() * 0.3))), () => Sell.declineBuyer(S, th)])();
  },
  claim: (S) => { const th = pick(open(S, 'claim')); th && (rnd() < 0.6 ? Sell.refundClaim(S, th) : Sell.refuseClaim(S, th)); },
  order: (S) => {
    const th = pick(open(S, 'order'));
    if (!th) return;
    const o = th.data.order;
    if (!o.accepted) return void (rnd() < 0.7 ? Soc.acceptOrder(S, th) : Soc.declineOrder(S, th));
    const it = pick(Soc.orderMatches(S, o));
    if (it) Soc.fulfillOrder(S, th, it);
  },

  credit: (S) => Fin.takeCredit(S, pick([1000, 3000, 5000, 20000]), pick([2, 4, 8])),
  repay: (S) => { const l = pick(S.loans); l && (rnd() < 0.5 ? Fin.repayPart(S, l.id, pick([500, 2000, 100000])) : Fin.repayAll(S, l.id)); },
  deposit: (S) => (rnd() < 0.5 ? Fin.depositMoney(S, pick([1000, 5000])) : Fin.withdrawDeposit(S)),
  skill: (S) => Fin.spendSkill(S, pick(['eye', 'bargain', 'sales', 'smm', 'logist', 'conn'])),
  storage: (S) => Fin.buyStorage(S, pick(STORAGE).id),
  job: (S) => { const j = pick(Fin.availableJobs(S)); j && Fin.workShift(S, j.id); },

  channel: (S) => (S.tg.has ? null : Soc.createChannel(S, 'фазз')),
  trends: (S) => Soc.postTrends(S),
  give: (S) => { const it = pick(S.items); it && rnd() < 0.1 && Soc.giveaway(S, it); },
  ad: (S) => Soc.buyAd(S, (rnd() * 6) | 0),
  pro: (S) => rnd() < 0.2 && Soc.buyPro(S),
  raffle: (S) => S.raffle && Soc.enterRaffle(S, pick(['42', 'M', '43', 'L'])),

  hire: (S) => Staff.hire(S, pick(['intern', 'seller', 'manager'])),
  fire: (S) => rnd() < 0.1 && Staff.fire(S),
  fitting: (S) => Room.buyFitting(S, pick(['repair', 'racks', 'sign', 'mirror', 'light', 'music'])),
  window: (S) => Room.setWindow(S, S.items.filter((i) => i.sale).slice(0, 3).map((i) => i.id)),
  brand: (S) => Brand.launchBrand(S, 'ФАЗЗ'),
  drop: (S) => Brand.canDrop(S) && Brand.startDrop(S, { cat: 'hoodie', name: 'Ф', qty: 30, price: fairPrice(S, 'hoodie'), quality: 'normal' }),

  wait: (S) => advanceHours(S, pick([1, 1, 3])),
  sleep: (S) => hourIndex(S.t) >= 20 && sleep(S),
};

/* ---------- инварианты ---------- */

function badNumbers(obj, path, out, depth) {
  if (depth > 9 || out.length > 5) return out;
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) out.push(path);
    return out;
  }
  if (!obj || typeof obj !== 'object') return out;
  for (const k of Object.keys(obj)) badNumbers(obj[k], path + '.' + k, out, depth + 1);
  return out;
}

function invariants(S, deep) {
  const out = [];
  if (!(S.money >= 0)) out.push('деньги ушли в минус: ' + S.money);
  const ids = [...S.items.map((i) => i.id), ...S.shipments.flatMap((s) => s.items.map((i) => i.id))];
  if (new Set(ids).size !== ids.length) {
    const dup = ids.find((x, i) => ids.indexOf(x) !== i);
    const where = [...S.items.filter((i) => i.id === dup).map((i) => "шкаф:" + i.src), ...S.shipments.filter((s) => s.items.some((i) => i.id === dup)).map((s) => "посылка:" + s.name)];
    const both = [...S.items, ...S.shipments.flatMap((s) => s.items)].filter((i) => i.id === dup);
    out.push("одна вещь лежит дважды " + where.join(" + ") + " · id " + dup + " · куплены " + both.map((i) => i.boughtAt).join("/"));
  }
  if (ids.some((x) => x === undefined || x === null)) out.push('вещь без id');
  for (const l of S.loans) if (!(l.principal >= -1)) out.push('кредит с отрицательным телом');
  for (const th of S.threads) {
    if (th.closed) continue;
    if (th.kind === 'buyer' && th.data.buyer && !S.items.some((i) => i.id === th.data.buyer.item)) out.push('открыта переписка о вещи, которой нет');
    if (th.kind === 'buyer' && th.data.buyer) {
      const it = S.items.find((i) => i.id === th.data.buyer.item);
      if (it && !it.sale) out.push('покупатель пишет о снятой с продажи вещи');
    }
  }
  // Требование автора: уведомление о закрытой сделке не должно висеть.
  // Шторка чистит журнал при каждой отрисовке — делаем то же самое.
  pruneNotifications(S);
  for (const n of S.notif) {
    const m = /thread\/(\w+)/.exec(n.route || '');
    if (n.scope === 'client' && m) {
      const th = S.threads.find((t) => String(t.id) === m[1]);
      if (!th || th.closed) out.push('уведомление о закрытой сделке осталось: ' + n.title);
    }
  }
  for (const it of S.items) {
    if (it.sale && !(it.sale.price > 0)) out.push('объявление без цены');
    if (!MODELS[it.m]) out.push('вещь неизвестной модели');
  }
  if (deep) {
    const bad = badNumbers(S, 'S', [], 0);
    if (bad.length) out.push('NaN/Infinity: ' + bad.join(', '));
  }
  return out;
}

/* ---------- прогон ---------- */

const found = new Map();
function report(key, info) {
  if (!found.has(key)) found.set(key, { n: 0, ...info });
  found.get(key).n++;
}

const keys = Object.keys(ACTIONS);
const cover = { sold: 0, bought: 0, secondBuys: 0, poizonOrders: 0, ordersDone: 0, caught: 0, refunds: 0, legitChecks: 0, meetings: 0, scammed: 0, disputesWon: 0, returns: 0, adBuys: 0 };
for (let run = 1; run <= RUNS; run++) {
  seedState = run * 7919;
  let S = createGame(run * 31, { tutorial: 'skip' });
  S.flags.started = 1;
  // Половина прогонов — с деньгами и уровнем, чтобы дойти до эндгейма.
  if (run % 2 === 0) {
    S.money = 4000000;
    S.prog.lvl = 16;
    S.prog.sp = 20;
  }
  const end = S.t + DAYS * 24;
  let steps = 0;
  let lastT = S.t;
  let xpWas = S.prog.lvl * 1e6 + S.prog.xp;
  let revWas = S.rep.reviews[0];
  while (S.t < end && steps < DAYS * 400) {
    steps++;
    const name = pick(keys);
    const slotsWas = usedSlots(S);
    const creditWas = S.loans.filter((l) => l.name === 'Кредит').reduce((a, l) => a + l.principal, 0);
    try {
      ACTIONS[name](S);
    } catch (e) {
      const where = (e.stack || '').split('\n').slice(1, 3).join(' | ').trim();
      report('throw:' + name + ':' + e.message, { kind: 'исключение', action: name, msg: e.message, where, run, t: S.t });
      advanceHours(S, 1);
    }
    if (S.t < lastT) report('time-back', { kind: 'время пошло назад', action: name, run });
    lastT = S.t;
    // Требование автора: опыт — только за отзывы.
    const xpNow = S.prog.lvl * 1e6 + S.prog.xp;
    const revNow = S.rep.reviews[0];
    if (xpNow !== xpWas && revNow === revWas) report('xp:' + name, { kind: 'опыт без отзыва', action: name, run, t: S.t });
    xpWas = xpNow;
    revWas = revNow;
    // Кредит не выше лимита уровня (микрозайм — отдельная история).
    const credit = S.loans.filter((l) => l.name === 'Кредит').reduce((a, l) => a + l.principal, 0);
    if (name === 'credit' && credit > creditWas + 1 && credit > creditLimit(S) + 1) report('credit-cap', { kind: 'кредит выше лимита', action: name, msg: `${credit} > ${creditLimit(S)}`, run, t: S.t });
    if (usedSlots(S) > capacity(S) && usedSlots(S) > slotsWas && !['wait', 'sleep'].includes(name)) report('cap:' + name, { kind: 'шкаф переполнен действием', action: name, msg: `${usedSlots(S)} > ${capacity(S)}`, run, t: S.t });
    for (const v of invariants(S, steps % 50 === 0)) {
      report('inv:' + v.replace(/[\d.:-]+/g, '#'), { kind: 'инвариант', action: name, msg: v, run, t: S.t });
    }
    if (steps % 12 === 0) advanceHours(S, 1);
    // Телефон перезагружает страницу постоянно: свернул браузер, погас
    // экран. Всё, что держалось на общей ссылке между двумя частями
    // состояния, после загрузки становится двумя копиями.
    if (steps % 150 === 0) {
      let raw = JSON.stringify(S);
      const back = loadGame({ getItem: () => raw, setItem: () => {}, removeItem: () => {} });
      if (!back) report('reload', { kind: 'сейв не загрузился', action: name, run, t: S.t });
      else {
        restoreCounters(back);
        S = back;
        S.flags.started = 1;
      }
      raw = null;
    }
  }
  for (const k of Object.keys(cover)) cover[k] += S.stats[k] || 0;
}

if (tickHealth.nested) report('nested', { kind: 'вложенный такт', action: '—', msg: `время двигалось изнутри часового такта ${tickHealth.nested} раз` });
console.log('Покрытие (сумма по прогонам): ' + Object.entries(cover).map(([k, v]) => `${k} ${v}`).join(', '));

if (!found.size) {
  console.log(`✓ ${RUNS} прогонов × ${DAYS} дней: ни исключений, ни нарушений`);
} else {
  console.log(`✗ найдено проблем: ${found.size}\n`);
  for (const f of [...found.values()].sort((a, b) => b.n - a.n)) {
    console.log(`[${f.kind}] ×${f.n} после «${f.action}» (прогон ${f.run}, t=${f.t}): ${f.msg || ''}`);
    if (f.where) console.log('    ' + f.where);
  }
}
process.exit(found.size ? 1 : 0);
