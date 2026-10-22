import * as THREE from 'three';

import {
  createBox,
  createTexturedBox,
  prepareAO,
  scaleLengthUV,
  MAIN_POTHOLES,
  ROAD_TILE_LENGTH,
  SPEED_BUMP,
  disposeObjectTree
} from './helpers.js';

import {
  DEFAULT_ROAD,
  alignedFrom,
  roadCentre,
  roadLength
} from '../roads.js';

import {
  createBarrierMesh,
  createBarrierRibs,
  createLaneDashes,
  createHighwayLampPoles,
  createSignTexture,
  createGantry
} from './props.js';


// ==================================================
// LEVEL 2: MOTORWAY
// --------------------------------------------------
// Same straight road along z at x = 0 as every level
// (18 m wide, 400 m long or longer, see roads.js), dressed as a motorway:
//
//   x  -9 ... -5.4   hard shoulder
//      -5.4 .. -1.8  lane    | solid white edge line at +-5.4
//      -1.8 ..  1.8  lane    | dashed lane lines at +-1.8
//       1.8 ..  5.4  lane    |
//       5.4 ..  9    hard shoulder
//
// x = 0 is the middle of the centre lane, where the spawn
// and the ground route are. The flyover (LevelManager) is
// drawn over x 3 .. 9.4, z 10 .. -110 and is not touched
// here; nothing in this file crosses that volume.
//
// Collidables (2): one barrier Mesh per side.
// ==================================================

const ROAD_HALF_WIDTH = 9;

const LANE_WIDTH = 3.6;
const EDGE_LINE_X = LANE_WIDTH * 1.5;     // 5.4
const LANE_LINE_X = LANE_WIDTH / 2;       // 1.8

export const BARRIER_X = 10.3;

const LAMP_X = 11.4;

// Half the length of the original road (lamps, dashes and ribs keep
// the phase they had on it)
const ROAD_HALF_LENGTH_ORIGINAL = 200;
const LAMP_SPACING = 60;

export const GANTRY = {
  z: 100,
  legX: 11.5,
  beamY: 8.5,
  signCentreY: 7.9,
  signWidth: 9,
  signHeight: 2.4,
  text: 'CBD 12 km'
};


// Per-call library materials are this environment's own
// clones, so changing their repeat or tint is safe.
function setRepeat(
  material,
  repeatX,
  repeatY
) {

  for (
    const slot
    of ['map', 'normalMap', 'roughnessMap', 'aoMap']
  ) {

    material[slot]?.repeat.set(
      repeatX,
      repeatY
    );
  }

  return material;
}


// Verge-to-field earth bank, extruded along z. Profile is
// (distance from the road centre, height); it is built for
// the +x side and the mesh is turned round for -x.
function createEmbankmentGeometry(
  length
) {

  const shape =
    new THREE.Shape();


  shape.moveTo(BARRIER_X + 0.3, -0.3);
  shape.lineTo(BARRIER_X + 0.3, 0);
  shape.lineTo(17, 2);
  shape.lineTo(26, 2);
  shape.lineTo(44, -0.1);
  shape.lineTo(44, -0.3);
  shape.closePath();


  const geometry =
    new THREE.ExtrudeGeometry(
      shape,
      {
        depth:
          length,

        bevelEnabled:
          false
      }
    );


  geometry.translate(
    0,
    0,
    -length / 2
  );


  return prepareAO(
    geometry
  );
}


