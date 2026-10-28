// Пойзон: все модели, все размеры, видимый срок доставки.
// Цена здесь догоняет хайп с опозданием — в этом вся ценность прогноза.

import { esc, rub, num, plural } from '../../core/util.js';
import { MODELS } from '../../core/data/models.js';
import { CATS, TIERS, sizesFor } from '../../core/data/catalog.js';
import { dateLabel } from '../../core/time.js';
import {
  poizonPrice,
  poizonEta,
  poizonShip,
  valueOrig,
  hypePct,
  hypeLag,
  freeSlots,
} from '../../core/economy.js';
import { thumb, bigPhoto, itemRow, hypeTag, emptyState } from '../components.js';

const priceFrom = (S, m) => Math.min(...sizesFor(m.cat).map((z) => poizonPrice(S, m.i, z)));

export const view = (S) => {
  if (S.ui.view === 'item') return modelView(S, S.ui.id);

  const f = S.ui.poizon;
  const q = (f.q || '').toLowerCase().trim();
  let list = MODELS.filter((m) => {
    if (f.cat !== 'all' && m.cat !== f.cat) return false;
    if (f.tier !== 'all' && m.tier !== f.tier) return false;
    if (q && !(m.full + ' ' + CATS[m.cat].n).toLowerCase().includes(q)) return false;
    return true;
  });
  const sorts = {
    pop: (a, b) => S.market.h[b.i] - S.market.h[a.i],
    cheap: (a, b) => priceFrom(S, a) - priceFrom(S, b),
    expensive: (a, b) => priceFrom(S, b) - priceFrom(S, a),
  };
  list.sort(sorts[f.sort] || sorts.pop);

  const [lo, hi] = poizonEta(S);
  const body = `
    <div class="card" style="background:#17171a;color:#fff">
      <div class="row between"><b>Курс юаня</b><span class="money">${S.market.fx.toFixed(2)} ₽</span></div>
      <div style="font-size:12.5px;opacity:.82">Все модели и размеры. Каждую вещь проверяют на подлинность в Китае: только оригинал, новое с бирками. Доставка ${lo}–${hi} дней.${
        S.prog.lvl >= 4 ? ' Опт от 5 шт: −10% и доставка дешевле.' : ' Опт откроется на 4 уровне.'
      }</div>
      <div style="font-size:12.5px;opacity:.82">Цена здесь догоняет хайп с опозданием в пару недель. Пока ликвидность растёт, тут ещё дёшево.</div>
    </div>
    <div class="inline-form">
      <input class="inp" id="poizonSearch" type="search" placeholder="Самбы, Нупси, Таби…" value="${esc(f.q || '')}" aria-label="Поиск по моделям">
      <button class="btn" data-act="poizonSearch">Найти</button>
    </div>
    <div class="chips">
      <button class="chip ${f.cat === 'all' ? 'on' : ''}" data-act="poizonCat" data-val="all">Всё</button>
      ${Object.entries(CATS).map(([k, c]) => `<button class="chip ${f.cat === k ? 'on' : ''}" data-act="poizonCat" data-val="${k}">${esc(c.n)}</button>`).join('')}
    </div>
    <div class="field2">
      <select class="sel" data-change="pzTier" aria-label="Сегмент">
        <option value="all">Все сегменты</option>
        ${Object.entries(TIERS).map(([k, t]) => `<option value="${k}"${f.tier === k ? ' selected' : ''}>${esc(t.n)}</option>`).join('')}
      </select>
      <select class="sel" data-change="pzSort" aria-label="Сортировка">
        ${[['pop', 'Популярные'], ['cheap', 'Дешевле'], ['expensive', 'Дороже']]
          .map(([k, n]) => `<option value="${k}"${f.sort === k ? ' selected' : ''}>${n}</option>`)
          .join('')}
      </select>
    </div>
    <div class="muted">${list.length} ${plural(list.length, 'модель', 'модели', 'моделей')}</div>
    ${
      list
        .slice(0, S.ui.limit)
        .map((m) => {
          const probe = { m: m.i, way: 0, cond: 0, shownCond: 0, condSeen: true, defects: [], size: sizesFor(m.cat)[0] };
          return itemRow(probe, {
            price: 'от ' + rub(priceFrom(S, m)),
            meta: `${esc(CATS[m.cat].n)} · ${esc(TIERS[m.tier].n)} · доставка ${lo}–${hi} дн`,
            tags: hypeTag(S, { m: m.i }),
            route: `poizon/item/${m.i}`,
          });
        })
        .join('') || emptyState('Ничего не нашлось')
    }
    ${list.length > S.ui.limit ? '<button class="btn sec full" data-act="showMore">Показать ещё</button>' : ''}`;

  return { title: 'Пойзон', body };
};

