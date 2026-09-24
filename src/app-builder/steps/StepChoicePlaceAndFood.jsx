/**
 * © 2026 Senti. Все права защищены.
 *
 * Раньше "куда пойти" и "что поесть" были двумя отдельными шагами в
 * конструкторе — теперь получатель видит их на одной странице
 * (DoubleChoiceScreen.jsx), и редактируются они тут тоже вместе, чтобы
 * конструктор совпадал с тем, что видит получатель.
 */

import { T } from '../BuilderUI.jsx';
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
  return (
    <div>
      <GroupLabel icon="📍" text="Куда пойти" />
      <ChoiceStepFields stepType="choice_place" />

      <div style={{ height: 1, background: T.pinkBorder, margin: '28px 0' }} />

      <GroupLabel icon="🍽️" text="Что поесть" />
      <ChoiceStepFields stepType="choice_food" />
    </div>
  );
}
