import * as THREE from 'three';

import {
  createBox,
  createTexturedBox,
  MAIN_POTHOLES,
  createGeometryCache,
  createMergeBatch,
  disposeObjectTree
} from './helpers.js';

import {
  createStreetLamps
} from './props.js';


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
// awnings, lane dashes) is merged per 30 m chunk (one
// building slot) and side of the street, and each street
// lamp station is its own instanced chunk, so frustum
// culling still drops everything that is off screen. Merged
// parts are drawn whole while any of their chunk is in view,
// so the in-view triangle count stays within ~1% of the
// unmerged street (measured: tests/tools/gl-measure.mjs).
// The 26 collidable buildings stay single Meshes.
// ==================================================

// Merge chunk length along the street (metres): one building
// slot, so a building's windows are drawn with the building.
const CHUNK_SIZE = 30;


export function createCityStreet({ materials }) {

const group =
  new THREE.Group();

const collidables =
  [];

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

    400,

    materials
      .createGrassMaterial()
  );


ground.position.y =
  -0.2;


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

    400,

    materials
      .createRoadMaterial()
  );


road.position.y =
  -0.05;


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

      400,

      kerbMaterial
    );


  kerb.position.set(

    side *
    8.75,

    0.04,

    0
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
  let z = -190;
  z < 200;
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


let buildingIndex =
  0;


for (
  let z = -180;
  z <= 180;
  z += 30
) {

  for (
    const side
    of [-1, 1]
  ) {

    // ----------------------------------------------
    // SIDEWALK
    // ----------------------------------------------

    const sidewalk =
      createTexturedBox(

        7,

        0.3,

        28,

        sidewalkMaterial
      );


    sidewalk.position.set(

      side *
      12.5,

      0.05,

      z
    );


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


    buildingIndex++;
  }
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
  let z = -160;
  z <= 160;
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

  dispose() {

    disposeObjectTree(
      group,
      materials
    );
  }
};
}
