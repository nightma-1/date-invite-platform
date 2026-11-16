/**
 * © 2026 Senti. Все права защищены.
 *
 * 3D-сцена музея. Рассчитана на слабые телефоны: настоящего освещения в залах
 * нет, свет запечён в цвета вершин и мягкие световые пятна. Рамки рисуются
 * одним вызовом, а полноразмерные фото загружаются только рядом с человеком.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALL, clearCameraDistance, hallAt, planRoute, resolveCollisions, seatFront } from './layout.js';
import { createAvatar, createAvatarKit, disposeAvatar, emote, headHeight, poseAvatar } from './Avatar.js';
import { themeOf } from './themes.js';

const SPEED = 2.9;
const LOOK = 0.0042;
const FULL_RADIUS = 11;
const LOW_END = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const MAX_FULL = LOW_END ? 5 : 10;

function shade(hex, f) {
  return new THREE.Color(hex).multiplyScalar(f);
}

/** Коробка с вертикальным градиентом: у пола темнее, сверху светлее. */
function shadedBox(w, h, d, x, y, z, hex) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const low = shade(hex, 0.62);
  const high = shade(hex, 1.12);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    c.copy(low).lerp(high, THREE.MathUtils.clamp(pos.getY(i) / HALL.height, 0, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g.toNonIndexed();
}

/** Геометрия одного цвета, готовая к слиянию со стенами. */
function tinted(geometry, hex, x, y, z) {
  const g = geometry.toNonIndexed();
  g.translate(x, y, z);
  const c = new THREE.Color(hex);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.dispose();
  return g;
}

function carpetTexture(base, edge) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    g.fillStyle = edge;
    g.fillRect(8, 0, 5, h);
    g.fillRect(w - 13, 0, 5, h);
    g.globalAlpha = 0.16;
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(w / 2, y + 12);
      g.lineTo(w / 2 + 20, y + 32);
      g.lineTo(w / 2, y + 52);
      g.lineTo(w / 2 - 20, y + 32);
      g.closePath();
      g.fill();
    }
  }, true);
}

function edgeShade() {
  return canvasTexture(64, 8, (g, w, h) => {
    const r = g.createLinearGradient(0, 0, w, 0);
    r.addColorStop(0, 'rgba(0,0,0,.42)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
}

function canvasTexture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  return t;
}

function parquet() {
  return canvasTexture(1024, 1024, (g, w) => {
    const rows = 14;
    const h = w / rows;
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let row = 0; row < rows; row += 1) {
      const len = w / 3;
      const offset = (row % 3) * (len / 3);
      for (let x = -len; x < w + len; x += len) {
        const tone = rnd() * 22;
        g.fillStyle = `rgb(${112 + tone},${70 + tone * 0.7},${42 + tone * 0.45})`;
        g.fillRect(x + offset, row * h, len - 2, h - 2);
        g.strokeStyle = 'rgba(50,26,12,.13)';
        for (let i = 0; i < 3; i += 1) {
          const y = row * h + 4 + rnd() * (h - 8);
          g.beginPath();
          g.moveTo(x + offset, y);
          g.lineTo(x + offset + len, y + rnd() * 4 - 2);
          g.stroke();
        }
      }
    }
  }, true);
}

function skylight([center, edge, bar]) {
  return canvasTexture(256, 512, (g, w, h) => {
    const glow = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, h * 0.62);
    glow.addColorStop(0, center);
    glow.addColorStop(1, edge);
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.fillStyle = bar;
    for (let x = 0; x <= 4; x += 1) g.fillRect((x * w) / 4 - 3, 0, 6, h);
    for (let y = 0; y <= 8; y += 1) g.fillRect(0, (y * h) / 8 - 3, w, 6);
  });
}

function arrowTexture(color) {
  return canvasTexture(128, 128, (g, w) => {
    g.strokeStyle = color;
    g.lineWidth = 11;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const y of [26, 66]) {
      g.beginPath();
      g.moveTo(w * 0.22, y + 34);
      g.lineTo(w * 0.5, y);
      g.lineTo(w * 0.78, y + 34);
      g.stroke();
    }
  });
}

function softSpot(inner, outer) {
  return canvasTexture(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, inner);
    r.addColorStop(1, outer);
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
}

function wrapLines(g, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const probe = line ? `${line} ${word}` : word;
      if (g.measureText(probe).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = probe;
      }
    }
    lines.push(line);
  }
  return lines;
}

function dedicationTexture({ recipientName, dedication, signature, labelFor }) {
  return canvasTexture(1400, 930, (g, w, h) => {
    g.fillStyle = '#fff8f0';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c79a58';
    g.lineWidth = 4;
    g.strokeRect(34, 34, w - 68, h - 68);
    g.textAlign = 'center';
    g.fillStyle = '#b23a62';
    g.font = '600 46px Manrope, sans-serif';
    g.fillText(labelFor, w / 2, 130);
    g.fillStyle = '#2b1320';
    g.font = '700 104px "Cormorant Garamond", serif';
    g.fillText(recipientName, w / 2, 245);
    let size = 54;
    let lines;
    for (; size >= 32; size -= 3) {
      g.font = `italic 600 ${size}px "Cormorant Garamond", serif`;
      lines = wrapLines(g, dedication, w - 240);
      if (lines.length * size * 1.3 < 440) break;
    }
    const lineH = size * 1.3;
    const top = 330 + (470 - lines.length * lineH) / 2 + size;
    lines.forEach((l, i) => g.fillText(l, w / 2, top + i * lineH));
    g.fillStyle = '#b23a62';
    g.font = 'italic 600 52px "Cormorant Garamond", serif';
    g.fillText(signature, w / 2, h - 88);
  });
}

