// Банк, магазин, подработка, сезон.

import { clamp, priceRound, rub, num } from '../util.js';
import { JOBS } from '../data/content.js';
import { STORAGE, SKILL_KEYS, MAX_SKILL, statusOf } from '../data/progress.js';
import { netWorth, capacity, usedSlots } from '../economy.js';
import { SEASON_MODIFIERS, seasonDaysLeft } from '../events.js';
import {
  available,
  creditLimit,
  takeLoan as makeLoan,
  annuity,
  termsList,
  debtTotal,
} from '../bank.js';
import {
  rngOf,
  pay,
  earn,
  canPay,
  notify,
  toast,
  touch,
  bump,
  spendSkillPoint,
  mentorOnce,
} from '../kernel.js';
import { advanceHours } from '../tick.js';
import { hourIndex, dayIndex } from '../time.js';
import { checkGoals } from '../progression.js';
import { newGame, SEASON_DAYS } from '../state.js';

/* ======================= БАНК ======================= */

export function takeCredit(S, amount, weeks) {
  const max = available(S);
  const sum = Math.min(amount, max);
  if (sum < 1000) {
    toast(S, 'Минимум 1 000 ₽');
    return null;
  }
  const term = termsList().find((t) => t[0] === weeks) || termsList()[1];
  const loan = makeLoan(S, sum, term[0], term[1], 'Кредит');
  earn(S, sum, `Кредит на ${term[0]} нед`);
  touch(S);
  return { amount: sum, payment: loan.payment, weeks: term[0] };
}

export function repayPart(S, loanId, amount) {
  const loan = S.loans.find((l) => l.id === loanId);
  if (!loan) return null;
  const sum = Math.min(amount, Math.ceil(loan.principal));
  if (sum <= 0) {
    toast(S, 'Укажи сумму');
    return null;
  }
  if (S.money < sum) {
    toast(S, 'Не хватает денег на карте');
    return null;
  }
  pay(S, sum, loan.name + ': досрочно');
  loan.principal = Math.max(0, loan.principal - sum);
  let closed = false;
  if (loan.principal < 1) {
    S.loans = S.loans.filter((l) => l !== loan);
    closed = true;
    if (loan.name !== 'Микрозайм') S.credit.paidClean++;
  }
  checkGoals(S);
  touch(S);
  return { paid: sum, closed };
}

export function repayAll(S, loanId) {
  const loan = S.loans.find((l) => l.id === loanId);
  if (!loan) return null;
  return repayPart(S, loanId, Math.ceil(loan.principal));
}

export function depositMoney(S, amount) {
  if (S.money < amount) return null;
  S.money -= amount;
  S.deposit += amount;
  touch(S);
  return true;
}

export function withdrawDeposit(S) {
  S.money += S.deposit;
  S.deposit = 0;
  touch(S);
  return true;
}

export function creditPreview(S, amount, weeks) {
  const term = termsList().find((t) => t[0] === weeks) || termsList()[1];
  const sum = Math.max(1000, Math.min(amount, available(S)));
  const payment = annuity(sum, term[1], term[0]);
  return {
    amount: sum,
    payment,
    weeks: term[0],
    rate: term[1],
    overpay: payment * term[0] - sum,
  };
}

/* ======================= МАГАЗИН ======================= */

export function spendSkill(S, key) {
  if (!SKILL_KEYS.includes(key)) return null;
  if (!spendSkillPoint(S, key)) return null;
  touch(S);
  return { level: S.prog.skills[key] };
}

export function buyStorage(S, id) {
  const def = STORAGE.find((s) => s.id === id);
  if (!def) return null;
  if (S.prog.lvl < def.lvl) {
    toast(S, `Откроется на ${def.lvl} уровне`);
    return null;
  }
  const cost = def.price || def.rent;
  if (!canPay(S, cost)) return null;
  pay(S, cost, (def.price ? 'Покупка: ' : 'Аренда: ') + def.n);
  S.prog.storage[id] = S.t;
  checkGoals(S);
  touch(S);
  return { name: def.n, capacity: capacity(S) };
}

// Запуск бренда переехал в actions/brand.js: теперь это не финальная кнопка,
// а вход в отдельную механику со своими дропами.

/* ======================= ПОДРАБОТКА ======================= */
// Клапан от тупика, а не карьера: денег хватает на еду, но не на закупку.
// И чем выше уровень магазина, тем меньше смысла стоять на смене.

