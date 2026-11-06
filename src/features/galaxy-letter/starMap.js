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
 * горизонт по краю круга, север сверху. Так небо читается привычно, как на
 * бумажных планисферах.
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
  return { x: cx + r * Math.sin(az), y: cy - r * Math.cos(az) };
}

/**
 * Рисует карту неба в круге радиуса R с центром (cx, cy).
 * date — момент (Date), lat/lon — градусы, восточная долгота положительная.
 */
export function paintStarMap(g, { date, lat, lon, cx, cy, R, palette }) {
  const lst = gmstDeg(julianDay(date));
  const ink = palette?.soft || '#ffd9e5';

  g.save();
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.clip();

  // купол неба — чуть светлее к горизонту, как настоящая засветка
  const dome = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  dome.addColorStop(0, 'rgba(0,0,0,0.42)');
  dome.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = dome;
  g.fillRect(cx - R, cy - R, R * 2, R * 2);

  // линии созвездий: сегмент рисуем, только если обе его точки над горизонтом
  g.strokeStyle = ink;
  g.globalAlpha = 0.26;
  g.lineWidth = Math.max(1, R * 0.004);
  LINES.forEach((flat) => {
    let started = false;
    g.beginPath();
    for (let i = 0; i < flat.length; i += 2) {
      const { alt, az } = toAltAz(flat[i], flat[i + 1], lat, lon, lst);
      const p = project(alt, az, cx, cy, R);
      if (!p) { started = false; continue; }
      if (started) g.lineTo(p.x, p.y);
      else { g.moveTo(p.x, p.y); started = true; }
    }
    g.stroke();
  });

  // звёзды: чем ярче, тем крупнее; самые яркие получают ореол
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < STARS.length; i += 3) {
    const { alt, az } = toAltAz(STARS[i], STARS[i + 1], lat, lon, lst);
    const p = project(alt, az, cx, cy, R);
    if (!p) continue;
    const mag = STARS[i + 2];
    const size = Math.max(0.6, (5.4 - mag) * R * 0.0032);
    const a = Math.max(0.3, Math.min(1, (5.6 - mag) / 4));
    const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3.2);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.3, `rgba(255,245,250,${a * 0.4})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(p.x - size * 3.2, p.y - size * 3.2, size * 6.4, size * 6.4);
  }
  g.globalCompositeOperation = 'source-over';
  g.restore();

  // обод горизонта и стороны света
  g.strokeStyle = ink;
  g.globalAlpha = 0.5;
  g.lineWidth = Math.max(1.2, R * 0.006);
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.45;
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `600 ${Math.round(R * 0.07)}px "Manrope", sans-serif`;
  const marks = [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]];
  marks.forEach(([ch, dx, dy]) => {
    g.fillText(ch, cx + dx * (R + R * 0.085), cy + dy * (R + R * 0.085));
  });
  g.globalAlpha = 1;
}
