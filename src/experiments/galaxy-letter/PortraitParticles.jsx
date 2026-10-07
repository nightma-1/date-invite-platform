/**
 * © 2026 Senti.
 * Ключевая сцена: фото человека превращается в частицы, которые складываются
 * в портрет; свайп в сторону — и портрет снова рассыпается в звёзды
 * (как в celamur.com). Без внешних либ: сэмплируем яркость пикселей фото
 * на оффскрин-канвасе и рисуем точки на видимом канвасе, интерполируя между
 * "рассеянным" и "собранным" положением.
 */
import { useEffect, useRef, useState } from 'react';

const SAMPLE_STEP = 3; // шаг сетки сэмплирования (px) — компромисс детальность/кол-во частиц
const MAX_PARTICLES = 3800;

export default function PortraitParticles({ photoUrl, caption, subcaption, autoAssemble = true }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const particlesRef = useRef([]);
  const progressRef = useRef(0); // 0 = звёзды/рассеяно, 1 = портрет собран
  const draggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartProgressRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(true);

  // 1. Загружаем фото и строим частицы по яркости пикселей
  useEffect(() => {
    if (!photoUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const off = document.createElement('canvas');
      const targetW = 160;
      const targetH = Math.round((img.height / img.width) * targetW);
      off.width = targetW;
      off.height = targetH;
      const offCtx = off.getContext('2d');
      offCtx.drawImage(img, 0, 0, targetW, targetH);
      let data;
      try {
        data = offCtx.getImageData(0, 0, targetW, targetH).data;
      } catch {
        // CORS-заблокированное изображение — в лаборатории тестируем своими
        // загруженными файлами (object URL), так что сюда попадать не должны
        return;
      }

      const pts = [];
      for (let y = 0; y < targetH; y += SAMPLE_STEP) {
        for (let x = 0; x < targetW; x += SAMPLE_STEP) {
          const idx = (y * targetW + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const a = data[idx + 3];
          if (a < 40) continue;
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          // Берём точку с вероятностью, пропорциональной яркости — светлые
          // области (лицо, блики) гуще засеяны частицами, тёмный фон реже
          if (Math.random() < luminance * 0.9 + 0.08) {
            pts.push({ nx: x / targetW, ny: y / targetH, luminance });
          }
        }
      }

      const limited = pts.length > MAX_PARTICLES
        ? pts.sort(() => Math.random() - 0.5).slice(0, MAX_PARTICLES)
        : pts;

      particlesRef.current = limited.map((p) => ({
        ...p,
        scatterX: Math.random(),
        scatterY: Math.random(),
        twinkle: Math.random() * Math.PI * 2,
        size: 0.8 + p.luminance * 1.6,
      }));
      setReady(true);
    };
    img.src = photoUrl;
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  // 2. Автосборка после загрузки
  useEffect(() => {
    if (!ready || !autoAssemble) return;
    let raf;
    const start = performance.now();
    const duration = 2600;
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      progressRef.current = eased;
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ready, autoAssemble]);

  // 3. Рендер-луп
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;
    let width = 0;
    let height = 0;

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
      const progress = progressRef.current;

      const portraitW = Math.min(width * 0.62, height * 0.5);
      const portraitH = portraitW * 1.25;
      const ox = (width - portraitW) / 2;
      const oy = height * 0.1;

      for (const p of particlesRef.current) {
        const assembledX = ox + p.nx * portraitW;
        const assembledY = oy + p.ny * portraitH;
        const scatterX = p.scatterX * width;
        const scatterY = p.scatterY * height;
        const x = scatterX + (assembledX - scatterX) * progress;
        const y = scatterY + (assembledY - scatterY) * progress;
        const tw = 0.6 + 0.4 * Math.sin(t * 1.2 + p.twinkle);
        ctx.globalAlpha = (0.25 + tw * 0.55) * (0.5 + progress * 0.5);
        ctx.fillStyle = '#f7f5ff';
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
  }, []);

  function handlePointerDown(e) {
    draggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartProgressRef.current = progressRef.current;
    setHint(false);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!draggingRef.current || !containerRef.current) return;
    const w = containerRef.current.getBoundingClientRect().width;
    const dx = e.clientX - dragStartXRef.current;
    const delta = dx / (w * 0.8);
    progressRef.current = Math.min(1, Math.max(0, dragStartProgressRef.current + delta));
  }
  function handlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const target = progressRef.current > 0.5 ? 1 : 0;
    animateTo(target);
  }
  function animateTo(target) {
    const start = progressRef.current;
    const t0 = performance.now();
    const duration = 650;
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      progressRef.current = start + (target - start) * eased;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'grab' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      <div
        style={{
          position: 'absolute', left: 0, right: 0, bottom: '18%',
          textAlign: 'center', pointerEvents: 'none', padding: '0 24px',
        }}
      >
        {caption && (
          <div style={{
            fontFamily: '"Cormorant Garamond", "PT Serif", serif',
            fontSize: 28, color: '#fff', textShadow: '0 0 20px rgba(150,140,255,0.6)',
          }}>
            {caption}
          </div>
        )}
        {subcaption && (
          <div style={{
            fontFamily: '"Manrope", sans-serif', fontSize: 13, color: '#cfc9ff',
            opacity: 0.85, marginTop: 6,
          }}>
            {subcaption}
          </div>
        )}
        {hint && (
          <div style={{
            fontFamily: '"Manrope", sans-serif', fontSize: 11, color: '#cfc9ff',
            opacity: 0.6, marginTop: 14, letterSpacing: 0.3,
          }}>
            проведи пальцем вбок, и она снова станет звёздами
          </div>
        )}
      </div>
    </div>
  );
}
