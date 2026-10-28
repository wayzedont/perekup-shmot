// Продавцы и торг.
//
// Торг — это разговор, а не поле ввода суммы. У каждого продавца характер,
// и на разные ходы он реагирует по-разному: мама уступит доброму слову,
// магазин — только аргументу про рынок, а тому, кто срочно уезжает,
// важнее всего, что ты заберёшь сегодня.
// Самый сильный ход — ткнуть в найденный дефект, но для этого вещь
// надо сначала осмотреть. Так осмотр и торг оказываются одной игрой.

import { clamp, priceRound, rub } from '../util.js';
import { FIRST_NAMES, SHOPS, REPLICA_SHOPS, PARENTS, NICKS } from '../data/content.js';

/* ======================= ХАРАКТЕРЫ ======================= */

export const SELLER_TYPES = {
  owner: {
    n: 'Частное лицо',
    label: 'обычный человек',
    w: 0.3,
    askK: [0.85, 1.05],
    floorK: [0.82, 0.92],
    patience: [4, 6],
    fakeChance: 0.08,
    declares: 'orig',
    names: 'first',
  },
  shop: {
    n: 'Магазин',
    label: 'перекуп со стажем',
    w: 0.16,
    askK: [1.0, 1.18],
    floorK: [0.93, 0.98],
    patience: [3, 4],
    fakeChance: 0.1,
    declares: 'orig',
    names: 'shop',
  },
  parent: {
    n: 'Частное лицо',
    label: 'разбирает вещи сына',
    w: 0.08,
    askK: [0.3, 0.55],
    floorK: [0.72, 0.9],
    patience: [5, 8],
    fakeChance: 0.14,
    declares: 'orig',
    names: 'parent',
  },
  replica: {
    n: 'Магазин',
    label: 'честно торгует репликами',
    w: 0.1,
    askK: [0.9, 1.2],
    floorK: [0.88, 0.96],
    patience: [3, 5],
    fakeChance: 1,
    declares: 'fake',
    names: 'replica',
  },
  liar: {
    n: 'Частное лицо',
    label: 'уверяет, что ориг',
    w: 0.13,
    askK: [0.55, 0.82],
    floorK: [0.8, 0.9],
    patience: [3, 5],
    fakeChance: 1,
    declares: 'orig',
    names: 'first',
  },
  collector: {
    n: 'Частное лицо',
    label: 'разбирается лучше тебя',
    w: 0.08,
    askK: [1.05, 1.25],
    floorK: [0.9, 0.97],
    patience: [4, 6],
    fakeChance: 0.02,
    declares: 'orig',
    names: 'nick',
  },
  hurry: {
    n: 'Частное лицо',
    label: 'срочно нужны деньги',
    w: 0.08,
    askK: [0.6, 0.85],
    floorK: [0.65, 0.82],
    patience: [3, 5],
    fakeChance: 0.1,
    declares: 'orig',
    names: 'first',
  },
  scam: {
    n: 'Частное лицо',
    label: 'мутный',
    w: 0.07,
    askK: [0.3, 0.52],
    floorK: [1, 1],
    patience: [9, 9],
    fakeChance: 0.5,
    declares: 'orig',
    names: 'first',
  },
};

export const SELLER_KEYS = Object.keys(SELLER_TYPES);

/* ======================= ПОДОЗРИТЕЛЬНЫЕ ПРИЗНАКИ ======================= */
// Честному продавцу тоже может не нравиться созваниваться, а аккаунт
// бывает свежим у кого угодно. Кидала набирает их пачкой — но каждый
// по отдельности ни о чём не говорит. Игрок учится читать сочетания.

export const SIGNALS = {
  newAccount: { n: 'Аккаунт создан в этом году', weight: 0.6 },
  noReviews: { n: 'Ни одного отзыва', weight: 0.7 },
  noCalls: { n: 'В описании: «звонки не беру, только сообщения»', weight: 0.35 },
  prepay: { n: 'Просит предоплату на карту', weight: 1.0 },
  stockPhoto: { n: 'Фото явно из интернета', weight: 0.8 },
  tooCheap: { n: 'Цена вдвое ниже рынка', weight: 0.6 },
  urgentStory: { n: 'Срочная история про переезд', weight: 0.3 },
  noDelivery: { n: 'Отказывается от Авитка Доставки', weight: 0.9 },
  noMeet: { n: 'Не хочет встречаться, хотя сам из Москвы', weight: 0.7 },
  manyItems: { n: 'Десятки одинаковых объявлений', weight: 0.4 },
};

