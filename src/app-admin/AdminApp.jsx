/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Админка: свой каркас с меню и отдельной страницей на каждый раздел
 * (/xujayin, /xujayin/analytics, …). Грузится лениво — код админки не
 * попадает в основной бандл, который скачивает каждый покупатель.
 *
 * ВАЖНО про безопасность: проверка is_admin здесь — только для UI.
 * Данные защищают RLS-политики и админские функции в базе, которые
 * проверяют is_admin сами.
 */

import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import NotFound from '../components/ui/NotFound.jsx';
import { A, useIsNarrow } from './adminUi.jsx';
import OverviewPage from './OverviewPage.jsx';
import AnalyticsSection from './AnalyticsSection.jsx';
import InvitationsPage from './InvitationsPage.jsx';
import PaymentsPage from './PaymentsPage.jsx';
import ContentPage from './ContentPage.jsx';
import MuseumStatsSection from './MuseumStatsSection.jsx';
import PartnersPage from './PartnersPage.jsx';

const NAV = [
  { to: '', label: 'Обзор', icon: '◎', end: true },
  { to: 'analytics', label: 'Аналитика', icon: '↗' },
  { to: 'invitations', label: 'Приглашения', icon: '✉' },
  { to: 'payments', label: 'Платежи', icon: '₸' },
  { to: 'content', label: 'Контент', icon: '▦' },
  { to: 'museum', label: 'Музей', icon: '⌂' },
  { to: 'partners', label: 'Партнёры', icon: '★' },
];

export default function AdminApp({ basePath }) {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);
  const narrow = useIsNarrow(860);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setIsAdmin(Boolean(data?.is_admin)); });
    return () => { cancelled = true; };
  }, [session]);

  const shell = (children) => (
    <div style={{ minHeight: '100vh', background: A.bg, fontFamily: A.fontUI, color: A.ink }}>{children}</div>
  );

  if (session === undefined) return shell(<p style={{ padding: 24, fontSize: 13, color: A.muted }}>Загрузка…</p>);
  // Гостевая сессия (купил без регистрации) — не вход в админку.
  if (!session || session.user?.is_anonymous) {
    return shell(
      <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
        <AuthGate context="admin" onAuthenticated={() => {}} />
      </div>,
    );
  }
  if (isAdmin === false) return <NotFound />;
  if (isAdmin === null) return shell(<p style={{ padding: 24, fontSize: 13, color: A.muted }}>Загрузка…</p>);

  const linkStyle = (isActive) => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: narrow ? '7px 12px' : '8px 12px', borderRadius: 8, textDecoration: 'none',
    fontSize: 13.5, fontWeight: isActive ? 700 : 600, whiteSpace: 'nowrap',
    color: isActive ? A.ink : A.muted,
    background: isActive ? A.surface : 'transparent',
    border: `1px solid ${isActive ? A.line : 'transparent'}`,
    boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
  });

  const nav = NAV.map((item) => (
    <NavLink
      key={item.to}
      to={item.to ? `${basePath}/${item.to}` : basePath}
      end={item.end}
      style={({ isActive }) => linkStyle(isActive)}
    >
      <span aria-hidden="true" style={{ width: 16, textAlign: 'center', opacity: 0.7 }}>{item.icon}</span>
      {item.label}
    </NavLink>
  ));

  const brand = (
    <Link to="/" style={{ display: 'flex', alignItems: 'baseline', gap: 6, textDecoration: 'none', color: A.ink }}>
      <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 24, fontWeight: 700, color: A.berry }}>Senti</span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: A.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>админка</span>
    </Link>
  );

  const content = (
    <Routes>
      <Route index element={<OverviewPage basePath={basePath} />} />
      <Route path="analytics" element={<AnalyticsSection />} />
      <Route path="invitations" element={<InvitationsPage />} />
      <Route path="payments" element={<PaymentsPage />} />
      <Route path="content" element={<ContentPage />} />
      <Route path="museum" element={<MuseumStatsSection />} />
      <Route path="partners" element={<PartnersPage />} />
      <Route path="*" element={<Navigate to={basePath} replace />} />
    </Routes>
  );

  if (narrow) {
    return shell(
      <>
        <header style={{
          position: 'sticky', top: 0, zIndex: 10, background: A.bg, borderBottom: `1px solid ${A.line}`,
          padding: '10px 16px 8px',
        }}
        >
          <div style={{ marginBottom: 8 }}>{brand}</div>
          <nav style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2, margin: '0 -4px' }}>{nav}</nav>
        </header>
        <main style={{ padding: '20px 16px 48px' }}>{content}</main>
      </>,
    );
  }

  return shell(
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 220, flexShrink: 0, borderRight: `1px solid ${A.line}`, padding: '20px 12px',
        position: 'sticky', top: 0, height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18,
      }}
      >
        <div style={{ padding: '0 8px' }}>{brand}</div>
        <nav style={{ display: 'grid', gap: 2 }}>{nav}</nav>
        <div style={{ marginTop: 'auto', padding: '0 8px', fontSize: 11.5, color: A.muted, lineHeight: 1.5 }}>
          {session.user.email || 'вход через Telegram'}
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, padding: '28px 32px 64px' }}>
        <div style={{ maxWidth: 1180 }}>{content}</div>
      </main>
    </div>,
  );
}
