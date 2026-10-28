// Разовая диагностика: один показатель по стратегии на тех же сидах,
// что и sim/run.js. Нужна, когда надо понять, что именно просело.
// Запуск: node sim/diag.js careful 24

import { createGame } from '../src/core/engine.js';
import { runBot } from './bots.js';
import { netWorth } from '../src/core/economy.js';

const key = process.argv[2] || 'careful';
const n = +(process.argv[3] || 24);
const rows = [];
for (let i = 0; i < n; i++) {
  const S = createGame(1000 + i * 7919);
  S.flags.started = 1;
  runBot(S, key, 60);
  rows.push({
    nw: netWorth(S),
    sniped: S.rival.sniped,
    heat: Math.round(S.rival.heat * 10) / 10,
    sec: S.stats.secondBuys,
    bought: S.stats.bought,
    sold: S.stats.sold,
    lvl: S.prog.lvl,
  });
}
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const avg = (a) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);
console.log(
  key +
    ': капитал мед ' + med(rows.map((r) => r.nw)) +
    ', перехватов ' + avg(rows.map((r) => r.sniped)) +
    ', heat ' + avg(rows.map((r) => r.heat)) +
    ', секонд ' + avg(rows.map((r) => r.sec)) +
    ', куплено ' + avg(rows.map((r) => r.bought)) +
    ', продано ' + avg(rows.map((r) => r.sold)) +
    ', уровень ' + med(rows.map((r) => r.lvl)),
);
