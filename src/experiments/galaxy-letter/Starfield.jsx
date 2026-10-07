/**
 * © 2026 Senti.
 * Фон сцены: глубокое небо + полоса Млечного Пути + звёзды с лучиками.
 * Цвета берутся из палитры (см. palettes.js), поэтому космос может быть
 * не только синим, а в тоне нашего бренда или настроения приглашения.
 *
 * Полоса и мелкие звёзды рисуются ОДИН раз в offscreen-канвас, каждый
 * кадр поверх подмешивается только мерцание ярких звёзд.
 */
import { useEffect, useRef } from 'react';
import { getPalette } from './palettes.js';

function rnd(s) {
  s.v = (s.v * 1664525 + 1013904223) >>> 0;
  return s.v / 4294967296;
}

export default function Starfield({ paletteId = 'senti', density = 1, nebula = true }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const pal = getPalette(paletteId);
    let raf; let width = 0; let height = 0; let dpr = 1;
    let back = null;
    let twinklers = [];

    const bandColor = (i, a) => pal.band[i].replace('A', String(a));

    function drawBand(g, w, h, seed) {
      const ang = -Math.PI / 3.1;
      const ca = Math.cos(ang); const sa = Math.sin(ang);
      const len = Math.hypot(w, h) * 1.2;
      const cx = w * 0.62; const cy = h * 0.42;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 190; i++) {
        const t = (rnd(seed) - 0.5) * len;
        const off = (rnd(seed) - 0.5) * 2;
        const spread = Math.exp(-off * off * 2.2);
        const d = off * w * 0.42;
        const x = cx + ca * t - sa * d;
        const y = cy + sa * t + ca * d;
        const r = (0.07 + rnd(seed) * 0.17) * w;
        const a = 0.07 * spread * (0.4 + rnd(seed) * 0.6);
        const c0 = rnd(seed);
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, bandColor(c0 < 0.5 ? 0 : 1, a.toFixed(3)));
        grad.addColorStop(0.5, bandColor(2, (a * 0.45).toFixed(3)));
        grad.addColorStop(1, bandColor(2, '0'));
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // пылевые прожилки — тёмные полосы внутри полосы
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 18; i++) {
        const t = (rnd(seed) - 0.5) * len * 0.85;
        const off = (rnd(seed) - 0.5) * 0.7;
        const d = off * w * 0.3;
        const x = cx + ca * t - sa * d;
        const y = cy + sa * t + ca * d;
        const r = (0.04 + rnd(seed) * 0.1) * w;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, `rgba(${pal.dust},0.4)`);
        grad.addColorStop(1, `rgba(${pal.dust},0)`);
        g.fillStyle = grad;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }

    function spike(g, x, y, r, a) {
      const h = g.createLinearGradient(x - r, y, x + r, y);
      h.addColorStop(0, 'rgba(255,255,255,0)');
      h.addColorStop(0.5, `rgba(255,255,255,${a})`);
      h.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = h;
      g.fillRect(x - r, y - 0.45, r * 2, 0.9);
      const v = g.createLinearGradient(x, y - r, x, y + r);
      v.addColorStop(0, 'rgba(255,255,255,0)');
      v.addColorStop(0.5, `rgba(255,255,255,${a})`);
      v.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = v;
      g.fillRect(x - 0.45, y - r, 0.9, r * 2);
    }

    function star(g, x, y, r, a, tint) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.35, `rgba(${tint},${a * 0.5})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    function build() {
      const seed = { v: 20260207 };
      back = document.createElement('canvas');
      back.width = Math.max(1, Math.round(width * dpr));
      back.height = Math.max(1, Math.round(height * dpr));
      const g = back.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sky = g.createLinearGradient(0, 0, width * 0.4, height);
      sky.addColorStop(0, pal.sky[0]);
      sky.addColorStop(0.45, pal.sky[1]);
      sky.addColorStop(1, pal.sky[2]);
      g.fillStyle = sky;
      g.fillRect(0, 0, width, height);

      if (nebula) drawBand(g, width, height, seed);

      g.globalCompositeOperation = 'lighter';
      const warm = pal.core[1];
      const cool = pal.arms[3].join(',');
      const count = Math.round((width * height) / 1700 * density);
      for (let i = 0; i < count; i++) {
        const m = rnd(seed);
        star(g, rnd(seed) * width, rnd(seed) * height, 0.5 + m * m * 2.2,
          0.25 + rnd(seed) * 0.55, rnd(seed) < 0.22 ? warm : cool);
      }
      twinklers = [];
      const bright = Math.round((width * height) / 26000 * density) + 6;
      for (let i = 0; i < bright; i++) {
        const x = rnd(seed) * width; const y = rnd(seed) * height;
        const r = 2.4 + rnd(seed) * 3.2;
        const a = 0.55 + rnd(seed) * 0.4;
        const tint = rnd(seed) < 0.3 ? warm : cool;
        star(g, x, y, r * 1.6, a * 0.8, tint);
        spike(g, x, y, r * 3.4, a * 0.5);
        twinklers.push({ x, y, r, a, tint, ph: rnd(seed) * Math.PI * 2, sp: 0.5 + rnd(seed) * 1.4 });
      }
      g.globalCompositeOperation = 'source-over';
    }

    function resize() {
      const p = canvas.parentElement;
      if (!p || !p.clientWidth || !p.clientHeight) return;
      width = p.clientWidth; height = p.clientHeight;
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
          if (k > 0.15) star(ctx, s.x, s.y, s.r * (1 + k * 0.5), s.a * k * 0.55, s.tint);
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
  }, [paletteId, density, nebula]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
