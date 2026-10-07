/**
 * © 2026 Senti.
 * Вращающаяся спираль-галактика из частиц. Можно "покрутить" пальцем/мышью —
 * инерция сама гасится. Чисто декоративный canvas, без зависимостей.
 */
import { useEffect, useRef } from 'react';

export default function GalaxySwirl({ armCount = 3, particleCount = 900 }) {
  const canvasRef = useRef(null);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0.0015);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let width = 0;
    let height = 0;

    const particles = Array.from({ length: particleCount }).map((_, i) => {
      const arm = i % armCount;
      const t = Math.random();
      const radius = t * 0.46;
      const angle = (arm / armCount) * Math.PI * 2 + t * 4.2 + (Math.random() - 0.5) * 0.35;
      return {
        radius,
        angle,
        size: Math.random() * 1.6 + 0.4,
        twinkle: Math.random() * Math.PI * 2,
      };
    });

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    let t = 0;
    function tick() {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height);

      if (!draggingRef.current) {
        velocityRef.current += (0.0015 - velocityRef.current) * 0.02;
      }
      rotationRef.current += velocityRef.current;

      // Ядро свечения
      const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.16);
      coreGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
      coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, scale * 0.16, 0, Math.PI * 2);
      ctx.fill();

      for (const p of particles) {
        const a = p.angle + rotationRef.current * (1 - p.radius * 0.6);
        const r = p.radius * scale;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r * 0.92;
        const tw = 0.5 + 0.5 * Math.sin(t * 1.4 + p.twinkle);
        ctx.globalAlpha = 0.35 + tw * 0.5;
        ctx.fillStyle = '#eef0ff';
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(tick);
    }

    resize();
    tick();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [armCount, particleCount]);

  function handlePointerDown(e) {
    draggingRef.current = true;
    lastXRef.current = e.clientX;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastXRef.current;
    lastXRef.current = e.clientX;
    rotationRef.current += dx * 0.01;
    velocityRef.current = dx * 0.0025;
  }
  function handlePointerUp() {
    draggingRef.current = false;
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' }}
    />
  );
}
