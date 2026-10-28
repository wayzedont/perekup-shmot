// Рынок живёт сам: ликвидность дрейфует, выходят коллабы, падает юань,
// таможня устраивает рейды. У большинства событий за день-два до начала
// появляются слухи — за них и платит подписка на прогноз.

import { clamp } from './util.js';
import { MODELS, BRANDED } from './data/models.js';
import { dateAt } from './time.js';

/* ======================= ДРЕЙФ ЛИКВИДНОСТИ ======================= */

export function driftMarket(S, rng) {
  const M = S.market;
  for (let i = 0; i < M.h.length; i++) {
    const base = MODELS[i].hype;
    if (M.until[i] && S.t >= M.until[i]) {
      M.hT[i] = clamp(base + rng.range(-0.1, 0.1), 0.04, 1);
      M.until[i] = 0;
      M.rate[i] = 0.12;
    }
    M.hT[i] = clamp(M.hT[i] + rng.range(-0.015, 0.015), 0.04, 1);
    // Иногда цель тихо разворачивается — это и ловит платный прогноз.
    if (!M.until[i] && rng.chance(0.035)) {
      M.hT[i] = clamp(M.hT[i] + rng.range(-0.3, 0.3), 0.05, 0.95);
    }
    M.h[i] = clamp(M.h[i] + (M.hT[i] - M.h[i]) * M.rate[i] + rng.range(-0.012, 0.012), 0.03, 1);
    // Пойзон видит рынок с опозданием.
    M.hP[i] = M.hP[i] + (M.h[i] - M.hP[i]) * 0.07;
    M.pzNoise[i] = clamp(M.pzNoise[i] + rng.range(-0.02, 0.02), 0.92, 1.08);
  }
  M.fx = clamp(M.fx + rng.range(-0.08, 0.08), 10, 14.5);
}

/* ======================= СОБЫТИЯ ======================= */

export function generateEvent(S, rng, addRumor) {
  const r = rng.f();
  const start = S.t + rng.int(18, 44);
  let e;

  if (r < 0.34) {
    const m = rng.weighted(BRANDED, (x) => (1 - S.market.h[x.i]) * (x.tier === 'lux' ? 0.4 : 1));
    e = {
      type: 'wave',
      m: m.i,
      start,
      end: start + rng.int(12, 20) * 24,
      title: `${m.b} ${m.n} — главный хайп недели`,
      text: 'Блогеры и рэперы скупили всё. Ликвидность улетает под сотню. Ловите момент, пока Пойзон не подтянул цены.',
    };
    addRumor(`👀 Инсайд: в закрытых чатах начали скупать ${m.b} ${m.n}. Если подтвердится — через пару дней будет хайп.`);
  } else if (r < 0.52) {
    const m = rng.weighted(BRANDED, (x) => S.market.h[x.i] * S.market.h[x.i]);
    e = {
      type: 'dead',
      m: m.i,
      start: S.t + 6,
      end: S.t + rng.int(14, 24) * 24,
      title: `${m.b} ${m.n} всех задолбали`,
      text: 'Рынок перенасыщен, ликвидность валится. Кто взял партию — сливайте, пока берут.',
    };
  } else if (r < 0.63) {
    const brands = [...new Set(BRANDED.filter((m) => m.tier !== 'mass').map((m) => m.b))];
    const b = rng.pick(brands);
    e = {
      type: 'brand',
      brand: b,
      start,
      end: start + rng.int(10, 16) * 24,
      title: `${b}: вышел коллаб, бренд снова в моде`,
      text: `Все вещи ${b} в тренде: ликвидность растёт по всей линейке.`,
    };
    addRumor(`👀 Слухи: ${b} готовит громкий коллаб. Возможно, бренд скоро выстрелит.`);
  } else if (r < 0.72) {
    const up = rng.chance(0.5);
    e = {
      type: 'fx',
      val: up ? rng.range(1, 2) : -rng.range(1, 2),
      start,
      end: start + 24,
      title: up ? 'Юань подорожал' : 'Юань подешевел',
      text: up ? 'Заказы с Пойзона стали дороже.' : 'Заказы с Пойзона подешевели. Время закупаться.',
    };
    addRumor(`💱 Аналитики ждут ${up ? 'роста' : 'падения'} курса юаня в ближайшие дни.`);
  } else if (r < 0.8) {
    e = {
      type: 'customs',
      start,
      end: start + 14 * 24,
      title: 'Таможня ужесточила контроль реплик',
      text: 'Две недели посылки с репликами чаще изымают на границе.',
    };
    addRumor('🛃 Слухи: таможня готовит рейд на карго с репликами.');
  } else if (r < 0.88) {
    e = {
      type: 'avitoPurge',
      start,
      end: start + 10 * 24,
      title: 'Авитка взялась за реплики',
      text: '10 дней объявления с репликами показываются хуже, а покупатели чаще проверяют подлинность.',
    };
    addRumor('🚫 Говорят, Авитка готовит чистку объявлений с репликами.');
  } else if (r < 0.95) {
    const up = rng.chance(0.55);
    e = {
      type: 'demand',
      val: up ? 1.28 : 0.74,
      start: S.t + 6,
      end: S.t + 7 * 24,
      title: up ? 'Пришли зарплаты — все покупают шмот' : 'Все экономят: спрос упал',
      text: up
        ? 'Неделю покупатели пишут заметно чаще.'
        : 'Неделю покупатели пишут реже. Не закупайся на всё.',
    };
  } else {
    e = {
      type: 'secondJackpot',
      start,
      end: start + 24,
      title: 'В секонд завезли чей-то гардероб',
      text: 'Говорят, кто-то сдал целый шкаф брендовых вещей. Завтра на завозе будет на что посмотреть.',
    };
    addRumor('🧥 Шепчут, что в «Мешок» приедет необычная партия.');
  }

  S.events.push(e);
  return e;
}

