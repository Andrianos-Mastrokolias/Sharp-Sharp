// Headless pursuit test: node tests/pursuit.test.mjs
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import {
  createPursuerMesh, STANDOFF_DISTANCE, MIN_SEPARATION, CRUISE_GAP,
  CONTACT_DISTANCE, CATCH_LUNGE_MAX_TIME,
  SLOW_SPEED_THRESHOLD, STUMBLE_SURGE_TIME,
  PRESSURE_SPEED_FRACTION, PRESSURE_RISE_RATE, PRESSURE_FALL_RATE,
  GAP_BREATH_AMPLITUDE, GAP_BREATH_RATE, PRE_CONTACT_BRAKE_DISTANCE,
  POUNCE_GAP_EXCESS, RAMP_SPEED_FACTOR, RAIL_CLAMP_MARGIN, ELEVATED_Y
} from '../src/world/PursuitSystem.js';

const MAX_SPEED = 28;
const TOUCHING_DISTANCE = 5.35;   // model centres this far apart = bumpers touch
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
  // L1 speedFraction 1.15 (was 1.05; raised with L1_PURSUIT_SPEED), times the far-away catch-up boost
  assert.ok(maxSpeed <= 1.15 * 1.15 * MAX_SPEED + 1e-6, `speed cap (${maxSpeed})`);
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

// (Replaced: "L2: the flyover shakes the pursuer off". Level 2 used to
// set ignoreElevated + a lane clamp x <= 2, so a taxi on the flyover
// counted as unseen and the pursuer went lost -> searching and was
// far behind when the taxi came down. The pursuer now follows onto
// the flyover - see the "flyover:" tests below. ignoreElevated stays
// as an option for other levels and is covered by the one test below.)
test('L2: start delay and ground-lane clamp', () => {
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
  assert.equal(LEVELS[2].pursuit.ignoreElevated, undefined,
    'Level 2 no longer ignores the flyover');
});

test('ignoreElevated option still hides a taxi on the flyover (other levels)', () => {
  const e = make();
  e.lm.load(2);
  e.lm.pursuit.config.ignoreElevated = true;
  step(e.lm, 3.5);
  e.taxi.position.set(6.2, 2.5, 150);
  e.lm.pursuit.z = 152; e.lm.pursuit.x = 2;
  let sawLost = false;
  for (let t = 0; t < 10; t += DT) {
    e.lm.update(DT, t);
    sawLost ||= ['lost', 'searching'].includes(e.lm.pursuit.state);
  }
  assert.equal(e.captured.length, 0);
  assert.ok(sawLost);
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
  // It pounces in at full speed, so it may stop on the separation
  // floor (MIN_SEPARATION) rather than exactly at the standoff
  assert.ok(gap(e) >= MIN_SEPARATION - 1e-9 && gap(e) < STANDOFF_DISTANCE + 0.3,
    `settled at ${gap(e)}`);
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
  assert.ok(farMax > 1.15 * MAX_SPEED + 0.5, `boosted (${farMax})`);
  assert.ok(farMax <= 1.15 * 1.15 * MAX_SPEED + 1e-6, `cap (${farMax})`);

  const near = make();
  near.lm.load(1);
  near.taxi.position.set(0, 0, -80);
  step(near.lm, DT * 2);
  near.lm.pursuit.z = near.taxi.position.z + 24;
  let nearMax = 0;
  run(near, 5, 0, () => { nearMax = Math.max(nearMax, near.lm.pursuit.speed); });
  assert.ok(nearMax <= 1.15 * MAX_SPEED + 1e-6, `no boost up close (${nearMax})`);
});


// ---- Subway Surfers style chase ------------------------------------

// Starts a level-1 chase with the taxi already at `speed` and the
// pursuer sitting `gapNow` metres behind it.
function chase(speed, gapNow = CRUISE_GAP, startZ = 170) {
  const e = make();
  e.lm.load(1);
  e.taxi.position.set(0, 0, -80);
  step(e.lm, DT * 2);
  e.taxi.position.set(0, 0, startZ);    // room to drive ~340 m down the road
  e.lm.pursuit.z = startZ + gapNow;
  e.lm.pursuit.x = 0;
  e.lm.pursuit.heading = 0;
  e.lm.pursuit.speed = speed;
  e.setSpeed(speed);
  // Already cruising: not hungry yet (the set-up frames above ran
  // with the taxi at a standstill, which pins the pressure at 1)
  e.lm.pursuit.gapPressure = speed < SLOW_SPEED_THRESHOLD ? 1 : 0;
  return e;
}

// Probing the gap, not capture: stop capture from ending the run
const noCapture = e => { e.lm.pursuit.config.captureTime = 1e9; return e; };

test('chase: slowed taxi (5 m/s) is held at the standoff', () => {
  const e = noCapture(chase(5, STANDOFF_DISTANCE));
  let lo = Infinity, hi = 0;
  run(e, 10, -5, () => { const g = gap(e); lo = Math.min(lo, g); hi = Math.max(hi, g); });
  assert.ok(lo > STANDOFF_DISTANCE - 0.1 && hi < STANDOFF_DISTANCE + 0.1, `gap ${lo}..${hi}`);
});

