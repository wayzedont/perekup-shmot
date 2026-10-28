// Отрисовка вещей.
//
// Силуэты параметрические: у кроссовок считаются высота подошвы, высота задника
// и форма носка, у одежды — рукав, капюшон, молния, длина. Поэтому Форсы,
// Самбы и Данки действительно выглядят по-разному, а не одной кляксой с буквой.
// Поверх силуэта ложится логотип бренда — свуш, три полоски, патч, монограмма.
//
// Каждая форма сама возвращает свою рамку, чтобы вещь заполняла карточку,
// а не висела маленькой кляксой посередине.

import { colorHex, shade, isLight } from '../core/data/palette.js';
import { MODELS } from '../core/data/models.js';

let uid = 0;
const nextId = () => 'g' + ++uid;

/* ======================= ПОМОЩНИКИ ======================= */

function sheen(id, hex, angle) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="${angle === 'x' ? 1 : 0.3}" y2="${angle === 'x' ? 0.2 : 1}">
    <stop offset="0" stop-color="${shade(hex, 0.2)}"/>
    <stop offset="0.52" stop-color="${hex}"/>
    <stop offset="1" stop-color="${shade(hex, -0.18)}"/>
  </linearGradient>`;
}

const p = (d, fill, extra) => `<path d="${d}" fill="${fill}"${extra || ''}/>`;
const stroke = (d, color, width, extra) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra || ''}/>`;

/** Контур, который виден и на тёмном, и на светлом. */
const edge = (hex) => (isLight(hex) ? 'rgba(30,28,34,.26)' : 'rgba(255,255,255,.2)');

/* ======================= КРОССОВКИ ======================= */

const SHOE_FORMS = {
  //  sole/mid — подошва, vamp — высота верха у носка, collar — высота задника,
  //  toeDrop — насколько задран нос, bulk — ширина силуэта
  lowtop: { sole: 11, mid: 6, vamp: 30, collar: 50, tread: 'flat', toeCap: true, overlay: true },
  hightop: { sole: 11, mid: 6, vamp: 32, collar: 88, tread: 'flat', toeCap: true, overlay: true, laces: 7 },
  runner: { sole: 14, mid: 13, vamp: 27, collar: 48, tread: 'wave', mesh: true, overlay: true },
  chunky: { sole: 22, mid: 20, vamp: 34, collar: 56, tread: 'block', toeCap: true, overlay: true, bulk: 1.08 },
  trail: { sole: 16, mid: 12, vamp: 29, collar: 50, tread: 'lug', mesh: true, cords: true },
  boot: { sole: 15, mid: 10, vamp: 34, collar: 80, tread: 'lug', hooks: true, laces: 6, welt: true },
  skate: { sole: 12, mid: 5, vamp: 30, collar: 48, tread: 'vulc', gum: true, toeCap: true, overlay: true },
  mule: { sole: 10, mid: 5, vamp: 38, collar: 0, tread: 'flat', split: true },
};

