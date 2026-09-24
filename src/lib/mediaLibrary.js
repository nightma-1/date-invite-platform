/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 *
 * Библиотека гифок живёт в таблице media_library. Публичное чтение открыто
 * всем (RLS: active = true), запись — только is_admin (см. миграцию
 * gif_library_admin). Файлы, загруженные через админку, лежат в отдельном
 * публичном бакете gif-library (не путать с invitation-media, где путь
 * привязан к user_id).
 */

import { supabase } from './supabaseClient.js';

const BUCKET = 'gif-library';
export const MAX_GIF_SIZE = 8 * 1024 * 1024; // 8 МБ — совпадает с лимитом бакета
const ALLOWED_TYPES = ['image/gif', 'image/webp', 'image/png', 'image/jpeg'];

export function validateGifFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Можно загрузить только GIF, WebP, PNG или JPG.';
  }
  if (file.size > MAX_GIF_SIZE) {
    return `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум 8 МБ.`;
  }
  return null;
}

/** Публичный список активных гифок — для конструктора. */
export async function listActiveGifs() {
  const { data, error } = await supabase
    .from('media_library')
    .select('id, category, url, title')
    .eq('type', 'gif')
    .eq('active', true)
    .order('category');
  if (error) throw error;
  return data;
}

/** Полный список гифок (включая выключенные) — только для админки. */
export async function listAllGifs() {
  const { data, error } = await supabase
    .from('media_library')
    .select('id, category, url, title, active')
    .eq('type', 'gif')
    .order('category');
  if (error) throw error;
  return data;
}

/** Добавить гифку по прямой ссылке (например, из Giphy). */
export async function addGifByUrl({ url, title, category }) {
  const { data, error } = await supabase
    .from('media_library')
    .insert({ type: 'gif', url, title: title || null, category: category || 'custom', active: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Загрузить свой файл в библиотеку (доступно только админу — проверяет RLS). */
export async function addGifByFile({ file, title, category }) {
  const error = validateGifFile(file);
  if (error) throw new Error(error);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'gif';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return addGifByUrl({ url: pub.publicUrl, title, category });
}

export async function setGifActive(id, active) {
  const { error } = await supabase.from('media_library').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteGif(id) {
  const { error } = await supabase.from('media_library').delete().eq('id', id);
  if (error) throw error;
}
