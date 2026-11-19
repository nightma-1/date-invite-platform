/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Оплата без регистрации.
 *
 * По аналитике больше всего людей терялось на экране входа: собрали
 * приглашение, нажали «Опубликовать» — и уперлись в регистрацию. Теперь
 * перед оплатой человек получает гостевой аккаунт Supabase (anonymous
 * sign-in): настоящий пользователь в auth.users с флагом is_anonymous, у
 * которого есть профиль, свои приглашения и платежи. RLS, Click и вебхук
 * работают с ним как с любым другим аккаунтом, менять их не нужно.
 *
 * Гость видит свои приглашения только в этом браузере. Поэтому после оплаты
 * предлагаем «сохранить доступ» — войти через Telegram. Перед уходом на
 * Telegram запоминаем токен гостя, после возврата сервер
 * (/api/account/claim) переносит приглашения и оплаты на настоящий аккаунт.
 *
 * Если гостевой вход выключен в настройках Supabase, ensureGuestSession()
 * вернёт null и конструктор покажет обычный экран входа — как раньше.
 */

import { supabase } from './supabaseClient.js';
import { track } from './analytics.js';

// Выключено по решению владельца (19.11.2026): регистрация остаётся перед
// оплатой. Чтобы включить оплату без регистрации, поставить true и включить
// «Allow anonymous sign-ins» в Supabase (Authentication → Sign In / Providers,
// не забыть Save). Остальной код (перенос гостя, карточка «Сохранить
// доступ») без гостей просто ничего не делает.
export const GUEST_CHECKOUT_ENABLED = false;

const CLAIM_KEY = 'senti_guest_claim';
// Токен гостя живёт час — дольше ждать возврата из Telegram нет смысла.
const CLAIM_TTL_MS = 55 * 60 * 1000;

export function isGuest(session) {
  return Boolean(session?.user?.is_anonymous);
}

/**
 * Текущая сессия, а если её нет — новая гостевая. null, если гостевой вход
 * выключен или Supabase не ответил: тогда нужен обычный вход.
 */
export async function ensureGuestSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  if (!GUEST_CHECKOUT_ENABLED) return null;
  try {
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error || !anon?.session) {
      track('guest_session_unavailable', { message: String(error?.message || '').slice(0, 120) });
      return null;
    }
    track('guest_session_created');
    return anon.session;
  } catch (err) {
    track('guest_session_unavailable', { message: String(err?.message || '').slice(0, 120) });
    return null;
  }
}

/** Запомнить гостя перед уходом на вход, чтобы потом забрать его приглашения. */
export async function rememberGuestForClaim() {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!isGuest(session)) return;
    window.localStorage.setItem(CLAIM_KEY, JSON.stringify({
      token: session.access_token,
      uid: session.user.id,
      at: Date.now(),
    }));
  } catch { /* без localStorage перенос не получится — гость останется гостем */ }
}

function readPendingClaim() {
  try {
    const raw = window.localStorage.getItem(CLAIM_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw);
    if (!pending?.token || Date.now() - (pending.at || 0) > CLAIM_TTL_MS) {
      window.localStorage.removeItem(CLAIM_KEY);
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

let claimInFlight = null;

/**
 * Если человек был гостем и только что вошёл по-настоящему — переносим всё
 * гостевое на его аккаунт. Безопасно вызывать много раз: работает только
 * при наличии запомненного гостя и только один запрос за раз.
 */
export function claimGuestIfPending(session) {
  if (claimInFlight) return claimInFlight;
  const pending = readPendingClaim();
  if (!pending || !session || isGuest(session) || session.user.id === pending.uid) {
    return Promise.resolve(null);
  }

  claimInFlight = (async () => {
    try {
      const res = await fetch('/api/account/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ guestToken: pending.token }),
      });
      const data = await res.json().catch(() => ({}));
      // 4xx — повторять бессмысленно (гость уже перенесён, токен истёк).
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        window.localStorage.removeItem(CLAIM_KEY);
      }
      if (res.ok) {
        track('guest_claimed', { invitations: data.invitations || 0 });
        window.dispatchEvent(new CustomEvent('senti:guest-claimed', { detail: data }));
        return data;
      }
      track('guest_claim_failed', { status: res.status });
      return null;
    } catch {
      return null;
    } finally {
      claimInFlight = null;
    }
  })();
  return claimInFlight;
}

/** Подписка на вход: вызывается один раз из App. */
let claimInitialized = false;
export function initGuestClaim() {
  if (claimInitialized) return;
  claimInitialized = true;
  try {
    supabase.auth.onAuthStateChange((_event, session) => {
      // Внутри колбэка нельзя ждать запросы Supabase — откладываем.
      if (session && !isGuest(session)) setTimeout(() => claimGuestIfPending(session), 0);
    });
  } catch { /* не подписались — гость просто останется гостем */ }
}

/** Встроенный браузер соцсети (Instagram, Facebook, TikTok и т. п.). */
export function isInAppBrowser() {
  try {
    return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Line\/|TikTok|musical_ly|BytedanceWebview/i.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}