function sneaker(form, base, accent, detail, worn) {
  const F = SHOE_FORMS[form] || SHOE_FORMS.lowtop;
  const bulk = F.bulk || 1;
  const ground = 136;
  const toe = 24;
  const heel = 24 + 148 * bulk;
  const len = heel - toe;

  const soleTop = ground - F.sole;
  const midTop = soleTop - F.mid;
  const vampTop = midTop - F.vamp; // верх у носка
  const throatY = vampTop - 6; // линия шнуровки
  const collarTop = F.collar ? midTop - F.collar : vampTop;

  // Опорные точки по длине
  const xToe = toe;
  const xToeCap = toe + len * 0.22;
  const xThroat = toe + len * 0.46;
  const xCollarFront = toe + len * 0.63;
  const xCollarBack = toe + len * 0.86;
  const xHeel = heel;

  const gBase = nextId();
  const gAcc = nextId();
  const gSole = nextId();
  const soleColor = F.gum ? colorHex('gum') : shade(detail, isLight(detail) ? -0.1 : 0.62);
  let out = `<defs>${sheen(gBase, base)}${sheen(gAcc, accent)}${sheen(gSole, soleColor)}</defs>`;
  out += `<ellipse cx="${(toe + heel) / 2}" cy="${ground + 5}" rx="${len / 2 + 6}" ry="5" fill="rgba(0,0,0,.15)"/>`;

  // Подошва
  out += p(
    `M${xToe - 6} ${soleTop}
     Q${xToe - 10} ${ground} ${xToe + 6} ${ground}
     L${xHeel - 8} ${ground}
     Q${xHeel + 4} ${ground} ${xHeel + 2} ${soleTop - 2} Z`,
    `url(#${gSole})`,
    ` stroke="rgba(0,0,0,.16)" stroke-width="1"`,
  );
  if (F.mid) {
    out += p(
      `M${xToe - 5} ${midTop + 2}
       Q${xToe - 9} ${soleTop + 2} ${xToe + 4} ${soleTop + 1}
       L${xHeel - 2} ${soleTop}
       Q${xHeel + 2} ${soleTop} ${xHeel + 1} ${midTop - 3} Z`,
      shade(detail, 0.46),
      ` stroke="rgba(0,0,0,.1)" stroke-width="1"`,
    );
  }
  if (F.welt) {
    out += stroke(`M${xToe - 4} ${midTop + 3} L${xHeel} ${midTop - 1}`, 'rgba(0,0,0,.22)', 1.4);
  }

  // Верх: нос — подъём — воротник — задник
  const upper = F.split
    ? `M${xToe - 3} ${midTop}
       C${xToe - 8} ${vampTop + 10} ${xToe + 10} ${vampTop} ${xToeCap} ${vampTop - 2}
       L${xCollarFront} ${vampTop - 8}
       C${xCollarBack} ${vampTop - 10} ${xHeel} ${vampTop + 4} ${xHeel} ${midTop} Z`
    : `M${xToe - 4} ${midTop + 1}
       C${xToe - 9} ${vampTop + 12} ${xToe + 8} ${vampTop - 1} ${xToeCap} ${vampTop - 3}
       L${xThroat} ${throatY - 4}
       C${xCollarFront - 6} ${collarTop + 14} ${xCollarFront + 4} ${collarTop + 2} ${xCollarFront + 16} ${collarTop}
       L${xCollarBack} ${collarTop + 1}
       C${xHeel - 2} ${collarTop + 6} ${xHeel + 2} ${collarTop + 22} ${xHeel + 1} ${midTop - 1} Z`;
  out += p(upper, `url(#${gBase})`, ` stroke="${edge(base)}" stroke-width="1.3"`);

  if (!F.split && F.collar) {
    // Вырез — тонкая тёмная полоса под кромкой воротника, а не отдельная шишка.
    out += stroke(
      `M${xCollarFront + 17} ${collarTop + 10}
       C${xCollarFront + 32} ${collarTop + 17} ${xCollarBack - 8} ${collarTop + 17} ${xCollarBack + 1} ${collarTop + 9}`,
      shade(base, -0.5),
      5,
      ' opacity=".5"',
    );
    // Кромка воротника
    out += stroke(
      `M${xCollarFront + 14} ${collarTop + 2} C${xCollarFront + 28} ${collarTop - 4} ${xCollarBack - 4} ${collarTop - 4} ${xCollarBack + 3} ${collarTop + 5}`,
      shade(accent, 0.28),
      3,
    );
  }

  // Задник: боковая панель у пятки
  if (F.collar) {
    out += p(
      `M${xCollarBack - 2} ${collarTop + 10}
       C${xHeel - 2} ${collarTop + 14} ${xHeel + 2} ${collarTop + 26} ${xHeel} ${midTop - 2}
       L${xCollarBack - 14} ${midTop - 2} Z`,
      `url(#${gAcc})`,
      ' opacity=".85"',
    );
  }

  // Носок
  if (F.toeCap) {
    out += p(
      `M${xToe - 4} ${midTop + 1}
       C${xToe - 9} ${vampTop + 12} ${xToe + 8} ${vampTop - 1} ${xToeCap} ${vampTop - 3}
       L${xToeCap + 10} ${vampTop + 6}
       C${xToeCap - 6} ${midTop - 6} ${xToe + 10} ${midTop} ${xToe + 4} ${midTop + 1} Z`,
      `url(#${gAcc})`,
      ' opacity=".92"',
    );
  }
  if (F.mesh) {
    let mesh = '';
    for (let i = 0; i < 4; i++) {
      const y = vampTop + 4 + i * 7;
      mesh += `M${xToeCap - 6} ${y} L${xThroat + 14} ${y - 4} `;
    }
    out += stroke(mesh, shade(base, -0.3), 1.1, ' opacity=".4"');
  }

  // Язычок и шнуровка
  if (!F.split) {
    const steps = F.laces || 4;
    const lx0 = toe + len * 0.44;
    const lx1 = toe + len * 0.72;
    const ly0 = vampTop + 5;
    const ly1 = collarTop + 14;
    // Язычок: узкая полоса между шнуровкой и воротником
    out += p(
      `M${lx1 - 2} ${ly1 - 1} C${lx1 + 4} ${ly1 - 7} ${lx1 + 11} ${ly1 - 5} ${lx1 + 12} ${ly1 + 2}
       L${lx1 + 7} ${ly1 + 13} L${lx1 + 1} ${ly1 + 12} Z`,
      shade(base, -0.16),
      ` stroke="${edge(base)}" stroke-width="0.9" opacity=".92"`,
    );
    const laceColor = isLight(base) ? 'rgba(54,52,60,.7)' : 'rgba(244,243,238,.8)';
    let laces = '';
    let eyelets = '';
    for (let i = 0; i < steps; i++) {
      const k = steps === 1 ? 0 : i / (steps - 1);
      const x = lx0 + (lx1 - lx0) * k;
      const y = ly0 + (ly1 - ly0) * k;
      laces += `M${x - 4} ${y + 4} L${x + 4} ${y - 3} M${x - 4} ${y - 3} L${x + 4} ${y + 4} `;
      eyelets += `<circle cx="${x - 4}" cy="${y + 5}" r="1.3" fill="rgba(0,0,0,.3)"/>`;
      eyelets += `<circle cx="${x + 4}" cy="${y - 4}" r="1.3" fill="rgba(0,0,0,.22)"/>`;
      if (F.hooks && i >= steps - 2) {
        out += `<circle cx="${x + 5}" cy="${y - 5}" r="2.2" fill="${shade(detail, 0.25)}"/>`;
      }
    }
    out += stroke(laces, laceColor, 1.5);
    out += eyelets;
  } else {
    out += stroke(`M${xToeCap + 2} ${vampTop - 2} L${xToeCap - 2} ${midTop - 2}`, shade(base, -0.5), 2.2);
  }

  // Протектор
  if (F.tread === 'lug') {
    let t = '';
    for (let x = xToe; x < xHeel; x += 12) t += `M${x} ${ground - 1} L${x} ${soleTop + 2} `;
    out += stroke(t, 'rgba(0,0,0,.26)', 2.4);
  } else if (F.tread === 'block') {
    let t = '';
    for (let x = xToe + 4; x < xHeel; x += 18) t += `M${x} ${ground - 2} L${x} ${soleTop + 3} `;
    out += stroke(t, 'rgba(0,0,0,.18)', 3.4);
  } else if (F.tread === 'wave') {
    out += stroke(`M${xToe - 4} ${soleTop + 6} Q${(xToe + xHeel) / 2} ${soleTop} ${xHeel} ${soleTop + 5}`, 'rgba(0,0,0,.16)', 2);
  } else if (F.tread === 'vulc') {
    out += stroke(`M${xToe - 6} ${soleTop + 5} L${xHeel} ${soleTop + 5}`, 'rgba(0,0,0,.2)', 1.8);
  }

  if (F.cords) {
    out += stroke(`M${xToeCap + 6} ${vampTop} L${xCollarFront + 10} ${collarTop + 12}`, shade(detail, 0.22), 2.6);
  }
  if (worn) {
    out += `<ellipse cx="${xToeCap - 4}" cy="${midTop - 8}" rx="13" ry="6" fill="rgba(40,30,20,.15)"/>`;
    out += `<ellipse cx="${xHeel - 22}" cy="${soleTop + 3}" rx="15" ry="3.4" fill="rgba(140,115,70,.28)"/>`;
  }

  const top = Math.min(collarTop, vampTop) - 14;
  return {
    svg: out,
    anchor: { x: xThroat - 4, y: (vampTop + midTop) / 2 + 2, scale: 0.92 },
    box: { x: xToe - 16, y: top, w: xHeel + 14 - (xToe - 16), h: ground + 12 - top },
  };
}

