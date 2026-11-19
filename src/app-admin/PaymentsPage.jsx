/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Все попытки оплаты (последние 1000) — через admin_payments(): RLS дал бы
 * админу только его собственные. Главное, что здесь надо видеть сразу, —
 * оплаченные платежи, приглашение которых так и осталось черновиком:
 * человек заплатил и ждёт ссылку.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import {
  A, Card, PageHeader, StatGrid, Stat, DataTable, Segmented, Badge, Toggle, Button, inputStyle, money, num, formatDateTime,
} from './adminUi.jsx';

const STATUS = {
  paid: ['Оплачен', 'good'],
  pending: ['Не завершён', 'neutral'],
  failed: ['Ошибка', 'bad'],
  refunded: ['Возврат', 'warn'],
};

const METHOD = { invoice: 'Click', card: 'Карта' };
const INVITATION_STATUS = { draft: 'черновик', published: 'опубликовано', expired: 'истекло', archived: 'в архиве' };

export default function PaymentsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [hideMine, setHideMine] = useState(true);

  async function load() {
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_payments');
    if (err) { setError(err.message || 'Не получилось загрузить платежи.'); setRows([]); return; }
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  const base = useMemo(() => (rows || []).filter((r) => !(hideMine && r.owner_is_admin)), [rows, hideMine]);
  const isStuck = (r) => r.status === 'paid' && r.invitation_status === 'draft';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return base.filter((r) => {
      if (status === 'stuck' ? !isStuck(r) : status !== 'all' && r.status !== status) return false;
      if (!q) return true;
      return [r.recipient_name, r.slug, r.owner_email, r.transaction_id, String(r.click_prepare_id || ''), r.partner_code]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [base, query, status]);

  const stats = useMemo(() => {
    const paid = base.filter((r) => r.status === 'paid');
    return {
      paid: paid.length,
      revenue: paid.reduce((s, r) => s + Number(r.amount || 0), 0),
      pending: base.filter((r) => r.status === 'pending').length,
      failed: base.filter((r) => r.status === 'failed').length,
      stuck: base.filter(isStuck).length,
      conversion: base.length ? Math.round((paid.length / base.length) * 100) : 0,
    };
  }, [base]);

  return (
    <div>
      <PageHeader
        title="Платежи"
        subtitle="Каждое нажатие «оплатить» создаёт попытку. «Не завершён» — человек ушёл в Click и не заплатил."
        actions={<Button size="sm" onClick={load}>↻ Обновить</Button>}
      />

      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}

      {stats.stuck > 0 && (
        <Card style={{ background: A.badSoft, borderColor: '#F3C7C7', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13.5, color: A.bad, fontWeight: 700 }}>
            {stats.stuck} оплачено, но приглашение не опубликовано — человек заплатил и ждёт ссылку.
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: A.bad }}>
            Проверьте вебхук Click по номеру транзакции. Фильтр «Застряли» ниже показывает только их.
          </p>
        </Card>
      )}

      <StatGrid style={{ marginBottom: 16 }}>
        <Stat label="Оплачено" value={num(stats.paid)} sub={money(stats.revenue)} />
        <Stat label="Не завершили" value={num(stats.pending)} />
        <Stat label="Ошибки" value={num(stats.failed)} alert={stats.failed > 0} />
        <Stat label="Доля оплаченных" value={`${stats.conversion}%`} sub="от всех попыток" />
      </StatGrid>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: имя, ссылка, почта, номер транзакции, партнёр"
          style={{ ...inputStyle, flex: '1 1 220px' }}
        />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Все', count: base.length },
            { value: 'paid', label: 'Оплачены', count: stats.paid },
            { value: 'pending', label: 'Не завершены', count: stats.pending },
            { value: 'failed', label: 'Ошибки', count: stats.failed },
            { value: 'stuck', label: 'Застряли', count: stats.stuck },
          ]}
        />
        <Toggle checked={hideMine} onChange={setHideMine} label="Скрыть мои" />
      </div>

      {rows === null ? (
        <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>
      ) : (
        <DataTable
          defaultSort={{ col: 1, dir: 'desc' }}
          head={['Приглашение', 'Дата', { label: 'Статус', align: 'left' }, 'Сумма', 'Способ', 'Приглашение сейчас', 'Покупатель', 'Партнёр', 'Транзакция Click']}
          rows={filtered.map((r) => {
            const [label, tone] = STATUS[r.status] || [r.status, 'neutral'];
            const stuck = isStuck(r);
            return {
              key: r.id,
              muted: r.owner_is_admin,
              cells: [
                {
                  d: (
                    <span>
                      {r.recipient_name || <span style={{ color: A.muted }}>без имени</span>}
                      {r.slug && <span style={{ color: A.muted, fontWeight: 400 }}> · /i/{r.slug}</span>}
                    </span>
                  ),
                  v: r.recipient_name || null,
                },
                { d: formatDateTime(r.created_at), v: r.created_at },
                { d: <Badge tone={stuck ? 'bad' : tone}>{stuck ? 'Оплачен, не опубликован' : label}</Badge>, v: stuck ? 'а' : label },
                { d: money(r.amount), v: Number(r.amount) },
                METHOD[r.method] || r.method || '—',
                INVITATION_STATUS[r.invitation_status] || r.invitation_status || '—',
                r.owner_email || '—',
                r.partner_code || '—',
                { d: r.transaction_id || (r.click_prepare_id ? `prepare ${r.click_prepare_id}` : '—'), v: r.transaction_id || null },
              ],
            };
          })}
          empty="Под фильтр ничего не попало."
        />
      )}
    </div>
  );
}
