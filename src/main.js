import * as THREE from 'three';

import './style.css';

import {
  createTaxi
} from './vehicle/Taxi.js';

import {
  CargoSystem
} from './vehicle/CargoSystem.js';

import {
  VehicleController
} from './vehicle/VehicleController.js';

import {
  CameraSystem
} from './cameras/CameraSystem.js';

import {
  LightingManager
} from './graphics/LightingManager.js';

import {
  EffectsManager
} from './graphics/EffectsManager.js';

import {
  DustSystem
} from './graphics/DustSystem.js';

import {
  MaterialLibrary
} from './graphics/MaterialLibrary.js';

import {
  SkyManager
} from './graphics/SkyManager.js';

import {
  LevelManager
} from './world/LevelManager.js';


// ==================================================
// SCENE
// ==================================================

const scene =
  new THREE.Scene();


// ==================================================
// CAMERA
// ==================================================

const camera =
  new THREE.PerspectiveCamera(

    68,

    window.innerWidth /
    window.innerHeight,

    0.1,

    1000
  );


// ==================================================
// RENDERER
// ==================================================

const renderer =
  new THREE.WebGLRenderer({

    antialias:
      true,

    powerPreference:
      'high-performance'
  });


renderer.setSize(

  window.innerWidth,

  window.innerHeight
);


renderer.setPixelRatio(

  Math.min(
    window.devicePixelRatio,
    2
  )
);


document.body.appendChild(
  renderer.domElement
);


// ==================================================
// GRAPHICS SYSTEMS
// ==================================================

const lighting =
  new LightingManager({

    scene,

    renderer
  });


const effects =
  new EffectsManager({

    scene
  });


const materials =
  new MaterialLibrary(
    renderer
  );


const skyManager =
  new SkyManager({

    scene,

    renderer
  });


let currentLevel =
  1;


// ==================================================
// GEOMETRY HELPERS
// ==================================================

function prepareAO(
  geometry
) {

  if (
    geometry.attributes.uv &&
    !geometry.attributes.uv1
  ) {

    geometry.setAttribute(

      'uv1',

      geometry.attributes.uv
    );
  }


  return geometry;
}


function createBox(
  width,
  height,
  depth,
  color
) {

  const mesh =
    new THREE.Mesh(

      new THREE.BoxGeometry(
        width,
        height,
        depth
      ),

      new THREE.MeshStandardMaterial({

        color,

        roughness:
          0.82,

        metalness:
          0.02
      })
    );


  mesh.castShadow =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}


function createTexturedBox(
  width,
  height,
  depth,
  material
) {

  const geometry =
    prepareAO(

      new THREE.BoxGeometry(
        width,
        height,
        depth
      )
    );


  const mesh =
    new THREE.Mesh(

      geometry,

      material
    );


  mesh.castShadow =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}


// ==================================================
// COLLISIONS
// ==================================================

const collidableObjects =
  [];


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


