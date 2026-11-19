/**
 * © 2026 Senti. Все права защищены.
 *
 * Последний шаг конструктора — «Оформление»: настроение (цвета) и форма
 * карточки. Раньше это стояло на первом экране, и человек ещё до того, как
 * написал имя, должен был принять два «дизайнерских» решения. У обоих есть
 * хорошие значения по умолчанию, поэтому теперь это необязательный финальный
 * штрих перед оплатой, а превью сразу показывает, как всё выглядит вместе.
 */

import { useTranslation } from 'react-i18next';
import { useBuilder } from '../builderStore.jsx';
import QuestionScreen from '../../components/screens/QuestionScreen.jsx';
import { getTemplateTokens, TEMPLATE_LIST } from '../../templates/registry.js';
import { T, SectionCard, CardShapePicker } from '../BuilderUI.jsx';

export default function StepStyle() {
  const { t } = useTranslation();
  const { state, dispatch } = useBuilder();
  const tokens = getTemplateTokens(state.templateId);
  const config = state.steps.find((s) => s.step_type === 'question').configuration_json;

  return (
    <div>
      <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, fontFamily: T.font, margin: '0 0 14px' }}>
        {t('steps.style.hint')}
      </p>

      <SectionCard number="1" title={t('landing.templatesTitle')}>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 2 }}>
          {TEMPLATE_LIST.map((tpl) => {
            const selected = state.templateId === tpl.id;
            return (
              <button
                key={tpl.id}
                type="button"
                aria-pressed={selected}
                onClick={() => dispatch({ type: 'SET_TEMPLATE', templateId: tpl.id })}
                style={{
                  flexShrink: 0, width: 88, border: 'none', background: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 0,
                }}
              >
                <div style={{
                  width: 76, height: 56, padding: 6, boxSizing: 'border-box',
                  border: selected ? `3px solid ${T.pink}` : '2px solid transparent',
                  borderRadius: 14, background: tpl.bg,
                  transform: selected ? 'scale(1.06)' : 'scale(1)',
                  boxShadow: selected ? `0 0 0 2px ${T.pink}55, 0 6px 16px ${T.pink}35` : 'none',
                  transition: 'transform 0.18s, box-shadow 0.18s, border-color 0.18s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ height: 4, width: 26, borderRadius: 2, background: tpl.berry }} />
                </div>
                <span style={{
                  fontFamily: T.font, fontSize: 11, textAlign: 'center', lineHeight: 1.2,
                  color: selected ? T.pink : T.muted, fontWeight: selected ? 700 : 500,
                }}>
                  {tpl.name}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard number="2" title={t('steps.question.cardShapeTitle')}>
        <CardShapePicker
          value={state.cardShape}
          onChange={(cardShape) => dispatch({ type: 'SET_CARD_SHAPE', cardShape })}
        />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.4, fontFamily: T.font }}>
          {t('steps.question.cardShapeHint')}
        </p>
      </SectionCard>

      {/* На узких экранах превью под настройками; на широких оно сбоку (BuilderShell) */}
      <div className="xl:hidden" style={{ marginTop: 8, padding: '12px 0' }}>
        <p style={{ fontSize: 12, color: T.muted, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.font }}>
          {t('builderUI.preview')}
        </p>
        <div style={{ maxWidth: 280, margin: '0 auto' }}>
          <QuestionScreen
            recipientName={config.recipientName || t('steps.question.previewDefaultRecipient')}
            questionText={config.questionText || t('steps.question.previewDefaultQuestion')}
            mediaUrl={config.mediaUrl}
            yesText={config.yesText || t('steps.question.previewDefaultYes')}
            noPhrases={config.noText ? [config.noText, ...t('questionScreen.noPhrases', { returnObjects: true }).slice(1)] : undefined}
            tokens={tokens}
            cardShape={state.cardShape}
            onYes={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
