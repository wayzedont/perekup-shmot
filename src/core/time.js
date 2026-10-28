// Время: календарь, часы, расписание дня.
// Одна реальная секунда — одна игровая минута. В полночь персонаж вырубается.

import { WEEKDAYS, WEEKDAYS_FULL, MONTHS, MONTHS_FULL } from './data/catalog.js';

export const START_YEAR = 2026;
export const START_MONTH = 8; // сентябрь
export const START_DAY = 7; // понедельник

export const dayIndex = (t) => Math.floor(t / 24);
export const hourIndex = (t) => t % 24;

export function dateAt(t) {
  return new Date(START_YEAR, START_MONTH, START_DAY + Math.floor(t / 24));
}

export const weekdayAt = (t) => dateAt(t).getDay();
export const monthAt = (t) => dateAt(t).getMonth();

/** «пн, 7 сен» */
export function dateLabel(t) {
  const d = dateAt(t);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** «понедельник, 7 сентября» */
export function dateLabelFull(t) {
  const d = dateAt(t);
  return `${WEEKDAYS_FULL[d.getDay()]}, ${d.getDate()} ${MONTHS_FULL[d.getMonth()].replace(/ь$/, 'я').replace(/т$/, 'та')}`;
}

/** «08:40» */
export function clockLabel(t, minutes) {
  const h = String(hourIndex(t)).padStart(2, '0');
  const m = String(minutes || 0).padStart(2, '0');
  return h + ':' + m;
}

/** «14:00» — только час, для будущих событий. */
export function hourLabel(t) {
  return String(hourIndex(t)).padStart(2, '0') + ':00';
}

/** «2 ч назад» */
export function agoLabel(now, then) {
  const h = now - then;
  if (h < 1) return 'только что';
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'вчера' : `${d} дн назад`;
}

/** Через сколько — для сроков. */
export function untilLabel(now, then) {
  const h = then - now;
  if (h <= 0) return 'срок вышел';
  if (h < 24) return `осталось ${h} ч`;
  const d = Math.floor(h / 24);
  return `осталось ${d} ${d === 1 ? 'день' : d < 5 ? 'дня' : 'дней'}`;
}

/* ======================= РАСПИСАНИЕ ======================= */

export const SCHEDULE = {
  wakeHour: 8,
  sleepHour: 0,
  buyersFrom: 9,
  buyersTo: 23,
  meetFrom: 9,
  meetTo: 20,
  secondOpen: 10,
  secondClose: 21,
  briefingHour: 9,
  supplierHours: [11, 14, 17],
  lotHours: [12, 16, 20],
  orderHours: [11, 15, 19],
  raffleResultHour: 12,
};

export const isSecondOpen = (t) =>
  hourIndex(t) >= SCHEDULE.secondOpen && hourIndex(t) < SCHEDULE.secondClose;

export const canMeet = (t) => hourIndex(t) >= SCHEDULE.meetFrom && hourIndex(t) < SCHEDULE.meetTo;

export const isBuyerTime = (t) =>
  hourIndex(t) >= SCHEDULE.buyersFrom && hourIndex(t) <= SCHEDULE.buyersTo;

/** Ближайший завоз в секонде: большой в понедельник, маленький в четверг. */
export function nextRestock(t) {
  const dw = weekdayAt(t);
  const h = hourIndex(t);
  if ((dw === 1 || dw === 4) && h < SCHEDULE.secondOpen) {
    return { t: Math.floor(t / 24) * 24 + SCHEDULE.secondOpen, big: dw === 1, label: 'сегодня в 10:00' };
  }
  for (let add = 1; add <= 7; add++) {
    const nt = t + add * 24;
    const d = weekdayAt(nt);
    if (d === 1 || d === 4) {
      return {
        t: Math.floor(nt / 24) * 24 + SCHEDULE.secondOpen,
        big: d === 1,
        label: dateLabel(nt) + ', 10:00',
      };
    }
  }
  return { t: t + 24, big: true, label: 'завтра' };
}
