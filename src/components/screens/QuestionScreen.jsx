/**
 * © 2026 Senti. Все права защищены.
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RunawayButton from '../ui/RunawayButton.jsx';

export const DEFAULT_NO_PHRASES = [
  'Нет', 'Ты уверена?', 'Правда?', 'А если подумать?',
  'Ну пожааалуйста', 'Ещё разок', 'Неееет 😭', 'Не поймаешь!',
];

export default function QuestionScreen({
  recipientName, questionText, mediaUrl,
  yesText = 'Да, конечно ❤️',
  noPhrases = DEFAULT_NO_PHRASES,
  recipientGender,
  tokens, onYes,
}) {
  const stageRef = useRef(null);
  const [answered, setAnswered] = useState(false);

  // Дефолтные (и любые унаследованные от них) фразы написаны в женском роде —
  // если получатель мужского пола, поправляем род на лету, не трогая остальной
  // текст (который мог быть кастомным и его менять не нужно).
  const effectiveNoPhrases = recipientGender === 'male'
    ? noPhrases.map((p) => (p === 'Ты уверена?' ? 'Ты уверен?' : p))
    : noPhrases;

  return (
    <div
      className="relative overflow-hidden text-center"
      style={{
        background: tokens.card,
        borderRadius: 24,
        padding: '36px 28px 32px',
        boxShadow: `0 24px 60px -20px ${tokens.ink}35, 0 2px 8px ${tokens.ink}08`,
      }}
    >
      {/* Перфорированный билетный край */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 12,
          backgroundImage: `radial-gradient(circle, ${tokens.bg} 4px, transparent 4.5px)`,
          backgroundSize: '18px 12px',
          backgroundPosition: '9px 0',
        }}
      />

      <AnimatePresence mode="wait" onExitComplete={onYes}>
        {!answered ? (
          <motion.div
            key="question"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            style={{ paddingTop: 8 }}
          >
            {mediaUrl && (
              <div style={{ position: 'relative', width: 136, height: 136, margin: '0 auto 20px' }}>
                <div style={{
                  position: 'absolute', inset: -10, borderRadius: '50%',
                  background: tokens.berry, opacity: 0.12,
                }} />
                <motion.img
                  src={mediaUrl} alt=""
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  style={{
                    position: 'relative',
                    width: 136, height: 136, borderRadius: 22, objectFit: 'cover',
                    boxShadow: `0 12px 28px -8px ${tokens.berry}55`,
                  }}
                />
              </div>
            )}

            <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 27, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>
              {recipientName || 'Привет'}
            </h1>
            <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 16, lineHeight: 1.55, marginBottom: 32, opacity: 0.9, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
              {questionText || 'Пойдёшь со мной на свидание?'}
            </p>

            <div ref={stageRef} style={{ position: 'relative', minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              {/* Кнопка ДА */}
              <motion.button
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => setAnswered(true)}
                style={{
                  background: `linear-gradient(135deg, ${tokens.berry}, ${tokens.amber || tokens.berry})`,
                  color: '#fff',
                  padding: '16px 40px', borderRadius: 100,
                  fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 16,
                  border: 'none', cursor: 'pointer',
                  boxShadow: `0 14px 30px -8px ${tokens.berry}60`,
                }}
              >
                {yesText}
              </motion.button>

              {/* Убегающая кнопка НЕТ */}
              <RunawayButton
                phrases={effectiveNoPhrases}
                containerRef={stageRef}
                style={{
                  border: `1.5px solid ${tokens.ink}25`,
                  color: tokens.inkMuted || tokens.ink,
                  padding: '11px 26px', borderRadius: 100,
                  fontFamily: tokens.fontUI, fontSize: 14, fontWeight: 600,
                  background: tokens.bg || '#fff', cursor: 'pointer',
                  opacity: 1,
                  boxShadow: `0 4px 12px ${tokens.ink}0D`,
                }}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            style={{ paddingTop: 24, paddingBottom: 8 }}
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 0.6 }}
              style={{ fontSize: 48, marginBottom: 12 }}
            >
              🥰
            </motion.div>
            <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
              {recipientGender === 'male' ? 'Он сказал ДА!' : 'Она сказала ДА!'}
            </h1>
            <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, opacity: 0.8 }}>
              Продолжаем…
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
