// Магазин: уровень, навыки, склады, конкуренты, статистика, бренд.

import { esc, rub, num, shortNum, plural } from '../../core/util.js';
import { dateLabel } from '../../core/time.js';
import { SKILLS, STORAGE, MAX_SKILL, xpToNext, statusOf, UNLOCKS } from '../../core/data/progress.js';
import { CATS } from '../../core/data/catalog.js';
import {
  netWorth,
  capacity,
  ratingOf,
  fastReplyBadge,
  FAST_REPLY_DAYS,
  daysHeld,
  buyersPerDay,
} from '../../core/economy.js';
import { RIVAL_NAME } from '../../core/rival.js';
import { STAFF, hired, HANDOFF_HOURS } from '../../core/staff.js';
import {
  FITTINGS,
  hasShowroom,
  comfort,
  walkInRate,
  walkInPriceK,
  windowIds,
  windowItems,
  windowBonus,
  windowCooldown,
  canSetWindow,
  WINDOW_SLOTS,
  WINDOW_WEIGHT,
} from '../../core/showroom.js';
import {
  BRAND_LEVEL,
  BRAND_PRICE,
  QUALITY,
  DROP_CATS,
  SALVAGE_K,
  hasBrand,
  activeDrop,
  brandRep,
  fairPrice,
  unitCost,
  forecast,
} from '../../core/brand.js';
import { partners, findPartner, canCollab, riskLabel, reachLabel } from '../../core/market/collab.js';
import { seasonProgress, seasonDaysLeft } from '../../core/events.js';
import { studiedCount } from '../../core/notebook.js';
import { loyalCount } from '../../core/people/clients.js';
import { sparkline, starsRow, emptyState, sectionLabel } from '../components.js';
import { itemName } from '../../core/items.js';

