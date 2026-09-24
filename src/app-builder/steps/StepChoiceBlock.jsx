/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { useBuilder } from '../builderStore.jsx';
import ChoiceScreen from '../../components/screens/ChoiceScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';

const CATEGORY_LABELS = {
  place: 'Место',
  food: 'Еда',
  movie: 'Кино',
  activity: 'Активности',
  drink: 'Напитки',
  custom: 'Своя категория',
};

function makeOptionId() {
  return `opt_${Math.random().toString(36).slice(2, 9)}`;
}

export default function StepChoiceBlock() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
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
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
            Категория
          </label>
          <select
            value={config.categoryType}
            onChange={(e) => update({ categoryType: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(config.allowMultiple)}
            onChange={(e) => update({ allowMultiple: e.target.checked })}
          />
          Можно выбрать несколько вариантов
        </label>

        <div>
          <label className="mb-2 block text-sm font-medium" style={{ color: tokens.ink }}>
            Варианты
          </label>
          <div className="space-y-2">
            {options.map((opt) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt.icon}
                  onChange={(e) => updateOption(opt.id, { icon: e.target.value })}
                  className="w-12 rounded-lg border px-2 py-1.5 text-center text-sm"
                  maxLength={2}
                />
                <input
                  type="text"
                  value={opt.label}
                  onChange={(e) => updateOption(opt.id, { label: e.target.value })}
                  placeholder="Название варианта"
                  className="flex-1 rounded-lg border px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeOption(opt.id)}
                  className="rounded-lg border px-2 py-1.5 text-xs opacity-60"
                  aria-label="Удалить вариант"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="mt-2 rounded-lg border border-dashed px-3 py-1.5 text-xs opacity-70"
          >
            + Добавить вариант
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide opacity-60">Живое превью</p>
        <div className="mx-auto max-w-[300px]">
          <ChoiceScreen
            title={`Выбираем: ${CATEGORY_LABELS[config.categoryType] || ''}`}
            options={options.filter((o) => o.label)}
            allowMultiple={config.allowMultiple}
            tokens={tokens}
            onContinue={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
