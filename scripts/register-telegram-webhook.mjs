/**
 * © 2026 Senti. Все права защищены.
 *
 * Регистрирует вебхук Telegram-бота вместе с secret_token — его проверяет
 * api/telegram/webhook.js. Запускается после сборки ТОЛЬКО на продакшен-деплое
 * Vercel, токен берётся из переменной окружения и никуда не выводится.
 * Сбой регистрации не роняет деплой (только предупреждение в логе сборки).
 */

import crypto from 'crypto';

async function main() {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('[telegram-webhook] skipped (not a production build)');
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('[telegram-webhook] skipped: TELEGRAM_BOT_TOKEN is not set');
    return;
  }

  const appUrl = (process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const base = /^https:\/\//.test(appUrl)
    ? appUrl
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '';
  if (!base) {
    console.warn('[telegram-webhook] skipped: no public https URL known');
    return;
  }

  // Должно совпадать с webhookSecret() в api/_lib/telegramLink.js
  const secretToken = crypto.createHash('sha256').update(`telegram-webhook:${token}`).digest('hex');
  const url = `${base}/api/telegram/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ['message'] }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.ok) {
    console.log(`[telegram-webhook] registered: ${url}`);
  } else {
    console.warn(`[telegram-webhook] setWebhook failed: ${data.description || res.status}`);
  }
}

main().catch((e) => console.warn('[telegram-webhook] error:', e?.message || e));