scene.add(
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


scene.add(
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


  scene.add(
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

      new THREE.BoxGeometry(
        0.15,
        0.025,
        5
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


  scene.add(
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


scene.add(
  speedBump
);


// ==================================================
// POTHOLES
// ==================================================

const potholes = [

  {
    x: 0,
    z: 5,
    radius: 1.5,
    depth: 0.35
  },

  {
    x: -2.5,
    z: -20,
    radius: 1.7,
    depth: 0.35
  },

  {
    x: 2.5,
    z: -50,
    radius: 1.6,
    depth: 0.32
  }
];


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

      new THREE.MeshStandardMaterial({

        color:
          0x121212,

        roughness:
          1
      })
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


  scene.add(
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

        materials
          .createPavementMaterial()
      );


    sidewalk.position.set(

      side *
      12.5,

      0.05,

      z
    );


    scene.add(
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


    scene.add(
      building
    );


    collidableObjects.push(
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


    scene.add(
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


      scene.add(
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

            new THREE.PlaneGeometry(
              1.5,
              1.5
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


        scene.add(
          frame
        );


        // Window glass.

        const glass =
          new THREE.Mesh(

            new THREE.PlaneGeometry(
              1.22,
              1.22
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


        scene.add(
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

          new THREE.PlaneGeometry(
            4.6,
            2.1
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


      scene.add(
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


      scene.add(
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

        new THREE.CylinderGeometry(
          0.08,
          0.1,
          6,
          10
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


    scene.add(
      pole
    );


    const arm =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          1.2,
          0.08,
          0.08
        ),

        poleMaterial
      );


    arm.position.set(

      side *
      9.05,

      5.75,

      z
    );


    scene.add(
      arm
    );


    const lamp =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          0.45,
          0.12,
          0.3
        ),

        new THREE.MeshStandardMaterial({

          color:
            0xd9d9d1,

          emissive:
            0xffd98a,

          emissiveIntensity:
            0.12
        })
      );


    lamp.position.set(

      side *
      8.55,

      5.7,

      z
    );


    scene.add(
      lamp
    );
  }
}


// ==================================================
// TAXI
// ==================================================

const {

  taxi,

  chassis,

  wheels,

  frontWheelPivots,

  cargoItems,

  toggleHeadlights,

  getHeadlightsEnabled,

  updateVisualEffects

} =
  createTaxi(
    createBox
  );


scene.add(
  taxi
);


// ==================================================
// GAME STATE
// ==================================================

let gameOver =
  false;


const minimumCargo =
  2;


// ==================================================
// GAME OVER UI
// ==================================================

const gameOverOverlay =
  document.createElement(
    'div'
  );


gameOverOverlay.className =
  'game-over';


gameOverOverlay.innerHTML = `

  <h1>
    GAME OVER
  </h1>

  <p>
    Too much cargo was lost.
  </p>

  <p>
    Press R to retry
  </p>
`;


gameOverOverlay.style.display =
  'none';


document.body.appendChild(
  gameOverOverlay
);


// ==================================================
// CARGO
// ==================================================

const cargoSystem =
  new CargoSystem({

    scene,

    chassis,

    taxi,

    cargoItems,

    gravity:
      -22,


    onCargoLost:
      (event) => {

        if (
          event.remaining <
          minimumCargo
        ) {

          triggerGameOver();
        }
      }
  });


// ==================================================
// VEHICLE
// ==================================================

const vehicle =
  new VehicleController({

    taxi,

    chassis,

    wheels,

    frontWheelPivots,

    cargoSystem,

    collidableObjects,

    potholes
  });


vehicle.setLevel(1);

vehicle.setGroundHeightProvider(
  null
);

vehicle.reset();


// ==================================================
// CAMERA
// ==================================================

const cameraSystem =
  new CameraSystem({

    camera,

    taxi,

    renderer
  });


// ==================================================
// DUST
// ==================================================

const dustSystem =
  new DustSystem({

    scene,

    taxi,

    vehicle
  });


// ==================================================
// LEVEL VISUALS
// ==================================================

function applyLevelVisuals(
  level
) {

  currentLevel =
    level;


  lighting.setLevel(
    level
  );


  effects.setLevel(
    level
  );


  dustSystem.setLevel(
    level
  );


  skyManager.setLevel(
    level
  );
}


applyLevelVisuals(
  1
);


// ==================================================
// LEVEL MANAGER (spawn, route, destination)
// ==================================================

const deliveredOverlay =
  document.createElement(
    'div'
  );


deliveredOverlay.className =
  'game-over delivered';


deliveredOverlay.style.display =
  'none';


document.body.appendChild(
  deliveredOverlay
);


const levelManager =
  new LevelManager({

    scene,

    vehicle,

    taxi,

    onDelivered:
      (event) => {

        deliveredOverlay.innerHTML = `

          <h1>
            DELIVERED!
          </h1>

          <p>
            Time: ${
              event.time.toFixed(1)
            } s
          </p>

          <p>
            Cargo: ${
              event.cargo.remaining
            } / ${
              event.cargo.total
            }
          </p>

          <p>
            Press R to replay
          </p>
        `;


        deliveredOverlay.style.display =
          'flex';
      }
  });


levelManager.load(
  1
);


// ==================================================
// GAME FUNCTIONS
// ==================================================

function getCargoState() {

  return cargoSystem
    .getState();
}


function triggerGameOver() {

  if (
    gameOver
  ) {

    return;
  }


  gameOver =
    true;


  vehicle.setEnabled(
    false
  );


  gameOverOverlay.style.display =
    'flex';
}


function restartGame() {

  gameOver =
    false;


  gameOverOverlay.style.display =
    'none';


  vehicle.reset();


  levelManager.reset();


  deliveredOverlay.style.display =
    'none';


  vehicle.setEnabled(
    true
  );


  dustSystem.reset();
}


// ==================================================
// INPUT
// ==================================================

const keys =
  {};


window.addEventListener(

  'keydown',

  (event) => {

    keys[
      event.code
    ] =
      true;


    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Space'
      ].includes(
        event.code
      )
    ) {

      event.preventDefault();
    }


    if (
      event.code ===
      'KeyR'
    ) {

      restartGame();
    }


    if (
      event.code ===
      'KeyC' &&
      !event.repeat
    ) {

      cameraSystem
        .nextMode();
    }


    if (
      event.code ===
      'KeyL' &&
      !event.repeat
    ) {

      toggleHeadlights();
    }


    // ----------------------------------------------
    // DEVELOPMENT LEVEL SWITCH
    // ----------------------------------------------

    if (
      event.code ===
      'Digit1'
    ) {

      applyLevelVisuals(
        1
      );


      vehicle.setLevel(
        1
      );


      levelManager.load(
        1
      );


      deliveredOverlay.style.display =
        'none';
    }


    if (
      event.code ===
      'Digit2'
    ) {

      applyLevelVisuals(
        2
      );


      vehicle.setLevel(
        2
      );


      levelManager.load(
        2
      );


      deliveredOverlay.style.display =
        'none';
    }


    if (
      event.code ===
      'Digit3'
    ) {

      applyLevelVisuals(
        3
      );


      vehicle.setLevel(
        3
      );


      levelManager.load(
        3
      );


      deliveredOverlay.style.display =
        'none';
    }
  }
);


window.addEventListener(

  'keyup',

  (event) => {

    keys[
      event.code
    ] =
      false;
  }
);


window.addEventListener(

  'blur',

  () => {

    for (
      const key
      in keys
    ) {

      keys[
        key
      ] =
        false;
    }
  }
);


// ==================================================
// HUD
// ==================================================

const hud =
  document.createElement(
    'div'
  );


hud.className =
  'hud';


hud.innerHTML = `

  <h1>
    SHARP-SHARP
  </h1>

  <p id="level-label"></p>

  <div id="speed"></div>

  <div id="physics"></div>

  <div id="camera-mode"></div>

  <div id="headlights"></div>

  <div id="cargo"></div>

  <div id="straps"></div>

  <div id="cargo-status"></div>

  <div class="instructions">

    W / S — Accelerate / Brake / Reverse
    <br>

    A / D — Steer
    <br>

    Space — Handbrake
    <br>

    C — Change camera
    <br>

    L — Toggle headlights
    <br>

    1 / 2 / 3 — Development level test
    <br>

    Mouse drag — Look around in chase view
    <br>

    Mouse wheel — Chase camera zoom
    <br>

    R — Restart

  </div>
`;


document.body.appendChild(
  hud
);


// ==================================================
// HUD REFERENCES
// ==================================================

const levelLabel =
  document.getElementById(
    'level-label'
  );


const speedDisplay =
  document.getElementById(
    'speed'
  );


const physicsDisplay =
  document.getElementById(
    'physics'
  );


const cameraModeDisplay =
  document.getElementById(
    'camera-mode'
  );


const headlightsDisplay =
  document.getElementById(
    'headlights'
  );


const cargoDisplay =
  document.getElementById(
    'cargo'
  );


const strapDisplay =
  document.getElementById(
    'straps'
  );


const cargoStatusDisplay =
  document.getElementById(
    'cargo-status'
  );


// ==================================================
// LABEL HELPERS
// ==================================================

function formatCameraName(
  mode
) {

  if (
    mode ===
    'CHASE'
  ) {

    return 'Chase';
  }


  if (
    mode ===
    'BUMPER'
  ) {

    return 'Bumper';
  }


  if (
    mode ===
    'INTERIOR'
  ) {

    return 'Interior';
  }


  return mode;
}


function getLevelName(
  level
) {

  if (
    level ===
    1
  ) {

    return 'Level 1 — Rank to CBD';
  }


  if (
    level ===
    2
  ) {

    return 'Level 2 — Highway';
  }


  if (
    level ===
    3
  ) {

    return 'Level 3 — Load Shedding';
  }


  return 'Sharp-Sharp';
}


// ==================================================
// CLOCK
// ==================================================

const clock =
  new THREE.Clock();


// ==================================================
// ANIMATION LOOP
// ==================================================

function animate() {

  const dt =
    Math.min(
      clock.getDelta(),
      0.05
    );


  const elapsedTime =
    clock.getElapsedTime();


  // ----------------------------------------------
  // VEHICLE
  // ----------------------------------------------

  vehicle.update(
    dt,
    keys
  );


  // ----------------------------------------------
  // LEVEL OBJECTIVE
  // ----------------------------------------------

  if (
    !gameOver
  ) {

    levelManager.update(
      dt,
      elapsedTime
    );
  }


  // ----------------------------------------------
  // CARGO
  // ----------------------------------------------

  if (
    gameOver
  ) {

    cargoSystem
      .updateDetached(
        dt
      );
  }


  // ----------------------------------------------
  // CAMERA
  // ----------------------------------------------

  cameraSystem.update(
    dt
  );


  // ----------------------------------------------
  // HEADLIGHT SHADER
  // ----------------------------------------------

  updateVisualEffects(
    elapsedTime
  );


  // ----------------------------------------------
  // HEAT HAZE
  // ----------------------------------------------

  effects.update(
    elapsedTime
  );


  // ----------------------------------------------
  // DUST
  // ----------------------------------------------

  dustSystem.update(
    dt
  );


  // ----------------------------------------------
  // SKY
  // ----------------------------------------------

  skyManager.update(
    elapsedTime
  );


  // ----------------------------------------------
  // HUD
  // ----------------------------------------------

  const cargoState =
    getCargoState();


  const objective =
    levelManager.getState();


  levelLabel.textContent =
    getLevelName(
      currentLevel
    ) +

    (
      objective.status ===
      'driving'
        ? ` — ${
            Math.round(
              objective
                .distanceToDestination
            )
          } m to destination (stop in the zone)`
        : objective.status ===
          'delivered'
          ? ' — Delivered!'
          : ''
    );


  speedDisplay.textContent =

    `Speed: ${
      Math.round(
        Math.abs(
          vehicle.getSpeed()
        ) *
        3.6
      )
    } km/h`;


  physicsDisplay.textContent =

    `Height: ${
      taxi.position.y.toFixed(
        2
      )
    } m | ${
      vehicle.isGrounded()
        ? 'Grounded'
        : 'Airborne'
    }`;


  cameraModeDisplay.textContent =

    `Camera: ${
      formatCameraName(
        cameraSystem.getMode()
      )
    }`;


  headlightsDisplay.textContent =

    `Headlights: ${
      getHeadlightsEnabled()
        ? 'ON'
        : 'OFF'
    }`;


  cargoDisplay.textContent =

    `Cargo: ${
      cargoState.remaining
    } / ${
      cargoState.total
    } | Stability: ${
      Math.round(
        cargoState.stability
      )
    }%`;


  strapDisplay.textContent =

    `Straps: ${
      Math.round(
        cargoState.straps
      )
    }%`;


  cargoStatusDisplay.textContent =

    `Load status: ${
      cargoState.status
    }`;


  // ----------------------------------------------
  // RENDER
  // ----------------------------------------------

  renderer.render(
    scene,
    camera
  );


  requestAnimationFrame(
    animate
  );
}


animate();


// ==================================================
// RESIZE
// ==================================================

window.addEventListener(

  'resize',

  () => {

    camera.aspect =

      window.innerWidth /
      window.innerHeight;


    camera
      .updateProjectionMatrix();


    renderer.setSize(

      window.innerWidth,

      window.innerHeight
    );
  }
);