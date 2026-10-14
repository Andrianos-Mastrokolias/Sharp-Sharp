
import * as THREE from 'three';
import './style.css';

// UI fonts, bundled locally (no CDN at runtime)
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow/800.css';
import '@fontsource/bungee';
import '@fontsource/alfa-slab-one';
import '@fontsource/rye';
import './ui/theme.css';

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
import {
  ROUTES,
  lockup,
  decalButton,
  labelButton,
  labelRow,
  signStat,
  controlsList,
  menuBackdropHTML,
  mainMenuHTML,
  levelSelectHTML,
  creditsHTML
} from './ui/screens.js';
import { Hud } from './ui/Hud.js';
import { CREDITS } from './ui/credits.js';

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
      failLevel('Eish, the load came off the roof. Too much cargo was lost.');
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
// SCREEN UI
// ============================================================

// Styled in ui/theme.css. The shop-front backdrop only shows on
// the menu screens (data-variant="menu"); in-game screens get a
// translucent scrim over the 3D scene instead.
const screen = document.createElement('div');
screen.className = 'ss-screen';
screen.innerHTML = menuBackdropHTML();

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
  },

  // Menu sub-screens stay in the MENU phase, so Esc / P do
  // nothing here.
  levelSelect: () => {
    showScreen(levelSelectHTML(LEVELS, LEVEL_DESCRIPTIONS), 'menu');
  },

  // All levels are unlocked; starts a fresh run from that level.
  playLevel: ({ level }) => {
    results.length = 0;
    loadLevel(Number(level));
  },

  credits: () => {
    showScreen(creditsHTML(CREDITS), 'menu');
  },

  backToMenu: () => {
    showMainMenu();
  }
};

// Event delegation keeps all buttons functional even when the
// screen's HTML changes.
panel.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');

  if (!button) return;

  const action = screenActions[button.dataset.action];

  // data-* attributes (e.g. data-level) are passed through.
  if (action) action(button.dataset);
});

// variant: 'menu' (shop-front backdrop hides the scene) or
// 'scrim' (in-game screens over the 3D scene).
function showScreen(html, variant = 'scrim') {
  panel.innerHTML = html;
  panel.scrollTop = 0;
  screen.dataset.variant = variant;
  screen.classList.add('visible');
}

function hideScreen() {
  screen.classList.remove('visible');
}

// ============================================================
// MAIN MENU
// ============================================================

function showMainMenu() {
  showScreen(mainMenuHTML(LEVELS), 'menu');
}

// ============================================================
// LEVEL INTRODUCTION
// ============================================================

function showLevelIntro(level) {
  const config = LEVELS[level];
  const route = ROUTES[level];

  showScreen(`
    <div class="ss-column">
      <div class="sign">
        <div class="sign-head">LEVEL ${level} OF ${LAST_LEVEL}</div>

        <div class="sign-body">
          <div class="sign-row ss-intro-title">
            <span class="sign-code">${route.code}</span>
            <span class="sign-name">${config.name}</span>
            <span class="sign-arrow" aria-hidden="true">${route.arrow}</span>
          </div>

          <p class="sign-text">${LEVEL_DESCRIPTIONS[level]}</p>

          ${signStat('Objective', 'Reach the destination')}
          ${signStat('Minimum cargo', MINIMUM_CARGO)}
          ${signStat('Finish', 'Stop inside the delivery zone')}
        </div>

        <div class="sign-chevron chevron"></div>
      </div>

      ${decalButton('beginLevel', `START LEVEL ${level}`)}

      ${labelRow(labelButton('mainMenu', 'MAIN MENU'))}
    </div>
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
    failLevel(
      'Eish, the load came off the roof. ' +
      'You reached the destination without enough cargo.'
    );
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
    <div class="ss-column">
      ${lockup([
        [{ text: 'laduma!', bg: 'ink', font: 'rye' }],
        [{ text: 'DELIVERED', bg: 'maroon', font: 'bungee' }]
      ])}

      <div class="sign">
        <div class="sign-head">LEVEL ${currentLevel} COMPLETE</div>

        <div class="sign-body">
          ${signStat('Delivery time', `${event.time.toFixed(1)} s`)}
          ${signStat('Cargo delivered', `${cargo.remaining} / ${cargo.total}`)}
          ${signStat('Next destination', LEVELS[currentLevel + 1].name)}
        </div>
      </div>

      ${decalButton('nextLevel', 'NEXT LEVEL →')}

      ${labelRow(
        labelButton('retryLevel', 'REPLAY LEVEL'),
        labelButton('mainMenu', 'MAIN MENU')
      )}
    </div>
  `);
}

// ============================================================
// LEVEL FAILED
// ============================================================

