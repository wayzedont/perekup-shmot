// Проверка линеек, а не игры.
//
// За сессию четыре балансовых коридора оказались негодными: они шумели
// сильнее, чем правки, которые должны были ловить. Каждый раз это выглядело
// как «баланс сломался», а оказывалось «линейка кривая» — и каждый раз
// приводило к попыткам чинить несуществующую проблему.
//
// Этот инструмент проверяет сами меры. Один раз гоняем много прогонов, а
// потом считаем каждый показатель на случайных подвыборках того размера, с
// которым реально работают. Если показатель на одних и тех же данных пляшет
// от подвыборки к подвыборке — он ничего не измеряет, и порог по нему
// бессмысленен. Важно: прогоны здесь одни и те же для всех подвыборок,
// поэтому разброс — это чистый шум измерения, а не разные игровые миры.
//
// Запуск: node sim/stability.js [прогонов] [размер подвыборки] [повторов]

import { createGame } from '../src/core/engine.js';
import { quantiles, rub } from '../src/core/util.js';
import { STRATEGIES, runBot } from './bots.js';

const POOL = Number(process.argv[2] || 144);
const SAMPLE = Number(process.argv[3] || 72);
const DRAWS = Number(process.argv[4] || 40);
const DAYS = 60;

const at = (snaps, day) => {
  const s = snaps.find((x) => x.day === day) || snaps[snaps.length - 1];
  return s ? s.netWorth : 0;
};
const dayAtWorth = (snaps, v) => {
  const hit = snaps.find((s) => s.netWorth >= v);
  return hit ? hit.day : null;
};
const dayAtLevel = (snaps, l) => {
  const hit = snaps.find((s) => s.level >= l);
  return hit ? hit.day : null;
};
const stuck = (snaps) => {
  if (snaps.length < 30) return false;
  const mid = snaps[Math.floor(snaps.length * 0.4)];
  const end = snaps[snaps.length - 1];
  return end.netWorth <= mid.netWorth * 1.1;
};

function growthDips(runs) {
  const marks = [14, 21, 30, 45, 60].filter((d) => d <= DAYS);
  const meds = marks.map((d) => quantiles(runs.map((r) => at(r.snapshots, d))).med);
  let worst = 0;
  for (let i = 1; i < meds.length; i++) {
    if (meds[i] < meds[i - 1]) worst = Math.max(worst, 1 - meds[i] / Math.max(1, meds[i - 1]));
  }
  return worst;
}

/* ======================= ЧТО МЕРЯЕМ ======================= */
//
// У каждой меры указан её порог из коридоров — и это главное. Шумная мера
// сама по себе не беда: если порог далеко от полосы шума, она всё равно
// честно ловит поломку. Беда — когда полоса шума порог пересекает: тогда
// проверка просто подбрасывает монету. Поэтому сравниваем разброс не со
// значением, а с расстоянием до порога.
//
// lo/hi — границы коридора; что не указано, то не ограничено.

