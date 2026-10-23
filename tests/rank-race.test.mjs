// Level 1 rank race test: node tests/rank-race.test.mjs
// The start grid, the countdown, the points (beaten rivals, first over the exit
// line), releasing the rivals, the police head start, and what a retry or a
// level switch clears. Written to hold whether or not a rival that starts level
// with or behind the taxi can be beaten without first passing it (the
// RivalTaxis seenBehind rule), so the beaten tests start from a taxi behind
// every rival and then pass them all.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import { buildEnvironment } from '../src/world/environments/index.js';
import { makeLibrary } from './tools/fake-library.mjs';

const DT = 1 / 60;
const L1 = LEVELS[1];
const RACE = L1.race;

// The taxi's and a rival minibus's real collision boxes (VehicleController, createTrafficCar)
const TAXI_HALF = { x: 1.35, z: 2.3 };
const RIVAL_SIZE = { x: 1.97, z: 5.3 };

function make() {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  const collidables = [];
  const events = [];
  let speed = 0;

  const vehicle = {
    settings: { maxForwardSpeed: 28 },
    cargoSystem: { getState: () => ({ remaining: 5, total: 5 }) },
    localTaxiCollisionBox: new THREE.Box3(new THREE.Vector3(-1.35, 0, -2.3), new THREE.Vector3(1.35, 2.8, 2.3)),
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(spawn) { taxi.position.set(spawn.x, 0, spawn.z); speed = 0; },
    getSpeed: () => speed, getHighSpeedTime: () => 0, getLevel2Pressure: () => 0
  };

  const lm = new LevelManager({
    scene, vehicle, taxi, collidables, potholes: [],
    getHeadlightsEnabled: () => true,
    onScore: (e) => events.push(e)
  });

  return { scene, taxi, collidables, events, lm };
}

function step(lm, seconds) {
  for (let t = 0; t < seconds; t += DT) lm.update(DT, t);
}

