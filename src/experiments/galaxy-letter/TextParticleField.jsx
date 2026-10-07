/**
 * © 2026 Senti.
 * Ядро эффекта: ОДНА система частиц-слов ("люблю" на разных языках),
 * которая физически перестраивается между двумя формами — вращающейся
 * спиралью галактики и силуэтом лица с фото — вместо двух раздельных сцен
 * с разными частицами. Это и даёт то самое ощущение "вау": не смена
 * слайдов, а один и тот же живой объект меняет форму на свайп/клик.
 *
 * progress: 0 = галактика (вращается сама), 1 = портрет (собран из фото).
 * Управляется либо автоматически (autoAssemble), либо свайпом/драгом.
 */
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { pickLoveWords } from './loveWords.js';

const PARTICLE_COUNT = 1100;
const SAMPLE_STEP = 2.6;

const TextParticleField = forwardRef(function TextParticleField(
  { photoUrl, armCount = 3, interactive = true, onProgressSettle },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const particlesRef = useRef([]);
  const progressRef = useRef(0);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0.0013);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, progress: 0 });
  const [photoReady, setPhotoReady] = useState(!photoUrl);

  // 1. Построить пул частиц со спиральными ("галактика") координатами сразу
  useEffect(() => {
    const words = pickLoveWords(Math.min(36, PARTICLE_COUNT));
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
      const arm = i % armCount;
      const t = Math.random();
      const radius = t * 0.46;
      const angle = (arm / armCount) * Math.PI * 2 + t * 4.2 + (Math.random() - 0.5) * 0.35;
      return {
        phrase: words[i % words.length].text,
        galaxyRadius: radius,
        galaxyAngle: angle,
        portraitNX: 0.5,
        portraitNY: 0.5,
        portraitLum: 0,
        hasPortraitSpot: false,
        scatterSeed: Math.random(),
        fontSize: 6.5 + Math.random() * 3.5,
        twinkle: Math.random() * Math.PI * 2,
      };
    });
  }, [armCount]);

  // 2. Когда есть фото — сэмплируем яркость и назначаем каждой частице
  //    координаты на лице (чем ярче область, тем больше частиц туда попадёт)
  useEffect(() => {
    if (!photoUrl) {
      setPhotoReady(false);
      return;
    }
    let cancelled = false;
    setPhotoReady(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const off = document.createElement('canvas');
      const targetW = 170;
      const targetH = Math.round((img.height / img.width) * targetW);
      off.width = targetW;
      off.height = targetH;
      const offCtx = off.getContext('2d');
      offCtx.drawImage(img, 0, 0, targetW, targetH);
      let data;
      try {
        data = offCtx.getImageData(0, 0, targetW, targetH).data;
      } catch {
        return;
      }

      const samples = [];
      for (let y = 0; y < targetH; y += SAMPLE_STEP) {
        for (let x = 0; x < targetW; x += SAMPLE_STEP) {
          const idx = (Math.round(y) * targetW + Math.round(x)) * 4;
          const a = data[idx + 3];
          if (a < 40) continue;
          const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
          samples.push({ nx: x / targetW, ny: y / targetH, lum });
        }
      }
      // Светлые места (лицо, блики) получают больше шансов — так портрет
      // читается, а не превращается в равномерный шум
      samples.sort((a, b) => (b.lum + Math.random() * 0.25) - (a.lum + Math.random() * 0.25));

      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const s = samples[i % samples.length];
        particles[i].portraitNX = s.nx;
        particles[i].portraitNY = s.ny;
        particles[i].portraitLum = s.lum;
        particles[i].hasPortraitSpot = true;
      }
      setPhotoReady(true);
    };
    img.src = photoUrl;
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  // 3. Императивное API наружу: прыгнуть к портрету / галактике
  useImperativeHandle(ref, () => ({
    animateTo(target, duration = 1600) {
      const start = progressRef.current;
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        progressRef.current = start + (target - start) * eased;
        if (t < 1) requestAnimationFrame(step);
        else onProgressSettle?.(target);
      }
      requestAnimationFrame(step);
    },
    getProgress() {
      return progressRef.current;
    },
  }));

  // 4. Рендер-луп
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
      const cx = width / 2;
      const cy = height * 0.42;
      const scale = Math.min(width, height);

      if (!draggingRef.current && progress < 0.02) {
        velocityRef.current += (0.0013 - velocityRef.current) * 0.02;
        rotationRef.current += velocityRef.current;
      }

      if (progress < 0.95) {
        const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.16 * (1 - progress * 0.6));
        coreGrad.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - progress)})`);
        coreGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, scale * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }

      const portraitW = Math.min(width * 0.6, height * 0.42);
      const portraitH = portraitW * 1.25;
      const portraitOx = cx - portraitW / 2;
      const portraitOy = cy - portraitH * 0.42;

      for (const p of particlesRef.current) {
        const a = p.galaxyAngle + rotationRef.current * (1 - p.galaxyRadius * 0.6);
        const r = p.galaxyRadius * scale;
        const galaxyX = cx + Math.cos(a) * r;
        const galaxyY = cy + Math.sin(a) * r * 0.92;

        let targetX = galaxyX;
        let targetY = galaxyY;
        let targetAlphaBoost = 0;
        if (p.hasPortraitSpot) {
          targetX = portraitOx + p.portraitNX * portraitW;
          targetY = portraitOy + p.portraitNY * portraitH;
          targetAlphaBoost = p.portraitLum;
        }

        const x = galaxyX + (targetX - galaxyX) * progress;
        const y = galaxyY + (targetY - galaxyY) * progress;

        const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + p.twinkle);
        const baseAlpha = 0.28 + tw * 0.4;
        const alpha = baseAlpha + targetAlphaBoost * progress * 0.45;
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.fillStyle = '#f2f0ff';
        ctx.font = `${p.fontSize}px "Manrope", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.phrase, x, y);
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
    if (!interactive) return;
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, progress: progressRef.current };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!interactive || !draggingRef.current || !containerRef.current) return;
    const w = containerRef.current.getBoundingClientRect().width;
    const dx = e.clientX - dragStartRef.current.x;
    if (photoReady) {
      // На стадии портрета — горизонтальный свайп скрабит прогресс (портрет ⇄ галактика)
      const delta = dx / (w * 0.8);
      progressRef.current = Math.min(1, Math.max(0, dragStartRef.current.progress - delta));
    } else {
      // На стадии галактики без фото — просто вращаем
      rotationRef.current += dx * 0.004;
      dragStartRef.current.x = e.clientX;
    }
  }
  function handlePointerUp() {
    if (!interactive || !draggingRef.current) return;
    draggingRef.current = false;
    if (photoReady) {
      const target = progressRef.current > 0.5 ? 1 : 0;
      const start = progressRef.current;
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / 500);
        const eased = 1 - Math.pow(1 - t, 3);
        progressRef.current = start + (target - start) * eased;
        if (t < 1) requestAnimationFrame(step);
        else onProgressSettle?.(target);
      }
      requestAnimationFrame(step);
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: interactive ? 'grab' : 'default' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
});

export default TextParticleField;
