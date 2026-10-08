import * as THREE from 'three';

// ==================================================
// PURSUIT SYSTEM
// --------------------------------------------------
// One pursuer car that chases the taxi. Owned and
// updated by LevelManager; the per-level numbers live in
// LEVELS[n].pursuit (see LevelManager.js).
//
// States:
//   idle       - not chasing yet (trigger not reached, start
//                delay running, or taxi not detected)
//   chasing    - heads for the taxi; if it stays out of sight
//                for loseTime it is lost
//   lost       - stops briefly, confused
//   searching  - drives to the last place the taxi was seen and
//                waits there; re-detecting the taxi -> chasing
//
// Capture is distance based (pursuer within captureDistance
// of the taxi for captureTime in a row). The pursuer is never
// registered as a collidable, or the taxi would bounce off it.
// ==================================================

// Shared tuning (not level specific)
const ROAD_HALF_WIDTH = 9;
const BOUNDS_MARGIN = 5;

const TURN_RATE = 2.6;          // rad/s
const ACCELERATION = 24;        // m/s^2
const BRAKING = 24;             // m/s^2
const ARRIVE_GAIN = 2;          // desired speed = distance * this
const ARRIVE_RADIUS = 2.5;      // "reached" the last known position
const LOST_PAUSE_TIME = 1.5;    // seconds sitting still in 'lost'
const SHARP_TURN_ANGLE = 1;     // rad; slow down beyond this
const SHARP_TURN_SPEED_SCALE = 0.6;
const PRESSURE_RANGE = 60;      // distance at which pressure hits 0
export const ELEVATED_Y = 1;    // taxi above this is "on the flyover"
const LIGHT_FLASH_RATE = 3;     // Hz: red/blue cycles per second
const LIGHT_BAR_ON = 2.5;       // lens emissiveIntensity when lit

// Following distances (centre to centre) behind the taxi.
//   CRUISE_GAP   - held at ANY taxi speed while the taxi is going
//                  well: just outside the 7 m capture range, and
//                  visible between the chase camera (10.5 m back)
//                  and the taxi.
//   STANDOFF     - held while the taxi is "slowed" (below
//                  SLOW_SPEED_THRESHOLD, or a stumble within the
//                  last STUMBLE_SURGE_TIME). Must stay below
//                  captureDistance, or it could never count as
//                  "in capture range".
// MIN_SEPARATION is the hard floor: the pursuer is pushed back out
// to it if the taxi brakes hard.
export const CRUISE_GAP = 8.5;
export const STANDOFF_DISTANCE = 6.0;
export const MIN_SEPARATION = 5.5;
const STANDOFF_MARGIN = 0.25;   // standoff <= captureDistance - this

// Chase behaviour (all overridable per level in LEVELS[n].pursuit)
export const SLOW_SPEED_THRESHOLD = 12;  // m/s; taxi below this is "slowed"
export const STUMBLE_SPEED_DROP = 8;     // m/s lost within STUMBLE_WINDOW
export const STUMBLE_WINDOW = 0.4;       // s
export const STUMBLE_SURGE_TIME = 2;     // s a stumble keeps the gap tight
const CLOSING_GAIN = 3;                  // (m/s) of speed per metre of gap error
const SPEED_SAMPLES = 128;               // ring buffer; covers 0.4 s up to 300 fps

// Hunger (overridable per level; see DEFAULT_CONFIG).
//   Pressure 0..1 sets the gap: desiredGap = lerp(cruise, standoff,
//   pressure). It rises while the taxi is slower than
//   PRESSURE_SPEED_FRACTION of its top speed (faster the further
//   below), falls when it is at or above, and is pinned at 1 by a
//   stumble or a slowed taxi.
export const PRESSURE_SPEED_FRACTION = 0.9;
export const PRESSURE_RISE_RATE = 0.5;       // per second, at a standstill
export const PRESSURE_FALL_RATE = 0.6;       // per second

//   Pounce: more than POUNCE_GAP_EXCESS above the desired gap it runs
//   at full chase speed. It only brakes in the last
//   PRE_CONTACT_BRAKE_DISTANCE, with a harsh PRE_CONTACT_BRAKING
//   limit, then matches the taxi's speed. Within GAP_DEADBAND of the
//   desired gap it just matches speed (no hunting against
//   MIN_SEPARATION).
export const POUNCE_GAP_EXCESS = 1.0;        // m
export const PRE_CONTACT_BRAKE_DISTANCE = 2; // m
export const PRE_CONTACT_BRAKING = 40;       // m/s^2
export const GAP_DEADBAND = 0.15;            // m

//   Breathing: the cruise gap (only) swells by +-GAP_BREATH_AMPLITUDE
//   at GAP_BREATH_RATE, so it nips at the taxi but stays outside
//   capture range at cruise (CRUISE_GAP - amplitude > captureDistance).
export const GAP_BREATH_AMPLITUDE = 0.6;     // m
export const GAP_BREATH_RATE = 0.8;          // Hz

// Flyover following. Pursuer and taxi are "on the same level" within
// SAME_LEVEL_TOLERANCE of height (capture needs that). On a ramp
// slope the pursuer is RAMP_SPEED_FACTOR as fast, so the flyover
// keeps a slight edge. The deck lift rule is the taxi's: lifted only
// from the ramp toe (h <= ELEVATION_ENTRY_MAX) or when already up
// (within ELEVATION_ENTRY_TOLERANCE of the surface).
export const RAMP_SPEED_FACTOR = 0.9;
export const SAME_LEVEL_TOLERANCE = 1.0;     // m
export const ELEVATION_ENTRY_MAX = 0.3;
export const ELEVATION_ENTRY_TOLERANCE = 0.6;
// Centre-to-rail clamp on a section: rail inner face (rail centre
// 0.12 in from the edge, 0.25 wide) + the taxi's collision half
// width of 1.35 (VehicleController.localTaxiCollisionBox).
export const RAIL_CLAMP_MARGIN = 0.245 + 1.35;
const BOARDING_APPROACH = 40;  // taxi this close before a toe opens the lane
const TOE_LEAD = 6;            // run for a point this far before the toe...
const TOE_SWITCH = 2;          // ...until within this of it, then follow the taxi
const LANE_RETURN_SPEED = 8;   // m/s: eases back into the lane off a section
const PITCH_RATE = 8;          // 1/s: smoothing of the ramp pitch

