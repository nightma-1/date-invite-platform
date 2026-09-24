/**
 * © 2026 Senti. Все права защищены.
 */

import { useBuilder } from '../builderStore.jsx';
import { T, SectionCard, FieldLabel, Inp } from '../BuilderUI.jsx';

const CATEGORY_OPTIONS = [
  { value: 'food', icon: '🍽️', label: 'Блюда' },
  { value: 'movie', icon: '🎬', label: 'Кино' },
  { value: 'activity', icon: '🎯', label: 'Активности' },
  { value: 'drink', icon: '☕', label: 'Напитки' },
  { value: 'place', icon: '📍', label: 'Места' },
  { value: 'custom', icon: '✨', label: 'Своё' },
];

function makeOptionId() {
  return `opt_${Math.random().toString(36).slice(2, 9)}`;
}

export default function StepChoiceBlock() {
  const { state, dispatch } = useBuilder();
  const config = state.steps.find((s) => s.step_type === 'choice_block').configuration_json;
  const options = config.options || [];

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'choice_block', payload });
  }

  function addOption() {
    update({ options: [...options, { id: makeOptionId(), label: '', icon: '✨' }] });
  }

  function updateOption(id, patch) {
    update({ options: options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  }

  function removeOption(id) {
    update({ options: options.filter((o) => o.id !== id) });
  }

  return (
    <div>
      <SectionCard number="1" title="Тип выбора">
        <p style={{ fontSize: 13, color: T.muted, marginBottom: 12, fontFamily: T.font }}>
          Выбери 1 вариант и настрой под себя
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => update({ categoryType: cat.value })}
              style={{
                padding: '16px 8px',
                borderRadius: 16,
                border: `1.5px solid ${config.categoryType === cat.value ? T.pink : '#e0e0e0'}`,
                background: config.categoryType === cat.value ? T.pinkLight : 'white',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 26 }}>{cat.icon}</span>
              <span style={{
                fontFamily: T.font,
                fontSize: 13,
                color: T.dark,
                fontWeight: config.categoryType === cat.value ? 700 : 400,
              }}>
                {cat.label}
              </span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard number="2" title="Варианты">
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          fontSize: 14,
          color: T.dark,
          fontFamily: T.font,
          cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={Boolean(config.allowMultiple)}
            onChange={(e) => update({ allowMultiple: e.target.checked })}
          />
          Можно выбрать несколько
        </label>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 12, fontFamily: T.font }}>
          Получатель отметит несколько вариантов и нажмёт кнопку, чтобы продолжить
        </p>

        {options.map((opt) => (
          <div key={opt.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={opt.icon}
              onChange={(e) => updateOption(opt.id, { icon: e.target.value })}
              maxLength={2}
              style={{
                width: 44,
                height: 44,
                textAlign: 'center',
                borderRadius: 12,
                border: '1px solid #e0e0e0',
                background: 'white',
                fontSize: 18,
                fontFamily: T.font,
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              value={opt.label}
              onChange={(e) => updateOption(opt.id, { label: e.target.value })}
              placeholder="Название варианта"
              style={{
                flex: 1,
                height: 44,
                padding: '0 12px',
                borderRadius: 12,
                border: '1px solid #e0e0e0',
                background: 'white',
                fontFamily: T.font,
                fontSize: 14,
                color: T.dark,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => removeOption(opt.id)}
              style={{
                width: 36,
                height: 44,
                borderRadius: 12,
                border: '1px solid #e0e0e0',
                background: 'white',
                color: T.muted,
                cursor: 'pointer',
                fontSize: 16,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addOption}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 12,
            border: '1.5px dashed #e0e0e0',
            background: 'transparent',
            color: T.muted,
            cursor: 'pointer',
            fontSize: 14,
            fontFamily: T.font,
            marginTop: 4,
          }}
        >
          + Добавить вариант
        </button>
      </SectionCard>
    </div>
  );
}
