/**
 * © 2026 Senti. Все права защищены.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useBuilder } from './builderStore.jsx';
import StepQuestion from './steps/StepQuestion.jsx';
import StepReaction from './steps/StepReaction.jsx';
import StepDate from './steps/StepDate.jsx';
import StepChoicePlaceAndFood from './steps/StepChoicePlaceAndFood.jsx';
import StepFinal from './steps/StepFinal.jsx';
import AuthGate from './AuthGate.jsx';
import { publishDraft } from './publishDraft.js';
import { updateInvitationDraft } from './updateInvitation.js';
import { supabase } from '../lib/supabaseClient.js';
import { getTemplateTokens } from '../templates/registry.js';
import { T, DecorativeBlobs } from './BuilderUI.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import QuestionScreen from '../components/screens/QuestionScreen.jsx';
import ReactionScreen from '../components/screens/ReactionScreen.jsx';
import DateTimeScreen from '../components/screens/DateTimeScreen.jsx';
import DoubleChoiceScreen from '../components/screens/DoubleChoiceScreen.jsx';
import FinalScreen from '../components/screens/FinalScreen.jsx';

const STEP_COMPONENTS = {
  question: StepQuestion,
  reaction: StepReaction,
  date: StepDate,
  choice_place: StepChoicePlaceAndFood,
  final: StepFinal,
};

const GENDER_OPTIONS = [
  { value: 'female', emoji: '👩' },
  { value: 'male', emoji: '👨' },
];

export default function BuilderShell() {
  const { t } = useTranslation();
  const STEP_TITLES = t('builder.stepTitles', { returnObjects: true });
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const orderedSteps = [...state.steps].sort((a, b) => a.step_order - b.step_order);
  // choice_food больше не отдельная страница конструктора — она редактируется
  // вместе с choice_place на одной странице (StepChoicePlaceAndFood), как и
  // видит получатель на одном экране (DoubleChoiceScreen).
  const orderedStepsForWizard = orderedSteps.filter((s) => s.step_type !== 'choice_food');
  const activeStep = orderedStepsForWizard[state.activeStepIndex];
  const StepComponent = STEP_COMPONENTS[activeStep?.step_type];
  const isLastStep = state.activeStepIndex === orderedStepsForWizard.length - 1;

  // Единая живая превьюшка для боковой панели — раньше каждый шаг рисовал
  // своё превью отдельно внизу страницы, теперь один рендер на весь визард,
  // переключается вместе с активным шагом.
  function renderActiveStepPreview() {
    if (!activeStep) return null;
    switch (activeStep.step_type) {
      case 'question': {
        const c = activeStep.configuration_json;
        return (
          <QuestionScreen
            recipientName={c.recipientName || t('steps.question.previewDefaultRecipient')}
            questionText={c.questionText || t('steps.question.previewDefaultQuestion')}
            mediaUrl={c.mediaUrl}
            yesText={c.yesText}
            noPhrases={c.noText ? [c.noText, ...t('questionScreen.noPhrases', { returnObjects: true }).slice(1)] : undefined}
            tokens={tokens}
            cardShape={state.cardShape}
            onYes={() => {}}
          />
        );
      }
      case 'reaction': {
        const c = activeStep.configuration_json;
        return (
          <ReactionScreen
            title={c.title}
            text={c.text}
            mediaUrl={c.mediaUrl}
            tokens={tokens}
            cardShape={state.cardShape}
            onContinue={() => {}}
          />
        );
      }
      case 'date': {
        const c = activeStep.configuration_json;
        return (
          <DateTimeScreen
            title={c.title}
            buttonText={c.buttonText}
            mode={c.mode}
            fixedDate={c.fixedDate}
            fixedTime={c.fixedTime}
            mediaUrl={c.mediaUrl}
            tokens={tokens}
            cardShape={state.cardShape}
            onContinue={() => {}}
          />
        );
      }
      case 'choice_place': {
        const place = activeStep.configuration_json;
        const foodStep = state.steps.find((s) => s.step_type === 'choice_food');
        const food = foodStep?.configuration_json || {};
        return (
          <DoubleChoiceScreen
            placeTitle={place.title}
            placeOptions={place.options}
            placeAllowMultiple={place.allowMultiple}
            foodTitle={food.title}
            foodOptions={food.options}
            foodAllowMultiple={food.allowMultiple}
            tokens={tokens}
            onContinue={() => {}}
          />
        );
      }
      case 'final': {
        const c = activeStep.configuration_json;
        return (
          <FinalScreen
            title={c.title}
            description={c.description}
            mediaUrl={c.mediaUrl}
            tokens={tokens}
            cardShape={state.cardShape}
            onSubmit={async () => {}}
          />
        );
      }
      default:
        return null;
    }
  }

  const [showAuthGate, setShowAuthGate] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const canGoBack = state.activeStepIndex > 0;
  const canGoNext = state.activeStepIndex < orderedStepsForWizard.length - 1;

  function goTo(index) {
    dispatch({ type: 'SET_ACTIVE_STEP', index });
  }

  // Режим редактирования: приглашение ещё грузится из Supabase
  if (state.loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: T.font,
        color: T.muted,
        fontSize: 14,
      }}>
        {t('builder.loadingInvitation')}
      </div>
    );
  }

  // Gender selection screen
  if (!state.recipientGender) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: T.font,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative blobs — several sizes/positions for depth, not just two circles */}
        <div style={{ position: 'absolute', top: -60, left: -60, width: 220, height: 220, borderRadius: '50%', background: T.pinkMid, opacity: 0.55, filter: 'blur(2px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: T.pinkMid, opacity: 0.5, filter: 'blur(2px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '18%', right: '8%', width: 46, height: 46, borderRadius: '50%', background: T.pinkBorder, opacity: 0.7, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '22%', left: '10%', width: 30, height: 30, borderRadius: '50%', background: T.pink, opacity: 0.18, pointerEvents: 'none' }} />
        <motion.span
          initial={{ y: 0 }} animate={{ y: [0, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: '12%', left: '14%', fontSize: 22, opacity: 0.5, pointerEvents: 'none' }}
        >💗</motion.span>
        <motion.span
          initial={{ y: 0 }} animate={{ y: [0, 12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          style={{ position: 'absolute', bottom: '16%', right: '12%', fontSize: 20, opacity: 0.45, pointerEvents: 'none' }}
        >✨</motion.span>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          style={{ maxWidth: 380, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}
        >
          {/* Language switcher */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
            <LanguageSwitcher />
          </div>

          {/* Logo */}
          <img src="/logo.png" alt="Senti" style={{ height: 40, width: 'auto', margin: '0 auto 18px', display: 'block' }} />

          <h1 style={{
            fontFamily: T.font,
            fontWeight: 700,
            fontSize: 30,
            color: T.darkPurple,
            textAlign: 'center',
            lineHeight: 1.3,
            marginBottom: 10,
          }}>
            {t('builder.genderTitle')}
          </h1>
          <p style={{
            fontFamily: T.font,
            fontSize: 14,
            color: T.muted,
            marginBottom: 32,
            lineHeight: 1.5,
          }}>
            {t('builder.genderSubtitle')}
          </p>

          <div style={{ display: 'flex', gap: 14 }}>
            {GENDER_OPTIONS.map((g) => (
              <motion.button
                key={g.value}
                type="button"
                whileHover={{ y: -3, borderColor: T.pink }}
                whileTap={{ scale: 0.97 }}
                onClick={() => dispatch({ type: 'SET_GENDER', gender: g.value })}
                style={{
                  flex: 1,
                  background: 'white',
                  borderRadius: 24,
                  padding: '30px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  border: '1.5px solid #f0dbe2',
                  boxShadow: '0 10px 30px rgba(248, 85, 137, 0.10)',
                }}
              >
                <div style={{
                  width: 68, height: 68, borderRadius: '50%',
                  background: T.pinkLight,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 36,
                }}>
                  {g.emoji}
                </div>
                <span style={{ fontFamily: T.font, fontWeight: 600, fontSize: 16, color: T.dark }}>
                  {t(`builder.gender${g.value === 'male' ? 'Male' : 'Female'}`)}
                </span>
              </motion.button>
            ))}
          </div>
        </motion.div>
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
      if (state.editInvitationId) {
        const { invitationId, slug } = await updateInvitationDraft(state, userId, state.editInvitationId);
        setPublishResult({ invitationId, slug, edited: true });
        return;
      }
      // ВРЕМЕННО: пока не подключён мерчант-аккаунт Click, публикуем сразу
      // бесплатно (publishDraft уже проставляет status:'published') и не
      // уходим на оплату. Когда Click будет готов — верни здесь редирект на
      // /api/click/create, а publishDraft.js — обратно на insert со
      // status:'draft'.
      const { invitationId, slug } = await publishDraft(state, userId);
      setPublishResult({ invitationId, slug });
    } catch (err) {
      setPublishError(err.message || t('builder.publishGenericError'));
    } finally {
      setPublishing(false);
    }
  }

  if (showAuthGate) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        position: 'relative',
      }}>
        <DecorativeBlobs />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <AuthGate onAuthenticated={(user) => { setShowAuthGate(false); runPublish(user.id); }} />
        </div>
      </div>
    );
  }

  if (publishResult) {
    const shareUrl = `${window.location.origin}/i/${publishResult.slug}`;
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        position: 'relative',
      }}>
        <DecorativeBlobs />
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ textAlign: 'center', maxWidth: 400, width: '100%', position: 'relative', zIndex: 1 }}
        >
          <div style={{ fontSize: 56, marginBottom: 16 }}>{publishResult.edited ? '✅' : '🎉'}</div>
          <h1 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 24, color: T.darkPurple, marginBottom: 8 }}>
            {publishResult.edited ? t('builder.editedTitle') : t('builder.publishedTitle')}
          </h1>
          <p style={{ color: T.muted, fontFamily: T.font, fontSize: 13, marginBottom: 20, opacity: 0.8 }}>
            {publishResult.edited
              ? t('builder.editedSubtitle')
              : t('builder.publishedSubtitle')}
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'white',
            border: `1.5px solid ${T.pinkBorder}`,
            borderRadius: 16,
            padding: '10px 10px 10px 16px',
            marginBottom: 16,
          }}>
            <span style={{
              flex: 1,
              fontFamily: T.font,
              fontSize: 13,
              color: T.dark,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'left',
            }}>
              {shareUrl}
            </span>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(shareUrl); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
              style={{
                background: T.pink,
                color: '#fff',
                border: 'none',
                borderRadius: 100,
                padding: '8px 16px',
                fontFamily: T.font,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {linkCopied ? t('builder.copied') : t('builder.copy')}
            </button>
          </div>

          <a
            href={`/i/${publishResult.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'block',
              marginBottom: 20,
              fontFamily: T.font,
              fontSize: 13,
              color: T.pink,
              textDecoration: 'underline',
            }}
          >
            {t('builder.openAsRecipient')}
          </a>

          <Link to="/dashboard">
            <button style={{
              background: 'white',
              color: T.dark,
              padding: '12px 28px',
              borderRadius: 100,
              fontFamily: T.font,
              fontWeight: 700,
              fontSize: 15,
              border: `1.5px solid ${T.pinkBorder}`,
              cursor: 'pointer',
            }}>
              {t('builder.goToDashboard')}
            </button>
          </Link>
        </motion.div>
      </div>
    );
  }

  const progress = ((state.activeStepIndex + 1) / orderedStepsForWizard.length) * 100;

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
      // Фиксируем градиент к вьюпорту, а не к высоте всей страницы —
      // иначе на длинной прокручиваемой странице розовый конец градиента
      // "уезжает" далеко вниз и видно только белое начало.
      backgroundAttachment: 'fixed',
      backgroundSize: '100% 100vh',
      backgroundRepeat: 'no-repeat',
      position: 'relative',
    }}>
      <DecorativeBlobs />
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        background: 'white',
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: `0 1px 0 ${T.pinkBorder}`,
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
          <img src="/logo.png" alt="Senti" style={{ height: 28, width: 'auto', display: 'block' }} />
        </Link>
        <LanguageSwitcher />
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

      {/* Живое превью сбоку — только на широких экранах; на узких форма и
          превью по-прежнему идут одно под другим, как раньше */}
      <div
        className="hidden xl:flex xl:flex-col"
        style={{
          position: 'fixed',
          top: 110,
          left: 'calc(50% + 260px)',
          width: 300,
          // Карточка с большим списком вариантов (например, в шаге выбора)
          // может быть выше, чем остаётся места до низа экрана — раньше
          // превью было зафиксировано без своего скролла, и низ карточки
          // просто обрезался экраном без возможности до него долистать.
          maxHeight: 'calc(100vh - 130px)',
          overflowY: 'auto',
          paddingBottom: 16,
        }}
      >
        <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font, position: 'sticky', top: 0, background: T.bg, paddingTop: 2, paddingBottom: 2, zIndex: 1 }}>
          {t('builderUI.preview')}
        </p>
        <AnimatePresence mode="wait">
          <motion.div
            key={state.activeStepIndex}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{ maxWidth: 280, margin: '0 auto' }}
          >
            {renderActiveStepPreview()}
          </motion.div>
        </AnimatePresence>
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
                {t('builder.stepEditingComingSoon')}
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
        background: '#ffffff',
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
          {isLastStep
            ? (publishing ? t('builder.saving') : (state.editInvitationId ? t('builder.saveChanges') : t('builder.publish')))
            : t('builder.continue')}
        </motion.button>
      </div>
      </div>
    </div>
  );
}
