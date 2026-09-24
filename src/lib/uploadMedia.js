/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 */

import { supabase } from './supabaseClient.js';

const BUCKET = 'invitation-media';
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 МБ — совпадает с лимитом bucket'а
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function validateMediaFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Можно загрузить только JPG, PNG, WebP или GIF.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум 5 МБ.`;
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
