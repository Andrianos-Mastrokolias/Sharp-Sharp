// Headless environment lifecycle test: node tests/environments.test.mjs
// Switches levels repeatedly and checks nothing leaks or duplicates:
// scene children, shared collidables and potholes return to the same
// counts, every geometry / material / cloned texture of a replaced
// environment is disposed, and the library's base textures never are.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import { ROAD_ALBEDO } from '../src/world/environments/township.js';
import { createTownshipHouse } from '../src/world/environments/props.js';
import { MAIN_POTHOLES, SPEED_BUMP } from '../src/world/environments/helpers.js';

// ---- A MaterialLibrary stand-in (the real one needs a renderer + images)
function makeLibrary() {
  const baseTextures = [];

  const set = () => {
    const s = {
      color: new THREE.Texture(),
      normal: new THREE.Texture(),
      roughness: new THREE.Texture(),
      ao: new THREE.Texture()
    };
    for (const t of Object.values(s)) {
      t.addEventListener('dispose', () => lib.baseDisposed++);
      baseTextures.push(t);
    }
    return s;
  };

  const lib = {
    baseDisposed: 0,
    road: set(), pavement: set(), grass: set(),
    concreteBuilding: set(), brickBuilding: set(), roughConcrete: set(),
    baseTextures
  };

  // Same contract as MaterialLibrary.createMaterial: new material, cloned maps
  const make = (s, rx, ry) => {
    const clone = (t) => { const c = t.clone(); c.repeat.set(rx, ry); return c; };
    return new THREE.MeshStandardMaterial({
      map: clone(s.color), normalMap: clone(s.normal),
      roughnessMap: clone(s.roughness), aoMap: clone(s.ao)
    });
  };

  lib.createRoadMaterial = () => make(lib.road, 1, 1);
  lib.createPavementMaterial = () => make(lib.pavement, 1, 1);
  lib.createGrassMaterial = () => make(lib.grass, 1, 1);
  lib.createConcreteBuildingMaterial = (ry) => make(lib.concreteBuilding, 1, ry);
  lib.createBrickBuildingMaterial = (ry) => make(lib.brickBuilding, 1, ry);
  lib.createRoughConcreteMaterial = (rx, ry) => make(lib.roughConcrete, rx, ry);

  return lib;
}

function make() {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  const collidables = [];
  const potholes = MAIN_POTHOLES.map((p) => ({ ...p }));
  const materials = makeLibrary();

  const vehicle = {
    settings: { maxForwardSpeed: 28 },
    cargoSystem: { getState: () => ({ remaining: 5, total: 5 }) },
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(spawn) { taxi.position.set(spawn.x, 0, spawn.z); },
    getSpeed: () => 0,
    getHighSpeedTime: () => 0,
    getLevel2Pressure: () => 0
  };

  const lm = new LevelManager({
    scene, vehicle, taxi, collidables, potholes, materials,
    getHeadlightsEnabled: () => true
  });

  return { scene, lm, collidables, potholes, materials };
}

// Everything an environment owns, gathered before it is replaced
function ownedResources(root) {
  const geometries = new Set();
  const mats = new Set();
  const textures = new Set();

  root.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material ?? [])) {
      mats.add(m);
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'aoMap']) {
        if (m[slot]) textures.add(m[slot]);
      }
    }
  });

  return { geometries, mats, textures };
}

function trackDisposal(resources) {
  const disposed = new Set();
  for (const r of [...resources.geometries, ...resources.mats, ...resources.textures]) {
    r.addEventListener('dispose', () => disposed.add(r));
  }
  return disposed;
}

// ---- Motorway checks (level 2) -----------------------------------------
const FLYOVER_VOLUME = new THREE.Box3(
  new THREE.Vector3(3, 0, -110),
  new THREE.Vector3(9.4, 3.4, 10)       // deck 2.5 m + 0.9 m rails
);