export function rollSignals(rng, type, priceRatio, mode) {
  const out = [];
  const add = (k, p) => {
    if (rng.chance(p)) out.push(k);
    };
  if (type === 'scam') {
    out.push('newAccount', 'noReviews');
    add('noCalls', 0.7);
    add('stockPhoto', 0.6);
    add('urgentStory', 0.8);
    if (priceRatio < 0.55) out.push('tooCheap');
    out.push('noDelivery');
    if (mode !== 'ship') out.push('noMeet');
    add('manyItems', 0.3);
  } else {
    // У честных признаки тоже встречаются — иначе кидала опознавался бы по чек-листу.
    add('newAccount', 0.12);
    add('noReviews', 0.1);
    add('noCalls', 0.18);
    add('urgentStory', type === 'hurry' ? 0.85 : 0.1);
    if (priceRatio < 0.6) add('tooCheap', 0.5);
    if (type === 'shop' || type === 'replica') add('manyItems', 0.8);
    if (mode === 'meet') add('noDelivery', 0.9);
  }
  return [...new Set(out)];
}

/** Суммарная «мутность» — для внутренних расчётов, игроку не показывается числом. */
export function sketchiness(signals) {
  return signals.reduce((a, s) => a + (SIGNALS[s] ? SIGNALS[s].weight : 0), 0);
}

/* ======================= СОЗДАНИЕ ======================= */

export function sellerName(rng, type) {
  const kind = SELLER_TYPES[type].names;
  if (kind === 'shop') return rng.pick(SHOPS);
  if (kind === 'replica') return rng.pick(REPLICA_SHOPS);
  if (kind === 'parent') return rng.pick(PARENTS);
  if (kind === 'nick') return rng.pick(NICKS);
  return rng.pick(FIRST_NAMES);
}

export function makeSeller(rng, type, ask, bargainSkill) {
  const T = SELLER_TYPES[type];
  const floor = priceRound(ask * rng.range(T.floorK[0], T.floorK[1]));
  return {
    type,
    name: sellerName(rng, type),
    ask,
    current: ask,
    floor,
    patience: rng.int(T.patience[0], T.patience[1]) + Math.floor((bargainSkill || 0) / 4),
    mood: 0, // −1 раздражён, +1 расположен
    used: {},
    asked: {},
    agreed: false,
    blocked: false,
    accused: false,
    calledBack: false,
    since: type === 'scam' ? '2026' : String(rng.int(2015, 2025)),
    reviews: type === 'scam' ? 0 : rng.int(1, 180),
  };
}

/* ======================= ХОДЫ В ПЕРЕПИСКЕ ======================= */
// affinity — насколько этот ход работает на этот характер.
// shift — какую долю расстояния до минимума продавец готов сдать.

export const LEVERS = {
  today: {
    n: 'Заберу сегодня, наличкой',
    hint: 'Работает на тех, кому нужны деньги прямо сейчас',
    shift: 0.4,
    cost: 0,
    affinity: { owner: 0.6, shop: 0.12, parent: 0.8, replica: 0.3, liar: 0.5, collector: 0.2, hurry: 1 },
  },
  market: {
    n: 'На Авитке такие дешевле',
    hint: 'Аргумент для тех, кто следит за ценой',
    shift: 0.45,
    cost: 1,
    affinity: { owner: 0.5, shop: 0.65, parent: 0.15, replica: 0.45, liar: 0.3, collector: 0.75, hurry: 0.3 },
  },
  polite: {
    n: 'Очень выручите, правда',
    hint: 'Иногда достаточно просто по-человечески',
    shift: 0.3,
    cost: 0,
    affinity: { owner: 0.35, shop: 0.02, parent: 0.95, replica: 0.05, liar: 0.1, collector: 0.3, hurry: 0.25 },
  },
  defect: {
    n: 'Тут дефект',
    hint: 'Нужно сначала найти дефект на осмотре. Зато бьёт по всем',
    shift: 0.75,
    cost: 0,
    affinity: { owner: 0.85, shop: 0.7, parent: 0.9, replica: 0.6, liar: 0.8, collector: 0.75, hurry: 0.9 },
  },
  knowledge: {
    n: 'Назвать модель и расцветку как есть',
    hint: 'Коллекционер уважает тех, кто разбирается',
    shift: 0.35,
    cost: 0,
    affinity: { owner: 0.2, shop: 0.25, parent: 0.05, replica: 0.2, liar: 0.1, collector: 0.95, hurry: 0.15 },
  },
  walk: {
    n: 'Я подумаю',
    hint: 'Уйти. Иногда перезванивают сами и уже с другой ценой',
    shift: 0,
    cost: 0,
    affinity: {},
  },
};

