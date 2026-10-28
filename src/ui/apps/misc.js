// Небольшие приложения: Посылки, Цели, Подработка, Настройки.

import { esc, rub, num, plural } from '../../core/util.js';
import { dateLabel, clockLabel, hourIndex } from '../../core/time.js';
import { GOALS, openGoals, doneGoals } from '../../core/goals.js';
import { UNLOCKS } from '../../core/data/progress.js';
import { availableJobs } from '../../core/actions/finance.js';
import { itemName } from '../../core/items.js';
import { emptyState, sectionLabel, thumb } from '../components.js';

/* ======================= ПОСЫЛКИ ======================= */

export const parcels = {
  view: (S) => {
    const list = S.shipments.slice().sort((a, b) => a.eta - b.eta);
    if (!list.length) {
      return {
        title: 'Посылки',
        body: emptyState('Посылок нет. Заказать можно на Пойзоне, у поставщиков в Телеге или на Авитке с доставкой.'),
      };
    }
    return {
      title: 'Посылки',
      body: list
        .map((s) => {
          const total = Math.max(1, s.eta - s.start);
          const progress = Math.max(0, Math.min(1, (S.t - s.start) / total));
          const stage =
            progress < 0.25
              ? 'Собирают на складе'
              : progress < 0.6
                ? s.fromChina
                  ? 'Едет из Китая'
                  : 'Передана в доставку'
                : progress < 0.9
                  ? s.fromChina
                    ? 'На таможне'
                    : 'В пути'
                  : 'Скоро у тебя';
          return `<div class="parcel">
            <div class="row between"><b>${esc(s.name)}</b><span class="muted">${s.items.length} шт</span></div>
            <div class="bar"><i style="width:${progress * 100}%"></i></div>
            <div class="row between"><span class="muted">${esc(stage)}</span>
              <span class="muted">${esc(dateLabel(s.eta))}, ${esc(clockLabel(s.eta, 0))}</span></div>
            ${s.replica ? '<div class="muted">Карго с репликами: таможня иногда изымает такие посылки.</div>' : ''}
          </div>`;
        })
        .join(''),
    };
  },
};

/* ======================= ЦЕЛИ ======================= */

export const goals = {
  view: (S) => {
    const open = openGoals(S);
    const done = doneGoals(S);
    const row = (g, isDone) => {
      const reward = g.reward
        ? g.reward.unlock && UNLOCKS[g.reward.unlock]
          ? UNLOCKS[g.reward.unlock].n
          : g.reward.skill
            ? 'очко навыка'
            : ''
        : '';
      return `<div class="goal ${isDone ? 'done' : ''}">
        <div class="mark">${isDone ? '✓' : ''}</div>
        <div><div class="gn">${esc(g.n)}</div>${!isDone && g.hint ? `<div class="gh">${esc(g.hint)}</div>` : ''}</div>
        <span class="muted">${esc(reward)}</span>
      </div>`;
    };
    return {
      title: 'Цели',
      body: `<div class="card">
          <h3>Дальше</h3>
          <div class="muted">Цели больше не дают денег — они открывают возможности. Деньги надо заработать.</div>
          ${open.slice(0, 6).map((g) => row(g, false)).join('') || '<div class="muted">Все цели выполнены. Легенда рынка.</div>'}
        </div>
        <div class="card"><h3>Выполнено · ${done.length} из ${GOALS.length}</h3>
          ${done.map((g) => row(g, true)).join('') || '<div class="muted">Пока ничего</div>'}</div>`,
    };
  },
};

/* ======================= ПОДРАБОТКА ======================= */

export const job = {
  view: (S) => {
    const list = availableJobs(S);
    const done = S.jobDay === Math.floor(S.t / 24);
    return {
      title: 'Подработка',
      body: `<div class="card">
          <h3>Смены</h3>
          <div class="muted">Это клапан от тупика, а не способ разбогатеть. Денег хватает на еду, но не на закупку — и чем выше уровень магазина, тем меньше здесь платят.</div>
        </div>
        ${list
          .map(
            (j) => `<div class="card">
              <div class="row between"><b>${esc(j.n)}</b><span class="money" style="font-size:15px">${num(j.pay[0])}–${rub(j.pay[1])}</span></div>
              <div class="muted">${esc(j.d)} ${j.hours} ч · берут с ${j.from}:00 до ${j.to}:00.</div>
              <button class="btn" data-act="workShift" data-id="${j.id}" ${j.available ? '' : 'disabled'}>
                ${done ? 'Сегодня уже работал' : j.available ? 'Выйти на смену' : 'Сейчас не берут'}</button>
            </div>`,
          )
          .join('')}`,
    };
  },
};

/* ======================= НАСТРОЙКИ ======================= */

export const settings = {
  view: (S) => ({
    title: 'Настройки',
    body: `<div class="card">
        <h3>Скорость времени</h3>
        <div class="muted">Одна реальная секунда — одна игровая минута. Можно ускорить, чтобы не ждать вечер вручную.</div>
        <div class="seg">
          ${[1, 2, 4]
            .map((k) => `<button class="${S.ui.speed === k ? 'on' : ''}" data-act="setSpeed" data-val="${k}">×${k}</button>`)
            .join('')}
        </div>
      </div>
      <div class="card">
        <h3>Как это работает</h3>
        <p class="note">Покупай дешевле рынка, проверяй подлинность и продавай дороже. Всё остальное — следствие.</p>
        <p class="note"><b>Ликвид.</b> Горячая вещь уходит за пару дней, мёртвая висит месяц и дешевеет прямо у тебя в шкафу. Смотри «Хайп-радар» до закупки, а не после.</p>
        <p class="note"><b>Паль.</b> Осмотр идёт по признакам: бирка, швы, подошва, запах. Каждый признак отнимает время, поэтому всё не осмотришь — выбирай. По чему палится конкретная модель, запоминает «Книжка».</p>
        <p class="note"><b>Состояние.</b> На фото дефектов не видно. На встрече у метро — видно, и это лучший аргумент в торге.</p>
        <p class="note"><b>Торг.</b> У продавца характер. Маме важно доброе слово, магазину — аргумент про рынок, тому, кто срочно уезжает, — что заберёшь сегодня.</p>
        <p class="note"><b>Клиенты.</b> Выполненный заказ превращает подписчика в постоянного клиента: он вернётся, заплатит больше и приведёт друзей.</p>
        <p class="note"><b>Опыт</b> дают только отзывы покупателей, и он зависит от сегмента вещи. Единица весит как три пятёрки.</p>
        <p class="note"><b>Деньги</b> видно только здесь, в «Банке». В минус карта не уходит: не хватит на обязательный платёж — банк сам выдаст дорогой микрозайм.</p>
        <p class="note"><b>Жесты.</b> Баннер смахивается вверх. Потяни вниз от верхнего края — откроются все уведомления, каждое убирается свайпом вбок.</p>
      </div>
      <div class="card">
        <h3>Игра</h3>
        <div class="muted">Прогресс сохраняется в этом браузере автоматически. Сид этой игры: ${S.seed}.</div>
        <button class="btn sec" data-act="exportSave">Скопировать сейв</button>
        <button class="btn bad" data-act="resetAsk">Начать заново</button>
      </div>`,
  }),
};