// True when any part of the object that stands above the road surface
// lies inside the volume. Plain meshes use their world box; instanced
// meshes are checked vertex by vertex per instance, because one box
// around a whole lamp pole (base to arm) would be far too coarse.
function crossesVolume(object, volume) {
  let crosses = false;
  object.traverse((o) => {
    if (!o.geometry || crosses) return;
    if (o.isInstancedMesh) {
      const p = new THREE.Vector3();
      const m = new THREE.Matrix4();
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < o.count && !crosses; i++) {
        o.getMatrixAt(i, m);
        m.premultiply(o.matrixWorld);
        for (let v = 0; v < pos.count; v++) {
          p.fromBufferAttribute(pos, v).applyMatrix4(m);
          if (p.y > 0.1 && volume.containsPoint(p)) { crosses = true; break; }
        }
      }
    } else {
      const box = new THREE.Box3().setFromObject(o);
      if (box.max.y > 0.1 && box.intersectsBox(volume)) crosses = true;   // > 0.1: not road markings
    }
  });
  return crosses;
}

function checkMotorway(step, lm, scene, collidables) {
  scene.updateMatrixWorld(true);
  const env = lm.environment;
  const named = (name) => {
    const found = [];
    env.group.traverse((o) => { if (o.name === name) found.push(o); });
    return found;
  };

  // Only the two barriers are the environment's collidables; with the
  // flyover rails (6), pillars (4) and the 7 traffic cars the level is 19.
  // The ceiling was 15; raised to 20 on purpose for traffic (M2-07).
  assert.equal(env.collidables.length, 2, `step ${step}: motorway collidables`);
  assert.ok(env.collidables.every((m) => m.name === 'motorway-barrier'));
  assert.equal(collidables.length, 2 + 6 + 4 + 7, `step ${step}: level 2 collidables`);
  assert.ok(collidables.length <= 20, `step ${step}: level 2 collidable budget (${collidables.length})`);

  // Barriers sit at |x| ~ 10.3 on both sides and clear every flyover collidable
  const barriers = named('motorway-barrier');
  assert.deepEqual(barriers.map((b) => Math.sign(b.position.x)).sort(), [-1, 1]);
  const others = collidables.filter((m) => !env.collidables.includes(m));
  assert.ok(others.length >= 10, 'flyover rails/pillars not registered');
  for (const barrier of barriers) {
    const box = new THREE.Box3().setFromObject(barrier);
    assert.ok(Math.abs(Math.abs(barrier.position.x) - 10.3) < 0.05, 'barrier x');
    assert.ok(Math.min(Math.abs(box.min.x), Math.abs(box.max.x)) >= 9.9, 'barrier inner face');
    for (const other of others) {
      assert.ok(!box.intersectsBox(new THREE.Box3().setFromObject(other)), `step ${step}: barrier intersects flyover part`);
    }
  }

  // Gantry: beam and sign at least 6.5 m up, legs outside the barriers,
  // and wholly north of the flyover ramp toe (z = 10)
  const [beam] = named('gantry-beam');
  const [sign] = named('gantry-sign');
  const legs = named('gantry-leg');
  assert.ok(beam && sign && legs.length === 2, 'gantry parts');
  assert.ok(new THREE.Box3().setFromObject(beam).min.y >= 6.5, 'gantry beam height');
  assert.ok(new THREE.Box3().setFromObject(sign).min.y >= 6.5, 'gantry sign height');
  for (const leg of legs) {
    const box = new THREE.Box3().setFromObject(leg);
    assert.ok(Math.min(Math.abs(box.min.x), Math.abs(box.max.x)) >= 11, 'gantry leg |x|');
  }
  for (const part of [beam, sign, ...legs]) {
    const box = new THREE.Box3().setFromObject(part);
    assert.ok(box.min.z > 10, 'gantry must stay clear of the flyover');
    assert.ok(Math.abs((box.min.z + box.max.z) / 2 - 100) < 1, 'gantry at z = 100');
  }

  // Nothing standing above the road surface enters the flyover volume
  assert.ok(!crossesVolume(env.group, FLYOVER_VOLUME), `step ${step}: a prop crosses the flyover`);

  // Lamps are instanced (one InstancedMesh) and add no real lights
  let lamps = 0;
  env.group.traverse((o) => {
    assert.ok(!o.isLight, 'motorway must not add lights');
    if (o.isInstancedMesh && Array.isArray(o.material)) lamps++;
  });
  assert.equal(lamps, 1, 'lamp poles: one InstancedMesh');

  // Sign texture is on the sign material, so dispose() must free it
  assert.ok(sign.material.map?.isTexture, 'sign texture');
  return sign.material.map;
}

