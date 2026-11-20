/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Все приглашения (последние 1000) — через admin_invitations(): RLS показал
 * бы админу только свои и опубликованные. Поиск, фильтры и сортировка
 * работают на клиенте.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { InvitationDrawer } from './InvitationDrawer.jsx';
import {
  A, PageHeader, StatGrid, Stat, DataTable, Segmented, Badge, Toggle, Button, inputStyle, money, num, formatDateTime,
} from './adminUi.jsx';

const STATUS = {
  draft: ['Черновик', 'neutral'],
  published: ['Опубликовано', 'good'],
  expired: ['Истекло', 'warn'],
  archived: ['В архиве', 'neutral'],
};

const KIND = { invite: 'Свидание', occasion: 'Повод', museum: 'Музей' };

export default function InvitationsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [kind, setKind] = useState('all');
  const [hideMine, setHideMine] = useState(true);

  async function load() {
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_invitations');
    if (err) { setError(err.message || 'Не получилось загрузить приглашения.'); setRows([]); return; }
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  const base = useMemo(() => (rows || []).filter((r) => !(hideMine && r.owner_is_admin)), [rows, hideMine]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (!q) return true;
      return [r.recipient_name, r.slug, r.owner_email, r.owner_telegram]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [base, query, status, kind]);

  const counts = useMemo(() => {
    const c = { all: base.length };
    base.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [base]);

  const kinds = useMemo(() => [...new Set(base.map((r) => r.kind).filter(Boolean))], [base]);

  const totals = useMemo(() => ({
    paid: filtered.filter((r) => Number(r.paid_amount) > 0).length,
    revenue: filtered.reduce((s, r) => s + Number(r.paid_amount || 0), 0),
    answered: filtered.filter((r) => r.answered).length,
    views: filtered.reduce((s, r) => s + Number(r.views || 0), 0),
  }), [filtered]);

  return (
    <div>
      <PageHeader
        title="Приглашения"
        subtitle="Все приглашения сайта. Нажми на строку — откроются подробности и действия: бесплатная публикация, продление, сообщение автору."
        actions={<Button size="sm" onClick={load}>↻ Обновить</Button>}
      />

      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}

      <StatGrid style={{ marginBottom: 16 }}>
        <Stat label="В списке" value={num(filtered.length)} />
        <Stat label="Оплачено" value={num(totals.paid)} sub={money(totals.revenue)} />
        <Stat label="С ответом" value={num(totals.answered)} />
        <Stat label="Просмотров получателями" value={num(totals.views)} />
      </StatGrid>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: имя, ссылка, почта, Telegram"
          style={{ ...inputStyle, flex: '1 1 220px' }}
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Все', count: counts.all || 0 },
            { value: 'draft', label: 'Черновики', count: counts.draft || 0 },
            { value: 'published', label: 'Опубликованы', count: counts.published || 0 },
            { value: 'expired', label: 'Истекли', count: counts.expired || 0 },
          ]}
        />
        {kinds.length > 1 && (
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>
            <option value="all">Все типы</option>
            {kinds.map((k) => <option key={k} value={k}>{KIND[k] || k}</option>)}
          </select>
        )}
        <Toggle checked={hideMine} onChange={setHideMine} label="Скрыть мои" />
      </div>

      {rows === null ? (
        <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>
      ) : (
        <DataTable
          defaultSort={{ col: 1, dir: 'desc' }}
          head={['Кому', 'Создано', { label: 'Статус', align: 'left' }, 'Тип', 'Владелец', 'Просмотры', 'Ответ', 'Оплачено', 'Ссылка']}
          rows={filtered.map((r) => {
            const [label, tone] = STATUS[r.status] || [r.status, 'neutral'];
            return {
              key: r.id,
              onClick: r.id ? () => setOpenId(r.id) : undefined,
              muted: r.owner_is_admin,
              cells: [
                { d: r.recipient_name || <span style={{ color: A.muted }}>без имени</span>, v: r.recipient_name || null },
                { d: formatDateTime(r.created_at), v: r.created_at },
                { d: <Badge tone={tone}>{label}</Badge>, v: label },
                KIND[r.kind] || r.kind || '—',
                { d: r.owner_email || (r.owner_telegram ? `@${r.owner_telegram}` : '—'), v: r.owner_email || r.owner_telegram || null },
                { d: Number(r.views) ? `${num(r.views)} (${num(r.viewers)} чел.)` : '—', v: Number(r.views) || null },
                {
                  d: r.answered ? (r.answered_yes ? <Badge tone="good">Да</Badge> : <Badge tone="warn">Нет</Badge>) : '—',
                  v: r.answered ? (r.answered_yes ? 2 : 1) : null,
                },
                { d: Number(r.paid_amount) ? money(r.paid_amount) : '—', v: Number(r.paid_amount) || null },
                {
                  d: r.slug ? (
                    <a href={`/i/${r.slug}`} target="_blank" rel="noreferrer" style={{ color: A.berry, fontWeight: 600 }}>/i/{r.slug}</a>
                  ) : '—',
                  v: r.slug,
                },
              ],
            };
          })}
          empty="Под фильтр ничего не попало."
        />
      )}
      <InvitationDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}