const DEFAULT_CONFIG = {

  // 'trigger': appears behind the taxi once it has covered
  //            triggerProgress of the spawn -> destination run.
  // 'immediate': parked behind the spawn from the start, wakes
  //            after startDelay and chases once it detects the taxi.
  mode: 'immediate',
  triggerProgress: 0.66,
  spawnDistance: 30,        // behind the taxi / the spawn point
  startDelay: 3,

  // Fraction of vehicle.settings.maxForwardSpeed
  speedFraction: 0.85,

  detectionRadius: 60,
  detectionRadiusDark: null,   // lights off; null = same as lit
  loseRange: 100,
  loseRangeDark: null,
  loseTime: 4,

  captureDistance: 4,
  captureTime: 1.5,

  cruiseGap: CRUISE_GAP,
  standoffDistance: STANDOFF_DISTANCE,
  slowSpeedThreshold: SLOW_SPEED_THRESHOLD,
  stumbleSpeedDrop: STUMBLE_SPEED_DROP,
  stumbleWindow: STUMBLE_WINDOW,
  stumbleSurgeTime: STUMBLE_SURGE_TIME,
  closingGain: CLOSING_GAIN,

  // Catch-up: further behind than catchUpDistance the speed cap is
  // scaled up, reaching catchUpMultiplier at twice that distance and
  // easing back to 1.0 at catchUpDistance. Close in it is never
  // faster than speedFraction.
  catchUpDistance: 25,
  catchUpMultiplier: 1.15,

  // Hunger (see the constants above)
  pressureSpeedFraction: PRESSURE_SPEED_FRACTION,
  pressureRiseRate: PRESSURE_RISE_RATE,
  pressureFallRate: PRESSURE_FALL_RATE,
  pounceGapExcess: POUNCE_GAP_EXCESS,
  preContactBrakeDistance: PRE_CONTACT_BRAKE_DISTANCE,
  preContactBraking: PRE_CONTACT_BRAKING,
  gapDeadband: GAP_DEADBAND,
  gapBreathAmplitude: GAP_BREATH_AMPLITUDE,
  gapBreathRate: GAP_BREATH_RATE,
  rampSpeedFactor: RAMP_SPEED_FACTOR,

  // Legacy option: the taxi on the flyover is out of sight and out of
  // reach (no level uses it now; Level 2 follows onto the flyover).
  ignoreElevated: false,
  lane: null                   // { minX, maxX } or null = road
};


