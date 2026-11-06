/**
 * Проверки «Нашего музея», которым не нужен браузер: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, hallAt, resolveCollisions, HALL } from '../src/app-museum/engine/layout.js';
import { MUSEUM_THEMES, MUSEUM_TIERS, museumExtendPrice, museumPublishPrice, museumTier } from '../src/lib/museumPlans.js';

const photos = (n, aspect = 1.5) => Array.from({ length: n }, (_, i) => ({ aspect: i % 3 ? aspect : 0.75 }));

test('каждое фото висит ровно один раз при любом количестве', () => {
  for (let n = 6; n <= 45; n += 1) {
    for (const video of [false, true]) {
      const indexes = buildLayout(photos(n), video).pictures.map((p) => p.index).sort((a, b) => a - b);
      assert.deepEqual(indexes, Array.from({ length: n }, (_, i) => i), `n=${n} video=${video}`);
    }
  }
});

test('рамки на одной стене не наезжают друг на друга', () => {
  for (let n = 6; n <= 45; n += 1) {
    const { pictures } = buildLayout(photos(n), true);
    for (const a of pictures) {
      for (const b of pictures) {
        if (a === b || a.rotY !== b.rotY) continue;
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - (a.w + b.w) / 2;
        if (Math.abs(a.x - b.x) < 0.01 || Math.abs(a.z - b.z) < 0.01) assert.ok(gap > 0.2, `n=${n}`);
      }
    }
  }
});

test('главное фото висит на дальней стене, а экран только при фильме', () => {
  const withFilm = buildLayout(photos(20), true);
  const hero = withFilm.pictures.find((p) => p.index === 0);
  assert.ok(hero.z < withFilm.totalEnd + 1);
  assert.ok(withFilm.screen);
  assert.equal(buildLayout(photos(20), false).screen, null);
});

test('человек не выходит за стены при долгой случайной прогулке', () => {
  const layout = buildLayout(photos(45), true);
  const pos = { x: 0, z: -1 };
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let angle = 0;
  for (let i = 0; i < 100000; i += 1) {
    if (rnd() < 0.02) angle = rnd() * Math.PI * 2;
    pos.x += Math.sin(angle) * 0.05;
    pos.z += Math.cos(angle) * 0.05;
    resolveCollisions(pos, layout.colliders);
    assert.ok(Math.abs(pos.x) <= HALL.halfW + 0.01 && pos.z <= 0.01 && pos.z >= layout.totalEnd - 0.01);
  }
});

test('номер зала считается от входа', () => {
  assert.equal(hallAt(-1, 3), 0);
  assert.equal(hallAt(-8, 3), 1);
  assert.equal(hallAt(-23, 3), 2);
  assert.equal(hallAt(-500, 3), 3);
});

test('цена складывается из тарифа, срока и дополнений', () => {
  const base = museumTier('full').price;
  assert.equal(museumPublishPrice({ termDays: 30, tier: 'full', theme: 'classic' }), base);
  assert.ok(museumPublishPrice({ termDays: 365, tier: 'full', theme: 'classic' }) > base);
  assert.ok(museumPublishPrice({ termDays: 30, tier: 'full', theme: 'night' }) > base);
  assert.ok(museumPublishPrice({ termDays: 30, tier: 'full', theme: 'classic', voice: true }) > base);
  assert.ok(museumPublishPrice({ termDays: 30, tier: 'lite', theme: 'classic' }) < base);
});

test('неизвестные значения не дают заплатить меньше', () => {
  assert.equal(museumPublishPrice({ termDays: 1, tier: 'free', theme: 'x' }), museumTier('full').price);
  assert.equal(museumExtendPrice(7), null);
});

test('в тарифах и темах нет пропущенных полей', () => {
  for (const t of MUSEUM_TIERS) assert.ok(t.price > 0 && t.maxPhotos >= 6);
  assert.ok(MUSEUM_THEMES.some((t) => !t.premium));
});
