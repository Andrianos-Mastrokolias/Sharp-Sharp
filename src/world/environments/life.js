import * as THREE from 'three';

import {
  createRandom,
  createPerson,
  personPosition,
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
// ==================================================
// THE CLOCK
// --------------------------------------------------
// The walk is a function of uTime, and uTime is this, written by each
// chunk mesh's onBeforeRender. The hit test reads the same clock, so
// the CPU and the GPU agree on where everyone is (to a frame).
// ==================================================
export const pedestrianClock =
  () =>
    performance.now() *
    0.001;


// ==================================================
// PEDESTRIAN HITS
// --------------------------------------------------
// The people are animated entirely in a vertex shader, so a hit
// needs the CPU copy of the path (personPosition in props/people.js).
// A PedestrianField knows every person of the level (read straight
// from the instance attributes, so it can never disagree with what is
// drawn) and, each frame, tests the few near the taxi:
//
//   const field = createPedestrianField();
//   group.add(field.object);                  // the dust puffs
//   createLife({ ..., field });               // adds the chunk meshes
//   field.onHit = (x, z, id) => { ... };
//   field.update(dt, taxi, speed);            // every frame
//   field.reset();                            // everyone back, puffs gone
//
// A hit person is knocked aside: scale 0 (it vanishes from the shader)
// and a puff of dust. Rules: the taxi must be doing HIT_MIN_SPEED or
// more; a person is hit once until reset(); after a hit nobody can be
// hit for HIT_COOLDOWN seconds (a contact during it is not consumed).
//
// For people added later (the Level 3 / Level 1 runners):
//   addMesh(mesh)          -> { first, count }  ids of an InstancedMesh with
//                             aStart / aDir / aMotion, built any time
//   setOffset(id, offset)  change a person's time offset (aMotion.z)
//   restart(id, now)       start its path from the beginning at now
//   setActive(id, on)      hide and ignore a person, or bring it back
//   positionOf(id, out, now)
// ==================================================

export const PERSON_RADIUS = 0.35;     // m, shoulder to shoulder about 0.5 m
export const HIT_MIN_SPEED = 1;        // m/s
export const HIT_COOLDOWN = 0.5;       // s
const HIT_MAX_TAXI_Y = 1.5;            // a taxi up on a flyover hits nobody
const BUCKET = 10;                     // m of z per search bucket
const QUERY_HALF = 3.5;                // taxi box half diagonal 2.67 + radius, rounded up


// Puffs of dust where a person was hit: one Points object, one
// preallocated pool, nothing created while playing
function createDustPuffs() {

  const PUFFS = 8;
  const PER_PUFF = 12;
  const COUNT = PUFFS * PER_PUFF;

  const positions =
    new Float32Array(
      COUNT * 3
    );

  const velocities =
    new Float32Array(
      COUNT * 3
    );

  const life =
    new Float32Array(
      COUNT
    );

  for (
    let i = 0;
    i < COUNT;
    i++
  ) {

    positions[i * 3 + 1] =
      -999;
  }

  const geometry =
    new THREE.BufferGeometry();

  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      positions,
      3
    )
  );

  const material =
    new THREE.PointsMaterial({
      color: 0xb89d7c,
      size: 0.7,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true
    });

  const points =
    new THREE.Points(
      geometry,
      material
    );

  points.name =
    'pedestrian-dust';

  points.frustumCulled =
    false;

  // drawn only while a puff is alive
  points.visible =
    false;

  let next =
    0;

  let alive =
    0;

  const hide =
    () => {

      for (
        let i = 0;
        i < COUNT;
        i++
      ) {

        life[i] =
          0;

        positions[i * 3 + 1] =
          -999;
      }

      alive =
        0;

      points.visible =
        false;

      geometry.attributes.position.needsUpdate =
        true;
    };

  return {

    points,

    get alive() {
      return alive;
    },

    spawn(x, y, z) {

      const base =
        next * PER_PUFF;

      next =
        (next + 1) % PUFFS;

      for (
        let j = 0;
        j < PER_PUFF;
        j++
      ) {

        const i =
          base + j;

        const angle =
          Math.random() *
          Math.PI *
          2;

        const speed =
          0.8 +
          Math.random() * 1.6;

        positions[i * 3] =
          x;

        positions[i * 3 + 1] =
          y;

        positions[i * 3 + 2] =
          z;

        velocities[i * 3] =
          Math.cos(angle) * speed;

        velocities[i * 3 + 1] =
          0.6 +
          Math.random() * 1.2;

        velocities[i * 3 + 2] =
          Math.sin(angle) * speed;

        life[i] =
          0.5 +
          Math.random() * 0.5;
      }

      points.visible =
        true;

      geometry.attributes.position.needsUpdate =
        true;
    },

    update(dt) {

      if (
        !points.visible
      ) {

        return;
      }

      alive =
        0;

      const drag =
        Math.pow(
          0.2,
          dt
        );

      for (
        let i = 0;
        i < COUNT;
        i++
      ) {

        if (
          life[i] <= 0
        ) {

          continue;
        }

        life[i] -=
          dt;

        if (
          life[i] <= 0
        ) {

          positions[i * 3 + 1] =
            -999;

          continue;
        }

        alive++;

        positions[i * 3] +=
          velocities[i * 3] * dt;

        positions[i * 3 + 1] +=
          velocities[i * 3 + 1] * dt;

        positions[i * 3 + 2] +=
          velocities[i * 3 + 2] * dt;

        velocities[i * 3] *=
          drag;

        velocities[i * 3 + 1] *=
          drag;

        velocities[i * 3 + 2] *=
          drag;
      }

      if (
        alive === 0
      ) {

        points.visible =
          false;
      }

      geometry.attributes.position.needsUpdate =
        true;
    },

    clear: hide
  };
}


