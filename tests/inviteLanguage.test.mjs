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

test('ответное приглашение: свой вопрос и при смене языка остаётся ответным', async () => {
  const { applyReplyTexts } = await import('../src/app-builder/defaultContent.js');
  const steps = applyReplyTexts(stepsOf(buildDefaultConfigs('ru')), 'ru');
  const q = steps.find((s) => s.step_type === 'question').configuration_json;
  assert.equal(q.questionText, 'Теперь моя очередь. Пойдёшь со мной на свидание?');
  assert.equal(q.yesText, 'Да, конечно ❤️');
  const uz = localizeSteps(steps, 'uz', null);
  assert.equal(uz.find((s) => s.step_type === 'question').configuration_json.questionText, 'Endi navbat menda. Men bilan uchrashuvga borasanmi?');
  assert.equal(uz.find((s) => s.step_type === 'final').configuration_json.title, 'Bu safar men taklif qildim 😄❤️');
});
