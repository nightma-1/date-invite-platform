/**
 * © 2026 Date Invite Platform. Все права защищены.
 */

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

export default function RunawayButton({ phrases, containerRef, style = {} }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  function dodge(event) {
    event.preventDefault();
    const container = containerRef?.current;
    const btn = btnRef.current;
    if (!container || !btn) return;

    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    const maxX = Math.max(cRect.width - bRect.width - 8, 8);
    const maxY = Math.max(cRect.height - bRect.height - 8, 8);

    setPos({ x: Math.round(Math.random() * maxX), y: Math.round(Math.random() * maxY) });
    setPhraseIndex((i) => Math.min(i + 1, (phrases?.length ?? 1) - 1));
  }

  const phraseList = phrases || ['Нет', 'Подумаю', 'Может быть', 'Неееет', 'Не поймаешь!'];

  return (
    <motion.button
      ref={btnRef}
      type="button"
      onPointerEnter={dodge}
      onTouchStart={dodge}
      onClick={dodge}
      animate={pos ? { left: pos.x, top: pos.y } : {}}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      style={{
        ...style,
        position: pos ? 'absolute' : 'relative',
        left: pos ? pos.x : 'auto',
        top: pos ? pos.y : 'auto',
        userSelect: 'none',
      }}
      aria-label="Кнопка «Нет» — она убегает"
    >
      {phraseList[phraseIndex]}
    </motion.button>
  );
}
