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

  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .insert({
      user_id: userId,
      slug,
      mood: state.mood,
      template_key: state.templateId,
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

  for (const step of state.steps) {
    const configuration_json = step.step_type === 'reaction'
      ? { ...step.configuration_json, mediaUrl: reactionMediaUrl }
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

  // ВРЕМЕННО: мерчант-аккаунт Click ещё не подключён (нет CLICK_SERVICE_ID/
  // CLICK_MERCHANT_ID/CLICK_SECRET_KEY в Vercel), поэтому обычная оплата
  // физически не может пройти. Пока публикуем сразу бесплатно — отдельным
  // UPDATE, а не insert со status:'published', чтобы сработал триггер
  // trg_invitations_publish (он висит на BEFORE UPDATE) и проставил
  // published_at/edit_until/expires_at так же, как это делает /api/click/webhook.js
  // после настоящей оплаты.
  //
  // Когда подключишь Click — удали этот блок, и приглашения снова будут
  // публиковаться только через оплату (см. BuilderShell.jsx: runPublish).
  const { error: publishError } = await supabase
    .from('invitations')
    .update({ status: 'published' })
    .eq('id', invitation.id);
  if (publishError) throw publishError;

  clearPendingMedia();
  return { invitationId: invitation.id, slug };
}
