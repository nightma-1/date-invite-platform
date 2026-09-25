/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { getTemplateTokens } from '../templates/registry.js';
import QuestionScreen, { DEFAULT_NO_PHRASES } from '../components/screens/QuestionScreen.jsx';
import ReactionScreen from '../components/screens/ReactionScreen.jsx';
import DateTimeScreen from '../components/screens/DateTimeScreen.jsx';
import ChoiceScreen from '../components/screens/ChoiceScreen.jsx';
import DoubleChoiceScreen from '../components/screens/DoubleChoiceScreen.jsx';
import FinalScreen from '../components/screens/FinalScreen.jsx';

// 'time' больше не отдельный шаг (дата и время теперь на одном экране —
// см. DateTimeScreen.jsx), но старые опубликованные приглашения могут
// ещё хранить его отдельной строкой в invitation_steps — просто пропускаем.
// 'choice_block' — тоже легаси: раньше был один шаг выбора с переключателем
// категории, теперь два отдельных ('choice_place' + 'choice_food').
const RENDERABLE_STEP_TYPES = new Set(['question', 'reaction', 'date', 'choice_block', 'choice_place', 'choice_food', 'final']);

export default function InvitationRuntime() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  // Временный переключатель формы карточки вопроса для живого сравнения
  // на проде: ?card=arch|envelope|polaroid|blob. По умолчанию — текущий
  // ("билетный") дизайн, поведение для получателей не меняется.
  const cardShapeParam = searchParams.get('card');
  const cardShape = ['arch', 'envelope', 'polaroid', 'blob'].includes(cardShapeParam)
    ? cardShapeParam
    : 'classic';
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
  function goNextBy(n) {
    setActiveIndex((i) => Math.min(i + n, steps.length - 1));
  }
  function goPrev() {
    setActiveIndex((i) => {
      let next = Math.max(i - 1, 0);
      // choice_food никогда не показывается сам по себе (он объединён с
      // choice_place на одном экране) — если шаг назад приземлился именно
      // на него, прыгаем ещё на шаг назад
      if (steps[next]?.step_type === 'choice_food' && steps[next - 1]?.step_type === 'choice_place') {
        next = Math.max(next - 1, 0);
      }
      return next;
    });
  }

  async function handleFinalSubmit() {
    setSubmitting(true);
    try {
      // На invitation_id стоит unique-ограничение (один ответ на
      // приглашение), так что повторная отправка — например, если
      // получатель вернулся по той же ссылке и прошёл шаги заново —
      // должна обновить существующий ответ, а не упасть с ошибкой конфликта.
      //
      // ВАЖНО: не supabase upsert()/ON CONFLICT — Postgres требует, чтобы
      // у роли было SELECT-разрешение (через RLS) на уже существующую
      // строку, иначе конфликт использовался бы как канал для проверки
      // "есть ли уже такая строка" в обход приватности. У анонимного
      // получателя такого доступа нет (и не должно быть — это чужой ответ),
      // поэтому upsert падал с "new row violates row-level security policy",
      // даже с корректными insert/update-политиками. Явные insert → (при
      // конфликте) update этого не требуют.
      const payload = {
        invitation_id: invitation.id,
        answered_yes: true,
        selected_date: answers.selectedDate,
        selected_time: answers.selectedTime,
        selections: answers.selections,
      };
      let { error } = await supabase.from('responses').insert(payload);
      if (error?.code === '23505') {
        ({ error } = await supabase.from('responses').update(payload).eq('invitation_id', invitation.id));
      }
      if (error) { console.error('response submit failed', error); throw error; }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (state.status === 'loading') {
    return <CenteredMessage text="Открываем приглашение…" tokens={tokens} />;
  }
  if (state.status === 'not_found') {
    return <CenteredMessage text="Кажется, ссылка больше не работает." tokens={tokens} />;
  }
  if (state.status === 'expired') {
    return <CenteredMessage text="💌 Это приглашение больше недоступно." tokens={tokens} />;
  }

  const activeStep = steps[activeIndex];
  const summaryLines = [
    answers.selectedDate ? `📅 Дата: ${answers.selectedDate}` : null,
    answers.selectedTime ? `🕒 Время: ${answers.selectedTime}` : null,
  ].filter(Boolean);

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(165deg, ${tokens.bg} 0%, ${tokens.bg} 55%, ${tokens.card === '#FFFFFF' ? '#ffeef5' : tokens.bgDark} 100%)`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Тёплый декор — так же тепло, как на лендинге и в конструкторе */}
      <div style={{ position: 'absolute', top: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: tokens.berry, opacity: 0.12, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: tokens.berry, opacity: 0.1, pointerEvents: 'none' }} />

      {/* Кнопка "назад" — как в конструкторе, можно поправить предыдущий шаг */}
      {activeIndex > 0 && !submitted && (
        <button
          type="button"
          onClick={goPrev}
          aria-label="Назад"
          style={{
            position: 'fixed', top: 18, left: 18, zIndex: 2,
            width: 42, height: 42, borderRadius: '50%',
            border: `1px solid ${tokens.ink}20`,
            background: tokens.card, color: tokens.berry,
            fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 6px 16px -6px ${tokens.ink}30`,
          }}
        >
          ←
        </button>
      )}

      <div className="mx-auto max-w-[380px] px-4 py-10" style={{ position: 'relative', zIndex: 1 }}>
      {activeStep?.step_type === 'question' && (
        <QuestionScreen
          recipientName={invitation.recipient_name}
          questionText={content?.question_text?.ru?.question}
          yesText={content?.question_text?.ru?.yes || undefined}
          noPhrases={
            content?.question_text?.ru?.no
              ? [content.question_text.ru.no, ...DEFAULT_NO_PHRASES.slice(1)]
              : undefined
          }
          mediaUrl={content?.gif_url}
          recipientGender={invitation.recipient_gender}
          tokens={tokens}
          onYes={goNext}
          cardShape={cardShape}
        />
      )}
      {activeStep?.step_type === 'reaction' && (
        <ReactionScreen
          title={content?.reaction_text?.ru?.title}
          text={content?.reaction_text?.ru?.text}
          mediaUrl={activeStep.configuration_json?.mediaUrl}
          recipientGender={invitation.recipient_gender}
          tokens={tokens}
          onContinue={goNext}
        />
      )}
      {activeStep?.step_type === 'date' && (
        <DateTimeScreen
          title={activeStep.configuration_json?.title}
          buttonText={activeStep.configuration_json?.buttonText}
          mode={activeStep.configuration_json?.mode}
          fixedDate={activeStep.configuration_json?.fixedDate}
          fixedTime={activeStep.configuration_json?.fixedTime}
          tokens={tokens}
          onContinue={({ date, time }) => {
            setAnswers((a) => ({ ...a, selectedDate: date, selectedTime: time }));
            goNext();
          }}
        />
      )}
      {activeStep?.step_type === 'choice_place'
        && steps[activeIndex + 1]?.step_type === 'choice_food' && (
        <DoubleChoiceScreen
          key={activeStep.id}
          placeTitle={activeStep.configuration_json?.title}
          placeOptions={activeStep.configuration_json?.options || []}
          placeAllowMultiple={activeStep.configuration_json?.allowMultiple}
          foodTitle={steps[activeIndex + 1].configuration_json?.title}
          foodOptions={steps[activeIndex + 1].configuration_json?.options || []}
          foodAllowMultiple={steps[activeIndex + 1].configuration_json?.allowMultiple}
          tokens={tokens}
          onContinue={({ placeIds, foodIds }) => {
            const foodStepId = steps[activeIndex + 1].id;
            setAnswers((a) => ({
              ...a,
              selections: {
                ...a.selections,
                [activeStep.id]: placeIds,
                [foodStepId]: foodIds,
              },
            }));
            goNextBy(2);
          }}
        />
      )}
      {(activeStep?.step_type === 'choice_block'
        || ((activeStep?.step_type === 'choice_place' || activeStep?.step_type === 'choice_food')
          && !(activeStep.step_type === 'choice_place' && steps[activeIndex + 1]?.step_type === 'choice_food'))) && (
        <ChoiceScreen
          key={activeStep.id}
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
    </div>
  );
}

function CenteredMessage({ text, tokens }) {
  return (
    <div style={{ minHeight: '100vh', background: tokens?.bg || '#FDF0F3' }} className="flex items-center justify-center px-6 text-center">
      <p style={{ color: tokens?.inkMuted || '#6B4D5A', fontFamily: tokens?.fontUI, fontSize: 14, opacity: 0.8 }}>{text}</p>
    </div>
  );
}
