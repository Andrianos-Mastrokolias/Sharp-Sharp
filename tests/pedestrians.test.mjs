// Pedestrian hits test: node tests/pedestrians.test.mjs
// The CPU copy of the walk against the shader's own GLSL, the hit rule (the box,
// the speed), one hit per person, the cooldown, a reload restoring everyone, the
// API for people added later, the dust puffs, LevelManager's part (speed loss,
// points, callback, nothing on levels without people) and no allocation.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { PerformanceObserver } from 'node:perf_hooks';
import v8 from 'node:v8';
import vm from 'node:vm';
import {
  createPersonMaterial,
  personPath,
  personPosition,
  PERSON_PAUSE
} from '../src/world/environments/props.js';
import {
  createPedestrianField,
  HIT_COOLDOWN,
  HIT_MIN_SPEED,
  PERSON_RADIUS,
  routeXAt
} from '../src/world/environments/life.js';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import { makeLibrary } from './tools/fake-library.mjs';

const DT = 1 / 60;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// A stand-in for a chunk's InstancedMesh: the field only reads its attributes
function makeMesh(people) {
  const n = people.length;
  const aStart = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const aDir = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2);
  const aMotion = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  people.forEach((p, i) => {
    aStart.array.set([p.x, p.y ?? 0.2, p.z], i * 3);
    aDir.array.set([p.dx ?? 0, p.dz ?? 1], i * 2);
    aMotion.array.set([p.speed ?? 0, p.length ?? 0, p.offset ?? 0, p.scale ?? 1], i * 4);
  });
  return { count: n, geometry: { attributes: { aStart, aDir, aMotion } } };
}

function makeTaxi(x, z, yaw = 0, y = 0) {
  const taxi = new THREE.Object3D();
  taxi.position.set(x, y, z);
  taxi.rotation.y = yaw;
  return taxi;
}

const scaleOf = (mesh, i) => mesh.geometry.attributes.aMotion.array[i * 4 + 3];

// ---- The CPU copy of the walk against the shader's GLSL ------------------------

// The shader's path code (up to the swing), run as JavaScript: float -> let,
// mod(), max() supplied, aMotion an object, its two output lines left out
function shaderPath() {
  const material = createPersonMaterial();
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <color_vertex>\n#include <beginnormal_vertex>\n#include <begin_vertex>' };
  material.onBeforeCompile(shader);

  const source = shader.vertexShader;
  const pause = Number(/const float PERSON_PAUSE = ([\d.]+);/.exec(source)[1]);
  const block = source.slice(source.indexOf('float pSpeed'), source.indexOf('float pAngle'));
  assert.ok(block.includes('pT') && block.includes('gOffset'), 'extracted the shader path block');

  const js = block
    .split('\n')
    .filter((line) => !/^\s*(gOffset|gFwd) =/.test(line))
    .map((line) => line.replace(/^(\s*)float (\w+)/, '$1let $2'))
    .join('\n');

  const run = new Function('aMotion', 'uTime', 'PERSON_PAUSE', 'mod', 'max', `${js}\nreturn { pS, pSign };`);
  const mod = (x, y) => x - y * Math.floor(x / y);

  return {
    pause,
    at: (speed, length, offset, t) => run(
      { x: Math.fround(speed), y: Math.fround(length), z: Math.fround(offset), w: 1 },
      Math.fround(t), pause, mod, Math.max
    )
  };
}

test('CPU path matches the shader (its own GLSL, translated): walking out, the pause at the far end, back, the pause at the start, the wrap', () => {
  const shader = shaderPath();
  assert.equal(shader.pause, PERSON_PAUSE, 'the shader and the module pause for the same time');

  const people = [
    { speed: 1.2, length: 8, offset: 3.3 },
    { speed: 1.5, length: 5, offset: 100.7 },
    { speed: 1.0, length: 15, offset: 0 },
    { speed: 1.45, length: 9.3, offset: 54.21 },
    { speed: 0, length: 0, offset: 12 }                       // standing
  ];

  const out = { s: 0, sign: 1 };
  let compared = 0;
  let inPause = 0;

  for (const p of people) {
    const walk = p.length / Math.max(p.speed, 0.001);
    const cycle = 2 * (walk + PERSON_PAUSE);
    const edges = [0, walk, walk + PERSON_PAUSE, 2 * walk + PERSON_PAUSE];

    for (let t = 0; t < 400; t += 0.37) {
      const phase = ((t + p.offset) % cycle + cycle) % cycle;

      // a float32 clock may fall either side of a segment edge: stay clear of them
      if (p.speed > 0 && edges.some((edge) => Math.abs(phase - edge) < 0.02 || Math.abs(phase - cycle) < 0.02)) continue;

      const gpu = shader.at(p.speed, p.length, p.offset, t);
      personPath(out, p.speed, p.length, p.offset, t);

      assert.ok(Math.abs(out.s - gpu.pS) < 2e-3, `speed ${p.speed} t ${t}: CPU s ${out.s} vs shader ${gpu.pS}`);
      assert.equal(out.sign, gpu.pSign, `speed ${p.speed} t ${t}: facing`);
      compared++;

      if (p.speed > 0 && ((phase >= walk && phase < walk + PERSON_PAUSE) || phase >= 2 * walk + PERSON_PAUSE)) inPause++;
    }
  }

  assert.ok(compared > 800, `${compared} samples`);
  assert.ok(inPause > 100, `${inPause} of them in a pause at an end of the path`);

  // explicit: standing at the far end, and at the start after the return
  const walk = 8 / 1.2;
  personPath(out, 1.2, 8, 0, walk + 1);
  assert.deepEqual([out.s, out.sign], [8, 1]);
  assert.equal(shader.at(1.2, 8, 0, walk + 1).pS, 8);
  personPath(out, 1.2, 8, 0, 2 * walk + PERSON_PAUSE + 1);
  assert.deepEqual([out.s, out.sign], [0, -1]);
  assert.equal(shader.at(1.2, 8, 0, 2 * walk + PERSON_PAUSE + 1).pS, 0);
});

