// Мелкие помощники без состояния. Работают и в браузере, и в Node.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const lerp = (a, b, k) => a + (b - a) * k;

/** Плавная кривая 0..1. */
export const smooth = (k) => {
  const t = clamp(k, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Округление цены до «человеческого» шага. */
export function priceRound(v) {
  v = Math.max(0, v);
  if (v < 1000) return Math.round(v / 50) * 50;
  if (v < 20000) return Math.round(v / 100) * 100;
  if (v < 200000) return Math.round(v / 500) * 500;
  return Math.round(v / 1000) * 1000;
}

const NBSP = ' ';

/** «12 400 ₽» с неразрывными пробелами, минус настоящим минусом. */
export function rub(n) {
  const neg = n < 0;
  const v = Math.round(Math.abs(n));
  return (neg ? '−' : '') + groupDigits(v) + NBSP + '₽';
}

/** Число с разделителями разрядов. */
export function num(n) {
  return groupDigits(Math.round(n));
}

function groupDigits(v) {
  const s = String(v);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += NBSP;
    out += s[i];
  }
  return out;
}

/** Компактно: 12,4 тыс. */
export function shortNum(n) {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) {
    const k = n / 1000;
    return (k < 10 ? k.toFixed(1).replace('.', ',') : String(Math.round(k))) + NBSP + 'тыс.';
  }
  return (n / 1e6).toFixed(1).replace('.', ',') + NBSP + 'млн';
}

/** Экранирование для вставки в HTML. */
export function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/** Вытащить целое число из пользовательского ввода. */
export function parseNum(v) {
  const digits = String(v === null || v === undefined ? '' : v).replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

/** Русское склонение: plural(5, 'вещь', 'вещи', 'вещей'). */
export function plural(n, one, few, many) {
  const a = Math.abs(Math.round(n)) % 100;
  if (a > 10 && a < 20) return many;
  const b = a % 10;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

/** «5 вещей» одной строкой. */
export function countOf(n, one, few, many) {
  return num(n) + NBSP + plural(n, one, few, many);
}

/** Минуты -> «1 ч 20 мин». */
export function dur(mins) {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (!h) return m + NBSP + 'мин';
  if (!m) return h + NBSP + 'ч';
  return h + NBSP + 'ч' + NBSP + m + NBSP + 'мин';
}

/** Глубокая копия через структурное клонирование, с запасным вариантом. */
export function clone(x) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(x);
    } catch (e) {
      /* объекты с функциями — ниже */
    }
  }
  return JSON.parse(JSON.stringify(x));
}

/** Сумма по полю. */
export const sumBy = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);

/** Группировка в Map. */
export function groupBy(arr, f) {
  const m = new Map();
  for (const x of arr) {
    const k = f(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/** Медиана и квартили — для балансовых отчётов. */
export function quantiles(values) {
  if (!values.length) return { min: 0, q1: 0, med: 0, q3: 0, max: 0 };
  const a = values.slice().sort((x, y) => x - y);
  const at = (p) => {
    const i = (a.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return lo === hi ? a[lo] : lerp(a[lo], a[hi], i - lo);
  };
  return { min: a[0], q1: at(0.25), med: at(0.5), q3: at(0.75), max: a[a.length - 1] };
}
