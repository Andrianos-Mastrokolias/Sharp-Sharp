import * as THREE from 'three';

import {
  createBox,
  createTexturedBox,
  MAIN_POTHOLES,
  createGeometryCache,
  disposeObjectTree
} from './helpers.js';


// ==================================================
// LEVEL 1: CITY STREET
// --------------------------------------------------
// The original shared world, moved here from main.js
// unchanged (same positions, sizes, materials, order).
// Only mechanical differences: it adds to `group`
// instead of the scene, building meshes go in
// `collidables`, and identical geometries / the
// sidewalk material are created once and reused.
// ==================================================

export function createCityStreet({ materials }) {

const group =
  new THREE.Group();

const collidables =
  [];

const geo =
  createGeometryCache();

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

for (
  const side
  of [-1, 1]
) {

  const kerb =
    createTexturedBox(

      0.32,

      0.22,

      400,

      materials
        .createRoughConcreteMaterial(
          1,
          80
        )
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


  group.add(
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


    group.add(
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


    let buildingMaterial;


    if (
      useBrick
    ) {

      buildingMaterial =
        materials
          .createBrickBuildingMaterial(
            repeatY
          );
    }

    else {

      const tintOptions = [

        0xffffff,

        0xd9d5ca,

        0xc3c9c7,

        0xe0d6c7
      ];


      buildingMaterial =
        materials
          .createConcreteBuildingMaterial(

            repeatY,

            tintOptions[
              buildingIndex %
              tintOptions.length
            ]
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

        materials
          .createRoughConcreteMaterial(
            4,
            6
          )
      );


    roof.position.set(

      xOffset,

      height +
      0.15,

      z
    );


    group.add(
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

          materials
            .createRoughConcreteMaterial(
              2,
              2
            )
        );


      serviceBox.position.set(

        xOffset,

        height +
        0.95,

        z +
        2
      );


      group.add(
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


        group.add(
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


        group.add(
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


      group.add(
        shop
      );


      // Awning.

      const awning =
        createBox(

          1,

          0.15,

          4.9,

          buildingIndex %
          2 ===
          0

            ? 0xb63a2d

            : 0x29577b
        );


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


      group.add(
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


for (
  let z = -160;
  z <= 160;
  z += 40
) {

  for (
    const side
    of [-1, 1]
  ) {

    const pole =
      new THREE.Mesh(

        geo(
          'pole',
          () => new THREE.CylinderGeometry(
            0.08,
            0.1,
            6,
            10
          )
        ),

        poleMaterial
      );


    pole.position.set(

      side *
      9.6,

      3,

      z
    );


    pole.castShadow =
      true;


    group.add(
      pole
    );


    const arm =
      new THREE.Mesh(

        geo(
          'arm',
          () => new THREE.BoxGeometry(
            1.2,
            0.08,
            0.08
          )
        ),

        poleMaterial
      );


    arm.position.set(

      side *
      9.05,

      5.75,

      z
    );


    group.add(
      arm
    );


    const lamp =
      new THREE.Mesh(

        geo(
          'lamp',
          () => new THREE.BoxGeometry(
            0.45,
            0.12,
            0.3
          )
        ),

        lampMaterial
      );


    lamp.position.set(

      side *
      8.55,

      5.7,

      z
    );


    group.add(
      lamp
    );
  }
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
