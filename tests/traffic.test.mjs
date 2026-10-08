// Headless traffic test: node tests/traffic.test.mjs
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { PerformanceObserver } from 'node:perf_hooks';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import { TrafficSystem, MIN_CAR_GAP, TRAFFIC_VARIANTS } from '../src/world/TrafficSystem.js';
import { createTrafficCar } from '../src/world/environments/props.js';

const DT = 1 / 60;
const TAXI_WIDTH = 2.7;
const FLYOVER_FOOTPRINT_X_MIN = 2;     // spec: x >= 2, z between zExit and zEntry

function make() {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  const collidables = [];
  const vehicle = {
    settings: { maxForwardSpeed: 28 },
    cargoSystem: { getState: () => ({ remaining: 5, total: 5 }) },
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(spawn) { taxi.position.set(spawn.x, 0, spawn.z); },
    getSpeed: () => 0, getHighSpeedTime: () => 0, getLevel2Pressure: () => 0
  };
  const lm = new LevelManager({ scene, vehicle, taxi, collidables, potholes: [], getHeadlightsEnabled: () => true });
  return { scene, taxi, collidables, lm };
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const carMeshes = (lm) => lm.traffic.cars.map((c) => c.mesh);
const box = new THREE.Box3();

// Distance from the point (px, pz) to the box's footprint (0 inside)
function distanceXZ(b, px, pz) {
  const dx = Math.max(b.min.x - px, 0, px - b.max.x);
  const dz = Math.max(b.min.z - pz, 0, pz - b.max.z);
  return Math.hypot(dx, dz);
}

function snapshot(lm) {
  return lm.traffic.cars.map((c) => [c.mesh.position.x, c.mesh.position.z, c.mesh.rotation.y]);
}

test('createTrafficCar: 4 variants, <400 tris, ground origin, faces -Z, emissive tail lights', () => {
  assert.deepEqual([...TRAFFIC_VARIANTS].sort(), ['bakkie', 'hatchback', 'minibus', 'sedan']);
  const cache = new Map();
  const materials = new Set();

  for (const variant of TRAFFIC_VARIANTS) {
    const { geometry, material } = createTrafficCar(variant, cache);
    const tris = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
    assert.ok(tris > 20 && tris < 400, `${variant}: ${tris} tris`);

    geometry.computeBoundingBox();
    const b = geometry.boundingBox;
    assert.ok(Math.abs(b.min.y) < 0.01, `${variant}: sits on the ground`);
    assert.ok(Math.abs(b.min.x + b.max.x) < 0.05 && Math.abs(b.min.z + b.max.z) < 0.05, `${variant}: footprint centred`);
    assert.ok(b.max.y > 1.3 && b.max.y < 2.8, `${variant}: height ${b.max.y}`);
    assert.ok(b.max.x - b.min.x < 2.1 && b.max.z - b.min.z > 3.4, `${variant}: size`);

    const mats = [].concat(material);
    assert.ok(mats.length >= 2);
    const emissive = mats.filter((m) => m.emissive && m.emissive.getHex() !== 0);
    assert.equal(emissive.length, 1, `${variant}: one emissive (tail light) material`);
    mats.forEach((m) => materials.add(m));

    // Tail light triangles are at the back (+z), none at the front
    const tailGroup = geometry.groups.find((g) => mats[g.materialIndex] === emissive[0]);
    assert.ok(tailGroup, `${variant}: tail light group`);
    const pos = geometry.attributes.position;
    let zSum = 0;
    for (let i = tailGroup.start; i < tailGroup.start + tailGroup.count; i++) zSum += pos.getZ(geometry.index.getX(i));
    assert.ok(zSum / tailGroup.count > 0, `${variant}: tail lights face +z (car faces -z)`);
  }

  // The tail material is shared by all four variants, never duplicated per colour
  const tails = [...materials].filter((m) => m.emissive.getHex() !== 0);
  assert.equal(tails.length, 1, 'one shared tail material');
  // one material per colour
  const colours = [...materials].filter((m) => m.emissive.getHex() === 0).map((m) => m.color.getHex());
  assert.equal(new Set(colours).size, colours.length, 'one material per colour');
});

test('per-level config: L1 two lanes (3+3), L2 same-direction lanes (3+4), L3 none, <= 10 cars', () => {
  const l1 = LEVELS[1].traffic.lanes;
  assert.deepEqual(l1.map(({ x, dir, speed, count }) => ({ x, dir, speed, count })), [
    { x: -4.5, dir: -1, speed: 9, count: 3 },
    { x: 4.5, dir: 1, speed: 12, count: 3 }
  ]);
  const l2 = LEVELS[2].traffic.lanes;
  assert.deepEqual(l2.map(({ x, dir, speed, count }) => ({ x, dir, speed, count })), [
    { x: 0, dir: -1, speed: 13, count: 3 },
    { x: -3.6, dir: -1, speed: 17, count: 4 }
  ]);
  assert.equal(LEVELS[3].traffic, undefined);
  for (const level of [1, 2]) {
    assert.ok(LEVELS[level].traffic.lanes.reduce((n, l) => n + l.count, 0) <= 10);
  }
});

test('every car is a childless Mesh in the collidables, sharing geometry/material per variant', () => {
  for (const [level, expected] of [[1, 6], [2, 7]]) {
    const { lm, collidables, scene } = make();
    lm.load(level);
    assert.equal(lm.traffic.cars.length, expected);
    const byVariant = new Map();
    for (const { mesh, variant } of lm.traffic.cars) {
      assert.ok(mesh.isMesh && !mesh.isInstancedMesh && mesh.children.length === 0);
      assert.ok(collidables.includes(mesh), 'registered');
      assert.equal(collidables.filter((m) => m === mesh).length, 1, 'registered once');
      let scenePresent = false;
      scene.traverse((o) => { if (o === mesh) scenePresent = true; });
      assert.ok(scenePresent, 'in the scene');
      const shared = byVariant.get(variant);
      if (shared) {
        assert.equal(mesh.geometry, shared.geometry);
        assert.equal(mesh.material, shared.material);
      } else {
        byVariant.set(variant, mesh);
      }
    }
  }
});

test('lane spacing never drops below the minimum, over a long loop', () => {
  for (const level of [1, 2]) {
    const { lm } = make();
    lm.load(level);
    let minGap = Infinity;
    for (let t = 0; t < 240; t += DT) {
      lm.traffic.update(DT);
      for (let i = 0; i < lm.traffic.lanes.length; i++) {
        const lane = lm.traffic.lanes[i];
        const cars = lm.traffic.cars.filter((c) => c.laneIndex === i);
        for (let a = 0; a < cars.length; a++) {
          for (let b = a + 1; b < cars.length; b++) {
            let d = Math.abs(cars[a].mesh.position.z - cars[b].mesh.position.z);
            d = Math.min(d, lane.trackLength - d);          // loop distance (wrap)
            const gap = d - (cars[a].length + cars[b].length) / 2;
            minGap = Math.min(minGap, gap);
          }
        }
      }
    }
    assert.ok(minGap >= MIN_CAR_GAP - 1e-6, `level ${level}: bumper gap ${minGap.toFixed(2)} < ${MIN_CAR_GAP}`);
  }
});

test('clearance: never within 40 m of the spawn bay or 35 m of the destination (long loop)', () => {
  for (const level of [1, 2]) {
    const { lm, scene } = make();
    lm.load(level);
    const { spawn, destination } = LEVELS[level];
    const cfg = LEVELS[level].traffic;
    assert.equal(cfg.spawnClearance, 40);
    assert.equal(cfg.destinationClearance, 35);
    let nearestSpawn = Infinity;
    let nearestDest = Infinity;
    for (let t = 0; t < 300; t += DT) {
      lm.traffic.update(DT);
      scene.updateMatrixWorld(true);
      for (const mesh of carMeshes(lm)) {
        box.setFromObject(mesh);
        nearestSpawn = Math.min(nearestSpawn, distanceXZ(box, spawn.x, spawn.z));
        nearestDest = Math.min(nearestDest, distanceXZ(box, destination.x, destination.z));
      }
    }
    assert.ok(nearestSpawn >= 40, `level ${level}: ${nearestSpawn.toFixed(2)} m from the spawn`);
    assert.ok(nearestDest >= 35, `level ${level}: ${nearestDest.toFixed(2)} m from the destination`);
  }
});

test('L2: traffic stays clear of the flyover footprint, ramps, rails and pillars', () => {
  const { lm, collidables, scene } = make();
  lm.load(2);
  const s = LEVELS[2].elevated[0];
  const others = collidables.filter((m) => !carMeshes(lm).includes(m));
  assert.equal(others.length, 10, 'flyover rails (6) + pillars (4)');
  const otherBoxes = others.map((m) => new THREE.Box3().setFromObject(m));
  let maxX = -Infinity;
  for (let t = 0; t < 240; t += DT) {
    lm.traffic.update(DT);
    scene.updateMatrixWorld(true);
    for (const mesh of carMeshes(lm)) {
      box.setFromObject(mesh);
      maxX = Math.max(maxX, box.max.x);
      const inZ = box.max.z >= s.zExit && box.min.z <= s.zEntry;
      assert.ok(!(inZ && box.max.x >= FLYOVER_FOOTPRINT_X_MIN), 'car inside the flyover footprint');
      for (const ob of otherBoxes) assert.ok(!box.intersectsBox(ob), 'car touches a flyover part');
    }
  }
  assert.ok(maxX < FLYOVER_FOOTPRINT_X_MIN, `traffic reaches x = ${maxX.toFixed(3)}`);
});

test('cars wrap to the far end of the lane range and keep their direction', () => {
  for (const level of [1, 2]) {
    const { lm } = make();
    lm.load(level);
    const prev = lm.traffic.cars.map((c) => c.mesh.position.z);
    const wraps = lm.traffic.cars.map(() => 0);
    for (let t = 0; t < 120; t += DT) {
      lm.traffic.update(DT);
      lm.traffic.cars.forEach((c, i) => {
        const lane = lm.traffic.lanes[c.laneIndex];
        const z = c.mesh.position.z;
        const { centreLo, centreHi } = lane;
        assert.ok(centreLo - c.length / 2 >= lane.zLo - 1e-9 && centreHi + c.length / 2 <= lane.zHi + 1e-9, 'whole car inside the range');
        assert.ok(z >= centreLo - 1e-6 && z <= centreHi + 1e-6, `car outside its lane range (${z})`);
        const step = z - prev[i];
        if (Math.abs(step) > lane.speed * DT * 4) {
          wraps[i]++;
          // re-enters at the far end: moving towards +z (dir +1) starts at the low end
          const expected = lane.dir > 0 ? centreLo : centreHi;
          assert.ok(Math.abs(z - expected) < lane.speed * DT * 2, `wrapped car re-entered at ${z}, expected ~${expected}`);
        } else {
          assert.ok(Math.sign(step) === lane.dir || step === 0, 'moves along its lane direction');
          assert.ok(Math.abs(step - lane.dir * lane.speed * DT) < 1e-6, 'constant speed');
        }
        prev[i] = z;
      });
    }
    assert.ok(wraps.every((n) => n >= 1), `level ${level}: every car wrapped at least once ${wraps}`);
  }
});

test('cars face along their lane: heading 0 is -z, oncoming cars are turned round', () => {
  const { lm } = make();
  lm.load(1);
  for (const c of lm.traffic.cars) {
    const lane = lm.traffic.lanes[c.laneIndex];
    assert.ok(Math.abs(c.mesh.rotation.y - (lane.dir < 0 ? 0 : Math.PI)) < 1e-9);
    assert.equal(c.mesh.position.x, lane.x);
    assert.equal(c.mesh.position.y, 0);
  }
});

test('deterministic: same layout and same motion on every load; reset() restores it', () => {
  for (const level of [1, 2]) {
    const a = make();
    const b = make();
    a.lm.load(level);
    b.lm.load(level);
    const initial = snapshot(a.lm);
    assert.deepEqual(snapshot(b.lm), initial);

    for (let t = 0; t < 30; t += DT) {
      a.lm.traffic.update(DT);
      b.lm.traffic.update(DT);
    }
    assert.deepEqual(snapshot(a.lm), snapshot(b.lm));
    assert.notDeepEqual(snapshot(a.lm), initial, 'cars moved');

    a.lm.reset();
    assert.deepEqual(snapshot(a.lm), initial, 'reset restores the layout');
    a.lm.load(level);
    assert.deepEqual(snapshot(a.lm), initial, 'reload restores the layout');
  }
});

test('1 -> 2 -> 3 -> 1 cycles leave no duplicates or leaks', () => {
  const { lm, collidables, scene } = make();
  const countCars = () => {
    let n = 0;
    scene.traverse((o) => { if (o.userData.traffic) n++; });
    return n;
  };
  const seen = { 1: null, 2: null, 3: null };
  const disposedGeometries = [];

  for (let cycle = 0; cycle < 3; cycle++) {
    for (const level of [1, 2, 3, 1]) {
      lm.load(level);
      const state = { collidables: collidables.length, cars: countCars(), children: lm.group.children.length };
      const expectedCars = { 1: 6, 2: 7, 3: 0 }[level];
      assert.equal(state.cars, expectedCars, `level ${level}: cars in scene`);
      assert.equal(lm.traffic.cars.length, expectedCars);
      assert.equal(collidables.filter((m) => m.userData.traffic).length, expectedCars, 'traffic collidables');
      if (!seen[level]) seen[level] = state;
      assert.deepEqual(state, seen[level], `level ${level} drifted on cycle ${cycle}`);

      // Remember this level's geometries so the next load can prove they were freed
      const geometries = new Set(carMeshes(lm).map((m) => m.geometry));
      const flags = [...geometries].map((g) => {
        const f = { disposed: false };
        g.addEventListener('dispose', () => { f.disposed = true; });
        return f;
      });
      disposedGeometries.push(flags);
    }
  }
  // all geometries but those of the live level are freed
  const live = disposedGeometries.pop();
  assert.ok(live.every((f) => !f.disposed));
  assert.ok(disposedGeometries.flat().every((f) => f.disposed), 'old traffic geometry disposed');

  lm.load(3);
  assert.equal(collidables.filter((m) => m.userData.traffic).length, 0);
  assert.equal(lm.traffic.cars.length, 0);
  assert.equal(countCars(), 0);
});

test('update() does not allocate (no garbage collection over 300k frames)', async () => {
  const { lm } = make();
  lm.load(2);
  const traffic = lm.traffic;
  for (let i = 0; i < 2000; i++) traffic.update(DT);    // warm up the JIT

  let gcs = 0;
  const observer = new PerformanceObserver((list) => { gcs += list.getEntries().length; });
  observer.observe({ entryTypes: ['gc'] });
  await new Promise((r) => setTimeout(r, 20));
  gcs = 0;

  for (let i = 0; i < 300000; i++) traffic.update(DT);

  await new Promise((r) => setTimeout(r, 50));
  gcs += observer.takeRecords().length;
  observer.disconnect();
  assert.equal(gcs, 0, `${gcs} GC events while updating traffic`);
});

test('side gaps between the taxi (2.7 m, x = 0) and the L1 lanes', () => {
  const cache = new Map();
  let widest = 0;
  for (const variant of TRAFFIC_VARIANTS) {
    const { geometry } = createTrafficCar(variant, cache);
    geometry.computeBoundingBox();
    widest = Math.max(widest, geometry.boundingBox.max.x - geometry.boundingBox.min.x);
  }
  const lane = 4.5;
  const gapToTaxi = lane - widest / 2 - TAXI_WIDTH / 2;
  const gapToRoadEdge = 9 - (lane + widest / 2);
  assert.ok(gapToTaxi >= 1.5, `gap to taxi ${gapToTaxi.toFixed(2)}`);
  assert.ok(gapToRoadEdge >= 1, `gap to road edge ${gapToRoadEdge.toFixed(2)}`);
  console.log(`  widest car ${widest.toFixed(2)} m: gap taxi->car ${gapToTaxi.toFixed(2)} m each side, car->road edge ${gapToRoadEdge.toFixed(2)} m, between lanes ${(2 * lane - widest).toFixed(2)} m`);
});

test('pursuit is unaffected: not blocked by, and not registered with, traffic', () => {
  const { lm, collidables } = make();
  lm.load(2);
  const before = snapshot(lm);
  for (let t = 0; t < 2; t += DT) lm.update(DT, t);       // the pursuer is out, the taxi is parked
  assert.equal(lm.status, 'driving');
  assert.notDeepEqual(snapshot(lm), before, 'LevelManager.update moves traffic while driving');
  assert.ok(lm.pursuit.mesh && !collidables.includes(lm.pursuit.mesh));
  assert.ok(lm.pursuit.active);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log('ok  ', name);
  } catch (e) {
    failed++;
    console.log('FAIL', name, '\n    ', e.message);
  }
}
if (failed) { console.log(`traffic.test.mjs: ${failed} failed`); process.exit(1); }
console.log('traffic.test.mjs OK');
