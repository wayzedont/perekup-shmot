// Запуск бренда и жизнь дропа.
//
// Дроп — самая крупная ставка в игре. Производство платится вперёд, деньги
// приходят по дням, а остаток, который аудитория не выкупила, придётся
// слить в аутлет себе в убыток.

import { clamp, rub, num, priceRound } from '../util.js';
import { CATS } from '../data/catalog.js';
import {
  BRAND_LEVEL,
  BRAND_PRICE,
  QUALITY_BY_ID,
  DROP_DAYS,
  SALVAGE_K,
  DEMAND_SPREAD,
  activeDrop,
  demandFor,
  unitCost,
  forecast,
  hasBrand,
} from '../brand.js';
import {
  rngOf,
  pay,
  earn,
  canPay,
  notify,
  toast,
  touch,
  newThread,
  say,
  mentorSay,
  mentorOnce,
  schedule,
} from '../kernel.js';
import { post as channelPost } from '../channel.js';
import { findPartner } from '../market/collab.js';
import { dayIndex } from '../time.js';
import { checkGoals } from '../progression.js';

/* ======================= ЗАПУСК БРЕНДА ======================= */

export function launchBrand(S, name) {
  if (S.prog.lvl < BRAND_LEVEL) {
    toast(S, `Нужен ${BRAND_LEVEL} уровень`);
    return null;
  }
  if (!S.tg.has) {
    toast(S, 'Без своего канала бренд некому показывать');
    return null;
  }
  if (!canPay(S, BRAND_PRICE)) return null;
  const title = (name || '').trim().slice(0, 24) || S.tg.name || 'Без названия';
  pay(S, BRAND_PRICE, 'Запуск бренда «' + title + '»');
  S.flags.brand = 1;
  S.brand = {
    name: title,
    drop: null,
    hits: 0,
    flops: 0,
    collabHits: 0,
    cheated: 0,
    lastDropAt: 0,
    lastCollabAt: 0,
    drops: [],
  };
  channelPost(
    S,
    'brand',
    `Ну что. Я больше не перекуп.\n\nЗапускаю своё — «${title}». Первый дроп скоро, следите.`,
  );
  mentorSay(
    S,
    `Свой лейбл. Я в тебя верил, но не настолько. Теперь слушай главное: дроп — это не покупка вещи, это ставка. Производство платишь вперёд, и если твои ${num(S.tg.subs)} подписчиков не выкупят партию, останешься с коробками. Начни с малого тиража.`,
  );
  checkGoals(S);
  touch(S);
  return { name: title, stats: S.stats, days: dayIndex(S.t) + 1 };
}

/** Переписка с партнёром по коллабу — там же, где все перекупы. */
function rivalChat(S, name) {
  let th = S.threads.find((t) => t.kind === 'rival' && t.name === name);
  if (!th) {
    th = newThread(S, { kind: 'rival', name, sub: 'коллаб', platform: 'tg' });
  }
  th.closed = false;
  return th;
}

/* ======================= ДРОП ======================= */

export const MIN_QTY = 20;
export const MAX_QTY = 1000;

export function canDrop(S) {
  if (!hasBrand(S)) return { ok: false, why: 'Сначала нужен свой бренд' };
  if (activeDrop(S)) return { ok: false, why: 'Текущий дроп ещё продаётся' };
  return { ok: true };
}

