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
import { fallbackRecipientName } from './defaultContent.js';

function generateSlug() {
  return Math.random().toString(36).slice(2, 10);
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  // Старые браузеры: UUID v4 из Math.random — для id черновика достаточно
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Обрыв связи (а не отказ сервера): Safari — «Load failed», Chrome — «Failed to fetch» */
export function isNetworkError(err) {
  const msg = String(err?.message || err || '');
  return err instanceof TypeError || /load failed|failed to fetch|networkerror|network request failed|the internet connection|timed? ?out/i.test(msg);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Повторяем только сетевые сбои: 3 попытки с паузой 1 и 2.5 секунды */
export async function withRetry(fn, delays = [1000, 2500]) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isNetworkError(err) || attempt >= delays.length) throw err;
      await sleep(delays[attempt]);
    }
  }
}

/** supabase-js не бросает, а возвращает { error } — превращаем в исключение для withRetry */
async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

/**
 * Сохраняет черновик приглашения перед оплатой. Все записи идемпотентны
 * (id задаём сами, upsert вместо insert), поэтому при обрыве связи весь
 * блок просто повторяется — без дублей и без «висящих» половинок черновика.
 * reuse — черновик, созданный прошлой попыткой оплаты из этого же
 * конструктора: перезаписываем его, а не плодим новый.
 */
export async function publishDraft(state, userId, reuse = null) {
  let invitationId = null;
  let slug = null;
  if (reuse?.invitationId) {
    const { data: existing } = await supabase
      .from('invitations').select('id, slug, status').eq('id', reuse.invitationId).maybeSingle();
    if (existing && existing.status === 'draft') {
      invitationId = existing.id;
      slug = existing.slug;
    }
  }
  invitationId = invitationId || newId();
  slug = slug || generateSlug();
  const questionConfig = state.steps.find((s) => s.step_type === 'question').configuration_json;
  const reactionConfig = state.steps.find((s) => s.step_type === 'reaction').configuration_json;
  const dateConfig = state.steps.find((s) => s.step_type === 'date').configuration_json;
  const finalConfig = state.steps.find((s) => s.step_type === 'final').configuration_json;

  // Загружаем картинки ДО создания записей: если Storage откажет, не останется
  // приглашения-сироты без обещанного изображения.
  let mediaUrl = null;
  const pendingQuestionFile = getPendingMedia('question');
  if (pendingQuestionFile) {
    mediaUrl = await withRetry(() => uploadMedia(pendingQuestionFile, userId));
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
    reactionMediaUrl = await withRetry(() => uploadMedia(pendingReactionFile, userId));
  } else if (reactionConfig.mediaUrl && !reactionConfig.mediaUrl.startsWith('blob:')) {
    reactionMediaUrl = reactionConfig.mediaUrl;
  }

  // Те же правила для шагов "Дата" и "Финал" — раньше их свои файлы вообще
  // не отслеживались (pendingMedia.js не знал про ключи 'date'/'final'), из-за
  // чего blob:-ссылка молча утекала в БД и у получателя картинка не открывалась.
  let dateMediaUrl = null;
  const pendingDateFile = getPendingMedia('date');
  if (pendingDateFile) {
    dateMediaUrl = await withRetry(() => uploadMedia(pendingDateFile, userId));
  } else if (dateConfig.mediaUrl && !dateConfig.mediaUrl.startsWith('blob:')) {
    dateMediaUrl = dateConfig.mediaUrl;
  }

  let finalMediaUrl = null;
  const pendingFinalFile = getPendingMedia('final');
  if (pendingFinalFile) {
    finalMediaUrl = await withRetry(() => uploadMedia(pendingFinalFile, userId));
  } else if (finalConfig.mediaUrl && !finalConfig.mediaUrl.startsWith('blob:')) {
    finalMediaUrl = finalConfig.mediaUrl;
  }

  const invitationRow = {
    id: invitationId,
    user_id: userId,
    slug,
    mood: state.mood,
    template_key: state.templateId,
    card_shape: state.cardShape || 'classic',
    recipient_name: String(questionConfig.recipientName || '').replace(/\s+/g, ' ').trim() || fallbackRecipientName(state.lang),
    recipient_gender: state.recipientGender || null,
    sender_name: String(questionConfig.senderName || '').replace(/\s+/g, ' ').trim().slice(0, 40) || null,
    // Ответ получательницы — только если исходное приглашение проверено (builderStore)
    reply_to: state.replyToId || null,
    reply_kind: state.replyToId ? (state.replyKind || 'card') : null,
    status: 'draft',
  };
  const contentRow = {
    invitation_id: invitationId,
    question_text: { ru: { question: questionConfig.questionText, yes: questionConfig.yesText, no: questionConfig.noText } },
    reaction_text: { ru: { title: reactionConfig.title, text: reactionConfig.text } },
    final_screen: { ru: { title: finalConfig.title, description: finalConfig.description } },
    gif_url: mediaUrl,
  };
  const stepMediaOverrides = {
    reaction: reactionMediaUrl,
    date: dateMediaUrl,
    final: finalMediaUrl,
  };
  const stepRows = state.steps.map((step) => ({
    invitation_id: invitationId,
    step_type: step.step_type,
    step_order: step.step_order,
    enabled: step.enabled,
    configuration_json: step.step_type in stepMediaOverrides
      ? { ...step.configuration_json, mediaUrl: stepMediaOverrides[step.step_type] }
      : step.configuration_json,
  }));

  await withRetry(async () => {
    await must(supabase.from('invitations').upsert(invitationRow, { onConflict: 'id' }));
    await must(supabase.from('invitation_content').upsert(contentRow, { onConflict: 'invitation_id' }));
    // Шаги без естественного ключа — стираем то, что могло записаться
    // прошлой попыткой, и пишем одним запросом (раньше было 6 запросов подряд).
    await must(supabase.from('invitation_steps').delete().eq('invitation_id', invitationId));
    await must(supabase.from('invitation_steps').insert(stepRows));
  });

  // Приглашение остаётся в статусе 'draft' — публикует его вебхук Click
  // (/api/click/webhook.js, handleComplete) после реальной оплаты, тем же
  // UPDATE, который срабатывает на триггере trg_invitations_publish и
  // проставляет published_at/edit_until/expires_at. Здесь мы только
  // готовим черновик и уходим на оплату (см. BuilderShell.jsx: runPublish).
  clearPendingMedia();
  return { invitationId, slug };
}
