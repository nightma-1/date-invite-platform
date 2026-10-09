/**
 * © 2026 Senti.
 * Сборка того, что человек выложит в сторис.
 *
 * Два важных решения:
 *
 * 1) Кадр выбирает отправитель. По умолчанию — НЕ портрет: выкладывая
 *    письмо, человек публикует чужое лицо, и это должно быть осознанным
 *    выбором, а не тем, что происходит само. Конверт и галактика ничего не
 *    раскрывают, но интригуют сильнее.
 *
 * 2) Текст живёт в безопасной зоне. Инстаграм накрывает верх и низ кадра
 *    своим интерфейсом — аватаркой, именем, полем ответа. Всё, что должно
 *    читаться, держим между SAFE_TOP и SAFE_BOTTOM.
 */
export const STORY_W = 1080;
export const STORY_H = 1920;
const SAFE_TOP = 270;
const SAFE_BOTTOM = 1560;

export const FRAMES = [
  { id: 'galaxy', label: 'Галактика', hint: 'ничего не раскрывает' },
  { id: 'envelope', label: 'Конверт', hint: 'только имя' },
  { id: 'portrait', label: 'Портрет', hint: 'видно лицо' },
];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function paintSky(g, pal) {
  const sky = g.createLinearGradient(0, 0, STORY_W * 0.4, STORY_H);
  sky.addColorStop(0, pal.sky[0]);
  sky.addColorStop(0.45, pal.sky[1]);
  sky.addColorStop(1, pal.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, STORY_W, STORY_H);
}

/** Слои живой сцены (фон + частицы), вписанные по принципу cover. */
export function paintScene(g, canvases, centerY = STORY_H * 0.37) {
  canvases.forEach((c) => {
    if (!c || !c.width || !c.height) return;
    // +2% запаса: при дробном devicePixelRatio иначе по краю остаётся щель
    const s = Math.max(STORY_W / c.width, (STORY_H * 0.72) / c.height) * 1.02;
    const dw = c.width * s; const dh = c.height * s;
    g.drawImage(c, (STORY_W - dw) / 2, centerY - dh / 2, dw, dh);
  });
}

/** Конверт рисуем сами: в DOM он вёрстка, а в картинку нужен растр. */
export function paintEnvelope(g, pal, recipientName) {
  const w = 720; const h = 486;
  const x = (STORY_W - w) / 2; const y = STORY_H * 0.37 - h / 2;
  const seal = pal.seal || ['#ff9ebd', '#d4466f'];

  g.save();
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 90;
  g.shadowOffsetY = 40;
  const paper = g.createLinearGradient(x, y, x + w * 0.4, y + h);
  paper.addColorStop(0, '#fffdfc');
  paper.addColorStop(0.5, '#fdf6f4');
  paper.addColorStop(1, '#f2e5eb');
  g.fillStyle = paper;
  roundRect(g, x, y, w, h, 18);
  g.fill();
  g.restore();

  // клапан и боковые сгибы
  g.strokeStyle = 'rgba(42,31,43,0.1)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w / 2, y + h * 0.54); g.lineTo(x + w, y); g.stroke();
  g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w / 2, y + h * 0.46); g.lineTo(x + w, y + h); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.beginPath(); g.moveTo(x + 3, y + h - 3); g.lineTo(x + w / 2, y + h * 0.46 + 3); g.lineTo(x + w - 3, y + h - 3); g.stroke();

  // сургучная печать
  const cx = x + w / 2; const cy = y + h * 0.5;
  const sg = g.createRadialGradient(cx - 14, cy - 16, 4, cx, cy, 62);
  sg.addColorStop(0, seal[0]);
  sg.addColorStop(1, seal[1]);
  g.save();
  g.shadowColor = 'rgba(120,30,70,0.5)';
  g.shadowBlur = 30; g.shadowOffsetY = 12;
  g.fillStyle = sg;
  g.beginPath(); g.ellipse(cx, cy, 60, 58, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.font = '700 46px "Comfortaa", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((recipientName || 'S').trim().charAt(0).toUpperCase(), cx, cy + 2);

  // имя от руки и подчёркивание
  if (recipientName) {
    g.fillStyle = '#4a2a3a';
    g.font = '600 64px "Caveat", cursive';
    g.textBaseline = 'alphabetic';
    g.fillText(recipientName, cx, y + h * 0.78);
    const tw = g.measureText(recipientName).width;
    g.strokeStyle = 'rgba(212,70,111,0.4)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx - tw / 2, y + h * 0.78 + 14);
    g.lineTo(cx + tw / 2, y + h * 0.78 + 14);
    g.stroke();
  }

  // штемпель
  g.save();
  g.translate(x + w - 96, y + h - 92);
  g.rotate(-0.22);
  g.strokeStyle = seal[1]; g.globalAlpha = 0.4; g.lineWidth = 2;
  g.setLineDash([7, 7]);
  g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  g.fillStyle = seal[1];
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 19px "Comfortaa", sans-serif';
  g.fillText('SENTI', 0, -12);
  g.fillRect(-28, -2, 56, 1.5);
  g.font = '600 13px "Manrope", sans-serif';
  g.fillText('ДЛЯ ТЕБЯ', 0, 14);
  g.restore();
}