test('CPU position: start + dir * s, along the path and clamped to it', () => {
  const out = { x: 0, z: 0, sign: 1 };
  personPosition(out, 12, -100, 0, -1, 1.5, 6, 0, 2);          // walking -z at 1.5 m/s, 2 s
  assert.ok(Math.abs(out.x - 12) < 1e-9 && Math.abs(out.z - (-103)) < 1e-9);
  personPosition(out, 12, -100, 0, -1, 1.5, 6, 0, 5);          // at the far end (4 s walk, then a pause)
  assert.ok(Math.abs(out.z - (-106)) < 1e-9);
  personPosition(out, 12, -100, 0, -1, 0, 0, 0, 77);           // standing
  assert.deepEqual([out.x, out.z], [12, -100]);
});

// ---- The hit rule ----------------------------------------------------------------

function standing(x = 12, z = -100) {
  const mesh = makeMesh([{ x, z }]);
  const field = createPedestrianField({ clock: () => 0 });
  field.addMesh(mesh);
  return { mesh, field };
}

test('hit rule: inside the box grown by the radius is a hit, just outside is not, whichever way the taxi faces', () => {
  const reachX = field0().halfX + PERSON_RADIUS;                // 1.70
  const reachZ = field0().halfZ + PERSON_RADIUS;                // 2.65

  function field0() { return createPedestrianField(); }

  const cases = [
    // [yaw, offset of the person from the taxi in the world (dx, dz), expected]
    [0, [reachX - 0.01, 0], true],
    [0, [reachX + 0.01, 0], false],
    [0, [-(reachX - 0.01), 0], true],
    [0, [0, reachZ - 0.01], true],
    [0, [0, reachZ + 0.01], false],
    [0, [0, -(reachZ - 0.01)], true],
    [0, [reachX - 0.01, reachZ - 0.01], true],                  // a corner, inside both
    [0, [reachX + 0.01, reachZ - 0.01], false],
    // turned a quarter: the long side is along x now
    [Math.PI / 2, [reachZ - 0.01, 0], true],
    [Math.PI / 2, [reachZ + 0.01, 0], false],
    [Math.PI / 2, [0, reachX - 0.01], true],
    [Math.PI / 2, [0, reachX + 0.01], false],
    // and an eighth: the corner of the box reaches further on the diagonal
    [Math.PI / 4, [2.3, 2.3], false],
    [Math.PI / 4, [0.5, 0.5], true]
  ];

  for (const [yaw, [dx, dz], expected] of cases) {
    const { field } = standing(12, -100);
    const taxi = makeTaxi(12 - dx, -100 - dz, yaw);
    assert.equal(field.update(DT, taxi, 5), expected, `yaw ${yaw.toFixed(2)}, person at (${dx}, ${dz})`);
  }
});

test('hit rule: needs 1 m/s (either way), not a parked or crawling taxi; not a taxi up on a flyover', () => {
  assert.equal(HIT_MIN_SPEED, 1);

  const run = (speed, y = 0) => {
    const { field } = standing();
    return field.update(DT, makeTaxi(12, -100, 0, y), speed);
  };

  assert.equal(run(0), false);
  assert.equal(run(0.5), false, '0.5 m/s');
  assert.equal(run(0.99), false);
  assert.equal(run(1), true, 'exactly 1 m/s');
  assert.equal(run(3), true, '3 m/s');
  assert.equal(run(-3), true, 'reversing into someone');
  assert.equal(run(28), true);
  assert.equal(run(5, 2.5), false, 'on a flyover deck');
});

test('hit: the person vanishes (scale 0), a puff of dust, onHit once with where, and the count', () => {
  const { mesh, field } = standing(12, -100);
  const seen = [];
  field.onHit = (x, z, id) => seen.push([x, z, id]);

  assert.equal(field.puffsAlive, 0);
  assert.equal(field.object.visible, false, 'no puff drawn while idle');
  assert.equal(scaleOf(mesh, 0), 1);

  const version = mesh.geometry.attributes.aMotion.version;
  assert.equal(field.update(DT, makeTaxi(12, -100), 6), true);

  assert.equal(scaleOf(mesh, 0), 0, 'knocked aside: scale 0 in the shader');
  assert.ok(mesh.geometry.attributes.aMotion.version > version, 'the attribute is flagged for upload');
  assert.deepEqual(seen, [[12, -100, 0]]);
  assert.equal(field.hits, 1);
  assert.equal(field.isHit(0), true);
  assert.equal(field.puffsAlive, 0, 'the puff counts live particles from the next update');
  assert.equal(field.object.visible, true, 'a puff is drawn');

  field.update(0.1, makeTaxi(50, -100), 6);
  assert.ok(field.puffsAlive > 0);
  for (let t = 0; t < 1.5; t += 0.1) field.update(0.1, makeTaxi(50, -100), 6);
  assert.equal(field.puffsAlive, 0, 'the dust settles');
  assert.equal(field.object.visible, false, 'and is not drawn any more');
});

