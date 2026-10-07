// Headless pursuit test: node tests/pursuit.test.mjs
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import {
  createPursuerMesh, STANDOFF_DISTANCE, MIN_SEPARATION, CRUISE_GAP,
  SLOW_SPEED_THRESHOLD, STUMBLE_SURGE_TIME
} from '../src/world/PursuitSystem.js';

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
  e.lm.pursuit.x = 0; e.lm.pursuit.z = 180;
  let maxSpeed = 0;
  let sawLost = false, sawSearching = false;
  for (let t = 0; t < 12; t += DT) {
    e.lm.update(DT, t);
    maxSpeed = Math.max(maxSpeed, e.lm.pursuit.speed);
    sawLost ||= e.lm.pursuit.state === 'lost';
    sawSearching ||= e.lm.pursuit.state === 'searching';
  }
  assert.ok(sawLost && sawSearching, 'went through lost and searching');
  // L1 speedFraction 1.05, times the far-away catch-up boost
  assert.ok(maxSpeed <= 1.05 * 1.15 * MAX_SPEED + 1e-6, `speed cap (${maxSpeed})`);
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
    step(e.lm, 1.0);   // < captureTime (1.5 s since the 2.5 s -> 1.5 s change)
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

// Drives the taxi along -Z (or any z velocity) while stepping the level.
function run(e, seconds, taxiVz, onFrame) {
  e.setSpeed(Math.abs(taxiVz));
  for (let t = 0; t < seconds; t += DT) {
    e.taxi.position.z += taxiVz * DT;
    e.lm.update(DT, t);
    onFrame?.(t);
  }
}

const gap = e => Math.hypot(
  e.taxi.position.x - e.lm.pursuit.x,
  e.taxi.position.z - e.lm.pursuit.z);

test('standoff: settles behind a stopped taxi, in capture range, never closer than min', () => {
  assert.ok(STANDOFF_DISTANCE < LEVELS[1].pursuit.captureDistance);
  assert.ok(MIN_SEPARATION <= STANDOFF_DISTANCE);
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  let minGap = Infinity;
  run(e, 8, 0, () => { minGap = Math.min(minGap, gap(e)); });
  assert.ok(minGap >= MIN_SEPARATION - 1e-9, `min gap ${minGap}`);
  assert.ok(Math.abs(gap(e) - STANDOFF_DISTANCE) < 0.3, `settled at ${gap(e)}`);
  assert.ok(gap(e) <= LEVELS[1].pursuit.captureDistance);
});

test('separation never drops below minimum when the taxi brakes hard; capture once; stops', () => {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  let minGap = Infinity;
  const watch = () => { minGap = Math.min(minGap, gap(e)); };
  run(e, 2.5, -10, watch);         // pursuer boosts in on a slower taxi
  run(e, 14, 0, watch);            // taxi stops dead (well short of the L1 zone)
  assert.ok(minGap >= MIN_SEPARATION - 1e-9, `min gap ${minGap}`);
  assert.equal(e.captured.length, 1, 'capture fired exactly once');
  assert.equal(e.lm.pursuit.speed, 0);
  const { x, z } = e.lm.pursuit;
  run(e, 3, 0);
  assert.equal(e.captured.length, 1, 'still once');
  assert.equal(e.lm.pursuit.x, x);
  assert.equal(e.lm.pursuit.z, z);
});

test('separation holds when the taxi reverses into the pursuer', () => {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  // captureTime raised so this test keeps probing separation, not capture
  e.lm.pursuit.config.captureTime = 100;
  run(e, 3, 0);
  assert.ok(gap(e) < 7, 'pursuer is right behind the taxi');
  let minGap = Infinity;
  run(e, 0.8, 6, () => { minGap = Math.min(minGap, gap(e)); });
  assert.equal(e.captured.length, 0, 'still chasing, so separation is enforced');
  assert.ok(minGap >= MIN_SEPARATION - 1e-9, `min gap ${minGap}`);
});

test('catch-up: boosted when far behind, never above speedFraction up close', () => {
  const far = make();
  far.lm.load(1);
  far.taxi.position.set(0, 0, -80);
  step(far.lm, DT * 2);
  far.lm.pursuit.z = far.taxi.position.z + 60;
  let farMax = 0;
  run(far, 6, 0, () => { farMax = Math.max(farMax, far.lm.pursuit.speed); });
  assert.ok(farMax > 1.05 * MAX_SPEED + 0.5, `boosted (${farMax})`);
  assert.ok(farMax <= 1.05 * 1.15 * MAX_SPEED + 1e-6, `cap (${farMax})`);

  const near = make();
  near.lm.load(1);
  near.taxi.position.set(0, 0, -80);
  step(near.lm, DT * 2);
  near.lm.pursuit.z = near.taxi.position.z + 24;
  let nearMax = 0;
  run(near, 5, 0, () => { nearMax = Math.max(nearMax, near.lm.pursuit.speed); });
  assert.ok(nearMax <= 1.05 * MAX_SPEED + 1e-6, `no boost up close (${nearMax})`);
});


