import * as THREE from 'three';
import {
  PursuitSystem,
  ELEVATION_ENTRY_MAX,
  ELEVATION_ENTRY_TOLERANCE
} from './PursuitSystem.js';
import { TrafficSystem } from './TrafficSystem.js';
import { RivalTaxiSystem } from './RivalTaxis.js';
import { buildEnvironment } from './environments/index.js';
import { ROADS, vehicleBounds } from './roads.js';
import { buildHighwayRoadworks } from './RoadWorks.js';

// ==================================================
// LEVEL DEFINITIONS
// --------------------------------------------------
// Data only. The road/buildings come from the per-level
// environment factories in ./environments (built by
// load()), all on one straight road along Z at x = 0, so a
// level is: where you start, where you must deliver, and
// the hazards/limits that apply.
//
// Facing: heading 0 = driving towards -Z (matches
// VehicleController.reset()).
// ==================================================

// A level's length is data: its road (z range) lives in roads.js,
// and what is sent to vehicle.setBounds() on load (x +-30 and the
// road's z range less a 10 m margin at each end) is derived from it.
// warnIfRouteOutOfBounds() flags any route that outgrows them.
const L1_ROAD = ROADS[1];
const L2_ROAD = ROADS[2];
// Set to false to remove all Level 2 roadworks.
const ENABLE_LEVEL2_ROADWORKS = true;
const L3_ROAD = ROADS[3];

// What running over a pedestrian does to the taxi (vehicle.applyHit): it
// loses 25% of its speed, the cargo takes a little stress and the suspension a
// kick. Nothing happens to the police. On Level 1 it also costs 50 points
// (registerPedestrianHit, L1_RACE.points.pedestrian).
// 25%, not 30%: at 28 to 31 m/s a 30% loss is 8.4 to 9.3 m/s, past the
// pursuit's STUMBLE_SPEED_DROP (8 m/s), so a hit held the police tight like a
// crash. 25% is 7 to 7.75 m/s, under it.
const PEDESTRIAN_HIT = {
  speedLoss: 0.25,
  stress: 2,
  kick: 0.3
};

// A raised section only lifts the taxi if it is already near the
// deck surface (or at the ramp toe), so driving on the ground
// underneath does not snap it up onto the deck. The pursuer
// follows the same rule, so both constants live in PursuitSystem.js
// (ELEVATION_ENTRY_MAX / ELEVATION_ENTRY_TOLERANCE).


// ==================================================
// PURSUIT TUNING (hand-tunable)
// --------------------------------------------------
// Speeds are fractions of the vehicle's maxForwardSpeed;
// distances in metres, times in seconds. Shared behaviour
// (turn rate, acceleration...) is at the top of
// PursuitSystem.js.
// ==================================================

// Level 1: the police appear once the taxi is 0.55 of the 900 m run along,
// z -325, about 400 m before the goal. spawnDistance is the head start with no
// rival beaten; LevelManager lengthens it for every rival beaten, from the
// count at the moment the police spawn (see L1_RACE.headStart).
const L1_PURSUIT_TRIGGER_PROGRESS = 0.55;  // along spawn -> destination
const L1_PURSUIT_SPAWN_DISTANCE = 25;      // behind the taxi, nobody beaten
const L1_PURSUIT_SPEED = 1.15;
const L1_PURSUIT_LOSE_RANGE = 120;
const L1_PURSUIT_LOSE_TIME = 5;
const L1_PURSUIT_CAPTURE_DISTANCE = 6.4;
const L1_PURSUIT_CAPTURE_TIME = 1.5;

// Balance (tests/tools/pursuit-balance.mjs): the police held the taxi tight for
// the whole stumbleSurgeTime after a stumble (a drop of 8 m/s or more), and
// that was longer than captureTime, so one mistake caught the player. The
// surge is now shorter, and the pressure line (the speed below which the gap
// closes, a fraction of top speed) lower and slower to build. PursuitSystem.js's
// own defaults are 2 s, 0.9 and 0.5 (Level 3 now sets its own, see below).
const L1_PURSUIT_STUMBLE_SURGE_TIME = 1.4;       // s (the catch rate falls off a cliff at 1.3: do not go lower)
const L1_PURSUIT_PRESSURE_SPEED_FRACTION = 0.8;
const L1_PURSUIT_PRESSURE_RISE_RATE = 0.3;       // per second, at a standstill

// Level 2: on the ground lane from the start, at the taxi's top speed.
// It follows onto the flyover too (ramp toe -> deck -> back down), a
// bit slower on the ramp slope (RAMP_SPEED_FACTOR in PursuitSystem.js).
const L2_PURSUIT_START_DELAY = 3;
const L2_PURSUIT_SPAWN_DISTANCE = 35;      // behind the spawn
const L2_PURSUIT_SPEED = 1.02;
const L2_PURSUIT_DETECTION_RADIUS = 80;
const L2_PURSUIT_LOSE_RANGE = 120;
const L2_PURSUIT_LOSE_TIME = 3;
const L2_PURSUIT_CAPTURE_DISTANCE = 6.4;
const L2_PURSUIT_CAPTURE_TIME = 2.0;
const L2_PURSUIT_STUMBLE_SURGE_TIME = 1.25;      // s (see the Level 1 note above)
const L2_PURSUIT_PRESSURE_SPEED_FRACTION = 0.70;
const L2_PURSUIT_PRESSURE_RISE_RATE = 0.20;
const L2_PURSUIT_LANE_MIN_X = -9;
const L2_PURSUIT_LANE_MAX_X = 2;           // ground lane; flyover starts at x 3

// Level 3: detection range is the stealth tradeoff against
// the unlit potholes (lights on = seen from far away).
// The taxi spawns at z -600 and the pursuer's 30 m spawn offset fits
// inside the world bounds (road z -660, bounds -650). The 1 s start delay
// and the 120 m lights-on radius mean a taxi that starts with its
// lights on is always inside the radius when the pursuer wakes (no
// activateAfterDelay needed), while lights off (15 m) stays unseen.

const L3_PURSUIT_START_DELAY = 1;
const L3_PURSUIT_SPAWN_DISTANCE = 30;
const L3_PURSUIT_SPEED = 1.15;

// HEADLIGHT DETECTION
const L3_PURSUIT_DETECTION_LIGHTS_ON = 120;
const L3_PURSUIT_DETECTION_LIGHTS_OFF = 15;

// LOSING THE PURSUER
const L3_PURSUIT_LOSE_RANGE_LIGHTS_ON = 170;
const L3_PURSUIT_LOSE_RANGE_LIGHTS_OFF = 30;
const L3_PURSUIT_LOSE_TIME = 4;