test('one hit per person: after the cooldown the same person is gone, the next one is hit', () => {
  const mesh = makeMesh([{ x: 12, z: -100 }, { x: 12, z: -120 }]);
  const field = createPedestrianField({ clock: () => 0 });
  field.addMesh(mesh);

  const taxi = makeTaxi(12, -100);
  assert.equal(field.update(DT, taxi, 6), true);

  // still on top of where they stood, long after the cooldown: nothing more
  for (let i = 0; i < 5; i++) assert.equal(field.update(1, taxi, 6), false);
  assert.equal(field.hits, 1);

  taxi.position.z = -120;
  assert.equal(field.update(DT, taxi, 6), true, 'the second person');
  assert.equal(field.hits, 2);
  assert.equal(field.update(1, taxi, 6), false);
});

test('cooldown 0.5 s: a contact during it is not consumed, the person is hit when it ends', () => {
  assert.equal(HIT_COOLDOWN, 0.5);

  // two people both inside the box
  const mesh = makeMesh([{ x: 12, z: -100 }, { x: 12.4, z: -101 }]);
  const field = createPedestrianField({ clock: () => 0 });
  field.addMesh(mesh);
  const taxi = makeTaxi(12, -100);

  assert.equal(field.update(DT, taxi, 6), true);
  assert.equal(field.hits, 1);

  const hitFirst = field.isHit(0) ? 0 : 1;
  const other = 1 - hitFirst;

  for (let i = 0; i < 4; i++) assert.equal(field.update(0.1, taxi, 6), false, `${(i + 1) * 100} ms after`);
  assert.equal(field.update(0.09, taxi, 6), false, '490 ms after');
  assert.equal(field.isHit(other), false, 'not consumed');
  assert.equal(scaleOf(mesh, other), 1, 'still standing there');

  assert.equal(field.update(0.01, taxi, 6), true, '500 ms after');
  assert.equal(field.isHit(other), true);
  assert.equal(field.hits, 2);
});

// ---- Reload ----------------------------------------------------------------------

test('reset restores everyone: scale, flags, cooldown, puffs; they can be hit again', () => {
  const mesh = makeMesh([{ x: 12, z: -100, scale: 1.04 }, { x: 12, z: -130, scale: 0.96 }]);
  const field = createPedestrianField({ clock: () => 0 });
  field.addMesh(mesh);

  field.update(DT, makeTaxi(12, -100), 6);
  field.update(1, makeTaxi(12, -130), 6);
  assert.equal(field.hits, 2);
  assert.equal(scaleOf(mesh, 0) + scaleOf(mesh, 1), 0);

  field.reset();
  assert.equal(field.hits, 0);
  assert.equal(field.isHit(0) || field.isHit(1), false);
  assert.equal(scaleOf(mesh, 0), Math.fround(1.04));
  assert.equal(scaleOf(mesh, 1), Math.fround(0.96));
  assert.equal(field.puffsAlive, 0);
  assert.equal(field.object.visible, false);

  // no cooldown left over from before the reset
  assert.equal(field.update(DT, makeTaxi(12, -100), 6), true);
  assert.equal(field.hits, 1);
});

// ---- People added later (the runners) -------------------------------------------

test('later people: addMesh after the build, setOffset, restart, setActive', () => {
  const field = createPedestrianField({ clock: () => 100 });
  const first = field.addMesh(makeMesh([{ x: 12, z: -100 }]));
  assert.deepEqual(first, { first: 0, count: 1 });

  // a runner: 4 m/s along +z for 40 m, built later
  const runners = makeMesh([{ x: -12, z: -300, dz: 1, speed: 4, length: 40, offset: 0, scale: 1.02 }]);
  const added = field.addMesh(runners);
  assert.deepEqual(added, { first: 1, count: 1 });
  assert.equal(field.count, 2);
  assert.equal(field.speedOf(1), 4);

  const out = { x: 0, z: 0, sign: 1 };

  // setOffset moves it along its cycle (and the shader sees the same number)
  field.setOffset(1, 5);
  assert.equal(runners.geometry.attributes.aMotion.array[2], 5);
  field.positionOf(1, out, 100);                               // (100 + 5) mod 22 = 17: walking back? walk = 10 s, pause 3
  const expected = personPosition({ x: 0, z: 0, sign: 1 }, -12, -300, 0, 1, 4, 40, 5, 100);
  assert.equal(out.z, expected.z);

  // restart: starts from the beginning at the moment given
  field.restart(1, 250);
  field.positionOf(1, out, 250);
  assert.ok(Math.abs(out.z - (-300)) < 1e-6 && out.sign === 1, `at the start (${out.z})`);
  field.positionOf(1, out, 252.5);
  assert.ok(Math.abs(out.z - (-290)) < 1e-4, `10 m on after 2.5 s (${out.z})`);

  // it can be hit where it is
  const taxi = makeTaxi(-12, -290, 0);
  assert.equal(field.update(DT, taxi, 8, 252.5), true);

  // inactive: hidden and ignored, then back
  field.reset();
  field.setActive(1, false);
  assert.equal(runners.geometry.attributes.aMotion.array[3], 0);
  assert.equal(field.update(1, taxi, 8, 252.5), false);
  field.setActive(1, true);
  assert.equal(runners.geometry.attributes.aMotion.array[3], Math.fround(1.02));
  assert.equal(field.update(1, taxi, 8, 252.5), true);

  // a hit person stays gone when setActive(true) is asked for, until reset
  field.setActive(1, true);
  assert.equal(runners.geometry.attributes.aMotion.array[3], 0);
});

// ---- Dust ------------------------------------------------------------------------

