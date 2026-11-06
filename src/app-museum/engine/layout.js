/**
 * © 2026 Senti. Все права защищены.
 *
 * Планировка музея. Чистая математика, без three.js: вход с посвящением,
 * затем цепочка залов. Число залов зависит от числа фото. Главное фото висит
 * в конце маршрута, напротив двери последнего зала.
 *
 * Оси: человек входит у z = 0 и идёт в сторону −z. x — поперёк зала.
 */

export const HALL = {
  halfW: 5.5,
  depth: 15,
  height: 4.2,
  doorHalf: 1.7,
  doorTop: 3.1,
  wallT: 0.3,
  vestHalfW: 3.6,
  vestDepth: 7,
  eye: 1.62,
  seatEye: 1.12,
};

const SIDE_SLOTS = 3;

function hallCapacity(isLast, hasVideo) {
  const start = 2;
  const end = isLast ? 0 : 2;
  const left = isLast && hasVideo ? 0 : SIDE_SLOTS;
  return start + end + left + SIDE_SLOTS;
}

function hallCountFor(photosOnWalls, hasVideo) {
  for (let halls = 1; halls < 12; halls += 1) {
    let cap = 0;
    for (let i = 0; i < halls; i += 1) cap += hallCapacity(i === halls - 1, hasVideo);
    if (cap >= photosOnWalls) return halls;
  }
  return 12;
}

function fit(aspect, maxW, maxH) {
  const a = aspect > 0 ? aspect : 4 / 3;
  let w = maxW;
  let h = w / a;
  if (h > maxH) {
    h = maxH;
    w = h * a;
  }
  return { w, h };
}

function spread(count, from, to) {
  return Array.from({ length: count }, (_, i) => from + ((i + 0.5) / count) * (to - from));
}

export function buildLayout(photos, hasVideo) {
  const { halfW, depth, vestDepth, height, wallT, doorHalf, vestHalfW } = HALL;
  const onWalls = Math.max(0, photos.length - 1);
  const hallCount = hallCountFor(onWalls, hasVideo);
  const totalEnd = -vestDepth - hallCount * depth;

  const pictures = [];
  const place = (photoIndex, spec) => {
    const size = fit(photos[photoIndex].aspect, spec.maxW ?? 2.5, spec.maxH ?? 2);
    pictures.push({ index: photoIndex, x: spec.x, y: spec.y ?? 1.8, z: spec.z, rotY: spec.rotY, w: size.w, h: size.h, hall: spec.hall });
  };

  // Фото идут по порядку автора, начиная со второго. Первое остаётся главным.
  let next = 1;
  for (let hall = 0; hall < hallCount; hall += 1) {
    const isLast = hall === hallCount - 1;
    const zStart = -vestDepth - hall * depth;
    const zEnd = zStart - depth;
    const left = isLast && hasVideo ? 0 : SIDE_SLOTS;
    const remaining = photos.length - next;
    const take = Math.min(remaining, hallCapacity(isLast, hasVideo));

    // Боковые стены заполняем первыми: так при малом числе фото зал не пустует
    const sideRoom = left + SIDE_SLOTS;
    const onSides = Math.min(take, sideRoom);
    const leftN = left === 0 ? 0 : Math.min(left, Math.ceil(onSides / 2));
    const rightN = onSides - leftN;
    let flanks = take - onSides;

    const flankX = (doorHalf + halfW) / 2;
    const margin = 1.6;
    const putFlank = (x, z, rotY) => {
      if (flanks <= 0) return;
      place(next, { x, z, rotY, hall, maxW: 2.2, maxH: 1.9 });
      next += 1;
      flanks -= 1;
    };

    putFlank(-flankX, zStart - wallT / 2 - 0.02, Math.PI);
    for (const z of spread(leftN, zStart - margin, zEnd + margin)) {
      place(next, { x: -halfW + 0.02, z, rotY: Math.PI / 2, hall });
      next += 1;
    }
    if (!isLast) putFlank(-flankX, zEnd + wallT / 2 + 0.02, 0);
    if (!isLast) putFlank(flankX, zEnd + wallT / 2 + 0.02, 0);
    for (const z of spread(rightN, zEnd + margin, zStart - margin)) {
      place(next, { x: halfW - 0.02, z, rotY: -Math.PI / 2, hall });
      next += 1;
    }
    putFlank(flankX, zStart - wallT / 2 - 0.02, Math.PI);
  }

  place(0, { x: 0, y: 2.15, z: totalEnd + wallT / 2 + 0.02, rotY: 0, hall: hallCount - 1, maxW: 5.2, maxH: 2.7 });

  const lastStart = -vestDepth - (hallCount - 1) * depth;
  const lastMid = lastStart - depth / 2;
  const screen = hasVideo
    ? { x: -halfW + 0.04, y: 2, z: lastMid, rotY: Math.PI / 2, w: 6.4, h: 3.2 }
    : null;

  // Прямоугольники, сквозь которые нельзя пройти
  const colliders = [];
  const add = (minX, maxX, minZ, maxZ) => colliders.push({ minX, maxX, minZ, maxZ });
  add(-vestHalfW - wallT, -vestHalfW, -vestDepth, 0);
  add(vestHalfW, vestHalfW + wallT, -vestDepth, 0);
  add(-vestHalfW - wallT, vestHalfW + wallT, 0, wallT);
  add(-2.2, 2.2, -5.55, -5.25);
  add(-halfW - wallT, -halfW, totalEnd, -vestDepth);
  add(halfW, halfW + wallT, totalEnd, -vestDepth);
  add(-halfW - wallT, halfW + wallT, totalEnd - wallT, totalEnd + wallT / 2);
  for (let i = 0; i < hallCount; i += 1) {
    const z = -vestDepth - i * depth;
    add(-halfW, -doorHalf, z - wallT / 2, z + wallT / 2);
    add(doorHalf, halfW, z - wallT / 2, z + wallT / 2);
  }

  // Скамейки: seats — точки, где человек садится и куда смотрит
  const benches = [];
  const bench = (x, z, alongZ, seats) => {
    benches.push({ x, z, alongZ, seats });
    const a = alongZ ? 0.3 : 1.2;
    const b = alongZ ? 1.2 : 0.3;
    add(x - a, x + a, z - b, z + b);
    colliders[colliders.length - 1].low = true; // камера смотрит поверх скамейки
  };
  for (let i = 0; i < hallCount; i += 1) {
    const mid = -vestDepth - i * depth - depth / 2;
    if (i === hallCount - 1) continue;
    bench(0, mid, true, [
      { x: -0.13, z: mid + 0.5, yaw: Math.PI / 2 },
      { x: -0.13, z: mid - 0.5, yaw: Math.PI / 2 },
      { x: 0.13, z: mid + 0.5, yaw: -Math.PI / 2 },
      { x: 0.13, z: mid - 0.5, yaw: -Math.PI / 2 },
    ]);
  }
  const heroZ = totalEnd + 5;
  bench(0, heroZ, false, [
    { x: -0.5, z: heroZ + 0.1, yaw: 0 },
    { x: 0.5, z: heroZ + 0.1, yaw: 0 },
  ]);
  if (screen) {
    bench(-0.9, lastMid, true, [
      { x: -0.8, z: lastMid + 0.55, yaw: Math.PI / 2 },
      { x: -0.8, z: lastMid - 0.55, yaw: Math.PI / 2 },
    ]);
  }

  // Шесть мест для фото гостей на стенах у входа
  const guestSlots = [-1.5, -3.3, -6].flatMap((z) => [
    { x: -vestHalfW + 0.02, y: 1.75, z, rotY: Math.PI / 2 },
    { x: vestHalfW - 0.02, y: 1.75, z, rotY: -Math.PI / 2 },
  ]);

  // Подсказки на полу ведут по маршруту к главному фото
  const arrows = [{ x: -2.9, z: -4.6 }, { x: 2.9, z: -4.6 }];
  for (let i = 0; i < hallCount; i += 1) {
    const z = -vestDepth - i * depth;
    arrows.push({ x: 0, z: z - 1.8 });
    if (i < hallCount - 1) arrows.push({ x: 0, z: z - depth + 2.2 });
  }

  return { hallCount, totalEnd, pictures, screen, colliders, benches, guestSlots, arrows, spawn: { x: 0, z: -2.5, yaw: 0 } }; // камере нужно место позади человека
}

