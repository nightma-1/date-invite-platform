/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Напоминания об оплате брошенных черновиков (send_draft_reminders, pg_cron).
 * Здесь видно: включены ли они, сколько ушло и сколько людей после этого
 * заплатило, история каждой отправки и очередь — кто получит напоминание
 * и почему кто-то не получит. Кнопка «Прислать себе» шлёт в Telegram ровно
 * тот текст, который видят люди. Копия каждой настоящей отправки тоже
 * приходит админам в бот.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import {
  A, Card, PageHeader, SectionTitle, StatGrid, Stat, DataTable, Segmented, Badge, Button, money, num, formatDateTime,
} from './adminUi.jsx';

const LANG = { ru: 'Рус', uz: "O'zb", en: 'Eng' };
const INVITATION_STATUS = {
  draft: ['черновик', 'neutral'], published: ['опубликовано', 'good'], expired: ['истекло', 'neutral'],
  archived: ['в архиве', 'neutral'], deleted: ['удалено', 'neutral'],
};
const QUEUE_STATE = {
  waiting: ['Ждёт 3 часа', 'accent'],
  next_run: ['Скоро уйдёт', 'accent'],
  sent: ['Уже отправлено', 'good'],
  no_bot: ['Нет бота — не дойдёт', 'warn'],
  too_old: ['Старше 3 дней', 'neutral'],
  weekly_limit: ['Уже было на этой неделе', 'neutral'],
  paid_other: ['Оплатил другое', 'good'],
};

// Когда реально уйдёт: cron в :17 каждого часа с 9:17 до 22:17 по Ташкенту
// (04–17 UTC), но не раньше чем через 3 часа после создания черновика.
function nextSlot(fromIso) {
  const t = new Date(Math.max(new Date(fromIso).getTime(), Date.now()));
  const d = new Date(t);
  d.setUTCMinutes(17, 0, 0);
  if (d < t) d.setUTCHours(d.getUTCHours() + 1);
  for (let i = 0; i < 48; i += 1) {
    const hr = d.getUTCHours();
    if (hr >= 4 && hr <= 17) return d.toISOString();
    d.setUTCHours(hr + 1);
  }
  return d.toISOString();
}

function plural(n, one, few, many) {
  const m10 = n % 10; const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
}

