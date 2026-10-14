
import * as THREE from 'three';
import './style.css';

import { createTaxi } from './vehicle/Taxi.js';
import { CargoSystem } from './vehicle/CargoSystem.js';
import { VehicleController } from './vehicle/VehicleController.js';
import { CameraSystem } from './cameras/CameraSystem.js';

import { LightingManager } from './graphics/LightingManager.js';
import { EffectsManager } from './graphics/EffectsManager.js';
import { DustSystem } from './graphics/DustSystem.js';
import { MaterialLibrary } from './graphics/MaterialLibrary.js';
import { SkyManager } from './graphics/SkyManager.js';

import { LevelManager, LEVELS } from './world/LevelManager.js';
import { createBox, MAIN_POTHOLES } from './world/environments/helpers.js';

import { LoadingScreen } from './ui/LoadingScreen.js';

// ============================================================
// GAME CONFIGURATION
// ============================================================

const FIRST_LEVEL = 1;
const LAST_LEVEL = 3;
const MINIMUM_CARGO = 2;

const LEVEL_DESCRIPTIONS = {
  1: 'Drive from the taxi rank to the CBD. Avoid traffic, protect your roof cargo and escape the pursuer.',
  2: 'Take on the highway in the midday heat. Choose between the ground road and the flyover, avoid hazards and reach your delivery.',
  3: 'Survive load shedding at night. Headlights help you see potholes but make you easier for the pursuer to detect.'
};

// Game phases keep the player from driving during menus.
const GamePhase = Object.freeze({
  MENU: 'menu',
  INTRO: 'intro',
  PLAYING: 'playing',
  PAUSED: 'paused',
  COMPLETE: 'complete',
  FAILED: 'failed',
  FINISHED: 'finished'
});

let phase = GamePhase.MENU;
let currentLevel = FIRST_LEVEL;
const results = [];

// ============================================================
// LOADING SCREEN
// ============================================================

// Must exist before the graphics systems and taxi below start
// their loaders. The main menu only appears once everything has
// loaded.
new LoadingScreen({
  onComplete: () => showMainMenu()
});

// ============================================================
// THREE.JS SCENE
// ============================================================

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  68,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

document.body.appendChild(renderer.domElement);

// ============================================================
// GRAPHICS SYSTEMS
// ============================================================

const lighting = new LightingManager({ scene, renderer });
const effects = new EffectsManager({ scene });
const materials = new MaterialLibrary(renderer);
const skyManager = new SkyManager({ scene, renderer });

// These arrays are shared with VehicleController.
// LevelManager adds and removes each environment's objects.
const collidableObjects = [];

const potholes = MAIN_POTHOLES.map(pothole => ({
  ...pothole
}));

// ============================================================
// TAXI
// ============================================================

const {
  taxi,
  chassis,
  wheels,
  frontWheelPivots,
  cargoItems,
  setHeadlightsEnabled,
  toggleHeadlights,
  getHeadlightsEnabled,
  updateVisualEffects
} = createTaxi(createBox);

scene.add(taxi);

// ============================================================
// CARGO
// ============================================================

const cargoSystem = new CargoSystem({
  scene,
  chassis,
  taxi,
  cargoItems,
  gravity: -22,

  onCargoLost: event => {
    // Don't trigger a second failure after the level has ended.
    if (
      phase === GamePhase.PLAYING &&
      event.remaining < MINIMUM_CARGO
    ) {
      failLevel('Too much cargo was lost.');
    }
  }
});

// ============================================================
// VEHICLE PHYSICS
// ============================================================

const vehicle = new VehicleController({
  taxi,
  chassis,
  wheels,
  frontWheelPivots,
  cargoSystem,
  collidableObjects,
  potholes
});

vehicle.setLevel(FIRST_LEVEL);
vehicle.setGroundHeightProvider(null);
vehicle.reset();

// Don't allow driving until the player starts.
vehicle.setEnabled(false);

// ============================================================
// CAMERA
// ============================================================

const cameraSystem = new CameraSystem({
  camera,
  taxi,
  renderer
});

// ============================================================
// DUST
// ============================================================

const dustSystem = new DustSystem({
  scene,
  taxi,
  vehicle
});

// ============================================================
// LEVEL VISUALS
// ============================================================

// The existing graphics managers already know what to do for
// Level 1, 2 and 3. We simply call them automatically.
function applyLevelVisuals(level) {
  lighting.setLevel(level);
  effects.setLevel(level);
  dustSystem.setLevel(level);
  skyManager.setLevel(level);
}

// ============================================================
// SCREEN UI STYLING
// ============================================================

