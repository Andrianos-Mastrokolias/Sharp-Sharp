import * as THREE from 'three';

import {
  mergeGeometries
} from 'three/addons/utils/BufferGeometryUtils.js';


// ==================================================
// PEOPLE FAMILY (pedestrians)
// --------------------------------------------------
// Re-exported from ../props.js, which stays the one
// swap-point list for the 3D model team.
//
// createPerson(variant) -> { geometry, material }
//
// One variant is one InstancedMesh (see life.js). The
// walk is entirely in the vertex shader, so a real model
// can replace the geometry as long as it keeps this
// contract:
//
//   geometry   one merged, static, non-skinned mesh,
//              feet at y = 0, facing +z, about 1.75 m
//              tall, under PERSON_TRIANGLE_LIMIT
//              triangles, with these vertex attributes:
//                position, normal
//                color    vec3   skin / clothes / hair
//                aTint    float  0 = keep the vertex
//                         colour, 1 = multiply by the
//                         instance's clothing colour
//                aSwing   vec2   (weight, pivotY): the
//                         limb swings about the x axis
//                         through height pivotY, by
//                         weight (-1..1) x the stride
//                         angle. Optional: without it
//                         the person just glides.
//   material   createPersonMaterial() (or one made the
//              same way): it reads the per-instance
//              attributes aStart, aDir and aMotion and
//              the uTime uniform, so the instance data
//              life.js writes drives any geometry.
//
// Nothing here runs per frame: the only per-frame work
// is the one uTime uniform (set in onBeforeRender).
// ==================================================


export const PERSON_VARIANT_COUNT = 4;

export const PERSON_TRIANGLE_LIMIT = 150;

// Seconds a walker stands still at each end of its path
export const PERSON_PAUSE = 3;


// Skin tone, trousers and hair per variant
const VARIANTS = [

  {
    skin: 0x8a5a3c,
    trousers: 0x2c3a52,
    hair: 0x15110e,
    scale: 1,
    backpack: false,
    cap: false
  },

  {
    skin: 0x5a3a28,
    trousers: 0x33312e,
    hair: 0x0e0b09,
    scale: 1,
    backpack: true,
    cap: false
  },

  // child
  {
    skin: 0xc58c64,
    trousers: 0x4a4f57,
    hair: 0x2a1c12,
    scale: 0.62,
    backpack: false,
    cap: false
  },

  {
    skin: 0x3f2a1f,
    trousers: 0x3b3a30,
    hair: 0x090807,
    scale: 1.04,
    backpack: false,
    cap: true
  }
];


// ==================================================
// GEOMETRY
// ==================================================

// One body part: a primitive moved into place, painted with
// a vertex colour, a tint weight and a swing (weight, pivot).
function part(
  geometry,
  [x, y, z],
  color,
  tint = 0,
  swing = 0,
  pivotY = 0,
  scale = [1, 1, 1]
) {

  const flat =
    geometry.index
      ? geometry.toNonIndexed()
      : geometry;


  if (
    flat !== geometry
  ) {

    geometry.dispose();
  }


  flat.deleteAttribute(
    'uv'
  );


  flat.scale(
    scale[0],
    scale[1],
    scale[2]
  );


  flat.translate(
    x,
    y,
    z
  );


  const count =
    flat.attributes.position.count;

  const tone =
    new THREE.Color(
      color
    );


  const colors =
    new Float32Array(
      count * 3
    );

  const tints =
    new Float32Array(
      count
    );

  const swings =
    new Float32Array(
      count * 2
    );


  for (
    let i = 0;
    i < count;
    i++
  ) {

    colors[i * 3] =
      tone.r;

    colors[i * 3 + 1] =
      tone.g;

    colors[i * 3 + 2] =
      tone.b;

    tints[i] =
      tint;

    swings[i * 2] =
      swing;

    swings[i * 2 + 1] =
      pivotY;
  }


  flat.setAttribute(
    'color',
    new THREE.BufferAttribute(
      colors,
      3
    )
  );

  flat.setAttribute(
    'aTint',
    new THREE.BufferAttribute(
      tints,
      1
    )
  );

  flat.setAttribute(
    'aSwing',
    new THREE.BufferAttribute(
      swings,
      2
    )
  );


  return flat;
}