test('chase: at top speed the gap breathes around CRUISE_GAP and never enters capture range', () => {
  assert.equal(CRUISE_GAP, 8.5);
  assert.ok(CRUISE_GAP - GAP_BREATH_AMPLITUDE > LEVELS[1].pursuit.captureDistance);
  const e = chase(28);
  let lo = Infinity, hi = 0;
  run(e, 10, -28, () => { const g = gap(e); lo = Math.min(lo, g); hi = Math.max(hi, g); });
  assert.ok(lo > CRUISE_GAP - GAP_BREATH_AMPLITUDE - 0.15, `min ${lo}`);
  assert.ok(lo > LEVELS[1].pursuit.captureDistance + 0.5, `outside capture range (${lo})`);
  assert.ok(hi < CRUISE_GAP + GAP_BREATH_AMPLITUDE + 0.15, `max ${hi}`);
  assert.ok(hi - lo > 0.3, `it does breathe (${hi - lo} m)`);
  assert.equal(e.captured.length, 0);
});

test('chase: breathing is on the pursuer clock at GAP_BREATH_RATE, cruise only', () => {
  const e = chase(28);
  const p = e.lm.pursuit;
  p.clock = 0;
  const cruiseAt = (t) => { p.clock = t; return p.desiredGap(); };
  assert.ok(Math.abs(cruiseAt(0) - CRUISE_GAP) < 1e-9);
  assert.ok(Math.abs(cruiseAt(0.25 / GAP_BREATH_RATE) - (CRUISE_GAP + GAP_BREATH_AMPLITUDE)) < 1e-9);
  assert.ok(Math.abs(cruiseAt(0.75 / GAP_BREATH_RATE) - (CRUISE_GAP - GAP_BREATH_AMPLITUDE)) < 1e-9);
  p.gapPressure = 1;           // full pressure: the standoff, no breathing
  for (const t of [0, 0.3, 0.6, 0.9]) assert.equal(cruiseAt(t), STANDOFF_DISTANCE);
});

test('pressure: rises while below 0.9 of top speed, scaled by the shortfall, falls above', () => {
  const top = MAX_SPEED;
  const threshold = PRESSURE_SPEED_FRACTION * top;
  // A speed just under the threshold that is not "slowed"
  const rise = (v) => {
    const e = chase(v);
    e.lm.pursuit.gapPressure = 0;
    run(e, 1, -v);
    return e.lm.pursuit.gapPressure;
  };
  const r20 = rise(20), r14 = rise(14);
  assert.ok(Math.abs(r20 - PRESSURE_RISE_RATE * (1 - 20 / threshold)) < 0.02, `20 m/s: ${r20}`);
  assert.ok(Math.abs(r14 - PRESSURE_RISE_RATE * (1 - 14 / threshold)) < 0.02, `14 m/s: ${r14}`);
  assert.ok(r14 > r20, 'further below -> faster');

  const e = chase(28);
  e.lm.pursuit.gapPressure = 1;
  run(e, 1, -28);
  assert.ok(Math.abs(e.lm.pursuit.gapPressure - (1 - PRESSURE_FALL_RATE)) < 0.02);
  run(e, 3, -28);
  assert.equal(e.lm.pursuit.gapPressure, 0, 'clamped at 0');

  // exactly at the threshold counts as "at or above": it falls
  const f = chase(threshold);
  f.lm.pursuit.gapPressure = 0.5;
  run(f, 0.5, -threshold);
  assert.ok(f.lm.pursuit.gapPressure < 0.5);
});

test('pressure: slowed taxi or a stumble pins it at 1; it then decays after recovery', () => {
  const e = chase(28);
  run(e, 1, -28);
  assert.equal(e.lm.pursuit.gapPressure, 0);
  e.setSpeed(10);                        // stumble AND below the slow threshold
  run(e, 0.1, -10);
  assert.equal(e.lm.pursuit.gapPressure, 1);

  const s = noCapture(chase(28));
  run(s, 1, -28);
  s.setSpeed(18);                        // stumble only: 10 m/s in one frame, still > 12
  run(s, 0.1, -18);
  assert.ok(18 > SLOW_SPEED_THRESHOLD);
  assert.equal(s.lm.pursuit.gapPressure, 1, 'stumble forces 1');
  run(s, STUMBLE_SURGE_TIME + 0.5, -28);
  assert.ok(s.lm.pursuit.gapPressure < 1, 'decays once back at speed');
});

test('pressure: a taxi cruising at 20 m/s is gradually hunted down and captured', () => {
  const e = chase(20, CRUISE_GAP, 100);
  run(e, 3, -20);
  const p3 = e.lm.pursuit.gapPressure;
  assert.ok(Math.abs(p3 - 3 * PRESSURE_RISE_RATE * (1 - 20 / (PRESSURE_SPEED_FRACTION * MAX_SPEED))) < 0.03,
    `pressure after 3 s: ${p3}`);
  assert.equal(e.captured.length, 0, 'not caught yet');
  run(e, 12, -20);
  assert.equal(e.captured.length, 1);
});

