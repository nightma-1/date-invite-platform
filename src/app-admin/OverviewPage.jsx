/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Первая страница админки: за 5 секунд понять, всё ли в порядке.
 * Сегодня против вчера, кто сейчас на сайте и что требует внимания —
 * в первую очередь оплаченные, но не опубликованные приглашения.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { A, Card, PageHeader, SectionTitle, Stat, StatGrid, Button, Badge, money, num, formatDateTime } from './adminUi.jsx';

const DAY_MS = 24 * 60 * 60 * 1000;

function tashkentDay(offset) {
  return new Date(Date.now() + 5 * 3600 * 1000 + offset * DAY_MS).toISOString().slice(0, 10);
}
function startIso(ymd) {
  return new Date(`${ymd}T00:00:00+05:00`).toISOString();
}

function delta(cur, prev) {
  const c = Number(cur || 0);
  const p = Number(prev || 0);
  if (!p && !c) return null;
  if (!p) return { text: 'новое', good: true };
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return { text: '0%', good: null };
  return { text: `${pct > 0 ? '↑' : '↓'}${Math.abs(pct)}%`, good: pct > 0 };
}

export default function OverviewPage({ basePath }) {
  const [today, setToday] = useState(null);
  const [yesterday, setYesterday] = useState(null);
  const [week, setWeek] = useState(null);
  const [payments, setPayments] = useState([]);
  const [health, setHealth] = useState(null);
  const [drafts, setDrafts] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    const t0 = tashkentDay(0);
    const t1 = tashkentDay(-1);
    const [td, yd, wk, pay] = await Promise.all([
      supabase.rpc('admin_analytics', { p_from: startIso(t0), p_to: new Date().toISOString() }),
      // Вчера до того же часа, что сейчас сегодня — иначе утром «сегодня» всегда хуже.
      supabase.rpc('admin_analytics', { p_from: startIso(t1), p_to: new Date(Date.now() - DAY_MS).toISOString() }),
      supabase.rpc('admin_analytics', { p_from: startIso(tashkentDay(-6)), p_to: new Date().toISOString() }),
      supabase.rpc('admin_payments'),
    ]);
    // Не мешают главному экрану, если упадут
    supabase.rpc('admin_system_health').then(({ data }) => setHealth(data || null));
    supabase.rpc('admin_reminder_queue').then(({ data }) => setDrafts(data || []));
    if (td.error) { setError(td.error.message || 'Не получилось загрузить данные.'); return; }
    setToday(td.data);
    setYesterday(yd.data || null);
    setWeek(wk.data || null);
    setPayments(pay.data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>;
  if (!today) return <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>;

  const t = today.totals || {};
  const y = yesterday?.totals || {};
  const w = week?.totals || {};

  // Главная тревога: деньги пришли, а приглашение так и осталось черновиком.
  const paidNotPublished = payments.filter((p) => p.status === 'paid' && p.invitation_status === 'draft' && !p.owner_is_admin);
  const recentIssues = (week?.issues || []).slice(0, 5);
  const pendingToday = payments.filter((p) => p.status === 'pending' && !p.owner_is_admin
    && Date.now() - new Date(p.created_at).getTime() < DAY_MS);
  // Черновики за последние сутки — живые люди, которые почти купили
  const freshDrafts = drafts.filter((d) => Date.now() - new Date(d.created_at).getTime() < DAY_MS);
  const systemProblems = [];
  if (health) {
    const failing = (health.cron || []).filter((j) => j.last_status === 'failed');
    if (failing.length) systemProblems.push(`Задачи по расписанию с ошибкой: ${failing.map((j) => j.name).join(', ')}`);
    if (Number(health.http_errors_24h) >= 3) systemProblems.push(`Ошибок вызовов бота/отчётов за сутки: ${health.http_errors_24h}`);
    if (health.meta_last && !health.meta_last.ok && !String(health.meta_last.error || '').includes('не заданы')) systemProblems.push(`Синхронизация Meta Ads: ${health.meta_last.error}`);
    if (Number(health.new_tickets_7d) > 0) systemProblems.push(`Новых обращений в поддержку: ${health.new_tickets_7d}`);
  }
  const allGood = paidNotPublished.length === 0 && recentIssues.length === 0 && freshDrafts.length === 0 && systemProblems.length === 0;

  return (
    <div>
      <PageHeader
        title="Обзор"
        subtitle={`Сегодня по Ташкенту · сравнение со вчера до этого же часа${today.live?.visitors_30m ? ` · сейчас на сайте: ${today.live.visitors_30m}` : ''}`}
        actions={<Button size="sm" onClick={load}>↻ Обновить</Button>}
      />

      <StatGrid>
        <Stat label="Посетители сегодня" value={num(t.visitors)} delta={delta(t.visitors, y.visitors)} sub={`вчера к этому часу: ${num(y.visitors)}`} />
        <Stat label="Открыли конструктор" value={num(t.builder_started)} delta={delta(t.builder_started, y.builder_started)} />
        <Stat label="Оплаты" value={num(t.paid)} delta={delta(t.paid, y.paid)} sub={`попыток: ${num(t.payments_started)}`} />
        <Stat label="Выручка" value={money(t.revenue)} delta={delta(t.revenue, y.revenue)} />
      </StatGrid>

      <SectionTitle>Требует внимания</SectionTitle>
      {allGood ? (
        <Card style={{ background: A.goodSoft, borderColor: '#CBE8D4' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: A.good, fontWeight: 600 }}>
            ✓ Всё в порядке: оплаченных без публикации нет, брошенных черновиков за сутки нет, сбоев нет.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {paidNotPublished.map((p) => (
            <Card key={p.id} style={{ background: A.badSoft, borderColor: '#F3C7C7' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 13.5 }}>
                  <Badge tone="bad">оплачено, не опубликовано</Badge>
                  <span style={{ marginLeft: 8, fontWeight: 700 }}>{p.recipient_name || 'без имени'}</span>
                  <span style={{ color: A.muted }}> · {money(p.amount)} · {formatDateTime(p.created_at)} · {p.owner_email || '—'}</span>
                </div>
                <Link to={`${basePath}/payments`} style={{ fontSize: 12.5, color: A.berry, fontWeight: 700 }}>к платежам →</Link>
              </div>
            </Card>
          ))}
          {freshDrafts.length > 0 && (
            <Card pad={12}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span>
                  <Badge tone="warn">не оплатили</Badge>
                  <span style={{ marginLeft: 8 }}>
                    {freshDrafts.length} {freshDrafts.length === 1 ? 'черновик' : freshDrafts.length < 5 ? 'черновика' : 'черновиков'} за сутки:{' '}
                    {freshDrafts.slice(0, 3).map((d) => d.recipient_name || 'без имени').join(', ')}{freshDrafts.length > 3 ? '…' : ''}
                    <span style={{ color: A.muted }}> · без бота: {freshDrafts.filter((d) => !d.has_bot).length}</span>
                  </span>
                </span>
                <Link to={`${basePath}/people`} style={{ fontSize: 12.5, color: A.berry, fontWeight: 700 }}>кто это →</Link>
              </div>
            </Card>
          )}
          {systemProblems.map((text) => (
            <Card key={text} pad={12}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span><Badge tone="bad">система</Badge><span style={{ marginLeft: 8 }}>{text}</span></span>
                <Link to={`${basePath}/system`} style={{ fontSize: 12.5, color: A.berry, fontWeight: 700 }}>подробнее →</Link>
              </div>
            </Card>
          ))}
          {recentIssues.map((i) => (
            <Card key={i.at} pad={12}>
              <div style={{ fontSize: 13 }}>
                <Badge tone="warn">{i.event === 'payment_timeout' ? 'оплата без публикации' : 'ошибка публикации'}</Badge>
                <span style={{ marginLeft: 8 }}>{i.message || '—'}</span>
                <span style={{ color: A.muted }}> · {formatDateTime(i.at)} · {i.device || ''}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle hint="Последние 7 дней, включая сегодня">Неделя</SectionTitle>
      <StatGrid>
        <Stat label="Посетители" value={num(w.visitors)} />
        <Stat label="Нажали «Опубликовать»" value={num(w.builder_finished)} />
        <Stat label="Оплаты" value={num(w.paid)} sub={money(w.revenue)} />
        <Stat label="Расход на рекламу" value={money(w.spend)} muted={!Number(w.spend)}
          sub={Number(w.spend) && Number(w.paid) ? `цена оплаты: ${money(w.spend / w.paid)}` : 'внесите в «Аналитике»'} />
        <Stat label="Не завершили оплату" value={num(pendingToday.length)} sub="за последние сутки" />
        <Stat label="Ответы получателей" value={num(w.responses)} sub={`«Да»: ${num(w.responses_yes)}`} />
      </StatGrid>

      <SectionTitle>Разделы</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {[
          ['people', 'Люди', 'Путь каждого посетителя по сайту'],
          ['analytics', 'Аналитика', 'Воронка, источники, расходы, кампании'],
          ['invitations', 'Приглашения', 'Все приглашения с поиском и сортировкой'],
          ['payments', 'Платежи', 'Все попытки оплаты и их статусы'],
          ['content', 'Контент', 'Гифки и демо на главной'],
          ['museum', 'Музей', 'Статистика «Нашего музея»'],
          ['partners', 'Партнёры', 'Реферальная программа блогеров'],
          ['promo', 'Промокоды', 'Скидки и бесплатная публикация по коду'],
          ['reminders', 'Напоминания', 'Напоминания об оплате и что после них'],
          ['system', 'Система', 'Расписание, бот, оплата, Meta Ads'],
        ].map(([to, title, text]) => (
          <Link key={to} to={`${basePath}/${to}`} style={{ textDecoration: 'none' }}>
            <Card pad={14} style={{ height: '100%' }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: A.ink }}>{title} →</p>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: A.muted, lineHeight: 1.45 }}>{text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
