/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Фотографии в узлах созвездия — второй вариант финала.
 *
 * Портрет из слов — про одного человека. Созвездие — про двоих: несколько
 * снимков, соединённых линиями из тех же слов, читаются как история, а не
 * как один кадр. И лица здесь мелкие: это осознанно, снимок узнаёт тот, кто
 * на нём был, а не случайный зритель сторис.
 *
 * Узлы берём из общего модуля — те же, по которым система частиц выкладывает
 * линии, иначе фотографии разъедутся с созвездием.
 */
import { motion } from 'framer-motion';
import { constellationNodes } from './constellation.js';

export default function MemoryPhotos({ memories = [], palette, visible = false, reducedMotion = false }) {
  const items = memories.filter((m) => m && m.url).slice(0, 7);
  if (!items.length) return null;
  const nodes = constellationNodes(items.length);
  const glow = palette?.accent?.glow || 'rgba(248,85,137,0.5)';
  const soft = palette?.soft || '#ffd9e5';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
      {items.map((m, i) => (
        <motion.div
          key={m.url + i}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.4 }}
          animate={visible ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.7, delay: visible ? 0.15 + i * 0.16 : 0, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute',
            left: `${nodes[i].x * 100}%`,
            top: `${nodes[i].y * 100}%`,
            transform: 'translate(-50%,-50%)',
            textAlign: 'center',
            width: 'max-content',
            maxWidth: 118,
          }}
        >
          <div style={{
            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', margin: '0 auto',
            border: '1.5px solid rgba(255,255,255,0.55)',
            boxShadow: `0 0 16px 4px ${glow}, 0 8px 24px -8px rgba(0,0,0,0.6)`,
          }}>
            <img
              src={m.url} alt={m.caption || ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
          {m.caption && (
            // у самых краёв подпись сдвигаем внутрь кадра, иначе её срежет;
            // сам кружок при этом остаётся ровно в узле созвездия
            <div style={{
              transform: nodes[i].x < 0.22 ? 'translateX(14%)' : nodes[i].x > 0.78 ? 'translateX(-14%)' : 'none',
              fontFamily: '"Caveat", cursive', fontSize: 15, lineHeight: 1.2,
              color: '#fff', marginTop: 5, textShadow: `0 0 12px ${glow}`,
            }}>
              {m.caption}
            </div>
          )}
          {m.date && (
            <div style={{
              fontFamily: '"Manrope", sans-serif', fontSize: 8.5, letterSpacing: 0.6,
              textTransform: 'uppercase', color: soft, opacity: 0.5, marginTop: 1,
            }}>
              {m.date}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
