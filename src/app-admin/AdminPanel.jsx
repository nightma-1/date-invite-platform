/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 *
 * ВАЖНО про безопасность: проверка is_admin здесь — только для UI.
 * Настоящая защита данных живёт в RLS-политиках Postgres.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import TicketCard from '../components/ui/TicketCard.jsx';
import { getTemplateTokens } from '../templates/registry.js';

const t = getTemplateTokens('romantic');

export default function AdminPanel() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);
  const [stats, setStats] = useState(null);
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (!profile?.is_admin) {
        setIsAdmin(false);
        return;
      }
      setIsAdmin(true);

      const [invRes, payRes, respRes] = await Promise.all([
        supabase.from('invitations').select('id, slug, recipient_name, status, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('payments').select('amount, status'),
        supabase.from('responses').select('answered_yes'),
      ]);

      if (cancelled) return;

      const paid = (payRes.data || []).filter((p) => p.status === 'paid');
      setStats({
        invitations: invRes.data?.length ?? 0,
        responses: respRes.data?.length ?? 0,
        yes: (respRes.data || []).filter((r) => r.answered_yes).length,
        revenue: paid.reduce((sum, p) => sum + p.amount, 0),
        paidCount: paid.length,
      });
      setInvitations(invRes.data || []);
    }

    load();
    return () => { cancelled = true; };
  }, [session]);

  const wrap = (children) => (
    <div style={{ background: t.bg, minHeight: '100vh' }}>
      <div className="mx-auto max-w-3xl px-5 py-14">{children}</div>
    </div>
  );

  if (session === undefined) return wrap(<p className="text-sm opacity-60">Загрузка…</p>);
  if (!session) return wrap(<AuthGate onAuthenticated={() => {}} />);

  if (isAdmin === false) {
    return wrap(
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-2 text-xl" style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700 }}>Нет доступа</h1>
        <p className="text-sm" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI }}>
          Этот раздел только для администраторов. Установи <code>is_admin = true</code> в таблице{' '}
          <code>profiles</code> через Supabase Dashboard.
        </p>
      </div>
    );
  }

  if (isAdmin === null || !stats) return wrap(<p className="text-sm opacity-60">Загрузка…</p>);

  return wrap(
    <>
      <h1 className="mb-8 text-2xl" style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700 }}>
        Админ-панель
      </h1>

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Приглашений" value={stats.invitations} />
        <StatCard label="Ответов" value={stats.responses} />
        <StatCard label="Из них «Да»" value={stats.yes} />
        <StatCard label="Выручка" value={`${stats.revenue.toLocaleString('ru-RU')} сум`} sub={`${stats.paidCount} оплат`} />
      </div>

      <h2 className="mb-3 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>Последние приглашения</h2>
      <div className="space-y-2">
        {invitations.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between border-b py-2.5 text-sm" style={{ fontFamily: t.fontUI }}>
            <span style={{ color: t.ink }}>{inv.recipient_name}</span>
            <span style={{ color: t.ink, opacity: 0.5 }}>/i/{inv.slug} · {inv.status}</span>
          </div>
        ))}
      </div>
      {invitations.length === 0 && <p className="text-sm opacity-60">Пока пусто.</p>}
    </>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <TicketCard tokens={t}>
      <div className="p-4">
        <p className="text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>{label}</p>
        <p className="text-xl" style={{ color: t.ink, fontFamily: t.fontDisplay, fontWeight: 700 }}>{value}</p>
        {sub && <p className="text-xs" style={{ color: t.ink, opacity: 0.4, fontFamily: t.fontUI }}>{sub}</p>}
      </div>
    </TicketCard>
  );
}
