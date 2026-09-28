import * as THREE from 'three';

export class CargoSystem {
  constructor({
    scene,
    chassis,
    taxi,
    cargoItems,
    gravity = -22,
    onCargoLost = null
  }) {
    this.scene = scene;

    this.chassis = chassis;

    this.taxi = taxi;

    this.gravity = gravity;

    this.onCargoLost =
      onCargoLost;

    this.strapCondition = 100;

    this.shiftX = 0;
    this.shiftZ = 0;

    this.velocityX = 0;
    this.velocityZ = 0;

    this.items =
      cargoItems.map(
        (cargo) => ({
          name:
            cargo.name,

          mesh:
            cargo.mesh,

          vulnerability:
            cargo.vulnerability,

          startPosition:
            cargo.mesh.position.clone(),

          stability: 100,

          attached: true,

          velocity:
            new THREE.Vector3(),

          spin:
            new THREE.Vector3()
        })
      );
  }

  // --------------------------------------------------
  // Cargo state API
  // --------------------------------------------------

  getRemaining() {
    return this.items.filter(
      (item) =>
        item.attached
    ).length;
  }


  getAverageStability() {
    const attached =
      this.items.filter(
        (item) =>
          item.attached
      );


    if (
      attached.length === 0
    ) {
      return 0;
    }


    let total = 0;


    for (
      const item
      of attached
    ) {
      total +=
        item.stability;
    }


    return (
      total /
      attached.length
    );
  }


  getStatus() {
    const remaining =
      this.getRemaining();


    const stability =
      this.getAverageStability();


    if (
      remaining <= 1
    ) {
      return 'CRITICAL LOAD';
    }


    if (
      remaining === 2
    ) {
      return 'CARGO WARNING';
    }


    if (
      stability >= 70
    ) {
      return 'SECURE';
    }


    if (
      stability >= 40
    ) {
      return 'SHIFTING';
    }


    if (
      stability >= 15
    ) {
      return 'DANGER';
    }


    return 'CRITICAL';
  }


  getState() {
    return {
      remaining:
        this.getRemaining(),

      total:
        this.items.length,

      stability:
        this.getAverageStability(),

      straps:
        this.strapCondition,

      status:
        this.getStatus()
    };
  }

  // --------------------------------------------------
  // Cargo stress
  // --------------------------------------------------

  applyStress(amount) {
    if (
      amount <= 0
    ) {
      return;
    }


    this.strapCondition -=
      amount *
      0.35;


    this.strapCondition =
      THREE.MathUtils.clamp(
        this.strapCondition,
        0,
        100
      );


    for (
      const item
      of this.items
    ) {
      if (
        !item.attached
      ) {
        continue;
      }


      const strapWeakness =
        1 +
        (
          100 -
          this.strapCondition
        ) /
        100;


      item.stability -=
        amount *
        strapWeakness *
        item.vulnerability;


      item.stability =
        THREE.MathUtils.clamp(
          item.stability,
          0,
          100
        );
    }
  }

  // --------------------------------------------------
  // Attached cargo physics
  // --------------------------------------------------

  updateAttached(
    dt,
    {
      speed,
      previousSpeed,
      steeringInput,
      suspensionVelocity
    }
  ) {
    const acceleration =
      (
        speed -
        previousSpeed
      ) /
      Math.max(
        dt,
        0.001
      );


    // Forward / back shift
    const targetShiftZ =
      THREE.MathUtils.clamp(
        acceleration *
        0.012,

        -0.35,
        0.35
      );


    // Sideways shift
    const turningForce =
      steeringInput *
      Math.abs(speed) *
      0.018;


    const targetShiftX =
      THREE.MathUtils.clamp(
        turningForce,

        -0.32,
        0.32
      );


    // X spring
    this.velocityX +=
      (
        targetShiftX -
        this.shiftX
      ) *
      14 *
      dt;


    this.velocityX *=
      Math.pow(
        0.84,
        dt * 60
      );


    this.shiftX +=
      this.velocityX *
      dt;


    // Z spring
    this.velocityZ +=
      (
        targetShiftZ -
        this.shiftZ
      ) *
      14 *
      dt;


    this.velocityZ *=
      Math.pow(
        0.84,
        dt * 60
      );


    this.shiftZ +=
      this.velocityZ *
      dt;


    // --------------------------------------------------
    // Continuous driving stress
    // --------------------------------------------------

    const accelerationStress =
      Math.max(
        0,

        Math.abs(
          acceleration
        ) -
        5
      ) *
      0.02;


    const turningStress =
      Math.abs(
        steeringInput
      ) *
      Math.max(
        0,

        Math.abs(speed) -
        10
      ) *
      0.018;


    this.applyStress(
      (
        accelerationStress +
        turningStress
      ) *
      dt *
      10
    );


    // --------------------------------------------------
    // Cargo visual wobble
    // --------------------------------------------------

    const bumpWobble =
      THREE.MathUtils.clamp(
        suspensionVelocity *
        0.035,

        -0.14,
        0.14
      );


    for (
      let i = 0;
      i < this.items.length;
      i++
    ) {
      const item =
        this.items[i];


      if (
        !item.attached
      ) {
        continue;
      }


      const instability =
        1 -
        item.stability /
        100;


      const wobbleMultiplier =
        1 +
        instability *
        2.5;


      const sideMultiplier =
        0.7 +
        i *
        0.08;


      const forwardMultiplier =
        0.75 +
        i *
        0.07;


      item.mesh.position.x =
        item.startPosition.x +
        this.shiftX *
        sideMultiplier *
        wobbleMultiplier;


      item.mesh.position.z =
        item.startPosition.z +
        this.shiftZ *
        forwardMultiplier *
        wobbleMultiplier;


      item.mesh.position.y =
        item.startPosition.y +
        Math.abs(
          bumpWobble
        ) *
        0.25 *
        item.vulnerability;


      item.mesh.rotation.z =
        this.shiftX *
        0.55 *
        wobbleMultiplier *
        item.vulnerability;


      item.mesh.rotation.x =
        (
          this.shiftZ *
          0.5 +
          bumpWobble
        ) *
        wobbleMultiplier *
        item.vulnerability;


      if (
        item.stability <= 5
      ) {
        this.detach(
          item,
          speed
        );
      }
    }
  }