// Injected styles so this replacement works without requiring
// changes to your existing style.css.
const screenStyles = document.createElement('style');

screenStyles.textContent = `
  .ss-screen {
    position: fixed;
    inset: 0;
    z-index: 1000;

    display: none;
    align-items: center;
    justify-content: center;

    background: rgba(5, 12, 22, 0.82);
    backdrop-filter: blur(10px);

    font-family: Arial, Helvetica, sans-serif;
    color: white;
  }

  .ss-screen.visible {
    display: flex;
  }

  .ss-panel {
    width: min(520px, calc(100vw - 40px));
    max-height: calc(100vh - 40px);
    overflow-y: auto;

    padding: 35px;
    box-sizing: border-box;

    background: rgba(13, 25, 38, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 18px;

    box-shadow: 0 20px 70px rgba(0, 0, 0, 0.5);
    text-align: center;
  }

  .ss-eyebrow {
    color: #f5c84c;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .ss-title {
    margin: 14px 0;
    font-size: clamp(32px, 6vw, 52px);
    line-height: 1.1;
    font-weight: 900;
  }

  .ss-description {
    margin: 15px 0 25px;
    color: #c5d1db;
    font-size: 16px;
    line-height: 1.7;
  }

  .ss-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;

    padding: 12px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    text-align: left;
  }

  .ss-stat span {
    color: #aebdc8;
  }

  .ss-stat strong {
    color: white;
  }

  .ss-button {
    width: 100%;
    display: block;
    margin-top: 14px;
    padding: 15px 20px;

    border: 0;
    border-radius: 10px;

    background: #f5c84c;
    color: #14202b;

    font-size: 16px;
    font-weight: 800;

    cursor: pointer;
  }

  .ss-button:hover {
    background: #ffdd72;
  }

  .ss-button.secondary {
    background: #26394c;
    color: white;
  }

  .ss-button.secondary:hover {
    background: #344d66;
  }

  .ss-controls {
    margin-top: 22px;
    color: #93a8b8;
    font-size: 13px;
    line-height: 1.8;
  }

  .ss-good {
    color: #4de09b;
  }

  .ss-bad {
    color: #ff7785;
  }
`;

document.head.appendChild(screenStyles);

// ============================================================
// SCREEN UI
// ============================================================

const screen = document.createElement('div');
screen.className = 'ss-screen';

const panel = document.createElement('div');
panel.className = 'ss-panel';

screen.appendChild(panel);
document.body.appendChild(screen);

// Every button is wired through this object.
const screenActions = {
  startGame: () => {
    results.length = 0;
    loadLevel(FIRST_LEVEL);
  },

  beginLevel: () => {
    phase = GamePhase.PLAYING;
    hideScreen();
    clearKeys();
    vehicle.setEnabled(true);
    clock.getDelta();
  },

  retryLevel: () => {
    loadLevel(currentLevel);
  },

  nextLevel: () => {
    if (currentLevel < LAST_LEVEL) {
      loadLevel(currentLevel + 1);
    }
  },

  playAgain: () => {
    results.length = 0;
    loadLevel(FIRST_LEVEL);
  },

  resume: () => {
    resumeGame();
  },

  mainMenu: () => {
    // Rebuild Level 1 behind the menu so the previous level
    // isn't left on screen.
    loadLevel(FIRST_LEVEL, { showIntro: false });
    phase = GamePhase.MENU;
    showMainMenu();
  }
};

// Event delegation keeps all buttons functional even when the
// screen's HTML changes.
panel.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');

  if (!button) return;

  const action = screenActions[button.dataset.action];

  if (action) action();
});

function showScreen(html) {
  panel.innerHTML = html;
  screen.classList.add('visible');
}

function hideScreen() {
  screen.classList.remove('visible');
}