export function startDrop(S, { cat, name, qty, price, quality, partner }) {
  const check = canDrop(S);
  if (!check.ok) {
    toast(S, check.why);
    return null;
  }
  if (!CATS[cat]) return null;
  const n = clamp(Math.round(qty || 0), MIN_QTY, MAX_QTY);
  const p = Math.max(300, Math.round(price || 0));
  const q = QUALITY_BY_ID[quality] ? quality : 'normal';
  const unit = unitCost(S, cat, q);

  // В коллабе тираж и выручка делятся. Партнёр фиксируется в момент запуска,
  // чтобы его доля и надёжность потом не поехали вместе с капиталом.
  const pt = partner ? findPartner(S, partner) : null;
  if (partner && !pt) {
    toast(S, 'С этим человеком уже не договориться');
    return null;
  }
  const mine = pt ? 1 - pt.share : 1;
  const spend = Math.round(unit * n * mine);
  if (!canPay(S, spend)) return null;

  pay(S, spend, `Производство: ${n} шт ${CATS[cat].one}` + (pt ? ` (твоя доля)` : ''));
  const title = (name || '').trim().slice(0, 28) || CATS[cat].n;
  // Настоящий спрос разыгрывается здесь и игроку не показывается:
  // на экране была вилка, а угадал он или нет — выяснится по дням.
  const rng = rngOf(S);
  const demand = Math.max(
    0,
    Math.round(
      demandFor(S, { cat, price: p, quality: q, partnerReach: pt ? pt.reach : 0 }) *
        rng.range(1 - DEMAND_SPREAD, 1 + DEMAND_SPREAD),
    ),
  );
  S.brand.drop = {
    cat,
    name: title,
    qty: n,
    left: n,
    price: p,
    quality: q,
    unit,
    spend,
    demand,
    sold: 0,
    revenue: 0,
    reviews: 0,
    startedAt: S.t,
    endsAt: S.t + DROP_DAYS * 24,
    partner: pt ? { name: pt.name, share: pt.share, risk: pt.risk, reach: pt.reach } : null,
    // Кинет он или нет, решается прямо сейчас и игроку не показывается.
    // Узнает он об этом на первой выплате — когда производство уже оплачено.
    cheated: pt ? rng.chance(pt.risk) : false,
  };
  if (S.brand.drop.cheated) S.brand.cheated = (S.brand.cheated || 0) + 1;
  S.brand.lastDropAt = S.t;
  if (pt) S.brand.lastCollabAt = S.t;

  channelPost(
    S,
    'drop',
    pt
      ? `🔥 ДРОП: ${title}\nСовместно с ${pt.name}\n${CATS[cat].n} · ${QUALITY_BY_ID[q].n}\n${rub(p)} · тираж ${n} шт`
      : `🔥 ДРОП: ${title}\n${CATS[cat].n} · ${QUALITY_BY_ID[q].n}\n${rub(p)} · тираж ${n} шт\n\nКто не успел — тот не успел.`,
  );
  notify(S, {
    route: 'shop/brand',
    title: 'Дроп запущен: ' + title,
    text: `${n} шт по ${rub(p)}. Производство обошлось в ${rub(spend)}.`,
  });
  mentorOnce(
    S,
    'firstDrop',
    'Первый свой дроп. Теперь не дёргайся: продажи идут по дням, и в первые два-три дня будет видно, угадал ты с ценой или нет.',
  );
  touch(S);
  return { drop: S.brand.drop };
}

/**
 * Ежедневная продажа дропа.
 * Основное уходит в первые дни, дальше хвост: так ведут себя все дропы.
 */
export function dropTick(S, rng) {
  const d = S.brand && S.brand.drop;
  if (!d || d.closed) return;

  if (S.t >= d.endsAt) {
    closeDrop(S, rng);
    return;
  }
  if (d.left <= 0) {
    closeDrop(S, rng);
    return;
  }

  // Считаем от остатка спроса, а не от его начальной величины: иначе сумма
  // дневных долей переваливает за единицу и дроп продаёт больше, чем людей
  // вообще готовы купить.
  if (d.demandLeft === undefined) d.demandLeft = d.demand;
  const want = Math.round(d.demandLeft * 0.45 * rng.range(0.7, 1.3));
  const n = Math.min(d.left, Math.max(0, want));
  if (n <= 0) {
    // Спрос иссяк — ждать дальше нечего.
    if (d.demandLeft < 1) closeDrop(S, rng);
    return;
  }

  d.demandLeft = Math.max(0, d.demandLeft - n);
  d.left -= n;
  d.sold += n;
  // В коллабе до тебя доходит только твоя доля — и то если партнёр честный.
  const mine = d.partner ? 1 - d.partner.share : 1;
  const money = Math.round(n * d.price * mine);
  if (d.cheated) {
    // Партнёр не переводит ничего с самого начала: товар уходит, денег нет.
    // Узнаёшь об этом на первой же выплате, но производство уже оплачено.
    d.stolen = (d.stolen || 0) + money;
    if (!d.told) {
      d.told = true;
      say(S, rivalChat(S, d.partner.name), 'them', rng.pick([
        'Слушай, с деньгами задержка. Как решу — скину. Не теряй.',
        'Я на связи, просто сейчас запара. Потом разберёмся по деньгам.',
      ]));
      notify(S, {
        route: 'shop/brand',
        title: d.partner.name + ' не переводит деньги',
        text: `Товар по дропу «${d.name}» уходит, а выплат нет. Производство ты уже оплатил.`,
      });
      mentorOnce(
        S,
        'collabCheat',
        'Кинули на коллабе? Увы, это рынок: договор был на словах. С мелкими партнёрами так бывает часто, с теми, кто дорожит именем, — почти никогда. В следующий раз смотри не на долю, а на репутацию.',
      );
    }
  } else {
    d.revenue += money;
    earn(S, money, `Дроп «${d.name}»: ${n} шт` + (d.partner ? ' (твоя доля)' : ''));
    S.stats.revenue += money;
    S.stats.profit += money - Math.round(n * d.unit * mine);
  }

  // Отзывы — единственный источник опыта в игре, и свой бренд тут не
  // исключение: дропами тоже растёшь, просто медленнее, чем зарабатываешь.
  const earned = Math.floor(d.sold / 8) - d.reviews;
  for (let i = 0; i < Math.min(earned, 5); i++) {
    d.reviews++;
    const q = QUALITY_BY_ID[d.quality];
    const stars = rng.weighted([5, 4, 3, 2], (s, idx) => q.stars[idx]);
    schedule(S, S.t + rng.int(6, 40), 'review', {
      stars,
      text:
        stars >= 5
          ? 'Взял дроп, качество удивило. Респект'
          : stars === 4
            ? 'Нормальный дроп, носится'
            : stars === 3
              ? 'За свои деньги сойдёт'
              : 'Качество так себе, за такие деньги ожидал лучше',
      platform: 'tg',
      tierKey: 'street',
    });
  }

  notify(S, {
    route: 'shop/brand',
    title: `Дроп «${d.name}»: ${n} шт`,
    text: d.cheated
      ? `Деньги у ${d.partner.name}, до тебя не дошли. Осталось ${d.left} из ${d.qty}`
      : `+${rub(money)} · осталось ${d.left} из ${d.qty}`,
  });
  touch(S);
}

