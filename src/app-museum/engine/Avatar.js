/**
 * © 2026 Senti. Все права защищены.
 *
 * Персонажи нарисованы кодом: они ничего не весят, не требуют лицензий
 * на чужие модели и не тормозят на слабых телефонах. Лицом смотрят в сторону −z.
 *
 * Сустав — группа с точкой вращения. Положительный поворот по x
 * выносит конечность вперёд.
 */

import * as THREE from 'three';

export const OUTFITS = ['#d6336c', '#3f6fd1', '#2f9e77', '#e8912d', '#7c5cc4', '#2b2f3a'];
export const EMOTES = { wave: 2, heart: 2.6, clap: 2.2, dance: 4.5 };
const SKIN = '#f1c9a8';
const HAIR = { female: '#3a2318', male: '#241812' };
const SHOES = '#2a1f24';
const TROUSERS = '#30394f';
const HIP_HEIGHT = 0.86;
const SEAT_HIP_HEIGHT = 0.5;

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,.42)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createAvatarKit(track) {
  return {
    limb: track(new THREE.CapsuleGeometry(0.052, 0.27, 3, 10)),
    arm: track(new THREE.CapsuleGeometry(0.038, 0.2, 3, 8)),
    sleeve: track(new THREE.CapsuleGeometry(0.047, 0.17, 3, 8)),
    torso: track(new THREE.CapsuleGeometry(0.14, 0.26, 4, 12)),
    head: track(new THREE.SphereGeometry(0.135, 20, 16)),
    hand: track(new THREE.SphereGeometry(0.04, 8, 6)),
    shoe: track(new THREE.SphereGeometry(0.06, 10, 8)),
    eye: track(new THREE.SphereGeometry(0.017, 8, 6)),
    smile: track(new THREE.TorusGeometry(0.034, 0.0065, 6, 12, Math.PI)),
    skirt: track(new THREE.CylinderGeometry(0.13, 0.27, 0.66, 18, 1, true)),
    hairLong: track(new THREE.CapsuleGeometry(0.12, 0.26, 4, 12)),
    shadowGeo: track(new THREE.PlaneGeometry(0.95, 0.95)),
    skin: track(new THREE.MeshLambertMaterial({ color: SKIN })),
    cheek: track(new THREE.MeshBasicMaterial({ color: '#f19a9a', transparent: true, opacity: 0.55 })),
    shoes: track(new THREE.MeshLambertMaterial({ color: SHOES })),
    trousers: track(new THREE.MeshLambertMaterial({ color: TROUSERS })),
    hairFemale: track(new THREE.MeshLambertMaterial({ color: HAIR.female })),
    hairMale: track(new THREE.MeshLambertMaterial({ color: HAIR.male })),
    dark: track(new THREE.MeshBasicMaterial({ color: '#21131a' })),
    shadow: track(new THREE.MeshBasicMaterial({ map: track(shadowTexture()), transparent: true, depthWrite: false })),
  };
}

function part(geometry, material, y) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  return mesh;
}

function buildArm(kit, side, clothes) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.185, 0.42, 0);
  shoulder.add(part(kit.sleeve, clothes, -0.11)); // рукав до локтя
  const elbow = new THREE.Group();
  elbow.position.y = -0.27;
  elbow.add(part(kit.arm, kit.skin, -0.12));
  elbow.add(part(kit.hand, kit.skin, -0.27));
  shoulder.add(elbow);
  return { shoulder, elbow };
}

function buildLeg(kit, side, material) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.085, 0, 0);
  hip.add(part(kit.limb, material, -0.2));
  const knee = new THREE.Group();
  knee.position.y = -0.4;
  knee.add(part(kit.limb, material, -0.19));
  const shoe = new THREE.Mesh(kit.shoe, kit.shoes);
  shoe.scale.set(0.95, 0.65, 1.6);
  shoe.position.set(0, -0.42, -0.04);
  knee.add(shoe);
  hip.add(knee);
  return { hip, knee };
}

