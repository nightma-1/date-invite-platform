/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { isEditLocked } from '../lib/editWindow.js';
import { listDefaultGifs } from '../lib/mediaLibrary.js';
import i18n from '../i18n/index.js';
import { useTranslation } from 'react-i18next';
import { buildDefaultConfigs, localizeSteps, normalizeLang, invitationLang } from './defaultContent.js';

const STORAGE_PREFIX = 'date-invite-draft:';

// mediaUrl у вопроса/реакции/даты/финала изначально пустой — актуальная
// дефолтная гифка каждого шага подтягивается из админки при заходе в
// конструктор (см. эффект APPLY_DEFAULT_MEDIA ниже).
// Тексты — на языке конструктора, см. defaultContent.js.
export function buildDefaultSteps(lang, recipientGender = null) {
  const c = buildDefaultConfigs(lang, recipientGender);
  return [
    { step_type: 'question', step_order: 0, enabled: true, configuration_json: c.question },
    { step_type: 'reaction', step_order: 1, enabled: true, configuration_json: c.reaction },
    // Дата и время — один шаг с двумя полями, получатель тоже видит их на одном экране
    { step_type: 'date', step_order: 2, enabled: true, configuration_json: c.date },
    // Два отдельных экрана выбора с уже готовым набором вариантов
    { step_type: 'choice_place', step_order: 3, enabled: true, configuration_json: c.choice_place },
    { step_type: 'choice_food', step_order: 4, enabled: true, configuration_json: c.choice_food },
    { step_type: 'final', step_order: 5, enabled: true, configuration_json: c.final },
  ];
}

export const DEFAULT_STEPS = buildDefaultSteps('ru');

function currentUiLang() {
  return normalizeLang(i18n.resolvedLanguage || i18n.language);
}

function initialDraft(draftId, initialTemplateId) {
  const templateId = initialTemplateId || 'romantic';
  return {
    draftId, templateId, mood: templateId, cardShape: 'polaroid', activeStepIndex: 0,
    // Язык приглашения = язык конструктора; меняется вместе с переключателем
    lang: currentUiLang(),
    steps: buildDefaultSteps(currentUiLang()),
    // Какие шаги ещё ни разу не получали картинку от самого пользователя —
    // пока шаг не тронут, картинку на нём можно свободно подменять свежим
    // дефолтом из админки (см. APPLY_DEFAULT_MEDIA и эффект в BuilderProvider).
    mediaTouched: {},
    // Кому адресовано приглашение — спрашиваем один раз при входе в конструктор
    // (см. AudienceGate в BuilderShell), это не отдельный шаг мастера и не
    // экран для получателя, а метаданные автора.
    recipientGender: null,
    // Заполняются только в режиме редактирования уже опубликованного приглашения
    editInvitationId: null,
    slug: null,
    loading: false,
  };
}

/** Загрузить уже опубликованное приглашение для редактирования — источник
 *  истины тот же invitation_steps, что и при публикации, так что просто
 *  разворачиваем его обратно в форму state.steps конструктора. */
async function fetchInvitationForEdit(invitationId, editDraftId, initialTemplateId) {
  const { data: inv, error } = await supabase
    .from('invitations')
    .select('*, invitation_steps(*)')
    .eq('id', invitationId)
    .single();
  if (error) throw error;

  const savedSteps = (inv.invitation_steps || []).filter((s) => s.step_type !== 'time');
  const steps = DEFAULT_STEPS.map((def) => {
    const saved = savedSteps.find((s) => s.step_type === def.step_type);
    return saved
      ? {
          step_type: def.step_type,
          step_order: saved.step_order,
          enabled: saved.enabled,
          configuration_json: { ...def.configuration_json, ...(saved.configuration_json || {}) },
        }
      : def;
  });

  return {
    draftId: editDraftId,
    // У старых приглашений поля языка нет — их тексты были на русском
    lang: invitationLang(savedSteps) || 'ru',
    templateId: inv.template_key || initialTemplateId || 'romantic',
    mood: inv.mood || inv.template_key || 'romantic',
    cardShape: inv.card_shape || 'polaroid',
    activeStepIndex: 0,
    steps,
    // Это уже существующее приглашение — картинки в нём осознанные,
    // автодефолты из админки поверх них проставлять не нужно.
    mediaTouched: { question: true, reaction: true, date: true },
    recipientGender: inv.recipient_gender || null,
    editInvitationId: invitationId,
    slug: inv.slug,
    editLocked: isEditLocked(inv),
    loading: false,
  };
}

function draftReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'SET_TEMPLATE':
      return { ...state, templateId: action.templateId };
    case 'SET_CARD_SHAPE':
      return { ...state, cardShape: action.cardShape };
    // Ещё не тронутые автором тексты подстраиваем под род получателя
    // ("свободен"/"свободна") — свой текст автора не трогаем (defaultContent.js)
    case 'SET_GENDER':
      return { ...state, recipientGender: action.gender, steps: localizeSteps(state.steps, state.lang, action.gender) };
    // Смена языка конструктора: язык приглашения и все не тронутые тексты
    // (вопрос, кнопки, варианты, заголовки) переходят на новый язык
    case 'SET_LANG': {
      const lang = normalizeLang(action.lang);
      return { ...state, lang, steps: localizeSteps(state.steps, lang, state.recipientGender) };
    }
    case 'SET_ACTIVE_STEP':
      return { ...state, activeStepIndex: action.index, nameMissing: action.nameMissing || false };
    case 'TOGGLE_STEP':
      return {
        ...state,
        steps: state.steps.map((s) => (s.step_type === action.stepType ? { ...s, enabled: action.enabled } : s)),
      };
    case 'UPDATE_STEP_CONFIG':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.step_type === action.stepType
            ? { ...s, configuration_json: { ...s.configuration_json, ...action.payload } }
            : s
        ),
        // Если пользователь сам поменял картинку (или явно убрал её) на шаге —
        // запоминаем это, чтобы больше не подменять её автодефолтом из админки.
        mediaTouched: Object.prototype.hasOwnProperty.call(action.payload || {}, 'mediaUrl')
          ? { ...state.mediaTouched, [action.stepType]: true }
          : state.mediaTouched,
      };
    // Автодефолт из библиотеки гифок (админка) — в отличие от UPDATE_STEP_CONFIG
    // не помечает шаг как "тронутый", поэтому будет и дальше обновляться при
    // каждом заходе в конструктор, пока пользователь сам не выберет картинку.
    case 'APPLY_DEFAULT_MEDIA':
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.step_type === action.stepType
            ? { ...s, configuration_json: { ...s.configuration_json, mediaUrl: action.mediaUrl } }
            : s
        ),
      };
    default:
      return state;
  }
}

const BuilderContext = createContext(null);

export function BuilderProvider({ draftId, initialTemplateId, editInvitationId, children }) {
  const [state, dispatch] = useReducer(draftReducer, null, () => {
    if (editInvitationId) {
      return { ...initialDraft(draftId, initialTemplateId), editInvitationId, loading: true };
    }
    if (typeof window === 'undefined') return initialDraft(draftId, initialTemplateId);
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + draftId);
      if (!saved) return initialDraft(draftId, initialTemplateId);
      const parsed = JSON.parse(saved);
      // Шаблон из URL важнее сохранённого: пользователь только что кликнул по нему в галерее
      return initialTemplateId ? { ...parsed, templateId: initialTemplateId } : parsed;
    } catch {
      return initialDraft(draftId, initialTemplateId);
    }
  });

  // Режим редактирования: подгружаем уже опубликованное приглашение из Supabase
  useEffect(() => {
    if (!editInvitationId) return;
    let cancelled = false;
    fetchInvitationForEdit(editInvitationId, draftId, initialTemplateId)
      .then((loaded) => { if (!cancelled) dispatch({ type: 'HYDRATE', payload: loaded }); })
      .catch((err) => {
        console.error('Не удалось загрузить приглашение для редактирования', err);
        if (!cancelled) {
          dispatch({
            type: 'HYDRATE',
            payload: { ...initialDraft(draftId, initialTemplateId), editInvitationId, loading: false, loadError: true },
          });
        }
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editInvitationId]);

  // Подтягиваем актуальные дефолтные гифки из библиотеки (админ выбирает их
  // на странице /admin) на КАЖДЫЙ заход в конструктор — но только на те шаги,
  // где пользователь ещё ни разу сам не менял картинку (см. mediaTouched).
  // В режиме редактирования уже опубликованного приглашения не трогаем —
  // там картинки осознанно выбраны раньше.
  useEffect(() => {
    if (editInvitationId) return;
    let cancelled = false;
    listDefaultGifs()
      .then((defaults) => {
        if (cancelled || !defaults) return;
        for (const [stepType, url] of Object.entries(defaults)) {
          if (state.mediaTouched?.[stepType]) continue; // пользователь уже сам выбрал картинку на этом шаге
          dispatch({ type: 'APPLY_DEFAULT_MEDIA', stepType, mediaUrl: url });
        }
      })
      .catch(() => {}); // тихо — не получилось, остаются прежние картинки
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editInvitationId]);

  useEffect(() => {
    if (state.loading) return; // не затираем черновик, пока идёт загрузка для редактирования
    try {
      window.localStorage.setItem(STORAGE_PREFIX + draftId, JSON.stringify(state));
    } catch {
      // localStorage может быть недоступен (приватный режим/квота) — черновик просто не сохранится,
      // не роняем билдер из-за этого
    }
  }, [draftId, state]);

  // Язык приглашения всегда совпадает с языком конструктора: переключили
  // язык в шапке — переводим черновик (кроме того, что автор написал сам).
  // Срабатывает и для старых черновиков без state.lang, и при открытии на
  // правку приглашения, созданного на другом языке.
  const { i18n: i18nInstance } = useTranslation();
  const uiLang = normalizeLang(i18nInstance.resolvedLanguage || i18nInstance.language);
  const draftLang = state.lang;
  const questionLang = state.steps.find((s) => s.step_type === 'question')?.configuration_json?.lang;
  useEffect(() => {
    if (state.loading) return;
    if (draftLang !== uiLang || questionLang !== uiLang) dispatch({ type: 'SET_LANG', lang: uiLang });
  }, [uiLang, draftLang, questionLang, state.loading]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder должен вызываться внутри BuilderProvider');
  return ctx;
}

export function enabledSteps(state) {
  return state.steps.filter((s) => s.enabled).sort((a, b) => a.step_order - b.step_order);
}