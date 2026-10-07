/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * ВАЖНО про архитектуру: choice_blocks/choice_options — нормализованные таблицы
 * в схеме БД, но рантайм получателя читает варианты выбора прямо из
 * invitation_steps.configuration_json.options. Поэтому сюда мы их не дублируем.
 */

import { supabase } from '../lib/supabaseClient.js';
import { uploadMedia } from '../lib/uploadMedia.js';
import { getPendingMedia, clearPendingMedia } from './pendingMedia.js';

function generateSlug() {
  return Math.random().toString(36).slice(2, 10);
}

export async function publishDraft(state, userId) {
  const slug = generateSlug();
  const questionConfig = state.steps.find((s) => s.step_type === 'question').configuration_json;
  const reactionConfig = state.steps.find((s) => s.step_type === 'reaction').configuration_json;
  const dateConfig = state.steps.find((s) => s.step_type === 'date').configuration_json;
  const finalConfig = state.steps.find((s) => s.step_type === 'final').configuration_json;

  // Загружаем картинки ДО создания записей: если Storage откажет, не останется
  // приглашения-сироты без обещанного изображения.
  let mediaUrl = null;
  const pendingQuestionFile = getPendingMedia('question');
  if (pendingQuestionFile) {
    mediaUrl = await uploadMedia(pendingQuestionFile, userId);
  } else if (questionConfig.mediaUrl && !questionConfig.mediaUrl.startsWith('blob:')) {
    mediaUrl = questionConfig.mediaUrl;
  }

  // У экрана "Ого, ты сказал да?" своя (не обязательная) картинка, независимая
  // от картинки вопроса — если не выбрана, экран просто покажет сердечко по
  // умолчанию (ReactionScreen.jsx). blob:-URL никогда не сохраняем в БД —
  // только реальную ссылку после аплоада, иначе у получателя она не откроется.
  let reactionMediaUrl = null;
  const pendingReactionFile = getPendingMedia('reaction');
  if (pendingReactionFile) {
    reactionMediaUrl = await uploadMedia(pendingReactionFile, userId);
  } else if (reactionConfig.mediaUrl && !reactionConfig.mediaUrl.startsWith('blob:')) {
    reactionMediaUrl = reactionConfig.mediaUrl;
  }

  // Те же правила для шагов "Дата" и "Финал" — раньше их свои файлы вообще
  // не отслеживались (pendingMedia.js не знал про ключи 'date'/'final'), из-за
  // чего blob:-ссылка молча утекала в БД и у получателя картинка не открывалась.
  let dateMediaUrl = null;
  const pendingDateFile = getPendingMedia('date');
  if (pendingDateFile) {
    dateMediaUrl = await uploadMedia(pendingDateFile, userId);
  } else if (dateConfig.mediaUrl && !dateConfig.mediaUrl.startsWith('blob:')) {
    dateMediaUrl = dateConfig.mediaUrl;
  }

  let finalMediaUrl = null;
  const pendingFinalFile = getPendingMedia('final');
  if (pendingFinalFile) {
    finalMediaUrl = await uploadMedia(pendingFinalFile, userId);
  } else if (finalConfig.mediaUrl && !finalConfig.mediaUrl.startsWith('blob:')) {
    finalMediaUrl = finalConfig.mediaUrl;
  }

  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .insert({
      user_id: userId,
      slug,
      mood: state.mood,
      template_key: state.templateId,
      card_shape: state.cardShape || 'classic',
      recipient_name: questionConfig.recipientName || 'Тебя',
      recipient_gender: state.recipientGender || null,
      status: 'draft',
    })
    .select()
    .single();
  if (invError) throw invError;

  const { error: contentError } = await supabase.from('invitation_content').insert({
    invitation_id: invitation.id,
    question_text: { ru: { question: questionConfig.questionText, yes: questionConfig.yesText, no: questionConfig.noText } },
    reaction_text: { ru: { title: reactionConfig.title, text: reactionConfig.text } },
    final_screen: { ru: { title: finalConfig.title, description: finalConfig.description } },
    gif_url: mediaUrl,
  });
  if (contentError) throw contentError;

  const stepMediaOverrides = {
    reaction: reactionMediaUrl,
    date: dateMediaUrl,
    final: finalMediaUrl,
  };
  for (const step of state.steps) {
    const configuration_json = step.step_type in stepMediaOverrides
      ? { ...step.configuration_json, mediaUrl: stepMediaOverrides[step.step_type] }
      : step.configuration_json;
    const { error: stepError } = await supabase.from('invitation_steps').insert({
      invitation_id: invitation.id,
      step_type: step.step_type,
      step_order: step.step_order,
      enabled: step.enabled,
      configuration_json,
    });
    if (stepError) throw stepError;
  }

  // Приглашение остаётся в статусе 'draft' — публикует его вебхук Click
  // (/api/click/webhook.js, handleComplete) после реальной оплаты, тем же
  // UPDATE, который срабатывает на триггере trg_invitations_publish и
  // проставляет published_at/edit_until/expires_at. Здесь мы только
  // готовим черновик и уходим на оплату (см. BuilderShell.jsx: runPublish).
  clearPendingMedia();
  return { invitationId: invitation.id, slug };
}
