/**
 * © 2026 Senti.
 * Ядро эффекта: одна система частиц-слов ("люблю" на разных языках),
 * которая живёт как спиральная галактика и перестраивается в портрет.
 *
 * Что здесь важного:
 *
 * 1) Галактика настоящая 3D: диск лежит в плоскости XY, затем
 *    наклоняется (tilt) и поворачивается вокруг вертикальной оси экрана
 *    (yaw). Поэтому её можно покрутить на все 360° в обе стороны, а не
 *    только провернуть в её же плоскости — с инерцией, как глобус.
 *
 * 2) Портрет выкладывается СТРОКАМИ текста, как напечатанная страница,
 *    а яркость каждого слова берётся из фото. Перед этим фото само
 *    кадрируется по лицу (по тону кожи), иначе на селфи в полный рост
 *    лицо занимает пару десятков строк и не читается.
 *
 * 3) Цвета берутся из палитры (palettes.js) — космос может быть в тоне
 *    нашего бренда, а не обязательно тёмно-синим.
 *
 * progress: 0 = галактика, 1 = портрет.
 */
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { pickLoveWords, primaryIndices, PRIMARY_LANGS } from './loveWords.js';
import { getPalette } from './palettes.js';

const SPRITE_FONT = 28;
const ARMS = 2;
const TURNS = 2.15;          // обороты рукава — отсюда "кольца"
const R_INNER = 0.07;
const TILT0 = 1.08;          // стартовый наклон диска, рад (~62°)

// Доля родных языков (uz/ru/en). Их задача — редко попасться на глаза и быть
// узнанными. Всё остальное — языки мира: смысл сцены в том, что это говорит
// ВЕСЬ мир, поэтому родных намеренно мало.
const NATIVE_SHARE_PORTRAIT = 0.14;
const NATIVE_SHARE_BIG = 0.3;

const r1 = () => Math.random();
const gauss = () => (r1() + r1() + r1() + r1() - 2) / 2;
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };

