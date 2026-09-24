/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import TicketCard from '../components/ui/TicketCard.jsx';
import { getTemplateTokens } from '../templates/registry.js';

const STATUS_LABELS = { draft: 'Черновик', published: 'Активно', expired: 'Истекло', archived: 'Архив' };
const t = getTemplateTokens('romantic');

export default function InvitationList() {
  const [session, setSession] = useState(undefined);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  function copyLink(slug) {
    const url = `${window.location.origin}/i/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 2000);
  }

  async function deleteInvitation(inv) {
    if (!confirm(`Удалить приглашение «${inv.recipient_name}»? Это нельзя отменить, ссылка перестанет работать.`)) return;
    setDeletingId(inv.id);
    const { error } = await supabase.from('invitations').delete().eq('id', inv.id);
    setDeletingId(null);
    if (error) {
      alert('Не получилось удалить: ' + (error.message || 'попробуй ещё раз'));
      return;
    }
    setInvitations((prev) => prev.filter((i) => i.id !== inv.id));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('invitations')
        .select('*, responses(answered_yes, selected_date, selected_time, created_at)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      if (!cancelled) {
        if (!error) setInvitations(data);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined) return <p className="p-8 text-center text-sm opacity-60">Загрузка…</p>;

  if (!session) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8" style={{ background: t.bg, minHeight: '100vh' }}>
        <AuthGate onAuthenticated={() => {}} />
      </div>
    );
  }

  return (
    <div style={{ background: t.bg, minHeight: '100vh' }}>
      <div className="mx-auto max-w-2xl px-5 py-14">
        <h1 className="mb-8 text-2xl" style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700 }}>
          Мои приглашения
        </h1>

        {loading && <p className="text-sm opacity-60">Загрузка…</p>}

        {!loading && invitations.length === 0 && (
          <p className="text-sm" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI }}>
            Пока нет ни одного.{' '}
            <Link to="/builder" className="underline" style={{ color: t.berry }}>Создать первое →</Link>
          </p>
        )}

        <div className="space-y-3">
          {invitations.map((inv) => {
            const response = inv.responses?.[0];
            return (
              <TicketCard key={inv.id} tokens={t}>
                <div className="p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <span style={{ color: t.ink, fontFamily: t.fontUI, fontWeight: 600 }}>
                      {inv.recipient_gender === 'male' ? '👨 ' : inv.recipient_gender === 'female' ? '👩 ' : ''}
                      {inv.recipient_name}
                    </span>
                    <span className="text-xs" style={{ color: t.ink, opacity: 0.5, fontFamily: t.fontUI }}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </div>
                  <p className="mb-2 text-xs" style={{ color: t.ink, opacity: 0.45, fontFamily: t.fontUI }}>/i/{inv.slug}</p>
                  {response ? (
                    <p className="text-sm" style={{ color: t.berry, fontFamily: t.fontUI }}>
                      {response.answered_yes ? '❤️ Ответила: Да' : 'Ответила: Нет'}
                      {response.selected_date && ` · ${response.selected_date}`}
                      {response.selected_time && ` ${response.selected_time}`}
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: t.ink, opacity: 0.4, fontFamily: t.fontUI }}>Пока без ответа</p>
                  )}
                  {inv.status === 'published' && (
                    <Link to={`/i/${inv.slug}`} className="mt-2 mb-3 inline-block text-xs underline" style={{ color: t.ink, opacity: 0.6 }}>
                      Открыть ссылку получателя →
                    </Link>
                  )}

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link
                      to={`/builder/edit/${inv.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold no-underline"
                      style={{ background: 'white', color: t.ink, border: `1.5px solid ${t.ink}25`, fontFamily: t.fontUI }}
                    >
                      ✏️ Изменить
                    </Link>
                    {inv.status === 'published' && (
                      <button
                        type="button"
                        onClick={() => copyLink(inv.slug)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
                        style={{
                          background: copiedSlug === inv.slug ? t.berry : t.berry + '15',
                          color: copiedSlug === inv.slug ? '#fff' : t.berry,
                          border: 'none', fontFamily: t.fontUI, cursor: 'pointer',
                        }}
                      >
                        {copiedSlug === inv.slug ? 'Скопировано ✓' : '🔗 Скопировать ссылку'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteInvitation(inv)}
                      disabled={deletingId === inv.id}
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
                      style={{
                        background: 'white', color: '#C0392B', border: '1.5px solid #C0392B30',
                        fontFamily: t.fontUI, cursor: deletingId === inv.id ? 'not-allowed' : 'pointer',
                        opacity: deletingId === inv.id ? 0.5 : 1,
                      }}
                    >
                      {deletingId === inv.id ? 'Удаляем…' : '🗑️ Удалить'}
                    </button>
                  </div>
                </div>
              </TicketCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
