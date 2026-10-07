/**
 * © 2026 Senti.
 * Ядро эффекта: ОДНА система частиц-слов ("люблю" на разных языках),
 * которая перестраивается между двумя формами — наклонённой спиральной
 * галактикой (рукава, светящееся ядро, пыль) и портретом из фото.
 *
 * Частицы — мелкие слова (спрайты, нарисованные заранее), складываются
 * аддитивным смешиванием, поэтому плотные места светятся, а редкие
 * выглядят как отдельные звёзды. Портрет читается за счёт плотности и
 * яркости частиц по контрастно-нормализованной яркости фото.
 *
 * progress: 0 = галактика, 1 = портрет.
 */
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { pickLoveWords } from './loveWords.js';

const COUNT = 6500;
const ARMS = 2;
const SPRITE_FONT = 26;
const TILT = 1.05; // наклон диска к зрителю (рад)

// Палитра: тёплое ядро → сиреневые/голубые рукава
const PALETTE = [
  [255, 236, 200], // ядро
  [235, 225, 255],
  [190, 175, 255],
  [150, 175, 255],
  [255, 190, 225],
];

function rand() { return Math.random(); }
function gauss() { return (rand() + rand() + rand() + rand() - 2) / 2; }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

function buildSprites(words) {
  // для каждой комбинации (слово × цвет) — маленький canvas с текстом
  const sprites = [];
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${SPRITE_FONT}px "Manrope", sans-serif`;
  PALETTE.forEach((c) => {
    const row = words.map((w) => {
      const wpx = Math.ceil(measure.measureText(w.text).width) + 6;
      const cv = document.createElement('canvas');
      cv.width = wpx;
      cv.height = SPRITE_FONT + 8;
      const g = cv.getContext('2d');
      g.font = `${SPRITE_FONT}px "Manrope", sans-serif`;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      g.fillText(w.text, wpx / 2, cv.height / 2);
      return cv;
    });
    sprites.push(row);
  });
  return sprites;
}

function buildGlow() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return cv;
}

const TextParticleField = forwardRef(function TextParticleField(
  { photoUrl, interactive = true, onProgressSettle },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const particlesRef = useRef([]);
  const spritesRef = useRef(null);
  const glowRef = useRef(null);
  const progressRef = useRef(0);
  const rotationRef = useRef(0);
  const spinRef = useRef(0.0016);
  const draggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, progress: 0 });
  const portraitAspectRef = useRef(1.25);
  const [photoReady, setPhotoReady] = useState(!photoUrl);

  // 1. Пул частиц в 3D-координатах галактики
  useEffect(() => {
    const words = pickLoveWords(36);
    spritesRef.current = buildSprites(words);
    glowRef.current = buildGlow();
    const list = [];
    for (let i = 0; i < COUNT; i++) {
      const kind = rand();
      let r; let ang; let z; let colorIdx; let size; let bright;
      if (kind < 0.14) {
        // ядро-балдж: плотное гауссово облако
        r = Math.abs(gauss()) * 0.13;
        ang = rand() * Math.PI * 2;
        z = gauss() * 0.06;
        colorIdx = 0;
        size = 0.8 + rand() * 0.9;
        bright = 0.3 + rand() * 0.4;
      } else if (kind < 0.88) {
        // рукава: логарифмическая спираль, рассеяние растёт с радиусом
        r = 0.08 + Math.pow(rand(), 0.75) * 0.92;
        const arm = i % ARMS;
        const spread = (0.1 + r * 0.22) * gauss() * 1.8;
        ang = (arm / ARMS) * Math.PI * 2 + Math.log(1 + r * 4.5) * 2.5 + spread;
        z = gauss() * 0.035 * (1.1 - r * 0.6);
        colorIdx = r < 0.3 ? 1 : (rand() < 0.2 ? 4 : (rand() < 0.5 ? 2 : 3));
        size = 0.7 + rand() * 1.2;
        bright = 0.25 + rand() * 0.5;
      } else {
        // гало/межзвёздные одиночки
        r = 0.2 + rand() * 1.1;
        ang = rand() * Math.PI * 2;
        z = gauss() * 0.25;
        colorIdx = 1;
        size = 0.7 + rand() * 0.9;
        bright = 0.25 + rand() * 0.4;
      }
      list.push({
        r, ang, z, colorIdx, size, bright,
        word: Math.floor(rand() * words.length),
        seed: rand(),
        tw: rand() * Math.PI * 2,
        twSpeed: 0.6 + rand() * 1.6,
        px: 0.5, py: 0.5, pLum: 0, hasSpot: false,
      });
    }
    particlesRef.current = list;
  }, []);

  // 2. Фото → контрастная карта плотности → цели частиц
  useEffect(() => {
    if (!photoUrl) { setPhotoReady(false); return undefined; }
    let cancelled = false;
    setPhotoReady(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const W = 130;
      const H = Math.max(40, Math.min(220, Math.round((img.height / img.width) * W)));
      portraitAspectRef.current = H / W;
      const off = document.createElement('canvas');
      off.width = W; off.height = H;
      const octx = off.getContext('2d');
      octx.drawImage(img, 0, 0, W, H);
      let data;
      try { data = octx.getImageData(0, 0, W, H).data; } catch { return; }

      const lum = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
      }
      // автоконтраст по перцентилям 4%..96%
      const sorted = Float32Array.from(lum).sort();
      const lo = sorted[Math.floor(sorted.length * 0.04)];
      const hi = sorted[Math.floor(sorted.length * 0.96)];
      const range = Math.max(0.05, hi - lo);
      for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / range));

      // боксовый блюр для локального контраста (unsharp): выделяет черты лица
      const R = 5;
      const blur = new Float32Array(W * H);
      const tmp = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        let acc = 0; let n = 0;
        for (let x = -R; x <= R; x++) { if (x >= 0 && x < W) { acc += lum[y * W + x]; n++; } }
        for (let x = 0; x < W; x++) {
          tmp[y * W + x] = acc / n;
          const addX = x + R + 1; const subX = x - R;
          if (addX < W) { acc += lum[y * W + addX]; n++; }
          if (subX >= 0) { acc -= lum[y * W + subX]; n--; }
        }
      }
      for (let x = 0; x < W; x++) {
        let acc = 0; let n = 0;
        for (let y = -R; y <= R; y++) { if (y >= 0 && y < H) { acc += tmp[y * W + x]; n++; } }
        for (let y = 0; y < H; y++) {
          blur[y * W + x] = acc / n;
          const addY = y + R + 1; const subY = y - R;
          if (addY < H) { acc += tmp[addY * W + x]; n++; }
          if (subY >= 0) { acc -= tmp[subY * W + x]; n--; }
        }
      }

      const weight = new Float32Array(W * H);
      let total = 0;
      for (let i = 0; i < W * H; i++) {
        const detail = lum[i] + 1.1 * (lum[i] - blur[i]);
        // виньетка: центр (лицо) важнее краёв/фона
        const vx = ((i % W) / W - 0.5) / 0.5; const vy = (Math.floor(i / W) / H - 0.45) / 0.55;
        const vd = Math.sqrt(vx * vx + vy * vy);
        const vign = 1 - smooth((vd - 0.55) / 0.5);
        const v = Math.pow(Math.min(1, Math.max(0, detail)), 1.35) * (0.12 + 0.88 * vign);
        weight[i] = v;
        total += v + 0.0001;
        lum[i] = v;
      }
      // кумулятивное распределение для взвешенного выбора пикселя
      const cdf = new Float32Array(W * H);
      let run = 0;
      for (let i = 0; i < W * H; i++) { run += weight[i] + 0.0001; cdf[i] = run / (total + W * H * 0.0001); }

      const particles = particlesRef.current;
      for (const p of particles) {
        const u = rand();
        let a = 0; let b = cdf.length - 1;
        while (a < b) { const m = (a + b) >> 1; if (cdf[m] < u) a = m + 1; else b = m; }
        const x = a % W; const y = Math.floor(a / W);
        p.px = (x + rand()) / W;
        p.py = (y + rand()) / H;
        p.pLum = lum[a];
        p.hasSpot = true;
      }
      setPhotoReady(true);
    };
    img.src = photoUrl;
    return () => { cancelled = true; };
  }, [photoUrl]);

  useImperativeHandle(ref, () => ({
    animateTo(target, duration = 1600) {
      const start = progressRef.current;
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        progressRef.current = start + (target - start) * eased;
        if (t < 1) requestAnimationFrame(step);
        else onProgressSettle?.(target);
      }
      requestAnimationFrame(step);
    },
    getProgress() { return progressRef.current; },
  }));

  // 3. Рендер
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf; let width = 0; let height = 0;

    function resize() {
      // clientWidth, а не getBoundingClientRect: последний искажается scale-анимацией перехода
      width = canvas.parentElement.clientWidth; height = canvas.parentElement.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr; canvas.height = height * dpr;
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    let time = 0;
    const cosT = Math.cos(TILT); const sinT = Math.sin(TILT);

    function tick() {
      time += 0.016;
      ctx.clearRect(0, 0, width, height);
      const progress = progressRef.current;
      const sprites = spritesRef.current;
      const glow = glowRef.current;
      if (!sprites) { raf = requestAnimationFrame(tick); return; }

      if (!draggingRef.current && progress < 0.03) {
        rotationRef.current += spinRef.current;
      }

      const cx = width / 2;
      const galaxyCy = height * 0.42;
      const R = Math.min(width * 0.47, height * 0.33); // радиус галактики в px

      // рамка портрета: по аспекту фото, максимум по ширине/высоте
      const aspect = portraitAspectRef.current;
      const maxW = width * 0.88;
      const maxH = height * 0.62;
      let pW = maxW; let pH = pW * aspect;
      if (pH > maxH) { pH = maxH; pW = pH / aspect; }
      const pOx = cx - pW / 2;
      const pOy = height * 0.4 - pH / 2;

      ctx.globalCompositeOperation = 'lighter';

      // мягкое свечение ядра и диска
      const coreA = 1 - progress;
      if (coreA > 0.01) {
        ctx.globalAlpha = 0.5 * coreA;
        const cs = R * 0.85;
        ctx.save();
        ctx.translate(cx, galaxyCy);
        ctx.scale(1, cosT * 0.9 + 0.1);
        const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, cs);
        g1.addColorStop(0, 'rgba(255,240,215,0.95)');
        g1.addColorStop(0.18, 'rgba(255,205,160,0.38)');
        g1.addColorStop(0.5, 'rgba(150,120,255,0.14)');
        g1.addColorStop(1, 'rgba(90,70,200,0)');
        ctx.fillStyle = g1;
        ctx.fillRect(-cs, -cs, cs * 2, cs * 2);
        ctx.restore();
      }

      const rot = rotationRef.current;
      const list = particlesRef.current;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        // диск вращается дифференциально: центр быстрее
        const a = p.ang + rot * (1.6 - Math.min(1.4, p.r) * 0.9);
        const gx3 = Math.cos(a) * p.r;
        const gy3 = Math.sin(a) * p.r;
        // наклон вокруг оси X + перспектива
        const yy = gy3 * cosT - p.z * sinT;
        const zz = gy3 * sinT + p.z * cosT;
        const persp = 1 / (1 - zz * 0.35);
        const gx = cx + gx3 * R * persp;
        const gy = galaxyCy + yy * R * persp;

        let x = gx; let y = gy;
        let sizeMul = persp;
        let alphaBase = p.bright;
        // мерцание
        const tw = 0.7 + 0.3 * Math.sin(time * p.twSpeed + p.tw);

        let pp = 0;
        if (p.hasSpot && progress > 0) {
          // индивидуальная задержка — частицы слетаются волной
          pp = smooth(progress * 1.5 - p.seed * 0.5);
          const tx = pOx + p.px * pW;
          const ty = pOy + p.py * pH;
          x = gx + (tx - gx) * pp;
          y = gy + (ty - gy) * pp;
          if (pp > 0 && pp < 1) {
            // лёгкая дуга при перелёте
            const arc = Math.sin(pp * Math.PI) * 18 * (p.seed - 0.5);
            x += arc; y -= Math.abs(arc) * 0.6;
          }
          // в портрете яркость = яркость пикселя, тёмные участки гаснут
          const portraitAlpha = 0.06 + p.pLum * 0.8;
          alphaBase = alphaBase + (portraitAlpha - alphaBase) * pp;
          sizeMul = persp + (0.95 - persp) * pp;
        }

        const al = Math.min(1, (p.r < 0.3 && pp < 1 ? 0.6 : 1) * alphaBase * tw * (0.3 + 0.55 * pp));
        if (al < 0.03) continue;
        ctx.globalAlpha = al * (pp < 1 ? 0.8 : 1);

        // цвет: в портрете светлее и теплее
        const ci = pp > 0.6 ? 1 : p.colorIdx;
        const sp = sprites[ci][p.word];
        const fs = (pp > 0.5 ? 2.6 + p.pLum * 1.6 : 1.9 + p.size * 1.3) * sizeMul;
        const k = fs / SPRITE_FONT;
        const dw = sp.width * k; const dh = sp.height * k;
        ctx.drawImage(sp, x - dw / 2, y - dh / 2, dw, dh);

        // редкие яркие звёзды получают ореол
        if (p.size > 2.05 && pp < 0.5 && glow) {
          ctx.globalAlpha = al * 0.55 * (1 - pp * 2);
          const gs = 9 * sizeMul;
          ctx.drawImage(glow, x - gs, y - gs, gs * 2, gs * 2);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(tick);
    }

    resize();
    tick();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  function handlePointerDown(e) {
    if (!interactive) return;
    draggingRef.current = true;
    dragStartRef.current = { x: e.clientX, progress: progressRef.current };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!interactive || !draggingRef.current || !containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const dx = e.clientX - dragStartRef.current.x;
    if (photoReady && progressRef.current > 0.02) {
      const delta = dx / (w * 0.8);
      progressRef.current = Math.min(1, Math.max(0, dragStartRef.current.progress - delta));
    } else {
      rotationRef.current += dx * 0.004;
      dragStartRef.current.x = e.clientX;
    }
  }
  function handlePointerUp() {
    if (!interactive || !draggingRef.current) return;
    draggingRef.current = false;
    if (photoReady && progressRef.current > 0.02) {
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
