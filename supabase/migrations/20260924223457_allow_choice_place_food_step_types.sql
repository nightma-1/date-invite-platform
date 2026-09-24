-- Выбор раньше был одним шагом choice_block, теперь два: choice_place и
-- choice_food (см. StepChoicePlace.jsx / StepChoiceFood.jsx). Заодно
-- оставляем старые значения ('time', 'choice_block', 'yes_no') в списке —
-- они всё ещё встречаются в уже опубликованных приглашениях, и
-- InvitationRuntime по-прежнему умеет их рендерить как легаси.
alter table invitation_steps drop constraint invitation_steps_step_type_check;

alter table invitation_steps add constraint invitation_steps_step_type_check
  check (step_type in ('question', 'yes_no', 'reaction', 'date', 'time', 'choice_block', 'choice_place', 'choice_food', 'final'));
