// Помощник.
//
// К середине игры деньги перестают быть узким местом — им становится твоё
// время. Осмотреть можно десяток вещей за утро, ответить — десятку
// покупателей за день, и всё. Помощник это узкое место расширяет, но
// берёт за это дважды: зарплатой каждый понедельник и качеством.
//
// Главное правило: помощник ВСЕГДА хуже тебя. Он соглашается на меньшие
// деньги, иногда получает четвёрку вместо пятёрки и может прозевать паль.
// Поэтому делегировать выгодно только то, на что у тебя не хватает рук.

import { clamp } from './util.js';

export const STAFF = [
  {
    id: 'intern',
    n: 'Стажёр',
    who: 'Знакомый школьник на подхвате',
    lvl: 6,
    wage: 4000,
    // Цена, которую он старается удержать, и планка, ниже которой не отдаёт.
    targetShare: 0.8,
    floorShare: 0.7,
    // Насколько внимателен: шанс прозевать паль.
    sloppy: 0.3,
    // Насколько толково выбирает вещь в секонде.
    taste: 0.3,
    goesToSecond: false,
    d: 'Отвечает покупателям, пока ты занят. Отдаёт дёшево и иногда не проверяет вещь.',
  },
  {
    id: 'seller',
    n: 'Продавец',
    who: 'Девочка с опытом в магазине кроссовок',
    lvl: 9,
    wage: 6000,
    targetShare: 0.91,
    floorShare: 0.78,
    sloppy: 0.12,
    taste: 0.6,
    goesToSecond: true,
    d: 'Держит цену и проверяет сомнительное. Ещё и занимает очередь в секонд.',
  },
  {
    id: 'manager',
    n: 'Управляющий',
    who: 'Бывший перекуп, который устал от своего дела',
    lvl: 12,
    wage: 10000,
    targetShare: 0.99,
    floorShare: 0.86,
    sloppy: 0.04,
    taste: 0.95,
    goesToSecond: true,
    // Главное отличие: он берёт на себя ежедневную рутину с витриной.
    managesStock: true,
    d: 'Ведёт вдвое больше переписок, откладывает лучшее в секонде и сам занимается витриной: режет цену на залежавшемся и поднимает объявления.',
  },
];

export const STAFF_BY_ID = Object.fromEntries(STAFF.map((s) => [s.id, s]));

export function hired(S) {
  return S.staff && S.staff.id ? STAFF_BY_ID[S.staff.id] : null;
}

export function wageTotal(S) {
  const def = hired(S);
  return def ? def.wage : 0;
}

/** Сколько переписок помощник разбирает за час. */
export function chatsPerHour(def) {
  return def.id === 'manager' ? 2 : 1;
}

/** Сколько он берёт с тебя за неделю. */
export const wageOf = (def) => (def ? def.wage : 0);

/**
 * Через сколько часов без твоего ответа помощник берёт переписку на себя.
 * Смысл в том, чтобы ты успел заняться важными сделками сам.
 */
export const HANDOFF_HOURS = 5;

/**
 * Шанс, что помощник отдаст сомнительную вещь без проверки.
 * Именно в этом цена дешёвого помощника: единицу за паль получишь ты.
 */
export function blunderChance(S, def) {
  return clamp(def.sloppy - 0.015 * S.prog.skills.sales, 0.02, 0.4);
}

export function canHire(S, id) {
  const def = STAFF_BY_ID[id];
  if (!def) return { ok: false, why: 'Нет такого' };
  if (S.prog.lvl < def.lvl) return { ok: false, why: `Откроется на ${def.lvl} уровне` };
  if (S.staff && S.staff.id === id) return { ok: false, why: 'Уже работает' };
  return { ok: true };
}
