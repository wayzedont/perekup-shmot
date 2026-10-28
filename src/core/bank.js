// Банк: карта, кредиты, вклад, микрозайм и коллекторы.
//
// Лимит кредита — минимум из двух: сколько позволяет уровень магазина
// и сколько позволяет кредитная история. Банк смотрит, как ты платишь,
// а не как тебя хвалят покупатели на Авито. Поэтому «взял и вернул вовремя»
// становится осмысленным ходом, а не просто расходом.

import { clamp } from './util.js';
import {
  LEVEL_LOAN_CAP,
  LOAN_TERMS,
  MICROLOAN_RATE,
  historyCap,
} from './data/progress.js';

export function levelCap(S) {
  return LEVEL_LOAN_CAP[Math.min(S.prog.lvl, LEVEL_LOAN_CAP.length - 1)];
}

export function creditLimit(S) {
  return Math.min(levelCap(S), historyCap(S.credit));
}

export function debtTotal(S) {
  return S.loans.reduce((a, l) => a + l.principal, 0);
}

/** Сколько можно взять прямо сейчас. */
export function available(S) {
  const limit = creditLimit(S);
  const used = debtTotal(S);
  return Math.max(0, Math.floor((limit - used) / 1000) * 1000);
}

export function annuity(principal, rate, weeks) {
  return Math.ceil((principal * rate) / (1 - Math.pow(1 + rate, -weeks)) / 10) * 10;
}

export function takeLoan(S, principal, weeks, rate, name) {
  const loan = {
    id: 'L' + (S.nextLoanId = (S.nextLoanId || 0) + 1),
    name: name || 'Кредит',
    principal,
    rate,
    weeks,
    payment: annuity(principal, rate, weeks),
    missed: 0,
    takenAt: S.t,
    paidTotal: 0,
  };
  S.loans.push(loan);
  return loan;
}

export function weeksLeft(loan) {
  if (loan.principal <= 0) return 0;
  const x = 1 - (loan.principal * loan.rate) / loan.payment;
  return x <= 0 ? 99 : Math.ceil(-Math.log(x) / Math.log(1 + loan.rate) - 1e-9);
}

export function overpay(principal, rate, weeks) {
  return annuity(principal, rate, weeks) * weeks - principal;
}

export const termsList = () => LOAN_TERMS;

export function microloan(S, need) {
  const existing = S.loans.find((l) => l.name === 'Микрозайм');
  if (existing) {
    existing.principal += need;
    existing.payment = annuity(existing.principal, existing.rate, 2);
    return existing;
  }
  return takeLoan(S, need, 2, MICROLOAN_RATE, 'Микрозайм');
}

/** Порог, за которым банк подаёт в суд. */
export function bankruptcyLine(S) {
  return -Math.max(45000, creditLimit(S) * 3);
}

export function depositInterest(S) {
  return Math.round(S.deposit * 0.0005);
}
