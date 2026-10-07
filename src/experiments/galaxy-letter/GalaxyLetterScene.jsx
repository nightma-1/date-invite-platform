/**
 * © 2026 Senti.
 * Полная сцена galaxy-letter: конверт → письмо → звёздное небо с фразами
 * "люблю" на разных языках → вращающаяся галактика → портрет из частиц.
 *
 * Этот компонент сознательно НЕ зарегистрирован в src/templates/registry.js
 * и не подключён к маршрутам конструктора/получателя — доступен только
 * через скрытый тестовый маршрут (см. GalaxyLetterLabPage.jsx), пока фича
 * не готова к показу на проде.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Starfield from './Starfield.jsx';
import FloatingLovePhrases from './FloatingLovePhrases.jsx';
import GalaxySwirl from './GalaxySwirl.jsx';
import PortraitParticles from './PortraitParticles.jsx';
import EnvelopeScene from './EnvelopeScene.jsx';
import LetterScene from './LetterScene.jsx';

const STAGES = ['envelope', 'letter', 'sky', 'galaxy', 'portrait'];

export default function GalaxyLetterScene({
  recipientName,
  letterHeading,
  letterParagraphs,
  photoUrl,
  finalCaption,
  finalSubcaption,
  onRestartRequest,
}) {
  const [stageIndex, setStageIndex] = useState(0);
  const stage = STAGES[stageIndex];

  function next() {
    setStageIndex((i) => Math.min(i + 1, STAGES.length - 1));
  }

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', overflow: 'hidden',
      background: 'radial-gradient(ellipse at 50% 20%, #241a44 0%, #140f28 55%, #0b0818 100%)',
    }}>
      <Starfield density={stage === 'galaxy' || stage === 'portrait' ? 70 : 140} />

      <AnimatePresence mode="wait">
        {stage === 'envelope' && (
          <EnvelopeScene key="envelope" recipientName={recipientName} onOpen={next} />
        )}

        {stage === 'letter' && (
          <LetterScene
            key="letter"
            heading={letterHeading}
            paragraphs={letterParagraphs}
            onContinue={next}
          />
        )}

        {stage === 'sky' && (
          <motion.div
            key="sky"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            onAnimationComplete={() => {
              const t = setTimeout(next, 2600);
              return () => clearTimeout(t);
            }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <FloatingLovePhrases count={18} opacity={0.6} />
          </motion.div>
        )}

        {stage === 'galaxy' && (
          <motion.div
            key="galaxy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '14%' }}
          >
            <GalaxySwirl />
            <FloatingLovePhrases count={10} opacity={0.3} />
            <div style={{
              position: 'relative', textAlign: 'center', fontFamily: '"Manrope", sans-serif',
              color: '#cfc9ff', fontSize: 12, opacity: 0.75, marginBottom: 14,
            }}>
              покрути галактику
            </div>
            <motion.button
              type="button"
              onClick={next}
              whileTap={{ scale: 0.95 }}
              style={{
                position: 'relative', border: 'none', borderRadius: 999,
                padding: '12px 28px', background: '#f5c768', color: '#2a2440',
                fontFamily: '"Manrope", sans-serif', fontWeight: 700, fontSize: 14,
                cursor: 'pointer', boxShadow: '0 10px 24px -6px rgba(245,199,104,0.5)',
              }}
            >
              Нажми!
            </motion.button>
          </motion.div>
        )}

        {stage === 'portrait' && (
          <motion.div
            key="portrait"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <PortraitParticles
              photoUrl={photoUrl}
              caption={finalCaption || recipientName}
              subcaption={finalSubcaption}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {stage === 'portrait' && onRestartRequest && (
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
