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
//     zLo, zHi,              // the stretch of road the lanes run on
//     spawnClearance,        // m: no car within this of the spawn at the start
//     destinationClearance,  // m: ...or of the destination at the start
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
// Lane model: a lane runs across the whole road, [zLo, zHi]. Cars
// enter at one end and leave at the other (same direction: enter at
// +z, leave at -z; oncoming: the other way round), so the wrap
// happens at the far ends of the level, not in front of the player.
// Every car advances by speed * dt along the loop of centre
// positions [centreLo, centreHi] and wraps from the exit to the
// entry, so cars in a lane never close up.
//
// Fairness is in the INITIAL layout only (seeded, deterministic):
// at the start no car is within spawnClearance of the spawn or
// destinationClearance of the destination, and no two cars of a lane
// are closer than MIN_CAR_GAP bumper to bumper.
//
// Zone ghost: a car must never block the delivery. Inside
// GHOST_ZONE_RADIUS of the destination centre a car is non-solid:
// removed from the shared collidables and drawn with a preallocated
// semi-transparent material (swapped by reference). It is solid
// again, and registered again, once it is outside the zone.
//
// Hit stop: a car the taxi hits is a normal solid wall (the vehicle
// puts the taxi back, bounces it and applies one stress). To keep
// the cars from piling stress on, every lane has one speed scale
// shared by all its cars. When any solid car of a lane is "in
// contact" (its box, now or at its next position, grown by
// CONTACT_MARGIN, overlaps the taxi's world box) the scale drops to
// 0 that same frame, stays there for HOLD_TIME after the last
// contact, then rises back to 1 over RESUME_TIME. Sharing the scale
// keeps the spacing, so MIN_CAR_GAP holds through stops and
// restarts. A zone ghost never counts as contact.
// ==================================================

// Bumper-to-bumper gap no two cars of a lane ever get below (m)
export const MIN_CAR_GAP = 8;

// Hard cap per level (collidables are box-tested every frame)
export const MAX_TRAFFIC_CARS = 10;

// A lane may not come within this of an elevated section's footprint
// (x, in metres): flyover xMin 3 -> traffic stays at x < 2
export const FOOTPRINT_MARGIN = 1;

// Cars within this (m, centre to centre) of the destination centre
// are non-solid
export const GHOST_ZONE_RADIUS = 18;

// A solid car this close (m, per side) to the taxi's box, now or at
// its next position, is "in contact" and holds its lane
export const CONTACT_MARGIN = 0.6;

// A lane stays stopped this long after the last contact (s)...
export const HOLD_TIME = 1.0;

// ...then its speed scale rises from 0 to 1 over this long (s)
export const RESUME_TIME = 0.5;

// Opacity of the ghost materials
const GHOST_OPACITY = 0.35;

// The initial layout first tries to keep cars this far apart
// (bumper to bumper), and falls back to MIN_CAR_GAP
const PREFERRED_GAP = 30;

// Placement attempts per car and gap target
const LAYOUT_TRIES = 400;

// Cars do not throw shadows: with the street's own casters they
// would push Level 1 over its draw-call ceiling (budget.mjs)
const CAST_SHADOW = false;


export class TrafficSystem {

