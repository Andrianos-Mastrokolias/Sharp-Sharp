// Scripted taxi through pedestrians on Level 1 (analysis tool, not part of `npm test`).
//   node tests/tools/pedestrian-run.mjs
//
// The REAL VehicleController, taxi model, CargoSystem, LevelManager and Level 1
// environment, headless. The taxi drives down the sidewalk at full throttle into
//   1. a standing person
//   2. a crosser (someone walking to and fro along the zebra)
// and the script reports the taxi's speed and the points just before and after, that
// each person is hit only once (a second pass over the same place), and that a reload
// puts them back (they can be hit again). Only the person aimed at is on the street
// for each run, so nobody else is in the way. The rivals stay on their grid.

// Taxi.js tries to load a GLB with fetch: there is no network here
globalThis.Request = class { constructor(url) { this.url = url; } };
globalThis.fetch = () => Promise.reject(new Error('offline'));

import * as THREE from 'three';

const { createTaxi } = await import('../../src/vehicle/Taxi.js');
const { CargoSystem } = await import('../../src/vehicle/CargoSystem.js');
const { VehicleController } = await import('../../src/vehicle/VehicleController.js');
const { createBox } = await import('../../src/world/environments/helpers.js');
const { LevelManager } = await import('../../src/world/LevelManager.js');
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
const events = [];
const hits = [];
const lm = new LevelManager({
  scene, vehicle, taxi: t.taxi, collidables, potholes: [], materials: makeLibrary(),
  getHeadlightsEnabled: () => false,
  onScore: (e) => events.push(e),
  onPedestrianHit: (e) => hits.push(e)
});

vehicle.setLevel(1);

function start() {
  lm.load(1);
  lm.skipCountdown();
  lm.rivals.launched = false;                                // the rivals stay on the grid
  vehicle.setEnabled(true);
  const field = lm.environment.pedestrians;
  field.clock = () => simTime;                               // the sim's time, so it is repeatable
  return field;
}

function others(field, keep) {
  for (let id = 0; id < field.count; id++) field.setActive(id, id === keep);
}

function pick(field, wantMoving) {
  const out = { x: 0, z: 0, sign: 1 };
  for (let id = 0; id < field.count; id++) {
    field.positionOf(id, out, simTime);
    const moving = field.speedOf(id) > 0;
    if (moving === wantMoving && out.z < -90 && out.z > -250 && Math.abs(out.x) > 11.5) return { id, x: out.x, z: out.z };
  }
  throw new Error('no such person');
}

// Full throttle along x = x0 from 80 m up the road, until the hit (or 400 frames)
function drive(field, x0, z0, speed0) {
  t.taxi.position.set(x0, 0, z0 + 80);
  t.taxi.rotation.set(0, 0, 0);
  vehicle.speed = speed0;
  const keys = { KeyW: true };
  const before = { points: lm.getState().score.points, hits: hits.length };
  const out = { speedBefore: null, speedAfter: null, pointsBefore: null, pointsAfter: null, frame: null, z: null, puffs: 0 };

  for (let frame = 0; frame < 400; frame++) {
    vehicle.update(DT, keys);
    simTime += DT;

    const speedBefore = vehicle.getSpeed();
    const pointsBefore = lm.getState().score.points;
    lm.update(DT, simTime);

    if (hits.length > before.hits && out.frame === null) {
      out.frame = frame;
      out.speedBefore = speedBefore;
      out.speedAfter = vehicle.getSpeed();
      out.pointsBefore = pointsBefore;
      out.pointsAfter = lm.getState().score.points;
      out.z = t.taxi.position.z;
      out.puffs = field.object.visible;
    }

    if (out.frame !== null && frame > out.frame + 40) break;
  }

  out.hits = hits.length - before.hits;
  out.finalSpeed = vehicle.getSpeed();
  return out;
}

function describe(label, who, r) {
  report(`  ${label}: person #${who.id} at x ${who.x.toFixed(1)}, z ${who.z.toFixed(1)}`);
  if (r.frame === null) { report('    NOT HIT'); return; }
  report(`    hit at z ${r.z.toFixed(1)}: speed ${r.speedBefore.toFixed(2)} -> ${r.speedAfter.toFixed(2)} m/s (${(100 * (1 - r.speedAfter / r.speedBefore)).toFixed(0)}% lost); points ${r.pointsBefore} -> ${r.pointsAfter}; dust drawn: ${r.puffs}`);
  report(`    hits during the run: ${r.hits}; speed 40 frames later ${r.finalSpeed.toFixed(2)} m/s`);
}

report('Level 1 pedestrian hits, full throttle down the sidewalk\n');

let field = start();
report(`people on the street: ${field.count}; rank race over the line gives the 300 once; score now ${lm.getState().score.points}`);

// ---- 1. a standing person
const standing = pick(field, false);
others(field, standing.id);
const standingRun = drive(field, standing.x, standing.z, 12);
describe('standing person', standing, standingRun);

// the same place again: nobody there any more
const again = drive(field, standing.x, standing.z, 12);
report(`    second pass over the same place: hits ${again.hits}, points still ${lm.getState().score.points}, person #${standing.id} hit flag ${field.isHit(standing.id)}`);

// ---- 2. a crosser
const crosser = pick(field, true);
others(field, crosser.id);
const crosserRun = drive(field, crosser.x, crosser.z, 12);
describe('crosser (walks to and fro)', crosser, crosserRun);
const crosserAgain = drive(field, crosser.x, crosser.z, 12);
report(`    second pass: hits ${crosserAgain.hits}`);

report(`\nbefore the reload: hits counted ${field.hits}, pedestriansHit ${lm.getState().score.pedestriansHit}, points ${lm.getState().score.points}`);

// ---- 3. a reload
field = start();
simTime = 0;
field.clock = () => simTime;
report(`after load(1): a new field with ${field.count} people, hits ${field.hits}, pedestriansHit ${lm.getState().score.pedestriansHit}, points ${lm.getState().score.points}`);
report(`  person #${standing.id} hit flag ${field.isHit(standing.id)}, person #${crosser.id} hit flag ${field.isHit(crosser.id)}`);

others(field, standing.id);
const reloaded = drive(field, standing.x, standing.z, 12);
describe('the same standing person after the reload', standing, reloaded);

// reset() without a reload (LevelManager.reset)
lm.reset();
lm.skipCountdown();
lm.rivals.launched = false;
report(`after lm.reset(): hits ${field.hits}, person #${standing.id} hit flag ${field.isHit(standing.id)}`);

process.exit(0);
