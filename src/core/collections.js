// Коллекции: все расцветки одной модели в шкафу разом.
//
// Перекуп продаёт всё, что купил, — и это правильно, но скучно. Коллекция
// даёт причину придержать вещь: собрал все расцветки модели оригиналами,
// проверенными легит-чеком, — пост в канал «у меня полный сет», доверие и
// подписчики, строчка в Хронике. Один раз на модель. Денег напрямую не даёт:
// цена удержания — замороженный капитал, и это честный выбор.

import { MODELS } from './data/models.js';
import { clamp } from './util.js';
import { notify, touch, fx, bump } from './kernel.js';

/** Модели, у которых есть что собирать: две и больше расцветки. */
export const collectible = (mi) => {
  const m = MODELS[mi];
  return !!m && !m.noname && m.ways.length >= 2;
};

/** Какие расцветки модели лежат в шкафу проверенными оригиналами. */
export function collectionOf(S, mi) {
  const m = MODELS[mi];
  const have = new Set();
  for (const it of S.items) {
    if (it.m !== mi || it.verdict !== 'orig') continue;
    have.add(it.way % m.ways.length);
  }
  return {
    total: m.ways.length,
    have,
    done: !!(S.collections && S.collections[mi]),
    full: have.size >= m.ways.length,
  };
}

/** Проверить после любого действия: не собрался ли сет. */
export function checkCollections(S) {
  if (!S.collections) S.collections = {};
  const seen = new Set();
  for (const it of S.items) {
    if (seen.has(it.m) || !collectible(it.m) || S.collections[it.m]) continue;
    seen.add(it.m);
    const c = collectionOf(S, it.m);
    if (!c.full) continue;
    S.collections[it.m] = S.t;
    bump(S, 'collections');
    const m = MODELS[it.m];
    let extra = '';
    if (S.tg.has) {
      // Полный сет — лучший пост для канала: люди любят смотреть на ряд.
      const gained = Math.round(6 + S.tg.subs * 0.03);
      S.tg.subs += gained;
      S.tg.trust = clamp(S.tg.trust + 6, 0, 100);
      S.tg.posts.unshift({ at: S.t, kind: 'collection', text: `🧩 Собрал ${m.b} ${m.n} во всех расцветках: ${m.ways.map((w) => w.n.toLowerCase()).join(', ')}. Все оригиналы, все проверены.` });
      S.tg.lastPost = S.t;
      extra = ` · пост в канал: +${gained} подписч., доверие выше`;
    }
    fx('streak');
    notify(S, { route: 'shop/chronicle', title: '🧩 Коллекция собрана', text: `${m.b} ${m.n} — все ${m.ways.length} расцветки${extra}` });
  }
  touch(S);
}