function closeDrop(S, rng) {
  const d = S.brand.drop;
  if (!d || d.closed) return;
  d.closed = true;
  const through = d.qty ? d.sold / d.qty : 0;

  const mine = d.partner ? 1 - d.partner.share : 1;
  let salvage = 0;
  if (d.left > 0) {
    salvage = Math.round(d.left * d.unit * SALVAGE_K * mine);
    earn(S, salvage, `Аутлет: остаток дропа «${d.name}», ${d.left} шт`);
    S.stats.revenue += salvage;
    S.stats.profit += salvage - Math.round(d.left * d.unit * mine);
  }
  // d.revenue — то, что реально дошло; украденное в него не попадает.
  const profit = d.revenue + salvage - d.spend;

  if (d.cheated) {
    // Партнёр исчез с деньгами. Аудитория про это узнаёт, и доверие падает:
    // для подписчиков это ты выпустил дроп с кидалой.
    S.tg.trust = clamp(S.tg.trust - 6, 0, 100);
    channelPost(
      S,
      'drop',
      `По поводу «${d.name}»: с ${d.partner.name} мы больше не работаем. Кому не доехало — пишите мне.`,
    );
  } else if (through >= 0.8) {
    S.brand.hits++;
    // Удачный коллаб — ещё и знакомство: партнёр остаётся в хороших руках.
    channelPost(
      S,
      'drop',
      d.partner
        ? `«${d.name}» разобрали. Спасибо ${d.partner.name} за коллаб 🖤`
        : `«${d.name}» разобрали. Спасибо всем 🖤 Следующий дроп скоро.`,
    );
    S.tg.trust = clamp(S.tg.trust + (d.partner ? 6 : 4), 0, 100);
    if (d.partner) S.brand.collabHits = (S.brand.collabHits || 0) + 1;
  } else if (through < 0.45) {
    S.brand.flops++;
    S.tg.trust = clamp(S.tg.trust - 3, 0, 100);
    mentorOnce(
      S,
      'dropFlop',
      'Партия зависла. Классика: либо цену задрал, либо тираж не по аудитории, либо дропы слишком часто. Аудитория не резиновая — между дропами нужна пауза.',
    );
  }

  S.brand.drops.unshift({
    name: d.name,
    cat: d.cat,
    qty: d.qty,
    sold: d.sold,
    price: d.price,
    quality: d.quality,
    profit,
    partner: d.partner ? d.partner.name : null,
    cheated: !!d.cheated,
    at: S.t,
  });
  if (S.brand.drops.length > 20) S.brand.drops.length = 20;

  notify(S, {
    route: 'shop/brand',
    title: `Дроп «${d.name}» закрыт`,
    text: d.cheated
      ? `Продано ${d.sold} из ${d.qty}, но деньги забрал ${d.partner.name}. Минус ${rub(-profit)}.`
      : `Продано ${d.sold} из ${d.qty} · ${profit >= 0 ? '+' : ''}${rub(profit)}`,
  });
  S.brand.drop = null;
  checkGoals(S);
  touch(S);
}
