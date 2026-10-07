/**
 * © 2026 Senti.
 * Открывающийся конверт с восковой печатью — первая сцена.
 */
import { motion } from 'framer-motion';

export default function EnvelopeScene({ recipientName, onOpen }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
      style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <motion.button
        type="button"
        onClick={onOpen}
        whileTap={{ scale: 0.96 }}
        animate={{ y: [0, -6, 0] }}
        transition={{ y: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } }}
        style={{
          position: 'relative', width: 220, height: 150, border: 'none',
          background: 'linear-gradient(160deg, #ffffff, #e9e6ff)',
          borderRadius: 8, cursor: 'pointer', padding: 0,
          boxShadow: '0 30px 60px -20px rgba(80,60,160,0.45)',
        }}
        aria-label="Открыть письмо"
      >
        <svg viewBox="0 0 220 150" width="220" height="150" style={{ position: 'absolute', inset: 0 }}>
          <polygon points="0,0 110,78 220,0" fill="#f3f1ff" stroke="#d9d3ff" strokeWidth="1" />
          <polygon points="0,150 90,70 0,10" fill="#ece8ff" />
          <polygon points="220,150 130,70 220,10" fill="#ece8ff" />
        </svg>
        <div style={{
          position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 46, height: 46, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, #b79dff, #6c4fc9)',
          boxShadow: '0 6px 14px rgba(70,40,160,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: '"Cormorant Garamond", serif', fontSize: 20,
        }}>
          {(recipientName || '?').trim().charAt(0).toUpperCase()}
        </div>
        {recipientName && (
          <div style={{
            position: 'absolute', top: '70%', left: '50%', transform: 'translate(-50%, 0)',
            fontFamily: '"Caveat", cursive', fontSize: 22, color: '#4a3f82',
            paddingBottom: 2, borderBottom: '1px solid #c9bdf5',
          }}>
            {recipientName}
          </div>
        )}
      </motion.button>
      <div style={{
        marginTop: 28, fontFamily: '"Caveat", cursive', fontSize: 24,
        color: '#e8e4ff', opacity: 0.9,
      }}>
        {recipientName ? `${recipientName}, тебе письмо` : 'тебе письмо'}
      </div>
      <div style={{ marginTop: 2, fontSize: 15, fontFamily: '"Caveat", cursive', color: '#a89cf0', opacity: 0.8 }}>открой это</div>
    </motion.div>
  );
}