function buildHead(kit, female) {
  const head = new THREE.Group();
  head.position.y = 0.68;
  head.add(new THREE.Mesh(kit.head, kit.skin));
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(kit.eye, kit.dark);
    eye.position.set(side * 0.05, 0.018, -0.126);
    head.add(eye);
    eyes.push(eye);
    const cheek = new THREE.Mesh(kit.eye, kit.cheek);
    cheek.scale.set(1.5, 1, 0.4);
    cheek.position.set(side * 0.082, -0.028, -0.108);
    head.add(cheek);
  }
  const smile = new THREE.Mesh(kit.smile, kit.dark);
  smile.rotation.z = Math.PI;
  smile.position.set(0, -0.03, -0.129);
  head.add(smile);

  const hair = female ? kit.hairFemale : kit.hairMale;
  const top = new THREE.Mesh(kit.head, hair);
  top.scale.set(1.07, 0.82, 1.06);
  top.position.set(0, 0.055, 0.02);
  head.add(top);
  const fringe = new THREE.Mesh(kit.head, hair);
  fringe.scale.set(female ? 1.03 : 0.98, 0.4, 0.6);
  fringe.position.set(female ? 0.02 : 0, 0.102, -0.07);
  fringe.rotation.z = female ? -0.18 : 0;
  head.add(fringe);
  if (female) {
    const long = new THREE.Mesh(kit.hairLong, hair);
    long.position.set(0, -0.13, 0.085);
    long.scale.set(1.08, 1, 0.62);
    head.add(long);
  }
  return { head, eyes };
}

export function createAvatar(kit, { gender = 'female', outfit = 0 } = {}) {
  const female = gender !== 'male';
  const clothes = new THREE.MeshLambertMaterial({ color: OUTFITS[outfit] || OUTFITS[0], side: female ? THREE.DoubleSide : THREE.FrontSide });
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);

  const shadow = new THREE.Mesh(kit.shadowGeo, kit.shadow);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  root.add(shadow);

  const torso = new THREE.Mesh(kit.torso, clothes);
  torso.position.y = 0.3;
  torso.scale.set(female ? 0.92 : 1.08, 1, 0.72);
  hips.add(torso);
  hips.add(part(kit.hand, kit.skin, 0.56));

  const { head: headGroup, eyes } = buildHead(kit, female);
  hips.add(headGroup);

  const legMaterial = female ? kit.skin : kit.trousers;
  const legL = buildLeg(kit, -1, legMaterial);
  const legR = buildLeg(kit, 1, legMaterial);
  const armL = buildArm(kit, -1, clothes);
  const armR = buildArm(kit, 1, clothes);
  hips.add(legL.hip, legR.hip, armL.shoulder, armR.shoulder);

  let skirt = null;
  if (female) {
    skirt = new THREE.Mesh(kit.skirt, clothes);
    skirt.position.y = -0.2;
    skirt.scale.z = 0.8;
    hips.add(skirt);
  }

  return {
    root, hips, torso, headGroup, eyes, legL, legR, armL, armR, skirt, clothes, shadow,
    phase: 0, moving: 0, sit: 0, time: Math.random() * 10, look: 0,
    emoteKind: null, emoteTime: 0, emoteMix: 0, nextBlink: 2 + Math.random() * 3,
  };
}

export function emote(a, kind) {
  if (!EMOTES[kind]) return;
  a.emoteKind = kind;
  a.emoteTime = EMOTES[kind];
}

/**
 * Поза на этот кадр. moving и sit заданы как цель (0..1), а сама поза к ним плавно
 * подходит, поэтому персонаж не дёргается между редкими сообщениями по сети.
 * look — куда повёрнута голова относительно тела, в радианах.
 */