/* ======================= ОДЕЖДА ======================= */

const GARMENT_FORMS = {
  tee: { sleeve: 'short', collar: 'crew', len: 96 },
  longsleeve: { sleeve: 'long', collar: 'crew', len: 98 },
  polo: { sleeve: 'short', collar: 'polo', len: 96 },
  hoodie: { sleeve: 'long', collar: 'hood', len: 104, pocket: true },
  crew: { sleeve: 'long', collar: 'crew', len: 100, rib: true },
  zip: { sleeve: 'long', collar: 'hood', len: 104, zip: true, pocket: true },
  knit: { sleeve: 'long', collar: 'crew', len: 102, rib: true, texture: 'knit' },
  coach: { sleeve: 'long', collar: 'stand', len: 100, zip: true, snaps: true },
  workwear: { sleeve: 'long', collar: 'stand', len: 108, zip: true, boxy: true, chestPockets: true },
  softshell: { sleeve: 'long', collar: 'hood', len: 108, zip: true, tech: true },
  windbreaker: { sleeve: 'long', collar: 'hood', len: 104, zip: true },
  varsity: { sleeve: 'long', collar: 'rib', len: 100, zip: true, contrastSleeves: true, rib: true },
  puffer: { sleeve: 'long', collar: 'stand', len: 106, zip: true, baffles: 5, boxy: true },
  parka: { sleeve: 'long', collar: 'hood', len: 134, zip: true, baffles: 7, fur: true, boxy: true },
  vest: { sleeve: 'none', collar: 'stand', len: 94, zip: true, baffles: 4, boxy: true },
};

