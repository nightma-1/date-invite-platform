/**
 * © 2026 Senti. Все права защищены.
 *
 * Многие "гифки" из Telegram на деле не gif/webp, а короткое зацикленное
 * видео без звука (webm/mp4 — так Telegram хранит и стикеры, и GIF-панель).
 * Этот компонент сам решает по расширению файла, рисовать <img> или
 * зацикленное автопроигрывающееся <video> — вызывающему коду думать об
 * этом не нужно, он просто передаёт mediaUrl как раньше.
 *
 * Ловушка с blob:-превью: сразу после выбора файла (до загрузки в Storage)
 * мы показываем URL.createObjectURL(file) — а у такой ссылки НЕТ расширения
 * ("blob:https://site/uuid"), поэтому определить видео по regex нельзя.
 * Решение — реестр blobUrl → тип, который заполняется в момент создания
 * blob-ссылки (см. registerBlobMediaType) и проверяется здесь в приоритете.
 */

const VIDEO_EXTENSION_RE = /\.(webm|mp4|mov|m4v)(\?.*)?$/i;
const blobTypeRegistry = new Map();

/** Вызывать сразу после URL.createObjectURL(file), передав file.type. */
export function registerBlobMediaType(blobUrl, mimeType) {
  if (!blobUrl) return;
  blobTypeRegistry.set(blobUrl, mimeType && mimeType.startsWith('video/') ? 'video' : 'image');
}

export function isVideoMediaUrl(url) {
  if (!url) return false;
  if (blobTypeRegistry.has(url)) return blobTypeRegistry.get(url) === 'video';
  return VIDEO_EXTENSION_RE.test(url);
}

export default function SmartMedia({ src, alt = '', style, className, objectFit, objectPosition, ...rest }) {
  if (!src) return null;

  const mediaStyle = { ...style, ...(objectFit ? { objectFit } : null), ...(objectPosition ? { objectPosition } : null) };

  if (isVideoMediaUrl(src)) {
    return (
      <video
        src={src}
        style={mediaStyle}
        className={className}
        autoPlay
        loop
        muted
        playsInline
        {...rest}
      />
    );
  }

  return <img src={src} alt={alt} style={mediaStyle} className={className} {...rest} />;
}
