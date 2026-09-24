/**
 * © 2026 Senti. Все права защищены.
 *
 * Общая начинка для шагов «Куда идём» и «Что едим» — раньше был один шаг
 * choice_block с переключателем категории и пустым списком вариантов,
 * теперь два отдельных экрана с уже готовым (редактируемым) набором
 * вариантов под конкретную тему.
 */

import { useBuilder } from '../builderStore.jsx';
import { T, SectionCard, FieldLabel, TxtArea, CharCount } from '../BuilderUI.jsx';

function makeOptionId() {
  return `opt_${Math.random().toString(36).slice(2, 9)}`;
}

export default function ChoiceStepFields({ stepType }) {
  const { state, dispatch } = useBuilder();
  const config = state.steps.find((s) => s.step_type === stepType).configuration_json;
  const options = config.options || [];

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType, payload });
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
      <SectionCard number="1" title="Заголовок">
        <TxtArea
          value={config.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          rows={2}
          maxLength={200}
        />
        <CharCount value={config.title} max={200} />

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
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
        <p style={{ fontSize: 12, color: T.muted, marginTop: 4, fontFamily: T.font }}>
          {config.allowMultiple
            ? 'Получатель отметит несколько вариантов и нажмёт кнопку, чтобы продолжить'
            : 'Получатель выберет один вариант'}
        </p>
      </SectionCard>

      <SectionCard number="2" title="Варианты">
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 12, fontFamily: T.font }}>
          Уже готовый набор — можно менять, удалять и добавлять свои
        </p>

        {/* Сетка 2 колонки — как карточки, которые увидит получатель, а не
            список строк, чтобы было сразу понятно, как это будет выглядеть */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {options.map((opt) => (
            <div
              key={opt.id}
              style={{
                position: 'relative',
                borderRadius: 14,
                border: '1.5px solid #e0e0e0',
                background: 'white',
                padding: '14px 10px 10px',
                textAlign: 'center',
              }}
            >
              <button
                type="button"
                onClick={() => removeOption(opt.id)}
                aria-label="Удалить вариант"
                style={{
                  position: 'absolute', top: 6, right: 6,
                  width: 22, height: 22, borderRadius: '50%',
                  border: 'none', background: '#f2f2f2', color: T.muted,
                  cursor: 'pointer', fontSize: 12, lineHeight: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ✕
              </button>
              <input
                type="text"
                value={opt.icon}
                onChange={(e) => updateOption(opt.id, { icon: e.target.value })}
                maxLength={2}
                style={{
                  width: 40,
                  height: 40,
                  margin: '0 auto 8px',
                  display: 'block',
                  textAlign: 'center',
                  borderRadius: 10,
                  border: '1px solid #e0e0e0',
                  background: '#fafafa',
                  fontSize: 20,
                  fontFamily: T.font,
                  boxSizing: 'border-box',
                }}
              />
              <input
                type="text"
                value={opt.label}
                onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                placeholder="Название"
                style={{
                  width: '100%',
                  height: 34,
                  padding: '0 6px',
                  borderRadius: 8,
                  border: '1px solid #e0e0e0',
                  background: 'white',
                  fontFamily: T.font,
                  fontSize: 13,
                  color: T.dark,
                  textAlign: 'center',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>
          ))}
        </div>

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
            marginTop: 10,
          }}
        >
          + Добавить вариант
        </button>
      </SectionCard>
    </div>
  );
}
