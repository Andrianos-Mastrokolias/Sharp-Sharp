import * as THREE from 'three';
import { createTaxiRank } from './props/rank.js';
import {
  createBox,
  createTexturedBox,
  MAIN_POTHOLES,
  ROAD_TILE_LENGTH,
  createGeometryCache,
  createMergeBatch,
  disposeObjectTree
} from './helpers.js';

import {
  createStreetLamps,
  createZebraCrossing
} from './props.js';

import {
  createLife,
  createPedestrianField,
  LIFE_DENSITY
} from './life.js';

import {
  DEFAULT_ROAD,
  alignedFrom,
  roadCentre,
  roadLength
} from '../roads.js';


// ==================================================
// LEVEL 1: CITY STREET
// --------------------------------------------------
// The original shared world, moved here from main.js
// unchanged (same positions, sizes, materials).
// Only mechanical differences: it adds to `group`
// instead of the scene, building meshes go in
// `collidables`, and identical geometries and
// materials are created once and reused.
//
// Draw-call budget: every repeated, non-collidable part
// (sidewalks, roofs, rooftop boxes, windows, shopfronts,
// awnings, lane dashes) is merged per 120 m chunk (four
// building slots) and side of the street, and each street
// lamp station is its own instanced chunk, so frustum
// culling still drops everything that is off screen. Merged
// parts are drawn whole while any of their chunk is in view,
// so the in-view triangle count stays within ~1% of the
// unmerged street (measured: tests/tools/gl-measure.mjs).
// The collidable buildings stay single Meshes (the original 26,
// then two per slot of a longer road).
//
// The chunks were 30 m (one slot) while the road was 400 m. On a
// 960 m road the camera sees a longer street at once (a level's
// view distance is its fog distance, see main.js), and 120 m
// chunks keep the draw calls of that view near the old ones (the
// in-view triangles barely change: the same windows are drawn).
//
// Street life (Stage 1): four side streets are cut into the
// gaps between building slots (the sidewalk slabs stop at the
// building edges there, a dark strip runs out from the kerb,
// and a zebra crosses its mouth). life.js puts people on the
// sidewalks at |x| >= 11 and on those zebras; nobody is ever
// on the carriageway and nothing of it is collidable.
// ==================================================

// Merge chunk length along the street (metres): four building
// slots, so a building's windows are drawn with the buildings.
const CHUNK_SIZE = 120;