const REPLIES = {
  today: {
    yes: ['Если сегодня — давай, скину.', 'Ок, приезжай сегодня, сделаю дешевле.'],
    no: ['Мне не горит, подожду своего покупателя.', 'Да хоть сейчас, цена та же.'],
  },
  market: {
    yes: ['Ну, может и так. Ладно.', 'Видел я эти «дешевле». Но ок, уступлю.'],
    no: ['Так идите и берите там.', 'Это другие, у меня состояние лучше.'],
  },
  polite: {
    yes: ['Ой, ну ладно, забирай.', 'Да бери уже, что с тобой делать.'],
    no: ['Это не благотворительность.', 'Все выручают, цена одна.'],
  },
  defect: {
    yes: ['Ну есть такое, не заметил. Скину.', 'Ладно, за это скину, согласен.'],
    no: ['Это мелочь, вещь б/у вообще-то.', 'И что? Цена и так с учётом.'],
  },
  knowledge: {
    yes: ['О, человек в теме. Для своих скину.', 'Приятно, когда разбираются. Держи цену ниже.'],
    no: ['Ну молодец, и?', 'Я тоже знаю, что продаю.'],
  },
};

/**
 * Применяет ход. Возвращает { ok, reply, price, blocked }.
 * Состояние продавца меняется на месте.
 */
export function applyLever(rng, seller, lever, bargainSkill, extra) {
  const L = LEVERS[lever];
  if (!L || seller.blocked) return null;
  if (seller.used[lever]) {
    return { ok: false, reply: 'Это ты уже говорил.', price: seller.current, repeat: true };
  }
  seller.used[lever] = true;

  if (lever === 'walk') {
    seller.patience -= 1;
    // Шанс, что перезвонит с уступкой, растёт от навыка торга.
    const back = clamp(0.3 + 0.045 * (bargainSkill || 0), 0.3, 0.72);
    if (rng.chance(back)) {
      seller.willCallBack = true;
      return { ok: true, reply: 'Ну смотри, если что — пиши.', price: seller.current, walked: true };
    }
    return { ok: false, reply: 'Как хотите.', price: seller.current, walked: true };
  }

  const aff = L.affinity[seller.type] || 0;
  const skillBoost = 1 + 0.05 * (bargainSkill || 0);
  const moodBoost = 1 + seller.mood * 0.2;
  const strength = aff * skillBoost * moodBoost * (extra && extra.strength ? extra.strength : 1);

  // Срабатывает ли ход вообще.
  const works = rng.chance(clamp(strength, 0.04, 0.95));
  if (!works) {
    seller.patience -= L.cost;
    seller.mood = clamp(seller.mood - 0.15, -1, 1);
    return {
      ok: false,
      reply: rng.pick(REPLIES[lever].no),
      price: seller.current,
      blocked: seller.patience <= 0,
    };
  }

  // Продавец сдаёт часть расстояния до своего минимума.
  const room = Math.max(0, seller.current - seller.floor);
  const give = room * L.shift * clamp(strength, 0.2, 1.4) * rng.range(0.7, 1.1);
  const next = priceRound(Math.max(seller.floor * 0.97, seller.current - give));
  // Удачный ход может опустить и сам минимум — продавец «поплыл».
  seller.floor = priceRound(Math.min(seller.floor, next * rng.range(0.96, 1.0)));
  seller.current = next;
  seller.mood = clamp(seller.mood + 0.2, -1, 1);
  return { ok: true, reply: rng.pick(REPLIES[lever].yes) + ' ' + rub(next), price: next };
}

/**
 * Прямое предложение цены. Возвращает { state, reply, price }.
 * state: 'agreed' | 'counter' | 'refused' | 'blocked'
 */
export function offerPrice(rng, seller, amount, bargainSkill) {
  if (seller.blocked) return { state: 'blocked', reply: 'Продавец тебя заблокировал.' };
  const floor = priceRound(seller.floor * (1 - 0.012 * (bargainSkill || 0)));

  if (amount >= seller.current) {
    seller.agreed = true;
    return {
      state: 'agreed',
      price: seller.current,
      reply: rng.pick([
        `Договорились, ${rub(seller.current)}.`,
        `Ок, забирайте за ${rub(seller.current)}.`,
      ]),
    };
  }
  if (amount >= floor) {
    seller.current = amount;
    seller.agreed = true;
    return {
      state: 'agreed',
      price: amount,
      reply: rng.pick([`Ладно, ${rub(amount)}.`, `Хорошо, договорились на ${rub(amount)}.`, `Эх, давайте ${rub(amount)}.`]),
    };
  }

  const gap = (floor - amount) / Math.max(1, seller.ask);
  if (gap > 0.2) {
    seller.patience -= 2;
    seller.mood = clamp(seller.mood - 0.3, -1, 1);
  } else {
    seller.patience -= 1;
    seller.mood = clamp(seller.mood - 0.1, -1, 1);
  }

  if (seller.patience <= 0) {
    seller.blocked = true;
    seller.agreed = false;
    return {
      state: 'blocked',
      reply: rng.pick(['Всё, не пишите мне больше.', 'До свидания, торгуйтесь с кем-нибудь другим.']),
    };
  }

  if (gap > 0.2) {
    return {
      state: 'refused',
      price: seller.current,
      reply: rng.pick(['Вы серьёзно? Нет.', 'Смешно. Нет.', 'Неинтересно.', 'Это даже не торг.']),
    };
  }

  const counter = priceRound(Math.max(floor, seller.current - (seller.current - amount) * rng.range(0.3, 0.5)));
  seller.current = counter;
  return {
    state: 'counter',
    price: counter,
    reply: rng.pick([`Могу ${rub(counter)}, не меньше.`, `${rub(counter)} — и забирайте.`, `Минимум ${rub(counter)}.`]),
  };
}

