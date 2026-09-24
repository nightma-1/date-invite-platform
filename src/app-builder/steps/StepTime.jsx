/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { useBuilder } from '../builderStore.jsx';
import TimeScreen from '../../components/screens/TimeScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';

export default function StepTime() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'time').configuration_json;
  const dateConfig = state.steps.find((s) => s.step_type === 'date').configuration_json;

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'time', payload });
  }

  // Время наследует режим у шага "Дата" — нет смысла спрашивать дважды,
  // если получатель уже сам выбирает дату, пусть тут же выберет и время
  const mode = dateConfig.mode || 'recipient_picks';

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-5">
        {mode === 'creator_sets' && (
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
              Время
            </label>
            <input
              type="time"
              value={config.fixedTime || ''}
              onChange={(e) => update({ fixedTime: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        )}
        {mode === 'recipient_picks' && (
          <p className="text-sm opacity-60">
            Режим наследуется от шага «Дата»: получатель выберет время сама.
          </p>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
            Заголовок экрана
          </label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Во сколько? 🕒"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide opacity-60">Живое превью</p>
        <div className="mx-auto max-w-[300px]">
          <TimeScreen
            title={config.title}
            mode={mode}
            fixedTime={config.fixedTime}
            tokens={tokens}
            onContinue={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
