// Покупатели.
//
// У покупателя тоже есть характер: перекуп давит, новичок переплатит,
// параноик потребует легит-чек до сделки, а коллекционер задаст такой вопрос,
// на который у продавца пали не найдётся ответа.
//
// Продажа пали под видом оригинала теперь не кубик за спиной, а давление
// в переписке: покупатель спрашивает, ты врёшь или юлишь, и каждый ответ
// двигает шанс, что он пойдёт проверять.

import { clamp, priceRound, rub } from '../util.js';
import { FIRST_NAMES } from '../data/content.js';
import { MODELS } from '../data/models.js';
import { TIERS } from '../data/catalog.js';

export const BUYER_TYPES = {
  normal: {
    n: 'обычный покупатель',
    w: 0.36,
    maxK: [0.98, 1.08],
    firstK: [0.86, 0.96],
    patience: [2, 4],
    askAuth: 0.3,
    detectBonus: 0,
  },
  lowball: {
    n: 'перекуп',
    w: 0.2,
    maxK: [0.78, 0.9],
    firstK: [0.68, 0.78],
    patience: [1, 2],
    askAuth: 0.5,
    detectBonus: 0.05,
    tag: 'Сам перекуп. Давит и не торопится',
  },
  newbie: {
    n: 'новичок',
    w: 0.16,
    maxK: [1.05, 1.2],
    firstK: [0.95, 1.0],
    patience: [3, 5],
    askAuth: 0.12,
    detectBonus: -0.12,
    tag: 'Первый раз покупает. Переплатит',
  },
  paranoid: {
    n: 'параноик',
    w: 0.13,
    maxK: [0.95, 1.05],
    firstK: [0.88, 0.97],
    patience: [2, 3],
    askAuth: 1,
    requiresProof: true,
    detectBonus: 0.3,
    tag: 'Требует легит-чек до оплаты',
  },
  collector: {
    n: 'коллекционер',
    w: 0.08,
    maxK: [1.08, 1.3],
    firstK: [0.97, 1.05],
    patience: [2, 4],
    askAuth: 0.85,
    detectBonus: 0.35,
    tag: 'Разбирается. Заплатит больше, но палево заметит',
  },
  fan: {
    n: 'подписчик канала',
    w: 0.07,
    maxK: [1.05, 1.22],
    firstK: [0.94, 1.0],
    patience: [3, 5],
    askAuth: 0.15,
    detectBonus: -0.05,
    tag: 'Читает твой канал и доверяет',
  },
};

const KEYS = Object.keys(BUYER_TYPES);

/** Выбор характера зависит от площадки: в канале люди лояльнее. */
export function pickBuyerType(rng, platform, tier) {
  return rng.weighted(KEYS, (k) => {
    const T = BUYER_TYPES[k];
    let w = T.w;
    if (platform === 'tg') {
      if (k === 'fan') w *= 4;
      if (k === 'lowball') w *= 0.45;
      if (k === 'newbie') w *= 1.2;
    }
    if (tier === 'lux' || tier === 'prem') {
      if (k === 'collector') w *= 2.4;
      if (k === 'paranoid') w *= 1.6;
      if (k === 'newbie') w *= 0.5;
    }
    if (tier === 'mass' && k === 'collector') w *= 0.15;
    return w;
  });
}

export function makeBuyer(S, rng, item, platform, basePrice) {
  const m = MODELS[item.m];
  const type = pickBuyerType(rng, platform, m.tier);
  const T = BUYER_TYPES[type];
  const rating = 4.5;
  let max = basePrice * rng.range(T.maxK[0], T.maxK[1]) * (1 + 0.02 * S.prog.skills.sales);
  if (platform === 'tg') max *= 0.95 + S.tg.trust / 500;
  const listed = item.sale.price;
  // Первое предложение: иногда сразу «беру за вашу цену».
  let offer;
  let full = false;
  const takesFull = rng.chance(platform === 'tg' ? 0.5 : 0.3) && listed <= max * 0.99;
  if (takesFull) {
    offer = listed;
    full = true;
  } else {
    offer = priceRound(Math.min(listed * 0.99, max * rng.range(T.firstK[0], T.firstK[1])));
    if (offer >= listed) {
      offer = listed;
      full = true;
    }
  }
  return {
    item: item.id,
    type,
    max: priceRound(max),
    offer,
    full,
    patience: rng.int(T.patience[0], T.patience[1]),
    agreed: false,
    price: 0,
    wroteAt: S.t,
    lastAt: S.t,
    expiresAt: S.t + rng.int(48, 72),
    asked: {},
    pressure: 0,
    proofShown: false,
    walkedOnProof: false,
    fast: false,
  };
}

/* ======================= ПЕРВОЕ СООБЩЕНИЕ ======================= */

