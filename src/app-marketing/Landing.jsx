/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { getTemplateTokens } from '../templates/registry.js';
import QuestionScreen from '../components/screens/QuestionScreen.jsx';
import ReactionScreen from '../components/screens/ReactionScreen.jsx';
import DateTimeScreen from '../components/screens/DateTimeScreen.jsx';
import DoubleChoiceScreen from '../components/screens/DoubleChoiceScreen.jsx';
import FinalScreen from '../components/screens/FinalScreen.jsx';
import { T } from '../app-builder/BuilderUI.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';

// Живое превью в шапке — не статичная картинка, а настоящий проход по
// всему сценарию (вопрос → реакция → дата → выбор → финал) на примерных
// данных, чтобы посетитель мог сам дойти до конца и понять, что получит
// его адресат. Ничего никуда не отправляется — это витрина, а не реальное
// приглашение.
function LandingPreviewDemo() {
  const { t } = useTranslation();
  const tokens = getTemplateTokens('romantic');
  const [step, setStep] = useState(0);
  const [collected, setCollected] = useState({ date: null, time: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const STEP_COUNT = 5;

  function restart() {
    setStep(0);
    setCollected({ date: null, time: null });
    setSubmitting(false);
    setSubmitted(false);
  }

  async function handleDemoSubmit() {
    setSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    setSubmitting(false);
    setSubmitted(true);
  }

  const placeOptions = t('landing.demo.placeOptions', { returnObjects: true });
  const foodOptions = t('landing.demo.foodOptions', { returnObjects: true });
  const summaryLines = [
    collected.date ? `📅 ${collected.date}` : null,
    collected.time ? `🕒 ${collected.time}` : null,
  ].filter(Boolean);

  return (
    <div>
      {/* Точки прогресса по всему сценарию демо — не только внутри одного экрана */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 14 }}>
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <div
            key={i}
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: i === step ? T.pink : `${T.dark}25`,
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && (
            <QuestionScreen
              recipientName={t('landing.previewRecipient')}
              questionText={t('landing.previewQuestion')}
              recipientGender="female"
              tokens={tokens}
              onYes={() => setStep(1)}
            />
          )}
          {step === 1 && (
            <ReactionScreen
              title={t('landing.demo.reactionTitle')}
              text={t('landing.demo.reactionText')}
              tokens={tokens}
              onContinue={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <DateTimeScreen
              title={t('landing.demo.dateTitle')}
              tokens={tokens}
              onContinue={({ date, time }) => { setCollected({ date, time }); setStep(3); }}
            />
          )}
          {step === 3 && (
            <DoubleChoiceScreen
              placeTitle={t('landing.demo.placeTitle')}
              placeOptions={placeOptions}
              foodTitle={t('landing.demo.foodTitle')}
              foodOptions={foodOptions}
              tokens={tokens}
              onContinue={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <FinalScreen
              title={t('landing.demo.finalTitle')}
              description={t('landing.demo.finalDescription')}
              summary={summaryLines}
              tokens={tokens}
              submitting={submitting}
              submitted={submitted}
              onSubmit={handleDemoSubmit}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <p style={{ textAlign: 'center', fontSize: 12, color: T.muted, marginTop: 12 }}>
        {step === 0 && !submitted ? t('landing.previewHint') : null}
      </p>
      {(step > 0 || submitted) && (
        <button
          type="button"
          onClick={restart}
          style={{
            display: 'block', margin: '4px auto 0', background: 'none', border: 'none',
            color: T.pink, fontFamily: T.font, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {submitted ? t('landing.demo.playAgain') : t('landing.demo.restart')}
        </button>
      )}
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const [openFaq, setOpenFaq] = useState(null);

  const STEPS = t('landing.steps', { returnObjects: true });
  const FAQ = t('landing.faq', { returnObjects: true });
  const priceFeatures = t('landing.priceFeatures', { returnObjects: true });

  const primaryBtn = {
    background: T.pink, color: '#fff', padding: '15px 28px',
    borderRadius: 100, fontWeight: 700, fontSize: 15,
    fontFamily: T.font, border: 'none', cursor: 'pointer',
    boxShadow: `0 10px 24px ${T.pink}35`,
  };

  const ghostBtn = {
    ...primaryBtn, background: 'white', color: T.dark,
    border: `1.5px solid ${T.pinkBorder}`, boxShadow: 'none',
  };

  // Бегущий блик на главной CTA-кнопке — привлекает взгляд, не мешая читаемости
  function ShimmerButton({ children, style, ...rest }) {
    return (
      <motion.button {...rest} style={{ ...style, position: 'relative', overflow: 'hidden' }}>
        <span style={{ position: 'relative', zIndex: 1 }}>{children}</span>
        <motion.span
          aria-hidden="true"
          initial={{ x: '-160%' }}
          animate={{ x: '400%' }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, width: '35%',
            background: 'linear-gradient(115deg, transparent 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 65%, transparent 100%)',
            pointerEvents: 'none',
          }}
        />
      </motion.button>
    );
  }

  return (
    <div style={{ background: T.bg, minHeight: '100vh', fontFamily: T.font, overflowX: 'hidden' }}>

      {/* HERO */}
      <section style={{
        background: `linear-gradient(165deg, #ffffff 0%, ${T.pinkLight} 60%, #ffeef5 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Тёплый декор — те же сердечки/пятна, что и в билдере */}
        <div style={{ position: 'absolute', top: -70, left: -70, width: 220, height: 220, borderRadius: '50%', background: T.pinkMid, opacity: 0.5, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 60, right: -60, width: 160, height: 160, borderRadius: '50%', background: T.pinkMid, opacity: 0.4, pointerEvents: 'none' }} />
        <motion.span
          initial={{ y: 0 }} animate={{ y: [0, -10, 0] }} transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', top: '10%', left: '6%', fontSize: 22, opacity: 0.45, pointerEvents: 'none' }}
        >💗</motion.span>
        <motion.span
          initial={{ y: 0 }} animate={{ y: [0, 12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          style={{ position: 'absolute', top: '55%', right: '4%', fontSize: 20, opacity: 0.4, pointerEvents: 'none' }}
        >✨</motion.span>

        {/* NAV — часть той же градиентной секции, а не отдельная белая полоса */}
        <div className="mx-auto flex max-w-[1040px] items-center justify-between px-5 pt-5" style={{ position: 'relative', zIndex: 20 }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img src="/logo.png" alt="Senti" style={{ height: 30, width: 'auto', display: 'block' }} />
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="mx-auto max-w-[1040px] px-5 pb-14 pt-8 sm:pb-16 sm:pt-10 lg:pb-20 lg:pt-12" style={{ position: 'relative', zIndex: 1 }}>
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_340px] lg:gap-12">
            <div className="text-center lg:text-left">
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.pink, marginBottom: 14 }}>
                {t('landing.heroTag')}
              </p>
              <h1 className="text-[34px] leading-[1.15] sm:text-[44px] lg:text-[50px]" style={{ fontFamily: T.font, color: T.darkPurple, fontWeight: 700, marginBottom: 16 }}>
                {t('landing.heroTitleLine1')}
                <br />
                <span style={{ color: T.pink }}>{t('landing.heroTitleHighlight')}</span>
              </h1>
              <p className="mx-auto lg:mx-0" style={{ color: T.muted, fontSize: 16, lineHeight: 1.6, marginBottom: 28, maxWidth: 420 }}>
                {t('landing.heroSubtitle')}
              </p>
              <div className="flex flex-wrap justify-center gap-3 lg:justify-start">
                <Link to="/builder">
                  <ShimmerButton whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} style={primaryBtn}>
                    {t('landing.createBtn')}
                  </ShimmerButton>
                </Link>
                <Link to="/dashboard">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} style={ghostBtn}>
                    {t('landing.myInvitationsBtn')}
                  </motion.button>
                </Link>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[280px] sm:max-w-[300px] lg:mx-0 lg:max-w-none lg:w-[300px]">
              <p style={{ textAlign: 'center', fontSize: 12, color: T.muted, marginBottom: 10, lineHeight: 1.4 }}>
                {t('landing.demo.intro')}
              </p>
              <LandingPreviewDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ШАГИ */}
      <section className="mx-auto max-w-[1040px] px-5 py-14 sm:py-16">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0">
          {STEPS.map((s, i) => (
            <div key={i} className="sm:[&:not(:first-child)]:pl-8 sm:[&:not(:last-child)]:pr-8 sm:[&:not(:last-child)]:border-r" style={{ borderColor: `${T.dark}12` }}>
              <span style={{ display: 'block', fontSize: 44, fontFamily: T.font, color: T.pink, fontWeight: 700, lineHeight: 1, marginBottom: 12 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: T.dark, marginBottom: 6, fontFamily: T.font }}>{s.t}</h3>
              <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ЦЕНА */}
      <section style={{ background: `linear-gradient(160deg, ${T.darkPurple}, #1a0f1a)`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: '50%', background: T.pink, opacity: 0.15, pointerEvents: 'none' }} />
        <div className="mx-auto max-w-[480px] px-5 py-14 text-center sm:py-16" style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: T.pink, marginBottom: 12 }}>
            {t('landing.priceTag')}
          </p>
          <p className="text-[44px] sm:text-[56px]" style={{ fontFamily: T.font, color: '#fff', fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
            19 000
          </p>
          <p style={{ color: '#fff', opacity: 0.55, fontSize: 18, marginBottom: 24, fontFamily: T.font }}>{t('landing.priceCurrency')}</p>
          <div style={{ color: '#fff', opacity: 0.8, fontSize: 14, marginBottom: 28, lineHeight: 2.2, fontFamily: T.font }}>
            {priceFeatures.map((f, i) => <p key={i}>{f}</p>)}
          </div>
          <Link to="/builder">
            <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }} style={primaryBtn}>
              {t('landing.createBtn')}
            </motion.button>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-[720px] px-5 py-14 sm:py-16">
        <h2 style={{ fontFamily: T.font, color: T.darkPurple, fontSize: 26, fontWeight: 700, marginBottom: 24 }} className="sm:text-[32px]">
          {t('landing.faqTitle')}
        </h2>
        {FAQ.map((item, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${T.dark}15` }}>
            <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '18px 0', background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.font, textAlign: 'left' }}>
              <span style={{ color: T.dark, fontWeight: 500, fontSize: 15 }}>{item.q}</span>
              <span style={{ color: T.pink, fontSize: 20, marginLeft: 12, flexShrink: 0 }}>{openFaq === i ? '−' : '+'}</span>
            </button>
            <AnimatePresence>
              {openFaq === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  <p style={{ paddingBottom: 16, color: T.muted, fontSize: 14, lineHeight: 1.6 }}>{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: `1px solid ${T.dark}12`, padding: '24px 20px' }}>
        <div className="mx-auto flex max-w-[1040px] flex-wrap items-center justify-center gap-4 sm:justify-between" style={{ textAlign: 'center' }}>
          <img src="/logo.png" alt="Senti" style={{ height: 24, width: 'auto', display: 'block' }} />
          <div className="flex flex-wrap items-center justify-center gap-5">
            <Link to="/builder" style={{ color: T.muted, textDecoration: 'none', fontSize: 14, fontFamily: T.font }}>{t('nav.create')}</Link>
            <Link to="/dashboard" style={{ color: T.muted, textDecoration: 'none', fontSize: 14, fontFamily: T.font }}>{t('nav.myInvitations')}</Link>
            <Link to="/admin" style={{ color: T.muted, textDecoration: 'none', fontSize: 14, fontFamily: T.font }}>{t('nav.admin')}</Link>
            <LanguageSwitcher />
          </div>
        </div>
      </footer>

    </div>
  );
}
