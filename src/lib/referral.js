/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Реферальная программа для инфлюенсеров.
 *
 * Как работает атрибуция (важно понимать перед правками):
 *   1. Человек приходит по /r/<code> — запоминаем код в localStorage на 30 дней
 *      и пишем клик в referral_clicks через RPC track_referral_click.
 *   2. Как только он залогинился (неважно, с какой страницы) — вызываем
 *      attach_referral, которая один раз проставляет profiles.referred_by.
 *      Повторные вызовы безопасны: RPC обновляет строку только если
 *      referred_by ещё пустой.
 *   3. Дальше всё делает база. Триггер на payments ставит partner_id при
 *      создании платежа и начисляет комиссию, когда статус становится 'paid'.
 *      Фронт в начислениях не участвует вообще — ему нельзя доверять деньги.
 */

import { supabase } from './supabaseClient.js';

const REF_KEY = 'senti-ref';
const VISITOR_KEY = 'senti-visitor';
const REF_TTL_DAYS = 30;

// Тот же формат, что и CHECK-констрейнт на partners.code в базе. Проверяем на
// фронте, чтобы не ходить в сеть с заведомо мусорным кодом из адресной строки.
const CODE_RE = /^[a-z0-9_-]{3,32}$/;

export function normalizeCode(raw) {
  const code = String(raw || '').trim().toLowerCase();
  return CODE_RE.test(code) ? code : null;
}

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* приватный режим — переживём */ }
}

function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/**
 * Стабильный id браузера — нужен только чтобы считать уникальных посетителей
 * в панели партнёра. Никаких персональных данных, обычный случайный uuid.
 */
export function getVisitorId() {
  let id = safeGet(VISITOR_KEY);
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    safeSet(VISITOR_KEY, id);
  }
  return id;
}

/** Код партнёра, если он ещё не протух. */
export function getStoredRef() {
  const raw = safeGet(REF_KEY);
  if (!raw) return null;
  try {
    const { code, savedAt } = JSON.parse(raw);
    const ageDays = (Date.now() - savedAt) / 86400000;
    if (ageDays > REF_TTL_DAYS) {
      safeRemove(REF_KEY);
      return null;
    }
    return normalizeCode(code);
  } catch {
    safeRemove(REF_KEY);
    return null;
  }
}

/**
 * Первый партнёр выигрывает: если человек уже пришёл по чьей-то ссылке,
 * вторая ссылка его не перебивает. Иначе любой блогер мог бы «угнать» чужой
 * трафик, попросив кликнуть по своей ссылке перед самой оплатой.
 */
function storeRef(code) {
  if (getStoredRef()) return false;
  safeSet(REF_KEY, JSON.stringify({ code, savedAt: Date.now() }));
  return true;
}

/**
 * Вызывается со страницы /r/:code. Клик пишем всегда (это статистика
 * партнёра), а код запоминаем только если человек ещё ни к кому не привязан.
 */
export async function trackReferralVisit(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return false;

  storeRef(code);

  try {
    const { data, error } = await supabase.rpc('track_referral_click', {
      p_code: code,
      p_visitor_id: getVisitorId(),
      p_user_agent: navigator.userAgent,
      p_referer: document.referrer || null,
      p_landing_path: window.location.pathname,
    });
    if (error) throw error;
    // RPC вернёт false для несуществующего/выключенного кода — тогда и хранить
    // его незачем, иначе он просто будет болтаться в localStorage 30 дней.
    if (data === false) safeRemove(REF_KEY);
    return data === true;
  } catch (err) {
    console.error('referral click tracking failed', err);
    return false;
  }
}

/**
 * Привязывает текущего залогиненного пользователя к партнёру. Идемпотентно:
 * можно дёргать на каждый SIGNED_IN, база сама проигнорирует повтор.
 */
export async function attachReferralIfAny() {
  const code = getStoredRef();
  if (!code) return;
  try {
    const { error } = await supabase.rpc('attach_referral', { p_code: code });
    if (error) throw error;
    // Привязка вечная и живёт в базе — держать код в браузере больше незачем.
    safeRemove(REF_KEY);
  } catch (err) {
    console.error('attach referral failed', err);
  }
}

/** Сводная статистика для панели партнёра. null — текущий юзер не партнёр. */
export async function loadPartnerStats() {
  const { data, error } = await supabase.rpc('partner_stats');
  if (error) throw error;
  return data?.[0] || null;
}

/** Последние начисления партнёра (RLS отдаёт только его собственные). */
export async function loadPartnerCommissions(limit = 50) {
  const { data, error } = await supabase
    .from('partner_commissions')
    .select('id, order_amount, commission_percent, commission_amount, status, available_at, paid_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/** Клики по дням за последние N дней — для графика в панели. */
export async function loadClicksByDay(days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('referral_clicks')
    .select('created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export function referralLink(code) {
  return `${window.location.origin}/r/${code}`;
}

export function formatSum(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} сум`;
}
