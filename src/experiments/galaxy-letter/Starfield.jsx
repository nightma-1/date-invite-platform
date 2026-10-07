/**
 * © 2026 Senti.
 * Фон сцены: глубокое небо + полоса Млечного Пути + звёзды с лучиками.
 *
 * Млечный Путь и звёзды рисуются ОДИН раз в offscreen-канвас (они
 * статичны), а каждый кадр мы только подмешиваем мерцание ярких звёзд.
 * Так фон получается плотным и "фотографичным", но не ест кадры.
 */
import { useEffect, useRef } from 'react';

function rnd(seedObj) {
  // детерминированный ГПСЧ, чтобы фон не прыгал при ресайзе
  seedObj.s = (seedObj.s * 1664525 + 1013904223) >>> 0;
  return seedObj.s / 4294967296;
}

export default function Starfield({ nebula = true, density = 1 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf; let width = 0; let height = 0; let dpr = 1;
    let back = null;          // статичный слой: млечный путь + мелкие звёзды
    let twinklers = [];       // яркие звёзды, которые мерцают поверх

    function drawBand(g, w, h, seed) {
      // Полоса Млечного Пути: много мягких пятен вдоль наклонной оси
      const ang = -Math.PI / 3.1;          // наклон полосы
      const ca = Math.cos(ang); const sa = Math.sin(ang);
      const len = Math.hypot(w, h) * 1.2;
      const cx = w * 0.62; const cy = h * 0.42;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 220; i++) {
        const t = (rnd(seed) - 0.5) * len;
        const off = (rnd(seed) - 0.5) * 2;
        const spread = Math.exp(-off * off * 2.2);           // гауссов профиль поперёк полосы
        const d = off * w * 0.42;
        const x = cx + ca * t - sa * d;
        const y = cy + sa * t + ca * d;
        const r = (0.09 + rnd(seed) * 0.22) * w;
        const a = 0.1 * spread * (0.4 + rnd(seed) * 0.6);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(205,210,240,${a})`);
        grad.addColorStop(0.5, `rgba(150,155,205,${a * 0.45})`);
        grad.addColorStop(1, 'rgba(90,95,160,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // тёмные пылевые прожилки поверх полосы
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 18; i++) {
        const t = (rnd(seed) - 0.5) * len * 0.85;
        const off = (rnd(seed) - 0.5) * 0.7;
        const d = off * w * 0.3;
        const x = cx + ca * t - sa * d;
        const y = cy + sa * t + ca * d;
        const r = (0.04 + rnd(seed) * 0.1) * w;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, 'rgba(9,10,28,0.4)');
        grad.addColorStop(1, 'rgba(9,10,28,0)');
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    function spike(g, x, y, r, a) {
      // крестообразный "луч" у ярких звёзд — то, что делает небо фотографичным
      const grad = g.createLinearGradient(x - r, y, x + r, y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - 0.45, r * 2, 0.9);
      const grad2 = g.createLinearGradient(x, y - r, x, y + r);
      grad2.addColorStop(0, 'rgba(255,255,255,0)');
      grad2.addColorStop(0.5, `rgba(255,255,255,${a})`);
      grad2.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad2;
      g.fillRect(x - 0.45, y - r, 0.9, r * 2);
    }

    function star(g, x, y, r, a, warm) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.35, warm ? `rgba(255,236,205,${a * 0.55})` : `rgba(200,215,255,${a * 0.5})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function build() {
      const seed = { s: 20260207 };
      back = document.createElement('canvas');
      back.width = Math.max(1, Math.round(width * dpr));
      back.height = Math.max(1, Math.round(height * dpr));
      const g = back.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // базовое небо
      const sky = g.createLinearGradient(0, 0, width * 0.4, height);
      sky.addColorStop(0, '#111535');
      sky.addColorStop(0.45, '#0c1029');
      sky.addColorStop(1, '#080a1c');
      g.fillStyle = sky;
      g.fillRect(0, 0, width, height);

      if (nebula) drawBand(g, width, height, seed);

      // мелкие звёзды
      g.globalCompositeOperation = 'lighter';
      const count = Math.round((width * height) / 1700 * density);
      for (let i = 0; i < count; i++) {
        const x = rnd(seed) * width;
        const y = rnd(seed) * height;
        const m = rnd(seed);
        const r = 0.5 + m * m * 2.2;
        const a = 0.25 + rnd(seed) * 0.55;
        star(g, x, y, r, a, rnd(seed) < 0.22);
      }
      // яркие звёзды с лучиками
      twinklers = [];
      const bright = Math.round((width * height) / 26000 * density) + 6;
      for (let i = 0; i < bright; i++) {
        const x = rnd(seed) * width;
        const y = rnd(seed) * height;
        const r = 2.4 + rnd(seed) * 3.2;
        const a = 0.55 + rnd(seed) * 0.4;
        const warm = rnd(seed) < 0.3;
        star(g, x, y, r * 1.6, a * 0.8, warm);
        spike(g, x, y, r * 3.4, a * 0.5);
        twinklers.push({ x, y, r, a, warm, ph: rnd(seed) * Math.PI * 2, sp: 0.5 + rnd(seed) * 1.4 });
      }
      g.globalCompositeOperation = 'source-over';
    }

    function resize() {
      const parent = canvas.parentElement;
      const w = parent.clientWidth; const h = parent.clientHeight;
      if (!w || !h) return;
      width = w; height = h;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    let t = 0;
    function tick() {
      t += 0.016;
      if (back) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(back, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        for (const s of twinklers) {
          const k = 0.5 + 0.5 * Math.sin(t * s.sp + s.ph);
          if (k < 0.15) continue;
          star(ctx, s.x, s.y, s.r * (1 + k * 0.5), s.a * k * 0.55, s.warm);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    tick();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [nebula, density]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
