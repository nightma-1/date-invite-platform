/**
 * © 2026 Senti. Все права защищены.
 *
 * Подписанный код для привязки Telegram. Раньше в deep-link шёл голый user_id,
 * и любой, кто знал чужой id, мог привязать СВОЙ Telegram к чужому аккаунту и
 * читать его уведомления. Теперь код выдаётся только авторизованному
 * пользователю, подписан HMAC и живёт 15 минут.
 *
 * Формат (≤ 64 символов — лимит Telegram на параметр /start):
 *   <uid без дефисов, 32 hex>_<exp в минутах, base36>_<подпись, 24 символа>
 */

import crypto from 'crypto';

const TTL_MINUTES = 15;

function secretKey() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return crypto.createHash('sha256').update(`telegram-link:${token}`).digest();
}

/** Секрет для заголовка X-Telegram-Bot-Api-Secret-Token (setWebhook secret_token). */
export function webhookSecret() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  return crypto.createHash('sha256').update(`telegram-webhook:${token}`).digest('hex');
}

function sign(payload) {
  return crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url').slice(0, 24);
}

export function createLinkCode(userId) {
  const uidHex = userId.replace(/-/g, '');
  const exp = (Math.floor(Date.now() / 60000) + TTL_MINUTES).toString(36);
  const payload = `${uidHex}.${exp}`;
  return `${uidHex}_${exp}_${sign(payload)}`;
}

/** Возвращает user_id (с дефисами) или null, если код неверный/просрочен. */
export function verifyLinkCode(code) {
  if (typeof code !== 'string' || code.length > 64) return null;
  const parts = code.split('_');
  if (parts.length !== 3) return null;
  const [uidHex, exp, sig] = parts;
  if (!/^[0-9a-f]{32}$/.test(uidHex) || !/^[0-9a-z]{1,8}$/.test(exp)) return null;

  const expected = Buffer.from(sign(`${uidHex}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;

  if (parseInt(exp, 36) < Math.floor(Date.now() / 60000)) return null;

  return `${uidHex.slice(0, 8)}-${uidHex.slice(8, 12)}-${uidHex.slice(12, 16)}-${uidHex.slice(16, 20)}-${uidHex.slice(20)}`;
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
