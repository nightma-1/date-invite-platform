/**
 * © 2026 Senti. Все права защищены.
 *
 * Картинки для превью ссылок и сторис. Рисуются через @vercel/og (satori):
 * на вход — дерево элементов с inline-стилями, на выход — PNG.
 *
 * JSX в api/ не собирается, поэтому дерево строим маленьким h().
 * Шрифт — фирменный Comfortaa, кириллица + латиница (для узбекских имён).
 *
 * Три карточки:
 *   inviteCard  — 1200×630, превью ссылки на приглашение в мессенджере.
 *                 Имя получателя есть, содержимого приглашения нет — интрига.
 *   defaultCard — 1200×630, превью главной senti.uz.
 *   storyCard   — 1080×1920, карточка «меня пригласили» для сторис
 *                 получателя. Ни одного имени: делиться или нет — её выбор,
 *                 и даже если поделится, второй человек на ней не виден.
 */

// satori не ищет недостающие символы в других файлах с тем же именем
// шрифта, поэтому у каждого подмножества своё имя, а в fontFamily — список.
// Латиница первой: в ней цифры и пунктуация, которых нет в кириллице.
export const OG_FONT_FILES = [
  ['comfortaa-latin-700-normal.woff', 700, 'ComfortaaLat'],
  ['comfortaa-cyrillic-700-normal.woff', 700, 'ComfortaaCyr'],
  ['comfortaa-latin-ext-700-normal.woff', 700, 'ComfortaaExt'],
  ['comfortaa-latin-400-normal.woff', 400, 'ComfortaaLat'],
  ['comfortaa-cyrillic-400-normal.woff', 400, 'ComfortaaCyr'],
  ['comfortaa-latin-ext-400-normal.woff', 400, 'ComfortaaExt'],
];

const FONT = 'ComfortaaLat, ComfortaaCyr, ComfortaaExt';

/** Загрузка шрифтов с собственного домена (лежат в public/og-fonts). */
export async function loadOgFonts(origin) {
  const cached = globalThis.__sentiOgFonts;
  if (cached) return cached;
  const fonts = await Promise.all(
    OG_FONT_FILES.map(async ([file, weight, name]) => {
      const res = await fetch(`${origin}/og-fonts/${file}`);
      if (!res.ok) throw new Error(`font ${file}: ${res.status}`);
      return { name, data: await res.arrayBuffer(), weight, style: 'normal' };
    })
  );
  globalThis.__sentiOgFonts = fonts;
  return fonts;
}