test('dust puffs: one Points, a fixed pool, recycled; hidden when idle', () => {
  const field = createPedestrianField({ clock: () => 0 });
  const people = [];
  for (let i = 0; i < 30; i++) people.push({ x: 12, z: -100 - i * 10 });
  field.addMesh(makeMesh(people));

  const geometry = field.object.geometry;
  const positions = geometry.attributes.position.array;
  assert.ok(field.object.isPoints);
  assert.equal(positions.length, 8 * 12 * 3);

  for (let i = 0; i < 30; i++) {
    field.update(1, makeTaxi(12, -100 - i * 10), 6);              // a hit each call
  }

  assert.equal(field.hits, 30);
  assert.equal(field.object.geometry, geometry, 'no new geometry');
  assert.equal(geometry.attributes.position.array, positions, 'no new buffer');
  assert.equal(positions.length, 8 * 12 * 3);
});

// ---- LevelManager ----------------------------------------------------------------

function makeLevel() {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  const applied = [];
  const scored = [];
  const hits = [];
  let speed = 0;

  const vehicle = {
    settings: { maxForwardSpeed: 28 },
    cargoSystem: { getState: () => ({ remaining: 5, total: 5 }) },
    localTaxiCollisionBox: new THREE.Box3(new THREE.Vector3(-1.35, 0, -2.3), new THREE.Vector3(1.35, 2.8, 2.3)),
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(spawn) { taxi.position.set(spawn.x, 0, spawn.z); speed = 0; },
    getSpeed: () => speed,
    getHighSpeedTime: () => 0,
    getLevel2Pressure: () => 0,
    applyHit: (hit) => { applied.push({ ...hit, speedBefore: speed }); speed *= 1 - hit.speedLoss; }
  };

  const lm = new LevelManager({
    scene, vehicle, taxi, collidables: [], potholes: [], materials: makeLibrary(),
    getHeadlightsEnabled: () => true,
    onScore: (e) => scored.push(e),
    onPedestrianHit: (e) => hits.push(e)
  });

  return { lm, taxi, applied, scored, hits, setSpeed: (s) => { speed = s; }, getSpeed: () => speed };
}

// A person standing on the sidewalk past the rank, and a clear run at it
function aStandingPerson(field) {
  const out = { x: 0, z: 0, sign: 1 };
  for (let id = 0; id < field.count; id++) {
    field.positionOf(id, out, 0);
    if (field.speedOf(id) === 0 && out.z < -80 && out.z > -250) return { id, x: out.x, z: out.z };
  }
  throw new Error('no standing person');
}

test('LevelManager: level 1 has the field; a hit applies { speedLoss 0.25, stress 2, kick 0.3 }, takes 50 points, calls back; no police effect', () => {
  const e = makeLevel();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;                                 // nobody beaten in this test

  const field = e.lm.environment.pedestrians;
  assert.ok(field && field.count > 300, `${field?.count} people`);
  field.clock = () => 0;
  assert.equal(field.halfX, 1.35);
  assert.equal(field.halfZ, 2.3);

  const target = aStandingPerson(field);

  // only the target is there: a clear run at one person
  for (let id = 0; id < field.count; id++) {
    if (id !== target.id) field.setActive(id, false);
  }

  e.taxi.position.set(target.x, 0, target.z + 20);
  e.setSpeed(15);
  e.lm.update(DT, 0);                                           // over the exit line: the 300 is awarded here, not by the hit

  const before = e.lm.getState().score.points;
  let frames = 0;
  while (e.hits.length === 0 && frames < 600) {
    e.taxi.position.z -= 15 * DT;
    e.lm.update(DT, frames * DT);
    frames++;
  }

  assert.equal(e.hits.length, 1);
  assert.ok(Math.abs(e.hits[0].x - target.x) < 1e-6 && Math.abs(e.hits[0].z - target.z) < 1e-6);
  assert.ok(Math.abs(e.hits[0].z - e.taxi.position.z) < 2.7, 'inside the taxi box when it happened');
  assert.equal(field.isHit(target.id), true);
  assert.equal(e.applied.length, 1);
  assert.deepEqual({ ...e.applied[0], speedBefore: undefined }, { speedLoss: 0.25, stress: 2, kick: 0.3, speedBefore: undefined });
  assert.equal(e.applied[0].speedBefore, 15);
  assert.ok(Math.abs(e.getSpeed() - 11.25) < 1e-9, 'lost 25% of its speed');

  const score = e.lm.getState().score;
  assert.equal(score.points, before - 50);
  assert.equal(score.pedestriansHit, 1);
  assert.deepEqual(e.scored.filter((s) => s.reason === 'pedestrian'), [{ delta: -50, reason: 'pedestrian', points: before - 50 }]);
  assert.equal(e.lm.pursuit.state, 'idle', 'the police do not care');
  assert.equal(field.hits, 1);

  // on past them (and over the same spot again): nothing more
  for (let i = 0; i < 90; i++) { e.taxi.position.z -= 10 * DT; e.lm.update(DT, i * DT); }
  e.taxi.position.set(target.x, 0, target.z + 5);
  for (let i = 0; i < 90; i++) { e.taxi.position.z -= 10 * DT; e.lm.update(DT, i * DT); }
  assert.equal(e.applied.length, 1);
  assert.equal(e.lm.getState().score.pedestriansHit, 1);
});

