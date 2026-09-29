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
    boundaries: {
      minX: -30,
      maxX: 30,
      minZ: -190,
      maxZ: 190
    }
  }
};


export class LevelManager {

  constructor({
    scene,
    vehicle,
    taxi,
    onDelivered = null
  }) {

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
  // (levels 2 and 3), leaving the free-roam road as is.
  load(levelId) {

    this.clearMarkers();

    this.levelId = levelId;
    this.config = LEVELS[levelId] ?? null;

    if (!this.config) {
      this.status = 'none';
      return false;
    }

    this.buildMarkers();
    this.reset();

    return true;
  }


  // Puts the taxi back on the spawn point. Call after
  // vehicle.reset(), which hardcodes its own spawn.
  reset() {

    this.elapsed = 0;

    if (!this.config) {
      this.status = 'none';
      return;
    }

    this.status = 'driving';

    const { spawn } = this.config;

    this.taxi.position.set(spawn.x, 0, spawn.z);
    this.taxi.rotation.set(0, spawn.heading, 0);

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

    // Gentle pulse so the zone reads from a distance
    this.zoneMaterial.opacity =
      0.35 + Math.sin(time * 4) * 0.12;

    if (this.isInDeliveryZone()) {
      this.deliver();
    }
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


  setZoneDelivered(delivered) {

    const color = delivered ? 0x3ddc84 : 0xffcf4a;

    this.zoneMaterial.color.setHex(color);
    this.beamMaterial.color.setHex(color);
  }


  clearMarkers() {

    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.geometry?.dispose();
    }
  }
}
