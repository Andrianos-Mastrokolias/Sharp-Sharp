// Scripted drivers through the Level 1 rank grid (analysis tool, not part of `npm test`).
//   node tests/tools/rank-run.mjs                        all three drivers
//   node tests/tools/rank-run.mjs free|straight|steer    one driver
//   TRAFFIC=0 node tests/tools/rank-run.mjs         traffic removed (see the note at the end)
//
// Runs the REAL VehicleController, taxi model, CargoSystem, LevelManager, RivalTaxiSystem
// and PursuitSystem headless (no scenery), calling vehicle.update() and levelManager.update()
// the way main.js does, with the countdown holding the keys. Both drivers hold the
// throttle the whole run:
//   free     : never steers, and there are no rivals: the fastest the taxi can reach
//              the exit line (what a clean launch would be worth)
//   straight : never steers (the taxi leaves the middle cell along x = 0)
//   steer    : aims at the middle of the widest gap between the rivals ahead (and between
//              them and the kerb zone, |x| 7), and re-aims every 0.2 s
//
// Each run goes on until the police spawn (z -325) or 60 s, and reports the points,
// the rivals beaten, who was first over the exit line, the time from GO to it, and the
// police head start at the moment they spawn.

// Taxi.js tries to load a GLB with fetch: there is no network here
globalThis.Request = class { constructor(url) { this.url = url; } };
globalThis.fetch = () => Promise.reject(new Error('offline'));

import * as THREE from 'three';

const { createTaxi } = await import('../../src/vehicle/Taxi.js');
const { CargoSystem } = await import('../../src/vehicle/CargoSystem.js');
const { VehicleController } = await import('../../src/vehicle/VehicleController.js');
const { createBox } = await import('../../src/world/environments/helpers.js');
const { LevelManager } = await import('../../src/world/LevelManager.js');

const report = console.log;
console.log = () => {};                                      // Taxi.js chatters

const DT = 1 / 60;
const NO_KEYS = Object.freeze({});
const TAXI_HALF = 1.35;
const MARGIN = Number(process.env.MARGIN ?? 0.4);               // room left beside a rival
const RETARGET = Number(process.env.RETARGET ?? 0.2);           // s between re-aims
const GAIN = Number(process.env.GAIN ?? 0.12);                  // wanted yaw per metre of x error
const KERB_LIMIT = 7;                                        // the taxi's centre stays inside |x| 7

