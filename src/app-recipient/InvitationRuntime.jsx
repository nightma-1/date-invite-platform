/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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
  // Форма карточки выбирается в конструкторе и хранится в invitations.card_shape.
  // ?card=arch|envelope|polaroid|blob по-прежнему можно добавить в ссылку, чтобы
  // локально посмотреть другую форму, не трогая сохранённый выбор автора.

  // Лёгкий параллакс тёплого декора (круги на фоне) при движении мыши —
  // на тач-устройствах просто нет mousemove, декор остаётся статичным.
  const sceneRef = useRef(null);
  const blob1Ref = useRef(null);
  const blob2Ref = useRef(null);
  const trailLayerRef = useRef(null);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    // Курсор оставляет за собой тающий след из сердечек/искорок — только на
    // устройствах с мышью (на тач это событие просто не приходит). Вставляем
    // напрямую в DOM (а не через React state), чтобы частые mousemove не
    // гоняли лишние ре-рендеры.
    const TRAIL_ICONS = ['💗', '✨'];
    let lastTrailAt = 0;
    function handleMove(e) {
      const r = scene.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      if (blob1Ref.current) blob1Ref.current.style.transform = `translate(${px * 16}px, ${py * 16}px)`;
      if (blob2Ref.current) blob2Ref.current.style.transform = `translate(${px * -16}px, ${py * -16}px)`;

      const now = Date.now();
      if (trailLayerRef.current && now - lastTrailAt > 100) {
        lastTrailAt = now;
        const span = document.createElement('span');
        span.className = 'invite-trail-heart';
        span.textContent = TRAIL_ICONS[Math.floor(Math.random() * TRAIL_ICONS.length)];
        span.style.left = `${e.clientX - r.left}px`;
        span.style.top = `${e.clientY - r.top}px`;
        trailLayerRef.current.appendChild(span);
        setTimeout(() => span.remove(), 900);
      }
    }
    function handleLeave() {
      if (blob1Ref.current) blob1Ref.current.style.transform = '';
      if (blob2Ref.current) blob2Ref.current.style.transform = '';
    }
    scene.addEventListener('mousemove', handleMove);
    scene.addEventListener('mouseleave', handleLeave);
    return () => {
      scene.removeEventListener('mousemove', handleMove);
      scene.removeEventListener('mouseleave', handleLeave);
    };
  }, []);

  // Тихий, редкий "дождь" сердечек — фон, а не разовое событие; параметры
  // считаются один раз, чтобы не пересоздавать список при каждом ре-рендере.
  const fallingHearts = useMemo(() => {
    const icons = ['💗', '✨', '🤍'];
    return Array.from({ length: 9 }).map((_, i) => ({
      id: i,
      icon: icons[i % icons.length],
      left: Math.random() * 94,
      size: 12 + Math.random() * 10,
      opacity: 0.3 + Math.random() * 0.25,
      duration: 9 + Math.random() * 7,
      delay: Math.random() * 8,
    }));
  }, []);

  // Мягкие размытые пятна-боке, лениво покачивающиеся вверх-вниз — заполняют
  // пустой фон вокруг карточки, не отвлекая от неё.
  const bokehSpots = useMemo(() => ([
    { w: 90, h: 90, top: '8%', left: '9%', opacity: 0.45, dur: 7, delay: 0 },
    { w: 46, h: 46, top: '72%', left: '15%', opacity: 0.4, dur: 6, delay: 1 },
    { w: 120, h: 120, top: '58%', left: '82%', opacity: 0.3, dur: 9, delay: 0.5 },
    { w: 40, h: 40, top: '18%', left: '86%', opacity: 0.25, dur: 5.5, delay: 1.4 },
  ]), []);
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
  const cardShapeParam = searchParams.get('card');
  const cardShape = ['arch', 'envelope', 'polaroid', 'blob'].includes(cardShapeParam)
    ? cardShapeParam
    : (invitation?.card_shape || 'classic');

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
    <div
      ref={sceneRef}
      className="invite-scene-breathe"
      style={{
        minHeight: '100vh',
        background: `linear-gradient(165deg, ${tokens.bg} 0%, ${tokens.bg} 55%, ${tokens.card === '#FFFFFF' ? '#ffeef5' : tokens.bgDark} 100%)`,
        backgroundSize: '140% 140%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Очень медленное, почти незаметное "дыхание" фонового градиента +
          плывущие пятна-боке + тихий дождь сердечек + след за курсором */}
      <style>{`
        @keyframes inviteBgBreathe { 0%, 100% { background-position: 0% 0%; } 50% { background-position: 20% 10%; } }
        .invite-scene-breathe { animation: inviteBgBreathe 14s ease-in-out infinite; }
        @keyframes inviteBokehDrift { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(8px, -22px); } }
        .invite-bokeh { animation: inviteBokehDrift ease-in-out infinite; }
        @keyframes inviteHeartFall {
          0% { transform: translateY(-24px); opacity: 0; }
          8% { opacity: var(--fh-opacity, 0.4); }
          92% { opacity: var(--fh-opacity, 0.4); }
          100% { transform: translateY(105vh); opacity: 0; }
        }
        .invite-heart-fall { animation: inviteHeartFall linear infinite; }
        @keyframes inviteTrailFade {
          0% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -90%) scale(0.6); }
        }
        .invite-trail-heart {
          position: absolute; font-size: 15px; pointer-events: none;
          animation: inviteTrailFade 0.9s ease-out forwards;
        }
      `}</style>

      {/* Тёплый декор — так же тепло, как на лендинге и в конструкторе; лёгкий параллакс при движении мыши */}
      <div ref={blob1Ref} style={{ position: 'absolute', top: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: tokens.berry, opacity: 0.12, pointerEvents: 'none', transition: 'transform .35s ease-out' }} />
      <div ref={blob2Ref} style={{ position: 'absolute', bottom: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: tokens.berry, opacity: 0.1, pointerEvents: 'none', transition: 'transform .35s ease-out' }} />
      <div style={{ position: 'absolute', top: '58%', right: -30, width: 110, height: 110, borderRadius: '50%', background: tokens.amber || tokens.berry, opacity: 0.08, pointerEvents: 'none' }} />

      {/* Плывущие пятна-боке — заполняют пустой фон вокруг карточки */}
      {bokehSpots.map((b, i) => (
        <div
          key={i}
          className="invite-bokeh"
          style={{
            position: 'absolute', top: b.top, left: b.left,
            width: b.w, height: b.h, borderRadius: '50%',
            background: i % 2 === 0 ? tokens.berry : (tokens.amber || tokens.berry),
            opacity: b.opacity, filter: 'blur(1px)', pointerEvents: 'none',
            animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s`,
          }}
        />
      ))}

      {/* Тихий, редкий дождь сердечек — фоновая деталь, не разовое событие */}
      {fallingHearts.map((h) => (
        <span
          key={h.id}
          className="invite-heart-fall"
          style={{
            position: 'absolute', top: 0, left: `${h.left}%`, fontSize: h.size,
            pointerEvents: 'none', '--fh-opacity': h.opacity,
            animationDuration: `${h.duration}s`, animationDelay: `${h.delay}s`,
          }}
        >
          {h.icon}
        </span>
      ))}

      {/* Слой для следа сердечек за курсором — наполняется через ref в useEffect */}
      <div ref={trailLayerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} />

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
          stepIndex={activeIndex}
          stepCount={steps.length}
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
          cardShape={cardShape}
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
          cardShape={cardShape}
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
          cardShape={cardShape}
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
          cardShape={cardShape}
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
