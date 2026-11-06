/**
 * © 2026 Senti. Все права защищены.
 *
 * Проверка настроек бота поддержки ПЕРЕД деплоем. Запускать локально:
 *
 *   SUPPORT_BOT_TOKEN=... SUPPORT_CHAT_ID=... node scripts/check-support-bot.mjs
 *
 * Скрипт отвечает на три вопроса, на которых обычно и спотыкается настройка:
 *   1. живой ли токен (getMe) и совпадает ли username с src/lib/support.js;
 *   2. правильный ли SUPPORT_CHAT_ID — и если нет, подсказывает верный
 *      вариант (у групп id отрицательный, у супергрупп с префиксом -100);
 *   3. добавлен ли бот в эту группу и может ли в неё писать (sendMessage).
 *
 * Ничего не меняет: только читает и отправляет одно тестовое сообщение.
 */

const token = process.env.SUPPORT_BOT_TOKEN;
const rawChatId = process.env.SUPPORT_CHAT_ID;

if (!token) {
  console.error('✗ SUPPORT_BOT_TOKEN не задан');
  process.exit(1);
}

const api = (method, params) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  }).then((r) => r.json());

// --------------------------------------------------------------- 1. токен
const me = await api('getMe');
if (!me.ok) {
  console.error(`✗ Токен не работает: ${me.description}`);
  console.error('  Возьмите новый в @BotFather → /token');
  process.exit(1);
}
console.log(`✓ Бот живой: @${me.result.username} (${me.result.first_name})`);

const { SUPPORT_BOT_USERNAME } = await import('../src/lib/support.js');
if (SUPPORT_BOT_USERNAME !== me.result.username) {
  console.warn(
    `⚠ В src/lib/support.js указан @${SUPPORT_BOT_USERNAME}, а токен от @${me.result.username}.\n` +
    '  Ссылки «написать напрямую» будут вести не туда.'
  );
}

if (!rawChatId) {
  console.error('\n✗ SUPPORT_CHAT_ID не задан.');
  console.error('  Напишите что-нибудь в рабочую группу и откройте:');
  console.error(`  https://api.telegram.org/bot<ТОКЕН>/getUpdates — id будет в message.chat.id`);
  process.exit(1);
}

// ------------------------------------------------------------- 2. chat_id
// Частая ошибка: id скопирован без минуса. Перебираем правдоподобные формы
// и говорим, какая из них настоящая.
const digits = String(rawChatId).replace(/^-?(100)?/, '');
const candidates = [...new Set([String(rawChatId), `-${digits}`, `-100${digits}`])];

let chat = null;
let workingId = null;
for (const candidate of candidates) {
  const res = await api('getChat', { chat_id: candidate });
  if (res.ok) {
    chat = res.result;
    workingId = candidate;
    break;
  }
}

if (!chat) {
  console.error(`\n✗ Ни один из вариантов id не подошёл: ${candidates.join(', ')}`);
  console.error('  Либо бот не добавлен в группу, либо id другой.');
  console.error('  Добавьте бота в группу, напишите там сообщение и посмотрите getUpdates.');
  process.exit(1);
}

console.log(`✓ Группа найдена: «${chat.title || chat.id}» (${chat.type})`);
if (workingId !== String(rawChatId)) {
  console.warn(`\n⚠ SUPPORT_CHAT_ID нужно исправить: ${rawChatId} → ${workingId}`);
}
if (chat.type === 'group') {
  console.warn(
    '⚠ Это обычная группа. Если её когда-нибудь повысят до супергруппы\n' +
    '  (включат историю для новых участников, добавят больше людей и т.п.),\n' +
    '  chat_id сменится и обращения перестанут приходить — тогда обновите\n' +
    '  SUPPORT_CHAT_ID. Чтобы не ловить это внезапно, можно сразу сделать\n' +
    '  супергруппу.'
  );
}

// ---------------------------------------------------------- 3. право писать
const sent = await api('sendMessage', {
  chat_id: workingId,
  text: '🔧 Проверка связи: бот поддержки настроен и может писать в эту группу.',
});
if (!sent.ok) {
  console.error(`\n✗ Бот не может писать в группу: ${sent.description}`);
  process.exit(1);
}
console.log('✓ Тестовое сообщение отправлено в группу');
console.log('\nВсё готово. Впишите эти значения в Vercel → Settings → Environment Variables:');
console.log(`  SUPPORT_CHAT_ID = ${workingId}`);
console.log('  SUPPORT_BOT_TOKEN = (токен из @BotFather)');
