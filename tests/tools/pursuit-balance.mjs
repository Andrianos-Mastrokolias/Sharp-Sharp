// Pursuit balance simulation (analysis tool, not part of `npm test`).
//   node tests/tools/pursuit-balance.mjs          (N=150 runs per cell)
//   N=300 node tests/tools/pursuit-balance.mjs
//
// Runs the REAL LevelManager and PursuitSystem against simulated drivers
// on Levels 1, 2 and 3 and reports how often each driver is caught before the
// goal. A driver cruises at a fraction of the taxi's top speed and hits
// random incidents (pothole, bump, collision) that cut its speed.
//
//   clean   : full speed, an incident every ~15 s (small losses)
//   average : 90% of top speed, an incident every ~8 s
//   rough   : 85% of top speed, an incident every ~6 s (big losses)
//   sloppy  : 78% of top speed, an incident every ~4 s (big losses)
//
// The taxi moves in the level's direction of travel (towards -z on Levels 1 and
// 2, +z on Level 3: the sign from spawn to destination) with the headlights on, so
// Level 3's pursuer sees it from 120 m.
//
// Level 1 is a rank race now: lm.skipCountdown() ends the 3 s countdown at once,
// the 8 rivals launch (the simulated taxi passes through them, so some count as
// beaten and lengthen the police head start), and the police appear at z -325.
// A row can switch that off (rivals: false: nobody is ever beaten, head start
// 25 m) or put back the old chase (trigger 0.66, 30 m: race.headStart).
//
// It is a model: relative results are reliable, absolute percentages are
// not. Edit TUNES below to compare settings. Findings on 23 Oct 2026:
//  - the taxi's top speed barely matters (police speed and the pressure
//    line are both fractions of it);
//  - what matters most is stumbleSurgeTime against captureTime: a speed
//    drop of 8 m/s or more holds the police tight for stumbleSurgeTime,
//    so if that is long enough for captureTime to run out, ONE mistake
//    is fatal. Near the threshold the catch rate jumps sharply, so tune
//    in small steps (0.05 s) and playtest.
import * as THREE from 'three';
import { LevelManager, LEVELS } from '../../src/world/LevelManager.js';

const DT = 1 / 30;
const N = Number(process.env.N || 150);
const TOP = 31, ACCEL = 15;

const PROFILES = {
  clean:   { cruiseFrac: 1.00, meanGap: 15, losses: [0.10, 0.16] },
  average: { cruiseFrac: 0.90, meanGap: 8,  losses: [0.10, 0.16, 0.30, 0.45] },
  rough:   { cruiseFrac: 0.85, meanGap: 6,  losses: [0.16, 0.30, 0.45, 0.60] },
  sloppy:  { cruiseFrac: 0.78, meanGap: 4,  losses: [0.16, 0.30, 0.45, 0.60] }
};

// Settings to compare. `tune` overrides LEVELS[level].pursuit keys, `headStart`
// replaces LEVELS[1].race.headStart, and `rivals: false` keeps the rivals
// from launching (so none is beaten).
const OLD = { stumbleSurgeTime: 2, pressureSpeedFraction: 0.9, pressureRiseRate: 0.5 };   // PursuitSystem.js defaults
const OLD_CHASE = { triggerProgress: 0.66 };                                              // the chase before the rank race
const FLAT_30 = { base: 30, perRival: 0, max: 30 };

