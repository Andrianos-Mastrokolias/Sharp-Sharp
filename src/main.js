
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
import { MouseDrive } from './input/MouseDrive.js';

import { LightingManager } from './graphics/LightingManager.js';
import { EffectsManager } from './graphics/EffectsManager.js';
import { DustSystem } from './graphics/DustSystem.js';
import { MaterialLibrary } from './graphics/MaterialLibrary.js';
import { SkyManager } from './graphics/SkyManager.js';
import { SkylineManager } from './graphics/SkylineManager.js';
import { RearViewMirror } from './graphics/RearViewMirror.js';
import { LevelManager, LEVELS } from './world/LevelManager.js';
import {
  createBox,
  MAIN_POTHOLES
} from './world/environments/helpers.js';

import { LoadingScreen } from './ui/LoadingScreen.js';
import {
  ROUTES,
  lockup,
  decalButton,
  labelButton,
  labelRow,
  signStat,
  scoreStats,
  formatPoints,
  controlsList,
  menuBackdropHTML,
  mainMenuHTML,
  levelSelectHTML,
  creditsHTML
} from './ui/screens.js';

import { Hud } from './ui/Hud.js';
import { CountdownTracker } from './ui/countdown.js';
import { CREDITS } from './ui/credits.js';
import { STORY } from './ui/story.js';
import { MenuNarrator, withNarrator } from './ui/narrator.js';
import { GameAudio } from './audio/GameAudio.js';
import { readPreferences, savePreferences, applyQuality } from './game/preferences.js';
import { settingsHTML } from './ui/settings.js';

let preferenceStorage;
try { preferenceStorage = window.localStorage; } catch { /* Storage is optional. */ }
let preferences = readPreferences(preferenceStorage);
const audio = new GameAudio();
audio.setVolume(preferences.muted ? 0 : preferences.volume);

// Race and pedestrian sound cues. The cue names (countdown, go, beaten,
// firstOut, pedestrianHit) live in the CUES table in
// src/audio/GameAudio.js, and tests/audio-settings.test.mjs checks that
// every name used here exists there.
function playCue(name) {
  audio.cue?.(name);
}

// onScore reasons with their own cue ('pedestrian' plays through
// onPedestrianHit, which also fires on levels without a score)
const SCORE_CUES = { beaten: 'beaten', firstOut: 'firstOut' };

// ============================================================
// GAME CONFIGURATION
// ============================================================

const FIRST_LEVEL = 1;
const LAST_LEVEL = 3;
const MINIMUM_CARGO = 2;

const LEVEL_DESCRIPTIONS = {
  1: 'A whole household is strapped to your roof, and every driver at the rank wants the fare. Race out ahead of the other taxis, then run the CBD before the police pull over your overloaded taxi.',
  2: 'The city streets are jammed, so you take the highway at midday. Choose the ground road or the flyover, and watch your straps: the faster you go, the looser they get.',
  3: 'Load shedding: the power is out and the township is pitch black. Your headlights show the potholes but also give you away to the police, so choose when to switch them on.'
};

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

renderer.setSize(
  window.innerWidth,
  window.innerHeight
);
applyQuality(renderer, preferences.quality, window.devicePixelRatio);

document.body.appendChild(renderer.domElement);

// ============================================================
// GRAPHICS SYSTEMS
// ============================================================

const lighting = new LightingManager({
  scene,
  renderer
});

const effects = new EffectsManager({ scene });
const materials = new MaterialLibrary(renderer);
const skyManager = new SkyManager({ scene, renderer });
// Distant Johannesburg skyline for Levels 1 and 2.
const skylineManager = new SkylineManager({ scene });
// These arrays are shared with VehicleController.
// LevelManager adds and removes environment objects.
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
    if (phase === GamePhase.PLAYING) {
      audio.cue('cargo');
      levelManager.registerCargoLoss();
    }
    // Don't trigger a second failure after the level has ended.
    if (
      phase === GamePhase.PLAYING &&
      event.remaining < MINIMUM_CARGO
    ) {
      failLevel(
        'Eish, the load came off the roof. Too much cargo was lost.'
      );
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
  potholes,
  onCollision: speed => {
    if (phase === GamePhase.PLAYING && speed > 1) audio.cue('impact');
  }
});

vehicle.setLevel(FIRST_LEVEL);
vehicle.setGroundHeightProvider(null);
vehicle.reset();