// ---- City street checks (level 1: street life) ----------------------------
// (tests/people.test.mjs covers where people may stand; this is the lifecycle:
// they must not leak, duplicate or become collidable across level switches)
function checkCity(step, lm, collidables) {
  const env = lm.environment;
  const named = (name) => {
    const found = [];
    env.group.traverse((o) => { if (o.name === name) found.push(o); });
    return found;
  };

  const people = named('life-people');
  assert.ok(people.length > 0, `step ${step}: level 1 people`);

  let instances = 0;
  for (const mesh of people) {
    assert.ok(mesh.isInstancedMesh && !Array.isArray(mesh.material), `step ${step}: people are single-material InstancedMeshes`);
    assert.ok(!collidables.includes(mesh), `step ${step}: people must not be collidable`);
    assert.equal(mesh.material.customProgramCacheKey(), 'person-walk-v1', 'people shader key');
    instances += mesh.count;
  }
  assert.ok(instances >= 150 && instances <= 220, `step ${step}: ${instances} people`);

  // Four side streets: a surface and a zebra each, nothing collidable
  const zebras = [];
  env.group.traverse((o) => {
    if (o.isInstancedMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.height === 0.025 && o.geometry.parameters.width === 2.8) zebras.push(o);
  });
  assert.equal(zebras.length, 4, `step ${step}: zebra crossings`);
  assert.equal(env.collidables.length, 26, `step ${step}: level 1 collidables unchanged`);
  // 26 buildings + 8 traffic cars (LevelManager registers the cars, not the environment)
  assert.ok(collidables.length === 26 + 8, `step ${step}: shared collidable array (${collidables.length})`);

  return people.length;
}

// ---- Township checks (level 3) ------------------------------------------
const CORRIDOR = 7.5;                       // route runs between x = +-5, taxi 2.7 m wide

function absXRange(box) {
  const lo = box.min.x <= 0 && box.max.x >= 0 ? 0 : Math.min(Math.abs(box.min.x), Math.abs(box.max.x));
  return [lo, Math.max(Math.abs(box.min.x), Math.abs(box.max.x))];
}

function checkTownship(step, lm, scene, collidables) {
  scene.updateMatrixWorld(true);
  const env = lm.environment;
  const named = (name) => {
    const found = [];
    env.group.traverse((o) => { if (o.name === name) found.push(o); });
    return found;
  };

  // Budget: at most ~40 collidables, all childless single Meshes (checked
  // for every level above); only these kinds are collidable
  assert.ok(env.collidables.length <= 40, `step ${step}: township collidable budget (${env.collidables.length})`);
  assert.ok(collidables.length <= 40, 'shared collidable array budget');
  const kinds = new Set(['township-houses', 'township-fence', 'township-wreck', 'township-bin']);
  assert.ok(env.collidables.every((m) => kinds.has(m.name)), 'unexpected collidable kind');
  for (const kind of kinds) {
    assert.ok(env.collidables.some((m) => m.name === kind), `no collidable ${kind}`);
  }

  // No collidable intrudes into the route corridor |x| < 7.5
  for (const mesh of env.collidables) {
    const [lo] = absXRange(new THREE.Box3().setFromObject(mesh));
    assert.ok(lo >= CORRIDOR, `step ${step}: ${mesh.name} reaches into the route corridor (|x| ${lo.toFixed(2)})`);
  }

  // Houses at |x| >= 11, fences at about 10..10.5, props never through the fence
  for (const mesh of named('township-houses')) {
    const [lo] = absXRange(new THREE.Box3().setFromObject(mesh));
    assert.ok(lo >= 11, `house body at |x| ${lo}`);
  }
  for (const mesh of named('township-fence')) {
    const [lo, hi] = absXRange(new THREE.Box3().setFromObject(mesh));
    assert.ok(lo >= 10 && hi <= 10.5, `fence |x| ${lo}..${hi}`);
  }
  for (const mesh of [...named('township-wreck'), ...named('township-bin')]) {
    const [, hi] = absXRange(new THREE.Box3().setFromObject(mesh));
    assert.ok(hi < 10.1, `${mesh.name} pokes into the fence (|x| ${hi})`);
  }
  const [roofs] = named('township-roofs');
  const roofPos = roofs.geometry.attributes.position;
  for (let i = 0; i < roofPos.count; i++) {
    assert.ok(Math.abs(roofPos.getX(i)) >= 10.9, 'roof overhang reaches the road');
  }

  // No sidewalks and no shop-scale buildings (the city's 7 x 0.3 x 28 sidewalk)
  env.group.traverse((o) => {
    const g = o.geometry?.parameters;
    assert.ok(!(o.geometry?.type === 'BoxGeometry' && g.width === 7 && g.height === 0.3 && g.depth === 28), 'sidewalk');
  });

  // Nothing lights the road: no lights, and the only emissive material is the
  // (at most 6) faint candle windows
  const candles = named('township-candles');
  assert.equal(candles.length, 1);
  assert.ok(candles[0].isInstancedMesh && candles[0].count >= 1 && candles[0].count <= 6, 'candle count');
  assert.ok(candles[0].material.emissiveIntensity <= 0.6, 'candles must be faint');
  env.group.traverse((o) => {
    assert.ok(!o.isLight, 'township must not add lights');
    if (!o.material || o === candles[0]) return;
    for (const m of [].concat(o.material)) {
      assert.ok(!m.emissive || m.emissive.getHex() === 0 || m.emissiveIntensity === 0, `${o.name || o.type}: emissive material`);
    }
  });

  // Dead lamps: present, instanced, plain material
  const [lamps] = named('township-lamps');
  assert.ok(lamps?.isInstancedMesh && lamps.count > 10, 'dead lamp poles present');
  assert.ok(!Array.isArray(lamps.material) && lamps.material.emissive.getHex() === 0, 'lamp must be dead');

  // Canvas textures on the structure materials are the environment's own
  const textures = [];
  for (const name of ['township-houses', 'township-fence', 'township-roofs']) {
    for (const mesh of named(name)) {
      for (const m of [].concat(mesh.material)) if (m.map) textures.push(m.map);
    }
  }
  assert.ok(new Set(textures).size >= 2, 'block + corrugated textures');
  return [...new Set(textures)];
}