function modelView(S, i) {
  const m = MODELS[+i];
  if (!m) return { title: 'Пойзон', body: emptyState('Модель не найдена') };
  const sizes = sizesFor(m.cat);
  const qty = S.ui.qty['pz' + m.i] || 1;
  let size = S.ui.sizeChoice[m.i] || sizes[Math.floor(sizes.length / 2)];
  if (size === 'mix' && qty < 2) size = sizes[Math.floor(sizes.length / 2)];

  const price = poizonPrice(S, m.i, size === 'mix' ? null : size);
  const bulk = qty >= 5 && S.prog.lvl >= 4;
  const unit = bulk ? Math.round(price * 0.9) : price;
  const ship = poizonShip(S, m.i, qty);
  const total = (unit + ship) * qty;
  const [lo, hi] = poizonEta(S);
  const resale = valueOrig(S, { m: m.i, cond: 0, size: size === 'mix' ? sizes[2] : size, boughtAt: S.t });
  const lag = Math.round(hypeLag(S, m.i) * 100);
  const now = hypePct(S, m.i);

  const way = S.ui.sizeChoice['way' + m.i] || 0;
  const probe = { m: m.i, way, cond: 0, shownCond: 0, condSeen: true, defects: [] };

  const body = `
    ${bigPhoto(probe, hypeTag(S, { m: m.i }))}
    ${
      m.ways.length > 1
        ? `<div class="chips">${m.ways
            .map((w, idx) => `<button class="chip ${idx === way ? 'on' : ''}" data-act="pzWay" data-model="${m.i}" data-val="${idx}">${esc(w.n)}</button>`)
            .join('')}</div>`
        : ''
    }
    <div class="card">
      <h3>${esc(m.full)}</h3>
      <div class="row between">
        <span class="money" style="font-size:23px">${rub(price)}</span>
        <span class="muted">¥${num(price / S.market.fx)} · ${size === 'mix' ? 'сетка' : 'размер ' + esc(size)}</span>
      </div>
      <div class="kv"><span>Срок доставки</span><span>${lo}–${hi} дней</span></div>
      <div class="kv"><span>Приедет примерно</span><span>${esc(dateLabel(S.t + lo * 24))} – ${esc(dateLabel(S.t + hi * 24))}</span></div>
      <div class="kv"><span>Доставка</span><span>${rub(ship)}/шт</span></div>
      <div class="kv"><span>На Авитке новая сейчас</span><span>~${rub(resale)}</span></div>
      <div class="kv"><span>Ликвидность</span><span>${now}%${lag !== now ? ` <small>Пойзон видит ${lag}%</small>` : ''}</span></div>
      ${now > lag + 6 ? '<div class="callout ok">Хайп растёт быстрее, чем цена здесь. Самый момент брать.</div>' : ''}
      ${now < lag - 6 ? '<div class="callout">Модель остывает, а цена тут ещё высокая. Лучше подождать.</div>' : ''}
    </div>
    <div class="card"><h3>Размер</h3>
      <div class="size-grid">
        ${qty > 1 ? `<button class="size-btn ${size === 'mix' ? 'on' : ''}" data-act="pzSize" data-model="${m.i}" data-val="mix"><b>Сетка</b><span>разные</span></button>` : ''}
        ${sizes
          .map(
            (z) => `<button class="size-btn ${z === size ? 'on' : ''}" data-act="pzSize" data-model="${m.i}" data-val="${z}">
              <b>${esc(z)}</b><span>${num(poizonPrice(S, m.i, z))}</span></button>`,
          )
          .join('')}
      </div>
      <div class="muted">Ходовые размеры дороже, зато продаются быстрее.</div>
    </div>
    <div class="card">
      <div class="row between"><h3>Количество</h3>
        <div class="stepper">
          <button data-act="qty" data-key="pz${m.i}" data-d="-1" data-min="1" data-max="20" aria-label="Меньше">−</button>
          <b>${qty}</b>
          <button data-act="qty" data-key="pz${m.i}" data-d="1" data-min="1" data-max="20" aria-label="Больше">+</button>
        </div>
      </div>
      ${qty >= 5 && S.prog.lvl < 4 ? '<div class="callout">Оптовая скидка откроется на 4 уровне магазина.</div>' : ''}
      ${bulk ? '<div class="muted pos">Оптовая цена: −10% и доставка дешевле на 30%</div>' : ''}
      ${freeSlots(S) < qty ? `<div class="callout danger">В шкафу свободно только ${freeSlots(S)} мест.</div>` : ''}
    </div>`;

  const foot = `<button class="btn full dark" data-act="buyPoizon" data-model="${m.i}" data-size="${esc(size)}" ${freeSlots(S) >= qty ? '' : 'disabled'}>
      Заказать ${qty} шт · ${rub(total)}
    </button>
    <div class="muted" style="text-align:center">Пока посылка едет две недели, тренд может пройти. Думай наперёд.</div>`;

  return { title: 'Пойзон', body, foot };
}
