import * as THREE from 'three';

export class VehicleController {
  constructor({
    taxi,
    chassis,
    wheels,
    frontWheelPivots,
    cargoSystem,
    collidableObjects,
    potholes
  }) {
    this.taxi = taxi;
    this.chassis = chassis;
    this.wheels = wheels;
    this.frontWheelPivots = frontWheelPivots;
    this.cargoSystem = cargoSystem;
    this.collidableObjects = collidableObjects;
    this.potholes = potholes;

    // Vehicle state.
    this.enabled = true;
    this.speed = 0;
    this.previousSpeed = 0;
    this.steeringAngle = 0;
    this.lateralVelocity = 0;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.previousGroundHeight = 0;
    this.suspensionOffset = 0;
    this.suspensionVelocity = 0;
    this.bodyRoll = 0;
    this.cornerRoll = 0;
    this.wasInPothole = false;
    this.wasOnSpeedBump = false;
    this.wasOnKerb = false;
    this.level3HazardCooldown = 0;
    this.kerbImpactCooldown = 0;

    // Reused values to avoid per-frame allocations.
    this.previousPosition = new THREE.Vector3();

    // Level-controlled configuration.
    this.spawn = {
      x: 0,
      z: 60,
      heading: 0
    };

    this.bounds = {
      minX: -30,
      maxX: 30,
      minZ: -190,
      maxZ: 190
    };

    this.groundHeightProvider = null;
    this.levelSpeedBumps = [];
    this.currentLevel = 1;
    this.highSpeedTime = 0;

    // Collision volumes.
    this.taxiBox = new THREE.Box3();
    this.obstacleBox = new THREE.Box3();

    // Physical taxi collision volume only. This deliberately excludes
    // cargo, headlights, beam cones and other decorative children.
    this.localTaxiCollisionBox = new THREE.Box3(
      new THREE.Vector3(-1.35, 0, -2.3),
      new THREE.Vector3(1.35, 2.8, 2.3)
    );

    this.settings = {
      maxForwardSpeed: 28,
      maxReverseSpeed: 10,
      acceleration: 13,
      reverseAcceleration: 8,
      brakingForce: 24,
      rollingResistance: 4.5,
      airResistance: 0.012,

      maxSteeringAngle: THREE.MathUtils.degToRad(30),
      steeringSpeed: 3.5,
      steeringReturnSpeed: 5,

      // Arcade lateral grip / drift.
      normalGripLowSpeed: 9,
      normalGripHighSpeed: 4.5,
      handbrakeGrip: 1.8,
      normalSlipBuild: 0.35,
      handbrakeSlipBuild: 1.35,
      maxLateralSpeed: 4.5,

      wheelRadius: 0.45,
      gravity: -22,
      suspensionStrength: 38,
      suspensionDamping: 6,
      maxSuspensionMovement: 0.38,

      // Level 2 sustained-speed pressure.
      level2SpeedThreshold: 20,
      level2GraceTime: 3,
      level2StressRate: 1.8,

      // Visual polish.
      cornerRollAmount: 0.09,
      wheelSteeringSmoothness: 8,

      // Level 3 hazard response.
      level3HazardSpeedLoss: 0.3,
      level3HazardStress: 6,
      level3HazardCooldown: 0.6,

      // Level 1 kerb response (called by the world when needed).
      kerbSpeedLoss: 0.08,
      kerbStress: 3,
      kerbCooldown: 0.25
    };

    // Detached cargo can now use the same road/flyover height source.
    if (typeof this.cargoSystem.setGroundHeightProvider === 'function') {
      this.cargoSystem.setGroundHeightProvider(
        (x, z) => this.getGroundHeight(x, z)
      );
    }

    this.reset();
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  getSpeed() {
    return this.speed;
  }

  isGrounded() {
    return this.grounded;
  }

  setLevel(level) {
    this.currentLevel = level;
    this.highSpeedTime = 0;
    this.wasInPothole = false;
    this.wasOnSpeedBump = false;
    this.wasOnKerb = false;
  }

  getLevel() {
    return this.currentLevel;
  }

  setSpawn({
    x = this.spawn.x,
    z = this.spawn.z,
    heading = this.spawn.heading
  } = {}) {
    this.spawn = { x, z, heading };
  }

  setBounds({
    minX = this.bounds.minX,
    maxX = this.bounds.maxX,
    minZ = this.bounds.minZ,
    maxZ = this.bounds.maxZ
  } = {}) {
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  setGroundHeightProvider(provider) {
    if (provider !== null && typeof provider !== 'function') {
      throw new TypeError(
        'Ground height provider must be a function or null.'
      );
    }

    this.groundHeightProvider = provider;
  }

  setLevelSpeedBumps(speedBumps = []) {
  this.levelSpeedBumps = speedBumps;
  this.wasOnSpeedBump = false;
}

  getGroundHeightAt(x, z) {
    return this.getGroundHeight(x, z);
  }

  getHighSpeedTime() {
    return this.highSpeedTime;
  }

  getLevel2Pressure() {
    if (this.currentLevel !== 2) {
      return 0;
    }

    return THREE.MathUtils.clamp(
      this.highSpeedTime / this.settings.level2GraceTime,
      0,
      1
    );
  }

  getState() {
    return {
      level: this.currentLevel,
      speed: this.speed,
      lateralVelocity: this.lateralVelocity,
      grounded: this.grounded,
      steering: this.steeringAngle,
      position: this.taxi.position.clone(),
      cargo: this.cargoSystem.getState()
    };
  }

  // Level 3 hazard API. Member 2 can call this for a non-pothole
  // hazard. Potholes still use the normal pothole physics below.
  triggerLevel3Hazard(severity = 1, side = 1) {
    if (
      this.currentLevel !== 3 ||
      this.level3HazardCooldown > 0 ||
      Math.abs(this.speed) < 2
    ) {
      return;
    }

    severity = THREE.MathUtils.clamp(severity, 0.2, 2);
    side = side >= 0 ? 1 : -1;

    const speedFactor = THREE.MathUtils.clamp(
      Math.abs(this.speed) / 20,
      0.2,
      1.5
    );

    this.speed *= 1 - (
      this.settings.level3HazardSpeedLoss *
      severity *
      speedFactor
    );

    this.suspensionVelocity -= 1.1 * severity * speedFactor;
    this.bodyRoll += side * 0.12 * severity * speedFactor;
    this.lateralVelocity += side * 0.7 * severity * speedFactor;

    this.cargoSystem.velocityX +=
      side * 0.45 * severity * speedFactor;
    this.cargoSystem.velocityZ +=
      0.25 * severity * speedFactor;

    this.cargoSystem.applyStress(
      this.settings.level3HazardStress *
      severity *
      speedFactor
    );

    this.level3HazardCooldown =
      this.settings.level3HazardCooldown;
  }

  // Optional Level 1 API for world/kerb collision zones.
  triggerKerbImpact(severity = 1, side = 1) {
    if (
      this.currentLevel !== 1 ||
      this.kerbImpactCooldown > 0 ||
      Math.abs(this.speed) < 1
    ) {
      return;
    }

    severity = THREE.MathUtils.clamp(severity, 0.2, 2);
    side = side >= 0 ? 1 : -1;

    const speedFactor = THREE.MathUtils.clamp(
      Math.abs(this.speed) / 18,
      0.25,
      1.5
    );

    this.speed *= Math.max(
      1.1,
      1 - this.settings.kerbSpeedLoss * severity * speedFactor
    );

    this.suspensionVelocity -= 0.7 * severity * speedFactor;
    this.bodyRoll += side * 0.07 * severity * speedFactor;
    this.lateralVelocity += side * 0.35 * severity * speedFactor;

    this.cargoSystem.velocityX +=
      side * 0.22 * severity * speedFactor;

    this.cargoSystem.applyStress(
      this.settings.kerbStress * severity * speedFactor
    );

    this.kerbImpactCooldown = this.settings.kerbCooldown;
  }

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------

  reset(spawn = this.spawn) {
    const {
      x = this.spawn.x,
      z = this.spawn.z,
      heading = this.spawn.heading
    } = spawn;

    this.taxi.position.set(x, 0, z);
    this.taxi.rotation.set(0, heading, 0);

    this.speed = 0;
    this.previousSpeed = 0;
    this.steeringAngle = 0;
    this.lateralVelocity = 0;
    this.verticalVelocity = 0;
    this.grounded = true;

    this.previousGroundHeight = this.getGroundHeight(x, z);

    this.suspensionOffset = 0;
    this.suspensionVelocity = 0;
    this.bodyRoll = 0;
    this.cornerRoll = 0;
    this.wasInPothole = false;
    this.wasOnSpeedBump = false;
    this.wasOnKerb = false;
    this.highSpeedTime = 0;
    this.level3HazardCooldown = 0;
    this.kerbImpactCooldown = 0;

    this.chassis.position.set(0, 0, 0);
    this.chassis.rotation.set(0, 0, 0);

    for (const pivot of this.frontWheelPivots) {
      pivot.rotation.y = 0;
    }

    this.cargoSystem.reset();
  }

  // ------------------------------------------------------------------
  // Ground height
  // ------------------------------------------------------------------

  getGroundHeight(x, z) {
    let height = 0;

    // The built-in speed bump is a Level 1 feature only.
    if (this.currentLevel === 1) {
      const bumpCenterZ = 25;
      const bumpDepth = 3;
      const bumpHeight = 0.35;
      const distanceFromBump = Math.abs(z - bumpCenterZ);

      if (
        Math.abs(x) < 7 &&
        distanceFromBump < bumpDepth / 2
      ) {
        const t = 1 - distanceFromBump / (bumpDepth / 2);
        height += Math.sin(t * Math.PI / 2) * bumpHeight;
      }
    }

    // Do not level-gate this list: LevelManager also registers
    // Level 3 hidden potholes here and removes them on level unload.
    for (const pothole of this.potholes) {
      const dx = x - pothole.x;
      const dz = z - pothole.z;
      const distance = Math.hypot(dx, dz);

      if (distance < pothole.radius) {
        const t = distance / pothole.radius;
        const dip = pothole.depth * (
          0.5 + 0.5 * Math.cos(t * Math.PI)
        );
        height -= dip;
      }
    }

    if (this.groundHeightProvider) {
      const levelHeight = this.groundHeightProvider(x, z, height);

      if (Number.isFinite(levelHeight)) {
        height = levelHeight;
      }
    }

    // Add level-specific speed bumps ON TOP
// of the normal road/flyover height.
height +=
  this.getLevelSpeedBumpHeight(
    x,
    z
  );

    return height;
  }

  isOnSpeedBump(x, z) {
    if (this.currentLevel !== 1) {
      return false;
    }

    const bumpCenterZ = 25;
    const bumpDepth = 3;

    return (
      Math.abs(x) < 7 &&
      Math.abs(z - bumpCenterZ) < bumpDepth / 2
    );
  }

  isTouchingKerb(x) {
  // Kerbs are only a Level 1 physics feature.
  if (this.currentLevel !== 1) {
    return false;
  }

  // Visual kerb:
  // centre = +/-8.75
  // width = 0.32
  //
  // Taxi physical collision box:
  // width = 2.7, therefore half-width = 1.35.

  const kerbCentre = 8.75;
  const kerbHalfWidth = 0.16;
  const taxiHalfWidth = 1.35;

  const absX = Math.abs(x);

  const kerbInner =
    kerbCentre - kerbHalfWidth;

  const kerbOuter =
    kerbCentre + kerbHalfWidth;

  const taxiInner =
    absX - taxiHalfWidth;

  const taxiOuter =
    absX + taxiHalfWidth;

  // True whenever the side of the taxi overlaps
  // the thin kerb strip.
  return (
    taxiOuter >= kerbInner &&
    taxiInner <= kerbOuter
  );
}

  getLevelSpeedBumpHeight(x, z) {
  let height = 0;

  for (const bump of this.levelSpeedBumps) {
    const dx = x - bump.x;
    const dz = z - bump.z;

    const heading = bump.heading ?? 0;

    // Convert the taxi position into the bump's
    // local coordinate system.
    const cos = Math.cos(-heading);
    const sin = Math.sin(-heading);

    const localX =
      dx * cos -
      dz * sin;

    const localZ =
      dx * sin +
      dz * cos;

    const halfWidth =
      (bump.width ?? 14) / 2;

    const halfDepth =
      (bump.depth ?? 3) / 2;

    if (
      Math.abs(localX) <= halfWidth &&
      Math.abs(localZ) <= halfDepth
    ) {
      const t =
        1 -
        Math.abs(localZ) /
        halfDepth;

      const bumpHeight =
        Math.sin(
          t * Math.PI
        ) *
        (bump.height ?? 0.35);

      height =
        Math.max(
          height,
          bumpHeight
        );
    }
  }

  return height;
}


isOnLevelSpeedBump(x, z) {
  for (const bump of this.levelSpeedBumps) {
    const dx = x - bump.x;
    const dz = z - bump.z;

    const heading = bump.heading ?? 0;

    const cos = Math.cos(-heading);
    const sin = Math.sin(-heading);

    const localX =
      dx * cos -
      dz * sin;

    const localZ =
      dx * sin +
      dz * cos;

    const halfWidth =
      (bump.width ?? 14) / 2;

    const halfDepth =
      (bump.depth ?? 3) / 2;

    if (
      Math.abs(localX) <= halfWidth &&
      Math.abs(localZ) <= halfDepth
    ) {
      return true;
    }
  }

  return false;
}

  getPotholeHit(x, z) {
    for (const pothole of this.potholes) {
      const dx = x - pothole.x;
      const dz = z - pothole.z;
      const distance = Math.hypot(dx, dz);

      if (distance < pothole.radius) {
        return {
          pothole,
          dx,
          dz,
          distance
        };
      }
    }

    return null;
  }

  // ------------------------------------------------------------------
  // Collision
  // ------------------------------------------------------------------

  checkCollisions(previousPosition) {
    this.taxi.updateWorldMatrix(true, false);

    this.taxiBox
      .copy(this.localTaxiCollisionBox)
      .applyMatrix4(this.taxi.matrixWorld);

    for (const object of this.collidableObjects) {
      this.obstacleBox.setFromObject(object);

      if (this.taxiBox.intersectsBox(this.obstacleBox)) {
        this.taxi.position.copy(previousPosition);

        const impactSpeed = Math.abs(this.speed);

        this.speed *= -0.2;
        this.lateralVelocity *= -0.25;
        this.suspensionVelocity -= 0.6;

        this.cargoSystem.applyStress(
          THREE.MathUtils.clamp(
            impactSpeed * 0.60,
            2,
            17
          )
        );

        return true;
      }
    }

    return false;
  }

  // ------------------------------------------------------------------
  // Level 2 mechanic
  // ------------------------------------------------------------------

  updateLevel2Mechanic(dt) {
    if (this.currentLevel !== 2) {
      this.highSpeedTime = 0;
      return;
    }

    const speed = Math.abs(this.speed);
    const aboveThreshold =
      speed > this.settings.level2SpeedThreshold;

    if (aboveThreshold) {
      this.highSpeedTime += dt;
    } else {
      this.highSpeedTime = Math.max(
        0,
        this.highSpeedTime - dt * 1.5
      );
    }

    if (
      this.highSpeedTime >
      this.settings.level2GraceTime
    ) {
      const excessSpeed =
        speed - this.settings.level2SpeedThreshold;

      const speedPressure = THREE.MathUtils.clamp(
        excessSpeed / 8,
        0.25,
        1.5
      );

      this.cargoSystem.applyStress(
        this.settings.level2StressRate *
        speedPressure *
        dt
      );
    }
  }

  // ------------------------------------------------------------------
  // Update
  // ------------------------------------------------------------------

  update(dt, keys) {
    if (!this.enabled) {
      return;
    }

    if (this.level3HazardCooldown > 0) {
      this.level3HazardCooldown = Math.max(
        0,
        this.level3HazardCooldown - dt
      );
    }

    if (this.kerbImpactCooldown > 0) {
      this.kerbImpactCooldown = Math.max(
        0,
        this.kerbImpactCooldown - dt
      );
    }

    const accelerating = keys.KeyW || keys.ArrowUp;
    const braking = keys.KeyS || keys.ArrowDown;
    const left = keys.KeyA || keys.ArrowLeft;
    const right = keys.KeyD || keys.ArrowRight;
    const handbrake = keys.Space;

    // Acceleration.
    if (accelerating) {
      if (this.speed < -0.5) {
        this.speed += this.settings.brakingForce * dt;
      } else {
        this.speed += this.settings.acceleration * dt;
      }
    }

    // Brake / reverse.
    if (braking) {
      if (this.speed > 0.5) {
        this.speed -= this.settings.brakingForce * dt;
      } else {
        this.speed -= this.settings.reverseAcceleration * dt;
      }
    }

    // Rolling resistance.
    if (!accelerating && !braking) {
      if (this.speed > 0) {
        this.speed -= this.settings.rollingResistance * dt;
        if (this.speed < 0) this.speed = 0;
      } else if (this.speed < 0) {
        this.speed += this.settings.rollingResistance * dt;
        if (this.speed > 0) this.speed = 0;
      }
    }

    // Air resistance.
    this.speed -=
      this.speed *
      Math.abs(this.speed) *
      this.settings.airResistance *
      dt;

    // Handbrake scrubs forward speed but keeps lateral momentum.
    if (handbrake) {
      this.speed *= Math.pow(0.90, dt * 60);
    }

    this.speed = THREE.MathUtils.clamp(
      this.speed,
      -this.settings.maxReverseSpeed,
      this.settings.maxForwardSpeed
    );

    this.updateLevel2Mechanic(dt);

    // Steering.
    let steeringInput = 0;
    if (left) steeringInput += 1;
    if (right) steeringInput -= 1;

    const targetSteering =
      steeringInput * this.settings.maxSteeringAngle;

    if (steeringInput !== 0) {
      this.steeringAngle = THREE.MathUtils.lerp(
        this.steeringAngle,
        targetSteering,
        1 - Math.exp(-this.settings.steeringSpeed * dt)
      );
    } else {
      this.steeringAngle = THREE.MathUtils.lerp(
        this.steeringAngle,
        0,
        1 - Math.exp(-this.settings.steeringReturnSpeed * dt)
      );
    }

    const speedRatio = THREE.MathUtils.clamp(
      Math.abs(this.speed) /
      this.settings.maxForwardSpeed,
      0,
      1
    );

    const steeringSensitivity = THREE.MathUtils.lerp(
      1,
      0.35,
      speedRatio
    );

    const effectiveSteering =
      this.steeringAngle * steeringSensitivity;

    if (Math.abs(this.speed) > 0.2) {
      const handbrakeTurnBoost = handbrake ? 1.15 : 1;

      this.taxi.rotation.y +=
        effectiveSteering *
        this.speed *
        0.065 *
        handbrakeTurnBoost *
        dt;
    }

    // Arcade lateral grip / slip.
    if (this.grounded) {
      const slipBuild = handbrake
        ? this.settings.handbrakeSlipBuild
        : this.settings.normalSlipBuild;

      // The slip is opposite the centre of the turn, so the taxi's
      // rear visibly steps out rather than moving like a train on rails.
      this.lateralVelocity +=
        effectiveSteering *
        this.speed *
        slipBuild *
        dt;

      const grip = handbrake
        ? this.settings.handbrakeGrip
        : THREE.MathUtils.lerp(
            this.settings.normalGripLowSpeed,
            this.settings.normalGripHighSpeed,
            speedRatio
          );

      this.lateralVelocity *= Math.exp(-grip * dt);
    } else {
      // Preserve most sideways momentum while airborne.
      this.lateralVelocity *= Math.exp(-0.15 * dt);
    }

    this.lateralVelocity = THREE.MathUtils.clamp(
      this.lateralVelocity,
      -this.settings.maxLateralSpeed,
      this.settings.maxLateralSpeed
    );

    // Move taxi.
    this.previousPosition.copy(this.taxi.position);

    this.taxi.translateZ(-this.speed * dt);
    this.taxi.translateX(this.lateralVelocity * dt);

    this.checkCollisions(this.previousPosition);
    // --------------------------------------------------
// Level 1 kerb impact
// --------------------------------------------------

const onKerb =
  this.isTouchingKerb(
    this.taxi.position.x
  );

if (
  onKerb &&
  !this.wasOnKerb &&
  this.grounded
) {
  const side =
    this.taxi.position.x >= 0
      ? 1
      : -1;

  this.triggerKerbImpact(
    1,
    side
  );
}

this.wasOnKerb = onKerb;

    // Ground.
    const groundHeight = this.getGroundHeight(
      this.taxi.position.x,
      this.taxi.position.z
    );

    const groundDifference =
      groundHeight - this.previousGroundHeight;

    // Potholes (used by Level 1 and Level 3 registered hazards).
    const potholeHit = this.getPotholeHit(
      this.taxi.position.x,
      this.taxi.position.z
    );

    const insidePothole = potholeHit !== null;

    if (
      insidePothole &&
      !this.wasInPothole &&
      this.grounded
    ) {
      const impact = THREE.MathUtils.clamp(
        Math.abs(this.speed) / 20,
        0.2,
        1.5
      );

      this.suspensionVelocity -= 1.5 * impact;
      this.bodyRoll = THREE.MathUtils.clamp(
        potholeHit.dx * 0.08,
        -0.15,
        0.15
      );

      this.cargoSystem.velocityZ += impact * 0.4;
      this.cargoSystem.velocityX += potholeHit.dx * 0.15;
      this.cargoSystem.applyStress(impact * 9);
    }

    if (
      !insidePothole &&
      this.wasInPothole &&
      this.grounded &&
      Math.abs(this.speed) > 8
    ) {
      this.grounded = false;

      this.verticalVelocity = THREE.MathUtils.clamp(
        Math.abs(this.speed) * 0.09,
        0.7,
        2.5
      );

      this.suspensionVelocity += 0.6;
      this.cargoSystem.velocityZ -=
        Math.abs(this.speed) * 0.02;
    }

    this.wasInPothole = insidePothole;

    const onSpeedBump = this.isOnSpeedBump(
      this.taxi.position.x,
      this.taxi.position.z
    ) ||
  this.isOnLevelSpeedBump(
    this.taxi.position.x,
    this.taxi.position.z
  );

    const leavingSpeedBump =
      this.wasOnSpeedBump && !onSpeedBump;

    // Road suspension.
    if (
      this.grounded &&
      Math.abs(groundDifference) > 0.01
    ) {
      this.suspensionVelocity += groundDifference * 15;
    }

    // Grounded physics.
    if (this.grounded) {
      if (groundHeight > this.taxi.position.y) {
        this.taxi.position.y = groundHeight;
      }

      if (
        leavingSpeedBump &&
        Math.abs(this.speed) > 12
      ) {
        this.grounded = false;

        this.verticalVelocity = Math.min(
          Math.abs(this.speed) * 0.18,
          6
        );

        this.cargoSystem.velocityZ -=
          Math.abs(this.speed) * 0.025;

        this.cargoSystem.applyStress(
          THREE.MathUtils.clamp(
            Math.abs(this.speed) * 0.55,
            4,
            17
          )
        );
      } else {
        this.taxi.position.y = groundHeight;
      }
    }

    // Airborne physics.
    if (!this.grounded) {
      this.verticalVelocity += this.settings.gravity * dt;
      this.taxi.position.y += this.verticalVelocity * dt;

      if (this.taxi.position.y <= groundHeight) {
        const impactSpeed = Math.abs(this.verticalVelocity);
        this.taxi.position.y = groundHeight;

        if (impactSpeed > 1) {
          this.suspensionVelocity -= Math.min(
            impactSpeed * 0.12,
            1.2
          );

          this.cargoSystem.velocityZ += Math.min(
            impactSpeed * 0.08,
            0.8
          );

          this.cargoSystem.applyStress(
            impactSpeed * 2.0
          );
        }

        this.verticalVelocity = 0;
        this.grounded = true;
      }
    }

    this.wasOnSpeedBump = onSpeedBump;
    this.previousGroundHeight = groundHeight;

    // Suspension spring.
    const suspensionForce =
      -this.suspensionOffset *
      this.settings.suspensionStrength;

    const dampingForce =
      -this.suspensionVelocity *
      this.settings.suspensionDamping;

    this.suspensionVelocity +=
      (suspensionForce + dampingForce) * dt;

    this.suspensionOffset +=
      this.suspensionVelocity * dt;

    this.suspensionOffset = THREE.MathUtils.clamp(
      this.suspensionOffset,
      -this.settings.maxSuspensionMovement,
      this.settings.maxSuspensionMovement
    );

    this.chassis.position.y = this.suspensionOffset;

    // Body pitch.
    const accelerationChange =
      (this.speed - this.previousSpeed) /
      Math.max(dt, 0.001);

    const targetPitch = THREE.MathUtils.clamp(
      accelerationChange * 0.003,
      -0.08,
      0.08
    );

    this.chassis.rotation.x = THREE.MathUtils.lerp(
      this.chassis.rotation.x,
      targetPitch,
      1 - Math.exp(-5 * dt)
    );

    // Cornering body roll.
    const cornerSpeedRatio = THREE.MathUtils.clamp(
      Math.abs(this.speed) /
      this.settings.maxForwardSpeed,
      0,
      1
    );

    const targetCornerRoll =
      -steeringInput *
      cornerSpeedRatio *
      this.settings.cornerRollAmount;

    this.cornerRoll = THREE.MathUtils.lerp(
      this.cornerRoll,
      targetCornerRoll,
      1 - Math.exp(-5 * dt)
    );

    const totalRoll = this.bodyRoll + this.cornerRoll;

    this.chassis.rotation.z = THREE.MathUtils.lerp(
      this.chassis.rotation.z,
      totalRoll,
      1 - Math.exp(-8 * dt)
    );

    this.bodyRoll = THREE.MathUtils.lerp(
      this.bodyRoll,
      0,
      1 - Math.exp(-4 * dt)
    );

    // Cargo.
    this.cargoSystem.updateAttached(dt, {
      speed: this.speed,
      previousSpeed: this.previousSpeed,
      steeringInput,
      suspensionVelocity: this.suspensionVelocity,
      lateralVelocity: this.lateralVelocity,
      handbrake,
      level: this.currentLevel
    });

    this.cargoSystem.updateDetached(dt);

    this.previousSpeed = this.speed;

    // Boundaries.
    const oldX = this.taxi.position.x;
    const oldZ = this.taxi.position.z;

    this.taxi.position.x = THREE.MathUtils.clamp(
      this.taxi.position.x,
      this.bounds.minX,
      this.bounds.maxX
    );

    this.taxi.position.z = THREE.MathUtils.clamp(
      this.taxi.position.z,
      this.bounds.minZ,
      this.bounds.maxZ
    );

    if (
      this.taxi.position.x !== oldX ||
      this.taxi.position.z !== oldZ
    ) {
      this.lateralVelocity *= 0.25;
    }

    // Wheel steering. The array contains both the invisible fallback
    // pivots and, once the GLB loads, visual wheel steering pivots.
    for (const pivot of this.frontWheelPivots) {
      pivot.rotation.y = THREE.MathUtils.lerp(
        pivot.rotation.y,
        this.steeringAngle,
        1 - Math.exp(
          -this.settings.wheelSteeringSmoothness * dt
        )
      );
    }

    // Wheel spin. GLB wheels use local Z as their axle; fallback
    // procedural wheels use local X. Taxi.js marks the GLB pivots.
    const wheelRotation =
      this.speed * dt / this.settings.wheelRadius;

    for (const wheel of this.wheels) {
      const axis = wheel.userData.spinAxis || 'x';
      wheel.rotation[axis] -= wheelRotation;
    }
  }
}
