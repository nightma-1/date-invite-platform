/**
 * © 2026 Senti. Все права защищены.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { QuestionCardFrame } from './questionCardShapes.jsx';

export default function FinalScreen({ title, description, summary, tokens, onSubmit, submitting, submitted, cardShape = 'classic' }) {
  const [localError, setLocalError] = useState(null);

  async function handleSubmit() {
    setLocalError(null);
    try { await onSubmit(); } catch { setLocalError('Не получилось отправить. Попробуй ещё раз.'); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
    <QuestionCardFrame shape={cardShape} tokens={tokens}>
      {submitted ? (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
          <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            Ответ отправлен!
          </h1>
          <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, opacity: 0.8 }}>
            Он уже знает. Ждите встречи ❤️
          </p>
        </motion.div>
      ) : (
        <>
          <div style={{ fontSize: 48, marginBottom: 12 }}>💌</div>
          <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
            {title || 'Ну всё, теперь пути назад нет 😄❤️'}
          </h1>
          <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, lineHeight: 1.6, marginBottom: 16, opacity: 0.85 }}>
            {description || 'Наше свидание официально запланировано!'}
          </p>

          {summary?.length > 0 && (
            <div style={{
              background: tokens.bg || '#fafafa', borderRadius: 8,
              padding: '12px 16px', marginBottom: 20, textAlign: 'left',
            }}>
              {summary.map((line) => (
                <p key={line} style={{ color: tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, margin: '4px 0' }}>
                  {line}
                </p>
              ))}
            </div>
          )}

          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              background: `linear-gradient(135deg, ${tokens.berry}, ${tokens.amber || tokens.berry})`, color: '#fff',
              padding: '15px 30px', borderRadius: 100,
              fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
              border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
              boxShadow: submitting ? 'none' : `0 14px 30px -8px ${tokens.berry}60`,
            }}
          >
            {submitting ? 'Отправляем…' : 'Отправить подтверждение 💌'}
          </motion.button>

          {localError && (
            <p style={{ color: '#C0392B', fontFamily: tokens.fontUI, fontSize: 13, marginTop: 10 }}>
              {localError}
            </p>
          )}
        </>
      )}
    </QuestionCardFrame>
    </motion.div>
  );
}
