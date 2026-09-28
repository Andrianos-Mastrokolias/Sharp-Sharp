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


// --------------------------------------------------
// 1. Scene
// --------------------------------------------------

const scene =
  new THREE.Scene();

scene.background =
  new THREE.Color(
    0x87b9d9
  );

scene.fog =
  new THREE.Fog(
    0x87b9d9,
    80,
    250
  );


// --------------------------------------------------
// 2. Camera
// --------------------------------------------------

const camera =
  new THREE.PerspectiveCamera(
    70,

    window.innerWidth /
    window.innerHeight,

    0.1,

    1000
  );


// --------------------------------------------------
// 3. Renderer
// --------------------------------------------------

const renderer =
  new THREE.WebGLRenderer({
    antialias: true
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

renderer.shadowMap.enabled =
  true;

renderer.shadowMap.type =
  THREE.PCFSoftShadowMap;

document.body.appendChild(
  renderer.domElement
);


// --------------------------------------------------
// 4. Lighting
// --------------------------------------------------

scene.add(
  new THREE.HemisphereLight(
    0xffffff,
    0x667788,
    2
  )
);


const sun =
  new THREE.DirectionalLight(
    0xffffff,
    2.5
  );

sun.position.set(
  -30,
  60,
  25
);

sun.castShadow = true;

sun.shadow.mapSize.set(
  1024,
  1024
);

sun.shadow.camera.left =
  -100;

sun.shadow.camera.right =
  100;

sun.shadow.camera.top =
  100;

sun.shadow.camera.bottom =
  -100;

scene.add(sun);


// --------------------------------------------------
// 5. Helpers
// --------------------------------------------------

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
        color
      })
    );

  mesh.castShadow = true;

  mesh.receiveShadow = true;

  return mesh;
}


// --------------------------------------------------
// 6. World
// --------------------------------------------------

const collidableObjects = [];


// Ground
const ground =
  createBox(
    400,
    0.2,
    400,
    0x7b9368
  );

ground.position.y =
  -0.2;

scene.add(ground);


// Road
const road =
  createBox(
    18,
    0.05,
    400,
    0x30343b
  );

road.position.y =
  -0.05;

scene.add(road);


// Road markings
for (
  let z = -190;
  z < 200;
  z += 12
) {
  const line =
    createBox(
      0.18,
      0.02,
      5,
      0xf4e9bf
    );

  line.position.set(
    0,
    0.01,
    z
  );

  scene.add(line);
}


// Speed bump
const speedBump =
  createBox(
    14,
    0.35,
    3,
    0xe6b800
  );

speedBump.position.set(
  0,
  0.175,
  25
);

scene.add(speedBump);


// --------------------------------------------------
// Potholes
// --------------------------------------------------

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
        32
      ),

      new THREE.MeshStandardMaterial({
        color: 0x171717
      })
    );

  visual.rotation.x =
    -Math.PI / 2;

  visual.position.set(
    pothole.x,
    0.015,
    pothole.z
  );

  scene.add(visual);
}


// --------------------------------------------------
// Buildings
// --------------------------------------------------

for (
  let z = -180;
  z <= 180;
  z += 30
) {
  for (
    const side
    of [-1, 1]
  ) {
    const sidewalk =
      createBox(
        7,
        0.3,
        28,
        0xb8b8b0
      );

    sidewalk.position.set(
      side * 12.5,
      0.05,
      z
    );

    scene.add(sidewalk);


    const height =
      8 +
      (
        (
          Math.abs(z) +
          side +
          5
        ) % 5
      ) * 3;


    const building =
      createBox(
        10,
        height,
        22,
        0x9aa8b1
      );

    building.position.set(
      side * 22,
      height / 2,
      z
    );

    scene.add(building);

    collidableObjects.push(
      building
    );
  }
}


// --------------------------------------------------
// 7. Taxi
// --------------------------------------------------

const {
  taxi,
  chassis,
  wheels,
  frontWheelPivots,
  cargoItems
} =
  createTaxi(
    createBox
  );


scene.add(taxi);


// --------------------------------------------------
// 8. Game state
// --------------------------------------------------

let gameOver = false;


// Fail if only 1 cargo
// item remains.
const minimumCargo = 2;


// --------------------------------------------------
// 9. Game-over overlay
// --------------------------------------------------

const gameOverOverlay =
  document.createElement(
    'div'
  );


gameOverOverlay.className =
  'game-over';