function run(driver) {

  const scene = new THREE.Scene();
  const t = createTaxi(createBox);
  scene.add(t.taxi);

  const collidables = [];
  const cargo = new CargoSystem({ scene, chassis: t.chassis, taxi: t.taxi, cargoItems: t.cargoItems, gravity: -22 });

  let collisions = 0;
  const vehicle = new VehicleController({
    taxi: t.taxi, chassis: t.chassis, wheels: t.wheels, frontWheelPivots: t.frontWheelPivots,
    cargoSystem: cargo, collidableObjects: collidables, potholes: [],
    onCollision: () => { collisions++; }
  });

  let time = 0;
  const events = [];
  const lm = new LevelManager({
    scene, vehicle, taxi: t.taxi, collidables, potholes: [], getHeadlightsEnabled: () => false,
    onScore: (e) => events.push({ time, z: t.taxi.position.z, ...e })
  });

  vehicle.setLevel(1);
  lm.load(1);
  vehicle.setEnabled(true);

  // free: the rivals are taken off the grid (released: hidden and not solid)
  if (driver === 'free') for (const r of lm.rivals.rivals) lm.rivals.release(r.index);

  if (process.env.TRAFFIC === '0') {
    for (const car of lm.traffic.cars) { lm.setCollidableActive(car.mesh, false); car.mesh.visible = false; }
    lm.traffic.update = () => {};
  }

  // The widest gap between the rivals ahead (within 40 m) and the kerb zone
  function widestGap() {
    const z = t.taxi.position.z;
    const blocked = [];

    for (const r of lm.rivals.rivals) {
      const ahead = z - r.z;                               // driving -z
      if (!r.released && ahead > -6 && ahead < 40) {
        blocked.push([r.x - r.width / 2 - MARGIN - TAXI_HALF, r.x + r.width / 2 + MARGIN + TAXI_HALF]);
      }
    }

    blocked.sort((a, b) => a[0] - b[0]);

    // free intervals for the taxi's centre inside [-7, 7]
    let best = null;
    let from = -KERB_LIMIT;

    const consider = (lo, hi) => {
      if (hi - lo <= 0) return;
      const centre = (lo + hi) / 2;
      const score = (hi - lo) - 0.02 * Math.abs(centre - t.taxi.position.x);   // ties: the nearer one
      if (!best || score > best.score) best = { centre, score };
    };

    for (const [lo, hi] of blocked) {
      consider(from, Math.min(lo, KERB_LIMIT));
      from = Math.max(from, hi);
    }
    consider(from, KERB_LIMIT);

    return best ? best.centre : t.taxi.position.x;
  }

  const keys = {};
  let target = 0;
  let retarget = 0;
  let goTime = null;
  let exitTime = null;
  let police = null;
  let heldMax = 0;
  const phases = [];
  let lastPhase = null;
  const releasedAt = [];
  let stuckSince = null;
  let lastProgressZ = 170;
  let collisionsAtExit = null;
  let firstOutAt = null;
  const rivalExit = [];                                    // when each rival's centre first passes the exit line
  let firstHit = null;
  let hitsAfterGo = 0;

  for (let frame = 0; frame < 60 * 60; frame++) {

    time = frame * DT;

    if (lm.inputLocked) {
      heldMax = Math.max(heldMax, Math.abs(t.taxi.position.z - 170), Math.abs(vehicle.getSpeed()));
    }

    keys.KeyW = true;                                      // full throttle, the whole run
    keys.KeyA = keys.KeyD = false;

    if (driver === 'steer' && !lm.inputLocked) {
      retarget -= DT;

      if (retarget <= 0) {
        target = widestGap();
        retarget = RETARGET;
      }

      const wanted = -Math.max(-0.3, Math.min(0.3, (target - t.taxi.position.x) * GAIN));
      if (t.taxi.rotation.y < wanted - 0.02) keys.KeyA = true;
      else if (t.taxi.rotation.y > wanted + 0.02) keys.KeyD = true;
    }

    const before = collisions;
    vehicle.update(DT, lm.inputLocked ? NO_KEYS : keys);     // the two lines of main.js
    if (collisions > before && firstHit === null) firstHit = { time, z: t.taxi.position.z, x: t.taxi.position.x };
    lm.update(DT, time);

    const state = lm.getState();

    if (state.race.phase !== lastPhase) {
      lastPhase = state.race.phase;
      phases.push(`${lastPhase} ${time.toFixed(2)} s (z ${t.taxi.position.z.toFixed(0)})`);
      if (lastPhase === 'racing') goTime = time;
      if (lastPhase === 'cbd' && exitTime === null) { exitTime = time; collisionsAtExit = collisions; }
    }

    for (const r of lm.rivals.rivals) {
      if (rivalExit[r.index] === undefined && !r.released && r.z <= lm.config.race.exitZ) rivalExit[r.index] = time - (goTime ?? 0);
    }

    if (firstOutAt === null && state.score?.firstOut) firstOutAt = { who: state.score.firstOut, time, z: t.taxi.position.z };

    for (const r of lm.rivals.rivals) {
      if (r.released && !releasedAt[r.index]) {
        releasedAt[r.index] = `#${r.index} at z ${t.taxi.position.z.toFixed(0)} (${(r.z - t.taxi.position.z).toFixed(0)} m behind)`;
      }
    }

    if (police === null && lm.pursuit.spawned) {
      police = {
        time,
        z: t.taxi.position.z,
        configured: lm.pursuit.config.spawnDistance,
        measured: lm.pursuit.z - t.taxi.position.z,
        beaten: state.score.beaten
      };
    }

    // stuck: no 5 m of progress for 8 s
    if (lastProgressZ - t.taxi.position.z > 5) { lastProgressZ = t.taxi.position.z; stuckSince = null; }
    else if (stuckSince === null && !lm.inputLocked) stuckSince = time;

    if (police && time > police.time + 1) break;
    if (stuckSince !== null && time - stuckSince > 8) break;
    if (lm.status !== 'driving') break;
  }

  const s = lm.getState();

  return {
    driver, phases, heldMax, goTime, exitTime, collisions, collisionsAtExit, firstHit, firstOutAt, rivalExit, grid: lm.config.race.grid, events, police, releasedAt,
    stuck: stuckSince !== null && time - stuckSince > 8 ? { z: t.taxi.position.z, at: stuckSince } : null,
    cargo: cargo.getRemaining(),
    score: s.score,
    endZ: t.taxi.position.z,
    endTime: time
  };
}

