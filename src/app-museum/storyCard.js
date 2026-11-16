/**
 * © 2026 Senti. Все права защищены.
 *
 * Карточка для сторис 1080×1920. Имени автора на ней нет: делится получатель,
 * и решать, что показать, должен он.
 */

function load(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function makeStoryCard({ photoUrl, title, footer, cover = false }) {
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1920;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(540, 620, 80, 540, 760, 1300);
  bg.addColorStop(0, '#7c2c4a');
  bg.addColorStop(1, '#2b1320');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1080, 1920);

  await document.fonts?.load('700 90px "Cormorant Garamond"', 'Яя').catch(() => {});

  const img = photoUrl ? await load(photoUrl) : null;
  if (img) {
    const maxW = cover ? 860 : 780;
    const maxH = cover ? 1000 : 860;
    // cover: кадр из музея заполняет рамку целиком, лишнее обрезается по краям
    const r = cover ? Math.max(maxW / img.width, maxH / img.height) : Math.min(maxW / img.width, maxH / img.height);
    const w = cover ? maxW : img.width * r;
    const h = cover ? maxH : img.height * r;
    const x = (1080 - w) / 2;
    const y = (cover ? 230 : 330) + (maxH - h) / 2;
    g.fillStyle = '#c79a58';
    g.fillRect(x - 44, y - 44, w + 88, h + 88);
    g.fillStyle = '#fbf6ee';
    g.fillRect(x - 32, y - 32, w + 64, h + 64);
    if (cover) {
      const sw = w / r;
      const sh = h / r;
      g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
    } else {
      g.drawImage(img, x, y, w, h);
    }
  }

  g.textAlign = 'center';
  g.fillStyle = '#fff8f0';
  g.font = '700 92px "Cormorant Garamond", serif';
  const words = title.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (g.measureText(probe).width > 900 && line) { lines.push(line); line = word; } else line = probe;
  }
  lines.push(line);
  lines.forEach((l, i) => g.fillText(l, 540, 1390 + i * 104));
  g.fillStyle = '#d9b26f';
  g.font = '600 44px Manrope, sans-serif';
  g.fillText(footer, 540, 1760);

  return new Promise((resolve) => c.toBlob(resolve, 'image/png'));
}

export async function shareBlob(blob, name) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