function h(type, style, ...children) {
  const flat = children.flat().filter((c) => c !== null && c !== undefined && c !== false);
  // satori падает на undefined в стилях — выкидываем пустые ключи
  const clean = Object.fromEntries(Object.entries({ display: 'flex', ...style }).filter(([, v]) => v !== undefined));
  return {
    type,
    props: {
      style: clean,
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
  };
}

const BRAND_PINK = '#F85589';

// Палитры повторяют src/templates/*/tokens.js (только цвета). Отдельной
// копией, а не импортом: функции не должны тянуть фронтовый код.
const PALETTES = {
  romantic: { onAccent: '#FFFFFF', bg: '#FDF0F3', tint: '#FFDDE7', ink: '#2A1F2B', muted: '#6B4D5A', accent: '#C23B62', card: '#FFFFFF' },
  darkromance: { onAccent: '#0F0B0D', bg: '#0F0B0D', tint: '#2A1620', ink: '#F5EFF2', muted: '#A08898', accent: '#D4829A', card: '#1A1318' },
  cute: { onAccent: '#3D2A5A', bg: '#FFF4EC', tint: '#FFE0F2', ink: '#3D2A5A', muted: '#8A6FA0', accent: '#E07CC0', card: '#FFFFFF' },
  funny: { onAccent: '#1A3A5C', bg: '#EEF9FF', tint: '#FFE3E3', ink: '#1A3A5C', muted: '#4A7A9B', accent: '#FF6B6B', card: '#FFFFFF' },
  luxury: { onAccent: '#1C1A17', bg: '#F8F5EF', tint: '#EFE4C8', ink: '#1C1A17', muted: '#7A7060', accent: '#B8973A', card: '#FFFFFF' },
};

export function hasPalette(templateKey) {
  return Object.prototype.hasOwnProperty.call(PALETTES, templateKey || '');
}

export function paletteFor(templateKey) {
  return PALETTES[templateKey] || PALETTES.romantic;
}

// Заглушки из поля имени, которые автор не заменил: на превью вместо
// «Имя, это тебе» показываем просто «Это тебе». Тот же список — в
// src/lib/shareLink.js.
const PLACEHOLDER_NAMES = new Set(['имя', 'тебя', 'ism', 'name', 'имя получателя']);

/** Имя в превью: без переводов строк, не длиннее 24 символов. */
export function cleanName(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim();
  if (!s || PLACEHOLDER_NAMES.has(s.toLowerCase())) return '';
  return s.length > 24 ? `${s.slice(0, 23).trim()}…` : s;
}

/** Та же метка версии превью, что и в src/lib/shareLink.js. */
export function previewVersion(name, templateKey) {
  const input = `${String(name || '').replace(/\s+/g, ' ').trim()}|${templateKey || ''}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 5);
}

function blob(p, { top, left, right, bottom, size, opacity }) {
  return h('div', {
    position: 'absolute', top, left, right, bottom,
    width: size, height: size, borderRadius: size,
    background: p.accent, opacity,
  });
}

/** Конверт — SVG-контур: ровные линии клапана и сердечко-печать. */
function envelope(p, width) {
  const height = Math.round(width * 0.66);
  const svg = (type, props, children) => ({ type, props: children ? { ...props, children } : props });
  return {
    type: 'svg',
    props: {
      width, height: height + 24, viewBox: '0 0 300 222',
      children: [
        svg('rect', { x: 6, y: 6, width: 288, height: 192, rx: 18, fill: p.card, stroke: p.accent, 'stroke-width': 4 }),
        svg('path', { d: 'M 12 14 L 150 118 L 288 14 Z', fill: p.tint, stroke: p.accent, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
        svg('path', { d: 'M 12 192 L 118 100 M 288 192 L 182 100', stroke: p.accent, 'stroke-width': 3, 'stroke-linecap': 'round', opacity: 0.45 }),
        svg('path', {
          d: 'M 150 132 C 150 132 126 117 126 102 C 126 93 133 87 140 87 C 145 87 148 90 150 94 C 152 90 155 87 160 87 C 167 87 174 93 174 102 C 174 117 150 132 150 132 Z',
          fill: BRAND_PINK,
        }),
      ],
    },
  };
}

function wordmark(color, size = 34) {
  return h('div', { fontSize: size, fontWeight: 700, color, letterSpacing: -0.5 }, 'Senti');
}

export function inviteCard({ name, templateKey }) {
  const p = paletteFor(templateKey);
  const n = cleanName(name);
  const nameSize = n.length <= 8 ? 104 : n.length <= 14 ? 84 : 64;

  return h('div', {
    width: 1200, height: 630, position: 'relative', overflow: 'hidden',
    background: `linear-gradient(150deg, ${p.bg} 0%, ${p.bg} 50%, ${p.tint} 100%)`,
    fontFamily: FONT, padding: '56px 72px',
    alignItems: 'center',
  },
    blob(p, { top: -120, left: -120, size: 340, opacity: 0.12 }),
    blob(p, { bottom: -140, right: 260, size: 300, opacity: 0.08 }),
    h('div', { position: 'absolute', top: 48, left: 72 }, wordmark(p.accent)),

    h('div', { flexDirection: 'column', flex: 1, paddingRight: 40 },
      n
        ? h('div', { fontSize: nameSize, fontWeight: 700, color: p.ink, lineHeight: 1.1 }, `${n},`)
        : null,
      h('div', { fontSize: n ? 60 : 96, fontWeight: 700, color: p.ink, lineHeight: 1.15, marginTop: 6 }, n ? 'это тебе' : 'Это тебе'),
      h('div', { fontSize: 30, color: p.muted, marginTop: 30, lineHeight: 1.4 },
        'Открой, когда будет минутка'),
    ),

    h('div', { width: 380, justifyContent: 'center', alignItems: 'center', transform: 'rotate(-6deg)' },
      envelope(p, 340)),
  );
}

export function defaultCard() {
  const p = PALETTES.romantic;
  return h('div', {
    width: 1200, height: 630, position: 'relative', overflow: 'hidden',
    background: `linear-gradient(150deg, #FFFFFF 0%, ${p.bg} 55%, #FFDDE7 100%)`,
    fontFamily: FONT, padding: '56px 72px', alignItems: 'center',
  },
    blob({ accent: BRAND_PINK }, { top: -140, right: -100, size: 380, opacity: 0.14 }),
    h('div', { position: 'absolute', top: 48, left: 72 }, wordmark(BRAND_PINK, 38)),
    h('div', { flexDirection: 'column', width: 760 },
      h('div', { fontSize: 62, fontWeight: 700, color: p.ink, lineHeight: 1.18 },
        'Пригласи на свидание так, чтобы запомнилось'),
      h('div', { fontSize: 28, color: p.muted, marginTop: 26, lineHeight: 1.4 },
        'Одна ссылка. Три минуты. Кнопка «Нет» убегает.'),
    ),
    h('div', { flex: 1, height: 300, position: 'relative', justifyContent: 'center', alignItems: 'center' },
      h('div', {
        background: BRAND_PINK, color: '#2A1F2B', fontSize: 38, fontWeight: 700,
        padding: '20px 52px', borderRadius: 100, marginTop: 60,
      }, 'Да'),
      h('div', {
        position: 'absolute', top: 20, right: 0, transform: 'rotate(12deg)',
        background: '#FFFFFF', color: p.muted, border: `2px solid ${p.ink}33`,
        fontSize: 26, fontWeight: 700, padding: '12px 30px', borderRadius: 100,
      }, 'Нет'),
    ),
    h('div', { position: 'absolute', left: 72, bottom: 48, fontSize: 26, color: p.muted }, 'senti.uz'),
  );
}

