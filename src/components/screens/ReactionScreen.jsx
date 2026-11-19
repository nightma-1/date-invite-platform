/**
 * © 2026 Senti. Все права защищены.
 */

import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import SmartMedia from '../ui/SmartMedia.jsx';
import { QuestionCardFrame } from './questionCardShapes.jsx';

export default function ReactionScreen({ title, text, confirmText, mediaUrl, recipientGender, tokens, onContinue, cardShape = 'classic' }) {
  const { t } = useTranslation();
  // Заголовок обращён к получателю ("ты сказала") — род от пола получателя.
  // Текст написан от лица отправителя ("я была готова") — предполагаем
  // гетеросексуальную пару, поэтому род отправителя обратный полу получателя.
  // Пол больше не спрашиваем — у новых приглашений он null, тексты без рода.
  const g = recipientGender === 'male' ? 'Male' : recipientGender === 'female' ? 'Female' : null;
  const defaultTitle = g ? t(`screens.reactionTitle${g}`) : t('screens.reactionTitleNeutral');
  const defaultText = g ? t(`screens.reactionTextTo${g}`) : t('screens.reactionTextNeutral');
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
    <QuestionCardFrame shape={cardShape} tokens={tokens} mediaUrl={cardShape === 'polaroid' ? mediaUrl : undefined}>
      {/* В "полароиде" фото уже показывает сама рамка карточки — не дублируем */}
      {cardShape !== 'polaroid' && (mediaUrl ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 260 }}
          style={{ width: 128, height: 128, margin: '0 auto 16px' }}
        >
          <SmartMedia
            src={mediaUrl}
            objectFit="cover" objectPosition="center"
            style={{ width: '100%', height: '100%', borderRadius: 12 }}
          />
        </motion.div>
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
        {/* Текст кнопки задаёт автор («Кнопка подтверждения» в конструкторе);
            запасной — только для пустого поля */}
        {String(confirmText || '').trim() || t('screens.reactionContinue')}
      </motion.button>
    </QuestionCardFrame>
    </motion.div>
  );
}