// Stylised SAPS bakkie (Isuzu D-Max style double cab with a short
// canopy). Code-built only: no external models or images.
// Faces -Z at rotation.y = 0, ~2.0 m wide, 5.3 m long, 1.85 m tall.
//
// The body is ONE side-profile shape extruded across the width with
// a small bevel. Profile coordinates are (u, y): u metres back from
// the front (world z = u - 2.65), y metres up. Roughly: bonnet top
// 1.05 over the first 1.3 m, windscreen rising to the 1.75 m cab
// roof by 2.4 m, flat roof to 3.7 m, canopy to 5.1 m at 1.7 m high
// with a rounded rear edge, and a small rear step. The bevel adds
// BEVEL_SIZE all round, so the profile is that much inside.
// Returns a THREE.Object3D carrying userData.flash(on) for the roof
// light bar. Everything it creates (geometries, materials and the
// lettering texture) is released by disposeObject().
export function createPursuerMesh() {

  const root = new THREE.Group();

  const material = (color, roughness = 0.6, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, ...extra });

  // Flat overlays sit a few mm off the body: polygonOffset keeps
  // them from z-fighting at chase-camera distance
  const overlay = (color, roughness = 0.5, metalness = 0) =>
    new THREE.MeshStandardMaterial({
      color, roughness, metalness, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });

  const whiteMaterial = material(0xf1f3f5, 0.45);
  const blueMaterial = overlay(0x0b3d91);
  const yellowMaterial = overlay(0xf2c500);
  const glassMaterial = overlay(0x0d141b, 0.15, 0.3);
  const frameMaterial = overlay(0x050607, 0.8);
  const blackMaterial = material(0x141414, 0.9);
  const darkMaterial = overlay(0x0a0a0a, 1);
  const metalMaterial = material(0x2a2d31, 0.5, { metalness: 0.4 });
  const rimMaterial = material(0x8a9096, 0.5, { metalness: 0.5 });
  const plateMaterial = overlay(0xf4f4ec, 0.6);
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1c0 });
  const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xff9a1a });
  const taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xd01212 });

  // Light bar lenses: flash() only swaps emissiveIntensity
  const redLensMaterial = material(0x7a0a0a, 0.4,
    { emissive: 0xff1a1a, emissiveIntensity: 0 });
  const blueLensMaterial = material(0x0a2a7a, 0.4,
    { emissive: 0x2a5cff, emissiveIntensity: 0 });

  const add = (geometry, mat, x, y, z, name) => {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    if (name) { mesh.name = name; }
    root.add(mesh);
    return mesh;
  };

  const box = (w, h, d, mat, x, y, z, name) =>
    add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, name);

  const flat = (mesh) => { mesh.castShadow = false; return mesh; };

  const FRONT_Z = -2.65;
  const zOf = (u) => u + FRONT_Z;

  // ---- Body: extruded side profile -----------------------------
  const BODY_DEPTH = 1.84;      // + 2 * BEVEL_THICKNESS = 2.0 m
  const BEVEL_THICKNESS = 0.08;
  const BEVEL_SIZE = 0.03;
  const SIDE_X = BODY_DEPTH / 2 + BEVEL_THICKNESS;   // flat side face
  const BOTTOM_Y = 0.55;        // underside: wheels clearly show
  const BONNET_Y = 1.02;
  const ROOF_Y = 1.72;          // cab roof (outer 1.75)
  const CANOPY_Y = 1.67;        // canopy roof (outer 1.70)

  const WHEEL_RADIUS = 0.38;
  const ARCH_RADIUS = 0.46;
  const FRONT_WHEEL_U = 1.05;
  const REAR_WHEEL_U = 4.15;

  const archHalfChord = Math.sqrt(
    ARCH_RADIUS ** 2 - (BOTTOM_Y - WHEEL_RADIUS) ** 2);
  const archAngle = Math.atan2(BOTTOM_Y - WHEEL_RADIUS, archHalfChord);

  const profile = new THREE.Shape();
  profile.moveTo(0.15, BOTTOM_Y);
  profile.lineTo(0.15, 0.9);
  profile.quadraticCurveTo(0.15, BONNET_Y, 0.32, BONNET_Y);   // nose
  profile.lineTo(1.3, BONNET_Y);
  profile.lineTo(2.4, ROOF_Y);                                // windscreen
  profile.lineTo(3.6, ROOF_Y);
  profile.quadraticCurveTo(3.7, ROOF_Y, 3.7, ROOF_Y - 0.1);   // cab rear
  profile.lineTo(3.74, 1.1);
  profile.lineTo(3.8, BONNET_Y);                              // bed gap
  profile.lineTo(3.86, CANOPY_Y - 0.06);
  profile.quadraticCurveTo(3.88, CANOPY_Y, 4.0, CANOPY_Y);    // canopy front
  profile.lineTo(4.95, CANOPY_Y);
  profile.quadraticCurveTo(5.12, CANOPY_Y, 5.12, 1.5);        // rounded rear
  profile.lineTo(5.12, 0.92);
  profile.lineTo(5.22, 0.88);                                 // rear step
  profile.lineTo(5.22, BOTTOM_Y);
  profile.lineTo(REAR_WHEEL_U + archHalfChord, BOTTOM_Y);
  profile.absarc(REAR_WHEEL_U, WHEEL_RADIUS, ARCH_RADIUS,
    archAngle, Math.PI - archAngle, false);
  profile.lineTo(FRONT_WHEEL_U + archHalfChord, BOTTOM_Y);
  profile.absarc(FRONT_WHEEL_U, WHEEL_RADIUS, ARCH_RADIUS,
    archAngle, Math.PI - archAngle, false);
  profile.closePath();

  const bodyGeometry = new THREE.ExtrudeGeometry(profile, {
    depth: BODY_DEPTH,
    curveSegments: 10,
    bevelEnabled: true,
    bevelThickness: BEVEL_THICKNESS,
    bevelSize: BEVEL_SIZE,
    bevelSegments: 2
  });
  // shape x -> world z, extrusion -> -x; centre across the width
  bodyGeometry.rotateY(-Math.PI / 2);
  bodyGeometry.translate(BODY_DEPTH / 2, 0, FRONT_Z);
  add(bodyGeometry, whiteMaterial, 0, 0, 0, 'body');

  // Dark underbody, hides the view through the wheel arches
  box(1.56, 0.3, 4.7, blackMaterial, 0, 0.42, zOf(2.7));

  // ---- Windows (dark insets) -----------------------------------
  const lettering = createLetteringTexture();
  const letteringMaterial = lettering
    ? new THREE.MeshBasicMaterial({
        map: lettering, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
      })
    : null;

  // Polygon given in (u, y), laid on the side face at |x| = off
  const sidePolygon = (points, mat, side, off) => {
    const shape = new THREE.Shape();
    points.forEach(([u, y], i) => {
      const x = side > 0 ? -zOf(u) : zOf(u);
      if (i === 0) { shape.moveTo(x, y); } else { shape.lineTo(x, y); }
    });
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateY(side * Math.PI / 2);
    return flat(add(geometry, mat, side * off, 0, 0));
  };

  const grow = (points, k) => {
    let cu = 0, cy = 0;
    for (const [u, y] of points) { cu += u; cy += y; }
    cu /= points.length; cy /= points.length;
    return points.map(([u, y]) => [cu + (u - cu) * k, cy + (y - cy) * k]);
  };

  const sideWindow = (points, side) => {
    sidePolygon(grow(points, 1.1), frameMaterial, side, SIDE_X + 0.004);
    sidePolygon(points, glassMaterial, side, SIDE_X + 0.007);
  };

  const FRONT_DOOR_WINDOW = [
    [1.9, 1.22], [2.75, 1.22], [2.75, 1.66], [2.42, 1.66], [1.9, 1.33]
  ];
  const REAR_DOOR_WINDOW = [
    [2.87, 1.22], [3.58, 1.22], [3.58, 1.66], [2.87, 1.66]
  ];
  const CANOPY_WINDOW = [
    [4.1, 1.22], [4.78, 1.22], [4.78, 1.52], [4.1, 1.52]
  ];

  const lettersGeometry = new THREE.PlaneGeometry(0.95, 0.19);
  const canopyLettersGeometry = new THREE.PlaneGeometry(0.8, 0.15);

  for (const side of [1, -1]) {
    // Double cab: two windows with a pillar between, and ONE small
    // window on the canopy
    sideWindow(FRONT_DOOR_WINDOW, side);
    sideWindow(REAR_DOOR_WINDOW, side);
    sideWindow(CANOPY_WINDOW, side);

    // Livery: blue band between two yellow ones, along the whole
    // lower body (above the wheel arches)
    const stripe = (y0, y1, mat) => sidePolygon(
      [[0.2, y0], [5.08, y0], [5.08, y1], [0.2, y1]],
      mat, side, SIDE_X + 0.004);

    stripe(0.875, 0.905, yellowMaterial);
    stripe(0.905, 0.99, blueMaterial);
    stripe(0.99, 1.02, yellowMaterial);

    // Door lines and handles
    for (const u of [1.85, 2.8, 3.66]) {
      flat(box(0.012, 0.66, 0.012, frameMaterial,
        side * (SIDE_X + 0.006), 0.88, zOf(u)));
    }
    for (const u of [2.58, 3.44]) {
      flat(box(0.02, 0.05, 0.16, metalMaterial,
        side * (SIDE_X + 0.012), 1.07, zOf(u)));
    }

    // POLICE on the door
    if (letteringMaterial) {
      const m = flat(add(lettersGeometry, letteringMaterial,
        side * (SIDE_X + 0.012), 0.7, zOf(2.32)));
      m.rotation.y = side * Math.PI / 2;
    }

    // Wing mirror
    box(0.09, 0.15, 0.2, metalMaterial, side * (SIDE_X + 0.03), 1.34,
      zOf(2.0));
  }

  // Windscreen: a plane lying on the slope, on a dark frame
  const run = 2.4 - 1.3;
  const rise = ROOF_Y - BONNET_Y;
  const slopeLength = Math.hypot(rise, run);
  const normalY = run / slopeLength;       // outward normal: up and forward
  const normalZ = -rise / slopeLength;
  const slopeOffset = BEVEL_SIZE + 0.006;
  const slopeMidY = (BONNET_Y + ROOF_Y) / 2 + normalY * slopeOffset;
  const slopeMidZ = zOf((1.3 + 2.4) / 2) + normalZ * slopeOffset;

  const windscreenFrame = add(
    new THREE.PlaneGeometry(1.7, slopeLength * 0.86),
    frameMaterial, 0, slopeMidY, slopeMidZ);
  const windscreen = add(
    new THREE.PlaneGeometry(1.58, slopeLength * 0.74),
    glassMaterial,
    0,
    slopeMidY + normalY * 0.004,
    slopeMidZ + normalZ * 0.004
  );
  for (const m of [windscreenFrame, windscreen]) {
    m.rotation.x = Math.atan2(-normalY, normalZ);
    flat(m);
  }

  // ---- Front: grille, headlights, bull bar, bumper --------------
  const frontZ = zOf(0.15 - BEVEL_SIZE);       // front face of the body

  box(0.84, 0.17, 0.03, blackMaterial, 0, 0.82, frontZ - 0.005);
  for (const y of [0.77, 0.82, 0.87]) {
    box(0.8, 0.012, 0.012, rimMaterial, 0, y, frontZ - 0.024);
  }

  for (const x of [-0.7, 0.7]) {
    add(new THREE.BoxGeometry(0.42, 0.16, 0.04), headlightMaterial,
      x, 0.88, frontZ - 0.004, 'headlight');
    box(0.14, 0.05, 0.03, indicatorMaterial, x * 1.27, 0.72, frontZ - 0.004);
  }

  box(1.98, 0.22, 0.14, metalMaterial, 0, 0.6, zOf(0.13));     // bumper

  // Bull bar: two uprights, a top hoop and a lower rail
  const tube = (length, x, y, z, horizontal) => {
    const g = new THREE.CylinderGeometry(0.022, 0.022, length, 8);
    if (horizontal) { g.rotateZ(Math.PI / 2); }
    return add(g, metalMaterial, x, y, z);
  };

  const BAR_Z = zOf(0.04);

  for (const x of [-0.44, 0.44]) {
    tube(0.5, x, 0.76, BAR_Z, false);
  }
  tube(0.9, 0, 1.0, BAR_Z, true);
  tube(1.0, 0, 0.58, BAR_Z, true);

  // ---- Rear: bumper, number plate, tail-lights, canopy door -----
  const rearFaceZ = zOf(5.12 + BEVEL_SIZE);     // canopy rear face
  const stepZ = zOf(5.22 + BEVEL_SIZE);         // rear step face

  box(1.96, 0.2, 0.12, metalMaterial, 0, 0.6, zOf(5.24));
  flat(box(0.56, 0.14, 0.012, plateMaterial, 0, 0.8, stepZ + 0.008));
  flat(box(0.6, 0.18, 0.008, frameMaterial, 0, 0.8, stepZ + 0.004));

  for (const x of [-0.8, 0.8]) {
    add(new THREE.BoxGeometry(0.2, 0.2, 0.04), taillightMaterial,
      x, 0.78, stepZ + 0.004, 'taillight');
  }

  // Canopy rear door: window with its frame, door line, handle
  flat(box(1.3, 0.36, 0.01, frameMaterial, 0, 1.44, rearFaceZ + 0.004));
  flat(box(1.2, 0.28, 0.01, glassMaterial, 0, 1.44, rearFaceZ + 0.008));

  for (const [w, h, x, y] of [
    [1.6, 0.012, 0, 1.02], [1.6, 0.012, 0, 1.64],
    [0.012, 0.64, -0.8, 1.33], [0.012, 0.64, 0.8, 1.33]
  ]) {
    flat(box(w, h, 0.008, frameMaterial, x, y, rearFaceZ + 0.003));
  }
  flat(box(0.14, 0.04, 0.02, metalMaterial, 0.6, 1.12, rearFaceZ + 0.01));

  if (letteringMaterial) {
    flat(add(canopyLettersGeometry, letteringMaterial,
      -0.1, 1.12, rearFaceZ + 0.012));
  }

  // ---- Wheels: tyre, steel rim, hub, dark arch ring and lining ---
  const tyreGeometry = new THREE.CylinderGeometry(
    WHEEL_RADIUS, WHEEL_RADIUS, 0.28, 20);
  tyreGeometry.rotateZ(Math.PI / 2);

  const rimGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.3, 14);
  rimGeometry.rotateZ(Math.PI / 2);

  const hubGeometry = new THREE.CylinderGeometry(0.08, 0.08, 0.32, 8);
  hubGeometry.rotateZ(Math.PI / 2);

  const RING_START = 0.3;
  const ringGeometry = new THREE.RingGeometry(
    ARCH_RADIUS, ARCH_RADIUS + 0.07, 24, 1,
    RING_START, Math.PI - 2 * RING_START);
  const liningStart = archAngle - 0.1;
  const liningGeometry = new THREE.CircleGeometry(
    ARCH_RADIUS + 0.01, 20, liningStart, Math.PI - 2 * liningStart);

  for (const side of [-1, 1]) {
    for (const wu of [FRONT_WHEEL_U, REAR_WHEEL_U]) {
      const z = zOf(wu);

      add(tyreGeometry, blackMaterial, side * 0.92, WHEEL_RADIUS, z);
      add(rimGeometry, rimMaterial, side * 0.92, WHEEL_RADIUS, z);
      add(hubGeometry, metalMaterial, side * 0.92, WHEEL_RADIUS, z);

      const ring = flat(add(ringGeometry, darkMaterial,
        side * (SIDE_X + 0.009), WHEEL_RADIUS, z));
      ring.rotation.y = side * Math.PI / 2;

      const lining = flat(add(liningGeometry, darkMaterial,
        side * 0.76, WHEEL_RADIUS, z));
      lining.rotation.y = side * Math.PI / 2;
    }
  }

  // ---- Cab-roof light bar: red on the left, blue on the right ---
  const BAR_U = 3.0;
  const barGeometry = new THREE.BoxGeometry(1.3, 0.04, 0.3);
  const lensGeometry = new THREE.BoxGeometry(0.6, 0.07, 0.26);
  const capGeometry = new THREE.BoxGeometry(0.06, 0.09, 0.3);

  add(barGeometry, blackMaterial, 0, 1.77, zOf(BAR_U));
  add(lensGeometry, redLensMaterial, -0.31, 1.815, zOf(BAR_U));
  add(lensGeometry, blueLensMaterial, 0.31, 1.815, zOf(BAR_U));
  add(capGeometry, blackMaterial, -0.66, 1.795, zOf(BAR_U));
  add(capGeometry, blackMaterial, 0.66, 1.795, zOf(BAR_U));

  root.userData.flash = (on) => {
    redLensMaterial.emissiveIntensity = on ? LIGHT_BAR_ON : 0;
    blueLensMaterial.emissiveIntensity = on ? 0 : LIGHT_BAR_ON;
  };

  return root;
}


