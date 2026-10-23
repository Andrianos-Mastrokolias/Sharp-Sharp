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
  PERSON_RADIUS
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

test('LevelManager: level 1 has the field; a hit applies { speedLoss 0.3, stress 2, kick 0.3 }, takes 50 points, calls back; no police effect', () => {
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
  assert.deepEqual({ ...e.applied[0], speedBefore: undefined }, { speedLoss: 0.3, stress: 2, kick: 0.3, speedBefore: undefined });
  assert.equal(e.applied[0].speedBefore, 15);
  assert.ok(Math.abs(e.getSpeed() - 10.5) < 1e-9, 'lost 30% of its speed');

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

test('LevelManager: levels 2 and 3 have no pedestrians and run fine; a hit there would cost no points', () => {
  for (const level of [2, 3]) {
    const e = makeLevel();
    e.lm.load(level);
    assert.equal(e.lm.environment.pedestrians, undefined, `level ${level}`);
    e.setSpeed(20);
    for (let i = 0; i < 120; i++) e.lm.update(DT, i * DT);
    e.lm.reset();
    assert.equal(e.hits.length, 0);
  }

  // the hook on a level without a race: the speed loss, no points, no throw
  const e = makeLevel();
  e.lm.load(2);
  e.setSpeed(20);
  e.lm.pedestrianHit(1, 2);
  assert.equal(e.applied.length, 1);
  assert.equal(e.lm.getState().score, null);
  assert.equal(e.hits.length, 1);
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