function statRow(label, value) {
  return `
    <div class="ss-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

// ============================================================
// MAIN MENU
// ============================================================

function showMainMenu() {
  showScreen(`
    <div class="ss-eyebrow">South African Taxi Simulator</div>

    <h1 class="ss-title">SHARP-SHARP</h1>

    <p class="ss-description">
      Three levels. One taxi. Keep the cargo secure,
      outrun danger and complete every delivery.
    </p>

    <button class="ss-button" data-action="startGame">
      PLAY GAME
    </button>

    <div class="ss-controls">
      W / S — Accelerate / Brake<br>
      A / D — Steer<br>
      Space — Handbrake<br>
      C — Change camera<br>
      L — Headlights<br>
      R — Retry current level<br>
      Esc / P — Pause
    </div>
  `);
}

// ============================================================
// LEVEL INTRODUCTION
// ============================================================

function showLevelIntro(level) {
  const config = LEVELS[level];

  showScreen(`
    <div class="ss-eyebrow">
      LEVEL ${level} OF ${LAST_LEVEL}
    </div>

    <h1 class="ss-title">
      ${config.name}
    </h1>

    <p class="ss-description">
      ${LEVEL_DESCRIPTIONS[level]}
    </p>

    ${statRow('Objective', 'Reach the destination')}
    ${statRow('Minimum cargo', MINIMUM_CARGO)}
    ${statRow('Finish', 'Stop inside the delivery zone')}

    <button class="ss-button" data-action="beginLevel">
      START LEVEL ${level}
    </button>

    <button
      class="ss-button secondary"
      data-action="mainMenu"
    >
      MAIN MENU
    </button>
  `);
}

// ============================================================
// LEVEL COMPLETED
// ============================================================

function completeLevel(event) {
  if (phase !== GamePhase.PLAYING) return;

  const cargo = event.cargo;

  // Defensive check: a delivery only counts if enough cargo
  // actually reaches the destination.
  if (cargo.remaining < MINIMUM_CARGO) {
    failLevel('You reached the destination without enough cargo.');
    return;
  }

  phase = GamePhase.COMPLETE;
  vehicle.setEnabled(false);
  clearKeys();

  const result = {
    level: currentLevel,
    name: LEVELS[currentLevel].name,
    time: event.time,
    cargo: cargo.remaining,
    totalCargo: cargo.total
  };

  // Replace any previous result for this level.
  const existingIndex = results.findIndex(
    item => item.level === currentLevel
  );

  if (existingIndex >= 0) {
    results[existingIndex] = result;
  } else {
    results.push(result);
  }

  // The last successful delivery completes the entire game.
  if (currentLevel === LAST_LEVEL) {
    finishGame();
    return;
  }

  showScreen(`
    <div class="ss-eyebrow ss-good">
      DELIVERY SUCCESSFUL
    </div>

    <h1 class="ss-title">
      LEVEL ${currentLevel} COMPLETE!
    </h1>

    <p class="ss-description">
      You completed ${LEVELS[currentLevel].name}.
      Your next delivery is waiting.
    </p>

    ${statRow('Delivery time', `${event.time.toFixed(1)} s`)}
    ${statRow('Cargo delivered', `${cargo.remaining} / ${cargo.total}`)}
    ${statRow('Next destination', LEVELS[currentLevel + 1].name)}

    <button class="ss-button" data-action="nextLevel">
      NEXT LEVEL →
    </button>

    <button
      class="ss-button secondary"
      data-action="retryLevel"
    >
      REPLAY LEVEL
    </button>
  `);
}

// ============================================================
// LEVEL FAILED
// ============================================================

function failLevel(reason) {
  if (phase !== GamePhase.PLAYING) return;

  phase = GamePhase.FAILED;

  vehicle.setEnabled(false);
  clearKeys();

  const cargo = cargoSystem.getState();

  showScreen(`
    <div class="ss-eyebrow ss-bad">
      DELIVERY FAILED
    </div>

    <h1 class="ss-title">
      GAME OVER
    </h1>

    <p class="ss-description">
      ${reason}
    </p>

    ${statRow('Level', `${currentLevel} — ${LEVELS[currentLevel].name}`)}
    ${statRow('Cargo remaining', `${cargo.remaining} / ${cargo.total}`)}

    <button class="ss-button" data-action="retryLevel">
      RETRY LEVEL
    </button>

    <button
      class="ss-button secondary"
      data-action="mainMenu"
    >
      MAIN MENU
    </button>
  `);
}

// ============================================================
// PAUSE
// ============================================================

function pauseGame() {
  if (phase !== GamePhase.PLAYING) return;

  phase = GamePhase.PAUSED;
  vehicle.setEnabled(false);
  clearKeys();

  showScreen(`
    <div class="ss-eyebrow">
      LEVEL ${currentLevel} — ${LEVELS[currentLevel].name}
    </div>

    <h1 class="ss-title">
      PAUSED
    </h1>

    <button class="ss-button" data-action="resume">
      RESUME
    </button>

    <button
      class="ss-button secondary"
      data-action="retryLevel"
    >
      RESTART LEVEL
    </button>

    <button
      class="ss-button secondary"
      data-action="mainMenu"
    >
      MAIN MENU
    </button>

    <div class="ss-controls">
      Esc / P — Resume
    </div>
  `);
}

function resumeGame() {
  if (phase !== GamePhase.PAUSED) return;

  phase = GamePhase.PLAYING;
  hideScreen();
  clearKeys();
  vehicle.setEnabled(true);

  // Discard the paused time so physics doesn't jump.
  clock.getDelta();
}

// ============================================================
// ALL LEVELS COMPLETED
// ============================================================

function finishGame() {
  phase = GamePhase.FINISHED;
  vehicle.setEnabled(false);
  clearKeys();

  const totalTime = results.reduce(
    (sum, result) => sum + result.time,
    0
  );

  const resultRows = results
    .sort((a, b) => a.level - b.level)
    .map(result => statRow(
      `Level ${result.level} — ${result.name}`,
      `${result.time.toFixed(1)} s`
    ))
    .join('');

  showScreen(`
    <div class="ss-eyebrow ss-good">
      ALL DELIVERIES COMPLETE
    </div>

    <h1 class="ss-title">
      YOU WIN!
    </h1>

    <p class="ss-description">
      Congratulations! You completed all three
      Sharp-Sharp deliveries.
    </p>

    ${resultRows}
    ${statRow('Total driving time', `${totalTime.toFixed(1)} s`)}

    <button class="ss-button" data-action="playAgain">
      PLAY AGAIN
    </button>

    <button
      class="ss-button secondary"
      data-action="mainMenu"
    >
      MAIN MENU
    </button>
  `);
}

// ============================================================
// LEVEL MANAGER
// ============================================================

const levelManager = new LevelManager({
  scene,
  vehicle,
  taxi,

  collidables: collidableObjects,
  potholes,
  materials,

  getHeadlightsEnabled,

  // Your existing LevelManager calls this when the taxi
  // reaches the destination and is slow enough.
  onDelivered: event => {
    completeLevel(event);
  },

  // Your existing pursuit system triggers this if caught.
  onCaptured: () => {
    failLevel('You were caught by the pursuer.');
  }
});

// ============================================================
// LOAD A LEVEL
// ============================================================

function loadLevel(level, { showIntro = true } = {}) {
  if (!LEVELS[level]) {
    console.error(`Level ${level} does not exist.`);
    return;
  }

  // Disable gameplay while transitioning.
  phase = GamePhase.INTRO;
  vehicle.setEnabled(false);
  clearKeys();

  currentLevel = level;

  // Update vehicle-specific handling and cargo stress settings.
  vehicle.setLevel(level);

  // Automatically change sun, fog, HDRI, sky, dust and heat haze.
  applyLevelVisuals(level);

  // Builds the correct environment, traffic, hazards, pursuit,
  // destination markers, spawn point and route.
  const loaded = levelManager.load(level);

  if (!loaded) {
    console.error(`Unable to load level ${level}.`);
    phase = GamePhase.MENU;
    showMainMenu();
    return;
  }

  // LevelManager.load() resets the taxi; keep controls disabled
  // until the player presses START LEVEL.
  vehicle.setEnabled(false);

  // Remove any particles left over from the previous level.
  dustSystem.reset();

  // Every level starts with the headlights off.
  setHeadlightsEnabled(false);

  if (showIntro) {
    showLevelIntro(level);
  }
}

// ============================================================
// RETRY CURRENT LEVEL
// ============================================================

function retryCurrentLevel() {
  // Rebuild the current level rather than jumping back to Level 1.
  loadLevel(currentLevel);
}

// ============================================================
// INPUT
// ============================================================

const keys = {};

function clearKeys() {
  for (const code in keys) {
    keys[code] = false;
  }
}

window.addEventListener('keydown', event => {
  const movementKeys = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space'
  ];

  if (movementKeys.includes(event.code)) {
    event.preventDefault();
  }

  // Esc / P toggle pause, only from gameplay or the pause panel.
  if (
    (event.code === 'Escape' || event.code === 'KeyP') &&
    !event.repeat
  ) {
    if (phase === GamePhase.PLAYING) {
      pauseGame();
    } else if (phase === GamePhase.PAUSED) {
      resumeGame();
    }

    return;
  }

  // Only movement/gameplay keys are stored while playing.
  if (phase !== GamePhase.PLAYING) return;

  keys[event.code] = true;

  if (event.repeat) return;

  switch (event.code) {
    case 'KeyR':
      retryCurrentLevel();
      break;

    case 'KeyC':
      cameraSystem.nextMode();
      break;

    case 'KeyL':
      toggleHeadlights();
      break;

    // No Digit1 / Digit2 / Digit3 handlers.
    // Levels are now unlocked by successful deliveries.
  }
});

window.addEventListener('keyup', event => {
  keys[event.code] = false;
});

window.addEventListener('blur', clearKeys);

// ============================================================
// HUD
// ============================================================

const hud = document.createElement('div');
hud.className = 'hud';

hud.innerHTML = `
  <h1>SHARP-SHARP</h1>

  <p id="level-label"></p>
  <div id="speed"></div>
  <div id="camera-mode"></div>
  <div id="headlights"></div>
  <div id="cargo"></div>
  <div id="straps"></div>
  <div id="cargo-status"></div>

  <div class="instructions">
    W / S — Accelerate / Brake<br>
    A / D — Steer<br>
    Space — Handbrake<br>
    C — Change camera<br>
    L — Toggle headlights<br>
    Mouse drag — Look around in chase view<br>
    Mouse wheel — Chase camera zoom<br>
    R — Retry current level<br>
    Esc / P — Pause
  </div>
`;

document.body.appendChild(hud);

const levelLabel = document.getElementById('level-label');
const speedDisplay = document.getElementById('speed');
const cameraModeDisplay = document.getElementById('camera-mode');
const headlightsDisplay = document.getElementById('headlights');
const cargoDisplay = document.getElementById('cargo');
const strapDisplay = document.getElementById('straps');
const cargoStatusDisplay = document.getElementById('cargo-status');

// ============================================================
// HUD HELPERS
// ============================================================

function formatCameraName(mode) {
  switch (mode) {
    case 'CHASE':
      return 'Chase';
    case 'BUMPER':
      return 'Bumper';
    case 'INTERIOR':
      return 'Interior';
    default:
      return mode;
  }
}

function updateHUD() {
  const cargo = cargoSystem.getState();
  const objective = levelManager.getState();

  const levelName = LEVELS[currentLevel].name;

  let objectiveText = '';

  if (
    phase === GamePhase.PLAYING &&
    objective.status === 'driving'
  ) {
    const distance = Math.round(
      objective.distanceToDestination
    );

    objectiveText = ` — ${distance} m to destination (stop in the zone)`;

    const pursuit = objective.pursuit;

    if (
      pursuit?.state === 'chasing' &&
      Number.isFinite(pursuit.distance)
    ) {
      objectiveText += ` | PURSUED ${Math.round(pursuit.distance)} m`;
    } else if (pursuit?.state === 'searching') {
      objectiveText += ' | Pursuer searching';
    }
  }

  levelLabel.textContent =
    `Level ${currentLevel} — ${levelName}${objectiveText}`;

  speedDisplay.textContent =
    `Speed: ${Math.round(Math.abs(vehicle.getSpeed()) * 3.6)} km/h`;

  cameraModeDisplay.textContent =
    `Camera: ${formatCameraName(cameraSystem.getMode())}`;

  headlightsDisplay.textContent =
    `Headlights: ${getHeadlightsEnabled() ? 'ON' : 'OFF'}`;

  cargoDisplay.textContent =
    `Cargo: ${cargo.remaining} / ${cargo.total} | ` +
    `Stability: ${Math.round(cargo.stability)}%`;

  strapDisplay.textContent =
    `Straps: ${Math.round(cargo.straps)}%`;

  cargoStatusDisplay.textContent =
    `Load status: ${cargo.status}`;
}

// ============================================================
// CLOCK
// ============================================================

const clock = new THREE.Clock();

// ============================================================
// ANIMATION LOOP
// ============================================================

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsedTime = clock.getElapsedTime();

  // Only run active vehicle physics during gameplay.
  if (phase === GamePhase.PLAYING) {
    vehicle.update(dt, keys);

    // Handles destination detection, pursuit and traffic.
    // May call completeLevel() or failLevel() this frame.
    if (phase === GamePhase.PLAYING) {
      levelManager.update(dt, elapsedTime);
    }
  } else if (phase !== GamePhase.PAUSED) {
    // Allows already-detached cargo to continue falling.
    // Frozen while paused, like the rest of the simulation.
    cargoSystem.updateDetached(dt);
  }

  cameraSystem.update(dt);

  // Graphics continue animating in menus and completion screens.
  updateVisualEffects(elapsedTime);
  effects.update(elapsedTime);
  skyManager.update(elapsedTime);

  if (phase === GamePhase.PLAYING) {
    dustSystem.update(dt);
  }

  updateHUD();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ============================================================
// WINDOW RESIZE
// ============================================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
});

// ============================================================
// STARTUP
// ============================================================

// Build Level 1 behind the opening menu.
vehicle.setLevel(FIRST_LEVEL);
applyLevelVisuals(FIRST_LEVEL);
levelManager.load(FIRST_LEVEL);

// The vehicle must not move until PLAY GAME → START LEVEL.
vehicle.setEnabled(false);

// The main menu is shown by the loading screen once every
// asset has loaded.
animate();