  constructor({
    parent,
    registerCollidable = null,
    setCollidableActive = null,
    taxi = null,
    taxiCollisionBox = null
  }) {

    this.parent = parent;

    // First registration of a car (LevelManager remembers it so
    // clearMarkers() can unregister it)
    this.registerCollidable = registerCollidable;

    // (mesh, active): puts a registered car back in / takes it out
    // of the shared collidables, idempotent
    this.setCollidableActive = setCollidableActive;

    // Read-only: the taxi (its matrixWorld) and the vehicle's local
    // collision box
    this.taxi = taxi;
    this.taxiCollisionBox = taxiCollisionBox;

    this.config = null;
    this.destination = null;

    // { x, dir, speed, zLo, zHi, centreLo, centreHi, trackLength,
    //   sinceContact, scale }  (scale: 0..1, shared by the lane's cars)
    this.lanes = [];

    // { mesh, laneIndex, variant, length, width, height, u0, u,
    //   solid, materials, ghostMaterials }
    this.cars = [];

    this.geometries = new Set();
    this.materials = new Map();
    this.ghostMaterials = new Map();

    // Scratch boxes, never reallocated
    this.taxiBox = new THREE.Box3();
    this.carBox = new THREE.Box3();
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
    this.destination = level.destination;

    const random = createRandom(config.seed);
    const range = this.laneRange(level, config);

    // One geometry (and ghost material) per variant, shared by
    // every car of it
    const variants = new Map();

    const variantOf = (name) => {

      let entry = variants.get(name);

      if (!entry) {

        const { geometry, material } =
          createTrafficCar(name, this.materials);

        geometry.computeBoundingBox();

        const size = geometry.boundingBox.getSize(new THREE.Vector3());

        const materials = [].concat(material);

        entry = {
          geometry,
          material,
          ghostMaterial: Array.isArray(material)
            ? materials.map(m => this.ghostOf(m))
            : this.ghostOf(material),
          length: size.z,
          width: size.x,
          height: size.y
        };

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

      const needed = cars.reduce(
        (sum, c) => sum + c.entry.length + MIN_CAR_GAP,
        0
      );

      if (needed > trackLength) {
        throw new Error(
          `traffic: lane x=${laneConfig.x} is too crowded ` +
          `(${laneConfig.count} cars in ${trackLength.toFixed(0)} m)`
        );
      }

      this.checkFootprints(level, laneConfig, widest, range);

      const lane = {
        x: laneConfig.x,
        dir: laneConfig.dir,
        speed: laneConfig.speed,
        zLo: range.lo,
        zHi: range.hi,
        centreLo,
        centreHi,
        trackLength,
        sinceContact: HOLD_TIME + RESUME_TIME,
        scale: 1
      };

      this.lanes.push(lane);

      const offsets = this.layoutLane(
        level, config, lane, cars, random
      );

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
          height: entry.height,
          u0: offsets[i],
          u: 0,
          solid: true,
          materials: entry.material,
          ghostMaterials: entry.ghostMaterial
        });
      });
    });

    this.reset();
  }


  // The semi-transparent twin of a material, one per source
  // material (so one per variant colour), made once at configure
  ghostOf(source) {

    let ghost = this.ghostMaterials.get(source);

    if (!ghost) {

      ghost = source.clone();
      ghost.transparent = true;
      ghost.opacity = GHOST_OPACITY;
      ghost.depthWrite = false;

      this.ghostMaterials.set(source, ghost);
    }

    return ghost;
  }


  // The stretch of road the lanes run on, as { lo, hi } in z. Cars
  // stay wholly inside it, which must be inside the vehicle bounds.
  laneRange(level, config) {

    const lo = Math.min(config.zLo, config.zHi);
    const hi = Math.max(config.zLo, config.zHi);

    if (hi - lo <= 0) {
      throw new Error('traffic: empty lane range');
    }

    const bounds = level.boundaries;

    if (bounds && (lo < bounds.minZ || hi > bounds.maxZ)) {
      throw new Error(
        `traffic: lane range ${lo}..${hi} leaves the vehicle bounds ` +
        `${bounds.minZ}..${bounds.maxZ}`
      );
    }

    return { lo, hi };
  }


  // Seeded initial layout of one lane: the loop offset u of each
  // car. Respects the spawn / destination clearance and the minimum
  // gap (also across the wrap). Tries a roomier gap first so the
  // lane does not bunch into a convoy.
  layoutLane(level, config, lane, cars, random) {

    const spawnZ = level.spawn.z;
    const destZ = level.destination.z;

    const offsets = [];

    const clear = (u, length) => {

      const z = lane.dir < 0
        ? lane.centreHi - u
        : lane.centreLo + u;

      return (
        Math.abs(z - spawnZ) - length / 2 >= config.spawnClearance &&
        Math.abs(z - destZ) - length / 2 >= config.destinationClearance
      );
    };

    const roomy = (u, length, gap) => {

      for (let j = 0; j < offsets.length; j++) {

        let d = Math.abs(u - offsets[j]);
        d = Math.min(d, lane.trackLength - d);

        if (d - (length + cars[j].entry.length) / 2 < gap) {
          return false;
        }
      }

      return true;
    };

    cars.forEach(({ entry }, i) => {

      let placed = null;

      for (const gap of [PREFERRED_GAP, MIN_CAR_GAP]) {

        for (let t = 0; t < LAYOUT_TRIES && placed === null; t++) {

          const u = random() * lane.trackLength;

          if (clear(u, entry.length) && roomy(u, entry.length, gap)) {
            placed = u;
          }
        }

        if (placed !== null) {
          break;
        }
      }

      if (placed === null) {
        throw new Error(
          `traffic: no room for car ${i} of lane x=${lane.x} outside ` +
          'the spawn and destination clearance'
        );
      }

      offsets.push(placed);
    });

    return offsets;
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


  // Back to the initial, seeded layout, every car solid, no hold
  reset() {

    for (const lane of this.lanes) {
      lane.sinceContact = HOLD_TIME + RESUME_TIME;
      lane.scale = 1;
    }

    for (const car of this.cars) {
      car.u = car.u0;
      this.place(car);
      this.setSolid(car, true);
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


  // Solid: registered with the collidables, opaque material.
  // Idempotent.
  setSolid(car, solid) {

    if (car.solid === solid) {
      return;
    }

    car.solid = solid;
    car.mesh.material = solid ? car.materials : car.ghostMaterials;

    this.setCollidableActive?.(car.mesh, solid);
  }


  // Is the car in contact with the taxi: its box swept from the
  // current position to the next one (current + speed * dt), grown
  // by CONTACT_MARGIN, overlaps the taxi's world box? Cars only move
  // along z, so the sweep is one box.
  inContact(car, lane, dt) {

    const { x, z } = car.mesh.position;
    const z1 = z + lane.dir * lane.speed * dt;

    this.carBox.min.set(
      x - car.width / 2 - CONTACT_MARGIN,
      0,
      Math.min(z, z1) - car.length / 2 - CONTACT_MARGIN
    );
    this.carBox.max.set(
      x + car.width / 2 + CONTACT_MARGIN,
      car.height,
      Math.max(z, z1) + car.length / 2 + CONTACT_MARGIN
    );

    return this.carBox.intersectsBox(this.taxiBox);
  }


  // Per frame: no allocations
  update(dt) {

    const checkTaxi = this.taxi !== null && this.taxiCollisionBox !== null;

    if (checkTaxi) {
      this.taxiBox
        .copy(this.taxiCollisionBox)
        .applyMatrix4(this.taxi.matrixWorld);
    }

    // Hold / resume per lane, before anything moves: a lane with a
    // car in contact stops this very frame
    for (let l = 0; l < this.lanes.length; l++) {

      const lane = this.lanes[l];
      let contact = false;

      if (checkTaxi) {
        for (let i = 0; i < this.cars.length && !contact; i++) {

          const car = this.cars[i];

          contact = (
            car.laneIndex === l &&
            !this.inGhostZone(car) &&
            this.inContact(car, lane, dt)
          );
        }
      }

      if (contact) {
        lane.sinceContact = 0;
        lane.scale = 0;
        continue;
      }

      lane.sinceContact = Math.min(
        lane.sinceContact + dt,
        HOLD_TIME + RESUME_TIME
      );

      const t = Math.min(
        Math.max((lane.sinceContact - HOLD_TIME) / RESUME_TIME, 0),
        1
      );

      lane.scale = t * t * (3 - 2 * t);
    }

    for (let i = 0; i < this.cars.length; i++) {

      const car = this.cars[i];
      const lane = this.lanes[car.laneIndex];

      car.u += lane.speed * lane.scale * dt;

      if (car.u >= lane.trackLength) {
        car.u -= lane.trackLength;
      }

      car.mesh.position.z =
        lane.dir < 0
          ? lane.centreHi - car.u
          : lane.centreLo + car.u;

      this.setSolid(car, !this.inGhostZone(car));
    }
  }


  inGhostZone(car) {

    if (!this.destination) {
      return false;
    }

    const dx = car.mesh.position.x - this.destination.x;
    const dz = car.mesh.position.z - this.destination.z;

    return dx * dx + dz * dz <= GHOST_ZONE_RADIUS * GHOST_ZONE_RADIUS;
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

    for (const material of this.ghostMaterials.values()) {
      material.dispose();
    }

    this.cars = [];
    this.lanes = [];
    this.geometries.clear();
    this.materials.clear();
    this.ghostMaterials.clear();
    this.config = null;
    this.destination = null;
  }
}
