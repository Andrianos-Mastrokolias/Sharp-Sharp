// Scripted taxi against the runners on Levels 1 and 3 (analysis tool, not part of `npm test`).
//   node tests/tools/runner-run.mjs
//
// The REAL VehicleController, taxi model, CargoSystem, LevelManager and the level
// environments, headless. A runner waits at the kerb and dashes across when the taxi
// is about to reach it (life.js). For each level this drives the taxi at one runner
// and reports whether it was hit, the speed and points before and after, and when
// the runner started, was removed and was reloaded:
//   - holding a straight line at 20 and at 28 m/s (Level 1 starts its runners at 50 m, so at 20
//     the runner is 2.5 s early and across the line first: a miss; Level 3 keeps 35 m: a hit)
//   - the pursuit's view of a hit at 28 and 31 m/s: does the speed drop count as a stumble?
//     (STUMBLE_SPEED_DROP 8 m/s) With the 25% loss no; with the old 30% yes
//   - braking after the runner starts at 28 m/s
//   - holding the line 1, 2 and 3 m to either side
//   - crawling at 8 m/s
// The pursuer and the traffic are stopped (they would catch or bump the taxi), and
// the rivals stay on their grid.

// Taxi.js tries to load a GLB with fetch: there is no network here
globalThis.Request = class { constructor(url) { this.url = url; } };
globalThis.fetch = () => Promise.reject(new Error('offline'));

import * as THREE from 'three';

const { createTaxi } = await import('../../src/vehicle/Taxi.js');
const { CargoSystem } = await import('../../src/vehicle/CargoSystem.js');
const { VehicleController } = await import('../../src/vehicle/VehicleController.js');
const { createBox } = await import('../../src/world/environments/helpers.js');
const { LevelManager, LEVELS } = await import('../../src/world/LevelManager.js');
const { routeXAt, RUNNER } = await import('../../src/world/environments/life.js');
const { makeLibrary } = await import('./fake-library.mjs');

const report = console.log;
console.log = () => {};                                      // Taxi.js chatters

const DT = 1 / 60;
const scene = new THREE.Scene();
const t = createTaxi(createBox);
scene.add(t.taxi);

const collidables = [];
const cargo = new CargoSystem({ scene, chassis: t.chassis, taxi: t.taxi, cargoItems: t.cargoItems, gravity: -22 });
const vehicle = new VehicleController({
  taxi: t.taxi, chassis: t.chassis, wheels: t.wheels, frontWheelPivots: t.frontWheelPivots,
  cargoSystem: cargo, collidableObjects: collidables, potholes: [], onCollision: () => {}
});

let simTime = 0;
const hits = [];
const lm = new LevelManager({
  scene, vehicle, taxi: t.taxi, collidables, potholes: [], materials: makeLibrary(),
  getHeadlightsEnabled: () => false,
  onScore: () => {},
  onPedestrianHit: (e) => hits.push(e)
});

function start(level) {
  vehicle.setLevel(level);
  lm.load(level);
  lm.skipCountdown();
  lm.rivals.launched = false;                                // the rivals stay on the grid
  lm.pursuit.update = () => {};                              // nobody catches the scripted taxi
  lm.traffic.update = () => {};
  vehicle.setEnabled(true);
  simTime = 0;
  hits.length = 0;
  for (const car of lm.traffic.cars) car.mesh.position.y = -50;   // parked cars would block the side lines
  const field = lm.environment.pedestrians;
  field.clock = () => simTime;                               // the sim's time, so it is repeatable
  return field;
}

// The runner nearest the road's middle line (its aim is x 0 on both levels' straight parts)
function chooseRunner(field, level) {
  const { route, runners } = LEVELS[level];
  const out = { x: 0, z: 0, sign: 1 };
  let best = null;
  for (let k = 0; k < field.runnerCount; k++) {
    const id = field.runnerId(k);
    field.positionOf(id, out, 0);
    const aim = routeXAt(route, out.z);
    if (best === null || Math.abs(aim) < Math.abs(best.aim)) best = { k, id, x: out.x, z: out.z, aim };
  }
  return { ...best, sign: runners.sign, heading: level === 3 ? Math.PI : 0 };
}

