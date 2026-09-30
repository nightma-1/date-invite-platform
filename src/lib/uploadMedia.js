/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import { supabase } from './supabaseClient.js';

const BUCKET = 'invitation-media';
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 МБ — совпадает с лимитом bucket'а (подняли ради видео-гифок)
// Telegram-стикеры и "гифки" на деле часто не gif/webp, а короткое видео без
// звука (webm/mp4) — Telegram именно так их и хранит. Поддерживаем оба вида.
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/webm', 'video/mp4'];

export function validateMediaFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Можно загрузить JPG, PNG, WebP, GIF, WebM или MP4.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум 15 МБ.`;
  }
  return null;
}

/**
 * Загружает файл и возвращает публичный URL.
 * Путь всегда начинается с {user_id}/ — этого требует RLS-политика bucket'а.
 */
export async function uploadMedia(file, userId) {
  const error = validateMediaFile(file);
  if (error) throw new Error(error);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