/**
 * Подписи и призыв. Всё в безопасной зоне: верх и низ кадра съедает
 * интерфейс Инстаграма.
 */
export function paintCaptions(g, pal, { caption, subcaption, frame }, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  let y = SAFE_BOTTOM - 300;
  if (caption) {
    g.shadowColor = pal.accent.glow;
    g.shadowBlur = 44;
    g.fillStyle = '#ffffff';
    g.font = '600 104px "Cormorant Garamond", serif';
    g.fillText(caption, STORY_W / 2, y);
    g.shadowBlur = 0;
  }
  if (subcaption) {
    y += 76;
    g.fillStyle = pal.soft;
    g.font = '500 58px "Caveat", cursive';
    g.fillText(subcaption, STORY_W / 2, y);
  }
  if (frame === 'envelope') {
    y += 70;
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = '500 40px "Caveat", cursive';
    g.fillText('внутри — целая галактика', STORY_W / 2, y);
  }

  // призыв: ради него сторис и существует — иначе посмотрели и забыли
  const bw = 560; const bh = 96;
  const bx = (STORY_W - bw) / 2; const by = SAFE_BOTTOM - 110;
  const grad = g.createLinearGradient(bx, by, bx + bw, by + bh);
  grad.addColorStop(0, '#ff7faa');
  grad.addColorStop(1, '#f85589');
  g.save();
  g.shadowColor = pal.accent.glow; g.shadowBlur = 50; g.shadowOffsetY = 14;
  g.fillStyle = grad;
  roundRect(g, bx, by, bw, bh, bh / 2);
  g.fill();
  g.restore();
  g.fillStyle = '#ffffff';
  g.font = '700 38px "Manrope", sans-serif';
  g.textBaseline = 'middle';
  g.fillText('сделай такое же · senti.uz', STORY_W / 2, by + bh / 2 + 2);
  g.restore();
}

/** Готовая картинка 9:16 для выбранного кадра. */
export async function composeStory({ pal, canvases, frame, caption, subcaption, recipientName }) {
  const out = document.createElement('canvas');
  out.width = STORY_W; out.height = STORY_H;
  const g = out.getContext('2d');
  paintSky(g, pal);
  if (frame === 'envelope') {
    paintScene(g, canvases.slice(0, 1));   // только звёздный фон, без частиц
    paintEnvelope(g, pal, recipientName);
  } else {
    paintScene(g, canvases);
  }
  try { await document.fonts.ready; } catch { /* шрифты уже готовы или недоступны */ }
  paintCaptions(g, pal, {
    caption: frame === 'envelope' ? `${recipientName || ''}, тебе письмо`.trim() : caption,
    subcaption: frame === 'envelope' ? '' : subcaption,
    frame,
  });
  return out;
}

/** Какой формат видео вообще умеет этот браузер. */
export function pickVideoType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) || null;
}

/**
 * Запись ролика: галактика крутится → слова слетаются → проявляется портрет
 * и имя. Пишем в отдельный холст, куда каждый кадр переносим живую сцену,
 * поэтому в ролик попадает ровно то, что человек видел.
 */
export async function recordStory({ pal, canvases, field, caption, subcaption, onProgress }) {
  const type = pickVideoType();
  if (!type) return null;

  const out = document.createElement('canvas');
  out.width = STORY_W; out.height = STORY_H;
  const g = out.getContext('2d');

  const stream = out.captureStream(30);
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 7_000_000 });
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const HOLD = 1100;       // любуемся галактикой
  const MORPH = 3000;      // сборка портрета
  const TAIL = 1900;       // имя и призыв
  const TOTAL = HOLD + MORPH + TAIL;

  field?.resetView?.();
  field?.setProgress?.(0);
  await new Promise((r) => requestAnimationFrame(r));

  rec.start();
  const t0 = performance.now();
  let morphStarted = false;

  await new Promise((resolve) => {
    function frame() {
      const t = performance.now() - t0;
      if (t > HOLD && !morphStarted) { morphStarted = true; field?.animateTo?.(1, MORPH); }

      paintSky(g, pal);
      paintScene(g, canvases);
      const textIn = Math.max(0, Math.min(1, (t - (HOLD + MORPH * 0.82)) / 600));
      if (textIn > 0) paintCaptions(g, pal, { caption, subcaption, frame: 'portrait' }, textIn);

      onProgress?.(Math.min(1, t / TOTAL));
      if (t < TOTAL) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });

  const blob = await new Promise((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type }));
    rec.stop();
  });
  // Расширение берём из фактического типа блоба, а не из запрошенного:
  // браузер может согласиться на video/mp4 и отдать внутри webm, и тогда
  // файл с расширением .mp4 просто не откроется.
  const real = blob.type || type;
  return { blob, ext: real.includes('mp4') ? 'mp4' : 'webm' };
}