// CAPTURE
const L3_PURSUIT_CAPTURE_DISTANCE = 6.4;
const L3_PURSUIT_CAPTURE_TIME = 1.5;

// PATROL AND REACTION
const L3_PURSUIT_PATROL_SPEED = 26;
const L3_PURSUIT_REACTION_TIME = 1.5;

// BALANCE (tests/tools/pursuit-balance.mjs): as on Levels 1 and 2, instead of
// PursuitSystem.js's own 2 s, 0.9 and 0.5
const L3_PURSUIT_STUMBLE_SURGE_TIME = 1.25;      // s (see the Level 1 note above)
const L3_PURSUIT_PRESSURE_SPEED_FRACTION = 0.8;
const L3_PURSUIT_PRESSURE_RISE_RATE = 0.3;



// ==================================================
// TRAFFIC TUNING (hand-tunable)
// --------------------------------------------------
// Lanes: x (m across the road), dir along z (-1 = with the taxi,
// +1 = oncoming), speed (m/s, constant), count, variants (any of
// hatchback / sedan / bakkie / minibus). At most 10 cars a level.
// Lanes run across the whole road (zLo..zHi, inside the vehicle's
// z bounds): cars enter at one end and leave at the other, far from
// the spawn. The clearances only shape the initial layout. See
// TrafficSystem.js.
//
// Taxi: 2.7 m wide, spawns at x = 0. Widest car 1.97 m (minibus):
// a car in an x = +-4.5 lane leaves ~2.2 m between its side and the
// taxi, and ~3.5 m to the road edge (x +-9).
// ==================================================

// The stretch of road the lanes run on: the vehicle's z bounds less 5 m
// at each end (the original -185..185)
const TRAFFIC_LANE_END_MARGIN = 5;

const trafficLaneRange = road => {
  const bounds = vehicleBounds(road);

  return {
    zLo: bounds.minZ + TRAFFIC_LANE_END_MARGIN,
    zHi: bounds.maxZ - TRAFFIC_LANE_END_MARGIN
  };
};

// Cars per metre as on the original 370 m lanes (Level 1: 4 + 4,
// Level 2: 3 + 4), so the count follows the road: Level 1's lanes now start
// after the rank's exit line (they are 680 m: 7 + 7 cars, cap 16). Level 2's
// are 1130 m; its cap is 16 (7 + 9), a little under the original density.

// At the start nobody is this close to the spawn bay / the delivery zone
const TRAFFIC_SPAWN_CLEARANCE = 40;
const TRAFFIC_DESTINATION_CLEARANCE = 35;

const L1_TRAFFIC_SEED = 1101;
const L1_TRAFFIC_SAME_X = -4.5;
const L1_TRAFFIC_SAME_SPEED = 9;
const L1_TRAFFIC_SAME_COUNT = 7;
const L1_TRAFFIC_ONCOMING_X = 4.5;
const L1_TRAFFIC_ONCOMING_SPEED = 12;
const L1_TRAFFIC_ONCOMING_COUNT = 7;
const L1_TRAFFIC_MAX_CARS = 16;

// ==================================================
// LEVEL 1: THE RANK RACE (hand-tunable)
// --------------------------------------------------
// The taxi starts in the middle of a bunched grid of 8 rival minibuses on
// the rank (z 170 to -60, exit line at -60). After a 3 s countdown (the
// taxi and the rivals held still) the rivals launch. Phases: countdown ->
// racing -> cbd (taxi over the exit line) -> chase (police spawned).
//
// Grid: 3 columns (x -6, 0, 6) by 3 rows (z 158, 170, 182, 12 m apart), the
// taxi in the middle cell (0, 170) which is the spawn. The minibus is 1.97 x
// 5.30 m and the taxi's box 2.70 x 4.60 m, so in a column the taxi is 7.05 m
// and two rivals 6.7 m clear of each other, and across the columns the taxi is
// 3.67 m and two rivals 4.03 m clear; the outermost rival edge is at |x| 6.99,
// inside the road (x +-9) and short of the Level 1 kerb zone (|x| 7.2), and the
// rank's solid props are all outside |x| 9. tests/rank-race.test.mjs checks it.
// ==================================================

const L1_RANK_EXIT_Z = -60;

const L1_RACE = {

  countdown: 3,                       // s, taxi and rivals held

  road: { halfWidth: 9 },

  // The line the first car over wins the bonus for
  exitZ: L1_RANK_EXIT_Z,

  // After the exit line, each rival is released (removed) once it is at
  // least gap m behind the taxi and the taxi is past z; all the rest are
  // released when the taxi passes allZ
  release: { z: -140, allZ: -250, gap: 25 },

  points: { beaten: 100, firstOut: 300, pedestrian: -50 },

  // Police head start (m behind the taxi) = base + perRival x rivals beaten,
  // read at the moment they spawn, capped
  headStart: {
    base: L1_PURSUIT_SPAWN_DISTANCE,
    perRival: 10,
    max: 105
  },

  // The car straight ahead of the taxi is a racer (it pulls away at launch):
  // a brake-checker there stops dead 12 m in front of a taxi that launches
  // straight, and the first contact freezes it (RivalTaxiSystem.blocked)
  grid: [
    { x: -6, z: 158, personality: 'weaver', topSpeed: 20 },
    { x: 0, z: 158, personality: 'racer', topSpeed: 22 },
    { x: 6, z: 158, personality: 'cutter', topSpeed: 22 },

    { x: -6, z: 170, personality: 'brake-checker', topSpeed: 18 },
    { x: 6, z: 170, personality: 'racer', topSpeed: 21 },

    { x: -6, z: 182, personality: 'cutter', topSpeed: 21 },
    { x: 0, z: 182, personality: 'weaver', topSpeed: 19 },
    { x: 6, z: 182, personality: 'brake-checker', topSpeed: 17 }
  ]
};

// Level 2: same direction only. Flyover footprint is x >= 3 (traffic
// must stay at x < 2), so both lanes sit on the ground side.
const L2_TRAFFIC_SEED = 2202;
const L2_TRAFFIC_LANE_A_X = 0;
const L2_TRAFFIC_LANE_A_SPEED = 13;
const L2_TRAFFIC_LANE_A_COUNT = 7;
const L2_TRAFFIC_LANE_B_X = -3.6;
const L2_TRAFFIC_LANE_B_SPEED = 17;
const L2_TRAFFIC_LANE_B_COUNT = 9;
const L2_TRAFFIC_MAX_CARS = 16;

