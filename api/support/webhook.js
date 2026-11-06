/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 *
 * Бот поддержки как ретранслятор между личкой пользователя и рабочей группой.
 *
 *   Человек → бот           : карточка с его данными падает в группу команды.
 *   Команда реплаем в группе → ответ уходит обратно человеку в личку.
 *
 * Почему вообще нужна таблица support_threads: в reply_to_message лежит
 * сообщение, которое отправил САМ бот, — в нём нет ни чата, ни id автора.
 * Поэтому на каждое сообщение, положенное в группу, пишем строку
 * «message_id в группе → chat_id автора», и по ней находим адресата ответа.
 *
 * Приватность бота (privacy mode) выключать НЕ нужно: ответы на собственные
 * сообщения бота Telegram доставляет ему в любом случае.
 */

import { createClient } from '@supabase/supabase-js';
import { rateLimit } from '../_lib/rateLimit.js';
import { safeEqual } from '../_lib/telegramLink.js';
import {
  supportChatId,
  supportWebhookSecret,
  callTelegram,
  sendMessage,
  copyMessage,
  escapeHtml,
  clip,
  describeTelegramUser,
} from '../_lib/supportBot.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GREETING = [
  '👋 Это поддержка <b>Senti</b>.',
  '',
  'Опиши проблему одним сообщением — что делал, что ожидал и что получилось.',
  'Если дело в оплате, добавь дату и способ оплаты; если в приглашении — ссылку на него.',
  'Скриншот тоже можно прислать сюда.',
  '',
  'Мы отвечаем прямо в этот чат.',
].join('\n');

/** Запоминаем, какому человеку принадлежит сообщение, положенное в группу. */
async function rememberThread({ supportChat, supportMessageId, userChatId, userId, ticketId }) {
  if (!supportMessageId) return;
  const { error } = await supabaseAdmin.from('support_threads').upsert(
    {
      support_chat_id: supportChat,
      support_message_id: supportMessageId,
      user_chat_id: userChatId,
      user_id: userId || null,
      ticket_id: ticketId || null,
    },
    { onConflict: 'support_chat_id,support_message_id' }
  );
  if (error) console.error('support/webhook: thread upsert failed', error);
}

/** /start t123 — автор веб-формы подключает Telegram к своему обращению. */
async function linkTicket(chatId, payload, supportChat) {
  const ticketNo = Number(payload.slice(1));
  if (!Number.isInteger(ticketNo) || ticketNo <= 0) return false;

  const { data: ticket } = await supabaseAdmin
    .from('support_tickets')
    .select('id, ticket_no, user_id, support_message_id')
    .eq('ticket_no', ticketNo)
    .maybeSingle();

  if (!ticket) return false;

  // Карточка обращения уже лежит в группе — привязываем автора к ней, чтобы
  // ответ реплаем на эту самую карточку дошёл до него.
  if (ticket.support_message_id) {
    await rememberThread({
      supportChat,
      supportMessageId: ticket.support_message_id,
      userChatId: chatId,
      userId: ticket.user_id,
      ticketId: ticket.id,
    });
    await callTelegram('sendMessage', {
      chat_id: supportChat,
      text: `🔗 Автор обращения #${ticket.ticket_no} подключил Telegram — теперь на карточку можно отвечать реплаем.`,
      reply_to_message_id: ticket.support_message_id,
      allow_sending_without_reply: true,
    });
  }

  await sendMessage(
    chatId,
    `✅ Готово. Ответ по обращению <b>#${ticket.ticket_no}</b> придёт сюда.\n\nМожешь дописать детали — они тоже дойдут до нас.`
  );
  return true;
}