export function jobPay(S, job, rng) {
  const base = rng.range(job.pay[0], job.pay[1]);
  const levelPenalty = clamp(1 - 0.07 * (S.prog.lvl - 1), 0.35, 1);
  return Math.round((base * levelPenalty) / 10) * 10;
}

export function availableJobs(S) {
  const h = hourIndex(S.t);
  const done = S.jobDay === dayIndex(S.t);
  return JOBS.map((j) => ({
    ...j,
    available: !done && h >= j.from && h <= j.to && h + j.hours <= 23,
    done,
  }));
}

export function workShift(S, id) {
  const job = JOBS.find((j) => j.id === id);
  if (!job) return null;
  const h = hourIndex(S.t);
  if (S.jobDay === dayIndex(S.t)) {
    toast(S, 'Сегодня уже работал');
    return null;
  }
  if (h < job.from || h > job.to || h + job.hours > 23) {
    toast(S, 'Сейчас на смену не берут');
    return null;
  }
  const rng = rngOf(S);
  S.jobDay = dayIndex(S.t);
  advanceHours(S, job.hours);
  const money = jobPay(S, job, rng);
  earn(S, money, 'Подработка: ' + job.n);
  bump(S, 'shifts');

  const extras = [];
  if (job.perk === 'subs' && S.tg.has) {
    const g = rng.int(2, 7);
    S.tg.subs += g;
    extras.push(`+${g} подписчиков`);
  }
  if (job.perk === 'find' && rng.chance(0.22)) {
    // Курьер случайно видит объявление раньше остальных.
    S.flags.courierTip = 1;
    extras.push('увидел объявление, которого ещё нет в поиске');
    notify(S, {
      route: 'avito',
      title: 'Подсмотрел на районе',
      text: 'Кто-то выставляет вещь дёшево — загляни в Авитку',
    });
  }

  mentorOnce(
    S,
    'jobTip',
    'Смена спасает, когда совсем пусто. Но на этом не поднимешься: чем выше твой уровень, тем меньше там платят. Деньги здесь делают на обороте, а не на часах.',
  );
  touch(S);
  return { money, extras };
}

/* ======================= СЕЗОН ======================= */

export function seasonSummary(S) {
  return {
    no: S.season.no,
    days: dayIndex(S.t) + 1,
    netWorth: Math.round(netWorth(S)),
    sold: S.stats.sold,
    profit: Math.round(S.stats.profit),
    level: S.prog.lvl,
    status: statusOf(S.prog.lvl),
    subs: S.tg.subs,
    clients: S.clients.filter((c) => c.status !== 'lost' && c.done > 0).length,
    caught: S.stats.caught,
    studied: Object.keys(S.notebook).length,
    rivalBeaten: netWorth(S) > S.rival.nw,
  };
}

/** Новый сезон: прогресс знаний и часть репутации переносятся. */
export function startNewSeason(S, modifierId) {
  const fresh = newGame(S.seed + S.season.no * 7919);
  const mod = SEASON_MODIFIERS.find((m) => m.id === modifierId);

  fresh.season = {
    no: S.season.no + 1,
    startDay: 0,
    endDay: SEASON_DAYS,
    modifiers: mod ? [mod.id] : [],
    finished: false,
  };
  // Книжка — это личное знание, оно остаётся всегда.
  fresh.notebook = S.notebook;
  fresh.prog.skills = S.prog.skills;
  fresh.prog.lvl = Math.max(1, Math.floor(S.prog.lvl / 2));
  fresh.prog.sp = 0;
  fresh.stats.sold = 0;

  if (mod && mod.id === 'reputation') {
    fresh.rep.reviews = S.rep.reviews.slice(0, 20);
    fresh.tg = { ...fresh.tg, has: S.tg.has, name: S.tg.name, subs: Math.round(S.tg.subs / 2) };
  }
  if (mod && mod.id === 'contacts') {
    fresh.prog.unlocks.insiderLots = 1;
    fresh.rival.heat = 3;
  }
  if (mod && mod.id === 'hardMode') {
    fresh.flags.smartMarket = 1;
  }

  fresh.suppliers.orig.unlocked = true;
  fresh.clients = S.clients.filter((c) => c.status === 'vip').map((c) => ({ ...c, lastAt: 0 }));

  return fresh;
}

export function seasonTimeLeft(S) {
  return seasonDaysLeft(S);
}