export function applyEvent(S, rng, e) {
  const M = S.market;
  if (e.type === 'wave') {
    M.hT[e.m] = rng.range(0.93, 1);
    M.until[e.m] = e.end;
    M.rate[e.m] = 0.3;
    M.h[e.m] += (M.hT[e.m] - M.h[e.m]) * 0.35;
  }
  if (e.type === 'dead') {
    M.hT[e.m] = rng.range(0.07, 0.17);
    M.until[e.m] = e.end;
    M.rate[e.m] = 0.26;
  }
  if (e.type === 'brand') {
    for (const m of MODELS) {
      if (m.b !== e.brand) continue;
      M.hT[m.i] = clamp(M.hT[m.i] + 0.28, 0.03, 1);
      M.until[m.i] = e.end;
      M.rate[m.i] = 0.22;
    }
  }
  if (e.type === 'fx') M.fx = clamp(M.fx + e.val, 10, 15);
}

/* ======================= КАЛЕНДАРЬ ======================= */

export function calendarEvents(S, addNews) {
  const d = dateAt(S.t);
  const key = d.getMonth() * 100 + d.getDate();

  if (key === 1024 && !S.flags.bfAnnounced) {
    S.flags.bfAnnounced = 1;
    addNews(
      '🖤 В пятницу Чёрная пятница! Три дня покупатели будут сметать всё подряд, а Пойзон обещает −15% на всё. Закупайся заранее.',
    );
  }
  if (key === 1027 && !S.flags.blackFriday) {
    S.flags.blackFriday = 1;
    S.events.push(
      {
        type: 'demand',
        val: 1.5,
        start: S.t,
        end: S.t + 72,
        title: 'Чёрная пятница',
        text: 'Три дня покупатели пишут в полтора раза чаще.',
      },
      {
        type: 'poizonSale',
        start: S.t,
        end: S.t + 72,
        title: 'Распродажа на Пойзоне',
        text: 'Минус 15% на всё до конца выходных.',
      },
    );
  }
  if (key === 1220 && !S.flags.newYear) {
    S.flags.newYear = 1;
    S.events.push({
      type: 'demand',
      val: 1.22,
      start: S.t,
      end: S.t + 11 * 24,
      title: 'Новогодний ажиотаж',
      text: 'Все ищут подарки: до 31 декабря покупатели пишут чаще.',
    });
  }
}

/* ======================= СЕЗОННАЯ АРКА ======================= */
// У игры есть финиш: сезон идёт с 7 сентября по 31 декабря.
// В конце — итоги и новый сезон с модификатором. Игра, которая не кончается,
// не держит: а так появляется, к чему идти.

export const SEASON_MODIFIERS = [
  {
    id: 'cheapRent',
    n: 'Съехал к другу',
    d: 'Комната стоит вдвое дешевле, зато мест в шкафу на 5 меньше.',
  },
  {
    id: 'contacts',
    n: 'Остались связи',
    d: 'Поставщики пишут чаще, лоты приходят чаще. Но и конкурент стал злее.',
  },
  {
    id: 'reputation',
    n: 'Тебя помнят',
    d: 'Начинаешь с рейтингом и половиной подписчиков. Цены у поставщиков выше.',
  },
  {
    id: 'hardMode',
    n: 'Рынок поумнел',
    d: 'Покупатели проверяют чаще, паль палится легче. Зато цены на ориг выросли.',
  },
];

export function seasonProgress(S) {
  const day = Math.floor(S.t / 24);
  return clamp((day - S.season.startDay) / (S.season.endDay - S.season.startDay), 0, 1);
}

export function seasonDaysLeft(S) {
  return Math.max(0, S.season.endDay - Math.floor(S.t / 24));
}

export function isSeasonOver(S) {
  return Math.floor(S.t / 24) >= S.season.endDay;
}
