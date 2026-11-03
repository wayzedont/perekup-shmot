// Итоги сезона как история, а не как таблица.
//
// Четыре месяца игры заканчивались семью строчками с цифрами. Цифры нужны,
// но они не рассказывают, кем ты стал и что с тобой за это время произошло.
// А в брифе прямо сказано: нужны истории, которые хочется рассказать.
//
// Поэтому здесь из того, что уже записано в сейве — сделки, отзывы, клиенты,
// дропы, — собирается три вещи: звание, которое ты заслужил своей манерой
// играть, несколько конкретных моментов с датами и именами, и честный
// пересказ того, что переносится дальше.

import { rub, plural } from './util.js';
import { MODELS } from './data/models.js';
import { dateLabel } from './time.js';
import { netWorth } from './economy.js';
import { statusOf, nextSeasonLevel } from './data/progress.js';
import { RIVAL_NAME } from './rival.js';

/**
 * Звание по манере игры, а не по уровню.
 * Проверяются сверху вниз, первое подходящее и берётся, — поэтому выше стоит
 * то, что сильнее характеризует игрока.
 */
const TITLES = [
  {
    id: 'brand',
    when: (S) => !!S.flags.brand,
    n: 'Свой лейбл',
    d: 'Начинал с чужой олимпийки, закончил своим именем на бирке.',
  },
  {
    id: 'fake',
    when: (S) => S.stats.sold >= 15 && S.stats.fakeAsOrig / Math.max(1, S.stats.sold) > 0.25,
    n: 'Паль-король',
    d: 'Каждая четвёртая вещь уходила под чужим именем. Рынок это запомнил.',
  },
  {
    id: 'honest',
    when: (S) => S.stats.sold >= 20 && S.stats.caught === 0 && S.stats.fakeAsOrig === 0,
    n: 'Честный перекуп',
    d: 'Ни одной подделки под видом оригинала за весь сезон. Редкость в этом деле.',
  },
  {
    id: 'showroom',
    when: (S) => (S.showroom.walkIns || 0) >= 25,
    n: 'Человек с витриной',
    d: 'К тебе стали заходить с улицы — значит, ты уже не перекуп, а магазин.',
  },
  {
    id: 'clients',
    when: (S) => S.stats.clientsLoyal >= 5,
    n: 'Свой для своих',
    d: 'Постоянные клиенты, которые пишут лично и платят выше рынка.',
  },
  {
    id: 'eye',
    when: (S) => S.prog.skills.eye >= 7,
    n: 'Намётанный глаз',
    d: 'Отличаешь паль с одного взгляда на бирку.',
  },
  {
    // Просрочки сами по себе звания не делают: игрок двенадцатого уровня с
    // капиталом в полмиллиона не «вечно в долгах», даже если пару раз
    // не успел к понедельнику.
    id: 'debt',
    when: (S) => (S.credit.missed || 0) >= 3 && netWorth(S) < 200000,
    n: 'Вечно в долгах',
    d: 'Жил в кредит и выжил. Это тоже стратегия, хоть и нервная.',
  },
];

export function seasonTitle(S) {
  const hit = TITLES.find((t) => t.when(S));
  if (hit) return hit;
  return {
    id: 'plain',
    n: statusOf(S.prog.lvl),
    d: 'Сезон отработан ровно, без громких историй. Иногда это и есть результат.',
  };
}

/**
 * Моменты сезона: конкретные события с датами, а не агрегаты.
 * Берём только то, что действительно было, — пустые строчки не выдумываем.
 */
export function seasonMoments(S, limit = 5) {
  const out = [];
  const deals = S.deals || [];

  const best = deals.reduce((a, d) => (!a || d.profit > a.profit ? d : a), null);
  if (best && best.profit > 0) {
    out.push({
      n: 'Лучшая сделка',
      t: `${best.label} ушла за ${rub(best.price)} при закупке в ${rub(best.cost)}. Чистыми ${rub(best.profit)} — ${dateLabel(best.at)}.`,
    });
  }

  const worst = deals.reduce((a, d) => (!a || d.profit < a.profit ? d : a), null);
  if (worst && worst.profit < -500) {
    out.push({
      n: 'Худшая сделка',
      t: `${worst.label}: минус ${rub(-worst.profit)}. ${
        worst.disputed ? 'Спор проигран.' : worst.returned ? 'Вернули по размеру.' : 'Просто не угадал.'
      } ${dateLabel(worst.at)}.`,
    });
  }

  const loyal = (S.clients || []).filter((c) => c.done > 0).sort((a, b) => a.since - b.since)[0];
  if (loyal) {
    out.push({
      n: 'Первый свой клиент',
      t: `${loyal.name}, с нами с ${dateLabel(loyal.since)}. Заказов выполнено: ${loyal.done}.`,
    });
  }

  if (S.stats.caught > 0) {
    out.push({
      n: 'Ловили на пали',
      t: `${S.stats.caught} ${plural(S.stats.caught, 'раз', 'раза', 'раз')} покупатель дошёл до легит-чека. Каждый такой отзыв весит втрое.`,
    });
  }

  const drop = (S.brand && S.brand.drops ? S.brand.drops : []).reduce(
    (a, d) => (!a || d.profit > a.profit ? d : a),
    null,
  );
  if (drop) {
    out.push({
      n: 'Главный дроп',
      t: `«${drop.name}»: продано ${drop.sold} из ${drop.qty} по ${rub(drop.price)}${
        drop.partner ? `, вместе с ${drop.partner}${drop.cheated ? ' — который потом пропал с деньгами' : ''}` : ''
      }. Итог ${rub(drop.profit)}.`,
    });
  }

  if (S.rival.sniped > 0) {
    out.push({
      n: RIVAL_NAME,
      t:
        netWorth(S) > S.rival.nw
          ? `Перехватил у тебя ${S.rival.sniped} ${plural(S.rival.sniped, 'вещь', 'вещи', 'вещей')}, но в топе ты всё равно выше.`
          : `Перехватил у тебя ${S.rival.sniped} ${plural(S.rival.sniped, 'вещь', 'вещи', 'вещей')} и остался впереди. В следующем сезоне разберёшься.`,
    });
  }

  if (S.stats.scammed > 0) {
    out.push({
      n: 'Кидалы',
      t: `${S.stats.scammed} ${plural(S.stats.scammed, 'раз', 'раза', 'раз')} перевёл деньги на карту и остался ни с чем.`,
    });
  }

  if ((S.showroom.walkIns || 0) > 0) {
    out.push({
      n: 'Шоурум',
      t: `${S.showroom.walkIns} ${plural(S.showroom.walkIns, 'человек зашёл', 'человека зашли', 'человек зашли')} с улицы и унесли вещей на ${rub(S.showroom.revenue)}.`,
    });
  }

  return out.slice(0, limit);
}