function garment(form, base, accent, detail, worn) {
  const F = GARMENT_FORMS[form] || GARMENT_FORMS.tee;
  const cx = 100;
  const neckY = 34;
  const shoulderY = neckY + 12;
  const hemY = shoulderY + F.len;
  const halfShoulder = F.boxy ? 56 : 50;
  const halfHem = F.boxy ? 55 : F.rib ? 44 : 47;
  const sleeveLen = F.sleeve === 'short' ? 34 : 74;
  const sleeveW = F.sleeve === 'short' ? 24 : 20;

  const gBase = nextId();
  const gAcc = nextId();
  let out = `<defs>${sheen(gBase, base)}${sheen(gAcc, accent)}</defs>`;
  out += `<ellipse cx="${cx}" cy="${hemY + 8}" rx="${halfHem + 8}" ry="5" fill="rgba(0,0,0,.13)"/>`;

  // Рукава: уходят вниз и наружу от плеча, поэтому их хорошо видно из-за корпуса
  if (F.sleeve !== 'none') {
    const sleeveColor = F.contrastSleeves ? `url(#${gAcc})` : `url(#${gBase})`;
    const sleeveEdge = edge(F.contrastSleeves ? accent : base);
    const out1 = F.sleeve === 'short' ? 26 : 34;
    for (const dir of [-1, 1]) {
      const sx = cx + dir * halfShoulder;
      const ex = sx + dir * out1;
      const ey = shoulderY + sleeveLen;
      out += p(
        `M${sx - dir * 10} ${shoulderY - 4}
         C${sx + dir * 12} ${shoulderY - 2} ${ex} ${shoulderY + sleeveLen * 0.4} ${ex} ${ey}
         L${ex - dir * sleeveW} ${ey + 6}
         C${sx + dir * 2} ${shoulderY + sleeveLen * 0.55} ${sx - dir * 14} ${shoulderY + 22} ${sx - dir * 16} ${shoulderY + 10} Z`,
        sleeveColor,
        ` stroke="${sleeveEdge}" stroke-width="1.2"`,
      );
      if (F.sleeve === 'long') {
        out += p(
          `M${ex} ${ey - 6}
           L${ex - dir * sleeveW} ${ey}
           L${ex - dir * sleeveW} ${ey + 7}
           L${ex + dir * 1} ${ey + 2} Z`,
          shade(F.contrastSleeves ? accent : base, -0.26),
        );
      } else {
        out += stroke(`M${ex} ${ey - 4} L${ex - dir * sleeveW} ${ey + 2}`, shade(base, -0.24), 2);
      }
    }
  }

  // Корпус
  out += p(
    `M${cx - halfShoulder} ${shoulderY - 2}
     Q${cx - halfShoulder - 3} ${shoulderY + 30} ${cx - halfHem} ${hemY}
     L${cx + halfHem} ${hemY}
     Q${cx + halfShoulder + 3} ${shoulderY + 30} ${cx + halfShoulder} ${shoulderY - 2}
     Q${cx} ${shoulderY + 12} ${cx - halfShoulder} ${shoulderY - 2} Z`,
    `url(#${gBase})`,
    ` stroke="${edge(base)}" stroke-width="1.2"`,
  );

  if (F.baffles) {
    let b = '';
    for (let i = 1; i <= F.baffles; i++) {
      const y = shoulderY + ((hemY - shoulderY) * i) / (F.baffles + 1);
      b += `M${cx - halfShoulder + 3} ${y} Q${cx} ${y + 6} ${cx + halfShoulder - 3} ${y} `;
    }
    out += stroke(b, shade(base, -0.28), 2, ' opacity=".75"');
  }
  if (F.texture === 'knit') {
    let k = '';
    for (let y = shoulderY + 12; y < hemY - 6; y += 9) k += `M${cx - halfShoulder + 5} ${y} L${cx + halfShoulder - 5} ${y} `;
    out += stroke(k, shade(base, -0.22), 1, ' opacity=".4"');
  }

  // Воротник
  if (F.collar === 'hood') {
    // Капюшон лежит за плечами: широкий и плоский, а не шар — иначе читается как голова.
    out += p(
      `M${cx - 46} ${shoulderY + 4}
       C${cx - 48} ${neckY - 14} ${cx - 26} ${neckY - 20} ${cx} ${neckY - 20}
       C${cx + 26} ${neckY - 20} ${cx + 48} ${neckY - 14} ${cx + 46} ${shoulderY + 4}
       C${cx + 24} ${shoulderY + 16} ${cx - 24} ${shoulderY + 16} ${cx - 46} ${shoulderY + 4} Z`,
      shade(base, -0.14),
      ` stroke="${edge(base)}" stroke-width="1.2"`,
    );
    // Внутренняя часть капюшона
    out += p(
      `M${cx - 25} ${shoulderY + 6}
       C${cx - 24} ${neckY - 6} ${cx + 24} ${neckY - 6} ${cx + 25} ${shoulderY + 6}
       C${cx + 14} ${shoulderY + 13} ${cx - 14} ${shoulderY + 13} ${cx - 25} ${shoulderY + 6} Z`,
      shade(base, -0.42),
      ' opacity=".7"',
    );
    if (F.fur) {
      out += `<ellipse cx="${cx}" cy="${neckY - 12}" rx="50" ry="12" fill="${shade(detail, 0.32)}" opacity=".92"/>`;
    }
    out += stroke(
      `M${cx - 10} ${shoulderY + 10} L${cx - 13} ${shoulderY + 34} M${cx + 10} ${shoulderY + 10} L${cx + 13} ${shoulderY + 34}`,
      shade(base, 0.55),
      2.6,
    );
    out += `<circle cx="${cx - 13}" cy="${shoulderY + 36}" r="2.4" fill="${shade(base, 0.55)}"/>`;
    out += `<circle cx="${cx + 13}" cy="${shoulderY + 36}" r="2.4" fill="${shade(base, 0.55)}"/>`;
  } else if (F.collar === 'polo') {
    out += p(
      `M${cx - 22} ${shoulderY - 1} L${cx} ${shoulderY + 20} L${cx + 22} ${shoulderY - 1}
       L${cx + 15} ${shoulderY - 8} L${cx} ${shoulderY + 3} L${cx - 15} ${shoulderY - 8} Z`,
      `url(#${gAcc})`,
      ` stroke="${edge(accent)}" stroke-width="1"`,
    );
    out += stroke(`M${cx} ${shoulderY + 18} L${cx} ${shoulderY + 40}`, shade(base, -0.32), 1.6);
    out += `<circle cx="${cx}" cy="${shoulderY + 26}" r="2" fill="${shade(base, 0.55)}"/>`;
  } else if (F.collar === 'stand') {
    out += p(
      `M${cx - 27} ${shoulderY - 1} L${cx + 27} ${shoulderY - 1} L${cx + 24} ${shoulderY - 13} L${cx - 24} ${shoulderY - 13} Z`,
      `url(#${gAcc})`,
      ` stroke="${edge(accent)}" stroke-width="1"`,
    );
  } else if (F.collar === 'rib') {
    out += p(
      `M${cx - 24} ${shoulderY - 1} L${cx + 24} ${shoulderY - 1} L${cx + 21} ${shoulderY - 11} L${cx - 21} ${shoulderY - 11} Z`,
      shade(accent, -0.08),
    );
    let ribs = '';
    for (let x = cx - 16; x <= cx + 16; x += 8) ribs += `M${x} ${shoulderY - 11} L${x} ${shoulderY - 1} `;
    out += stroke(ribs, shade(accent, -0.4), 1.1);
  } else {
    out += stroke(`M${cx - 21} ${shoulderY + 1} Q${cx} ${shoulderY + 17} ${cx + 21} ${shoulderY + 1}`, shade(base, -0.32), 4);
  }

  if (F.zip) {
    const topY = F.collar === 'hood' ? shoulderY + 14 : shoulderY - 10;
    out += stroke(`M${cx} ${topY} L${cx} ${hemY - 3}`, shade(detail, isLight(base) ? -0.4 : 0.55), 2.4);
    out += `<rect x="${cx - 3}" y="${hemY - 28}" width="6" height="10" rx="2.5" fill="${shade(detail, 0.4)}"/>`;
  }
  if (F.snaps) {
    for (let y = shoulderY + 14; y < hemY - 10; y += 20) {
      out += `<circle cx="${cx + 7}" cy="${y}" r="2.2" fill="${shade(base, 0.55)}"/>`;
    }
  }
  if (F.chestPockets) {
    for (const dir of [-1, 1]) {
      out += p(
        `M${cx + dir * 14} ${shoulderY + 22} L${cx + dir * 40} ${shoulderY + 22} L${cx + dir * 40} ${shoulderY + 48} L${cx + dir * 14} ${shoulderY + 48} Z`,
        shade(base, -0.1),
        ` stroke="${edge(base)}" stroke-width="1"`,
      );
    }
  }
  if (F.pocket) {
    out += p(
      `M${cx - 34} ${hemY - 36} L${cx + 34} ${hemY - 36} L${cx + 29} ${hemY - 10} L${cx - 29} ${hemY - 10} Z`,
      shade(base, -0.13),
      ' opacity=".9"',
    );
  }
  if (F.rib) {
    out += p(`M${cx - halfHem} ${hemY - 10} L${cx + halfHem} ${hemY - 10} L${cx + halfHem} ${hemY} L${cx - halfHem} ${hemY} Z`, shade(base, -0.22));
  }
  if (F.tech) {
    out += stroke(`M${cx - 26} ${shoulderY + 30} L${cx - 8} ${shoulderY + 30}`, shade(base, 0.4), 1.8, ' opacity=".7"');
  }
  if (worn) {
    out += `<circle cx="${cx - 24}" cy="${hemY - 44}" r="5" fill="rgba(60,50,30,.16)"/>`;
    out += `<circle cx="${cx + 28}" cy="${shoulderY + 40}" r="3" fill="rgba(60,50,30,.14)"/>`;
  }

  const reach = F.sleeve === 'none' ? 8 : (F.sleeve === 'short' ? 30 : 38);
  const left = cx - halfShoulder - reach;
  const right = cx + halfShoulder + reach;
  const top = (F.collar === 'hood' ? neckY - 26 : shoulderY - 18) - 4;
  return {
    svg: out,
    anchor: { x: cx, y: shoulderY + (F.collar === 'hood' ? 42 : 34), scale: 1 },
    box: { x: left, y: top, w: right - left, h: hemY + 14 - top },
  };
}

