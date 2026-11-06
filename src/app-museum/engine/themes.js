/**
 * © 2026 Senti. Все права защищены.
 *
 * Темы залов. Всё рисуется кодом, поэтому темы ничего не весят
 * и не требуют чужих картинок.
 */

function eightPointStar(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const a = (i * Math.PI) / 8;
    const d = i % 2 === 0 ? r : r * 0.62;
    g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  g.closePath();
}

function majolica(g, w, h) {
  g.fillStyle = '#0d5f74';
  g.fillRect(0, 0, w, h);
  const s = h;
  for (let x = 0; x <= w; x += s) {
    g.fillStyle = '#f3e7c9';
    eightPointStar(g, x + s / 2, s / 2, s * 0.44);
    g.fill();
    g.fillStyle = '#1aa0a8';
    eightPointStar(g, x + s / 2, s / 2, s * 0.32);
    g.fill();
    g.fillStyle = '#e8c26a';
    eightPointStar(g, x + s / 2, s / 2, s * 0.14);
    g.fill();
  }
}

function leaves(g, w, h) {
  g.fillStyle = '#26503f';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#a9c98a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, h / 2);
  for (let x = 0; x <= w; x += 8) g.lineTo(x, h / 2 + Math.sin((x / w) * Math.PI * 4) * h * 0.18);
  g.stroke();
  g.fillStyle = '#7da06a';
  for (let x = 12; x < w; x += 32) {
    const y = h / 2 + Math.sin((x / w) * Math.PI * 4) * h * 0.18;
    g.beginPath();
    g.ellipse(x, y - 10, 13, 6, -0.7, 0, Math.PI * 2);
    g.ellipse(x + 12, y + 10, 13, 6, 0.7, 0, Math.PI * 2);
    g.fill();
  }
}

function hearts(g, w, h) {
  g.fillStyle = '#8f1d3f';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffd3df';
  for (let x = h / 2; x < w; x += h) {
    const y = h / 2;
    const r = h * 0.17;
    g.beginPath();
    g.moveTo(x, y + r * 1.5);
    g.bezierCurveTo(x - r * 2.2, y - r * 0.4, x - r, y - r * 1.8, x, y - r * 0.5);
    g.bezierCurveTo(x + r, y - r * 1.8, x + r * 2.2, y - r * 0.4, x, y + r * 1.5);
    g.fill();
  }
}

function stars(g, w, h) {
  g.fillStyle = '#0b0f2a';
  g.fillRect(0, 0, w, h);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 220; i += 1) {
    g.fillStyle = `rgba(226,232,255,${0.3 + rnd() * 0.7})`;
    const r = 0.6 + rnd() * 1.6;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
    g.fill();
  }
}

export const THEMES = {
  classic: {
    walls: ['#7c2c4a', '#3f4a6b', '#7a4a2e', '#355a55', '#5d3473'],
    entrance: '#8f3253', trim: '#f3e4d3', rail: '#c79a58', frame: '#b98f52',
    floor: '#ffffff', ceiling: '#2a151e', sky: ['#fff3dc', '#e9c79a', '#4a2c2f'], fog: '#1a0c13', cold: false,
  },
  night: {
    walls: ['#1b2150', '#22205c', '#172a55', '#2a1d55', '#1d2548'],
    entrance: '#20265c', trim: '#a9b4e8', rail: '#cfd6ff', frame: '#cfd6ff',
    floor: '#7f8ab8', ceiling: '#0b0f2a', sky: ['#dbe3ff', '#8b9ae0', '#10143a'], fog: '#070a1f', cold: true,
    ceilingArt: stars,
  },
  garden: {
    walls: ['#2f5d4a', '#3f6b45', '#4a6b3a', '#2d5a58', '#55703f'],
    entrance: '#356650', trim: '#efe6c8', rail: '#d7c283', frame: '#a6824b',
    floor: '#d9d2bb', ceiling: '#1d3329', sky: ['#fbf7dc', '#cfe4b0', '#30503a'], fog: '#0f1f18', cold: false,
    frieze: leaves,
  },
  samarkand: {
    walls: ['#0f6f86', '#14586f', '#0f7d80', '#1b5f86', '#0d6573'],
    entrance: '#0f6f86', trim: '#f3e7c9', rail: '#e8c26a', frame: '#d6ad58',
    floor: '#e7d4ad', ceiling: '#0b3442', sky: ['#fff0cf', '#7fd3d4', '#0b3442'], fog: '#06222c', cold: false,
    frieze: majolica,
  },
  valentine: {
    walls: ['#b3264e', '#c23a63', '#9c2147', '#b8345e', '#a82a58'],
    entrance: '#c23a63', trim: '#ffe3ea', rail: '#ffd3df', frame: '#f4c4d0',
    floor: '#ffd9df', ceiling: '#4d1228', sky: ['#fff0f3', '#ffb7c8', '#7a1c3b'], fog: '#2a0916', cold: false,
    frieze: hearts,
  },
};

export function themeOf(key) {
  return THEMES[key] || THEMES.classic;
}
