/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 *
 * Вызывается не пользователем, а Postgres-триггером в Supabase (через pg_net)
 * при просмотре приглашения или при ответе получателя — см. миграцию
 * telegram_notifications. Проверяем общий секрет в заголовке, а не auth
 * пользователя: у этого запроса его просто нет.
 */

import { createClient } from '@supabase/supabase-js';
import { safeEqual } from '../_lib/telegramLink.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text, button) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (button?.url?.startsWith('https://')) {
    body.reply_markup = { inline_keyboard: [[{ text: button.text, url: button.url }]] };
  }
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };

  const description = (await res.text()).slice(0, 300);
  console.error('telegram/notify: sendMessage failed', res.status, description);

  // Кнопка — приятное дополнение, а не повод потерять уведомление:
  // если Telegram отверг сообщение с кнопкой, шлём то же самое без неё.
  if (body.reply_markup) {
    const retry = await sendMessage(chatId, text, null);
    return { ...retry, firstError: description };
  }
  return { ok: false, status: res.status, description };
}

// Род глагола по полу получателя, который автор выбрал в конструкторе.
// Формы явные: «пытался → пыталась» склейкой окончаний не получить.
const VERBS = {
  открыл: ['открыл', 'открыла', 'открыл(а)'],
  ответил: ['ответил', 'ответила', 'ответил(а)'],
  сказал: ['сказал', 'сказала', 'сказал(а)'],
  попробовал: ['попробовал', 'попробовала', 'попробовал(а)'],
  пытался: ['пытался', 'пыталась', 'пытался(-ась)'],
};

function verb(gender, base) {
  const forms = VERBS[base];
  if (!forms) return base;
  return gender === 'male' ? forms[0] : gender === 'female' ? forms[1] : forms[2];
}

function appUrl(path) {
  const origin = (process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
  return origin ? `${origin}${path}` : null;
}

// 2 раза, 5 раз, 22 раза, 11 раз
function times(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'раза' : 'раз';
}

function ordinal(n) {
  return `${n}-й раз`;
}

// selections хранится как { [invitation_steps.id]: [optionId, ...] } —
// разворачиваем в читаемые "иконка + название" по конфигу шага (то же самое,
// что decodeSelections в app-dashboard/InvitationList.jsx).
function decodeSelections(steps, selections) {
  if (!selections || !steps?.length) return [];
  return steps
    .filter((s) => s.step_type === 'choice_place' || s.step_type === 'choice_food' || s.step_type === 'choice_block')
    .map((step) => {
      const ids = selections[step.id];
      if (!ids || ids.length === 0) return null;
      const options = step.configuration_json?.options || [];
      const labels = ids.map((id) => {
        const opt = options.find((o) => o.id === id);
        return opt ? `${opt.icon || ''} ${opt.label}`.trim() : id;
      });
      return { title: step.configuration_json?.title || 'Выбор', labels };
    })
    .filter(Boolean);
}

function formatAnswered(invitation, extra) {
  const g = invitation.recipient_gender;
  const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
  const lines = extra?.answered_yes === false
    ? [`${name} ${verb(g, 'ответил')} на приглашение.`, '', 'Ответ: нет.']
    : Number(extra?.answer_count) > 1
      ? [`❤️ ${name} ${verb(g, 'ответил')} ещё раз — снова «да»! (ответ №${Number(extra.answer_count)})`, '']
      : [`❤️ ${name} ${verb(g, 'сказал')} «да»!`, ''];

  if (extra?.selected_date) lines.push(`📅 Дата: ${escapeHtml(extra.selected_date)}`);
  if (extra?.selected_time) lines.push(`🕒 Время: ${escapeHtml(String(extra.selected_time).slice(0, 5))}`);

  const choiceAnswers = decodeSelections(invitation.invitation_steps, extra?.selections);
  for (const c of choiceAnswers) {
    lines.push(`${escapeHtml(c.title)}: ${escapeHtml(c.labels.join(', '))}`);
  }

  const attempts = Number(extra?.no_attempts) || 0;
  if (extra?.answered_yes !== false && attempts > 0) {
    lines.push('', attempts === 1
      ? `Перед «да» ${verb(g, 'попробовал')} нажать «Нет» один раз 😄`
      : `Перед «да» ${verb(g, 'пытался')} поймать «Нет» ${attempts} ${times(attempts)} 😄`);
  }

  return lines.join('\n');
}

function formatViewed(invitation, extra) {
  const g = invitation.recipient_gender;
  const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
  const count = Number(extra?.view_count) || 1;
  if (count <= 1) {
    return `👀 ${name} ${verb(g, 'открыл')} твоё приглашение. Ждём ответа…`;
  }
  return `👀 ${name} снова ${verb(g, 'открыл')} приглашение — уже ${ordinal(count)}.`;
}

// Напоминание за сутки до конца срока, если ответа ещё нет. Шлёт
// планировщик в базе (send_expiry_reminders, раз в час), а не триггер.
function formatExpiring(invitation, extra) {
  const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
  let when = 'через сутки';
  if (extra?.expires_at) {
    const time = new Date(extra.expires_at).toLocaleTimeString('ru-RU', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent',
    });
    when = `завтра в ${time}`;
  }
  return `⏳ Приглашение для ${name} перестанет открываться ${when}. Ответа пока нет.`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const secret = req.headers['x-notify-secret'];
  if (!process.env.NOTIFY_WEBHOOK_SECRET || !safeEqual(secret, process.env.NOTIFY_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { invitation_id: invitationId, event, extra } = req.body || {};
  if (!invitationId || !event) {
    return res.status(400).json({ error: 'invitation_id и event обязательны' });
  }

  const { data: invitation, error: invError } = await supabaseAdmin
    .from('invitations')
    .select('id, recipient_name, recipient_gender, user_id, profiles(telegram_chat_id), invitation_steps(id, step_type, configuration_json)')
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

  // Кнопка ведёт прямо на ответ в кабинете — повод вернуться на сайт.
  // На просмотр кнопку не ставим: там нечего открывать, кроме ожидания.
  let result;
  if (event === 'answered') {
    result = await sendMessage(chatId, formatAnswered(invitation, extra), {
      text: 'Открыть ответ',
      url: appUrl(`/dashboard/response/${invitation.id}`),
    });
  } else if (event === 'expiring') {
    result = await sendMessage(chatId, formatExpiring(invitation, extra), {
      text: 'Открыть кабинет',
      url: appUrl('/dashboard'),
    });
  } else {
    result = await sendMessage(chatId, formatViewed(invitation, extra));
  }

  // Ответ уходит в pg_net и сохраняется в net._http_response — так причину
  // отказа Telegram видно прямо в базе, даже когда логи функции пусты.
  return res.status(200).json(result);
}