// A low-poly person, 1.75 m at scale 1, facing +z. Legs are boxes
// swinging about the hip, arms boxes swinging the other way about
// the shoulder, torso a six-sided prism, head an icosahedron: 92
// triangles, plus 12 for a backpack or 24 for a cap. No face.
function createPersonGeometry(
  variant
) {

  const spec =
    VARIANTS[
      variant %
      VARIANTS.length
    ];

  const hip =
    0.85;

  const shoulder =
    1.4;


  const parts = [

    // legs (left leg forward when the arm on that side goes back)
    part(
      new THREE.BoxGeometry(0.16, 0.85, 0.2),
      [0.1, 0.425, 0],
      spec.trousers,
      0,
      1,
      hip
    ),

    part(
      new THREE.BoxGeometry(0.16, 0.85, 0.2),
      [-0.1, 0.425, 0],
      spec.trousers,
      0,
      -1,
      hip
    ),

    // torso
    part(
      new THREE.CylinderGeometry(0.22, 0.18, 0.6, 6),
      [0, 1.15, 0],
      0xffffff,
      1,
      0,
      0,
      [1, 1, 0.62]
    ),

    // arms (sleeves take the clothing colour)
    part(
      new THREE.BoxGeometry(0.1, 0.6, 0.12),
      [0.3, 1.12, 0],
      0xffffff,
      1,
      -0.8,
      shoulder
    ),

    part(
      new THREE.BoxGeometry(0.1, 0.6, 0.12),
      [-0.3, 1.12, 0],
      0xffffff,
      1,
      0.8,
      shoulder
    ),

    // head
    part(
      new THREE.IcosahedronGeometry(0.12, 0),
      [0, 1.6, 0],
      spec.skin
    )
  ];


  if (
    spec.backpack
  ) {

    parts.push(
      part(
        new THREE.BoxGeometry(0.28, 0.36, 0.14),
        [0, 1.18, -0.2],
        0x1d2a33,
        0.35
      )
    );
  }


  if (
    spec.cap
  ) {

    parts.push(
      part(
        new THREE.CylinderGeometry(0.135, 0.135, 0.08, 6),
        [0, 1.71, 0],
        spec.hair
      )
    );
  }


  const merged =
    mergeGeometries(
      parts
    );


  for (
    const piece
    of parts
  ) {

    piece.dispose();
  }


  merged.scale(
    spec.scale,
    spec.scale,
    spec.scale
  );

  scaleSwingPivots(
    merged,
    spec.scale
  );


  return merged;
}


// The swing pivot is a height, so it scales with the person.
function scaleSwingPivots(
  geometry,
  scale
) {

  const swing =
    geometry.attributes.aSwing;


  for (
    let i = 0;
    i < swing.count;
    i++
  ) {

    swing.setY(
      i,
      swing.getY(i) *
      scale
    );
  }
}


// ==================================================
// MATERIAL (the walk, in the vertex shader)
// ==================================================

