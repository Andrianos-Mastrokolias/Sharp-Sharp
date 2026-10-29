// Cargo score test: node tests/score.test.mjs
// Levels 2 and 3 have a score: it starts at 500 (5 roof items x 100), each cargo
// item lost costs 100 and each pedestrian hit 50 (Level 3), floored at 0. Level 1's
// rank-race score is unchanged (its snapshot lives in tests/countdown.test.mjs).
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import { CargoSystem } from '../src/vehicle/CargoSystem.js';
import { scorePopupText } from '../src/ui/Hud.js';
import { scoreStats } from '../src/ui/screens.js';

// main.js wires it as: onCargoLost -> levelManager.registerCargoLoss()
function make({ realCargo = false } = {}) {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  const chassis = new THREE.Object3D();
  taxi.add(chassis);
  scene.add(taxi);
  const scores = [];
  const lost = [];
  let lm = null;

  let cargoSystem = {
    getState: () => ({ remaining: 5, total: 5 })
  };

  if (realCargo) {
    const cargoItems = [0, 1, 2, 3, 4].map(i => {
      const mesh = new THREE.Object3D();
      mesh.position.set(0, 2, i * 0.5);
      chassis.add(mesh);
      return { name: `item${i}`, mesh, vulnerability: 1 };
    });

    cargoSystem = new CargoSystem({
      scene, chassis, taxi, cargoItems, gravity: -22,
      onCargoLost: event => {
        lost.push(event);
        lm.registerCargoLoss();
      }
    });
  }

  const vehicle = {
    settings: { maxForwardSpeed: 28 },
    cargoSystem,
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    // VehicleController.reset() ends with cargoSystem.reset()
    reset(spawn) {
      taxi.position.set(spawn.x, 0, spawn.z);
      cargoSystem.reset?.();
    },
    getSpeed: () => 0,
    getHighSpeedTime: () => 0,
    getLevel2Pressure: () => 0
  };

  lm = new LevelManager({
    scene, vehicle, taxi,
    collidables: [], potholes: [],
    getHeadlightsEnabled: () => true,
    onScore: e => scores.push(e)
  });

  return { lm, scores, lost, cargoSystem };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

for (const level of [2, 3]) {

  test(`L${level}: config has cargoScore { 500, -100, -50 }`, () => {
    assert.deepEqual(LEVELS[level].cargoScore, { start: 500, cargoLost: -100, pedestrian: -50 });
  });

  test(`L${level}: the score starts at 500 with beaten and rivalsTotal null`, () => {
    const { lm } = make();
    lm.load(level);

    assert.equal(lm.scoring, true);
    assert.deepEqual(lm.getState().score, {
      points: 500, beaten: null, rivalsTotal: null, firstOut: null, pedestriansHit: 0
    });
  });

  test(`L${level}: a cargo loss goes 500 to 400 (one onScore, reason cargoLost)`, () => {
    const { lm, scores } = make();
    lm.load(level);
    lm.registerCargoLoss();

    assert.equal(lm.getState().score.points, 400);
    assert.deepEqual(scores, [{ delta: -100, reason: 'cargoLost', points: 400 }]);
  });

  test(`L${level}: five losses and a pedestrian hit floor at 0`, () => {
    const { lm, scores } = make();
    lm.load(level);

    for (let i = 0; i < 5; i++) lm.registerCargoLoss();
    assert.equal(lm.getState().score.points, 0);

    lm.registerPedestrianHit();
    assert.equal(lm.getState().score.points, 0, 'never negative');
    assert.equal(scores.at(-1).points, 0);
    assert.ok(scores.every(s => s.points >= 0));
  });

  test(`L${level}: nothing scores once the level is no longer 'driving'`, () => {
    for (const status of ['delivered', 'captured', 'none']) {
      const { lm, scores } = make();
      lm.load(level);
      lm.status = status;

      lm.registerCargoLoss();
      lm.registerPedestrianHit();

      assert.equal(scores.length, 0, status);
      assert.equal(lm.getState().score.points, 500, status);
    }
  });

  test(`L${level}: retry (reset) and a level switch restore 500`, () => {
    const { lm } = make();
    lm.load(level);
    lm.registerCargoLoss();
    lm.registerCargoLoss();
    assert.equal(lm.getState().score.points, 300);

    lm.reset();
    assert.equal(lm.getState().score.points, 500);
    assert.equal(lm.getState().score.pedestriansHit, 0);

    lm.registerCargoLoss();
    lm.load(level);
    assert.equal(lm.getState().score.points, 500);

    // from the other cargo level, and from Level 1
    for (const other of [level === 2 ? 3 : 2, 1]) {
      lm.load(other);
      lm.registerCargoLoss();
      lm.load(level);
      assert.equal(lm.getState().score.points, 500, `after level ${other}`);
    }
  });
}

test('L3: a pedestrian hit is -50 with exactly one onScore (reason pedestrian)', () => {
  const { lm, scores } = make();
  const hits = [];
  lm.onPedestrianHit = e => hits.push(e);
  lm.load(3);
  lm.pedestrianHit(1, 2);

  assert.equal(scores.length, 1, 'one onScore, so main.js shows one pop-up');
  assert.deepEqual(scores[0], { delta: -50, reason: 'pedestrian', points: 450 });
  assert.equal(hits.length, 1);
  assert.equal(lm.getState().score.pedestriansHit, 1);
  // main.js onPedestrianHit adds its own pop-up only when score === null
  assert.notEqual(lm.getState().score, null);
});

test('L1: no cargo score; registerCargoLoss does nothing and the floor is unchanged', () => {
  const { lm, scores } = make();
  lm.load(1);

  assert.equal(LEVELS[1].cargoScore, undefined);
  lm.registerCargoLoss();
  assert.equal(scores.length, 0);
  assert.equal(lm.getState().score.points, 0);
  assert.equal(lm.getState().score.beaten, 0);
  assert.equal(lm.getState().score.rivalsTotal, 8);

  // Level 1 still goes below 0 on pedestrians (no floor there)
  lm.registerPedestrianHit();
  assert.equal(lm.getState().score.points, -50);
  assert.deepEqual(scores, [{ delta: -50, reason: 'pedestrian', points: -50 }]);
});

test('REAL CargoSystem wired like main.js: load and retry fire onCargoLost zero times', () => {
  const e = make({ realCargo: true });

  for (const level of [2, 3, 1, 2, 3]) {
    e.lm.load(level);
    e.lm.load(level);   // retry
    e.lm.reset();
  }

  assert.equal(e.lost.length, 0, 'no onCargoLost from load/retry');
  assert.equal(e.scores.length, 0);
  e.lm.load(2);
  assert.equal(e.lm.getState().score.points, 500);
});

test('REAL CargoSystem: a detached item costs 100, five 500 (floor 0); retry restores', () => {
  const e = make({ realCargo: true });
  e.lm.load(3);

  e.cargoSystem.detach(e.cargoSystem.items[0], 10);
  assert.equal(e.lost.length, 1);
  assert.equal(e.lm.getState().score.points, 400);

  for (const item of e.cargoSystem.items.slice(1)) e.cargoSystem.detach(item, 10);
  assert.equal(e.lost.length, 5);
  assert.equal(e.lm.getState().score.points, 0);

  e.lm.load(3);   // retry
  assert.equal(e.cargoSystem.getRemaining(), 5);
  assert.equal(e.lost.length, 5, 'the retry itself fires nothing');
  assert.equal(e.lm.getState().score.points, 500);
});

test('HUD and screens: the cargo-lost pop-up text, no Rivals beaten without a rank race', () => {
  assert.equal(scorePopupText({ delta: -100, reason: 'cargoLost' }), '-100 Cargo lost');
  assert.equal(scorePopupText({ delta: -50, reason: 'pedestrian' }), '-50 Pedestrian');

  const cargo = scoreStats({ points: 300, beaten: null, rivalsTotal: null });
  assert.ok(cargo.includes('Points') && cargo.includes('300 pts'));
  assert.ok(!cargo.includes('Rivals beaten'));

  const l1 = scoreStats({ points: 100, beaten: 3, rivalsTotal: 8 });
  assert.ok(l1.includes('Rivals beaten') && l1.includes('3 / 8'));
  assert.equal(scoreStats(null), '');
});

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`);
  }
}

console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