// --------------------------------------------------
// Road length. The original road is z -200..200, with building
// slots every 30 m from z -180 (slot 0) to 180 (slot 12), four
// side streets, lamps every 40 m from -160 and dashes every 12 m
// from -190. A longer road keeps all of that exactly and carries
// the same pattern on past it: slots continue at the same
// spacing (a building's look follows its slot number, which runs
// on below 0 and above 12), the side streets repeat every ten
// slots, and every repeating thing keeps its phase.
// --------------------------------------------------
export function createCityStreet({
  materials,
  road: roadExtent = DEFAULT_ROAD
}) {

const ROAD_Z_MIN =
  roadExtent.zMin;

const ROAD_Z_MAX =
  roadExtent.zMax;

const ROAD_CENTRE =
  roadCentre(
    roadExtent
  );

const ROAD_LENGTH =
  roadLength(
    roadExtent
  );

const group =
  new THREE.Group();

const collidables =
  [];

  // Add Johannesburg taxi rank scenery to Level 1
const taxiRank = createTaxiRank({
  materials,
  zFrom: -60,
  zTo: 170
});

group.add(taxiRank.group);
collidables.push(...taxiRank.collidables);


const geo =
  createGeometryCache();

const batch =
  createMergeBatch({
    chunkSize:
      CHUNK_SIZE
  });

// ==================================================
// GROUND
// ==================================================

const ground =
  createTexturedBox(

    400,

    0.2,

    ROAD_LENGTH,

    materials
      .createGrassMaterial(),

    ROAD_TILE_LENGTH
  );


ground.position.y =
  -0.2;

ground.position.z =
  ROAD_CENTRE;


group.add(
  ground
);


// ==================================================
// ROAD
// ==================================================

const road =
  createTexturedBox(

    18,

    0.05,

    ROAD_LENGTH,

    materials
      .createRoadMaterial(),

    ROAD_TILE_LENGTH
  );


road.position.y =
  -0.05;

road.position.z =
  ROAD_CENTRE;


group.add(
  road
);


// ==================================================
// KERBS
// ==================================================

const kerbMaterial =
  materials
    .createRoughConcreteMaterial(
      1,
      80
    );


for (
  const side
  of [-1, 1]
) {

  const kerb =
    createTexturedBox(

      0.32,

      0.22,

      ROAD_LENGTH,

      kerbMaterial,

      ROAD_TILE_LENGTH
    );


  kerb.position.set(

    side *
    8.75,

    0.04,

    ROAD_CENTRE
  );


  group.add(
    kerb
  );
}


// ==================================================
// ROAD MARKINGS
// ==================================================

const lineMaterial =
  new THREE.MeshStandardMaterial({

    color:
      0xf1efdc,

    roughness:
      0.9
  });


for (
  let z = alignedFrom(
    -190,
    12,
    ROAD_Z_MIN +
    2.5
  );
  z < ROAD_Z_MAX;
  z += 12
) {

  const line =
    new THREE.Mesh(

      geo(
        'line',
        () => new THREE.BoxGeometry(
          0.15,
          0.025,
          5
        )
      ),

      lineMaterial
    );


  line.position.set(
    0,
    0.015,
    z
  );


  line.receiveShadow =
    true;


  batch.add(
    line
  );
}


// ==================================================
// SPEED BUMP
// ==================================================

const speedBump =
  createBox(
    14,
    0.35,
    3,
    0xe1b300
  );


speedBump.position.set(
  0,
  0.175,
  25
);


speedBump.material.roughness =
  0.9;


group.add(
  speedBump
);


// ==================================================
// POTHOLES
// ==================================================

const potholes =
  MAIN_POTHOLES;


const potholeMaterial =
  new THREE.MeshStandardMaterial({

    color:
      0x121212,

    roughness:
      1
  });


for (
  const pothole
  of potholes
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


// ==================================================
// WINDOW MATERIAL
// ==================================================

const windowMaterial =
  new THREE.MeshPhysicalMaterial({

    color:
      0x243843,

    roughness:
      0.13,

    metalness:
      0.2,

    clearcoat:
      0.65,

    clearcoatRoughness:
      0.14,

    envMapIntensity:
      1.8
  });


// ==================================================
// WINDOW FRAME MATERIAL
// ==================================================

const frameMaterial =
  new THREE.MeshStandardMaterial({

    color:
      0x25292b,

    roughness:
      0.5,

    metalness:
      0.3
  });


// ==================================================
// SHOP GLASS
// ==================================================

const shopGlassMaterial =
  new THREE.MeshPhysicalMaterial({

    color:
      0x364a51,

    roughness:
      0.15,

    metalness:
      0.15,

    transparent:
      true,

    opacity:
      0.82,

    envMapIntensity:
      1.5
  });


// ==================================================
// BUILDINGS
// ==================================================

// Every sidewalk is the same size with the same texture
// repeat, so they share one material.

const sidewalkMaterial =
  materials
    .createPavementMaterial();


const buildingMaterials =
  new Map();

// Same roof slab / rooftop box texture on every building
const roofMaterial =
  materials
    .createRoughConcreteMaterial(
      4,
      6
    );

const serviceBoxMaterial =
  materials
    .createRoughConcreteMaterial(
      2,
      2
    );

// Awnings: the same plain material createBox() would
// make, one per colour instead of one per awning.
const awningMaterials = {};

for (
  const color
  of [0xb63a2d, 0x29577b]
) {

  awningMaterials[
    color
  ] =
    new THREE.MeshStandardMaterial({

      color,

      roughness:
        0.82,

      metalness:
        0.02
    });
}


// ==================================================
// SIDE STREETS
// --------------------------------------------------
// The street runs out between building slot k and k + 1
// on one side, through the gap the two buildings leave.
// ==================================================

const SLOT_Z0 =
  -180;

const SLOT_SPACING =
  30;

// The original slots are 0..12 (z -180..180). A longer road adds
// slots below 0 and above 12 while a slab (z +- 14) still reaches
// no further than 10 m past the road's end.
const CORE_SLOT_FIRST =
  0;

const CORE_SLOT_LAST =
  12;

const SLOT_FIRST =
  Math.ceil(
    (ROAD_Z_MIN + 4 - SLOT_Z0) /
    SLOT_SPACING
  );

const SLOT_LAST =
  Math.floor(
    (ROAD_Z_MAX - 4 - SLOT_Z0) /
    SLOT_SPACING
  );

// The original slots first (so their buildings, collidables and
// people come out exactly as before), then the ones added beyond
const slotList =
  [];

for (
  let k = CORE_SLOT_FIRST;
  k <= CORE_SLOT_LAST;
  k++
) {

  slotList.push(
    k
  );
}

for (
  let k = CORE_SLOT_FIRST - 1;
  k >= SLOT_FIRST;
  k--
) {

  slotList.push(
    k
  );
}

for (
  let k = CORE_SLOT_LAST + 1;
  k <= SLOT_LAST;
  k++
) {

  slotList.push(
    k
  );
}

const isCoreSlot =
  (k) =>
    k >= CORE_SLOT_FIRST &&
    k <= CORE_SLOT_LAST;

// A slot's number says what its building looks like: the sizes,
// materials and shopfronts all follow `buildingIndex` modulo 2,
// 3, 4 and 5, so adding 60 (a multiple of each) keeps the look of
// every original slot and lets the pattern run on below slot 0.
const indexOf =
  (k, side) =>
    2 * k +
    (side === 1 ? 1 : 0) +
    60;

// The building's depth (along z), as in the loop below
const slotDepth =
  (k, side) =>
    18 +
    (
      indexOf(k, side) %
      4
    ) *
    1.8;

// The original four side streets, then the same pattern every ten
// slots beyond the original ones (which stay as they were)
const SIDE_STREET_PATTERN =
  { 1: 1, 3: -1, 6: 1, 9: -1 };

const sideStreetSpecs =
  [
    { k: 1, side: 1 },
    { k: 3, side: -1 },
    { k: 6, side: 1 },
    { k: 9, side: -1 }
  ];

for (
  let k = SLOT_FIRST;
  k < SLOT_LAST;
  k++
) {

  const side =
    SIDE_STREET_PATTERN[
      ((k % 10) + 10) % 10
    ];

  // None next to an original slot: that would shorten the
  // original sidewalk beside it
  if (
    side !== undefined &&
    !isCoreSlot(k) &&
    !isCoreSlot(k + 1)
  ) {

    sideStreetSpecs.push({
      k,
      side
    });
  }
}

const sideStreets =
  sideStreetSpecs.map(
    ({ k, side }) => ({
      k,
      side,
      core:
        isCoreSlot(k),
      z0:
        SLOT_Z0 + k * SLOT_SPACING +
        slotDepth(k, side) / 2,
      z1:
        SLOT_Z0 + (k + 1) * SLOT_SPACING -
        slotDepth(k + 1, side) / 2
    })
  );

const SIDEWALK_TOP =
  0.2;

// Where people may be (see life.js). The original stretch and the
// stretch added to it are laid out separately, so the original
// people stay exactly where they were.
const lifeLayout =
  {
    sidewalks: [],
    crossings: []
  };

const lifeLayoutAdded =
  {
    sidewalks: [],
    crossings: []
  };


for (
  const slot
  of slotList
) {

  const z =
    SLOT_Z0 +
    slot *
    SLOT_SPACING;

  for (
    const side
    of [-1, 1]
    
  ) {
    // Reserve the taxi-rank section for rank-specific scenery.
// Keep the rest of the CBD buildings unchanged.
if (z >= -60 && z <= 170) {
  continue;
}

    const buildingIndex =
      indexOf(
        slot,
        side
      );

    // ----------------------------------------------
    // SIDEWALK
    // ----------------------------------------------

    // Full slab z - 14 .. z + 14, except where a side street
    // leaves the main road: then it stops at the building edge.
    let walkFrom =
      z - 14;

    let walkTo =
      z + 14;

    for (
      const street
      of sideStreets
    ) {

      if (
        street.side !== side
      ) {

        continue;
      }


      if (
        street.k === slot
      ) {

        walkTo =
          street.z0;
      }

      if (
        street.k + 1 === slot
      ) {

        walkFrom =
          street.z1;
      }
    }


    // The last slabs stop at the end of the road (the original ones,
    // z -194..194, never reached it)
    walkFrom =
      Math.max(
        walkFrom,
        ROAD_Z_MIN
      );

    walkTo =
      Math.min(
        walkTo,
        ROAD_Z_MAX
      );


    const sidewalk =
      createTexturedBox(

        7,

        0.3,

        walkTo - walkFrom,

        sidewalkMaterial
      );


    sidewalk.position.set(

      side *
      12.5,

      0.05,

      (walkFrom + walkTo) / 2
    );


    (
      isCoreSlot(slot)
        ? lifeLayout
        : lifeLayoutAdded
    ).sidewalks.push({
      side,
      z0: walkFrom + 0.8,
      z1: walkTo - 0.8,
      y: SIDEWALK_TOP
    });


    batch.add(
      sidewalk
    );


    // ----------------------------------------------
    // BUILDING SIZE
    // ----------------------------------------------

    const height =

      9 +

      (
        buildingIndex %
        5
      ) *

      3.2;


    const width =

      8.5 +

      (
        buildingIndex %
        3
      ) *

      1.15;


    const depth =

      18 +

      (
        buildingIndex %
        4
      ) *

      1.8;


    const xOffset =

      side *

      (
        21 +

        (
          buildingIndex %
          3
        ) *
        0.75
      );


    const repeatY =
      Math.max(

        6,

        height /
        1.45
      );


    // ----------------------------------------------
    // BUILDING MATERIAL
    // ----------------------------------------------

    const useBrick =

      buildingIndex %
      3 ===
      1;


    // Buildings with the same kind, repeat and tint get
    // identical materials, so they share one.
    let buildingMaterial;


    if (
      useBrick
    ) {

      const key =
        `brick|${repeatY}`;


      buildingMaterial =
        buildingMaterials.get(
          key
        ) ??
        materials
          .createBrickBuildingMaterial(
            repeatY
          );


      buildingMaterials.set(
        key,
        buildingMaterial
      );
    }

    else {

      const tintOptions = [

        0xffffff,

        0xd9d5ca,

        0xc3c9c7,

        0xe0d6c7
      ];


      const tint =
        tintOptions[
          buildingIndex %
          tintOptions.length
        ];


      const key =
        `concrete|${repeatY}|${tint}`;


      buildingMaterial =
        buildingMaterials.get(
          key
        ) ??
        materials
          .createConcreteBuildingMaterial(
            repeatY,
            tint
          );


      buildingMaterials.set(
        key,
        buildingMaterial
      );
    }


    // ----------------------------------------------
    // BUILDING
    // ----------------------------------------------

    const building =
      createTexturedBox(

        width,

        height,

        depth,

        buildingMaterial
      );


    building.position.set(

      xOffset,

      height /
      2,

      z
    );


    group.add(
      building
    );


    collidables.push(
      building
    );


    // ----------------------------------------------
    // ROOF
    // ----------------------------------------------

    const roof =
      createTexturedBox(

        width +
        0.35,

        0.32,

        depth +
        0.35,

        roofMaterial
      );


    roof.position.set(

      xOffset,

      height +
      0.15,

      z
    );


    batch.add(
      roof
    );


    // ----------------------------------------------
    // ROOFTOP SERVICE STRUCTURE
    // ----------------------------------------------

    if (
      buildingIndex %
      2 ===
      0
    ) {

      const serviceBox =
        createTexturedBox(

          2.4,

          1.3,

          3,

          serviceBoxMaterial
        );


      serviceBox.position.set(

        xOffset,

        height +
        0.95,

        z +
        2
      );


      batch.add(
        serviceBox
      );
    }


    // ----------------------------------------------
    // WINDOWS
    // ----------------------------------------------

    const rows =
      Math.max(

        2,

        Math.floor(
          (
            height -
            3
          ) /
          2.8
        )
      );


    for (
      let row = 0;
      row < rows;
      row++
    ) {

      const y =

        3.2 +

        row *
        2.75;


      for (
        let offset = -3.2;
        offset <= 3.2;
        offset += 2.15
      ) {

        const frontX =

          side *

          (
            Math.abs(
              xOffset
            ) -

            width /
            2 -

            0.025
          );


        // Frame.

        const frame =
          new THREE.Mesh(

            geo(
              'windowFrame',
              () => new THREE.PlaneGeometry(
                1.5,
                1.5
              )
            ),

            frameMaterial
          );


        frame.position.set(

          frontX,

          y,

          z +
          offset
        );


        frame.rotation.y =

          side ===
          -1

            ? Math.PI /
              2

            : -Math.PI /
              2;


        batch.add(
          frame
        );


        // Window glass.

        const glass =
          new THREE.Mesh(

            geo(
              'windowGlass',
              () => new THREE.PlaneGeometry(
                1.22,
                1.22
              )
            ),

            windowMaterial
          );


        glass.position.copy(
          frame.position
        );


        glass.position.x +=

          side ===
          -1

            ? 0.012

            : -0.012;


        glass.rotation.y =
          frame.rotation.y;


        batch.add(
          glass
        );
      }
    }


    // ----------------------------------------------
    // SHOPFRONTS
    // ----------------------------------------------

    if (
      buildingIndex %
      3 !==
      2
    ) {

      const frontX =

        side *

        (
          Math.abs(
            xOffset
          ) -

          width /
          2 -

          0.04
        );


      const shop =
        new THREE.Mesh(

          geo(
            'shopGlass',
            () => new THREE.PlaneGeometry(
              4.6,
              2.1
            )
          ),

          shopGlassMaterial
        );


      shop.position.set(

        frontX,

        1.25,

        z
      );


      shop.rotation.y =

        side ===
        -1

          ? Math.PI /
            2

          : -Math.PI /
            2;


      batch.add(
        shop
      );


      // Awning.

      const awning =
        new THREE.Mesh(

          geo(
            'awning',
            () => new THREE.BoxGeometry(
              1,
              0.15,
              4.9
            )
          ),

          awningMaterials[
            buildingIndex %
            2 ===
            0

              ? 0xb63a2d

              : 0x29577b
          ]
        );


      awning.castShadow =
        true;


      awning.receiveShadow =
        true;


      awning.position.set(

        side *

        (
          Math.abs(
            xOffset
          ) -

          width /
          2 -

          0.35
        ),

        2.45,

        z
      );


      batch.add(
        awning
      );
    }

  }
}


// ==================================================
// SIDE STREET SURFACES, ZEBRAS AND PEOPLE
// ==================================================

// The main road's average colour (linear), without its grain
const sideStreetMaterial =
  new THREE.MeshStandardMaterial({

    color:
      new THREE.Color().setRGB(
        0.055,
        0.0447,
        0.0361
      ),

    roughness:
      1
  });


for (
  const street
  of sideStreets
) {

  const reach =
    60 - 8.91;

  const surface =
    new THREE.Mesh(

      new THREE.BoxGeometry(
        reach,
        0.05,
        street.z1 - street.z0
      ),

      sideStreetMaterial
    );


  surface.position.set(
    street.side *
    (8.91 + reach / 2),
    -0.05,
    (street.z0 + street.z1) / 2
  );


  surface.receiveShadow =
    true;


  group.add(
    surface
  );


  group.add(
    createZebraCrossing({

      x:
        street.side *
        12.2,

      z0:
        street.z0 + 0.2,

      z1:
        street.z1 - 0.2,

      y:
        -0.025,

      length:
        2.8,

      material:
        lineMaterial
    })
  );


  (
    street.core
      ? lifeLayout
      : lifeLayoutAdded
  ).crossings.push({
    side:
      street.side,

    z0:
      street.z0 + 0.8,

    z1:
      street.z1 - 0.8,

    y:
      -0.02
  });
}


// Everyone the street's life puts on the sidewalks, known to the hit test
// (LevelManager hands it the taxi each frame); the dust puffs of a hit
// are drawn from it
const pedestrians =
  createPedestrianField();

group.add(
  pedestrians.object
);

createLife({
  level: 1,
  layout: lifeLayout,
  group,
  field: pedestrians
});


// The stretch added beyond the original road gets the same
// density: the instance cap grows with its length (216 per 400 m,
// as the original), and its people use their own seed so the
// original ones are not disturbed.
const addedLength =
  Math.max(
    0,
    -200 - ROAD_Z_MIN
  ) +
  Math.max(
    0,
    ROAD_Z_MAX - 200
  );

if (
  addedLength > 0
) {

  createLife({
    level: 1,
    layout: lifeLayoutAdded,
    group,
    field: pedestrians,
    density: {
      ...LIFE_DENSITY[1],
      seed:
        LIFE_DENSITY[1].seed + 1,
      maxInstances:
        Math.round(
          LIFE_DENSITY[1].maxInstances *
          addedLength /
          400
        )
    }
  });
}


// ==================================================
// STREET LIGHTS
// ==================================================

const poleMaterial =
  new THREE.MeshStandardMaterial({

    color:
      0x42484b,

    roughness:
      0.4,

    metalness:
      0.65
  });


const lampMaterial =
  new THREE.MeshStandardMaterial({

    color:
      0xd9d9d1,

    emissive:
      0xffd98a,

    emissiveIntensity:
      0.12
  });


const lampStations =
  [];


for (
  let z = alignedFrom(
    -160,
    40,
    ROAD_Z_MIN +
    40
  );
  z <= ROAD_Z_MAX - 40;
  z += 40
) {

  for (
    const side
    of [-1, 1]
  ) {

    lampStations.push({
      x:
        side *
        9.6,

      z
    });
  }
}


for (
  const mesh
  of createStreetLamps({

    stations:
      lampStations,

    poleMaterial,

    lampMaterial,

    // lamps are 40 m apart: one station per instanced chunk
    chunkSize:
      20,

    zMin:
      -200
  })
) {

  group.add(
    mesh
  );
}


// ==================================================
// MERGED STREET DETAIL
// ==================================================

batch.build(
  group
);


return {

  group,

  collidables,

  // The people, for pedestrian hits (see life.js)
  pedestrians,

  dispose() {

    pedestrians.dispose();

    disposeObjectTree(
      group,
      materials
    );
  }
};
}