vehicle.setEnabled(false);

// ============================================================
// CAMERA
// ============================================================

const cameraSystem = new CameraSystem({
  camera,
  taxi,
  renderer
});

// Optional real-time rear-view mirror.
const rearViewMirror = new RearViewMirror({
  scene,
  renderer,
  taxi
});

let rearViewRequested = true;

// ============================================================
// MOUSE DRIVE
// ============================================================

// Optional mouse driving (M). Losing pointer lock while driving
// (Esc) pauses, like Esc does without the lock.
let lockLostPauseTime = -Infinity;

const mouseDrive = new MouseDrive({
  canvas: renderer.domElement,
  isPlaying: () => phase === GamePhase.PLAYING,
  onLockLost: () => {
    lockLostPauseTime = performance.now();
    pauseGame();
  }
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

// Nothing is visible beyond the fog's far distance, so the camera does not
// draw further than that (plus a margin): on the long roads a far plane of
// 1000 m would draw most of the level at once. The sky is scaled to fit.
const VIEW_DISTANCE_MARGIN = 40;


function applyGraphicsQuality() {
  const lowQuality = preferences.quality === 'low';

  // Disable shadow rendering on Low quality.
  renderer.shadowMap.enabled = !lowQuality;
  lighting.sun.castShadow = !lowQuality;

  // Heat haze is only available in Level 2,
  // and is disabled entirely on Low quality.
  effects.setHeatHazeEnabled(
    !lowQuality && currentLevel === 2
  );

  // Dust is only available outside Low quality.
  // DustSystem handles which levels actually use it.
  dustSystem.setEnabled(!lowQuality);
}


function applyLevelVisuals(level) {
  lighting.setLevel(level);
  effects.setLevel(level);
  dustSystem.setLevel(level);
  skyManager.setLevel(level);
skylineManager.setLevel(level);
  camera.far = scene.fog.far + VIEW_DISTANCE_MARGIN;
  camera.updateProjectionMatrix();
  skyManager.setViewDistance(camera.far);
  applyGraphicsQuality();
}

// ============================================================
// SCREEN UI
// ============================================================

const screen = document.createElement('div');
screen.className = 'ss-screen';
screen.innerHTML = menuBackdropHTML();

const panel = document.createElement('div');
panel.className = 'ss-panel';

screen.appendChild(panel);
document.body.appendChild(screen);

// Bra Sipho on the main menu; hidden again by every
// showScreen / hideScreen, which clears his timer and element.
const menuNarrator = new MenuNarrator({
  host: screen,
  lines: STORY.menu,
  getObstacles: () => panel.querySelectorAll('button, summary, .sign, .controls')
});

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
    mouseDrive.requestLock();
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
    loadLevel(FIRST_LEVEL, { showIntro: false });
    phase = GamePhase.MENU;
    showMainMenu();
  },

  levelSelect: () => {
    showScreen(
      levelSelectHTML(
        LEVELS,
        LEVEL_DESCRIPTIONS
      ),
      'menu'
    );
  },

  playLevel: ({ level }) => {
    results.length = 0;
    loadLevel(Number(level));
  },

  credits: () => {
    showScreen(
      creditsHTML(CREDITS),
      'menu'
    );
  },

  backToMenu: () => {
    showMainMenu();
  },

  settings: () => {
    if (phase !== GamePhase.MENU && phase !== GamePhase.PAUSED) return;
    showScreen(settingsHTML(preferences), phase === GamePhase.MENU ? 'menu' : 'scrim');
  },

  closeSettings: () => {
    if (phase === GamePhase.PAUSED) {
      pauseGame();
    } else {
      showMainMenu();
    }
  }
};

panel.addEventListener('click', event => {
  const button = event.target.closest(
    'button[data-action]'
  );

  if (!button) return;

  const action = screenActions[
    button.dataset.action
  ];

  // data-* attributes (e.g. data-level) are passed through.
  if (action) {
    void audio.unlock();
    action(button.dataset);
  }
});

panel.addEventListener('input', event => {
  const input = event.target;
  if (!['volume', 'muted', 'quality'].includes(input.name)) return;
  const value = input.name === 'volume' ? Number(input.value) / 100
    : input.name === 'muted' ? input.checked : input.value;
  preferences = savePreferences(preferenceStorage, { ...preferences, [input.name]: value });
  audio.setVolume(preferences.muted ? 0 : preferences.volume);
  applyQuality(renderer, preferences.quality, window.devicePixelRatio);
  const output = panel.querySelector('output');
  if (output) output.value = `${Math.round(preferences.volume * 100)}%`;
  // Update shadows, heat haze and dust immediately.
applyGraphicsQuality();
});

