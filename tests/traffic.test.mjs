// Headless traffic test: node tests/traffic.test.mjs
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { PerformanceObserver } from 'node:perf_hooks';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import {
  TrafficSystem, MIN_CAR_GAP, TRAFFIC_VARIANTS, GHOST_ZONE_RADIUS,
  CONTACT_MARGIN, HOLD_TIME, RESUME_TIME
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
    parkTaxi(lm.taxi, 40, 0);                      // clear of every lane: no hold
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
  }
});

// ---------- hit stop: lane hold ----------

// True overlap (no margin) between a car and the taxi, from fresh world matrices
const trueBox = new THREE.Box3();
const trueTaxi = new THREE.Box3();
function overlapsNow(lm, taxi, car) {
  taxi.updateWorldMatrix(true, false);
  trueTaxi.copy(lm.vehicle.localTaxiCollisionBox).applyMatrix4(taxi.matrixWorld);
  trueBox.setFromObject(car.mesh);
  return trueTaxi.intersectsBox(trueBox);
}

// Bumper-to-bumper gap of the closest pair of a lane, around the loop
function minLaneGap(traffic, laneIndex) {
  const lane = traffic.lanes[laneIndex];
  const cars = traffic.cars.filter((c) => c.laneIndex === laneIndex);
  let min = Infinity;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      let d = Math.abs(cars[i].u - cars[j].u);
      d = Math.min(d, lane.trackLength - d);
      min = Math.min(min, d - (cars[i].length + cars[j].length) / 2);
    }
  }
  return min;
}

const oncoming = (traffic) => traffic.lanes.findIndex((l) => l.dir > 0);

test('constants: 0.6 m contact margin, 1.0 s hold, 0.5 s resume; the contact ghost is gone', () => {
  assert.equal(CONTACT_MARGIN, 0.6);
  assert.equal(HOLD_TIME, 1.0);
  assert.equal(RESUME_TIME, 0.5);
  const { lm } = make();
  lm.load(1);
  assert.ok(lm.traffic.cars.every((c) => !('ghostTime' in c)));
  assert.equal('contactGhostCount' in lm.traffic, false);
});

test('a taxi driving into an oncoming car (8, 15, 25 m/s): exactly one stress, the car never overlaps the taxi after the detecting frame', () => {
  const report = [];
  for (const taxiSpeed of [8, 15, 25]) {
    const { lm, collidables, taxi } = make();
    lm.load(1);
    const traffic = lm.traffic;
    const laneIndex = oncoming(traffic);
    const lane = traffic.lanes[laneIndex];
    const car = traffic.cars.find((c) => c.laneIndex === laneIndex);
    isolate(lm, car);
    car.u = -60 - lane.centreLo;                       // z = -60, away from both ends and the zone
    traffic.place(car);
    parkTaxi(taxi, lane.x, car.mesh.position.z + 45);  // 45 m up the road, facing the car (heading 0 is -z)
    const sim = makeVehicleSim({ taxi, collidables, lm });
    sim.speed = taxiSpeed;

    let hitFrames = 0;
    let overlapFrames = 0;
    let held = false;
    for (let t = 0; t < 10; t += DT) {
      const before = sim.hits;
      sim.step(DT);
      if (sim.hits > before) hitFrames++;
      // the vehicle detects the overlap inside step() and puts the taxi back, so none is left over
      if (overlapsNow(lm, taxi, car)) overlapFrames++;
      if (lane.scale === 0) held = true;
      checkInvariants(lm, collidables, `${taxiSpeed} m/s`);
    }
    assert.equal(sim.hits, 1, `${taxiSpeed} m/s: ${sim.hits} stress applications`);
    assert.equal(hitFrames, 1);
    assert.equal(overlapFrames, 0, `${taxiSpeed} m/s: the car overlaps the taxi after a step on ${overlapFrames} frames`);
    assert.ok(held, 'the lane was held');
    report.push(sim.hits);
  }
  console.log(`  stress applications at 8/15/25 m/s: ${report.join('/')}`);
});

