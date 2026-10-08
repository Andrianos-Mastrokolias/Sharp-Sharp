import * as THREE from 'three';
import {
  createTrafficCar,
  createRandom,
  TRAFFIC_VARIANTS
} from './environments/props.js';

export { TRAFFIC_VARIANTS };

// ==================================================
// TRAFFIC SYSTEM
// --------------------------------------------------
// Moving cars the taxi can hit. Owned and updated by
// LevelManager; the per-level numbers live in
// LEVELS[n].traffic (see LevelManager.js):
//
//   traffic: {
//     seed,                  // placement is seeded: same every load
//     spawnClearance,        // m: no car within this of the spawn
//     destinationClearance,  // m: ...or of the destination
//     lanes: [{ x, dir, speed, count, variants }]
//   }
//
// dir is the direction along z (-1 = with the taxi, which drives
// towards -z at heading 0; +1 = oncoming), speed is m/s.
//
// Each car is ONE childless Mesh sharing its variant's geometry and
// material, registered as a collidable (a moving building: the
// vehicle box-tests it every frame and bounces off it). The
// pursuer ignores traffic and is never blocked by it.
//
// Lane model: a lane is a loop of centre positions [centreLo,
// centreHi] along z, inside the lane's z range, which is the stretch
// of road between the spawn and destination clearance zones. Every
// car in the lane advances by speed * dt along that loop and wraps to
// the far end, so cars in a lane never close up. Spacing is seeded
// but never below MIN_CAR_GAP between bumpers.
// ==================================================

// Bumper-to-bumper gap no two cars of a lane ever get below (m)
export const MIN_CAR_GAP = 8;

// Hard cap per level (collidables are box-tested every frame)
export const MAX_TRAFFIC_CARS = 10;

// A lane may not come within this of an elevated section's footprint
// (x, in metres): flyover xMin 3 -> traffic stays at x < 2
export const FOOTPRINT_MARGIN = 1;

// Random spread of a car around its slot in the lane (m)
const MAX_JITTER = 6;

// Cars throw shadows like the rest of the street. Costs a second
// draw per car part in view; budget.mjs counts it.
const CAST_SHADOW = true;


export class TrafficSystem {

  constructor({
    parent,
    registerCollidable = null
  }) {

    this.parent = parent;
    this.registerCollidable = registerCollidable;

    this.config = null;

    // { x, dir, speed, zLo, zHi, centreLo, centreHi, trackLength }
    this.lanes = [];

    // { mesh, laneIndex, variant, length, width, u0, u }
    this.cars = [];

    this.geometries = new Set();
    this.materials = new Map();
  }


  get active() {
    return this.cars.length > 0;
  }


