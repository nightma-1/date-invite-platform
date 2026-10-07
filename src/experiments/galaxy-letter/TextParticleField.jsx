/**
 * © 2026 Senti.
 * Ядро эффекта: одна система частиц-слов ("люблю" на разных языках),
 * которая живёт как наклонённая спиральная галактика и по команде
 * перестраивается в портрет с фото.
 *
 * Две вещи, которые делают картинку похожей на настоящую:
 *
 * 1) Галактика — логарифмическая спираль с несколькими оборотами,
 *    наклонённая к зрителю (диск виден под углом, а не плашмя), с
 *    плотным тёплым ядром и аддитивным смешиванием: плотные места
 *    светятся, редкие читаются как отдельные звёзды-слова.
 *
 * 2) Портрет — слова выкладываются СТРОКАМИ, как напечатанный текст,
 *    а яркость каждого слова берётся из фотографии. Именно построчная
 *    сетка (а не случайная россыпь) даёт читаемое лицо.
 *
 * progress: 0 = галактика, 1 = портрет.
 */
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { pickLoveWords } from './loveWords.js';

const SPRITE_FONT = 28;
const ARMS = 2;
const TURNS = 2.15;        // сколько оборотов делает рукав — отсюда "кольца"
const R_INNER = 0.07;
const COS_INC = 0.47;      // наклон диска: во столько раз он сжат по вертикали
const SIN_INC = Math.sqrt(1 - COS_INC * COS_INC);

const PALETTE = [
  [255, 241, 214], // ядро, тёплый
  [232, 238, 255], // внутренние рукава
  [186, 203, 255],
  [146, 170, 240],
  [226, 186, 255], // редкие сиреневые
];

const r1 = () => Math.random();
const gauss = () => (r1() + r1() + r1() + r1() - 2) / 2;
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

function buildSprites(words) {
  const m = document.createElement('canvas').getContext('2d');
  m.font = `${SPRITE_FONT}px "Manrope", sans-serif`;
  return PALETTE.map((c) => words.map((w) => {
    const wpx = Math.ceil(m.measureText(w.text).width) + 8;
    const cv = document.createElement('canvas');
    cv.width = wpx; cv.height = SPRITE_FONT + 10;
    const g = cv.getContext('2d');
    g.font = `${SPRITE_FONT}px "Manrope", sans-serif`;
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    g.fillText(w.text, wpx / 2, cv.height / 2);
    return cv;
  }));
}

function buildGlow() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.22, 'rgba(255,255,255,0.3)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return cv;
}

/** Фото → нормализованная по контрасту карта яркости */
function analysePhoto(img) {
  const W = 180;
  const H = Math.max(40, Math.min(300, Math.round((img.height / img.width) * W)));
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const g = off.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  let data;
  try { data = g.getImageData(0, 0, W, H).data; } catch { return null; }

  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }
  // автоконтраст по перцентилям
  const s = Float32Array.from(lum).sort();
  const lo = s[Math.floor(s.length * 0.03)];
  const hi = s[Math.floor(s.length * 0.97)];
  const rg = Math.max(0.06, hi - lo);
  for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / rg));

  // боксовый блюр → unsharp: вытягивает черты лица
  const R = 6;
  const tmp = new Float32Array(W * H);
  const blur = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0; let n = 0;
    for (let x = -R; x <= R; x++) if (x >= 0 && x < W) { acc += lum[y * W + x]; n++; }
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / n;
      if (x + R + 1 < W) { acc += lum[y * W + x + R + 1]; n++; }
      if (x - R >= 0) { acc -= lum[y * W + x - R]; n--; }
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0; let n = 0;
    for (let y = -R; y <= R; y++) if (y >= 0 && y < H) { acc += tmp[y * W + x]; n++; }
    for (let y = 0; y < H; y++) {
      blur[y * W + x] = acc / n;
      if (y + R + 1 < H) { acc += tmp[(y + R + 1) * W + x]; n++; }
      if (y - R >= 0) { acc -= tmp[(y - R) * W + x]; n--; }
    }
  }
  const out = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const d = lum[i] + 0.85 * (lum[i] - blur[i]);
    out[i] = Math.pow(Math.min(1, Math.max(0, d)), 1.25);
  }
  return { W, H, lum: out };
}