test('a car about to move into a parked taxi stops before touching it, and stays stopped', () => {
  const { lm, collidables, taxi } = make();
  lm.load(1);
  const traffic = lm.traffic;
  const laneIndex = oncoming(traffic);
  const lane = traffic.lanes[laneIndex];
  const car = traffic.cars.find((c) => c.laneIndex === laneIndex);
  isolate(lm, car);
  car.u = 120;
  traffic.place(car);
  parkTaxi(taxi, lane.x, car.mesh.position.z + 20);
  const sim = makeVehicleSim({ taxi, collidables, lm });

  let minGap = Infinity;
  let stopped = false;
  let moved = false;
  for (let t = 0; t < 8; t += DT) {
    const z0 = car.mesh.position.z;
    sim.step(DT);
    trueBox.setFromObject(car.mesh);
    trueTaxi.copy(lm.vehicle.localTaxiCollisionBox).applyMatrix4(taxi.matrixWorld);
    minGap = Math.min(minGap, trueTaxi.min.z - trueBox.max.z);
    if (stopped && car.mesh.position.z !== z0) moved = true;
    if (lane.scale === 0) stopped = true;
  }
  assert.equal(sim.hits, 0, 'no contact for the vehicle to react to');
  assert.ok(minGap >= CONTACT_MARGIN - 1e-6, `the car stopped ${minGap.toFixed(3)} m from the taxi, want >= ${CONTACT_MARGIN}`);
  assert.ok(stopped && !moved, 'it stayed put while the taxi is parked there');
  assert.equal(lane.scale, 0);
});

test('lane hold: every car of the lane stops on the same frame, waits 1.0 s, resumes smoothly, gap never below 8 m', () => {
  const { lm, taxi } = make();
  lm.load(1);
  const traffic = lm.traffic;
  const laneIndex = oncoming(traffic);
  const lane = traffic.lanes[laneIndex];
  const other = traffic.lanes.findIndex((_, i) => i !== laneIndex);
  const cars = traffic.cars.filter((c) => c.laneIndex === laneIndex);
  const otherCars = traffic.cars.filter((c) => c.laneIndex === other);
  assert.ok(cars.length > 2);
  const target = cars[0];

  const zs = () => cars.map((c) => c.mesh.position.z);
  const otherZs = () => otherCars.map((c) => c.mesh.position.z);
  // the taxi is parked in the target's path, 12 m ahead; the cars keep their seeded layout
  parkTaxi(taxi, lane.x, target.mesh.position.z + 12);
  assert.ok(!cars.some((c) => c !== target && overlapsNow(lm, taxi, c)));

  let frame = 0;
  let minGap = Infinity;
  const step = () => {
    traffic.update(DT);
    frame++;
    minGap = Math.min(minGap, minLaneGap(traffic, laneIndex), minLaneGap(traffic, other));
  };

  let stopFrame = null;
  const otherBefore = otherZs();
  for (let i = 0; i < 300 && stopFrame === null; i++) {
    const before = zs();
    step();
    if (lane.scale === 0) {
      stopFrame = frame;
      // the very frame the hold starts, NO car of the lane has moved
      assert.deepEqual(zs(), before, 'all cars of the lane stopped on the same frame');
    }
  }
  assert.ok(stopFrame !== null, 'the target car got into contact');
  assert.notDeepEqual(otherZs(), otherBefore, 'the other lane keeps moving');

  // parked taxi: stays stopped as long as the contact lasts
  for (let i = 0; i < 180; i++) {
    const before = zs();
    step();
    assert.deepEqual(zs(), before, 'still stopped while the taxi is parked there');
  }

  // the taxi leaves; HOLD_TIME later the lane starts again, smoothly
  parkTaxi(taxi, 40, 0);
  const full = lane.speed * DT;
  const leftAt = frame;
  let stoppedFrames = 0;
  let lastStep = 0;
  let maxJump = 0;
  let reachedFull = null;
  for (let i = 0; i < 180; i++) {
    const before = zs();
    step();
    const after = zs();
    const moved = Math.abs(after[0] - before[0]);
    // every car of the lane moves by the same amount: one scale
    cars.forEach((c, k) => {
      const d = Math.abs(after[k] - before[k]);
      if (d < 5) assert.ok(Math.abs(d - moved) < 1e-9, 'cars of one lane moved by different amounts');
    });
    if (moved === 0) stoppedFrames++;
    else {
      maxJump = Math.max(maxJump, moved - lastStep);
      assert.ok(moved >= lastStep - 1e-9, 'speed rises monotonically while resuming');
      lastStep = moved;
      if (reachedFull === null && Math.abs(moved - full) < 1e-9) reachedFull = frame - leftAt;
    }
  }
  assert.ok(Math.abs(stoppedFrames - HOLD_TIME / DT) <= 2, `stopped ${stoppedFrames} frames after the last contact, want ${HOLD_TIME / DT}`);
  assert.ok(maxJump < 0.1 * full, `speed jumped by ${(maxJump / full).toFixed(3)} of full in one frame`);
  assert.ok(Math.abs(reachedFull - (HOLD_TIME + RESUME_TIME) / DT) <= 2, `full speed after ${reachedFull} frames`);
  assert.ok(minGap >= MIN_CAR_GAP - 1e-6, `minimum gap ${minGap.toFixed(2)}`);
});

