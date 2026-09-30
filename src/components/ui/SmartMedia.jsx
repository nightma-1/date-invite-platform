/**
 * © 2026 Senti. Все права защищены.
 *
 * Многие "гифки" из Telegram на деле не gif/webp, а короткое зацикленное
 * видео без звука (webm/mp4 — так Telegram хранит и стикеры, и GIF-панель).
 * Этот компонент сам решает по расширению файла, рисовать <img> или
 * зацикленное автопроигрывающееся <video> — вызывающему коду думать об
 * этом не нужно, он просто передаёт mediaUrl как раньше.
 */

const VIDEO_EXTENSION_RE = /\.(webm|mp4|mov|m4v)(\?.*)?$/i;

export function isVideoMediaUrl(url) {
  return Boolean(url) && VIDEO_EXTENSION_RE.test(url);
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