// "POLICE" on a transparent canvas. Needs a DOM; returns null
// under plain Node (headless tests), where the lettering is skipped.
function createLetteringTexture() {

  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  ctx.font = 'italic bold 84px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0b3d91';
  ctx.fillText('POLICE', canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return texture;
}


function disposeObject(root) {

  root.traverse((o) => {
    o.geometry?.dispose();

    const mats = Array.isArray(o.material) ? o.material : [o.material];

    for (const m of mats) {
      m?.map?.dispose();
      m?.dispose();
    }
  });
}


export class PursuitSystem {

  constructor({
    parent,
    taxi,
    vehicle,
    headlightsOn = () => true,
    onCaptured = null,
    getElevation = null    // (x, z) => deck height; null = flat world
  }) {

    this.parent = parent;
    this.taxi = taxi;
    this.vehicle = vehicle;
    this.headlightsOn = headlightsOn;
    this.onCaptured = onCaptured;
    this.getElevation = getElevation;

    this.config = null;
    this.mesh = null;
    this.level = null;   // { spawn, destination, boundaries }

    // Scratch / state, reused every frame
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.pitch = 0;
    this.section = null;    // elevated section it is on, or null
    this.onRamp = false;
    this.leftSection = false;
    this.boarding = null;   // section it is running to the toe of
    this.brakeLimit = BRAKING;
    this.heading = 0;
    this.speed = 0;
    this.lastKnownX = 0;
    this.lastKnownZ = 0;
    this.dirX = 0;
    this.dirZ = -1;
    this.routeLength = 1;

    this.state = 'none';
    this.stateTime = 0;
    this.loseTimer = 0;
    this.captureTimer = 0;
    this.sinceStart = 0;
    this.flashTime = 0;
    this.spawned = false;
    this.captured = false;
    this.reachable = true;
    this.distance = Infinity;
    this.pressure = 0;       // HUD: how close the net is
    this.gapPressure = 0;    // 0..1: how hungry (sets the gap)

    // Taxi speed history for stumble detection (preallocated)
    this.sampleTime = new Float32Array(SPEED_SAMPLES);
    this.sampleSpeed = new Float32Array(SPEED_SAMPLES);
    this.sampleHead = 0;
    this.sampleCount = 0;
    this.clock = 0;
    this.sinceStumble = Infinity;
    this.slowed = false;
  }


  get active() {
    return this.config !== null;
  }


  // Creates the pursuer for a level. `level` is the LEVELS entry;
  // call dispose() (via LevelManager.clearMarkers) before the next.
  configure(level) {

    this.dispose();

    if (!level.pursuit) {
      return;
    }

    this.config = { ...DEFAULT_CONFIG, ...level.pursuit };
    this.level = level;

    this.mesh = createPursuerMesh();
    this.mesh.rotation.order = 'YXZ';   // yaw, then pitch about its own axle
    this.parent.add(this.mesh);

    this.reset();
  }


  dispose() {

    if (this.mesh) {
      this.mesh.parent?.remove(this.mesh);
      disposeObject(this.mesh);
      this.mesh = null;
    }

    this.config = null;
    this.level = null;
    this.state = 'none';
    this.distance = Infinity;
    this.pressure = 0;
  }


  reset() {

    this.stateTime = 0;
    this.loseTimer = 0;
    this.captureTimer = 0;
    this.sinceStart = 0;
    this.flashTime = 0;
    this.speed = 0;
    this.spawned = false;
    this.captured = false;
    this.pressure = 0;
    this.gapPressure = 0;
    this.y = 0;
    this.pitch = 0;
    this.section = null;
    this.onRamp = false;
    this.leftSection = false;
    this.boarding = null;
    this.distance = Infinity;
    this.sampleHead = 0;
    this.sampleCount = 0;
    this.clock = 0;
    this.sinceStumble = Infinity;
    this.slowed = false;

    if (!this.config) {
      this.state = 'none';
      return;
    }

    this.state = 'idle';

    if (this.config.mode === 'immediate') {
      this.placeBehindSpawn();
    } else {
      this.mesh.visible = false;
    }
  }


  // --------------------------------------------------
  // Placement
  // --------------------------------------------------

  // Unit vector spawn -> destination in this.dirX / this.dirZ,
  // plus the run length.
  updateRouteDirection() {

    const { spawn, destination } = this.level;

    const dx = destination.x - spawn.x;
    const dz = destination.z - spawn.z;
    const len = Math.hypot(dx, dz) || 1;

    this.dirX = dx / len;
    this.dirZ = dz / len;
    this.routeLength = len;
  }


  placeBehindSpawn() {

    this.updateRouteDirection();

    const { spawn } = this.level;

    this.placeAt(
      spawn.x - this.dirX * this.config.spawnDistance,
      spawn.z - this.dirZ * this.config.spawnDistance
    );
  }


  placeAt(x, z) {

    this.x = x;
    this.z = z;
    this.y = 0;
    this.pitch = 0;
    this.section = null;
    this.clampToRoad();

    // Face along the route
    this.heading = Math.atan2(-this.dirX, -this.dirZ);

    this.mesh.visible = true;
    this.syncMesh();
  }


  // Elevated section whose footprint holds (x, z), or null.
  sectionAt(x, z) {

    for (const s of this.level.elevated ?? []) {
      if (x >= s.xMin && x <= s.xMax && z <= s.zEntry && z >= s.zExit) {
        return s;
      }
    }

    return null;
  }


  // Keeps the pursuer on the road and bounds. On an elevated section
  // it is between the rails (the taxi's margin) with y from the
  // elevation function; elsewhere the lane clamp applies, widened to
  // reach the ramp toe while boarding. With a dt, an x outside the
  // lane (just came off a section) eases back instead of snapping.
  clampToRoad(dt = Infinity) {

    const { lane } = this.config;
    const { boundaries } = this.level;

    this.z = Math.min(
      Math.max(this.z, boundaries.minZ + BOUNDS_MARGIN),
      boundaries.maxZ - BOUNDS_MARGIN
    );

    // Same lift rule as the taxi: only from the toe, or when up
    const s = this.getElevation ? this.sectionAt(this.x, this.z) : null;
    const h = s ? this.getElevation(this.x, this.z) : 0;

    if (s && (h <= ELEVATION_ENTRY_MAX ||
              this.y >= h - ELEVATION_ENTRY_TOLERANCE)) {

      this.section = s;
      this.x = Math.min(Math.max(this.x, s.xMin + RAIL_CLAMP_MARGIN),
        s.xMax - RAIL_CLAMP_MARGIN);
      this.y = this.getElevation(this.x, this.z);
      this.onRamp = this.y > 0.01 && this.y < s.height - 0.01;
      this.leftSection = true;
      return;
    }

    this.section = null;
    this.onRamp = false;
    this.y = 0;

    const minX = Math.max(lane ? lane.minX : -ROAD_HALF_WIDTH,
      boundaries.minX + BOUNDS_MARGIN);
    let maxX = Math.min(lane ? lane.maxX : ROAD_HALF_WIDTH,
      boundaries.maxX - BOUNDS_MARGIN);

    if (this.boarding) {
      maxX = Math.max(maxX, this.boarding.xMax - RAIL_CLAMP_MARGIN);
    }

    // Only just off a section does it ease back; otherwise a hard clamp
    const ease = this.leftSection ? LANE_RETURN_SPEED * dt : Infinity;

    if (this.x > maxX) {
      this.x = Math.max(maxX, this.x - ease);
    } else if (this.x < minX) {
      this.x = Math.min(minX, this.x + ease);
    } else {
      this.leftSection = false;
    }
  }


  // Nose-up angle of the surface under the pursuer, from the
  // elevation function one metre either side along its heading.
  surfacePitch() {

    if (!this.section) {
      return 0;
    }

    const fx = -Math.sin(this.heading);
    const fz = -Math.cos(this.heading);

    const rise =
      this.getElevation(this.x + fx, this.z + fz) -
      this.getElevation(this.x - fx, this.z - fz);

    return Math.atan(rise / 2);
  }


  syncMesh() {
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.set(this.pitch, this.heading, 0);
  }


  // --------------------------------------------------
  // Per-frame
  // --------------------------------------------------

  update(dt) {

    if (!this.config || this.captured) {
      return;
    }

    this.stateTime += dt;
    this.sinceStart += dt;

    this.trackTaxiSpeed(dt);

    const tx = this.taxi.position.x;
    const tz = this.taxi.position.z;

    this.distance = Math.hypot(tx - this.x, tz - this.z);

    // `visible`: the taxi can be seen (only the legacy ignoreElevated
    // option hides it up on the flyover). `reachable`: also on the
    // same level as the pursuer, which capture and the separation
    // floor need.
    const visible =
      !(this.config.ignoreElevated &&
        this.taxi.position.y > ELEVATED_Y);

    const reachable =
      visible &&
      Math.abs(this.taxi.position.y - this.y) <= SAME_LEVEL_TOLERANCE;

    this.reachable = reachable;
    this.brakeLimit = BRAKING;
    this.updateBoarding();

    const dark = !this.headlightsOn();

    const detection =
      dark && this.config.detectionRadiusDark !== null
        ? this.config.detectionRadiusDark
        : this.config.detectionRadius;

    const loseRange =
      dark && this.config.loseRangeDark !== null
        ? this.config.loseRangeDark
        : this.config.loseRange;

    const topSpeed =
      this.config.speedFraction *
      this.vehicle.settings.maxForwardSpeed;

    switch (this.state) {

      case 'idle':
        this.updateIdle(visible, detection);
        break;

      case 'chasing':
        this.updateChasing(dt, tx, tz, visible, reachable, loseRange, topSpeed);
        break;

      case 'lost':
        this.drive(dt, this.x, this.z, 0);

        if (visible && this.distance <= detection) {
          this.setState('chasing');
        } else if (this.stateTime >= LOST_PAUSE_TIME) {
          this.setState('searching');
        }
        break;

      case 'searching':
        this.drive(dt, this.lastKnownX, this.lastKnownZ, topSpeed);

        if (visible && this.distance <= detection) {
          this.setState('chasing');
        }
        break;
    }

    this.updatePressure();
    this.updateLights(dt);
  }


  updateIdle(visible, detection) {

    if (this.config.mode === 'trigger') {

      if (this.spawned) {
        return;
      }

      this.updateRouteDirection();

      const { spawn } = this.level;

      const progress =
        (
          (this.taxi.position.x - spawn.x) * this.dirX +
          (this.taxi.position.z - spawn.z) * this.dirZ
        ) / this.routeLength;

      if (progress >= this.config.triggerProgress) {
        this.spawned = true;

        this.placeAt(
          this.taxi.position.x - this.dirX * this.config.spawnDistance,
          this.taxi.position.z - this.dirZ * this.config.spawnDistance
        );

        this.beginChase();
      }

      return;
    }

    if (
      this.sinceStart >= this.config.startDelay &&
      visible &&
      this.distance <= detection
    ) {
      this.beginChase();
    }
  }


  beginChase() {

    this.lastKnownX = this.taxi.position.x;
    this.lastKnownZ = this.taxi.position.z;
    this.loseTimer = 0;
    this.captureTimer = 0;
    this.setState('chasing');
  }


  // The taxi is on a flyover, or lining up for its ramp, and the
  // pursuer is not on it yet: remember the section so the lane clamp
  // opens up to let the pursuer follow, and so it can run to the toe.
  // (Ground under the deck is not "on" the section: that is only
  // from the ramp toe up, same as the taxi's lift rule.)
  updateBoarding() {

    this.boarding = null;

    if (this.section || !this.getElevation) {
      return;
    }

    const { x, y, z } = this.taxi.position;

    for (const s of this.level.elevated ?? []) {

      if (x < s.xMin || x > s.xMax) {
        continue;
      }

      const approaching =
        z > s.zEntry && z <= s.zEntry + BOARDING_APPROACH;

      const onStructure =
        z <= s.zEntry && z >= s.zExit && y > ELEVATION_ENTRY_MAX;

      if (approaching || onStructure) {
        this.boarding = s;
        return;
      }
    }
  }


  updateChasing(dt, tx, tz, visible, reachable, loseRange, topSpeed) {

    const seen = visible && this.distance <= loseRange;

    if (seen) {
      this.loseTimer = 0;
      this.lastKnownX = tx;
      this.lastKnownZ = tz;
    } else {
      this.loseTimer += dt;
    }

    const maxSpeed = topSpeed * this.catchUpFactor();

    // Boarding: head for just before the ramp toe at full speed, then
    // follow the taxi up. Past the toe's approach it steers at the taxi.
    const toe = this.boarding;

    if (
      toe && seen && this.taxi.position.y > ELEVATED_Y &&
      this.z > toe.zEntry + TOE_LEAD + TOE_SWITCH
    ) {
      this.drive(
        dt, (toe.xMin + toe.xMax) / 2, toe.zEntry + TOE_LEAD,
        maxSpeed, maxSpeed
      );
    } else {
      // Match the taxi's speed and hold the gap while it is in view;
      // a stale last-known point is driven to properly (arrive).
      this.drive(
        dt, this.lastKnownX, this.lastKnownZ, maxSpeed,
        seen ? this.followSpeed(dt, maxSpeed) : -1
      );
    }

    if (this.loseTimer >= this.config.loseTime) {
      this.captureTimer = 0;
      this.setState('lost');
      return;
    }

    // Continuous contact only; any gap restarts the timer
    this.distance = Math.hypot(tx - this.x, tz - this.z);

    if (reachable && this.distance <= this.config.captureDistance) {
      this.captureTimer += dt;

      if (this.captureTimer >= this.config.captureTime) {
        this.captured = true;
        this.speed = 0;
        this.onCaptured?.();
      }
    } else {
      this.captureTimer = 0;
    }
  }


  // Standoff gap, kept below captureDistance
  standoff() {
    return Math.min(
      this.config.standoffDistance,
      this.config.captureDistance - STANDOFF_MARGIN
    );
  }


  // Records the taxi's speed (ring buffer, no allocation) and
  // updates `slowed`. A drop of more than stumbleSpeedDrop within
  // stumbleWindow is a stumble (collision, pothole...).
  trackTaxiSpeed(dt) {

    const { stumbleSpeedDrop, stumbleWindow, stumbleSurgeTime,
      slowSpeedThreshold } = this.config;

    this.clock += dt;
    this.sinceStumble += dt;

    const speed = Math.max(this.vehicle.getSpeed(), 0);

    this.sampleTime[this.sampleHead] = this.clock;
    this.sampleSpeed[this.sampleHead] = speed;
    this.sampleHead = (this.sampleHead + 1) % SPEED_SAMPLES;
    this.sampleCount = Math.min(this.sampleCount + 1, SPEED_SAMPLES);

    let recentMax = speed;

    for (let i = 0; i < this.sampleCount; i++) {
      if (this.clock - this.sampleTime[i] <= stumbleWindow &&
          this.sampleSpeed[i] > recentMax) {
        recentMax = this.sampleSpeed[i];
      }
    }

    if (recentMax - speed > stumbleSpeedDrop) {
      this.sinceStumble = 0;
    }

    const wasSlowed = this.slowed;

    this.slowed =
      speed < slowSpeedThreshold ||
      this.sinceStumble < stumbleSurgeTime;

    this.updateGapPressure(dt, speed);

    // Taxi got going again: the gap opens, and the contact it had
    // built up does not carry over
    if (wasSlowed && !this.slowed) {
      this.captureTimer = 0;
    }
  }


  // Rises while the taxi is below pressureSpeedFraction of top speed
  // (faster the further below), falls at or above it, and is pinned
  // at 1 while the taxi is slowed or has stumbled.
  updateGapPressure(dt, speed) {

    const { pressureSpeedFraction, pressureRiseRate, pressureFallRate } =
      this.config;

    const threshold =
      pressureSpeedFraction * this.vehicle.settings.maxForwardSpeed;

    let p = this.gapPressure;

    if (this.slowed) {
      p = 1;
    } else if (speed < threshold) {
      p += pressureRiseRate * (1 - speed / threshold) * dt;
    } else {
      p -= pressureFallRate * dt;
    }

    this.gapPressure = Math.min(Math.max(p, 0), 1);
  }


  // Gap the pursuer is trying to hold right now: the cruise gap
  // (breathing in and out, on the pursuer's own clock) towards the
  // standoff as pressure builds. Breathing fades with the pressure.
  desiredGap() {

    const { cruiseGap, gapBreathAmplitude, gapBreathRate } = this.config;

    const cruise = cruiseGap + gapBreathAmplitude *
      Math.sin(2 * Math.PI * gapBreathRate * this.clock);

    return cruise + (this.standoff() - cruise) * this.gapPressure;
  }


  // Target speed while the taxi is in view: the taxi's own speed
  // plus a correction for the gap error. Never "arrives": it holds
  // the gap at any taxi speed.
  //   error > pounceGapExcess: pounce, full chase speed. No gentle
  //     approach: it only brakes inside preContactBrakeDistance, at
  //     the harsh preContactBraking limit, to just match the taxi.
  //   within gapDeadband: match the taxi's speed (no hunting).
  //   otherwise: the closing-gain correction.
  followSpeed(dt, maxSpeed) {

    const { pounceGapExcess, preContactBrakeDistance, preContactBraking,
      gapDeadband, closingGain } = this.config;

    const taxiSpeed = Math.max(this.vehicle.getSpeed(), 0);

    // The taxi has already moved this frame; the pursuer has not.
    // Judge the gap as it will be after the pursuer matches the
    // taxi's step, which is what the camera and capture check see.
    const error = this.distance - taxiSpeed * dt - this.desiredGap();

    let target;

    if (error > pounceGapExcess) {
      target = maxSpeed;
    } else if (Math.abs(error) > gapDeadband) {
      target = taxiSpeed + closingGain * error;
    } else {
      target = taxiSpeed;
    }

    if (error > 0 && error <= preContactBrakeDistance) {
      this.brakeLimit = preContactBraking;

      target = Math.min(target,
        taxiSpeed + Math.sqrt(2 * preContactBraking * error));
    }

    return Math.min(Math.max(target, 0), maxSpeed);
  }


  // 1.0 within catchUpDistance, rising to catchUpMultiplier at
  // twice that distance (smoothstep, so no sudden speed change).
  catchUpFactor() {

    const { catchUpDistance, catchUpMultiplier } = this.config;

    const t = Math.min(Math.max(
      (this.distance - catchUpDistance) / catchUpDistance, 0), 1);

    return 1 + (catchUpMultiplier - 1) * t * t * (3 - 2 * t);
  }


  // Hard floor on taxi separation: pushes the pursuer straight
  // back out and sheds the speed it would have used to ram the
  // taxi. Never collidable, so this is the only "contact".
  keepSeparation() {

    if (!this.reachable) {
      return;
    }

    const min = Math.min(MIN_SEPARATION, this.standoff());

    const dx = this.x - this.taxi.position.x;
    const dz = this.z - this.taxi.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist >= min) {
      return;
    }

    // Exactly on top of the taxi: back out along the heading
    const nx = dist > 1e-6 ? dx / dist : Math.sin(this.heading);
    const nz = dist > 1e-6 ? dz / dist : Math.cos(this.heading);

    this.x = this.taxi.position.x + nx * min;
    this.z = this.taxi.position.z + nz * min;

    this.speed = Math.min(this.speed, Math.abs(this.vehicle.getSpeed()));
  }


  setState(state) {
    this.state = state;
    this.stateTime = 0;
  }


  // Steers towards (tx, tz) and moves, capped at maxSpeed. With
  // followSpeed >= 0 that is the target speed (chasing a visible
  // taxi); otherwise it slows on arrival at the point. Slows in
  // sharp turns; keeps clear of the taxi and stays on the road.
  drive(dt, tx, tz, maxSpeed, followSpeed = -1) {

    // Slower on the ramp slope, so the flyover keeps an edge
    if (this.onRamp) {
      maxSpeed *= this.config.rampSpeedFactor;
    }

    const dx = tx - this.x;
    const dz = tz - this.z;
    const dist = Math.hypot(dx, dz);

    let target = 0;

    if (dist > 0.01 && maxSpeed > 0) {

      // Heading convention of the mesh: forward = (-sin, -cos)
      let diff = Math.atan2(-dx, -dz) - this.heading;

      while (diff > Math.PI) { diff -= 2 * Math.PI; }
      while (diff < -Math.PI) { diff += 2 * Math.PI; }

      const maxTurn = TURN_RATE * dt;
      this.heading += Math.min(Math.max(diff, -maxTurn), maxTurn);

      target = followSpeed >= 0
        ? Math.min(maxSpeed, followSpeed)
        : Math.min(maxSpeed, dist * ARRIVE_GAIN);

      if (dist < ARRIVE_RADIUS && this.state === 'searching') {
        target = 0;
      }

      if (Math.abs(diff) > SHARP_TURN_ANGLE) {
        target *= SHARP_TURN_SPEED_SCALE;
      }
    }

    const rate = target > this.speed ? ACCELERATION : this.brakeLimit;
    const step = rate * dt;

    this.speed +=
      Math.min(Math.max(target - this.speed, -step), step);

    this.x -= Math.sin(this.heading) * this.speed * dt;
    this.z -= Math.cos(this.heading) * this.speed * dt;

    this.keepSeparation();
    this.clampToRoad(dt);

    this.pitch +=
      (this.surfacePitch() - this.pitch) * Math.min(1, PITCH_RATE * dt);

    this.syncMesh();
  }


  updatePressure() {

    if (this.state !== 'chasing') {
      this.pressure = 0;
      return;
    }

    const { captureDistance, captureTime } = this.config;

    const proximity =
      1 - (this.distance - captureDistance) /
        (PRESSURE_RANGE - captureDistance);

    this.pressure = Math.min(Math.max(
      Math.max(proximity, this.captureTimer / captureTime),
      0), 1);
  }


  updateLights(dt) {

    if (!this.mesh.visible) {
      return;
    }

    this.flashTime += dt;

    this.mesh.userData.flash?.(
      Math.floor(this.flashTime * LIGHT_FLASH_RATE * 2) % 2 === 0
    );
  }


  // --------------------------------------------------
  // HUD
  // --------------------------------------------------

  getState() {

    if (!this.config) {
      return { state: 'none', distance: null, pressure: 0 };
    }

    // Only report a distance while the pursuer exists in the world
    const present = this.mesh.visible;

    return {
      state: this.state,
      distance: present ? this.distance : null,
      pressure: this.pressure
    };
  }
}
