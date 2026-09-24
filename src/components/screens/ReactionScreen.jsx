/**
 * © 2026 Senti. Все права защищены.
 */

import { motion } from 'framer-motion';

export default function ReactionScreen({ title, text, mediaUrl, tokens, onContinue }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ background: tokens.card, borderRadius: 12, padding: 28, textAlign: 'center' }}
    >
      {mediaUrl ? (
        <motion.img
          src={mediaUrl} alt=""
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 260 }}
          style={{ width: 128, height: 128, borderRadius: 12, objectFit: 'cover', margin: '0 auto 16px' }}
        />
      ) : (
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: 2, duration: 0.5, delay: 0.2 }}
          style={{ fontSize: 52, marginBottom: 12 }}
        >
          ❤️
        </motion.div>
      )}

      <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        {title || 'Ого… ты сказала ДА?! 😱'}
      </h1>
      <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, lineHeight: 1.6, marginBottom: 24, opacity: 0.85 }}>
        {text || 'Я безумно рад! Теперь у меня есть повод подготовиться к нашему свиданию ❤️'}
      </p>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="button"
        onClick={onContinue}
        style={{
          background: tokens.berry, color: '#fff',
          padding: '12px 28px', borderRadius: 6,
          fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
          border: 'none', cursor: 'pointer',
        }}
      >
        Тогда продолжаем →
      </motion.button>
    </motion.div>
  );
}
