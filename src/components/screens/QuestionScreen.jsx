/**
 * © 2026 Senti. Все права защищены.
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import RunawayButton from '../ui/RunawayButton.jsx';
import { QuestionCardFrame } from './questionCardShapes.jsx';

export const DEFAULT_NO_PHRASES = [
  'Нет', 'Ты уверена?', 'Правда?', 'А если подумать?',
  'Ну пожааалуйста', 'Ещё разок', 'Неееет 😭', 'Не поймаешь!',
];

const BURST_ICONS = ['❤️', '💗', '✨', '💫', '🤍'];

const contentVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.3, 1] } },
};

export default function QuestionScreen({
  recipientName, questionText, mediaUrl,
  yesText = 'Да, конечно ❤️',
  noPhrases = DEFAULT_NO_PHRASES,
  recipientGender,
  tokens, onYes,
  // Временный переключатель формы карточки для живого сравнения на проде —
  // ?card=arch|envelope|polaroid|blob (см. InvitationRuntime.jsx). Уберём,
  // когда определимся с финальным вариантом.
  cardShape = 'classic',
}) {
  const stageRef = useRef(null);
  const [answered, setAnswered] = useState(false);
  const [bursts, setBursts] = useState([]);

  // Дефолтные (и любые унаследованные от них) фразы написаны в женском роде —
  // если получатель мужского пола, поправляем род на лету, не трогая остальной
  // текст (который мог быть кастомным и его менять не нужно).
  const effectiveNoPhrases = recipientGender === 'male'
    ? noPhrases.map((p) => (p === 'Ты уверена?' ? 'Ты уверен?' : p))
    : noPhrases;

  const showAvatar = Boolean(mediaUrl) && !['polaroid', 'envelope'].includes(cardShape);

  function handleYes() {
    const items = Array.from({ length: 10 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 10 + Math.random() * 0.4;
      const dist = 70 + Math.random() * 40;
      return {
        id: `${Date.now()}-${i}`,
        icon: BURST_ICONS[i % BURST_ICONS.length],
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 30,
        duration: 0.9 + Math.random() * 0.3,
      };
    });
    setBursts(items);
    setTimeout(() => setBursts([]), 1300);
    setAnswered(true);
  }

  return (
    <AnimatePresence mode="wait" onExitComplete={onYes}>
      {!answered ? (
        <motion.div
          key="question"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
        >
          <QuestionCardFrame shape={cardShape} tokens={tokens} mediaUrl={mediaUrl}>
            <motion.div variants={contentVariants} initial="hidden" animate="show">
              {showAvatar && (
                <motion.div variants={itemVariants} style={{ position: 'relative', width: 136, height: 136, margin: '0 auto 20px' }}>
                  <div style={{
                    position: 'absolute', inset: -10, borderRadius: '50%',
                    background: tokens.berry, opacity: 0.12,
                  }} />
                  <img
                    src={mediaUrl} alt=""
                    style={{
                      position: 'relative',
                      width: 136, height: 136, borderRadius: 22, objectFit: 'cover',
                      boxShadow: `0 12px 28px -8px ${tokens.berry}55`,
                    }}
                  />
                </motion.div>
              )}

              <motion.h1 variants={itemVariants} style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 27, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>
                {recipientName || 'Привет'}
              </motion.h1>
              <motion.p variants={itemVariants} style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 16, lineHeight: 1.55, marginBottom: 32, opacity: 0.9, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
                {questionText || 'Пойдёшь со мной на свидание?'}
              </motion.p>

              <motion.div
                variants={itemVariants}
                ref={stageRef}
                style={{ position: 'relative', minHeight: 130, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
              >
                {/* Кнопка ДА */}
                <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
                  <motion.button
                    whileHover={{ scale: 1.04, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={handleYes}
                    style={{
                      width: '100%',
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

                  {/* Взрыв сердечек при "Да" */}
                  <div style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' }}>
                    <AnimatePresence>
                      {bursts.map((b) => (
                        <motion.span
                          key={b.id}
                          initial={{ opacity: 0, x: '-50%', y: '-50%', scale: 0.4 }}
                          animate={{ opacity: [0, 1, 0], x: [`-50%`, `calc(-50% + ${b.dx}px)`], y: [`-50%`, `calc(-50% + ${b.dy}px)`], scale: [0.4, 1.1, 0.7] }}
                          transition={{ duration: b.duration, ease: [0.2, 0.7, 0.3, 1] }}
                          style={{ position: 'absolute', fontSize: 18 }}
                      >
                        {b.icon}
                      </motion.span>
                    ))}
                    </AnimatePresence>
                  </div>
                </div>

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
              </motion.div>
            </motion.div>
          </QuestionCardFrame>
        </motion.div>
      ) : (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
        >
          <QuestionCardFrame shape={cardShape} tokens={tokens} mediaUrl={mediaUrl}>
            <div style={{ paddingTop: 16, paddingBottom: 8 }}>
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
            </div>
          </QuestionCardFrame>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
