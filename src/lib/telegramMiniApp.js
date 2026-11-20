/**
 * © 2026 Senti. Все права защищены.
 *
 * senti.uz как Telegram Mini App (кнопка «Создать приглашение» в
 * @sentiuz_bot). Сайт тот же самый, здесь только подстройка под Telegram:
 *   - скрипт telegram-web-app.js грузим ТОЛЬКО внутри Telegram (Telegram
 *     передаёт #tgWebAppData в адресе при запуске), обычным посетителям он
 *     не нужен;
 *   - ready() + expand(): приложение на весь экран, без «шторки»;
 *   - ссылки t.me открываем через openTelegramLink — внутри Telegram это
 *     открывает чат, а не новую вкладку браузера.
 * Вход — тот же «через Telegram» (OIDC) внутри окна Mini App.
 */

import { track } from './analytics.js';
import { supabase } from './supabaseClient.js';

const FLAG = 'senti_miniapp';
let webApp = null;

export function isMiniApp() {
  try {
    if (/tgWebAppData|tgWebAppPlatform/.test(window.location.hash)) {
      window.sessionStorage.setItem(FLAG, '1');
      return true;
    }
    return window.sessionStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}

// Вход внутри Mini App. У окна Telegram своё хранилище — сессия из Chrome
// сюда не попадает, поэтому входим по initData (подпись Telegram проверяет
// сервер, см. api/telegram/connect.js → miniapp_login). initData держим только
// в памяти: это пропуск на сутки, в хранилище ему делать нечего.
let loginPromise = Promise.resolve(null);

function readInitData() {
  try {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData');
    if (fromHash) return fromHash;
  } catch { /* ниже */ }
  return window.Telegram?.WebApp?.initData || '';
}

async function autoLogin(initData) {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    if (!initData) return null;
    const res = await fetch('/api/telegram/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'miniapp_login', initData }),
    });
    if (!res.ok) { track('miniapp_login_skip', { status: res.status }); return null; }
    const { token_hash: tokenHash } = await res.json();
    const { data: verified, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
    if (error) throw error;
    track('miniapp_login', {});
    return verified.session || null;
  } catch (err) {
    console.error('miniapp auto-login failed', err);
    return null;
  }
}

/** Ждать, пока Mini App попробует войти сам (вне Telegram — сразу null). */
export function miniAppLogin() {
  return loginPromise;
}

export function initMiniApp() {
  if (!isMiniApp()) return;
  loginPromise = autoLogin(readInitData());
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.async = true;
  script.onload = () => {
    try {
      webApp = window.Telegram?.WebApp || null;
      if (!webApp) return;
      webApp.ready();
      webApp.expand();
      webApp.setHeaderColor?.('#ffffff');
      webApp.setBackgroundColor?.('#ffffff');
      webApp.disableVerticalSwipes?.(); // свайп вниз в конструкторе не должен закрывать приложение
      track('miniapp_open', { platform: webApp.platform || null });
    } catch { /* без Telegram-обвязки сайт работает как обычно */ }
  };
  document.head.appendChild(script);
}

/** Окно «Отправить в Telegram»: выбрать чат и переслать ссылку */
export function shareToTelegram(url, text = '') {
  const shareUrl = `https://t.me/share/url?${new URLSearchParams({ url, text })}`;
  try {
    if (webApp?.openTelegramLink) {
      webApp.openTelegramLink(shareUrl);
      return;
    }
  } catch { /* ниже — обычное окно */ }
  window.open(shareUrl, '_blank', 'noopener');
}
