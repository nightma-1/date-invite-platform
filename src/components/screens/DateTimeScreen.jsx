/**
 * © 2026 Senti. Все права защищены.
 *
 * Дата и время на одном экране получателя — раньше были два отдельных
 * шага (DateScreen + TimeScreen), теперь пользователь заполняет их
 * вместе и продолжает одним нажатием.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';

export default function DateTimeScreen({ title, buttonText, mode = 'recipient_picks', fixedDate, fixedTime, tokens, onContinue }) {
  const [selectedDate, setSelectedDate] = useState(fixedDate || '');
  const [selectedTime, setSelectedTime] = useState(fixedTime || '');
  const canContinue = mode === 'creator_sets' ? true : Boolean(selectedDate) && Boolean(selectedTime);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background: tokens.card, borderRadius: 24, padding: '32px 26px',
        boxShadow: `0 24px 60px -20px ${tokens.ink}35, 0 2px 8px ${tokens.ink}08`,
        textAlign: 'center', boxSizing: 'border-box',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>🗓️</div>
      <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        {title || 'Когда встретимся?'}
      </h1>

      {mode === 'creator_sets' ? (
        <p style={{ color: tokens.berry, fontFamily: tokens.fontUI, fontSize: 20, fontWeight: 700, margin: '16px 0 24px' }}>
          {fixedDate || 'Дата'}{fixedDate && fixedTime ? ' · ' : ''}{fixedTime || (fixedDate ? '' : 'Время пока не выбраны')}
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 10, margin: '16px 0 24px' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              flex: 1, minWidth: 0,
              padding: '12px 10px', borderRadius: 6,
              border: `1.5px solid ${tokens.ink}20`,
              fontFamily: tokens.fontUI, fontSize: 14,
              color: tokens.ink, background: tokens.bg || '#fff',
            }}
          />
          <input
            type="time"
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            style={{
              flex: 1, minWidth: 0,
              padding: '12px 10px', borderRadius: 6,
              border: `1.5px solid ${tokens.ink}20`,
              fontFamily: tokens.fontUI, fontSize: 14,
              color: tokens.ink, background: tokens.bg || '#fff',
            }}
          />
        </div>
      )}

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="button"
        disabled={!canContinue}
        onClick={() => onContinue({
          date: mode === 'creator_sets' ? fixedDate : selectedDate,
          time: mode === 'creator_sets' ? fixedTime : selectedTime,
        })}
        style={{
          background: `linear-gradient(135deg, ${tokens.berry}, ${tokens.amber || tokens.berry})`, color: '#fff',
          padding: '15px 30px', borderRadius: 100,
          fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
          border: 'none', cursor: canContinue ? 'pointer' : 'not-allowed',
          opacity: canContinue ? 1 : 0.4,
          boxShadow: canContinue ? `0 14px 30px -8px ${tokens.berry}60` : 'none',
        }}
      >
        {buttonText || 'Отлично →'}
      </motion.button>
    </motion.div>
  );
}