function showScreen(html, variant = 'scrim') {
  menuNarrator.hide();
  audio.setActive(false);
  panel.innerHTML = html;
  panel.scrollTop = 0;

  screen.dataset.variant = variant;
  screen.classList.add('visible');
}

function hideScreen() {
  menuNarrator.hide();
  screen.classList.remove('visible');
}

// ============================================================
// MAIN MENU
// ============================================================

function showMainMenu() {
  showScreen(
    mainMenuHTML(LEVELS),
    'menu'
  );
  menuNarrator.show();
}

// ============================================================
// LEVEL INTRODUCTION
// ============================================================

function showLevelIntro(level) {
  const config = LEVELS[level];
  const route = ROUTES[level];

  showScreen(withNarrator(`
    <div class="ss-column">
      <div class="sign">
        <div class="sign-head">
          LEVEL ${level} OF ${LAST_LEVEL}
        </div>

        <div class="sign-body">
          <div class="sign-row ss-intro-title">
            <span class="sign-code">${route.code}</span>
            <span class="sign-name">${config.name}</span>
            <span class="sign-arrow" aria-hidden="true">
              ${route.arrow}
            </span>
          </div>

          <p class="sign-text">
            ${LEVEL_DESCRIPTIONS[level]}
          </p>

          ${signStat('Objective', 'Reach the destination')}
          ${signStat('Minimum cargo', MINIMUM_CARGO)}
          ${signStat('Finish', 'Stop inside the delivery zone')}
        </div>

        <div class="sign-chevron chevron"></div>
      </div>

      ${decalButton('beginLevel', `START LEVEL ${level}`)}

      ${labelRow(
        labelButton('mainMenu', 'MAIN MENU')
      )}
    </div>
  `, STORY.intro[level]));
}

// ============================================================
// LEVEL COMPLETED
// ============================================================

function completeLevel(event) {
  if (phase !== GamePhase.PLAYING) {
    return;
  }

  const cargo = event.cargo;

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
  hud.clearScorePopups();

  const result = {
    level: currentLevel,
    name: LEVELS[currentLevel].name,
    time: event.time,
    cargo: cargo.remaining,
    totalCargo: cargo.total,
    // Level 1 rank-race score; null on levels without one
    score: levelManager.getState().score
  };

  const existingIndex = results.findIndex(
    item => item.level === currentLevel
  );

  if (existingIndex >= 0) {
    results[existingIndex] = result;
  } else {
    results.push(result);
  }

  if (currentLevel === LAST_LEVEL) {
    finishGame();
    return;
  }

  showScreen(withNarrator(`
    <div class="ss-column">
      ${lockup([
        [
          {
            text: 'laduma!',
            bg: 'ink',
            font: 'rye'
          }
        ],
        [
          {
            text: 'DELIVERED',
            bg: 'maroon',
            font: 'bungee'
          }
        ]
      ])}

      <div class="sign">
        <div class="sign-head">
          LEVEL ${currentLevel} COMPLETE
        </div>

        <div class="sign-body">
          ${signStat(
            'Delivery time',
            `${event.time.toFixed(1)} s`
          )}

          ${signStat(
            'Cargo delivered',
            `${cargo.remaining} / ${cargo.total}`
          )}

          ${scoreStats(result.score)}

          ${signStat(
            'Next destination',
            LEVELS[currentLevel + 1].name
          )}
        </div>
      </div>

      ${decalButton('nextLevel', 'NEXT LEVEL →')}

      ${labelRow(
        labelButton('retryLevel', 'REPLAY LEVEL'),
        labelButton('mainMenu', 'MAIN MENU')
      )}
    </div>
  `, STORY.win));
}

// ============================================================
// LEVEL FAILED
// ============================================================