// ---- Roof, glow and marker checks (level 3 playtest fixes) -----------------

// A mesh is closed when every edge is shared by exactly two triangles
// (vertices welded by position): no gaps between roof and walls' tops,
// no open sides.
function assertWatertight(geometry, label) {
  const pos = geometry.attributes.position;
  const index = geometry.index?.array;
  const ids = new Map();
  const id = (i) => {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    return ids.get(key);
  };
  const edges = new Map();
  const count = index ? index.length : pos.count;
  for (let t = 0; t < count; t += 3) {
    const tri = [0, 1, 2].map((k) => id(index ? index[t + k] : t + k));
    for (let k = 0; k < 3; k++) {
      const a = tri[k];
      const b = tri[(k + 1) % 3];
      if (a === b) continue;                                   // degenerate
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, n] of edges) {
    assert.equal(n, 2, `${label}: edge ${key} used by ${n} triangles (roof is not closed)`);
  }
}

// Triangles whose outward normal points up. The walls must have none,
// so no textured wall top is ever drawn.
function upwardTriangles(geometry) {
  const pos = geometry.attributes.position;
  const index = geometry.index?.array;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let up = 0;
  const count = index ? index.length : pos.count;
  for (let t = 0; t < count; t += 3) {
    const [i, j, k] = [0, 1, 2].map((m) => (index ? index[t + m] : t + m));
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, j);
    c.fromBufferAttribute(pos, k);
    n.subVectors(c, b).cross(a.sub(b));
    if (n.y > 1e-9 && n.y > Math.hypot(n.x, n.z)) up++;
  }
  return up;
}

function geometryBox(geometry) {
  geometry.computeBoundingBox();
  return geometry.boundingBox.clone();
}

const MIN_OVERHANG = 0.3;        // the brief: about 0.3 m on all sides