function posterTexture(label) {
  return canvasTexture(1024, 512, (g, w, h) => {
    g.fillStyle = '#17090f';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(w / 2, h / 2 - 34, 72, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b23a62';
    g.beginPath();
    g.moveTo(w / 2 - 22, h / 2 - 72);
    g.lineTo(w / 2 + 38, h / 2 - 34);
    g.lineTo(w / 2 - 22, h / 2 + 4);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff8f0';
    g.textAlign = 'center';
    g.font = '600 40px Manrope, sans-serif';
    g.fillText(label, w / 2, h / 2 + 110);
  });
}

function labelSprite(text, { bg = 'rgba(32,12,22,.78)', color = '#fff', width = 2.2, size = 34 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `600 ${size}px Manrope, sans-serif`;
  const lines = wrapLines(g, text, 460).slice(0, 4);
  c.width = 512;
  c.height = 40 + lines.length * size * 1.3;
  g.font = `600 ${size}px Manrope, sans-serif`;
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(4, 4, c.width - 8, c.height - 8, 26);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  lines.forEach((l, i) => g.fillText(l, c.width / 2, 20 + (i + 0.85) * size * 1.3 - 6));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(width, (width * c.height) / c.width, 1);
  return s;
}

export class MuseumWorld {
  constructor(canvas, { data, layout, labels, avatar, cameraMode = 'third', onPhotoTap, onGuestTap, onHud, onFilmChange, onProgress, onContextLost }) {
    this.canvas = canvas;
    this.data = data;
    this.layout = layout;
    this.labels = labels;
    this.cb = { onPhotoTap, onGuestTap, onHud, onFilmChange, onProgress };

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, LOW_END ? 1.25 : 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.scene = new THREE.Scene();
    this.theme = themeOf(data.theme);
    this.scene.background = new THREE.Color(this.theme.fog);
    this.scene.fog = new THREE.Fog(this.theme.fog, 24, 62);
    this.camera = new THREE.PerspectiveCamera(66, 1, 0.08, 90);
    this.scene.add(new THREE.HemisphereLight('#fff4e6', '#5a3440', 2.4));

    // У каждого своё место у входа, иначе двое появляются в одной точке
    this.pos = { x: layout.spawn.x + (Math.random() - 0.5) * 2.6, z: layout.spawn.z - Math.random() * 0.5 };
    // Откуда бы человек ни начал, первым он видит посвящение
    this.yaw = Math.atan2(this.pos.x, 5.23 + this.pos.z);
    this.pitch = 0;
    this.move = { x: 0, y: 0 };
    this.keys = new Set();
    this.seat = null;
    this.seatAnim = null;
    this.bodyYaw = this.yaw ?? 0;
    this.cameraMode = cameraMode;
    this.camDist = 2.6;
    this.followId = null;
    this.peers = new Map();
    this.pictureMeshes = [];
    this.textures = new Map();
    this.fullLoaded = new Map();
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.lastSent = { t: 0, x: 0, z: 0, yaw: 0, sit: false };
    this.hud = {};
    this.bursts = [];
    this.disposables = [];
    this.running = false;

    this.kit = createAvatarKit((o) => this.track(o));
    this.me = createAvatar(this.kit, avatar);
    this.scene.add(this.me.root);

    this.buildArchitecture();
    this.buildPictures();
    this.guestMeshes = [];
    this.buildGuestPhotos();
    this.buildBenches();
    this.buildScreen();
    this.bindInput();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.stop();
      onContextLost?.();
    });
    this.resize();
  }

  track(o) {
    this.disposables.push(o);
    return o;
  }

  buildArchitecture() {
    const { halfW, depth, height, wallT, doorHalf, doorTop, vestHalfW, vestDepth } = HALL;
    const { hallCount, totalEnd } = this.layout;
    const geos = [];
    const { trim: cream, entrance: vest, rail, walls: palette } = this.theme;

    const wallY = height / 2;
    geos.push(shadedBox(wallT, height, vestDepth, -vestHalfW - wallT / 2, wallY, -vestDepth / 2, vest));
    geos.push(shadedBox(wallT, height, vestDepth, vestHalfW + wallT / 2, wallY, -vestDepth / 2, vest));
    geos.push(shadedBox(vestHalfW * 2 + wallT * 2, height, wallT, 0, wallY, wallT / 2, vest));
    geos.push(shadedBox(4.4, height, 0.3, 0, wallY, -5.4, cream));

    for (let i = 0; i < hallCount; i += 1) {
      const color = palette[i % palette.length];
      const zStart = -vestDepth - i * depth;
      const zEnd = zStart - depth;
      const mid = (zStart + zEnd) / 2;
      geos.push(shadedBox(wallT, height, depth, -halfW - wallT / 2, wallY, mid, color));
      geos.push(shadedBox(wallT, height, depth, halfW + wallT / 2, wallY, mid, color));
      // Стена с дверью: левая часть, правая часть и перемычка
      const part = halfW - doorHalf;
      for (const side of [-1, 1]) {
        geos.push(shadedBox(part, height, wallT / 2, side * (doorHalf + part / 2), wallY, zStart - wallT / 4, color));
        if (i < hallCount - 1) {
          geos.push(shadedBox(part, height, wallT / 2, side * (doorHalf + part / 2), wallY, zEnd + wallT / 4, color));
        }
      }
      geos.push(shadedBox(doorHalf * 2, height - doorTop, wallT, 0, (height + doorTop) / 2, zStart, cream));
      // Плинтус и карниз
      for (const side of [-1, 1]) {
        geos.push(shadedBox(0.05, 0.2, depth, side * (halfW - 0.025), 0.1, mid, cream));
        geos.push(shadedBox(0.08, 0.1, depth, side * (halfW - 0.04), height - 0.5, mid, rail));
      }
    }
    // Золотые наличники дверей
    for (let i = 0; i < hallCount; i += 1) {
      const z = -vestDepth - i * depth;
      for (const side of [-1, 1]) {
        geos.push(tinted(new THREE.BoxGeometry(0.14, doorTop, wallT + 0.1), rail, side * (doorHalf + 0.07), doorTop / 2, z));
      }
      geos.push(tinted(new THREE.BoxGeometry(doorHalf * 2 + 0.28, 0.14, wallT + 0.1), rail, 0, doorTop + 0.07, z));
    }
    // Растения в кадках
    for (const p of this.layout.plants) {
      geos.push(tinted(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 12), '#b9774f', p.x, 0.21, p.z));
      geos.push(tinted(new THREE.CylinderGeometry(0.025, 0.03, 0.5, 6), '#5a4030', p.x, 0.6, p.z));
      const leaves = [[0, 1.02, 0, 0.3], [0.16, 0.86, 0.08, 0.2], [-0.15, 0.9, -0.06, 0.21], [0.02, 1.3, -0.04, 0.2], [-0.05, 0.8, 0.15, 0.17]];
      leaves.forEach(([dx, y, dz, r], n) => {
        geos.push(tinted(new THREE.IcosahedronGeometry(r, 1), n % 2 ? '#3f8a5a' : '#2f7350', p.x + dx, y, p.z + dz));
      });
    }
    // Стены входа по бокам от двери в первый зал и торцевая стена
    for (const side of [-1, 1]) {
      const part = vestHalfW - doorHalf;
      geos.push(shadedBox(part, height, wallT / 2, side * (doorHalf + part / 2), wallY, -vestDepth + wallT / 4, vest));
    }
    geos.push(shadedBox(halfW * 2, height, wallT, 0, wallY, totalEnd - wallT / 2 + wallT / 2, palette[(hallCount - 1) % palette.length]));

    const staticMesh = new THREE.Mesh(
      this.track(mergeGeometries(geos)),
      this.track(new THREE.MeshBasicMaterial({ vertexColors: true })),
    );
    geos.forEach((g) => g.dispose());
    this.scene.add(staticMesh);

    const length = -totalEnd + 1;
    const floorTex = this.track(parquet());
    floorTex.repeat.set((halfW * 2 + 1) / 3, length / 3);
    const floor = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(halfW * 2 + 1, length)),
      this.track(new THREE.MeshBasicMaterial({ map: floorTex, color: this.theme.floor })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -length / 2 + 0.5);
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(halfW * 2 + 1, length)),
      this.track(new THREE.MeshBasicMaterial(this.ceilingMaterial(length))),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, height, -length / 2 + 0.5);
    this.scene.add(ceiling);

    // Световые фонари в потолке и мягкие пятна от них на полу
    const skylightMat = this.track(new THREE.MeshBasicMaterial({ map: this.track(skylight(this.theme.sky)), transparent: true, opacity: this.theme.cold ? 0.35 : 1 }));
    const skylightGeo = this.track(new THREE.PlaneGeometry(4.6, depth - 6));
    const poolTex = this.track(softSpot('rgba(255,226,180,.42)', 'rgba(255,226,180,0)'));
    const poolMat = this.track(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const poolGeo = this.track(new THREE.PlaneGeometry(9, depth - 2));
    for (let i = 0; i < hallCount; i += 1) {
      const mid = -vestDepth - i * depth - depth / 2;
      const light = new THREE.Mesh(skylightGeo, skylightMat);
      light.rotation.x = Math.PI / 2;
      light.position.set(0, height - 0.01, mid);
      this.scene.add(light);
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(0, 0.01, mid);
      this.scene.add(pool);
    }

    if (this.theme.frieze) this.buildFrieze();
    this.buildFloorDecor();
    this.buildArrows();

    const panel = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(3.4, 2.26)),
      this.track(new THREE.MeshBasicMaterial({ map: this.track(dedicationTexture(this.labels.dedicationArt)) })),
    );
    panel.position.set(0, 1.8, -5.23);
    this.scene.add(panel);
  }

  /** Ковровая дорожка и тени у стен: зал перестаёт выглядеть пустой коробкой. */
  buildFloorDecor() {
    const { halfW, depth, vestDepth } = HALL;
    const { hallCount, totalEnd } = this.layout;
    const hallsLength = hallCount * depth;
    const mid = -vestDepth - hallsLength / 2;

    const carpet = this.track(carpetTexture(this.theme.entrance, this.theme.rail));
    carpet.repeat.set(1, hallsLength / 4);
    const runner = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(2.5, hallsLength - 1.4)),
      this.track(new THREE.MeshBasicMaterial({ map: carpet })),
    );
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0, 0.006, mid + 0.3);
    this.scene.add(runner);

    const shade = this.track(new THREE.MeshBasicMaterial({ map: this.track(edgeShade()), transparent: true, depthWrite: false }));
    const strip = this.track(new THREE.PlaneGeometry(1.1, hallsLength));
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(strip, shade);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = side > 0 ? Math.PI : 0;
      m.position.set(side * (halfW - 0.55), 0.012, mid);
      this.scene.add(m);
    }
    const endStrip = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1.1, halfW * 2)), shade);
    endStrip.rotation.x = -Math.PI / 2;
    endStrip.rotation.z = -Math.PI / 2;
    endStrip.position.set(0, 0.012, totalEnd + 0.7);
    this.scene.add(endStrip);

    // Мягкая тень под каждой скамейкой
    const blob = this.track(new THREE.MeshBasicMaterial({ map: this.track(softSpot('rgba(0,0,0,.4)', 'rgba(0,0,0,0)')), transparent: true, depthWrite: false }));
    const blobGeo = this.track(new THREE.PlaneGeometry(1, 1));
    for (const b of this.layout.benches) {
      const m = new THREE.Mesh(blobGeo, blob);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(b.alongZ ? 1.5 : 3.4, b.alongZ ? 3.4 : 1.5, 1);
      m.position.set(b.x, 0.016, b.z);
      this.scene.add(m);
    }

    // Кольцо-цель для «нажми, куда идти»
    this.marker = new THREE.Mesh(
      this.track(new THREE.RingGeometry(0.2, 0.27, 28)),
      this.track(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false })),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  buildArrows() {
    const mat = this.track(new THREE.MeshBasicMaterial({ map: this.track(arrowTexture(this.theme.rail)), transparent: true, opacity: 0.55, depthWrite: false }));
    const geo = this.track(new THREE.PlaneGeometry(0.8, 0.8));
    for (const a of this.layout.arrows) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(a.x, 0.02, a.z);
      this.scene.add(mesh);
    }
  }

  /** Фото гостей висят у входа: их первым видит каждый, кто зашёл снова. */
  buildGuestPhotos() {
    const plane = this.track(new THREE.PlaneGeometry(1, 1));
    const frameMat = this.track(new THREE.MeshBasicMaterial({ color: this.theme.frame }));
    (this.data.guestPhotos || []).slice(0, this.layout.guestSlots.length).forEach((photo, i) => {
      const slot = this.layout.guestSlots[i];
      const aspect = photo.w / photo.h || 1;
      const h = aspect > 1 ? 1.1 / aspect : 1.25;
      const w = h * aspect;
      const n = new THREE.Vector3(Math.sin(slot.rotY), 0, Math.cos(slot.rotY));
      const frame = new THREE.Mesh(plane, frameMat);
      frame.scale.set(w + 0.1, h + 0.1, 1);
      frame.position.set(slot.x, slot.y, slot.z).addScaledVector(n, 0.02);
      frame.rotation.y = slot.rotY;
      const mat = this.track(new THREE.MeshBasicMaterial({ color: '#d9c7b8', toneMapped: false }));
      const mesh = new THREE.Mesh(plane, mat);
      mesh.scale.set(w, h, 1);
      mesh.position.set(slot.x, slot.y, slot.z).addScaledVector(n, 0.03);
      mesh.rotation.y = slot.rotY;
      mesh.userData.guestIndex = i;
      this.scene.add(frame, mesh);
      this.guestMeshes.push(mesh);
      this.loadTexture(photo.url).then((t) => {
        if (this.disposed) { t.dispose(); return; }
        this.track(t);
        mat.map = t;
        mat.color.set('#ffffff');
        mat.needsUpdate = true;
      }).catch(() => {});
    });
  }

  ceilingMaterial(length) {
    if (!this.theme.ceilingArt) return { color: this.theme.ceiling };
    const tex = this.track(canvasTexture(1024, 1024, this.theme.ceilingArt, true));
    tex.repeat.set(1, length / 12);
    return { map: tex };
  }

  /** Полоса орнамента вдоль стен над карнизом. */
  buildFrieze() {
    const { halfW, height, vestDepth, depth } = HALL;
    const tex = this.track(canvasTexture(1024, 128, this.theme.frieze, true));
    const length = this.layout.hallCount * depth;
    tex.repeat.set(length / 6, 1);
    const mat = this.track(new THREE.MeshBasicMaterial({ map: tex }));
    const geo = this.track(new THREE.PlaneGeometry(length, 0.5));
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(geo, mat);
      strip.position.set(side * (halfW - 0.015), height - 0.22, -vestDepth - length / 2);
      strip.rotation.y = -side * (Math.PI / 2);
      this.scene.add(strip);
    }
  }

  /** Табличка под фото, как в настоящем музее. */
  buildPlaque(pic, n, plane) {
    const photo = this.data.photos[pic.index];
    if (!photo.caption && !photo.date) return;
    const tex = canvasTexture(640, 240, (g, w, h) => {
      g.fillStyle = '#fbf6ee';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#c79a58';
      g.lineWidth = 4;
      g.strokeRect(6, 6, w - 12, h - 12);
      g.textAlign = 'center';
      g.fillStyle = '#2b1320';
      g.font = 'italic 600 38px "Cormorant Garamond", serif';
      const lines = wrapLines(g, photo.caption || '', w - 70).slice(0, 3);
      const top = photo.date ? 62 : 80;
      lines.forEach((l, i) => g.fillText(l, w / 2, top + i * 46));
      if (photo.date) {
        g.fillStyle = '#b23a62';
        g.font = '600 26px Manrope, sans-serif';
        g.fillText(photo.date, w / 2, h - 32);
      }
    });
    tex.anisotropy = 4;
    this.track(tex);
    const mesh = new THREE.Mesh(plane, this.track(new THREE.MeshBasicMaterial({ map: tex })));
    mesh.scale.set(1.05, 0.39, 1);
    mesh.position.set(pic.x, pic.y - pic.h / 2 - 0.4, pic.z).addScaledVector(n, 0.03);
    mesh.rotation.y = pic.rotY;
    this.scene.add(mesh);
  }

  /** Счётчик сердечек у фото. Появляется с первого сердечка. */
  setHeartCount(photoIndex, count) {
    const mesh = this.pictureMeshes.find((m) => m.userData.photoIndex === photoIndex);
    if (!mesh || !count) return;
    if (mesh.userData.badge) {
      this.scene.remove(mesh.userData.badge);
      mesh.userData.badge.material.map.dispose();
      mesh.userData.badge.material.dispose();
    }
    const badge = labelSprite(`♥ ${count}`, { bg: 'rgba(32,12,22,.82)', color: '#ffd3df', width: 0.62, size: 56 });
    const pic = this.layout.pictures.find((p) => p.index === photoIndex);
    badge.position.copy(mesh.position);
    badge.position.y += pic.h / 2 + 0.34;
    this.scene.add(badge);
    mesh.userData.badge = badge;
  }

  /** Сердечко взлетает от фото: видно всем, кто рядом. */
  heartBurst(photoIndex) {
    const mesh = this.pictureMeshes.find((m) => m.userData.photoIndex === photoIndex);
    if (!mesh) return;
    for (let i = 0; i < 5; i += 1) {
      const s = labelSprite('♥', { bg: 'rgba(0,0,0,0)', color: '#ff6f96', width: 0.5, size: 90 });
      s.position.copy(mesh.position);
      s.position.x += (Math.random() - 0.5) * 0.8;
      s.position.z += (Math.random() - 0.5) * 0.8;
      this.scene.add(s);
      this.bursts.push({ sprite: s, born: performance.now() + i * 90 });
    }
  }

  stepBursts(now) {
    this.bursts = this.bursts.filter((b) => {
      const age = (now - b.born) / 1400;
      if (age < 0) { b.sprite.visible = false; return true; }
      b.sprite.visible = true;
      if (age >= 1) {
        this.scene.remove(b.sprite);
        b.sprite.material.map.dispose();
        b.sprite.material.dispose();
        return false;
      }
      b.sprite.position.y += 0.012;
      b.sprite.material.opacity = 1 - age;
      return true;
    });
  }

  buildPictures() {
    const { pictures } = this.layout;
    const box = this.track(new THREE.BoxGeometry(1, 1, 1));
    const plane = this.track(new THREE.PlaneGeometry(1, 1));
    const count = pictures.length;
    const frames = new THREE.InstancedMesh(box, this.track(new THREE.MeshBasicMaterial({ color: this.theme.frame })), count);
    const mats = new THREE.InstancedMesh(plane, this.track(new THREE.MeshBasicMaterial({ color: '#fbf6ee' })), count);
    const shadows = new THREE.InstancedMesh(plane, this.track(new THREE.MeshBasicMaterial({
      map: this.track(softSpot('rgba(0,0,0,.62)', 'rgba(0,0,0,0)')), transparent: true, depthWrite: false,
    })), count);
    const washes = new THREE.InstancedMesh(plane, this.track(new THREE.MeshBasicMaterial({
      map: this.track(softSpot('rgba(255,232,196,.5)', 'rgba(255,232,196,0)')), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })), count);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const n = new THREE.Vector3();

    pictures.forEach((pic, i) => {
      q.setFromAxisAngle(up, pic.rotY);
      n.set(0, 0, 1).applyQuaternion(q);
      const edge = pic.index === 0 ? 0.3 : 0.2;
      const put = (mesh, off, y, w, h, d = 1) => {
        p.set(pic.x, y, pic.z).addScaledVector(n, off);
        s.set(w, h, d);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      };
      put(washes, 0.004, pic.y + 0.35, pic.w + 2.6, pic.h + 2.8);
      put(shadows, 0.008, pic.y - 0.1, pic.w + 0.9, pic.h + 0.9);
      put(frames, 0.04, pic.y, pic.w + edge + 0.12, pic.h + edge + 0.12, 0.07);
      put(mats, 0.08, pic.y, pic.w + edge, pic.h + edge);

      const mat = new THREE.MeshBasicMaterial({ color: '#d9c7b8', toneMapped: false });
      const mesh = new THREE.Mesh(plane, mat);
      mesh.scale.set(pic.w, pic.h, 1);
      mesh.position.set(pic.x, pic.y, pic.z).addScaledVector(n, 0.085);
      mesh.rotation.y = pic.rotY;
      mesh.userData.photoIndex = pic.index;
      this.scene.add(mesh);
      this.pictureMeshes.push(mesh);
      this.disposables.push(mat);
      this.buildPlaque(pic, n, plane);
    });

    // Латунная лампа над каждой картиной, как в настоящей галерее
    const lamps = new THREE.InstancedMesh(box, this.track(new THREE.MeshBasicMaterial({ color: '#e7c98a' })), count);
    pictures.forEach((pic, i) => {
      q.setFromAxisAngle(up, pic.rotY);
      n.set(0, 0, 1).applyQuaternion(q);
      p.set(pic.x, pic.y + pic.h / 2 + (pic.index === 0 ? 0.36 : 0.3), pic.z).addScaledVector(n, 0.16);
      s.set(Math.min(1.1, pic.w * 0.5), 0.05, 0.1);
      m.compose(p, q, s);
      lamps.setMatrixAt(i, m);
    });

    for (const mesh of [washes, shadows, frames, mats, lamps]) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const t = new THREE.Texture(img);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        t.needsUpdate = true;
        resolve(t);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  /** Сначала маленькие копии всех фото: они весят мало и сразу заполняют залы. */
  async loadThumbnails() {
    const queue = [...this.pictureMeshes];
    const total = queue.length;
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const mesh = queue.shift();
        const photo = this.data.photos[mesh.userData.photoIndex];
        try {
          const t = await this.loadTexture(photo.thumb || photo.full);
          if (this.disposed) { t.dispose(); return; }
          mesh.material.map = t;
          mesh.material.color.set('#ffffff');
          mesh.material.needsUpdate = true;
          mesh.userData.thumb = t;
        } catch {
          // Одно битое фото не должно мешать зайти в музей
        }
        done += 1;
        this.cb.onProgress?.(done / total);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
  }

  updateFullResolution() {
    const near = this.pictureMeshes
      .map((mesh) => ({ mesh, d: Math.hypot(mesh.position.x - this.pos.x, mesh.position.z - this.pos.z) }))
      .filter((e) => e.d < FULL_RADIUS)
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_FULL);
    const wanted = new Set(near.map((e) => e.mesh));

    for (const [mesh, tex] of this.fullLoaded) {
      if (!wanted.has(mesh)) {
        mesh.material.map = mesh.userData.thumb || null;
        mesh.material.needsUpdate = true;
        tex.dispose();
        this.fullLoaded.delete(mesh);
      }
    }
    if (this.loadingFull) return;
    const next = near.find((e) => !this.fullLoaded.has(e.mesh));
    if (!next) return;
    const { mesh } = next;
    this.loadingFull = true;
    this.loadTexture(this.data.photos[mesh.userData.photoIndex].full)
      .then((t) => {
        if (this.disposed) { t.dispose(); return; }
        mesh.material.map = t;
        mesh.material.color.set('#ffffff');
        mesh.material.needsUpdate = true;
        this.fullLoaded.set(mesh, t);
      })
      .catch(() => {})
      .finally(() => { this.loadingFull = false; });
  }

  buildBenches() {
    const geos = [];
    for (const b of this.layout.benches) {
      const sx = b.alongZ ? 0.6 : 2.4;
      const sz = b.alongZ ? 2.4 : 0.6;
      geos.push(shadedBox(sx, 0.1, sz, b.x, 0.41, b.z, '#c9925f'));
      for (const dir of [-1, 1]) {
        const lx = b.alongZ ? 0 : dir * 0.95;
        const lz = b.alongZ ? dir * 0.95 : 0;
        geos.push(shadedBox(b.alongZ ? 0.5 : 0.1, 0.36, b.alongZ ? 0.1 : 0.5, b.x + lx, 0.18, b.z + lz, '#3a2a22'));
      }
    }
    const mesh = new THREE.Mesh(this.track(mergeGeometries(geos)), this.track(new THREE.MeshBasicMaterial({ vertexColors: true })));
    geos.forEach((g) => g.dispose());
    this.scene.add(mesh);
    this.seats = this.layout.benches.flatMap((b) => b.seats);
  }

  buildScreen() {
    const s = this.layout.screen;
    if (!s || !this.data.videoUrl) return;
    const frame = new THREE.Mesh(this.track(new THREE.BoxGeometry(s.w + 0.24, s.h + 0.24, 0.1)), this.track(new THREE.MeshBasicMaterial({ color: '#17090f' })));
    frame.position.set(s.x + 0.05, s.y, s.z);
    frame.rotation.y = s.rotY;
    this.scene.add(frame);

    this.posterMap = this.track(posterTexture(this.labels.filmPoster));
    this.screenMat = this.track(new THREE.MeshBasicMaterial({ map: this.posterMap, toneMapped: false }));
    this.screen = new THREE.Mesh(this.track(new THREE.PlaneGeometry(s.w, s.h)), this.screenMat);
    this.screen.position.set(s.x + 0.11, s.y, s.z);
    this.screen.rotation.y = s.rotY;
    this.screen.userData.isScreen = true;
    this.scene.add(this.screen);

    const v = document.createElement('video');
    v.crossOrigin = 'anonymous';
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'metadata';
    v.src = this.data.videoUrl;
    v.addEventListener('ended', () => this.setFilmPlaying(false, true));
    v.addEventListener('loadedmetadata', () => {
      const aspect = v.videoWidth / v.videoHeight;
      if (!aspect) return;
      let w = s.w;
      let h = w / aspect;
      if (h > s.h) { h = s.h; w = h * aspect; }
      this.screen.scale.set(w / s.w, h / s.h, 1);
    });
    this.video = v;
    this.videoTex = this.track(new THREE.VideoTexture(v));
    this.videoTex.colorSpace = THREE.SRGBColorSpace;
  }

  async setFilmPlaying(play, local, t = null) {
    if (!this.video) return;
    if (t !== null && Math.abs(this.video.currentTime - t) > 1.2) this.video.currentTime = t;
    if (play) {
      try {
        await this.video.play();
      } catch {
        // iOS не даёт включить звук без касания: показываем без звука
        this.video.muted = true;
        await this.video.play().catch(() => {});
      }
      this.screenMat.map = this.videoTex;
    } else {
      this.video.pause();
      if (this.video.ended) {
        this.video.currentTime = 0;
        this.screenMat.map = this.posterMap;
      }
    }
    this.screenMat.needsUpdate = true;
    if (local) this.cb.onFilmChange?.(play, this.video.currentTime);
    this.emitHud();
  }

  toggleFilm() {
    if (!this.video) return;
    this.video.muted = false;
    this.setFilmPlaying(this.video.paused, true);
  }

  bindInput() {
    const c = this.canvas;
    let drag = null;
    this.onPointerDown = (e) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
      c.setPointerCapture?.(e.pointerId);
    };
    this.onPointerMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.addLook(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX;
      drag.y = e.clientY;
    };
    this.onPointerUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
      if (moved < 9 && performance.now() - drag.t < 350) this.tap(e.clientX, e.clientY);
      drag = null;
    };
    this.onKeyDown = (e) => {
      if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
      this.keys.add(e.code);
    };
    this.onKeyUp = (e) => this.keys.delete(e.code);
    this.onResize = () => this.resize();
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
  }

  tap(x, y) {
    const r = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    this.raycaster.far = 14;
    const targets = [...this.pictureMeshes, ...this.guestMeshes, ...(this.screen ? [this.screen] : [])];
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) {
      // Нажатие на пол: идём туда сами, джойстик не обязателен
      const ray = this.raycaster.ray;
      if (ray.direction.y < -0.05) {
        const k = -ray.origin.y / ray.direction.y;
        if (k < 26) this.walkTo(ray.origin.x + ray.direction.x * k, ray.origin.z + ray.direction.z * k);
      }
      return;
    }
    const far = hit.distance > (this.cameraMode === 'third' ? 6.6 : 4.6);
    if (far && hit.object.userData.photoIndex !== undefined) {
      // Далёкое фото: сначала подходим, смотреть будем вблизи
      const pic = this.layout.pictures.find((x) => x.index === hit.object.userData.photoIndex);
      this.walkTo(pic.x + Math.sin(pic.rotY) * 2.5, pic.z + Math.cos(pic.rotY) * 2.5, pic.rotY);
      return;
    }
    if (hit.object.userData.isScreen) this.toggleFilm();
    else if (hit.object.userData.guestIndex !== undefined) this.cb.onGuestTap?.(hit.object.userData.guestIndex);
    else this.cb.onPhotoTap?.(hit.object.userData.photoIndex);
  }

  walkTo(x, z, faceYaw = null) {
    if (this.seatAnim) return;
    const goal = { x, z };
    resolveCollisions(goal, this.layout.colliders);
    if (this.seat) this.stand();
    this.followId = null;
    this.walk = { points: planRoute(this.pos, goal, this.layout.hallCount), faceYaw, stuck: 0, detoured: false };
    this.marker.position.set(goal.x, 0.03, goal.z);
    this.marker.visible = true;
  }

  cancelWalk() {
    this.walk = null;
    if (this.marker) this.marker.visible = false;
  }

  stepWalk(dt) {
    const w = this.walk;
    const target = w.points[0];
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.12) {
      w.points.shift();
      w.stuck = 0;
      w.detoured = false;
      if (!w.points.length) {
        if (w.faceYaw !== null) this.yawGoal = w.faceYaw;
        this.cancelWalk();
      }
      return;
    }
    const step = Math.min(SPEED * dt, d);
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    resolveCollisions(this.pos, this.layout.colliders);
    const progress = d - Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    w.stuck = progress < step * 0.3 ? w.stuck + dt : 0;
    if (w.stuck > 0.3) {
      // Упёрлись (обычно в скамейку): один раз обходим сбоку, иначе останавливаемся
      if (w.detoured) { this.cancelWalk(); return; }
      const sideX = -dz / d;
      const sideZ = dx / d;
      const sign = Math.abs(before.x + sideX * 1.5) < HALL.halfW - 0.7 ? 1 : -1;
      w.points.unshift({ x: before.x + sideX * 1.5 * sign, z: before.z + sideZ * 1.5 * sign });
      w.detoured = true;
      w.stuck = 0;
    }
    // Камера мягко доворачивается по ходу движения
    const heading = Math.atan2(-dx, -dz);
    this.yaw += Math.atan2(Math.sin(heading - this.yaw), Math.cos(heading - this.yaw)) * Math.min(1, dt * 1.6);
  }

  addLook(dx, dy) {
    this.yawGoal = null;
    this.yaw -= dx * LOOK;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * LOOK, -1.1, 1.1);
  }

  setMove(x, y) {
    this.move.x = x;
    this.move.y = y;
    if (x || y) { this.followId = null; this.cancelWalk(); }
    if ((x || y) && this.seat) this.stand();
  }

  /** «Следуй за мной»: идём за выбранным человеком, пока сами не тронем управление. */
  follow(id) {
    this.cancelWalk();
    this.followId = id;
    if (this.seat) this.stand();
    this.emitHud();
  }

  stepFollow(dt) {
    const peer = this.peers.get(this.followId);
    if (!peer || !peer.seen) { this.followId = null; return; }
    const dx = peer.target.x - this.pos.x;
    const dz = peer.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    // Застрять за углом нельзя: если отстали, догоняем прыжком
    if (d > 10) {
      this.pos.x = peer.target.x - (dx / d) * 1.6;
      this.pos.z = peer.target.z - (dz / d) * 1.6;
      resolveCollisions(this.pos, this.layout.colliders);
    } else if (d > 1.7) {
      const step = Math.min(SPEED * 1.2 * dt, d - 1.7);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      resolveCollisions(this.pos, this.layout.colliders);
    }
    const want = Math.atan2(-dx, -dz);
    this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 4);
  }

  nearestSeat() {
    let best = null;
    let bestD = 1.9;
    const taken = [...this.peers.values()].filter((p) => p.sit);
    for (const s of this.seats) {
      const d = Math.hypot(s.x - this.pos.x, s.z - this.pos.z);
      const busy = taken.some((p) => Math.hypot(p.target.x - s.x, p.target.z - s.z) < 0.3);
      if (d < bestD && !busy) { best = s; bestD = d; }
    }
    return best;
  }

  /** Подойти к скамейке, развернуться и сесть, а не появиться на ней. */
  sit() {
    if (this.seatAnim || this.seat) return;
    const seat = this.nearestSeat();
    if (!seat) return;
    this.followId = null;
    this.cancelWalk();
    this.seatAnim = { kind: 'approach', seat, front: seatFront(seat), t: 0 };
    this.emitHud();
  }

  stand() {
    if (!this.seat || this.seatAnim) return;
    this.seatAnim = { kind: 'rise', seat: this.seat, front: seatFront(this.seat), t: 0 };
    this.emitHud();
  }

  stepSeat(dt) {
    const anim = this.seatAnim;
    const { seat, front } = anim;
    const turnTo = (angle, rate) => {
      this.bodyYaw += Math.atan2(Math.sin(angle - this.bodyYaw), Math.cos(angle - this.bodyYaw)) * Math.min(1, dt * rate);
    };
    if (anim.kind === 'approach') {
      const dx = front.x - this.pos.x;
      const dz = front.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) {
        anim.kind = 'turn';
        anim.t = 0;
      } else {
        const step = Math.min(SPEED * 0.8 * dt, d);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        turnTo(Math.atan2(-dx, -dz), 10);
      }
    } else if (anim.kind === 'turn') {
      anim.t += dt / 0.3;
      turnTo(seat.yaw, 14);
      this.yaw += Math.atan2(Math.sin(seat.yaw - this.yaw), Math.cos(seat.yaw - this.yaw)) * Math.min(1, dt * 7);
      if (anim.t >= 1) {
        anim.kind = 'lower';
        anim.t = 0;
        this.seat = seat;
      }
    } else if (anim.kind === 'lower') {
      anim.t = Math.min(1, anim.t + dt / 0.5);
      this.pos.x = front.x + (seat.x - front.x) * anim.t;
      this.pos.z = front.z + (seat.z - front.z) * anim.t;
      this.bodyYaw = seat.yaw;
      if (anim.t >= 1) {
        this.seatAnim = null;
        this.pitch = 0.04;
        this.emitHud();
      }
    } else {
      anim.t = Math.min(1, anim.t + dt / 0.45);
      this.pos.x = seat.x + (front.x - seat.x) * anim.t;
      this.pos.z = seat.z + (front.z - seat.z) * anim.t;
      if (anim.t >= 1) {
        this.seat = null;
        this.seatAnim = null;
        resolveCollisions(this.pos, this.layout.colliders);
        this.emitHud();
      }
    }
  }

  emote(kind) {
    emote(this.me, kind);
    if (kind === 'heart') this.burstAt(this.pos.x, 1.9, this.pos.z);
  }

  peerEmote(id, kind) {
    const p = this.peers.get(id);
    if (!p) return;
    emote(p.avatar, kind);
    if (kind === 'heart') this.burstAt(p.group.position.x, 1.9, p.group.position.z);
  }

  burstAt(x, y, z) {
    for (let i = 0; i < 5; i += 1) {
      const s = labelSprite('♥', { bg: 'rgba(0,0,0,0)', color: '#ff6f96', width: 0.42, size: 90 });
      s.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
      this.scene.add(s);
      this.bursts.push({ sprite: s, born: performance.now() + i * 110 });
    }
  }

  /**
   * Общее фото: камера встаёт напротив, за спиной оказывается ближайшая картина,
   * все, кто рядом, поворачиваются и машут. Возвращает кадр как картинку.
   */
  snapshot() {
    const near = [...this.peers.values()].filter((p) => p.seen && Math.hypot(p.group.position.x - this.pos.x, p.group.position.z - this.pos.z) < 3.2);
    const cx = (this.pos.x + near.reduce((sum, p) => sum + p.group.position.x, 0)) / (near.length + 1);
    const cz = (this.pos.z + near.reduce((sum, p) => sum + p.group.position.z, 0)) / (near.length + 1);
    let dir = { x: -Math.sin(this.bodyYaw), z: -Math.cos(this.bodyYaw) };
    let best = 4.6;
    for (const pic of this.layout.pictures) {
      const d = Math.hypot(pic.x - cx, pic.z - cz);
      if (d < best && d > 0.4) { best = d; dir = { x: (cx - pic.x) / d, z: (cz - pic.z) / d }; }
    }
    const dist = Math.max(1.5, clearCameraDistance({ x: cx, z: cz }, dir, 3.1 + near.length * 0.35, this.layout.colliders));
    const camX = cx + dir.x * dist;
    const camZ = cz + dir.z * dist;
    const faceCam = (x, z) => Math.atan2(-(camX - x), -(camZ - z));

    const saved = { pos: this.camera.position.clone(), rot: this.camera.rotation.clone(), fov: this.camera.fov, visible: this.me.root.visible, marker: this.marker.visible };
    this.bodyYaw = faceCam(this.pos.x, this.pos.z);
    this.me.root.rotation.y = this.bodyYaw;
    this.me.root.visible = true;
    this.marker.visible = false;
    if (!this.seat) emote(this.me, 'wave');
    this.me.emoteMix = this.seat ? 0 : 1;
    poseAvatar(this.me, 0, { moving: 0, sit: this.seat ? 1 : 0, look: 0 });
    for (const p of near) {
      if (!p.sit) p.group.rotation.y = faceCam(p.group.position.x, p.group.position.z);
      emote(p.avatar, 'wave');
      p.avatar.emoteMix = 1;
      poseAvatar(p.avatar, 0, { moving: 0, sit: p.sit ? 1 : 0 });
      p.tag.visible = false;
    }
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(camX, 1.42, camZ);
    this.camera.lookAt(cx, 1.16, cz);
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/jpeg', 0.92);

    this.camera.fov = saved.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(saved.pos);
    this.camera.rotation.copy(saved.rot);
    this.me.root.visible = saved.visible;
    this.marker.visible = saved.marker;
    for (const p of near) p.tag.visible = true;
    return url;
  }

  toggleCamera() {
    this.cameraMode = this.cameraMode === 'third' ? 'first' : 'third';
    return this.cameraMode;
  }

  emitHud() {
    const nearFilm = Boolean(this.screen && Math.hypot(this.screen.position.x - this.pos.x, this.screen.position.z - this.pos.z) < 8);
    const hero = this.layout.pictures.find((p) => p.index === 0);
    const hud = {
      nearHero: Math.hypot(hero.x - this.pos.x, hero.z - this.pos.z) < 7.5,
      nearEntrance: this.pos.z > -HALL.vestDepth,
      hall: hallAt(this.pos.z, this.layout.hallCount),
      walking: Boolean(this.walk),
      following: this.followId || null,
      canSit: !this.seat && !this.seatAnim && Boolean(this.nearestSeat()),
      sitting: Boolean(this.seat),
      seatBusy: Boolean(this.seatAnim),
      nearFilm,
      filmPlaying: Boolean(this.video && !this.video.paused),
    };
    if (Object.keys(hud).some((k) => hud[k] !== this.hud[k])) {
      this.hud = hud;
      this.cb.onHud?.(hud);
    }
  }

  addPeer(id, name, look) {
    if (this.peers.has(id)) return;
    const avatar = createAvatar(this.kit, look);
    const tag = labelSprite(name, { width: 0.82, size: 40 });
    tag.position.y = 2.02;
    avatar.root.add(tag);
    avatar.root.visible = false;
    this.scene.add(avatar.root);
    this.peers.set(id, {
      avatar, group: avatar.root, tag, bubble: null, bubbleUntil: 0, sit: false,
      target: { x: this.layout.spawn.x, z: this.layout.spawn.z, yaw: 0 }, seen: false,
    });
  }

  removePeer(id) {
    const p = this.peers.get(id);
    if (!p) return;
    this.scene.remove(p.group);
    disposeAvatar(p.avatar);
    p.tag.material.map.dispose();
    p.tag.material.dispose();
    if (p.bubble) { p.bubble.material.map.dispose(); p.bubble.material.dispose(); }
    this.peers.delete(id);
  }

  updatePeer(id, s) {
    const p = this.peers.get(id);
    if (!p) return;
    p.target = { x: s.x, z: s.z, yaw: s.yaw };
    p.sit = s.sit;
    if (!p.seen) {
      p.seen = true;
      p.group.visible = true;
      p.group.position.set(s.x, 0, s.z);
    }
  }

  peerSay(id, text) {
    const p = this.peers.get(id);
    if (!p) return;
    if (p.bubble) {
      p.group.remove(p.bubble);
      p.bubble.material.map.dispose();
      p.bubble.material.dispose();
    }
    p.bubble = labelSprite(text, { bg: 'rgba(255,248,240,.95)', color: '#2b1320', width: 1.5 });
    p.bubble.position.y = 2.42;
    p.group.add(p.bubble);
    p.bubbleUntil = performance.now() + 6000;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 84 : 66;
    this.camera.updateProjectionMatrix();
  }

  stepPlayer(dt) {
    let mx = this.move.x;
    let my = this.move.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if ((mx || my) && this.followId) this.followId = null;
    if ((mx || my) && this.walk) this.cancelWalk();
    if (this.yawGoal !== null && this.yawGoal !== undefined) {
      const diff = Math.atan2(Math.sin(this.yawGoal - this.yaw), Math.cos(this.yawGoal - this.yaw));
      this.yaw += diff * Math.min(1, dt * 5);
      if (Math.abs(diff) < 0.02) this.yawGoal = null;
    }
    if (this.seatAnim) { this.stepSeat(dt); return; }
    if (this.walk) { this.stepWalk(dt); return; }
    if ((mx || my) && this.seat) { this.stand(); return; }
    if (this.followId) { this.stepFollow(dt); return; }
    if (this.seat || (!mx && !my)) return;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const speed = SPEED * dt;
    this.pos.x += (mx * cos - my * sin) * speed;
    this.pos.z += (-mx * sin - my * cos) * speed;
    resolveCollisions(this.pos, this.layout.colliders);
  }

  stepPeers(dt, now) {
    const blend = 1 - Math.exp(-dt * 8);
    for (const p of this.peers.values()) {
      const g = p.group;
      const dx = p.target.x - g.position.x;
      const dz = p.target.z - g.position.z;
      const moving = Math.hypot(dx, dz) > 0.04 && !p.sit;
      // Вплотную к камере от первого лица фигуру не рисуем: иначе голова закроет экран
      const tooClose = this.cameraMode === 'first' && Math.hypot(g.position.x - this.pos.x, g.position.z - this.pos.z) < 0.6;
      g.visible = p.seen && !tooClose;
      g.position.x += dx * blend;
      g.position.z += dz * blend;
      g.rotation.y += Math.atan2(Math.sin(p.target.yaw - g.rotation.y), Math.cos(p.target.yaw - g.rotation.y)) * blend;
      poseAvatar(p.avatar, dt, { moving: moving ? 1 : 0, sit: p.sit ? 1 : 0 });
      const top = headHeight(p.avatar);
      p.tag.position.y = top + 0.32;
      if (p.bubble) p.bubble.position.y = top + 0.72;
      if (p.bubble && now > p.bubbleUntil) {
        g.remove(p.bubble);
        p.bubble.material.map.dispose();
        p.bubble.material.dispose();
        p.bubble = null;
      }
    }
  }

  stepMe(dt, from) {
    const dx = this.pos.x - from.x;
    const dz = this.pos.z - from.z;
    const moved = Math.hypot(dx, dz);
    const walking = moved / Math.max(dt, 0.001) > 0.25 && !(this.seatAnim?.kind === 'lower') && !(this.seatAnim?.kind === 'rise');
    if (walking && !this.seatAnim) {
      const want = Math.atan2(-dx, -dz);
      this.bodyYaw += Math.atan2(Math.sin(want - this.bodyYaw), Math.cos(want - this.bodyYaw)) * Math.min(1, dt * 12);
    }
    const lowered = this.seatAnim?.kind === 'rise' ? 1 - this.seatAnim.t : this.seat ? 1 : 0;
    const a = this.me;
    a.root.position.set(this.pos.x, 0, this.pos.z);
    a.root.rotation.y = this.bodyYaw;
    const look = Math.atan2(Math.sin(this.yaw - this.bodyYaw), Math.cos(this.yaw - this.bodyYaw));
    poseAvatar(a, dt, { moving: walking ? 1 : 0, sit: lowered, look: Math.abs(look) > 2.2 ? 0 : look });
    if (this.marker.visible) this.marker.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.12);
  }

  updateCamera(dt) {
    if (this.cameraMode === 'first') {
      this.me.root.visible = false;
      this.camera.position.set(this.pos.x, this.me.hips.position.y + 0.72, this.pos.z);
    } else {
      const head = { x: this.pos.x, z: this.pos.z };
      const back = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
      const cos = Math.cos(this.pitch);
      const wanted = 2.75 * cos;
      const room = clearCameraDistance(head, back, wanted, this.layout.colliders);
      // Приближаемся сразу, чтобы не увидеть стену, а отъезжаем плавно
      this.camDist = room < this.camDist ? room : this.camDist + (room - this.camDist) * Math.min(1, dt * 4);
      const y = headHeight(this.me) + 0.28 - Math.sin(this.pitch) * 2.75;
      this.camera.position.set(
        head.x + back.x * this.camDist,
        THREE.MathUtils.clamp(y, 0.3, HALL.height - 0.2),
        head.z + back.z * this.camDist,
      );
      this.me.root.visible = this.camDist > 0.75;
    }
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  updateFilmVolume() {
    if (!this.video || this.video.paused) return;
    const d = Math.hypot(this.screen.position.x - this.pos.x, this.screen.position.z - this.pos.z);
    this.video.volume = THREE.MathUtils.clamp(1.15 - d / 15, 0, 1) * (this.filmDuck ?? 1);
  }

  adaptQuality(dt) {
    this.frames = (this.frames || 0) + 1;
    this.frameTime = (this.frameTime || 0) + dt;
    if (this.frames < 90) return;
    const avg = this.frameTime / this.frames;
    this.frames = 0;
    this.frameTime = 0;
    if (avg > 0.04 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  frame = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const now = performance.now();
    const from = { x: this.pos.x, z: this.pos.z };
    this.stepPlayer(dt);
    this.stepMe(dt, from);
    this.stepPeers(dt, now);
    this.stepBursts(now);

    this.updateCamera(dt);

    if (now - (this.lastTick || 0) > 250) {
      this.lastTick = now;
      this.emitHud();
      this.updateFullResolution();
      this.updateFilmVolume();
    }
    this.sendMotion(now);
    this.adaptQuality(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /** Четыре раза в секунду и только при движении: иначе месячная квота Realtime уйдёт за несколько встреч. */
  sendMotion(now) {
    const last = this.lastSent;
    if (now - last.t < 250 || !this.onMotion) return;
    const sit = Boolean(this.seat);
    const moved = Math.hypot(this.pos.x - last.x, this.pos.z - last.z) > 0.05 || Math.abs(this.bodyYaw - last.yaw) > 0.08 || sit !== last.sit;
    if (!moved && now - last.t < 5000) return;
    Object.assign(last, { t: now, x: this.pos.x, z: this.pos.z, yaw: this.bodyYaw, sit });
    this.onMotion(this.pos.x, this.pos.z, this.bodyYaw, sit);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.frame();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.disposed = true;
    this.stop();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    [...this.peers.keys()].forEach((id) => this.removePeer(id));
    disposeAvatar(this.me);
    if (this.video) { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); }
    this.pictureMeshes.forEach((m) => {
      m.userData.thumb?.dispose();
      if (m.userData.badge) { m.userData.badge.material.map.dispose(); m.userData.badge.material.dispose(); }
    });
    this.fullLoaded.forEach((t) => t.dispose());
    this.disposables.forEach((o) => o.dispose?.());
    this.renderer.dispose();
  }
}