export function greeting(rng, buyer, item) {
  const T = BUYER_TYPES[buyer.type];
  const hi = rng.pick(['Здравствуйте! ', 'Привет! ', 'Добрый день! ', 'Здрасьте. ']);
  if (buyer.full) {
    if (buyer.type === 'fan') return hi + rng.pick(['Беру! Я из канала, давно слежу.', 'Забираю за вашу цену, читаю ваш канал.']);
    if (buyer.type === 'newbie') return hi + rng.pick(['Беру за вашу цену. Как оплатить?', 'Цена ок, забираю!']);
    return hi + rng.pick(['Беру за вашу цену.', 'Цена устраивает, оформляем?']);
  }
  switch (buyer.type) {
    case 'lowball':
      return (
        hi +
        rng.pick([
          `${rub(buyer.offer)} и забираю сегодня. Я сам перекуп, долго не думаю.`,
          `Отдай за ${rub(buyer.offer)}, всё равно висит.`,
        ])
      );
    case 'paranoid':
      return hi + `Размер ${item.size} точно? И сразу: легит-чек есть? Готов ${rub(buyer.offer)}.`;
    case 'collector':
      return hi + `Интересует. Какая это расцветка и есть ли коробка? ${rub(buyer.offer)} могу.`;
    case 'newbie':
      return hi + `А ${rub(buyer.offer)} можно? Просто у меня больше нет сейчас.`;
    case 'fan':
      return hi + `Я из вашего канала. ${rub(buyer.offer)} отдадите?`;
    default:
      return (
        hi +
        rng.pick([
          `Отдадите за ${rub(buyer.offer)}?`,
          `Готов взять за ${rub(buyer.offer)}.`,
          `${rub(buyer.offer)} — и по рукам?`,
        ])
      );
  }
}

/* ======================= ТОРГ ======================= */

/** Ответ на встречное предложение продавца. Возвращает { state, reply, price }. */
export function counterOffer(rng, buyer, amount) {
  if (amount <= buyer.offer) {
    buyer.agreed = true;
    buyer.price = amount;
    return { state: 'agreed', price: amount, reply: 'Договорились!' };
  }
  if (amount <= buyer.max) {
    buyer.agreed = true;
    buyer.price = amount;
    return {
      state: 'agreed',
      price: amount,
      reply: rng.pick([`Ладно, ${rub(amount)}.`, `Хорошо, беру за ${rub(amount)}.`, `Окей, ${rub(amount)}, оформляйте.`]),
    };
  }
  buyer.patience -= amount > buyer.max * 1.15 ? 2 : 1;
  if (buyer.patience <= 0) {
    return {
      state: 'left',
      reply: rng.pick(['Нет, поищу ещё.', 'Дороговато, я пас.', 'Тогда не надо.']),
    };
  }
  buyer.offer = priceRound(Math.min(buyer.max, buyer.offer + (buyer.max - buyer.offer) * rng.range(0.4, 0.7)));
  return {
    state: 'counter',
    price: buyer.offer,
    reply: rng.pick([`Дорого. Могу ${rub(buyer.offer)}.`, `${rub(buyer.offer)} — последнее слово.`]),
  };
}

/* ======================= ВОПРОС ПРО ПОДЛИННОСТЬ ======================= */
// Главная сцена при продаже пали. Что ты ответишь — то и определит,
// пойдёт ли покупатель проверять.

export const AUTH_ANSWERS = {
  // Доступен только когда чек реально сделан и показал оригинал. Это не
  // уговоры, а документ: его принимают все, включая параноика.
  proof: {
    n: 'Скинуть легит-чек',
    // Кнопка называется действием, а в переписке человек пишет словами.
    said: 'Вот результат проверки, смотрите 📄 Сервис подтвердил оригинал.',
    d: 'У тебя есть результат проверки. Это снимает вопрос совсем',
    pressure: -1,
    convinces: 1,
    needsProof: true,
  },
  swearOrig: {
    n: 'Клянусь, оригинал. Легит-чек делал',
    d: 'Ложь про чек, которого нет. Если попросит показать — будет больно',
    pressure: 0.55,
    convinces: 0.75,
  },
  sayOrig: {
    n: 'Оригинал, но чека нет',
    d: 'Ложь помягче',
    pressure: 0.28,
    convinces: 0.55,
  },
  hedge: {
    n: 'Брал как оригинал, сам не проверял',
    d: 'Честная формулировка. Часть покупателей отвалится, зато претензий меньше',
    pressure: -0.1,
    convinces: 0.3,
  },
  confess: {
    n: 'Честно: это реплика',
    d: 'Сделка переходит в цену реплики. Рейтинг почти не пострадает',
    pressure: -1,
    convinces: 1,
  },
};

