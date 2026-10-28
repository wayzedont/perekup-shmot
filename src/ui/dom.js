// Приложения, иконки и мелкие помощники для разметки.

export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => Array.from(document.querySelectorAll(sel));

export const ICONS = {
  avito: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9" r="2"/><circle cx="9" cy="16.5" r="2.4"/><circle cx="16.5" cy="16" r="3.4"/>',
  tg: '<path d="M3 11.5 21 4l-3 16-6-4.5-3 3v-5l9-8-11 6z"/>',
  poizon: '<path d="M5 7h14l-1.5 13h-11z"/><path d="M9 7a3 3 0 0 1 6 0"/><path d="M9.5 13.5 12 11l2.5 2.5L12 16z"/>',
  second: '<path d="M12 4a2 2 0 0 1 2 2c0 1.2-2 1.6-2 3"/><path d="M12 9 3.5 15.5a1.2 1.2 0 0 0 .7 2.1h15.6a1.2 1.2 0 0 0 .7-2.1z"/>',
  wardrobe: '<path d="M6 3h12v18H6z"/><path d="M12 3v18M10 11v2M14 11v2"/>',
  bank: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10.5h18M7 15h4"/>',
  parcels: '<path d="M3 8 12 4l9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9M7.5 6l9 4"/>',
  shop: '<path d="M4 9h16l-1 11H5z"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/><path d="m10 14 1.5 1.5L14.5 12"/>',
  notebook: '<path d="M5 4h13a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H5z"/><path d="M5 4a1.5 1.5 0 0 0 0 3h2M9 9h6M9 13h6M9 17h3"/>',
  goals: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
  job: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l4-7h5l3 7M10 10 8.5 7H6M15 10l-1-3h2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
};

export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;

export const APPS = [
  { id: 'avito', n: 'Авитка', bg: '#00a046' },
  { id: 'tg', n: 'Телега', bg: '#2a9fd6' },
  { id: 'poizon', n: 'Пойзон', bg: '#17171a' },
  { id: 'second', n: 'Секонд', bg: '#e0661c' },
  { id: 'wardrobe', n: 'Шкаф', bg: '#8c5a33' },
  { id: 'bank', n: 'Банк', bg: '#f0bd00', ink: '#1a1a1a', text: '#8a6d00' },
  { id: 'parcels', n: 'Посылки', bg: '#38913d' },
  { id: 'shop', n: 'Магазин', bg: '#7a46d6' },
  { id: 'notebook', n: 'Книжка', bg: '#2f6f8f' },
  { id: 'goals', n: 'Цели', bg: '#d93f74' },
  { id: 'job', n: 'Подработка', bg: '#56636f' },
  { id: 'settings', n: 'Настройки', bg: '#8b8794' },
];

export const APP_BY_ID = Object.fromEntries(APPS.map((a) => [a.id, a]));

export const DOCK = ['avito', 'tg', 'wardrobe', 'bank'];

/** Цвет аватара по имени — стабильный. */
const AVATAR_COLORS = ['#e07a5f', '#3d85c6', '#6aa84f', '#8e7cc3', '#c27ba0', '#e69138', '#45818e', '#7a46d6'];
export function avatar(name, salt) {
  const code = (name || '?').charCodeAt(0) + (salt || 0);
  const c = AVATAR_COLORS[Math.abs(code) % AVATAR_COLORS.length];
  const letter = (name || '?')[0].toUpperCase();
  return `<div class="avatar" style="background:${c}">${letter}</div>`;
}

/** Собрать строку из кусочков, выкинув пустые. */
export const join = (arr, sep) => arr.filter(Boolean).join(sep === undefined ? '' : sep);
