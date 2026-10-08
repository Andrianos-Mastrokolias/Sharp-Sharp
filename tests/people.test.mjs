// Street-life people test: node tests/people.test.mjs
// The pedestrian factory (variants, triangles, attributes), and what
// life.js puts on Level 1: instance counts, nobody on the carriageway or
// inside |x| < 11, nobody inside a building, nothing collidable, and the
// walk driven by one uniform.
import * as THREE from 'three';
import assert from 'node:assert/strict';
import { buildEnvironment } from '../src/world/environments/index.js';
import {
  createPerson,
  createPersonMaterial,
  PERSON_VARIANT_COUNT,
  PERSON_TRIANGLE_LIMIT,
  PERSON_PAUSE,
  createZebraCrossing
} from '../src/world/environments/props.js';
import { LIFE_DENSITY, createLife } from '../src/world/environments/life.js';
import { makeLibrary } from './tools/fake-library.mjs';

const MAX_PEOPLE = 220;               // the Stage 1 instance cap
const MIN_ABS_X = 11;                 // people keep off the road and the kerb side of the sidewalk
const ROAD_HALF_WIDTH = 9;

const triangles = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

// ---- Factory: variants ---------------------------------------------------
assert.ok(PERSON_VARIANT_COUNT >= 3 && PERSON_VARIANT_COUNT <= 5, 'variant count 3..5');
assert.equal(LIFE_DENSITY[1].variantWeights.length, PERSON_VARIANT_COUNT, 'one weight per variant');
assert.ok(Math.abs(LIFE_DENSITY[1].variantWeights.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'weights sum to 1');

const skinOf = (g) => {
  // Untinted, unswung parts are the head (and a cap above it): the lowest such
  // vertex belongs to the head, whose vertex colour is the variant's skin tone
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const tint = g.attributes.aTint;
  const swing = g.attributes.aSwing;
  let best = -1;
  for (let i = 0; i < pos.count; i++) {
    if (tint.getX(i) === 0 && swing.getX(i) === 0 && (best < 0 || pos.getY(i) < pos.getY(best))) best = i;
  }
  return best < 0 ? null : [col.getX(best), col.getY(best), col.getZ(best)].map((v) => v.toFixed(4)).join(',');
};

const skins = new Set();
for (let variant = 0; variant < PERSON_VARIANT_COUNT; variant++) {
  const { geometry, material } = createPerson(variant);

  assert.ok(triangles(geometry) <= PERSON_TRIANGLE_LIMIT, `variant ${variant}: ${triangles(geometry)} triangles`);
  assert.ok(triangles(geometry) >= 60, `variant ${variant}: suspiciously few triangles`);
  assert.ok(!geometry.index, 'flat shaded, non-indexed');
  for (const name of ['position', 'normal', 'color', 'aTint', 'aSwing']) {
    assert.ok(geometry.attributes[name], `variant ${variant}: attribute ${name}`);
  }

  // single material per variant, with the walk compiled in
  assert.ok(material.isMeshStandardMaterial && !Array.isArray(material), 'single standard material');
  assert.equal(typeof material.onBeforeCompile, 'function', 'walk shader hook');
  assert.equal(material.customProgramCacheKey(), 'person-walk-v1', 'program cache key');
  assert.ok(material.userData.uTime && material.userData.uTime.value === 0, 'one uTime uniform');
  assert.ok(material.vertexColors, 'vertex colours');

  // feet on the ground, about a person tall (the child is smaller)
  geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox.min.y) < 1e-6, `variant ${variant}: feet at y = 0`);
  assert.ok(geometry.boundingBox.max.y > 1 && geometry.boundingBox.max.y < 2, `variant ${variant}: height`);

  // legs swing about the hip, arms the other way, the body not at all
  const swing = geometry.attributes.aSwing;
  const weights = new Set();
  for (let i = 0; i < swing.count; i++) weights.add(+swing.getX(i).toFixed(2));
  assert.deepEqual([...weights].sort((a, b) => a - b), [-1, -0.8, 0, 0.8, 1], 'swing weights');

  skins.add(skinOf(geometry));
  geometry.dispose();
  material.dispose();
}
assert.equal(skins.size, PERSON_VARIANT_COUNT, 'every variant has its own skin tone');
assert.ok(!skins.has(null), 'head found');