test('LevelManager: a reload (load, reset) brings everyone back and they can be hit again', () => {
  const e = makeLevel();
  e.lm.load(1);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;

  const hitOnce = () => {
    const field = e.lm.environment.pedestrians;
    field.clock = () => 0;
    const target = aStandingPerson(field);
    e.taxi.position.set(target.x, 0, target.z);
    e.setSpeed(12);
    e.lm.update(DT, 0);
    return { field, target };
  };

  const first = hitOnce();
  const people = first.field.count;
  assert.ok(people > 300);
  assert.equal(first.field.hits, 1);
  assert.equal(e.hits.length, 1);

  // reset(): the same field, everyone restored
  e.lm.reset();
  assert.equal(first.field.hits, 0);
  assert.equal(first.field.isHit(first.target.id), false);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;
  e.taxi.position.set(first.target.x, 0, first.target.z);
  e.setSpeed(12);
  e.lm.update(DT, 0);
  assert.equal(first.field.hits, 1, 'hit again after reset()');
  assert.equal(e.hits.length, 2);

  // load(): a new environment, a new field, nobody hit
  e.lm.load(1);
  e.lm.skipCountdown();
  const field = e.lm.environment.pedestrians;
  assert.notEqual(field, first.field);
  assert.equal(field.count, people, 'the same people');
  assert.equal(field.hits, 0);
  for (let id = 0; id < field.count; id++) assert.equal(field.isHit(id), false);
  assert.equal(e.lm.getState().score.pedestriansHit, 0);
});

test('LevelManager: level 2 has no pedestrians and level 3 only its 8 runners; both run fine; a hit there would cost no points', () => {
  const l2 = makeLevel();
  l2.lm.load(2);
  l2.lm.skipCountdown();
  assert.equal(l2.lm.environment.pedestrians, undefined, 'level 2');

  const l3 = makeLevel();
  l3.lm.load(3);
  l3.lm.skipCountdown();
  assert.equal(l3.lm.environment.pedestrians.count, 8, 'level 3: only the runners');
  assert.equal(l3.lm.environment.pedestrians.runnerCount, 8);

  for (const e of [l2, l3]) {
    e.setSpeed(20);
    for (let i = 0; i < 120; i++) e.lm.update(DT, i * DT);
    e.lm.reset();
    assert.equal(e.hits.length, 0);
  }

  // the hook on a level without a race: the speed loss, no points, no throw
  const e = makeLevel();
  e.lm.load(2);
  e.lm.skipCountdown();
  e.setSpeed(20);
  e.lm.pedestrianHit(1, 2);
  assert.equal(e.applied.length, 1);
  assert.equal(e.lm.getState().score, null);
  assert.equal(e.hits.length, 1);
});

// ---- Runners ---------------------------------------------------------------------

// a runner waiting at x 9.4, dashing -x at 5 m/s along 18.8 m; the taxi comes down -z
function runnerField(lead = 1.88, z = -100) {
  const mesh = makeMesh([{ x: 9.4, y: 0.1, z, dx: -1, dz: 0, speed: 0, length: 18.8 }]);
  const field = createPedestrianField({ clock: () => 0 });
  field.addMesh(mesh);
  field.addRunner(0, { z, sign: -1, lead, length: 18.8 });
  return { field, mesh, z };
}

// a taxi `dz` m from the runner's z (on the -z side of travel it is at z + dz)
const taxiAt = (z, dz, x = 0) => makeTaxi(x, z + dz);

test('runner: waits standing at its kerb until the taxi is lead * speed away, then runs at 5 m/s', () => {
  const { field, mesh, z } = runnerField();
  const out = { x: 0, z: 0, sign: 1 };
  assert.equal(field.runnerCount, 1);
  assert.equal(field.speedOf(0), 0, 'standing');

  // 20 m/s: the start is 1.88 * 20 = 37.6 m out; 60 m out it still waits
  field.update(DT, taxiAt(z, 60), 20, 10);
  assert.equal(field.runnerStateOf(0), 0);
  assert.equal(field.speedOf(0), 0);

  field.update(DT, taxiAt(z, 37.5), 20, 10);
  assert.equal(field.runnerStateOf(0), 1, 'started');
  assert.equal(field.speedOf(0), 5);
  assert.equal(mesh.geometry.attributes.aMotion.array[1], Math.fround(18.8));

  // it starts from its kerb at the moment it was set off, 5 m/s across
  field.positionOf(0, out, 10);
  assert.ok(Math.abs(out.x - 9.4) < 1e-6 && out.z === z, 'at the kerb at the start');
  field.positionOf(0, out, 10 + 1.88);
  assert.ok(Math.abs(out.x - (9.4 - 5 * 1.88)) < 1e-4, `x ${out.x}`);
  assert.equal(out.sign, 1);
});

test('runner: a slow taxi sets it off at 35 m, and one already inside 33 m does not', () => {
  // 8 m/s counts as 10: 1.88 * 10 = 18.8 m, so the 35 m minimum (the default) is the start
  for (const speed of [8, 0.2, -8]) {
    const { field, z } = runnerField();
    field.update(DT, taxiAt(z, 40), speed, 0);
    assert.equal(field.runnerStateOf(0), 0, `${speed} m/s, 40 m out`);
    field.update(DT, taxiAt(z, 35), speed, 0);
    assert.equal(field.runnerStateOf(0), 1, `${speed} m/s, 35 m out`);
  }

  // a taxi that appears inside the minimum (a respawn, say) does not set it off
  const { field, z } = runnerField();
  field.update(DT, taxiAt(z, 30), 20, 0);
  assert.equal(field.runnerStateOf(0), 0);
  field.update(DT, taxiAt(z, 0), 20, 0);
  assert.equal(field.runnerStateOf(0), 0);

  // a taxi past it (the other way) does not either, and a frame that steps over 35 m by 2 m or less still does
  field.update(DT, taxiAt(z, -50), 20, 0);
  assert.equal(field.runnerStateOf(0), 0);
  const stepped = runnerField();
  stepped.field.update(DT, taxiAt(stepped.z, 34), 8, 0);
  assert.equal(stepped.field.runnerStateOf(0), 1);
});

