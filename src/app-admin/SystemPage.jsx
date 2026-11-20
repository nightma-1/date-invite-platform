/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * «Состояние системы»: работает ли всё, что крутится само — задачи по
 * расписанию в базе (отчёт, напоминания, истечение приглашений…),
 * вызовы сервера из базы, оплата, ключи в Vercel, синхронизация расходов
 * из Meta. Красное — то, что надо чинить.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { A, Card, PageHeader, SectionTitle, DataTable, Badge, Button, money, formatDateTime } from './adminUi.jsx';

const JOB = {
  'daily-report-telegram': 'Утренний отчёт в Telegram (9:00)',
  'draft-reminders': 'Напоминания о неоплаченных черновиках',
  'expire-invitations-hourly': 'Истечение срока приглашений',
  'expiry-reminders-hourly': 'Напоминания авторам об окончании срока',
  'prune-analytics-daily': 'Очистка старой аналитики',
  'prune-support-threads-daily': 'Очистка старых переписок поддержки',
  'meta-spend-sync': 'Расходы из Meta Ads',
};

function ago(iso) {
  if (!iso) return '—';
  const m = (Date.now() - new Date(iso)) / 60000;
  if (m < 60) return `${Math.max(1, Math.round(m))} мин назад`;
  if (m < 48 * 60) return `${Math.round(m / 60)} ч назад`;
  return `${Math.round(m / 1440)} дн назад`;
}

function Check({ ok, warn, title, children }) {
  const tone = ok ? 'good' : warn ? 'warn' : 'bad';
  const icon = ok ? '✓' : warn ? '!' : '✕';
  const color = { good: A.good, warn: A.warn, bad: A.bad }[tone];
  return (
    <Card pad={12} style={{ borderColor: ok ? A.line : warn ? '#F5D9B0' : '#F3C7C7' }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: 11, background: { good: A.goodSoft, warn: A.warnSoft, bad: A.badSoft }[tone], color, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700 }}>{title}</p>
          <div style={{ margin: '2px 0 0', fontSize: 12.5, color: A.muted, lineHeight: 1.5 }}>{children}</div>
        </div>
      </div>
    </Card>
  );
}

