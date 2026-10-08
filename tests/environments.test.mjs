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

const SEQUENCE = [1, 2, 3, 1, 2, 3, 1, 3, 2, 1, 1, 2, 3, 1];

const { scene, lm, collidables, potholes, materials } = make();

// Counts per level, recorded the first time each level loads
const baseline = {};
const mainPotholes = potholes.length;

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

  const resources = ownedResources(lm.environment.group);
  previous = lm.environment;
  previousDisposed = {
    expected: [...resources.geometries, ...resources.mats, ...resources.textures],
    seen: trackDisposal(resources)
  };
}

// The library's base textures were never disposed (listeners were
// attached when they were created, so this covers every cycle)
assert.equal(materials.baseDisposed, 0, 'base textures must not be disposed');

// Final cycle returns to the starting counts
const finalScene = scene.children.length;
lm.load(1);
assert.equal(scene.children.length, finalScene);

console.log('environments.test.mjs OK', JSON.stringify(baseline));