test('lane hold: the 8 m gap holds through repeated stops and restarts, across the wrap', () => {
  for (const level of [1, 2]) {
    const { lm, taxi } = make();
    lm.load(level);
    const traffic = lm.traffic;
    let minGap = Infinity;
    let wraps = 0;
    let holds = 0;
    for (let laneIndex = 0; laneIndex < traffic.lanes.length; laneIndex++) {
      const lane = traffic.lanes[laneIndex];
      const first = traffic.cars.find((c) => c.laneIndex === laneIndex);
      const lastU = new Map(traffic.cars.map((c) => [c, c.u]));
      let wasHeld = false;
      // 150 s: 4 s parked in front of the first car every 12 s, then away
      for (let t = 0; t < 150; t += DT) {
        const phase = t % 12;
        if (phase < DT) {
          const z = first.mesh.position.z + (lane.dir > 0 ? 6 : -6);
          parkTaxi(taxi, lane.x, z);
        } else if (phase >= 4 && phase < 4 + DT) {
          parkTaxi(taxi, 40, 0);
        }
        traffic.update(DT);
        minGap = Math.min(minGap, minLaneGap(traffic, laneIndex));
        for (const c of traffic.cars) {
          if (c.laneIndex === laneIndex) {
            if (c.u < lastU.get(c)) wraps++;
            lastU.set(c, c.u);
          }
        }
        if (lane.scale === 0 && !wasHeld) holds++;
        wasHeld = lane.scale === 0;
      }
      parkTaxi(taxi, 40, 0);
    }
    assert.ok(wraps > 0, `level ${level}: cars wrapped`);
    assert.ok(holds > 0, `level ${level}: lanes were held`);
    assert.ok(minGap >= MIN_CAR_GAP - 1e-6, `level ${level}: gap ${minGap.toFixed(3)}`);
    console.log(`  level ${level}: ${holds} holds, ${wraps} wraps, minimum gap ${minGap.toFixed(2)} m`);
  }
});

test('a taxi driving alongside in the middle of the road (x = 0, L1 gap 2.16 m) never triggers a hold', () => {
  const { lm, collidables, taxi } = make();
  lm.load(1);
  const traffic = lm.traffic;
  const top = traffic.lanes[0].zHi - 6;
  parkTaxi(taxi, 0, top);
  const sim = makeVehicleSim({ taxi, collidables, lm });
  sim.speed = 25;
  let held = 0;
  for (let t = 0; t < 12; t += DT) {
    sim.step(DT);
    held += traffic.lanes.filter((l) => l.scale < 1).length;
    if (taxi.position.z < traffic.lanes[0].zLo + 6) break;
  }
  assert.ok(taxi.position.z < top - 100, `the taxi drove the road (z = ${taxi.position.z.toFixed(0)})`);
  assert.equal(held, 0, 'no lane was ever held');
  assert.equal(sim.hits, 0);
});

test('zone ghosts never trigger a hold, and never block the delivery', () => {
  for (const level of [1, 2]) {
    const { lm, collidables, taxi } = make();
    lm.load(level);
    const traffic = lm.traffic;
    const dest = LEVELS[level].destination;
    parkTaxi(taxi, dest.x, dest.z);
    // a car dead centre on the taxi, in the zone: a ghost, overlapping the taxi box
    const car = traffic.cars[0];
    putInZone(lm, car);
    car.mesh.position.x = dest.x;
    traffic.update(0);
    assert.equal(car.solid, false);
    assert.ok(overlapsNow(lm, taxi, car), 'the ghost sits on the taxi');
    assert.equal(collidables.includes(car.mesh), false);
    for (const lane of traffic.lanes) assert.equal(lane.scale, 1, 'no hold from a ghost');
    for (let t = 0; t < 1; t += DT) {
      lm.update(DT, t);
      if (lm.status !== 'driving') break;
    }
    assert.equal(lm.status, 'delivered', `level ${level}: delivered with a ghost car on the taxi`);
    for (const lane of traffic.lanes) assert.equal(lane.scale, 1);
  }
});