/** Сообщение от пользователя в личке бота. */
async function handleUserMessage(message, supportChat) {
  const chatId = message.chat.id;

  // Защита от флуда в рабочий чат с одного аккаунта.
  if (!rateLimit(`support-tg:${chatId}`, { max: 15, windowMs: 60_000 })) {
    return;
  }

  const header = [
    `💬 <b>Сообщение в поддержку</b>`,
    `👤 ${escapeHtml(describeTelegramUser(message.from))}`,
    `🆔 <code>${chatId}</code>`,
  ].join('\n');

  const headerId = await sendMessage(supportChat, header);
  await rememberThread({ supportChat, supportMessageId: headerId, userChatId: chatId });

  // Копируем исходное сообщение целиком — так в группу долетают и скриншоты,
  // которых в проблемах с оплатой больше, чем текста.
  const copyId = await copyMessage(supportChat, chatId, message.message_id, {
    reply_to_message_id: headerId || undefined,
    allow_sending_without_reply: true,
  });
  await rememberThread({ supportChat, supportMessageId: copyId, userChatId: chatId });

  if (headerId || copyId) {
    await sendMessage(chatId, '✅ Получили, скоро ответим сюда же.');
  } else {
    await sendMessage(
      chatId,
      '😔 Не получилось передать сообщение команде. Попробуй ещё раз через пару минут.'
    );
  }
}

/** Реплай кого-то из команды в рабочей группе — доставляем автору. */
async function handleTeamReply(message, supportChat) {
  const repliedId = message.reply_to_message?.message_id;
  if (!repliedId) return; // обычная болтовня в группе — не наше дело

  const { data: thread } = await supabaseAdmin
    .from('support_threads')
    .select('user_chat_id')
    .eq('support_chat_id', supportChat)
    .eq('support_message_id', repliedId)
    .maybeSingle();

  if (!thread) return; // реплай на что-то постороннее

  let ok;
  if (message.text) {
    ok = await sendMessage(
      thread.user_chat_id,
      `💬 <b>Поддержка Senti</b>\n\n${escapeHtml(clip(message.text, 3500))}`
    );
  } else {
    // Картинка/файл от команды — отдаём как есть, без «переслано от».
    ok = await copyMessage(thread.user_chat_id, supportChat, message.message_id);
  }

  if (ok) {
    // Тихая галочка вместо сообщения — чтобы не засорять рабочий чат.
    await callTelegram('setMessageReaction', {
      chat_id: supportChat,
      message_id: message.message_id,
      reaction: [{ type: 'emoji', emoji: '👍' }],
    });
  } else {
    await callTelegram('sendMessage', {
      chat_id: supportChat,
      text: '⚠️ Ответ не доставлен — человек, скорее всего, заблокировал бота.',
      reply_to_message_id: message.message_id,
      allow_sending_without_reply: true,
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  // Как и у бота уведомлений: принимаем только запросы с secret_token,
  // заданным при setWebhook. Иначе кто угодно слал бы поддельные апдейты.
  let expectedSecret;
  let supportChat;
  try {
    expectedSecret = supportWebhookSecret();
    supportChat = supportChatId();
  } catch (e) {
    console.error('support/webhook: not configured', e?.message || e);
    return res.status(500).json({ error: 'support bot is not configured' });
  }
  if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], expectedSecret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const message = req.body?.message;
  // Telegram ждёт 200 на любой апдейт, иначе будет ретраить его по кругу.
  if (!message || message.from?.is_bot) {
    return res.status(200).json({ ok: true });
  }

  try {
    if (message.chat.id === supportChat) {
      await handleTeamReply(message, supportChat);
    } else if (message.chat.type === 'private') {
      const text = message.text || '';
      if (text.startsWith('/start')) {
        const payload = text.split(' ')[1] || '';
        const linked = /^t\d{1,18}$/.test(payload) && (await linkTicket(message.chat.id, payload, supportChat));
        if (!linked) await sendMessage(message.chat.id, GREETING);
      } else {
        await handleUserMessage(message, supportChat);
      }
    }
    // Бота добавили в посторонний чат — молча игнорируем.
  } catch (e) {
    console.error('support/webhook: handler failed', e?.message || e);
  }

  return res.status(200).json({ ok: true });
}