function attemptsLine(n) {
  if (!n || n < 1) return 'Кнопка «Нет» не понадобилась';
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'попытка'
    : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'попытки' : 'попыток';
  return `Поймать «Нет» не удалось: ${n} ${word}`;
}

export function storyCard({ templateKey, attempts }) {
  const p = paletteFor(templateKey);
  return h('div', {
    width: 1080, height: 1920, position: 'relative', overflow: 'hidden',
    background: `linear-gradient(170deg, ${p.bg} 0%, ${p.bg} 45%, ${p.tint} 100%)`,
    fontFamily: FONT, flexDirection: 'column', alignItems: 'center',
    // Верх и низ сторис закрыты интерфейсом — держим смысл в середине
    padding: '300px 90px 360px',
  },
    blob(p, { top: -160, left: -160, size: 520, opacity: 0.12 }),
    blob(p, { bottom: 120, right: -180, size: 460, opacity: 0.1 }),

    h('div', { transform: 'rotate(-6deg)', marginBottom: 90 }, envelope(p, 440)),

    h('div', { fontSize: 84, fontWeight: 700, color: p.ink, lineHeight: 1.15, textAlign: 'center', justifyContent: 'center' },
      'Меня пригласили на свидание'),

    h('div', { marginTop: 80, alignItems: 'center', position: 'relative', height: 160, width: 560, justifyContent: 'center' },
      h('div', {
        background: p.accent, color: p.onAccent, fontSize: 46, fontWeight: 700,
        padding: '24px 70px', borderRadius: 100,
      }, 'Да'),
      h('div', {
        position: 'absolute', right: -40, top: -40, transform: 'rotate(14deg)',
        background: p.card, color: p.muted, border: `3px solid ${p.ink}30`,
        fontSize: 32, fontWeight: 700, padding: '14px 40px', borderRadius: 100,
      }, 'Нет'),
    ),

    h('div', { fontSize: 40, color: p.muted, marginTop: 70, textAlign: 'center', justifyContent: 'center' },
      attemptsLine(attempts)),

    h('div', { position: 'absolute', bottom: 300, fontSize: 40, fontWeight: 700, color: p.accent }, 'senti.uz'),
  );
}
