/**
 * © 2026 Senti. Все права защищены.
 *
 * Промокод из ссылки (?promo=IG20) запоминаем на 14 дней — блогер даёт
 * ссылку, человек может оплатить не сразу. На экране оплаты код уже
 * подставлен; скидку всё равно считает только сервер (/api/click/create).
 */

import { supabase } from './supabaseClient.js';

const KEY = 'senti-promo';
const TTL = 14 * 24 * 3600 * 1000;

export function normalizePromo(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
}

export function capturePromoFromUrl() {
  try {
    const code = normalizePromo(new URLSearchParams(window.location.search).get('promo'));
    if (code.length >= 3) window.localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch { /* приватный режим — не критично */ }
}

export function getStoredPromo() {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (v?.code && Date.now() - v.at < TTL) return v.code;
  } catch { /* ignore */ }
  return '';
}

export function storePromo(code) {
  try {
    if (code) window.localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    else window.localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

/** { code, discount_percent } или null, если код не действует */
export async function checkPromo(code) {
  const c = normalizePromo(code);
  if (c.length < 3) return null;
  const { data, error } = await supabase.rpc('check_promo_code', { p_code: c });
  if (error) throw error;
  return data || null;
}

export const INVITATION_PRICE = 19000;

export function discounted(price, percent) {
  let amount = Math.round((price * (100 - percent)) / 100 / 100) * 100;
  if (amount > 0 && amount < 1000) amount = 1000;
  return amount;
}
