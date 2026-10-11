/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Библиотека гифок живёт в таблице media_library. Публичное чтение открыто
 * всем (RLS: active = true), запись — только is_admin (см. миграцию
 * gif_library_admin). Файлы, загруженные через админку, лежат в отдельном
 * публичном бакете gif-library (не путать с invitation-media, где путь
 * привязан к user_id).
 */

import { supabase } from './supabaseClient.js';

const BUCKET = 'gif-library';
export const MAX_GIF_SIZE = 20 * 1024 * 1024; // 20 МБ — совпадает с лимитом бакета (подняли ради видео-гифок)
// Telegram-"гифки" часто на деле короткое видео без звука (webm/mp4), а не
// настоящий gif/webp — поддерживаем оба вида.
const ALLOWED_TYPES = ['image/gif', 'image/webp', 'image/png', 'image/jpeg', 'video/webm', 'video/mp4'];
// Анимированные стикеры Telegram: gzip-нутый Lottie-JSON. У .tgs нет
// зарегистрированного MIME-типа — браузер отдаёт file.type пустым, поэтому
// такой файл узнаём по расширению, а в Storage кладём как gzip.
export const TGS_MIME = 'application/gzip';

export function isTgsFile(file) {
  return /\.tgs$/i.test(file?.name || '');
}

export function validateGifFile(file) {
  if (!isTgsFile(file) && !ALLOWED_TYPES.includes(file.type)) {
    return 'Можно загрузить GIF, WebP, PNG, JPG, WebM, MP4 или TGS.';
  }
  if (file.size > MAX_GIF_SIZE) {
    return `Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Максимум 20 МБ.`;
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
    .select('id, category, url, title, active, default_for_question, default_for_reaction, default_for_date, default_for_final')
    .eq('type', 'gif')
    .order('category');
  if (error) throw error;
  return data;
}

// Шаги конструктора, для которых можно назначить гифку по умолчанию —
// ключ здесь совпадает со step_type в DEFAULT_STEPS (builderStore.jsx),
// значение — имя колонки-флага в media_library.
export const DEFAULT_GIF_STEP_COLUMNS = {
  question: 'default_for_question',
  reaction: 'default_for_reaction',
  date: 'default_for_date',
  final: 'default_for_final',
};

/** Текущие дефолтные гифки по шагам — { question: url, reaction: url, date: url }.
 *  Используется конструктором при создании нового черновика и демо на главной. */
export async function listDefaultGifs() {
  const columns = Object.values(DEFAULT_GIF_STEP_COLUMNS).join(', ');
  const { data, error } = await supabase
    .from('media_library')
    .select(`url, ${columns}`)
    .eq('type', 'gif')
    .eq('active', true)
    .or(Object.values(DEFAULT_GIF_STEP_COLUMNS).map((c) => `${c}.eq.true`).join(','));
  if (error) throw error;
  const result = {};
  for (const row of data) {
    for (const [stepType, column] of Object.entries(DEFAULT_GIF_STEP_COLUMNS)) {
      if (row[column]) result[stepType] = row.url;
    }
  }
  return result;
}

/** Назначить/снять гифку как дефолтную для конкретного шага (вопрос/реакция/дата).
 *  Одновременно дефолтной для шага может быть только одна гифка — при назначении
 *  новой флаг у прежней гифки этого шага снимается автоматически. */
export async function setGifDefaultForStep(id, stepType, isDefault) {
  const column = DEFAULT_GIF_STEP_COLUMNS[stepType];
  if (!column) throw new Error(`Неизвестный шаг для дефолтной гифки: ${stepType}`);
  if (isDefault) {
    const { error: clearError } = await supabase.from('media_library').update({ [column]: false }).eq(column, true);
    if (clearError) throw clearError;
  }
  const { error } = await supabase.from('media_library').update({ [column]: isDefault }).eq('id', id);
  if (error) throw error;
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

  // У .tgs браузер оставляет file.type пустым, и бакет отвечает
  // "mime type application/octet-stream is not supported". Опция contentType
  // тут НЕ помогает: supabase-js для File/Blob шлёт multipart, и тип берётся
  // из самого блоба, а не из опций. Поэтому пересобираем файл с нужным типом.
  const body = isTgsFile(file) && file.type !== TGS_MIME
    ? new File([file], file.name, { type: TGS_MIME })
    : file;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, body, {
    cacheControl: '3600',
    upsert: false,
    contentType: body.type || undefined,
  });
  if (uploadError) throw uploadError;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return addGifByUrl({ url: pub.publicUrl, title, category });
}

/** Перенести гифку в другую категорию. Категория — обычная строка, поэтому
 *  новая появляется ровно в тот момент, когда в неё попадает первая гифка. */
export async function setGifCategory(id, category) {
  const clean = normalizeCategory(category);
  if (!clean) throw new Error('Название категории не может быть пустым.');
  const { error } = await supabase.from('media_library').update({ category: clean }).eq('id', id);
  if (error) throw error;
  return clean;
}

/** Приводим название категории к единому виду, чтобы «Милые», «милые » и
 *  «милые» не расползлись на три разные категории. */
export function normalizeCategory(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
}

export async function setGifActive(id, active) {
  const { error } = await supabase.from('media_library').update({ active }).eq('id', id);
  if (error) throw error;
}

export async function deleteGif(id) {
  const { error } = await supabase.from('media_library').delete().eq('id', id);
  if (error) throw error;
}
