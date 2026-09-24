/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 */

import { useBuilder } from '../builderStore.jsx';
import ReactionScreen from '../../components/screens/ReactionScreen.jsx';
import { getTemplateTokens } from '../../templates/registry.js';

export default function StepReaction() {
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'reaction').configuration_json;
  const questionConfig = state.steps.find((s) => s.step_type === 'question').configuration_json;

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'reaction', payload });
  }

  const inp = {
    display: 'block', width: '100%',
    padding: '11px 14px', borderRadius: 6,
    border: `1.5px solid ${tokens.ink}20`,
    fontFamily: tokens.fontUI, fontSize: 14, color: tokens.ink,
    background: tokens.card, boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }} className="md:grid-cols-2">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: tokens.inkMuted || tokens.ink, opacity: 0.7, lineHeight: 1.5 }}>
          Этот экран получатель увидит сразу после того, как нажмёт «{questionConfig.yesText || 'Да'}».
        </p>

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: tokens.ink }}>
            Заголовок
          </label>
          <input
            type="text"
            value={config.title || ''}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Ого… ты сказала ДА?! 😱"
            style={inp}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: tokens.ink }}>
            Текст
          </label>
          <textarea
            value={config.text || ''}
            onChange={(e) => update({ text: e.target.value })}
            placeholder="Я безумно рад! Теперь у меня есть повод подготовиться к нашему свиданию ❤️"
            rows={4}
            style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }}
          />
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: tokens.inkMuted || tokens.ink, opacity: 0.6, marginBottom: 10 }}>
          Живое превью
        </p>
        <div style={{ maxWidth: 300, margin: '0 auto' }}>
          <ReactionScreen
            title={config.title}
            text={config.text}
            mediaUrl={questionConfig.mediaUrl}
            tokens={tokens}
            onContinue={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
