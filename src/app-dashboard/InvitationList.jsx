/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import TicketCard from '../components/ui/TicketCard.jsx';
import { getTemplateTokens } from '../templates/registry.js';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import { T, DecorativeBlobs } from '../app-builder/BuilderUI.jsx';

const t = getTemplateTokens('romantic');

// Фиксируем градиент к вьюпорту (backgroundAttachment/Size), а не к высоте
// всей страницы — иначе на длинной прокручиваемой странице розовый конец
// градиента "уезжает" далеко вниз и видно только белое начало.
const PAGE_BG_STYLE = {
  background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
  backgroundAttachment: 'fixed',
  backgroundSize: '100% 100vh',
  backgroundRepeat: 'no-repeat',
};

// selections в responses хранится как { [invitation_steps.id]: [optionId, ...] } —
// разворачиваем в читаемые "иконка + название" по конфигу соответствующего шага.
function decodeSelections(inv, response, fallbackTitle) {
  if (!response?.selections || !inv.invitation_steps?.length) return [];
  return inv.invitation_steps
    .filter((s) => s.step_type === 'choice_place' || s.step_type === 'choice_food' || s.step_type === 'choice_block')
    .map((step) => {
      const ids = response.selections[step.id];
      if (!ids || ids.length === 0) return null;
      const options = step.configuration_json?.options || [];
      const labels = ids.map((id) => {
        const opt = options.find((o) => o.id === id);
        return opt ? `${opt.icon || ''} ${opt.label}`.trim() : id;
      });
      return { title: step.configuration_json?.title || fallbackTitle, labels };
    })
    .filter(Boolean);
}