  // --------------------------------------------------
  // Detach cargo
  // --------------------------------------------------

  detach(
    item,
    speed
  ) {
    if (
      !item.attached
    ) {
      return;
    }


    this.scene.attach(
      item.mesh
    );


    item.attached = false;


    const forward =
      new THREE.Vector3(
        0,
        0,
        -1
      );


    forward.applyQuaternion(
      this.taxi.quaternion
    );


    const sideways =
      new THREE.Vector3(
        1,
        0,
        0
      );


    sideways.applyQuaternion(
      this.taxi.quaternion
    );


    item.velocity.copy(
      forward
    );


    item.velocity.multiplyScalar(
      speed *
      0.75
    );


    const index =
      this.items.indexOf(
        item
      );


    const sideDirection =
      index % 2 === 0
        ? -1
        : 1;


    item.velocity.addScaledVector(
      sideways,

      sideDirection *
      1.8
    );


    item.velocity.y =
      2.5 +
      Math.abs(speed) *
      0.04;


    item.spin.set(
      2 +
      index *
      0.25,

      1.5,

      2.5 +
      index *
      0.2
    );


    if (
      this.onCargoLost
    ) {
      this.onCargoLost({
        name:
          item.name,

        remaining:
          this.getRemaining()
      });
    }
  }

  // --------------------------------------------------
  // Detached cargo physics
  // --------------------------------------------------

  updateDetached(dt) {
    for (
      const item
      of this.items
    ) {
      if (
        item.attached
      ) {
        continue;
      }


      item.velocity.y +=
        this.gravity *
        0.65 *
        dt;


      item.mesh.position
        .addScaledVector(
          item.velocity,
          dt
        );


      item.mesh.rotation.x +=
        item.spin.x *
        dt;


      item.mesh.rotation.y +=
        item.spin.y *
        dt;


      item.mesh.rotation.z +=
        item.spin.z *
        dt;


      if (
        item.mesh.position.y <
        0.4
      ) {
        item.mesh.position.y =
          0.4;


        if (
          Math.abs(
            item.velocity.y
          ) > 0.8
        ) {
          item.velocity.y *=
            -0.25;

        } else {
          item.velocity.y = 0;
        }


        item.velocity.x *=
          0.92;


        item.velocity.z *=
          0.92;


        item.spin.multiplyScalar(
          0.94
        );
      }
    }
  }

  // --------------------------------------------------
  // Reset
  // --------------------------------------------------

  reset() {
    this.strapCondition = 100;

    this.shiftX = 0;
    this.shiftZ = 0;

    this.velocityX = 0;
    this.velocityZ = 0;


    for (
      const item
      of this.items
    ) {
      if (
        item.mesh.parent !==
        this.chassis
      ) {
        this.chassis.attach(
          item.mesh
        );
      }


      item.attached = true;

      item.stability = 100;


      item.velocity.set(
        0,
        0,
        0
      );


      item.spin.set(
        0,
        0,
        0
      );


      item.mesh.position.copy(
        item.startPosition
      );


      item.mesh.rotation.set(
        0,
        0,
        0
      );
    }
  }
}