const TextParticleField = forwardRef(function TextParticleField(
  { photoUrl, count, interactive = true, onProgressSettle },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const particlesRef = useRef([]);
  const spritesRef = useRef(null);
  const glowRef = useRef(null);
  const photoRef = useRef(null);
  const layoutRef = useRef(null);
  const layoutKeyRef = useRef('');
  const progressRef = useRef(0);
  const rotationRef = useRef(0);
  const dragRef = useRef(null);
  const [photoReady, setPhotoReady] = useState(false);

  // --- пул частиц: спираль в координатах диска -----------------------------
  useEffect(() => {
    const words = pickLoveWords(40);
    spritesRef.current = buildSprites(words);
    glowRef.current = buildGlow();

    const N = count || (window.innerWidth < 480 ? 7000 : 9500);
    const k = TURNS * Math.PI * 2 / Math.log(1 / R_INNER);
    const list = new Array(N);
    for (let i = 0; i < N; i++) {
      const kind = r1();
      let r; let ang; let z; let ci; let size; let bright; let big = false;
      if (kind < 0.13) {
        // балдж
        r = R_INNER + Math.abs(gauss()) * 0.1;
        ang = r1() * Math.PI * 2;
        z = gauss() * 0.05;
        ci = 0; size = 0.6 + r1() * 0.7; bright = 0.3 + r1() * 0.35;
      } else if (kind < 0.93) {
        // рукава
        const arm = i % ARMS;
        r = R_INNER + Math.pow(r1(), 0.62) * (1 - R_INNER);
        ang = (arm / ARMS) * Math.PI * 2 + k * Math.log(r / R_INNER)
            + gauss() * (0.13 + r * 0.3);
        // радиальное рассыпание — без него рукав выглядит гладким «проводом»
        r = Math.max(0.03, r * (1 + gauss() * 0.14));
        z = gauss() * 0.028 * (1.2 - r * 0.7);
        ci = r < 0.26 ? 1 : (r1() < 0.12 ? 4 : (r1() < 0.55 ? 2 : 3));
        size = 0.45 + r1() * 0.9; bright = 0.17 + r1() * 0.4;
      } else {
        // разреженное гало + редкие крупные читаемые слова
        r = 0.5 + r1() * 0.7;
        ang = r1() * Math.PI * 2;
        z = gauss() * 0.22;
        ci = r1() < 0.4 ? 4 : 2;
        big = r1() < 0.05;
        size = big ? 3.2 + r1() * 1.6 : 0.6 + r1() * 0.7;
        bright = big ? 0.22 + r1() * 0.18 : 0.16 + r1() * 0.26;
      }
      list[i] = {
        r, ang, z, ci, size, bright, big,
        w: Math.floor(r1() * words.length),
        seed: r1(),
        tw: r1() * Math.PI * 2,
        ts: 0.5 + r1() * 1.5,
        slot: null,
      };
    }
    particlesRef.current = list;
    layoutRef.current = null;
    layoutKeyRef.current = '';
  }, [count]);

  // --- фото ---------------------------------------------------------------
  useEffect(() => {
    if (!photoUrl) {
      photoRef.current = null; layoutRef.current = null; layoutKeyRef.current = '';
      setPhotoReady(false);
      return undefined;
    }
    let cancelled = false;
    setPhotoReady(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      photoRef.current = analysePhoto(img);
      layoutRef.current = null; layoutKeyRef.current = '';
      setPhotoReady(!!photoRef.current);
    };
    img.src = photoUrl;
    return () => { cancelled = true; };
  }, [photoUrl]);

  // --- раскладка портрета: слова строками, яркость из фото ------------------
  function buildLayout(width, height) {
    const photo = photoRef.current;
    const sprites = spritesRef.current;
    if (!photo || !sprites) return null;

    const boxW = width * 0.94;
    const boxH = height * 0.66;
    const aspect = photo.H / photo.W;
    let pw = boxW; let ph = pw * aspect;
    if (ph > boxH) { ph = boxH; pw = ph / aspect; }
    const ox = (width - pw) / 2;
    const oy = height * 0.38 - ph / 2;

    const fontPx = Math.max(2.5, Math.min(4.4, pw / 100));
    const lineH = fontPx * 1.06;
    const rows = Math.max(1, Math.floor(ph / lineH));
    const gap = fontPx * 0.5;
    const row0 = sprites[1];

    const slots = [];
    for (let row = 0; row < rows; row++) {
      const y = oy + (row + 0.5) * lineH;
      const ny = (y - oy) / ph;
      const py = Math.min(photo.H - 1, Math.max(0, Math.floor(ny * photo.H)));
      let x = ox + r1() * fontPx * 3;
      let guard = 0;
      while (x < ox + pw && guard++ < 400) {
        const wi = Math.floor(r1() * row0.length);
        const sw = row0[wi].width * (fontPx / SPRITE_FONT);
        const cxp = x + sw / 2;
        if (cxp > ox + pw) break;
        // средняя яркость под словом
        let acc = 0; let n = 0;
        for (let s = 0; s <= 4; s++) {
          const nx = (x + (sw * s) / 4 - ox) / pw;
          const px = Math.min(photo.W - 1, Math.max(0, Math.floor(nx * photo.W)));
          acc += photo.lum[py * photo.W + px]; n++;
        }
        let b = acc / n;
        // мягкая овальная виньетка, чтобы прямоугольник растворялся в космосе
        const dx = (cxp - ox) / pw - 0.5;
        const dy = ny - 0.47;
        const d = Math.hypot(dx / 0.5, dy / 0.53);
        b *= 1 - smooth((d - 0.74) / 0.46);
        b = smooth((b - 0.1) / 0.8);            // S-кривая: тени гаснут, света плотнеют
        if (b > 0.14) slots.push({ x: cxp, y, b: Math.min(1, b), w: wi });
        x += sw + gap;
      }
    }
    // перемешиваем, чтобы частицы не летели полосами
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(r1() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const list = particlesRef.current;
    for (let i = 0; i < list.length; i++) list[i].slot = i < slots.length ? slots[i] : null;
    return { slots, fontPx };
  }

  useImperativeHandle(ref, () => ({
    animateTo(target, duration = 2200) {
      const start = progressRef.current;
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        progressRef.current = start + (target - start) * e;
        if (t < 1) requestAnimationFrame(step);
        else onProgressSettle?.(target);
      }
      requestAnimationFrame(step);
    },
    getProgress() { return progressRef.current; },
  }));

  // --- рендер --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf; let width = 0; let height = 0;

    function resize() {
      const p = canvas.parentElement;
      const w = p.clientWidth; const h = p.clientHeight;
      if (!w || !h) return;
      width = w; height = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layoutKeyRef.current = '';
    }

    let time = 0;
    function tick() {
      time += 0.016;
      ctx.clearRect(0, 0, width, height);
      const sprites = spritesRef.current;
      const list = particlesRef.current;
      if (!sprites || !list.length) { raf = requestAnimationFrame(tick); return; }

      const p = progressRef.current;

      // раскладка портрета считается один раз на размер канваса
      const key = `${Math.round(width)}x${Math.round(height)}`;
      if (photoRef.current && layoutKeyRef.current !== key) {
        layoutRef.current = buildLayout(width, height);
        layoutKeyRef.current = key;
      }
      const layout = layoutRef.current;

      if (!dragRef.current && p < 0.02) rotationRef.current += 0.0007;

      const cx = width / 2;
      const cy = height * 0.42;
      // при сборке портрета камера "подлетает": диск разворачивается к нам и растёт
      const open = smooth(p * 1.7);
      const cosI = COS_INC + (1 - COS_INC) * open;
      const sinI = SIN_INC * (1 - open);
      const R = Math.min(width * 0.78, height * 0.5) * (1 + open * 0.35);

      ctx.globalCompositeOperation = 'lighter';

      // ядро и общее свечение диска
      const coreA = 1 - smooth(p * 1.4);
      if (coreA > 0.01) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, cosI);
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.95);
        halo.addColorStop(0, `rgba(255,246,224,${0.3 * coreA})`);
        halo.addColorStop(0.12, `rgba(255,224,178,${0.15 * coreA})`);
        halo.addColorStop(0.42, `rgba(150,140,245,${0.08 * coreA})`);
        halo.addColorStop(1, 'rgba(80,70,190,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.1);
        core.addColorStop(0, `rgba(255,252,240,${0.95 * coreA})`);
        core.addColorStop(0.4, `rgba(255,233,195,${0.3 * coreA})`);
        core.addColorStop(1, 'rgba(255,210,150,0)');
        ctx.fillStyle = core;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
      }

      const rot = rotationRef.current;
      const glow = glowRef.current;
      const fontP = layout ? layout.fontPx : 3;

      for (let i = 0; i < list.length; i++) {
        const q = list[i];
        // дифференциальное вращение: центр быстрее краёв
        const a = q.ang + rot * (1.8 - Math.min(1, q.r));
        const dx = Math.cos(a) * q.r;
        const dy = Math.sin(a) * q.r;
        const gx = cx + dx * R;
        const gy = cy + (dy * cosI - q.z * sinI) * R;

        let x = gx; let y = gy;
        let alpha = q.bright;
        let size = (q.big ? 5.5 + q.size : 1.9 + q.size * 1.5);
        let ci = q.ci;
        let pp = 0;

        if (p > 0) {
          pp = smooth(p * 1.45 - q.seed * 0.42);
          if (pp > 0) {
            if (q.slot) {
              x = gx + (q.slot.x - gx) * pp;
              y = gy + (q.slot.y - gy) * pp;
              if (pp < 1) {
                const arc = Math.sin(pp * Math.PI) * 22 * (q.seed - 0.5);
                x += arc; y -= Math.abs(arc) * 0.5;
              }
              alpha = alpha + (0.12 + q.slot.b * 1.05 - alpha) * pp;
              size = size + (fontP - size) * pp;
              if (pp > 0.55) ci = 1;
            } else {
              // лишние частицы растворяются, чтобы портрет был чистым
              alpha *= 1 - pp;
              x = gx + (gx - cx) * pp * 0.5;
              y = gy + (gy - cy) * pp * 0.5;
            }
          }
        }

        const tw = 0.72 + 0.28 * Math.sin(time * q.ts + q.tw);
        const al = Math.min(1, alpha * tw * (0.55 + 0.45 * pp));
        if (al < 0.025) continue;

        const sp = sprites[ci][q.w];
        const k = size / SPRITE_FONT;
        const w = sp.width * k; const h = sp.height * k;
        ctx.globalAlpha = al;
        ctx.drawImage(sp, x - w / 2, y - h / 2, w, h);

        if (glow && q.size > 1.25 && p < 0.6 && !q.big) {
          ctx.globalAlpha = al * 0.22 * (1 - p * 1.6);
          const g = 5 + q.size * 2;
          ctx.drawImage(glow, x - g, y - g, g * 2, g * 2);
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

  // --- жесты ---------------------------------------------------------------
  function down(e) {
    if (!interactive) return;
    dragRef.current = { x: e.clientX, p: progressRef.current };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    const d = dragRef.current;
    if (!interactive || !d || !containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const dx = e.clientX - d.x;
    if (photoReady && progressRef.current > 0.02) {
      progressRef.current = Math.min(1, Math.max(0, d.p - dx / (w * 0.8)));
    } else {
      rotationRef.current += dx * 0.005;
      d.x = e.clientX;
    }
  }
  function up() {
    if (!interactive || !dragRef.current) return;
    dragRef.current = null;
    if (photoReady && progressRef.current > 0.02 && progressRef.current < 1) {
      const target = progressRef.current > 0.5 ? 1 : 0;
      const start = progressRef.current;
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / 600);
        progressRef.current = start + (target - start) * (1 - Math.pow(1 - t, 3));
        if (t < 1) requestAnimationFrame(step);
        else onProgressSettle?.(target);
      }
      requestAnimationFrame(step);
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: interactive ? 'grab' : 'default' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
});

export default TextParticleField;
