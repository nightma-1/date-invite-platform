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
const SKIN = '#f1c9a8';
const HAIR = { female: '#3a2318', male: '#241812' };
const SHOES = '#2a1f24';
const TROUSERS = '#30394f';
const HIP_HEIGHT = 0.86;
const SEAT_HIP_HEIGHT = 0.5;

export function createAvatarKit(track) {
  return {
    limb: track(new THREE.CapsuleGeometry(0.052, 0.27, 3, 10)),
    arm: track(new THREE.CapsuleGeometry(0.038, 0.2, 3, 8)),
    torso: track(new THREE.CapsuleGeometry(0.14, 0.26, 4, 12)),
    head: track(new THREE.SphereGeometry(0.135, 18, 14)),
    hand: track(new THREE.SphereGeometry(0.04, 8, 6)),
    shoe: track(new THREE.SphereGeometry(0.06, 10, 8)),
    eye: track(new THREE.SphereGeometry(0.016, 8, 6)),
    skirt: track(new THREE.CylinderGeometry(0.13, 0.27, 0.66, 18, 1, true)),
    hairLong: track(new THREE.CapsuleGeometry(0.12, 0.26, 4, 12)),
    skin: track(new THREE.MeshLambertMaterial({ color: SKIN })),
    shoes: track(new THREE.MeshLambertMaterial({ color: SHOES })),
    trousers: track(new THREE.MeshLambertMaterial({ color: TROUSERS })),
    hairFemale: track(new THREE.MeshLambertMaterial({ color: HAIR.female })),
    hairMale: track(new THREE.MeshLambertMaterial({ color: HAIR.male })),
    eyeMat: track(new THREE.MeshBasicMaterial({ color: '#21131a' })),
  };
}

function limb(kit, geometry, material, y) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  return mesh;
}

function buildArm(kit, side, material) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.185, 0.42, 0);
  shoulder.add(limb(kit, kit.arm, material, -0.13));
  const elbow = new THREE.Group();
  elbow.position.y = -0.27;
  elbow.add(limb(kit, kit.arm, kit.skin, -0.12));
  elbow.add(limb(kit, kit.hand, kit.skin, -0.27));
  shoulder.add(elbow);
  return { shoulder, elbow };
}

function buildLeg(kit, side, material) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.085, 0, 0);
  hip.add(limb(kit, kit.limb, material, -0.2));
  const knee = new THREE.Group();
  knee.position.y = -0.4;
  knee.add(limb(kit, kit.limb, material, -0.19));
  const shoe = new THREE.Mesh(kit.shoe, kit.shoes);
  shoe.scale.set(0.95, 0.65, 1.6);
  shoe.position.set(0, -0.42, -0.04);
  knee.add(shoe);
  hip.add(knee);
  return { hip, knee };
}

export function createAvatar(kit, { gender = 'female', outfit = 0 } = {}) {
  const female = gender !== 'male';
  const clothes = new THREE.MeshLambertMaterial({ color: OUTFITS[outfit] || OUTFITS[0] });
  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP_HEIGHT;
  root.add(hips);

  const torso = new THREE.Mesh(kit.torso, clothes);
  torso.position.y = 0.3;
  torso.scale.set(female ? 0.92 : 1.08, 1, 0.72);
  hips.add(torso);

  const neck = limb(kit, kit.hand, kit.skin, 0.56);
  hips.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.68;
  headGroup.add(new THREE.Mesh(kit.head, kit.skin));
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(kit.eye, kit.eyeMat);
    eye.position.set(side * 0.052, 0.015, -0.126);
    headGroup.add(eye);
  }
  const hairTop = new THREE.Mesh(kit.head, female ? kit.hairFemale : kit.hairMale);
  hairTop.scale.set(1.07, 0.82, 1.06);
  hairTop.position.set(0, 0.055, 0.02);
  headGroup.add(hairTop);
  if (female) {
    const hairLong = new THREE.Mesh(kit.hairLong, kit.hairFemale);
    hairLong.position.set(0, -0.13, 0.085);
    hairLong.scale.set(1.08, 1, 0.62);
    headGroup.add(hairLong);
  }
  hips.add(headGroup);

  const legMaterial = female ? kit.skin : kit.trousers;
  const armMaterial = female ? kit.skin : clothes;
  const legL = buildLeg(kit, -1, legMaterial);
  const legR = buildLeg(kit, 1, legMaterial);
  const armL = buildArm(kit, -1, armMaterial);
  const armR = buildArm(kit, 1, armMaterial);
  hips.add(legL.hip, legR.hip, armL.shoulder, armR.shoulder);

  let skirt = null;
  if (female) {
    skirt = new THREE.Mesh(kit.skirt, clothes);
    skirt.position.y = -0.2;
    skirt.scale.z = 0.8;
    clothes.side = THREE.DoubleSide;
    hips.add(skirt);
  }

  return {
    root, hips, torso, headGroup, legL, legR, armL, armR, skirt, clothes,
    phase: 0, moving: 0, sit: 0, wave: 0, waveTime: 0,
  };
}