// ---- Subway Surfers style chase ------------------------------------

// Starts a level-1 chase with the taxi already at `speed` and the
// pursuer sitting `gapNow` metres behind it.
function chase(speed, gapNow = CRUISE_GAP) {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  e.taxi.position.set(0, 0, 170);       // room to drive ~340 m down the road
  e.lm.pursuit.z = 170 + gapNow;
  e.lm.pursuit.x = 0;
  e.lm.pursuit.heading = 0;
  e.lm.pursuit.speed = speed;
  e.setSpeed(speed);
  return e;
}

// Probing the gap, not capture: stop capture from ending the run
const noCapture = e => { e.lm.pursuit.config.captureTime = 1e9; return e; };

for (const v of [5, 15, 28]) {
  test(`chase: gap holds at ${v < SLOW_SPEED_THRESHOLD ? 'the standoff' : 'CRUISE_GAP'} with the taxi at ${v} m/s`, () => {
    assert.equal(CRUISE_GAP, 8.5);
    const e = noCapture(chase(v, v < SLOW_SPEED_THRESHOLD ? STANDOFF_DISTANCE : CRUISE_GAP));
    let lo = Infinity, hi = 0;
    run(e, 10, -v, () => { const g = gap(e); lo = Math.min(lo, g); hi = Math.max(hi, g); });
    // 5 m/s is below SLOW_SPEED_THRESHOLD, so it is held at the
    // standoff (spec b); 15 and 28 m/s hold CRUISE_GAP.
    const want = v < SLOW_SPEED_THRESHOLD ? STANDOFF_DISTANCE : CRUISE_GAP;
    assert.ok(lo > want - 0.1 && hi < want + 0.1, `gap ${lo}..${hi}`);
  });
}

test('chase: a taxi at 5 m/s is caught (slowed: held inside capture range)', () => {
  const e = chase(5);
  run(e, 4, -5);
  assert.equal(e.captured.length, 1);
});

test('chase: constant speed taxi is never captured (long run, all speeds)', () => {
  for (const v of [13, 20, 28]) {
    const e = chase(v);
    run(e, 11, -v);
    assert.equal(e.captured.length, 0, `v ${v}`);
    assert.equal(e.lm.pursuit.captureTimer, 0);
  }
});

test('chase: closes to the standoff when the taxi decelerates below the threshold', () => {
  const e = noCapture(chase(20));
  let v = 20;
  for (let t = 0; t < 6; t += DT) {
    v = Math.max(v - 4 * DT, 3);      // gentle: no stumble
    e.setSpeed(v);
    e.taxi.position.z -= v * DT;
    e.lm.update(DT, t);
  }
  assert.ok(v < SLOW_SPEED_THRESHOLD);
  assert.ok(Math.abs(gap(e) - STANDOFF_DISTANCE) < 0.3, `gap ${gap(e)}`);
});

test('chase: gap opens back to CRUISE_GAP and capture timer resets when the taxi speeds up', () => {
  const e = chase(5, STANDOFF_DISTANCE);
  run(e, 0.8, -5);
  assert.ok(e.lm.pursuit.captureTimer > 0, 'in capture range while slow');
  run(e, 6, -25);
  assert.ok(Math.abs(gap(e) - CRUISE_GAP) < 0.3, `gap ${gap(e)}`);
  assert.equal(e.lm.pursuit.captureTimer, 0);
  assert.equal(e.captured.length, 0);
});

test('chase: a stumble (speed drop > 8 m/s in 0.4 s) makes the pursuer surge', () => {
  const e = noCapture(chase(25));
  run(e, 3, -25);
  assert.ok(gap(e) > CRUISE_GAP - 0.3);
  // Collision: 25 -> 15 m/s in 0.1 s. Still above the slow threshold.
  e.setSpeed(15);
  const surged = [];
  run(e, 1.0, -15, () => surged.push(gap(e)));
  assert.ok(15 >= SLOW_SPEED_THRESHOLD);
  assert.ok(Math.min(...surged) < CRUISE_GAP - 1.5, `surged to ${Math.min(...surged)}`);
  assert.ok(Math.abs(Math.min(...surged) - STANDOFF_DISTANCE) < 0.4);
  // Surge ends after STUMBLE_SURGE_TIME: gap reopens
  run(e, STUMBLE_SURGE_TIME + 4, -15);
  assert.ok(Math.abs(gap(e) - CRUISE_GAP) < 0.3, `gap ${gap(e)}`);
});

