/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyLinkCode, webhookSecret, safeEqual } from '../_lib/telegramLink.js';
import { feedbackTexts, parseFeedbackCallback, consentKeyboard, adminCopy } from '../_lib/dateFeedback.js';
import { broadcast } from '../_lib/adminReport.js';

// Service-role клиент — только на сервере, никогда не попадает на клиент
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

function miniAppKeyboard() {
  const origin = (process.env.PUBLIC_APP_URL || 'https://senti.uz').replace(/\/+$/, '');
  return {
    inline_keyboard: [
      [{ text: '💌 Создать приглашение', web_app: { url: `${origin}/?utm_source=telegram&utm_medium=miniapp` } }],
      [{ text: '📋 Мои приглашения', web_app: { url: `${origin}/dashboard?utm_source=telegram&utm_medium=miniapp` } }],
    ],
  };
}

async function tg(method, body) {
  const res = await fetch(`${TELEGRAM_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`telegram webhook: ${method} failed`, res.status, (await res.text()).slice(0, 300));
  return { ok: res.ok };
}

async function sendMessage(chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return tg('sendMessage', body);
}

// Для broadcast() из adminReport: там кнопка-ссылка, здесь она не нужна
const sendPlain = (chatId, text) => sendMessage(chatId, text);

async function notifyAdmins(row) {
  try {
    const { data: inv } = await supabaseAdmin.from('invitations')
      .select('slug, recipient_name').eq('id', row.invitation_id).maybeSingle();
    await broadcast(supabaseAdmin, sendPlain, adminCopy(row, inv));
  } catch (err) {
    console.error('telegram webhook: admin copy failed', err?.message || err);
  }
}

/**
 * Кнопки «Как прошло свидание?» (см. api/_lib/dateFeedback.js).
 * Отвечать может только тот чат, которому вопрос отправили.
 */
async function handleFeedbackCallback(cq) {
  const parsed = parseFeedbackCallback(cq.data);
  const chatId = cq.message?.chat?.id;
  if (!parsed || !chatId) return tg('answerCallbackQuery', { callback_query_id: cq.id });

  const { data: row } = await supabaseAdmin.from('date_feedback')
    .select('*').eq('invitation_id', parsed.invitationId).maybeSingle();
  if (!row || String(row.chat_id) !== String(chatId)) {
    return tg('answerCallbackQuery', { callback_query_id: cq.id });
  }
  const t = feedbackTexts(row.lang);
  await tg('answerCallbackQuery', { callback_query_id: cq.id });
  // Убираем кнопки у отвеченного сообщения, чтобы не жали дважды
  await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });

  const patch = { updated_at: new Date().toISOString() };
  let next;
  if (parsed.kind === 'rating') {
    patch.rating = parsed.value;
    if (parsed.value === 'great') {
      next = () => sendMessage(chatId, t.consentAsk, consentKeyboard(row.lang, row.invitation_id));
    } else {
      patch.awaiting_review = parsed.value === 'ok';
      next = parsed.value === 'ok'
        ? () => sendMessage(chatId, t.reviewAsk, { force_reply: true })
        : () => sendMessage(chatId, t.thanksBad);
    }
  } else {
    patch.consent = parsed.value;
    patch.awaiting_review = true;
    next = () => sendMessage(chatId, t.reviewAsk, { force_reply: true });
  }

  const { data: saved, error } = await supabaseAdmin.from('date_feedback')
    .update(patch).eq('invitation_id', row.invitation_id).select('*').maybeSingle();
  if (error) console.error('telegram webhook: date_feedback update failed', error.message);
  await next();
  if (saved) await notifyAdmins(saved);
  return { ok: true };
}

/** Текстовый ответ на «напишите пару слов» — последний открытый вопрос этого чата */
async function handleReviewText(message) {
  const chatId = message.chat.id;
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: row } = await supabaseAdmin.from('date_feedback')
    .select('*').eq('chat_id', chatId).eq('awaiting_review', true).gte('updated_at', since)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!row) return false;

  const review = String(message.text || '').trim().slice(0, 1000);
  if (!review) return false;
  const { data: saved, error } = await supabaseAdmin.from('date_feedback')
    .update({ review, awaiting_review: false, updated_at: new Date().toISOString() })
    .eq('invitation_id', row.invitation_id).select('*').maybeSingle();
  if (error) {
    console.error('telegram webhook: review save failed', error.message);
    return false;
  }
  await sendMessage(chatId, feedbackTexts(row.lang).thanksReview);
  if (saved) await notifyAdmins(saved);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  // Запросы принимаем только от Telegram: при setWebhook задаётся secret_token,
  // и Telegram присылает его в этом заголовке. Без проверки любой мог слать
  // поддельные апдейты и привязывать свой chat_id к чужому аккаунту.
  let expectedSecret;
  try {
    expectedSecret = webhookSecret();
  } catch (e) {
    return res.status(500).json({ error: 'telegram bot is not configured' });
  }
  if (!safeEqual(req.headers['x-telegram-bot-api-secret-token'], expectedSecret)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const update = req.body;
  const message = update?.message;

  if (update?.callback_query) {
    try {
      await handleFeedbackCallback(update.callback_query);
    } catch (err) {
      console.error('telegram webhook: callback failed', err?.message || err);
    }
    return res.status(200).json({ ok: true });
  }

  if (message?.text && !message.text.startsWith('/')) {
    try {
      await handleReviewText(message);
    } catch (err) {
      console.error('telegram webhook: review failed', err?.message || err);
    }
    return res.status(200).json({ ok: true });
  }

  if (!message?.text?.startsWith('/start')) {
    // Не команда /start — просто подтверждаем получение, ничего не делаем
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const parts = message.text.split(' ');
  const code = parts[1]; // deep-link: t.me/bot?start={подписанный код из /api/telegram/connect}
  const userId = code ? verifyLinkCode(code) : null;

  if (!userId) {
    // Обычный /start: открыть Senti прямо в Telegram (Mini App) + как подключить уведомления
    await sendMessage(
      chatId,
      '💌 Собери приглашение на свидание прямо здесь — за 3 минуты, одной ссылкой.\n\nЧтобы я присылал сюда ответы на твои приглашения, зайди в «Мои приглашения» и нажми «Получать ответы в Telegram».',
      miniAppKeyboard()
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