// Beaten needs the taxi to have been behind a rival and then well ahead of it
// (the rule may change, this is true under both): start behind everyone, then jump ahead
function beatAll(e) {
  e.taxi.position.set(0, 0, 195);
  step(e.lm, 0.2);
  e.taxi.position.set(0, 0, 100);
  step(e.lm, 0.2);
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---- The grid ---------------------------------------------------------------

test('grid: 8 rivals + the taxi in the middle, no overlaps at the real box sizes, on the road, clear of the rank', () => {
  assert.equal(RACE.grid.length, 8);
  assert.deepEqual(L1.spawn, { x: 0, z: 170, heading: 0 });

  // Boxes (centre, half sizes) of every car: the taxi in the middle cell, then the rivals
  const cars = [
    { name: 'taxi', x: L1.spawn.x, z: L1.spawn.z, hx: TAXI_HALF.x, hz: TAXI_HALF.z },
    ...RACE.grid.map((g, i) => ({ name: `rival ${i}`, x: g.x, z: g.z, hx: RIVAL_SIZE.x / 2, hz: RIVAL_SIZE.z / 2 }))
  ];

  let minGap = Infinity;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const gapX = Math.abs(cars[i].x - cars[j].x) - cars[i].hx - cars[j].hx;
      const gapZ = Math.abs(cars[i].z - cars[j].z) - cars[i].hz - cars[j].hz;
      const gap = Math.max(gapX, gapZ);          // boxes are apart if either axis is
      minGap = Math.min(minGap, gap);
      assert.ok(gap >= 1, `${cars[i].name} and ${cars[j].name} are ${gap.toFixed(2)} m apart`);
    }
  }

  // The wide grid: columns 6 m apart and rows 12 m apart, so with the real sizes
  // the taxi is 3.67 m clear of the cars beside it and 7.05 m of those in its column
  assert.deepEqual([...new Set(RACE.grid.map((g) => g.x))].sort((a, b) => a - b), [-6, 0, 6]);
  assert.deepEqual([...new Set(RACE.grid.map((g) => g.z))].sort((a, b) => a - b), [158, 170, 182]);
  const sideBySide = (a, b) => Math.abs(a.x - b.x) - a.hx - b.hx;
  const nose2tail = (a, b) => Math.abs(a.z - b.z) - a.hz - b.hz;
  const [taxiCar, ...rivalCars] = cars;
  const beside = rivalCars.filter((c) => c.z === taxiCar.z);
  const inColumn = rivalCars.filter((c) => c.x === taxiCar.x);
  assert.equal(beside.length, 2);
  assert.equal(inColumn.length, 2);
  beside.forEach((c) => assert.ok(sideBySide(taxiCar, c) >= 3.6, `${c.name} is ${sideBySide(taxiCar, c).toFixed(2)} m beside the taxi`));
  inColumn.forEach((c) => assert.ok(nose2tail(taxiCar, c) >= 7, `${c.name} is ${nose2tail(taxiCar, c).toFixed(2)} m along the taxi's column`));
  for (let i = 0; i < rivalCars.length; i++) {
    for (let j = i + 1; j < rivalCars.length; j++) {
      if (rivalCars[i].z === rivalCars[j].z) assert.ok(sideBySide(rivalCars[i], rivalCars[j]) >= 4, 'rivals in a row are 4 m clear');
      if (rivalCars[i].x === rivalCars[j].x) assert.ok(nose2tail(rivalCars[i], rivalCars[j]) >= 6.5, 'rivals in a column are 6.5 m clear');
    }
  }

  // The outermost rival edge is at |x| 6.99: inside the road and short of the kerb zone (|x| 7.2)
  const outermost = Math.max(...rivalCars.map((c) => Math.abs(c.x) + c.hx));
  assert.ok(outermost <= 7 && outermost > 6.9, `outermost edge ${outermost}`);
  assert.ok(outermost < 7.2 && outermost < RACE.road.halfWidth - 2, 'clear of the kerb zone');

  // The taxi is in the middle of the bunch, in x and in z
  const xs = RACE.grid.map((g) => g.x);
  const zs = RACE.grid.map((g) => g.z);
  assert.ok(Math.min(...xs) < L1.spawn.x && Math.max(...xs) > L1.spawn.x, 'taxi between the columns');
  assert.ok(Math.min(...zs) < L1.spawn.z && Math.max(...zs) > L1.spawn.z, 'taxi between the rows');

  // On the road (x +-9 less half the car) and the taxi clear of the Level 1 kerb zone (|x| > 7.2)
  for (const car of cars) {
    assert.ok(Math.abs(car.x) + car.hx <= RACE.road.halfWidth - 1, `${car.name} within the road`);
  }

  // The rivals' own rule (RivalTaxiSystem.blocked: gap 0.55 and a 1.65 x 2.65 taxi footprint) leaves nobody blocked
  for (const g of RACE.grid) {
    assert.ok(Math.abs(g.x - L1.spawn.x) >= RIVAL_SIZE.x / 2 + 1.65 + 0.55 || Math.abs(g.z - L1.spawn.z) >= RIVAL_SIZE.z / 2 + 2.65 + 0.55, 'a rival starts blocked by the taxi');
  }

  // None of the rank's solid scenery is inside a grid car's box (grown by 1 m)
  const env = buildEnvironment(1, { materials: makeLibrary() });
  env.group.updateMatrixWorld(true);
  const solid = env.collidables.map((m) => new THREE.Box3().setFromObject(m));
  for (const car of cars) {
    const carBox = new THREE.Box3(
      new THREE.Vector3(car.x - car.hx - 1, 0, car.z - car.hz - 1),
      new THREE.Vector3(car.x + car.hx + 1, 3, car.z + car.hz + 1)
    );
    solid.forEach((box, i) => assert.ok(!box.intersectsBox(carBox), `${car.name} is inside rank scenery ${i}`));
  }
  env.dispose();

  console.log(`  grid: closest pair ${minGap.toFixed(2)} m apart`);
});