gameOverOverlay.innerHTML = `
  <h1>GAME OVER</h1>

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


// --------------------------------------------------
// 10. Cargo system
// --------------------------------------------------

const cargoSystem =
  new CargoSystem({
    scene,

    chassis,

    taxi,

    cargoItems,

    gravity: -22,

    onCargoLost:
      (event) => {

        console.log(
          `${event.name} lost. ${event.remaining} cargo remaining.`
        );


        if (
          event.remaining <
          minimumCargo
        ) {
          triggerGameOver();
        }
      }
  });


// --------------------------------------------------
// 11. Vehicle controller
// --------------------------------------------------

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


// --------------------------------------------------
// Clean cargo API
// --------------------------------------------------

function getCargoState() {
  return cargoSystem.getState();
}


// --------------------------------------------------
// 12. Game-over functions
// --------------------------------------------------

function triggerGameOver() {
  if (gameOver) {
    return;
  }

  gameOver = true;

  vehicle.setEnabled(
    false
  );

  gameOverOverlay.style.display =
    'flex';
}


function restartGame() {
  gameOver = false;

  gameOverOverlay.style.display =
    'none';

  vehicle.reset();

  vehicle.setEnabled(
    true
  );
}


// --------------------------------------------------
// 13. Keyboard input
// --------------------------------------------------

const keys = {};


window.addEventListener(
  'keydown',
  (event) => {
    keys[event.code] =
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
  event.code === 'KeyH' &&
  vehicle.getLevel() === 3
) {
  vehicle.triggerLevel3Hazard(
    1,
    1
  );
}
  }
);


window.addEventListener(
  'keyup',
  (event) => {
    keys[event.code] =
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
      keys[key] = false;
    }
  }


);


// --------------------------------------------------
// 14. Mouse camera
// --------------------------------------------------

let cameraAngle = 0;

let cameraDistance = 11;

let dragging = false;

let lastMouseX = 0;


renderer.domElement
  .addEventListener(
    'pointerdown',
    (event) => {
      dragging = true;

      lastMouseX =
        event.clientX;

      renderer.domElement
        .setPointerCapture(
          event.pointerId
        );
    }
  );


renderer.domElement
  .addEventListener(
    'pointermove',
    (event) => {
      if (!dragging) {
        return;
      }

      cameraAngle +=
        (
          event.clientX -
          lastMouseX
        ) *
        0.005;

      lastMouseX =
        event.clientX;
    }
  );


renderer.domElement
  .addEventListener(
    'pointerup',
    () => {
      dragging = false;
    }
  );


renderer.domElement
  .addEventListener(
    'wheel',
    (event) => {
      cameraDistance =
        THREE.MathUtils.clamp(
          cameraDistance +
          event.deltaY *
          0.01,

          6,
          20
        );
    }
  );


// --------------------------------------------------
// 15. Camera update
// --------------------------------------------------

function updateCamera(dt) {
  const angle =
    taxi.rotation.y +
    cameraAngle;


  const desiredPosition =
    new THREE.Vector3(
      taxi.position.x +
      Math.sin(angle) *
      cameraDistance,

      taxi.position.y +
      cameraDistance *
      0.45,

      taxi.position.z +
      Math.cos(angle) *
      cameraDistance
    );


  camera.position.lerp(
    desiredPosition,

    1 -
    Math.exp(
      -6 *
      dt
    )
  );


  camera.lookAt(
    taxi.position.x,

    taxi.position.y +
    1.5,

    taxi.position.z
  );
}


// --------------------------------------------------
// 16. HUD
// --------------------------------------------------

const hud =
  document.createElement(
    'div'
  );


hud.className = 'hud';


hud.innerHTML = `
  <h1>SHARP-SHARP</h1>

  <p>
    Level 1 — Cargo Physics
  </p>

  <div id="speed"></div>

  <div id="physics"></div>

  <div id="cargo"></div>

  <div id="straps"></div>

  <div id="cargo-status"></div>

  <div class="instructions">
    W / S — Accelerate / Brake / Reverse<br>
    A / D — Steer<br>
    Space — Handbrake<br>
    Mouse drag — Rotate camera<br>
    Mouse wheel — Zoom<br>
    R — Restart
  </div>
`;


document.body.appendChild(
  hud
);


const speedDisplay =
  document.getElementById(
    'speed'
  );


const physicsDisplay =
  document.getElementById(
    'physics'
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


// --------------------------------------------------
// 17. Animation
// --------------------------------------------------

const clock =
  new THREE.Clock();


function animate() {
  const dt =
    Math.min(
      clock.getDelta(),
      0.05
    );


  vehicle.update(
    dt,
    keys
  );


  // Detached cargo should
  // continue falling after
  // game over.
  if (gameOver) {
    cargoSystem
      .updateDetached(
        dt
      );
  }


  updateCamera(
    dt
  );


  const cargoState =
    getCargoState();


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


  renderer.render(
    scene,
    camera
  );


  requestAnimationFrame(
    animate
  );
}


animate();


// --------------------------------------------------
// 18. Resize
// --------------------------------------------------

window.addEventListener(
  'resize',
  () => {
    camera.aspect =
      window.innerWidth /
      window.innerHeight;


    camera.updateProjectionMatrix();


    renderer.setSize(
      window.innerWidth,
      window.innerHeight
    );
  }
);