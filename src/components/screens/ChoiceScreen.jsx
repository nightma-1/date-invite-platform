/**
 * © 2026 Senti. Все права защищены.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

export default function ChoiceScreen({ title, subtitle, options = [], allowMultiple, tokens, onContinue }) {
  const [selected, setSelected] = useState([]);

  function toggle(optionId) {
    if (allowMultiple) {
      setSelected((prev) => prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId]);
    } else {
      setSelected([optionId]);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ background: tokens.card, borderRadius: 12, padding: 28, textAlign: 'center' }}
    >
      <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        {title || 'Что выберешь?'}
      </h1>
      {subtitle && (
        <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 13, marginBottom: 16, opacity: 0.7 }}>
          {subtitle}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '20px 0 24px' }}>
        {options.map((opt, i) => {
          const isSelected = selected.includes(opt.id);
          return (
            <motion.button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{
                padding: '14px 10px', borderRadius: 8,
                border: `2px solid ${isSelected ? tokens.berry : tokens.ink + '18'}`,
                background: isSelected ? tokens.berry + '12' : tokens.bg || '#fff',
                color: tokens.ink,
                fontFamily: tokens.fontUI, fontSize: 14, fontWeight: isSelected ? 600 : 400,
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              {opt.imageUrl ? (
                <img src={opt.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', margin: '0 auto 6px' }} />
              ) : (
                <div style={{ fontSize: 24, marginBottom: 4 }}>{opt.icon || '✨'}</div>
              )}
              {opt.label}
            </motion.button>
          );
        })}
      </div>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="button"
        disabled={selected.length === 0}
        onClick={() => onContinue(selected)}
        style={{
          background: tokens.berry, color: '#fff',
          padding: '12px 28px', borderRadius: 6,
          fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
          border: 'none', cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
          opacity: selected.length > 0 ? 1 : 0.4,
        }}
      >
        Договорились →
      </motion.button>
    </motion.div>
  );
}