const METRICS = [
  {
    who: 'careful',
    n: 'Капитал аккуратного в конце',
    unit: '₽',
    lo: 25000,
    hi: 90000,
    f: (rs) => quantiles(rs.map((r) => at(r.snapshots, DAYS - 1))).med,
  },
  {
    who: 'careful',
    n: 'Самый быстрый до 50 000 ₽',
    unit: 'день',
    lo: 15,
    f: (rs) => {
      const d = rs.map((r) => dayAtWorth(r.snapshots, 50000)).filter((x) => x !== null);
      return d.length ? Math.min(...d) : null;
    },
  },
  {
    who: 'careful',
    n: 'Разбогател раньше 15-го дня',
    unit: '%',
    hi: 2,
    f: (rs) => {
      const early = rs.filter((r) => {
        const d = dayAtWorth(r.snapshots, 50000);
        return d !== null && d < 15;
      });
      return (early.length / rs.length) * 100;
    },
  },
  {
    who: 'careful',
    n: 'Нижний квартиль на 30-й день',
    unit: '₽',
    lo: 0,
    f: (rs) => quantiles(rs.map((r) => at(r.snapshots, 30))).q1,
  },
  {
    who: 'careful',
    n: 'Верхний квартиль на 30-й день',
    unit: '₽',
    hi: 120000,
    f: (rs) => quantiles(rs.map((r) => at(r.snapshots, 30))).q3,
  },
  {
    who: 'careful',
    n: '2 уровень у аккуратного',
    unit: 'день',
    lo: 6,
    hi: 18,
    f: (rs) => {
      const d = rs.map((r) => dayAtLevel(r.snapshots, 2)).filter((x) => x !== null);
      return d.length ? quantiles(d).med : null;
    },
  },
  {
    who: 'careful',
    n: 'Застряли у аккуратного',
    unit: '%',
    hi: 35,
    f: (rs) => (rs.filter((r) => stuck(r.snapshots)).length / rs.length) * 100,
  },
  {
    who: 'careful',
    n: 'Банкротств у аккуратного',
    unit: '%',
    hi: 6,
    f: (rs) => (rs.filter((r) => r.bankrupt).length / rs.length) * 100,
  },
  {
    who: 'careful',
    n: 'Провал в середине у аккуратного',
    unit: '%',
    hi: 10,
    f: (rs) => growthDips(rs) * 100,
  },
  {
    who: 'smart',
    n: 'Провал в середине у сильного',
    unit: '%',
    hi: 10,
    f: (rs) => growthDips(rs) * 100,
  },
  {
    who: 'smart',
    n: 'Рост сильного после 30-го дня',
    unit: '×',
    lo: 1.7,
    f: (rs) => {
      const g = rs
        .map((r) => {
          const a = at(r.snapshots, 30);
          return a > 1000 ? at(r.snapshots, DAYS - 1) / a : null;
        })
        .filter((x) => x !== null);
      return g.length ? quantiles(g).med : null;
    },
  },
  {
    who: 'smart',
    n: 'Заказов клиентов у сильного',
    unit: 'шт',
    lo: 3,
    f: (rs) => quantiles(rs.map((r) => r.S.stats.ordersDone)).med,
  },
  {
    who: 'smart',
    n: 'Постоянных клиентов у сильного',
    unit: 'чел',
    lo: 2,
    f: (rs) => quantiles(rs.map((r) => r.S.clients.filter((c) => c.status !== 'new').length)).med,
  },
  {
    who: 'leveraged',
    n: 'Банкротств у кредитного',
    unit: '%',
    lo: 20,
    hi: 80,
    f: (rs) => (rs.filter((r) => r.bankrupt).length / rs.length) * 100,
  },
  {
    who: 'lazy',
    n: 'Капитал ленивого в конце',
    unit: '₽',
    hi: 120000,
    f: (rs) => quantiles(rs.map((r) => at(r.snapshots, DAYS - 1))).med,
  },
];

/* ======================= ПРОГОНЫ ======================= */

const need = [...new Set(METRICS.map((m) => m.who))];
const pools = {};
const t0 = Date.now();
console.log(`\nГоняем ${POOL} прогонов × ${DAYS} дней на каждую из стратегий: ${need.join(', ')}`);

for (const key of need) {
  const runs = [];
  for (let i = 0; i < POOL; i++) {
    const S = createGame(1000 + i * 7919);
    S.flags.started = 1;
    const res = runBot(S, key, DAYS);
    if (res.error) continue;
    runs.push({ snapshots: res.snapshots, bankrupt: res.bankrupt, S });
  }
  pools[key] = runs;
  process.stdout.write(`  ${key}: ${runs.length} прогонов\n`);
}
console.log(`Время: ${((Date.now() - t0) / 1000).toFixed(1)} с\n`);

/* ======================= ПОДВЫБОРКИ ======================= */