test('runner: the lead time, not the distance: a faster taxi starts it further out', () => {
  const startDz = (speed) => {
    const { field, z } = runnerField();
    for (let dz = 120; dz > 0; dz -= 0.05) {
      field.update(DT, taxiAt(z, dz), speed, 0);
      if (field.runnerStateOf(0) === 1) return dz;
    }
    return null;
  };
  assert.ok(Math.abs(startDz(20) - 37.6) < 0.1);
  assert.ok(Math.abs(startDz(28) - 52.64) < 0.1);
  assert.ok(Math.abs(startDz(31) - 58.28) < 0.1);
  assert.ok(Math.abs(startDz(14) - 35) < 0.1, 'below 18.6 m/s the 35 m minimum is the start');
});

test('runner: a minDistance of its own (addRunner) replaces the default: 50 m starts a 20 m/s taxi earlier, and 35 m is no longer enough', () => {
  const make = () => {
    const mesh = makeMesh([{ x: 9.4, y: 0.1, z: -100, dx: -1, dz: 0, speed: 0, length: 18.8 }]);
    const field = createPedestrianField({ clock: () => 0 });
    field.addMesh(mesh);
    field.addRunner(0, { z: -100, sign: -1, lead: 1.88, length: 18.8, minDistance: 50 });
    return field;
  };
  const field = make();
  field.update(DT, taxiAt(-100, 55), 20, 0);
  assert.equal(field.runnerStateOf(0), 0, '55 m out');
  field.update(DT, taxiAt(-100, 50), 20, 0);
  assert.equal(field.runnerStateOf(0), 1, '50 m out (the default would wait for 37.6 m)');
  const late = make();
  late.update(DT, taxiAt(-100, 35), 8, 0);
  assert.equal(late.runnerStateOf(0), 0, 'inside its 48 m: not set off');
});

test('runner: removed when it has crossed (not before), once; reset() puts it back waiting', () => {
  const { field, mesh, z } = runnerField();
  const taxi = taxiAt(z, 35);
  field.update(DT, taxi, 8, 100);                               // started at 100
  assert.equal(field.runnerStateOf(0), 1);
  field.update(DT, taxi, 8, 103.7);                             // 18.8 / 5 = 3.76 s to cross
  assert.equal(field.runnerStateOf(0), 1);
  assert.notEqual(mesh.geometry.attributes.aMotion.array[3], 0);
  field.update(DT, taxi, 8, 103.8);
  assert.equal(field.runnerStateOf(0), 2, 'done');
  assert.equal(field.scaleOf(0), 0, 'gone');
  field.update(DT, taxi, 8, 120);                               // nothing brings it back, and it is not run again
  assert.equal(field.runnerStateOf(0), 2);
  assert.equal(field.scaleOf(0), 0);

  field.reset();
  assert.equal(field.runnerStateOf(0), 0);
  assert.equal(field.speedOf(0), 0, 'standing again');
  assert.equal(field.scaleOf(0), 1);
  field.update(DT, taxiAt(z, 35), 8, 200);
  assert.equal(field.runnerStateOf(0), 1, 'runs again after the reset');
});

test('runner: hit while it waits or runs it stays gone, once, and is not run again; reset() brings it back', () => {
  for (const crossing of [false, true]) {
    const { field, z } = runnerField();
    let hits = 0;
    field.onHit = () => { hits++; };

    if (crossing) {
      field.update(DT, taxiAt(z, 35), 8, 0);
      assert.equal(field.update(DT, makeTaxi(9.4 - 5 * 1, z, 0), 8, 1), true, 'hit on the road, 1 s in');
    } else {
      assert.equal(field.update(DT, makeTaxi(9.4, z, 0), 8, 0), true, 'taxi on it while it waits');
    }

    field.update(DT, taxiAt(z, 35), 8, 50);
    assert.equal(hits, 1);
    assert.equal(field.scaleOf(0), 0);
    assert.equal(field.runnerStateOf(0), 2);
    field.update(DT, taxiAt(z, 35), 8, 51);
    assert.equal(field.runnerStateOf(0), 2, 'not run again');

    field.reset();
    assert.equal(field.runnerStateOf(0), 0);
    assert.equal(field.scaleOf(0), 1);
    assert.equal(field.speedOf(0), 0);
    assert.equal(field.hits, 0);
  }
});

// A LevelManager on a kinematic taxi (the mock vehicle's speed, constant but for a hit) driven down a level
function runLevel(e, level, runner, speed, { x = null } = {}) {
  const { runners, route } = LEVELS[level];
  const field = e.lm.environment.pedestrians;
  const aim = routeXAt(route, runner.z);
  let t = 0;
  field.clock = () => t;
  field.reset();
  e.hits.length = 0;
  e.taxi.position.set(x ?? aim, 0, runner.z - runners.sign * 90);
  e.setSpeed(speed);

  const result = { startDz: null, doneBeforeArrival: null, arrived: false };
  for (let frame = 0; frame < 900; frame++) {
    e.taxi.position.z += runners.sign * e.getSpeed() * DT;
    t += DT;
    e.lm.update(DT, t);
    const dz = (runner.z - e.taxi.position.z) * runners.sign;
    if (result.startDz === null && field.runnerStateOf(runner.k) === 1) result.startDz = dz + e.getSpeed() * DT;
    if (dz <= 0 && !result.arrived) {
      result.arrived = true;
      result.doneBeforeArrival = field.runnerStateOf(runner.k) === 2;
    }
    if (dz < -30) break;
  }
  result.hits = e.hits.length;
  return result;
}