test('reset(), load(), clearMarkers() and 1 -> 2 -> 3 -> 1 cycles clear any hold, with no duplicates or leaks', () => {
  const { lm, collidables, taxi } = make();
  const baseline = {};
  const hold = () => {
    const car = lm.traffic.cars.find((c) => !lm.traffic.inGhostZone(c));
    parkTaxi(taxi, car.mesh.position.x, car.mesh.position.z + 3);
    lm.traffic.update(DT);
    assert.equal(lm.traffic.lanes[car.laneIndex].scale, 0, 'held');
  };
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const level of [1, 2, 3, 1]) {
      lm.load(level);
      for (const lane of lm.traffic.lanes) {
        assert.equal(lane.scale, 1, 'load() starts without a hold');
        assert.ok(lane.sinceContact >= HOLD_TIME + RESUME_TIME);
      }
      assert.ok(lm.traffic.cars.every((c) => c.solid));
      const snap = { collidables: collidables.length, scene: lm.group.children.length, cars: lm.traffic.cars.length };
      baseline[level] ??= snap;
      assert.deepEqual(snap, baseline[level], `level ${level} drifted`);
      assert.equal(new Set(collidables).size, collidables.length, 'no duplicate collidables');
      checkInvariants(lm, collidables, `level ${level}`);

      if (lm.traffic.cars.length) {
        const start = snapshot(lm);
        hold();
        lm.reset();
        for (const lane of lm.traffic.lanes) assert.equal(lane.scale, 1, 'reset() clears the hold');
        assert.deepEqual(snapshot(lm), start, 'reset() restores the layout');
        assert.equal(collidables.length, snap.collidables);
        checkInvariants(lm, collidables, 'after reset');
        hold();                                   // leave this level held; the next load() must clear it
      }
    }
  }
  lm.load(1);
  hold();
  lm.clearMarkers();
  assert.equal(lm.traffic.lanes.length, 0, 'clearMarkers() drops the lanes (and the hold)');
  assert.equal(collidables.length, 0);
  lm.load(1);
  assert.ok(lm.traffic.lanes.every((l) => l.scale === 1));
  assert.equal(collidables.filter((m) => m.userData.traffic).length, baseline[1].cars);
});

test('the hold is wired through LevelManager.update (vehicle step, then traffic)', () => {
  const { lm, taxi } = make();
  lm.load(1);
  const car = lm.traffic.cars.find((c) => lm.traffic.lanes[c.laneIndex].dir > 0);
  const lane = lm.traffic.lanes[car.laneIndex];
  isolate(lm, car);
  car.u = 100;
  lm.traffic.place(car);
  parkTaxi(taxi, lane.x, car.mesh.position.z + 8);
  for (let t = 0; t < 3; t += DT) lm.update(DT, t);
  assert.equal(lm.status, 'driving');
  assert.equal(lane.scale, 0);
});

test('update() does not allocate, hold transitions included (no garbage collection over 300k frames)', async () => {
  const { lm, collidables } = make();
  lm.load(2);
  const traffic = lm.traffic;
  // The taxi keeps moving in and out of the first lane's path: it is held and released all the time
  const lane = traffic.lanes[0];
  const first = traffic.cars.find((c) => c.laneIndex === 0);
  const run = (n) => {
    let flips = 0;
    let was = false;
    for (let i = 0; i < n; i++) {
      // the taxi sits in front of the first car for 200 frames, then 200 frames away
      if (i % 400 === 0) lm.taxi.position.set(lane.x, 0, first.mesh.position.z + lane.dir * 6);
      else if (i % 400 === 200) lm.taxi.position.set(40, 0, 0);
      if (i % 200 === 0) lm.taxi.updateMatrixWorld(true);
      traffic.update(DT);
      const held = traffic.lanes.some((l) => l.scale < 1);
      if (held !== was) flips++;
      was = held;
    }
    return flips;
  };
  run(2000);                                                               // warm up the JIT

  let gcs = 0;
  const observer = new PerformanceObserver((list) => { gcs += list.getEntries().length; });
  observer.observe({ entryTypes: ['gc'] });
  await new Promise((r) => setTimeout(r, 20));
  gcs = 0;

  const flips = run(300000);

  await new Promise((r) => setTimeout(r, 50));
  gcs += observer.takeRecords().length;
  observer.disconnect();
  assert.ok(flips > 10, `the loop exercised ${flips} hold transitions`);
  checkInvariants(lm, collidables, 'after the long loop');
  assert.equal(gcs, 0, `${gcs} GC events while updating traffic (${flips} hold transitions)`);
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