// A material made on its own is compiled with the same key, and the shader
// source carries the walk (path, pause, swing)
{
  const material = createPersonMaterial();
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <color_vertex>\n#include <beginnormal_vertex>\n#include <begin_vertex>' };
  material.onBeforeCompile(shader);
  assert.ok(shader.uniforms.uTime === material.userData.uTime, 'uTime shared with the material');
  for (const token of ['attribute vec3 aStart', 'attribute vec2 aDir', 'attribute vec4 aMotion', 'attribute vec2 aSwing', 'PERSON_PAUSE = ' + PERSON_PAUSE.toFixed(1), 'uniform float uTime']) {
    assert.ok(shader.vertexShader.includes(token), `shader lacks ${token}`);
  }
  material.dispose();
}

// ---- Zebra factory ---------------------------------------------------------
{
  const zebra = createZebraCrossing({ x: 12.2, z0: 10, z1: 18, y: -0.025, material: new THREE.MeshBasicMaterial() });
  assert.ok(zebra.isInstancedMesh && !Array.isArray(zebra.material), 'zebra: one InstancedMesh, one material');
  assert.ok(zebra.count >= 7 && zebra.count <= 9, `zebra bars ${zebra.count}`);
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  zebra.geometry.computeBoundingBox();
  for (let i = 0; i < zebra.count; i++) {
    zebra.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    box.copy(zebra.geometry.boundingBox).translate(p);
    assert.ok(box.min.z >= 10 && box.max.z <= 18, 'bars stay inside the street');
  }
  zebra.geometry.dispose();
  zebra.material.dispose();
  zebra.dispose();
}

// ---- Level 1 ---------------------------------------------------------------
function build() {
  return buildEnvironment(1, { materials: makeLibrary() });
}

function people(env) {
  const meshes = [];
  env.group.traverse((o) => { if (o.name === 'life-people') meshes.push(o); });
  return meshes;
}

// Plain data for every instance of every people mesh
function instances(meshes) {
  const out = [];
  for (const mesh of meshes) {
    const { aStart, aDir, aMotion } = mesh.geometry.attributes;
    for (let i = 0; i < mesh.count; i++) {
      out.push({
        mesh,
        x: aStart.getX(i), y: aStart.getY(i), z: aStart.getZ(i),
        dx: aDir.getX(i), dz: aDir.getY(i),
        speed: aMotion.getX(i), length: aMotion.getY(i), phase: aMotion.getZ(i), scale: aMotion.getW(i)
      });
    }
  }
  return out;
}

const env = build();
env.group.updateMatrixWorld(true);

const meshes = people(env);
assert.ok(meshes.length > 0, 'level 1 has people');

for (const mesh of meshes) {
  assert.ok(mesh.isInstancedMesh, 'one InstancedMesh per variant chunk');
  assert.ok(!Array.isArray(mesh.material), 'a single material');
  assert.ok(mesh.instanceColor, 'clothing colour per instance');
  assert.ok(!mesh.castShadow, 'people do not cast shadows');
  assert.ok(!env.collidables.includes(mesh), 'people are never collidable');
  for (const name of ['aStart', 'aDir', 'aMotion']) {
    assert.ok(mesh.geometry.attributes[name]?.isInstancedBufferAttribute, `${name} per instance`);
    assert.equal(mesh.geometry.attributes[name].count, mesh.count, `${name} count`);
  }
  assert.ok(mesh.boundingSphere, 'culled by its own sphere (instance matrices are identity)');
}

const all = instances(meshes);
assert.ok(all.length >= 150 && all.length <= MAX_PEOPLE, `${all.length} instances`);
assert.ok(all.length <= LIFE_DENSITY[1].maxInstances, 'density cap');

// Every variant is used, each with a single material per mesh; per-variant
// geometry stays under the triangle limit once placed
const variants = new Set(meshes.map((m) => triangles(m.geometry)));
assert.ok(meshes.every((m) => triangles(m.geometry) <= PERSON_TRIANGLE_LIMIT), 'placed meshes under the limit');
assert.ok(variants.size >= 3, 'at least 3 distinct variants placed');
assert.ok(new Set(meshes.map((m) => m.material)).size >= 3, 'one material per variant');

// Where everyone is: path ends outside |x| < 11, on the verge, clear of the road
const buildings = env.collidables.map((m) => new THREE.Box3().setFromObject(m).expandByScalar(0.3));
let walkers = 0;
let standing = 0;
let crossers = 0;