/** Точка перед сиденьем: отсюда человек садится и сюда же встаёт. */
export function seatFront(seat, distance = 0.76) {
  return { x: seat.x - Math.sin(seat.yaw) * distance, z: seat.z - Math.cos(seat.yaw) * distance };
}

/** Сколько камера может отъехать назад, не уйдя за стену. */
export function clearCameraDistance(head, back, wanted, colliders) {
  for (let t = 0.2; t <= wanted; t += 0.12) {
    const x = head.x + back.x * t;
    const z = head.z + back.z * t;
    for (const c of colliders) {
      if (!c.low && x > c.minX - 0.14 && x < c.maxX + 0.14 && z > c.minZ - 0.14 && z < c.maxZ + 0.14) {
        return Math.max(0, t - 0.14);
      }
    }
  }
  return wanted;
}

/** Номер зала по координате: 0 — вход, дальше залы по порядку. */
export function hallAt(z, hallCount) {
  if (z > -HALL.vestDepth) return 0;
  return Math.min(hallCount, Math.floor((-z - HALL.vestDepth) / HALL.depth) + 1);
}

/** Выталкивает круг радиуса r из всех препятствий, чтобы идти вдоль стены, а не застревать. */
export function resolveCollisions(pos, colliders, r = 0.34) {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const c of colliders) {
      const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
      const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * r;
        pos.z = cz + (dz / d) * r;
      } else {
        const toL = pos.x - c.minX;
        const toR = c.maxX - pos.x;
        const toB = pos.z - c.minZ;
        const toT = c.maxZ - pos.z;
        const min = Math.min(toL, toR, toB, toT);
        if (min === toL) pos.x = c.minX - r;
        else if (min === toR) pos.x = c.maxX + r;
        else if (min === toB) pos.z = c.minZ - r;
        else pos.z = c.maxZ + r;
      }
    }
  }
  return pos;
}