function failLevel(reason, flavour = 'eish') {
  if (phase !== GamePhase.PLAYING) {
    return;
  }

  phase = GamePhase.FAILED;

  vehicle.setEnabled(false);
  clearKeys();
  hud.clearScorePopups();

  const cargo = cargoSystem.getState();

  showScreen(withNarrator(`
    <div class="ss-column">
      ${lockup([[
        {
          text: flavour,
          bg: 'ink',
          font: 'rye'
        },
        {
          text: 'GAME OVER',
          bg: 'maroon',
          font: 'bungee'
        }
      ]])}

      <p class="ss-reason">${reason}</p>

      <div class="sign">
        <div class="sign-head">
          DELIVERY FAILED
        </div>

        <div class="sign-body">
          ${signStat(
            'Level',
            `${currentLevel} — ${LEVELS[currentLevel].name}`
          )}

          ${signStat(
            'Cargo remaining',
            `${cargo.remaining} / ${cargo.total}`
          )}
        </div>
      </div>

      ${decalButton('retryLevel', 'RETRY LEVEL')}

      ${labelRow(
        labelButton('mainMenu', 'MAIN MENU')
      )}
    </div>
  `, STORY.lose));
}

// ============================================================
// PAUSE
// ============================================================

function pauseGame() {
  if (phase !== GamePhase.PLAYING && phase !== GamePhase.PAUSED) {
    return;
  }

  phase = GamePhase.PAUSED;
  vehicle.setEnabled(false);
  clearKeys();

  showScreen(`
    <div class="ss-column">
      ${lockup([
        [
          {
            text: 'take a breather',
            bg: 'ink',
            font: 'rye'
          },
          {
            text: 'PAUSED',
            bg: 'mustard',
            font: 'slab'
          }
        ],
        [
          {
            text:
              `LEVEL ${currentLevel} · ` +
              LEVELS[currentLevel].name.toUpperCase(),
            bg: 'cream',
            font: 'sign'
          }
        ]
      ])}

      ${decalButton('resume', 'RESUME')}
      ${labelButton('settings', 'SETTINGS')}

      ${labelRow(
        labelButton('retryLevel', 'RETRY'),
        labelButton('mainMenu', 'MAIN MENU')
      )}

      ${controlsList()}
    </div>
  `);
}

function resumeGame() {
  if (phase !== GamePhase.PAUSED) {
    return;
  }

  phase = GamePhase.PLAYING;

  hideScreen();
  clearKeys();

  vehicle.setEnabled(true);

  // Discard the paused time so physics doesn't jump.
  clock.getDelta();

  mouseDrive.requestLock();
}

// ============================================================
// ALL LEVELS COMPLETED
// ============================================================

function finishGame() {
  phase = GamePhase.FINISHED;

  vehicle.setEnabled(false);
  clearKeys();

  const allLevelsDone = Object.keys(LEVELS)
    .every(level =>
      results.some(
        item => item.level === Number(level)
      )
    );

  if (!allLevelsDone) {
    const result = results.find(
      item => item.level === LAST_LEVEL
    );

    showScreen(withNarrator(`
      <div class="ss-column">
        ${lockup([
          [
            {
              text: 'laduma!',
              bg: 'ink',
              font: 'rye'
            }
          ],
          [
            {
              text: 'DELIVERED',
              bg: 'maroon',
              font: 'bungee'
            }
          ]
        ])}

        <div class="sign">
          <div class="sign-head">
            LEVEL ${LAST_LEVEL} COMPLETE
          </div>

          <div class="sign-body">
            ${signStat(
              'Delivery time',
              `${result.time.toFixed(1)} s`
            )}

            ${signStat(
              'Cargo delivered',
              `${result.cargo} / ${result.totalCargo}`
            )}

            ${scoreStats(result.score)}
          </div>
        </div>

        ${decalButton(
          'retryLevel',
          `REPLAY LEVEL ${LAST_LEVEL}`
        )}

        ${labelRow(
          labelButton(
            'playAgain',
            'PLAY ALL FROM LEVEL 1'
          ),
          labelButton('mainMenu', 'MAIN MENU')
        )}
      </div>
    `, STORY.win));

    return;
  }

  const totalTime = results.reduce(
    (sum, result) => sum + result.time,
    0
  );

  const resultRows = results
    .sort((a, b) => a.level - b.level)
    .map(result =>
      signStat(
        `${ROUTES[result.level]?.code ?? `L${result.level}`} · ${result.name}`,
        `${result.time.toFixed(1)} s`
      )
    )
    .join('');

  // Rank-race points for the levels that have them (Level 1)
  const pointsRows = results
    .filter(result => result.score)
    .map(result =>
      signStat(
        `${ROUTES[result.level]?.code ?? `L${result.level}`} · Points`,
        formatPoints(result.score.points)
      )
    )
    .join('');

  showScreen(withNarrator(`
    <div class="ss-column">
      ${lockup([
        [
          {
            text: 'ayoba!',
            bg: 'ink',
            font: 'rye'
          }
        ],
        [
          {
            text: 'ALL DELIVERED',
            bg: 'maroon',
            font: 'bungee'
          }
        ]
      ])}

      <p class="ss-reason">
        Sharp-sharp, driver. Every load delivered.
      </p>

      <div class="sign">
        <div class="sign-head">
          ALL DELIVERIES COMPLETE
        </div>

        <div class="sign-body">
          ${resultRows}

          ${pointsRows}

          ${signStat(
            'Total driving time',
            `${totalTime.toFixed(1)} s`
          )}
        </div>

        <div class="sign-chevron chevron"></div>
      </div>

      ${decalButton('playAgain', 'PLAY ALL AGAIN')}

      ${labelRow(
        labelButton(
          'retryLevel',
          `REPLAY LEVEL ${LAST_LEVEL}`
        ),
        labelButton('mainMenu', 'MAIN MENU')
      )}
    </div>
  `, STORY.win));
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

  onDelivered: event => {
    completeLevel(event);
  },

  onCaptured: () => {
    failLevel(
      'Haibo! The pursuer caught you.',
      'haibo!'
    );
  },

  // Level 1 rank-race points: +100 beaten, +300 first out, -50 pedestrian
  onScore: event => {
    hud.showScorePopup(event);

    if (SCORE_CUES[event.reason]) {
      playCue(SCORE_CUES[event.reason]);
    }
  },

  // Fires on every level; with no race there is no onScore, so show the
  // message here (on Level 1 onScore already shows the -50)
  onPedestrianHit: () => {
    playCue('pedestrianHit');

    if (levelManager.getState().score === null) {
      hud.showScorePopup({ delta: 0, reason: 'pedestrianHit', bad: true });
    }
  }
});

