// Countdown test: node tests/countdown.test.mjs
// The 3-2-1-GO countdown on every level: Level 1's (inside its rank race) and
// Levels 2 and 3's (no race). While it runs the taxi is locked and traffic, the
// pursuit and the level clock are frozen; the pursuit's startDelay and Level 3's
// spawnIdleGrace count from GO. Plus: Level 1's getState() race and score are
// what they were before Levels 2 and 3 got a countdown.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import { CountdownTracker } from '../src/ui/countdown.js';

const DT = 1 / 60;

function make() {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  let speed = 0;
  const lostCargo = [];

  const vehicle = {
    settings: { maxForwardSpeed: 28 },
    cargoSystem: {
      getState: () => ({ remaining: 5, total: 5 }),
      onCargoLost: e => lostCargo.push(e)
    },
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(spawn) { taxi.position.set(spawn.x, 0, spawn.z); speed = 0; },
    getSpeed: () => speed,
    getHighSpeedTime: () => 0,
    getLevel2Pressure: () => 0
  };

  const scores = [];

  const lm = new LevelManager({
    scene, vehicle, taxi,
    collidables: [], potholes: [],
    getHeadlightsEnabled: () => true,
    onScore: e => scores.push(e)
  });

  return { scene, taxi, lm, scores, lostCargo };
}

// Steps whole frames; returns the time stepped
function step(lm, seconds) {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) lm.update(DT, i * DT);
  return frames * DT;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---- Level 1 is unchanged ---------------------------------------------------

// Recorded from the code before Levels 2 and 3 had a countdown (main at fc901f1):
// the taxi parked on its spawn, the state after load and after 1, 2.9 and 3.1 s
const L1_SNAPSHOT = [
  ['load', {
    score: { points: 0, beaten: 0, rivalsTotal: 8, firstOut: null, pedestriansHit: 0 },
    race: { phase: 'countdown', countdown: 3 }
  }],
  ['1.0 s', {
    score: { points: 0, beaten: 0, rivalsTotal: 8, firstOut: null, pedestriansHit: 0 },
    race: { phase: 'countdown', countdown: 2.0000000000000036 }
  }],
  ['2.9 s', {
    score: { points: 0, beaten: 0, rivalsTotal: 8, firstOut: null, pedestriansHit: 0 },
    race: { phase: 'countdown', countdown: 0.10000000000000564 }
  }],
  ['3.1 s', {
    score: { points: 0, beaten: 0, rivalsTotal: 8, firstOut: null, pedestriansHit: 0 },
    race: { phase: 'racing', countdown: 0 }
  }]
];

test('L1: getState() score and race are exactly what they were before (snapshot from main)', () => {
  const e = make();
  const seen = [];
  const snap = (label) => {
    const { score, race } = e.lm.getState();
    seen.push([label, { score, race }]);
  };

  e.lm.load(1);
  snap('load');
  step(e.lm, 1.0); snap('1.0 s');
  step(e.lm, 1.9); snap('2.9 s');
  step(e.lm, 0.2); snap('3.1 s');

  assert.deepEqual(seen, L1_SNAPSHOT);
});

// ---- Levels 2 and 3 ---------------------------------------------------------