function buildSprites(words, arms) {
  const m = document.createElement('canvas').getContext('2d');
  m.font = `${SPRITE_FONT}px "Manrope", sans-serif`;
  return arms.map((c) => words.map((w) => {
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

/**
 * Кадр для портрета. Автоопределение лица на домашних снимках ненадёжно
 * (стена телесного тона читается как кожа), поэтому кадр задаётся явно:
 * zoom + точка центра. Это же станет рамкой кадрирования в конструкторе.
 */
function cropBox(img, zoom, cx, cy) {
  const z = Math.max(1, Math.min(4, zoom || 1));
  const w = img.width / z;
  const h = Math.min(img.height, w * 1.25);
  const x = Math.max(0, Math.min(img.width - w, cx * img.width - w / 2));
  const y = Math.max(0, Math.min(img.height - h, cy * img.height - h / 2));
  return { x, y, w, h };
}

/** Фото → нормализованная по контрасту карта яркости выбранного кадра */
function analysePhoto(img, crop) {
  const W = 200;
  const srcX = crop ? crop.x : 0;
  const srcY = crop ? crop.y : 0;
  const srcW = crop ? crop.w : img.width;
  const srcH = crop ? crop.h : img.height;
  const H = Math.max(40, Math.min(340, Math.round((srcH / srcW) * W)));

  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const g = off.getContext('2d');
  g.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, W, H);
  let data;
  try { data = g.getImageData(0, 0, W, H).data; } catch { return null; }

  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  }
  const s = Float32Array.from(lum).sort();
  const lo = s[Math.floor(s.length * 0.03)];
  const hi = s[Math.floor(s.length * 0.97)];
  const rg = Math.max(0.06, hi - lo);
  for (let i = 0; i < lum.length; i++) lum[i] = Math.min(1, Math.max(0, (lum[i] - lo) / rg));

  // боксовый блюр → unsharp: вытягивает черты лица
  const R = 7;
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
    const v = lum[i] + 1.15 * (lum[i] - blur[i]);   // сильный local contrast
    out[i] = Math.pow(Math.min(1, Math.max(0, v)), 1.15);
  }
  return { W, H, lum: out };
}

const TextParticleField = forwardRef(function TextParticleField(
  { photoUrl, paletteId = 'senti', cropZoom = 1, cropX = 0.5, cropY = 0.42,
    parallaxX = 0, parallaxY = 0, count, interactive = true, onProgressSettle },
  ref
) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const particlesRef = useRef([]);
  const spritesRef = useRef(null);
  const wordsRef = useRef([]);
  const primaryRef = useRef([]);
  const glowRef = useRef(null);
  const photoRef = useRef(null);
  const layoutRef = useRef(null);
  const layoutKeyRef = useRef('');
  const progressRef = useRef(0);
  const spinRef = useRef(0);
  const viewRef = useRef({ yaw: 0, tilt: TILT0, vYaw: 0, vTilt: 0 });
  const dragRef = useRef(null);
  const [photoReady, setPhotoReady] = useState(false);
  const pal = getPalette(paletteId);
  const parallaxRef = useRef({ x: 0, y: 0 });

  parallaxRef.current = { x: parallaxX, y: parallaxY };

  // --- пул частиц ---------------------------------------------------------
  useEffect(() => {
    const words = pickLoveWords(40);
    wordsRef.current = words;
    primaryRef.current = primaryIndices(words);
    spritesRef.current = buildSprites(words, [...pal.arms, pal.young]);
    glowRef.current = buildGlow();

    const N = count || (window.innerWidth < 480 ? 7000 : 9500);
    // Галактика с перемычкой: рукава начинаются не из точки, а с концов бара.
    // Два главных рукава намеренно НЕ одинаковы и расположены не строго
    // напротив, плюс есть третий обрывочный спур — симметрия выдаёт
    // компьютерную генерацию, настоящие галактики всегда кривоваты.
    const BAR = 0.52;                 // угол перемычки
    const R_BAR = 0.3;                // где кончается бар и начинаются рукава
    const WIND = 6.4;                 // закрутка рукава
    const armAngle = (r, armA) => (armA ? BAR : BAR + Math.PI + 0.22) + WIND * Math.log(r / R_BAR);
    // Узлы звездообразования — яркие розоватые сгустки на рукавах. На любом
    // снимке настоящей галактики они первыми бросаются в глаза, и у нас они
    // к тому же попадают в фирменный розовый.
    const KNOTS = Array.from({ length: 18 }, () => {
      const armA = r1() < 0.5;
      const r = R_BAR + Math.pow(r1(), 0.55) * (1 - R_BAR);
      return { r, ang: armAngle(r, armA), s: 0.025 + r1() * 0.035 };
    });
    const list = new Array(N);
    for (let i = 0; i < N; i++) {
      const kind = r1();
      let r; let ang; let z; let ci = 2; let size; let bright; let big = false;
      let young = false; let knot = false;

      if (kind < 0.11) {
        // балдж — плотное тёплое ядро
        r = Math.abs(gauss()) * 0.085;
        ang = r1() * Math.PI * 2;
        z = gauss() * 0.05;
        ci = 0; size = 0.6 + r1() * 0.7; bright = 0.3 + r1() * 0.35;
      } else if (kind < 0.2) {
        // перемычка через ядро
        const t = (r1() * 2 - 1) * R_BAR;
        const across = gauss() * 0.05;
        const x = t * Math.cos(BAR) - across * Math.sin(BAR);
        const y = t * Math.sin(BAR) + across * Math.cos(BAR);
        r = Math.hypot(x, y); ang = Math.atan2(y, x);
        z = gauss() * 0.035;
        ci = r < 0.14 ? 0 : 1;
        size = 0.5 + r1() * 0.7; bright = 0.22 + r1() * 0.3;
      } else if (kind < 0.875) {
        // два главных рукава: A плотнее и ярче B, и они не строго напротив
        const armA = kind < 0.6;
        r = R_BAR + Math.pow(r1(), 0.6) * (1 - R_BAR);
        const off = gauss();
        ang = armAngle(r, armA) + off * (0.12 + r * 0.26);
        r = Math.max(0.05, r * (1 + gauss() * 0.13));
        z = gauss() * 0.026 * (1.2 - r * 0.7);
        size = 0.45 + r1() * 0.9;
        bright = (0.17 + r1() * 0.4) * (armA ? 1.1 : 0.85);
        // пылевая прожилка по внутреннему краю рукава
        bright *= 1 - 0.62 * Math.exp(-Math.pow((off + 0.62) / 0.3, 2));
      } else if (kind < 0.905) {
        // узел звездообразования
        const kn = KNOTS[Math.floor(r1() * KNOTS.length)];
        const kx = Math.cos(kn.ang) * kn.r + gauss() * kn.s;
        const ky = Math.sin(kn.ang) * kn.r + gauss() * kn.s;
        r = Math.hypot(kx, ky); ang = Math.atan2(ky, kx);
        z = gauss() * 0.02;
        ci = 4; size = 0.5 + r1() * 0.7; bright = 0.2 + r1() * 0.22;
        knot = true;
      } else if (kind < 0.965) {
        // обрывочный спур — короткий рукав-ответвление
        const base = BAR + 2.35;
        r = 0.46 + Math.pow(r1(), 0.8) * 0.46;
        ang = base + WIND * 0.82 * Math.log(r / R_BAR) + gauss() * 0.3;
        z = gauss() * 0.045;
        size = 0.4 + r1() * 0.7; bright = 0.12 + r1() * 0.26;
      } else {
        // гало и редкие крупные читаемые слова
        r = 0.5 + r1() * 0.7;
        ang = r1() * Math.PI * 2;
        z = gauss() * 0.22;
        big = r1() < 0.05;
        size = big ? 3.2 + r1() * 1.6 : 0.6 + r1() * 0.7;
        bright = big ? 0.22 + r1() * 0.18 : 0.16 + r1() * 0.26;
        ci = r1() < 0.4 ? 4 : 2;
      }

      // Цвет по радиусу: тёплый центр → холодные края. Снаружи попадаются
      // молодые скопления — они холоднее и ярче всего остального.
      if (!big && !knot && kind >= 0.11 && kind < 0.965) {
        if (r < 0.18) ci = 0;
        else if (r < 0.34) ci = 1;
        else if (r < 0.58) ci = 2;
        else if (r1() < 0.1) ci = 4;
        else ci = 3;
        if (r > 0.62 && r1() < 0.16) { young = true; ci = 5; bright *= 1.25; size *= 1.15; }
      }

      const prim = primaryRef.current;
      list[i] = {
        r, ang, z, ci, size, bright, big, young, knot,
        w: (big && r1() < NATIVE_SHARE_BIG) ? prim[Math.floor(r1() * prim.length)] : Math.floor(r1() * words.length),
        seed: r1(), tw: r1() * Math.PI * 2, ts: 0.5 + r1() * 1.5,
        slot: null,
      };
    }
    particlesRef.current = list;
    layoutRef.current = null; layoutKeyRef.current = '';
  }, [count, paletteId]);

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
      photoRef.current = analysePhoto(img, cropBox(img, cropZoom, cropX, cropY));
      layoutRef.current = null; layoutKeyRef.current = '';
      setPhotoReady(!!photoRef.current);
    };
    img.src = photoUrl;
    return () => { cancelled = true; };
  }, [photoUrl, cropZoom, cropX, cropY]);

  /**
   * Готовый портрет рисуется ОДИН раз в offscreen-канвас — посимвольно.
   * Слово целиком слишком широкое: лицо размазывается по горизонтали.
   * Отдельная буква ≈ 2px, и этого хватает, чтобы читались глаза и губы.
   * Яркость пикселя управляет не только прозрачностью, но и ПЛОТНОСТЬЮ:
   * в тенях буквы просто не ставятся, и силуэт вырезается пустотой.
   */
  function buildPortraitBitmap(pw, ph, fontPx) {
    const photo = photoRef.current;
    if (!photo) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(pw * dpr));
    cv.height = Math.max(1, Math.round(ph * dpr));
    const g = cv.getContext('2d');
    g.scale(dpr, dpr);
    g.textBaseline = 'middle';
    g.font = `${fontPx}px "Manrope", sans-serif`;
    const tint = pal.arms[1];

    // в портрете родные языки — заметная доля, но не большинство
    const all = wordsRef.current;
    const prim = all.filter((w) => PRIMARY_LANGS.includes(w.lang)).map((w) => w.text);
    const other = all.filter((w) => !PRIMARY_LANGS.includes(w.lang)).map((w) => w.text);
    const pickPhrase = () => (r1() < NATIVE_SHARE_PORTRAIT && prim.length
      ? prim[Math.floor(r1() * prim.length)]
      : other[Math.floor(r1() * other.length)] || prim[0]);
    const lineH = fontPx * 1.05;
    const rows = Math.max(1, Math.floor(ph / lineH));
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.5) * lineH;
      const ny = y / ph;
      const py = Math.min(photo.H - 1, Math.max(0, Math.floor(ny * photo.H)));
      let x = r1() * fontPx * 2;
      let phrase = pickPhrase();
      let pi = 0;
      let guard = 0;
      while (x < pw && guard++ < 4000) {
        const ch = phrase[pi];
        pi += 1;
        if (pi >= phrase.length) { phrase = pickPhrase(); pi = 0; }
        const cw = g.measureText(ch).width || fontPx * 0.3;
        const nx = (x + cw / 2) / pw;
        const px = Math.min(photo.W - 1, Math.max(0, Math.floor(nx * photo.W)));
        let b = photo.lum[py * photo.W + px];
        const dx = nx - 0.5; const dy = ny - 0.47;
        b *= 1 - smooth((Math.hypot(dx / 0.5, dy / 0.54) - 0.74) / 0.38);
        const keep = (b - 0.17) / 0.45;
        if (ch !== ' ' && r1() < keep) {
          const a = 0.3 + 0.7 * Math.min(1, b);
          g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${a.toFixed(3)})`;
          g.fillText(ch, x, y);
        }
        x += cw;
      }
    }
    return cv;
  }

  // --- раскладка портрета: слова строками ----------------------------------
  function buildLayout(width, height) {
    const photo = photoRef.current;
    const sprites = spritesRef.current;
    if (!photo || !sprites) return null;

    const boxW = width * 0.94;
    const boxH = height * 0.68;
    const aspect = photo.H / photo.W;
    let pw = boxW; let ph = pw * aspect;
    if (ph > boxH) { ph = boxH; pw = ph / aspect; }
    const ox = (width - pw) / 2;
    const oy = height * 0.38 - ph / 2;

    // мельче шрифт = больше строк = выше "разрешение" лица
    const fontPx = Math.max(2.1, Math.min(3.4, pw / 145));
    const lineH = fontPx * 1.05;
    const rows = Math.max(1, Math.floor(ph / lineH));
    const gap = fontPx * 0.42;
    const row0 = sprites[1];

    const slots = [];
    for (let row = 0; row < rows; row++) {
      const y = oy + (row + 0.5) * lineH;
      const ny = (y - oy) / ph;
      const py = Math.min(photo.H - 1, Math.max(0, Math.floor(ny * photo.H)));
      let x = ox + r1() * fontPx * 3;
      let guard = 0;
      while (x < ox + pw && guard++ < 600) {
        const wi = Math.floor(r1() * row0.length);
        const sw = row0[wi].width * (fontPx / SPRITE_FONT);
        const cxp = x + sw / 2;
        if (cxp > ox + pw) break;
        let acc = 0;
        for (let s = 0; s <= 4; s++) {
          const nx = (x + (sw * s) / 4 - ox) / pw;
          const px = Math.min(photo.W - 1, Math.max(0, Math.floor(nx * photo.W)));
          acc += photo.lum[py * photo.W + px];
        }
        let b = acc / 5;
        // мягкая овальная виньетка — прямоугольник растворяется в космосе
        const dx = (cxp - ox) / pw - 0.5;
        const dy = ny - 0.47;
        b *= 1 - smooth((Math.hypot(dx / 0.5, dy / 0.54) - 0.78) / 0.42);
        b = smooth((b - 0.08) / 0.82);
        if (b > 0.12 && r1() < (b - 0.1) / 0.5) slots.push({ x: cxp, y, b: Math.min(1, b), w: wi });
        x += sw + gap;
      }
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(r1() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const list = particlesRef.current;
    for (let i = 0; i < list.length; i++) list[i].slot = i < slots.length ? slots[i] : null;
    return { slots, fontPx, bmp: buildPortraitBitmap(pw, ph, fontPx), ox, oy, pw, ph };
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
    /** Мгновенно поставить сцену в нужную фазу — нужно для записи ролика и
     *  для снимка галактики, когда на экране уже собран портрет. */
    setProgress(p) { progressRef.current = Math.max(0, Math.min(1, p)); },
    resetView() { viewRef.current.yaw = 0; viewRef.current.tilt = TILT0; viewRef.current.vYaw = 0; viewRef.current.vTilt = 0; },
  }));

  // --- рендер --------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf; let width = 0; let height = 0;

    function resize() {
      const p = canvas.parentElement;
      if (!p || !p.clientWidth || !p.clientHeight) return;
      width = p.clientWidth; height = p.clientHeight;
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
      const key = `${Math.round(width)}x${Math.round(height)}`;
      if (photoRef.current && layoutKeyRef.current !== key) {
        layoutRef.current = buildLayout(width, height);
        layoutKeyRef.current = key;
      }
      const layout = layoutRef.current;
      const v = viewRef.current;

      // инерция вращения + медленный собственный оборот звёзд
      if (!dragRef.current) {
        v.yaw += v.vYaw; v.tilt += v.vTilt;
        v.vYaw *= 0.94; v.vTilt *= 0.94;
        if (Math.abs(v.vYaw) < 0.00025) v.vYaw = 0;
        if (Math.abs(v.vTilt) < 0.00025) v.vTilt = 0;
        // медленный собственный поворот: сразу видно, что объект живой и объёмный
        if (p < 0.02 && !v.vYaw && !v.vTilt) v.yaw += 0.0011;
      }
      if (p < 0.02) spinRef.current += 0.0007;

      // параллакс: галактика — передний план, смещается заметнее фона
      const par = parallaxRef.current;
      const cx = width / 2 + par.x * 22;
      const cy = height * 0.42 + par.y * 16;
      const open = smooth(p * 1.7);                 // к портрету — разворот к зрителю
      const tilt = (v.tilt + par.y * 0.1) * (1 - open);
      const yaw = (v.yaw + par.x * 0.14) * (1 - open);
      const ct = Math.cos(tilt); const st = Math.sin(tilt);
      const cyw = Math.cos(yaw); const syw = Math.sin(yaw);
      const R = Math.min(width * 0.5, height * 0.33) * (1 + open * 0.45);
      v.R = R; v.cx = cx; v.cy = cy;

      ctx.globalCompositeOperation = 'lighter';

      // свечение диска: точная проекция круга при текущем наклоне/повороте
      const coreA = (1 - smooth(p * 1.4)) * (1 + 0.08 * Math.sin(time * 0.55));
      if (coreA > 0.01) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.transform(cyw, 0, st * syw, ct, 0, 0);
        const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.95);
        halo.addColorStop(0, `rgba(${pal.core[0]},${0.22 * coreA})`);
        halo.addColorStop(0.12, `rgba(${pal.core[1]},${0.15 * coreA})`);
        halo.addColorStop(0.42, `rgba(${pal.core[2]},${0.08 * coreA})`);
        halo.addColorStop(1, `rgba(${pal.core[2]},0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
        // ядро — почти шар, рисуем кругом
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.1);
        core.addColorStop(0, `rgba(${pal.core[0]},${0.8 * coreA})`);
        core.addColorStop(0.4, `rgba(${pal.core[1]},${0.3 * coreA})`);
        core.addColorStop(1, `rgba(${pal.core[1]},0)`);
        ctx.fillStyle = core;
        ctx.fillRect(cx - R * 0.3, cy - R * 0.3, R * 0.6, R * 0.6);

        // дифракционный крест — как у очень яркой звезды в объективе
        const sp = R * (0.42 + 0.03 * Math.sin(time * 0.9));
        const ray = (x0, y0, x1, y1, thick) => {
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, `rgba(${pal.core[0]},0)`);
          g.addColorStop(0.5, `rgba(${pal.core[0]},${0.2 * coreA})`);
          g.addColorStop(1, `rgba(${pal.core[0]},0)`);
          ctx.fillStyle = g;
          if (x0 === x1) ctx.fillRect(cx - thick / 2, y0, thick, y1 - y0);
          else ctx.fillRect(x0, cy - thick / 2, x1 - x0, thick);
        };
        ray(cx - sp, cy, cx + sp, cy, 1.6);
        ray(cx, cy - sp * 0.62, cx, cy + sp * 0.62, 1.4);
      }

      const spin = spinRef.current;
      const glow = glowRef.current;
      const fontP = layout ? layout.fontPx : 3;
      const bmpA = smooth((p - 0.62) / 0.33);

      for (let i = 0; i < list.length; i++) {
        const q = list[i];
        const a = q.ang + spin * (1.8 - Math.min(1, q.r));
        // диск в плоскости XY, толщина по Z
        const X = Math.cos(a) * q.r;
        const Y = Math.sin(a) * q.r;
        const Z = q.z;
        // наклон вокруг горизонтальной оси
        const Y1 = Y * ct - Z * st;
        const Z1 = Y * st + Z * ct;
        // поворот вокруг вертикальной оси экрана → полные 360°
        const X2 = X * cyw + Z1 * syw;
        const Z2 = -X * syw + Z1 * cyw;
        const persp = 1 / (1 - Z2 * 0.3);
        const gx = cx + X2 * R * persp;
        const gy = cy + Y1 * R * persp;

        let x = gx; let y = gy;
        let alpha = q.bright * (0.78 + 0.34 * (0.5 - Z2));  // дальняя сторона тусклее
        let size = (q.big ? 5.5 + q.size : 1.9 + q.size * 1.5) * persp;
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
              alpha += (0.12 + q.slot.b * 1.05 - alpha) * pp;
              alpha *= 1 - bmpA * 0.92;   // растворяемся в готовом портрете
              size += (fontP - size) * pp;
              if (pp > 0.55) ci = 1;
            } else {
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

        if (glow && p < 0.6 && !q.big && (q.knot || q.young || q.size > 1.25)) {
          // узлы и молодые скопления светятся заметно сильнее обычных звёзд
          const k2 = q.knot ? 0.16 : (q.young ? 0.2 : 0.18);
          ctx.globalAlpha = al * k2 * (1 - p * 1.6);
          const g = (q.knot ? 7 : 5) + q.size * 2;
          ctx.drawImage(glow, x - g, y - g, g * 2, g * 2);
        }
      }

      // готовый портрет проявляется, когда частицы уже почти долетели
      if (layout && layout.bmp && bmpA > 0.01) {
        ctx.globalAlpha = bmpA * (0.93 + 0.07 * Math.sin(time * 0.8));
        ctx.drawImage(layout.bmp, layout.ox, layout.oy, layout.pw, layout.ph);
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
  }, [paletteId]);

  // --- жесты ---------------------------------------------------------------
  function down(e) {
    if (!interactive || e.isPrimary === false) return;
    dragRef.current = { x: e.clientX, y: e.clientY, p: progressRef.current, moved: 0 };
    viewRef.current.vYaw = 0; viewRef.current.vTilt = 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    const d = dragRef.current;
    if (!interactive || !d || !containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (photoReady && progressRef.current > 0.02) {
      // на портрете горизонтальный свайп возвращает в галактику
      progressRef.current = Math.min(1, Math.max(0, d.p - (e.clientX - d.x) / (w * 0.8)));
      return;
    }
    const v = viewRef.current;
    // Чувствительность считается от радиуса галактики, а не от пикселей:
    // протянуть палец на один радиус = повернуть примерно на 100°. Поэтому
    // жест одинаково ощущается на любом экране и «идёт от центра» объекта.
    const k = (Math.PI * 0.58) / (v.R || Math.min(w * 0.78, 250));
    // Когда диск перевёрнут (смотрим на него снизу), поворот вокруг
    // вертикальной оси выглядит зеркально — компенсируем, чтобы галактика
    // всегда шла ЗА пальцем, а не против него.
    const flip = Math.cos(v.tilt) < 0 ? -1 : 1;
    const dYaw = dx * k * flip;
    // вниз = наклоняем диск к себе (ближний край идёт вниз), как у трекбола
    const dTilt = -dy * k;
    v.yaw += dYaw; v.tilt += dTilt;
    v.vYaw = dYaw; v.vTilt = dTilt;
    d.x = e.clientX; d.y = e.clientY;
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
      // НЕ onPointerLeave: при setPointerCapture мобильные браузеры шлют
      // pointerleave сразу после касания и жест обрывался на первом же кадре.
      onPointerCancel={up}
      onLostPointerCapture={up}
      style={{
        position: 'absolute', inset: 0, zIndex: 1,
        touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent', WebkitTouchCallout: 'none',
        cursor: interactive ? 'grab' : 'default',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
});

export default TextParticleField;