function checkRoofsClosed() {
  // A spread of houses: both sides, both slope directions, with and without annex
  for (const side of [-1, 1]) {
    for (const slopeToRoad of [true, false]) {
      for (const annex of [null, { at: 0.3, color: 0x8c4a2f }, { at: 0.7, color: 0x6e7378 }]) {
        const house = createTownshipHouse({
          side, front: 12, z: 20, length: 8, depth: 5, height: 2.6, kind: 'block',
          wallColor: 0xb9b3a8, roofColor: 0x8c4a2f, roofDrop: 0.6, slopeToRoad, annex
        });
        const label = `side ${side} slopeToRoad ${slopeToRoad} annex ${annex ? annex.at : 'none'}`;
        const walls = house.blockWalls;
        assert.equal(walls.length, annex ? 2 : 1, `${label}: wall count`);
        assert.equal(house.roofs.length, walls.length, `${label}: roof count`);

        walls.forEach((wall, n) => {
          // No upward-facing wall triangles (no textured top)
          assert.equal(upwardTriangles(wall), 0, `${label}: wall ${n} still has a top face`);

          // The roof over this wall is closed, overhangs it by >= 0.3 m, sits
          // exactly on the wall top (no gap) and rises above it
          const roof = house.roofs[n === 0 ? house.roofs.length - 1 : 0];
          assertWatertight(roof, `${label}: roof over wall ${n}`);
          const w = geometryBox(wall);
          const r = geometryBox(roof);
          assert.ok(Math.min(w.min.z - r.min.z, r.max.z - w.max.z) >= MIN_OVERHANG - 1e-6, `${label}: wall ${n} z overhang`);
          const overX = Math.min(w.min.x - r.min.x, r.max.x - w.max.x);
          // main body: 0.3 m on both x sides; annex: its far edge (its inner
          // edge is tucked inside the house)
          if (n === 0) {
            assert.ok(overX >= MIN_OVERHANG - 1e-6, `${label}: x overhang ${overX}`);
          } else {
            const far = side === 1 ? r.max.x - w.max.x : w.min.x - r.min.x;
            assert.ok(far >= MIN_OVERHANG - 1e-6, `${label}: annex far overhang ${far}`);
          }
          assert.ok(Math.abs(r.min.y - w.max.y) < 1e-6, `${label}: roof underside ${r.min.y} vs wall top ${w.max.y}`);
          assert.ok(r.max.y > w.max.y + 0.2, `${label}: roof has no pitch`);
        });
      }
    }
  }
}

// Collidable house bodies are unchanged by the roof fix: their bounding
// boxes are as recorded before it, so the route corridor and collisions are too
const HOUSE_BODY_BOXES = [
  [-20.87, 0, -195.447, -11.692, 2.874, -101.464],
  [-21.67, 0, -98.731, -11.776, 2.93, -10.337],
  [-19.205, 0, 2.732, -11.464, 2.973, 100.52],
  [-21.182, 0, 102.507, -11.435, 2.964, 192.318],
  [12.176, 0, -193.079, 20.993, 2.952, -101.339],
  [11.521, 0, -68.71, 21.421, 2.963, 3.632],
  [11.686, 0, 5.655, 21.89, 2.957, 94.621],
  [11.902, 0, 96.411, 22.111, 2.943, 189.262]
];

