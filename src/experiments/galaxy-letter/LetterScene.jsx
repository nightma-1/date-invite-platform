/**
 * © 2026 Senti.
 * Письмо на бумаге. Текст проявляется ПО СЛОВАМ, а не по абзацам: так
 * читается ощущение, будто человек пишет прямо сейчас, а не показывает
 * заранее готовый текст. Тап по письму досказывает всё разом — ждать
 * никого не заставляем.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const WORD_MS = 78;

export default function LetterScene({
  heading, paragraphs, signature, palette,
  buttonText = 'нажми, там сюрприз 🤍', onContinue,
}) {
  const lines = paragraphs && paragraphs.length > 0 ? paragraphs : [
    'Я много раз пытался сказать тебе это красиво.',
    'Поэтому я собрал его на всех языках мира.',
  ];

  // плоский список слов с привязкой к абзацу — так проще считать «сколько уже видно»
  const words = useMemo(() => {
    const out = [];
    lines.forEach((line, li) => {
      line.split(/\s+/).filter(Boolean).forEach((w) => out.push({ w, li }));
    });
    return out;
  }, [lines]);

  const [shown, setShown] = useState(0);
  const [done, setDone] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (shown >= words.length) {
      const t = setTimeout(() => setDone(true), 420);
      return () => clearTimeout(t);
    }
    timer.current = setTimeout(() => setShown((n) => n + 1), WORD_MS);
    return () => clearTimeout(timer.current);
  }, [shown, words.length]);

  function skip() {
    clearTimeout(timer.current);
    setShown(words.length);
  }

  const accent = palette?.accent || { bg: 'linear-gradient(135deg,#ff7faa,#f85589)', fg: '#fff', glow: 'rgba(248,85,137,0.5)' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <motion.div
        onClick={skip}
        initial={{ y: 26, opacity: 0, rotate: -1.2 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '100%', maxWidth: 322, borderRadius: 5, position: 'relative',
          background: 'linear-gradient(158deg,#fffdfc 0%,#fdf8f6 55%,#faf1f4 100%)',
          boxShadow: '0 32px 70px -22px rgba(60,20,45,0.5), inset 0 1px 0 rgba(255,255,255,0.9)',
          padding: '30px 26px 26px',
          fontFamily: '"Caveat", cursive', color: '#2a1f2b',
        }}
      >
        {heading && (
          <div style={{ fontSize: 20, color: '#c23b62', marginBottom: 14 }}>{heading}</div>
        )}

        {lines.map((_, li) => {
          const mine = words.filter((x) => x.li === li);
          const before = words.findIndex((x) => x.li === li);
          const visible = Math.max(0, Math.min(mine.length, shown - before));
          if (visible === 0) return null;
          return (
            <p key={li} style={{ fontSize: 22, lineHeight: 1.45, margin: '0 0 14px' }}>
              {mine.slice(0, visible).map((x, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, filter: 'blur(3px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  transition={{ duration: 0.3 }}
                  style={{ display: 'inline-block', marginRight: '0.26em' }}
                >
                  {x.w}
                </motion.span>
              ))}
            </p>
          );
        })}

        {done && signature && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: 'right', fontSize: 22, color: '#6b4d5a', margin: '4px 0 16px' }}
          >
            {signature}
          </motion.div>
        )}

        {done && (
          <motion.button
            type="button"
            onClick={(e) => { e.stopPropagation(); onContinue?.(); }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            style={{
              marginTop: 8, width: '100%', border: 'none', borderRadius: 999,
              padding: '13px 18px', background: accent.bg, color: accent.fg,
              fontFamily: '"Manrope", sans-serif', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', boxShadow: `0 12px 26px -8px ${accent.glow}`,
            }}
          >
            {buttonText}
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