for (const p of all) {
  const ends = [
    [p.x, p.z],
    [p.x + p.dx * p.length, p.z + p.dz * p.length]
  ];

  assert.ok(Math.abs(Math.hypot(p.dx, p.dz) - 1) < 1e-4, 'unit direction');
  assert.ok(p.scale > 0.9 && p.scale < 1.1, 'scale');

  for (const [x, z] of ends) {
    assert.ok(Math.abs(x) >= MIN_ABS_X, `person at |x| ${Math.abs(x).toFixed(2)} (needs >= ${MIN_ABS_X})`);
    assert.ok(Math.abs(x) > ROAD_HALF_WIDTH, 'on the carriageway');
    assert.ok(Math.abs(x) <= 16, `person off the verge at |x| ${Math.abs(x).toFixed(2)}`);
    assert.ok(Math.abs(z) <= 190, 'inside the street');

    for (const box of buildings) {
      assert.ok(!box.containsPoint(new THREE.Vector3(x, 1, z)), `person inside a building at (${x.toFixed(2)}, ${z.toFixed(2)})`);
    }
  }

  // movers walk in a straight line along z (along or across the side street, never towards the road);
  // standing people only face a direction
  if (p.speed > 0) assert.equal(p.dx, 0, 'paths run along z');

  if (p.speed === 0) {
    standing++;
    assert.equal(p.length, 0, 'standing: no path');
    assert.ok(Math.abs(p.y - 0.2) < 1e-6, 'standing on the sidewalk');
  } else if (Math.abs(p.y - 0.2) < 1e-6) {
    walkers++;
    assert.ok(p.speed >= 1 && p.speed <= 1.5 && p.length >= 5 && p.length <= 15.01, 'walker speed / path');
  } else {
    crossers++;
    assert.ok(Math.abs(p.y + 0.02) < 1e-6, 'crossers walk on the side street');
    assert.ok(p.speed >= 1.3 && p.speed <= 1.6, 'crosser speed');
    assert.ok(Math.abs(p.x) >= 11.8 && Math.abs(p.x) <= 13.1, 'crossers stay on the zebra');
  }
}

assert.equal(crossers, 4 * LIFE_DENSITY[1].crossersPerStreet, 'crossers on each of the 4 side streets');
assert.ok(walkers >= 20, `${walkers} walkers`);
assert.ok(standing >= 80, `${standing} standing`);

// Each mesh's sphere holds all of its paths (so culling never hides someone)
for (const mesh of meshes) {
  const { aStart, aDir, aMotion } = mesh.geometry.attributes;
  for (let i = 0; i < mesh.count; i++) {
    for (const t of [0, 1]) {
      const point = new THREE.Vector3(
        aStart.getX(i) + aDir.getX(i) * aMotion.getY(i) * t,
        aStart.getY(i) + 1,
        aStart.getZ(i) + aDir.getY(i) * aMotion.getY(i) * t
      );
      assert.ok(mesh.boundingSphere.containsPoint(point), 'path outside the culling sphere');
    }
  }
}

// Instances are chunked by 60 m and side, so far ones are culled
for (const mesh of meshes) {
  assert.ok(mesh.boundingSphere.radius < 60, `culling sphere radius ${mesh.boundingSphere.radius}`);
}

// The walk: the only per-frame work is writing one number into uTime
{
  const mesh = meshes[0];
  const uTime = mesh.material.userData.uTime;
  uTime.value = -1;
  mesh.onBeforeRender();
  const first = uTime.value;
  assert.ok(first > 0, 'uTime follows the clock');
  mesh.onBeforeRender();
  assert.ok(uTime.value >= first, 'uTime never runs backwards');
}

// Nothing of the people is registered with the vehicle
assert.equal(env.collidables.length, 26, 'level 1 collidables unchanged');
assert.ok(env.collidables.every((m) => !m.isInstancedMesh && m.children.length === 0));

// Deterministic: a second build is identical
{
  const again = build();
  const a = instances(people(again));
  assert.equal(a.length, all.length);
  a.forEach((p, i) => {
    for (const key of ['x', 'y', 'z', 'dx', 'dz', 'speed', 'length', 'phase', 'scale']) {
      assert.equal(p[key], all[i][key], `instance ${i} ${key}`);
    }
  });
  again.dispose();
}

// Levels without a density table get no people
{
  const group = new THREE.Group();
  const none = createLife({ level: 2, layout: { sidewalks: [{ side: 1, z0: 0, z1: 20, y: 0.2 }], crossings: [] }, group });
  assert.equal(none.meshes.length, 0);
  assert.equal(none.stats.total, 0);
  assert.equal(group.children.length, 0);
}

env.dispose();
console.log('people.test.mjs OK', JSON.stringify({ instances: all.length, walkers, standing, crossers, meshes: meshes.length }));
