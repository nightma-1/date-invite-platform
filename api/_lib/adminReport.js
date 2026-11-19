/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Сообщения владельцу сервиса в Telegram: утренняя сводка за вчера и
 * тревоги о сбоях оплаты/публикации. Получатели — все профили с is_admin
 * и подключённым ботом уведомлений (profiles.telegram_chat_id).
 *
 * Вызывается из api/telegram/notify.js (отдельной серверной функцией не
 * сделано намеренно: на тарифе Vercel лимит на их число, и он уже выбран).
 * Будит его база: send_daily_report() по pg_cron и track_event() при сбое.
 */

const TZ_OFFSET_MS = 5 * 60 * 60 * 1000; // Ташкент, UTC+5 без перехода на летнее время
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const ADMIN_URL = 'https://senti.uz/xujayin';

function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

const num = (v) => Number(v || 0).toLocaleString('ru-RU');
const money = (v) => `${num(v)} сум`;

/** Календарный день по Ташкенту, сдвинутый на offsetDays от сегодня. */
function tashkentDay(offsetDays) {
  const d = new Date(Date.now() + TZ_OFFSET_MS + offsetDays * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function dayRange(ymd) {
  const from = new Date(`${ymd}T00:00:00+05:00`);
  return { p_from: from.toISOString(), p_to: new Date(from.getTime() + DAY_MS).toISOString() };
}

function change(cur, prev) {
  const c = Number(cur || 0);
  const p = Number(prev || 0);
  if (!p) return '';
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return ' (как позавчера)';
  return pct > 0 ? ` (↑${pct}%)` : ` (↓${Math.abs(pct)}%)`;
}

async function adminChats(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('telegram_chat_id')
    .eq('is_admin', true)
    .not('telegram_chat_id', 'is', null);
  if (error) throw error;
  return (data || []).map((r) => r.telegram_chat_id);
}

async function broadcast(supabaseAdmin, sendMessage, text, button) {
  const chats = await adminChats(supabaseAdmin);
  const results = [];
  for (const chatId of chats) {
    results.push(await sendMessage(chatId, text, button));
  }
  return { ok: results.some((r) => r?.ok), sent: results.length };
}

export async function sendDailyReport(supabaseAdmin, sendMessage) {
  const yesterday = tashkentDay(-1);
  const before = tashkentDay(-2);

  const [{ data: cur, error: e1 }, { data: prev, error: e2 }] = await Promise.all([
    supabaseAdmin.rpc('admin_analytics', dayRange(yesterday)),
    supabaseAdmin.rpc('admin_analytics', dayRange(before)),
  ]);
  if (e1 || e2) throw e1 || e2;

  const t = cur.totals || {};
  const p = prev.totals || {};
  const [, m, d] = yesterday.split('-');
  const weekday = WEEKDAYS[new Date(`${yesterday}T12:00:00Z`).getUTCDay()];

  const lines = [
    `📊 <b>Senti за вчера, ${d}.${m} (${weekday})</b>`,
    '',
    `Посетители: <b>${num(t.visitors)}</b>${change(t.visitors, p.visitors)}`,
    `Открыли конструктор: ${num(t.builder_started)}${change(t.builder_started, p.builder_started)}`,
    `Нажали «Опубликовать»: ${num(t.builder_finished)}`,
    `Ушли на оплату: ${num(t.payment_started)}`,
    `Оплаты: <b>${num(t.paid)}</b> · ${money(t.revenue)}${change(t.revenue, p.revenue)}`,
  ];

  if (Number(t.spend) > 0) {
    const perPaid = Number(t.paid) > 0 ? money(Math.round(t.spend / t.paid)) : 'оплат нет';
    lines.push(`Реклама: ${money(t.spend)} · цена оплаты: ${perPaid}`);
  }

  lines.push(`Ответы получателей: ${num(t.responses)} (да: ${num(t.responses_yes)})`);

  const issues = Number(t.payment_timeouts || 0) + Number(t.publish_errors || 0);
  if (issues > 0) {
    lines.push('', `⚠️ Сбои: оплата без публикации — ${num(t.payment_timeouts)}, ошибка публикации — ${num(t.publish_errors)}`);
  }
  if (Number(t.support_tickets) > 0) {
    lines.push(`💬 Обращений в поддержку: ${num(t.support_tickets)}`);
  }

  return broadcast(supabaseAdmin, sendMessage, lines.join('\n'), { text: 'Открыть аналитику', url: ADMIN_URL });
}

const ALERT_TITLES = {
  payment_timeout: 'Оплата ушла, а приглашение не опубликовалось за 40 секунд',
  publish_error: 'Ошибка при публикации приглашения',
};

export async function sendAdminAlert(supabaseAdmin, sendMessage, extra = {}) {
  const title = ALERT_TITLES[extra.kind] || 'Сбой на сайте';
  const lines = [`⚠️ <b>Senti: ${esc(title)}</b>`];
  if (extra.message) lines.push(`Ошибка: <code>${esc(extra.message)}</code>`);
  if (extra.path) lines.push(`Страница: ${esc(extra.path)}`);
  if (extra.device) lines.push(`Устройство: ${esc(extra.device)}`);
  if (extra.kind === 'payment_timeout') {
    lines.push('', 'Проверьте платёж в Click и вебхук — человек, возможно, заплатил и ждёт ссылку.');
  }
  return broadcast(supabaseAdmin, sendMessage, lines.join('\n'), { text: 'Открыть админку', url: ADMIN_URL });
}