// Level 3: slow night traffic, same direction only (the taxi drives +z).
// Cars show as red tail-lights and in the headlight beam. Lanes sit at
// x +-4.5 like Level 1, clear of the shoulder objects (|x| >= 7.5).
const L3_TRAFFIC_SEED = 3303;
const L3_TRAFFIC_LANE_A_X = -4.5;
const L3_TRAFFIC_LANE_A_SPEED = 8;
const L3_TRAFFIC_LANE_B_X = 4.5;
const L3_TRAFFIC_LANE_B_SPEED = 11;
const L3_TRAFFIC_PER_LANE = 6;
const L3_TRAFFIC_MAX_CARS = 12;


// Spawn bay / destination ring / beam are unlit (MeshBasicMaterial), so
// at night they are the brightest things on the road. A level scales
// their opacity with `markerBrightness` (1 = as authored; missing = 1).
// The beam is scaled less than the ring and bay (BEAM_BRIGHTNESS_FLOOR)
// because it is what you find the destination by from a distance.
const MARKER_OPACITY = {
  rank: 0.35,
  zone: 0.45,
  zonePulseBase: 0.35,
  zonePulseSwing: 0.12,
  beam: 0.22
};

const BEAM_BRIGHTNESS_FLOOR = 0.5;


export const LEVELS = {

  1: {
    name: 'Rank to CBD',

    road: L1_ROAD,

    // 900 m run towards -z from the top of the road
    spawn: {
      x: 0,
      z: 170,
      heading: 0
    },

    // Waypoints are for the route guide / future traffic
    // and pursuit paths. The last one is the destination.
    route: [
      { x: 0, z: 170 },
      { x: 0, z: -730 }
    ],

    destination: {
      x: 0,
      z: -730,
      radius: 8,

      // Taxi must be (nearly) stopped inside the zone
      maxDeliverSpeed: 4
    },

    // The rank race (see L1_RACE) and no yellow spawn bay under the grid
    race: L1_RACE,

    spawnBay: false,

    // Four runners on the CBD stretch (after the exit gantry at z -60): they
    // wait at the kerb and dash across when the taxi is about to reach them
    // (life.js). One per band of zFrom..zTo, placed by the environment.
    runners: {
      count: 4,
      minDistance: 50,
      zFrom: -130,
      zTo: -640,
      minGap: 60,
      sign: -1,
      seed: 7101
    },

    // Pursuit begins once the taxi is 0.55 of the way along the route.
    pursuit: {
      mode: 'trigger',
      triggerProgress: L1_PURSUIT_TRIGGER_PROGRESS,
      spawnDistance: L1_PURSUIT_SPAWN_DISTANCE,
      speedFraction: L1_PURSUIT_SPEED,
      detectionRadius: L1_PURSUIT_LOSE_RANGE,
      loseRange: L1_PURSUIT_LOSE_RANGE,
      loseTime: L1_PURSUIT_LOSE_TIME,
      captureDistance: L1_PURSUIT_CAPTURE_DISTANCE,
      captureTime: L1_PURSUIT_CAPTURE_TIME,
      stumbleSurgeTime: L1_PURSUIT_STUMBLE_SURGE_TIME,
      pressureSpeedFraction: L1_PURSUIT_PRESSURE_SPEED_FRACTION,
      pressureRiseRate: L1_PURSUIT_PRESSURE_RISE_RATE
    },

    traffic: {
      seed: L1_TRAFFIC_SEED,
      maxCars: L1_TRAFFIC_MAX_CARS,

      // Nothing in the rank: the lanes start just past its exit line, so
      // a car never wraps near the start
      zLo: trafficLaneRange(L1_ROAD).zLo,
      zHi: L1_RANK_EXIT_Z - 5,
      spawnClearance: TRAFFIC_SPAWN_CLEARANCE,
      destinationClearance: TRAFFIC_DESTINATION_CLEARANCE,
      lanes: [
        {
          x: L1_TRAFFIC_SAME_X,
          dir: -1,
          speed: L1_TRAFFIC_SAME_SPEED,
          count: L1_TRAFFIC_SAME_COUNT,
          variants: ['hatchback', 'sedan', 'bakkie', 'minibus']
        },
        {
          x: L1_TRAFFIC_ONCOMING_X,
          dir: 1,
          speed: L1_TRAFFIC_ONCOMING_SPEED,
          count: L1_TRAFFIC_ONCOMING_COUNT,
          variants: ['minibus', 'sedan', 'hatchback', 'bakkie']
        }
      ]
    },

    markerBrightness: 1,

    // The vehicle also hard-clamps to x +-30 and the road's z range
    boundaries: vehicleBounds(L1_ROAD)
  },


  2: {
    name: 'The Highway',

    road: L2_ROAD,

    // Midday visuals/speed tuning are applied elsewhere
    // (applyLevelVisuals / vehicle.setLevel).

    // 1100 m run towards -z; the speed bump (z 25), the potholes
    // (z 5, -20, -50) and the flyover (z 10..-110) are where they were
    spawn: {
      x: 0,
      z: 170,
      heading: 0
    },

    // Default guide route (the ground lane).
    route: [
      { x: 0, z: 170 },
      { x: 0, z: -930 }
    ],

    // Route choice: both end at the same destination.
    //  ground  - straight on; the speed bump (z 25) and
    //            potholes (z 5, -20, -50) are in the way.
    //  flyover - break right before z 40, climb the ramp and
    //            cruise over the hazards, rejoin after z -110.
    routes: [
      {
        id: 'ground',
        waypoints: [
          { x: 0, z: 170 },
          { x: 0, z: -930 }
        ]
      },
      {
        id: 'flyover',
        waypoints: [
          { x: 0, z: 170 },
          { x: 0, z: 40 },
          { x: 6.2, z: 15 },
          { x: 6.2, z: -105 },
          { x: 0, z: -135 },
          { x: 0, z: -930 }
        ]
      }
    ],

    // Level 2 physical speed bump.
    // Matches the visible bump on the ground route.
    speedBumps: [
    {
      x: 0,
      z: 25,
      width: 14,
      depth: 3,
      height: 0.35,
      heading: 0
    }
    ],

    // Raised sections, fed to the vehicle through
    // setGroundHeightProvider() (see getGroundHeight()). The
    // deck runs between zEntry and zExit (z decreases as you
    // drive forward); the first and last `rampLength` are
    // ramps.
    //
    // deckThickness is also the gap between the taxi's origin
    // and the pillar tops. The taxi's lowest point is 0.36 below
    // its origin at full suspension (0.02 GLB offset - 0.38
    // maxSuspensionMovement), so 0.9 leaves ~0.54 m clear.
    elevated: [
      {
        id: 'flyover',
        // Inner edge stays clear of the ground lane (x 0); the
        // outer edge stops short of the lamp poles at x 9.6.
        // Width matters: the solid rails leave (width - 0.5 -
        // 2.7 taxi box) of slack to aim for the ramp toe.
        xMin: 3,
        xMax: 9.4,
        height: 2.5,
        deckThickness: 0.9,
        rampLength: 30,
        zEntry: 10,
        zExit: -110
      }
    ],

    destination: {
      x: 0,
      z: -930,
      radius: 8,
      maxDeliverSpeed: 4
    },

    // Ground-lane pursuer that also follows up the flyover (it gets
    // its height from getElevationAt()). Not collidable.
    pursuit: {
      mode: 'immediate',
      startDelay: L2_PURSUIT_START_DELAY,
      spawnDistance: L2_PURSUIT_SPAWN_DISTANCE,
      speedFraction: L2_PURSUIT_SPEED,
      detectionRadius: L2_PURSUIT_DETECTION_RADIUS,
      loseRange: L2_PURSUIT_LOSE_RANGE,
      loseTime: L2_PURSUIT_LOSE_TIME,
      captureDistance: L2_PURSUIT_CAPTURE_DISTANCE,
      captureTime: L2_PURSUIT_CAPTURE_TIME,
      stumbleSurgeTime: L2_PURSUIT_STUMBLE_SURGE_TIME,
      pressureSpeedFraction: L2_PURSUIT_PRESSURE_SPEED_FRACTION,
      pressureRiseRate: L2_PURSUIT_PRESSURE_RISE_RATE,
      lane: {
        minX: L2_PURSUIT_LANE_MIN_X,
        maxX: L2_PURSUIT_LANE_MAX_X
      }
    },

    // Same direction only, on the ground side of the road. Kept clear
    // of the flyover footprint (checked by TrafficSystem.configure).
    traffic: {
      seed: L2_TRAFFIC_SEED,
      maxCars: L2_TRAFFIC_MAX_CARS,
      ...trafficLaneRange(L2_ROAD),
      spawnClearance: TRAFFIC_SPAWN_CLEARANCE,
      destinationClearance: TRAFFIC_DESTINATION_CLEARANCE,
      lanes: [
        {
          x: L2_TRAFFIC_LANE_A_X,
          dir: -1,
          speed: L2_TRAFFIC_LANE_A_SPEED,
          count: L2_TRAFFIC_LANE_A_COUNT,
          variants: ['minibus', 'bakkie', 'sedan']
        },
        {
          x: L2_TRAFFIC_LANE_B_X,
          dir: -1,
          speed: L2_TRAFFIC_LANE_B_SPEED,
          count: L2_TRAFFIC_LANE_B_COUNT,
          variants: ['hatchback', 'sedan', 'bakkie']
        }
      ]
    },

    markerBrightness: 1,

    boundaries: vehicleBounds(L2_ROAD)
  },


  3: {
    name: 'Load Shedding',

    // Night visuals (fog, sun, HDRI) come from the graphics
    // managers via applyLevelVisuals(3).

    road: L3_ROAD,

    // Drives the road the other way round (+Z), so heading is PI.
    // 900 m run from z -600 to +300.
    spawn: {
      x: 0,
      z: -600,
      heading: Math.PI
    },

    // A back road: wanders across the carriageway rather than
    // running straight. Guide only - nothing enforces it. The
    // wander (and the three hidden potholes below) stays where it was;
    // the road runs straight before and after it.
    route: [
      { x: 0, z: -600 },
      { x: 0, z: -150 },
      { x: 0, z: -130 },
      { x: 5, z: -100 },
      { x: 5, z: -70 },
      { x: -5, z: -30 },
      { x: -5, z: 10 },
      { x: 3, z: 50 },
      { x: 3, z: 90 },
      { x: 0, z: 125 },
      { x: 0, z: 165 },
      { x: 0, z: 300 }
    ],

    // Unlit potholes on the route. They are registered with the
    // vehicle's shared pothole array (real dips, cargo stress)
    // and drawn near-black, so at night they only show up in
    // the headlight beam. Killing the lights hides them but is
    // the stealthy option - see headlightsOffTime in getState().
    hazards: [
      { type: 'pothole', x: 5, z: -85, radius: 1.8, depth: 0.4 },
      { type: 'pothole', x: -5, z: -10, radius: 1.7, depth: 0.45 },
      { type: 'pothole', x: 3, z: 70, radius: 2.0, depth: 0.4 }
    ],

    // Eight runners between z -540 and 240 (not in the first or last 60 m of
    // the road): they wait on the shoulder and dash across when the taxi is
    // about to reach them. No lights, so the headlights are all that show
    // them. They keep 4.5 m clear of the potholes above (avoidZ) as well as
    // the wrecks, bins and lamps (township.js).
    runners: {
      count: 8,
      minDistance: 35,
      zFrom: -540,
      zTo: 240,
      minGap: 60,
      sign: 1,
      seed: 7303,
      avoidZ: [-85, -10, 70]
    },

    destination: {
      x: 0,
      z: 300,
      radius: 8,
      maxDeliverSpeed: 4
    },

    // Headlight stealth: lights on = seen from far away, lights off =
    // only up close (see L3_PURSUIT_* above). No activateAfterDelay.
    pursuit: {
      mode: 'immediate',
      spawnIdleGrace: 5,
      startDelay: L3_PURSUIT_START_DELAY,
      spawnDistance: L3_PURSUIT_SPAWN_DISTANCE,
      speedFraction: L3_PURSUIT_SPEED,
      detectionRadius: L3_PURSUIT_DETECTION_LIGHTS_ON,
      detectionRadiusDark: L3_PURSUIT_DETECTION_LIGHTS_OFF,
      loseRange: L3_PURSUIT_LOSE_RANGE_LIGHTS_ON,
      loseRangeDark: L3_PURSUIT_LOSE_RANGE_LIGHTS_OFF,
      loseTime: L3_PURSUIT_LOSE_TIME,
      captureDistance: L3_PURSUIT_CAPTURE_DISTANCE,
      captureTime: L3_PURSUIT_CAPTURE_TIME,
      patrolSpeed: L3_PURSUIT_PATROL_SPEED,
      reactionTime: L3_PURSUIT_REACTION_TIME,
      stumbleSurgeTime: L3_PURSUIT_STUMBLE_SURGE_TIME,
      pressureSpeedFraction: L3_PURSUIT_PRESSURE_SPEED_FRACTION,
      pressureRiseRate: L3_PURSUIT_PRESSURE_RISE_RATE
    },

    traffic: {
      seed: L3_TRAFFIC_SEED,
      maxCars: L3_TRAFFIC_MAX_CARS,
      ...trafficLaneRange(L3_ROAD),
      spawnClearance: TRAFFIC_SPAWN_CLEARANCE,
      destinationClearance: TRAFFIC_DESTINATION_CLEARANCE,
      lanes: [
        {
          x: L3_TRAFFIC_LANE_A_X,
          dir: 1,
          speed: L3_TRAFFIC_LANE_A_SPEED,
          count: L3_TRAFFIC_PER_LANE,
          variants: ['sedan', 'bakkie', 'minibus']
        },
        {
          x: L3_TRAFFIC_LANE_B_X,
          dir: 1,
          speed: L3_TRAFFIC_LANE_B_SPEED,
          count: L3_TRAFFIC_PER_LANE,
          variants: ['minibus', 'sedan', 'bakkie']
        }
      ]
    },

    // Night: the unlit spawn bay and destination ring would glare
    markerBrightness: 0.5,

    boundaries: vehicleBounds(L3_ROAD)
  }
};


