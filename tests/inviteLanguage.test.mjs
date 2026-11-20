import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDefaultConfigs, localizeSteps, invitationLang } from '../src/app-builder/defaultContent.js';

const stepsOf = (cfgs) => Object.entries(cfgs).map(([step_type, configuration_json], i) => ({ step_type, step_order: i, enabled: true, configuration_json }));

test('новый черновик сразу на выбранном языке', () => {
  const c = buildDefaultConfigs('uz');
  assert.equal(c.question.yesText, 'Ha, albatta ❤️');
  assert.equal(c.choice_place.options[0].label, 'Kino');
  assert.equal(c.question.lang, 'uz');
});

test('смена языка переводит не тронутые поля и сохраняет свой текст автора', () => {
  const steps = stepsOf(buildDefaultConfigs('ru'));
  steps[0].configuration_json = { ...steps[0].configuration_json, questionText: 'Мой вопрос' };
  const uz = localizeSteps(steps, 'uz', 'female');
  const q = uz.find((s) => s.step_type === 'question').configuration_json;
  assert.equal(q.questionText, 'Мой вопрос');
  assert.equal(q.yesText, 'Ha, albatta ❤️');
  assert.equal(q.noText, "Yo'q");
  assert.equal(uz.find((s) => s.step_type === 'choice_food').configuration_json.options[0].label, 'Pitsa');
  assert.equal(invitationLang(uz), 'uz');
  // и обратно на русский — уже с правильным родом
  const ru = localizeSteps(uz, 'ru', 'female');
  assert.equal(ru.find((s) => s.step_type === 'date').configuration_json.title, 'И так... Когда ты свободна?');
  assert.equal(ru.find((s) => s.step_type === 'reaction').configuration_json.text, 'Я был готов что скажешь «нет» ахах');
});

test('ответ получательницы: открытка без даты, «спасибо» со всеми шагами, язык переводится', async () => {
  const { applyReplyTexts } = await import('../src/app-builder/defaultContent.js');
  const card = applyReplyTexts(stepsOf(buildDefaultConfigs('ru')), 'ru', 'card');
  assert.equal(card.find((s) => s.step_type === 'question').configuration_json.questionText, 'Я согласна 😊 А ты рад, что я сказала «да»?');
  assert.equal(card.find((s) => s.step_type === 'date').enabled, false);
  assert.equal(card.find((s) => s.step_type === 'choice_place').enabled, false);
  const uz = localizeSteps(card, 'uz', null);
  assert.equal(uz.find((s) => s.step_type === 'reaction').configuration_json.confirmText, "Ko'rishguncha ❤️");
  assert.equal(uz.find((s) => s.step_type === 'question').configuration_json.noText, "Yo'q");
  const thanks = applyReplyTexts(stepsOf(buildDefaultConfigs('en')), 'en', 'thanks');
  assert.equal(thanks.find((s) => s.step_type === 'date').enabled, true);
  assert.equal(localizeSteps(thanks, 'ru', null).find((s) => s.step_type === 'final').configuration_json.title, 'Значит, до следующей встречи 😄❤️');
});