const TUNES = [
  { label: 'L1 old numbers, old chase (0.66, 30 m)', level: 1, tune: { ...OLD, ...OLD_CHASE }, headStart: FLAT_30, rivals: false },
  { label: 'L1 new numbers, old chase (0.66, 30 m)', level: 1, tune: OLD_CHASE, headStart: FLAT_30, rivals: false },
  { label: 'L1 new numbers, z -325, no rival beaten', level: 1, tune: {}, rivals: false },
  { label: 'L1 new numbers, z -325, rivals as in game', level: 1, tune: {} },
  { label: 'L2 old numbers', level: 2, tune: OLD },
  { label: 'L2 new numbers', level: 2, tune: {} },
  { label: 'L3 now (defaults 2 s, 0.9, 0.5)', level: 3, tune: OLD },
  { label: 'L3 new numbers (1.25 s, 0.8, 0.3)', level: 3, tune: {} }
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function trial({ level, profile, tune, seed, headStart = null, rivals = true }) {
  const r = rng(seed);
  const cfg = LEVELS[level].pursuit;
  const saved = { ...cfg };
  Object.assign(cfg, tune);
  const race = LEVELS[level].race;
  const savedHeadStart = race?.headStart;
  if (race && headStart) race.headStart = headStart;
  const taxi = new THREE.Object3D();
  let speed = 0, t = 0, captured = null;
  const vehicle = {
    settings: { maxForwardSpeed: TOP },
    cargoSystem: { getState: () => ({}) },
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {}, setLevelSpeedBumps() {},
    reset(s) { taxi.position.set(s.x, 0, s.z); },
    getSpeed: () => speed, getHighSpeedTime: () => 0, getLevel2Pressure: () => 0
  };
  const lm = new LevelManager({
    scene: new THREE.Scene(), vehicle, taxi, collidables: [], potholes: [],
    getHeadlightsEnabled: () => true,
    onDelivered: () => {}, onCaptured: () => { captured = t; }
  });
  lm.load(level);
  lm.skipCountdown?.();                                    // Level 1's rank race: no 3 s wait
  if (race && !rivals) lm.rivals.launched = false;         // the rivals stay on the grid: nobody is beaten
  const goalZ = LEVELS[level].destination.z;
  const dir = Math.sign(goalZ - taxi.position.z);        // the level's direction of travel along z (reset() has put the taxi at the spawn)
  const cruise = profile.cruiseFrac * TOP;
  let next = 3 - Math.log(1 - r()) * profile.meanGap;
  let result = { captured: false, time: null, beaten: 0, headStart: null };
  for (; t < 150; t += DT) {
    if (race && !rivals) lm.rivals.launched = false;
    if (t >= next) {
      speed *= 1 - profile.losses[Math.floor(r() * profile.losses.length)];
      next = t + 0.8 - Math.log(1 - r()) * profile.meanGap;
    }
    speed = Math.min(cruise, speed + ACCEL * DT);
    taxi.position.z += dir * speed * DT;
    lm.update(DT, t);
    if (result.headStart === null && lm.pursuit.spawned) {
      result.headStart = lm.pursuit.config.spawnDistance;
      result.beaten = lm.score.beaten;
    }
    if (captured !== null) { result = { ...result, captured: true, time: t }; break; }
    if ((goalZ - taxi.position.z) * dir <= 8) { result = { ...result, captured: false, time: t }; break; }
  }
  for (const k of Object.keys(cfg)) delete cfg[k];
  Object.assign(cfg, saved);
  if (race) race.headStart = savedHeadStart;
  return result;
}

console.log(`Caught before the goal, ${N} runs per cell (taxi top speed ${TOP} m/s)\n`);
for (const sc of TUNES) {
  let beatenSum = 0, headSum = 0, spawned = 0;
  const cells = Object.entries(PROFILES).map(([name, profile]) => {
    let caught = 0;
    for (let s = 1; s <= N; s++) {
      const result = trial({ level: sc.level, profile, tune: sc.tune, headStart: sc.headStart, rivals: sc.rivals, seed: s * 7919 + sc.level });
      if (result.captured) caught++;
      if (result.headStart !== null) { beatenSum += result.beaten; headSum += result.headStart; spawned++; }
    }
    return `${name} ${String(Math.round(100 * caught / N)).padStart(3)}%`;
  });
  const extra = sc.level === 1 && spawned
    ? `   (head start ${(headSum / spawned).toFixed(0)} m, ${(beatenSum / spawned).toFixed(1)} beaten on average)`
    : '';
  console.log(`${sc.label.padEnd(44)} ${cells.join(' | ')}${extra}`);
}