function levelRunners(field) {
  const list = [];
  const p = { x: 0, z: 0, sign: 1 };
  for (let k = 0; k < field.runnerCount; k++) {
    const id = field.runnerId(k);
    field.positionOf(id, p, 0);
    list.push({ k, id, x: p.x, z: p.z });
  }
  return list;
}

function loadLevel(level) {
  const e = makeLevel();
  e.lm.load(level);
  e.lm.skipCountdown();
  e.lm.rivals.launched = false;
  e.lm.pursuit.update = () => {};
  e.lm.traffic.update = () => {};
  return e;
}

for (const level of [1, 3]) {
  test(`level ${level}: every runner is hit by a taxi holding the route line at 28 m/s (-50 points on level 1 only)`, () => {
    const e = loadLevel(level);
    const field = e.lm.environment.pedestrians;
    const list = levelRunners(field);
    assert.equal(list.length, LEVELS[level].runners.count);

    for (const runner of list) {
      const aim = routeXAt(LEVELS[level].route, runner.z);
      const lead = Math.abs(runner.x - aim) / 5;
      const penalties = () => e.scored.filter((s) => s.reason === 'pedestrian');
      const penaltiesBefore = penalties().length;
      const result = runLevel(e, level, runner, 28);
      assert.ok(Math.abs(result.startDz - Math.max(LEVELS[level].runners.minDistance, lead * 28)) < 28 * DT + 1e-6, `runner at z ${runner.z}: started ${result.startDz} m out`);
      assert.equal(result.hits, 1, `runner at z ${runner.z}, x ${runner.x}, line ${aim.toFixed(1)}`);
      assert.equal(field.scaleOf(runner.id), 0);

      if (level === 1) {
        assert.equal(penalties().length, penaltiesBefore + 1, 'one penalty');
        assert.equal(penalties().at(-1).delta, -50, '-50 points');
      } else {
        assert.equal(e.lm.getState().score, null, 'no points on level 3');
        assert.equal(penalties().length, 0);
      }
    }
  });

  test(`level ${level}: braking after the runner starts, or holding the line 2.6 m to one side, misses; a crawling taxi sets it off at the level's minDistance (50 m on Level 1, 35 m on Level 3) and it is across first`, () => {
    const e = loadLevel(level);
    const field = e.lm.environment.pedestrians;
    const runner = levelRunners(field)[1];
    const aim = routeXAt(LEVELS[level].route, runner.z);

    // crawling: 8 m/s
    const crawl = runLevel(e, level, runner, 8);
    assert.equal(crawl.hits, 0);
    assert.ok(Math.abs(crawl.startDz - LEVELS[level].runners.minDistance) < 8 * DT + 1e-6, `${crawl.startDz}`);
    assert.equal(crawl.doneBeforeArrival, true);

    // 2.6 m off the line either side (the taxi's reach is 1.7 m, the runner moves 5 m/s)
    for (const side of [-1, 1]) {
      const swerve = runLevel(e, level, runner, 28, { x: aim + 2.6 * side });
      assert.equal(swerve.hits, 0, `${side * 2.6} m off the line`);
    }

    // brakes (12 m/s per second) the moment it starts
    const { sign } = LEVELS[level].runners;
    let t = 0;
    field.clock = () => t;
    field.reset();
    e.hits.length = 0;
    e.taxi.position.set(aim, 0, runner.z - sign * 90);
    let speed = 28;
    e.setSpeed(speed);
    let braking = false;
    for (let frame = 0; frame < 900; frame++) {
      if (braking) { speed = Math.max(0, speed - 12 * DT); e.setSpeed(speed); }
      e.taxi.position.z += sign * e.getSpeed() * DT;
      t += DT;
      e.lm.update(DT, t);
      if (field.runnerStateOf(runner.k) === 1) braking = true;
      if (braking && speed === 0 && frame > 400) break;
    }
    assert.equal(e.hits.length, 0, 'braked');
    assert.equal(field.runnerStateOf(runner.k), 2, 'it got across');
  });
}

test('runner minDistance per level: 50 m on Level 1, 35 m on Level 3, a 20 m/s straight line hits on Level 3 only', () => {
  assert.equal(LEVELS[1].runners.minDistance, 50);
  assert.equal(LEVELS[3].runners.minDistance, 35);
  for (const [level, hits] of [[1, 0], [3, 1]]) {
    const e = loadLevel(level);
    const runner = levelRunners(e.lm.environment.pedestrians).find((r) => Math.abs(Math.abs(r.x - routeXAt(LEVELS[level].route, r.z)) / 5 - 1.88) < 0.01);
    assert.ok(runner, `level ${level}: a runner with a 1.88 s lead`);
    assert.equal(runLevel(e, level, runner, 20).hits, hits, `level ${level} at 20 m/s`);
    assert.equal(runLevel(e, level, runner, 28).hits, 1, `level ${level} at 28 m/s`);
  }
});