  // Builds the cars for a level. `level` is the LEVELS entry; call
  // dispose() (via LevelManager.clearMarkers) before the next one.
  configure(level) {

    this.dispose();

    const config = level.traffic;

    if (!config) {
      return;
    }

    const total = config.lanes.reduce((n, lane) => n + lane.count, 0);

    if (total > MAX_TRAFFIC_CARS) {
      throw new Error(
        `traffic: ${total} cars is over the limit of ${MAX_TRAFFIC_CARS}`
      );
    }

    this.config = config;

    const random = createRandom(config.seed);
    const range = this.laneRange(level, config);

    // One geometry per variant, shared by every car of it
    const variants = new Map();

    const variantOf = (name) => {

      let entry = variants.get(name);

      if (!entry) {

        const { geometry, material } =
          createTrafficCar(name, this.materials);

        geometry.computeBoundingBox();

        const size = geometry.boundingBox.getSize(new THREE.Vector3());

        entry = { geometry, material, length: size.z, width: size.x };
        variants.set(name, entry);
        this.geometries.add(geometry);
      }

      return entry;
    };

    config.lanes.forEach((laneConfig, laneIndex) => {

      const cars = [];

      for (let i = 0; i < laneConfig.count; i++) {

        const name = laneConfig.variants[
          Math.floor(random() * laneConfig.variants.length)
        ];

        cars.push({ name, entry: variantOf(name) });
      }

      const longest = Math.max(...cars.map(c => c.entry.length));
      const widest = Math.max(...cars.map(c => c.entry.width));

      const margin = longest / 2;
      const centreLo = range.lo + margin;
      const centreHi = range.hi - margin;
      const trackLength = centreHi - centreLo;
      const slot = trackLength / laneConfig.count;
      const slack = slot - longest - MIN_CAR_GAP;

      if (slack < 0) {
        throw new Error(
          `traffic: lane x=${laneConfig.x} is too crowded ` +
          `(${laneConfig.count} cars in ${trackLength.toFixed(0)} m)`
        );
      }

      this.checkFootprints(level, laneConfig, widest, range);

      const jitter = Math.min(MAX_JITTER, slack / 2);

      this.lanes.push({
        x: laneConfig.x,
        dir: laneConfig.dir,
        speed: laneConfig.speed,
        zLo: range.lo,
        zHi: range.hi,
        centreLo,
        centreHi,
        trackLength
      });

      cars.forEach(({ name, entry }, i) => {

        const mesh = new THREE.Mesh(entry.geometry, entry.material);

        mesh.castShadow = CAST_SHADOW;
        mesh.receiveShadow = true;
        mesh.userData.traffic = true;
        mesh.rotation.y = laneConfig.dir < 0 ? 0 : Math.PI;

        this.parent.add(mesh);
        this.registerCollidable?.(mesh);

        this.cars.push({
          mesh,
          laneIndex,
          variant: name,
          length: entry.length,
          width: entry.width,
          u0: (i + 0.5) * slot + (random() * 2 - 1) * jitter,
          u: 0
        });
      });
    });

    this.reset();
  }


  // The stretch of road between the spawn clearance and the
  // destination clearance, as { lo, hi } in z. Cars stay wholly
  // inside it.
  laneRange(level, config) {

    const { spawn, destination } = level;

    const way = Math.sign(destination.z - spawn.z) || -1;

    const a = spawn.z + way * config.spawnClearance;
    const b = destination.z - way * config.destinationClearance;

    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    if (hi - lo <= 0) {
      throw new Error('traffic: no road left between the clearance zones');
    }

    return { lo, hi };
  }


  // Lanes must keep clear of any flyover footprint they cross in z
  checkFootprints(level, lane, width, range) {

    for (const s of level.elevated ?? []) {

      const crossesZ = range.hi >= s.zExit && range.lo <= s.zEntry;

      const left = lane.x - width / 2;
      const right = lane.x + width / 2;

      if (
        crossesZ &&
        right > s.xMin - FOOTPRINT_MARGIN &&
        left < s.xMax + FOOTPRINT_MARGIN
      ) {
        throw new Error(
          `traffic: lane x=${lane.x} runs into the '${s.id}' footprint`
        );
      }
    }
  }


  // Back to the initial, seeded layout
  reset() {

    for (const car of this.cars) {
      car.u = car.u0;
      this.place(car);
    }
  }


  place(car) {

    const lane = this.lanes[car.laneIndex];

    car.mesh.position.set(
      lane.x,
      0,
      lane.dir < 0
        ? lane.centreHi - car.u
        : lane.centreLo + car.u
    );
  }


  // Per frame: no allocations
  update(dt) {

    for (let i = 0; i < this.cars.length; i++) {

      const car = this.cars[i];
      const lane = this.lanes[car.laneIndex];

      car.u += lane.speed * dt;

      if (car.u >= lane.trackLength) {
        car.u -= lane.trackLength;
      }

      car.mesh.position.z =
        lane.dir < 0
          ? lane.centreHi - car.u
          : lane.centreLo + car.u;
    }
  }


  // Removes the cars and frees their geometry and materials. The
  // collidable registrations are LevelManager's (clearMarkers
  // unregisters everything it registered).
  dispose() {

    for (const car of this.cars) {
      car.mesh.parent?.remove(car.mesh);
    }

    for (const geometry of this.geometries) {
      geometry.dispose();
    }

    for (const material of this.materials.values()) {
      material.dispose();
    }

    this.cars = [];
    this.lanes = [];
    this.geometries.clear();
    this.materials.clear();
    this.config = null;
  }
}
