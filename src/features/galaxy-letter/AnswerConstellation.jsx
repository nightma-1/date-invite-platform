/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Созвездие из ответов приглашения.
 *
 * Галактика сама по себе — красивый, но чужой эффект: она одинаковая у
 * всех. А вот дата, время и места, которые получатель выбрал минуту назад,
 * принадлежат только этой паре. Превращаем их в именные звёзды, соединённые
 * в созвездие: человек узнаёт в небе собственные ответы.
 *
 * Рисуем разметкой, а не на холсте: звёзд единицы, зато подписи получают
 * нормальную типографику, перенос и доступность.
 */
import { motion } from 'framer-motion';

// Точки подобраны так, чтобы обходить ядро галактики (центр, ~42% высоты)
// и нижнюю четверть, где живут подсказка и кнопка.
const SPOTS = [
  { x: 18, y: 19 },
  { x: 41, y: 11 },
  { x: 66, y: 21 },
  { x: 86, y: 13 },
  { x: 11, y: 43 },
  { x: 89, y: 40 },
  { x: 26, y: 60 },
  { x: 74, y: 58 },
];

export default function AnswerConstellation({ stars = [], palette, reducedMotion = false, visible = true }) {
  const pts = stars.slice(0, SPOTS.length).map((s, i) => ({ ...s, ...SPOTS[i] }));
  if (!pts.length) return null;
  const soft = palette?.soft || '#ffd9e5';
  const glow = palette?.accent?.glow || 'rgba(248,85,137,0.5)';

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
        opacity: visible ? 1 : 0, transition: 'opacity .5s ease',
      }}
    >
      {/* линии созвездия — тонкие, чтобы не спорить с рукавами галактики */}
      <svg
        viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        {pts.slice(1).map((p, i) => (
          <motion.line
            key={i}
            x1={pts[i].x} y1={pts[i].y} x2={p.x} y2={p.y}
            stroke={soft} strokeWidth="0.18" strokeOpacity="0.3"
            vectorEffect="non-scaling-stroke"
            initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 + i * 0.28 }}
          />
        ))}
      </svg>

      {pts.map((p, i) => (
        <motion.div
          key={p.label + i}
          initial={reducedMotion ? false : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.35 + i * 0.28 }}
          style={{
            position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
            transform: 'translate(-50%,-50%)', textAlign: 'center',
            // у краёв подпись не должна вылезать за экран
            maxWidth: 124, width: 'max-content',
          }}
        >
          <motion.div
            animate={reducedMotion ? undefined : { opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 2.6 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: 7, height: 7, borderRadius: '50%', margin: '0 auto 6px',
              background: '#fff', boxShadow: `0 0 10px 2px ${glow}, 0 0 22px 6px ${glow}`,
            }}
          />
          {p.label && (
            <div style={{
              fontFamily: '"Manrope", sans-serif', fontSize: 8.5, letterSpacing: 0.8,
              textTransform: 'uppercase', color: soft, opacity: 0.5, marginBottom: 1,
            }}>
              {p.label}
            </div>
          )}
          <div style={{
            fontFamily: '"Caveat", cursive', fontSize: 17, lineHeight: 1.15,
            color: '#fff', textShadow: `0 0 14px ${glow}`,
          }}>
            {p.value}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
