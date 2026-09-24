/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { useBuilder } from '../builderStore.jsx';
import FinalScreen from '../../components/screens/FinalScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';

export default function StepFinal() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'final').configuration_json;

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'final', payload });
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
            Заголовок
          </label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Ну всё, теперь пути назад нет 😄❤️"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" style={{ color: tokens.ink }}>
            Описание
          </label>
          <textarea
            value={config.description || ''}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Наше свидание официально запланировано!"
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs opacity-60">
            Можно использовать {'{date}'}, {'{time}'} — подставятся автоматически из ответа получателя.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide opacity-60">Живое превью</p>
        <div className="mx-auto max-w-[300px]">
          <FinalScreen
            title={config.title}
            description={config.description}
            summary={['📅 Дата: 20 сентября', '🕒 Время: 19:00']}
            tokens={tokens}
            submitting={false}
            submitted={false}
            onSubmit={async () => {}}
          />
        </div>
      </div>
    </div>
  );
}
