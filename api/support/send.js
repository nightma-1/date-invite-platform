/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 *
 * Форма «Написать в поддержку» на сайте. Доступна и гостям (половина
 * проблем — «не могу войти» и «оплатил, ничего не пришло», и требовать
 * авторизацию в такой момент бессмысленно), поэтому:
 *   * жёсткий лимит по IP — иначе форму превратят в спам-рассыльщик в наш чат;
 *   * длины всех полей ограничены до вставки в БД и до отправки в Telegram;
 *   * любой текст экранируется, parse_mode HTML не должен ломаться на «<».
 *
 * Обращение СНАЧАЛА пишется в support_tickets и только потом уходит в
 * Telegram: если Bot API в этот момент лежит, обращение всё равно сохранено.
 */

import { createClient } from '@supabase/supabase-js';
import { rateLimit, clientIp } from '../_lib/rateLimit.js';
import { supportChatId, sendMessage, escapeHtml, clip } from '../_lib/supportBot.js';

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;
const CONTACT_MAX = 120;
const TOPICS = ['payment', 'invitation', 'account', 'suggestion', 'other'];

const TOPIC_LABELS = {
  payment: '💳 Оплата',
  invitation: '💌 Приглашение',
  account: '🔑 Аккаунт и вход',
  suggestion: '💡 Предложение',
  other: '❔ Другое',
};

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/** Пользователь, если пришёл валидный Bearer-токен. Гостю просто вернём null. */
async function resolveUser(req) {
  const header = req.headers.authorization || '';
  const accessToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!accessToken) return null;

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}

function buildCard({ ticketNo, topic, user, contact, pageUrl, locale, message }) {
  const lines = [
    `🆘 <b>Обращение #${ticketNo}</b> · ${escapeHtml(TOPIC_LABELS[topic] || TOPIC_LABELS.other)}`,
    '',
    `👤 ${user ? escapeHtml(user.email || user.id) : 'Гость (не авторизован)'}`,
  ];
  if (contact) lines.push(`✉️ ${escapeHtml(contact)}`);
  if (pageUrl) lines.push(`📄 ${escapeHtml(pageUrl)}`);
  if (locale) lines.push(`🌐 ${escapeHtml(locale)}`);
  lines.push('', escapeHtml(message));
  lines.push('', '<i>Ответьте реплаем на это сообщение — если автор подключил Telegram, ответ уйдёт ему.</i>');
  return lines.join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  // 5 обращений за 15 минут с одного адреса: живому человеку хватает
  // с огромным запасом, скрипту — нет. Основной лимит всё равно
  // должен стоять в Vercel Firewall на /api/*.
  if (!rateLimit(`support-send:${clientIp(req)}`, { max: 5, windowMs: 15 * 60_000 })) {
    return res.status(429).json({ error: 'too many requests' });
  }

  const body = req.body || {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const contact = clip(typeof body.contact === 'string' ? body.contact : '', CONTACT_MAX);
  const topic = TOPICS.includes(body.topic) ? body.topic : 'other';
  const pageUrl = clip(typeof body.pageUrl === 'string' ? body.pageUrl : '', 300);
  const locale = clip(typeof body.locale === 'string' ? body.locale : '', 10);
  const userAgent = clip(req.headers['user-agent'] || '', 300);

  if (message.length < MESSAGE_MIN) {
    return res.status(400).json({ error: 'message too short', code: 'message_too_short' });
  }
  if (message.length > MESSAGE_MAX) {
    return res.status(400).json({ error: 'message too long', code: 'message_too_long' });
  }

  const user = await resolveUser(req);

  // Гостю без обратного адреса мы физически не сможем ответить.
  if (!user && !contact) {
    return res.status(400).json({ error: 'contact required', code: 'contact_required' });
  }

  const { data: ticket, error: insertError } = await supabaseAdmin
    .from('support_tickets')
    .insert({
      user_id: user?.id || null,
      email: user?.email || null,
      contact: contact || null,
      topic,
      message,
      page_url: pageUrl || null,
      locale: locale || null,
      user_agent: userAgent || null,
    })
    .select('id, ticket_no')
    .single();

  if (insertError || !ticket) {
    console.error('support/send: insert failed', insertError);
    return res.status(500).json({ error: 'could not save ticket' });
  }

  // С этого момента обращение не потеряно, даже если всё дальнейшее упадёт.
  let chatId;
  try {
    chatId = supportChatId();
  } catch (e) {
    console.error('support/send: support bot is not configured', e?.message || e);
    return res.status(200).json({ ok: true, ticket: ticket.ticket_no, delivered: false });
  }

  const messageId = await sendMessage(
    chatId,
    buildCard({ ticketNo: ticket.ticket_no, topic, user, contact, pageUrl, locale, message })
  );

  if (messageId) {
    await supabaseAdmin
      .from('support_tickets')
      .update({ support_message_id: messageId })
      .eq('id', ticket.id);
  }

  return res.status(200).json({ ok: true, ticket: ticket.ticket_no, delivered: !!messageId });
}