export function authQuestion(rng, buyer, item) {
  const m = MODELS[item.m];
  switch (buyer.type) {
    case 'paranoid':
      return 'Прежде чем платить: легит-чек делали? Скиньте фото бирки и подошвы, я покажу знакомому.';
    case 'collector':
      return `Один вопрос. У ${m.b} на этой модели обычно смотрят ${hintTell(m)}. Можете показать поближе?`;
    case 'lowball':
      return 'Слушай, честно — ориг или реплика? Мне для себя, я не придираюсь.';
    default:
      return rng.pick([
        'А это точно оригинал? Просто цена смущает.',
        'Ориг? Не хочу потом разбираться.',
        'Подскажите, оригинал или реплика? Честно скажите, я нормально отнесусь.',
      ]);
  }
}

function hintTell(m) {
  const t = m.tells[0];
  return (
    {
      tag: 'бирку',
      stitch: 'швы',
      sole: 'подошву',
      smell: 'запах',
      box: 'коробку',
      hardware: 'фурнитуру',
      print: 'принт',
      shape: 'посадку',
    }[t] || 'бирку'
  );
}

/**
 * Реакция покупателя на ответ про подлинность.
 * Возвращает { reply, leaves, discount, convertToReplica }.
 */
export function reactToAuthAnswer(rng, buyer, answer, item, hasProof) {
  const A = AUTH_ANSWERS[answer];
  buyer.pressure = clamp(buyer.pressure + A.pressure, -1, 1);
  const T = BUYER_TYPES[buyer.type];

  // Присланный чек закрывает вопрос у кого угодно. Раньше проверка влияла
  // только на параноика, а остальным игрок будто бы просто божился — и это
  // при том, что чек был сделан и оплачен.
  if (answer === 'proof' && hasProof) {
    return {
      reply: rng.pick([
        'О, с чеком — другое дело. Беру.',
        'Вижу проверку, вопросов нет. Оформляем.',
        'Отлично, что проверено. Давайте оплачу.',
      ]),
    };
  }

  if (answer === 'confess') {
    return {
      reply: rng.pick([
        'Ну хоть честно. Тогда по цене реплики, если скинете.',
        'Понял. За реплику столько не дам, но если дешевле — возьму.',
      ]),
      convertToReplica: true,
    };
  }

  if (T.requiresProof && !hasProof) {
    if (answer === 'swearOrig') {
      // Солгал параноику про чек — он попросит показать.
      return {
        reply: 'Покажите чек от легит-сервиса. Без него не возьму.',
        leaves: true,
        burned: true,
      };
    }
    return { reply: 'Без проверки — не рискну. Удачи.', leaves: true };
  }

  // Сделанная проверка помогает и тогда, когда игрок не стал ею козырять:
  // вещь действительно оригинал, и это чувствуется по тому, как он отвечает.
  const proofBonus = hasProof ? 0.3 : 0;
  const convinced = rng.chance(clamp(A.convinces + proofBonus - (T.detectBonus || 0), 0.05, 0.98));
  if (!convinced) {
    if (answer === 'hedge') {
      return {
        reply: rng.pick(['Тогда только с хорошей скидкой.', 'Рискну, но дешевле.']),
        discount: 0.15,
      };
    }
    return {
      reply: rng.pick(['Что-то не сходится. Я пас.', 'Не убедили. Извините.']),
      leaves: true,
    };
  }
  return {
    reply: rng.pick(['Ок, верю. Оформляем.', 'Понял, спасибо. Беру.', 'Хорошо, давайте оплачу.']),
  };
}

/** Насколько «горячо» покупатель отреагирует на быстрый ответ. */
export function fastReplyBonus(S, buyer) {
  const delay = S.t - buyer.wroteAt;
  if (delay <= 1) return { priceK: 1.05, starBonus: 0.12, label: 'ответил сразу' };
  if (delay <= 4) return { priceK: 1.02, starBonus: 0.05, label: 'ответил быстро' };
  return { priceK: 1, starBonus: 0 };
}

/** Покупатель устал ждать. */
export function waitedTooLong(S, rng, buyer) {
  const delay = S.t - buyer.lastAt;
  if (delay <= 12) return false;
  return rng.chance(clamp((delay - 12) / 56, 0, 0.8));
}

export function buyerName(rng) {
  return rng.pick(FIRST_NAMES);
}

/** Ожидаемая оценка за сделку. */
export function expectedStars(rng, { honest, asReplica, fast, hadDefectHidden }) {
  if (!honest) return 1;
  // Честная реплика — это нормальная сделка: придираются, но не ругают.
  if (asReplica) return rng.chance(0.62) ? 4 : 3;
  if (hadDefectHidden) return rng.chance(0.5) ? 3 : 2;
  const p = 0.82 + (fast || 0);
  return rng.chance(p) ? 5 : 4;
}

export function tierOf(item) {
  return TIERS[MODELS[item.m].tier];
}
