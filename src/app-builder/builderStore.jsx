/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { listDefaultGifs } from '../lib/mediaLibrary.js';

const STORAGE_PREFIX = 'date-invite-draft:';

export const DEFAULT_STEPS = [
  // mediaUrl у вопроса/реакции/даты/финала изначально пустой — актуальная
  // дефолтная гифка каждого шага подтягивается из админки при заходе в
  // конструктор (см. эффект APPLY_DEFAULT_MEDIA ниже). Раньше здесь были
  // зашитые в код URL, из-за которых на долю секунды мелькала СТАРАЯ
  // картинка перед тем, как подставлялась актуальная.
  { step_type: 'question', step_order: 0, enabled: true, configuration_json: { recipientName: 'Имя', questionText: 'Пойдёшь со мной на свидание?', yesText: 'Да, конечно ❤️', noText: 'Нет', mediaUrl: null } },
  { step_type: 'reaction', step_order: 1, enabled: true, configuration_json: { title: 'Подожди, ты действительно сказал да?', text: 'Я была готова что скажешь «нет» ахах', confirmText: 'Да Да ДА!', mediaUrl: null } },
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
  { step_type: 'final', step_order: 5, enabled: true, configuration_json: { title: 'Ну всё, теперь пути назад нет 😄❤️', description: 'Наше свидание официально запланировано!', mediaUrl: null } },
];

function initialDraft(draftId, initialTemplateId) {
  const templateId = initialTemplateId || 'romantic';
  return {
    draftId, templateId, mood: templateId, cardShape: 'polaroid', activeStepIndex: 0, steps: DEFAULT_STEPS,
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
    loading: false,
  };
}

// Дефолтные тексты в DEFAULT_STEPS написаны для получателя мужского пола
// ("свободен", "сказал") — при выборе пола получателя (см. AudienceGate в
// BuilderShell) подправляем род в ещё не тронутых пользователем полях, чтобы
// черновик сразу открывался с правильной грамматикой. Кастомный текст,
// который уже не совпадает с исходным дефолтом, не трогаем.
//
// direction: 'recipient' — фраза обращена К получателю ("ты свободен?") —
// род берём напрямую из пола получателя.
// direction: 'sender' — фраза написана ОТ ЛИЦА отправителя ("я была готова…")
// — предполагаем гетеросексуальную пару, так что род отправителя обратный
// полу получателя (пригласили девушку → пишет парень, и наоборот).
const GENDERED_STEP_DEFAULTS = [
  { step_type: 'date', field: 'title', direction: 'recipient', masculine: 'И так... Когда ты свободен?', feminine: 'И так... Когда ты свободна?' },
  { step_type: 'reaction', field: 'title', direction: 'recipient', masculine: 'Подожди, ты действительно сказал да?', feminine: 'Подожди, ты действительно сказала да?' },
  { step_type: 'reaction', field: 'text', direction: 'sender', masculine: 'Я был готов что скажешь «нет» ахах', feminine: 'Я была готова что скажешь «нет» ахах' },
];

function genderizeSteps(steps, recipientGender) {
  if (recipientGender !== 'male' && recipientGender !== 'female') return steps;
  return steps.map((s) => {
    const rules = GENDERED_STEP_DEFAULTS.filter((g) => g.step_type === s.step_type);
    if (rules.length === 0) return s;
    let configuration_json = s.configuration_json;
    for (const rule of rules) {
      const effectiveGender = rule.direction === 'sender'
        ? (recipientGender === 'female' ? 'male' : 'female')
        : recipientGender;
      const current = configuration_json?.[rule.field];
      if (effectiveGender === 'female' && current === rule.masculine) {
        configuration_json = { ...configuration_json, [rule.field]: rule.feminine };
      } else if (effectiveGender === 'male' && current === rule.feminine) {
        configuration_json = { ...configuration_json, [rule.field]: rule.masculine };
      }
    }
    return configuration_json === s.configuration_json ? s : { ...s, configuration_json };
  });
}

function draftReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'SET_TEMPLATE':
      return { ...state, templateId: action.templateId };
    case 'SET_CARD_SHAPE':
      return { ...state, cardShape: action.cardShape };
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