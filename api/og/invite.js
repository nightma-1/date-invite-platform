/**
 * © 2026 Senti. Все права защищены.
 *
 * HTML для ботов-превью мессенджеров (Telegram, WhatsApp, Instagram и т.д.)
 * по адресу /i/:slug. Сюда приходят ТОЛЬКО боты — правило в vercel.json
 * смотрит на User-Agent. Живые люди получают обычное приложение, и для них
 * ничего не меняется.
 *
 * Получатель первым видит не приглашение, а карточку ссылки в чате.
 * Поэтому в ней имя и интрига, но ни слова о содержимом: сюрприз — внутри.
 */

import { fetchPublicInvitation } from '../_lib/publicInvitation.js';
import { cleanName, previewVersion } from '../_lib/ogCards.js';

export const config = { runtime: 'edge' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page({ title, description, image, url }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Senti">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Конверт с сердечком">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
</head>
<body><a href="${esc(url)}">${esc(title)}</a></body>
</html>`;
}

export default async function handler(request) {
  const reqUrl = new URL(request.url);
  const origin = reqUrl.origin;
  const slug = reqUrl.searchParams.get('slug') || '';
  const inv = await fetchPublicInvitation(slug);
  const v = inv ? previewVersion(inv.recipient_name, inv.template_key) : '';
  const url = `${origin}/i/${encodeURIComponent(slug)}${v ? `?v=${v}` : ''}`;
  const name = inv ? cleanName(inv.recipient_name) : '';

  const html = inv
    ? page({
      title: name ? `${name}, это тебе` : 'Это тебе',
      description: 'Открой, когда будет минутка.',
      // v= меняется вместе с именем/шаблоном — кэш картинки не покажет старое имя
      image: `${origin}/api/og/image?slug=${encodeURIComponent(slug)}&v=${v}`,
      url,
    })
    : page({
      title: 'Senti',
      description: 'Приглашение на свидание, которое хочется открыть.',
      image: `${origin}/og-default.png`,
      url,
    });

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
      'x-robots-tag': 'noindex, nofollow',
    },
  });
}
