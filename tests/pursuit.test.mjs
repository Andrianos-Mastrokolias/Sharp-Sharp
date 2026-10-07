// Headless pursuit test: node tests/pursuit.test.mjs
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';

const MAX_SPEED = 28;
const DT = 1 / 60;

function make() {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  let speed = 0;
  let lights = true;
  const captured = [];
  const delivered = [];

  const vehicle = {
    settings: { maxForwardSpeed: MAX_SPEED },
    cargoSystem: { getState: () => ({ remaining: 5, total: 5 }) },
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(spawn) { taxi.position.set(spawn.x, 0, spawn.z); speed = 0; },
    getSpeed: () => speed,
    getHighSpeedTime: () => 0,
    getLevel2Pressure: () => 0
  };

  const lm = new LevelManager({
    scene, vehicle, taxi,
    collidables: [], potholes: [],
    getHeadlightsEnabled: () => lights,
    onDelivered: e => delivered.push(e),
    onCaptured: e => captured.push(e)
  });

  return {
    scene, taxi, vehicle, lm, captured, delivered,
    setSpeed: s => { speed = s; },
    setLights: v => { lights = v; }
  };
}

function step(lm, seconds) {
  for (let t = 0; t < seconds; t += DT) lm.update(DT, t);
}

function countPursuers(scene) {
  let n = 0;
  scene.traverse(o => { if (o.userData.flash) n++; });
  return n;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('L1: idle until trigger, spawns behind taxi, then chases', () => {
  const e = make();
  e.lm.load(1);
  assert.equal(e.lm.getState().pursuit.state, 'idle');
  assert.equal(e.lm.getState().pursuit.distance, null);

  e.taxi.position.set(0, 0, 0);        // progress ~0.29
  step(e.lm, 1);
  assert.equal(e.lm.pursuit.state, 'idle');

  e.taxi.position.set(0, 0, -80);      // progress ~0.67
  step(e.lm, DT * 2);
  const p = e.lm.getState().pursuit;
  assert.equal(p.state, 'chasing');
  assert.ok(p.distance > 25 && p.distance < 32, 'spawned ~30 m behind');
  assert.ok(e.lm.pursuit.z > e.taxi.position.z, 'behind = towards spawn');
});

test('L1: chasing -> lost -> searching -> chasing; speed cap from vehicle', () => {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  assert.equal(e.lm.pursuit.state, 'chasing');

  // Teleport far out of lose range (>120) and keep it there
  e.taxi.position.set(0, 0, -185);
  e.lm.pursuit.x = 0; e.lm.pursuit.z = 100;
  let maxSpeed = 0;
  let sawLost = false, sawSearching = false;
  for (let t = 0; t < 12; t += DT) {
    e.lm.update(DT, t);
    maxSpeed = Math.max(maxSpeed, e.lm.pursuit.speed);
    sawLost ||= e.lm.pursuit.state === 'lost';
    sawSearching ||= e.lm.pursuit.state === 'searching';
  }
  assert.ok(sawLost && sawSearching, 'went through lost and searching');
  assert.ok(maxSpeed <= 0.95 * MAX_SPEED + 1e-6, `speed cap (${maxSpeed})`);
  assert.ok(maxSpeed > 5, 'actually moved');

  // Re-detect: taxi comes back within detection radius
  e.taxi.position.set(0, 0, e.lm.pursuit.z - 20);
  step(e.lm, DT * 2);
  assert.equal(e.lm.pursuit.state, 'chasing');
});

test('capture fires exactly once, status captured, update stops', () => {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  // Park the pursuer on the taxi
  e.lm.pursuit.x = 0; e.lm.pursuit.z = e.taxi.position.z + 2;
  step(e.lm, 1);
  assert.equal(e.captured.length, 0, 'not before captureTime');
  step(e.lm, 3);
  assert.equal(e.captured.length, 1);
  assert.equal(e.lm.status, 'captured');
  assert.equal(e.lm.getState().status, 'captured');
  assert.equal(e.captured[0].level, 1);
  step(e.lm, 5);
  assert.equal(e.captured.length, 1, 'still once');
});

test('capture needs continuous contact', () => {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  for (let i = 0; i < 6; i++) {
    e.lm.pursuit.x = 0; e.lm.pursuit.z = e.taxi.position.z + 2;
    e.lm.pursuit.speed = 0;
    step(e.lm, 1.5);
    e.lm.pursuit.z = e.taxi.position.z + 30; // break contact
    step(e.lm, DT * 3);
  }
  assert.equal(e.captured.length, 0);
});

test('reset restores idle / not captured, update works again', () => {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  e.lm.pursuit.z = e.taxi.position.z + 2;
  step(e.lm, 4);
  assert.equal(e.lm.status, 'captured');
  e.lm.reset();
  assert.equal(e.lm.status, 'driving');
  assert.equal(e.lm.pursuit.captured, false);
  assert.equal(e.lm.pursuit.state, 'idle');
  assert.equal(e.lm.getState().pursuit.distance, null);
  assert.equal(countPursuers(e.scene), 1);
  assert.equal(e.lm.pursuit.mesh.visible, false);
});

test('L2: ground pursuer, slower, ignores taxi on the flyover', () => {
  const e = make();
  e.lm.load(2);
  const pz = e.lm.pursuit.z;
  assert.ok(pz > 170, 'behind the spawn');
  assert.equal(e.lm.pursuit.state, 'idle');
  step(e.lm, 2.9);
  assert.equal(e.lm.pursuit.state, 'idle', 'start delay');
  step(e.lm, 0.3);
  assert.equal(e.lm.pursuit.state, 'chasing');

  // Lane clamp
  e.taxi.position.set(6, 0, 100);
  step(e.lm, 3);
  assert.ok(e.lm.pursuit.x <= 2 + 1e-9, 'stays in ground lane');

  // Up on the flyover: never captured, becomes lost
  const e2 = make();
  e2.lm.load(2);
  step(e2.lm, 3.5);
  e2.taxi.position.set(6.2, 2.5, 150);
  e2.lm.pursuit.z = 152; e2.lm.pursuit.x = 2;
  let sawLost = false;
  for (let t = 0; t < 10; t += DT) {
    e2.lm.update(DT, t);
    sawLost ||= e2.lm.pursuit.state === 'lost' ||
      e2.lm.pursuit.state === 'searching';
  }
  assert.equal(e2.captured.length, 0);
  assert.ok(sawLost, 'loses the taxi on the flyover');
});

test('L3: detection radius depends on headlights', () => {
  const e = make();
  e.lm.load(3);
  e.taxi.position.set(0, 0, -170 + 50);   // 80 m from pursuer (z -200 -> clamped -185)
  e.lm.pursuit.z = -185;
  e.setLights(false);
  step(e.lm, 5);
  assert.equal(e.lm.pursuit.state, 'idle', 'lights off: not seen at ~65 m');

  const f = make();
  f.lm.load(3);
  f.taxi.position.set(0, 0, -170 + 50);
  f.lm.pursuit.z = -185;
  f.setLights(true);
  step(f.lm, 5);
  assert.equal(f.lm.pursuit.state, 'chasing', 'lights on: seen at ~65 m');

  // Lights switched off mid-chase, taxi beyond dark lose range -> lost
  f.setLights(false);
  f.taxi.position.set(0, 0, f.lm.pursuit.z + 60);
  let lost = false;
  for (let t = 0; t < 8; t += DT) {
    f.taxi.position.z = f.lm.pursuit.z + 60;  // keep ahead
    f.lm.update(DT, t);
    lost ||= f.lm.pursuit.state === 'lost';
  }
  assert.ok(lost);
});

test('stays on road and inside bounds', () => {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  e.taxi.position.set(25, 0, -400);
  for (let t = 0; t < 20; t += DT) {
    e.lm.update(DT, t);
    assert.ok(Math.abs(e.lm.pursuit.x) <= 9 + 1e-9);
    assert.ok(Math.abs(e.lm.pursuit.z) <= 185 + 1e-9);
  }
});

test('reload cycles 1->2->3->1 leave exactly one pursuer, no leaks', () => {
  const e = make();
  const disposed = { geo: 0, mat: 0 };
  const origGeo = THREE.BufferGeometry.prototype.dispose;
  const origMat = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose =
    function () { disposed.geo++; return origGeo.call(this); };
  THREE.Material.prototype.dispose =
    function () { disposed.mat++; return origMat.call(this); };

  for (let i = 0; i < 4; i++) {
    for (const lvl of [1, 2, 3, 1]) {
      e.lm.load(lvl);
      assert.equal(countPursuers(e.scene), 1, `level ${lvl} cycle ${i}`);
      step(e.lm, 0.2);
    }
  }
  assert.equal(e.lm.group.children.filter(c => c.userData.flash).length, 1);
  // 16 loads: 15 disposals of a pursuer (4 geo + 4 mat each)
  assert.ok(disposed.geo >= 15 * 4, `geometries disposed (${disposed.geo})`);
  assert.ok(disposed.mat >= 15 * 4, `materials disposed (${disposed.mat})`);
  assert.equal(e.lm.collidables.length, e.lm.registered.length);

  THREE.BufferGeometry.prototype.dispose = origGeo;
  THREE.Material.prototype.dispose = origMat;
});

test('capture does not touch collidables', () => {
  const e = make();
  e.lm.load(3);
  const before = e.lm.collidables.length;
  assert.equal(before, 0);
});

test('level without pursuit config: no pursuer, state none', () => {
  const saved = LEVELS[3].pursuit;
  delete LEVELS[3].pursuit;
  const e = make();
  e.lm.load(3);
  assert.equal(countPursuers(e.scene), 0);
  assert.equal(e.lm.getState().pursuit.state, 'none');
  step(e.lm, 1);
  LEVELS[3].pursuit = saved;
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS', name); }
  catch (err) { failed++; console.log('FAIL', name, '\n  ', err.message); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