/* ======================= ОТВЕТЫ НА ВОПРОСЫ ======================= */

export const QUESTIONS = {
  actual: 'Здравствуйте! Актуально?',
  orig: 'Это оригинал?',
  photos: 'Можете скинуть фото бирок и швов?',
  why: 'Почему так дёшево?',
  defects: 'Есть дефекты? Опишите честно',
  meet: 'Можно встретиться, посмотреть вживую?',
};

export function answerQuestion(rng, listing, q, itemIsReal) {
  const s = listing.seller;
  const t = s.type;
  switch (q) {
    case 'actual':
      return t === 'scam'
        ? 'Да, но быстро уходит. Могу забронировать по предоплате.'
        : rng.pick(['Да, актуально', 'Актуально 👍', 'Да, в наличии']);
    case 'orig':
      return {
        owner: itemIsReal ? rng.pick(['Да, брал в магазине', 'Ориг, конечно']) : 'Да, брал с рук, вроде ориг',
        shop: '100% ориг, можем сделать легит-чек',
        parent: 'Ой, не знаю. Сын носил, говорил, что фирма хорошая.',
        replica: 'Нет, это реплика, качество 1:1. В описании указано.',
        liar: rng.pick(['Конечно ориг, есть чек', 'Ориг 100%, брал в ЦУМе']),
        collector: 'Разумеется. Могу прислать фото всех бирок и коробку.',
        hurry: 'Ориг, покупал сам. Просто деньги нужны.',
        scam: 'Оригинал, новый, с бирками',
      }[t];
    case 'why':
      return {
        owner: 'Да нормальная цена, просто не нужно.',
        shop: 'Это рынок, дешевле не найдёте.',
        parent: 'Мне просто нужно освободить место.',
        replica: 'Это реплика, поэтому дешевле оригинала.',
        liar: 'Срочно нужны деньги, переезжаю.',
        collector: 'Дёшево? Это ниже рынка, посмотрите другие.',
        hurry: 'Говорю же — деньги нужны срочно. Поэтому и дёшево.',
        scam: 'Переезжаю за границу, нужно быстро продать.',
      }[t];
    case 'defects':
      return null; // обрабатывается отдельно: зависит от того, честен ли продавец
    case 'meet':
      if (listing.mode === 'ship') return `Я не в Москве, я в ${listing.city}. Только доставкой.`;
      if (t === 'scam') return 'Я сейчас не в городе, могу только отправить. Переведите на карту.';
      return `Да, давайте у м. ${listing.metro}. Я там обычно с 9 до 20.`;
    default:
      return 'Не понял вопроса.';
  }
}

/** Честно ли продавец признаётся в дефектах. */
export function defectAnswer(rng, listing) {
  const s = listing.seller;
  const defects = listing.item.defects || [];
  const honest = { parent: 0.75, owner: 0.55, collector: 0.9, hurry: 0.45, shop: 0.3, replica: 0.5, liar: 0.1, scam: 0 }[s.type];
  if (!defects.length) {
    return { text: 'Нет, всё в порядке. Состояние как на фото.', revealed: [] };
  }
  if (rng.chance(honest)) {
    const told = defects.filter(() => rng.chance(0.8));
    if (!told.length) return { text: 'Ну, по мелочи есть следы носки. Ничего критичного.', revealed: [] };
    return {
      text: 'Честно скажу: ' + told.map((d) => d.n.toLowerCase()).join(', ') + '. Остальное норм.',
      revealed: told.map((d) => d.id),
    };
  }
  return { text: rng.pick(['Нет, всё идеально.', 'Дефектов нет, состояние отличное.']), revealed: [] };
}
