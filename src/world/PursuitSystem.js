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
const ACCELERATION = 16;        // m/s^2
const BRAKING = 24;             // m/s^2
const ARRIVE_GAIN = 2;          // desired speed = distance * this
const ARRIVE_RADIUS = 2.5;      // "reached" the last known position
const LOST_PAUSE_TIME = 1.5;    // seconds sitting still in 'lost'
const SHARP_TURN_ANGLE = 1;     // rad; slow down beyond this
const SHARP_TURN_SPEED_SCALE = 0.4;
const PRESSURE_RANGE = 60;      // distance at which pressure hits 0
const ELEVATED_Y = 1;           // taxi above this is "on the flyover"
const LIGHT_FLASH_RATE = 7;     // Hz
const LIGHT_BAR_ON = 2.5;       // lens emissiveIntensity when lit

// Following distance (centre to centre) the pursuer holds behind
// the taxi. Must stay below captureDistance, or it could never
// count as "in capture range". MIN_SEPARATION is the hard floor:
// the pursuer is pushed back out to it if the taxi brakes hard.
export const STANDOFF_DISTANCE = 3.5;
export const MIN_SEPARATION = 3.0;
const STANDOFF_MARGIN = 0.25;   // standoff <= captureDistance - this

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
  captureTime: 2,

  // Catch-up: further behind than catchUpDistance the speed cap is
  // scaled up, reaching catchUpMultiplier at twice that distance and
  // easing back to 1.0 at catchUpDistance. Close in it is never
  // faster than speedFraction.
  catchUpDistance: 25,
  catchUpMultiplier: 1.15,

  // Level 2: cannot follow onto the flyover
  ignoreElevated: false,
  lane: null                   // { minX, maxX } or null = road
};


