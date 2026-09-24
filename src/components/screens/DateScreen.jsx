/**
 * © 2026 Date Invite Platform. Все права защищены.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

export default function DateScreen({ title, buttonText, mode = 'recipient_picks', fixedDate, tokens, onContinue }) {
  const [selected, setSelected] = useState(fixedDate || '');
  const canContinue = mode === 'creator_sets' ? true : Boolean(selected);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ background: tokens.card, borderRadius: 12, padding: 28, textAlign: 'center' }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div>
      <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        {title || 'Когда встретимся?'}
      </h1>

      {mode === 'creator_sets' ? (
        <p style={{ color: tokens.berry, fontFamily: tokens.fontUI, fontSize: 20, fontWeight: 700, margin: '16px 0 24px' }}>
          {fixedDate || 'Дата пока не выбрана'}
        </p>
      ) : (
        <input
          type="date"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            display: 'block', width: '100%', margin: '16px 0 24px',
            padding: '12px 16px', borderRadius: 6,
            border: `1.5px solid ${tokens.ink}20`,
            fontFamily: tokens.fontUI, fontSize: 15,
            color: tokens.ink, background: tokens.bg || '#fff',
          }}
        />
      )}

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="button"
        disabled={!canContinue}
        onClick={() => onContinue(mode === 'creator_sets' ? fixedDate : selected)}
        style={{
          background: tokens.berry, color: '#fff',
          padding: '12px 28px', borderRadius: 6,
          fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
          border: 'none', cursor: canContinue ? 'pointer' : 'not-allowed',
          opacity: canContinue ? 1 : 0.4,
        }}
      >
        {buttonText || 'Отлично →'}
      </motion.button>
    </motion.div>
  );
}