export function createPedestrianField({
  clock = pedestrianClock
} = {}) {

  // Per person (id = position in these lists)
  const meshes =
    [];

  const slots =
    [];

  const baseScale =
    [];

  const hit =
    [];

  const active =
    [];

  const meshList =
    [];

  // z bucket (BUCKET m) -> ids whose whole path crosses it
  const buckets =
    new Map();

  const scratch =
    {
      x: 0,
      z: 0,
      sign: 1
    };

  const puffs =
    createDustPuffs();

  let sinceHit =
    Infinity;

  let hitCount =
    0;


  const read =
    (id) => meshes[id].geometry.attributes;


  const field = {

    // () => seconds: the clock the shader's uTime comes from
    clock,

    // (x, z, id) => void, called once per hit, after the person is gone
    onHit: null,

    // The taxi's collision box, half sizes (m); LevelManager sets them
    // from vehicle.localTaxiCollisionBox
    halfX: 1.35,
    halfZ: 2.3,

    radius: PERSON_RADIUS,

    // The dust puffs: add this to the environment's group
    object: puffs.points,

    get count() {
      return meshes.length;
    },

    get hits() {
      return hitCount;
    },

    get puffsAlive() {
      return puffs.alive;
    },

    isHit: (id) => hit[id] === true,

    // The person's walking speed (0: standing), from the instance data
    speedOf: (id) => read(id).aMotion.array[slots[id] * 4],


    // Adds every instance of an InstancedMesh that has the aStart / aDir /
    // aMotion attributes. Safe at any time. -> { first, count }
    addMesh(mesh) {

      const { aStart, aDir, aMotion } =
        mesh.geometry.attributes;

      const first =
        meshes.length;

      meshList.push(
        mesh
      );

      for (
        let i = 0;
        i < mesh.count;
        i++
      ) {

        const id =
          meshes.length;

        meshes.push(
          mesh
        );

        slots.push(
          i
        );

        baseScale.push(
          aMotion.array[i * 4 + 3]
        );

        hit.push(
          false
        );

        active.push(
          true
        );

        // every bucket the path crosses (a taxi within reach of the person
        // searches the buckets around its own z, which include one of these)
        const z0 =
          aStart.array[i * 3 + 2];

        const z1 =
          z0 +
          aDir.array[i * 2 + 1] *
          (aMotion.array[i * 4] > 0.001
            ? aMotion.array[i * 4 + 1]
            : 0);

        const from =
          Math.floor(
            Math.min(z0, z1) /
            BUCKET
          );

        const to =
          Math.floor(
            Math.max(z0, z1) /
            BUCKET
          );

        for (
          let b = from;
          b <= to;
          b++
        ) {

          if (
            !buckets.has(
              b
            )
          ) {

            buckets.set(
              b,
              []
            );
          }

          buckets.get(
            b
          ).push(
            id
          );
        }
      }

      return {
        first,
        count: mesh.count
      };
    },


    positionOf(
      id,
      out,
      now = clock()
    ) {

      const { aStart, aDir, aMotion } =
        read(id);

      const i =
        slots[id];

      return personPosition(
        out,
        aStart.array[i * 3],
        aStart.array[i * 3 + 2],
        aDir.array[i * 2],
        aDir.array[i * 2 + 1],
        aMotion.array[i * 4],
        aMotion.array[i * 4 + 1],
        aMotion.array[i * 4 + 2],
        now
      );
    },


    // Changes a person's time offset (aMotion.z): where it is in its cycle
    setOffset(id, offset) {

      const { aMotion } =
        read(id);

      aMotion.array[slots[id] * 4 + 2] =
        offset;

      aMotion.needsUpdate =
        true;
    },


    // Starts a person's path from its start at time now (the offset
    // that makes its cycle begin then)
    restart(
      id,
      now = clock()
    ) {

      const { aMotion } =
        read(id);

      const i =
        slots[id];

      const speed =
        aMotion.array[i * 4];

      const cycle =
        2 *
        (aMotion.array[i * 4 + 1] /
          Math.max(speed, 0.001) +
          3);

      field.setOffset(
        id,
        (((-now) % cycle) + cycle) % cycle
      );
    },


    // Hides and ignores a person (a runner waiting for its trigger), or
    // brings it back. A person that has been hit stays gone until reset().
    setActive(id, on) {

      active[id] =
        on;

      const { aMotion } =
        read(id);

      aMotion.array[slots[id] * 4 + 3] =
        on && !hit[id]
          ? baseScale[id]
          : 0;

      aMotion.needsUpdate =
        true;
    },


    // Per frame, no allocation. Returns true on the frame a person is hit.
    update(
      dt,
      taxi,
      speed,
      now = clock()
    ) {

      puffs.update(
        dt
      );

      sinceHit +=
        dt;

      // after a hit nobody can be hit for a while: a contact now is not
      // consumed, the person is still there when it ends
      if (
        sinceHit < HIT_COOLDOWN - 1e-9 ||
        Math.abs(speed) < HIT_MIN_SPEED ||
        taxi.position.y > HIT_MAX_TAXI_Y
      ) {

        return false;
      }

      const tx =
        taxi.position.x;

      const tz =
        taxi.position.z;

      const yaw =
        taxi.rotation.y;

      const cos =
        Math.cos(yaw);

      const sin =
        Math.sin(yaw);

      const reachX =
        field.halfX +
        field.radius;

      const reachZ =
        field.halfZ +
        field.radius;

      const last =
        Math.floor(
          (tz + QUERY_HALF) /
          BUCKET
        );

      for (
        let b = Math.floor((tz - QUERY_HALF) / BUCKET);
        b <= last;
        b++
      ) {

        const ids =
          buckets.get(
            b
          );

        if (
          ids === undefined
        ) {

          continue;
        }

        for (
          let k = 0;
          k < ids.length;
          k++
        ) {

          const id =
            ids[k];

          if (
            hit[id] ||
            !active[id]
          ) {

            continue;
          }

          field.positionOf(
            id,
            scratch,
            now
          );

          const dx =
            scratch.x - tx;

          const dz =
            scratch.z - tz;

          // into the taxi's own frame (its forward is -z at yaw 0)
          const lx =
            dx * cos -
            dz * sin;

          const lz =
            dx * sin +
            dz * cos;

          if (
            Math.abs(lx) < reachX &&
            Math.abs(lz) < reachZ
          ) {

            field.knockDown(
              id
            );

            return true;
          }
        }
      }

      return false;
    },


    // The person at scratch (just positioned) is gone: scale 0, a puff,
    // the cooldown, onHit
    knockDown(id) {

      const { aStart, aMotion } =
        read(id);

      const i =
        slots[id];

      hit[id] =
        true;

      aMotion.array[i * 4 + 3] =
        0;

      aMotion.needsUpdate =
        true;

      puffs.spawn(
        scratch.x,
        aStart.array[i * 3 + 1] + 0.5,
        scratch.z
      );

      sinceHit =
        0;

      hitCount++;

      field.onHit?.(
        scratch.x,
        scratch.z,
        id
      );
    },


    // Everyone back (their scale), no puffs, no cooldown, no hit counted
    reset() {

      for (
        let id = 0;
        id < meshes.length;
        id++
      ) {

        hit[id] =
          false;

        active[id] =
          true;

        read(id).aMotion.array[slots[id] * 4 + 3] =
          baseScale[id];
      }

      for (
        const mesh
        of meshList
      ) {

        mesh.geometry.attributes.aMotion.needsUpdate =
          true;
      }

      sinceHit =
        Infinity;

      hitCount =
        0;

      puffs.clear();
    },


    dispose() {

      meshes.length =
        0;

      slots.length =
        0;

      baseScale.length =
        0;

      hit.length =
        0;

      active.length =
        0;

      meshList.length =
        0;

      buckets.clear();

      field.onHit =
        null;

      puffs.clear();
    }
  };

  return field;
}


export const LIFE_DENSITY = {

  1: {

    seed:
      90210,

    // hard cap on instances for the whole level
    maxInstances:
      216,

    // one InstancedMesh per variant per chunk: 120 m keeps the draw
    // calls of a long street down (it was 60 m on the 400 m one)
    chunkSize:
      120,

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
  density = LIFE_DENSITY[level],

  // a PedestrianField to register the people with, for the hit test
  field = null
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
            pedestrianClock();
        };
    }


    group.add(
      mesh
    );

    field?.addMesh(
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