export default function InvitationList() {
  const { t: tr } = useTranslation();
  const STATUS_LABELS = tr('dashboard.status', { returnObjects: true });
  const [session, setSession] = useState(undefined);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedSlug, setCopiedSlug] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [telegramLinked, setTelegramLinked] = useState(null); // null = ещё не знаем
  const [payingId, setPayingId] = useState(null);

  // Черновик (status: 'draft') — это приглашение, за которое ещё не
  // заплатили: человек мог закрыть вкладку Click на полпути. Публикует его
  // вебхук Click после оплаты, поэтому отсюда просто заново создаём платёж
  // и уводим на оплату — ничего не публикуем сами.
  async function payForInvitation(inv) {
    setPayingId(inv.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const res = await fetch('/api/click/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ invitationId: inv.id }),
      });
      const data = await res.json();
      if (res.ok && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      alert(data.error || tr('dashboard.payFailed'));
    } catch {
      alert(tr('dashboard.payFailed'));
    }
    setPayingId(null);
  }

  async function connectTelegram() {
    // Открываем окно сразу (в обработчике клика), иначе браузер заблокирует попап
    const win = window.open('', '_blank');
    try {
      const res = await fetch('/api/telegram/connect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'telegram connect failed');
      if (win) win.location.href = data.url;
      else window.location.href = data.url;
    } catch (e) {
      win?.close();
      console.error('telegram connect failed', e);
    }
  }

  function copyLink(slug) {
    const url = `${window.location.origin}/i/${slug}`;
    navigator.clipboard?.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug((s) => (s === slug ? null : s)), 2000);
  }

  async function deleteInvitation(inv) {
    if (!confirm(tr('dashboard.deleteConfirm', { name: inv.recipient_name }))) return;
    setDeletingId(inv.id);
    const { error } = await supabase.from('invitations').delete().eq('id', inv.id);
    setDeletingId(null);
    if (error) {
      alert(tr('dashboard.deleteFailed', { reason: error.message || tr('dashboard.deleteFailedFallback') }));
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
      // Раньше responses тянулись вложенным select'ом (invitations.select('*,
      // responses(...)')) — на проде это почему-то стабильно возвращало
      // пустой responses[], хотя ответ есть в базе и RLS его разрешает (это
      // проверено напрямую в базе с ролью authenticated и тем же uid — всё
      // отдаётся). Похоже на особенность PostgREST именно с этим вложенным
      // джойном на бою. Обходим: тянем ответы отдельным запросом (как и
      // profiles ниже, который всегда работал) и склеиваем на клиенте.
      const { data: invData, error: invErr } = await supabase
        .from('invitations')
        .select('*, invitation_steps(id, step_type, configuration_json)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (invErr) {
        console.error('invitations load failed', invErr);
        if (!cancelled) setLoading(false);
        return;
      }

      const ids = (invData || []).map((inv) => inv.id);
      let responsesByInvitation = {};
      if (ids.length > 0) {
        const { data: respData, error: respErr } = await supabase
          .from('responses')
          .select('invitation_id, answered_yes, selected_date, selected_time, selections, created_at')
          .in('invitation_id', ids);
        if (respErr) {
          console.error('responses load failed', respErr);
        } else {
          responsesByInvitation = Object.fromEntries((respData || []).map((r) => [r.invitation_id, r]));
        }
      }

      const merged = (invData || []).map((inv) => ({
        ...inv,
        responses: responsesByInvitation[inv.id] ? [responsesByInvitation[inv.id]] : [],
      }));

      if (!cancelled) {
        setInvitations(merged);
        setLoading(false);
      }
    }

    async function loadProfile() {
      const { data } = await supabase
        .from('profiles')
        .select('telegram_chat_id')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled) setTelegramLinked(!!data?.telegram_chat_id);
    }

    load();
    loadProfile();
    return () => { cancelled = true; };
  }, [session]);

  if (session === undefined) return <p className="p-8 text-center text-sm opacity-60">{tr('dashboard.loading')}</p>;

  if (!session) {
    return (
      <div style={{ ...PAGE_BG_STYLE, minHeight: '100vh', position: 'relative' }}>
        <DecorativeBlobs />
        <div className="mx-auto max-w-4xl px-4 py-8" style={{ position: 'relative', zIndex: 1 }}>
          <AuthGate onAuthenticated={() => {}} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...PAGE_BG_STYLE, minHeight: '100vh', position: 'relative' }}>
      <DecorativeBlobs />
      <div className="mx-auto max-w-2xl px-5 py-14" style={{ position: 'relative', zIndex: 1 }}>
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs no-underline"
            style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}
          >
            {tr('dashboard.backHome')}
          </Link>
          <LanguageSwitcher />
        </div>
        <h1 className="mb-4 text-2xl" style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700 }}>
          {tr('dashboard.title')}
        </h1>

        {telegramLinked === false && (
          <button
            type="button"
            onClick={connectTelegram}
            className="mb-8 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left"
            style={{ background: '#EAF6FF', border: '1.5px solid #B3E0FF', cursor: 'pointer' }}
          >
            <span style={{ color: '#1E6FA8', fontFamily: t.fontUI, fontSize: 13.5, fontWeight: 600 }}>
              {tr('dashboard.telegramConnectText')}
            </span>
            <span style={{ color: '#1E6FA8', fontFamily: t.fontUI, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {tr('dashboard.telegramConnectAction')}
            </span>
          </button>
        )}
        {telegramLinked === true && (
          <p className="mb-8 text-xs" style={{ color: t.ink, opacity: 0.45, fontFamily: t.fontUI }}>
            {tr('dashboard.telegramConnected')}
          </p>
        )}

        {loading && <p className="text-sm opacity-60">{tr('dashboard.loading')}</p>}

        {!loading && invitations.length === 0 && (
          <p className="text-sm" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI }}>
            {tr('dashboard.empty')}{' '}
            <Link to="/builder" className="underline" style={{ color: t.berry }}>{tr('dashboard.createFirst')}</Link>
          </p>
        )}

        <div className="space-y-3">
          {invitations.map((inv) => {
            const response = inv.responses?.[0];
            const choiceAnswers = decodeSelections(inv, response, tr('dashboard.choiceFallbackTitle'));
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
                      {response.answered_yes ? tr('dashboard.answeredYes') : tr('dashboard.answeredNo')}
                      {response.selected_date && ` · ${response.selected_date}`}
                      {response.selected_time && ` ${response.selected_time}`}
                    </p>
                  ) : (
                    <p className="text-sm" style={{ color: t.ink, opacity: 0.4, fontFamily: t.fontUI }}>{tr('dashboard.noAnswerYet')}</p>
                  )}
                  {choiceAnswers.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {choiceAnswers.map((c, i) => (
                        <p key={i} className="text-xs" style={{ color: t.ink, opacity: 0.65, fontFamily: t.fontUI }}>
                          {c.title}: <span style={{ fontWeight: 600 }}>{c.labels.join(', ')}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 mb-3 flex flex-wrap gap-x-4 gap-y-1">
                    {response && (
                      <Link to={`/dashboard/response/${inv.id}`} className="inline-block text-xs underline" style={{ color: t.berry, fontWeight: 600 }}>
                        {tr('dashboard.viewResponse')}
                      </Link>
                    )}
                    {inv.status === 'published' && (
                      <Link to={`/i/${inv.slug}`} className="inline-block text-xs underline" style={{ color: t.ink, opacity: 0.6 }}>
                        {tr('dashboard.openRecipientLink')}
                      </Link>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {inv.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => payForInvitation(inv)}
                        disabled={payingId === inv.id}
                        className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
                        style={{
                          background: t.berry, color: '#fff', border: 'none', fontFamily: t.fontUI,
                          cursor: payingId === inv.id ? 'not-allowed' : 'pointer',
                          opacity: payingId === inv.id ? 0.7 : 1,
                        }}
                      >
                        {payingId === inv.id ? tr('dashboard.paying') : tr('dashboard.payAndPublish')}
                      </button>
                    )}
                    <Link
                      to={`/builder/edit/${inv.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold no-underline"
                      style={{ background: 'white', color: t.ink, border: `1.5px solid ${t.ink}25`, fontFamily: t.fontUI }}
                    >
                      {tr('dashboard.edit')}
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
                        {copiedSlug === inv.slug ? tr('dashboard.copied') : tr('dashboard.copyLink')}
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
                      {deletingId === inv.id ? tr('dashboard.deleting') : tr('dashboard.delete')}
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
