/**
 * © 2026 Senti. Все права защищены.
 *
 * Цены «Нашего музея», в сумах. Единственное место, где они заданы:
 * конструктор показывает их отсюда, а api/click/create.js считает по ним
 * сумму платежа. Клиент сумму не передаёт.
 *
 * ЭТО ВРЕМЕННЫЕ ЦЕНЫ: перед запуском поменять здесь.
 */

// Показывать ли музей на главной. Включить при запуске.
export const MUSEUM_PUBLIC = false;

export const MUSEUM_TIERS = [
  { key: 'lite', price: 59000, maxPhotos: 15, video: false },
  { key: 'full', price: 99000, maxPhotos: 45, video: true },
];

export const MUSEUM_TERMS = [
  { days: 30, key: 'month', addon: 0, extend: 15000 },
  { days: 180, key: 'halfYear', addon: 30000, extend: 30000 },
  { days: 365, key: 'year', addon: 40000, extend: 40000 },
];

export const MUSEUM_THEMES = [
  { key: 'classic', premium: false, swatch: ['#7c2c4a', '#3f4a6b', '#c79a58'] },
  { key: 'night', premium: true, swatch: ['#141a3c', '#2a2f6b', '#cfd6ff'] },
  { key: 'garden', premium: true, swatch: ['#2f5d4a', '#7da06a', '#e9d9a8'] },
  { key: 'samarkand', premium: true, swatch: ['#0f6f86', '#1aa0a8', '#e8c26a'] },
  { key: 'valentine', premium: true, swatch: ['#b3264e', '#f07a9b', '#ffe3ea'] },
];

export const MUSEUM_ADDONS = { theme: 20000, voice: 15000, song: 15000 };

export function museumTerm(days) {
  return MUSEUM_TERMS.find((t) => t.days === Number(days)) || null;
}

export function museumTier(key) {
  return MUSEUM_TIERS.find((t) => t.key === key) || MUSEUM_TIERS[1];
}

export function museumTheme(key) {
  return MUSEUM_THEMES.find((t) => t.key === key) || MUSEUM_THEMES[0];
}

export function museumPublishPrice({ termDays, tier, theme, voice, song }) {
  const term = museumTerm(termDays) || MUSEUM_TERMS[0];
  return museumTier(tier).price
    + term.addon
    + (museumTheme(theme).premium ? MUSEUM_ADDONS.theme : 0)
    + (voice ? MUSEUM_ADDONS.voice : 0)
    + (song ? MUSEUM_ADDONS.song : 0);
}

export function museumExtendPrice(days) {
  const term = museumTerm(days);
  return term ? term.extend : null;
}

export const MUSEUM_LIMITS = {
  minPhotos: 6,
  maxVideoSeconds: 60,
  maxVideoBytes: 50 * 1024 * 1024,
  maxVoiceSeconds: 60,
  maxSongBytes: 15 * 1024 * 1024,
  dedication: 600,
  signature: 80,
  name: 40,
  caption: 140,
  photoDate: 30,
  finale: 120,
};
