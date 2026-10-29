
import * as THREE from 'three';
import { createTrafficCar } from './environments/props.js';

const clamp = THREE.MathUtils.clamp;
const ACCELERATION = 11;
const BRAKING = 19;
const LANE_CHANGE_SPEED = 2.8;
const SAFETY_GAP = 0.55;

const DEFAULT_COLOURS = [
  0xffffff, 0xe9bd65, 0x77a8cf, 0xe88c81,
  0xb8d595, 0xb99ad8, 0xd9d9d9, 0xf0c8a0
];

export class RivalTaxiSystem {
  constructor({
    parent,
    registerCollidable,
    setCollidableActive = null,
    unregisterCollidable = null,
    createMesh = null,
    onBeaten = null
  }) {
    this.parent = parent;
    this.registerCollidable = registerCollidable;
    this.setCollidableActive = setCollidableActive;
    this.unregisterCollidable = unregisterCollidable;
    this.createMesh = createMesh;
    this.onBeaten = onBeaten;

    this.rivals = [];
    this.road = null;
    this.direction = -1;
    this.launched = false;
    this.time = 0;

    this.geometry = null;
    this.materialCache = new Map();
    this.ownedMaterials = [];
  }

  configure({ rivals = [], road, direction = -1 }) {
    this.dispose();

    if (!road || !(road.halfWidth > 0)) {
      throw new Error('RivalTaxiSystem requires road.halfWidth');
    }

    if (direction !== -1 && direction !== 1) {
      throw new Error('Rival taxi direction must be -1 or 1');
    }

    this.road = road;
    this.direction = direction;

    const model = createTrafficCar('minibus', this.materialCache);
    this.geometry = model.geometry;
    this.geometry.computeBoundingBox();

    const size = this.geometry.boundingBox.getSize(
      new THREE.Vector3()
    );

    const width = size.x;
    const length = size.z;

    for (let i = 0; i < rivals.length; i++) {
      const cfg = rivals[i];
      const colour =
        cfg.colour ?? DEFAULT_COLOURS[i % DEFAULT_COLOURS.length];

      const paint = model.material[0].clone();
      paint.color.set(colour);
      this.ownedMaterials.push(paint);

      const material = [paint, model.material[1]];

      const mesh = this.createMesh?.({
        index: i,
        geometry: this.geometry,
        material,
        colour,
        personality: cfg.personality
      }) ?? new THREE.Mesh(this.geometry, material);

      if (!mesh.isMesh || mesh.children.length !== 0) {
        throw new Error('Each rival must be one childless Mesh');
      }

      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.name = `rival-taxi-${i}`;
      mesh.userData.rival = true;
      mesh.userData.rivalIndex = i;
      mesh.userData.velocity = new THREE.Vector3();

      const initialX = clamp(
        cfg.x,
        -road.halfWidth + width / 2,
        road.halfWidth - width / 2
      );

      const initialZ = clamp(
        cfg.z,
        road.zMin + length / 2,
        road.zMax - length / 2
      );

      const rival = {
        index: i,
        mesh,
        initialX,
        initialZ,
        initialHeading: cfg.heading ?? (direction < 0 ? 0 : Math.PI),
        x: initialX,
        z: initialZ,
        width,
        length,
        speed: 0,
        topSpeed: clamp(cfg.topSpeed ?? 20, 16, 24),
        personality: cfg.personality ?? 'racer',
        targetX: initialX,
        laneDirection: i % 2 ? 1 : -1,
        nextLaneChange: 1.2 + (i % 4) * 0.3,
        seenBehind: false,
        beaten: false,
        released: false
      };

      this.parent.add(mesh);
      this.registerCollidable?.(mesh);
      this.rivals.push(rival);
    }

    this.reset();
  }

  launch() {
    this.launched = true;
  }

  // Returns true if the proposed footprint would overlap
  // another rival or the player's taxi.
  blocked(car, x, z, player) {
    for (let j = 0; j < this.rivals.length; j++) {
      const other = this.rivals[j];
      if (other === car || other.released) continue;

      if (
        Math.abs(x - other.x) <
          (car.width + other.width) / 2 + SAFETY_GAP &&
        Math.abs(z - other.z) <
          (car.length + other.length) / 2 + SAFETY_GAP
      ) {
        return true;
      }
    }

    if (player) {
      // Conservative player footprint. Extra clearance helps
      // when the taxi turns or drifts.
      const playerHalfWidth = 1.65;
      const playerHalfLength = 2.65;

      if (
        Math.abs(x - player.x) <
          car.width / 2 + playerHalfWidth + SAFETY_GAP &&
        Math.abs(z - player.z) <
          car.length / 2 + playerHalfLength + SAFETY_GAP
      ) {
        return true;
      }
    }

    return false;
  }