function checkTownshipGlowAndRoofs(step, lm) {
  const env = lm.environment;
  const named = (name) => {
    const found = [];
    env.group.traverse((o) => { if (o.name === name) found.push(o); });
    return found;
  };

  // House bodies: same boxes as before, and no upward (textured) faces
  const bodies = named('township-houses');
  assert.equal(bodies.length, HOUSE_BODY_BOXES.length, 'house chunk count');
  bodies.forEach((mesh, i) => {
    const box = new THREE.Box3().setFromObject(mesh);
    const got = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
    got.forEach((v, k) => assert.ok(Math.abs(v - HOUSE_BODY_BOXES[i][k]) < 0.002, `step ${step}: house chunk ${i} box changed (${got})`));
    assert.equal(upwardTriangles(mesh.geometry), 0, `step ${step}: house body chunk ${i} has a textured top`);
  });

  // The merged roofs are one closed mesh and non-collidable
  const [roofs] = named('township-roofs');
  assertWatertight(roofs.geometry, `step ${step}: merged roofs`);
  assert.ok(!lm.collidables.includes(roofs), 'roofs must not be collidable');

  // Road markings and patches: lit standard material, no brighter than ~1.2x the road
  const LIMIT = 1.2;
  let roadTint = null;
  env.group.traverse((o) => {
    if (o.geometry?.type === 'BoxGeometry' && o.geometry.parameters.width === 18) roadTint = o.material.color;
  });
  assert.ok(roadTint, 'road mesh');
  // ROAD_ALBEDO is the texture mean x this tint; keep the two in step
  assert.ok(Math.abs(ROAD_ALBEDO[0] / 0.0551 - roadTint.r) < 0.005, 'ROAD_ALBEDO no longer matches the road tint');

  const [patches] = named('township-patches');
  const [dashes] = named('township-dashes');
  for (const mesh of [patches, dashes]) {
    assert.ok(mesh.material.isMeshStandardMaterial && !mesh.material.isMeshBasicMaterial, `${mesh.name}: must be a lit standard material`);
    assert.equal(mesh.material.emissive.getHex(), 0, `${mesh.name}: must not be emissive`);
  }
  assert.ok(patches.isInstancedMesh && patches.instanceColor, 'patch instance colours');
  const tint = new THREE.Color();
  for (let i = 0; i < patches.count; i++) {
    patches.getColorAt(i, tint);
    const eff = [tint.r * patches.material.color.r, tint.g * patches.material.color.g, tint.b * patches.material.color.b];
    eff.forEach((v, ch) => assert.ok(v <= ROAD_ALBEDO[ch] * LIMIT + 1e-9, `step ${step}: patch ${i} channel ${ch} = ${v} > ${LIMIT}x road ${ROAD_ALBEDO[ch]}`));
  }
  const dash = dashes.material.color;
  [dash.r, dash.g, dash.b].forEach((v, ch) => assert.ok(v <= ROAD_ALBEDO[ch] * LIMIT + 1e-9, `step ${step}: dash channel ${ch} brighter than ${LIMIT}x road`));
}

// Spawn bay, destination ring and beam scale with the level's markerBrightness
const BASE = { rank: 0.35, zone: 0.45, beam: 0.22 };

function checkMarkers(step, level, lm) {
  const config = LEVELS[level];
  const b = config.markerBrightness ?? 1;
  assert.ok(b > 0 && b <= 1, 'markerBrightness range');

  const eq = (a, e, what) => assert.ok(Math.abs(a - e) < 1e-9, `step ${step}: level ${level} ${what} ${a} != ${e}`);
  eq(lm.rankMaterial.opacity, BASE.rank * b, 'spawn bay opacity');
  eq(lm.zoneMaterial.opacity, BASE.zone * b, 'ring opacity');

  // The beam is how the destination is found from a distance: it dims less
  assert.ok(lm.beamMaterial.opacity <= BASE.beam + 1e-9);
  assert.ok(lm.beamMaterial.opacity >= BASE.beam * Math.max(0.5, b) - 1e-9, `step ${step}: beam too dim`);

  // The spawn bay really uses the material that is dimmed
  const bays = lm.group.children.filter((c) => c.geometry?.type === 'PlaneGeometry');
  assert.equal(bays.length, 1);
  assert.equal(bays[0].material, lm.rankMaterial);

  // The per-frame pulse keeps the scaling
  lm.update(0, 0.3);
  eq(lm.zoneMaterial.opacity, (0.35 + Math.sin(0.3 * 4) * 0.12) * b, 'pulsed ring opacity');
  lm.update(0, 1.9);
  eq(lm.zoneMaterial.opacity, (0.35 + Math.sin(1.9 * 4) * 0.12) * b, 'pulsed ring opacity (2)');
}

assert.equal(LEVELS[1].markerBrightness, 1, 'level 1 markers unchanged');
assert.equal(LEVELS[2].markerBrightness, 1, 'level 2 markers unchanged');
assert.ok(LEVELS[3].markerBrightness >= 0.4 && LEVELS[3].markerBrightness <= 0.6, 'level 3 markers about half');
checkRoofsClosed();

const SEQUENCE = [1, 2, 3, 1, 2, 3, 1, 3, 2, 1, 1, 2, 3, 1];

const { scene, lm, collidables, potholes, materials } = make();

// Counts per level, recorded the first time each level loads
const baseline = {};
const mainPotholes = potholes.length;

let townshipTexturesCreated = 0;
let townshipTexturesDisposed = 0;
let signTexturesCreated = 0;
let signTexturesDisposed = 0;

let previous = null;
let previousDisposed = null;

