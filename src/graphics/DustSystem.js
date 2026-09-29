import * as THREE from 'three';


export class DustSystem {

  constructor({
    scene,
    taxi,
    vehicle
  }) {

    this.scene =
      scene;

    this.taxi =
      taxi;

    this.vehicle =
      vehicle;


    // ==================================================
    // SETTINGS
    // ==================================================

    this.maxParticles =
      120;

    this.spawnAccumulator =
      0;

    this.currentLevel =
      1;


    // ==================================================
    // PARTICLE GEOMETRY
    // ==================================================

    const positions =
      new Float32Array(
        this.maxParticles *
        3
      );


    const sizes =
      new Float32Array(
        this.maxParticles
      );


    for (
      let i = 0;
      i < this.maxParticles;
      i++
    ) {

      positions[
        i *
        3
      ] =
        0;


      positions[
        i *
        3 +
        1
      ] =
        -999;


      positions[
        i *
        3 +
        2
      ] =
        0;


      sizes[
        i
      ] =
        1;
    }


    this.geometry =
      new THREE.BufferGeometry();


    this.geometry.setAttribute(

      'position',

      new THREE.BufferAttribute(

        positions,

        3
      )
    );


    this.geometry.setAttribute(

      'aSize',

      new THREE.BufferAttribute(

        sizes,

        1
      )
    );


    // ==================================================
    // PARTICLE MATERIAL
    // ==================================================

    this.material =
      new THREE.PointsMaterial({

        color:
          0xb89d7c,

        size:
          0.55,

        transparent:
          true,

        opacity:
          0.34,

        depthWrite:
          false,

        blending:
          THREE.NormalBlending,

        sizeAttenuation:
          true
      });


    // ==================================================
    // POINT CLOUD
    // ==================================================

    this.points =
      new THREE.Points(

        this.geometry,

        this.material
      );


    this.points.frustumCulled =
      false;


    this.scene.add(
      this.points
    );


    // ==================================================
    // PARTICLE STATE
    // ==================================================

    this.particles =
      [];


    for (
      let i = 0;
      i < this.maxParticles;
      i++
    ) {

      this.particles.push({

        active:
          false,

        life:
          0,

        maxLife:
          1,

        velocity:
          new THREE.Vector3(),

        position:
          new THREE.Vector3()
      });
    }


    // ==================================================
    // TEMP VECTORS
    // ==================================================

    this.spawnPosition =
      new THREE.Vector3();


    this.backward =
      new THREE.Vector3();


    this.side =
      new THREE.Vector3();
  }


  // ==================================================
  // SET LEVEL
  // ==================================================

  setLevel(level) {

    this.currentLevel =
      level;


    this.points.visible =
      level === 1;
  }


  // ==================================================
  // SPAWN PARTICLE
  // ==================================================

  spawnParticle() {

    const particle =
      this.particles.find(
        (p) =>
          !p.active
      );


    if (
      !particle
    ) {

      return;
    }


    const speed =
      Math.abs(
        this.vehicle.getSpeed()
      );


    // Taxi faces local -Z.
    // Backward direction is local +Z.

    this.backward.set(
      0,
      0,
      1
    );


    this.backward
      .applyQuaternion(
        this.taxi.quaternion
      );


    this.side.set(
      1,
      0,
      0
    );


    this.side
      .applyQuaternion(
        this.taxi.quaternion
      );


    // Spawn behind the taxi.

    this.spawnPosition.copy(
      this.taxi.position
    );


    this.spawnPosition
      .addScaledVector(
        this.backward,
        2.5
      );


    this.spawnPosition.y +=
      0.25;


    // Random left/right spread.

    this.spawnPosition
      .addScaledVector(

        this.side,

        (
          Math.random() -
          0.5
        ) *
        1.6
      );


    particle.position.copy(
      this.spawnPosition
    );


    particle.velocity.copy(
      this.backward
    );


    particle.velocity.multiplyScalar(

      1.5 +
      speed *
      0.05
    );


    particle.velocity.x +=

      (
        Math.random() -
        0.5
      ) *
      0.5;


    particle.velocity.z +=

      (
        Math.random() -
        0.5
      ) *
      0.5;


    particle.velocity.y =

      0.25 +
      Math.random() *
      0.35;


    particle.life =
      0;


    particle.maxLife =

      1.0 +
      Math.random() *
      1.4;


    particle.active =
      true;
  }


  // ==================================================
  // UPDATE
  // ==================================================

  update(
    dt
  ) {

    if (
      this.currentLevel !== 1
    ) {

      return;
    }


    const speed =
      Math.abs(
        this.vehicle.getSpeed()
      );


    // ==================================================
    // SPAWN RATE
    // ==================================================

    if (
      speed >
      2
    ) {

      const spawnRate =

        8 +
        speed *
        1.4;


      this.spawnAccumulator +=

        dt *
        spawnRate;


      while (
        this.spawnAccumulator >=
        1
      ) {

        this.spawnParticle();


        this.spawnAccumulator -=
          1;
      }
    }


    // ==================================================
    // PARTICLE UPDATE
    // ==================================================

    const positions =

      this.geometry
        .attributes
        .position
        .array;


    for (
      let i = 0;
      i < this.particles.length;
      i++
    ) {

      const particle =
        this.particles[
          i
        ];


      const index =
        i *
        3;


      if (
        !particle.active
      ) {

        positions[
          index +
          1
        ] =
          -999;


        continue;
      }


      particle.life +=
        dt;


      if (
        particle.life >=
        particle.maxLife
      ) {

        particle.active =
          false;


        positions[
          index +
          1
        ] =
          -999;


        continue;
      }


      // ----------------------------------------------
      // Movement
      // ----------------------------------------------

      particle.position
        .addScaledVector(

          particle.velocity,

          dt
        );


      // Slowly rise.

      particle.velocity.y +=

        0.05 *
        dt;


      // Slight drag.

      particle.velocity.multiplyScalar(

        Math.pow(
          0.985,
          dt *
          60
        )
      );


      // ----------------------------------------------
      // Write positions
      // ----------------------------------------------

      positions[
        index
      ] =
        particle.position.x;


      positions[
        index +
        1
      ] =
        particle.position.y;


      positions[
        index +
        2
      ] =
        particle.position.z;
    }


    this.geometry
      .attributes
      .position
      .needsUpdate =
        true;


    // ==================================================
    // OPACITY CHANGES WITH SPEED
    // ==================================================

    this.material.opacity =

      THREE.MathUtils.clamp(

        0.12 +
        speed *
        0.012,

        0.12,

        0.42
      );
  }


  // ==================================================
  // RESET
  // ==================================================

  reset() {

    for (
      const particle
      of this.particles
    ) {

      particle.active =
        false;
    }


    const positions =

      this.geometry
        .attributes
        .position
        .array;


    for (
      let i = 0;
      i < this.maxParticles;
      i++
    ) {

      positions[
        i *
        3 +
        1
      ] =
        -999;
    }


    this.geometry
      .attributes
      .position
      .needsUpdate =
        true;
  }
}