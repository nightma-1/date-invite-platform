/**
 * © 2026 Senti. Все права защищены.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

function ChoiceSection({ title, options, allowMultiple, tokens, selected, onToggle }) {
  return (
    <div style={{ background: tokens.card, borderRadius: 12, padding: 22, textAlign: 'left' }}>
      <h2 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 17, fontWeight: 700, marginBottom: 14 }}>
        {title}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {options.map((opt, i) => {
          const isSelected = selected.includes(opt.id);
          return (
            <motion.button
              key={opt.id}
              type="button"
              onClick={() => onToggle(opt.id)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                padding: '12px 6px', borderRadius: 10,
                border: `2px solid ${isSelected ? tokens.berry : tokens.ink + '18'}`,
                background: isSelected
                  ? `linear-gradient(135deg, ${tokens.berry}, ${tokens.amber || tokens.berry})`
                  : (tokens.bg || '#fff'),
                color: isSelected ? '#fff' : tokens.ink,
                fontFamily: tokens.fontUI, fontSize: 12.5, fontWeight: isSelected ? 700 : 500,
                cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 4 }}>{opt.icon || '✨'}</div>
              {opt.label}
            </motion.button>
          );
        })}
      </div>
      {allowMultiple && (
        <p style={{ marginTop: 10, fontSize: 11.5, color: tokens.inkMuted || tokens.ink, opacity: 0.55, fontFamily: tokens.fontUI }}>
          Можно выбрать несколько вариантов
        </p>
      )}
    </div>
  );
}

export default function DoubleChoiceScreen({
  placeTitle, placeOptions = [], placeAllowMultiple,
  foodTitle, foodOptions = [], foodAllowMultiple,
  tokens, onContinue,
}) {
  const [place, setPlace] = useState([]);
  const [food, setFood] = useState([]);

  function togglePlace(id) {
    setPlace((prev) => (placeAllowMultiple
      ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
      : [id]));
  }
  function toggleFood(id) {
    setFood((prev) => (foodAllowMultiple
      ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
      : [id]));
  }

  const canContinue = place.length > 0 && food.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
        Теперь самое интересное 😏
      </h1>
      <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 13.5, opacity: 0.75, textAlign: 'center', marginBottom: 20 }}>
        Куда хочешь пойти и что будем есть?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ChoiceSection
          title={placeTitle || 'Куда пойти?'}
          options={placeOptions}
          allowMultiple={placeAllowMultiple}
          tokens={tokens}
          selected={place}
          onToggle={togglePlace}
        />
        <ChoiceSection
          title={foodTitle || 'Что будем есть?'}
          options={foodOptions}
          allowMultiple={foodAllowMultiple}
          tokens={tokens}
          selected={food}
          onToggle={toggleFood}
        />
      </div>

      <motion.button
        whileHover={{ scale: canContinue ? 1.03 : 1 }}
        whileTap={{ scale: canContinue ? 0.97 : 1 }}
        type="button"
        disabled={!canContinue}
        onClick={() => onContinue({ placeIds: place, foodIds: food })}
        style={{
          display: 'block', width: '100%', marginTop: 22,
          background: tokens.berry, color: '#fff',
          padding: '14px 28px', borderRadius: 100,
          fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
          border: 'none', cursor: canContinue ? 'pointer' : 'not-allowed',
          opacity: canContinue ? 1 : 0.4,
          boxShadow: canContinue ? `0 14px 30px -8px ${tokens.berry}60` : 'none',
        }}
      >
        Договорились →
      </motion.button>
    </motion.div>
  );
}