/**
 * Поза на этот кадр. moving и sit заданы как цель (0..1), а сама поза к ним плавно
 * подходит, поэтому персонаж не дёргается между редкими сообщениями по сети.
 */
export function poseAvatar(a, dt, { moving, sit, speed = 1 }) {
  a.moving += (moving - a.moving) * Math.min(1, dt * 10);
  a.sit += (sit - a.sit) * Math.min(1, dt * 6);
  a.phase += dt * 9.5 * speed * Math.max(a.moving, 0.001);
  if (a.waveTime > 0) a.waveTime -= dt;
  a.wave += ((a.waveTime > 0 ? 1 : 0) - a.wave) * Math.min(1, dt * 9);

  const swing = Math.sin(a.phase) * a.moving * (1 - a.sit);
  const lift = Math.max(0, Math.cos(a.phase)) * a.moving * (1 - a.sit);
  const liftOther = Math.max(0, -Math.cos(a.phase)) * a.moving * (1 - a.sit);
  const sitting = a.sit;

  a.legL.hip.rotation.x = swing * 0.6 + sitting * (Math.PI / 2);
  a.legR.hip.rotation.x = -swing * 0.6 + sitting * (Math.PI / 2);
  a.legL.knee.rotation.x = -lift * 0.85 - sitting * (Math.PI / 2);
  a.legR.knee.rotation.x = -liftOther * 0.85 - sitting * (Math.PI / 2);

  a.armL.shoulder.rotation.x = -swing * 0.55 + sitting * 0.45;
  a.armL.elbow.rotation.x = 0.15 + sitting * 0.5 + a.moving * 0.25;
  a.armR.shoulder.rotation.x = swing * 0.55 + sitting * 0.45;
  a.armR.elbow.rotation.x = 0.15 + sitting * 0.5 + a.moving * 0.25;
  a.armL.shoulder.rotation.z = 0.06;
  a.armR.shoulder.rotation.z = -0.06 + a.wave * 2.75;
  if (a.wave > 0.01) a.armR.elbow.rotation.z = Math.sin(performance.now() / 110) * 0.45 * a.wave;
  else a.armR.elbow.rotation.z = 0;

  a.hips.position.y = HIP_HEIGHT + (SEAT_HIP_HEIGHT - HIP_HEIGHT) * sitting + Math.abs(Math.cos(a.phase)) * 0.025 * a.moving * (1 - sitting);
  a.torso.rotation.x = a.moving * 0.06 * (1 - sitting);
  if (a.skirt) {
    a.skirt.scale.y = 1 - sitting * 0.55;
    a.skirt.position.y = -0.2 + sitting * 0.12;
    a.skirt.position.z = -sitting * 0.16;
  }
}

/** Высота головы над полом с учётом позы: по ней висит имя и держится камера. */
export function headHeight(a) {
  return a.hips.position.y + 0.68;
}

export function disposeAvatar(a) {
  a.clothes.dispose();
}
