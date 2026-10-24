// HUD logic test: node tests/hud.test.mjs
// The pure parts of the HUD: which pursuit states read as clear or spotted,
// the Level 1 score text, and the 3-2-1-GO! countdown (on its own and driven
// by a real headless LevelManager through a restart and a level switch).
// The DOM itself is checked by playing (see the PR's manual checklist).
import * as THREE from 'three';
import assert from 'node:assert/strict';
import {
  CLEAR_STATES, SPOTTED_STATE, tailText, scorePopupText, rivalsBeatenText
} from '../src/ui/Hud.js';
import { CountdownTracker, GO_TIME } from '../src/ui/countdown.js';
import { formatPoints, scoreStats } from '../src/ui/screens.js';
import { LevelManager } from '../src/world/LevelManager.js';

const DT = 1 / 60;

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- Pursuit meter ----------

test('CLEAR_STATES: none, idle and patrolling read as clear', () => {
  for (const state of ['none', 'idle', 'patrolling']) {
    assert.ok(CLEAR_STATES.includes(state), state);
    assert.equal(tailText(state, 40), 'clear', state);
  }
});

test('CLEAR_STATES: states with a pursuer on the taxi are not clear', () => {
  for (const state of ['reacting', 'chasing', 'lost', 'searching', 'catching']) {
    assert.ok(!CLEAR_STATES.includes(state), state);
  }
});

test('spotted: the siren pause (reacting) shows SPOTTED, not a percentage', () => {
  assert.equal(SPOTTED_STATE, 'reacting');
  assert.equal(tailText('reacting', 0), 'SPOTTED');
});

test('chasing shows the pressure percentage', () => {
  assert.equal(tailText('chasing', 0), '0%');
  assert.equal(tailText('chasing', 73), '73%');
  assert.equal(tailText('searching', 12), '12%');
});

// ---------- Score ----------

test('score pop-ups: the three onScore reasons', () => {
  assert.equal(scorePopupText({ delta: 100, reason: 'beaten', points: 100 }), '+100 Rival beaten');
  assert.equal(scorePopupText({ delta: 300, reason: 'firstOut', points: 400 }), '+300 First out');
  assert.equal(scorePopupText({ delta: -50, reason: 'pedestrian', points: 350 }), '-50 Pedestrian');
});

test('score pop-ups: an unknown reason still shows its points', () => {
  assert.equal(scorePopupText({ delta: 25, reason: 'bonus' }), '+25 bonus');
});

test('rivals beaten line', () => {
  assert.equal(rivalsBeatenText({ points: 0, beaten: 0, rivalsTotal: 8 }), 'Rivals beaten 0/8');
  assert.equal(rivalsBeatenText({ points: 800, beaten: 8, rivalsTotal: 8 }), 'Rivals beaten 8/8');
});

test('results: Level 1 shows points and rivals beaten', () => {
  const html = scoreStats({ points: 1050, beaten: 7, rivalsTotal: 8, firstOut: 'player', pedestriansHit: 1 });
  assert.match(html, /Points[\s\S]*1050 pts/);
  assert.match(html, /Rivals beaten[\s\S]*7 \/ 8/);
});

test('results: levels without a score add nothing', () => {
  assert.equal(scoreStats(null), '');
  assert.equal(scoreStats(undefined), '');
});

test('results: negative points are shown as they are', () => {
  assert.equal(formatPoints(-50), '-50 pts');
  assert.equal(formatPoints(0), '0 pts');
});

// ---------- Countdown ----------

// Feeds the tracker frame by frame; records each change of text and its cue.
function run(tracker, frames) {
  const changes = [];
  for (const [race, dt] of frames) {
    const before = tracker.text;
    tracker.update(race, dt);
    if (tracker.text !== before) changes.push([tracker.text, tracker.cue]);
    else assert.equal(tracker.cue, null, 'cue only on a change');
  }
  return changes;
}

function countdownFrames(from) {
  const frames = [];
  for (let t = from; t > 0; t -= DT) frames.push([{ phase: 'countdown', countdown: t }, DT]);
  return frames;
}

test('countdown: 3, 2, 1, GO! for GO_TIME, then hidden; one cue per change', () => {
  const tracker = new CountdownTracker();
  const racing = { phase: 'racing', countdown: 0 };
  const frames = countdownFrames(3);
  for (let t = 0; t < GO_TIME + 0.5; t += DT) frames.push([racing, DT]);

  assert.deepEqual(run(tracker, frames), [
    ['3', 'countdown'], ['2', 'countdown'], ['1', 'countdown'], ['GO!', 'go'], ['', null]
  ]);
});

