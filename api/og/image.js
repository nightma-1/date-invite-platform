/**
 * © 2026 Senti. Все права защищены.
 *
 * PNG-картинки:
 *   /api/og/image?slug=abc123         — превью ссылки на приглашение (1200×630)
 *   /api/og/image?kind=story&t=cute&a=7 — карточка для сторис получателя
 *                                        (1080×1920), без имён и без slug
 *
 * Имя для превью берём из базы по slug, а не из параметров запроса —
 * иначе любой мог бы рисовать нашим шаблоном картинки с произвольным текстом.
 */

import { ImageResponse } from '@vercel/og';
import { fetchPublicInvitation } from '../_lib/publicInvitation.js';
import { inviteCard, storyCard, loadOgFonts, hasPalette } from '../_lib/ogCards.js';

export const config = { runtime: 'edge' };

const LONG_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';

export default async function handler(request) {
  const reqUrl = new URL(request.url);
  const params = reqUrl.searchParams;
  const origin = reqUrl.origin;

  try {
    const fonts = await loadOgFonts(origin);

    if (params.get('kind') === 'story') {
      const t = params.get('t');
      const templateKey = hasPalette(t) ? t : 'romantic';
      const a = Math.max(0, Math.min(999, parseInt(params.get('a') || '0', 10) || 0));
      return new ImageResponse(storyCard({ templateKey, attempts: a }), {
        width: 1080, height: 1920, fonts,
        headers: { 'cache-control': LONG_CACHE, 'x-robots-tag': 'noindex' },
      });
    }

    const inv = await fetchPublicInvitation(params.get('slug') || '');
    if (!inv) {
      return Response.redirect(`${origin}/og-default.png`, 302);
    }
    return new ImageResponse(inviteCard({ name: inv.recipient_name, templateKey: inv.template_key }), {
      width: 1200, height: 630, fonts,
      headers: {
        'cache-control': 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800',
        'x-robots-tag': 'noindex',
      },
    });
  } catch (e) {
    console.error('og/image failed', e);
    return Response.redirect(`${origin}/og-default.png`, 302);
  }
}