// ============================================================
// LOAD A LEVEL
// ============================================================

function loadLevel(level, { showIntro = true } = {}) {
  if (!LEVELS[level]) {
    console.error(
      `Level ${level} does not exist.`
    );
    return;
  }

  // Disable gameplay while transitioning.
  audio.setActive(false);
  phase = GamePhase.INTRO;

  vehicle.setEnabled(false);
  clearKeys();
  hud.clearScorePopups();
  countdown.reset();

  currentLevel = level;

  // Vehicle-specific handling and cargo stress.
  vehicle.setLevel(level);

  // Lighting, fog, HDRI, sky, dust and heat haze.
  applyLevelVisuals(level);

  // Environment, traffic, hazards, pursuit and spawn.
  const loaded = levelManager.load(level);

  if (!loaded) {
    console.error(
      `Unable to load level ${level}.`
    );

    phase = GamePhase.MENU;
    showMainMenu();
    return;
  }
  // Always start each level in CHASE camera mode.
// Also applies when retrying the current level.
cameraSystem.reset();

  vehicle.setEnabled(false);

  dustSystem.reset();

  // Every level starts with headlights off.
  setHeadlightsEnabled(false);

  // NEW: Immediately reposition the directional
  // shadow camera after LevelManager resets the taxi.
  lighting.updateShadowTracking(taxi);

  if (showIntro) {
    showLevelIntro(level);
  }
}

// ============================================================
// RETRY CURRENT LEVEL
// ============================================================

function retryCurrentLevel() {
  loadLevel(currentLevel);
}

// ============================================================
// INPUT
// ============================================================

const keys = {};

// What the vehicle is given while the countdown holds the taxi (every level)
const NO_KEYS = Object.freeze({});

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

  if (event.target.matches?.('input, select, textarea')) return;

  if (movementKeys.includes(event.code)) {
    event.preventDefault();
  }

  if (
    (
      event.code === 'Escape' ||
      event.code === 'KeyP'
    ) &&
    !event.repeat
  ) {
    // The same Esc that dropped pointer lock already paused.
    if (
      event.code === 'Escape' &&
      performance.now() - lockLostPauseTime < 300
    ) {
      return;
    }

    if (phase === GamePhase.PLAYING) {
      pauseGame();
    } else if (phase === GamePhase.PAUSED) {
      resumeGame();
    }

    return;
  }

  if (phase !== GamePhase.PLAYING) {
    return;
  }

  if (!event.repeat) void audio.unlock();

  keys[event.code] = true;

  if (event.repeat) {
    return;
  }

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

    case 'KeyM':
      mouseDrive.toggle();
      break;

    case 'KeyV':
  rearViewRequested = !rearViewRequested;
  break;

    // No Digit1 / Digit2 / Digit3 handlers.
    // Level progression is managed by the game.
  }
});

