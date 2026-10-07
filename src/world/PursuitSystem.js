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

  // Level 2: cannot follow onto the flyover
  ignoreElevated: false,
  lane: null                   // { minX, maxX } or null = road
};


// Placeholder look. The 3D model team swaps this one function
// for a real model; it must return a THREE.Object3D that faces
// -Z at rotation.y = 0 and may carry userData.flash(on) for the
// light bar. Everything it creates is disposed by disposeObject().
export function createPursuerMesh() {

  const root = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x1d2a44,
    roughness: 0.6
  });

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8e8ec,
    roughness: 0.5
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.8, 4.6),
    bodyMaterial
  );
  body.position.y = 0.7;

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.6, 2.4),
    roofMaterial
  );
  roof.position.set(0, 1.4, 0.2);

  const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  const blueMaterial = new THREE.MeshBasicMaterial({ color: 0x2a5cff });

  const red = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.25, 0.4),
    redMaterial
  );
  red.position.set(-0.45, 1.85, 0.2);

  const blue = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.25, 0.4),
    blueMaterial
  );
  blue.position.set(0.45, 1.85, 0.2);

  for (const m of [body, roof, red, blue]) {
    m.castShadow = true;
    root.add(m);
  }

  root.userData.flash = (on) => {
    red.visible = on;
    blue.visible = !on;
  };

  return root;
}


function disposeObject(root) {

  root.traverse((o) => {
    o.geometry?.dispose();

    const mats = Array.isArray(o.material) ? o.material : [o.material];

    for (const m of mats) {
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

    this.drive(dt, this.lastKnownX, this.lastKnownZ, topSpeed);

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


  setState(state) {
    this.state = state;
    this.stateTime = 0;
  }


  // Steers towards (tx, tz) and moves, capped at maxSpeed.
  // Slows on arrival and in sharp turns; stays on the road.
  drive(dt, tx, tz, maxSpeed) {

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

      target = Math.min(maxSpeed, dist * ARRIVE_GAIN);

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