test('runner placement: 4 on level 1 (z -130..-640), 8 on level 3 (z -540..240), clear of everything, from both kerbs', () => {
  const checks = {
    1: { count: 4, lo: -640, hi: -130 },
    3: { count: 8, lo: -540, hi: 240 }
  };
  const potholes = [5, -20, -50, -85, -10, 70];

  for (const level of [1, 3]) {
    const e = loadLevel(level);
    const field = e.lm.environment.pedestrians;
    const list = levelRunners(field);
    const { count, lo, hi } = checks[level];
    assert.equal(list.length, count, `level ${level}`);
    assert.equal(LEVELS[level].runners.count, count);

    const lights = [];
    e.lm.environment.group.traverse((o) => { if (o.isLight) lights.push(o); });
    assert.equal(lights.length, 0, 'no lights added');

    const zs = list.map((r) => r.z).sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) assert.ok(zs[i] - zs[i - 1] >= 60, `spaced: ${zs}`);

    for (const r of list) {
      assert.ok(r.z >= lo && r.z <= hi, `z ${r.z} inside ${lo}..${hi}`);
      assert.ok(Math.abs(Math.abs(r.x) - 9.4) < 1e-6, `at the kerb, x ${r.x}`);

      // the whole path across the road, 0.4 m each side in z, touches no collidable
      const strip = new THREE.Box3(new THREE.Vector3(-9.4, 0, r.z - 0.4), new THREE.Vector3(9.4, 2, r.z + 0.4));
      for (const mesh of e.lm.environment.collidables) {
        mesh.updateWorldMatrix(true, false);
        assert.ok(!new THREE.Box3().setFromObject(mesh).intersectsBox(strip), `level ${level}: runner at z ${r.z} crosses a ${mesh.name || 'collidable'}`);
      }

      const aim = routeXAt(LEVELS[level].route, r.z);
      const lead = Math.abs(r.x - aim) / 5;
      assert.ok(lead >= 0.7 && lead <= 3.0, `lead ${lead}`);
      if (Math.abs(aim) > 1) {
        // the side with the lead nearer 2.5 s
        const other = Math.abs(-r.x - aim) / 5;
        assert.ok(Math.abs(lead - 2.5) <= Math.abs(other - 2.5) + 1e-9, `z ${r.z}: lead ${lead} against ${other} from the other side`);
      }
    }

    if (level === 3) {
      for (const r of list) for (const p of potholes) assert.ok(Math.abs(r.z - p) >= 4.5, `runner at z ${r.z} is ${Math.abs(r.z - p)} m from the pothole at z ${p}`);
    }

    if (level === 1) {
      // 5 m clear of the middle of every slot (the shopfronts)
      for (const r of list) {
        const off = ((r.z + 180) % 30 + 30) % 30;
        assert.ok(Math.min(off, 30 - off) >= 5, `z ${r.z} is ${Math.min(off, 30 - off)} m from a shopfront`);
      }
    }

    assert.ok(list.some((r) => r.x > 0) && list.some((r) => r.x < 0), 'both kerbs');
  }
});

test('runner placement: the same on every load (seeded)', () => {
  for (const level of [1, 3]) {
    const a = levelRunners(loadLevel(level).lm.environment.pedestrians);
    const b = levelRunners(loadLevel(level).lm.environment.pedestrians);
    assert.deepEqual(a, b);
  }
});

test('stride: the stride frequency is capped at 3.2 steps a second, so a runner does not shimmer', () => {
  const material = createPersonMaterial();
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <color_vertex>\n#include <beginnormal_vertex>\n#include <begin_vertex>' };
  material.onBeforeCompile(shader);
  assert.ok(shader.vertexShader.includes('min(pSpeed * 1.5, 3.2)'), 'the stride frequency is capped');
});

// ---- No allocation ---------------------------------------------------------------

test('update() does not allocate: no garbage collection over 300k frames of hits, puffs and resets', async () => {
  const people = [];
  for (let i = 0; i < 120; i++) {
    people.push(i % 3 === 0
      ? { x: 12, z: -50 - i * 3, dz: -1, speed: 1.3, length: 8, offset: i }
      : { x: 12.5, z: -50 - i * 3 });
  }

  const field = createPedestrianField({ clock: () => 0 });
  field.addMesh(makeMesh(people));
  field.onHit = () => {};

  // and 14 runners down the same road, set off and removed again and again
  const runnerPeople = Array.from({ length: 14 }, (_, i) => ({ x: 9.4, z: -40 - i * 40, dx: -1, dz: 0, speed: 0, length: 18.8 }));
  const added = field.addMesh(makeMesh(runnerPeople));
  runnerPeople.forEach((p, i) => field.addRunner(added.first + i, { z: p.z, sign: -1, lead: 1.88, length: 18.8 }));

  const taxi = makeTaxi(12, 0, 0.1);
  let t = 0;

  const run = (frames) => {
    for (let i = 0; i < frames; i++) {
      if (i % 700 === 0) { field.reset(); taxi.position.z = 0; }
      taxi.position.z -= 0.2;
      t += DT;
      field.update(DT, taxi, 12, t);
    }
  };

  run(20000);                                                    // warm up the JIT
  v8.setFlagsFromString('--expose-gc');
  vm.runInNewContext('gc')();

  let gcs = 0;
  const observer = new PerformanceObserver((list) => { gcs += list.getEntries().length; });
  observer.observe({ entryTypes: ['gc'] });
  await new Promise((r) => setTimeout(r, 20));
  gcs = 0;

  run(300000);
  await new Promise((r) => setTimeout(r, 50));
  gcs += observer.takeRecords().length;
  observer.disconnect();

  assert.ok(field.hits > 0 || t > 0);
  assert.equal(gcs, 0, `${gcs} GC events`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS', name); }
  catch (err) { failed++; console.log('FAIL', name, '\n  ', err.message); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
