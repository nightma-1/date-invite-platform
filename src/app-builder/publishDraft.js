/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
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
  const finalConfig = state.steps.find((s) => s.step_type === 'final').configuration_json;

  // Загружаем картинку ДО создания записей: если Storage откажет, не останется
  // приглашения-сироты без обещанного изображения.
  let mediaUrl = null;
  const pendingFile = getPendingMedia();
  if (pendingFile) {
    mediaUrl = await uploadMedia(pendingFile, userId);
  } else if (questionConfig.mediaUrl && !questionConfig.mediaUrl.startsWith('blob:')) {
    mediaUrl = questionConfig.mediaUrl;
  }

  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .insert({
      user_id: userId,
      slug,
      mood: state.mood,
      template_key: state.templateId,
      recipient_name: questionConfig.recipientName || 'Тебя',
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

  for (const step of state.steps) {
    const { error: stepError } = await supabase.from('invitation_steps').insert({
      invitation_id: invitation.id,
      step_type: step.step_type,
      step_order: step.step_order,
      enabled: step.enabled,
      configuration_json: step.configuration_json,
    });
    if (stepError) throw stepError;
  }

  clearPendingMedia();
  return { invitationId: invitation.id, slug };
}
