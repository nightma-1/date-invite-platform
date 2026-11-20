/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Промокоды: скидка в процентах (100% — бесплатная публикация), лимит
 * использований, срок, привязка к партнёру (тогда оплата по коду идёт в
 * его комиссию). Ссылка senti.uz/?promo=КОД сама подставит код на экране
 * оплаты — удобно давать блогерам и в рекламу. Один человек может
 * использовать один код один раз.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import {
  A, Card, PageHeader, SectionTitle, StatGrid, Stat, DataTable, Badge, Button, inputStyle, money, num, formatDateTime,
} from './adminUi.jsx';

const PRICE = 19000;

function priceWith(percent) {
  let a = Math.round((PRICE * (100 - percent)) / 100 / 100) * 100;
  if (a > 0 && a < 1000) a = 1000;
  return a;
}

export default function PromoPage() {
  const [rows, setRows] = useState(null);
  const [partners, setPartners] = useState([]);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ code: '', percent: 20, maxUses: '', expires: '', partner: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [copied, setCopied] = useState(null);

  async function load() {
    setError(null);
    const [p, pa] = await Promise.all([
      supabase.rpc('admin_promo_codes'),
      supabase.from('partners').select('id, code, name').order('created_at', { ascending: false }),
    ]);
    if (p.error) setError(p.error.message);
    setRows(p.data || []);
    setPartners(pa.data || []);
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) { setNotice({ bad: true, text: 'Код: 3–24 символа, латиница, цифры, «-» или «_».' }); return; }
    const percent = Number(form.percent);
    if (!(percent >= 1 && percent <= 100)) { setNotice({ bad: true, text: 'Скидка от 1 до 100%.' }); return; }
    setSaving(true); setNotice(null);
    const { error: err } = await supabase.from('promo_codes').insert({
      code,
      discount_percent: percent,
      max_uses: form.maxUses ? Number(form.maxUses) : null,
      expires_at: form.expires ? new Date(`${form.expires}T23:59:59+05:00`).toISOString() : null,
      partner_id: form.partner || null,
      note: form.note.trim() || null,
    });
    setSaving(false);
    if (err) {
      setNotice({ bad: true, text: err.code === '23505' ? 'Такой код уже есть.' : err.message });
      return;
    }
    setForm({ code: '', percent: 20, maxUses: '', expires: '', partner: '', note: '' });
    setNotice({ text: `Код ${code} создан.` });
    load();
  }

  async function setActive(id, isActive) {
    const { error: err } = await supabase.from('promo_codes').update({ is_active: isActive }).eq('id', id);
    if (err) { setNotice({ bad: true, text: err.message }); return; }
    load();
  }

  async function copyLink(code) {
    const link = `https://senti.uz/?promo=${code}`;
    try { await navigator.clipboard.writeText(link); setCopied(code); setTimeout(() => setCopied(null), 1500); } catch { window.prompt('Скопируй ссылку', link); }
  }

  const total = (rows || []).reduce((acc, r) => ({ uses: acc.uses + Number(r.uses), revenue: acc.revenue + Number(r.revenue) }), { uses: 0, revenue: 0 });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const label = { fontSize: 12, color: A.muted, display: 'grid', gap: 4 };

  return (
    <div>
      <PageHeader
        title="Промокоды"
        subtitle="Скидка на публикацию. Ссылка senti.uz/?promo=КОД сама подставит код на экране оплаты — её удобно давать блогерам и в рекламу."
        actions={<Button size="sm" onClick={load}>↻ Обновить</Button>}
      />
      {error && <p style={{ color: A.bad, fontSize: 13 }}>{error}</p>}

      <StatGrid style={{ marginBottom: 16 }}>
        <Stat label="Активных кодов" value={num((rows || []).filter((r) => r.is_active).length)} />
        <Stat label="Оплат по кодам" value={num(total.uses)} />
        <Stat label="Выручка по кодам" value={money(total.revenue)} />
      </StatGrid>

      <Card style={{ marginBottom: 16 }}>
        <form onSubmit={create} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}>
          <label style={label}>Код
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))} placeholder="IG20" maxLength={24} style={inputStyle} />
          </label>
          <label style={label}>Скидка, %
            <input type="number" min={1} max={100} value={form.percent} onChange={set('percent')} style={inputStyle} />
          </label>
          <label style={label}>Лимит оплат (пусто — без лимита)
            <input type="number" min={1} value={form.maxUses} onChange={set('maxUses')} placeholder="∞" style={inputStyle} />
          </label>
          <label style={label}>Действует до (пусто — всегда)
            <input type="date" value={form.expires} onChange={set('expires')} style={inputStyle} />
          </label>
          <label style={label}>Партнёр (комиссия)
            <select value={form.partner} onChange={set('partner')} style={inputStyle}>
              <option value="">— нет —</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name || p.code} ({p.code})</option>)}
            </select>
          </label>
          <label style={label}>Заметка
            <input value={form.note} onChange={set('note')} placeholder="для кого / зачем" style={inputStyle} />
          </label>
          <div>
            <Button type="submit" variant="primary" disabled={saving}>Создать</Button>
          </div>
        </form>
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: A.muted }}>
          Цена с этим кодом: <b style={{ color: A.ink }}>{Number(form.percent) >= 100 ? 'бесплатно' : money(priceWith(Number(form.percent) || 0))}</b> вместо {money(PRICE)}.
          {' '}Один человек может использовать код один раз.
        </p>
        {notice && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: notice.bad ? A.bad : A.good }}>{notice.text}</p>}
      </Card>

      <SectionTitle>Все коды</SectionTitle>
      {rows === null ? <p style={{ color: A.muted, fontSize: 13 }}>Загрузка…</p> : (
        <DataTable
          defaultSort={{ col: 5, dir: 'desc' }}
          head={['Код', 'Скидка', { label: 'Статус', align: 'left' }, 'Оплат', 'Выручка', 'Создан', 'До', 'Партнёр', 'Заметка', '']}
          rows={rows.map((r) => {
            const expired = r.expires_at && new Date(r.expires_at) < new Date();
            const full = r.max_uses && Number(r.uses) >= r.max_uses;
            const state = !r.is_active ? ['выключен', 'neutral'] : expired ? ['истёк', 'neutral'] : full ? ['лимит исчерпан', 'warn'] : ['действует', 'good'];
            return {
              key: r.id,
              muted: !r.is_active,
              cells: [
                { d: <b style={{ fontFamily: 'ui-monospace, monospace' }}>{r.code}</b>, v: r.code },
                { d: r.discount_percent === 100 ? 'бесплатно' : `${r.discount_percent}%`, v: r.discount_percent },
                { d: <Badge tone={state[1]}>{state[0]}</Badge>, v: state[0] },
                { d: `${num(r.uses)}${r.max_uses ? ` / ${r.max_uses}` : ''}${Number(r.attempts) > Number(r.uses) ? ` (попыток ${r.attempts})` : ''}`, v: Number(r.uses) },
                { d: money(r.revenue), v: Number(r.revenue) },
                { d: formatDateTime(r.created_at), v: r.created_at },
                { d: r.expires_at ? formatDateTime(r.expires_at) : '—', v: r.expires_at || null },
                r.partner_code || '—',
                r.note || '—',
                {
                  d: (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <Button size="sm" onClick={() => copyLink(r.code)}>{copied === r.code ? 'Скопировано' : 'Ссылка'}</Button>
                      <Button size="sm" variant={r.is_active ? 'danger' : 'ghost'} onClick={() => setActive(r.id, !r.is_active)}>{r.is_active ? 'Выключить' : 'Включить'}</Button>
                    </span>
                  ),
                  v: null,
                },
              ],
            };
          })}
          empty="Промокодов пока нет."
        />
      )}
    </div>
  );
}