// flavour: the Rye word in the GAME OVER lockup
function failLevel(reason, flavour = 'eish') {
  if (phase !== GamePhase.PLAYING) return;

  phase = GamePhase.FAILED;

  vehicle.setEnabled(false);
  clearKeys();

  const cargo = cargoSystem.getState();

  showScreen(`
    <div class="ss-column">
      ${lockup([[
        { text: flavour, bg: 'ink', font: 'rye' },
        { text: 'GAME OVER', bg: 'maroon', font: 'bungee' }
      ]])}

      <p class="ss-reason">${reason}</p>

      <div class="sign">
        <div class="sign-head">DELIVERY FAILED</div>

        <div class="sign-body">
          ${signStat('Level', `${currentLevel} — ${LEVELS[currentLevel].name}`)}
          ${signStat('Cargo remaining', `${cargo.remaining} / ${cargo.total}`)}
        </div>
      </div>

      ${decalButton('retryLevel', 'RETRY LEVEL')}

      ${labelRow(labelButton('mainMenu', 'MAIN MENU'))}
    </div>
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
    <div class="ss-column">
      ${lockup([
        [
          { text: 'take a breather', bg: 'ink', font: 'rye' },
          { text: 'PAUSED', bg: 'mustard', font: 'slab' }
        ],
        [{
          text: `LEVEL ${currentLevel} · ${LEVELS[currentLevel].name.toUpperCase()}`,
          bg: 'cream',
          font: 'sign'
        }]
      ])}

      ${decalButton('resume', 'RESUME')}

      ${labelRow(
        labelButton('retryLevel', 'RETRY'),
        labelButton('mainMenu', 'MAIN MENU')
      )}

      ${controlsList()}
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

  // A run started from level select only contains the levels
  // that were played, so don't claim every load was delivered.
  const allLevelsDone = Object.keys(LEVELS)
    .every(level => results.some(item => item.level === Number(level)));

  if (!allLevelsDone) {
    const result = results.find(item => item.level === LAST_LEVEL);

    showScreen(`
    <div class="ss-column">
      ${lockup([
        [{ text: 'laduma!', bg: 'ink', font: 'rye' }],
        [{ text: 'DELIVERED', bg: 'maroon', font: 'bungee' }]
      ])}

      <div class="sign">
        <div class="sign-head">LEVEL ${LAST_LEVEL} COMPLETE</div>

        <div class="sign-body">
          ${signStat('Delivery time', `${result.time.toFixed(1)} s`)}
          ${signStat('Cargo delivered', `${result.cargo} / ${result.totalCargo}`)}
        </div>
      </div>
      ${decalButton('retryLevel', `REPLAY LEVEL ${LAST_LEVEL}`)}

      ${labelRow(
        labelButton('playAgain', 'PLAY ALL FROM LEVEL 1'),
        labelButton('mainMenu', 'MAIN MENU')
      )}
    </div>
  `);
    return;
  }

  const totalTime = results.reduce(
    (sum, result) => sum + result.time,
    0
  );

  const resultRows = results
    .sort((a, b) => a.level - b.level)
    .map(result => signStat(
      `${ROUTES[result.level]?.code ?? `L${result.level}`} · ${result.name}`,
      `${result.time.toFixed(1)} s`
    ))
    .join('');

  showScreen(`
    <div class="ss-column">
      ${lockup([
        [{ text: 'ayoba!', bg: 'ink', font: 'rye' }],
        [{ text: 'ALL DELIVERED', bg: 'maroon', font: 'bungee' }]
      ])}

      <p class="ss-reason">Sharp-sharp, driver. Every load delivered.</p>

      <div class="sign">
        <div class="sign-head">ALL DELIVERIES COMPLETE</div>

        <div class="sign-body">
          ${resultRows}
          ${signStat('Total driving time', `${totalTime.toFixed(1)} s`)}
        </div>

        <div class="sign-chevron chevron"></div>
      </div>

      ${decalButton('playAgain', 'PLAY ALL AGAIN')}

      ${labelRow(
        labelButton('retryLevel', `REPLAY LEVEL ${LAST_LEVEL}`),
        labelButton('mainMenu', 'MAIN MENU')
      )}
    </div>
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
    failLevel('Haibo! The pursuer caught you.', 'haibo!');
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

// Built once; updateHUD() feeds it the live state each frame.
const hud = new Hud();

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
  hud.update({
    level: currentLevel,
    levelName: LEVELS[currentLevel].name,
    objective: levelManager.getState(),
    cargo: cargoSystem.getState(),
    speedKmh: Math.abs(vehicle.getSpeed()) * 3.6,
    cameraMode: formatCameraName(cameraSystem.getMode()),
    headlightsOn: getHeadlightsEnabled()
  });
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
