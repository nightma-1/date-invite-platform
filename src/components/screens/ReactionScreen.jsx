/**
 * © 2026 Senti. Все права защищены.
 */

import { motion } from 'framer-motion';
import { QuestionCardFrame } from './questionCardShapes.jsx';

export default function ReactionScreen({ title, text, mediaUrl, recipientGender, tokens, onContinue, cardShape = 'classic' }) {
  // Заголовок обращён к получателю ("ты сказала") — род от пола получателя.
  // Текст написан от лица отправителя ("я была готова") — предполагаем
  // гетеросексуальную пару, поэтому род отправителя обратный полу получателя.
  const defaultTitle = recipientGender === 'male' ? 'Ого… ты сказал ДА?! 😱' : 'Ого… ты сказала ДА?! 😱';
  const defaultText = recipientGender === 'male'
    ? 'Я безумно рада! Теперь у меня есть повод подготовиться к нашему свиданию ❤️'
    : 'Я безумно рад! Теперь у меня есть повод подготовиться к нашему свиданию ❤️';
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
    <QuestionCardFrame shape={cardShape} tokens={tokens} mediaUrl={cardShape === 'polaroid' ? mediaUrl : undefined}>
      {/* В "полароиде" фото уже показывает сама рамка карточки — не дублируем */}
      {cardShape !== 'polaroid' && (mediaUrl ? (
        <motion.img
          src={mediaUrl} alt=""
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 260 }}
          style={{ width: 128, height: 128, borderRadius: 12, objectFit: 'cover', margin: '0 auto 16px' }}
        />
      ) : (
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ repeat: 2, duration: 0.5, delay: 0.2 }}
          style={{ fontSize: 52, marginBottom: 12 }}
        >
          ❤️
        </motion.div>
      ))}

      <h1 style={{ fontFamily: tokens.fontDisplay, color: tokens.ink, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        {title || defaultTitle}
      </h1>
      <p style={{ color: tokens.inkMuted || tokens.ink, fontFamily: tokens.fontUI, fontSize: 14, lineHeight: 1.6, marginBottom: 24, opacity: 0.85 }}>
        {text || defaultText}
      </p>

      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="button"
        onClick={onContinue}
        style={{
          background: `linear-gradient(135deg, ${tokens.berry}, ${tokens.amber || tokens.berry})`, color: '#fff',
          padding: '15px 30px', borderRadius: 100,
          fontFamily: tokens.fontUI, fontWeight: 700, fontSize: 15,
          border: 'none', cursor: 'pointer',
          boxShadow: `0 14px 30px -8px ${tokens.berry}60`,
        }}
      >
        Тогда продолжаем →
      </motion.button>
    </QuestionCardFrame>
    </motion.div>
  );
}
