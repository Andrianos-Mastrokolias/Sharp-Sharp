import * as THREE from 'three';

import {
  mergeGeometries
} from 'three/addons/utils/BufferGeometryUtils.js';


// ==================================================
// TRAFFIC CARS (placeholder low-poly vehicles)
// --------------------------------------------------
// createTrafficCar(variant) -> { geometry, material } is the
// swap point for the 3D model team: TrafficSystem builds every
// moving car from it, so a loaded model can replace the body of
// this function (keep the contract below) and nothing else
// changes.
//
// Contract:
//   - geometry  ONE merged BufferGeometry, <= ~400 triangles,
//               shared by every car of the variant
//   - material  a material or an array (one per geometry group),
//               shared by every car of the variant
//   - facing -Z at heading 0; origin on the ground, in the
//               middle of the footprint (bounding box centred
//               in x and z, min y = 0). TrafficSystem reads the
//               length and width from the bounding box.
//   - no text, no real brands, no real lights (tail lights are
//               an emissive material only)
//
// The materials come from `cache` (a Map the caller owns and
// disposes), so there is one material per colour and one tail
// material however many variants are built.
// ==================================================

export const TRAFFIC_VARIANTS = [
  'hatchback',
  'sedan',
  'bakkie',
  'minibus'
];


const GLASS = 0x14171b;
const WHEEL = 0x101112;
const WHITE = 0xffffff;

const TAIL_EMISSIVE = 0xff2418;


// width / length in metres, paint colour
const SPECS = {

  hatchback: { width: 1.68, length: 3.8, color: 0xb23a2e },

  sedan: { width: 1.78, length: 4.5, color: 0x3f5a72 },

  bakkie: { width: 1.85, length: 5.0, color: 0xa7adb3 },

  minibus: { width: 1.95, length: 5.2, color: 0xeceae2 }
};


// A box standing on y = `bottom`, centred on (x, z), with the
// top edges pulled in at the front (-z) and back (+z) so a
// bonnet / windscreen / rear window slopes. Vertex colour
// `color` (multiplies the material colour).
function slab({
  size: [w, h, d],
  at: [x, bottom, z],
  frontInset = 0,
  backInset = 0,
  color = WHITE
}) {

  const geometry =
    new THREE.BoxGeometry(w, h, d);

  const pos =
    geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {

    if (pos.getY(i) > 0) {

      const z0 =
        pos.getZ(i);

      pos.setZ(
        i,
        z0 < 0
          ? z0 + frontInset
          : z0 - backInset
      );
    }
  }

  geometry.translate(x, bottom + h / 2, z);

  return paint(geometry, color);
}


function wheel(x, z) {

  const geometry =
    new THREE.CylinderGeometry(
      0.32,
      0.32,
      0.22,
      8
    );

  geometry.rotateZ(Math.PI / 2);
  geometry.translate(x, 0.32, z);

  return paint(geometry, WHEEL);
}


function paint(geometry, hex) {

  geometry.computeVertexNormals();

  const tint =
    new THREE.Color(hex);

  const count =
    geometry.attributes.position.count;

  const colors =
    new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {

    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3)
  );

  return geometry;
}


function bodyParts(variant, { width: w, length: l }) {

  const half = l / 2;

  switch (variant) {

    case 'hatchback':
      return [
        slab({ size: [w, 0.5, l], at: [0, 0.32, 0], frontInset: 0.35 }),
        slab({
          size: [w - 0.12, 0.55, l * 0.62], at: [0, 0.82, 0.3],
          frontInset: 0.45, backInset: 0.25
        }),
        slab({
          size: [w - 0.1, 0.3, l * 0.5], at: [0, 0.94, 0.3],
          frontInset: 0.4, backInset: 0.2, color: GLASS
        })
      ];

    case 'sedan':
      return [
        slab({ size: [w, 0.52, l], at: [0, 0.32, 0], frontInset: 0.3 }),
        slab({
          size: [w - 0.14, 0.5, l * 0.45], at: [0, 0.84, 0.15],
          frontInset: 0.4, backInset: 0.3
        }),
        slab({
          size: [w - 0.12, 0.28, l * 0.38], at: [0, 0.95, 0.15],
          frontInset: 0.35, backInset: 0.25, color: GLASS
        })
      ];

    case 'bakkie':
      return [
        // Chassis and load bed floor
        slab({ size: [w, 0.5, l], at: [0, 0.34, 0], frontInset: 0.3 }),
        // Cab
        slab({
          size: [w - 0.1, 0.62, 1.7], at: [0, 0.84, -0.75],
          frontInset: 0.5, backInset: 0.1
        }),
        slab({
          size: [w - 0.08, 0.3, 1.45], at: [0, 0.98, -0.75],
          frontInset: 0.45, backInset: 0.08, color: GLASS
        }),
        // Load bed sides
        slab({ size: [0.1, 0.3, 2.2], at: [-(w / 2 - 0.05), 0.84, half - 1.2] }),
        slab({ size: [0.1, 0.3, 2.2], at: [w / 2 - 0.05, 0.84, half - 1.2] })
      ];

    case 'minibus':
    default:
      return [
        slab({ size: [w, 1.45, l], at: [0, 0.4, 0], frontInset: 0.55 }),
        slab({ size: [w, 0.2, l - 0.2], at: [0, 1.85, 0.1], frontInset: 0.4 }),
        // Window band
        slab({
          size: [w + 0.02, 0.5, l * 0.72], at: [0, 1.15, 0.45], color: GLASS
        })
      ];
  }
}


export function createTrafficCar(
  variant,
  cache = new Map()
) {

  const spec =
    SPECS[variant] ?? SPECS.hatchback;

  const { width: w, length: l } = spec;

  const paintParts = [
    ...bodyParts(variant, spec)
  ];

  for (const side of [-1, 1]) {

    for (const z of [-l * 0.3, l * 0.31]) {

      paintParts.push(wheel(side * (w / 2 - 0.1), z));
    }
  }

  const tailParts = [-1, 1].map(
    (side) => paint(
      new THREE.BoxGeometry(0.3, 0.14, 0.06)
        .translate(side * (w / 2 - 0.28), 0.68, l / 2 + 0.02),
      WHITE
    )
  );

  const paintGeometry =
    mergeGeometries(paintParts);

  const tailGeometry =
    mergeGeometries(tailParts);

  const geometry =
    mergeGeometries(
      [paintGeometry, tailGeometry],
      true
    );

  for (const part of [...paintParts, ...tailParts, paintGeometry, tailGeometry]) {
    part.dispose();
  }

  geometry.computeBoundingBox();

  // The tail lights stick out 0.05 beyond the body: keep the
  // box centred on the body, not on them
  const centreZ =
    (geometry.boundingBox.min.z + geometry.boundingBox.max.z) / 2;

  geometry.translate(0, 0, -centreZ);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return {
    geometry,
    material: [
      cachedMaterial(
        cache,
        `paint:${spec.color}`,
        () => new THREE.MeshStandardMaterial({
          color: spec.color,
          vertexColors: true,
          roughness: 0.6,
          metalness: 0.1
        })
      ),
      cachedMaterial(
        cache,
        'tail',
        () => new THREE.MeshStandardMaterial({
          color: 0x2a0806,
          emissive: TAIL_EMISSIVE,
          emissiveIntensity: 0.9,
          roughness: 0.5
        })
      )
    ]
  };
}


function cachedMaterial(cache, key, make) {

  let material =
    cache.get(key);

  if (!material) {

    material = make();
    cache.set(key, material);
  }

  return material;
}
