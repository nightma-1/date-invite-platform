/**
 * © 2026 Senti. Все права защищены.
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import RunawayButton from '../ui/RunawayButton.jsx';
import { QuestionCardFrame } from './questionCardShapes.jsx';

// Фолбэк на случай, если i18n ещё не инициализирован — сам компонент всегда
// берёт актуальный, переведённый набор через useTranslation() ниже.
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
  yesText,
  noPhrases,
  recipientGender,
  tokens, onYes,
  // Временный переключатель формы карточки для живого сравнения на проде —
  // ?card=arch|envelope|polaroid|blob (см. InvitationRuntime.jsx). Уберём,
  // когда определимся с финальным вариантом.
  cardShape = 'classic',
  // Точки прогресса по всему сценарию приглашения (необязательные —
  // без них просто не рендерим ряд точек).
  stepIndex,
  stepCount,
}) {
  const { t } = useTranslation();
  const stageRef = useRef(null);
  const [answered, setAnswered] = useState(false);
  const [bursts, setBursts] = useState([]);
  const [rings, setRings] = useState([]);
  const cardPulse = useAnimationControls();

  // yesText/noPhrases без явного значения от автора (напр. в превью на
  // лендинге и в конструкторе) переводятся под текущий язык сайта — это
  // UI-заглушки, а не авторский текст приглашения.
  const effectiveYesText = yesText || t('questionScreen.yesDefault');
  const effectiveNoPhrasesRaw = noPhrases || t('questionScreen.noPhrases', { returnObjects: true });

  // Дефолтные (и любые унаследованные от них) фразы написаны в женском роде —
  // если получатель мужского пола, поправляем род на лету, не трогая остальной
  // текст (который мог быть кастомным и его менять не нужно).
  const effectiveNoPhrases = recipientGender === 'male'
    ? effectiveNoPhrasesRaw.map((p) => (p === 'Ты уверена?' ? 'Ты уверен?' : p))
    : effectiveNoPhrasesRaw;

  const showAvatar = Boolean(mediaUrl) && !['polaroid', 'envelope'].includes(cardShape);

  function handleYes() {
    // "Вау"-момент собран из слоёв, которые бьют одновременно —
    // ударная волна колец от кнопки, взрыв сердечек и импульс всей
    // карточки. Переход на следующий экран по-прежнему жёстко привязан
    // к длительности эффекта
    // и случается СРАЗУ по его завершении, без паузы (иначе кажется,
    // будто интерфейс подвисает) — только сам эффект теперь чуть дольше
    // и заметно весомее, чем раньше.
    const BURST_DURATION = 0.85;

    // 1) Взрыв сердечек
    const items = Array.from({ length: 16 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 16 + Math.random() * 0.3;
      const dist = 65 + Math.random() * 50;
      return {
        id: `${Date.now()}-${i}`,
        icon: BURST_ICONS[i % BURST_ICONS.length],
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 30,
        duration: BURST_DURATION + Math.random() * 0.1,
        rotation: Math.random() * 240,
      };
    });
    setBursts(items);

    // 2) Ударная волна — два кольца, расходящихся от кнопки
    setRings([
      { id: `${Date.now()}-r1`, delay: 0 },
      { id: `${Date.now()}-r2`, delay: 0.09 },
    ]);

    // 3) Импульс всей карточки — придаёт эффекту вес
    cardPulse.start({
      scale: [1, 1.035, 0.985, 1],
      transition: { duration: BURST_DURATION * 0.85, ease: [0.34, 1.56, 0.64, 1] },
    });

    setTimeout(() => {
      setRings([]);
    }, BURST_DURATION * 1000 + 150);

    setTimeout(() => setAnswered(true), BURST_DURATION * 1000);
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
          {Number.isInteger(stepIndex) && stepCount > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginBottom: 18 }}>
              {Array.from({ length: stepCount }).map((_, i) => (
                <motion.div
                  key={i}
                  animate={i === stepIndex ? { boxShadow: ['0 0 0 0 ' + tokens.berry + '73', '0 0 0 4px ' + tokens.berry + '00', '0 0 0 0 ' + tokens.berry + '73'] } : {}}
                  transition={i === stepIndex ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : {}}
                  style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: i === stepIndex ? tokens.berry : `${tokens.ink}25`,
                  }}
                />
              ))}
            </div>
          )}
          <motion.div style={{ position: 'relative' }} animate={cardPulse}>
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
                    whileHover={{
                      scale: 1.08,
                      y: -4,
                      boxShadow: `0 20px 40px -8px ${tokens.berry}80`,
                    }}
                    whileTap={{
                      scale: 0.92,
                      boxShadow: `0 8px 16px -8px ${tokens.berry}60`,
                    }}
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
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'box-shadow 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }}
                  >
                    {/* Блеск при наведении */}
                    <motion.div
                      initial={{ x: '-100%' }}
                      whileHover={{ x: '100%' }}
                      transition={{ duration: 0.5 }}
                      style={{
                        position: 'absolute',
                        top: 0, left: 0,
                        width: '30%', height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                        pointerEvents: 'none',
                      }}
                    />
                    {effectiveYesText}
                  </motion.button>

                  {/* Ударная волна — расширяющиеся кольца от кнопки */}
                  <div style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' }}>
                    <AnimatePresence>
                      {rings.map((r) => (
                        <motion.span
                          key={r.id}
                          initial={{ opacity: 0.85, scale: 0.6, x: '-50%', y: '-50%' }}
                          animate={{ opacity: 0, scale: 1.7 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.65, delay: r.delay, ease: 'easeOut' }}
                          style={{
                            position: 'absolute',
                            width: 140, height: 60,
                            borderRadius: 100,
                            border: `2px solid ${tokens.berry}`,
                          }}
                        />
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Взрыв сердечек при "Да" */}
                  <div style={{ position: 'absolute', left: '50%', top: '50%', pointerEvents: 'none' }}>
                    <AnimatePresence>
                      {bursts.map((b) => (
                        <motion.span
                          key={b.id}
                          initial={{
                            opacity: 0,
                            x: '-50%',
                            y: '-50%',
                            scale: 0.2,
                            rotate: 0,
                          }}
                          animate={{
                            opacity: [0, 1, 0.8, 0],
                            x: [`-50%`, `calc(-50% + ${b.dx}px)`],
                            y: [`-50%`, `calc(-50% + ${b.dy}px)`],
                            scale: [0.2, 1.2, 0.9, 0.5],
                            rotate: [0, b.rotation],
                          }}
                          transition={{
                            duration: b.duration,
                            ease: [0.1, 0.8, 0.2, 1],
                            opacity: { times: [0, 0.4, 0.8, 1] },
                            scale: { times: [0, 0.3, 0.7, 1] },
                            rotate: { duration: b.duration * 0.8 },
                          }}
                          style={{
                            position: 'absolute',
                            fontSize: 22,
                            fontWeight: 'bold',
                            textShadow: `0 2px 8px rgba(0,0,0,0.2)`,
                            filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))',
                          }}
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
                {recipientGender === 'male' ? t('questionScreen.saidYesMale') : t('questionScreen.saidYesFemale')}
              </h1>
              <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, opacity: 0.8 }}>
                {t('questionScreen.continuing')}
              </p>
            </div>
          </QuestionCardFrame>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
