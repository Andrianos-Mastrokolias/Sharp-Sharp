// ==================================================
// ROAD EXTENT PER LEVEL
// --------------------------------------------------
// Where each level's road runs along z. This is the one place
// a level's length lives: the environment factories build their
// road, kerbs, buildings and props between zMin and zMax, and
// LevelManager derives the vehicle's bounds and the traffic's
// lane range from the same numbers.
//
// -200..200 is the original road. Every level keeps that
// stretch exactly as it was (same props at the same z, so the
// speed bump at z 25, the potholes at z 5, -20 and -50 and the
// flyover at z 10..-110 stay where the vehicle physics expects
// them) and the longer roads add more of the same beyond it.
// ==================================================

export const DEFAULT_ROAD = { zMin: -200, zMax: 200 };

// The road runs this far past the vehicle's z bounds (as the
// original 10 m: bounds +-190 on a +-200 road)
export const ROAD_END_MARGIN = 10;

// Level 1 drives -z from z 170 to the goal at -730 (900 m), Level 2
// -z from 170 to -930 (1100 m, the flyover unchanged), Level 3 +z from
// -600 to 300 (900 m).
export const ROADS = {
  1: { zMin: -760, zMax: 200 },
  2: { zMin: -960, zMax: 200 },
  3: { zMin: -660, zMax: 330 }
};

export function roadFor(levelId) {
  return ROADS[levelId] ?? DEFAULT_ROAD;
}

export function roadLength(road) {
  return road.zMax - road.zMin;
}

export function roadCentre(road) {
  return (road.zMin + road.zMax) / 2;
}

// What the vehicle is clamped to on a road (x +-30 as before)
export function vehicleBounds(road) {
  return {
    minX: -30,
    maxX: 30,
    minZ: road.zMin + ROAD_END_MARGIN,
    maxZ: road.zMax - ROAD_END_MARGIN
  };
}

// First value of anchor + k * step (k an integer, any sign) that is
// >= min. Lets a repeating pattern keep its original phase when the
// road grows past the stretch it was first laid out on.
export function alignedFrom(
  anchor,
  step,
  min
) {

  return anchor + step * Math.ceil((min - anchor) / step);
}
