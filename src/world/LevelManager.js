import * as THREE from 'three';

// ==================================================
// LEVEL DEFINITIONS
// --------------------------------------------------
// Data only. The shared road/buildings are still built
// in main.js (one straight road along Z, x = 0), so a
// level is currently: where you start, where you must
// deliver, and the hazards/limits that apply.
//
// Facing: heading 0 = driving towards -Z (matches
// VehicleController.reset()).
// ==================================================

// Sent to vehicle.setBounds() on load. Level 2 is still squeezed
// into the old +-30 / +-190 box; give a level its own numbers
// here when it needs more room - warnIfRouteOutOfBounds() will
// flag any route that outgrows them.
const VEHICLE_BOUNDS = {
  minX: -30,
  maxX: 30,
  minZ: -190,
  maxZ: 190
};

// A raised section only lifts the taxi if it is already near the
// deck surface (or at the ramp toe), so driving on the ground
// underneath does not snap it up onto the deck.
const ELEVATION_ENTRY_MAX = 0.3;
const ELEVATION_ENTRY_TOLERANCE = 0.6;


export const LEVELS = {

  1: {
    name: 'Rank to CBD',

    spawn: {
      x: 0,
      z: 60,
      heading: 0
    },

    // Waypoints are for the route guide / future traffic
    // and pursuit paths. The last one is the destination.
    route: [
      { x: 0, z: 60 },
      { x: 0, z: -150 }
    ],

    destination: {
      x: 0,
      z: -150,
      radius: 8,

      // Taxi must be (nearly) stopped inside the zone
      maxDeliverSpeed: 4
    },

    // The vehicle also hard-clamps to x +-30, z +-190
    boundaries: VEHICLE_BOUNDS
  },


  2: {
    name: 'The Highway',

    // Midday visuals/speed tuning are applied elsewhere
    // (applyLevelVisuals / vehicle.setLevel).

    spawn: {
      x: 0,
      z: 170,
      heading: 0
    },

    // Default guide route (the ground lane).
    route: [
      { x: 0, z: 170 },
      { x: 0, z: -165 }
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
          { x: 0, z: -165 }
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
          { x: 0, z: -165 }
        ]
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
      z: -165,
      radius: 8,
      maxDeliverSpeed: 4
    },

    // TODO(setBounds): shared with every level for now - see
    // VEHICLE_BOUNDS. This route is squeezed into the road
    // (x +-9) and z +-170 purely because of that clamp.
    boundaries: VEHICLE_BOUNDS
  },


  3: {
    name: 'Load Shedding',

    // Night visuals (fog, sun, HDRI) come from the graphics
    // managers via applyLevelVisuals(3).

    // Drives the road the other way round (+Z), so heading is PI.
    spawn: {
      x: 0,
      z: -170,
      heading: Math.PI
    },

    // A back road: wanders across the carriageway rather than
    // running straight. Guide only - nothing enforces it.
    route: [
      { x: 0, z: -170 },
      { x: 0, z: -130 },
      { x: 5, z: -100 },
      { x: 5, z: -70 },
      { x: -5, z: -30 },
      { x: -5, z: 10 },
      { x: 3, z: 50 },
      { x: 3, z: 90 },
      { x: 0, z: 125 },
      { x: 0, z: 165 }
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

    destination: {
      x: 0,
      z: 165,
      radius: 8,
      maxDeliverSpeed: 4
    },

    boundaries: VEHICLE_BOUNDS
  }
};


export class LevelManager {

  constructor({
    scene,
    vehicle,
    taxi,
    collidables = null,
    potholes = null,
    getHeadlightsEnabled = null,
    onDelivered = null
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

    this.scene = scene;
    this.vehicle = vehicle;
    this.taxi = taxi;
    this.onDelivered = onDelivered;

    this.levelId = null;
    this.config = null;

    // 'none' | 'driving' | 'delivered'
    this.status = 'none';

    this.elapsed = 0;

    this.group = new THREE.Group();
    this.scene.add(this.group);

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
        color: 0x0b0b0c,
        roughness: 1
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
        opacity: 0.22,
        depthWrite: false
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

    this.buildMarkers();
    this.buildElevated();
    this.buildHazards();
    this.reset();

    return true;
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

    this.setZoneDelivered(false);
  }


  // --------------------------------------------------
  // Per-frame
  // --------------------------------------------------

  update(dt, time = 0) {

    if (this.status !== 'driving') {
      return;
    }

    this.elapsed += dt;

    if (!this.headlightsOn()) {
      this.headlightsOffTime += dt;
    }

    // Gentle pulse so the zone reads from a distance
    this.zoneMaterial.opacity =
      0.35 + Math.sin(time * 4) * 0.12;

    if (this.isInDeliveryZone()) {
      this.deliver();
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

      // Level 3 tradeoff: dark = hazards hidden, but (once
      // pursuit exists) also harder to spot.
      headlightsOn: this.headlightsOn(),
      headlightsOffTime: this.headlightsOffTime,

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

  buildMarkers() {

    const { spawn, destination } = this.config;

    // Taxi rank bay
    const rank = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 9),
      new THREE.MeshBasicMaterial({
        color: 0xe1b300,
        transparent: true,
        opacity: 0.35
      })
    );

    rank.rotation.x = -Math.PI / 2;
    rank.position.set(spawn.x, 0.03, spawn.z);
    this.group.add(rank);

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


  clearMarkers() {

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

    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
    }
  }
}
