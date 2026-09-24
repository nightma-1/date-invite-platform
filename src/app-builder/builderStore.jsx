/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';

const STORAGE_PREFIX = 'date-invite-draft:';

export const DEFAULT_STEPS = [
  { step_type: 'question', step_order: 0, enabled: true, configuration_json: { recipientName: 'Имя', questionText: 'Пойдёшь со мной на свидание?', yesText: 'Да, конечно ❤️', noText: 'Нет', mediaUrl: null } },
  { step_type: 'reaction', step_order: 1, enabled: true, configuration_json: { title: 'Подожди, ты действительно сказал да?', text: 'Я была готова что скажешь «нет» ахах', confirmText: 'Да Да ДА!' } },
  { step_type: 'date', step_order: 2, enabled: true, configuration_json: { mode: 'recipient_picks', title: 'И так... Когда ты свободен?', buttonText: 'Выбери дату 💌' } },
  { step_type: 'time', step_order: 3, enabled: true, configuration_json: { title: 'Во сколько? 🕒' } },
  { step_type: 'choice_block', step_order: 4, enabled: true, configuration_json: { categoryType: 'place', allowMultiple: false, options: [] } },
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
  };
}

function draftReducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;
    case 'SET_TEMPLATE':
      return { ...state, templateId: action.templateId };
    case 'SET_GENDER':
      return { ...state, recipientGender: action.gender };
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

export function BuilderProvider({ draftId, initialTemplateId, children }) {
  const [state, dispatch] = useReducer(draftReducer, null, () => {
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

  useEffect(() => {
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