/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Собирает из черновика конструктора объект ровно той формы, в которой
 * приглашение приходит из базы в InvitationRuntime. Благодаря этому превью
 * показывает настоящий рантайм, а не его копию: что увидит автор, то и
 * получит получатель.
 *
 * Раскладка полей должна совпадать с publishDraft.js — если там меняется
 * структура question_text/reaction_text/final_screen, менять и здесь.
 *
 * Отличие одно: blob:-ссылки на только что выбранные файлы оставляем как есть.
 * В базу их писать нельзя (у получателя не откроются), а в превью они как раз
 * нужны — картинка видна до загрузки в Storage.
 */

export function buildPreviewInvitation(state) {
  const configOf = (type) => state.steps.find((s) => s.step_type === type)?.configuration_json || {};
  const question = configOf('question');
  const reaction = configOf('reaction');
  const final = configOf('final');

  const invitation = {
    id: 'preview',
    slug: 'preview',
    mood: state.mood,
    template_key: state.templateId,
    card_shape: state.cardShape || 'classic',
    recipient_name: question.recipientName || 'Тебя',
    recipient_gender: state.recipientGender || null,
    status: 'preview',
  };

  const content = {
    question_text: { ru: { question: question.questionText, yes: question.yesText, no: question.noText } },
    reaction_text: { ru: { title: reaction.title, text: reaction.text } },
    final_screen: { ru: { title: final.title, description: final.description } },
    gif_url: question.mediaUrl || null,
  };

  // Рантайм сам отфильтрует выключенные шаги и отсортирует по step_order.
  const steps = state.steps.map((step) => ({ ...step }));

  return { invitation, content, steps };
}
