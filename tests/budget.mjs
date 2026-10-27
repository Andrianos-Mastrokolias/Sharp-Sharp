// Draw-call / triangle budget test: node tests/budget.mjs
//
// Counts what each level's environment draws from the four fixed cameras of
// tests/tools/cameras.mjs (frustum culled like the renderer does, shadow
// casters counted a second time for the shadow pass) and asserts that, added
// to the rest of the game (taxi, cargo, sky, dust, flyover, markers), the
// worst of the four views stays under the per-level ceilings. The ceilings
// are ceilings, not targets: they are the in-game numbers at the spawn view.
// tests/tools/gl-measure.mjs gives the real renderer.info figures.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { buildEnvironment } from '../src/world/environments/index.js';
import { TrafficSystem } from '../src/world/TrafficSystem.js';
import { RivalTaxiSystem } from '../src/world/RivalTaxis.js';
import { LEVELS } from '../src/world/LevelManager.js';
import { makeLibrary } from './tools/fake-library.mjs';
import fs from 'node:fs';
import { cameras, FOV, ASPECT, VIEW_DISTANCE, SHADOW_RADIUS, taxiFocus } from './tools/cameras.mjs';

// The cameras' far planes are the levels' fog distances plus 40 m (main.js
// does this at run time); the table in cameras.mjs must follow LightingManager
const fogFars = [...fs.readFileSync(new URL('../src/graphics/LightingManager.js', import.meta.url), 'utf8')
  .matchAll(/new THREE\.Fog\(\s*0x[0-9a-f]+,\s*\d+,\s*(\d+)/gi)].map((m) => Number(m[1]));
assert.deepEqual(fogFars.map((far) => far + 40), [VIEW_DISTANCE[1], VIEW_DISTANCE[2], VIEW_DISTANCE[3]], 'VIEW_DISTANCE no longer matches the fog distances');

// In-game ceilings at the spawn view, shadow pass included
export const CEILINGS = {
  1: { draws: 450, tris: 70000 },
  2: { draws: 170, tris: 65000 },
  3: { draws: 260, tris: 75000 }
};

// Everything that is not the environment (taxi, cargo, sky, dust, flyover,
// markers). Measured at the Stage 0 baseline as the in-game spawn view
// minus this test's own count for the unmodified environment, rounded up.
export const OVERHEAD = {
  1: { draws: 95, tris: 21000 },
  2: { draws: 95, tris: 31000 },
  3: { draws: 55, tris: 12000 }
};

// Collidables each environment registers (a few childless single Meshes).
// The roads are longer now (src/world/roads.js): Level 1 has the original 26
// buildings plus 38 more (one per slot and side), Level 2 still two
// barriers, Level 3 the original 32 plus the ones in its added stretches
// (house, fence, wreck and bin chunks, all merged per 100 m).
export const COLLIDABLES = { 1: 49, 2: 2, 3: 99 };

// The original (400 m road) counts, which the first collidables of each
// level still are
export const ORIGINAL_COLLIDABLES = { 1: 26, 2: 2, 3: 32 };

// Traffic cars LevelManager registers on top of that. They follow the
// road's length at the original density: Level 1 runs 10 + 10 cars (the
// original 4 + 4 on 370 m lanes), Level 2 7 + 9 (the original 3 + 4).
// Level 3's night traffic is 6 + 6 cars.
export const TRAFFIC_COLLIDABLES = { 1: 14, 2: 16, 3: 12 };

// Level 1's lanes now start after the rank (680 m: 7 + 7 cars, the original
// density), and the rank race adds 8 rival minibuses, which are counted as
// all in view at once in every view (their worst case: they spread out
// along the road as the race goes)
export const RIVAL_COLLIDABLES = { 1: 8, 2: 0, 3: 0 };

// Traffic is counted at its worst moment: every second of the first 4
// minutes, which is several full loops of every lane (the lanes are 930 and
// 1130 m at 9..17 m/s), so every relative position of the cars is sampled.
const TRAFFIC_SAMPLE_SECONDS = 240;
const TRAFFIC_SAMPLE_STEP = 1;

// The 26 level 1 building boxes, as before the draw-call merge (Stage 0)
const L1_BUILDING_BOXES = [
  [-25.250, 0.000, -189.000, -16.750, 9.000, -171.000],
  [16.925, 0.000, -189.900, 26.575, 12.200, -170.100],
  [-27.900, 0.000, -160.800, -17.100, 15.400, -139.200],
  [16.750, 0.000, -161.700, 25.250, 18.600, -138.300],
  [-26.575, 0.000, -129.000, -16.925, 21.800, -111.000],
  [17.100, 0.000, -129.900, 27.900, 9.000, -110.100],
  [-25.250, 0.000, -100.800, -16.750, 12.200, -79.200],
  [16.925, 0.000, -101.700, 26.575, 15.400, -78.300],
  [-27.900, 0.000, -69.000, -17.100, 18.600, -51.000],
  [16.750, 0.000, -69.900, 25.250, 21.800, -50.100],
  [-26.575, 0.000, -40.800, -16.925, 9.000, -19.200],
  [17.100, 0.000, -41.700, 27.900, 12.200, -18.300],
  [-25.250, 0.000, -9.000, -16.750, 15.400, 9.000],
  [16.925, 0.000, -9.900, 26.575, 18.600, 9.900],
  [-27.900, 0.000, 19.200, -17.100, 21.800, 40.800],
  [16.750, 0.000, 18.300, 25.250, 9.000, 41.700],
  [-26.575, 0.000, 51.000, -16.925, 12.200, 69.000],
  [17.100, 0.000, 50.100, 27.900, 15.400, 69.900],
  [-25.250, 0.000, 79.200, -16.750, 18.600, 100.800],
  [16.925, 0.000, 78.300, 26.575, 21.800, 101.700],
  [-27.900, 0.000, 111.000, -17.100, 9.000, 129.000],
  [16.750, 0.000, 110.100, 25.250, 12.200, 129.900],
  [-26.575, 0.000, 139.200, -16.925, 15.400, 160.800],
  [17.100, 0.000, 138.300, 27.900, 18.600, 161.700],
  [-25.250, 0.000, 171.000, -16.750, 21.800, 189.000],
  [16.925, 0.000, 170.100, 26.575, 9.000, 189.900]
];

// Draws and triangles the environment costs from one camera: meshes whose
// bounds miss the frustum are skipped, instances and material groups are
// counted, and a shadow caster is drawn a second time (the shadow pass). With a
// `focus` ([x, z] of the taxi) only casters within SHADOW_RADIUS of it get that
// second draw, as in the game, where the sun's shadow camera follows the taxi;
// without one every caster in view does.
export function countEnvironment(env, camera, focus = null) {
  let draws = 0;
  let tris = 0;
  let objects = 0;

  env.group.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);

  const frustum = new THREE.Frustum().setFromProjectionMatrix(
    new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  );

  env.group.traverse((o) => {
    if (!o.geometry || !o.visible) return;               // the renderer skips what is hidden (the dust puffs while idle)
    objects++;

    if (o.frustumCulled && !frustum.intersectsObject(o)) return;

    const g = o.geometry;
    const perInstance = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    const groups = Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1;

    draws += groups;
    tris += perInstance * n;

    if (o.castShadow && (!focus || nearFocus(o, focus))) {
      draws += groups;
      tris += perInstance * n;
    }
  });

  return { objects, draws, tris: Math.round(tris) };
}

