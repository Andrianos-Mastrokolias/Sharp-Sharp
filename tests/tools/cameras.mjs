// Fixed cameras shared by the GL harness and tests/budget.mjs.
// Levels 1 and 2 drive towards -z, level 3 towards +z.
//
// 'spawn' and 'dest' follow each level's real spawn and destination (a
// level's length is data, see src/world/roads.js); 'far' looks at the middle
// of the run, whatever its length. 'mid' and 'side' stay in the original
// -200..200 stretch, which every level keeps as it was.
import { LEVELS } from '../../src/world/LevelManager.js';

export const FOV = 68;
export const ASPECT = 1280 / 720;

// The camera's far plane in the game: the level's fog far distance (360, 400
// and 150, LightingManager) plus a 40 m margin (main.js). budget.mjs checks
// the table against LightingManager.js.
export const VIEW_DISTANCE = { 1: 400, 2: 440, 3: 190 };

// The sun's shadow camera follows the taxi and covers about 150 x 200 m of
// light space, which is under ~165 m from the taxi on the ground. Only
// shadow casters inside it are drawn in the shadow pass.
export const SHADOW_RADIUS = 165;

// Where the taxi is for a view: the 8 m in front of the camera on the ground
export function taxiFocus({ at, to }) {
  const dx = to[0] - at[0];
  const dz = to[2] - at[2];
  const length = Math.hypot(dx, dz) || 1;

  return [at[0] + (dx / length) * 8, at[2] + (dz / length) * 8];
}

// Chase-style view: 8 m behind the point, looking 28 m ahead of it
function chase(level, z, name) {
  const dir = Math.sign(LEVELS[level].destination.z - LEVELS[level].spawn.z);
  return { name, at: [0, 4.6, z - dir * 8], to: [0, 1.4, z + dir * 20] };
}

const MID = { name: 'mid', at: [0, 4.6, -20], to: [0, 1.4, -50] };
const MID_L3 = { name: 'mid', at: [0, 4.6, 0], to: [0, 1.4, 30] };

const SIDE = { name: 'side', at: [3, 3.2, 30], to: [-16, 5, 8] };
const SIDE_L3 = { name: 'side', at: [3, 3.2, -30], to: [16, 3, -8] };

// Level 1 also has two street-level views of the sidewalks and a side
// street's zebra crossing (street life, Stage 1 onwards)
const L1_STREET = [
  { name: 'walk', at: [9.6, 1.7, -40], to: [13, 1.2, -72] },
  { name: 'cross', at: [6, 1.8, 28], to: [12.5, 1.0, 14] }
];

export const cameras = (level) => {
  const { spawn, destination } = LEVELS[level];
  const dir = Math.sign(destination.z - spawn.z);

  const views = [
    chase(level, spawn.z, 'spawn'),
    level === 3 ? MID_L3 : MID,
    // 25 m short of the destination, looking 5 m past it
    { name: 'dest', at: [0, 4.6, destination.z - dir * 25], to: [0, 1.4, destination.z + dir * 5] },
    level === 3 ? SIDE_L3 : SIDE,
    chase(level, (spawn.z + destination.z) / 2, 'far')
  ];

  return level === 1 ? [...views, ...L1_STREET] : views;
};