const wanted = process.argv[2];
const drivers = wanted ? [wanted] : ['free', 'straight', 'steer'];

report(`Level 1 rank race, full throttle, traffic ${process.env.TRAFFIC === '0' ? 'removed' : 'on'}\n`);

for (const driver of drivers) {
  const r = run(driver);
  report(`== ${driver} driver`);
  report(`  countdown: taxi and speed held to ${r.heldMax.toFixed(3)} (m, m/s) for 3 s; GO at ${r.goTime?.toFixed(2)} s`);
  report(`  phases: ${r.phases.join(' | ')}`);
  report(`  time from GO to the exit line: ${r.exitTime === null ? 'never reached it' : (r.exitTime - r.goTime).toFixed(2) + ' s'}`);
  report(`  points ${r.score.points}, beaten ${r.score.beaten}/${r.score.rivalsTotal}, firstOut ${r.score.firstOut}` + (r.firstOutAt ? ` (decided at ${(r.firstOutAt.time - r.goTime).toFixed(2)} s after GO, taxi at z ${r.firstOutAt.z.toFixed(0)})` : ""));
  for (const e of r.events) report(`    t ${e.time.toFixed(2)} s, z ${e.z.toFixed(1)}: ${e.delta > 0 ? '+' : ''}${e.delta} ${e.reason} -> ${e.points}`);
  {
    const times = r.rivalExit.map((time, i) => ({ time, i })).filter((x) => x.time !== undefined).sort((a, b) => a.time - b.time);
    const text = times.map((x) => `#${x.i} ${r.grid[x.i].personality} ${r.grid[x.i].topSpeed} m/s ${x.time.toFixed(2)}`).join(', ');
    report(`  rivals over the exit line (s after GO): ${text || 'none'}`);
  }
  report(`  collisions (frames in contact) ${r.collisions}, ${r.collisionsAtExit === null ? "none counted at the exit line" : r.collisionsAtExit + " of them before the exit line"}; first at ${r.firstHit ? r.firstHit.time.toFixed(2) + " s, z " + r.firstHit.z.toFixed(1) + ", x " + r.firstHit.x.toFixed(1) : "never"}; cargo left ${r.cargo} of 5`);
  report(`  rivals released: ${r.releasedAt.filter(Boolean).join('; ') || 'none'}`);
  report(`  police: ${r.police ? `spawned at ${r.police.time.toFixed(1)} s, z ${r.police.z.toFixed(0)}, head start ${r.police.configured} m (measured ${r.police.measured.toFixed(1)} m) with ${r.police.beaten} beaten (expected ${Math.min(105, 25 + 10 * r.police.beaten)} m)` : 'never spawned'}`);
  if (r.stuck) report(`  STUCK from ${r.stuck.at.toFixed(1)} s at z ${r.stuck.z.toFixed(1)}: no 5 m of progress for 8 s`);
  report('');
}

report('Note: with traffic on, a driver that holds the throttle can pin itself against a traffic car that has');
report('stopped for contact (the lane waits while the taxi touches it), so a run can end there; TRAFFIC=0');
report('removes the cars to show the rank race itself.');

process.exit(0);