// Drive at the runner from 90 m away
//   mode 'hold'   the speed is held at `speed` (full throttle, then set back)
//   mode 'brake'  held until the runner has started, then the brake (S) until stopped
//   track true    feed the speed to the REAL pursuit's trackTaxiSpeed every frame (the pursuit
//                 itself is stopped) and note whether a stumble was seen; the speed is not
//                 forced back after a hit
function drive(level, runner, field, { speed, mode = 'hold', offset = 0, track = false }) {
  const z0 = runner.z - runner.sign * 90;
  vehicle.reset({ x: runner.aim + offset, z: z0, heading: runner.heading });
  vehicle.speed = speed;
  hits.length = 0;

  const o = {
    start: null, hit: null, done: null, arrival: null, minZ: null, finalSpeed: null, stumbled: false,
    pointsAtStart: lm.getState().score?.points ?? null
  };

  let braking = false;
  let stopped = false;

  for (let frame = 0; frame < 1200; frame++) {
    const keys = braking ? { KeyS: true } : stopped ? {} : { KeyW: true };
    vehicle.update(DT, keys);
    if (!braking && !stopped && !(track && o.hit)) vehicle.speed = speed;
    simTime += DT;

    const speedBefore = vehicle.getSpeed();
    const pointsBefore = lm.getState().score?.points ?? null;
    const stateBefore = field.runnerStateOf(runner.k);
    lm.update(DT, simTime);
    if (track) {
      lm.pursuit.trackTaxiSpeed(DT);
      if (lm.pursuit.sinceStumble === 0) o.stumbled = true;
    }

    const dz = (runner.z - t.taxi.position.z) * runner.sign;

    if (o.start === null && stateBefore === 0 && field.runnerStateOf(runner.k) === 1) {
      o.start = { frame, t: simTime, dz, speed: speedBefore };
      if (mode === 'brake') braking = true;
    }

    if (braking && vehicle.getSpeed() < 0.3) { braking = false; stopped = true; }

    if (o.hit === null && hits.length > 0) {
      o.hit = {
        frame, dz, speedBefore, speedAfter: vehicle.getSpeed(),
        pointsBefore, pointsAfter: lm.getState().score?.points ?? null,
        taxiX: t.taxi.position.x
      };
    }

    if (o.done === null && field.runnerStateOf(runner.k) === 2 && o.start !== null) {
      o.done = { frame, t: simTime, scale: field.scaleOf(runner.id), taxiDz: dz };
    }

    if (o.arrival === null && dz <= 0) o.arrival = { frame, t: simTime };

    if (dz < -25 || (stopped && frame > o.start.frame + 300)) break;
  }

  o.finalSpeed = vehicle.getSpeed();
  return o;
}

function describe(label, o) {
  const parts = [];
  parts.push(o.start
    ? `runner started ${o.start.dz.toFixed(1)} m out (taxi ${o.start.speed.toFixed(1)} m/s, ${(o.start.dz / Math.max(o.start.speed, 0.1)).toFixed(2)} s away)`
    : 'runner never started');

  if (o.hit) {
    const loss = 100 * (1 - o.hit.speedAfter / o.hit.speedBefore);
    parts.push(`HIT with the taxi's x ${o.hit.taxiX.toFixed(2)}: speed ${o.hit.speedBefore.toFixed(2)} -> ${o.hit.speedAfter.toFixed(2)} m/s (${loss.toFixed(0)}% lost)` +
      (o.hit.pointsBefore !== null ? `, points ${o.hit.pointsBefore} -> ${o.hit.pointsAfter}` : ', no points on this level'));
  } else {
    parts.push('missed');
  }

  if (o.done) {
    const before = o.arrival === null || o.done.frame < o.arrival.frame;
    parts.push(`runner removed ${o.hit ? 'when hit' : 'after crossing'} (scale ${o.done.scale}, ${before ? 'before' : 'after'} the taxi reached its z)`);
  }

  report(`    ${label}: ${parts.join('; ')}`);
}

let failures = 0;
const expect = (ok, what) => { if (!ok) failures++; report(`      ${ok ? 'OK  ' : 'FAIL'} ${what}`); };