test('pounce: runs at full chase speed, then reaches the standoff with a short, harsh brake', () => {
  const e = noCapture(chase(10, 30, 100));      // 30 m behind a slowed taxi
  const p = e.lm.pursuit;
  const top = LEVELS[1].pursuit.speedFraction * MAX_SPEED;
  let peak = 0, peakAt = null, brakeStartGap = null, settleT = null;
  let t = 0;
  run(e, 6, -10, () => {
    t += DT;
    if (p.speed > peak) { peak = p.speed; peakAt = t; }
    if (peakAt !== null && brakeStartGap === null && p.speed < peak - 0.5 && p.speed < top * 0.98) {
      brakeStartGap = gap(e);
    }
    if (settleT === null && gap(e) <= STANDOFF_DISTANCE + 0.5) settleT = t;
  });
  assert.ok(peak > 1.15 * MAX_SPEED - 0.5, `full speed (${peak})`);
  // No long sqrt-profile deceleration: braking starts within the last
  // PRE_CONTACT_BRAKE_DISTANCE (+ the pounce threshold and one frame of travel)
  assert.ok(brakeStartGap !== null);
  assert.ok(brakeStartGap <= STANDOFF_DISTANCE + PRE_CONTACT_BRAKE_DISTANCE + POUNCE_GAP_EXCESS + 1,
    `started braking at gap ${brakeStartGap}`);
  assert.ok(gap(e) >= MIN_SEPARATION - 1e-9 && gap(e) <= STANDOFF_DISTANCE + 0.3, `gap ${gap(e)}`);
  assert.ok(settleT !== null && settleT < 2.5, `got there in ${settleT} s`);
});

test('pounce: no oscillation against MIN_SEPARATION once settled', () => {
  for (const v of [0, 5, 10]) {
    const e = noCapture(chase(v, 20, 100));
    run(e, 4, -v);                         // pounce and settle
    let lo = Infinity, hi = 0, reversals = 0, last = e.lm.pursuit.speed, lastDir = 0;
    run(e, 6, -v, () => {
      const g = gap(e); lo = Math.min(lo, g); hi = Math.max(hi, g);
      const dir = Math.sign(e.lm.pursuit.speed - last);
      if (dir !== 0 && lastDir !== 0 && dir !== lastDir) reversals++;
      if (dir !== 0) lastDir = dir;
      last = e.lm.pursuit.speed;
    });
    assert.ok(hi - lo < 0.2, `v ${v}: gap wanders ${lo}..${hi}`);
    assert.ok(lo >= MIN_SEPARATION - 1e-9);
    assert.ok(reversals <= 2, `v ${v}: ${reversals} speed reversals`);
  }
});

test('chase: a taxi at 5 m/s is caught (slowed: held inside capture range)', () => {
  const e = chase(5);
  run(e, 4, -5);
  assert.equal(e.captured.length, 1);
});

