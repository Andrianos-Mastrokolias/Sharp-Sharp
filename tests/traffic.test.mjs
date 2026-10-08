// Headless traffic test: node tests/traffic.test.mjs
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { PerformanceObserver } from 'node:perf_hooks';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import {
  TrafficSystem, MIN_CAR_GAP, TRAFFIC_VARIANTS, GHOST_ZONE_RADIUS, TRAFFIC_GHOST_TIME
} from '../src/world/TrafficSystem.js';
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
    localTaxiCollisionBox: new THREE.Box3(new THREE.Vector3(-1.35, 0, -2.3), new THREE.Vector3(1.35, 2.8, 2.3)),
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

// The vehicle's move + checkCollisions (VehicleController.js), copied
// faithfully: translate, test the taxi box against every collidable, on a hit
// put the taxi back, bounce (speed *= -0.2) and stress. `hits` counts the
// stress applications. The order per frame is vehicle first, then traffic
// (main.js: vehicle.update, then levelManager.update).
function makeVehicleSim({ taxi, collidables, lm }) {
  const local = lm.vehicle.localTaxiCollisionBox;
  const sim = { speed: 0, hits: 0, prev: new THREE.Vector3(), taxiBox: new THREE.Box3(), obstacle: new THREE.Box3() };
  sim.step = (dt) => {
    sim.prev.copy(taxi.position);
    taxi.translateZ(-sim.speed * dt);
    taxi.updateWorldMatrix(true, false);
    sim.taxiBox.copy(local).applyMatrix4(taxi.matrixWorld);
    for (const object of collidables) {
      sim.obstacle.setFromObject(object);
      if (sim.taxiBox.intersectsBox(sim.obstacle)) {
        taxi.position.copy(sim.prev);
        sim.speed *= -0.2;
        sim.hits++;
        break;
      }
    }
    lm.traffic.update(dt);
  };
  return sim;
}

// solid <=> in the collidables exactly once <=> original material; ghost <=> absent <=> ghost material
function checkInvariants(lm, collidables, where = '') {
  for (const car of lm.traffic.cars) {
    const n = collidables.filter((m) => m === car.mesh).length;
    if (car.solid) {
      assert.equal(n, 1, `${where}: solid car must be in the collidables exactly once (${n})`);
      assert.equal(car.mesh.material, car.materials, `${where}: solid car has the opaque material`);
    } else {
      assert.equal(n, 0, `${where}: ghost car must not be in the collidables (${n})`);
      assert.equal(car.mesh.material, car.ghostMaterials, `${where}: ghost car has the ghost material`);
    }
    assert.equal(lm.registered.filter((m) => m === car.mesh).length, 1, `${where}: registered once for clearMarkers`);
  }
}

// Puts a car dead centre of the destination (a zone ghost)
function putInZone(lm, car) {
  const lane = lm.traffic.lanes[car.laneIndex];
  const z = LEVELS[lm.levelId].destination.z;
  car.u = lane.dir < 0 ? lane.centreHi - z : z - lane.centreLo;
  lm.traffic.place(car);
}

// Every other car goes 60 m off the road (x is never touched by update), so one car can be tested alone
function isolate(lm, car) {
  for (const other of lm.traffic.cars) if (other !== car) other.mesh.position.x = 60;
}

