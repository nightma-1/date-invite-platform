/**
 * © 2026 Senti. Все права защищены.
 *
 * Подготовка файлов в браузере, черновик на устройстве и загрузка.
 * Каждое фото ужимается в две копии: 1600 px для просмотра вблизи и 320 px,
 * чтобы залы заполнялись сразу даже на медленном интернете.
 */

import { supabase } from '../lib/supabaseClient.js';
import { MUSEUM_LIMITS } from '../lib/museumPlans.js';

const BUCKET = 'museum-media';
const DRAFT_DAYS = 7;

function scaled(img, max, quality) {
  const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * ratio);
  canvas.height = Math.round(img.naturalHeight * ratio);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality);
  });
}

export async function preparePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const [fullBlob, thumbBlob] = await Promise.all([scaled(img, 1600, 0.84), scaled(img, 320, 0.72)]);
    return { id: crypto.randomUUID(), fullBlob, thumbBlob, w: img.naturalWidth, h: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Возвращает код ошибки или null. Длину читает сам браузер из файла. */
export async function checkVideo(file) {
  if (file.size > MUSEUM_LIMITS.maxVideoBytes) return 'filmTooBig';
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise((resolve, reject) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve(v.duration);
      v.onerror = reject;
      v.src = url;
    });
    return duration > MUSEUM_LIMITS.maxVideoSeconds + 0.5 ? 'filmTooLong' : null;
  } catch {
    return 'filmBad';
  } finally {
    URL.revokeObjectURL(url);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('senti-museum', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode);
      const req = fn(tx.objectStore('drafts'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Черновик — удобство, а не обязательное условие: в приватном окне хранилища
// может не быть, тогда конструктор просто работает без него.
export async function saveDraft(draft) {
  try {
    await withStore('readwrite', (s) => s.put({ ...draft, savedAt: Date.now() }, 'current'));
  } catch { /* см. выше */ }
}

export async function loadDraft() {
  try {
    const draft = await withStore('readonly', (s) => s.get('current'));
    if (!draft || Date.now() - draft.savedAt > DRAFT_DAYS * 86400000) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    await withStore('readwrite', (s) => s.delete('current'));
  } catch { /* см. выше */ }
}

async function put(userId, folder, name, blob, contentType) {
  const path = `${userId}/${folder}/${name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Загружает всё, чего ещё нет на сервере. Повторный запуск докачает только новое. */
export async function uploadMedia({ userId, folder, photos, video, voice, song, onProgress }) {
  const pending = photos.filter((p) => !p.full);
  const total = pending.length + [video, voice, song].filter((m) => m?.blob).length;
  let done = 0;
  onProgress?.(done, total);
  const queue = [...pending];
  const worker = async () => {
    while (queue.length) {
      const p = queue.shift();
      const [full, thumb] = await Promise.all([
        put(userId, folder, `${p.id}.jpg`, p.fullBlob, 'image/jpeg'),
        put(userId, folder, `${p.id}-t.jpg`, p.thumbBlob, 'image/jpeg'),
      ]);
      p.full = full;
      p.thumb = thumb;
      done += 1;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  for (const [media, prefix, fallback] of [[video, 'film', 'video/mp4'], [voice, 'voice', 'audio/mp4'], [song, 'song', 'audio/mpeg']]) {
    if (media?.blob) {
      // Запись из браузера приходит с типом вроде audio/webm;codecs=opus
      const type = (media.blob.type || fallback).split(';')[0];
      const ext = type.split('/')[1].replace(/[^a-z0-9]/g, '') || 'bin';
      media.url = await put(userId, folder, `${prefix}-${crypto.randomUUID()}.${ext}`, media.blob, type);
      media.blob = null;
      done += 1;
      onProgress?.(done, total);
    }
  }
}

export function storagePath(url) {
  const marker = `/${BUCKET}/`;
  const at = String(url || '').indexOf(marker);
  return at < 0 ? null : decodeURIComponent(String(url).slice(at + marker.length));
}

export async function removeFiles(urls) {
  const paths = urls.map(storagePath).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