/* ======================= ШТАНЫ ======================= */

const PANTS_FORMS = {
  jeans: { hip: 34, ankle: 17, pockets: true },
  cargo: { hip: 38, ankle: 25, cargoPockets: true },
  sweat: { hip: 36, ankle: 13, cuff: true, drawstring: true },
  track: { hip: 36, ankle: 14, cuff: true, drawstring: true, stripe: true },
};

function pants(form, base, accent, detail, worn) {
  const F = PANTS_FORMS[form] || PANTS_FORMS.jeans;
  const cx = 100;
  const waistY = 30;
  const hemY = 150;
  const gBase = nextId();
  let out = `<defs>${sheen(gBase, base)}</defs>`;
  out += `<ellipse cx="${cx}" cy="${hemY + 7}" rx="${F.hip + 18}" ry="5" fill="rgba(0,0,0,.13)"/>`;

  for (const dir of [-1, 1]) {
    const hipX = cx + dir * F.hip;
    const inner = cx + dir * 4;
    const outer = cx + dir * (4 + F.ankle);
    out += p(
      `M${cx + dir * 3} ${waistY}
       L${hipX} ${waistY}
       Q${hipX + dir * 5} ${waistY + 54} ${outer} ${hemY}
       L${inner} ${hemY}
       Q${cx + dir * 7} ${waistY + 70} ${cx + dir * 2} ${waistY + 48} Z`,
      `url(#${gBase})`,
      ` stroke="${edge(base)}" stroke-width="1.2"`,
    );
    if (F.cuff) {
      out += p(`M${inner} ${hemY - 11} L${outer} ${hemY - 11} L${outer} ${hemY} L${inner} ${hemY} Z`, shade(base, -0.26));
    }
    if (F.stripe) {
      out += stroke(
        `M${hipX - dir * 3} ${waistY + 14} Q${hipX + dir * 2} ${waistY + 66} ${outer - dir * 4} ${hemY - 12}`,
        shade(accent, 0),
        5,
      );
    }
    if (F.cargoPockets) {
      out += p(
        `M${hipX - dir * 3} ${waistY + 58} L${hipX + dir * 9} ${waistY + 61} L${hipX + dir * 10} ${waistY + 88} L${hipX - dir * 3} ${waistY + 85} Z`,
        shade(base, -0.13),
        ` stroke="${edge(base)}" stroke-width="1"`,
      );
    }
  }

  out += p(
    `M${cx - F.hip - 1} ${waistY} L${cx + F.hip + 1} ${waistY} L${cx + F.hip} ${waistY - 13} L${cx - F.hip} ${waistY - 13} Z`,
    shade(base, -0.22),
    ` stroke="${edge(base)}" stroke-width="1"`,
  );
  if (F.drawstring) {
    out += stroke(`M${cx - 9} ${waistY - 6} L${cx - 12} ${waistY + 14} M${cx + 9} ${waistY - 6} L${cx + 12} ${waistY + 14}`, shade(base, 0.55), 2.4);
  }
  if (F.pockets) {
    out += stroke(`M${cx - F.hip + 6} ${waistY + 5} Q${cx - 16} ${waistY + 20} ${cx - 10} ${waistY + 3}`, shade(base, -0.4), 1.4);
    out += stroke(`M${cx + F.hip - 6} ${waistY + 5} Q${cx + 16} ${waistY + 20} ${cx + 10} ${waistY + 3}`, shade(base, -0.4), 1.4);
  }
  if (worn) out += `<ellipse cx="${cx - 22}" cy="${waistY + 44}" rx="11" ry="7" fill="rgba(255,255,255,.14)"/>`;

  return {
    svg: out,
    anchor: { x: cx + 26, y: waistY - 28, scale: 0.8 },
    box: { x: cx - F.hip - 24, y: waistY - 42, w: 2 * (F.hip + 24), h: hemY + 14 - (waistY - 42) },
  };
}

