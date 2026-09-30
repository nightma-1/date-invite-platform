/**
 * © 2026 Senti. Все права защищены.
 */

import { useTranslation } from 'react-i18next';
import { useBuilder } from '../builderStore.jsx';
import { T, SectionCard, FieldLabel, TxtArea, CharCount } from '../BuilderUI.jsx';

export default function StepFinal() {
  const { t } = useTranslation();
  const { state, dispatch } = useBuilder();
  const config = state.steps.find((s) => s.step_type === 'final').configuration_json;

  function update(payload) {
    dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'final', payload });
  }

  return (
    <div>
      <SectionCard number="1" title={t('steps.final.titleSection')}>
        <TxtArea
          value={config.title || ''}
          onChange={(e) => update({ title: e.target.value })}
          placeholder={t('steps.final.titlePlaceholder')}
          rows={2}
          maxLength={300}
        />
        <CharCount value={config.title} max={300} />
      </SectionCard>

      <SectionCard number="2" title={t('steps.final.descriptionSection')}>
        <TxtArea
          value={config.description || ''}
          onChange={(e) => update({ description: e.target.value })}
          placeholder={t('steps.final.descriptionPlaceholder')}
          rows={3}
          maxLength={300}
        />
        <CharCount value={config.description} max={300} />
        <p style={{ fontSize: 12, color: T.muted, marginTop: 6, lineHeight: 1.5, fontFamily: T.font }}>
          {t('steps.final.descriptionHint')}
        </p>
      </SectionCard>
    </div>
  );
}