test('countdown: GO! lasts about GO_TIME', () => {
  const tracker = new CountdownTracker();
  tracker.update({ phase: 'countdown', countdown: 0.01 }, DT);
  tracker.update({ phase: 'racing', countdown: 0 }, DT);
  let shown = 0;
  while (tracker.text === 'GO!') { shown += DT; tracker.update({ phase: 'racing', countdown: 0 }, DT); }
  assert.ok(Math.abs(shown - GO_TIME) < 2 * DT, `GO! shown for ${shown}`);
});

test('countdown: never shows 0, even at the clamped end', () => {
  const tracker = new CountdownTracker();
  tracker.update({ phase: 'countdown', countdown: 0 }, DT);
  assert.equal(tracker.text, '1');
});

test('countdown: levels without a race show nothing and never cue', () => {
  const tracker = new CountdownTracker();
  const changes = run(tracker, Array(120).fill([{ phase: 'none', countdown: 0 }, DT]));
  assert.deepEqual(changes, []);
  assert.equal(tracker.text, '');
});

test('countdown: GO! is not shown when joining a race already past the countdown', () => {
  const tracker = new CountdownTracker();
  tracker.update({ phase: 'racing', countdown: 0 }, DT);
  assert.equal(tracker.text, '');
});

test('countdown: a restart during GO! starts again from 3 with a cue', () => {
  const tracker = new CountdownTracker();
  tracker.update({ phase: 'countdown', countdown: 0.01 }, DT);
  tracker.update({ phase: 'racing', countdown: 0 }, DT);
  assert.equal(tracker.text, 'GO!');
  tracker.reset();
  tracker.update({ phase: 'countdown', countdown: 3 }, DT);
  assert.equal(tracker.text, '3');
  assert.equal(tracker.cue, 'countdown');
});

test('countdown: switching to a level without a race clears GO! at once', () => {
  const tracker = new CountdownTracker();
  tracker.update({ phase: 'countdown', countdown: 0.01 }, DT);
  tracker.update({ phase: 'racing', countdown: 0 }, DT);
  tracker.update({ phase: 'none', countdown: 0 }, DT);
  assert.equal(tracker.text, '');
});

// The real Level 1 race, headless (same stand-ins as rank-race.test.mjs)
function makeLevelManager() {
  const scene = new THREE.Scene();
  const taxi = new THREE.Object3D();
  const vehicle = {
    settings: { maxForwardSpeed: 28 },
    cargoSystem: { getState: () => ({ remaining: 5, total: 5 }) },
    localTaxiCollisionBox: new THREE.Box3(new THREE.Vector3(-1.35, 0, -2.3), new THREE.Vector3(1.35, 2.8, 2.3)),
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(spawn) { taxi.position.set(spawn.x, 0, spawn.z); },
    getSpeed: () => 0, getHighSpeedTime: () => 0, getLevel2Pressure: () => 0
  };
  return new LevelManager({ scene, vehicle, taxi, collidables: [], potholes: [], getHeadlightsEnabled: () => true });
}

// What main.js does each frame while playing
function play(lm, tracker, seconds) {
  const changes = [];
  for (let t = 0; t < seconds; t += DT) {
    lm.update(DT, t);
    const state = lm.getState();
    tracker.update(state.race, DT);
    if (tracker.cue) changes.push(tracker.text);
    assert.equal(lm.inputLocked, state.race.phase === 'countdown');
  }
  return changes;
}

test('countdown + LevelManager: Level 1 plays 3, 2, 1, GO!; retry and level 2 reset it', () => {
  const lm = makeLevelManager();
  const tracker = new CountdownTracker();

  lm.load(1);
  assert.notEqual(lm.getState().score, null, 'Level 1 has a score');
  assert.deepEqual(play(lm, tracker, 3 + GO_TIME + 0.5), ['3', '2', '1', 'GO!']);
  assert.equal(tracker.text, '');

  // Retry mid-countdown (main.js: loadLevel -> countdown.reset())
  lm.load(1);
  tracker.reset();
  assert.deepEqual(play(lm, tracker, 1.5), ['3', '2']);
  lm.load(1);
  tracker.reset();
  assert.deepEqual(play(lm, tracker, 0.1), ['3']);

  // Level 2: no race, no score, no overlay
  lm.load(2);
  tracker.reset();
  assert.equal(lm.getState().score, null);
  assert.equal(lm.getState().race.phase, 'none');
  assert.deepEqual(play(lm, tracker, 2), []);
  assert.equal(tracker.text, '');
});


let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS', name); }
  catch (err) { failed++; console.log('FAIL', name, '\n  ', err.message); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
