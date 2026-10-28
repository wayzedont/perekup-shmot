// Банк: карта, кредиты, вклад, история. Деньги показываются только здесь.

import { esc, rub, num, plural } from '../../core/util.js';
import { dateLabel, clockLabel } from '../../core/time.js';
import {
  available,
  creditLimit,
  levelCap,
  debtTotal,
  annuity,
  weeksLeft,
  termsList,
} from '../../core/bank.js';
import { historyCap, LEVEL_LOAN_CAP } from '../../core/data/progress.js';
import { emptyState } from '../components.js';

export const view = (S) => {
  const pending = S.pending
    .filter((p) => p.type === 'payout' && !p.cancelled)
    .reduce((a, p) => a + p.amount, 0);
  const max = available(S);
  const ui = S.ui.loan || (S.ui.loan = { amount: Math.min(max, 5000), weeks: 4 });
  const amount = Math.max(0, Math.min(ui.amount, max));
  const term = termsList().find((t) => t[0] === ui.weeks) || termsList()[1];
  const payment = annuity(Math.max(amount, 1000), term[1], term[0]);

  const hero = `<div class="hero" style="background:#17171a;color:#fff">
    <div class="label">Дебетовая карта</div>
    <div class="money">${rub(S.money)}</div>
    <div class="sub">В минус карта не уходит. Не хватает — бери кредит.</div>
    ${pending ? `<div class="sub">Ожидает выплаты с Авитки: ${rub(pending)}</div>` : ''}
  </div>`;

  const loans = S.loans
    .map((l) => {
      const interest = Math.round(l.principal * l.rate);
      const due = Math.min(l.payment, Math.ceil(l.principal + interest));
      return `<div class="card">
        <div class="row between"><b>${esc(l.name)} · ${(l.rate * 100).toFixed(1).replace('.', ',')}% в неделю</b>
          <span class="money" style="font-size:16px">${rub(Math.ceil(l.principal))}</span></div>
        <div class="kv"><span>Платёж в понедельник</span><span>${rub(due)}</span></div>
        <div class="kv"><span>Из них проценты</span><span>${rub(interest)}</span></div>
        <div class="kv"><span>Осталось платежей</span><span>${weeksLeft(l)}</span></div>
        ${l.missed ? `<div class="callout danger">Просрочек: ${l.missed}. Ещё одна — и коллекторы заберут вещи из шкафа.</div>` : ''}
        <div class="muted">Досрочное погашение уменьшает тело долга: проценты дальше считаются уже с меньшей суммы.</div>
        <div class="inline-form">
          <input class="inp num" id="repay${l.id}" inputmode="numeric" value="${Math.max(0, Math.min(due, S.money))}" aria-label="Сумма досрочного платежа">
          <button class="btn sm" data-act="repayPart" data-id="${l.id}">Внести</button>
        </div>
        <button class="btn sec full split" data-act="repayAll" data-id="${l.id}" ${S.money < Math.ceil(l.principal) ? 'disabled' : ''}>
          <span>Погасить полностью</span><span>${rub(Math.ceil(l.principal))}</span></button>
      </div>`;
    })
    .join('');

  const lvlCap = levelCap(S);
  const histCap = historyCap(S.credit);
  const bound = lvlCap <= histCap ? 'уровнем магазина' : 'кредитной историей';

  const credit = `<div class="card">
    <h3>Взять кредит</h3>
    <div class="kv"><span>Лимит по уровню ${S.prog.lvl}</span><span>${rub(lvlCap)}</span></div>
    <div class="kv"><span>Лимит по истории</span><span>${rub(histCap)}</span></div>
    <div class="kv"><span>Свободно сейчас</span><span>${rub(max)}</span></div>
    <div class="muted">Банк берёт меньшее из двух, сейчас упирается в ${bound}. Закрытых без просрочек кредитов: ${S.credit.paidClean}, просрочек: ${S.credit.missed}.</div>
    ${
      max >= 1000
        ? `<div class="inline-form">
            <input class="inp num" id="loanAmount" data-input="loanAmount" inputmode="numeric" value="${amount}" aria-label="Сумма кредита">
            <button class="btn sm sec" data-act="loanMax">Макс</button>
          </div>
          <div class="chips">${termsList()
            .map(
              ([w, r]) => `<button class="chip ${w === term[0] ? 'on' : ''}" data-act="loanTerm" data-val="${w}">${w} нед · ${(r * 100).toFixed(1).replace('.', ',')}%</button>`,
            )
            .join('')}</div>
          <div class="kv"><span>Платёж в неделю</span><span id="loanPayment">${rub(payment)}</span></div>
          <div class="kv"><span>Переплата</span><span id="loanOverpay">${rub(payment * term[0] - Math.max(amount, 1000))}</span></div>
          <button class="btn full" data-act="takeLoan">Получить деньги</button>`
        : '<div class="muted">Лимит исчерпан. Погаси текущие кредиты, подними уровень или заработай чистую кредитную историю.</div>'
    }
  </div>`;

  const deposit = `<div class="card">
    <div class="row between"><h3>Вклад</h3><span class="money" style="font-size:16px">${rub(S.deposit)}</span></div>
    <div class="muted">0,05% в день. Снять можно в любой момент. Деньги в обороте приносят больше, но и риска там больше.</div>
    <div class="row wrap">
      <button class="btn sm" data-act="deposit" data-val="10000" ${S.money < 10000 ? 'disabled' : ''}>+10 000</button>
      <button class="btn sm" data-act="deposit" data-val="100000" ${S.money < 100000 ? 'disabled' : ''}>+100 000</button>
      <button class="btn sm sec" data-act="withdraw" ${S.deposit <= 0 ? 'disabled' : ''}>Снять всё</button>
    </div>
  </div>`;

  const history = `<div class="card"><h3>История</h3>
    ${
      S.tx
        .slice(0, 30)
        .map(
          (x) => `<div class="kv"><span>${esc(x.reason)}<small>${esc(dateLabel(x.at))}, ${esc(clockLabel(x.at, 0))}</small></span>
            <span class="${x.amount >= 0 ? 'pos' : ''}">${x.amount >= 0 ? '+' : ''}${rub(x.amount)}</span></div>`,
        )
        .join('') || '<div class="muted">Пока пусто</div>'
    }</div>`;

  return { title: 'Банк', body: hero + loans + credit + deposit + history };
};