/* ======================= ГОЛОВНЫЕ УБОРЫ ======================= */

function headwear(form, base, accent, detail, worn) {
  const cx = 100;
  const gBase = nextId();
  let out = `<defs>${sheen(gBase, base)}</defs>`;
  let box;

  if (form === 'beanie') {
    out += `<ellipse cx="${cx}" cy="128" rx="54" ry="5" fill="rgba(0,0,0,.13)"/>`;
    out += p(`M${cx - 48} 104 Q${cx - 52} 28 ${cx} 26 Q${cx + 52} 28 ${cx + 48} 104 Z`, `url(#${gBase})`, ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += p(`M${cx - 51} 98 L${cx + 51} 98 L${cx + 49} 124 L${cx - 49} 124 Z`, shade(base, -0.18), ` stroke="${edge(base)}" stroke-width="1"`);
    let ribs = '';
    for (let x = cx - 42; x <= cx + 42; x += 12) ribs += `M${x} 98 L${x} 124 `;
    out += stroke(ribs, shade(base, -0.34), 1.3, ' opacity=".6"');
    box = { x: cx - 60, y: 18, w: 120, h: 118 };
  } else if (form === 'bucket') {
    out += `<ellipse cx="${cx}" cy="124" rx="68" ry="5" fill="rgba(0,0,0,.13)"/>`;
    out += p(`M${cx - 36} 86 Q${cx - 38} 32 ${cx} 30 Q${cx + 38} 32 ${cx + 36} 86 Z`, `url(#${gBase})`, ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += p(`M${cx - 66} 88 Q${cx} 70 ${cx + 66} 88 Q${cx} 116 ${cx - 66} 88 Z`, shade(base, -0.15), ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += stroke(`M${cx - 60} 90 Q${cx} 106 ${cx + 60} 90`, shade(base, -0.34), 1.4);
    box = { x: cx - 76, y: 22, w: 152, h: 110 };
  } else {
    out += `<ellipse cx="${cx + 14}" cy="118" rx="58" ry="5" fill="rgba(0,0,0,.13)"/>`;
    out += p(`M${cx - 40} 92 Q${cx - 44} 30 ${cx} 28 Q${cx + 44} 30 ${cx + 40} 92 Z`, `url(#${gBase})`, ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += p(`M${cx + 34} 86 Q${cx + 86} 86 ${cx + 82} 106 Q${cx + 40} 104 ${cx + 34} 96 Z`, shade(base, -0.22), ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += stroke(`M${cx} 28 L${cx} 92`, shade(base, -0.3), 1.4, ' opacity=".55"');
    out += `<circle cx="${cx}" cy="30" r="4" fill="${shade(base, 0.35)}"/>`;
    box = { x: cx - 54, y: 20, w: 150, h: 106 };
  }
  if (worn) out += `<circle cx="${cx - 18}" cy="76" r="5" fill="rgba(60,50,30,.16)"/>`;
  return { svg: out, anchor: { x: cx - 2, y: 66, scale: 0.85 }, box };
}

/* ======================= СУМКИ ======================= */

function bag(form, base, accent, detail, worn) {
  const cx = 100;
  const gBase = nextId();
  const gAcc = nextId();
  let out = `<defs>${sheen(gBase, base)}${sheen(gAcc, accent)}</defs>`;
  let box;
  let anchorY = 96;

  if (form === 'belt') {
    out += `<ellipse cx="${cx}" cy="124" rx="52" ry="5" fill="rgba(0,0,0,.13)"/>`;
    out += stroke(`M${cx - 74} 48 Q${cx} 32 ${cx + 74} 48`, shade(base, -0.22), 7);
    out += p(
      `M${cx - 48} 62 Q${cx - 50} 54 ${cx - 40} 54 L${cx + 40} 54 Q${cx + 50} 54 ${cx + 48} 62
       L${cx + 45} 112 Q${cx + 45} 120 ${cx + 35} 120 L${cx - 35} 120 Q${cx - 45} 120 ${cx - 45} 112 Z`,
      `url(#${gBase})`,
      ` stroke="${edge(base)}" stroke-width="1.2"`,
    );
    out += `<rect x="${cx - 11}" y="52" width="22" height="11" rx="3" fill="${shade(detail, 0.28)}"/>`;
    box = { x: cx - 84, y: 24, w: 168, h: 108 };
    anchorY = 90;
  } else if (form === 'tote') {
    out += `<ellipse cx="${cx}" cy="128" rx="52" ry="5" fill="rgba(0,0,0,.13)"/>`;
    out += p(`M${cx - 52} 52 L${cx + 52} 52 L${cx + 46} 124 L${cx - 46} 124 Z`, `url(#${gBase})`, ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += stroke(`M${cx - 30} 52 Q${cx - 27} 18 ${cx - 8} 20`, shade(base, -0.28), 5);
    out += stroke(`M${cx + 30} 52 Q${cx + 27} 18 ${cx + 8} 20`, shade(base, -0.28), 5);
    box = { x: cx - 62, y: 10, w: 124, h: 126 };
    anchorY = 92;
  } else if (form === 'backpack') {
    out += `<ellipse cx="${cx}" cy="126" rx="52" ry="5" fill="rgba(0,0,0,.13)"/>`;
    out += p(`M${cx - 44} 44 Q${cx} 26 ${cx + 44} 44 L${cx + 47} 118 Q${cx} 128 ${cx - 47} 118 Z`, `url(#${gBase})`, ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += p(`M${cx - 32} 82 L${cx + 32} 82 L${cx + 29} 112 L${cx - 29} 112 Z`, shade(base, -0.16), ` stroke="${edge(base)}" stroke-width="1"`);
    out += stroke(`M${cx - 37} 46 Q${cx - 60} 76 ${cx - 34} 114`, shade(base, -0.3), 6);
    out += stroke(`M${cx + 37} 46 Q${cx + 60} 76 ${cx + 34} 114`, shade(base, -0.3), 6);
    box = { x: cx - 68, y: 18, w: 136, h: 118 };
    anchorY = 64;
  } else {
    out += `<ellipse cx="${cx}" cy="122" rx="54" ry="5" fill="rgba(0,0,0,.13)"/>`;
    out += stroke(`M${cx - 56} 38 Q${cx} 22 ${cx + 56} 38`, shade(base, -0.3), 6);
    out += p(`M${cx - 54} 58 L${cx + 54} 58 L${cx + 48} 118 L${cx - 48} 118 Z`, `url(#${gBase})`, ` stroke="${edge(base)}" stroke-width="1.2"`);
    out += p(`M${cx - 54} 58 L${cx + 54} 58 L${cx + 51} 84 Q${cx} 96 ${cx - 51} 84 Z`, `url(#${gAcc})`, ' opacity=".94"');
    out += `<rect x="${cx - 9}" y="82" width="18" height="12" rx="3" fill="${shade(detail, 0.32)}"/>`;
    box = { x: cx - 66, y: 14, w: 132, h: 118 };
    anchorY = 106;
  }
  if (worn) out += `<circle cx="${cx + 24}" cy="100" r="5" fill="rgba(60,50,30,.16)"/>`;
  return { svg: out, anchor: { x: cx, y: anchorY, scale: 0.95 }, box };
}

/* ======================= ЛОГОТИПЫ ======================= */

function mark(kind, x, y, scale, color) {
  const s = scale || 1;
  const g = (d, extra) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${color}"${extra || ''}>${d}</g>`;
  switch (kind) {
    case 'swoosh':
      return g('<path d="M-20 5 Q-5 -3 18 -13 Q3 3 -12 10 Q-20 13 -20 5 Z"/>');
    case 'stripes3':
      return g('<path d="M-13 -10 L-8 -10 L-18 12 L-23 12 Z M-3 -10 L2 -10 L-8 12 L-13 12 Z M7 -10 L12 -10 L2 12 L-3 12 Z"/>');
    case 'nletter':
      return g('<path d="M-14 11 L-14 -11 L-8 -11 L6 4 L6 -11 L12 -11 L12 11 L6 11 L-8 -4 L-8 11 Z"/>');
    case 'star':
      return g('<path d="M0 -14 L4 -5 L14 -5 L6 1 L9 11 L0 5 L-9 11 L-6 1 L-14 -5 L-4 -5 Z"/>');
    case 'wing':
      return g('<path d="M-15 8 Q-8 -10 3 -11 Q10 -11 15 -5 Q5 -5 0 3 Q-5 10 -15 8 Z"/>');
    case 'wave':
      return g('<path d="M-16 2 L-9 -8 L-1 5 L7 -8 L14 2 L14 6 L7 -2 L-1 10 L-9 -2 L-16 6 Z"/>');
    case 'script':
      return g('<path d="M-17 7 Q-12 -8 -5 -8 Q0 -8 -1 0 Q-2 7 3 7 Q10 7 12 -5 L16 -5 Q13 11 3 11 Q-5 11 -5 5 Q-8 11 -13 11 Q-18 11 -17 7 Z"/>');
    case 'patch':
      return g('<rect x="-18" y="-10" width="36" height="20" rx="3"/><rect x="-14" y="-6" width="28" height="12" rx="2" fill="rgba(0,0,0,.4)"/>');
    case 'boxlogo':
      return g('<rect x="-23" y="-9" width="46" height="18" rx="1.5"/>');
    case 'triangle':
      return g('<path d="M0 -13 L14 10 L-14 10 Z"/>');
    case 'compass':
      return g(`<circle cx="0" cy="0" r="13" fill="none" stroke="${color}" stroke-width="3"/><path d="M0 -9 L3 -1 L10 0 L3 1 L0 9 L-3 1 L-10 0 L-3 -1 Z"/>`);
    case 'halfdome':
      return g('<path d="M-14 9 Q-14 -10 0 -10 Q14 -10 14 9 Z M-8 9 Q-8 -4 0 -4 Q8 -4 8 9 Z" fill-rule="evenodd"/>');
    case 'bird':
      return g('<path d="M-15 9 L0 -11 L15 9 L6 9 L0 1 L-6 9 Z"/>');
    case 'mountain':
      return g('<path d="M-16 9 L-6 -6 L0 1 L7 -11 L16 9 Z"/>');
    case 'arrow':
      return g('<path d="M-15 9 L0 -11 L15 9 L7 9 L0 -1 L-7 9 Z"/>');
    case 'vmark':
      return g('<path d="M-14 -9 L0 10 L14 -9 L7 -9 L0 3 L-7 -9 Z"/>');
    case 'tree':
      return g('<path d="M0 -13 L6 -4 L2 -4 L9 4 L4 4 L10 12 L-10 12 L-4 4 L-9 4 L-2 -4 L-6 -4 Z"/>');
    case 'crest':
      return g('<path d="M0 -13 Q12 -10 12 0 Q12 10 0 13 Q-12 10 -12 0 Q-12 -10 0 -13 Z M0 -8 Q7 -6 7 0 Q7 6 0 8 Q-7 6 -7 0 Q-7 -6 0 -8 Z" fill-rule="evenodd"/>');
    case 'flag':
      return g('<rect x="-18" y="-8" width="36" height="16" rx="2"/><rect x="-5" y="-8" width="10" height="16" fill="rgba(255,255,255,.8)"/>');
    case 'shark':
      return g('<path d="M-16 6 Q-7 -10 7 -9 L17 -2 L7 3 Q4 9 -5 9 Z"/><circle cx="3" cy="-2" r="2.2" fill="rgba(0,0,0,.55)"/>');
    case 'monogram':
      return g('<path d="M-17 -9 L-9 -9 L-9 9 L-17 9 Z M-4 -9 L4 -9 L4 9 L-4 9 Z M9 -9 L17 -9 L17 9 L9 9 Z" opacity=".6"/><path d="M-17 -2 L17 -2 L17 2 L-17 2 Z" opacity=".6"/>');
    case 'arcticpatch':
      return g('<circle cx="0" cy="0" r="13"/><path d="M-6 -2 L0 -8 L6 -2 L4 5 L-4 5 Z" fill="rgba(255,255,255,.85)"/>');
    case 'stitch4':
      return g('<path d="M-15 -8 L-10 -8 L-10 8 L-15 8 Z M-5 -8 L0 -8 L0 8 L-5 8 Z M5 -8 L10 -8 L10 8 L5 8 Z"/>');
    case 'print':
      return g('<rect x="-21" y="-7" width="42" height="5" rx="2.5"/><rect x="-14" y="2" width="28" height="5" rx="2.5" opacity=".72"/>');
    default:
      return '';
  }
}

/* ======================= СБОРКА ======================= */

const SHOE_SET = new Set(Object.keys(SHOE_FORMS));
const GARMENT_SET = new Set(Object.keys(GARMENT_FORMS));
const PANTS_SET = new Set(Object.keys(PANTS_FORMS));
const HEAD_SET = new Set(['cap', 'beanie', 'bucket']);

/** Рисует вещь. item: { m, way, cond, defects, condSeen } */
export function itemArt(item, opts = {}) {
  const m = MODELS[item.m];
  if (!m) return '';
  const way = m.ways[(item.way || 0) % m.ways.length] || m.ways[0];
  const base = colorHex(way.c[0]);
  const accent = colorHex(way.c[1]);
  const detail = colorHex(way.c[2] || way.c[0]);
  const worn = (item.cond || 0) >= 3 || !!(item.defects && item.defects.length && item.condSeen);
  const form = m.art.form;

  let drawn;
  if (SHOE_SET.has(form)) drawn = sneaker(form, base, accent, detail, worn);
  else if (GARMENT_SET.has(form)) drawn = garment(form, base, accent, detail, worn);
  else if (PANTS_SET.has(form)) drawn = pants(form, base, accent, detail, worn);
  else if (HEAD_SET.has(form)) drawn = headwear(form, base, accent, detail, worn);
  else drawn = bag(form, base, accent, detail, worn);

  let logo = '';
  if (!m.noname && m.art.mark && m.art.mark !== 'none') {
    const logoColor = isLight(way.c[0]) ? 'rgba(26,25,30,.86)' : 'rgba(244,243,238,.9)';
    logo = mark(m.art.mark, drawn.anchor.x, drawn.anchor.y, drawn.anchor.scale * (opts.logoScale || 0.8), logoColor);
  }

  const b = drawn.box;
  return `<svg viewBox="${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}" role="img" aria-label="${m.full}" preserveAspectRatio="xMidYMid meet">${drawn.svg}${logo}</svg>`;
}

export const itemThumb = (item) => itemArt(item);

/** Фон карточки под вещь: мягкий оттенок её расцветки. */
export function artBackdrop(item) {
  const m = MODELS[item.m];
  if (!m) return '#eceaf0';
  const way = m.ways[(item.way || 0) % m.ways.length] || m.ways[0];
  return shade(colorHex(way.c[0]), isLight(way.c[0]) ? -0.05 : 0.88);
}
