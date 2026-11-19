/**
 * © 2026 Senti. Все права защищены.
 *
 * Раньше "куда пойти" и "что поесть" были двумя отдельными шагами в
 * конструкторе — теперь получатель видит их на одной странице
 * (DoubleChoiceScreen.jsx), и редактируются они тут тоже вместе, чтобы
 * конструктор совпадал с тем, что видит получатель.
 */

import { useTranslation } from 'react-i18next';
import { T, ButtonTextEditor } from '../BuilderUI.jsx';
import { useBuilder } from '../builderStore.jsx';
import ChoiceStepFields from './ChoiceStepFields.jsx';

function GroupLabel({ icon, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 12px' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontFamily: T.font, fontWeight: 700, fontSize: 15, color: T.darkPurple }}>{text}</span>
    </div>
  );
}

export default function StepChoicePlaceAndFood() {
  const { t } = useTranslation();
  const { state, dispatch } = useBuilder();
  // Кнопка одна на весь экран «место + еда» — храним её в шаге choice_place
  const place = state.steps.find((s) => s.step_type === 'choice_place')?.configuration_json || {};
  return (
    <div>
      <GroupLabel icon="📍" text={t('steps.choicePlaceFood.whereGroup')} />
      <ChoiceStepFields stepType="choice_place" />

      <div style={{ height: 1, background: T.pinkBorder, margin: '28px 0' }} />

      <GroupLabel icon="🍽️" text={t('steps.choicePlaceFood.foodGroup')} />
      <ChoiceStepFields stepType="choice_food" />

      <div style={{ height: 1, background: T.pinkBorder, margin: '24px 0 4px' }} />
      <ButtonTextEditor
        fields={[{
          label: t('builderUI.buttonLabel'), value: place.buttonText, fallback: t('screens.choiceContinue'),
          onChange: (v) => dispatch({ type: 'UPDATE_STEP_CONFIG', stepType: 'choice_place', payload: { buttonText: v } }),
        }]}
      />
    </div>
  );
}
