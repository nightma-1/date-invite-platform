/**
 * © 2026 Senti. Все права защищены.
 *
 * «Как прошло свидание?» — тексты и кнопки бота (на языке приглашения,
 * uz — на «Siz», как в остальных сообщениях) и обработка ответов.
 * Рассылку запускает pg_cron → send_date_followups → api/telegram/notify.js
 * (событие date_followup), ответы приходят в api/telegram/webhook.js.
 *
 * callback_data (≤ 64 байт): df:<rating>:<invitation_id>, dc:<yes|no>:<invitation_id>
 */

const TEXTS = {
  ru: {
    ask: (name) => `Привет! Вчера у вас было свидание с <b>${name}</b> 💌\n\nКак всё прошло?`,
    great: '😍 Отлично', ok: '🙂 Нормально', bad: '😕 Не сложилось',
    consentAsk: 'Ура, очень рады за вас! ❤️\n\nМожно мы покажем ваше приглашение в соцсетях Senti? Без имён и только если вы <b>оба</b> не против.',
    consentYes: '✅ Да, мы оба не против', consentNo: 'Лучше не надо',
    reviewAsk: 'Спасибо! И последнее: напишите ответом на это сообщение пару слов о свидании — как она отреагировала на приглашение, что было дальше. Можно коротко.',
    thanksOk: 'Спасибо, что ответили 🙂 Если захотите повторить — senti.uz всегда рядом.',
    thanksBad: 'Жаль, что не сложилось. Спасибо, что рассказали — это помогает нам делать Senti лучше.',
    thanksReview: 'Спасибо! ❤️ Записали.',
  },
  uz: {
    ask: (name) => `Salom! Kecha <b>${name}</b> bilan uchrashuvingiz bo'ldi 💌\n\nHammasi qanday o'tdi?`,
    great: "😍 Zo'r", ok: '🙂 Yaxshi', bad: "😕 Bo'lmadi",
    consentAsk: "Juda xursandmiz! ❤️\n\nTaklifnomangizni Senti ijtimoiy tarmoqlarida ko'rsatsak bo'ladimi? Ismlarsiz va faqat <b>ikkalangiz</b> ham rozi bo'lsangiz.",
    consentYes: '✅ Ha, ikkalamiz ham rozimiz', consentNo: 'Kerak emas',
    reviewAsk: "Rahmat! Oxirgisi: shu xabarga javob qilib uchrashuv haqida bir-ikki so'z yozing — u taklifnomaga qanday munosabat bildirdi, keyin nima bo'ldi. Qisqa bo'lsa ham bo'ladi.",
    thanksOk: "Javob berganingiz uchun rahmat 🙂 Yana takrorlamoqchi bo'lsangiz — senti.uz doim yoningizda.",
    thanksBad: "Afsuski, bo'lmadi. Aytganingiz uchun rahmat — bu Sentini yaxshilashga yordam beradi.",
    thanksReview: 'Rahmat! ❤️ Yozib oldik.',
  },
  en: {
    ask: (name) => `Hi! Yesterday you had a date with <b>${name}</b> 💌\n\nHow did it go?`,
    great: '😍 Great', ok: '🙂 Fine', bad: "😕 Didn't work out",
    consentAsk: "Yay, we're so happy for you! ❤️\n\nMay we show your invitation on Senti's social media? No names, and only if you <b>both</b> agree.",
    consentYes: "✅ Yes, we're both fine with it", consentNo: "I'd rather not",
    reviewAsk: 'Thank you! One last thing: reply to this message with a few words about the date — how they reacted to the invitation, what happened next. Short is fine.',
    thanksOk: 'Thanks for letting us know 🙂 Whenever you want to do it again — senti.uz is here.',
    thanksBad: "Sorry it didn't work out. Thanks for telling us — it helps us make Senti better.",
    thanksReview: 'Thank you! ❤️ Saved.',
  },
};

export function feedbackTexts(lang) {
  return TEXTS[lang] || TEXTS.ru;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFeedbackCallback(data) {
  const m = /^(df|dc):([a-z]+):(.+)$/.exec(String(data || ''));
  if (!m || !UUID.test(m[3])) return null;
  if (m[1] === 'df' && ['great', 'ok', 'bad'].includes(m[2])) return { kind: 'rating', value: m[2], invitationId: m[3] };
  if (m[1] === 'dc' && ['yes', 'no'].includes(m[2])) return { kind: 'consent', value: m[2], invitationId: m[3] };
  return null;
}

export function ratingKeyboard(lang, invitationId) {
  const t = feedbackTexts(lang);
  return {
    inline_keyboard: [
      [{ text: t.great, callback_data: `df:great:${invitationId}` }],
      [{ text: t.ok, callback_data: `df:ok:${invitationId}` }, { text: t.bad, callback_data: `df:bad:${invitationId}` }],
    ],
  };
}

export function consentKeyboard(lang, invitationId) {
  const t = feedbackTexts(lang);
  return {
    inline_keyboard: [
      [{ text: t.consentYes, callback_data: `dc:yes:${invitationId}` }],
      [{ text: t.consentNo, callback_data: `dc:no:${invitationId}` }],
    ],
  };
}

const RATING_LABEL = { great: '😍 отлично', ok: '🙂 нормально', bad: '😕 не сложилось' };
const CONSENT_LABEL = { yes: '✅ можно показывать (оба согласны)', no: '🚫 не показывать' };

/** Копия для админов: что ответил автор */
export function adminCopy(row, invitation) {
  const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const lines = ['💬 <b>Отзыв после свидания</b>', `Приглашение для <b>${esc(invitation?.recipient_name || '—')}</b>${invitation?.slug ? ` · /i/${esc(invitation.slug)}` : ''}`];
  if (row.rating) lines.push(`Оценка: ${RATING_LABEL[row.rating]}`);
  if (row.consent) lines.push(`Согласие: ${CONSENT_LABEL[row.consent]}`);
  if (row.review) lines.push('', `<i>${esc(row.review)}</i>`);
  return lines.join('\n');
}
