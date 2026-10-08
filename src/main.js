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

import {
  createBox,
  MAIN_POTHOLES
} from './world/environments/helpers.js';


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
// COLLISIONS
// ==================================================

// Shared with VehicleController. LevelManager fills it with the
// level's environment (and flyover) collidables on load().
const collidableObjects =
  [];


// ==================================================
// POTHOLES (vehicle ground-height physics)
// ==================================================

// The environments draw these at the same positions
// (world/environments/helpers.js). Copies, because LevelManager
// pushes and splices its own hazards into this array.
const potholes =
  MAIN_POTHOLES.map(
    (pothole) => ({ ...pothole })
  );


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


const capturedOverlay =
  document.createElement(
    'div'
  );


capturedOverlay.className =
  'game-over';


capturedOverlay.style.display =
  'none';


document.body.appendChild(
  capturedOverlay
);


// Level switches (1/2/3) skip restartGame(), so they use this to
// drop the captured screen and give the taxi its controls back.
function clearCaptured() {

  if (
    capturedOverlay.style.display ===
    'none'
  ) {

    return;
  }


  capturedOverlay.style.display =
    'none';


  vehicle.setEnabled(
    true
  );
}


const levelManager =
  new LevelManager({

    scene,

    vehicle,

    taxi,

    collidables:
      collidableObjects,

    potholes,

    materials,

    getHeadlightsEnabled,

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
      },

    onCaptured:
      (event) => {

        capturedOverlay.innerHTML = `

          <h1>
            CAUGHT!
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
            Press R to retry
          </p>
        `;


        capturedOverlay.style.display =
          'flex';


        vehicle.setEnabled(
          false
        );
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


  capturedOverlay.style.display =
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


      clearCaptured();
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


      clearCaptured();
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


      clearCaptured();
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
          : objective.status ===
            'captured'
            ? ' — Caught!'
            : ''
    ) +

    (
      objective.status ===
        'driving' &&
      objective.pursuit.state ===
        'chasing'
        ? ` | PURSUED ${
            Math.round(
              objective.pursuit
                .distance
            )
          } m`
        : objective.status ===
            'driving' &&
          objective.pursuit.state ===
            'searching'
          ? ' | Pursuer searching'
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