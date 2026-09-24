/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';

// Service-role клиент — только на сервере, никогда не попадает на клиент
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const update = req.body;
  const message = update?.message;

  if (!message?.text?.startsWith('/start')) {
    // Не команда /start — просто подтверждаем получение, ничего не делаем
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const parts = message.text.split(' ');
  const userId = parts[1]; // deep-link: t.me/bot?start={user_id}

  if (!userId) {
    await sendMessage(
      chatId,
      'Открой этого бота по ссылке из своего кабинета на сайте — так я узнаю, кому присылать уведомления.'
    );
    return res.status(200).json({ ok: true });
  }

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ telegram_chat_id: chatId })
    .eq('id', userId);

  if (error) {
    console.error('telegram webhook: failed to link chat_id', error);
    await sendMessage(chatId, 'Не получилось привязать аккаунт. Попробуй ещё раз со ссылки в кабинете.');
    return res.status(200).json({ ok: true }); // Telegram ждёт 200 в любом случае, иначе будет ретраить
  }

  await sendMessage(
    chatId,
    '✅ Готово! Теперь я буду присылать сюда уведомления об открытии приглашений и ответах.'
  );

  return res.status(200).json({ ok: true });
}