export function createMotorway({
  materials,
  road: roadExtent = DEFAULT_ROAD
}) {

  const ROAD_Z_MIN =
    roadExtent.zMin;

  const ROAD_Z_MAX =
    roadExtent.zMax;

  const ROAD_LENGTH =
    roadLength(
      roadExtent
    );

  const ROAD_CENTRE =
    roadCentre(
      roadExtent
    );

  const group =
    new THREE.Group();

  const collidables =
    [];


  // ----------------------------------------------
  // GROUND (grass either side, as the city's)
  // ----------------------------------------------

  const ground =
    createTexturedBox(
      400,
      0.2,
      ROAD_LENGTH,
      materials.createGrassMaterial(),
      ROAD_TILE_LENGTH
    );


  ground.position.y =
    -0.2;

  ground.position.z =
    ROAD_CENTRE;


  group.add(
    ground
  );


  // ----------------------------------------------
  // TARMAC
  // ----------------------------------------------

  const roadMaterial =
    materials.createRoadMaterial();


  // A touch darker than the city asphalt
  roadMaterial.color.setHex(
    0xb9b9b9
  );


  const road =
    createTexturedBox(
      ROAD_HALF_WIDTH * 2,
      0.05,
      ROAD_LENGTH,
      roadMaterial,
      ROAD_TILE_LENGTH
    );


  road.position.y =
    -0.05;

  road.position.z =
    ROAD_CENTRE;


  group.add(
    road
  );


  // Hard shoulders: slightly lighter, worn strips
  const shoulderMaterial =
    new THREE.MeshStandardMaterial({

      color:
        0x5b5b58,

      roughness:
        1
    });


  const shoulderGeometry =
    new THREE.BoxGeometry(
      ROAD_HALF_WIDTH - EDGE_LINE_X,
      0.03,
      ROAD_LENGTH
    );


  for (
    const side
    of [-1, 1]
  ) {

    const shoulder =
      new THREE.Mesh(
        shoulderGeometry,
        shoulderMaterial
      );


    shoulder.position.set(
      side *
      (EDGE_LINE_X + ROAD_HALF_WIDTH) / 2,
      -0.01,
      ROAD_CENTRE
    );


    shoulder.receiveShadow =
      true;


    group.add(
      shoulder
    );
  }


  // ----------------------------------------------
  // MARKINGS
  // ----------------------------------------------

  const lineMaterial =
    new THREE.MeshStandardMaterial({

      color:
        0xf1efdc,

      roughness:
        0.9
    });


  const edgeLineGeometry =
    new THREE.BoxGeometry(
      0.2,
      0.025,
      ROAD_LENGTH
    );


  for (
    const side
    of [-1, 1]
  ) {

    const edge =
      new THREE.Mesh(
        edgeLineGeometry,
        lineMaterial
      );


    edge.position.set(
      side *
      EDGE_LINE_X,
      0.015,
      ROAD_CENTRE
    );


    edge.receiveShadow =
      true;


    group.add(
      edge
    );
  }


  group.add(
    createLaneDashes({
      xs:
        [-LANE_LINE_X, LANE_LINE_X],

      // dashes keep the original phase (z -200 + 12 k)
      zFrom:
        alignedFrom(
          -200,
          12,
          ROAD_Z_MIN
        ),

      zTo:
        ROAD_Z_MAX,

      period:
        12,

      dashLength:
        3,

      width:
        0.15,

      y:
        0.015,

      material:
        lineMaterial
    })
  );


  // ----------------------------------------------
  // VERGE (between the tarmac and the barrier)
  // ----------------------------------------------

  const vergeMaterial =
    materials.createRoughConcreteMaterial(
      1,
      80
    );


  const vergeWidth =
    BARRIER_X + 0.3 -
    ROAD_HALF_WIDTH;


  const vergeGeometry =
    scaleLengthUV(
      prepareAO(
        new THREE.BoxGeometry(
          vergeWidth,
          0.06,
          ROAD_LENGTH
        )
      ),
      ROAD_LENGTH,
      ROAD_TILE_LENGTH
    );


  for (
    const side
    of [-1, 1]
  ) {

    const verge =
      new THREE.Mesh(
        vergeGeometry,
        vergeMaterial
      );


    verge.position.set(
      side *
      (ROAD_HALF_WIDTH + vergeWidth / 2),
      0,
      ROAD_CENTRE
    );


    verge.receiveShadow =
      true;


    group.add(
      verge
    );
  }


  // ----------------------------------------------
  // BARRIERS (two collidable Meshes + instanced joints)
  // ----------------------------------------------

  const barrierMaterial =
    setRepeat(
      materials.createRoughConcreteMaterial(),
      0.4,
      0.4
    );


  for (
    const side
    of [-1, 1]
  ) {

    const barrier =
      createBarrierMesh({
        length:
          ROAD_LENGTH,

        material:
          barrierMaterial
      });


    barrier.name =
      'motorway-barrier';


    barrier.position.set(
      side *
      BARRIER_X,
      0,
      ROAD_CENTRE
    );


    group.add(
      barrier
    );


    collidables.push(
      barrier
    );
  }


  const ribMaterial =
    setRepeat(
      materials.createRoughConcreteMaterial(),
      0.4,
      0.4
    );


  ribMaterial.color.setHex(
    0xc4c4bc
  );


  // One InstancedMesh per 120 m window (a 4 m multiple, so the
  // ribs keep their original phase): a whole-road mesh would be
  // drawn in full while any part of it is in view
  for (
    let start = -200 +
      120 * Math.floor(
        (ROAD_Z_MIN + 200) / 120
      );
    start < ROAD_Z_MAX;
    start += 120
  ) {

    const from =
      alignedFrom(
        -200,
        4,
        Math.max(
          start,
          ROAD_Z_MIN
        )
      );

    const to =
      Math.min(
        start + 120,
        ROAD_Z_MAX
      );

    if (
      to - from < 4
    ) {

      continue;
    }

    group.add(
      createBarrierRibs({
        length:
          to - from,

        zFrom:
          from,

        spacing:
          4,

        xs:
          [-BARRIER_X, BARRIER_X],

        material:
          ribMaterial
      })
    );
  }


  // ----------------------------------------------
  // EMBANKMENTS
  // ----------------------------------------------

  const embankmentMaterial =
    setRepeat(
      materials.createGrassMaterial(),
      0.1625,
      0.1625
    );


  const embankmentGeometry =
    createEmbankmentGeometry(
      ROAD_LENGTH
    );


  for (
    const side
    of [-1, 1]
  ) {

    const bank =
      new THREE.Mesh(
        embankmentGeometry,
        embankmentMaterial
      );


    bank.name =
      'motorway-embankment';


    bank.rotation.y =
      side === -1
        ? Math.PI
        : 0;

    bank.position.z =
      ROAD_CENTRE;


    bank.receiveShadow =
      true;


    group.add(
      bank
    );
  }


  // ----------------------------------------------
  // HIGHWAY LAMPS (tall, faint glow, no real lights)
  // ----------------------------------------------

  const stations =
    [];


  // z -150 + 60 k, as the original six pairs
  for (
    let z = alignedFrom(
      -ROAD_HALF_LENGTH_ORIGINAL + LAMP_SPACING / 2 + 20,
      LAMP_SPACING,
      ROAD_Z_MIN + 50
    );
    z < ROAD_Z_MAX;
    z += LAMP_SPACING
  ) {

    stations.push(
      { x: -LAMP_X, z },
      { x: LAMP_X, z }
    );
  }


  group.add(
    createHighwayLampPoles({
      stations,

      poleMaterial:
        new THREE.MeshStandardMaterial({

          color:
            0x8a9094,

          roughness:
            0.45,

          metalness:
            0.6
        }),

      headMaterial:
        new THREE.MeshStandardMaterial({

          color:
            0xd9d9d1,

          emissive:
            0xffe2a0,

          emissiveIntensity:
            0.15
        })
    })
  );


  // ----------------------------------------------
  // OVERHEAD GANTRY SIGN
  // ----------------------------------------------

  const gantryMaterial =
    new THREE.MeshStandardMaterial({

      color:
        0x7d8387,

      roughness:
        0.5,

      metalness:
        0.55
    });


  const signMaterial =
    new THREE.MeshStandardMaterial({

      map:
        createSignTexture(
          GANTRY.text
        ),

      roughness:
        0.55
    });


  group.add(
    createGantry({
      ...GANTRY,

      frameMaterial:
        gantryMaterial,

      signMaterial
    })
  );


  // ----------------------------------------------
  // SPEED BUMP (vehicle physics: z 25, |x| < 7)
  // Restyled: pale thermoplastic hump
  // ----------------------------------------------

  const speedBump =
    createBox(
      SPEED_BUMP.width,
      SPEED_BUMP.height,
      SPEED_BUMP.depth,
      0xe9e6d8
    );


  speedBump.position.set(
    SPEED_BUMP.x,
    SPEED_BUMP.height / 2,
    SPEED_BUMP.z
  );


  speedBump.material.roughness =
    0.9;


  group.add(
    speedBump
  );


  // ----------------------------------------------
  // POTHOLES (vehicle physics: same x / z / radius)
  // Restyled: dark patched tarmac
  // ----------------------------------------------

  const potholeMaterial =
    new THREE.MeshStandardMaterial({

      color:
        0x0c0c0c,

      roughness:
        1
    });


  for (
    const pothole
    of MAIN_POTHOLES
  ) {

    const visual =
      new THREE.Mesh(

        new THREE.CircleGeometry(
          pothole.radius,
          40
        ),

        potholeMaterial
      );


    visual.rotation.x =
      -Math.PI / 2;


    visual.position.set(
      pothole.x,
      0.018,
      pothole.z
    );


    visual.receiveShadow =
      true;


    group.add(
      visual
    );
  }


  return {

    group,

    collidables,

    dispose() {

      disposeObjectTree(
        group,
        materials
      );
    }
  };
}