// Stylised low-poly SAPS bakkie (Isuzu D-Max style double cab with
// a canopy). Code-built only: no external models or images.
// Faces -Z at rotation.y = 0, ~2.0 m wide, 5.3 m long, 1.9 m tall.
// Returns a THREE.Object3D carrying userData.flash(on) for the roof
// light bar. Everything it creates (geometries, materials and the
// lettering texture) is released by disposeObject().
export function createPursuerMesh() {

  const root = new THREE.Group();

  const whiteMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f3f5, roughness: 0.45
  });
  const blueMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b3d91, roughness: 0.5
  });
  const yellowMaterial = new THREE.MeshStandardMaterial({
    color: 0xf2b705, roughness: 0.5
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d141b, roughness: 0.15, metalness: 0.3
  });
  const blackMaterial = new THREE.MeshStandardMaterial({
    color: 0x141414, roughness: 0.9
  });
  const bumperMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2d31, roughness: 0.7
  });
  const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xfff1c0 });
  const taillightMaterial = new THREE.MeshBasicMaterial({ color: 0xd01212 });

  // Light bar lenses: flash() only swaps emissiveIntensity
  const redLensMaterial = new THREE.MeshStandardMaterial({
    color: 0x7a0a0a, emissive: 0xff1a1a, emissiveIntensity: 0
  });
  const blueLensMaterial = new THREE.MeshStandardMaterial({
    color: 0x0a2a7a, emissive: 0x2a5cff, emissiveIntensity: 0
  });

  const add = (geometry, material, x, y, z, name) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    if (name) { mesh.name = name; }
    root.add(mesh);
    return mesh;
  };

  const box = (w, h, d, material, x, y, z, name) =>
    add(new THREE.BoxGeometry(w, h, d), material, x, y, z, name);

  // Lower body (y 0.45 - 1.1) and bumpers; front bumper at -Z
  box(2.0, 0.65, 5.2, whiteMaterial, 0, 0.775, 0);
  box(1.9, 0.2, 0.14, bumperMaterial, 0, 0.55, -2.58);
  box(1.9, 0.2, 0.14, bumperMaterial, 0, 0.55, 2.58);
  box(1.0, 0.18, 0.04, blackMaterial, 0, 0.9, -2.61);   // grille

  // Cab: side profile extruded across the width, with a sloped
  // windscreen at the front. Shape (u, v) = (-z, y); rotateY(90deg)
  // maps u -> -z and the extrusion depth -> x.
  const WINDSCREEN_FOOT_Z = -1.25;
  const WINDSCREEN_TOP_Z = -0.55;
  const BODY_TOP_Y = 1.1;
  const CAB_ROOF_Y = 1.74;

  const profile = new THREE.Shape();
  profile.moveTo(-WINDSCREEN_FOOT_Z, BODY_TOP_Y);
  profile.lineTo(-WINDSCREEN_TOP_Z, CAB_ROOF_Y);
  profile.lineTo(-0.75, CAB_ROOF_Y);
  profile.lineTo(-0.85, BODY_TOP_Y);
  profile.closePath();

  const cabGeometry = new THREE.ExtrudeGeometry(profile, {
    depth: 1.9, bevelEnabled: false
  });
  cabGeometry.rotateY(Math.PI / 2);
  cabGeometry.translate(-0.95, 0, 0);
  add(cabGeometry, whiteMaterial, 0, 0, 0);

  // Windscreen: plane lying on the slope, pushed just outside it
  const rise = CAB_ROOF_Y - BODY_TOP_Y;
  const run = WINDSCREEN_TOP_Z - WINDSCREEN_FOOT_Z;
  const slopeLength = Math.hypot(rise, run);
  const normalY = run / slopeLength;     // outward normal: up and forward
  const normalZ = -rise / slopeLength;

  const windscreen = add(
    new THREE.PlaneGeometry(1.62, slopeLength * 0.82),
    glassMaterial,
    0,
    (BODY_TOP_Y + CAB_ROOF_Y) / 2 + normalY * 0.012,
    (WINDSCREEN_FOOT_Z + WINDSCREEN_TOP_Z) / 2 + normalZ * 0.012
  );
  windscreen.rotation.x = Math.atan2(-normalY, normalZ);
  windscreen.castShadow = false;

  // Canopy over the load bed
  box(1.92, 0.75, 1.72, whiteMaterial, 0, 1.475, 1.76);

  // Side windows (cab front door, cab rear door, canopy) and the
  // POLICE lettering, mirrored onto both sides
  const windowGeometry = new THREE.PlaneGeometry(1, 1);
  const lettering = createLetteringTexture();
  const letteringGeometry = new THREE.PlaneGeometry(1.1, 0.2);
  const letteringMaterial = lettering
    ? new THREE.MeshBasicMaterial({
        map: lettering, transparent: true, depthWrite: false
      })
    : null;

  const sideWindow = (side, z, y, w, h, x) => {
    const m = add(windowGeometry, glassMaterial, side * x, y, z);
    m.scale.set(w, h, 1);
    m.rotation.y = side * Math.PI / 2;
    m.castShadow = false;
  };

  for (const side of [1, -1]) {
    sideWindow(side, -0.25, 1.46, 0.5, 0.4, 0.955);   // front door
    sideWindow(side, 0.38, 1.46, 0.5, 0.4, 0.955);    // rear door
    sideWindow(side, 1.7, 1.55, 1.0, 0.35, 0.965);    // canopy

    // Livery: blue band over a thin yellow band along the body
    box(0.012, 0.15, 5.2, blueMaterial, side * 1.006, 0.62, 0);
    box(0.012, 0.07, 5.2, yellowMaterial, side * 1.006, 0.76, 0);

    if (letteringMaterial) {
      const m = add(
        letteringGeometry, letteringMaterial, side * 1.014, 0.93, -0.45
      );
      m.rotation.y = side * Math.PI / 2;
      m.castShadow = false;
    }
  }

  // Wheels: black cylinders on the X axis, front axle at -Z
  const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 12);
  wheelGeometry.rotateZ(Math.PI / 2);

  for (const x of [-0.9, 0.9]) {
    for (const z of [-1.65, 1.65]) {
      add(wheelGeometry, blackMaterial, x, 0.38, z);
    }
  }

  // Lights: headlights at the front (-Z), red tail-lights at the back
  const headlightGeometry = new THREE.BoxGeometry(0.38, 0.16, 0.04);
  const taillightGeometry = new THREE.BoxGeometry(0.22, 0.3, 0.04);

  for (const x of [-0.7, 0.7]) {
    add(headlightGeometry, headlightMaterial, x, 0.95, -2.61, 'headlight');
    add(taillightGeometry, taillightMaterial, x * 1.2, 0.95, 2.61, 'taillight');
  }

  // Roof light bar: red on the left, blue on the right
  const barGeometry = new THREE.BoxGeometry(1.0, 0.05, 0.22);
  const lensGeometry = new THREE.BoxGeometry(0.44, 0.1, 0.2);

  add(barGeometry, blackMaterial, 0, CAB_ROOF_Y + 0.025, 0.05);
  add(lensGeometry, redLensMaterial, -0.25, CAB_ROOF_Y + 0.1, 0.05);
  add(lensGeometry, blueLensMaterial, 0.25, CAB_ROOF_Y + 0.1, 0.05);

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

  ctx.font = 'bold 84px Arial, Helvetica, sans-serif';
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
    onCaptured = null
  }) {

    this.parent = parent;
    this.taxi = taxi;
    this.vehicle = vehicle;
    this.headlightsOn = headlightsOn;
    this.onCaptured = onCaptured;

    this.config = null;
    this.mesh = null;
    this.level = null;   // { spawn, destination, boundaries }

    // Scratch / state, reused every frame
    this.x = 0;
    this.z = 0;
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
    this.pressure = 0;
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
    this.distance = Infinity;

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
    this.clampToRoad();

    // Face along the route
    this.heading = Math.atan2(-this.dirX, -this.dirZ);

    this.mesh.visible = true;
    this.syncMesh();
  }


  clampToRoad() {

    const { lane } = this.config;
    const { boundaries } = this.level;

    const minX = Math.max(lane ? lane.minX : -ROAD_HALF_WIDTH,
      boundaries.minX + BOUNDS_MARGIN);
    const maxX = Math.min(lane ? lane.maxX : ROAD_HALF_WIDTH,
      boundaries.maxX - BOUNDS_MARGIN);

    this.x = Math.min(Math.max(this.x, minX), maxX);

    this.z = Math.min(
      Math.max(this.z, boundaries.minZ + BOUNDS_MARGIN),
      boundaries.maxZ - BOUNDS_MARGIN
    );
  }


  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
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

    const tx = this.taxi.position.x;
    const tz = this.taxi.position.z;

    this.distance = Math.hypot(tx - this.x, tz - this.z);

    // Out of reach: up on the flyover and this pursuer cannot
    // follow. Counts as not seen and cannot be captured.
    const reachable =
      !(this.config.ignoreElevated &&
        this.taxi.position.y > ELEVATED_Y);

    this.reachable = reachable;

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
        this.updateIdle(reachable, detection);
        break;

      case 'chasing':
        this.updateChasing(dt, tx, tz, reachable, loseRange, topSpeed);
        break;

      case 'lost':
        this.drive(dt, this.x, this.z, 0);

        if (reachable && this.distance <= detection) {
          this.setState('chasing');
        } else if (this.stateTime >= LOST_PAUSE_TIME) {
          this.setState('searching');
        }
        break;

      case 'searching':
        this.drive(dt, this.lastKnownX, this.lastKnownZ, topSpeed);

        if (reachable && this.distance <= detection) {
          this.setState('chasing');
        }
        break;
    }

    this.updatePressure();
    this.updateLights(dt);
  }


  updateIdle(reachable, detection) {

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
      reachable &&
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


  updateChasing(dt, tx, tz, reachable, loseRange, topSpeed) {

    const seen = reachable && this.distance <= loseRange;

    if (seen) {
      this.loseTimer = 0;
      this.lastKnownX = tx;
      this.lastKnownZ = tz;
    } else {
      this.loseTimer += dt;
    }

    // Hold the standoff only while the taxi is actually in view; a
    // stale last-known point is driven to properly.
    this.drive(
      dt, this.lastKnownX, this.lastKnownZ,
      topSpeed * this.catchUpFactor(),
      seen ? this.standoff() : 0
    );

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


  // Following distance, kept below captureDistance
  standoff() {
    return Math.min(
      STANDOFF_DISTANCE,
      this.config.captureDistance - STANDOFF_MARGIN
    );
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


  // Steers towards (tx, tz) and moves, capped at maxSpeed.
  // Slows on arrival (standoff metres short of the target) and in
  // sharp turns; keeps clear of the taxi and stays on the road.
  drive(dt, tx, tz, maxSpeed, standoff = 0) {

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

      target = Math.min(
        maxSpeed, Math.max(dist - standoff, 0) * ARRIVE_GAIN
      );

      if (dist < ARRIVE_RADIUS && this.state === 'searching') {
        target = 0;
      }

      if (Math.abs(diff) > SHARP_TURN_ANGLE) {
        target *= SHARP_TURN_SPEED_SCALE;
      }
    }

    const rate = target > this.speed ? ACCELERATION : BRAKING;
    const step = rate * dt;

    this.speed +=
      Math.min(Math.max(target - this.speed, -step), step);

    this.x -= Math.sin(this.heading) * this.speed * dt;
    this.z -= Math.cos(this.heading) * this.speed * dt;

    this.keepSeparation();
    this.clampToRoad();
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
      Math.floor(this.flashTime * LIGHT_FLASH_RATE) % 2 === 0
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
