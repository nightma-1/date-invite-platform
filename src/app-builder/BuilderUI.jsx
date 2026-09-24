/**
 * © 2026 Date Invite Platform. Все права защищены.
 * Shared design tokens and reusable UI components for the builder.
 */

import { forwardRef, useState } from 'react';

// Design tokens matching onlyteplo.ru design system
export const T = {
  pink: '#f85589',
  pinkLight: '#fff5f8',
  pinkBorder: '#fbcadb',
  pinkMid: '#fbd6e4',
  dark: '#222222',
  darkPurple: '#2D1926',
  muted: '#80757b',
  bg: '#fdffff',
  sectionBg: '#e8f0fb',
  card: '#ffffff',
  font: "'Comfortaa', sans-serif",
};

// SectionCard: light-blue card with №N badge top-right
export function SectionCard({ number, title, children }) {
  return (
    <div style={{
      background: T.sectionBg,
      borderRadius: 20,
      padding: '20px 16px 16px',
      marginBottom: 16,
      position: 'relative',
    }}>
      {/* №N badge top-right */}
      <div style={{
        position: 'absolute',
        top: 12,
        right: 14,
        background: T.pinkMid,
        borderRadius: 10,
        padding: '2px 8px',
        fontSize: 11,
        fontFamily: T.font,
        fontWeight: 700,
        color: T.darkPurple,
      }}>
        №{number}
      </div>
      {title && (
        <p style={{
          fontFamily: T.font,
          fontWeight: 700,
          fontSize: 14,
          color: T.darkPurple,
          marginBottom: 14,
          paddingRight: 40,
        }}>
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

// FieldLabel: muted label above a field
export function FieldLabel({ children, style }) {
  return (
    <p style={{
      fontSize: 13,
      color: T.muted,
      marginBottom: 6,
      fontFamily: T.font,
      ...style,
    }}>
      {children}
    </p>
  );
}

// Inp: styled input
export const Inp = forwardRef(function Inp({ style, ...props }, ref) {
  return (
    <input
      ref={ref}
      style={{
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e0e0e0',
        fontFamily: T.font,
        fontSize: 14,
        color: T.dark,
        padding: '12px 14px',
        width: '100%',
        boxSizing: 'border-box',
        outline: 'none',
        ...style,
      }}
      {...props}
    />
  );
});

// TxtArea: styled textarea
export const TxtArea = forwardRef(function TxtArea({ style, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      style={{
        background: '#ffffff',
        borderRadius: 12,
        border: '1px solid #e0e0e0',
        fontFamily: T.font,
        fontSize: 14,
        color: T.dark,
        padding: '12px 14px',
        width: '100%',
        boxSizing: 'border-box',
        resize: 'vertical',
        outline: 'none',
        lineHeight: 1.5,
        ...style,
      }}
      {...props}
    />
  );
});

// CharCount: right-aligned "X/300" counter
export function CharCount({ value, max }) {
  const len = (value || '').length;
  return (
    <p style={{
      fontSize: 12,
      color: T.muted,
      textAlign: 'right',
      marginTop: 4,
      fontFamily: T.font,
    }}>
      {len}/{max}
    </p>
  );
}

// GifImagePicker: image picker with gif grid and file upload
export function GifImagePicker({
  currentUrl,
  gifs,
  gifsLoading,
  gifsError,
  onSelect,
  onRemove,
  onUploadClick,
  fileInputRef,
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');

  const categories = ['all', ...new Set((gifs || []).map((g) => g.category).filter(Boolean))];
  const CATEGORY_LABELS = {
    romantic: '❤️ Романтика',
    flirty: '😏 Флирт',
    funny: '😂 Смешные',
    cute: '🥹 Милые',
    bold: '🔥 Яркие',
    custom: '✨ Другое',
    all: 'Все',
  };
  const visibleGifs = activeCategory === 'all' ? (gifs || []) : (gifs || []).filter((g) => g.category === activeCategory);
  const previewGifs = (gifs || []).slice(0, 3);

  return (
    <div>
      {/* Selected image thumbnail */}
      {currentUrl && (
        <div style={{ marginBottom: 12, position: 'relative', display: 'inline-block' }}>
          <img
            src={currentUrl}
            alt="превью"
            style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', display: 'block' }}
          />
          <button
            type="button"
            onClick={onRemove}
            style={{
              position: 'absolute', top: -6, right: -6,
              background: '#C0392B', color: '#fff',
              border: 'none', borderRadius: '50%',
              width: 20, height: 20, cursor: 'pointer',
              fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {!expanded ? (
        <>
          {/* Collapsed: 3 thumbnails + "Ещё" button */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {previewGifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif.url)}
                style={{
                  width: 80, height: 80, padding: 0, border: `2px solid ${currentUrl === gif.url ? T.pink : 'transparent'}`,
                  borderRadius: 16, overflow: 'hidden', cursor: 'pointer', background: '#f0f0f0', flexShrink: 0,
                }}
              >
                <img src={gif.url} alt={gif.title || 'gif'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
            {gifsLoading && previewGifs.length === 0 && (
              <div style={{ width: 80, height: 80, borderRadius: 16, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: T.muted, flexShrink: 0 }}>
                …
              </div>
            )}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{
                width: 80, height: 80, border: '1.5px solid #e0e0e0', borderRadius: 16,
                background: 'white', cursor: 'pointer', fontSize: 12, color: T.muted,
                fontFamily: T.font, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 4, flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 20 }}>🖼️</span>
              <span>Ещё</span>
            </button>
          </div>

          {/* Upload card */}
          <button
            type="button"
            onClick={onUploadClick}
            style={{
              width: '100%', border: '1.5px dashed #e0e0e0', borderRadius: 12,
              background: 'white', cursor: 'pointer', padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 20 }}>📁</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontFamily: T.font, fontSize: 14, color: T.dark, margin: 0 }}>Загрузить свой файл</p>
              <p style={{ fontFamily: T.font, fontSize: 12, color: T.muted, margin: 0 }}>Фото до 10 МБ</p>
            </div>
          </button>
        </>
      ) : (
        <>
          {/* Expanded: category filter + full grid */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12,
                  border: `1.5px solid ${activeCategory === cat ? T.pink : '#e0e0e0'}`,
                  background: activeCategory === cat ? T.pink : 'white',
                  color: activeCategory === cat ? '#fff' : T.dark,
                  fontFamily: T.font, cursor: 'pointer',
                }}
              >
                {CATEGORY_LABELS[cat] || cat}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12,
                border: '1.5px solid #e0e0e0', background: 'white',
                color: T.muted, fontFamily: T.font, cursor: 'pointer',
              }}
            >
              Скрыть ↑
            </button>
          </div>

          {gifsLoading && (
            <p style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>Загружаем гифки…</p>
          )}
          {gifsError && (
            <p style={{ color: '#C0392B', fontSize: 12, marginBottom: 8 }}>{gifsError}</p>
          )}
          {!gifsLoading && !gifsError && visibleGifs.length === 0 && (
            <p style={{ fontSize: 12, color: T.muted, marginBottom: 8 }}>В библиотеке пока нет гифок.</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {visibleGifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => { onSelect(gif.url); setExpanded(false); }}
                style={{
                  padding: 0, border: `2px solid ${currentUrl === gif.url ? T.pink : 'transparent'}`,
                  borderRadius: 12, overflow: 'hidden', cursor: 'pointer', background: 'none', aspectRatio: '1',
                }}
              >
                <img src={gif.url} alt={gif.title || 'gif'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </button>
            ))}
          </div>

          {/* Upload card in expanded view */}
          <button
            type="button"
            onClick={onUploadClick}
            style={{
              width: '100%', border: '1.5px dashed #e0e0e0', borderRadius: 12,
              background: 'white', cursor: 'pointer', padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box',
            }}
          >
            <span style={{ fontSize: 20 }}>📁</span>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontFamily: T.font, fontSize: 14, color: T.dark, margin: 0 }}>Загрузить свой файл</p>
              <p style={{ fontFamily: T.font, fontSize: 12, color: T.muted, margin: 0 }}>Фото до 10 МБ</p>
            </div>
          </button>
        </>
      )}
    </div>
  );
}