for (const level of [2, 3]) {

  test(`L${level}: config has the 3 s countdown and no rank race`, () => {
    assert.equal(LEVELS[level].countdown, 3);
    assert.equal(LEVELS[level].race, undefined);
  });

  test(`L${level}: loads into the countdown: the taxi is locked, race state shows it`, () => {
    const e = make();
    e.lm.load(level);

    assert.equal(e.lm.inputLocked, true);
    assert.deepEqual(e.lm.getState().race, { phase: 'countdown', countdown: 3 });
    assert.equal(e.lm.getState().score, null, 'no points here (Phase 2)');
  });

  test(`L${level}: locked for 3.00 s, then GO unlocks; phase is 'playing', never the L1 phases`, () => {
    const e = make();
    e.lm.load(level);

    // 179 frames = 2.983 s: still locked, shown as "1"
    for (let i = 0; i < 179; i++) e.lm.update(DT, i * DT);
    assert.equal(e.lm.inputLocked, true);
    assert.equal(e.lm.getState().race.phase, 'countdown');
    assert.ok(e.lm.getState().race.countdown > 0);

    // GO within a frame of 3.00 s (180 or 181 frames: 3 - 180 x 1/60 is not
    // exactly 0 in floating point, the same as on Level 1)
    e.lm.update(DT, 0);
    if (e.lm.inputLocked) e.lm.update(DT, 0);
    assert.equal(e.lm.inputLocked, false);
    assert.deepEqual(e.lm.getState().race, { phase: 'playing', countdown: 0 });

    step(e.lm, 5);
    assert.equal(e.lm.getState().race.phase, 'playing');
  });

  test(`L${level}: elapsed, traffic and the pursuit are frozen until GO`, () => {
    const e = make();
    e.lm.load(level);

    // the taxi parked on a spot the pursuit's idle grace would have run out on
    assert.ok(e.lm.traffic.cars.length > 0, 'traffic has cars to freeze');

    const trafficBefore = JSON.stringify(
      e.lm.traffic.cars.map(c => [c.u, c.mesh.position.x, c.mesh.position.z])
    );

    step(e.lm, 2.9);

    assert.equal(e.lm.elapsed, 0);
    assert.equal(e.lm.pursuit.sinceStart, 0);
    assert.equal(e.lm.pursuit.spawned, false);
    assert.equal(
      JSON.stringify(
        e.lm.traffic.cars.map(c => [c.u, c.mesh.position.x, c.mesh.position.z])
      ),
      trafficBefore
    );

    step(e.lm, 0.2);
    assert.ok(e.lm.elapsed > 0 && e.lm.elapsed < 0.2, `elapsed ${e.lm.elapsed}`);
  });

  test(`L${level}: the pursuit's startDelay counts from GO, not from the load`, () => {
    const e = make();
    e.lm.load(level);

    const { startDelay } = e.lm.pursuit.config;
    const grace = e.lm.pursuit.config.spawnIdleGrace ?? 0;
    const wait = Math.max(startDelay, grace);

    // 3 s countdown + just under the wait: nothing spawned yet. Had the
    // countdown counted, the pursuer would be out by now.
    step(e.lm, 3.0);
    step(e.lm, wait - 0.5);
    assert.equal(e.lm.pursuit.spawned, false, 'not yet');
    assert.ok(
      Math.abs(e.lm.pursuit.sinceStart - (wait - 0.5)) < 0.05,
      `sinceStart ${e.lm.pursuit.sinceStart} counts from GO`
    );
  });

  test(`L${level}: skipCountdown() ends it at once, once`, () => {
    const e = make();
    e.lm.load(level);

    e.lm.skipCountdown();
    assert.equal(e.lm.inputLocked, false);
    assert.equal(e.lm.getState().race.phase, 'playing');

    e.lm.skipCountdown();   // no-op
    assert.equal(e.lm.getState().race.phase, 'playing');
  });

  test(`L${level}: retry (reset) and reload re-arm the countdown, mid-countdown and after GO`, () => {
    const e = make();
    e.lm.load(level);

    step(e.lm, 1.5);
    e.lm.reset();
    assert.equal(e.lm.inputLocked, true);
    assert.deepEqual(e.lm.getState().race, { phase: 'countdown', countdown: 3 });

    step(e.lm, 4);
    assert.equal(e.lm.inputLocked, false);
    assert.ok(e.lm.elapsed > 0);

    e.lm.reset();
    assert.equal(e.lm.inputLocked, true);
    assert.equal(e.lm.elapsed, 0);
    assert.equal(e.lm.pursuit.sinceStart, 0);
    assert.deepEqual(e.lm.getState().race, { phase: 'countdown', countdown: 3 });

    step(e.lm, 4);
    e.lm.load(level);
    assert.equal(e.lm.inputLocked, true);
    assert.deepEqual(e.lm.getState().race, { phase: 'countdown', countdown: 3 });
  });

  test(`L${level}: the overlay shows 3, 2, 1, GO! and fires countdown and go cues, then clears`, () => {
    const e = make();
    const tracker = new CountdownTracker();
    e.lm.load(level);

    const texts = [];
    const cues = [];

    for (let i = 0; i < 60 * 5; i++) {
      e.lm.update(DT, i * DT);
      tracker.update(e.lm.getState().race, DT);
      if (!texts.length || texts[texts.length - 1] !== tracker.text) texts.push(tracker.text);
      if (tracker.cue) cues.push(tracker.cue);
    }

    assert.deepEqual(texts, ['3', '2', '1', 'GO!', '']);
    assert.deepEqual(cues, ['countdown', 'countdown', 'countdown', 'go']);
  });

  test(`L${level}: loading or retrying fires no onCargoLost and no onScore`, () => {
    const e = make();

    e.lm.load(level);
    e.lm.reset();
    step(e.lm, 4);
    e.lm.reset();
    e.lm.load(level);

    assert.deepEqual(e.lostCargo, []);
    assert.deepEqual(e.scores, []);
  });
}

// ---- Switching levels -------------------------------------------------------

test('switching between levels: each one arms its own countdown, and L2/L3 never launch rivals', () => {
  const e = make();

  for (const level of [1, 2, 3, 1, 3, 2]) {
    e.lm.load(level);
    assert.equal(e.lm.inputLocked, true, `L${level}`);
    assert.equal(e.lm.getState().race.countdown, 3);
    step(e.lm, 3.1);
    assert.equal(e.lm.inputLocked, false);
    assert.equal(
      e.lm.getState().race.phase,
      level === 1 ? 'racing' : 'playing'
    );
  }
});

test('a level with no countdown and no race reports phase none and is never locked', () => {
  const e = make();
  e.lm.load(2);
  const config = e.lm.config;
  const saved = config.countdown;
  delete config.countdown;

  e.lm.reset();
  assert.equal(e.lm.inputLocked, false);
  assert.deepEqual(e.lm.getState().race, { phase: 'none', countdown: 0 });

  config.countdown = saved;
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
