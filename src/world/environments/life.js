import * as THREE from 'three';

import {
  createRandom,
  createPerson,
  PERSON_VARIANT_COUNT
} from './props.js';


// ==================================================
// STREET LIFE
// --------------------------------------------------
// One module every environment calls to populate its
// verges with people (later: traffic, litter, ...). The
// environment says WHERE people may be (a layout of
// sidewalks and crossings); this file decides how many,
// who and which way they face, from a per-level density.
// What a person looks like is not decided here: every
// repeated thing comes from a factory in props.js.
//
//   createLife({ level, layout, group })
//     -> { meshes, stats }
//
// layout (world units, x signed):
//   sidewalks  [{ side, z0, z1, y }]   stretches of verge
//              people may stand and walk on (|x| from the
//              density's standX / walkX)
//   crossings  [{ side, z0, z1, y }]   side-street mouths:
//              crossers walk z0 -> z1 along the painted
//              zebra, wait, and come back
//
// People are never collidable and never on the carriageway:
// every x comes from the density's |x| ranges, which the
// level keeps off the road, and tests/people.test.mjs
// checks it.
//
// Performance: one InstancedMesh per (variant, 60 m chunk,
// side of the road). The walk is a vertex shader driven by
// per-instance attributes and one uTime uniform, so nothing
// here allocates or loops per frame: onBeforeRender only
// writes a number into that uniform.
// ==================================================

// Muted clothing colours, multiplied into each person's shirt
const CLOTHING = [
  0x9c3b30,
  0x2f5d8a,
  0xd0b24a,
  0x3d7a4e,
  0xe8e4d8,
  0x7a4a8c,
  0xcf7a2e,
  0x2d2d33,
  0x6b8f9c,
  0xb85c7a,
  0x8a8f3c,
  0x4a3a2c
];


// Per-level density. A level without an entry gets no people.
export const LIFE_DENSITY = {

  1: {

    seed:
      90210,

    // hard cap on instances for the whole level
    maxInstances:
      216,

    chunkSize:
      60,

    // |x| ranges (the sidewalk is |x| 9..16; people keep to >= 11)
    standX:
      [11.9, 13.8],

    walkX:
      [14.4, 15.3],

    crossX:
      [11.8, 13.1],

    crossersPerStreet:
      3,

    walkersPerSidewalk:
      [1, 2],

    groupsPerSidewalk:
      [1, 3],

    groupSize:
      [2, 4],

    walkSpeed:
      [1.0, 1.5],

    crossSpeed:
      [1.3, 1.6],

    // chance of each variant (needs PERSON_VARIANT_COUNT entries)
    variantWeights:
      [0.4, 0.25, 0.15, 0.2]
  }
};


const SCALE_RANGE = [0.94, 1.06];