for (const [step, level] of SEQUENCE.entries()) {

  lm.load(level);

  // The old environment is fully gone
  if (previous) {
    assert.equal(previous.group.parent, null, `step ${step}: old group still in scene`);
    for (const r of previousDisposed.expected) {
      assert.ok(previousDisposed.seen.has(r), `step ${step}: ${r.type ?? r.constructor.name} not disposed`);
    }
  }

  // Exactly one environment group in the scene, and it is the current one
  const envGroups = scene.children.filter((c) => c === lm.environment.group);
  assert.equal(envGroups.length, 1, `step ${step}: environment group count`);

  const counts = {
    sceneChildren: scene.children.length,
    envChildren: lm.environment.group.children.length,
    collidables: collidables.length,
    potholes: potholes.length
  };

  if (!baseline[level]) {
    baseline[level] = counts;
  } else {
    assert.deepEqual(counts, baseline[level], `step ${step}: level ${level} counts drifted`);
  }

  // Every collidable is a childless single Mesh (budget), still in the scene
  for (const mesh of lm.environment.collidables) {
    assert.ok(mesh.isMesh && !mesh.isInstancedMesh, 'collidable must be a plain Mesh');
    assert.equal(mesh.children.length, 0, 'collidable must be childless');
    assert.ok(collidables.includes(mesh), 'environment collidable not registered');
  }
  assert.ok(lm.environment.collidables.length <= 80, 'collidable budget');

  // Bump and main potholes sit at the vehicle's physics positions in every level
  const discs = [];
  lm.environment.group.traverse((o) => {
    if (o.geometry?.type === 'CircleGeometry') discs.push(o);
  });
  for (const hole of MAIN_POTHOLES) {
    assert.ok(
      discs.some((d) => d.position.x === hole.x && d.position.z === hole.z &&
        d.geometry.parameters.radius === hole.radius),
      `step ${step}: level ${level} lost pothole at (${hole.x}, ${hole.z})`
    );
  }
  let bump = null;
  lm.environment.group.traverse((o) => {
    if (o.isMesh && o.position.z === SPEED_BUMP.z && o.position.x === SPEED_BUMP.x &&
      o.geometry?.type === 'BoxGeometry' && o.geometry.parameters.depth === SPEED_BUMP.depth &&
      o.geometry.parameters.height === SPEED_BUMP.height) bump = o;
  });
  assert.ok(bump, `step ${step}: level ${level} lost the speed bump`);

  // The vehicle's own pothole list is untouched by environments
  assert.deepEqual(
    potholes.slice(0, mainPotholes).map(({ x, z, radius, depth }) => ({ x, z, radius, depth })),
    MAIN_POTHOLES
  );

  if (level === 2) {
    const signTexture = checkMotorway(step, lm, scene, collidables);
    signTexture.addEventListener('dispose', () => { signTexturesDisposed++; });
    signTexturesCreated++;
  }

  checkMarkers(step, level, lm);

  if (level === 1) {
    checkCity(step, lm, collidables);
  }

  if (level === 3) {
    checkTownshipGlowAndRoofs(step, lm);
    for (const texture of checkTownship(step, lm, scene, collidables)) {
      texture.addEventListener('dispose', () => { townshipTexturesDisposed++; });
      townshipTexturesCreated++;
    }
  }

  const resources = ownedResources(lm.environment.group);
  previous = lm.environment;
  previousDisposed = {
    expected: [...resources.geometries, ...resources.mats, ...resources.textures],
    seen: trackDisposal(resources)
  };
}

// Every sign texture but the live one has been freed
assert.ok(signTexturesCreated >= 3);
assert.equal(signTexturesDisposed, signTexturesCreated - (lm.levelId === 2 ? 1 : 0), 'sign textures disposed');

// Same for the township's canvas textures (two per load of level 3)
assert.ok(townshipTexturesCreated >= 6);
assert.equal(townshipTexturesDisposed, townshipTexturesCreated - (lm.levelId === 3 ? 2 : 0), 'township textures disposed');

// The library's base textures were never disposed (listeners were
// attached when they were created, so this covers every cycle)
assert.equal(materials.baseDisposed, 0, 'base textures must not be disposed');

// Final cycle returns to the starting counts
const finalScene = scene.children.length;
lm.load(1);
assert.equal(scene.children.length, finalScene);

console.log('environments.test.mjs OK', JSON.stringify(baseline));