export default function SystemPage() {
  const [h, setH] = useState(null);
  const [env, setEnv] = useState(null);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setError(null);
    const [{ data, error: err }, { data: s }] = await Promise.all([supabase.rpc('admin_system_health'), supabase.auth.getSession()]);
    if (err) setError(err.message);
    setH(data || null);
    try {
      const res = await fetch('/api/museum?action=env-health', { headers: { Authorization: `Bearer ${s.session?.access_token}` } });
      setEnv(res.ok ? await res.json() : null);
    } catch { setEnv(null); }
  }
  useEffect(() => { load(); }, []);

  async function syncMeta() {
    setSyncing(true);
    await supabase.rpc('request_meta_sync', { p_days: 30 });
    // Запрос уходит из базы асинхронно — ждём и перечитываем
    setTimeout(async () => { await load(); setSyncing(false); }, 8000);
  }

  if (error) return <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>;
  if (!h) return <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>;

  const failingJobs = (h.cron || []).filter((j) => j.last_status === 'failed' || (j.active && Number(j.fails_7d) > 0));
  const meta = h.meta_last;

  return (
    <div>
      <PageHeader
        title="Состояние системы"
        subtitle="Всё, что работает само: задачи по расписанию, оплата, бот, ключи, синхронизация рекламы."
        actions={<Button size="sm" onClick={load}>↻ Обновить</Button>}
      />

      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <Check ok={failingJobs.length === 0} title="Задачи по расписанию">
          {failingJobs.length === 0 ? `Все ${(h.cron || []).length} работают без ошибок.` : `С ошибками: ${failingJobs.map((j) => JOB[j.name] || j.name).join(', ')}.`}
        </Check>
        <Check ok={Number(h.http_errors_24h) === 0} warn={Number(h.http_errors_24h) > 0 && Number(h.http_errors_24h) < 5} title="Вызовы сервера из базы (бот, отчёты)">
          {Number(h.http_errors_24h) === 0 ? 'За сутки ошибок нет.' : `Ошибок за сутки: ${h.http_errors_24h}.`}
        </Check>
        <Check ok={env?.click !== false} title="Оплата Click">
          {env?.click === false ? 'Ключи Click не заданы в Vercel — оплата не работает.' : `Последняя оплата: ${h.last_paid_at ? `${ago(h.last_paid_at)} (${formatDateTime(h.last_paid_at)})` : 'ещё не было'}.`}
          {Number(h.payments_pending_stale) > 0 && ` Брошенных попыток за неделю: ${h.payments_pending_stale}.`}
          {Number(h.payments_failed_7d) > 0 && ` Отменённых: ${h.payments_failed_7d}.`}
        </Check>
        <Check ok={Number(h.publish_errors_7d) === 0} warn={Number(h.publish_errors_7d) > 0} title="Ошибки при оплате у людей">
          {Number(h.publish_errors_7d) === 0 ? 'За неделю не было.' : `За неделю: ${h.publish_errors_7d}. Подробности — у конкретного человека на странице «Люди».`}
        </Check>
        <Check ok={env?.telegramBot !== false && Number(h.reminders_failed_7d) === 0} warn={Number(h.reminders_failed_7d) > 0} title="Telegram-бот">
          {env?.telegramBot === false ? 'Токен бота не задан в Vercel.' : Number(h.reminders_failed_7d) > 0 ? `Недоставленных напоминаний за неделю: ${h.reminders_failed_7d} (бот заблокирован у человека).` : 'Работает.'}
        </Check>
        <Check ok={Boolean(h.last_event_at) && Date.now() - new Date(h.last_event_at) < 6 * 3600000} warn title="Аналитика пишется">
          Последнее событие: {ago(h.last_event_at)}.
        </Check>
        <Check ok={Boolean(env?.cronSecret)} warn={!env?.cronSecret} title="Очистка файлов «Музея» (Vercel)">
          {env == null ? 'Не удалось проверить.' : env.cronSecret ? 'Ключ CRON_SECRET задан.' : 'В Vercel нет CRON_SECRET — ежедневная очистка истёкших музеев не запускается. Пока музей не продаётся, это не страшно.'}
        </Check>
        <Check ok={Boolean(meta?.ok)} warn={!env?.meta} title="Расходы из Meta Ads">
          {!env?.meta
            ? 'Не подключено: в Vercel нужны META_ACCESS_TOKEN и META_AD_ACCOUNT_ID.'
            : meta
              ? (meta.ok ? `Синхронизировано ${ago(meta.at)}: ${meta.rows} строк, ${money(meta.spend_total)}${meta.currency && meta.currency !== 'UZS' ? ` (курс ${meta.currency} ${Math.round(meta.rate || 0).toLocaleString('ru-RU')})` : ''}.` : `Ошибка ${ago(meta.at)}: ${meta.error}`)
              : 'Ключи заданы, синхронизаций ещё не было.'}
          {env?.meta && (
            <div style={{ marginTop: 6 }}>
              <Button size="sm" disabled={syncing} onClick={syncMeta}>{syncing ? 'Синхронизирую…' : 'Синхронизировать сейчас (30 дней)'}</Button>
            </div>
          )}
        </Check>
        <Check ok={Number(h.new_tickets_7d) === 0} warn title="Поддержка">
          {Number(h.new_tickets_7d) === 0 ? 'Новых обращений за неделю нет.' : `Новых обращений за неделю: ${h.new_tickets_7d} — ответь в боте поддержки.`}
        </Check>
      </div>

      <SectionTitle>Задачи по расписанию</SectionTitle>
      <DataTable
        head={['Задача', 'Расписание (UTC)', { label: 'Последний запуск', align: 'left' }, 'Когда', 'Запусков за 7 дн', 'Ошибок']}
        rows={(h.cron || []).map((j) => ({
          key: j.name,
          muted: !j.active,
          cells: [
            { d: <span>{JOB[j.name] || j.name}<span style={{ color: A.muted, fontWeight: 400 }}> · {j.name}</span></span>, v: j.name },
            j.schedule,
            { d: j.last_status ? <span title={j.last_message || ''}><Badge tone={j.last_status === 'succeeded' ? 'good' : j.last_status === 'failed' ? 'bad' : 'warn'}>{j.last_status === 'succeeded' ? 'успешно' : j.last_status === 'failed' ? 'ошибка' : j.last_status}</Badge></span> : '—', v: j.last_status || null },
            { d: ago(j.last_start), v: j.last_start || null },
            { d: String(j.runs_7d), v: Number(j.runs_7d) },
            { d: Number(j.fails_7d) ? <b style={{ color: A.bad }}>{j.fails_7d}</b> : '0', v: Number(j.fails_7d) },
          ],
        }))}
      />

      {(h.http_last_errors || []).length > 0 && (
        <>
          <SectionTitle>Последние ошибки вызовов</SectionTitle>
          <div style={{ display: 'grid', gap: 6 }}>
            {h.http_last_errors.map((e, i) => (
              <Card key={i} pad={10}><div style={{ fontSize: 12.5 }}><Badge tone="bad">{e.status_code || 'сеть'}</Badge> <span style={{ color: A.muted }}>{formatDateTime(e.at)}</span> · {e.message}</div></Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