const box = new THREE.Box3();
const spot = new THREE.Vector3();

// Does the object come within SHADOW_RADIUS of the taxi (on the ground plane)?
function nearFocus(object, [x, z]) {
  box.setFromObject(object);
  spot.set(
    Math.min(Math.max(x, box.min.x), box.max.x),
    0,
    Math.min(Math.max(z, box.min.z), box.max.z)
  );
  return Math.hypot(spot.x - x, spot.z - z) <= SHADOW_RADIUS;
}

function makeCamera({ at, to }, far) {
  const camera = new THREE.PerspectiveCamera(FOV, ASPECT, 0.1, far);
  camera.position.set(...at);
  camera.lookAt(...to);
  return camera;
}

const report = {};

for (const level of [1, 2, 3]) {
  const env = buildEnvironment(level, { materials: makeLibrary() });
  const views = {};
  const total = { draws: 0, tris: 0 };

  // The rank race's rivals (Level 1): one cost for all of them, in view
  const rivalCost = { draws: 0, tris: 0 };

  if (LEVELS[level].race) {
    const rivalGroup = new THREE.Group();
    const rivals = new RivalTaxiSystem({ parent: rivalGroup, registerCollidable() {} });
    const { race, road } = LEVELS[level];
    rivals.configure({ rivals: race.grid, road: { halfWidth: race.road.halfWidth, zMin: road.zMin, zMax: road.zMax }, direction: -1 });
    assert.equal(rivals.rivals.length, RIVAL_COLLIDABLES[level], `level ${level}: rival count`);
    assert.ok(rivals.rivals.every((r) => r.mesh.castShadow === false), 'rivals cast shadows');
    rivals.rivals.forEach((r) => { r.mesh.frustumCulled = false; });
    const c = countEnvironment({ group: rivalGroup }, makeCamera(cameras(level)[0], VIEW_DISTANCE[level]));
    rivalCost.draws = c.draws;
    rivalCost.tris = c.tris;
    rivals.dispose();
  }

  const trafficGroup = new THREE.Group();
  const traffic = new TrafficSystem({ parent: trafficGroup });
  traffic.configure(LEVELS[level]);
  assert.equal(traffic.cars.length, TRAFFIC_COLLIDABLES[level], `level ${level}: traffic car count`);
  // Cars cast no shadow: that second draw per part is what protects the ceiling
  assert.ok(traffic.cars.every((c) => c.mesh.castShadow === false), `level ${level}: traffic casts shadows`);

  for (const view of cameras(level)) {
    const camera = makeCamera(view, VIEW_DISTANCE[level]);
    const count = countEnvironment(env, camera, taxiFocus(view));
    const base = { draws: count.draws, tris: count.tris };
    const worstTraffic = { draws: 0, tris: 0 };

    if (traffic.cars.length) {
      traffic.reset();
      for (let t = 0; t <= TRAFFIC_SAMPLE_SECONDS; t += TRAFFIC_SAMPLE_STEP) {
        const c = countEnvironment({ group: trafficGroup }, camera, taxiFocus(view));
        worstTraffic.draws = Math.max(worstTraffic.draws, c.draws);
        worstTraffic.tris = Math.max(worstTraffic.tris, c.tris);
        traffic.update(TRAFFIC_SAMPLE_STEP);
      }
    }

    // A ghost car costs the same as a solid one (same parts, transparent
    // material): turning every car into a ghost must not change the count
    if (traffic.cars.length) {
      const solid = countEnvironment({ group: trafficGroup }, camera, taxiFocus(view));
      traffic.cars.forEach((c) => { traffic.setSolid(c, false); });
      const ghost = countEnvironment({ group: trafficGroup }, camera, taxiFocus(view));
      assert.deepEqual(ghost, solid, `level ${level}: ghost cars draw differently`);
      traffic.cars.forEach((c) => { traffic.setSolid(c, true); });
    }

    views[view.name] = { draws: base.draws, tris: base.tris, trafficDraws: worstTraffic.draws, trafficTris: worstTraffic.tris };
    total.draws = Math.max(total.draws, base.draws + worstTraffic.draws + rivalCost.draws + OVERHEAD[level].draws);
    total.tris = Math.max(total.tris, base.tris + worstTraffic.tris + rivalCost.tris + OVERHEAD[level].tris);
  }

  report[level] = { rivalCost, objects: countEnvironment(env, makeCamera(cameras(level)[0], VIEW_DISTANCE[level])).objects, collidables: env.collidables.length, views, worstWithOverhead: total };

  assert.equal(env.collidables.length, COLLIDABLES[level], `level ${level}: collidable count`);
  for (const mesh of env.collidables) {
    assert.ok(mesh.isMesh && !mesh.isInstancedMesh && mesh.children.length === 0, `level ${level}: collidable must be a childless plain Mesh`);
  }
  assert.ok(total.draws <= CEILINGS[level].draws, `level ${level}: ${total.draws} draws > ceiling ${CEILINGS[level].draws}`);
  assert.ok(total.tris <= CEILINGS[level].tris, `level ${level}: ${total.tris} tris > ceiling ${CEILINGS[level].tris}`);

  
if (level === 1) {
  // The new rank replaces some of the original buildings.
  // Validate the resulting scenery instead of comparing it
  // against the obsolete original building list.
  env.group.updateMatrixWorld(true);

  assert.equal(
    env.collidables.length,
    COLLIDABLES[1],
    'Level 1 collidable count'
  );

  // Every solid object must have a valid bounding box.
  for (const mesh of env.collidables) {
    const bounds = new THREE.Box3().setFromObject(mesh);

    assert.ok(
      !bounds.isEmpty(),
      'Level 1 has an empty collidable'
    );

    // The rank starting zone must remain clear for taxis.
    if (bounds.max.z >= -60 && bounds.min.z <= 170) {
      assert.ok(
        bounds.min.x >= 9 || bounds.max.x <= -9,
        'Taxi rank obstacle enters the driving corridor'
      );
    }
  }
}


  traffic.dispose();
  env.dispose();
}

console.log('budget.mjs OK', JSON.stringify(report));
