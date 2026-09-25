/**
 * © 2026 Senti. Все права защищены.
 *
 * Формы "рамки" карточки вопроса — временный набор для живого сравнения
 * на проде через ?card=arch|envelope|polaroid|blob (см. QuestionScreen.jsx).
 * Внутреннее содержимое (имя/вопрос/кнопки) остаётся общим — меняется
 * только обрамление.
 */

import { motion } from 'framer-motion';

export const CARD_SHAPES = ['classic', 'arch', 'envelope', 'polaroid', 'blob'];

export function ClassicFrame({ tokens, children }) {
  return (
    <div
      style={{
        position: 'relative',
        background: tokens.card,
        borderRadius: 24,
        padding: '36px 28px 32px',
        boxShadow: `0 24px 60px -20px ${tokens.ink}35, 0 2px 8px ${tokens.ink}08`,
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 12,
          backgroundImage: `radial-gradient(circle, ${tokens.bg} 4px, transparent 4.5px)`,
          backgroundSize: '18px 12px',
          backgroundPosition: '9px 0',
        }}
      />
      <div style={{ paddingTop: 8 }}>{children}</div>
    </div>
  );
}

export function ArchFrame({ tokens, children }) {
  return (
    <div
      style={{
        background: tokens.card,
        borderRadius: '144px 144px 22px 22px',
        padding: '60px 26px 34px',
        boxShadow: `0 24px 60px -20px ${tokens.ink}35, 0 2px 8px ${tokens.ink}08`,
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

export function EnvelopeFrame({ tokens, children }) {
  const accentGrad = `linear-gradient(135deg, ${tokens.berry}, ${tokens.amber || tokens.berry})`;
  return (
    <div style={{ position: 'relative' }}>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 110,
          background: accentGrad,
          clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: 'relative', zIndex: 2, marginTop: 34,
          background: tokens.card, borderRadius: 22, padding: '86px 26px 34px',
          boxShadow: `0 24px 60px -20px ${tokens.ink}35, 0 2px 8px ${tokens.ink}08`,
          textAlign: 'center', boxSizing: 'border-box',
        }}
      >
        <p style={{
          margin: '0 0 6px', fontFamily: tokens.fontUI, fontSize: 11, fontWeight: 700,
          letterSpacing: '.06em', textTransform: 'uppercase', color: tokens.berry, opacity: 0.8,
        }}>
          Тебе письмо 💌
        </p>
        {children}
      </div>
      <motion.div
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: 70, left: '50%', transform: 'translate(-50%, -50%)', zIndex: 3,
          width: 56, height: 56, borderRadius: '50%',
          background: accentGrad,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 8px 20px -6px ${tokens.berry}60`, border: `3px solid ${tokens.card}`,
        }}
      >
        <span style={{ fontSize: 22 }}>❤️</span>
      </motion.div>
    </div>
  );
}

export function PolaroidFrame({ tokens, mediaUrl, children }) {
  const photoBg = tokens.card === '#FFFFFF' ? '#ffeef5' : tokens.bgDark;
  return (
    <motion.div
      initial={{ rotate: -2 }}
      whileHover={{ rotate: 0 }}
      transition={{ duration: 0.35 }}
      style={{
        position: 'relative', background: tokens.card, borderRadius: 4,
        padding: '14px 14px 0', boxShadow: `0 24px 60px -18px ${tokens.ink}40, 0 2px 8px ${tokens.ink}10`,
        boxSizing: 'border-box',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: -14, left: 28, width: 66, height: 24,
          background: `${tokens.bg}EB`, border: `1px solid ${tokens.ink}14`,
          transform: 'rotate(-8deg)', boxShadow: `0 3px 6px ${tokens.ink}25`,
        }}
      />
      <div style={{
        background: `linear-gradient(160deg, ${tokens.bg}, ${photoBg})`,
        borderRadius: 2, minHeight: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {mediaUrl
          ? <img src={mediaUrl} alt="" style={{ width: '100%', height: 200, objectFit: 'cover' }} />
          : <span style={{ fontSize: 64 }}>💌</span>}
      </div>
      <div style={{ padding: '20px 8px 26px', textAlign: 'center' }}>
        {children}
      </div>
    </motion.div>
  );
}

export function BlobFrame({ tokens, children }) {
  return (
    <motion.div
      animate={{
        borderRadius: [
          '42% 58% 62% 38% / 48% 42% 58% 52%',
          '58% 42% 38% 62% / 42% 58% 42% 58%',
          '42% 58% 62% 38% / 48% 42% 58% 52%',
        ],
      }}
      transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        background: tokens.card, padding: '54px 40px', minHeight: 420,
        boxShadow: `0 24px 60px -20px ${tokens.ink}32, 0 2px 8px ${tokens.ink}08`,
        textAlign: 'center', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </motion.div>
  );
}

export function QuestionCardFrame({ shape, tokens, mediaUrl, children }) {
  switch (shape) {
    case 'arch': return <ArchFrame tokens={tokens}>{children}</ArchFrame>;
    case 'envelope': return <EnvelopeFrame tokens={tokens}>{children}</EnvelopeFrame>;
    case 'polaroid': return <PolaroidFrame tokens={tokens} mediaUrl={mediaUrl}>{children}</PolaroidFrame>;
    case 'blob': return <BlobFrame tokens={tokens}>{children}</BlobFrame>;
    default: return <ClassicFrame tokens={tokens}>{children}</ClassicFrame>;
  }
}
