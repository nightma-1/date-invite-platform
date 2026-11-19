/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Реферальная программа в админке: завести блогера, дать процент, привязать
 * к аккаунту и отметить выплату. Перенесено из ветки feat/referral-program
 * (src/app-admin/PartnersSection.jsx) в новый стиль и сортируемую таблицу.
 *
 * Деньги здесь не считаются — суммы приходят из admin_partner_overview(),
 * «выплачено» — через admin_mark_paid(): проверка прав живёт в базе.
 *
 * ВНИМАНИЕ: в main пока нет самой партнёрской части сайта — короткой
 * ссылки /r/<код> и кабинета /partner. Они остались в ветке
 * feat/referral-program. Пока их нет, клики и регистрации по партнёрам
 * здесь будут нулевыми.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { A, Card, PageHeader, StatGrid, Stat, DataTable, Badge, Button, inputStyle, money, num } from './adminUi.jsx';

const CODE_RE = /^[a-z0-9_-]{3,32}$/;
const EMPTY_FORM = { code: '', name: '', contact: '', commission_percent: 30, hold_days: 7, payout_details: '' };

export default function PartnersPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_partner_overview');
    if (err) {
      setError('Не получилось загрузить список партнёров.');
      setRows([]);
      return;
    }
    setRows(data || []);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function createPartner(e) {
    e.preventDefault();
    setNotice(null);
    const code = form.code.trim().toLowerCase();
    if (!CODE_RE.test(code)) {
      setError('Код: 3–32 символа — латиница в нижнем регистре, цифры, дефис и подчёркивание.');
      return;
    }
    if (!form.name.trim()) {
      setError('Укажите имя партнёра — иначе в списке не разобрать, кто есть кто.');
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
    setShowForm(false);
    setNotice(`Партнёр «${form.name.trim()}» добавлен.`);
    reload();
  }

  async function run(row, fn) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  }

  function linkAccount(row) {
    const email = prompt(`Почта аккаунта, под которым ${row.name} будет заходить в кабинет партнёра:`);
    if (!email) return;
    run(row, async () => {
      const { data, error: err } = await supabase.rpc('admin_link_partner', { p_code: row.code, p_email: email });
      if (err) { setError(err.message); return; }
      const messages = {
        no_user: 'Пользователя с такой почтой нет. Пусть сначала зарегистрируется на сайте.',
        no_partner: 'Партнёр не найден — обновите страницу.',
        user_taken: 'Этот аккаунт уже привязан к другому партнёру.',
        forbidden: 'Недостаточно прав.',
      };
      if (data === 'ok') { setNotice('Аккаунт привязан.'); reload(); } else setError(messages[data] ?? 'Не получилось привязать аккаунт.');
    });
  }

  function markPaid(row) {
    if (Number(row.available) <= 0) return;
    if (!confirm(`Отметить ${money(row.available)} как выплаченные партнёру ${row.name}?\n\nДеньги переводите сами — база только фиксирует факт.`)) return;
    run(row, async () => {
      const { data, error: err } = await supabase.rpc('admin_mark_paid', { p_partner_id: row.id });
      if (err) { setError(err.message); return; }
      if (Number(data) < 0) { setError('Недостаточно прав.'); return; }
      setNotice(`Выплата ${row.name} отмечена.`);
      reload();
    });
  }

  function toggleActive(row) {
    run(row, async () => {
      const { error: err } = await supabase.from('partners').update({ is_active: !row.is_active }).eq('id', row.id);
      if (err) { setError(err.message); return; }
      reload();
    });
  }

  function changePercent(row) {
    const raw = prompt(`Новый процент для ${row.name} (сейчас ${Number(row.commission_percent)}%).\n\nУже начисленные комиссии не пересчитаются.`, Number(row.commission_percent));
    if (raw === null) return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) { setError('Процент — число от 0 до 100.'); return; }
    run(row, async () => {
      const { error: err } = await supabase.from('partners').update({ commission_percent: value }).eq('id', row.id);
      if (err) { setError(err.message); return; }
      reload();
    });
  }

  const list = rows || [];
  const totals = {
    available: list.reduce((s, r) => s + Number(r.available || 0), 0),
    onHold: list.reduce((s, r) => s + Number(r.on_hold || 0), 0),
    paidOut: list.reduce((s, r) => s + Number(r.paid_out || 0), 0),
    orders: list.reduce((s, r) => s + Number(r.paid_orders || 0), 0),
  };

  const field = (key, placeholder, props = {}) => (
    <input
      style={{ ...inputStyle, width: '100%' }}
      placeholder={placeholder}
      value={form[key]}
      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      {...props}
    />
  );

  return (
    <div>
      <PageHeader
        title="Партнёры"
        subtitle="Реферальная программа для блогеров: комиссия начисляется после оплаты, деньги переводите вручную и отмечаете здесь."
        actions={<Button variant="primary" onClick={() => setShowForm((v) => !v)}>{showForm ? 'Отмена' : '+ Партнёр'}</Button>}
      />

      <Card style={{ background: A.warnSoft, borderColor: '#F5D9AE', marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13, color: A.warn, lineHeight: 1.5 }}>
          Партнёрская часть сайта — короткая ссылка <b>senti.uz/r/код</b> и кабинет блогера — ещё не выпущена:
          она лежит в ветке <code>feat/referral-program</code>. Пока её нет, клики и регистрации здесь будут нулевыми.
          Переходы по <code>?ref=код</code> уже видны в «Аналитике».
        </p>
      </Card>

      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}
      {notice && <p style={{ color: A.good, fontSize: 13 }}>{notice}</p>}

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <form onSubmit={createPartner} style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {field('code', 'Код для ссылки (например, aziza)')}
            {field('name', 'Имя или ник')}
            {field('contact', 'Контакт (Telegram, телефон)')}
            {field('payout_details', 'Куда платить (карта и т. п.)')}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: A.muted }}>
              Процент
              {field('commission_percent', '', { type: 'number', min: 0, max: 100, step: 1, style: { ...inputStyle, width: 90 } })}
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: A.muted }}>
              Холд, дней
              {field('hold_days', '', { type: 'number', min: 0, max: 90, step: 1, style: { ...inputStyle, width: 90 } })}
            </label>
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Добавляем…' : 'Добавить партнёра'}</Button>
          </form>
        </Card>
      )}

      <StatGrid style={{ marginBottom: 16 }}>
        <Stat label="Партнёров" value={num(list.length)} sub={`активных: ${num(list.filter((r) => r.is_active).length)}`} />
        <Stat label="Оплат через партнёров" value={num(totals.orders)} />
        <Stat label="К выплате сейчас" value={money(totals.available)} sub={`в холде: ${money(totals.onHold)}`} />
        <Stat label="Уже выплачено" value={money(totals.paidOut)} />
      </StatGrid>

      {rows === null ? (
        <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p>
      ) : (
        <DataTable
          defaultSort={{ col: 6, dir: 'desc' }}
          head={['Партнёр', '%', 'Клики', 'Регистрации', 'Оплат', 'Заработал', 'К выплате', 'В холде', 'Выплачено', { label: '', sortable: false }]}
          rows={list.map((r) => ({
            key: r.id,
            muted: !r.is_active,
            cells: [
              {
                d: (
                  <span>
                    <b>{r.name}</b>
                    <span style={{ color: A.muted }}> · /r/{r.code}</span>
                    {!r.is_active && <> <Badge>выключен</Badge></>}
                    {!r.linked && <> <Badge tone="warn">нет аккаунта</Badge></>}
                    {r.contact && <div style={{ fontSize: 11.5, color: A.muted }}>{r.contact}{r.payout_details ? ` · ${r.payout_details}` : ''}</div>}
                  </span>
                ),
                v: r.name,
              },
              { d: `${Number(r.commission_percent)}%`, v: Number(r.commission_percent) },
              { d: `${num(r.clicks)} (${num(r.unique_visitors)})`, v: Number(r.clicks) },
              num(r.signups),
              num(r.paid_orders),
              money(r.earned_total),
              { d: Number(r.available) > 0 ? <b style={{ color: A.berry }}>{money(r.available)}</b> : money(0), v: Number(r.available) },
              money(r.on_hold),
              money(r.paid_out),
              (
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="primary" disabled={busyId === r.id || Number(r.available) <= 0} onClick={() => markPaid(r)}>Выплачено</Button>
                  {!r.linked && <Button size="sm" disabled={busyId === r.id} onClick={() => linkAccount(r)}>Привязать</Button>}
                  <Button size="sm" disabled={busyId === r.id} onClick={() => changePercent(r)}>%</Button>
                  <Button size="sm" disabled={busyId === r.id} onClick={() => toggleActive(r)}>{r.is_active ? 'Выкл.' : 'Вкл.'}</Button>
                </span>
              ),
            ],
          }))}
          empty="Пока ни одного партнёра. Нажмите «+ Партнёр»."
        />
      )}
    </div>
  );
}
