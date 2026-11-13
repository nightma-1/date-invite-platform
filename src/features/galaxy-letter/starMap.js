/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Звёздная карта: небо, каким оно было в заданную ночь над заданным местом.
 *
 * Это не декорация, а настоящий расчёт: экваториальные координаты звёзд
 * пересчитываются в горизонтальные на момент и точку, которые выбрал
 * отправитель. Поэтому карта на ночь знакомства действительно отличается
 * от карты на любую другую — иначе весь смысл подарка пропадает.
 *
 * Проекция — азимутальная равнопромежуточная от зенита: зенит в центре,
 * горизонт по краю круга, север сверху. ВАЖНО: восток СЛЕВА. На небо
 * смотрят снизу вверх, поэтому оно зеркально географической карте — так
 * устроены все планисферы. С востоком справа созвездия выходят
 * перевёрнутыми, и любой, кто знает Ориона, это заметит.
 */
import { STARS, LINES } from './skyData.js';

const D2R = Math.PI / 180;

/** Юлианская дата от обычного Date (момент времени, часовой пояс неважен). */
export function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/** Среднее гринвичское звёздное время, градусы. */
export function gmstDeg(jd) {
  const d = jd - 2451545.0;
  const T = d / 36525;
  const g = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((g % 360) + 360) % 360;
}

/**
 * Экваториальные координаты → высота и азимут.
 * Азимут считается от севера к востоку, как принято в навигации.
 */
export function toAltAz(raDeg, decDeg, latDeg, lonDeg, lstDeg) {
  const H = (((lstDeg + lonDeg - raDeg) % 360) + 360) % 360 * D2R;
  const dec = decDeg * D2R;
  const lat = latDeg * D2R;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(
    -Math.sin(H) * Math.cos(dec),
    Math.cos(lat) * Math.sin(dec) - Math.sin(lat) * Math.cos(dec) * Math.cos(H),
  );
  return { alt, az };
}

/** Точка неба → точка на холсте. null, если звезда под горизонтом. */
function project(alt, az, cx, cy, R) {
  if (alt <= 0) return null;
  const r = (1 - alt / (Math.PI / 2)) * R;
  return { x: cx - r * Math.sin(az), y: cy - r * Math.cos(az) };
}

/**
 * Рисует карту неба в круге радиуса R с центром (cx, cy) — в стиле постера,
 * а не учебной схемы. Решения, которые отличают подарок от атласа:
 *  - звёзды — чёткие точки, ореол только у самых ярких; размытые пятна
 *    читаются как грязь;
 *  - линии созвездий тонкие и тихие, у горизонта не рисуются вовсе: там
 *    проекция растягивает фигуры, и край круга превращается в паутину;
 *  - круг обведён тонким кольцом со шкалой градусов, как у планисферы.
 * date — момент (Date), lat/lon — градусы, восточная долгота положительная.
 */
export function paintStarMap(g, { date, lat, lon, cx, cy, R, palette }) {
  const lst = gmstDeg(julianDay(date));
  const ink = palette?.soft || '#ffd9e5';
  const MIN_LINE_ALT = 12 * D2R;

  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();

  // едва заметный купол: круг чуть светлее фона, без «дыры» посередине
  const dome = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  dome.addColorStop(0, 'rgba(255,255,255,0.045)');
  dome.addColorStop(1, 'rgba(255,255,255,0.015)');
  g.fillStyle = dome;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);

  // линии созвездий
  g.strokeStyle = ink;
  g.globalAlpha = 0.2;
  g.lineWidth = Math.max(1, R * 0.0026);
  g.lineCap = 'round';
  LINES.forEach((flat) => {
    let prev = null;
    for (let i = 0; i < flat.length; i += 2) {
      const { alt, az } = toAltAz(flat[i], flat[i + 1], lat, lon, lst);
      const p = alt > MIN_LINE_ALT ? project(alt, az, cx, cy, R) : null;
      if (p && prev) {
        g.beginPath();
        g.moveTo(prev.x, prev.y);
        g.lineTo(p.x, p.y);
        g.stroke();
      }
      prev = p;
    }
  });

  // звёзды: чёткий кружок, размер и яркость от звёздной величины
  g.globalAlpha = 1;
  for (let i = 0; i < STARS.length; i += 3) {
    const { alt, az } = toAltAz(STARS[i], STARS[i + 1], lat, lon, lst);
    const p = project(alt, az, cx, cy, R);
    if (!p) continue;
    const mag = STARS[i + 2];
    const r = Math.max(R * 0.0018, (5.3 - mag) * R * 0.0029);
    const a = Math.max(0.35, Math.min(1, (5.6 - mag) / 4.2));
    if (mag < 1.6) {
      // ореол — только у полутора десятков самых ярких звёзд неба
      const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
      glow.addColorStop(0, 'rgba(255,240,246,0.35)');
      glow.addColorStop(1, 'rgba(255,240,246,0)');
      g.fillStyle = glow;
      g.fillRect(p.x - r * 4, p.y - r * 4, r * 8, r * 8);
    }
    g.fillStyle = `rgba(255,252,253,${a})`;
    g.beginPath();
    g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // кольцо горизонта и внешний обод со шкалой — как у планисферы
  const ringR = R + R * 0.045;
  g.strokeStyle = ink;
  g.globalAlpha = 0.55;
  g.lineWidth = Math.max(1, R * 0.0035);
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 0.3;
  g.beginPath(); g.arc(cx, cy, ringR, 0, Math.PI * 2); g.stroke();
  for (let deg = 0; deg < 360; deg += 5) {
    const long = deg % 45 === 0;
    const a = deg * D2R;
    const r0 = R + R * 0.006;
    const r1 = R + R * (long ? 0.04 : 0.018);
    g.globalAlpha = long ? 0.5 : 0.25;
    g.beginPath();
    g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    g.stroke();
  }

  // стороны света снаружи обода; восток слева — небо смотрят снизу вверх
  g.globalAlpha = 0.55;
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(R * 0.05)}px "Manrope", sans-serif`;
  const off = ringR + R * 0.07;
  [['N', 0, -1], ['E', -1, 0], ['S', 0, 1], ['W', 1, 0]].forEach(([ch, dx, dy]) => {
    g.fillText(ch, cx + dx * off, cy + dy * off);
  });
  g.globalAlpha = 1;
}

/** Координаты места для подписи на постере: 39.65° N · 66.96° E. */
export function formatCoords(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns} · ${Math.abs(lon).toFixed(2)}° ${ew}`;
}
