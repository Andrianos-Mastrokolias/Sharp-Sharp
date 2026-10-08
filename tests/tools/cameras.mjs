// Fixed cameras shared by the GL harness and tests/budget.mjs.
// Levels 1 and 2 drive towards -z, level 3 towards +z.
const FWD = [
  { name: 'spawn', at: [0, 4.6, 68], to: [0, 1.4, 40] },
  { name: 'mid', at: [0, 4.6, -20], to: [0, 1.4, -50] },
  { name: 'dest', at: [0, 4.6, -125], to: [0, 1.4, -155] },
  { name: 'side', at: [3, 3.2, 30], to: [-16, 5, 8] }
];

const L3 = [
  { name: 'spawn', at: [0, 4.6, -178], to: [0, 1.4, -150] },
  { name: 'mid', at: [0, 4.6, 0], to: [0, 1.4, 30] },
  { name: 'dest', at: [0, 4.6, 140], to: [0, 1.4, 170] },
  { name: 'side', at: [3, 3.2, -30], to: [16, 3, -8] }
];

export const FOV = 68;
export const ASPECT = 1280 / 720;

// Level 1 also has two street-level views of the sidewalks and a side
// street's zebra crossing (street life, Stage 1 onwards)
const L1_STREET = [
  { name: 'walk', at: [9.6, 1.7, -40], to: [13, 1.2, -72] },
  { name: 'cross', at: [6, 1.8, 28], to: [12.5, 1.0, 14] }
];

export const cameras = (level) => (
  level === 3 ? L3 : level === 1 ? [...FWD, ...L1_STREET] : FWD
);
