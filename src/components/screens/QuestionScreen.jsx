/**
 * © 2026 Date Invite Platform. Все права защищены.
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RunawayButton from '../ui/RunawayButton.jsx';

const DEFAULT_NO_PHRASES = [
  'Нет', 'Ты уверена?', 'Правда?', 'А если подумать?',
  'Ну пожааалуйста', 'Ещё разок', 'Неееет 😭', 'Не поймаешь!',
];

export default function QuestionScreen({
  recipientName, questionText, mediaUrl,
  yesText = 'Да, конечно ❤️',
  noPhrases = DEFAULT_NO_PHRASES,
  tokens, onYes,
}) {
  const stageRef = useRef(null);
  const [answered, setAnswered] = useState(false);

  return (
    <div
      className="relative overflow-hidden text-center"
      style={{ background: tokens.card, borderRadius: 12, padding: 28 }}
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
              <motion.img
                src={mediaUrl} alt=""
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                style={{ width: 112, height: 112, borderRadius: 12, objectFit: 'cover', margin: '0 auto 16px' }}
              />
            )}

            <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
              {recipientName || 'Привет'}
            </h1>
            <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 15, lineHeight: 1.5, marginBottom: 28, opacity: 0.85 }}>
              {questionText || 'Пойдёшь со мной на свидание?'}
            </p>

            <div ref={stageRef} style={{ position: 'relative', height: 120 }}>
              {/* Кнопка ДА */}
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => setAnswered(true)}
                style={{
                  background: tokens.berry, color: '#fff',
                  padding: '12px 28px', borderRadius: 6,
                  fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
                  border: 'none', cursor: 'pointer',
                }}
              >
                {yesText}
              </motion.button>

              {/* Убегающая кнопка НЕТ */}
              <RunawayButton
                phrases={noPhrases}
                containerRef={stageRef}
                style={{
                  border: `1px solid ${tokens.ink}30`,
                  color: tokens.inkMuted || tokens.ink,
                  padding: '10px 20px', borderRadius: 6,
                  fontFamily: tokens.fontUI, fontSize: 14,
                  background: 'transparent', cursor: 'pointer',
                  opacity: 0.7,
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
            <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              Она сказала ДА!
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
