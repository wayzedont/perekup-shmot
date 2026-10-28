// Палитра расцветок. Ключи используются в описаниях моделей,
// чтобы расцветка читалась как «Панда: белый + чёрный», а не как набор хексов.

export const C = {
  white: '#f2f1ec',
  bone: '#e3dccb',
  cream: '#ebe2cc',
  sand: '#d7c6a3',
  tan: '#c2996a',
  gum: '#c69a62',
  brown: '#6d4a2d',
  chocolate: '#46311f',
  black: '#1c1b20',
  charcoal: '#32333a',
  grey: '#a6aab1',
  silver: '#c9ced4',
  ice: '#dde7ee',
  navy: '#283a5e',
  blue: '#3878bd',
  sky: '#7fb6e0',
  teal: '#2c6b70',
  mint: '#9ccfb7',
  green: '#3b6a47',
  olive: '#596043',
  lime: '#a9c34a',
  yellow: '#d9ae38',
  gold: '#c3a02b',
  orange: '#cf6f28',
  rust: '#9d4e2a',
  red: '#b23a2f',
  burgundy: '#6b2631',
  pink: '#d98aa4',
  purple: '#6a4d99',
  lilac: '#a292c9',
};

export const colorHex = (key) => C[key] || C.grey;

/** Светлая ли расцветка — чтобы положить логотип контрастным цветом. */
export function isLight(key) {
  const hex = colorHex(key);
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}

/** Затемнить/осветлить: k<0 темнее, k>0 светлее. */
export function shade(hex, k) {
  const n = parseInt(String(hex).slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const target = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  r = Math.round(r + (target - r) * a);
  g = Math.round(g + (target - g) * a);
  b = Math.round(b + (target - b) * a);
  return `rgb(${r},${g},${b})`;
}