test('chase: a taxi at >= 0.9 of top speed is never captured (long run)', () => {
  // Below that the pursuer gets hungry (pressure) and does catch up
  for (const v of [PRESSURE_SPEED_FRACTION * MAX_SPEED, 27, 28]) {
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
  run(e, 6, -27);
  assert.ok(Math.abs(gap(e) - CRUISE_GAP) < GAP_BREATH_AMPLITUDE + 0.2, `gap ${gap(e)}`);
  assert.equal(e.lm.pursuit.captureTimer, 0);
  assert.equal(e.captured.length, 0);
});

test('chase: a stumble (speed drop > 8 m/s in 0.4 s) makes the pursuer surge', () => {
  const e = noCapture(chase(28));
  run(e, 3, -28);
  assert.ok(gap(e) > CRUISE_GAP - GAP_BREATH_AMPLITUDE - 0.2);
  // Collision: 28 -> 18 m/s at once. Still above the slow threshold.
  e.setSpeed(18);
  const surged = [];
  run(e, 1.0, -18, () => surged.push(gap(e)));
  assert.ok(18 >= SLOW_SPEED_THRESHOLD);
  assert.ok(Math.min(...surged) < CRUISE_GAP - 1.5, `surged to ${Math.min(...surged)}`);
  assert.ok(Math.min(...surged) >= MIN_SEPARATION - 1e-9);
  assert.ok(Math.min(...surged) < STANDOFF_DISTANCE + 0.4);
  // Taxi recovers to full speed: the surge ends after
  // STUMBLE_SURGE_TIME and the pressure drains, so the gap reopens
  run(e, STUMBLE_SURGE_TIME + 4, -28);
  assert.ok(Math.abs(gap(e) - CRUISE_GAP) < GAP_BREATH_AMPLITUDE + 0.2, `gap ${gap(e)}`);
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
  // No stumble: the pressure builds gradually instead of pinning at 1
  assert.equal(e.lm.pursuit.sinceStumble, Infinity);
  assert.ok(e.lm.pursuit.gapPressure > 0 && e.lm.pursuit.gapPressure < 0.6,
    `pressure ${e.lm.pursuit.gapPressure}`);
  assert.ok(gap(e) > STANDOFF_DISTANCE + 1, `gap ${gap(e)}`);
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
  run(e, 0.3 + CATCH_LUNGE_MAX_TIME + 0.1, -3);   // timer, then the lunge
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

// ---- Catch lunge and the new gap numbers ---------------------------

test('numbers: floor and contact stay above the touching distance, capture range above standoff', () => {
  assert.equal(STANDOFF_DISTANCE, 5.7);
  assert.equal(MIN_SEPARATION, 5.45);
  assert.equal(CONTACT_DISTANCE, 5.5);
  assert.equal(CATCH_LUNGE_MAX_TIME, 0.35);
  assert.ok(MIN_SEPARATION > TOUCHING_DISTANCE);
  assert.ok(CONTACT_DISTANCE > TOUCHING_DISTANCE);
  assert.ok(CONTACT_DISTANCE >= MIN_SEPARATION);
  for (const n of [1, 2, 3]) {
    const c = LEVELS[n].pursuit.captureDistance;
    assert.equal(c, 6.4, `level ${n}`);
    // the standoff clamp (standoff <= captureDistance - margin) does not bite
    assert.ok(STANDOFF_DISTANCE <= c - 0.25, `level ${n} standoff clamp`);
    // breathing never takes the cruise gap into capture range
    assert.ok(CRUISE_GAP - GAP_BREATH_AMPLITUDE > c, `level ${n} cruise gap`);
  }
});

test('lunge: per-level override of the new numbers is honoured', () => {
  const e = make();
  e.lm.load(1);
  const saved = LEVELS[1].pursuit.contactDistance;
  LEVELS[1].pursuit.contactDistance = 5.9;
  LEVELS[1].pursuit.minSeparation = 5.6;
  try {
    e.lm.load(1);
    const p = e.lm.pursuit;
    assert.equal(p.contactDistance(), 5.9);
    assert.equal(p.minSeparation(), 5.6);
  } finally {
    if (saved === undefined) delete LEVELS[1].pursuit.contactDistance;
    else LEVELS[1].pursuit.contactDistance = saved;
    delete LEVELS[1].pursuit.minSeparation;
  }
});

// A slowed taxi creeping at `v`, pursuer already inside capture range.
// Records the gap and pursuer state every frame.
function lunge(v, startGap = STANDOFF_DISTANCE) {
  const e = chase(v, startGap);
  const log = { minGap: Infinity, gapAtCapture: null, states: new Set(), fires: 0 };
  e.lm.pursuit.onCaptured = (...a) => { log.fires++; log.gapAtCapture = gap(e); };
  run(e, 4, -v, () => {
    log.minGap = Math.min(log.minGap, gap(e));
    log.states.add(e.lm.pursuit.state);
  });
  return { e, log };
}

test('lunge: capture goes through a catching phase and ends at CONTACT_DISTANCE', () => {
  for (const v of [0, 3, 8]) {
    const { e, log } = lunge(v);
    assert.ok(log.states.has('catching'), `v ${v}: lunged`);
    assert.equal(e.captured.length, 1, `v ${v}: onCaptured once`);
    assert.equal(e.lm.pursuit.captured, true);
    assert.ok(Math.abs(log.gapAtCapture - CONTACT_DISTANCE) <= 0.1,
      `v ${v}: gap at capture ${log.gapAtCapture}`);
    assert.ok(Math.abs(gap(e) - CONTACT_DISTANCE) <= 0.1 ||
      e.lm.pursuit.speed === 0, `v ${v}: settled`);
    assert.ok(log.minGap >= TOUCHING_DISTANCE, `v ${v}: min gap ${log.minGap}`);
    assert.ok(log.minGap >= MIN_SEPARATION - 1e-9, `v ${v}: floor ${log.minGap}`);
  }
});

test('lunge: does not capture before the timer; lunge is capped at CATCH_LUNGE_MAX_TIME', () => {
  const e = chase(3, STANDOFF_DISTANCE);
  const p = e.lm.pursuit;
  let enteredAt = null, firedAt = null, t = 0;
  e.lm.pursuit.onCaptured = () => { firedAt = t; };
  run(e, 4, -3, () => {
    t += DT;
    if (enteredAt === null && p.state === 'catching') enteredAt = t;
  });
  assert.ok(enteredAt !== null && firedAt !== null);
  assert.ok(enteredAt >= p.config.captureTime - 2 * DT, `not before captureTime (${enteredAt})`);
  assert.ok(firedAt - enteredAt <= CATCH_LUNGE_MAX_TIME + 2 * DT, `lunge took ${firedAt - enteredAt} s`);
});

test('lunge: from the edge of capture range it closes in and matches the taxi speed', () => {
  // Capture timer completes at the far edge of the range (6.4 m)
  const e = chase(10, 6.35);
  const p = e.lm.pursuit;
  p.config.captureTime = 0.3;
  let minGap = Infinity, speedAtCatch = null, fires = 0, gapAtCapture = null;
  p.onCaptured = () => { fires++; gapAtCapture = gap(e); speedAtCatch = p.speed; };
  run(e, 3, -10, () => { minGap = Math.min(minGap, gap(e)); });
  assert.equal(fires, 1);
  assert.ok(Math.abs(gapAtCapture - CONTACT_DISTANCE) <= 0.1, `gap ${gapAtCapture}`);
  assert.ok(minGap >= TOUCHING_DISTANCE, `never overlaps (${minGap})`);
});

test('lunge: onCaptured fires once and the pursuer then stays put', () => {
  const { e } = lunge(3);
  assert.equal(e.captured.length, 1);
  const { x, z } = e.lm.pursuit;
  run(e, 3, -3);
  assert.equal(e.captured.length, 1);
  assert.equal(e.lm.pursuit.x, x);
  assert.equal(e.lm.pursuit.z, z);
  assert.equal(e.lm.pursuit.speed, 0);
});

test('lunge: restart or level switch mid-lunge cancels it', () => {
  for (const action of ['reset', 'load']) {
    const e = chase(3, STANDOFF_DISTANCE);
    const p = e.lm.pursuit;
    // step until the lunge starts, then act before it can fire
    let entered = false;
    for (let t = 0; t < 4 && !entered; t += DT) {
      e.taxi.position.z -= 3 * DT;
      e.lm.update(DT, t);
      entered = p.state === 'catching';
    }
    assert.ok(entered, 'reached the catching phase');
    assert.equal(e.captured.length, 0, 'not fired yet');
    if (action === 'reset') e.lm.reset(); else e.lm.load(2);
    const q = e.lm.pursuit;
    assert.notEqual(q.state, 'catching');
    assert.equal(q.lungeTimer, 0);
    assert.equal(q.captured, false);
    assert.equal(q.captureTimer, 0);
    run(e, 3, 0);                      // the cancelled lunge must not fire later
    assert.equal(e.captured.length, 0, `${action}: nothing fires afterwards`);
    assert.notEqual(e.lm.status, 'captured');
  }
});

// ---- Level 2: following onto the flyover ---------------------------

const SECTION = LEVELS[2].elevated[0];
const deckY = SECTION.height;
const RAIL_LO = SECTION.xMin + RAIL_CLAMP_MARGIN;
const RAIL_HI = SECTION.xMax - RAIL_CLAMP_MARGIN;

// Level 2, chasing, taxi cruising at `speed` on the ground at (0, z0)
// with the pursuer one cruise gap behind.
function l2(speed = 27, z0 = 100) {
  const e = make();
  e.lm.load(2);
  step(e.lm, 3.2);                          // past the start delay
  e.taxi.position.set(0, 0, z0);
  const p = e.lm.pursuit;
  p.x = 0; p.z = z0 + CRUISE_GAP; p.heading = 0; p.speed = speed;
  p.gapPressure = 0;
  e.setSpeed(speed);
  return e;
}

// Drives the taxi to the flyover (lining up on x 6.2 like the guide
// route) and along it, y following the deck, until it passes endZ.
function driveFlyover(e, speed, endZ, onFrame) {
  e.setSpeed(speed);
  for (let t = 0; e.taxi.position.z > endZ && t < 30; t += DT) {
    const z = e.taxi.position.z - speed * DT;
    const x = z > 70 ? 0 : z < 15 ? 6.2 : 6.2 * (70 - z) / 55;
    e.taxi.position.set(x, e.lm.getElevationAt(x, z), z);
    e.lm.update(DT, t);
    onFrame?.(t);
  }
}

test('flyover: getElevationAt is a pure function of x, z (profile on the section, 0 off it)', () => {
  const e = make();
  e.lm.load(2);
  const h = (x, z) => e.lm.getElevationAt(x, z);
  assert.equal(h(6.2, 10), 0);                                // toe
  assert.ok(Math.abs(h(6.2, -5) - deckY * 15 / 30) < 1e-9);   // mid ramp
  assert.equal(h(6.2, -40), deckY);                           // deck
  assert.ok(Math.abs(h(6.2, -95) - deckY * 15 / 30) < 1e-9);  // exit ramp
  assert.equal(h(6.2, -120), 0);
  assert.equal(h(0, -40), 0, 'ground lane is not elevated');
  assert.equal(h(9.5, -40), 0, 'beyond the section edge');
  e.lm.load(1);
  assert.equal(h(6.2, -40), 0, 'level 1 has no elevated section');
});

test('flyover: pursuer follows up the ramp onto the deck and never loses the taxi', () => {
  const e = l2();
  const p = e.lm.pursuit;
  let maxY = 0;
  const states = new Set();
  driveFlyover(e, 27, -70, () => {
    maxY = Math.max(maxY, p.y);
    states.add(p.state);
  });
  assert.ok(e.taxi.position.y > ELEVATED_Y, 'taxi is on the flyover');
  assert.deepEqual([...states], ['chasing']);
  assert.ok(maxY >= deckY - 1e-9, `reached the deck (max y ${maxY})`);
  assert.ok(Math.abs(p.y - deckY) < 1e-9 && p.section, 'on the deck');
  // mesh height follows the axles, so it can sit a few cm off the centre height
  assert.ok(Math.abs(p.mesh.position.y - p.y) < 0.01, `mesh y ${p.mesh.position.y}`);
  assert.ok(gap(e) < CRUISE_GAP + GAP_BREATH_AMPLITUDE + 3, `close behind (${gap(e)})`);
  assert.equal(e.captured.length, 0);
});

test('flyover: pursuer y matches the elevation profile, pitched on the ramps only', () => {
  const e = l2();
  const p = e.lm.pursuit;
  let worst = 0, upPitch = 0, downPitch = 0, deckPitch = 0, onSectionFrames = 0;
  driveFlyover(e, 27, -125, () => {
    if (p.section) {
      onSectionFrames++;
      worst = Math.max(worst, Math.abs(p.mesh.position.y - e.lm.getElevationAt(p.x, p.z)));   // axle-based: off the centre height by the pitch lever only
      if (p.z > SECTION.zEntry - SECTION.rampLength) upPitch = Math.max(upPitch, p.mesh.rotation.x);
      else if (p.z < SECTION.zExit + SECTION.rampLength) downPitch = Math.min(downPitch, p.mesh.rotation.x);
      // (the pitch is smoothed: allow ~20 m after each ramp to settle)
      else if (p.z < SECTION.zEntry - SECTION.rampLength - 20 &&
               p.z > SECTION.zExit + SECTION.rampLength + 20) {
        deckPitch = Math.max(deckPitch, Math.abs(p.mesh.rotation.x));
      }
    } else {
      // ground pursuer: only its nose at the toe / tail at the exit ramp lift it
      assert.ok(p.mesh.position.y >= 0 && p.mesh.position.y < 0.15, `off the section y ${p.mesh.position.y}`);
    }
  });
  assert.ok(onSectionFrames > 100);
  assert.ok(worst < 0.15, `y off the profile by ${worst}`);
  const ramp = Math.atan2(deckY, SECTION.rampLength);
  assert.ok(upPitch > ramp * 0.6 && upPitch < ramp + 0.01, `nose up on the ramp (${upPitch})`);
  assert.ok(downPitch < -ramp * 0.6 && downPitch > -ramp - 0.01, `nose down on the exit ramp (${downPitch})`);
  assert.ok(deckPitch < 0.01, `level on the deck (${deckPitch})`);
});

test('flyover: pursuer stays between the rails on the section; lane clamp off it', () => {
  const e = l2();
  const p = e.lm.pursuit;
  let onSection = 0;
  driveFlyover(e, 27, -125, () => {
    if (p.section) {
      onSection++;
      assert.ok(p.x >= RAIL_LO - 1e-9 && p.x <= RAIL_HI + 1e-9, `x ${p.x} on the section`);
      assert.ok(p.mesh.position.x >= RAIL_LO - 1e-9 && p.mesh.position.x <= RAIL_HI + 1e-9);
    }
  });
  assert.ok(onSection > 100);
  // Taxi far right while still on the ground: the lane clamp (x <= 2) holds
  const g = l2();
  g.taxi.position.set(8, 0, 120);
  for (let t = 0; t < 3; t += DT) {
    g.taxi.position.z -= 5 * DT;
    g.setSpeed(5);
    g.lm.update(DT, t);
    assert.ok(g.lm.pursuit.x <= 2 + 1e-9, 'ground lane still applies off the section');
  }
});

// Taxi already up on the deck, pursuer 110 m back on the ground
function farBehind() {
  const e = make();
  e.lm.load(2);
  step(e.lm, 3.2);
  const p = e.lm.pursuit;
  e.taxi.position.set(6.2, deckY, -50);
  p.x = 0; p.z = 60; p.heading = 0; p.speed = 0;
  e.setSpeed(20);
  return e;
}

test('flyover: taxi up, pursuer far behind: runs to the ramp toe at full speed, then climbs', () => {
  const e = farBehind();
  const p = e.lm.pursuit;
  const top = LEVELS[2].pursuit.speedFraction * MAX_SPEED;
  let peak = 0, boardedZ = null, maxY = 0;
  const states = new Set();
  for (let t = 0; t < 12; t += DT) {
    e.taxi.position.z -= 20 * DT;
    e.lm.update(DT, t);
    peak = Math.max(peak, p.speed);
    maxY = Math.max(maxY, p.y);
    states.add(p.state);
    if (boardedZ === null && p.section) boardedZ = p.z;
  }
  assert.deepEqual([...states], ['chasing'], 'never gives up');
  assert.ok(peak > top * 0.95, `full speed (${peak} of ${top})`);
  assert.ok(boardedZ !== null && boardedZ <= SECTION.zEntry, 'got onto the ramp');
  assert.ok(boardedZ > SECTION.zEntry - 4, `at the toe, not mid ramp (z ${boardedZ})`);
  assert.ok(maxY >= deckY - 1e-9, `climbed to the deck (${maxY})`);
});

test('flyover: slower on the ramp slope (RAMP_SPEED_FACTOR) than on the flat', () => {
  assert.equal(RAMP_SPEED_FACTOR, 0.9);
  const e = farBehind();
  const p = e.lm.pursuit;
  const cfg = LEVELS[2].pursuit;
  const cap = cfg.speedFraction * MAX_SPEED * 1.15;   // top speed x max catch-up
  let flatPeak = 0, rampPeak = 0;
  for (let t = 0; t < 12; t += DT) {
    e.taxi.position.z -= 20 * DT;
    e.lm.update(DT, t);
    // (a few metres up the slope: it sheds the speed it arrived with)
    if (p.onRamp && p.y > 0.6 && p.z > SECTION.zEntry - SECTION.rampLength) {
      rampPeak = Math.max(rampPeak, p.speed);
    }
    else if (!p.section) flatPeak = Math.max(flatPeak, p.speed);
  }
  assert.ok(rampPeak > 0, 'was on the ramp');
  assert.ok(rampPeak <= cap * RAMP_SPEED_FACTOR + 1e-6, `ramp ${rampPeak}`);
  assert.ok(flatPeak > rampPeak + 1, `flat ${flatPeak} vs ramp ${rampPeak}`);
});

test('flyover: capture works on the deck when the taxi slows', () => {
  const e = make();
  e.lm.load(2);
  step(e.lm, 3.2);
  const p = e.lm.pursuit;
  e.taxi.position.set(6.2, deckY, -40);
  p.x = 6.2; p.z = -40 + 8; p.y = deckY; p.heading = 0; p.speed = 5;
  e.setSpeed(5);
  for (let t = 0; t < 1.0; t += DT) { e.taxi.position.z -= 5 * DT; e.lm.update(DT, t); }
  assert.ok(p.section && p.reachable, 'same level');
  assert.equal(e.captured.length, 0, 'not before captureTime');
  for (let t = 0; t < 3; t += DT) { e.taxi.position.z -= 5 * DT; e.lm.update(DT, t); }
  assert.equal(e.captured.length, 1, 'captured on the flyover');
  assert.equal(e.captured[0].level, 2);
});

test('flyover: no capture across levels (pursuer on the ground under a taxi on the deck)', () => {
  const e = make();
  e.lm.load(2);
  step(e.lm, 3.2);
  const p = e.lm.pursuit;
  e.taxi.position.set(6.2, deckY, -40);
  e.setSpeed(0);
  for (let t = 0; t < 4; t += DT) {
    p.x = 2; p.z = -34; p.y = 0; p.speed = 0;       // pinned under the deck
    e.lm.update(DT, t);
    assert.equal(p.reachable, false);
  }
  assert.equal(e.captured.length, 0);
});

test('flyover: when the taxi comes back down the pursuer follows down behind it', () => {
  const e = l2();
  const p = e.lm.pursuit;
  let wentUp = false, cameDown = false;
  const states = new Set();
  driveFlyover(e, 27, -150, () => {
    states.add(p.state);
    wentUp ||= p.y > deckY - 0.01;
    if (wentUp && !p.section && p.z < SECTION.zExit) cameDown = true;
  });
  assert.ok(wentUp, 'went up');
  assert.ok(cameDown, 'came down off the exit ramp');
  assert.deepEqual([...states], ['chasing']);
  assert.equal(p.y, 0);
  assert.ok(Math.abs(p.pitch) < 0.02, `settled flat (${p.pitch})`);
  assert.ok(gap(e) < 15, `close behind, not far back (${gap(e)})`);
  assert.equal(e.captured.length, 0);
});

// ---- Flyover keep-out: a ground pursuer never enters the footprint ----

const KEEP = 1.1 + 0.3;   // half width + margin (PursuitSystem KEEP_OUT)

function insideFootprint(p) {
  return p.x > SECTION.xMin - KEEP + 1e-6 && p.x < SECTION.xMax + KEEP - 1e-6 &&
    p.z < SECTION.zEntry && p.z > SECTION.zExit;
}

// Taxi on the deck driven along x 6.2; pursuer placed at (px, pz) on the
// ground. Asserts EVERY frame (pursuer and mesh) and returns the tracker.
function sweepRun(px, pz, taxiSpeed, { startZ = 60, endZ = -150, frames = 60 * 30 } = {}) {
  const e = make();
  e.lm.load(2);
  step(e.lm, 3.2);
  const p = e.lm.pursuit;
  p.x = px; p.z = pz; p.y = 0; p.section = null; p.heading = 0; p.speed = 0;
  let z = startZ, captured0 = 0;
  e.taxi.position.set(6.2, e.lm.getElevationAt(6.2, z), z);
  e.setSpeed(taxiSpeed);
  const r = { e, p, minZ: Infinity, boarded: false, states: new Set(), bad: null,
    atZExit: null, crossLevel: false };
  for (let f = 0; f < frames && z > endZ; f++) {
    z -= taxiSpeed * DT;
    const x = 6.2;
    e.taxi.position.set(x, e.lm.getElevationAt(x, z), z);
    e.lm.update(DT, f * DT);
    r.states.add(p.state);
    if (!p.section && p.mesh.position.y < 0.3 && insideFootprint(p) && !r.bad) {
      r.bad = `frame ${f}: ground pursuer inside footprint at (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`;
    }
    if (p.section) r.boarded = true;
    if (e.captured.length > captured0) {
      captured0 = e.captured.length;
      if (Math.abs(e.taxi.position.y - p.y) > 1.0) r.crossLevel = true;
    }
    if (r.atZExit === null && e.taxi.position.z <= SECTION.zExit) {
      r.atZExit = { pz: p.z, py: p.y, taxiY: e.taxi.position.y };
    }
  }
  return r;
}

test('flyover keep-out: ground pursuer never inside the footprint (start positions x taxi speeds)', () => {
  const starts = [
    [0, 9], [2, 5], [0, -30], [0, -60], [1.6, -50], [2, -90], [0, -111],   // beside / past the toe
    [0, 10.2], [0, 12], [6.2, 10.5], [3.5, 14], [8, 12], [0, 20],          // at the toe
    [0, 40], [0, 80], [-6, 60], [6.2, 40]                                  // behind it
  ];
  for (const [px, pz] of starts) {
    for (const v of [12, 20, 27]) {
      const beside = pz < SECTION.zEntry && pz > SECTION.zExit;
      const r = sweepRun(px, pz, v, { startZ: beside ? -5 : 60 });
      assert.equal(r.bad, null, `start (${px}, ${pz}) at ${v} m/s: ${r.bad}`);
      assert.equal(r.crossLevel, false, `start (${px}, ${pz}) at ${v}: captured on another level`);
    }
  }
});

test('flyover keep-out: boarding from behind the toe still works', () => {
  for (const [px, pz] of [[0, 40], [0, 80], [-6, 60], [0, 14], [6.2, 40], [3.5, 14]]) {
    const r = sweepRun(px, pz, 20);
    assert.equal(r.bad, null, r.bad);
    assert.ok(r.boarded, `start (${px}, ${pz}) boarded the section`);
    assert.ok(r.p.y >= 0 && r.p.y <= deckY + 1e-9);
  }
});

test('flyover keep-out: pursuer beside the ramp waits at zExit when the taxi comes down', () => {
  for (const [px, pz] of [[0, 9], [2, 5], [0, -30], [0, -60], [1.6, -50]]) {
    for (const v of [12, 20, 27]) {
      const r = sweepRun(px, pz, v, { startZ: -5, endZ: -113 });
      assert.equal(r.bad, null, r.bad);
      assert.equal(r.boarded, false, 'cannot board once past the toe');
      assert.ok(r.states.has('chasing') && !r.states.has('lost') && !r.states.has('searching'),
        `start (${px}, ${pz}) at ${v}: never loses the taxi (${[...r.states]})`);
      assert.ok(r.atZExit, 'taxi reached zExit');
      const dz = r.atZExit.pz - SECTION.zExit;
      assert.ok(Math.abs(dz) < 20 && r.atZExit.py === 0,
        `start (${px}, ${pz}) at ${v}: pursuer ${dz.toFixed(1)} m from zExit when the taxi comes down`);
      assert.equal(r.e.captured.length, 0);
    }
  }
});

test('flyover keep-out: slow taxi on the deck is never captured by a ground pursuer', () => {
  for (const [px, pz] of [[0, -30], [1.6, -50], [0, 9]]) {
    const r = sweepRun(px, pz, 1.5, { startZ: -20, endZ: -60, frames: 60 * 40 });
    assert.equal(r.bad, null, r.bad);
    assert.equal(r.e.captured.length, 0, `start (${px}, ${pz}) captured across levels`);
  }
});

test('flyover: the pursuer is never a collidable', () => {
  const e = make();
  e.lm.load(2);
  const mesh = e.lm.pursuit.mesh;
  for (const c of e.lm.collidables) {
    for (let o = c; o; o = o.parent) assert.notEqual(o, mesh);
  }
  assert.ok(e.lm.collidables.length > 0, 'rails and pillars are');
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

// Real flyover ramp/deck/rail meshes, raycast straight down from the
// pursuer's four tyre contact points (taken from its real mesh)
test('L2: pursuer wheels stay on the flyover surface along the whole structure', () => {
  const e = make();
  e.lm.load(2);
  e.scene.updateMatrixWorld(true);

  const p = e.lm.pursuit;
  const surfaces = e.lm.group.children.filter(o => o.isMesh &&
    o.geometry.type === 'BoxGeometry' && o.material === e.lm.concreteMaterial);
  assert.ok(surfaces.length >= 9, 'ramp, deck and rail meshes present');

  const contacts = [];
  p.mesh.traverse(o => {
    if (o.isMesh && o.geometry.type === 'CylinderGeometry' &&
        o.geometry.parameters.radiusTop === 0.38) {
      contacts.push(new THREE.Vector3(o.position.x, o.position.y - 0.38, o.position.z));
    }
  });
  assert.equal(contacts.length, 4);

  const ray = new THREE.Raycaster();
  let worstPen = 0, worstFloat = 0, atPen = '', atFloat = '';

  for (const x of [4.8, 6.2, 7.6]) {
    p.placeAt(x, 30);
    for (let z = 30; z >= -118; z -= 0.1) {
      p.x = x; p.z = z; p.heading = 0;
      p.boarding = p.level.elevated[0];
      p.clampToRoad();
      // steady state: the eased pitch has caught up with the surface
      p.pitch = p.surfacePitch();
      p.syncMesh();
      p.mesh.updateMatrixWorld(true);

      for (const c of contacts) {
        const w = c.clone().applyMatrix4(p.mesh.matrixWorld);
        // A tyre bridges the ~4 cm crack where each ramp box's slanted
        // end face meets the deck box, so the surface under a contact
        // is the highest of a few rays across its patch (+-5 cm in z)
        let surf = 0;
        for (const dz of [-0.05, 0, 0.05]) {
          ray.set(new THREE.Vector3(w.x, 50, w.z + dz), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObjects(surfaces, false)[0];
          if (hit) surf = Math.max(surf, 50 - hit.distance);
        }
        const gap = w.y - surf;

        if (-gap > worstPen) { worstPen = -gap; atPen = `x=${x} z=${z.toFixed(1)}`; }
        if (gap > worstFloat) { worstFloat = gap; atFloat = `x=${x} z=${z.toFixed(1)}`; }
      }
    }
  }

  assert.ok(worstPen <= 0.02, `wheel ${worstPen.toFixed(3)} m below surface (${atPen})`);
  assert.ok(worstFloat <= 0.15, `wheel ${worstFloat.toFixed(3)} m above surface (${atFloat})`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS', name); }
  catch (err) { failed++; console.log('FAIL', name, '\n  ', err.message); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