// Needs, per instance: aStart (x, y, z of the path start),
// aDir (x, z unit direction the path runs in) and aMotion
// (speed m/s, path length m, time offset s, scale), plus an
// instance colour. Speed 0 is a person standing still, facing
// aDir.
//
// A walker goes start -> start + dir * length at `speed`, stands
// PERSON_PAUSE seconds, walks back, stands again, and so on,
// turning on the spot. Everything is a function of uTime.
export function createPersonMaterial() {

  const uTime = {
    value: 0
  };


  const material =
    new THREE.MeshStandardMaterial({

      vertexColors:
        true,

      roughness:
        0.9,

      metalness:
        0
    });


  material.userData.uTime =
    uTime;


  material.customProgramCacheKey =
    () => 'person-walk-v1';


  material.onBeforeCompile =
    (shader) => {

      shader.uniforms.uTime =
        uTime;


      shader.vertexShader =
        shader.vertexShader

          .replace(
            '#include <common>',

            `#include <common>

            attribute vec3 aStart;
            attribute vec2 aDir;
            attribute vec4 aMotion;
            attribute vec2 aSwing;
            attribute float aTint;

            uniform float uTime;

            const float PERSON_PAUSE = ${PERSON_PAUSE.toFixed(1)};

            // set once per vertex in beginnormal_vertex
            vec3 gOffset;
            vec2 gFwd;`
          )

          .replace(
            '#include <color_vertex>',

            `#include <color_vertex>

            vColor = vec4(
              mix(
                color.rgb,
                color.rgb * instanceColor.rgb,
                aTint
              ),
              1.0
            );`
          )

          .replace(
            '#include <beginnormal_vertex>',

            `float pSpeed = aMotion.x;
            float pLength = aMotion.y;
            float pWalk = pLength / max(pSpeed, 0.001);
            float pCycle = 2.0 * (pWalk + PERSON_PAUSE);
            float pT = mod(uTime + aMotion.z, pCycle);
            float pS = 0.0;
            float pSign = 1.0;
            float pMoving = 0.0;
            float pStep = 0.0;

            if (pSpeed > 0.001) {

              if (pT < pWalk) {

                pS = pSpeed * pT;
                pMoving = 1.0;
                pStep = pT;
              }

              else if (pT < pWalk + PERSON_PAUSE) {

                pS = pLength;
              }

              else if (pT < 2.0 * pWalk + PERSON_PAUSE) {

                float pBack = pT - pWalk - PERSON_PAUSE;

                pS = pLength - pSpeed * pBack;
                pSign = -1.0;
                pMoving = 1.0;
                pStep = pBack;
              }

              else {

                pSign = -1.0;
              }
            }

            gOffset = aStart + vec3(aDir.x, 0.0, aDir.y) * pS;
            gFwd = aDir * pSign;

            float pAngle =
              sin(pStep * pSpeed * 1.5 * 6.2831853) *
              0.6 * pMoving * aSwing.x;

            float pCos = cos(pAngle);
            float pSin = sin(pAngle);

            vec3 objectNormal = vec3(normal);

            objectNormal = vec3(
              objectNormal.x,
              pCos * objectNormal.y - pSin * objectNormal.z,
              pSin * objectNormal.y + pCos * objectNormal.z
            );

            objectNormal = vec3(
              objectNormal.x * gFwd.y + objectNormal.z * gFwd.x,
              objectNormal.y,
              -objectNormal.x * gFwd.x + objectNormal.z * gFwd.y
            );

            #ifdef USE_TANGENT
              vec3 objectTangent = vec3(tangent.xyz);
            #endif`
          )

          .replace(
            '#include <begin_vertex>',

            `vec3 pPos = position;
            float pDy = pPos.y - aSwing.y;

            pPos = vec3(
              pPos.x,
              aSwing.y + pDy * pCos - pPos.z * pSin,
              pDy * pSin + pPos.z * pCos
            );

            pPos *= aMotion.w;

            vec3 transformed = vec3(
              pPos.x * gFwd.y + pPos.z * gFwd.x,
              pPos.y,
              -pPos.x * gFwd.x + pPos.z * gFwd.y
            ) + gOffset;

            #ifdef USE_ALPHAHASH
              vPosition = vec3(position);
            #endif`
          );
    };


  return material;
}


// One variant of pedestrian. variant 0..PERSON_VARIANT_COUNT-1.
export function createPerson(
  variant
) {

  return {

    geometry:
      createPersonGeometry(
        variant
      ),

    material:
      createPersonMaterial()
  };
}
