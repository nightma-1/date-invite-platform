/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { useBuilder } from '../builderStore.jsx';
import DateScreen from '../../components/screens/DateScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';

export default function StepDate() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'date').configuration_json;

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'date', payload });
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
            Кто выбирает дату?
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update({ mode: 'recipient_picks' })}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: config.mode === 'recipient_picks' ? tokens.berry : undefined,
                fontWeight: config.mode === 'recipient_picks' ? 500 : 400,
              }}
            >
              Пусть выберет сама
            </button>
            <button
              type="button"
              onClick={() => update({ mode: 'creator_sets' })}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{
                borderColor: config.mode === 'creator_sets' ? tokens.berry : undefined,
                fontWeight: config.mode === 'creator_sets' ? 500 : 400,
              }}
            >
              Указать самому
            </button>
          </div>
        </div>

        {config.mode === 'creator_sets' && (
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
              Дата
            </label>
            <input
              type="date"
              value={config.fixedDate || ''}
              onChange={(e) => update({ fixedDate: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
            Заголовок экрана
          </label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Когда встретимся? 🗓️"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide opacity-60">Живое превью</p>
        <div className="mx-auto max-w-[300px]">
          <DateScreen
            title={config.title}
            mode={config.mode}
            fixedDate={config.fixedDate}
            tokens={tokens}
            onContinue={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