test('chase: a slow gradual slowdown above the threshold is not a stumble', () => {
  const e = chase(28);
  let v = 28;
  for (let t = 0; t < 5; t += DT) {
    v = Math.max(v - 2 * DT, 14);      // 2 m/s^2: < 8 m/s per 0.4 s
    e.setSpeed(v);
    e.taxi.position.z -= v * DT;
    e.lm.update(DT, t);
  }
  assert.ok(Math.abs(gap(e) - CRUISE_GAP) < 0.3, `gap ${gap(e)}`);
});

test('chase: an unrecovered stumble ends in capture (surge time > captureTime)', () => {
  const e = chase(25);
  run(e, 2, -25);
  e.setSpeed(15);
  run(e, 3, -15);
  assert.equal(e.captured.length, 1);
});

test('chase: capture fires once, only after captureTime, in capture range', () => {
  assert.equal(LEVELS[1].pursuit.captureTime, 1.5);
  assert.equal(LEVELS[2].pursuit.captureTime, 1.5);
  assert.equal(LEVELS[3].pursuit.captureTime, 1.5);
  const e = chase(3, STANDOFF_DISTANCE);
  e.taxi.position.z = 0; e.lm.pursuit.z = STANDOFF_DISTANCE;
  run(e, 1.4, -3);
  assert.equal(e.captured.length, 0, 'not before captureTime');
  run(e, 0.3, -3);
  assert.equal(e.captured.length, 1);
  run(e, 3, -3);
  assert.equal(e.captured.length, 1, 'still once');
});

test('chase: separation never drops below MIN_SEPARATION through brake, stumble and surge', () => {
  const e = chase(28);
  let minGap = Infinity;
  const watch = () => { minGap = Math.min(minGap, gap(e)); };
  run(e, 3, -28, watch);
  let v = 28;
  for (let t = 0; t < 3; t += DT) {      // hard brake at 33 m/s^2
    v = Math.max(v - 33 * DT, 0);
    e.setSpeed(v);
    e.taxi.position.z -= v * DT;
    e.lm.update(DT, t);
    watch();
  }
  run(e, 2, -28, watch);
  assert.ok(minGap >= MIN_SEPARATION - 1e-9, `min gap ${minGap}`);
});

test('mesh: faces -Z, bakkie-sized, lights, flashing swaps emissive only', () => {
  const mesh = createPursuerMesh();
  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  assert.ok(size.x > 1.9 && size.x < 2.2, `width ${size.x}`);
  assert.ok(Math.abs(size.z - 5.3) < 0.1, `length ${size.z}`);
  assert.ok(Math.abs(size.y - 1.85) < 0.05, `height ${size.y}`);
  const zs = n => { const v = []; mesh.traverse(o => o.name === n && v.push(o.position.z)); return v; };
  assert.equal(zs('headlight').length, 2);
  assert.equal(zs('taillight').length, 2);
  assert.ok(zs('headlight').every(z => z < 0), 'headlights at -Z (front)');
  assert.ok(zs('taillight').every(z => z > 0), 'tail-lights at +Z (rear)');

  const mats = new Set();
  mesh.traverse(o => o.material && mats.add(o.material));
  const lenses = [...mats].filter(m => m.emissive && m.emissiveIntensity !== undefined &&
    m.emissive.getHex() !== 0 && m.color.getHex() !== 0xf1f3f5);
  assert.equal(lenses.length, 2);
  mesh.userData.flash(true);
  const a = lenses.map(m => m.emissiveIntensity);
  mesh.userData.flash(false);
  const b = lenses.map(m => m.emissiveIntensity);
  assert.notDeepEqual(a, b);
  assert.equal(new Set([...mats]).size, mats.size);
});

test('mesh: lettering texture is created and disposed with the pursuer', () => {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx })
  };
  let texDisposed = 0;
  const orig = THREE.Texture.prototype.dispose;
  THREE.Texture.prototype.dispose = function () { texDisposed++; return orig.call(this); };
  try {
    const e = make();
    e.lm.load(1);
    let planes = 0;
    e.lm.pursuit.mesh.traverse(o => { if (o.material?.map) planes++; });
    assert.equal(planes, 3, 'POLICE on both doors and the canopy rear');
    e.lm.load(2);
    assert.ok(texDisposed >= 1, 'texture disposed on reload');
  } finally {
    THREE.Texture.prototype.dispose = orig;
    delete globalThis.document;
  }
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
