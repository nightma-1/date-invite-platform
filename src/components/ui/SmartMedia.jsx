/**
 * © 2026 Senti. Все права защищены.
 *
 * Многие "гифки" из Telegram на деле не gif/webp, а короткое зацикленное
 * видео без звука (webm/mp4 — так Telegram хранит и стикеры, и GIF-панель).
 * Этот компонент сам решает по расширению файла, рисовать <img> или
 * зацикленное автопроигрывающееся <video> — вызывающему коду думать об
 * этом не нужно, он просто передаёт mediaUrl как раньше.
 *
 * Третий вид — .tgs, анимированный стикер Telegram: это gzip-нутый
 * Lottie-JSON, который рисуется только через плеер (см. TgsMedia.jsx).
 *
 * Ловушка с blob:-превью: сразу после выбора файла (до загрузки в Storage)
 * мы показываем URL.createObjectURL(file) — а у такой ссылки НЕТ расширения
 * ("blob:https://site/uuid"), поэтому определить видео по regex нельзя.
 * Решение — реестр blobUrl → тип, который заполняется в момент создания
 * blob-ссылки (см. registerBlobMediaType) и проверяется здесь в приоритете.
 * У .tgs вдобавок пустой file.type, так что туда передаём ещё и имя файла.
 */

import { useState } from 'react';
import TgsMedia from './TgsMedia.jsx';

const VIDEO_EXTENSION_RE = /\.(webm|mp4|mov|m4v)(\?.*)?$/i;
const TGS_EXTENSION_RE = /\.tgs(\?.*)?$/i;
const blobTypeRegistry = new Map();

/** Вызывать сразу после URL.createObjectURL(file), передав file.type и file.name. */
export function registerBlobMediaType(blobUrl, mimeType, fileName) {
  if (!blobUrl) return;
  let kind = 'image';
  if (TGS_EXTENSION_RE.test(fileName || '')) kind = 'tgs';
  else if (mimeType && mimeType.startsWith('video/')) kind = 'video';
  blobTypeRegistry.set(blobUrl, kind);
}

export function isVideoMediaUrl(url) {
  if (!url) return false;
  if (blobTypeRegistry.has(url)) return blobTypeRegistry.get(url) === 'video';
  return VIDEO_EXTENSION_RE.test(url);
}

export function isTgsMediaUrl(url) {
  if (!url) return false;
  if (blobTypeRegistry.has(url)) return blobTypeRegistry.get(url) === 'tgs';
  return TGS_EXTENSION_RE.test(url);
}

export default function SmartMedia({ src, alt = '', style, className, objectFit, objectPosition, ...rest }) {
  // Плавное появление, когда файл реально готов, вместо «впрыгивания»
  // наполовину загруженной картинки. Ключ — src: новая картинка снова
  // появляется плавно.
  const [loadedSrc, setLoadedSrc] = useState(null);
  if (!src) return null;

  const visible = loadedSrc === src;
  const fade = { opacity: visible ? 1 : 0, transition: 'opacity .3s ease' };
  const mediaStyle = { ...style, ...(objectFit ? { objectFit } : null), ...(objectPosition ? { objectPosition } : null), ...fade };
  const markLoaded = () => setLoadedSrc(src);

  if (isTgsMediaUrl(src)) {
    return <TgsMedia src={src} style={style} className={className} objectFit={objectFit} {...rest} />;
  }

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
        onLoadedData={markLoaded}
        onError={markLoaded}
        {...rest}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={mediaStyle}
      className={className}
      decoding="async"
      // Картинка уже в кэше браузера — onLoad может прийти раньше, чем
      // React повесит обработчик; ref ловит этот случай.
      ref={(el) => { if (el && el.complete && el.naturalWidth > 0 && loadedSrc !== src) markLoaded(); }}
      onLoad={markLoaded}
      onError={markLoaded}
      {...rest}
    />
  );
}