export function poseAvatar(a, dt, { moving, sit, look = 0 }) {
  a.time += dt;
  a.moving += (moving - a.moving) * Math.min(1, dt * 10);
  a.sit += (sit - a.sit) * Math.min(1, dt * 6);
  a.phase += dt * 9.5 * Math.max(a.moving, 0.001);
  if (a.emoteTime > 0) a.emoteTime -= dt;
  // Идущий человек жест не доигрывает
  if (a.moving > 0.5 && a.emoteKind === 'dance') a.emoteTime = 0;
  a.emoteMix += ((a.emoteTime > 0 ? 1 : 0) - a.emoteMix) * Math.min(1, dt * 9);
  if (a.emoteMix < 0.01 && a.emoteTime <= 0) a.emoteKind = null;

  const upright = 1 - a.sit;
  const swing = Math.sin(a.phase) * a.moving * upright;
  const lift = Math.max(0, Math.cos(a.phase)) * a.moving * upright;
  const liftOther = Math.max(0, -Math.cos(a.phase)) * a.moving * upright;
  const s = a.sit;
  const e = a.emoteMix;
  const t = a.time;
  const breath = Math.sin(t * 1.7) * 0.012;

  let hipY = HIP_HEIGHT + (SEAT_HIP_HEIGHT - HIP_HEIGHT) * s + Math.abs(Math.cos(a.phase)) * 0.025 * a.moving * upright;
  let hipX = 0;
  let hipTurn = 0;
  const L = { sx: -swing * 0.55 + s * 0.45, sz: 0.06, ex: 0.15 + s * 0.5 + a.moving * 0.25, ez: 0 };
  const R = { sx: swing * 0.55 + s * 0.45, sz: -0.06, ex: 0.15 + s * 0.5 + a.moving * 0.25, ez: 0 };
  let legBendL = 0;
  let legBendR = 0;

  if (a.emoteKind === 'wave') {
    R.sz += e * 2.75;
    R.ez = Math.sin(t * 9) * 0.45 * e;
  } else if (a.emoteKind === 'heart') {
    // Руки над головой сходятся в сердечко
    L.sz += e * -2.35; R.sz += e * 2.35;
    L.ez = e * -2.0; R.ez = e * 2.0;
    L.sx *= 1 - e; R.sx *= 1 - e;
    hipY += Math.sin(t * 5) * 0.012 * e;
  } else if (a.emoteKind === 'clap') {
    const beat = Math.sin(t * 16) * 0.5 + 0.5;
    L.sx = L.sx * (1 - e) + e * 1.05; R.sx = R.sx * (1 - e) + e * 1.05;
    L.ex = L.ex * (1 - e) + e * 0.75; R.ex = R.ex * (1 - e) + e * 0.75;
    L.sz += e * (-0.12 + beat * -0.3); R.sz += e * (0.12 + beat * 0.3);
  } else if (a.emoteKind === 'dance') {
    const k = e * upright;
    const beat = t * 6.2;
    hipX = Math.sin(beat) * 0.07 * k;
    hipTurn = Math.sin(beat * 0.5) * 0.35 * k;
    hipY -= (Math.sin(beat * 2) * 0.5 + 0.5) * 0.035 * k;
    L.sz += k * (-1.2 - Math.sin(beat) * 0.9); R.sz += k * (1.2 - Math.sin(beat) * 0.9);
    L.ex += k * 0.9; R.ex += k * 0.9;
    legBendL = Math.max(0, Math.sin(beat)) * 0.45 * k;
    legBendR = Math.max(0, -Math.sin(beat)) * 0.45 * k;
  }

  a.legL.hip.rotation.x = swing * 0.6 + s * (Math.PI / 2) + legBendL;
  a.legR.hip.rotation.x = -swing * 0.6 + s * (Math.PI / 2) + legBendR;
  a.legL.knee.rotation.x = -lift * 0.85 - s * (Math.PI / 2) - legBendL * 1.6;
  a.legR.knee.rotation.x = -liftOther * 0.85 - s * (Math.PI / 2) - legBendR * 1.6;

  a.armL.shoulder.rotation.set(L.sx, 0, L.sz);
  a.armL.elbow.rotation.set(L.ex, 0, L.ez);
  a.armR.shoulder.rotation.set(R.sx, 0, R.sz);
  a.armR.elbow.rotation.set(R.ex, 0, R.ez);

  a.hips.position.set(hipX, hipY, 0);
  a.hips.rotation.y = hipTurn;
  a.torso.rotation.x = a.moving * 0.06 * upright;
  a.torso.scale.y = 1 + breath;

  // Голова следит за взглядом, слегка покачивается и моргает
  a.look += (THREE.MathUtils.clamp(look, -1.1, 1.1) - a.look) * Math.min(1, dt * 8);
  a.headGroup.rotation.y = a.look;
  a.headGroup.rotation.z = Math.sin(t * 0.9) * 0.025 + (a.emoteKind === 'dance' ? Math.sin(t * 6.2) * 0.12 * e : 0);
  a.headGroup.position.y = 0.68 + breath * 0.5;
  a.nextBlink -= dt;
  const closed = a.nextBlink < 0.12;
  for (const eye of a.eyes) eye.scale.y = closed ? 0.12 : 1;
  if (a.nextBlink < 0) a.nextBlink = 2.5 + Math.random() * 3.5;

  if (a.skirt) {
    // Сидя юбка ложится на колени, а не складывается вокруг ног
    a.skirt.rotation.x = s * 1.32;
    a.skirt.scale.y = 1 - s * 0.3;
    a.skirt.position.y = -0.2 + s * 0.19;
    a.skirt.position.z = -s * 0.21;
  }
  a.shadow.scale.setScalar(1 + s * 0.25);
}

/** Высота головы над полом с учётом позы: по ней висит имя и держится камера. */
export function headHeight(a) {
  return a.hips.position.y + 0.68;
}

export function disposeAvatar(a) {
  a.clothes.dispose();
}
