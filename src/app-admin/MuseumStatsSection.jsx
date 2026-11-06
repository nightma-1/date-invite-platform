/**
 * © 2026 Senti. Все права защищены.
 *
 * Воронка «Нашего музея» в админке: сколько людей дошло до каждого шага.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const STEPS = [
  ['museum_about_view', 'Страница музея'],
  ['museum_builder_view', 'Открыли конструктор'],
  ['museum_photos_added', 'Добавили фото'],
  ['museum_preview', 'Смотрели предпросмотр'],
  ['museum_pay_click', 'Нажали «Оплатить»'],
];
const GUESTS = [
  ['museum_enter_demo', 'Вошли в демо'],
  ['museum_enter_live', 'Вошли в настоящий музей'],
  ['museum_finale_seen', 'Дошли до финала'],
  ['museum_finale_yes', 'Ответили «да»'],
  ['museum_book_sign', 'Оставили запись'],
  ['museum_guest_photo', 'Добавили фото'],
  ['museum_story', 'Поделились в сторис'],
  ['museum_make_yours', 'Нажали «Сделать такой же»'],
];

function Rows({ title, rows, events }) {
  const top = Math.max(1, ...rows.map(([key]) => events[key] || 0));
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>{title}</h3>
      {rows.map(([key, label]) => {
        const value = events[key] || 0;
        return (
          <div key={key} style={{ marginBottom: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{label}</span><b>{value}</b></div>
            <div style={{ height: 5, borderRadius: 3, background: '#f4e6ea' }}>
              <div style={{ width: `${(value / top) * 100}%`, height: '100%', borderRadius: 3, background: '#c23b62' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MuseumStatsSection() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc('admin_museum_stats', { p_days: days }).then(({ data, error }) => {
      if (cancelled) return;
      setFailed(Boolean(error));
      setStats(data);
    });
    return () => { cancelled = true; };
  }, [days]);

  return (
    <section style={{ marginTop: 28, padding: 18, borderRadius: 16, background: '#fff', border: '1px solid #f0dfe4', fontFamily: 'Manrope, sans-serif', color: '#2a1f2b' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Наш музей</h2>
        <select aria-label="Период" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ padding: 6, borderRadius: 8 }}>
          <option value={7}>7 дней</option>
          <option value={30}>30 дней</option>
          <option value={90}>90 дней</option>
        </select>
      </div>
      {failed && <p style={{ fontSize: 14, color: '#a12a22' }}>Не удалось загрузить статистику.</p>}
      {stats && (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 14 }}>
            Оплачено музеев: <b>{stats.paid}</b> · продлений: <b>{stats.extended}</b> · выручка: <b>{Number(stats.revenue).toLocaleString('ru-RU')} сум</b>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 22 }}>
            <Rows title="Покупатели" rows={STEPS} events={stats.events} />
            <Rows title="Получатели и гости" rows={GUESTS} events={stats.events} />
          </div>
        </>
      )}
    </section>
  );
}