test('grid: all four personalities, top speeds 16..24 m/s, every rival one childless collidable Mesh at its cell', () => {
  const personalities = new Set(RACE.grid.map((g) => g.personality));
  assert.deepEqual([...personalities].sort(), ['brake-checker', 'cutter', 'racer', 'weaver']);
  assert.ok(RACE.grid.every((g) => g.topSpeed >= 16 && g.topSpeed <= 24));

  const e = make();
  e.lm.load(1);
  const meshes = e.lm.rivals.rivals.map((r) => r.mesh);
  assert.equal(meshes.length, 8);

  meshes.forEach((mesh, i) => {
    assert.ok(mesh.isMesh && mesh.children.length === 0, 'childless Mesh');
    assert.ok(e.collidables.includes(mesh), 'registered as a collidable');
    assert.deepEqual([mesh.position.x, mesh.position.z], [RACE.grid[i].x, RACE.grid[i].z]);
  });
});

// ---- The countdown ----------------------------------------------------------

test('countdown: 3 s, the taxi (inputLocked), rivals, traffic, pursuit and the clock are held; then GO', () => {
  const e = make();
  e.lm.load(1);

  let s = e.lm.getState();
  assert.equal(s.race.phase, 'countdown');
  assert.equal(s.race.countdown, 3);
  assert.equal(e.lm.inputLocked, true);

  const rivalsBefore = e.lm.rivals.rivals.map((r) => [r.x, r.z]);
  const trafficBefore = e.lm.traffic.cars.map((c) => c.mesh.position.z);

  step(e.lm, 1.5);
  s = e.lm.getState();
  assert.equal(s.race.phase, 'countdown');
  assert.ok(Math.abs(s.race.countdown - 1.5) < 2 * DT, `countdown ${s.race.countdown}`);
  assert.equal(e.lm.inputLocked, true);
  assert.equal(s.time, 0, 'the clock is held');
  assert.deepEqual(e.lm.rivals.rivals.map((r) => [r.x, r.z]), rivalsBefore, 'rivals held');
  assert.deepEqual(e.lm.traffic.cars.map((c) => c.mesh.position.z), trafficBefore, 'traffic held');

  // the pursuit does not trigger either, even with the taxi past its trigger
  e.taxi.position.set(0, 0, L1.spawn.z + 0.56 * (L1.destination.z - L1.spawn.z));
  step(e.lm, 1.0);
  assert.equal(e.lm.pursuit.state, 'idle');
  e.taxi.position.set(0, 0, L1.spawn.z);

  step(e.lm, 0.6);
  s = e.lm.getState();
  assert.equal(s.race.phase, 'racing');
  assert.equal(s.race.countdown, 0);
  assert.equal(e.lm.inputLocked, false);

  step(e.lm, 1);
  assert.ok(e.lm.rivals.rivals.some((r, i) => r.z < rivalsBefore[i][1] - 1), 'the rivals launched');
  assert.ok(e.lm.getState().time > 0.9 && e.lm.getState().time < 1.2, 'the clock starts at GO');
});

test('countdown: skipCountdown() ends it at once; levels 2 and 3 have none', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  assert.equal(e.lm.getState().race.phase, 'racing');
  assert.equal(e.lm.inputLocked, false);

  for (const level of [2, 3]) {
    e.lm.load(level);
    const s = e.lm.getState();
    assert.equal(e.lm.inputLocked, false);
    assert.deepEqual(s.race, { phase: 'none', countdown: 0 });
    assert.equal(s.score, null);
    assert.equal(e.lm.rivals.rivals.length, 0);
  }
});

// ---- Points -----------------------------------------------------------------

test('points: +100 once for each rival beaten, onScore for each, state in getState()', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();

  beatAll(e);
  step(e.lm, 1);                             // and nothing more is counted

  const s = e.lm.getState().score;
  assert.equal(s.beaten, 8);
  assert.equal(s.rivalsTotal, 8);
  assert.equal(s.points, 800);
  assert.equal(s.pedestriansHit, 0);

  const beaten = e.events.filter((ev) => ev.reason === 'beaten');
  assert.equal(beaten.length, 8);
  assert.ok(beaten.every((ev) => ev.delta === 100));
  assert.deepEqual(beaten.map((ev) => ev.points), [100, 200, 300, 400, 500, 600, 700, 800]);
});

