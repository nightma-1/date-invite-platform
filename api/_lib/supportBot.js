/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Отдельный бот техподдержки — намеренно НЕ тот же, что шлёт уведомления
 * об открытии приглашений. Причины две:
 *   1. у уведомлений и у поддержки разные /start и разный смысл диалога;
 *   2. если токен поддержки придётся отозвать, уведомления не упадут.
 *
 * Бот работает ретранслятором: личка бота ↔ рабочая группа команды.
 * Токен и chat_id группы живут только в переменных окружения и никогда
 * не попадают на фронтенд.
 */

import crypto from 'crypto';

export function supportBotToken() {
  const token = process.env.SUPPORT_BOT_TOKEN;
  if (!token) throw new Error('SUPPORT_BOT_TOKEN is not set');
  return token;
}

/** chat_id рабочей группы (у групп он отрицательный — поэтому Number, не parseInt строки «как есть»). */
export function supportChatId() {
  const raw = process.env.SUPPORT_CHAT_ID;
  if (!raw) throw new Error('SUPPORT_CHAT_ID is not set');
  const id = Number(raw);
  if (!Number.isFinite(id)) throw new Error('SUPPORT_CHAT_ID is not a number');
  return id;
}

/** Секрет для заголовка X-Telegram-Bot-Api-Secret-Token (setWebhook secret_token). */
export function supportWebhookSecret() {
  return crypto.createHash('sha256').update(`support-webhook:${supportBotToken()}`).digest('hex');
}

/**
 * Вызов Bot API. Возвращает result или null — наверх ошибки не бросаем:
 * ни одно обращение не должно потеряться из-за того, что Telegram
 * ответил 500. Обращение к этому моменту уже лежит в support_tickets.
 */
export async function callTelegram(method, payload) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${supportBotToken()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      console.error(`support bot: ${method} failed`, res.status, data.description || '');
      return null;
    }
    return data.result;
  } catch (e) {
    console.error(`support bot: ${method} threw`, e?.message || e);
    return null;
  }
}

/** Отправляет текст и возвращает message_id (или null). */
export async function sendMessage(chatId, text, extra = {}) {
  const result = await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
  return result?.message_id ?? null;
}

/**
 * Копирует сообщение (текст, фото, видео, голосовое, документ) в другой чат.
 * Именно copyMessage, а не forwardMessage: forward показал бы команде
 * «Переслано от <имя>» со ссылкой на профиль, а ответ реплаем на пересланное
 * сообщение Telegram не доставит боту.
 */
export async function copyMessage(toChatId, fromChatId, messageId, extra = {}) {
  const result = await callTelegram('copyMessage', {
    chat_id: toChatId,
    from_chat_id: fromChatId,
    message_id: messageId,
    ...extra,
  });
  return result?.message_id ?? null;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** Обрезает длинные поля, чтобы не упереться в лимит Telegram в 4096 символов. */
export function clip(value, max) {
  const s = String(value ?? '').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Как подписать автора в карточке обращения. */
export function describeTelegramUser(from) {
  const name = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim();
  const username = from?.username ? `@${from.username}` : null;
  return [name || 'Без имени', username].filter(Boolean).join(' · ');
}