export class LevelManager {

  constructor({
    scene,
    vehicle,
    taxi,
    collidables = null,
    potholes = null,
    materials = null,
    getHeadlightsEnabled = null,
    onDelivered = null,
    onCaptured = null,
    onScore = null,
    onPedestrianHit = null
  }) {

    // The array main.js hands to VehicleController for its ground
    // dips - same idea as collidables above.
    this.potholes = potholes;
    this.registeredPotholes = [];

    // () => boolean, from the taxi (L key)
    this.getHeadlightsEnabled = getHeadlightsEnabled;
    this.headlightsOffTime = 0;

    // The same array main.js hands to VehicleController; it
    // box-tests every entry each frame, so pushing a mesh here
    // makes it block the taxi like a building.
    this.collidables = collidables;
    this.registered = [];

    // MaterialLibrary handed to the environment factories. Without
    // it no environment is built (headless tests of the rules).
    this.materials = materials;
    this.environment = null;
    this.roadworks = null;

    this.scene = scene;
    this.vehicle = vehicle;
    this.taxi = taxi;
    this.onDelivered = onDelivered;
    this.onCaptured = onCaptured;

    // ({ delta, reason: 'beaten' | 'firstOut' | 'pedestrian', points })
    // for the HUD's pop-ups
    this.onScore = onScore;

    // ({ x, z }) when the taxi has knocked a pedestrian down: the place for
    // the sound cue (the score pop-up comes through onScore)
    this.onPedestrianHit = onPedestrianHit;

    this.levelId = null;
    this.config = null;

    // 'none' | 'driving' | 'delivered' | 'captured'
    this.status = 'none';

    this.elapsed = 0;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // Not a collidable: capture is distance based
    this.pursuit = new PursuitSystem({
      parent: this.group,
      taxi,
      vehicle,
      headlightsOn: () => this.headlightsOn(),
      getElevation: (x, z) => this.getElevationAt(x, z)
    });

    // Collidable cars: they register through registerCollidable(),
    // so clearMarkers() unregisters them like the flyover pillars
    this.traffic = new TrafficSystem({
      parent: this.group,
      registerCollidable: mesh => this.registerCollidable(mesh),
      setCollidableActive: (mesh, active) =>
        this.setCollidableActive(mesh, active),
      taxi: this.taxi,
      taxiCollisionBox: this.vehicle.localTaxiCollisionBox ?? null
    });

    // The Level 1 rival taxis: solid obstacles through the same
    // registerCollidable / setCollidableActive as the traffic
    this.rivals = new RivalTaxiSystem({
      parent: this.group,
      registerCollidable: mesh => this.registerCollidable(mesh),
      setCollidableActive: (mesh, active) =>
        this.setCollidableActive(mesh, active),
      onBeaten: () => this.rivalBeaten()
    });

    // The rank race. phase: 'none' (a level without one) | 'countdown' |
    // 'racing' | 'cbd' | 'chase'; countdown in seconds left
    this.race = { active: false, phase: 'none', countdown: 0 };

    this.score = {
      points: 0,
      beaten: 0,
      firstOut: null,       // null | 'player' | 'rival': first car over the exit line
      pedestriansHit: 0
    };

    this.exitCrossed = false;
    this.rivalsReleased = false;

    this.zoneMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xffcf4a,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false
      });

    // Near-black, like the road potholes in main.js: only the
    // headlight beam picks it out at night.
    this.hazardMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.95
      });

    this.concreteMaterial =
      new THREE.MeshStandardMaterial({
        color: 0x8d9096,
        roughness: 0.9
      });

    this.beamMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xffcf4a,
        transparent: true,
        opacity: MARKER_OPACITY.beam,
        depthWrite: false
      });

    // Created once like the others (clearMarkers() only disposes
    // geometry, so a per-load material would leak)
    this.rankMaterial =
      new THREE.MeshBasicMaterial({
        color: 0xe1b300,
        transparent: true,
        opacity: MARKER_OPACITY.rank
      });
  }


  // --------------------------------------------------
  // Load / reset
  // --------------------------------------------------

  // Returns false when the level has no definition yet
  // (none today), leaving the free-roam road as is.
  load(levelId) {

    this.clearMarkers();

    this.levelId = levelId;
    this.config = LEVELS[levelId] ?? null;

    this.buildEnvironment(levelId);

    if (!this.config) {
      this.status = 'none';
      this.vehicle.setGroundHeightProvider(null);
      return false;
    }

    this.warnIfRouteOutOfBounds();

    this.vehicle.setBounds(this.config.boundaries);

    // R respawns at this level's spawn too
    this.vehicle.setSpawn(this.config.spawn);

    this.vehicle.setGroundHeightProvider(
      this.config.elevated?.length
        ? (x, z, baseHeight) =>
            this.getGroundHeight(x, z, baseHeight)
        : null
    );

    // --------------------------------------------------
// Register level-specific speed bumps
// --------------------------------------------------

if (
  typeof this.vehicle.setLevelSpeedBumps === 'function'
) {
  this.vehicle.setLevelSpeedBumps(
    this.config.speedBumps ?? []
  );
}



    this.buildMarkers();
    this.buildElevated();
    this.buildHazards();
    // Optional highway roadworks.
    if (ENABLE_LEVEL2_ROADWORKS && levelId === 2) {
      this.roadworks = buildHighwayRoadworks({
       parent: this.group,
       registerCollidable: mesh => this.registerCollidable(mesh)
    });
    }
    this.pursuit.configure(this.config);
    this.traffic.configure(this.config);
    this.configureRivals();
    this.reset();

    return true;
  }


  // The rival grid of a level that has a race (none otherwise)
  configureRivals() {

    const { race, road } = this.config;

    if (!race) {
      this.rivals.dispose();
      return;
    }

    this.rivals.configure({
      rivals: race.grid,
      road: {
        halfWidth: race.road.halfWidth,
        zMin: road.zMin,
        zMax: road.zMax
      },
      direction: -1
    });
  }


  // Dev aid: a route that leaves the vehicle clamp can never be
  // driven, so say so instead of failing silently.
  warnIfRouteOutOfBounds() {

    const { boundaries } = this.config;

    const points = [
      this.config.spawn,
      this.config.destination,
      ...(this.config.route ?? []),
      ...(this.config.routes ?? []).flatMap(r => r.waypoints)
    ];

    for (const p of points) {
      if (
        p.x < boundaries.minX || p.x > boundaries.maxX ||
        p.z < boundaries.minZ || p.z > boundaries.maxZ
      ) {
        console.warn(
          `Level ${this.levelId}: point (${p.x}, ${p.z}) ` +
          'is outside the vehicle bounds'
        );
      }
    }
  }


  // Puts the taxi back on the level's spawn point.
  reset() {

    this.elapsed = 0;
    this.headlightsOffTime = 0;

    if (!this.config) {
      this.status = 'none';
      return;
    }

    this.status = 'driving';

    this.vehicle.reset(this.config.spawn);
    this.pursuit.reset();
    this.traffic.reset();
    this.roadworks?.reset();

    this.resetRace();

    // everyone knocked down is back on their feet
    this.environment?.pedestrians?.reset();

    this.setZoneDelivered(false);
  }


  // The taxi has knocked a pedestrian down (the environment's pedestrian
  // field calls this once per hit): the speed loss, the points (Level 1)
  // and the callback. Not the police's business.
  pedestrianHit(x, z) {

    this.vehicle.applyHit?.(PEDESTRIAN_HIT);

    this.registerPedestrianHit();

    this.onPedestrianHit?.({ x, z });
  }


  // --------------------------------------------------
  // The rank race (Level 1)
  // --------------------------------------------------

  resetRace() {

    const { race } = this.config;

    this.score.points = 0;
    this.score.beaten = 0;
    this.score.firstOut = null;
    this.score.pedestriansHit = 0;

    this.exitCrossed = false;
    this.rivalsReleased = false;

    this.race.active = Boolean(race);
    this.race.phase = race ? 'countdown' : 'none';
    this.race.countdown = race ? race.countdown : 0;

    if (race) {
      this.rivals.reset();
      this.applyHeadStart();
    }
  }


  // True while the countdown holds the taxi: main.js passes the vehicle
  // no keys then (it stays enabled, so its physics keeps settling)
  get inputLocked() {
    return this.race.active && this.race.phase === 'countdown';
  }


  // Ends the countdown now (tests; the game lets it run)
  skipCountdown() {

    if (this.race.active && this.race.phase === 'countdown') {
      this.race.countdown = 0;
      this.startRace();
    }
  }


  startRace() {

    this.race.phase = 'racing';
    this.race.countdown = 0;
    this.rivals.launch();
  }


  award(delta, reason) {

    this.score.points += delta;

    this.onScore?.({
      delta,
      reason,
      points: this.score.points
    });
  }


  // Called by the rival system, once for each rival, when the taxi has
  // got ahead of it
  rivalBeaten() {

    this.score.beaten++;
    this.award(this.config.race.points.beaten, 'beaten');
  }


  // Hook for the pedestrian hits (not implemented yet): -50 each
  registerPedestrianHit() {

    if (!this.race.active || this.status !== 'driving') {
      return;
    }

    this.score.pedestriansHit++;
    this.award(this.config.race.points.pedestrian, 'pedestrian');
  }


  // The police head start for the rivals beaten so far. Written every
  // frame until the pursuer spawns, so it is the count at that moment.
  applyHeadStart() {

    const { race } = this.config;
    const config = this.pursuit.config;

    if (!race || !config || this.pursuit.spawned) {
      return;
    }

    const { base, perRival, max } = race.headStart;

    config.spawnDistance =
      Math.min(max, base + perRival * this.score.beaten);
  }


  updateCountdown(dt) {

    this.race.countdown -= dt;

    if (this.race.countdown <= 0) {
      this.startRace();
    }
  }


  // Per frame while racing: rivals, the exit line, releasing the rivals
  updateRace(dt) {

    const { race } = this.config;

    if (!race || !this.race.active) {
      return;
    }

    const taxiZ = this.taxi.position.z;

    this.rivals.update(dt, this.taxi.position);

    // The first car over the exit line. Rivals are checked first, so a
    // tie in one frame goes to them.
    if (this.score.firstOut === null) {

      const rivals = this.rivals.rivals;

      for (let i = 0; i < rivals.length; i++) {
        if (rivals[i].z <= race.exitZ) {
          this.score.firstOut = 'rival';
          break;
        }
      }
    }

    if (!this.exitCrossed && taxiZ <= race.exitZ) {

      this.exitCrossed = true;

      if (this.score.firstOut === null) {
        this.score.firstOut = 'player';
        this.award(race.points.firstOut, 'firstOut');
      }
    }

    if (!this.rivalsReleased && taxiZ <= race.release.z) {
      this.releaseRivals(taxiZ);
    }

    this.race.phase =
      this.pursuit.spawned
        ? 'chase'
        : this.exitCrossed
          ? 'cbd'
          : 'racing';
  }


  // Past the release line a rival goes once it is gap m behind the taxi
  // (so nobody vanishes in view ahead); past allZ, all of them go
  releaseRivals(taxiZ) {

    const { release } = this.config.race;
    const rivals = this.rivals.rivals;
    const all = taxiZ <= release.allZ;
    let remaining = 0;

    for (let i = 0; i < rivals.length; i++) {

      const rival = rivals[i];

      if (rival.released) {
        continue;
      }

      if (all || rival.z - taxiZ >= release.gap) {
        this.rivals.release(rival.index);
      } else {
        remaining++;
      }
    }

    this.rivalsReleased = remaining === 0;
  }


  // --------------------------------------------------
  // Per-frame
  // --------------------------------------------------

  update(dt, time = 0) {

    if (this.status !== 'driving') {
      return;
    }

    // The countdown holds everything: the clock, traffic and pursuit
    if (this.inputLocked) {
      this.updateCountdown(dt);
      return;
    }

    this.elapsed += dt;

    if (!this.headlightsOn()) {
      this.headlightsOffTime += dt;
    }

    // Gentle pulse so the zone reads from a distance
    this.zoneMaterial.opacity =
      (
        MARKER_OPACITY.zonePulseBase +
        Math.sin(time * 4) * MARKER_OPACITY.zonePulseSwing
      ) * this.getMarkerBrightness();

    this.traffic.update(dt);

    this.updateRace(dt);

    // Levels without pedestrians (2 and 3 so far) have no field
    this.environment?.pedestrians?.update(
      dt,
      this.taxi,
      this.vehicle.getSpeed()
    );

    if (this.isInDeliveryZone()) {
      this.deliver();
      return;
    }

    this.applyHeadStart();
    this.pursuit.update(dt);

    if (this.pursuit.captured) {
      this.capture();
    }
  }


  // --------------------------------------------------
  // Elevation (ramps / flyovers)
  // --------------------------------------------------

  // Height of one elevated section at z (0 outside it).
  static elevationProfile(section, z) {

    const { height, rampLength, zEntry, zExit } = section;

    const travelled = zEntry - z;
    const total = zEntry - zExit;

    if (travelled <= 0 || travelled >= total) {
      return 0;
    }

    if (travelled < rampLength) {
      return height * (travelled / rampLength);
    }

    if (travelled > total - rampLength) {
      return height * ((total - travelled) / rampLength);
    }

    return height;
  }


  // Deck / ramp surface height at (x, z) for the current level:
  // 0 off the elevated sections. Pure (reads only the level config,
  // no taxi state), so the pursuer can use it as its own elevation
  // function. The taxi-only "must already be up" lift rule is
  // applied by the callers (getGroundHeight, PursuitSystem).
  getElevationAt(x, z) {

    let h = 0;

    for (const s of this.config?.elevated ?? []) {

      if (x < s.xMin || x > s.xMax) {
        continue;
      }

      h = Math.max(h, LevelManager.elevationProfile(s, z));
    }

    return h;
  }


  // Ground-height provider for vehicle.setGroundHeightProvider().
  // Returns the full height: the vehicle's own bump/pothole
  // height (baseHeight) plus any flyover lift at (x, z).
  getGroundHeight(x, z, baseHeight) {

    let lift = 0;

    for (const s of this.config?.elevated ?? []) {

      if (x < s.xMin || x > s.xMax) {
        continue;
      }

      const h = LevelManager.elevationProfile(s, z);

      // Lift only from the ramp toe, or when already up on the
      // section. Anything else (e.g. the ground beneath the
      // deck) gets no lift; sideways entry past the toe is
      // stopped by the solid rails, not handled here.
      if (
        h > 0 &&
        (
          h <= ELEVATION_ENTRY_MAX ||
          this.taxi.position.y >= h - ELEVATION_ENTRY_TOLERANCE
        )
      ) {
        lift = Math.max(lift, h);
      }
    }

    // On the flyover the surface is the deck, so the ground's
    // own bump/pothole dips (baseHeight) do not apply to it.
    return lift > 0 ? lift : baseHeight;
  }


  isInDeliveryZone() {

    const { destination } = this.config;

    const dx = this.taxi.position.x - destination.x;
    const dz = this.taxi.position.z - destination.z;

    return (
      Math.hypot(dx, dz) <= destination.radius &&
      Math.abs(this.vehicle.getSpeed()) <=
        destination.maxDeliverSpeed
    );
  }


  deliver() {

    this.status = 'delivered';

    this.setZoneDelivered(true);

    if (this.onDelivered) {
      this.onDelivered({
        level: this.levelId,
        time: this.elapsed,
        cargo: this.vehicle.cargoSystem.getState()
      });
    }
  }


  // Fires once: update() stops running once status leaves
  // 'driving'.
  capture() {

    this.status = 'captured';

    if (this.onCaptured) {
      this.onCaptured({
        level: this.levelId,
        time: this.elapsed,
        cargo: this.vehicle.cargoSystem.getState()
      });
    }
  }


  // --------------------------------------------------
  // State for HUD
  // --------------------------------------------------

  getState() {

    if (!this.config) {
      return {
        level: this.levelId,
        status: 'none'
      };
    }

    const { destination } = this.config;

    return {
      level: this.levelId,
      name: this.config.name,
      status: this.status,
      time: this.elapsed,

      // Read-only pass-through of the vehicle's own tracking
      // (CargoSystem consumes it there, not here).
      speed: Math.abs(this.vehicle.getSpeed()),
      highSpeedTime: this.vehicle.getHighSpeedTime(),
      highSpeedPressure: this.vehicle.getLevel2Pressure(),
      elevation: this.taxi.position.y,

      // Level 3 tradeoff: dark = hazards hidden, and also
      // harder for the pursuer to spot.
      headlightsOn: this.headlightsOn(),
      headlightsOffTime: this.headlightsOffTime,

      // { state, distance (null while no pursuer is out),
      //   pressure 0-1 }
      pursuit: this.pursuit.getState(),

      // The rank race (null score and phase 'none' on the other levels)
      score: this.race.active
        ? {
            points: this.score.points,
            beaten: this.score.beaten,
            rivalsTotal: this.rivals.rivals.length,
            firstOut: this.score.firstOut,
            pedestriansHit: this.score.pedestriansHit
          }
        : null,

      race: {
        phase: this.race.phase,
        countdown: Math.max(0, this.race.countdown)
      },

      distanceToDestination:
        Math.hypot(
          this.taxi.position.x - destination.x,
          this.taxi.position.z - destination.z
        )
    };
  }


  // --------------------------------------------------
  // Markers
  // --------------------------------------------------

  // This level's markerBrightness, clamped to 0..1
  getMarkerBrightness() {

    const value = this.config?.markerBrightness ?? 1;

    return Math.min(1, Math.max(0, value));
  }


  buildMarkers() {

    const { spawn, destination } = this.config;

    const brightness = this.getMarkerBrightness();

    this.rankMaterial.opacity =
      MARKER_OPACITY.rank * brightness;

    this.zoneMaterial.opacity =
      MARKER_OPACITY.zone * brightness;

    this.beamMaterial.opacity =
      MARKER_OPACITY.beam *
      (
        BEAM_BRIGHTNESS_FLOOR +
        (1 - BEAM_BRIGHTNESS_FLOOR) * brightness
      );

    // Taxi rank bay (not on Level 1, where the spawn is in the rival grid)
    if (this.config.spawnBay !== false) {

      const rank = new THREE.Mesh(
        new THREE.PlaneGeometry(6, 9),
        this.rankMaterial
      );

      rank.rotation.x = -Math.PI / 2;
      rank.position.set(spawn.x, 0.03, spawn.z);
      this.group.add(rank);
    }

    // Destination ring + light beam
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(
        destination.radius - 1.2,
        destination.radius,
        48
      ),
      this.zoneMaterial
    );

    ring.rotation.x = -Math.PI / 2;
    ring.position.set(destination.x, 0.05, destination.z);
    this.group.add(ring);

    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(
        destination.radius - 1.2,
        destination.radius - 1.2,
        30,
        32,
        1,
        true
      ),
      this.beamMaterial
    );

    beam.position.set(destination.x, 15, destination.z);
    this.group.add(beam);
  }


  // Ramps, deck, rails and pillars for each elevated section.
  // Meshes are added flat to the group so clearMarkers() can
  // dispose them.
  buildElevated() {

    for (const s of this.config.elevated ?? []) {

      const width = s.xMax - s.xMin;
      const cx = (s.xMin + s.xMax) / 2;
      const thickness = s.deckThickness;
      const L = s.rampLength;
      const H = s.height;
      const total = s.zEntry - s.zExit;
      const deckLength = total - 2 * L;
      const slope = Math.atan2(H, L);
      const slopeLength = Math.hypot(L, H);

      const add = (w, h, d, x, y, z, rotX = 0) => {

        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          this.concreteMaterial
        );

        mesh.position.set(x, y, z);
        mesh.rotation.x = rotX;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.group.add(mesh);

        return mesh;
      };

      // Ramp up (rises towards -Z), deck, ramp down
      add(width, thickness, slopeLength,
        cx, H / 2 - thickness / 2, s.zEntry - L / 2, slope);

      add(width, thickness, deckLength,
        cx, H - thickness / 2, (s.zEntry + s.zExit) / 2);

      add(width, thickness, slopeLength,
        cx, H / 2 - thickness / 2, s.zExit + L / 2, -slope);

      // Rails run the full length of ramp + deck on both sides,
      // and are solid (see registerCollidable). That is what
      // keeps the taxi on the structure: without them the only
      // lift rule (ramp toe / already up) lets a sideways
      // entry pass through the ramp unlifted, and lets the
      // taxi drive off the edge and fall.
      for (const x of [s.xMin + 0.12, s.xMax - 0.12]) {

        this.registerCollidable(add(0.25, 0.9, slopeLength,
          x, H / 2 + 0.45, s.zEntry - L / 2, slope));

        this.registerCollidable(add(0.25, 0.9, deckLength,
          x, H + 0.45, (s.zEntry + s.zExit) / 2));

        this.registerCollidable(add(0.25, 0.9, slopeLength,
          x, H / 2 + 0.45, s.zExit + L / 2, -slope));
      }

      // Pillars under the deck
      for (
        let z = s.zEntry - L;
        z >= s.zExit + L;
        z -= 20
      ) {
        const pillar =
          add(1, H - thickness, 1, cx, (H - thickness) / 2, z);

        // Only the pillars block. Ramps/deck/rails are driven
        // on, and the pillar tops (H - thickness) sit below the
        // taxi while it is on the deck, so it passes over them.
        this.registerCollidable(pillar);
      }
    }
  }


  // Defaults to true when no headlight source was given.
  headlightsOn() {
    return this.getHeadlightsEnabled
      ? Boolean(this.getHeadlightsEnabled())
      : true;
  }


  // Hidden hazards: a dark disc for the eye plus a real entry
  // in the vehicle's pothole list for the physics.
  buildHazards() {

    for (const h of this.config.hazards ?? []) {

      if (h.type !== 'pothole') {
        continue;
      }

      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(h.radius, 40),
        this.hazardMaterial
      );

      disc.rotation.x = -Math.PI / 2;
      disc.position.set(h.x, 0.02, h.z);
      disc.receiveShadow = true;
      this.group.add(disc);

      if (this.potholes) {
        const entry = {
          x: h.x,
          z: h.z,
          radius: h.radius,
          depth: h.depth
        };

        this.potholes.push(entry);
        this.registeredPotholes.push(entry);
      }
    }
  }


  setZoneDelivered(delivered) {

    const color = delivered ? 0x3ddc84 : 0xffcf4a;

    this.zoneMaterial.color.setHex(color);
    this.beamMaterial.color.setHex(color);
  }


  registerCollidable(mesh) {

    if (!this.collidables) {
      return;
    }

    this.collidables.push(mesh);
    this.registered.push(mesh);
  }


  // Takes an already registered mesh out of / back into the shared
  // collidables (a ghost car). It stays in `registered`, so
  // clearMarkers() still cleans up whichever state it is in.
  setCollidableActive(mesh, active) {

    if (!this.collidables) {
      return;
    }

    const i = this.collidables.indexOf(mesh);

    if (active && i === -1) {
      this.collidables.push(mesh);
    }
    else if (!active && i !== -1) {

      // In place and without splice(), which allocates its result:
      // this runs on the per-frame path
      const list = this.collidables;

      for (let k = i; k < list.length - 1; k++) {
        list[k] = list[k + 1];
      }

      list.length--;
    }
  }


  // The level's world (ground, road, buildings, lights...). Its
  // collidables go through registerCollidable(), so clearMarkers()
  // unregisters them like the flyover pillars.
  buildEnvironment(levelId) {

    if (!this.materials) {
      return;
    }

    this.environment = buildEnvironment(
      levelId,
      {
        materials: this.materials,

        // the runners (Levels 1 and 3) and the route they aim at
        runners: this.config?.runners,
        route: this.config?.route
      }
    );

    this.scene.add(this.environment.group);

    for (const mesh of this.environment.collidables) {
      this.registerCollidable(mesh);
    }

    // The pedestrian hit test, if the level has people on foot
    const pedestrians = this.environment.pedestrians;

    if (pedestrians) {

      const box = this.vehicle.localTaxiCollisionBox;

      if (box) {
        pedestrians.halfX = (box.max.x - box.min.x) / 2;
        pedestrians.halfZ = (box.max.z - box.min.z) / 2;
      }

      pedestrians.onHit = (x, z) => this.pedestrianHit(x, z);
    }
  }


  // Frees the previous level's geometries, materials and cloned
  // textures (never the MaterialLibrary's base textures).
  disposeEnvironment() {

    this.environment?.dispose();
    this.environment = null;
  }


  clearMarkers() {
    
    // Remove roadwork meshes and free their resources.
     this.roadworks?.dispose();
     this.roadworks = null;
    this.disposeEnvironment();

    // Unregister in place: the vehicle holds this array
    if (this.collidables) {
      for (const mesh of this.registered) {
        const i = this.collidables.indexOf(mesh);

        if (i !== -1) {
          this.collidables.splice(i, 1);
        }
      }
    }

    this.registered = [];

    if (this.potholes) {
      for (const entry of this.registeredPotholes) {
        const i = this.potholes.indexOf(entry);

        if (i !== -1) {
          this.potholes.splice(i, 1);
        }
      }
    }

    this.registeredPotholes = [];

    // Removes the pursuer mesh and disposes its geometry/materials
    this.pursuit.dispose();

    // Removes the cars (their collidable entries went above) and
    // disposes their shared geometry and materials
    this.traffic.dispose();

    // Removes the rivals (their collidable entries went above too)
    this.rivals.dispose();

    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
    }
  }
}