window.addEventListener('keyup', event => {
  keys[event.code] = false;
});

window.addEventListener('blur', () => { clearKeys(); pauseGame(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseGame();
});
window.addEventListener('pagehide', () => audio.dispose());

// ============================================================
// HUD
// ============================================================

const hud = new Hud();

// Level 1 "3, 2, 1, GO!" overlay; reset on every level load
const countdown = new CountdownTracker();

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

function updateHUD(objective) {
  hud.update({
    level: currentLevel,
    levelName: LEVELS[currentLevel].name,
    objective,
    cargo: cargoSystem.getState(),
    speedKmh: Math.abs(vehicle.getSpeed()) * 3.6,
    cameraMode: formatCameraName(cameraSystem.getMode()),
    headlightsOn: getHeadlightsEnabled(),
    mouseDrive: mouseDrive.enabled,
    // Hidden behind the intro / pause screens
    countdown: phase === GamePhase.PLAYING ? countdown.text : ''
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
  const dt = Math.min(
    clock.getDelta(),
    0.05
  );

  const elapsedTime = clock.getElapsedTime();

  // Keyboard keys, merged with the mouse when mouse drive is on.
  const input = mouseDrive.update(dt, keys, phase === GamePhase.PLAYING);

  // Only run active vehicle physics during gameplay. The level can lock
  // input (e.g. the rank-race countdown holds the taxi still until GO).
  if (phase === GamePhase.PLAYING) {
    vehicle.update(dt, levelManager.inputLocked ? NO_KEYS : input);

    // Destination detection, traffic and pursuit.
    // This may change the game phase.
    if (phase === GamePhase.PLAYING) {
      levelManager.update(
        dt,
        elapsedTime
      );
    }
  } else if (phase !== GamePhase.PAUSED) {
    // Detached cargo can finish falling outside gameplay.
    cargoSystem.updateDetached(dt);
  }

  cameraSystem.update(dt);

  // ========================================================
  // NEW: FOLLOW TAXI WITH DIRECTIONAL SUN SHADOWS
  // ========================================================

  // Keep the sun and its shadow target aligned with the
  // taxi's latest position, including after restarts.
  // The direction and intensity set by each level remain
  // unchanged.
  lighting.updateShadowTracking(taxi);

  // ========================================================
  // GRAPHICS
  // ========================================================

  updateVisualEffects(elapsedTime);

  effects.update(elapsedTime);

  skyManager.update(elapsedTime, taxi.position);
// Keep the distant skyline following the taxi.
skylineManager.update(taxi.position);
  if (phase === GamePhase.PLAYING) {
    dustSystem.update(dt);
  }

  const objective = levelManager.getState();

  // Only counts down (and runs the GO! timer) while playing
  if (phase === GamePhase.PLAYING) {
    countdown.update(objective.race, dt);

    // Once per number (3, 2, 1) and once for GO!
    if (countdown.cue) {
      playCue(countdown.cue);
    }
  }

  updateHUD(objective);

  audio.setActive(phase === GamePhase.PLAYING && !document.hidden);
  audio.update(dt, vehicle.getSpeed(), objective.pursuit.state, keys.Space);

  // Show the mirror only during gameplay and at higher quality.
rearViewMirror.setEnabled(
  rearViewRequested &&
  phase === GamePhase.PLAYING &&
  preferences.quality !== 'low'
);

// Main camera renders normally.
renderer.render(scene, camera);

// Draw the live rear-facing view into the mirror.
rearViewMirror.render();

  requestAnimationFrame(animate);
}

// ============================================================
// WINDOW RESIZE
// ============================================================

window.addEventListener('resize', () => {
  applyQuality(renderer, preferences.quality, window.devicePixelRatio);
  camera.aspect =
    window.innerWidth / window.innerHeight;

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

// NEW: Centre the starting shadow area on the taxi.
lighting.updateShadowTracking(taxi);

// The vehicle must not move until gameplay starts.
vehicle.setEnabled(false);

// The loading screen shows the main menu once
// all required assets finish loading.
animate();
