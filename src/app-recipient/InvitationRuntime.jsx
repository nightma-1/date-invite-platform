/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { getTemplateTokens } from '../templates/registry.js';
import QuestionScreen from '../components/screens/QuestionScreen.jsx';
import ReactionScreen from '../components/screens/ReactionScreen.jsx';
import DateScreen from '../components/screens/DateScreen.jsx';
import TimeScreen from '../components/screens/TimeScreen.jsx';
import ChoiceScreen from '../components/screens/ChoiceScreen.jsx';
import FinalScreen from '../components/screens/FinalScreen.jsx';

const RENDERABLE_STEP_TYPES = new Set(['question', 'reaction', 'date', 'time', 'choice_block', 'final']);

export default function InvitationRuntime() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading' }); // loading | not_found | expired | ready
  const [invitation, setInvitation] = useState(null);
  const [content, setContent] = useState(null);
  const [steps, setSteps] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState({ selectedDate: null, selectedTime: null, selections: {} });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: inv, error: invError } = await supabase
        .from('invitations')
        .select('*, invitation_content(*), invitation_steps(*)')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (cancelled) return;

      if (invError || !inv) {
        setState({ status: 'not_found' });
        return;
      }
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        setState({ status: 'expired' });
        return;
      }

      setInvitation(inv);
      setContent(inv.invitation_content);
      setSteps(
        [...inv.invitation_steps]
          .filter((s) => s.enabled && RENDERABLE_STEP_TYPES.has(s.step_type))
          .sort((a, b) => a.step_order - b.step_order)
      );
      setState({ status: 'ready' });

      // Не блокируем рендер результатом — это уведомление, а не критичный путь
      supabase.rpc('mark_invitation_viewed', { p_slug: slug }).then(({ error }) => {
        if (error) console.error('mark_invitation_viewed failed', error);
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const tokens = useMemo(() => getTemplateTokens(invitation?.template_key), [invitation]);

  function goNext() {
    setActiveIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  async function handleFinalSubmit() {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('responses').insert({
        invitation_id: invitation.id,
        answered_yes: true,
        selected_date: answers.selectedDate,
        selected_time: answers.selectedTime,
        selections: answers.selections,
      });
      if (error) throw error;
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === 'loading') {
    return <CenteredMessage text="Открываем приглашение…" />;
  }
  if (state.status === 'not_found') {
    return <CenteredMessage text="Кажется, ссылка больше не работает." />;
  }
  if (state.status === 'expired') {
    return <CenteredMessage text="💌 Это приглашение больше недоступно." />;
  }

  const activeStep = steps[activeIndex];
  const summaryLines = [
    answers.selectedDate ? `📅 Дата: ${answers.selectedDate}` : null,
    answers.selectedTime ? `🕒 Время: ${answers.selectedTime}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[380px] px-4 py-10">
      {activeStep?.step_type === 'question' && (
        <QuestionScreen
          recipientName={invitation.recipient_name}
          questionText={content?.question_text?.ru?.question}
          yesText={content?.question_text?.ru?.yes || undefined}
          mediaUrl={content?.gif_url}
          tokens={tokens}
          onYes={goNext}
        />
      )}
      {activeStep?.step_type === 'reaction' && (
        <ReactionScreen
          title={content?.reaction_text?.ru?.title}
          text={content?.reaction_text?.ru?.text}
          tokens={tokens}
          onContinue={goNext}
        />
      )}
      {activeStep?.step_type === 'date' && (
        <DateScreen
          title={activeStep.configuration_json?.title}
          mode={activeStep.configuration_json?.mode}
          fixedDate={activeStep.configuration_json?.fixedDate}
          tokens={tokens}
          onContinue={(selectedDate) => {
            setAnswers((a) => ({ ...a, selectedDate }));
            goNext();
          }}
        />
      )}
      {activeStep?.step_type === 'time' && (
        <TimeScreen
          title={activeStep.configuration_json?.title}
          mode={activeStep.configuration_json?.mode}
          fixedTime={activeStep.configuration_json?.fixedTime}
          tokens={tokens}
          onContinue={(selectedTime) => {
            setAnswers((a) => ({ ...a, selectedTime }));
            goNext();
          }}
        />
      )}
      {activeStep?.step_type === 'choice_block' && (
        <ChoiceScreen
          title={activeStep.configuration_json?.title}
          options={activeStep.configuration_json?.options || []}
          allowMultiple={activeStep.configuration_json?.allowMultiple}
          tokens={tokens}
          onContinue={(selectedIds) => {
            setAnswers((a) => ({
              ...a,
              selections: { ...a.selections, [activeStep.id]: selectedIds },
            }));
            goNext();
          }}
        />
      )}
      {activeStep?.step_type === 'final' && (
        <FinalScreen
          title={content?.final_screen?.ru?.title}
          description={content?.final_screen?.ru?.description}
          summary={summaryLines}
          tokens={tokens}
          submitting={submitting}
          submitted={submitted}
          onSubmit={handleFinalSubmit}
        />
      )}
    </div>
  );
}

function CenteredMessage({ text }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-6 text-center text-sm opacity-70">{text}</div>
  );
}
