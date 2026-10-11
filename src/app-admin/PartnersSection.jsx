/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Управление реферальной программой в админке: завести инфлюенсера, выдать
 * ему процент, привязать к аккаунту и отметить выплату.
 *
 * Деньги здесь не считаются — все суммы приходят из admin_partner_overview(),
 * которая агрегирует их в базе. Кнопка «выплачено» тоже дёргает RPC, а не
 * пишет в таблицу напрямую: проверка прав должна жить на сервере.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import TicketCard from '../components/ui/TicketCard.jsx';
import { getTemplateTokens } from '../templates/registry.js';

const t = getTemplateTokens('romantic');

const CODE_RE = /^[a-z0-9_-]{3,32}$/;

const EMPTY_FORM = {
  code: '', name: '', contact: '',
  commission_percent: 30, hold_days: 7, payout_details: '',
};

function sum(value) {
  return `${Number(value || 0).toLocaleString('ru-RU')} сум`;
}

export default function PartnersSection() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_partner_overview');
    if (err) {
      console.error('partner overview failed', err);
      setError('Не получилось загрузить список партнёров.');
      setRows([]);
      return;
    }
    setError(null);
    setRows(data || []);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function createPartner(e) {
    e.preventDefault();
    const code = form.code.trim().toLowerCase();
    if (!CODE_RE.test(code)) {
      setError('Код: 3–32 символа, только латиница в нижнем регистре, цифры, дефис и подчёркивание.');
      return;
    }
    if (!form.name.trim()) {
      setError('Укажи имя партнёра — иначе в списке будет не разобрать, кто есть кто.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('partners').insert({
      code,
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      commission_percent: Number(form.commission_percent),
      hold_days: Number(form.hold_days),
      payout_details: form.payout_details.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.code === '23505' ? 'Такой код уже занят.' : (err.message || 'Не получилось создать партнёра.'));
      return;
    }
    setForm(EMPTY_FORM);
    reload();
  }

  async function linkAccount(row) {
    const email = prompt(`Email аккаунта, под которым ${row.name} будет заходить в /partner:`);
    if (!email) return;
    setBusyId(row.id);
    const { data, error: err } = await supabase.rpc('admin_link_partner', { p_code: row.code, p_email: email });
    setBusyId(null);
    if (err) { setError(err.message); return; }
    const messages = {
      ok: null,
      no_user: 'Пользователя с таким email нет. Пусть сначала зарегистрируется на сайте.',
      no_partner: 'Партнёр не найден — обнови страницу.',
      user_taken: 'Этот аккаунт уже привязан к другому партнёру.',
      forbidden: 'Недостаточно прав.',
    };
    setError(messages[data] ?? 'Не получилось привязать аккаунт.');
    if (data === 'ok') reload();
  }

  async function markPaid(row) {
    if (Number(row.available) <= 0) return;
    if (!confirm(`Отметить ${sum(row.available)} как выплаченные партнёру ${row.name}?\n\nДеньги переводишь сам — база только фиксирует факт.`)) return;
    setBusyId(row.id);
    const { data, error: err } = await supabase.rpc('admin_mark_paid', { p_partner_id: row.id });
    setBusyId(null);
    if (err) { setError(err.message); return; }
    if (Number(data) < 0) { setError('Недостаточно прав.'); return; }
    reload();
  }

  async function toggleActive(row) {
    setBusyId(row.id);
    const { error: err } = await supabase
      .from('partners')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    reload();
  }

  async function changePercent(row) {
    const raw = prompt(`Новый процент для ${row.name} (сейчас ${Number(row.commission_percent)}%).\n\nУже начисленные комиссии не пересчитаются — процент фиксируется в момент оплаты.`, Number(row.commission_percent));
    if (raw === null) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) { setError('Процент должен быть числом от 0 до 100.'); return; }
    setBusyId(row.id);
    const { error: err } = await supabase.from('partners').update({ commission_percent: value }).eq('id', row.id);
    setBusyId(null);
    if (err) { setError(err.message); return; }
    reload();
  }

  const inputStyle = {
    display: 'block', width: '100%', padding: '9px 12px',
    border: `1.5px solid ${t.ink}22`, borderRadius: 6,
    fontFamily: t.fontUI, fontSize: 13.5, color: t.ink,
    background: '#fff', boxSizing: 'border-box',
  };

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
        Реферальная программа
      </h2>
      <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI }}>
        Ссылка партнёра — senti.uz/r/&lt;код&gt;. Комиссия начисляется автоматически после оплаты,
        деньги переводишь вручную и отмечаешь здесь.
      </p>

      {error && (
        <p className="mb-3 text-sm" style={{ color: '#C0392B', fontFamily: t.fontUI }}>{error}</p>
      )}

      <form onSubmit={createPartner} className="mb-8 grid gap-2 md:grid-cols-2">
        <input
          style={inputStyle} placeholder="код для ссылки (напр. aziza)"
          value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <input
          style={inputStyle} placeholder="имя / ник"
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          style={inputStyle} placeholder="контакт (телеграм, телефон)"
          value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
        />
        <input
          style={inputStyle} placeholder="куда платить (карта и т.п.)"
          value={form.payout_details} onChange={(e) => setForm({ ...form, payout_details: e.target.value })}
        />
        <label className="flex items-center gap-2 text-xs" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI }}>
          Процент
          <input
            type="number" min="0" max="100" step="1" style={{ ...inputStyle, width: 90 }}
            value={form.commission_percent}
            onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-xs" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI }}>
          Холд, дней
          <input
            type="number" min="0" max="90" step="1" style={{ ...inputStyle, width: 90 }}
            value={form.hold_days}
            onChange={(e) => setForm({ ...form, hold_days: e.target.value })}
          />
        </label>
        <button
          type="submit" disabled={saving}
          className="rounded-lg px-4 py-2.5 text-sm md:col-span-2"
          style={{
            background: t.berry, color: '#fff', fontFamily: t.fontUI, fontWeight: 700,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Добавляем…' : 'Добавить партнёра'}
        </button>
      </form>

      {rows === null && <p className="text-sm opacity-60">Загрузка…</p>}
      {rows?.length === 0 && (
        <p className="text-sm" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
          Пока ни одного партнёра.
        </p>
      )}

      <div className="space-y-3">
        {(rows || []).map((row) => (
          <TicketCard key={row.id} tokens={t}>
            <div className="p-4" style={{ fontFamily: t.fontUI, opacity: row.is_active ? 1 : 0.55 }}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span style={{ color: t.ink, fontWeight: 700, fontSize: 15 }}>{row.name}</span>
                  <span style={{ color: t.berry, fontSize: 13 }}> · /r/{row.code} · {Number(row.commission_percent)}%</span>
                  {!row.is_active && <span style={{ color: t.ink, opacity: 0.5, fontSize: 12 }}> · выключен</span>}
                  {!row.linked && <span style={{ color: '#A96A00', fontSize: 12 }}> · нет аккаунта</span>}
                </div>
                {row.contact && (
                  <span className="text-xs" style={{ color: t.ink, opacity: 0.45 }}>{row.contact}</span>
                )}
              </div>

              <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4" style={{ color: t.ink }}>
                <Metric label="Клики" value={`${row.clicks} (${row.unique_visitors} уник.)`} />
                <Metric label="Регистрации" value={row.signups} />
                <Metric label="Оплат" value={row.paid_orders} />
                <Metric label="Заработал" value={sum(row.earned_total)} />
                <Metric label="В холде" value={sum(row.on_hold)} />
                <Metric label="К выплате" value={sum(row.available)} strong={Number(row.available) > 0} />
                <Metric label="Выплачено" value={sum(row.paid_out)} />
                {row.payout_details && <Metric label="Реквизиты" value={row.payout_details} />}
              </div>

              <div className="flex flex-wrap gap-2">
                <RowButton
                  onClick={() => markPaid(row)}
                  disabled={busyId === row.id || Number(row.available) <= 0}
                  primary
                >
                  Отметить выплату
                </RowButton>
                {!row.linked && (
                  <RowButton onClick={() => linkAccount(row)} disabled={busyId === row.id}>
                    Привязать аккаунт
                  </RowButton>
                )}
                <RowButton onClick={() => changePercent(row)} disabled={busyId === row.id}>
                  Изменить процент
                </RowButton>
                <RowButton onClick={() => toggleActive(row)} disabled={busyId === row.id}>
                  {row.is_active ? 'Выключить' : 'Включить'}
                </RowButton>
              </div>
            </div>
          </TicketCard>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value, strong }) {
  return (
    <div>
      <span style={{ opacity: 0.5 }}>{label}: </span>
      <span style={{ fontWeight: strong ? 700 : 600, color: strong ? t.berry : t.ink }}>{value}</span>
    </div>
  );
}

function RowButton({ children, onClick, disabled, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-3 py-1.5 text-xs"
      style={{
        background: primary ? t.berry : '#fff',
        color: primary ? '#fff' : t.ink,
        border: primary ? 'none' : `1.5px solid ${t.ink}22`,
        fontFamily: t.fontUI, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );
}
