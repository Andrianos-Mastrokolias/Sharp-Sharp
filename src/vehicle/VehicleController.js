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

    this.frontWheelPivots =
      frontWheelPivots;

    this.cargoSystem =
      cargoSystem;

    this.collidableObjects =
      collidableObjects;

    this.potholes =
      potholes;

    // --------------------------------------------------
    // Vehicle state
    // --------------------------------------------------

    this.enabled = true;

    this.speed = 0;

    this.previousSpeed = 0;

    this.steeringAngle = 0;

    this.verticalVelocity = 0;

    this.grounded = true;

    this.previousGroundHeight = 0;

    this.suspensionOffset = 0;

    this.suspensionVelocity = 0;

    this.bodyRoll = 0;

    this.wasInPothole = false;

    // Visual / polish state
this.cornerRoll = 0;

// Level 3 hazard state
this.level3HazardCooldown = 0;

// Reusable vector to avoid creating
// a new Vector3 every frame
this.previousPosition =
  new THREE.Vector3();

  // --------------------------------------------------
// Spawn configuration
// --------------------------------------------------

this.spawn = {
  x: 0,
  z: 60,
  heading: 0
};


// --------------------------------------------------
// World bounds
// --------------------------------------------------

this.bounds = {
  minX: -30,
  maxX: 30,
  minZ: -190,
  maxZ: 190
};

this.groundHeightProvider = null;

// -------------------------------------------------- 
// Level state
// // --------------------------------------------------

this.currentLevel = 1;

this.highSpeedTime = 0;

// --------------------------------------------------
// Collision boxes
// --------------------------------------------------

this.taxiBox =
  new THREE.Box3();

this.obstacleBox =
  new THREE.Box3();

// Physical taxi collision volume.
// Does not include cargo, headlights,
// beam cones or other visual effects.
this.localTaxiCollisionBox =
  new THREE.Box3(
    new THREE.Vector3(
      -1.35,
      0,
      -2.3
    ),

    new THREE.Vector3(
      1.35,
      2.8,
      2.3
    )
  );

// --------------------------------------------------
// Settings
// --------------------------------------------------

this.settings = {
  maxForwardSpeed: 28,

  maxReverseSpeed: 10,

  acceleration: 13,

  reverseAcceleration: 8,

  brakingForce: 24,

  rollingResistance: 4.5,

  airResistance: 0.012,

  maxSteeringAngle:
    THREE.MathUtils.degToRad(
      30
    ),

  steeringSpeed: 3.5,

  steeringReturnSpeed: 5,

  wheelRadius: 0.45,

  gravity: -22,

  suspensionStrength: 38,

  suspensionDamping: 6,

  maxSuspensionMovement:
    0.38,

// ----------------------------------------
// Level 2
// ----------------------------------------

  level2SpeedThreshold: 20,

  level2GraceTime: 3,

  level2StressRate: 1.8,

// ----------------------------------------
// Suspension / wheel polish
// ----------------------------------------

cornerRollAmount: 0.09,

wheelSteeringSmoothness: 8,

// ----------------------------------------
// Level 3
// ----------------------------------------

level3HazardSpeedLoss: 0.3,

level3HazardStress: 6,

level3HazardCooldown: 0.6
    };

    this.reset();
  }

  // --------------------------------------------------
  // Public API
  // --------------------------------------------------

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
    this.currentLevel =
      level;

    this.highSpeedTime = 0;
  }


  getLevel() {
    return this.currentLevel;
  }

  setSpawn({
  x = this.spawn.x,
  z = this.spawn.z,
  heading = this.spawn.heading
} = {}) {
  this.spawn = {
    x,
    z,
    heading
  };
}


setBounds({
  minX = this.bounds.minX,
  maxX = this.bounds.maxX,
  minZ = this.bounds.minZ,
  maxZ = this.bounds.maxZ
} = {}) {
  this.bounds = {
    minX,
    maxX,
    minZ,
    maxZ
  };
}

