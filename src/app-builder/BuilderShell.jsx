/**
 * © 2026 Senti. Все права защищены.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useBuilder } from './builderStore.jsx';
import StepQuestion from './steps/StepQuestion.jsx';
import StepReaction from './steps/StepReaction.jsx';
import StepDate from './steps/StepDate.jsx';
import StepChoicePlaceAndFood from './steps/StepChoicePlaceAndFood.jsx';
import StepStyle from './steps/StepStyle.jsx';
import StepFinal from './steps/StepFinal.jsx';
import AuthGate from './AuthGate.jsx';
import { ensureGuestSession } from '../lib/guestAccount.js';
import { publishDraft, withRetry, isNetworkError } from './publishDraft.js';
import { getStoredPromo, storePromo, checkPromo, normalizePromo, discounted, INVITATION_PRICE, REPLY_DISCOUNT } from '../lib/promo.js';
import { buildPreviewInvitation } from './previewInvitation.js';
import PreviewOverlay from './PreviewOverlay.jsx';
import { updateInvitationDraft } from './updateInvitation.js';
import { supabase } from '../lib/supabaseClient.js';
import { getTemplateTokens } from '../templates/registry.js';
import { T, DecorativeBlobs } from './BuilderUI.jsx';
import LanguageSwitcher from '../components/ui/LanguageSwitcher.jsx';
import { SupportTrigger } from '../components/ui/SupportDialog.jsx';
import ShareToTelegram from '../components/ui/ShareToTelegram.jsx';
import { track, trackBeforeLeaving } from '../lib/analytics.js';
import { pixelInitiateCheckout } from '../lib/metaPixel.js';
import QuestionScreen from '../components/screens/QuestionScreen.jsx';
import ReactionScreen from '../components/screens/ReactionScreen.jsx';
import DateTimeScreen from '../components/screens/DateTimeScreen.jsx';
import DoubleChoiceScreen from '../components/screens/DoubleChoiceScreen.jsx';
import FinalScreen from '../components/screens/FinalScreen.jsx';
import { inviteShareUrl, isPlaceholderName, normalizeName } from '../lib/shareLink.js';

const STYLE_STEP = { step_type: 'style', configuration_json: {} };

const STEP_COMPONENTS = {
  question: StepQuestion,
  reaction: StepReaction,
  date: StepDate,
  choice_place: StepChoicePlaceAndFood,
  final: StepFinal,
  style: StepStyle,
};

export default function BuilderShell() {
  const { t } = useTranslation();
  const STEP_TITLES = t('builder.stepTitles', { returnObjects: true });
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const orderedSteps = [...state.steps].sort((a, b) => a.step_order - b.step_order);
  // choice_food больше не отдельная страница конструктора — она редактируется
  // вместе с choice_place на одной странице (StepChoicePlaceAndFood), как и
  // видит получатель на одном экране (DoubleChoiceScreen).
  // «Оформление» (настроение + форма карточки) — не экран для получателя и
  // не строка в invitation_steps, а последняя страница мастера (StepStyle).
  const orderedStepsForWizard = [
    // Ответная открытка — без даты и выбора места (см. applyReplyTexts)
    ...orderedSteps.filter((s) => s.step_type !== 'choice_food'
      && !(state.replyKind === 'card' && (s.step_type === 'date' || s.step_type === 'choice_place'))),
    STYLE_STEP,
  ];
  const activeStep = orderedStepsForWizard[state.activeStepIndex];
  const StepComponent = STEP_COMPONENTS[activeStep?.step_type];
  const isLastStep = state.activeStepIndex === orderedStepsForWizard.length - 1;

  // Единая живая превьюшка для боковой панели — раньше каждый шаг рисовал
  // своё превью отдельно внизу страницы, теперь один рендер на весь визард,
  // переключается вместе с активным шагом.
  function renderActiveStepPreview() {
    if (!activeStep) return null;
    switch (activeStep.step_type) {
      case 'style':
      case 'question': {
        const c = state.steps.find((s) => s.step_type === 'question').configuration_json;
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
            confirmText={c.confirmText}
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
            buttonText={place.buttonText}
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
            buttonText={c.buttonText}
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
  const [showPaymentChoice, setShowPaymentChoice] = useState(false);
  // Промокод: из ссылки (?promo=) или введённый на экране оплаты
  const [promoInput, setPromoInput] = useState(() => getStoredPromo());
  const [promo, setPromo] = useState(null); // { code, discount_percent } — проверенный
  const [promoOpen, setPromoOpen] = useState(() => Boolean(getStoredPromo()));
  const [promoStatus, setPromoStatus] = useState(null); // 'checking' | 'invalid' | null
  const [pendingPaymentMethod, setPendingPaymentMethod] = useState('invoice');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const [publishResult, setPublishResult] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  // Прогон приглашения целиком перед оплатой. Собираем объект в момент
  // открытия, чтобы превью показывало текущее состояние черновика.
  const [previewData, setPreviewData] = useState(null);
  // Ошибка входа через Telegram, с которой человек вернулся на сайт.
  const [authError, setAuthError] = useState(null);

  // Аналитика воронки. Хуки объявлены до ранних return'ов ниже — иначе
  // React ругается на разное число хуков между рендерами.
  useEffect(() => {
    track('builder_start', { edit: Boolean(state.editInvitationId), template: state.templateId, reply: Boolean(state.replyTo) });
    // Один раз на вход в конструктор, а не на каждую перерисовку
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // По этим событиям видно, на каком шаге люди бросают конструктор
  useEffect(() => {
    if (state.loading || !activeStep) return;
    track('builder_step', { index: state.activeStepIndex, step: activeStep.step_type });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeStepIndex, state.loading]);

  // Возврат после входа через Telegram. Перед уходом на сайт
  // провайдера AuthGate запоминает, что человек собирался сделать, — здесь
  // продолжаем с того же места: сразу ведём на оплату (или сохраняем правки),
  // а не оставляем его снова на первом шаге.
  useEffect(() => {
    if (state.loading) return;
    let pending = null;
    try {
      const raw = window.localStorage.getItem(resumeKey());
      if (raw) {
        window.localStorage.removeItem(resumeKey());
        pending = JSON.parse(raw);
      }
    } catch { /* localStorage недоступен — продолжить не получится, человек нажмёт ещё раз */ }
    if (!pending || Date.now() - (pending.at || 0) > 30 * 60 * 1000) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        // Сам вход считает initAnalytics; здесь — что черновик пережил возврат.
        track('auth_resume', { provider: pending.provider });
        await runPublish(data.session.user.id, pending.method || 'invoice');
      } else {
        // Вернулись без сессии: человек отменил вход или провайдер вернул ошибку.
        track('auth_error', { mode: 'oauth', provider: pending.provider });
        setPendingPaymentMethod(pending.method || 'invoice');
        setAuthError(t('auth.oauthError'));
        setShowAuthGate(true);
      }
    })();
    return () => { cancelled = true; };
    // Один раз, когда черновик готов
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loading]);

  const canGoBack = state.activeStepIndex > 0;
  const canGoNext = state.activeStepIndex < orderedStepsForWizard.length - 1;

  function goTo(index) {
    dispatch({ type: 'SET_ACTIVE_STEP', index });
  }

  function recipientNameMissing() {
    const name = state.steps.find((s) => s.step_type === 'question')?.configuration_json?.recipientName;
    return !normalizeName(name) || isPlaceholderName(name);
  }

  // «Далее». Имя получателя проверяем сразу на его шаге: раньше проверка
  // была только на «Опубликовать», и человек проходил весь конструктор, а
  // потом его отбрасывало на первый шаг. По аналитике так терялось больше
  // половины тех, кого блокировало (28 → дальше пошли 11).
  function goNext() {
    if (activeStep?.step_type === 'question' && recipientNameMissing()) {
      dispatch({ type: 'SET_ACTIVE_STEP', index: state.activeStepIndex, nameMissing: true });
      track('builder_blocked_no_name');
      focusRecipientName();
      return;
    }
    goTo(state.activeStepIndex + 1);
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

  // Срок правки (3 дня с публикации) вышел — база всё равно не даст
  // сохранить, поэтому не пускаем в конструктор и объясняем почему.
  if (state.editInvitationId && state.editLocked) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 360, fontFamily: T.font }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
          <h1 style={{ fontWeight: 700, fontSize: 20, color: T.darkPurple, marginBottom: 8 }}>
            {t('builder.editLockedTitle')}
          </h1>
          <p style={{ color: T.muted, fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
            {t('builder.editLockedText')}
          </p>
          <a href="/dashboard" style={{ color: T.pink, fontSize: 14, fontWeight: 700 }}>
            {t('builder.goToDashboard')}
          </a>
        </div>
      </div>
    );
  }

  // Черновик, уже сохранённый из этого конструктора перед оплатой
  function savedDraftKey() {
    return `senti:saved-draft:${state.draftId}`;
  }
  function readSavedDraft() {
    try { return JSON.parse(window.localStorage.getItem(savedDraftKey()) || 'null'); } catch { return null; }
  }
  function rememberSavedDraft(value) {
    try { window.localStorage.setItem(savedDraftKey(), JSON.stringify(value)); } catch { /* не критично */ }
  }

  function resumeKey() {
    return `senti:resume:${window.location.pathname}`;
  }

  function rememberResume(provider) {
    try {
      window.localStorage.setItem(resumeKey(), JSON.stringify({
        provider, method: pendingPaymentMethod, at: Date.now(),
      }));
    } catch { /* без localStorage после входа просто нажмут кнопку ещё раз */ }
  }

  function focusRecipientName(attempt = 0) {
    // Шаг перерисовывается с анимацией — ждём, пока поле появится в DOM.
    const el = document.getElementById('builder-recipient-name');
    if (!el) {
      if (attempt < 20) setTimeout(() => focusRecipientName(attempt + 1), 50);
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }

  async function handlePublish() {
    setPublishError(null);
    // Без имени получателя превью ссылки в Telegram выйдет «Имя, это тебе».
    // Возвращаем на шаг с именем, а не публикуем заглушку.
    if (recipientNameMissing()) {
      const idx = orderedStepsForWizard.findIndex((s) => s.step_type === 'question');
      if (idx >= 0) dispatch({ type: 'SET_ACTIVE_STEP', index: idx, nameMissing: true });
      setPublishError(t('builder.nameRequired'));
      track('publish_blocked_no_name');
      // Поле имени — в середине длинного первого шага, а текст ошибки — в
      // самом низу. Без прокрутки человек видел только «вернуло на первую
      // страницу» и не понимал почему. Ведём прямо к полю и ставим курсор.
      focusRecipientName();
      return;
    }
    track('builder_publish_click', { edit: Boolean(state.editInvitationId), template: state.templateId });
    // Редактирование опубликованного приглашения — платить повторно не
    // нужно, сразу сохраняем изменения, как и раньше.
    if (state.editInvitationId) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) { setShowAuthGate(true); return; }
      await runPublish(sessionData.session.user.id);
      return;
    }
    // Новое приглашение — сначала спрашиваем, какой кнопкой платить
    // (обе кнопки Click требуются по их правилам интеграции), а уже потом
    // идём через AuthGate, если человек не вошёл.
    setShowPaymentChoice(true);
  }

  async function applyPromo(code = promoInput) {
    const c = normalizePromo(code);
    if (!c) { setPromo(null); setPromoStatus(null); storePromo(''); return; }
    setPromoStatus('checking');
    try {
      const res = await checkPromo(c);
      setPromo(res);
      setPromoStatus(res ? null : 'invalid');
      storePromo(res ? res.code : '');
      track(res ? 'promo_applied' : 'promo_invalid', { code: c });
    } catch {
      setPromoStatus('invalid');
    }
  }

  // Код из ссылки проверяем сразу, как только открылся экран оплаты
  useEffect(() => {
    if (showPaymentChoice && promoInput && !promo && promoStatus === null) applyPromo(promoInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaymentChoice]);

  async function handleChoosePaymentMethod(method) {
    setShowPaymentChoice(false);
    setPublishError(null);
    track('payment_method_choose', { method });
    // Не вошёл — экран входа. Оплата без регистрации (гостевой аккаунт)
    // готова, но выключена: см. GUEST_CHECKOUT_ENABLED в src/lib/guestAccount.js.
    setPublishing(true);
    const session = await ensureGuestSession();
    setPublishing(false);
    if (!session) {
      setPendingPaymentMethod(method);
      setShowAuthGate(true);
      return;
    }
    await runPublish(session.user.id, method);
  }

  async function runPublish(userId, method = 'invoice') {
    setPublishing(true);
    try {
      if (state.editInvitationId) {
        const { invitationId, slug } = await updateInvitationDraft(state, userId, state.editInvitationId);
        track('invitation_edited', {}, { slug });
        setPublishResult({ invitationId, slug, edited: true });
        return;
      }
      // Новое приглашение: сохраняем черновик (status остаётся 'draft'),
      // затем уходим на оплату Click. Сама публикация (status: 'published')
      // происходит в /api/click/webhook.js после реального списания —
      // отсюда мы просто редиректим на страницу оплаты и ничего не ждём.
      // Если прошлая попытка оплаты уже сохранила черновик (а дальше оборвалась
      // связь или человек вернулся с Click), перезаписываем его, а не создаём ещё один.
      const reuse = readSavedDraft();
      const { invitationId, slug } = await publishDraft(state, userId, reuse);
      rememberSavedDraft({ invitationId, slug });
      if (reuse?.invitationId !== invitationId) {
        track('draft_created', { template: state.templateId, shape: state.cardShape || 'classic', reply_to: state.replyTo || null });
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const { res, data } = await withRetry(async () => {
        const r = await fetch('/api/click/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ invitationId, method, promoCode: getStoredPromo() || undefined }),
        });
        return { res: r, data: await r.json().catch(() => ({})) };
      });
      // Владелец сервиса публикует без оплаты: сервер уже опубликовал
      // приглашение, показываем ссылку сразу, без перехода на Click.
      if (res.ok && data.published) {
        track('invitation_published_free', { template: state.templateId, promo: data.promo || null });
        if (data.promo) storePromo('');
        setPublishResult({ invitationId, slug: data.slug || slug });
        return;
      }
      if (data.promoInvalid) {
        // Код успел закончиться между проверкой и оплатой
        storePromo('');
        setPromo(null);
        throw new Error(t('builder.promoExpired'));
      }
      if (!res.ok || !data.paymentUrl) {
        throw new Error(data.error || t('builder.publishGenericError'));
      }
      // Ждём отправку события: сразу после этой строки страница уходит на
      // Click, и незавершённый запрос браузер просто отменил бы.
      pixelInitiateCheckout();
      await trackBeforeLeaving('payment_redirect', { method });
      window.location.href = data.paymentUrl;
    } catch (err) {
      const network = isNetworkError(err);
      track('publish_error', { message: String(err.message || '').slice(0, 120), network });
      setPublishError(network ? t('builder.networkError') : (err.message || t('builder.publishGenericError')));
    } finally {
      setPublishing(false);
    }
  }

  if (showPaymentChoice) {
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
          style={{ textAlign: 'center', maxWidth: 360, width: '100%', position: 'relative', zIndex: 1 }}
        >
          <h1 style={{ fontFamily: T.font, fontWeight: 700, fontSize: 20, color: T.darkPurple, marginBottom: 6 }}>
            {promo?.discount_percent === 100 ? t('builder.promoFreeTitle') : t('builder.choosePaymentTitle')}
          </h1>
          <p style={{ fontFamily: T.font, fontSize: 15, color: T.dark, margin: '0 0 18px' }}>
            {(promo || state.replyToId) ? (
              <>
                <span style={{ textDecoration: 'line-through', color: T.muted, marginRight: 8 }}>{INVITATION_PRICE.toLocaleString('ru-RU')} {t('builder.sum')}</span>
                <b style={{ color: T.pink }}>
                  {discounted(INVITATION_PRICE, promo ? promo.discount_percent : REPLY_DISCOUNT) === 0
                    ? t('builder.promoFree')
                    : `${discounted(INVITATION_PRICE, promo ? promo.discount_percent : REPLY_DISCOUNT).toLocaleString('ru-RU')} ${t('builder.sum')}`}
                </b>
                {!promo && <span style={{ display: 'block', fontSize: 12, color: T.muted, marginTop: 4 }}>{t('builder.replyDiscount')}</span>}
              </>
            ) : (
              <b>{INVITATION_PRICE.toLocaleString('ru-RU')} {t('builder.sum')}</b>
            )}
          </p>
          {promo?.discount_percent === 100 ? (
            <button
              type="button"
              onClick={() => handleChoosePaymentMethod('invoice')}
              style={{
                display: 'block', width: '100%', background: T.pink, color: '#fff', padding: '14px 24px',
                borderRadius: 100, fontFamily: T.font, fontWeight: 700, fontSize: 15, border: 'none',
                cursor: 'pointer', marginBottom: 12,
              }}
            >
              {t('builder.promoPublishFree')}
            </button>
          ) : (
            <>
            <button
              type="button"
              onClick={() => handleChoosePaymentMethod('invoice')}
              style={{
                display: 'block', width: '100%', background: T.pink, color: '#fff', padding: '14px 24px',
                borderRadius: 100, fontFamily: T.font, fontWeight: 700, fontSize: 15, border: 'none',
                cursor: 'pointer', marginBottom: 12,
              }}
            >
              {t('builder.payWithClick')}
            </button>
            <button
              type="button"
              onClick={() => handleChoosePaymentMethod('card')}
              style={{
                display: 'block', width: '100%', background: 'white', color: T.dark, padding: '14px 24px',
                borderRadius: 100, fontFamily: T.font, fontWeight: 700, fontSize: 15,
                border: `1.5px solid ${T.pinkBorder}`, cursor: 'pointer', marginBottom: 12,
              }}
            >
              {t('builder.payWithCard')}
            </button>
            </>
          )}
          <div style={{ margin: '4px 0 14px', textAlign: 'left' }}>
            {!promoOpen ? (
              <button type="button" onClick={() => setPromoOpen(true)} style={{
                background: 'none', border: 'none', padding: 0, color: T.pink, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'center',
              }}>
                {t('builder.promoHave')}
              </button>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={promoInput}
                    onChange={(e) => { setPromoInput(normalizePromo(e.target.value)); setPromoStatus(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') applyPromo(); }}
                    placeholder={t('builder.promoPlaceholder')}
                    aria-label={t('builder.promoPlaceholder')}
                    style={{
                      flex: 1, minWidth: 0, padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${promoStatus === 'invalid' ? '#e5484d' : T.pinkBorder}`,
                      fontFamily: T.font, fontSize: 14, textTransform: 'uppercase', outline: 'none', background: '#fff',
                    }}
                  />
                  <button type="button" onClick={() => applyPromo()} disabled={promoStatus === 'checking' || !promoInput} style={{
                    padding: '0 16px', borderRadius: 12, border: 'none', background: T.darkPurple, color: '#fff',
                    fontFamily: T.font, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: promoInput ? 1 : 0.5,
                  }}>
                    {promoStatus === 'checking' ? '…' : t('builder.promoApply')}
                  </button>
                </div>
                {promoStatus === 'invalid' && <p style={{ margin: '6px 2px 0', fontSize: 12.5, color: '#e5484d', fontFamily: T.font }}>{t('builder.promoInvalid')}</p>}
                {promo && <p style={{ margin: '6px 2px 0', fontSize: 12.5, color: '#2f9e5b', fontFamily: T.font }}>{t('builder.promoOk', { percent: promo.discount_percent })}</p>}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowPaymentChoice(false)}
            style={{
              background: 'none', border: 'none', color: T.muted, fontFamily: T.font,
              fontSize: 13, textDecoration: 'underline', cursor: 'pointer',
            }}
          >
            {t('builder.cancel')}
          </button>
        </motion.div>
      </div>
    );
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
          <AuthGate
            context="checkout"
            initialError={authError}
            onBeforeRedirect={rememberResume}
            onAuthenticated={(user) => { setShowAuthGate(false); setAuthError(null); runPublish(user.id, pendingPaymentMethod); }}
          />
        </div>
      </div>
    );
  }

  if (publishResult) {
    // После правки имени ссылка получает новую метку ?v= — мессенджер
    // заново загрузит превью (см. src/lib/shareLink.js)
    const questionName = state.steps.find((s) => s.step_type === 'question')?.configuration_json?.recipientName;
    const shareUrl = inviteShareUrl(publishResult.slug, normalizeName(questionName), state.templateId);
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

          <ShareToTelegram url={shareUrl} slug={publishResult.slug} />

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
          <div style={{ marginTop: 12 }}>
            <p style={{ color: '#C0392B', fontSize: 13, fontFamily: T.font }}>
              {publishError}
            </p>
            {/* Публикация сорвалась у самой оплаты — здесь человеку нужен
                живой ответ, а не только текст ошибки. */}
            <SupportTrigger
              variant="quiet"
              defaultTopic="payment"
              label={t('support.paymentHelp')}
              style={{ marginTop: 6, color: T.pink, fontWeight: 600 }}
            />
          </div>
        )}

        {/* Последний шаг — перед кнопкой оплаты. Намеренно тихая ссылка под
            контентом, а не кнопка рядом с «Оплатить»: заметный блок про
            проблемы у самой оплаты скорее посеет сомнение, чем поможет. */}
        {/* Прогон перед оплатой: до него человек платил, ни разу не увидев
            свою работу целиком — боковая превьюшка показывает по одному
            экрану и без переходов. Кнопка намеренно не обязательный шаг
            визарда: лишний экран в воронке стоит конверсии, поэтому уверенный
            платит сразу, а сомневающийся сначала смотрит. */}
        {isLastStep && (
          <button
            type="button"
            onClick={() => setPreviewData(buildPreviewInvitation(state))}
            style={{
              marginTop: 20, width: '100%', height: 50, borderRadius: 100,
              border: `1.5px solid ${T.pinkBorder}`, background: 'white', color: T.pink,
              fontFamily: T.font, fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            {t('preview.openButton')}
          </button>
        )}

        {isLastStep && !publishError && (
          <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12.5, color: T.muted, fontFamily: T.font }}>
            {t('support.beforePayPrompt')}{' '}
            <SupportTrigger
              variant="quiet"
              label={t('support.dashboardPromptLink')}
              style={{ fontSize: 12.5, color: T.pink, fontWeight: 600 }}
            />
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
          onClick={isLastStep ? handlePublish : goNext}
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

      {previewData && (
        <PreviewOverlay
          previewData={previewData}
          busy={publishing}
          confirmLabel={state.editInvitationId ? t('preview.confirmSave') : t('preview.confirmPublish')}
          onClose={() => setPreviewData(null)}
          onConfirm={() => {
            setPreviewData(null);
            handlePublish();
          }}
        />
      )}
    </div>
  );
}