  // Check for someone directly behind the rival.
  someoneBehind(car, player) {
    if (player) {
      const behind =
        this.direction * (player.z - car.z);

      if (
        behind < -3 &&
        behind > -15 &&
        Math.abs(player.x - car.x) < 2.4
      ) {
        return true;
      }
    }

    for (let j = 0; j < this.rivals.length; j++) {
      const other = this.rivals[j];
      if (other === car || other.released) continue;

      const behind =
        this.direction * (other.z - car.z);

      if (
        behind < -3 &&
        behind > -12 &&
        Math.abs(other.x - car.x) < 2.4
      ) {
        return true;
      }
    }

    return false;
  }

 
update(dt, player = null) {
  if (!this.launched || !this.road || !(dt > 0)) return;

  // Cap large frame jumps to prevent tunnelling.
  dt = Math.min(dt, 1 / 30);
  this.time += dt;

  for (let i = 0; i < this.rivals.length; i++) {
    const car = this.rivals[i];
    if (car.released) continue;

    const oldX = car.x;
    const oldZ = car.z;

    let desiredSpeed = car.topSpeed;
    let targetX = car.initialX;

    switch (car.personality) {
      
      case 'weaver': {
        // Positive means the player is ahead of this rival.
        const gapToPlayer = player
          ? this.direction * (player.z - car.z)
          : Infinity;

        const sameLane = player &&
          Math.abs(player.x - car.initialX) < 2.5;

        // Commit to a wider lane change when passing the player.
        // Keep the manoeuvre until the rival is safely ahead.
        if (
          sameLane &&
          gapToPlayer > -12 &&
          gapToPlayer < 28
        ) {
          targetX = player.x + car.laneDirection * 4.2;
        } else {
          // Normal weaving when not overtaking the player.
          if (this.time >= car.nextLaneChange) {
            car.laneDirection *= -1;
            car.nextLaneChange =
              this.time + 1.2 + (i % 4) * 0.25;
          }

          targetX =
            car.initialX + car.laneDirection * 2.7;
        }

        break;
      }


      case 'brake-checker':
        if (this.someoneBehind(car, player)) {
          desiredSpeed = Math.min(7, car.topSpeed);
        }
        break;

      case 'cutter':
        if (
          player &&
          Math.abs(player.z - car.z) < 11 &&
          Math.abs(player.x - car.x) < 5
        ) {
          const side = car.x < player.x ? -1 : 1;
          targetX = player.x + side * 2.8;
        }
        break;

      case 'racer':
      default:
        break;
    }

    const edge = this.road.halfWidth - car.width / 2;
    targetX = clamp(targetX, -edge, edge);

    const rate =
      desiredSpeed < car.speed ? BRAKING : ACCELERATION;

    car.speed += clamp(
      desiredSpeed - car.speed,
      -rate * dt,
      rate * dt
    );

    const stepX = clamp(
      targetX - car.x,
      -LANE_CHANGE_SPEED * dt,
      LANE_CHANGE_SPEED * dt
    );

    let nextX = clamp(car.x + stepX, -edge, edge);
    let nextZ = clamp(
      car.z + this.direction * car.speed * dt,
      this.road.zMin + car.length / 2,
      this.road.zMax - car.length / 2
    );

    // Try intended movement, then forward-only or
    // sideways-only movement before stopping altogether.
    if (this.blocked(car, nextX, nextZ, player)) {
      if (!this.blocked(car, car.x, nextZ, player)) {
        nextX = car.x;
      } else if (!this.blocked(car, nextX, car.z, player)) {
        nextZ = car.z;
      } else {
        nextX = car.x;
        nextZ = car.z;
      }
    }

    car.x = nextX;
    car.z = nextZ;

    car.mesh.position.set(car.x, 0, car.z);

    car.mesh.userData.velocity.set(
      (car.x - oldX) / dt,
      0,
      (car.z - oldZ) / dt
    );

    // Keep physical speed consistent if traffic blocks us.
    car.speed = Math.max(
      0,
      this.direction * (car.z - oldZ) / dt
    );

    // Every rival is eligible to be beaten after launch,
    // regardless of its original starting position.
    // Every rival is eligible to be beaten after launch,
// regardless of its original starting position.

    // Count only genuine overtakes.
    // A rival must first be ahead of the player.
    if (player && !car.beaten) {
      const relative =
        this.direction * (player.z - car.z);

      if (relative < -3) {
        car.seenBehind = true;
      }

      // The player's taxi must fully clear the rival.
      const clearance = (car.length + 4.6) / 2;

      if (car.seenBehind && relative > clearance) {
        car.beaten = true;
        this.onBeaten?.(car.index);
      }
    }

  }
}


  release(index) {
    const car = this.rivals[index];
    if (!car || car.released) return;

    car.released = true;
    car.speed = 0;
    car.mesh.visible = false;
    car.mesh.userData.velocity.set(0, 0, 0);

    this.setCollidableActive?.(car.mesh, false);

    // Prevent an invisible collision even if the integration
    // has not yet supplied setCollidableActive.
    car.mesh.position.set(0, -10000, 0);
  }

  getRivals() {
    // Snapshots are allocated only when explicitly requested,
    // never during update().
    return this.rivals.map(car => ({
      x: car.x,
      z: car.z,
      speed: car.speed,
      beaten: car.beaten
    }));
  }

  reset() {
    this.launched = false;
    this.time = 0;

    for (const car of this.rivals) {
      car.x = car.initialX;
      car.z = car.initialZ;
      car.speed = 0;
      car.targetX = car.initialX;
      car.nextLaneChange = 1.2 + (car.index % 4) * 0.3;
      car.laneDirection = car.index % 2 ? 1 : -1;
      car.seenBehind = false;
      car.beaten = false;
      car.released = false;

      car.mesh.visible = true;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.initialHeading;
      car.mesh.userData.velocity.set(0, 0, 0);

      this.setCollidableActive?.(car.mesh, true);
    }
  }

  dispose() {
    for (const car of this.rivals) {
      this.setCollidableActive?.(car.mesh, false);
      this.unregisterCollidable?.(car.mesh);
      car.mesh.position.set(0, -10000, 0);
      car.mesh.parent?.remove(car.mesh);
    }

    this.geometry?.dispose();

    for (const material of this.ownedMaterials) {
      material.dispose();
    }

    for (const material of this.materialCache.values()) {
      material.dispose();
    }

    this.rivals.length = 0;
    this.ownedMaterials.length = 0;
    this.materialCache.clear();
    this.geometry = null;
    this.road = null;
    this.launched = false;
  }
}