function hoursBetween(a, b) {
  const h = (new Date(b) - new Date(a)) / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} мин`;
  if (h < 48) return `${Math.round(h)} ч`;
  return `${Math.round(h / 24)} дн`;
}

export default function RemindersPage() {
  const [log, setLog] = useState(null);
  const [queue, setQueue] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [queueFilter, setQueueFilter] = useState('upcoming');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  async function load() {
    setError(null);
    const [l, q, s] = await Promise.all([
      supabase.rpc('admin_draft_reminders'),
      supabase.rpc('admin_reminder_queue'),
      supabase.rpc('admin_reminder_settings'),
    ]);
    const err = l.error || q.error || s.error;
    if (err) setError(err.message || 'Не получилось загрузить данные.');
    setLog(l.data || []);
    setQueue(q.data || []);
    setSettings(s.data || null);
  }
  useEffect(() => { load(); }, []);

  async function setEnabled(enabled) {
    setBusy(true);
    const { error: err } = await supabase.rpc('admin_set_draft_reminders', { p_enabled: enabled });
    setBusy(false);
    if (err) { setNotice(err.message); return; }
    setSettings((s) => ({ ...s, enabled }));
    setNotice(enabled ? 'Напоминания включены.' : 'Напоминания выключены — новые отправляться не будут.');
  }

  async function sendTest(lang) {
    setBusy(true);
    const { error: err } = await supabase.rpc('admin_test_draft_reminder', { p_lang: lang });
    setBusy(false);
    setNotice(err ? err.message : 'Отправлено тебе в Telegram — проверь бота через пару секунд.');
  }

  const stats = useMemo(() => {
    const rows = log || [];
    const delivered = rows.filter((r) => r.delivered === true);
    const paid = rows.filter((r) => r.paid_at);
    const pending = rows.filter((r) => r.delivered === null);
    const hours = paid.map((r) => (new Date(r.paid_at) - new Date(r.sent_at)) / 3600000).sort((a, b) => a - b);
    return {
      sent: rows.length,
      delivered: delivered.length,
      failed: rows.filter((r) => r.delivered === false).length,
      pending: pending.length,
      paid: paid.length,
      revenue: paid.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
      conversion: delivered.length ? Math.round((paid.length / delivered.length) * 100) : 0,
      medianHours: hours.length ? hours[Math.floor(hours.length / 2)] : null,
    };
  }, [log]);

  const queueCounts = useMemo(() => {
    const c = {};
    for (const r of queue || []) c[r.state] = (c[r.state] || 0) + 1;
    return c;
  }, [queue]);

  const queueRows = useMemo(() => (queue || []).filter((r) => {
    if (queueFilter === 'all') return true;
    if (queueFilter === 'upcoming') return r.state === 'waiting' || r.state === 'next_run';
    return r.state === queueFilter;
  }), [queue, queueFilter]);

  return (
    <div>
      <PageHeader
        title="Напоминания"
        subtitle="Если черновик не оплачен 3 часа, бот @sentiuz_bot один раз напоминает автору. С 9:00 до 22:00 по Ташкенту, не чаще раза в неделю на человека."
        actions={<Button size="sm" onClick={load}>↻ Обновить</Button>}
      />

      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
              {settings == null ? 'Загрузка…' : settings.enabled ? <Badge tone="good">Включены</Badge> : <Badge tone="bad">Выключены</Badge>}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: A.muted, lineHeight: 1.5 }}>
              Копия каждого напоминания приходит тебе в бот в момент отправки.
              {settings && !settings.admin_has_bot && (
                <span style={{ color: A.warn }}> У твоего аккаунта бот не подключён — копии и тест не дойдут.</span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {settings && (
              <Button size="sm" disabled={busy} onClick={() => setEnabled(!settings.enabled)}>
                {settings.enabled ? 'Выключить' : 'Включить'}
              </Button>
            )}
            <Button size="sm" variant="primary" disabled={busy} onClick={() => sendTest('ru')}>Прислать себе (рус)</Button>
            <Button size="sm" disabled={busy} onClick={() => sendTest('uz')}>O'zb</Button>
            <Button size="sm" disabled={busy} onClick={() => sendTest('en')}>Eng</Button>
          </div>
        </div>
        {notice && <p style={{ margin: '10px 0 0', fontSize: 12.5, color: A.ink }}>{notice}</p>}
      </Card>

      <StatGrid style={{ marginBottom: 8 }}>
        <Stat label="Отправлено" value={num(stats.sent)} sub={stats.pending ? `${stats.pending} ещё без ответа от Telegram` : 'за всё время'} />
        <Stat label="Доставлено" value={num(stats.delivered)} sub={stats.failed ? `${stats.failed} ${plural(stats.failed, 'не дошло', 'не дошли', 'не дошли')} — бот заблокирован?` : undefined} alert={stats.failed > 0 && stats.failed >= stats.delivered} />
        <Stat label="Оплатили после" value={num(stats.paid)} sub={money(stats.revenue)} />
        <Stat
          label="Конверсия"
          value={`${stats.conversion}%`}
          sub={stats.medianHours != null ? `оплачивают через ~${hoursBetween(0, stats.medianHours * 3600000)}` : 'от доставленных'}
          muted={stats.delivered < 5}
        />
      </StatGrid>
      {stats.delivered > 0 && stats.delivered < 5 && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: A.muted }}>Пока мало отправок — процент ещё ничего не говорит.</p>
      )}

      <SectionTitle hint="Каждая отправка и что стало с черновиком потом. «Оплатил» — любой успешный платёж этого человека после напоминания.">
        История отправок
      </SectionTitle>
      {log === null ? (
        <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>
      ) : (
        <DataTable
          defaultSort={{ col: 1, dir: 'desc' }}
          head={['Приглашение для', 'Отправлено', { label: 'Доставка', align: 'left' }, 'Язык', 'Автор', { label: 'Сейчас', align: 'left' }, 'Оплатил', 'Через']}
          rows={log.map((r) => {
            const [st, tone] = INVITATION_STATUS[r.invitation_status] || [r.invitation_status, 'neutral'];
            return {
              key: r.id,
              cells: [
                {
                  d: <span>{r.recipient_name || <span style={{ color: A.muted }}>без имени</span>}{r.slug && <span style={{ color: A.muted, fontWeight: 400 }}> · /i/{r.slug}</span>}</span>,
                  v: r.recipient_name || null,
                },
                { d: formatDateTime(r.sent_at), v: r.sent_at },
                {
                  d: r.delivered === true ? <Badge tone="good">Доставлено</Badge>
                    : r.delivered === false ? <span title={r.error || ''}><Badge tone="bad">{r.error === 'already paid' ? 'Уже оплатил' : 'Не дошло'}</Badge></span>
                      : <Badge>Отправляется</Badge>,
                  v: r.delivered === true ? 2 : r.delivered === false ? 0 : 1,
                },
                LANG[r.lang] || r.lang || '—',
                r.owner || '—',
                { d: <Badge tone={tone}>{st}</Badge>, v: st },
                { d: r.paid_at ? <span style={{ color: A.good, fontWeight: 700 }}>{money(r.paid_amount)}</span> : '—', v: r.paid_at ? Number(r.paid_amount) : null },
                { d: r.paid_at ? hoursBetween(r.sent_at, r.paid_at) : '—', v: r.paid_at ? new Date(r.paid_at) - new Date(r.sent_at) : null },
              ],
            };
          })}
          empty="Напоминаний ещё не было. Первое уйдёт, когда кто-то не оплатит черновик в течение 3 часов."
        />
      )}

      <SectionTitle hint="Все неоплаченные черновики и что с каждым будет. «Нет бота» — автор не подключил @sentiuz_bot, напомнить ему нечем.">
        Очередь
      </SectionTitle>
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={queueFilter}
          onChange={setQueueFilter}
          options={[
            { value: 'upcoming', label: 'Скоро получат', count: (queueCounts.waiting || 0) + (queueCounts.next_run || 0) },
            { value: 'no_bot', label: 'Нет бота', count: queueCounts.no_bot || 0 },
            { value: 'sent', label: 'Отправлено', count: queueCounts.sent || 0 },
            { value: 'all', label: 'Все', count: (queue || []).length },
          ]}
        />
      </div>
      {queue === null ? (
        <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>
      ) : (
        <DataTable
          defaultSort={{ col: 1, dir: 'desc' }}
          head={['Приглашение для', 'Создан', { label: 'Что будет', align: 'left' }, 'Когда', 'Автор']}
          rows={queueRows.map((r) => {
            const [label, tone] = QUEUE_STATE[r.state] || [r.state, 'neutral'];
            return {
              key: r.invitation_id,
              cells: [
                { d: r.recipient_name || <span style={{ color: A.muted }}>без имени</span>, v: r.recipient_name || null },
                { d: formatDateTime(r.created_at), v: r.created_at },
                { d: <Badge tone={tone}>{label}</Badge>, v: label },
                {
                  d: r.state === 'waiting' || r.state === 'next_run'
                    ? `≈ ${formatDateTime(nextSlot(r.due_at || r.created_at))}`
                    : r.state === 'sent' && r.reminder_sent_at ? formatDateTime(r.reminder_sent_at) : '—',
                  v: r.state === 'waiting' || r.state === 'next_run' ? nextSlot(r.due_at || r.created_at) : r.reminder_sent_at || null,
                },
                r.owner || '—',
              ],
            };
          })}
          empty="Под фильтр ничего не попало."
        />
      )}
    </div>
  );
}
