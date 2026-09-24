/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { supabase } from '../lib/supabaseClient.js';

const STORAGE_PREFIX = 'date-invite-draft:';

export const DEFAULT_STEPS = [
  { step_type: 'question', step_order: 0, enabled: true, configuration_json: { recipientName: 'Имя', questionText: 'Пойдёшь со мной на свидание?', yesText: 'Да, конечно ❤️', noText: 'Нет', mediaUrl: null } },
  { step_type: 'reaction', step_order: 1, enabled: true, configuration_json: { title: 'Подожди, ты действительно сказал да?', text: 'Я была готова что скажешь «нет» ахах', confirmText: 'Да Да ДА!' } },
  // Дата и время — один шаг с двумя полями, получатель тоже видит их на одном экране
  { step_type: 'date', step_order: 2, enabled: true, configuration_json: { mode: 'recipient_picks', title: 'И так... Когда ты свободен?', buttonText: 'Выбери дату и время 💌' } },
  // Раньше был один шаг с переключателем категории и пустым списком —
  // теперь два отдельных экрана с уже готовым набором вариантов
  {
    step_type: 'choice_place', step_order: 3, enabled: true, configuration_json: {
      title: 'Куда пойдём?', allowMultiple: false,
      options: [
        { id: 'opt_place_1', icon: '🎬', label: 'Кино' },
        { id: 'opt_place_2', icon: '🍽️', label: 'Ресторан' },
        { id: 'opt_place_3', icon: '🚶', label: 'Прогулка' },
        { id: 'opt_place_4', icon: '🎳', label: 'Боулинг' },
        { id: 'opt_place_5', icon: '☕', label: 'Кафе' },
        { id: 'opt_place_6', icon: '✨', label: 'Своё' },
      ],
    },
  },
  {
    step_type: 'choice_food', step_order: 4, enabled: true, configuration_json: {
      title: 'Что будем есть?', allowMultiple: false,
      options: [
        { id: 'opt_food_1', icon: '🍕', label: 'Пицца' },
        { id: 'opt_food_2', icon: '🍣', label: 'Суши' },
        { id: 'opt_food_3', icon: '🍔', label: 'Бургеры' },
        { id: 'opt_food_4', icon: '🍝', label: 'Паста' },
        { id: 'opt_food_5', icon: '🥗', label: 'Салаты' },
        { id: 'opt_food_6', icon: '🍦', label: 'Десерт' },
      ],
    },
  },
  { step_type: 'final', step_order: 5, enabled: true, configuration_json: { title: 'Ну всё, теперь пути назад нет 😄❤️', description: 'Наше свидание официально запланировано!' } },
];

function initialDraft(draftId, initialTemplateId) {
  const templateId = initialTemplateId || 'romantic';
  return {
    draftId, templateId, mood: templateId, activeStepIndex: 0, steps: DEFAULT_STEPS,
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
    templateId: inv.template_key || initialTemplateId || 'romantic',
    mood: inv.mood || inv.template_key || 'romantic',
    activeStepIndex: 0,
    steps,
    recipientGender: inv.recipient_gender || null,
    editInvitationId: invitationId,
    slug: inv.slug,
    loading: false,
  };
}

// Дефолтные тексты в DEFAULT_STEPS написаны для получателя мужского пола
// ("свободен", "сказал") — при выборе пола получателя (см. AudienceGate в
// BuilderShell) подправляем род в ещё не тронутых пользователем полях, чтобы
// черновик сразу открывался с правильной грамматикой. Кастомный текст,
// который уже не совпадает с исходным дефолтом, не трогаем.
const GENDERED_STEP_DEFAULTS = [
  { step_type: 'date', field: 'title', masculine: 'И так... Когда ты свободен?', feminine: 'И так... Когда ты свободна?' },
  { step_type: 'reaction', field: 'title', masculine: 'Подожди, ты действительно сказал да?', feminine: 'Подожди, ты действительно сказала да?' },
];

function genderizeSteps(steps, gender) {
  if (gender !== 'male' && gender !== 'female') return steps;
  return steps.map((s) => {
    const rule = GENDERED_STEP_DEFAULTS.find((g) => g.step_type === s.step_type);
    if (!rule) return s;
    const current = s.configuration_json?.[rule.field];
    if (gender === 'female' && current === rule.masculine) {
      return { ...s, configuration_json: { ...s.configuration_json, [rule.field]: rule.feminine } };
    }
    if (gender === 'male' && current === rule.feminine) {
      return { ...s, configuration_json: { ...s.configuration_json, [rule.field]: rule.masculine } };
    }
    return s;
  });
}

function draftReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'SET_TEMPLATE':
      return { ...state, templateId: action.templateId };
    case 'SET_GENDER':
      return { ...state, recipientGender: action.gender, steps: genderizeSteps(state.steps, action.gender) };
    case 'SET_ACTIVE_STEP':
      return { ...state, activeStepIndex: action.index };
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

  useEffect(() => {
    if (state.loading) return; // не затираем черновик, пока идёт загрузка для редактирования
    try {
      window.localStorage.setItem(STORAGE_PREFIX + draftId, JSON.stringify(state));
    } catch {
      // localStorage может быть недоступен (приватный режим/квота) — черновик просто не сохранится,
      // не роняем билдер из-за этого
    }
  }, [draftId, state]);

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