setGroundHeightProvider(provider) {
  if (
    provider !== null &&
    typeof provider !== 'function'
  ) {
    throw new TypeError(
      'Ground height provider must be a function or null.'
    );
  }

  this.groundHeightProvider =
    provider;
}


  getHighSpeedTime() {
    return this.highSpeedTime;
  }


  getLevel2Pressure() {
    if (
      this.currentLevel !== 2
    ) {
      return 0;
    }


    return THREE.MathUtils.clamp(
      this.highSpeedTime /
      this.settings
        .level2GraceTime,

      0,
      1
    );
  }

  getState() {
  return {
    level: this.currentLevel,

    speed: this.speed,

    grounded: this.grounded,

    steering:
      this.steeringAngle,

    position:
      this.taxi.position.clone(),

    cargo:
      this.cargoSystem.getState()
  };
}

// --------------------------------------------------
// Level 3 hazard response
// --------------------------------------------------

triggerLevel3Hazard(
  severity = 1,
  side = 1
) {
  if (
    this.currentLevel !== 3
  ) {
    return;
  }

  if (
    this.level3HazardCooldown > 0
  ) {
    return;
  }

  // Ignore hazards when almost stationary
  if (
    Math.abs(this.speed) < 2
  ) {
    return;
  }

  severity =
    THREE.MathUtils.clamp(
      severity,
      0.2,
      2
    );

  side =
    side >= 0
      ? 1
      : -1;

  const speedFactor =
    THREE.MathUtils.clamp(
      Math.abs(this.speed) / 20,
      0.2,
      1.5
    );

  // Lose speed
  this.speed *=
    1 -
    (
      this.settings
        .level3HazardSpeedLoss *
      severity *
      speedFactor
    );

  // Suspension impact
  this.suspensionVelocity -=
    1.1 *
    severity *
    speedFactor;

  // Vehicle rolls sideways
  this.bodyRoll +=
    side *
    0.12 *
    severity *
    speedFactor;

  // Cargo shifts
  this.cargoSystem.velocityX +=
    side *
    0.45 *
    severity *
    speedFactor;

  this.cargoSystem.velocityZ +=
    0.25 *
    severity *
    speedFactor;

  // Cargo stress
  this.cargoSystem
    .applyStress(
      this.settings
        .level3HazardStress *
      severity *
      speedFactor
    );

  this.level3HazardCooldown =
    this.settings
      .level3HazardCooldown;
}

  // --------------------------------------------------
  // Reset
  // --------------------------------------------------

  reset(spawn = this.spawn) {
  const {
    x = this.spawn.x,
    z = this.spawn.z,
    heading = this.spawn.heading
  } = spawn;


  this.taxi.position.set(
    x,
    0,
    z
  );


  this.taxi.rotation.set(
    0,
    heading,
    0
  );


  this.speed = 0;

  this.previousSpeed = 0;

  this.steeringAngle = 0;

  this.verticalVelocity = 0;

  this.grounded = true;


  this.previousGroundHeight =
    this.getGroundHeight(
      x,
      z
    );


  this.suspensionOffset = 0;

  this.suspensionVelocity = 0;

  this.bodyRoll = 0;

  this.wasInPothole = false;

  this.wasOnSpeedBump = false;

  this.highSpeedTime = 0;

  this.cornerRoll = 0;

  this.level3HazardCooldown = 0;


  this.chassis.position.set(
    0,
    0,
    0
  );


  this.chassis.rotation.set(
    0,
    0,
    0
  );


  for (
    const pivot
    of this.frontWheelPivots
  ) {
    pivot.rotation.y = 0;
  }


  this.cargoSystem.reset();
}

  // --------------------------------------------------
  // Ground height
  // --------------------------------------------------

  getGroundHeight(
    x,
    z
  ) {
    let height = 0;

    // ----------------------------------------
    // Speed bump
    // ----------------------------------------

    const bumpCenterZ = 25;

    const bumpDepth = 3;

    const bumpHeight = 0.35;


    const distanceFromBump =
      Math.abs(
        z -
        bumpCenterZ
      );


    if (
      Math.abs(x) < 7 &&
      distanceFromBump <
        bumpDepth / 2
    ) {
      const t =
        1 -
        distanceFromBump /
        (
          bumpDepth /
          2
        );


      height +=
        Math.sin(
          t *
          Math.PI /
          2
        ) *
        bumpHeight;
    }

    // ----------------------------------------
    // Potholes
    // ----------------------------------------

    for (
      const pothole
      of this.potholes
    ) {
      const dx =
        x -
        pothole.x;


      const dz =
        z -
        pothole.z;


      const distance =
        Math.sqrt(
          dx * dx +
          dz * dz
        );


      if (
        distance <
        pothole.radius
      ) {
        const t =
          distance /
          pothole.radius;


        const dip =
          pothole.depth *
          (
            0.5 +
            0.5 *
            Math.cos(
              t *
              Math.PI
            )
          );


        height -= dip;
      }
    }

    if (
  this.groundHeightProvider
) {
  const levelHeight =
    this.groundHeightProvider(
      x,
      z,
      height
    );

  if (
    Number.isFinite(
      levelHeight
    )
  ) {
    height =
      levelHeight;
  }
}


    return height;
  }

