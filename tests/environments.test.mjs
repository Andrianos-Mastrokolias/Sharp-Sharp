// Headless environment lifecycle test: node tests/environments.test.mjs
// Switches levels repeatedly and checks nothing leaks or duplicates:
// scene children, shared collidables and potholes return to the same
// counts, every geometry / material / cloned texture of a replaced
// environment is disposed, and the library's base textures never are.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { LevelManager } from '../src/world/LevelManager.js';
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
  // flyover rails (6) and pillars (4) the level stays within budget
  assert.equal(env.collidables.length, 2, `step ${step}: motorway collidables`);
  assert.ok(env.collidables.every((m) => m.name === 'motorway-barrier'));
  assert.ok(collidables.length <= 15, `step ${step}: level 2 collidable budget (${collidables.length})`);

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

const SEQUENCE = [1, 2, 3, 1, 2, 3, 1, 3, 2, 1, 1, 2, 3, 1];

const { scene, lm, collidables, potholes, materials } = make();

// Counts per level, recorded the first time each level loads
const baseline = {};
const mainPotholes = potholes.length;

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

// The library's base textures were never disposed (listeners were
// attached when they were created, so this covers every cycle)
assert.equal(materials.baseDisposed, 0, 'base textures must not be disposed');

// Final cycle returns to the starting counts
const finalScene = scene.children.length;
lm.load(1);
assert.equal(scene.children.length, finalScene);

console.log('environments.test.mjs OK', JSON.stringify(baseline));
