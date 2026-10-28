// Лоты в личке: мешок вслепую, партия реплик, гардероб и архив.
// Лотерея с разной степенью информированности — от «вообще не знаешь, что внутри»
// до «список перед глазами, но паль может быть и там».

import { clamp, priceRound } from '../util.js';
import { MODELS, BRANDED } from '../data/models.js';
import { LOT_PEOPLE } from '../data/content.js';
import { makeItem, hideDefects, itemName, sizeLabel, shownCondition } from '../items.js';
import { valueOrig, valueFake, netWorth } from '../economy.js';
import { secondItem } from './second.js';

export const LOT_TYPES = {
  bag: {
    n: 'мешок вещей',
    title: 'Мешок вслепую',
    minLvl: 1,
    about: 'Что внутри — узнаешь только после покупки.',
  },
  batch: {
    n: 'партия реплик',
    title: 'Партия реплик',
    minLvl: 2,
    about: 'Одна модель в нескольких размерах. Качество копии заранее не проверишь.',
  },
  wardrobe: {
    n: 'гардероб',
    title: 'Гардероб целиком',
    minLvl: 3,
    about: 'Список известен. Подлинность — нет.',
  },
  archive: {
    n: 'архив',
    title: 'Архивные вещи',
    minLvl: 6,
    about: 'Старые вещи у коллекционера. Дорого, зато почти всегда оригинал.',
  },
};

export function pickLotType(S, rng) {
  const keys = Object.keys(LOT_TYPES).filter((k) => S.prog.lvl >= LOT_TYPES[k].minLvl);
  return rng.weighted(keys, (k) =>
    ({ bag: 1, batch: 0.7, wardrobe: 0.8, archive: 0.45 })[k],
  );
}

export function makeLot(S, rng, type) {
  const budget = Math.max(6000, netWorth(S) * 0.6);
  const items = [];
  let price = 0;
  let text = '';
  let listVisible = false;

  if (type === 'bag') {
    const n = rng.int(6, 11);
    const prices = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const slot = secondItem(S, rng, rng.chance(0.18));
      prices.push(slot.price);
      sum += slot.price;
      items.push(slot.item);
    }
    const k = rng.range(0.55, 0.95);
    while (items.length > 4 && sum * k > budget) {
      items.pop();
      sum -= prices.pop();
    }
    price = priceRound(sum * k);
    text = `Привет! Разбираю кладовку — мешок шмоток, штук ${items.length}. Что там, сам толком не знаю, вроде есть фирма. Отдам всё за {price}.`;
  } else if (type === 'batch') {
    let model;
    let quality;
    let unit;
    for (let i = 0; i < 14; i++) {
      model = rng.weighted(BRANDED, (m) => 0.1 + S.market.h[m.i] * S.market.h[m.i]);
      quality = rng.range(0.5, 0.92);
      const probe = makeItem(rng, model.i, { cond: 0, real: false, q: quality });
      unit = priceRound(valueFake(S, probe) * rng.range(0.3, 0.5));
      if (unit * 5 <= budget) break;
    }
    const n = clamp(Math.floor(budget / Math.max(1, unit)), 5, 12);
    for (let i = 0; i < n; i++) {
      items.push(
        makeItem(rng, model.i, {
          cond: 0,
          real: false,
          q: clamp(quality + rng.range(-0.06, 0.06), 0.05, 0.97),
          verdict: 'fake',
          hasBox: true,
        }),
      );
    }
    price = unit * n;
    text = `Есть ${n} шт ${model.b} ${model.n} — реплика, качество обещают хорошее. По ${priceRound(unit)} ₽ за штуку, только всё сразу: {price}. Размеры вразброс.`;
  } else if (type === 'wardrobe') {
    const n = rng.int(4, 7);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const m = rng.weighted(
        BRANDED.filter((x) => x.tier === 'street' || x.tier === 'prem'),
        (x) => 0.3 + S.market.h[x.i],
      );
      const fake = rng.chance(0.2);
      const it = makeItem(rng, m.i, {
        cond: rng.int(0, 2),
        real: !fake,
        q: fake ? rng.range(0.55, 0.92) : 0,
      });
      hideDefects(rng, it, 0.3);
      items.push(it);
      sum += valueOrig(S, { ...it, cond: it.shownCond });
    }
    while (items.length > 2 && sum * 0.5 > budget) {
      const x = items.pop();
      sum -= valueOrig(S, { ...x, cond: x.shownCond });
    }
    price = priceRound(sum * rng.range(0.42, 0.62));
    listVisible = true;
    text = `Уезжаю, распродаю гардероб одним лотом:\n{list}\nВсё за {price}, по одной не продаю. Забрать надо сегодня.`;
  } else {
    const n = rng.int(2, 4);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const m = rng.weighted(
        BRANDED.filter((x) => x.tier === 'prem' || x.tier === 'lux'),
        (x) => 0.3 + S.market.h[x.i],
      );
      const fake = rng.chance(0.06);
      const it = makeItem(rng, m.i, {
        cond: rng.int(1, 2),
        real: !fake,
        q: fake ? rng.range(0.7, 0.95) : 0,
      });
      items.push(it);
      sum += valueOrig(S, it);
    }
    price = priceRound(sum * rng.range(0.6, 0.78));
    listVisible = true;
    text = `Чищу архив. Вещи старые, но живые:\n{list}\nОтдам за {price}. Торг — только по делу, я цену знаю.`;
  }

  return {
    type,
    items,
    price,
    text,
    listVisible,
    haggled: false,
    expiresAt: S.t + rng.int(5, 11),
    person: rng.pick(LOT_PEOPLE[type]),
  };
}

export function lotListText(lot) {
  return lot.items
    .map((it) => `• ${itemName(it)}, ${sizeLabel(it)}, ${shownCondition(it).short}`)
    .join('\n');
}

export function lotMessage(lot) {
  return lot.text
    .replace('{price}', priceRound(lot.price).toLocaleString('ru-RU') + ' ₽')
    .replace('{list}', lot.listVisible ? lotListText(lot) : '');
}
