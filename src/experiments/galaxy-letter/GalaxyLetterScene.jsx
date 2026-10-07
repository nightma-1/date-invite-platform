/**
 * © 2026 Senti.
 * Полная сцена galaxy-letter: конверт → письмо → единый "космос" (одна
 * система текстовых частиц, которая живёт как вращающаяся галактика и по
 * команде/свайпу физически перестраивается в портрет из фото — не две
 * разные сцены с разными частицами, а один объект меняет форму).
 *
 * Переходы между сценами — не плоский fade, а "пролёт камеры": уходящая
 * сцена увеличивается и размывается, входящая выезжает из глубины —
 * ощущение непрерывного полёта, а не смены слайдов.
 *
 * Этот компонент сознательно НЕ зарегистрирован в src/templates/registry.js
 * и не подключён к маршрутам конструктора/получателя — доступен только
 * через скрытый тестовый маршрут (см. GalaxyLetterLabPage.jsx), пока фича
 * не готова к показу на проде.
 */
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Starfield from './Starfield.jsx';
import FloatingLovePhrases from './FloatingLovePhrases.jsx';
import TextParticleField from './TextParticleField.jsx';
import EnvelopeScene from './EnvelopeScene.jsx';
import LetterScene from './LetterScene.jsx';

const STAGES = ['envelope', 'letter', 'cosmos'];

// "Пролёт камеры" между сценами вместо плоского fade — уходящая сцена
// увеличивается и тает, входящая появляется издалека и приближается
const flyVariants = {
  initial: { opacity: 0, scale: 0.88, filter: 'blur(6px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 1.25, filter: 'blur(10px)', transition: { duration: 0.55, ease: [0.4, 0, 1, 1] } },
};

export default function GalaxyLetterScene({
  recipientName,
  letterHeading,
  letterParagraphs,
  senderName,
  photoUrl,
  finalCaption,
  finalSubcaption,
  onRestartRequest,
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const [cosmosPhase, setCosmosPhase] = useState('galaxy'); // galaxy | assembling | portrait
  const fieldRef = useRef(null);
  const stage = STAGES[stageIndex];

  function next() {
    setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
  }

  function assemblePortrait() {
    setCosmosPhase('assembling');
    fieldRef.current?.animateTo(1, 1800);
  }

  function handleSave() {
    const canvas = document.querySelector('[data-galaxy-letter-canvas] canvas');
    if (!canvas) return;
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext('2d');
    octx.fillStyle = '#0b0818';
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    const link = document.createElement('a');
    link.download = `${(recipientName || 'senti-letter').toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = out.toDataURL('image/png');
    link.click();
  }

  async function handleShare() {
    const shareData = {
      title: 'Senti — тебе письмо',
      text: finalSubcaption || 'Тебе письмо ✉️',
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        /* пользователь отменил — ничего не делаем */
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareData.url);
    }
  }

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: 'radial-gradient(ellipse at 50% 20%, #241a44 0%, #140f28 55%, #0b0818 100%)',
    }}>
      <Starfield density={stage === 'cosmos' ? 90 : 140} nebula />

      <AnimatePresence mode="wait">
        {stage === 'envelope' && (
          <motion.div key="envelope" {...flyVariants} style={{ position: 'absolute', inset: 0 }}>
            <EnvelopeScene recipientName={recipientName} onOpen={next} />
          </motion.div>
        )}

        {stage === 'letter' && (
          <motion.div key="letter" {...flyVariants} style={{ position: 'absolute', inset: 0 }}>
            <LetterScene
              heading={letterHeading}
              paragraphs={letterParagraphs}
              signature={senderName}
              onContinue={next}
            />
          </motion.div>
        )}

        {stage === 'cosmos' && (
          <motion.div
            key="cosmos"
            {...flyVariants}
            style={{ position: 'absolute', inset: 0 }}
            data-galaxy-letter-canvas
          >
            <TextParticleField
              ref={fieldRef}
              photoUrl={photoUrl}
              interactive
              onProgressSettle={(p) => setCosmosPhase(p >= 1 ? 'portrait' : 'galaxy')}
            />

            {cosmosPhase === 'galaxy' && <FloatingLovePhrases count={8} opacity={0.22} />}

            <AnimatePresence>
              {cosmosPhase === 'galaxy' && (
                <motion.div
                  key="galaxy-cta"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: '10%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontFamily: '"Manrope", sans-serif', color: '#cfc9ff', fontSize: 12, opacity: 0.75 }}>
                    покрути галактику
                  </div>
                  <motion.button
                    type="button"
                    onClick={assemblePortrait}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      pointerEvents: 'auto', border: 'none', borderRadius: 999,
                      padding: '12px 28px', background: '#f5c768', color: '#2a2440',
                      fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', boxShadow: '0 10px 24px -6px rgba(245,199,104,0.5)',
                    }}
                  >
                    Нажми!
                  </motion.button>
                </motion.div>
              )}

              {cosmosPhase === 'portrait' && (
                <motion.div
                  key="portrait-ui"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.3 }}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: '6%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
                    padding: '0 24px', textAlign: 'center',
                  }}
                >
                  <div>
                    {finalCaption && (
                      <div style={{ fontFamily: '"Caveat", cursive', fontSize: 30, color: '#fff', textShadow: '0 0 20px rgba(150,140,255,0.6)' }}>
                        {finalCaption}
                      </div>
                    )}
                    {finalSubcaption && (
                      <div style={{ fontFamily: '"Caveat", cursive', fontSize: 18, color: '#cfc9ff', opacity: 0.85, marginTop: 2 }}>
                        {finalSubcaption}
                      </div>
                    )}
                    <div style={{ fontFamily: '"Manrope", sans-serif', fontSize: 10.5, color: '#9b92d9', opacity: 0.6, marginTop: 10 }}>
                      проведи пальцем вбок, и она снова станет галактикой
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
                    <button
                      type="button"
                      onClick={handleShare}
                      style={{
                        flex: 1, border: 'none', borderRadius: 999, padding: '12px 16px',
                        background: '#f5c768', color: '#2a2440', fontFamily: '"Manrope", sans-serif',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        boxShadow: '0 10px 24px -8px rgba(245,199,104,0.5)',
                      }}
                    >
                      Поделиться
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      style={{
                        flex: 1, border: '1px solid rgba(255,255,255,0.25)', borderRadius: 999,
                        padding: '12px 16px', background: 'rgba(255,255,255,0.06)', color: '#e6e2ff',
                        fontFamily: '"Manrope", sans-serif', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                      }}
                    >
                      Сохранить себе
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {stage === 'cosmos' && cosmosPhase === 'portrait' && onRestartRequest && (
        <button
          type="button"
          onClick={onRestartRequest}
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 2,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#cfc9ff', borderRadius: 999, padding: '6px 12px', fontSize: 11,
            fontFamily: '"Manrope", sans-serif', cursor: 'pointer',
          }}
        >
          ↺ сначала
        </button>
      )}
    </div>
  );
}