/**
 * Хроника: те же моменты, но по ходу сезона и полнее — с первой продажей,
 * граалями и серией дел. Это то, что хочется показать другу, и мягкая
 * причина зайти «посмотреть, как я рос».
 */
export function chronicle(S) {
  const out = [];
  const deals = S.deals || [];
  const first = S.firstDeal || (deals.length < 200 ? deals[deals.length - 1] : null);
  if (first) {
    out.push({
      n: 'С чего началось',
      t: `Первая продажа — ${first.label} за ${rub(first.price)}, ${dateLabel(first.at)}. ${first.profit > 0 ? `Плюс ${rub(first.profit)}.` : 'В минус, но надо же с чего-то начинать.'}`,
    });
  }
  out.push(...seasonMoments(S, 12));
  if (S.stats.grails > 0) {
    out.push({
      n: 'Граали',
      t: `${S.stats.grails} ${plural(S.stats.grails, 'грааль добыт', 'грааля добыто', 'граалей добыто')} для коллекционеров. Такие вещи всплывают раз в неделю, и за ними охотится ${RIVAL_NAME}.`,
    });
  }
  const sets = Object.keys(S.collections || {});
  if (sets.length) {
    const last = MODELS[+sets.reduce((a, b) => (S.collections[b] > S.collections[a] ? b : a))];
    out.push({
      n: 'Коллекции',
      t: `${sets.length} ${plural(sets.length, 'коллекция собрана', 'коллекции собраны', 'коллекций собрано')} — все расцветки одной модели разом. Последняя — ${last.b} ${last.n}.`,
    });
  }
  if (S.daily && S.daily.best >= 3) {
    out.push({
      n: 'Серия',
      t: `Лучшая серия дел Тимура — ${S.daily.best} ${plural(S.daily.best, 'день', 'дня', 'дней')} подряд${S.daily.streak >= S.daily.best ? ', и она ещё идёт' : ''}.`,
    });
  }
  return out;
}

/**
 * Что именно переносится в следующий сезон.
 *
 * Здесь важна точность до занудства: экран, который обещает «уровень 9»,
 * когда код оставляет четвёртый, — это враньё игроку. Уровень берётся из
 * той же функции, что и сам переход, а про канал сказано честно: без
 * модификатора «репутация» он не переносится вовсе.
 */
export function seasonCarry(S) {
  const out = [];
  const studied = Object.keys(S.notebook || {}).length;
  if (studied) out.push(`книжка целиком: ${studied} ${plural(studied, 'модель', 'модели', 'моделей')}`);
  const skills = Object.values(S.prog.skills).reduce((a, b) => a + b, 0);
  if (skills) out.push(`навыки: ${skills} ${plural(skills, 'вложенное очко', 'вложенных очка', 'вложенных очков')}`);
  const next = nextSeasonLevel(S.prog.lvl);
  out.push(`уровень ${S.prog.lvl} → начнёшь с ${next}-го`);
  const vip = (S.clients || []).filter((c) => c.status === 'vip').length;
  if (vip) out.push(`${vip} ${plural(vip, 'свой клиент', 'своих клиента', 'своих клиентов')}`);
  const pro = Object.keys(S.upgrades || {}).length;
  if (pro) out.push(`Pro-версии приложений: ${pro} из Апстора`);
  if (S.daily && S.daily.streak) out.push(`серия дел Тимура: ${S.daily.streak} ${plural(S.daily.streak, 'день', 'дня', 'дней')}`);
  return out;
}

/** Чего игрок лишится — это тоже надо сказать прямо. */
export function seasonLose(S) {
  const out = ['деньги, товар и долги'];
  if (S.tg.has) {
    out.push(`канал на ${S.tg.subs} ${plural(S.tg.subs, 'подписчика', 'подписчика', 'подписчиков')} — уцелеет только с «репутацией»`);
  }
  if (S.rep.reviews.length) out.push('отзывы и рейтинг — с «репутацией» останется двадцать последних');
  if (S.prog.storage && Object.keys(S.prog.storage).length) out.push('склады и шоурум');
  return out;
}
