/**
 * © 2026 Senti.
 * Облако фраз "люблю" на разных языках, медленно дрейфующих по экрану —
 * как в сцене celamur.com. Чистый DOM + CSS-анимация: дешевле canvas-текста
 * и не теряет чёткость шрифта на ретине.
 */
import { useMemo } from 'react';
import { pickLoveWords } from './loveWords.js';

export default function FloatingLovePhrases({ count = 16, opacity = 0.5 }) {
  const items = useMemo(() => {
    const words = pickLoveWords(count);
    return words.map((w, i) => ({
      ...w,
      id: i,
      left: 4 + Math.random() * 92,
      top: 4 + Math.random() * 92,
      size: 11 + Math.random() * 7,
      duration: 10 + Math.random() * 10,
      delay: Math.random() * 6,
      drift: 10 + Math.random() * 18,
    }));
  }, [count]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{`
        @keyframes galaxyPhraseDrift {
          0%   { transform: translate(0, 0); opacity: 0; }
          10%  { opacity: var(--gp-op, 0.5); }
          50%  { transform: translate(calc(var(--gp-drift, 14px) * -1), calc(var(--gp-drift, 14px) * 0.6)); }
          90%  { opacity: var(--gp-op, 0.5); }
          100% { transform: translate(0, 0); opacity: 0; }
        }
      `}</style>
      {items.map((it) => (
        <span
          key={it.id}
          style={{
            position: 'absolute',
            left: `${it.left}%`,
            top: `${it.top}%`,
            fontSize: it.size,
            color: '#f4f1ff',
            fontFamily: '"Cormorant Garamond", "PT Serif", serif',
            fontStyle: 'italic',
            whiteSpace: 'nowrap',
            animation: `galaxyPhraseDrift ${it.duration}s ease-in-out infinite`,
            animationDelay: `${it.delay}s`,
            '--gp-op': opacity,
            '--gp-drift': `${it.drift}px`,
            textShadow: '0 0 10px rgba(180,170,255,0.5)',
          }}
        >
          {it.text}
        </span>
      ))}
    </div>
  );
}
