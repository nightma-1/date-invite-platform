/**
 * © 2026 Senti.
 * Конверт: бумага с фактурой и тиснением, почтовый штемпель, сургучная
 * печать с монограммой Senti и имя получателя от руки.
 *
 * Открытие — не подмена сцены, а настоящее действие: клапан отгибается
 * назад в 3D, из конверта выезжает письмо, и только потом сцена уходит.
 * Пауза между «нажал» и «увидел» — это и есть предвкушение.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';

const PAPER = 'linear-gradient(158deg,#fffdfc 0%,#fdf6f4 46%,#f4e9ee 100%)';

export default function EnvelopeScene({ recipientName, palette, onOpen }) {
  const [opening, setOpening] = useState(false);
  const seal = palette?.seal || ['#ff9ebd', '#d4466f'];
  const initial = (recipientName || 'S').trim().charAt(0).toUpperCase();

  function handleOpen() {
    if (opening) return;
    setOpening(true);
    setTimeout(() => onOpen?.(), 1250);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {/* фактура бумаги: один фильтр на всю сцену, применяется как оверлей */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="senti-paper">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
        </filter>
      </svg>

      <motion.button
        type="button"
        onClick={handleOpen}
        aria-label="Открыть письмо"
        whileTap={{ scale: opening ? 1 : 0.97 }}
        animate={opening ? { y: -4, scale: 1.04 } : { y: [0, -7, 0] }}
        transition={opening
          ? { duration: 0.8, ease: [0.22, 1, 0.36, 1] }
          : { y: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
        style={{
          position: 'relative', width: 236, height: 158, border: 'none',
          background: 'transparent', padding: 0, cursor: opening ? 'default' : 'pointer',
          perspective: 900, WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* задняя стенка */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 7, background: PAPER,
          boxShadow: '0 34px 60px -22px rgba(60,20,45,0.55), inset 0 1px 0 rgba(255,255,255,0.9)',
        }} />

        {/* письмо внутри — выезжает при открытии */}
        <motion.div
          initial={false}
          animate={opening ? { y: -74, opacity: 1 } : { y: 10, opacity: 0.95 }}
          transition={{ duration: 0.85, delay: opening ? 0.35 : 0, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', left: 16, right: 16, top: 8, height: 128,
            borderRadius: 4, background: 'linear-gradient(180deg,#ffffff,#fdf7f9)',
            boxShadow: '0 10px 20px -12px rgba(60,20,45,0.45)',
            padding: '14px 16px', textAlign: 'left',
          }}
        >
          {[82, 96, 64, 88, 48].map((w, i) => (
            <div key={i} style={{
              height: 3, width: `${w}%`, borderRadius: 2, marginBottom: 9,
              background: 'rgba(42,31,43,0.1)',
            }} />
          ))}
        </motion.div>

        {/* карман конверта */}
        <svg viewBox="0 0 236 158" width="236" height="158"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <linearGradient id="senti-env-l" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fffdfc" /><stop offset="1" stopColor="#f3e7ec" />
            </linearGradient>
            <linearGradient id="senti-env-r" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fdf8f7" /><stop offset="1" stopColor="#efe0e7" />
            </linearGradient>
          </defs>
          <polygon points="0,158 98,74 0,12" fill="url(#senti-env-l)" />
          <polygon points="236,158 138,74 236,12" fill="url(#senti-env-r)" />
          <polygon points="0,158 118,70 236,158" fill="url(#senti-env-l)" />
          {/* тиснёный кант */}
          <polyline points="0,158 118,70 236,158" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <polyline points="2,157 118,72 234,157" fill="none" stroke="rgba(42,31,43,0.07)" strokeWidth="1" />
        </svg>

        {/* верхний клапан — отгибается назад */}
        <motion.div
          initial={false}
          animate={{ rotateX: opening ? -172 : 0 }}
          transition={{ duration: 0.75, ease: [0.35, 0.9, 0.3, 1] }}
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: 82,
            transformOrigin: 'top center', transformStyle: 'preserve-3d',
            zIndex: opening ? 0 : 3,
          }}
        >
          <svg viewBox="0 0 236 82" width="236" height="82" style={{ display: 'block' }}>
            <polygon points="0,0 118,80 236,0" fill="url(#senti-env-l)" />
            <polyline points="0,0 118,80 236,0" fill="none" stroke="rgba(42,31,43,0.08)" strokeWidth="1" />
          </svg>
        </motion.div>

        {/* шум бумаги поверх всего */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, borderRadius: 7, overflow: 'hidden',
          opacity: 0.22, mixBlendMode: 'multiply', pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', inset: -20, filter: 'url(#senti-paper)', opacity: 0.5 }} />
        </div>

        {/* почтовый штемпель */}
        <div aria-hidden style={{
          position: 'absolute', right: 14, bottom: 16, width: 46, height: 46,
          borderRadius: '50%', border: `1px dashed ${seal[1]}`, opacity: 0.4,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transform: 'rotate(-13deg)', color: seal[1], lineHeight: 1.1,
        }}>
          <div style={{ fontFamily: '"Comfortaa", sans-serif', fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5 }}>SENTI</div>
          <div style={{ width: 26, height: 1, background: seal[1], opacity: 0.6, margin: '2px 0' }} />
          <div style={{ fontFamily: '"Manrope", sans-serif', fontSize: 6 }}>ДЛЯ ТЕБЯ</div>
        </div>

        {/* сургучная печать с монограммой */}
        <motion.div
          initial={false}
          animate={opening ? { scale: 0.8, opacity: 0, rotate: -18 } : { scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            position: 'absolute', top: 72, left: '50%', marginLeft: -24, zIndex: 4,
            width: 48, height: 48, borderRadius: '48% 52% 50% 50% / 52% 48% 52% 48%',
            background: `radial-gradient(circle at 34% 28%, ${seal[0]}, ${seal[1]} 72%)`,
            boxShadow: `0 7px 16px rgba(120,30,70,0.42), inset 0 -3px 6px rgba(0,0,0,0.26), inset 0 2px 4px ${seal[0]}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.93)', fontFamily: '"Comfortaa", sans-serif',
            fontSize: 19, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.3)',
          }}
        >
          {initial}
        </motion.div>

        {/* имя от руки */}
        {recipientName && (
          <div style={{
            position: 'absolute', top: 104, left: '50%', transform: 'translateX(-50%)',
            fontFamily: '"Caveat", cursive', fontSize: 23, color: '#4a2a3a',
            paddingBottom: 2, borderBottom: '1px solid rgba(212,70,111,0.35)', zIndex: 2,
          }}>
            {recipientName}
          </div>
        )}
      </motion.button>

      <motion.div
        animate={{ opacity: opening ? 0 : 1 }}
        style={{
          marginTop: 34, fontFamily: '"Caveat", cursive', fontSize: 25,
          color: '#ffeef5', opacity: 0.92, textAlign: 'center',
        }}
      >
        {recipientName ? `${recipientName}, тебе письмо` : 'тебе письмо'}
        <div style={{ fontSize: 16, color: palette?.soft || '#ffd9e5', opacity: 0.75, marginTop: 2 }}>
          {opening ? 'открываю…' : 'открой это'}
        </div>
      </motion.div>
    </motion.div>
  );
}