export const view = (S) => {
  if (S.ui.view === 'showroom') return showroomView(S);
  if (S.ui.view === 'brand') return brandView(S);
  const need = xpToNext(S.prog.lvl);
  const nw = netWorth(S);
  const rating = ratingOf(S);

  const all = [...S.bgRivals.map((r) => ({ name: r.name, nw: r.nw })), { name: RIVAL_NAME, nw: S.rival.nw, rival: true }, { name: 'Ты', nw, me: true }];
  all.sort((a, b) => b.nw - a.nw);
  const myRank = all.findIndex((r) => r.me) + 1;

  const hero = `<div class="hero" style="background:#7a46d6">
    <div class="label">${esc(statusOf(S.prog.lvl))} · уровень ${S.prog.lvl}</div>
    <div class="money">${rub(nw)}</div>
    <div class="sub">Капитал: деньги, вещи, посылки и вклад минус долги</div>
    <div class="bar" style="background:rgba(255,255,255,.25)"><i style="width:${Math.min(100, (S.prog.xp / need) * 100)}%;background:#fff"></i></div>
    <div class="sub">${S.prog.xp} / ${need} опыта до следующего уровня · опыт дают только отзывы</div>
  </div>`;

  const season = `<div class="card tight">
    <div class="row between"><h3>Сезон ${S.season.no}</h3><span class="muted">${seasonDaysLeft(S)} ${plural(seasonDaysLeft(S), 'день', 'дня', 'дней')} до конца</span></div>
    <div class="bar"><i style="width:${Math.round(seasonProgress(S) * 100)}%"></i></div>
    <div class="muted">Сезон идёт с сентября до Нового года. В конце — итоги и новый сезон с модификатором.</div>
  </div>`;

  const rivalCard = `<div class="card">
    <div class="row between"><h3>Топ перекупов Москвы</h3><span class="tag vip">Ты №${myRank}</span></div>
    ${all
      .map(
        (r, i) => `<div class="kv"${r.me ? ' style="font-weight:700"' : ''}>
          <span${r.me ? ' style="color:var(--ink)"' : ''}>${i + 1}. ${esc(r.name)}${r.rival ? ' <span class="tag bad">соперник</span>' : ''}</span>
          <span>${rub(r.nw)}</span></div>`,
      )
      .join('')}
    <div class="muted">${RIVAL_NAME} охотится за теми же вещами: перехватывает дешёвые объявления и приезжает в секонд к открытию. Перехватил у тебя ${S.rival.sniped} ${plural(S.rival.sniped, 'раз', 'раза', 'раз')}.</div>
  </div>`;

  const streak = S.streak.days || 0;
  const ratingCard = `<div class="card">
    <div class="row between"><h3>Рейтинг магазина</h3><span class="stars" style="font-size:16px">${rating === null ? '—' : '★ ' + rating.toFixed(2)}</span></div>
    <div class="muted">Считается по последним сорока отзывам. Единица за пойманную паль весит втрое, двойка за враньё про легит-чек — вдвое; обычный отзыв весит единицу. Спрос режет так: при 4,5 пишут на 20% реже, при 4,0 — на треть, при 3,0 — втрое реже.</div>
    <div class="kv"><span>Отвечаешь без задержек</span><span class="${fastReplyBadge(S) ? 'pos' : ''}">${
      fastReplyBadge(S)
        ? `${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд · значок есть`
        : streak
          ? `${streak} из ${FAST_REPLY_DAYS} дней до значка`
          : 'значка нет'
    }</span></div>
    <div class="muted">Авитка показывает скорость ответа всем. Со значком пишут охотнее; пропустишь день, когда тебя ждали, — собирать заново.</div>
    ${
      S.rep.reviews
        .slice(0, 6)
        .map(
          (r) => `<div class="kv"><span>${esc(r.text)}<small>${esc(dateLabel(r.at))} · ${r.platform === 'tg' ? 'канал' : 'Авитка'}</small></span>
            <span>${starsRow(r.stars)}</span></div>`,
        )
        .join('') || '<div class="muted">Отзывов пока нет</div>'
    }
  </div>`;

  const skills = `<div class="card">
    <div class="row between"><h3>Навыки</h3><span class="tag ${S.prog.sp ? 'good' : ''}">Очков: ${S.prog.sp}</span></div>
    ${SKILLS.map(
      (s) => `<div class="skill">
        <div><b>${esc(s.n)}</b><div class="muted">${esc(s.d)}</div>
          <div class="pips">${Array.from({ length: MAX_SKILL }, (_, i) => `<i class="${i < S.prog.skills[s.k] ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="btn sm" data-act="spendSkill" data-key="${s.k}" ${!S.prog.sp || S.prog.skills[s.k] >= MAX_SKILL ? 'disabled' : ''}>+1</button>
      </div>`,
    ).join('')}
  </div>`;

  const storage = `<div class="card"><h3>Хранение · ${capacity(S)} мест</h3>
    ${STORAGE.map((st) => {
      const has = S.prog.storage[st.id];
      const locked = S.prog.lvl < st.lvl;
      return `<div class="kv">
        <span><b style="color:var(--ink)">${esc(st.n)}</b> · +${st.cap}<small>${esc(st.d)}${st.rent ? ' Аренда ' + rub(st.rent) + '/нед.' : ''}</small></span>
        <span>${
          has
            ? '<span class="tag good">Есть</span>'
            : locked
              ? `<span class="tag">ур. ${st.lvl}</span>`
              : `<button class="btn sm" data-act="buyStorage" data-id="${st.id}">${st.price ? rub(st.price) : 'Арендовать'}</button>`
        }</span></div>`;
    }).join('')}
  </div>`;

  // Помощник: сначала деньги были узким местом, потом им становится время.
  const def = hired(S);
  const staffCard = `<div class="card"><h3>Помощник</h3>
    ${
      def
        ? `<div class="row between"><span><b>${esc(def.n)}</b><small>${esc(def.who)}</small></span>
             <span class="tag good">${rub(def.wage)} в неделю</span></div>
           <div class="kv"><span>Закрыл сделок</span><span>${S.staff.sold}</span></div>
           <div class="kv"><span>Продал пали как ориг</span><span class="${S.staff.blunders ? 'neg' : ''}">${S.staff.blunders}</span></div>
           <div class="muted">Берёт на себя переписки, до которых ты не дошёл за ${HANDOFF_HOURS} ${plural(HANDOFF_HOURS, 'час', 'часа', 'часов')}: держит цену от ${Math.round(def.targetShare * 100)}%, отдаёт не ниже ${Math.round(def.floorShare * 100)}%.${
             def.goesToSecond ? ' Занимает очередь в секонд к открытию и откладывает тебе одну вещь.' : ''
           }${def.managesStock ? ' Сам ведёт витрину: режет цену на залежавшемся и поднимает объявления.' : ''}</div>
           <button class="btn sec full" data-act="fireStaff">Уволить</button>`
        : `<div class="muted">Чем крупнее магазин, тем меньше успеваешь сам. Помощник освобождает руки, но продаёт дешевле тебя и иногда отдаёт вещь не проверив.</div>
           ${STAFF.map((st) => {
             const locked = S.prog.lvl < st.lvl;
             return `<div class="kv"><span>${esc(st.n)}<small>${esc(st.d)}</small></span>
               <span>${
                 locked
                   ? `<span class="tag">ур. ${st.lvl}</span>`
                   : `<button class="btn sm" data-act="hireStaff" data-id="${st.id}">${rub(st.wage)}/нед</button>`
               }</span></div>`;
           }).join('')}`
    }
  </div>`;

  // Шоурум — не склад, а поток людей с улицы. Поэтому у него свой экран.
  const showroomCard = hasShowroom(S)
    ? `<button class="card full-btn" data-act="go" data-route="shop/showroom">
        <div class="row between"><h3>Шоурум</h3><span class="tag good">${Math.round(comfort(S) * 100)}% обустроен</span></div>
        <div class="kv"><span>Заходят с улицы</span><span>${(walkInRate(S) * 11).toFixed(1)} ${plural(Math.round(walkInRate(S) * 11), 'человек', 'человека', 'человек')} в день</span></div>
        <div class="kv"><span>Куплено на месте</span><span>${S.showroom.walkIns} ${plural(S.showroom.walkIns, 'вещь', 'вещи', 'вещей')} · ${rub(S.showroom.revenue)}</span></div>
        <div class="muted">Продажа без переписки вообще. Открыть →</div>
      </button>`
    : '';

  const unlocked = Object.keys(S.prog.unlocks);
  const unlocksCard = unlocked.length
    ? `<div class="card"><h3>Что ты уже открыл</h3>
        ${unlocked
          .map((k) => (UNLOCKS[k] ? `<div class="kv"><span>${esc(UNLOCKS[k].n)}<small>${esc(UNLOCKS[k].d)}</small></span><span class="tag good">✓</span></div>` : ''))
          .join('')}</div>`
    : '';

  const drop = activeDrop(S);
  const brand = hasBrand(S)
    ? `<button class="card full-btn" data-act="go" data-route="shop/brand">
        <div class="row between"><h3>«${esc(S.brand.name)}»</h3>
          <span class="tag ${drop ? 'good' : ''}">${drop ? 'дроп идёт' : 'дропов: ' + S.brand.drops.length}</span></div>
        ${
          drop
            ? `<div class="kv"><span>${esc(drop.name)}</span><span>продано ${drop.sold} из ${drop.qty}</span></div>`
            : '<div class="muted">Можно запускать следующий дроп.</div>'
        }
        <div class="muted">Свой лейбл и свои дропы. Открыть →</div>
      </button>`
    : `<div class="card"><h3>Свой бренд</h3>
        <div class="muted">Больше не перекупать чужое, а выпускать своё: дропы, тиражи, очередь. Нужен ${BRAND_LEVEL} уровень, свой канал и ${rub(BRAND_PRICE)}.</div>
        <div class="kv"><span>Уровень</span><span class="${S.prog.lvl >= BRAND_LEVEL ? 'pos' : 'neg'}">${S.prog.lvl} из ${BRAND_LEVEL}</span></div>
        <div class="kv"><span>Свой канал</span><span class="${S.tg.has ? 'pos' : 'neg'}">${S.tg.has ? 'есть' : 'нужен'}</span></div>
        <button class="btn full" data-act="launchBrandAsk" ${S.prog.lvl >= BRAND_LEVEL && S.tg.has && S.money >= BRAND_PRICE ? '' : 'disabled'}>Запустить бренд · ${rub(BRAND_PRICE)}</button>
      </div>`;

  const chart = sparkline(S.history, '#7a46d6');
  const chartCard = chart
    ? `<div class="card"><div class="row between"><h3>Капитал по дням</h3>
        <span class="muted">${rub(Math.min(...S.history.map((h) => h.value)))} – ${rub(Math.max(...S.history.map((h) => h.value)))}</span></div>${chart}</div>`
    : '';

  const stats = `<div class="card"><h3>Статистика</h3>
    <div class="kv"><span>Дней в деле</span><span>${Math.floor(S.t / 24) + 1}</span></div>
    <div class="kv"><span>Продано вещей</span><span>${S.stats.sold}</span></div>
    <div class="kv"><span>Прибыль всего</span><span class="${S.stats.profit >= 0 ? 'pos' : 'neg'}">${rub(S.stats.profit)}</span></div>
    <div class="kv"><span>Лучшая сделка</span><span>${rub(S.stats.bestDeal)}</span></div>
    <div class="kv"><span>Осмотров сделано</span><span>${S.stats.inspections}</span></div>
    <div class="kv"><span>Моделей изучено</span><span>${studiedCount(S)}</span></div>
    <div class="kv"><span>Постоянных клиентов</span><span>${loyalCount(S)}</span></div>
    <div class="kv"><span>Паль продано как ориг</span><span>${S.stats.fakeAsOrig}</span></div>
    <div class="kv"><span>Из них спалили</span><span>${S.stats.caught}</span></div>
    <div class="kv"><span>Подписчиков</span><span>${shortNum(S.tg.subs)}</span></div>
  </div>`;

  const deals = `<div class="card"><h3>Последние сделки</h3>
    ${
      S.deals
        .slice(0, 12)
        .map(
          (d) => `<div class="kv"><span>${esc(d.label)} · ${esc(d.size)}<small>${esc(dateLabel(d.at))} · ${d.platform === 'tg' ? 'канал' : d.platform === 'showroom' ? 'шоурум' : 'Авитка'}${
            d.returned ? ' · возврат' : d.disputed ? ' · спор проигран' : ''
          }${d.isOrder ? ' · заказ' : ''}</small></span>
            <span class="${d.profit >= 0 ? 'pos' : 'neg'}">${d.profit >= 0 ? '+' : ''}${rub(d.profit)}</span></div>`,
        )
        .join('') || '<div class="muted">Сделок пока нет</div>'
    }</div>`;

  return {
    title: 'Магазин',
    body:
      hero + season + rivalCard + ratingCard + skills + storage + showroomCard + staffCard + unlocksCard + brand + chartCard + stats + deals,
  };
};

/* ======================= ШОУРУМ ======================= */
// Единственный канал продаж, где не нужно никому писать: человек зашёл,
// померил и забрал. Каждое вложение в место превращается в поток.

function showroomView(S) {
  if (!hasShowroom(S)) {
    return {
      title: 'Шоурум',
      body: emptyState('Шоурум ещё не открыт. Его можно снять в разделе «Хранение».'),
    };
  }
  const perDay = walkInRate(S) * 11;
  const k = walkInPriceK(S);
  const onSale = S.items.filter((i) => i.sale).length;

  const hero = `<div class="hero" style="background:#1f7a5a">
    <div class="label">Шоурум · ${Math.round(comfort(S) * 100)}% обустроен</div>
    <div style="font-family:var(--f-disp);font-size:24px">${perDay.toFixed(1)} ${plural(Math.round(perDay), 'человек', 'человека', 'человек')} в день</div>
    <div class="sub">Заходят с улицы и забирают вещь без всякой переписки. Платят ${Math.round(k * 100)}% твоей цены — за то, что забирают сейчас.</div>
  </div>`;

  const facts = `<div class="card tight">
    <div class="kv"><span>Вещей на вешалках</span><span>${onSale}</span></div>
    <div class="kv"><span>Куплено на месте</span><span>${S.showroom.walkIns}</span></div>
    <div class="kv"><span>Выручка шоурума</span><span class="money">${rub(S.showroom.revenue)}</span></div>
    <div class="muted">${
      onSale < 10
        ? 'Пустая витрина никого не держит: чем больше выставлено, тем чаще заходят.'
        : 'Поток зависит от рейтинга, известности канала и того, как выглядит место.'
    }</div>
  </div>`;

  const fittings = `<div class="card"><h3>Обустройство</h3>
    <div class="muted">Деньги на поздней игре девать некуда — а каждое вложение сюда превращается в людей на пороге.</div>
    ${FITTINGS.map((f) => {
      const has = S.showroom.fittings[f.id];
      return `<div class="kv">
        <span><b style="color:var(--ink)">${esc(f.n)}</b><small>${esc(f.d)} ${
          f.flow ? `Поток +${Math.round(f.flow * 50)}%.` : ''
        }${f.price_k ? ` Цена +${Math.round(f.price_k * 100)}%.` : ''}</small></span>
        <span>${
          has
            ? '<span class="tag good">Есть</span>'
            : `<button class="btn sm" data-act="buyFitting" data-id="${f.id}" ${S.money >= f.price ? '' : 'disabled'}>${rub(f.price)}</button>`
        }</span></div>`;
    }).join('')}
  </div>`;

  // Витрина: три вещи на подиуме у входа. Решение не очевидное — ставить
  // стоит не ходовое, а залежавшееся, и экран должен это подсказать.
  const picked = S.ui.windowPick || windowIds(S);
  const set = canSetWindow(S);
  const left = windowCooldown(S);
  const listed = S.items
    .filter((i) => i.sale)
    .map((i) => ({ i, days: Math.floor(daysHeld(S, i)), per: buyersPerDay(S, i) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 14);
  const changed = picked.join(',') !== windowIds(S).join(',');

  const windowCard = `<div class="card">
    <div class="row between"><h3>Витрина</h3>
      <span class="tag ${windowItems(S).length ? 'good' : ''}">${windowItems(S).length} из ${WINDOW_SLOTS}</span></div>
    <div class="muted">Человек у входа видит эти три вещи, а не всю вешалку, — и берёт почти не глядя на то, в моде модель или нет. Плюс сама витрина приводит больше прохожих. Ставить туда ходовое — значит продать то, что и так уйдёт: витрина для того, что залежалось.</div>
    <div class="kv"><span>Людей с улицы</span><span>${
      windowItems(S).length ? `+${Math.round((windowBonus(S) - 1) * 100)}% к потоку` : 'без витрины'
    }</span></div>
    ${
      listed.length
        ? `<div class="stack">${listed
            .map((row) => {
              const on = picked.includes(row.i.id);
              const stale = row.days >= 10;
              return `<button class="lever ${on ? 'strong' : ''}" data-act="windowPick" data-id="${row.i.id}">
                <b>${on ? '◉ ' : '○ '}${esc(itemName(row.i))}</b>
                <span>${rub(row.i.sale.price)} · лежит ${row.days} ${plural(row.days, 'день', 'дня', 'дней')}${
                  stale ? ' · залежалась' : ''
                } · ${row.per < 0.05 ? 'почти не пишут' : '≈' + row.per.toFixed(1) + ' покупателя в день'}</span></button>`;
            })
            .join('')}</div>`
        : '<div class="muted">Сначала выставь что-нибудь на продажу.</div>'
    }
    ${
      set.ok
        ? `<button class="btn full" data-act="setWindow" ${changed ? '' : 'disabled'}>${
            changed ? 'Поставить на витрину' : 'Витрина уже такая'
          }</button>`
        : `<button class="btn full" disabled>Менять можно раз в сутки: ещё ${Math.ceil(left)} ч</button>`
    }
  </div>`;

  const recent = S.deals.filter((d) => d.platform === 'showroom').slice(0, 10);
  const log = `<div class="card"><h3>Забрали с вешалки</h3>
    ${
      recent
        .map(
          (d) => `<div class="kv"><span>${esc(d.label)} · ${esc(d.size)}<small>${esc(dateLabel(d.at))}</small></span>
            <span class="${d.profit >= 0 ? 'pos' : 'neg'}">${d.profit >= 0 ? '+' : ''}${rub(d.profit)}</span></div>`,
        )
        .join('') || '<div class="muted">Пока никто не заходил</div>'
    }</div>`;

  return { title: 'Шоурум', body: hero + facts + windowCard + fittings + log };
}

/* ======================= СВОЙ БРЕНД ======================= */
// Самая крупная ставка в игре: тираж оплачивается вперёд, а выкупит его
// аудитория или нет — зависит от всего, что игрок строил до этого.

function brandView(S) {
  if (!hasBrand(S)) {
    return { title: 'Бренд', body: emptyState('Бренд ещё не запущен.') };
  }
  const b = S.brand;
  const drop = activeDrop(S);

  const hero = `<div class="hero" style="background:#161518">
    <div class="label">Свой бренд</div>
    <div style="font-family:var(--f-disp);font-size:26px">${esc(b.name)}</div>
    <div class="sub">Удачных дропов ${b.hits} · провальных ${b.flops} · имя держит цену ×${brandRep(S).toFixed(2)}</div>
  </div>`;

  if (drop) {
    const days = Math.max(0, Math.ceil((drop.endsAt - S.t) / 24));
    const through = drop.qty ? drop.sold / drop.qty : 0;
    const profit = drop.revenue - drop.spend;
    const card = `<div class="card">
      <div class="row between"><h3>${esc(drop.name)}</h3><span class="tag good">${days} ${plural(days, 'день', 'дня', 'дней')}</span></div>
      <div class="bar"><i style="width:${Math.round(through * 100)}%"></i></div>
      <div class="kv"><span>Продано</span><span>${drop.sold} из ${drop.qty}</span></div>
      <div class="kv"><span>Цена штуки</span><span>${rub(drop.price)}</span></div>
      <div class="kv"><span>Вложено в тираж</span><span>${rub(drop.spend)}</span></div>
      <div class="kv"><span>Пришло</span><span class="money">${rub(drop.revenue)}</span></div>
      <div class="kv"><span>Пока итого</span><span class="${profit >= 0 ? 'pos' : 'neg'}">${profit >= 0 ? '+' : ''}${rub(profit)}</span></div>
      <div class="muted">${
        through >= 0.8
          ? 'Разбирают. Это удачный дроп.'
          : through >= 0.45
            ? 'Идёт ровно. Основное уходит в первые дни, дальше хвост.'
            : 'Берут вяло. Остаток придётся сливать в аутлет по ' +
              Math.round(SALVAGE_K * 100) +
              '% себестоимости.'
      }</div>
    </div>`;
    return { title: esc(b.name), body: hero + card + dropLog(S) };
  }

  // Конструктор следующего дропа.
  const cat = S.ui.dropCat || 'hoodie';
  const quality = S.ui.dropQuality || 'normal';
  const qty = S.ui.dropQty || 50;
  const price = S.ui.dropPrice || fairPrice(S, cat);
  const list = partners(S);
  const collab = canCollab(S);
  const pt = S.ui.dropPartner && collab.ok ? findPartner(S, S.ui.dropPartner) : null;
  const f = forecast(S, {
    cat,
    qty,
    price,
    quality,
    partnerReach: pt ? pt.reach : 0,
    partnerShare: pt ? pt.share : 0,
  });

  const cats = `<div class="chips">${DROP_CATS.map(
    (c) => `<button class="chip ${c === cat ? 'on' : ''}" data-act="dropCat" data-val="${c}">${esc(CATS[c].n)}</button>`,
  ).join('')}</div>`;

  // Коллаб: партнёр приводит аудиторию, но забирает долю и может пропасть.
  const partnerRow = `<div class="card">
    <div class="row between"><h3>Вместе с кем</h3>
      ${pt ? `<span class="tag good">${esc(pt.name)}</span>` : '<span class="tag">сам</span>'}</div>
    ${
      collab.ok
        ? `<div class="muted">Партнёр приводит свою аудиторию, но забирает долю тиража и выручки. Договор на словах: мелкий может пропасть с деньгами, тот, кто дорожит именем, — почти никогда.</div>
           <div class="stack">
             <button class="lever ${pt ? '' : 'strong'}" data-act="dropPartner" data-val="">
               <b>Делаю сам</b><span>Вся выручка твоя, аудитория только твоя</span></button>
             ${list
               .map((p) => {
                 const r = riskLabel(p);
                 return `<button class="lever ${pt && pt.name === p.name ? 'strong' : ''}" data-act="dropPartner" data-val="${esc(p.name)}">
                   <b>${esc(p.name)}${p.rival ? ' · соперник' : ''}</b>
                   <span>Забирает ${Math.round(p.share * 100)}% · ${esc(reachLabel(p))} · ${esc(r.n)}</span></button>`;
               })
               .join('')}
           </div>`
        : `<div class="muted">${esc(collab.why)}</div>`
    }
  </div>`;

  const quals = `<div class="stack">${QUALITY.map(
    (q) => `<button class="lever ${q.id === quality ? 'strong' : ''}" data-act="dropQuality" data-val="${q.id}">
      <b>${esc(q.n)}</b><span>${esc(q.d)} ${rub(unitCost(S, cat, q.id))} за штуку</span></button>`,
  ).join('')}</div>`;

  const qtyRow = `<div class="card tight">
    <div class="row between"><b>Тираж</b><span class="money">${qty} шт</span></div>
    <div class="row">
      ${[-100, -20, 20, 100]
        .map(
          (d) =>
            `<button class="btn sec grow" data-act="dropQty" data-d="${d}">${d > 0 ? '+' : ''}${d}</button>`,
        )
        .join('')}
    </div>
  </div>`;

  const priceRow = `<div class="card tight">
    <div class="row between"><b>Цена штуки</b><span class="money">${rub(price)}</span></div>
    <div class="muted">Твоё имя сейчас держит ${rub(fairPrice(S, cat))}. Выше — спрос падает резко, ниже — растёт, но не бесконечно.</div>
    <div class="row">
      ${[-1000, -200, 200, 1000]
        .map(
          (d) =>
            `<button class="btn sec grow" data-act="dropPrice" data-d="${d}">${d > 0 ? '+' : ''}${d}</button>`,
        )
        .join('')}
    </div>
  </div>`;

  const since = b.lastDropAt ? Math.floor((S.t - b.lastDropAt) / 24) : null;
  const plan = `<div class="card">
    <h3>Что получится</h3>
    <div class="kv"><span>Производство${pt ? ', твоя доля' : ''}</span><span class="neg">−${rub(f.spend)}</span></div>
    <div class="kv"><span>Аудитория выкупит</span><span>${f.lo}–${f.hi} шт</span></div>
    <div class="kv"><span>Значит продашь</span><span>${Math.min(qty, f.lo)}–${Math.min(qty, f.hi)} из ${qty}</span></div>
    ${
      pt
        ? `<div class="kv"><span>Тебе достанется</span><span>${Math.round(f.mine * 100)}% выручки</span></div>
           <div class="callout ${pt.risk >= 0.12 ? 'danger' : ''}">${esc(pt.name)}: ${esc(riskLabel(pt).n)}. Если пропадёт с деньгами, товар всё равно разойдётся — но мимо тебя.</div>`
        : ''
    }
    ${
      f.worst === f.best
        ? `<div class="kv"><span>Заработаешь</span><span class="${f.best >= 0 ? 'pos' : 'neg'}">${f.best >= 0 ? '+' : ''}${rub(f.best)}</span></div>`
        : `<div class="kv"><span>Если не угадаешь</span><span class="${f.worst >= 0 ? 'pos' : 'neg'}">${f.worst >= 0 ? '+' : ''}${rub(f.worst)}</span></div>
           <div class="kv"><span>Если зайдёт</span><span class="${f.best >= 0 ? 'pos' : 'neg'}">${f.best >= 0 ? '+' : ''}${rub(f.best)}</span></div>`
    }
    ${
      since !== null && since < 21
        ? `<div class="callout warn">Прошлый дроп был ${since} ${plural(since, 'день', 'дня', 'дней')} назад. Аудитория ещё не отдохнула — спрос урезан.</div>`
        : ''
    }
    ${
      qty > f.hi
        ? '<div class="callout danger">Тираж больше, чем выкупят даже при удаче. Остаток уйдёт в аутлет в убыток.</div>'
        : qty < f.lo
          ? '<div class="callout">Тираж меньше спроса: разберут, но ты недозаработаешь.</div>'
          : ''
    }
    <div class="muted">Точной цифры тут не будет никогда. Дроп — это ставка: сколько именно выкупят, выяснится по дням.</div>
  </div>`;

  const go = `<div class="card tight">
    <input class="inp" id="dropName" maxlength="28" placeholder="Название дропа" value="">
    <button class="btn full split" data-act="startDrop" ${S.money >= f.spend ? '' : 'disabled'}>
      <span>Запустить дроп</span><span>${rub(f.spend)}</span></button>
    ${S.money < f.spend ? '<div class="muted" style="text-align:center">Не хватает на производство</div>' : ''}
  </div>`;

  return {
    title: esc(b.name),
    body: hero + cats + quals + qtyRow + priceRow + partnerRow + plan + go + dropLog(S),
  };
}

function dropLog(S) {
  const list = S.brand.drops || [];
  return `<div class="card"><h3>Прошлые дропы</h3>
    ${
      list
        .map(
          (d) => `<div class="kv"><span>${esc(d.name)}<small>${esc(dateLabel(d.at))} · ${d.sold} из ${d.qty} шт по ${rub(d.price)}${d.partner ? ' · с ' + esc(d.partner) + (d.cheated ? ', кинул' : '') : ''}</small></span>
            <span class="${d.profit >= 0 ? 'pos' : 'neg'}">${d.profit >= 0 ? '+' : ''}${rub(d.profit)}</span></div>`,
        )
        .join('') || '<div class="muted">Дропов пока не было</div>'
    }</div>`;
}
