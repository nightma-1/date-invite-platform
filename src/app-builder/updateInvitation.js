/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Сохранение изменений в УЖЕ опубликованном приглашении (см. «Изменить»
 * в /dashboard). Ссылка/slug остаются теми же — получателю не нужно
 * ничего пересылать заново.
 */

import { supabase } from '../lib/supabaseClient.js';
import { uploadMedia } from '../lib/uploadMedia.js';
import { getPendingMedia, clearPendingMedia } from './pendingMedia.js';

export async function updateInvitationDraft(state, userId, invitationId) {
  const questionConfig = state.steps.find((s) => s.step_type === 'question').configuration_json;
  const reactionConfig = state.steps.find((s) => s.step_type === 'reaction').configuration_json;
  const finalConfig = state.steps.find((s) => s.step_type === 'final').configuration_json;

  let mediaUrl = null;
  const pendingFile = getPendingMedia();
  if (pendingFile) {
    mediaUrl = await uploadMedia(pendingFile, userId);
  } else if (questionConfig.mediaUrl && !questionConfig.mediaUrl.startsWith('blob:')) {
    mediaUrl = questionConfig.mediaUrl;
  }

  const { error: invError } = await supabase
    .from('invitations')
    .update({
      recipient_name: questionConfig.recipientName || 'Тебя',
      recipient_gender: state.recipientGender || null,
      mood: state.mood,
      template_key: state.templateId,
    })
    .eq('id', invitationId)
    .eq('user_id', userId);
  if (invError) throw invError;

  const { error: contentError } = await supabase
    .from('invitation_content')
    .update({
      question_text: { ru: { question: questionConfig.questionText, yes: questionConfig.yesText, no: questionConfig.noText } },
      reaction_text: { ru: { title: reactionConfig.title, text: reactionConfig.text } },
      final_screen: { ru: { title: finalConfig.title, description: finalConfig.description } },
      gif_url: mediaUrl,
    })
    .eq('invitation_id', invitationId);
  if (contentError) throw contentError;

  // Шагов немного — проще пересоздать все, чем аккуратно диффать update/insert/delete.
  // Заодно чистит устаревшие строки вроде отдельного шага 'time', которого больше нет в state.steps.
  const { error: deleteError } = await supabase.from('invitation_steps').delete().eq('invitation_id', invitationId);
  if (deleteError) throw deleteError;

  for (const step of state.steps) {
    const { error: stepError } = await supabase.from('invitation_steps').insert({
      invitation_id: invitationId,
      step_type: step.step_type,
      step_order: step.step_order,
      enabled: step.enabled,
      configuration_json: step.configuration_json,
    });
    if (stepError) throw stepError;
  }

  clearPendingMedia();
  return { invitationId, slug: state.slug };
}
