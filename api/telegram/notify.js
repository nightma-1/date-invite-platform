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
import { sendDailyReport, sendAdminAlert, broadcast } from '../_lib/adminReport.js';
import { syncMetaSpend } from '../_lib/metaSync.js';
import { feedbackTexts, ratingKeyboard } from '../_lib/dateFeedback.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Ссылки на сам senti.uz открываем как Mini App — прямо в Telegram, без
// окна «Перейти по ссылке» и без ухода в браузер. web_app-кнопки Telegram
// разрешает только в личных чатах (chat_id > 0); в группах — обычная ссылка.
function inlineButton(button, chatId, asWebApp = true) {
  const origin = (process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const ownSite = origin && button.url.startsWith(`${origin}/`);
  if (asWebApp && ownSite && Number(chatId) > 0) {
    return { text: button.text, web_app: { url: button.url } };
  }
  return { text: button.text, url: button.url };
}

async function sendMessage(chatId, text, button, asWebApp = true) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (button?.url?.startsWith('https://')) {
    body.reply_markup = { inline_keyboard: [[inlineButton(button, chatId, asWebApp)]] };
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
  // Telegram отверг Mini App-кнопку — пробуем обычную ссылку, потом без кнопки.
  if (body.reply_markup) {
    const usedWebApp = Boolean(body.reply_markup.inline_keyboard[0][0].web_app);
    const retry = await sendMessage(chatId, text, usedWebApp ? button : null, false);
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

// Тексты «Нашего музея»: здесь важнее всего позвать автора зайти прямо сейчас
function formatMuseumViewed(invitation, extra) {
  const g = invitation.recipient_gender;
  const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
  const count = Number(extra?.view_count) || 1;
  return count <= 1
    ? `🖼 ${name} ${verb(g, 'открыл')} твой музей. Зайди, и вы встретитесь внутри.`
    : `🖼 ${name} снова в музее, уже ${ordinal(count)}. Можно зайти вместе.`;
}

function formatMuseumAnswered(invitation, extra) {
  const g = invitation.recipient_gender;
  const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
  const attempts = Number(extra?.no_attempts) || 0;
  const lines = [`❤️ ${name} ${verb(g, 'сказал')} «да» в конце твоего музея!`];
  if (attempts > 0) lines.push('', `Перед этим ${verb(g, 'пытался')} поймать «Нет» ${attempts} ${times(attempts)} 😄`);
  return lines.join('\n');
}

function formatMuseumExpiring(invitation, extra) {
  const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
  const left = extra?.expires_at ? new Date(extra.expires_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Tashkent' }) : 'завтра';
  return `⏳ Музей для ${name} закроется ${left}. Его можно продлить в кабинете, иначе ссылка перестанет работать.`;
}

function formatMuseumEarly(invitation, extra) {
  const g = invitation.recipient_gender;
  const when = extra?.opens_at
    ? new Date(extra.opens_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })
    : '';
  return `👀 <b>${escapeHtml(invitation.recipient_name)}</b> ${verb(g, 'открыл')} ссылку раньше времени и пока видит отсчёт. Музей откроется ${when}.`;
}

function formatGuestPhoto(invitation, extra) {
  return `📷 <b>${escapeHtml(extra?.author)}</b> добавил(а) фото в музей для ${escapeHtml(invitation.recipient_name)}. Если оно лишнее, его можно скрыть в кабинете.`;
}

function formatGuestbook(invitation, extra) {
  return `✍️ <b>${escapeHtml(extra?.author)}</b> оставил(а) запись в музее для ${escapeHtml(invitation.recipient_name)}:\n\n${escapeHtml(extra?.message)}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

// На языке самого приглашения: каким человек пользовался в конструкторе,
// таким и пишем напоминание (uz — на «Siz», как в интерфейсе).
function formatDraftReminder(invitation, lang) {
  const name = `<b>${escapeHtml(invitation.recipient_name || '')}</b>`;
  if (lang === 'uz') {
    return [
      `💌 ${name} uchun taklifnoma deyarli tayyor — to'lovni amalga oshirsangiz, havolani yuborishingiz mumkin.\n\nU kabinetingizda saqlangan, qaytadan hech narsa qilish shart emas.`,
      "To'lash va yuborish",
    ];
  }
  if (lang === 'en') {
    return [
      `💌 Your invitation for ${name} is almost ready — just pay and you can send the link.\n\nIt's saved in your dashboard, no need to start over.`,
      'Pay and send',
    ];
  }
  return [
    `💌 Приглашение для ${name} почти готово — осталось оплатить, и можно отправлять ссылку.\n\nОно сохранено в кабинете, заново ничего делать не нужно.`,
    'Оплатить и отправить',
  ];
}

async function formatReminderCopy(invitation, lang, result, text) {
  let owner = invitation.user_id?.slice(0, 8);
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(invitation.user_id);
    const u = data?.user;
    owner = u?.email || u?.user_metadata?.full_name || u?.user_metadata?.name || owner;
  } catch { /* не критично — покажем короткий id */ }
  const status = result.ok ? '✅ доставлено' : `❌ не доставлено: ${escapeHtml(result.description || result.status || '')}`;
  return [
    '📨 <b>Отправлено напоминание об оплате</b>',
    `Кому: ${escapeHtml(owner)} · язык: ${escapeHtml(lang)}`,
    `Приглашение для <b>${escapeHtml(invitation.recipient_name || '—')}</b>`,
    status,
    '',
    '<i>Текст, который получил человек:</i>',
    text,
  ].join('\n');
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

  // Сообщения владельцу сервиса, не привязанные к приглашению:
  // утренняя сводка (pg_cron → send_daily_report) и тревоги о сбоях
  // (track_event при payment_timeout/publish_error). См. _lib/adminReport.js.
  if (event === 'daily_report' || event === 'admin_alert') {
    try {
      const result = event === 'daily_report'
        ? await sendDailyReport(supabaseAdmin, sendMessage)
        : await sendAdminAlert(supabaseAdmin, sendMessage, extra || {});
      return res.status(200).json(result);
    } catch (err) {
      console.error(`telegram/notify: ${event} failed`, err?.message || err);
      return res.status(500).json({ ok: false });
    }
  }

  // Кнопка «Прислать себе» в админке: тот же текст, что получают люди
  // Расходы из Meta Marketing API (pg_cron раз в день или кнопка в админке)
  if (event === 'meta_sync') {
    return res.status(200).json(await syncMetaSpend(supabaseAdmin, Number(extra?.days) || 7));
  }

  // Сообщение автору от админа (админка → admin_message_user)
  if (event === 'admin_message') {
    const { data: to } = await supabaseAdmin.from('profiles')
      .select('telegram_chat_id').eq('id', extra?.user_id || '').maybeSingle();
    const text = String(extra?.text || '').trim().slice(0, 3500);
    if (!to?.telegram_chat_id || !text) return res.status(200).json({ ok: false, reason: 'no chat' });
    return res.status(200).json(await sendMessage(to.telegram_chat_id, escapeHtml(text), {
      text: 'Открыть кабинет', url: appUrl('/dashboard'),
    }));
  }

  if (event === 'draft_reminder_test') {
    const { data: me } = await supabaseAdmin.from('profiles')
      .select('telegram_chat_id, is_admin').eq('id', extra?.user_id || '').maybeSingle();
    if (!me?.is_admin || !me.telegram_chat_id) return res.status(200).json({ ok: false, reason: 'no admin chat' });
    const sample = { recipient_name: { ru: 'Алия', uz: 'Aliya', en: 'Aliya' }[extra?.lang] || 'Алия' };
    const [text, buttonText] = formatDraftReminder(sample, extra?.lang);
    return res.status(200).json(await sendMessage(me.telegram_chat_id, text, { text: buttonText, url: appUrl('/dashboard') }));
  }

  if (!invitationId || !event) {
    return res.status(400).json({ error: 'invitation_id и event обязательны' });
  }

  const { data: invitation, error: invError } = await supabaseAdmin
    .from('invitations')
    .select('id, slug, kind, status, recipient_name, recipient_gender, user_id, reply_kind, profiles(telegram_chat_id), invitation_steps(id, step_type, configuration_json)')
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

  // Напоминание о неоплаченном черновике (pg_cron → send_draft_reminders).
  // К моменту отправки человек мог уже оплатить — тогда молчим.
  // Итог пишем в журнал draft_reminders, копию — админам (страница
  // /xujayin/reminders показывает историю и что было после).
  if (event === 'draft_reminder') {
    const reminderId = extra?.reminder_id || null;
    const logResult = async (delivered, error) => {
      if (!reminderId) return;
      const { error: e } = await supabaseAdmin.from('draft_reminders')
        .update({ delivered, error: error ? String(error).slice(0, 300) : null }).eq('id', reminderId);
      if (e) console.error('telegram/notify: draft_reminders log failed', e.message);
    };
    if (invitation.status !== 'draft') {
      await logResult(false, 'already paid');
      return res.status(200).json({ ok: false, reason: 'already paid' });
    }
    const lang = invitation.invitation_steps?.find((s) => s.step_type === 'question')?.configuration_json?.lang || 'ru';
    const [text, buttonText] = formatDraftReminder(invitation, lang);
    const result = await sendMessage(chatId, text, { text: buttonText, url: appUrl('/dashboard') });
    await logResult(Boolean(result.ok), result.ok ? null : result.description || `status ${result.status}`);
    try {
      await broadcast(supabaseAdmin, sendMessage, await formatReminderCopy(invitation, lang, result, text), {
        text: 'Все напоминания', url: 'https://senti.uz/xujayin/reminders',
      });
    } catch (err) {
      console.error('telegram/notify: reminder copy failed', err?.message || err);
    }
    return res.status(200).json(result);
  }

  // Получательница ответила на приглашение (открытка или «спасибо за вечер»,
  // триггер trg_reply_published_notify). Пишем автору исходного приглашения.
  if (event === 'reply_published') {
    const g = invitation.recipient_gender;
    const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
    const slug = String(extra?.reply_slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const text = extra?.reply_kind === 'thanks'
      ? `🌙 ${name} благодарит за вечер и зовёт тебя на второе свидание!`
      : `💌 ${name} ${verb(g, 'ответил')} тебе открыткой на твоё приглашение!`;
    return res.status(200).json(await sendMessage(chatId, text, slug ? { text: 'Открыть', url: appUrl(`/i/${slug}`) } : null));
  }

  // «Как прошло свидание?» (pg_cron → send_date_followups). Кнопки-оценки
  // ведут в api/telegram/webhook.js, там же согласие и отзыв.
  if (event === 'date_followup') {
    const lang = ['ru', 'uz', 'en'].includes(extra?.lang) ? extra.lang : 'ru';
    const name = escapeHtml(invitation.recipient_name || '');
    const res2 = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text: feedbackTexts(lang).ask(name), parse_mode: 'HTML',
        reply_markup: ratingKeyboard(lang, invitation.id),
      }),
    });
    if (!res2.ok) console.error('telegram/notify: date_followup failed', res2.status, (await res2.text()).slice(0, 300));
    return res.status(200).json({ ok: res2.ok });
  }

  // Кнопка ведёт прямо на ответ в кабинете — повод вернуться на сайт.
  // На просмотр кнопку не ставим: там нечего открывать, кроме ожидания.
  let result;
  const museumUrl = invitation.slug ? appUrl(`/i/${invitation.slug}`) : null;
  if (invitation.kind === 'museum') {
    const museum = {
      viewed: [formatMuseumViewed, { text: 'Войти в музей', url: museumUrl }],
      answered: [formatMuseumAnswered, { text: 'Войти в музей', url: museumUrl }],
      guestbook: [formatGuestbook, { text: 'Войти в музей', url: museumUrl }],
      early: [formatMuseumEarly, null],
      guest_photo: [formatGuestPhoto, { text: 'Открыть кабинет', url: appUrl('/dashboard') }],
      expiring: [formatMuseumExpiring, { text: 'Продлить', url: appUrl('/dashboard') }],
    }[event];
    if (!museum) return res.status(200).json({ ok: false, reason: 'unknown event' });
    return res.status(200).json(await sendMessage(chatId, museum[0](invitation, extra), museum[1]));
  }

  if (event === 'answered' && invitation.kind === 'occasion') {
    // Поводы шлют автору готовую строку на каждый шаг получателя
    // («Муниса простила 🤍», «открыла подарок») — см. OccasionFrame.jsx.
    const line = String(extra?.selections?.last || '').slice(0, 300);
    if (!line) return res.status(200).json({ ok: false, reason: 'empty occasion event' });
    result = await sendMessage(chatId, `💌 ${escapeHtml(line)}`, {
      text: 'Мои приглашения',
      url: appUrl('/dashboard'),
    });
  } else if (event === 'answered' && invitation.reply_kind === 'card') {
    // Он открыл её ответную открытку и нажал «Принимаю» / «Жду встречи»
    const name = `<b>${escapeHtml(invitation.recipient_name)}</b>`;
    const text = extra?.selections?.condition === 'accepted'
      ? `❤️ ${name} принял твоё условие! Значит, до встречи 😄`
      : `💌 ${name} открыл твой ответ и ждёт встречи!`;
    result = await sendMessage(chatId, text, { text: 'Мои приглашения', url: appUrl('/dashboard') });
  } else if (event === 'answered') {
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
