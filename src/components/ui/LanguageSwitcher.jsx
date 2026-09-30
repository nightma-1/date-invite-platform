/**
 * © 2026 Senti. Все права защищены.
 *
 * Компактный переключатель языка (RU / UZ / EN). Используется в шапках всех
 * ключевых страниц — лендинг, конструктор, дашборд, экран входа.
 */
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n/index.js';

export default function LanguageSwitcher({ dark }) {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.resolvedLanguage) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const textColor = dark ? '#fff' : '#2A1F2B';
  const borderColor = dark ? 'rgba(255,255,255,0.3)' : '#2A1F2B20';

  return (
    <div ref={ref} style={{ position: 'relative', fontFamily: "'Comfortaa', sans-serif" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Language"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: `1.5px solid ${borderColor}`,
          borderRadius: 100, padding: '6px 12px', cursor: 'pointer',
          fontSize: 13, fontWeight: 600, color: textColor,
        }}
      >
        <span>{current.flag}</span>
        <span>{current.code.toUpperCase()}</span>
        <span style={{ fontSize: 10, opacity: 0.7 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
          background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          overflow: 'hidden', minWidth: 140,
        }}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => { i18n.changeLanguage(lang.code); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '10px 14px', border: 'none', cursor: 'pointer',
                background: lang.code === current.code ? '#fff5f8' : '#fff',
                color: '#2A1F2B', fontSize: 14, fontWeight: lang.code === current.code ? 700 : 500,
                textAlign: 'left',
              }}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