export function createLife({
  level,
  layout,
  group,
  density = LIFE_DENSITY[level]
}) {

  const stats = {
    total: 0,
    standing: 0,
    walking: 0,
    crossing: 0,
    perVariant:
      new Array(
        PERSON_VARIANT_COUNT
      ).fill(0)
  };


  if (
    !density ||
    !layout
  ) {

    return {
      meshes: [],
      stats
    };
  }


  const random =
    createRandom(
      density.seed
    );

  const between =
    ([lo, hi]) =>
      lo + random() * (hi - lo);

  const count =
    ([lo, hi]) =>
      lo + Math.floor(random() * (hi - lo + 1));


  const people =
    [];


  const add = (
    kind,
    side,
    x,
    y,
    z,
    dx,
    dz,
    speed,
    length
  ) => {

    if (
      people.length >=
      density.maxInstances
    ) {

      return;
    }


    let pick =
      random();

    let variant = 0;

    for (
      ;
      variant < PERSON_VARIANT_COUNT - 1;
      variant++
    ) {

      pick -=
        density.variantWeights[
          variant
        ];

      if (
        pick < 0
      ) {

        break;
      }
    }


    people.push({
      kind,
      side,
      variant,
      x,
      y,
      z,
      dx,
      dz,
      speed,
      length,
      phase:
        random() * 120,
      scale:
        between(
          SCALE_RANGE
        ),
      color:
        CLOTHING[
          Math.floor(
            random() *
            CLOTHING.length
          )
        ]
    });
  };


  // ----------------------------------------------
  // Crossers: back and forth along a zebra
  // ----------------------------------------------

  for (
    const crossing
    of layout.crossings ?? []
  ) {

    for (
      let i = 0;
      i < density.crossersPerStreet;
      i++
    ) {

      const forward =
        i % 2 === 0;

      const length =
        crossing.z1 -
        crossing.z0;

      const x =
        crossing.side *
        between(
          density.crossX
        );


      add(
        'crossing',
        crossing.side,
        x,
        crossing.y,
        forward
          ? crossing.z0
          : crossing.z1,
        0,
        forward
          ? 1
          : -1,
        between(
          density.crossSpeed
        ),
        length
      );
    }
  }


  // ----------------------------------------------
  // Walkers along each sidewalk
  // ----------------------------------------------

  for (
    const walk
    of layout.sidewalks ?? []
  ) {

    const room =
      walk.z1 -
      walk.z0;


    if (
      room < 8
    ) {

      continue;
    }


    for (
      let i = 0,
        n = count(
          density.walkersPerSidewalk
        );
      i < n;
      i++
    ) {

      const length =
        Math.min(
          room,
          5 +
          random() * 10
        );

      const from =
        walk.z0 +
        random() *
        (room - length);

      const forward =
        random() < 0.5;


      add(
        'walking',
        walk.side,
        walk.side *
        between(
          density.walkX
        ),
        walk.y,
        forward
          ? from
          : from + length,
        0,
        forward
          ? 1
          : -1,
        between(
          density.walkSpeed
        ),
        length
      );
    }
  }


  // ----------------------------------------------
  // Standing groups, facing each other
  // ----------------------------------------------

  for (
    const area
    of layout.sidewalks ?? []
  ) {

    const room =
      area.z1 -
      area.z0;


    if (
      room < 4
    ) {

      continue;
    }


    for (
      let g = 0,
        groups = count(
          density.groupsPerSidewalk
        );
      g < groups;
      g++
    ) {

      const cx =
        area.side *
        between(
          density.standX
        );

      const cz =
        area.z0 +
        1 +
        random() *
        (room - 2);


      for (
        let m = 0,
          size = count(
            density.groupSize
          );
        m < size;
        m++
      ) {

        const angle =
          m / size *
          Math.PI *
          2 +
          random();

        // |x| stays inside the stand range: 0.5 m ring at most
        const px =
          cx +
          Math.cos(angle) *
          0.45;

        const pz =
          cz +
          Math.sin(angle) *
          0.45;


        // face the middle of the group
        const dx =
          cx - px;

        const dz =
          cz - pz;

        const norm =
          Math.hypot(
            dx,
            dz
          ) || 1;


        add(
          'standing',
          area.side,
          px,
          area.y,
          pz,
          dx / norm,
          dz / norm,
          0,
          0
        );
      }
    }
  }


  // ----------------------------------------------
  // Group into InstancedMeshes
  // ----------------------------------------------

  const bins =
    new Map();


  for (
    const person
    of people
  ) {

    const key =
      `${Math.floor((person.z + 200) / density.chunkSize)}|` +
      `${person.side}|${person.variant}`;


    if (
      !bins.has(
        key
      )
    ) {

      bins.set(
        key,
        []
      );
    }


    bins.get(
      key
    ).push(
      person
    );


    stats.total++;

    stats[
      person.kind
    ]++;

    stats.perVariant[
      person.variant
    ]++;
  }


  // One geometry + material per variant (from the factory);
  // every chunk clones the geometry for its own instance data.
  const templates =
    Array.from(
      { length: PERSON_VARIANT_COUNT },
      (_, variant) => createPerson(
        variant
      )
    );


  const identity =
    new THREE.Matrix4();

  const tint =
    new THREE.Color();

  const meshes =
    [];


  for (
    const list
    of bins.values()
  ) {

    const { geometry: base, material } =
      templates[
        list[0].variant
      ];


    const geometry =
      base.clone();


    const starts =
      new Float32Array(
        list.length * 3
      );

    const dirs =
      new Float32Array(
        list.length * 2
      );

    const motion =
      new Float32Array(
        list.length * 4
      );


    const box =
      new THREE.Box3();

    const end =
      new THREE.Vector3();

    const start =
      new THREE.Vector3();


    list.forEach(
      (person, i) => {

        starts[i * 3] =
          person.x;

        starts[i * 3 + 1] =
          person.y;

        starts[i * 3 + 2] =
          person.z;

        dirs[i * 2] =
          person.dx;

        dirs[i * 2 + 1] =
          person.dz;

        motion[i * 4] =
          person.speed;

        motion[i * 4 + 1] =
          person.length;

        motion[i * 4 + 2] =
          person.phase;

        motion[i * 4 + 3] =
          person.scale;


        start.set(
          person.x,
          person.y,
          person.z
        );

        end.set(
          person.x +
          person.dx * person.length,
          person.y,
          person.z +
          person.dz * person.length
        );

        box.expandByPoint(
          start
        );

        box.expandByPoint(
          end
        );
      }
    );


    geometry.setAttribute(
      'aStart',
      new THREE.InstancedBufferAttribute(
        starts,
        3
      )
    );

    geometry.setAttribute(
      'aDir',
      new THREE.InstancedBufferAttribute(
        dirs,
        2
      )
    );

    geometry.setAttribute(
      'aMotion',
      new THREE.InstancedBufferAttribute(
        motion,
        4
      )
    );


    const mesh =
      new THREE.InstancedMesh(
        geometry,
        material,
        list.length
      );


    list.forEach(
      (person, i) => {

        mesh.setMatrixAt(
          i,
          identity
        );

        mesh.setColorAt(
          i,
          tint.setHex(
            person.color
          )
        );
      }
    );


    mesh.instanceMatrix.needsUpdate =
      true;

    mesh.instanceColor.needsUpdate =
      true;


    // The instance matrices are identity (the shader places
    // everyone), so cull on the real extent of their paths
    box.expandByScalar(
      1.2
    );

    mesh.boundingSphere =
      box.getBoundingSphere(
        new THREE.Sphere()
      );


    mesh.name =
      'life-people';


    // The only per-frame work: one number into one uniform
    const uTime =
      material.userData.uTime;

    if (
      uTime
    ) {

      mesh.onBeforeRender =
        () => {

          uTime.value =
            performance.now() *
            0.001;
        };
    }


    group.add(
      mesh
    );

    meshes.push(
      mesh
    );
  }


  for (
    const template
    of templates
  ) {

    template.geometry.dispose();
  }


  return {
    meshes,
    stats
  };
}