isOnSpeedBump(
  x,
  z
) {
  const bumpCenterZ = 25;

  const bumpDepth = 3;

  return (
    Math.abs(x) < 7 &&
    Math.abs(
      z -
      bumpCenterZ
    ) <
    bumpDepth / 2
  );
}  


  // --------------------------------------------------
  // Pothole detection
  // --------------------------------------------------

  getPotholeHit(
    x,
    z
  ) {
    for (
      const pothole
      of this.potholes
    ) {
      const dx =
        x -
        pothole.x;


      const dz =
        z -
        pothole.z;


      const distance =
        Math.sqrt(
          dx * dx +
          dz * dz
        );


      if (
        distance <
        pothole.radius
      ) {
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

  // --------------------------------------------------
  // Collision
  // --------------------------------------------------

  checkCollisions(
    previousPosition
  ) {
    this.taxi.updateWorldMatrix(
    true,
    false
  );

  this.taxiBox
    .copy(
      this.localTaxiCollisionBox
    )
    .applyMatrix4(
      this.taxi.matrixWorld
    );


    for (
      const object
      of this.collidableObjects
    ) {
      this.obstacleBox
        .setFromObject(
          object
        );


      if (
        this.taxiBox
          .intersectsBox(
            this.obstacleBox
          )
      ) {
        this.taxi.position.copy(
          previousPosition
        );


        const impactSpeed =
          Math.abs(
            this.speed
          );


        this.speed *= -0.2;


        this.suspensionVelocity -=
          0.6;


        this.cargoSystem
          .applyStress(
            THREE.MathUtils.clamp(
              impactSpeed *
              0.45,

              2,
              12
            )
          );


        return true;
      }
    }


    return false;
  }

  // --------------------------------------------------
  // Level 2 mechanic
  // --------------------------------------------------

  updateLevel2Mechanic(dt) {
    if (
      this.currentLevel !== 2
    ) {
      this.highSpeedTime = 0;
      return;
    }


    const speed =
      Math.abs(
        this.speed
      );


    const aboveThreshold =
      speed >
      this.settings
        .level2SpeedThreshold;


    if (aboveThreshold) {
      this.highSpeedTime +=
        dt;

    } else {
      // Pressure slowly recovers
      this.highSpeedTime -=
        dt *
        1.5;


      this.highSpeedTime =
        Math.max(
          0,
          this.highSpeedTime
        );
    }


    // Straps only start degrading
    // after sustained high speed.
    if (
      this.highSpeedTime >
      this.settings
        .level2GraceTime
    ) {
      const excessSpeed =
        speed -
        this.settings
          .level2SpeedThreshold;


      const speedPressure =
        THREE.MathUtils.clamp(
          excessSpeed /
          8,

          0.25,
          1.5
        );


      this.cargoSystem
        .applyStress(
          this.settings
            .level2StressRate *
          speedPressure *
          dt
        );
    }
  }

  // --------------------------------------------------
  // Update
  // --------------------------------------------------

  update(
    dt,
    keys
  ) {
    if (
      !this.enabled
    ) {
      return;
    }

    if (
  this.level3HazardCooldown > 0
) {
  this.level3HazardCooldown -=
    dt;

  this.level3HazardCooldown =
    Math.max(
      0,
      this.level3HazardCooldown
    );
}


    const accelerating =
      keys.KeyW ||
      keys.ArrowUp;


    const braking =
      keys.KeyS ||
      keys.ArrowDown;


    const left =
      keys.KeyA ||
      keys.ArrowLeft;


    const right =
      keys.KeyD ||
      keys.ArrowRight;


    const handbrake =
      keys.Space;

    // --------------------------------------------------
    // Acceleration
    // --------------------------------------------------

    if (accelerating) {
      if (
        this.speed <
        -0.5
      ) {
        this.speed +=
          this.settings
            .brakingForce *
          dt;

      } else {
        this.speed +=
          this.settings
            .acceleration *
          dt;
      }
    }

    // --------------------------------------------------
    // Brake / reverse
    // --------------------------------------------------

    if (braking) {
      if (
        this.speed >
        0.5
      ) {
        this.speed -=
          this.settings
            .brakingForce *
          dt;

      } else {
        this.speed -=
          this.settings
            .reverseAcceleration *
          dt;
      }
    }

    // --------------------------------------------------
    // Resistance
    // --------------------------------------------------

    if (
      !accelerating &&
      !braking
    ) {
      if (
        this.speed > 0
      ) {
        this.speed -=
          this.settings
            .rollingResistance *
          dt;


        if (
          this.speed < 0
        ) {
          this.speed = 0;
        }

      } else if (
        this.speed < 0
      ) {
        this.speed +=
          this.settings
            .rollingResistance *
          dt;


        if (
          this.speed > 0
        ) {
          this.speed = 0;
        }
      }
    }


    // Air resistance
    this.speed -=
      this.speed *
      Math.abs(
        this.speed
      ) *
      this.settings
        .airResistance *
      dt;


    // Handbrake
    if (handbrake) {
      this.speed *=
        Math.pow(
          0.90,
          dt *
          60
        );
    }


    // Clamp speed
    this.speed =
      THREE.MathUtils.clamp(
        this.speed,

        -this.settings
          .maxReverseSpeed,

        this.settings
          .maxForwardSpeed
      );

    // --------------------------------------------------
    // LEVEL 2 SUSTAINED-SPEED MECHANIC
    // --------------------------------------------------

    this.updateLevel2Mechanic(
      dt
    );

    // --------------------------------------------------
    // Steering
    // --------------------------------------------------

    let steeringInput = 0;


    if (left) {
      steeringInput += 1;
    }


    if (right) {
      steeringInput -= 1;
    }


    const targetSteering =
      steeringInput *
      this.settings
        .maxSteeringAngle;


    if (
      steeringInput !== 0
    ) {
      this.steeringAngle =
        THREE.MathUtils.lerp(
          this.steeringAngle,

          targetSteering,

          1 -
          Math.exp(
            -this.settings
              .steeringSpeed *
            dt
          )
        );

    } else {
      this.steeringAngle =
        THREE.MathUtils.lerp(
          this.steeringAngle,

          0,

          1 -
          Math.exp(
            -this.settings
              .steeringReturnSpeed *
            dt
          )
        );
    }


    const speedRatio =
      THREE.MathUtils.clamp(
        Math.abs(
          this.speed
        ) /
        this.settings
          .maxForwardSpeed,

        0,
        1
      );


    const steeringSensitivity =
      THREE.MathUtils.lerp(
        1,
        0.35,
        speedRatio
      );


    const effectiveSteering =
      this.steeringAngle *
      steeringSensitivity;


    if (
      Math.abs(
        this.speed
      ) >
      0.2
    ) {
      this.taxi.rotation.y +=
        effectiveSteering *
        this.speed *
        0.065 *
        dt;
    }

    // --------------------------------------------------
    // Move taxi
    // --------------------------------------------------

    this.previousPosition.copy(
     this.taxi.position
    );


    this.taxi.translateZ(
      -this.speed *
      dt
    );


    this.checkCollisions(
      this.previousPosition
    );

    // --------------------------------------------------
    // Ground
    // --------------------------------------------------

    const groundHeight =
      this.getGroundHeight(
        this.taxi.position.x,
        this.taxi.position.z
      );


    const groundDifference =
      groundHeight -
      this.previousGroundHeight;

    // --------------------------------------------------
    // Potholes
    // --------------------------------------------------

    const potholeHit =
      this.getPotholeHit(
        this.taxi.position.x,
        this.taxi.position.z
      );


    const insidePothole =
      potholeHit !== null;


    if (
      insidePothole &&
      !this.wasInPothole &&
      this.grounded
    ) {
      const impact =
        THREE.MathUtils.clamp(
          Math.abs(
            this.speed
          ) /
          20,

          0.2,
          1.5
        );


      this.suspensionVelocity -=
        1.5 *
        impact;


      this.bodyRoll =
        THREE.MathUtils.clamp(
          potholeHit.dx *
          0.08,

          -0.15,
          0.15
        );


      this.cargoSystem
        .velocityZ +=
        impact *
        0.4;


      this.cargoSystem
        .velocityX +=
        potholeHit.dx *
        0.15;


      this.cargoSystem
        .applyStress(
          impact *
          4
        );
    }


    if (
      !insidePothole &&
      this.wasInPothole &&
      this.grounded
    ) {
      if (
        Math.abs(
          this.speed
        ) >
        8
      ) {
        this.grounded = false;


        this.verticalVelocity =
          THREE.MathUtils.clamp(
            Math.abs(
              this.speed
            ) *
            0.09,

            0.7,
            2.5
          );


        this.suspensionVelocity +=
          0.6;


        this.cargoSystem
          .velocityZ -=
          Math.abs(
            this.speed
          ) *
          0.02;
      }
    }


    this.wasInPothole =
      insidePothole;

const onSpeedBump =
  this.isOnSpeedBump(
    this.taxi.position.x,
    this.taxi.position.z
  );


const leavingSpeedBump =
  this.wasOnSpeedBump &&
  !onSpeedBump;

    // --------------------------------------------------
    // Road suspension
    // --------------------------------------------------

    if (
      this.grounded &&
      Math.abs(
        groundDifference
      ) >
      0.01
    ) {
      this.suspensionVelocity +=
        groundDifference *
        15;
    }

    // --------------------------------------------------
    // Grounded physics
    // --------------------------------------------------

    if (
      this.grounded
    ) {
      if (
        groundHeight >
        this.taxi.position.y
      ) {
        this.taxi.position.y =
          groundHeight;
      }

      if (
        leavingSpeedBump &&
        Math.abs(
          this.speed
        ) >
        12
      ) {
        this.grounded = false;


        this.verticalVelocity =
          Math.min(
            Math.abs(
              this.speed
            ) *
            0.18,

            6
          );


        this.cargoSystem
          .velocityZ -=
          Math.abs(
            this.speed
          ) *
          0.025;


        this.cargoSystem
          .applyStress(
            THREE.MathUtils.clamp(
              Math.abs(
                this.speed
              ) *
              0.18,

              2,
              8
            )
          );

      } else {
        this.taxi.position.y =
          groundHeight;
      }
    }

    // --------------------------------------------------
    // Airborne physics
    // --------------------------------------------------

    if (
      !this.grounded
    ) {
      this.verticalVelocity +=
        this.settings
          .gravity *
        dt;


      this.taxi.position.y +=
        this.verticalVelocity *
        dt;


      if (
        this.taxi.position.y <=
        groundHeight
      ) {
        const impactSpeed =
          Math.abs(
            this.verticalVelocity
          );


        this.taxi.position.y =
          groundHeight;


        if (
          impactSpeed >
          1
        ) {
          this.suspensionVelocity -=
            Math.min(
              impactSpeed *
              0.12,

              1.2
            );


          this.cargoSystem
            .velocityZ +=
            Math.min(
              impactSpeed *
              0.08,

              0.8
            );


          this.cargoSystem
            .applyStress(
              impactSpeed *
              1.4
            );
        }


        this.verticalVelocity = 0;

        this.grounded = true;
      }
    }

    this.wasOnSpeedBump =
    onSpeedBump;

    this.previousGroundHeight =
      groundHeight;

    // --------------------------------------------------
    // Suspension
    // --------------------------------------------------

    const suspensionForce =
      -this.suspensionOffset *
      this.settings
        .suspensionStrength;


    const dampingForce =
      -this.suspensionVelocity *
      this.settings
        .suspensionDamping;


    this.suspensionVelocity +=
      (
        suspensionForce +
        dampingForce
      ) *
      dt;


    this.suspensionOffset +=
      this.suspensionVelocity *
      dt;


    this.suspensionOffset =
      THREE.MathUtils.clamp(
        this.suspensionOffset,

        -this.settings
          .maxSuspensionMovement,

        this.settings
          .maxSuspensionMovement
      );


    this.chassis.position.y =
      this.suspensionOffset;

    // --------------------------------------------------
    // Body pitch
    // --------------------------------------------------

    const accelerationChange =
      (
        this.speed -
        this.previousSpeed
      ) /
      Math.max(
        dt,
        0.001
      );


    const targetPitch =
      THREE.MathUtils.clamp(
        accelerationChange *
        0.003,

        -0.08,
        0.08
      );


    this.chassis.rotation.x =
      THREE.MathUtils.lerp(
        this.chassis.rotation.x,

        targetPitch,

        1 -
        Math.exp(
          -5 *
          dt
        )
      );

    // --------------------------------------------------
    // Body roll
    // --------------------------------------------------

    // --------------------------------------------------
// Cornering body roll
// --------------------------------------------------

const cornerSpeedRatio =
  THREE.MathUtils.clamp(
    Math.abs(
      this.speed
    ) /
    this.settings
      .maxForwardSpeed,

    0,
    1
  );


const targetCornerRoll =
  -steeringInput *
  cornerSpeedRatio *
  this.settings
    .cornerRollAmount;


this.cornerRoll =
  THREE.MathUtils.lerp(
    this.cornerRoll,

    targetCornerRoll,

    1 -
    Math.exp(
      -5 *
      dt
    )
  );


const totalRoll =
  this.bodyRoll +
  this.cornerRoll;


this.chassis.rotation.z =
  THREE.MathUtils.lerp(
    this.chassis.rotation.z,

    totalRoll,

    1 -
    Math.exp(
      -8 *
      dt
    )
  );


this.bodyRoll =
  THREE.MathUtils.lerp(
    this.bodyRoll,

    0,

    1 -
    Math.exp(
      -4 *
      dt
    )
  );


    // --------------------------------------------------
    // Cargo
    // --------------------------------------------------

    this.cargoSystem
      .updateAttached(
        dt,
        {
          speed:
            this.speed,

          previousSpeed:
            this.previousSpeed,

          steeringInput,

          suspensionVelocity:
            this.suspensionVelocity
        }
      );


    this.cargoSystem
      .updateDetached(
        dt
      );


    this.previousSpeed =
      this.speed;

    // --------------------------------------------------
    // Boundaries
    // --------------------------------------------------

    this.taxi.position.x =
  THREE.MathUtils.clamp(
    this.taxi.position.x,
    this.bounds.minX,
    this.bounds.maxX
  );

this.taxi.position.z =
  THREE.MathUtils.clamp(
    this.taxi.position.z,
    this.bounds.minZ,
    this.bounds.maxZ
  );

    // --------------------------------------------------
    // Wheel steering
    // --------------------------------------------------

    for (
  const pivot
  of this.frontWheelPivots
) {
  pivot.rotation.y =
    THREE.MathUtils.lerp(
      pivot.rotation.y,

      this.steeringAngle,

      1 -
      Math.exp(
        -this.settings
          .wheelSteeringSmoothness *
        dt
      )
    );
}

    // --------------------------------------------------
    // Wheel spin
    // --------------------------------------------------

    const wheelRotation =
      this.speed *
      dt /
      this.settings
        .wheelRadius;


    for (
      const wheel
      of this.wheels
    ) {
      wheel.rotation.x -=
        wheelRotation;
    }
  }
}