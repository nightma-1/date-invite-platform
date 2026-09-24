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
import { getTemplateTokens } from '../templates/registry.js';
import { T } from './BuilderUI.jsx';

const STEP_COMPONENTS = {
  question: StepQuestion,
  reaction: StepReaction,
  date: StepDate,
  time: StepTime,
  choice_block: StepChoiceBlock,
  final: StepFinal,
};

const STEP_TITLES = {
  question: 'настрой экран\nприглашения',
  reaction: 'настрой экран\nподтверждения',
  date: 'настрой экран\nдаты и времени',
  time: 'настрой экран\nвремени',
  choice_block: 'настрой экран\nвыбора',
  final: 'финальный\nэкран',
};

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

  function goTo(index) {
    dispatch({ type: 'SET_ACTIVE_STEP', index });
  }

  // Gender selection screen
  if (!state.recipientGender) {
    return (
      <div style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: T.font,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative pink blobs */}
        <div style={{
          position: 'absolute',
          top: -30,
          left: -30,
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: T.pinkMid,
          opacity: 0.6,
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          width: 140,
          height: 140,
          borderRadius: '50%',
          background: T.pinkMid,
          opacity: 0.6,
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: 360, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontFamily: T.font,
            fontWeight: 700,
            fontSize: 28,
            color: T.darkPurple,
            textAlign: 'center',
            lineHeight: 1.3,
            marginBottom: 32,
          }}>
            кого хочешь пригласить на свидание?
          </h1>
          <div style={{ display: 'flex', gap: 12 }}>
            {GENDER_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => dispatch({ type: 'SET_GENDER', gender: g.value })}
                style={{
                  flex: 1,
                  background: 'white',
                  borderRadius: 20,
                  padding: '28px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  border: '1.5px solid #e0e0e0',
                  transition: 'border-color 0.15s',
                }}
              >
                <span style={{ fontSize: 44 }}>{g.emoji}</span>
                <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 16, color: T.dark }}>
                  {g.label}
                </span>
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
      <div style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}>
        <AuthGate onAuthenticated={(user) => { setShowAuthGate(false); runPublish(user.id); }} />
      </div>
    );
  }

  if (publishResult) {
    return (
      <div style={{
        minHeight: '100vh',
        background: T.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}>
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ textAlign: 'center', maxWidth: 400 }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 24, color: T.darkPurple, marginBottom: 8 }}>
            Черновик сохранён!
          </h1>
          <p style={{ color: T.muted, fontFamily: T.font, fontSize: 14, marginBottom: 4 }}>
            ID: {publishResult.invitationId}
          </p>
          <p style={{ color: T.muted, fontFamily: T.font, fontSize: 13, marginBottom: 24, opacity: 0.7 }}>
            Ссылка заработает после оплаты: /i/{publishResult.slug}
          </p>
          <Link to="/dashboard">
            <button style={{
              background: T.pink,
              color: '#fff',
              padding: '12px 28px',
              borderRadius: 100,
              fontFamily: T.font,
              fontWeight: 700,
              fontSize: 15,
              border: 'none',
              cursor: 'pointer',
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
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        background: 'white',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: `0 1px 0 ${T.pinkBorder}`,
      }}>
        <Link to="/" style={{ fontFamily: T.font, fontWeight: 700, fontSize: 17, color: T.darkPurple, textDecoration: 'none' }}>
          Date Invite ❤️
        </Link>
      </div>

      {/* Progress bar with heart */}
      <div style={{ position: 'relative', height: 6, background: T.pinkMid }}>
        <div style={{
          height: '100%',
          width: `${progress}%`,
          background: T.pink,
          transition: 'width 0.3s',
          position: 'relative',
        }}>
          <span style={{ position: 'absolute', right: -8, top: -5, fontSize: 16 }}>❤️</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px 120px', maxWidth: 480, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Step title */}
        <h1 style={{
          fontFamily: T.font,
          fontWeight: 700,
          fontSize: 28,
          color: T.darkPurple,
          textAlign: 'center',
          lineHeight: 1.3,
          marginBottom: 24,
          whiteSpace: 'pre-line',
        }}>
          {STEP_TITLES[activeStep?.step_type] || ''}
        </h1>

        {/* Optional step toggle */}
        {(activeStep?.step_type === 'date' || activeStep?.step_type === 'time' || activeStep?.step_type === 'choice_block') && (
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            fontSize: 14,
            color: T.dark,
            fontFamily: T.font,
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={activeStep.enabled}
              onChange={(e) => dispatch({ type: 'TOGGLE_STEP', stepType: activeStep.step_type, enabled: e.target.checked })}
            />
            Включить этот шаг
          </label>
        )}

        {/* Step content with animation */}
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
                border: '1.5px dashed #e0e0e0',
                borderRadius: 16,
                padding: 32,
                textAlign: 'center',
                color: T.muted,
                fontSize: 14,
                fontFamily: T.font,
              }}>
                Шаг — редактирование скоро появится
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {publishError && (
          <p style={{ color: '#C0392B', fontSize: 13, marginTop: 12, fontFamily: T.font }}>
            {publishError}
          </p>
        )}
      </div>

      {/* Bottom nav - fixed, centered within 480px */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: '50%',
        transform: 'translateX(-50%)',
        background: T.bg,
        borderTop: `1px solid ${T.pinkBorder}`,
        padding: '12px 16px',
        display: 'flex',
        gap: 12,
        maxWidth: 480,
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <button
          type="button"
          onClick={() => goTo(state.activeStepIndex - 1)}
          disabled={!canGoBack}
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            border: `1px solid ${T.pinkBorder}`,
            background: 'white',
            color: T.pink,
            fontSize: 20,
            cursor: canGoBack ? 'pointer' : 'not-allowed',
            opacity: canGoBack ? 1 : 0.3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ←
        </button>

        <motion.button
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={isLastStep ? handlePublish : () => goTo(state.activeStepIndex + 1)}
          disabled={publishing || (!isLastStep && !canGoNext)}
          style={{
            flex: 1,
            height: 52,
            borderRadius: 100,
            background: T.pink,
            color: 'white',
            border: 'none',
            fontFamily: T.font,
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
            opacity: publishing ? 0.7 : 1,
          }}
        >
          {isLastStep ? (publishing ? 'Сохраняем…' : 'Опубликовать 💌') : 'Продолжить'}
        </motion.button>
      </div>
    </div>
  );
}