let seed = 12345;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function draw(runs, n) {
  const copy = runs.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

const fmt = (v, unit) => {
  if (v === null || v === undefined) return '—';
  if (unit === '₽') return rub(Math.round(v));
  if (unit === '%') return Math.round(v) + '%';
  if (unit === '×') return v.toFixed(2) + '×';
  if (unit === 'день') return 'д. ' + Math.round(v);
  return v.toFixed(1);
};

console.log(`Каждый показатель посчитан ${DRAWS} раз на случайных подвыборках по ${SAMPLE} прогонов`);
console.log('из одних и тех же данных. Разброс здесь — чистый шум измерения.\n');
console.log('  Показатель                       полоса шума измерения          коридор   вердикт');
console.log('  ─────────────────────────────  ────────────────────────  ───────────────   ───────');

const bad = [];
for (const m of METRICS) {
  const runs = pools[m.who];
  if (!runs || runs.length < SAMPLE) continue;
  const vals = [];
  for (let d = 0; d < DRAWS; d++) {
    const v = m.f(draw(runs, SAMPLE));
    if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) continue;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const band = hi - lo;

  // Пересекает ли полоса шума порог. Если да — проверка подбрасывает монету.
  const crossLo = m.lo !== undefined && lo < m.lo && hi >= m.lo;
  const crossHi = m.hi !== undefined && lo <= m.hi && hi > m.hi;
  const outside = (m.lo !== undefined && hi < m.lo) || (m.hi !== undefined && lo > m.hi);

  // Запас: во сколько раз расстояние от полосы до ближайшего порога больше
  // самой полосы. Меньше единицы — порог рядом, стоит присмотреться.
  const gaps = [];
  if (m.lo !== undefined) gaps.push(lo - m.lo);
  if (m.hi !== undefined) gaps.push(m.hi - hi);
  const gap = gaps.length ? Math.min(...gaps) : Infinity;
  const margin = band > 1e-9 ? gap / band : gap > 0 ? Infinity : 0;

  let verdict;
  if (outside) verdict = 'не держит';
  else if (crossLo || crossHi) verdict = 'ЛОТЕРЕЯ';
  else if (margin < 0.5) verdict = 'впритык';
  else verdict = 'годится';
  if (verdict === 'ЛОТЕРЕЯ' || verdict === 'впритык' || verdict === 'не держит') {
    bad.push({ n: m.n, lo, hi, unit: m.unit, verdict, mlo: m.lo, mhi: m.hi, margin });
  }

  const corridor =
    m.lo !== undefined && m.hi !== undefined
      ? fmt(m.lo, m.unit) + '–' + fmt(m.hi, m.unit)
      : m.lo !== undefined
        ? 'от ' + fmt(m.lo, m.unit)
        : 'до ' + fmt(m.hi, m.unit);

  console.log(
    '  ' +
      m.n.padEnd(31) +
      (fmt(lo, m.unit) + ' … ' + fmt(hi, m.unit)).padStart(24) +
      corridor.padStart(17) +
      ('   ' + verdict).padStart(10) +
      (verdict === 'ЛОТЕРЕЯ' ? ' ⚠' : ''),
  );
}

console.log('');
const lottery = bad.filter((b) => b.verdict === 'ЛОТЕРЕЯ');
const tight = bad.filter((b) => b.verdict === 'впритык');
if (!lottery.length && !tight.length) {
  console.log('✓ Все пороги стоят в стороне от полосы шума: проверки ловят правки, а не случай.');
}
if (lottery.length) {
  console.log(`⚠ Лотерей: ${lottery.length}. Полоса шума пересекает порог — такая проверка не значит ничего:`);
  for (const b of lottery) {
    console.log(`  • ${b.n}: шум ${fmt(b.lo, b.unit)} … ${fmt(b.hi, b.unit)}, а порог ${
      b.mlo !== undefined && b.lo < b.mlo ? 'снизу ' + fmt(b.mlo, b.unit) : 'сверху ' + fmt(b.mhi, b.unit)
    }`);
  }
}
if (tight.length) {
  console.log(`\nВпритык: ${tight.length}. Порог рядом с полосой — такая проверка сорвётся от любой правки:`);
  for (const b of tight) {
    console.log(`  • ${b.n}: шум ${fmt(b.lo, b.unit)} … ${fmt(b.hi, b.unit)}, запас ${(b.margin * 100).toFixed(0)}% от ширины полосы`);
  }
}
console.log('');
