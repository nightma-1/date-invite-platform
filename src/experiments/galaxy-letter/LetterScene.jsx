/**
 * © 2026 Senti.
 * Письмо на "бумаге" — текст появляется построчно, затем кнопка продолжить.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function LetterScene({ heading, paragraphs, buttonText = 'нажми, там сюрприз', onContinue }) {
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
          boxShadow: '0 30px 70px -20px rgba(40,20,100,0.5)', padding: '28px 24px',
          fontFamily: '"Cormorant Garamond", "PT Serif", serif', color: '#2a2440',
        }}
      >
        {heading && (
          <div style={{ fontSize: 15, color: '#8a7fd1', marginBottom: 14, fontStyle: 'italic' }}>{heading}</div>
        )}
        {lines.slice(0, visibleCount).map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            style={{ fontSize: 17, lineHeight: 1.6, margin: '0 0 12px' }}
          >
            {line}
          </motion.p>
        ))}
        {showButton && (
          <motion.button
            type="button"
            onClick={onContinue}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.97 }}
            style={{
              marginTop: 8, width: '100%', border: 'none', borderRadius: 999,
              padding: '12px 18px', background: 'linear-gradient(135deg, #8a6fe8, #5a3fc0)',
              color: '#fff', fontFamily: '"Manrope", sans-serif', fontSize: 14,
              fontWeight: 600, cursor: 'pointer', boxShadow: '0 10px 24px -8px rgba(90,63,192,0.6)',
            }}
          >
            {buttonText}
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}
