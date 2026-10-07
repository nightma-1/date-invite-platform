/**
 * © 2026 Senti.
 * Письмо на "бумаге" — текст появляется построчно, затем кнопка продолжить.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function LetterScene({ heading, paragraphs, signature, palette, buttonText = 'нажми, там сюрприз 🤍', onContinue }) {
  const lines = paragraphs && paragraphs.length > 0 ? paragraphs : [
    'Я много раз пытался сказать тебе это красиво.',
    'Поэтому я собрал его на всех языках мира.',
  ];
  const [visibleCount, setVisibleCount] = useState(0);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (visibleCount >= lines.length) {
      const t = setTimeout(() => setShowButton(true), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setVisibleCount((c) => c + 1), 650);
    return () => clearTimeout(t);
  }, [visibleCount, lines.length]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0, rotate: -1 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          width: '100%', maxWidth: 320, background: '#fdfcff', borderRadius: 4,
          boxShadow: '0 30px 70px -20px rgba(60,20,45,0.5)', padding: '30px 26px',
          fontFamily: '"Caveat", cursive', color: '#2a1f2b',
        }}
      >
        {heading && (
          <div style={{ fontSize: 20, color: '#c23b62', marginBottom: 14 }}>{heading}</div>
        )}
        {lines.slice(0, visibleCount).map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            style={{ fontSize: 22, lineHeight: 1.45, margin: '0 0 14px' }}
          >
            {line}
          </motion.p>
        ))}
        {showButton && signature && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ textAlign: 'right', fontSize: 22, color: '#6b4d5a', margin: '4px 0 16px' }}
          >
            {signature}
          </motion.div>
        )}
        {showButton && (
          <motion.button
            type="button"
            onClick={onContinue}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            style={{
              marginTop: 8, width: '100%', border: 'none', borderRadius: 999,
              padding: '12px 18px', background: palette?.accent?.bg || 'linear-gradient(135deg,#ff7faa,#f85589)',
              color: palette?.accent?.fg || '#fff', fontFamily: '"Manrope", sans-serif', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', boxShadow: `0 12px 26px -8px ${palette?.accent?.glow || 'rgba(248,85,137,0.5)'}`,
            }}
          >
            {buttonText}
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
