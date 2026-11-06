/**
 * © 2026 Senti. Все права защищены.
 *
 * Цены «Нашего музея», в сумах. Единственное место, где они заданы:
 * конструктор показывает их отсюда, а api/click/create.js считает по ним
 * сумму платежа. Клиент сумму не передаёт.
 *
 * ЭТО ВРЕМЕННЫЕ ЦЕНЫ: перед запуском поменять здесь.
 */

export const MUSEUM_BASE_PRICE = 99000; // включён 1 месяц

export const MUSEUM_TERMS = [
  { days: 30, key: 'month', addon: 0, extend: 15000 },
  { days: 180, key: 'halfYear', addon: 30000, extend: 30000 },
  { days: 365, key: 'year', addon: 40000, extend: 40000 },
];

export function museumTerm(days) {
  return MUSEUM_TERMS.find((t) => t.days === Number(days)) || null;
}

export function museumPublishPrice(days) {
  const term = museumTerm(days) || MUSEUM_TERMS[0];
  return MUSEUM_BASE_PRICE + term.addon;
}

export function museumExtendPrice(days) {
  const term = museumTerm(days);
  return term ? term.extend : null;
}

export const MUSEUM_LIMITS = {
  minPhotos: 6,
  maxPhotos: 45,
  maxVideoSeconds: 60,
  maxVideoBytes: 50 * 1024 * 1024,
  dedication: 600,
  signature: 80,
  name: 40,
};
