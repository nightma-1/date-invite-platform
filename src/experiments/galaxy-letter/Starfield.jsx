/**
 * © 2026 Senti.
 * Фоновое звёздное небо — canvas с мягкими облаками туманности (несколько
 * размытых радиальных пятен, процедурно, без картинки-ассета) + мерцающие
 * точки-звёзды + редкие "падающие" звёзды. Подложка под все сцены
 * galaxy-letter — именно разница между плоским фоном и "глубиной" даёт
 * львиную долю ощущения настоящего космоса.
 */
import { useEffect, useRef } from 'react';

const NEBULA_PALETTE = [
  'rgba(130,100,220,0.16)',
  'rgba(90,70,190,0.14)',
  'rgba(200,140,220,0.10)',
];

export default function Starfield({ density = 140, shootingStars = true, nebula = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    let stars = [];
    let shooters = [];
    let clouds = [];

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((width * height) / 9000 * (density / 140));
      stars = Array.from({ length: count }).map(() => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.4 + 0.3,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.2,
      }));
      clouds = Array.from({ length: 4 }).map((_, i) => ({
        x: width * (0.15 + Math.random() * 0.7),
        y: height * (0.1 + Math.random() * 0.6),
        r: Math.max(width, height) * (0.35 + Math.random() * 0.25),
        color: NEBULA_PALETTE[i % NEBULA_PALETTE.length],
        driftX: (Math.random() - 0.5) * 6,
        driftY: (Math.random() - 0.5) * 6,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    function maybeSpawnShooter() {
      if (!shootingStars) return;
      if (Math.random() < 0.004 && shooters.length < 2) {
        const y0 = Math.random() * height * 0.4;
        shooters.push({
          x: Math.random() * width * 0.4,
          y: y0,
          len: 60 + Math.random() * 60,
          speed: 6 + Math.random() * 4,
          life: 1,
        });
      }
    }

    let t = 0;
    function tick() {
      t += 0.016;
      ctx.clearRect(0, 0, width, height);

      if (nebula) {
        for (const c of clouds) {
          const ox = Math.sin(t * 0.05 + c.phase) * c.driftX;
          const oy = Math.cos(t * 0.04 + c.phase) * c.driftY;
          const grad = ctx.createRadialGradient(c.x + ox, c.y + oy, 0, c.x + ox, c.y + oy, c.r);
          grad.addColorStop(0, c.color);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(c.x + ox, c.y + oy, c.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const s of stars) {
        const tw = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase);
        ctx.globalAlpha = 0.25 + tw * 0.65;
        ctx.fillStyle = '#eef0ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      maybeSpawnShooter();
      shooters = shooters.filter((sh) => sh.life > 0);
      for (const sh of shooters) {
        sh.x += sh.speed;
        sh.y += sh.speed * 0.5;
        sh.life -= 0.02;
        const grad = ctx.createLinearGradient(sh.x, sh.y, sh.x - sh.len, sh.y - sh.len * 0.5);
        grad.addColorStop(0, `rgba(255,255,255,${sh.life})`);
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.len, sh.y - sh.len * 0.5);
        ctx.stroke();
      }

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
  }, [density, shootingStars, nebula]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
