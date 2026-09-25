/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Красивая страница просмотра одного ответа — открывается из "Мои
 * приглашения" по ссылке "Посмотреть ответ →", вместо того чтобы читать
 * его в сжатом виде прямо в карточке списка.
 */

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import TicketCard from '../components/ui/TicketCard.jsx';
import { getTemplateTokens } from '../templates/registry.js';

// Та же логика, что decodeSelections в InvitationList.jsx / api/telegram/notify.js —
// selections хранится как { [invitation_steps.id]: [optionId, ...] }.
function decodeSelections(steps, selections) {
  if (!selections || !steps?.length) return [];
  return steps
    .filter((s) => s.step_type === 'choice_place' || s.step_type === 'choice_food' || s.step_type === 'choice_block')
    .map((step) => {
      const ids = selections[step.id];
      if (!ids || ids.length === 0) return null;
      const options = step.configuration_json?.options || [];
      return {
        title: step.configuration_json?.title || 'Выбор',
        options: ids.map((id) => {
          const opt = options.find((o) => o.id === id);
          return opt ? { icon: opt.icon || '✨', label: opt.label } : { icon: '✨', label: id };
        }),
      };
    })
    .filter(Boolean);
}

function formatDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T${timeStr || '00:00'}`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const datePart = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const timePart = timeStr ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : null;
  return timePart ? `${datePart} в ${timePart}` : datePart;
}

export default function ResponseView() {
  const { invitationId } = useParams();
  const [session, setSession] = useState(undefined);
  const [state, setState] = useState({ status: 'loading' }); // loading | not_found | forbidden | ready
  const [invitation, setInvitation] = useState(null);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      const { data: inv, error: invErr } = await supabase
        .from('invitations')
        .select('*, invitation_steps(id, step_type, configuration_json)')
        .eq('id', invitationId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (invErr || !inv) {
        console.error('response view: invitation load failed', invErr);
        setState({ status: 'not_found' });
        return;
      }

      // Отдельный запрос вместо вложенного select — на вложенном join у
      // responses уже ловили баг с пустым результатом на бою (см. дашборд),
      // так что тут сразу берём проверенный путь.
      const { data: resp, error: respErr } = await supabase
        .from('responses')
        .select('answered_yes, selected_date, selected_time, selections, created_at')
        .eq('invitation_id', invitationId)
        .maybeSingle();

      if (cancelled) return;
      if (respErr) console.error('response view: response load failed', respErr);

      setInvitation(inv);
      setResponse(resp || null);
      setState({ status: 'ready' });
    }

    load();
    return () => { cancelled = true; };
  }, [session, invitationId]);

  if (session === undefined || (session && state.status === 'loading')) {
    return <CenteredMessage text="Загрузка…" />;
  }
  if (!session) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8" style={{ background: '#FDF0F3', minHeight: '100vh' }}>
        <AuthGate onAuthenticated={() => {}} />
      </div>
    );
  }
  if (state.status === 'not_found') {
    return <CenteredMessage text="Приглашение не найдено." />;
  }

  const tokens = getTemplateTokens(invitation.template_key);
  const choiceAnswers = decodeSelections(invitation.invitation_steps, response?.selections);
  const when = response ? formatDateTime(response.selected_date, response.selected_time) : null;
  const genderEmoji = invitation.recipient_gender === 'male' ? '👨' : invitation.recipient_gender === 'female' ? '👩' : '';

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(165deg, ${tokens.bg} 0%, ${tokens.bg} 55%, ${tokens.card === '#FFFFFF' ? '#ffeef5' : tokens.bgDark} 100%)`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: tokens.berry, opacity: 0.12, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: tokens.berry, opacity: 0.1, pointerEvents: 'none' }} />

      <div className="mx-auto max-w-[420px] px-4 py-10" style={{ position: 'relative', zIndex: 1 }}>
        <Link
          to="/dashboard"
          className="mb-5 inline-flex items-center gap-1.5 text-xs no-underline"
          style={{ color: tokens.ink, opacity: 0.55, fontFamily: tokens.fontUI }}
        >
          ← Мои приглашения
        </Link>

        <TicketCard
          tokens={tokens}
          style={{ boxShadow: `0 24px 60px -20px ${tokens.ink}35, 0 2px 8px ${tokens.ink}08` }}
        >
          <div style={{ padding: '20px 28px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>
              {response ? (response.answered_yes ? '❤️' : '💔') : '⏳'}
            </div>
            <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
              {genderEmoji} {invitation.recipient_name}
            </h1>
            <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, opacity: 0.75, marginBottom: 24 }}>
              {!response
                ? 'Пока нет ответа'
                : response.answered_yes ? 'Ответила: Да, увидимся! ✨' : 'Ответила: Нет 💔'}
            </p>

            {response && when && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: tokens.bg, borderRadius: 100, padding: '10px 20px',
                marginBottom: choiceAnswers.length > 0 ? 24 : 4,
              }}>
                <span style={{ fontSize: 18 }}>📅</span>
                <span style={{ fontFamily: tokens.fontUI, fontWeight: 600, color: tokens.ink, fontSize: 14 }}>{when}</span>
              </div>
            )}

            {choiceAnswers.map((c, i) => (
              <div key={i} style={{ marginBottom: i < choiceAnswers.length - 1 ? 20 : 4, textAlign: 'left' }}>
                <p style={{ fontFamily: tokens.fontUI, color: tokens.ink, opacity: 0.55, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 10 }}>
                  {c.title}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {c.options.map((opt, j) => (
                    <div
                      key={j}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: `linear-gradient(135deg, ${tokens.berry}, ${tokens.amber || tokens.berry})`,
                        color: '#fff', borderRadius: 100, padding: '8px 16px',
                        fontFamily: tokens.fontUI, fontWeight: 600, fontSize: 13,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>{opt.icon}</span>
                      {opt.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!response && (
              <p style={{ fontFamily: tokens.fontUI, color: tokens.ink, opacity: 0.5, fontSize: 13, marginTop: 8 }}>
                Как только {invitation.recipient_name} ответит, здесь появятся все детали.
              </p>
            )}
          </div>
        </TicketCard>
      </div>
    </div>
  );
}

function CenteredMessage({ text }) {
  return (
    <div style={{ minHeight: '100vh', background: '#FDF0F3' }} className="flex items-center justify-center px-6 text-center">
      <p style={{ color: '#6B4D5A', fontSize: 14, opacity: 0.8 }}>{text}</p>
    </div>
  );
}