function parkTaxi(taxi, x, z) {
  taxi.position.set(x, 0, z);
  taxi.updateMatrixWorld(true);
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

test('per-level config: L1 two lanes (4+4), L2 same-direction lanes (3+4), L3 none, <= 10 cars, whole-road range', () => {
  const l1 = LEVELS[1].traffic.lanes;
  assert.deepEqual(l1.map(({ x, dir, speed, count }) => ({ x, dir, speed, count })), [
    { x: -4.5, dir: -1, speed: 9, count: 4 },
    { x: 4.5, dir: 1, speed: 12, count: 4 }
  ]);
  for (const level of [1, 2]) {
    const { zLo, zHi } = LEVELS[level].traffic;
    const b = LEVELS[level].boundaries;
    assert.ok(zLo >= b.minZ && zHi <= b.maxZ, `level ${level}: lane range inside the vehicle bounds`);
    assert.ok(zLo <= -180 && zHi >= 180, `level ${level}: lanes run across the whole road (${zLo}..${zHi})`);
  }
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
  for (const [level, expected] of [[1, 8], [2, 7]]) {
    const { lm, collidables, scene } = make();
    lm.load(level);
    assert.equal(lm.traffic.cars.length, expected);
    const byVariant = new Map();
    for (const { mesh, variant } of lm.traffic.cars) {
      assert.ok(mesh.isMesh && !mesh.isInstancedMesh && mesh.children.length === 0);
      assert.ok(collidables.includes(mesh), 'registered');
      assert.equal(collidables.filter((m) => m === mesh).length, 1, 'registered once');
      assert.equal(mesh.castShadow, false, 'cars cast no shadow');
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

test('initial layout: no car within 40 m of the spawn or 35 m of the destination, 8 m gaps (every seed tried)', () => {
  for (const level of [1, 2]) {
    const { lm, scene } = make();
    lm.load(level);
    const { spawn, destination } = LEVELS[level];
    const cfg = LEVELS[level].traffic;
    assert.equal(cfg.spawnClearance, 40);
    assert.equal(cfg.destinationClearance, 35);

    const check = (traffic, scene3, label) => {
      scene3.updateMatrixWorld(true);
      let nearestSpawn = Infinity;
      let nearestDest = Infinity;
      for (const { mesh } of traffic.cars) {
        box.setFromObject(mesh);
        nearestSpawn = Math.min(nearestSpawn, distanceXZ(box, spawn.x, spawn.z));
        nearestDest = Math.min(nearestDest, distanceXZ(box, destination.x, destination.z));
      }
      assert.ok(nearestSpawn >= 40, `${label}: ${nearestSpawn.toFixed(2)} m from the spawn`);
      assert.ok(nearestDest >= 35, `${label}: ${nearestDest.toFixed(2)} m from the destination`);

      traffic.lanes.forEach((lane, i) => {
        const cars = traffic.cars.filter((c) => c.laneIndex === i);
        for (let a = 0; a < cars.length; a++) {
          for (let b = a + 1; b < cars.length; b++) {
            let d = Math.abs(cars[a].mesh.position.z - cars[b].mesh.position.z);
            d = Math.min(d, lane.trackLength - d);
            assert.ok(d - (cars[a].length + cars[b].length) / 2 >= MIN_CAR_GAP - 1e-6, `${label}: lane ${i} gap`);
          }
        }
      });
      return { nearestSpawn, nearestDest };
    };

    // The real layout, after load and after reset
    const first = check(lm.traffic, scene, `level ${level}`);
    lm.reset();
    check(lm.traffic, scene, `level ${level} after reset`);
    console.log(`  level ${level}: nearest car to the spawn ${first.nearestSpawn.toFixed(1)} m, to the destination ${first.nearestDest.toFixed(1)} m`);

    // And for 100 other seeds: the clearance is a property of the layout, not of one lucky seed
    for (let seed = 1; seed <= 100; seed++) {
      const group = new THREE.Group();
      const traffic = new TrafficSystem({ parent: group });
      const same = { ...LEVELS[level], traffic: { ...cfg, seed } };
      traffic.configure(same);
      check(traffic, group, `level ${level} seed ${seed}`);
      const again = new TrafficSystem({ parent: new THREE.Group() });
      again.configure(same);
      assert.deepEqual(again.cars.map((c) => c.u0), traffic.cars.map((c) => c.u0), `seed ${seed}: deterministic`);
      traffic.dispose();
      again.dispose();
    }
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

test('lane ranges: enter at one end, leave at the other; wraps only at the ends, as far from spawn and destination as the bounds allow', () => {
  const rows = [];
  for (const level of [1, 2]) {
    const { lm } = make();
    lm.load(level);
    const { spawn, destination, boundaries } = LEVELS[level];
    const prev = lm.traffic.cars.map((c) => c.mesh.position.z);
    const wraps = lm.traffic.cars.map(() => 0);
    const wrapZ = [];

    for (let t = 0; t < 240; t += DT) {
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
          // same direction (dir -1): leaves at the -z end, enters at the +z end; oncoming the other way
          const exitZ = lane.dir < 0 ? centreLo : centreHi;
          const entryZ = lane.dir < 0 ? centreHi : centreLo;
          assert.ok(Math.abs(prev[i] - exitZ) < lane.speed * DT * 2, `car left at ${prev[i]}, not at the exit ${exitZ}`);
          assert.ok(Math.abs(z - entryZ) < lane.speed * DT * 2, `car entered at ${z}, not at the entry ${entryZ}`);
          wrapZ.push(prev[i], z);
        } else {
          assert.ok(Math.sign(step) === lane.dir || step === 0, 'moves along its lane direction');
          assert.ok(Math.abs(step - lane.dir * lane.speed * DT) < 1e-6, 'constant speed');
        }
        prev[i] = z;
      });
    }
    assert.ok(wraps.every((n) => n >= 1), `level ${level}: every car wrapped at least once ${wraps}`);

    // Distance from the wrap points to the spawn and the destination. The rule is 120 m; the
    // vehicle clamps to z +-190, so a wrap (the lane ends 5 m inside the bound, at the centre of a
    // car of up to 5.2 m, and a frame of travel) can only be so far from a point near that end of
    // the road. Assert 120 m wherever it is possible, and otherwise that the lane uses all the room
    // the bounds leave.
    const nearest = (point) => Math.min(...wrapZ.map((z) => Math.abs(z - point.z)));
    const nearestBound = (point) => Math.min(...[boundaries.minZ, boundaries.maxZ].map((b) => Math.abs(b - point.z)));
    for (const [name, point] of [['spawn', spawn], ['destination', destination]]) {
      const got = nearest(point);
      const room = nearestBound(point);
      const want = room >= 128 ? 120 : room - 5 - 2.6 - 0.5;
      assert.ok(got >= want - 1e-6, `level ${level}: nearest wrap is ${got.toFixed(1)} m from the ${name}, wanted >= ${want.toFixed(1)}`);
      rows.push(`level ${level} ${name} z=${point.z}: nearest wrap ${got.toFixed(1)} m` + (got < 120 ? ` (below 120 m: only ${room.toFixed(0)} m of road inside the +-190 bounds)` : ''));
    }
    for (const lane of lm.traffic.lanes) {
      const enter = lane.dir < 0 ? lane.zHi : lane.zLo;
      const exit = lane.dir < 0 ? lane.zLo : lane.zHi;
      rows.push(`level ${level} lane x=${lane.x} dir=${lane.dir}: range z ${lane.zLo}..${lane.zHi}, enters z=${enter}, leaves z=${exit}`);
    }
  }
  rows.forEach((r) => console.log('  ' + r));
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

test('1 -> 2 -> 3 -> 1 cycles leave no duplicates or leaks, even while cars are ghosts', () => {
  const { lm, collidables, scene } = make();
  const countCars = () => {
    let n = 0;
    scene.traverse((o) => { if (o.userData.traffic) n++; });
    return n;
  };
  const seen = { 1: null, 2: null, 3: null };
  const disposedGeometries = [];
  const expected = { 1: 8, 2: 7, 3: 0 };

  for (let cycle = 0; cycle < 3; cycle++) {
    for (const level of [1, 2, 3, 1]) {
      // Leave the previous level with ghosts in the zone
      for (const car of lm.traffic.cars.slice(0, 3)) putInZone(lm, car);
      parkTaxi(lm.taxi, 40, 0);
      lm.traffic.update(DT);
      if (lm.traffic.cars.length) {
        assert.ok(lm.traffic.cars.some((c) => !c.solid), 'forced ghosts');
        checkInvariants(lm, collidables, 'before leaving');
      }

      lm.load(level);
      const state = { collidables: collidables.length, cars: countCars(), children: lm.group.children.length };
      assert.equal(state.cars, expected[level], `level ${level}: cars in scene`);
      assert.equal(lm.traffic.cars.length, expected[level]);
      assert.equal(collidables.filter((m) => m.userData.traffic).length, expected[level], 'traffic collidables');
      assert.ok(lm.traffic.cars.every((c) => c.solid), 'a fresh level starts with solid cars');
      assert.equal(new Set(collidables).size, collidables.length, 'no duplicate collidables');
      checkInvariants(lm, collidables, `level ${level} loaded`);
      if (!seen[level]) seen[level] = state;
      assert.deepEqual(state, seen[level], `level ${level} drifted on cycle ${cycle}`);

      // reset() while ghosts exist brings every car back solid, once
      if (lm.traffic.cars.length) {
        for (const car of lm.traffic.cars.slice(0, 2)) putInZone(lm, car);
        parkTaxi(lm.taxi, 40, 0);
        lm.traffic.update(DT);
        const ghosts = lm.traffic.cars.filter((c) => !c.solid).length;
        assert.ok(ghosts >= 2);
        assert.equal(collidables.length, state.collidables - ghosts);
        lm.reset();
        assert.equal(collidables.length, state.collidables, 'reset() restores the collidables');
        assert.equal(new Set(collidables).size, collidables.length, 'no duplicates after reset');
        checkInvariants(lm, collidables, 'after reset');
      }

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

  // clearMarkers() with ghosts around leaves nothing behind
  lm.load(1);
  const ghostMaterials = [...new Set(lm.traffic.cars.flatMap((c) => c.ghostMaterials))];
  assert.ok(ghostMaterials.length >= 2);
  const disposedGhost = ghostMaterials.map((m) => { const f = { d: false }; m.addEventListener('dispose', () => { f.d = true; }); return f; });
  for (const car of lm.traffic.cars.slice(0, 4)) putInZone(lm, car);
  parkTaxi(lm.taxi, 40, 0);
  lm.traffic.update(DT);
  assert.ok(lm.traffic.cars.some((c) => !c.solid));
  lm.clearMarkers();
  assert.equal(collidables.length, 0, 'clearMarkers() leaves no collidable, ghost or not');
  assert.equal(lm.traffic.cars.length, 0);
  assert.equal(countCars(), 0);
  assert.ok(disposedGhost.every((f) => f.d), 'ghost materials disposed');

  lm.load(3);
  assert.equal(collidables.filter((m) => m.userData.traffic).length, 0);
  assert.equal(lm.traffic.cars.length, 0);
  assert.equal(countCars(), 0);
});

test('ghost materials: preallocated, one per colour, shared, transparent, swapped by reference', () => {
  const { lm } = make();
  lm.load(1);
  const byVariant = new Map();
  for (const car of lm.traffic.cars) {
    assert.ok(Array.isArray(car.ghostMaterials) && car.ghostMaterials.length === car.materials.length);
    car.ghostMaterials.forEach((g, i) => {
      assert.notEqual(g, car.materials[i]);
      assert.equal(g.transparent, true);
      assert.ok(g.opacity < 1 && g.opacity > 0);
      assert.equal(g.depthWrite, false);
    });
    const shared = byVariant.get(car.variant);
    if (shared) assert.equal(car.ghostMaterials, shared, 'one ghost material set per variant');
    else byVariant.set(car.variant, car.ghostMaterials);
  }
  // one ghost per source material, so one per colour (and one tail)
  const sources = new Set(lm.traffic.cars.flatMap((c) => c.materials));
  assert.equal(lm.traffic.ghostMaterials.size, sources.size);
  const before = lm.traffic.ghostMaterials.size;
  const car = lm.traffic.cars[0];
  for (let i = 0; i < 5; i++) { lm.traffic.setSolid(car, false); lm.traffic.setSolid(car, true); }
  assert.equal(lm.traffic.ghostMaterials.size, before, 'no ghost material created while swapping');
  assert.equal(car.mesh.material, car.materials);
});

test('zone ghost: non-solid inside 18 m of the destination centre, solid again exactly once on leaving', () => {
  assert.equal(GHOST_ZONE_RADIUS, 18);
  for (const level of [1, 2]) {
    const { lm, collidables, taxi } = make();
    lm.load(level);
    parkTaxi(taxi, 40, 0);                                 // nowhere near
    const dest = LEVELS[level].destination;
    const car = lm.traffic.cars.find((c) => lm.traffic.lanes[c.laneIndex].dir < 0);
    const lane = lm.traffic.lanes[car.laneIndex];
    isolate(lm, car);
    // start 25 m before the zone (z is greater: it drives towards -z)
    car.u = lane.centreHi - (dest.z + 25);
    lm.traffic.place(car);
    const base = collidables.length;

    let flips = 0;
    let was = car.solid;
    let enteredAt = null;
    let leftAt = null;
    for (let t = 0; t < 12; t += DT) {
      lm.traffic.update(DT);
      checkInvariants(lm, collidables, `level ${level} zone`);
      const d = Math.hypot(car.mesh.position.x - dest.x, car.mesh.position.z - dest.z);
      if (car.solid !== was) {
        flips++;
        if (!car.solid) enteredAt = d; else leftAt = d;
        was = car.solid;
      }
      if (d <= GHOST_ZONE_RADIUS) assert.equal(car.solid, false, `inside the zone (${d.toFixed(1)} m) the car is non-solid`);
    }
    assert.equal(flips, 2, 'one ghost spell, one return');
    assert.ok(enteredAt <= GHOST_ZONE_RADIUS + 1e-9 && enteredAt > GHOST_ZONE_RADIUS - 1.5, `became ghost at ${enteredAt}`);
    // Where the lane ends inside the zone (Level 2: the -z end is 17.4 m from the destination centre)
    // the car cannot leave it by driving: it turns solid when it re-enters at the far end
    const endDistance = Math.hypot(lane.x - dest.x, lane.centreLo - dest.z);
    if (endDistance > GHOST_ZONE_RADIUS) {
      assert.ok(leftAt > GHOST_ZONE_RADIUS && leftAt < GHOST_ZONE_RADIUS + 1.5, `solid again at ${leftAt}`);
    } else {
      assert.ok(leftAt > 100, `solid again only after the wrap, at ${leftAt}`);
      console.log(`  level ${level}: the lane's exit end is ${endDistance.toFixed(1)} m from the destination centre, inside the ${GHOST_ZONE_RADIUS} m zone: the wrap is a ghost`);
    }
    assert.equal(collidables.length, base + 0, 'collidables back to baseline');
    assert.equal(lm.traffic.contactGhostCount, 0, 'a zone ghost is not a contact ghost');
  }
});

test('contact ghost: stays a ghost while it overlaps the taxi (longer than 1.5 s), solid again once', () => {
  assert.equal(TRAFFIC_GHOST_TIME, 1.5);
  const { lm, collidables, taxi } = make();
  lm.load(1);
  const traffic = lm.traffic;
  const car = traffic.cars.find((c) => traffic.lanes[c.laneIndex].dir > 0);
  const lane = traffic.lanes[car.laneIndex];
  isolate(lm, car);
  car.u = 120;                                   // z about -62: nowhere near anything
  traffic.place(car);
  const z0 = car.mesh.position.z;
  lane.speed = 0.5;                              // a slow car overlaps the taxi for much longer than the ghost time
  parkTaxi(taxi, lane.x, z0 + 6);                // the car creeps into the parked taxi
  const base = collidables.length;

  const events = [];
  let lastSolid = car.solid;
  let away = false;
  const sim = makeVehicleSim({ taxi, collidables, lm });
  for (let t = 0; t < 12; t += DT) {
    sim.step(DT);
    checkInvariants(lm, collidables, 'contact');
    if (car.solid !== lastSolid) { events.push([t, car.solid ? 'solid' : 'ghost']); lastSolid = car.solid; }
    if (!away && t > 6) { away = true; parkTaxi(taxi, 30, z0); }   // the taxi leaves after a long overlap
  }
  assert.deepEqual(events.map((e) => e[1]), ['ghost', 'solid'], `ghost once, solid once: ${JSON.stringify(events)}`);
  assert.equal(traffic.contactGhostCount, 1, 'ghosted exactly once for the one contact');
  assert.equal(sim.hits, 0, 'a car that drives into a parked taxi is ghosted before the vehicle tests it');
  const span = events[1][0] - events[0][0];
  assert.ok(span > TRAFFIC_GHOST_TIME + 1, `ghost lasted ${span.toFixed(2)} s: it must outlast the ghost time while overlapping`);
  assert.equal(collidables.length, base, 'back to the baseline collidables');
});

test('contact ghost: a short overlap leaves a 1.5 s ghost, then solid, once', () => {
  const { lm, collidables, taxi } = make();
  lm.load(1);
  const traffic = lm.traffic;
  const car = traffic.cars.find((c) => traffic.lanes[c.laneIndex].dir > 0);
  const lane = traffic.lanes[car.laneIndex];
  isolate(lm, car);
  car.u = 120;
  traffic.place(car);
  parkTaxi(taxi, lane.x, car.mesh.position.z + 12);

  const sim = makeVehicleSim({ taxi, collidables, lm });
  const events = [];
  let lastSolid = true;
  for (let t = 0; t < 6; t += DT) {
    sim.step(DT);
    checkInvariants(lm, collidables, 'short contact');
    if (car.solid !== lastSolid) { events.push([t, car.solid ? 'solid' : 'ghost']); lastSolid = car.solid; }
  }
  assert.deepEqual(events.map((e) => e[1]), ['ghost', 'solid']);
  const span = events[1][0] - events[0][0];
  assert.ok(Math.abs(span - TRAFFIC_GHOST_TIME) < 2 * DT, `ghost lasted ${span.toFixed(3)} s, want 1.5`);
  assert.equal(traffic.contactGhostCount, 1);
});

test('a hit stresses the cargo at most once per contact: head-on and from behind, every car of both L1 lanes', () => {
  // The taxi drives at one car: head-on (oncoming lane, taxi 10 m/s vs 12 m/s) or into the back of a
  // slower one (same lane, taxi 25 m/s vs 9 m/s). Per frame the vehicle moves and tests first, then
  // traffic updates (main.js: vehicle.update, then levelManager.update).
  const report = [];
  for (const [laneIndex, taxiSpeed] of [[1, 10], [0, 25]]) {
    const count = LEVELS[1].traffic.lanes[laneIndex].count;
    for (let carIndex = 0; carIndex < count; carIndex++) {
      const { lm, collidables, taxi } = make();
      lm.load(1);
      const traffic = lm.traffic;
      const car = traffic.cars.filter((c) => c.laneIndex === laneIndex)[carIndex];
      const lane = traffic.lanes[laneIndex];
      isolate(lm, car);
      // Every car is tried from the same spot (z = -60, mid road, away from both ends and the zone)
      car.u = lane.dir < 0 ? lane.centreHi + 60 : -60 - lane.centreLo;
      traffic.place(car);
      // 45 m up the road in +z: an oncoming car (moving +z) drives towards the taxi, and a
      // same-direction car (moving -z) has the taxi coming up behind it
      parkTaxi(taxi, lane.x, car.mesh.position.z + 45);
      const sim = makeVehicleSim({ taxi, collidables, lm });
      sim.speed = taxiSpeed;
      for (let t = 0; t < 6; t += DT) {
        sim.step(DT);
        checkInvariants(lm, collidables, `lane ${laneIndex} car ${carIndex}`);
      }
      // 1: the vehicle's own impact. 0: the car moved into the taxi in traffic.update first and was ghosted
      // before the vehicle ever tested it (which frame decides). Never 2.
      assert.ok(sim.hits <= 1, `lane ${laneIndex} car ${carIndex}: ${sim.hits} stress applications for one contact`);
      assert.equal(traffic.contactGhostCount, 1, `lane ${laneIndex} car ${carIndex}: ${traffic.contactGhostCount} contact ghosts for one contact`);
      report.push(sim.hits);
    }
  }
  console.log(`  stress applications per contact: ${report.join(',')} (1 = the vehicle's own impact, 0 = ghosted first; never more)`);
});

test('ghosting is wired through LevelManager.update (vehicle step, then traffic)', () => {
  const { lm, collidables, taxi } = make();
  lm.load(1);
  const car = lm.traffic.cars.find((c) => lm.traffic.lanes[c.laneIndex].dir > 0);
  const lane = lm.traffic.lanes[car.laneIndex];
  isolate(lm, car);
  car.u = 100;
  lm.traffic.place(car);
  parkTaxi(taxi, lane.x, car.mesh.position.z + 8);
  for (let t = 0; t < 3; t += DT) lm.update(DT, t);
  assert.equal(lm.status, 'driving');
  assert.equal(lm.traffic.contactGhostCount, 1);
  checkInvariants(lm, collidables, 'wired');
});

test('update() does not allocate, ghost transitions included (no garbage collection over 300k frames)', async () => {
  const { lm, collidables } = make();
  lm.load(2);
  const traffic = lm.traffic;
  // The taxi's world matrix stays at the origin, in lane x = 0's path: cars ghost and come back all the time
  lm.taxi.position.set(0, 0, 0);
  lm.taxi.updateMatrixWorld(true);
  for (let i = 0; i < 2000; i++) traffic.update(DT);    // warm up the JIT

  let gcs = 0;
  const observer = new PerformanceObserver((list) => { gcs += list.getEntries().length; });
  observer.observe({ entryTypes: ['gc'] });
  await new Promise((r) => setTimeout(r, 20));
  gcs = 0;
  const before = traffic.contactGhostCount;

  for (let i = 0; i < 300000; i++) traffic.update(DT);

  await new Promise((r) => setTimeout(r, 50));
  gcs += observer.takeRecords().length;
  observer.disconnect();
  const transitions = traffic.contactGhostCount - before;
  assert.ok(transitions > 50, `the loop exercised ${transitions} ghost transitions`);
  checkInvariants(lm, collidables, 'after the long loop');
  assert.equal(gcs, 0, `${gcs} GC events while updating traffic (${transitions} ghost transitions)`);
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