test('points: +300 for the taxi crossing the exit line first, once, and the phase moves to cbd', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;               // the rivals stay put: teleporting the taxi past them would beat them
  step(e.lm, 0.5);
  assert.equal(e.lm.getState().race.phase, 'racing');
  assert.equal(e.lm.getState().score.firstOut, null);

  e.taxi.position.set(0, 0, RACE.exitZ + 1);
  step(e.lm, 0.1);
  assert.equal(e.lm.getState().score.firstOut, null);

  e.taxi.position.set(0, 0, RACE.exitZ - 0.5);
  step(e.lm, 0.1);
  const s = e.lm.getState();
  assert.equal(s.score.firstOut, 'player');
  assert.equal(s.score.points, 300);
  assert.equal(s.race.phase, 'cbd');

  // crossing again, or going on, adds nothing
  e.taxi.position.set(0, 0, RACE.exitZ + 5);
  step(e.lm, 0.1);
  e.taxi.position.set(0, 0, RACE.exitZ - 5);
  step(e.lm, 0.1);
  assert.equal(e.lm.getState().score.points, 300);
  assert.deepEqual(e.events, [{ delta: 300, reason: 'firstOut', points: 300 }]);
});

test('points: a rival over the exit line first takes the bonus (and a tie in one frame goes to the rival)', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;
  step(e.lm, 0.1);

  e.lm.rivals.rivals[3].z = RACE.exitZ - 1;           // a rival is over the line
  step(e.lm, DT);
  assert.equal(e.lm.getState().score.firstOut, 'rival');

  e.taxi.position.set(0, 0, RACE.exitZ - 3);
  step(e.lm, 0.1);
  const s = e.lm.getState();
  assert.equal(s.score.firstOut, 'rival');
  assert.equal(s.score.points, 0, 'no bonus');
  assert.equal(s.race.phase, 'cbd');

  // same frame: rival and taxi both over the line
  const f = make();
  f.lm.load(1);
  f.lm.skipCountdown();
  f.lm.rivals.launched = false;
  step(f.lm, 0.1);
  f.lm.rivals.rivals[0].z = RACE.exitZ - 0.2;
  f.taxi.position.set(0, 0, RACE.exitZ - 0.2);
  f.lm.update(DT, 0);
  assert.equal(f.lm.getState().score.firstOut, 'rival');
  assert.equal(f.lm.getState().score.points, 0);
});

test('points: the pedestrian hook takes 50 off (not called by anything yet)', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.registerPedestrianHit();
  e.lm.registerPedestrianHit();
  const s = e.lm.getState().score;
  assert.equal(s.pedestriansHit, 2);
  assert.equal(s.points, -100);
  assert.deepEqual(e.events.map((ev) => [ev.delta, ev.reason, ev.points]), [[-50, 'pedestrian', -50], [-50, 'pedestrian', -100]]);
});

// ---- Releasing the rivals ---------------------------------------------------

test('release: past z -140 a rival goes once it is 25 m behind the taxi; all go when the taxi passes z -250', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  const rivals = e.lm.rivals.rivals;
  const meshes = rivals.map((r) => r.mesh);

  // before -140 nobody goes, however far behind
  e.taxi.position.set(0, 0, -100);
  rivals.forEach((r) => { r.z = 150; });
  e.lm.rivals.launched = false;                       // hold them where they are for this test
  step(e.lm, 0.2);
  assert.ok(rivals.every((r) => !r.released), 'nobody released before z -140');

  // taxi at -141: rival 0 is 30 m behind, rival 1 is 10 m behind, rival 2 is ahead
  e.taxi.position.set(0, 0, -141);
  rivals[0].z = -111;
  rivals[1].z = -131;
  rivals[2].z = -160;
  rivals.slice(3).forEach((r) => { r.z = -141 + 24.9; });
  step(e.lm, DT);
  assert.equal(rivals[0].released, true, '30 m behind: released');
  assert.equal(rivals[1].released, false, '10 m behind: stays');
  assert.equal(rivals[2].released, false, 'ahead: stays');
  assert.ok(rivals.slice(3).every((r) => !r.released), '24.9 m behind: stays');
  assert.ok(!e.collidables.includes(meshes[0]) && e.collidables.includes(meshes[1]), 'released: out of the collidables');
  assert.equal(meshes[0].visible, false);

  // a rival that drops 25 m back is released as soon as it does
  rivals[1].z = -141 + 25;
  step(e.lm, DT);
  assert.equal(rivals[1].released, true);
  assert.equal(rivals[2].released, false);

  // past z -250 the rest go, whatever their place
  e.taxi.position.set(0, 0, -251);
  step(e.lm, DT);
  assert.ok(rivals.every((r) => r.released), 'all released past z -250');
  assert.ok(meshes.every((m) => !e.collidables.includes(m) && !m.visible));
});