for (const level of [1, 3]) {
  const minDistance = LEVELS[level].runners.minDistance;
  report(`\nLevel ${level}: ${LEVELS[level].runners.count} runners, minDistance ${minDistance} m, taxi ${level === 1 ? '-z' : '+z'}\n`);

  let field = start(level);
  const runner = chooseRunner(field, level);
  report(`  runner #${runner.id} waits at x ${runner.x.toFixed(1)}, z ${runner.z.toFixed(1)} (the taxi's line there: x ${runner.aim.toFixed(1)})`);

  const standing = drive(level, runner, field, { speed: 0.01 });
  void standing;

  // 20 and 28 m/s straight
  for (const speed of [20, 28]) {
    field = start(level);
    const o = drive(level, runner, field, { speed });
    describe(`straight at ${speed} m/s`, o);
    if (speed * (Math.abs(runner.x - runner.aim) / RUNNER.speed) < minDistance) {
      // the runner starts at the minimum, earlier than its lead time: across the line before the taxi
      expect(o.hit === null, `a straight line at ${speed} m/s misses (it started ${minDistance} m out, before its lead time)`);
      continue;
    }
    expect(o.hit !== null, `hits the runner at ${speed} m/s`);
    expect(o.hit && o.hit.speedAfter < o.hit.speedBefore, 'the taxi slows');
    if (level === 1) expect(o.hit && o.hit.pointsAfter === o.hit.pointsBefore - 50, '-50 points');
    else expect(o.hit && o.hit.pointsAfter === null, 'no points on Level 3');
    expect(o.done && o.done.scale === 0, 'the runner is gone');
  }

  // does the pursuit count the hit as a stumble? (28 and 31 m/s; 30% is the old loss)
  for (const speed of [28, 31]) {
    for (const loss of [null, 0.3]) {
      const realApplyHit = vehicle.applyHit;
      if (loss !== null) vehicle.applyHit = (hit) => realApplyHit.call(vehicle, { ...hit, speedLoss: loss });
      field = start(level);
      lm.pursuit.sinceStumble = Infinity;
      lm.pursuit.clock = 0;
      lm.pursuit.sampleCount = 0;
      const o = drive(level, runner, field, { speed, track: true });
      vehicle.applyHit = realApplyHit;
      const drop = o.hit ? o.hit.speedBefore - o.hit.speedAfter : NaN;
      const limit = lm.pursuit.config.stumbleSpeedDrop;
      report(`    hit at ${speed} m/s, ${loss === null ? 'speedLoss 0.25 (now)' : 'speedLoss 0.3 (before)'}: drop ${drop.toFixed(2)} m/s (a stumble is more than ${limit}), pursuit saw a stumble: ${o.stumbled}`);
      expect(o.hit !== null, 'hit');
      expect(o.stumbled === (loss !== null), loss === null ? 'no stumble with the 25% loss' : 'a stumble with the old 30% loss');
    }
  }

  // brake after it starts
  field = start(level);
  describe('28 m/s, brakes when the runner starts', drive(level, runner, field, { speed: 28, mode: 'brake' }));
  field = start(level);
  const braked = drive(level, runner, field, { speed: 28, mode: 'brake' });
  expect(braked.start !== null && braked.hit === null, 'braking after it starts misses it');
  expect(braked.done !== null && braked.done.scale === 0, 'the runner is gone after crossing');

  // sideways
  for (const speed of [20, 28]) {
    for (const offset of [-3, -2.5, -2, -1, 1, 2, 2.5, 3]) {
      field = start(level);
      describe(`${speed} m/s, ${offset > 0 ? '+' : ''}${offset} m off the line`, drive(level, runner, field, { speed, offset }));
    }
  }

  // crawling
  field = start(level);
  const crawl = drive(level, runner, field, { speed: 8 });
  describe('crawling at 8 m/s', crawl);
  expect(crawl.start !== null && Math.abs(crawl.start.dz - minDistance) < 1, `still started at ${minDistance} m`);
  expect(crawl.hit === null, 'no hit');
  expect(crawl.done !== null && crawl.done.frame < crawl.arrival.frame, 'across (removed) before the taxi arrives');

  // reload
  field = start(level);
  const first = drive(level, runner, field, { speed: 28 });
  const handled = [];
  for (let k = 0; k < field.runnerCount; k++) handled.push(field.runnerStateOf(k));
  report(`    after a hit: runner states ${handled.join(' ')} (0 waiting, 1 crossing, 2 done), hits ${field.hits}`);
  expect(first.hit !== null, 'hit before the reload');

  lm.reset();
  lm.skipCountdown();
  lm.rivals.launched = false;
  let restored = true;
  for (let k = 0; k < field.runnerCount; k++) {
    const id = field.runnerId(k);
    if (field.runnerStateOf(k) !== 0 || field.speedOf(id) !== 0 || field.scaleOf(id) !== 1 || field.isHit(id)) restored = false;
  }
  expect(restored && field.hits === 0, 'lm.reset(): every runner waiting at the kerb again (state, speed 0, scale 1, no hit)');
  simTime = 0;
  const again = drive(level, runner, field, { speed: 28 });
  describe('after lm.reset(), straight at 28 m/s', again);
  expect(again.hit !== null, 'the same runner hits again after the reload');

  const fresh = start(level);
  let allWaiting = fresh.runnerCount === LEVELS[level].runners.count;
  for (let k = 0; k < fresh.runnerCount; k++) if (fresh.runnerStateOf(k) !== 0 || fresh.scaleOf(fresh.runnerId(k)) !== 1) allWaiting = false;
  expect(allWaiting && fresh !== field, 'load(): a new field with every runner waiting');
}

report(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
