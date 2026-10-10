/**
 * © 2026 Senti. Все права защищены.
 *
 * То же, что register-telegram-webhook.mjs, но для ОТДЕЛЬНОГО бота поддержки:
 * у него свой токен, свой secret_token и свой адрес вебхука. Запускается
 * после сборки только на продакшен-деплое Vercel. Сбой регистрации не роняет
 * деплой — сайт должен выкатываться, даже если Telegram недоступен.
 *
 * allowed_updates — только message: ретранслятору не нужны ни правки
 * сообщений, ни реакции, ни служебные апдейты группы.
 */

import crypto from 'crypto';

async function main() {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('[support-webhook] skipped (not a production build)');
    return;
  }

  const token = process.env.SUPPORT_BOT_TOKEN;
  if (!token) {
    console.warn('[support-webhook] skipped: SUPPORT_BOT_TOKEN is not set');
    return;
  }

  const appUrl = (process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const base = /^https:\/\//.test(appUrl)
    ? appUrl
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '';
  if (!base) {
    console.warn('[support-webhook] skipped: no public https URL known');
    return;
  }

  // Должно совпадать с supportWebhookSecret() в api/_lib/supportBot.js
  const secretToken = crypto.createHash('sha256').update(`support-webhook:${token}`).digest('hex');
  const url = `${base}/api/support/webhook`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ['message'] }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.ok) {
    console.log(`[support-webhook] registered: ${url}`);
  } else {
    console.warn(`[support-webhook] setWebhook failed: ${data.description || res.status}`);
  }
}

main().catch((e) => console.warn('[support-webhook] error:', e?.message || e));