// ---- The police head start --------------------------------------------------

// The taxi on its way to the trigger, with `beaten` rivals beaten before the exit line
function spawnPolice(beaten, { afterRelease = false } = {}) {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();

  if (beaten === 'all') {
    beatAll(e);
  } else if (beaten > 0) {
    // beat the first `beaten`: the taxi starts behind everyone, then is 90 m
    // ahead of those and 60 m behind the rest
    e.taxi.position.set(0, 0, 195);
    step(e.lm, 0.2);
    e.lm.rivals.rivals.forEach((r, i) => { r.z = i < beaten ? 190 : 40; r.x = 0; });
    e.taxi.position.set(0, 0, 100);
    step(e.lm, DT);
  }

  // the rivals stay put from here, so the count is the one arranged above
  e.lm.rivals.launched = false;

  const trigger = L1.spawn.z + L1.pursuit.triggerProgress * (L1.destination.z - L1.spawn.z);
  e.taxi.position.set(0, 0, trigger + 5);
  step(e.lm, 0.1);
  assert.equal(e.lm.pursuit.state, 'idle', 'not yet');

  if (afterRelease) {
    e.taxi.position.set(0, 0, trigger + 5);
  }

  e.taxi.position.set(0, 0, trigger - 1);
  step(e.lm, DT * 2);
  assert.equal(e.lm.pursuit.spawned, true);
  return e;
}

test('head start: 25 m + 10 m per rival beaten, read when the police spawn, capped at 105 m', () => {
  const rows = [];
  for (const [beaten, expected] of [[0, 25], [1, 35], [3, 55], ['all', 105]]) {
    const e = spawnPolice(beaten);
    const count = e.lm.getState().score.beaten;
    const behind = e.lm.pursuit.z - e.taxi.position.z;
    assert.equal(e.lm.pursuit.config.spawnDistance, expected, `${beaten} beaten`);
    assert.ok(Math.abs(behind - expected) < 2, `${beaten} beaten (${count}): police ${behind.toFixed(1)} m behind, expected ${expected}`);
    assert.equal(e.lm.getState().race.phase, 'chase');
    rows.push(`${count} beaten -> ${expected} m`);
  }
  console.log(`  head start: ${rows.join(', ')}`);

  // the cap, whatever the count
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.score.beaten = 40;
  e.lm.applyHeadStart();
  assert.equal(e.lm.pursuit.config.spawnDistance, 105);
});

