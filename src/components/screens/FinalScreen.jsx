/**
 * © 2026 Senti. Все права защищены.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QuestionCardFrame } from './questionCardShapes.jsx';

const FALL_HEART_ICONS = ['❤️', '💗', '✨'];

// Дождь сердечек на пару секунд после успешной отправки ответа — чуть более
// заметный "вау"-момент, чем просто статичный эмодзи.
function FallingHearts() {
  const [hearts, setHearts] = useState([]);

  useEffect(() => {
    setHearts(
      Array.from({ length: 14 }).map((_, i) => ({
        id: i,
        icon: FALL_HEART_ICONS[i % FALL_HEART_ICONS.length],
        left: 4 + Math.random() * 92,
        size: 13 + Math.random() * 11,
        duration: 1.7 + Math.random() * 1.1,
        delay: Math.random() * 0.6,
      }))
    );
    const timer = setTimeout(() => setHearts([]), 3200);
    return () => clearTimeout(timer);
  }, []);

  if (hearts.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 2 }}>
      {hearts.map((h) => (
        <motion.span
          key={h.id}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: 360, opacity: [0, 1, 1, 0], rotate: 70 }}
          transition={{ duration: h.duration, delay: h.delay, ease: 'linear' }}
          style={{ position: 'absolute', top: 0, left: `${h.left}%`, fontSize: h.size }}
        >
          {h.icon}
        </motion.span>
      ))}
    </div>
  );
}

export default function FinalScreen({ title, description, summary, mediaUrl, tokens, onSubmit, submitting, submitted, cardShape = 'classic' }) {
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
    <QuestionCardFrame shape={cardShape} tokens={tokens} mediaUrl={cardShape === 'polaroid' ? mediaUrl : undefined}>
      {submitted ? (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          style={{ position: 'relative' }}
        >
          <FallingHearts />
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
          {/* В "полароиде" фото уже показывает сама рамка карточки — не дублируем */}
          {cardShape !== 'polaroid' && (mediaUrl ? (
            <img
              src={mediaUrl} alt=""
              style={{ width: 128, height: 128, borderRadius: 12, objectFit: 'cover', objectPosition: 'center', margin: '0 auto 16px', display: 'block' }}
            />
          ) : (
            <div style={{ fontSize: 48, marginBottom: 12 }}>💌</div>
          ))}
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
