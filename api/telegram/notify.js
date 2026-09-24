/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 *
 * Вызывается не пользователем, а Postgres-триггером в Supabase (через pg_net)
 * при просмотре приглашения или при ответе получателя — см. миграцию
 * telegram_notifications. Проверяем общий секрет в заголовке, а не auth
 * пользователя: у этого запроса его просто нет.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) {
    console.error('telegram/notify: sendMessage failed', res.status, await res.text());
  }
}

function formatAnswered(invitation, extra) {
  const lines = [
    `❤️ <b>${escapeHtml(invitation.recipient_name)}</b> ответил(а) на приглашение!`,
    '',
    extra?.answered_yes === false ? '💔 Ответ: Нет' : '✅ Ответ: Да',
  ];
  if (extra?.selected_date) lines.push(`📅 Дата: ${extra.selected_date}`);
  if (extra?.selected_time) lines.push(`🕒 Время: ${extra.selected_time}`);
  lines.push('', `Открыть: ${process.env.PUBLIC_APP_URL || ''}/dashboard`.trim());
  return lines.join('\n');
}

function formatViewed(invitation) {
  return [
    `👀 <b>${escapeHtml(invitation.recipient_name)}</b> открыл(а) твоё приглашение!`,
    'Ждём ответа ✨',
  ].join('\n');
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const secret = req.headers['x-notify-secret'];
  if (!secret || secret !== process.env.NOTIFY_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { invitation_id: invitationId, event, extra } = req.body || {};
  if (!invitationId || !event) {
    return res.status(400).json({ error: 'invitation_id и event обязательны' });
  }

  const { data: invitation, error: invError } = await supabaseAdmin
    .from('invitations')
    .select('recipient_name, user_id, profiles(telegram_chat_id)')
    .eq('id', invitationId)
    .maybeSingle();

  if (invError || !invitation) {
    console.error('telegram/notify: invitation not found', invitationId, invError);
    // Возвращаем 200 — pg_net не ретраит, а это не критичная ошибка для получателя
    return res.status(200).json({ ok: false, reason: 'invitation not found' });
  }

  const chatId = invitation.profiles?.telegram_chat_id;
  if (!chatId) {
    // Автор не привязал Telegram — тихо выходим, это нормальное состояние
    return res.status(200).json({ ok: false, reason: 'no telegram linked' });
  }

  const text = event === 'answered' ? formatAnswered(invitation, extra) : formatViewed(invitation);
  await sendMessage(chatId, text);

  return res.status(200).json({ ok: true });
}