test('head start: a rival beaten after z -140 (not yet released) still counts, at the moment the police spawn', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;               // nobody is beaten until the step below
  step(e.lm, 0.1);

  // taxi past -140; rivals 0 and 1 are 10 m behind it, already seen ahead of the taxi once
  // (the others are far ahead, beyond the police trigger, so the taxi does not pass them on the way to it)
  e.taxi.position.set(0, 0, -200);
  const rivals = e.lm.rivals.rivals;
  rivals.forEach((r) => { r.z = -600; r.x = 0; });
  rivals[0].z = -190;
  rivals[0].seenBehind = true;
  rivals[1].z = -190;
  rivals[1].x = 5;
  rivals[1].seenBehind = true;
  e.lm.rivals.launched = true;
  step(e.lm, DT);
  e.lm.rivals.launched = false;
  assert.equal(e.lm.getState().score.beaten, 2, 'beaten after the release line');
  assert.equal(e.lm.getState().score.points, 200);
  assert.equal(e.lm.pursuit.config.spawnDistance, 25 + 20);

  const trigger = L1.spawn.z + L1.pursuit.triggerProgress * (L1.destination.z - L1.spawn.z);
  e.taxi.position.set(0, 0, trigger - 1);
  step(e.lm, DT * 2);
  assert.equal(e.lm.pursuit.spawned, true);
  const behind = e.lm.pursuit.z - e.taxi.position.z;
  assert.ok(Math.abs(behind - 45) < 2, `police 45 m behind (measured ${behind.toFixed(2)} m, config spawnDistance ${e.lm.pursuit.config.spawnDistance}, beaten ${e.lm.getState().score.beaten})`);
});

test('head start: back to 25 m after a retry (load) and after reset()', () => {
  const e = spawnPolice('all');
  assert.equal(e.lm.pursuit.config.spawnDistance, 105);
  e.lm.reset();
  assert.equal(e.lm.pursuit.config.spawnDistance, 25);

  const f = spawnPolice('all');
  f.lm.load(1);
  assert.equal(f.lm.pursuit.config.spawnDistance, 25);
});

// ---- Reset, retry and level switches ------------------------------------------

test('retry / level switch: points, beaten, firstOut and the race are cleared; rivals are whole again; nothing leaks', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  const base = { children: e.scene.children.length, group: e.lm.group.children.length, collidables: e.collidables.length };

  beatAll(e);
  e.taxi.position.set(0, 0, RACE.exitZ - 5);
  step(e.lm, 0.1);
  e.taxi.position.set(0, 0, -300);
  step(e.lm, 0.2);
  assert.ok(e.lm.getState().score.points >= 800);
  assert.ok(e.lm.rivals.rivals.some((r) => r.released));

  for (const again of [() => e.lm.reset(), () => e.lm.load(1)]) {
    again();
    const s = e.lm.getState();
    assert.deepEqual(s.score, { points: 0, beaten: 0, rivalsTotal: 8, firstOut: null, pedestriansHit: 0 });
    assert.deepEqual(s.race, { phase: 'countdown', countdown: 3 });
    assert.equal(e.lm.inputLocked, true);
    assert.ok(e.lm.rivals.rivals.every((r) => !r.released && !r.beaten && r.mesh.visible && e.collidables.includes(r.mesh)));
    assert.deepEqual(e.lm.rivals.rivals.map((r) => [r.x, r.z]), RACE.grid.map((g) => [g.x, g.z]));
    assert.equal(e.lm.pursuit.state, 'idle');
  }

  // Level 1 -> 2 -> 3 -> 1: rivals gone and back, no duplicates
  for (const level of [2, 3, 1]) {
    e.lm.load(level);
    const rivalMeshes = [];
    e.scene.traverse((o) => { if (o.userData.rival) rivalMeshes.push(o); });
    assert.equal(rivalMeshes.length, level === 1 ? 8 : 0, `level ${level}: rival meshes`);
    assert.equal(e.collidables.filter((m) => m.userData.rival).length, level === 1 ? 8 : 0);
  }
  e.lm.skipCountdown();
  assert.deepEqual({ children: e.scene.children.length, group: e.lm.group.children.length, collidables: e.collidables.length }, base);
});

test('events: onScore carries { delta, reason, points } and the same objects are not reused', () => {
  const e = make();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;
  e.taxi.position.set(0, 0, RACE.exitZ - 1);
  step(e.lm, 0.1);
  e.lm.registerPedestrianHit();
  assert.deepEqual(e.events, [
    { delta: 300, reason: 'firstOut', points: 300 },
    { delta: -50, reason: 'pedestrian', points: 250 }
  ]);
  assert.notEqual(e.events[0], e.events[1]);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS', name); }
  catch (err) { failed++; console.log('FAIL', name, '\n  ', err.message); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
