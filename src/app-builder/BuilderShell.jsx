/**
 * © 2026 Date Invite Platform. Все права защищены.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBuilder } from './builderStore.jsx';
import StepQuestion from './steps/StepQuestion.jsx';
import StepReaction from './steps/StepReaction.jsx';
import StepDate from './steps/StepDate.jsx';
import StepTime from './steps/StepTime.jsx';
import StepChoiceBlock from './steps/StepChoiceBlock.jsx';
import StepFinal from './steps/StepFinal.jsx';
import AuthGate from './AuthGate.jsx';
import { publishDraft } from './publishDraft.js';
import { supabase } from '../lib/supabaseClient.js';
import { TEMPLATE_LIST, getTemplateTokens } from '../templates/registry.js';

const STEP_COMPONENTS = { question: StepQuestion, reaction: StepReaction, date: StepDate, time: StepTime, choice_block: StepChoiceBlock, final: StepFinal };
const STEP_LABELS = { question: 'Вопрос', reaction: 'Реакция', date: 'Дата', time: 'Время', choice_block: 'Выбор', final: 'Финал' };
const STEP_EMOJIS = { question: '💬', reaction: '❤️', date: '📅', time: '🕐', choice_block: '🎯', final: '🎉' };

const GENDER_OPTIONS = [
  { value: 'female', emoji: '👩', label: 'Женщину' },
  { value: 'male', emoji: '👨', label: 'Мужчину' },
];

export default function BuilderShell() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const orderedSteps = [...state.steps].sort((a, b) => a.step_order - b.step_order);
  const activeStep = orderedSteps[state.activeStepIndex];
  const StepComponent = STEP_COMPONENTS[activeStep?.step_type];
  const isLastStep = state.activeStepIndex === orderedSteps.length - 1;

  const [showAuthGate, setShowAuthGate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [publishResult, setPublishResult] = useState(null);

  const canGoBack = state.activeStepIndex > 0;
  const canGoNext = state.activeStepIndex < orderedSteps.length - 1;

  function goTo(index) { dispatch({ type: 'SET_ACTIVE_STEP', index }); }

  // Кого приглашаем — спрашиваем один раз при входе, до самого мастера.
  // Это метаданные автора (для статистики/подбора формулировок в будущем),
  // не отдельный экран мастера и не то, что видит получатель.
  if (!state.recipientGender) {
    return (
      <div style={{ minHeight: '100vh', background: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
          <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 24 }}>
            Кого хочешь пригласить на свидание?
          </h1>
          <div style={{ display: 'flex', gap: 10 }}>
            {GENDER_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => dispatch({ type: 'SET_GENDER', gender: g.value })}
                style={{
                  flex: 1, padding: '24px 12px', borderRadius: 12,
                  border: `1.5px solid ${tokens.ink}20`, background: tokens.card,
                  cursor: 'pointer', fontFamily: tokens.fontUI,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 8 }}>{g.emoji}</div>
                <div style={{ color: tokens.ink, fontSize: 14, fontWeight: 600 }}>{g.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  async function handlePublish() {
    setPublishError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) { setShowAuthGate(true); return; }
    await runPublish(sessionData.session.user.id);
  }

  async function runPublish(userId) {
    setPublishing(true);
    try {
      const { invitationId, slug } = await publishDraft(state, userId);
      setPublishResult({ invitationId, slug });
      try {
        const { data: sd } = await supabase.auth.getSession();
        const res = await fetch('/api/click/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sd.session.access_token}` },
          body: JSON.stringify({ invitationId }),
        });
        if (res.ok) { const { paymentUrl } = await res.json(); window.location.href = paymentUrl; }
      } catch {}
    } catch (err) {
      setPublishError(err.message || 'Не получилось сохранить приглашение');
    } finally {
      setPublishing(false);
    }
  }

  if (showAuthGate) {
    return (
      <div style={{ minHeight: '100vh', background: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <AuthGate onAuthenticated={(user) => { setShowAuthGate(false); runPublish(user.id); }} />
      </div>
    );
  }

  if (publishResult) {
    return (
      <div style={{ minHeight: '100vh', background: tokens.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ textAlign: 'center', maxWidth: 400 }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            Черновик сохранён!
          </h1>
          <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, marginBottom: 4 }}>
            ID: {publishResult.invitationId}
          </p>
          <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 13, marginBottom: 24, opacity: 0.7 }}>
            Ссылка заработает после оплаты: /i/{publishResult.slug}
          </p>
          <Link to="/dashboard">
            <button style={{
              background: tokens.berry, color: '#fff',
              padding: '12px 28px', borderRadius: 6,
              fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
              border: 'none', cursor: 'pointer',
            }}>
              Перейти в «Мои приглашения» →
            </button>
          </Link>
        </motion.div>
      </div>
    );
  }

  const progress = ((state.activeStepIndex + 1) / orderedSteps.length) * 100;

  return (
    <div style={{ minHeight: '100vh', background: tokens.bg, fontFamily: tokens.fontUI }}>
      {/* Верхняя полоска с шаблонами */}
      <div style={{ background: tokens.card, borderBottom: `1px solid ${tokens.ink}12`, padding: '12px 20px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/" style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
            Date Invite
          </Link>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TEMPLATE_LIST.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => dispatch({ type: 'SET_TEMPLATE', templateId: tpl.id })}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12,
                  border: `1.5px solid ${state.templateId === tpl.id ? tokens.berry : tokens.ink + '20'}`,
                  background: state.templateId === tpl.id ? tokens.berry : 'transparent',
                  color: state.templateId === tpl.id ? '#fff' : tokens.ink,
                  fontWeight: state.templateId === tpl.id ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {tpl.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Прогресс-бар */}
      <div style={{ height: 3, background: tokens.ink + '12' }}>
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
          style={{ height: '100%', background: tokens.berry }}
        />
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
        {/* Шаги-таблетки */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
          {orderedSteps.map((step, i) => {
            const isActive = i === state.activeStepIndex;
            const isDone = i < state.activeStepIndex;
            return (
              <button
                key={step.step_type}
                type="button"
                onClick={() => goTo(i)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12,
                  border: `1.5px solid ${isActive ? tokens.berry : isDone ? tokens.berry + '50' : tokens.ink + '18'}`,
                  background: isActive ? tokens.berry : isDone ? tokens.berry + '15' : 'transparent',
                  color: isActive ? '#fff' : isDone ? tokens.berry : tokens.ink,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span>{STEP_EMOJIS[step.step_type]}</span>
                <span>{STEP_LABELS[step.step_type]}</span>
                {isDone && <span>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Опциональный Toggle для шагов */}
        {(activeStep?.step_type === 'date' || activeStep?.step_type === 'time' || activeStep?.step_type === 'choice_block') && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, cursor: 'pointer', fontSize: 14, color: tokens.ink }}>
            <input
              type="checkbox"
              checked={activeStep.enabled}
              onChange={(e) => dispatch({ type: 'TOGGLE_STEP', stepType: activeStep.step_type, enabled: e.target.checked })}
            />
            Включить этот шаг в приглашение
          </label>
        )}

        {/* Контент шага */}
        <AnimatePresence mode="wait">
          <motion.div
            key={state.activeStepIndex}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {StepComponent ? (
              <StepComponent />
            ) : (
              <div style={{
                border: `1.5px dashed ${tokens.ink}20`,
                borderRadius: 8, padding: 32, textAlign: 'center',
                color: tokens.inkMuted || tokens.ink, opacity: 0.6, fontSize: 14,
              }}>
                Шаг «{STEP_LABELS[activeStep?.step_type]}» — редактирование скоро появится
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {publishError && (
          <p style={{ color: '#C0392B', fontFamily: tokens.fontUI, fontSize: 13, marginTop: 12 }}>
            {publishError}
          </p>
        )}

        {/* Навигация */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 32 }}>
          <button
            type="button"
            disabled={!canGoBack}
            onClick={() => goTo(state.activeStepIndex - 1)}
            style={{
              padding: '11px 22px', borderRadius: 6, fontSize: 14, fontWeight: 600,
              border: `1.5px solid ${tokens.ink}25`, background: 'transparent',
              color: tokens.ink, cursor: canGoBack ? 'pointer' : 'not-allowed',
              opacity: canGoBack ? 1 : 0.3, fontFamily: tokens.fontUI,
            }}
          >
            ← Назад
          </button>

          {isLastStep ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={publishing}
              onClick={handlePublish}
              style={{
                padding: '11px 28px', borderRadius: 6, fontSize: 14, fontWeight: 700,
                background: tokens.berry, color: '#fff', border: 'none',
                cursor: publishing ? 'not-allowed' : 'pointer',
                opacity: publishing ? 0.6 : 1, fontFamily: tokens.fontUI,
              }}
            >
              {publishing ? 'Сохраняем…' : 'Опубликовать 💌'}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={!canGoNext}
              onClick={() => goTo(state.activeStepIndex + 1)}
              style={{
                padding: '11px 28px', borderRadius: 6, fontSize: 14, fontWeight: 700,
                background: tokens.berry, color: '#fff', border: 'none',
                cursor: canGoNext ? 'pointer' : 'not-allowed',
                opacity: canGoNext ? 1 : 0.3, fontFamily: tokens.fontUI,
              }}
            >
              Далее →
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
