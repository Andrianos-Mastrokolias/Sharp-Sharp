import * as THREE from 'three';


export class CameraSystem {

  constructor({
    camera,
    taxi,
    renderer
  }) {

    this.camera =
      camera;

    this.taxi =
      taxi;

    this.renderer =
      renderer;


    // ==================================================
    // CAMERA MODES
    // ==================================================

    this.modes = [
      'CHASE',
      'BUMPER',
      'INTERIOR'
    ];


    this.currentModeIndex =
      0;


    // ==================================================
    // CHASE CAMERA SETTINGS
    // ==================================================
    //
    // Slightly farther and higher than before.
    // This gives a better racing-game view and reduces
    // how much the roof cargo blocks the road.
    // ==================================================

    this.chaseDistance =
      10.5;


    this.chaseHeight =
      4.8;


    this.cameraAngle =
      0;


    // ==================================================
    // MOUSE INPUT
    // ==================================================

    this.dragging =
      false;


    this.lastMouseX =
      0;


    // ==================================================
    // REUSABLE OBJECTS
    // ==================================================

    this.desiredPosition =
      new THREE.Vector3();


    this.lookTarget =
      new THREE.Vector3();


    this.tempOffset =
      new THREE.Vector3();


    this.tempForward =
      new THREE.Vector3();


    // ==================================================
    // INITIAL CAMERA SETTINGS
    // ==================================================

    this.camera.fov =
      68;


    this.camera.updateProjectionMatrix();


    // ==================================================
    // SETUP INPUT
    // ==================================================

    this.setupMouseControls();
  }


  // ==================================================
  // GET CURRENT MODE
  // ==================================================

  getMode() {

    return this.modes[
      this.currentModeIndex
    ];
  }


  // ==================================================
  // SWITCH CAMERA MODE
  // ==================================================

  nextMode() {

    this.currentModeIndex =

      (
        this.currentModeIndex +
        1
      ) %

      this.modes.length;


    // Reset chase free-look whenever camera changes.

    this.cameraAngle =
      0;


    // Adjust FOV for each camera.

    const mode =
      this.getMode();


    if (
      mode ===
      'CHASE'
    ) {

      this.camera.fov =
        68;
    }


    if (
      mode ===
      'BUMPER'
    ) {

      this.camera.fov =
        72;
    }


    if (
      mode ===
      'INTERIOR'
    ) {

      this.camera.fov =
        74;
    }


    this.camera
      .updateProjectionMatrix();


    return mode;
  }


  // ==================================================
  // MOUSE CONTROLS
  // ==================================================

  setupMouseControls() {

    // ------------------------------------------------
    // Mouse press
    // ------------------------------------------------

    this.renderer.domElement
      .addEventListener(

        'pointerdown',

        (event) => {

          if (
            this.getMode() !==
            'CHASE'
          ) {

            return;
          }


          this.dragging =
            true;


          this.lastMouseX =
            event.clientX;


          this.renderer.domElement
            .setPointerCapture(
              event.pointerId
            );
        }
      );


    // ------------------------------------------------
    // Mouse movement
    // ------------------------------------------------

    this.renderer.domElement
      .addEventListener(

        'pointermove',

        (event) => {

          if (
            !this.dragging ||
            this.getMode() !==
            'CHASE'
          ) {

            return;
          }


          const difference =

            event.clientX -
            this.lastMouseX;


          this.cameraAngle +=

            difference *
            0.005;


          this.lastMouseX =
            event.clientX;
        }
      );


    // ------------------------------------------------
    // Mouse release
    // ------------------------------------------------

    this.renderer.domElement
      .addEventListener(

        'pointerup',

        () => {

          this.dragging =
            false;
        }
      );


    // ------------------------------------------------
    // Chase zoom
    // ------------------------------------------------

    this.renderer.domElement
      .addEventListener(

        'wheel',

        (event) => {

          if (
            this.getMode() !==
            'CHASE'
          ) {

            return;
          }


          this.chaseDistance =

            THREE.MathUtils.clamp(

              this.chaseDistance +
              event.deltaY *
              0.01,

              7,

              17
            );
        }
      );
  }


  // ==================================================
  // UPDATE
  // ==================================================

  update(dt) {

    const mode =
      this.getMode();


    if (
      mode ===
      'CHASE'
    ) {

      this.updateChaseCamera(
        dt
      );
    }


    if (
      mode ===
      'BUMPER'
    ) {

      this.updateBumperCamera();
    }


    if (
      mode ===
      'INTERIOR'
    ) {

      this.updateInteriorCamera();
    }
  }


  // ==================================================
  // CHASE CAMERA
  // ==================================================

  updateChaseCamera(dt) {

    const angle =

      this.taxi.rotation.y +
      this.cameraAngle;


    // ------------------------------------------------
    // Desired camera position
    // ------------------------------------------------

    this.desiredPosition.set(

      this.taxi.position.x +
      Math.sin(angle) *
      this.chaseDistance,


      this.taxi.position.y +
      this.chaseHeight,


      this.taxi.position.z +
      Math.cos(angle) *
      this.chaseDistance
    );


    // ------------------------------------------------
    // Smooth follow
    // ------------------------------------------------

    this.camera.position.lerp(

      this.desiredPosition,

      1 -
      Math.exp(
        -7 *
        dt
      )
    );


    // ------------------------------------------------
    // Look slightly above taxi centre
    // ------------------------------------------------

    this.lookTarget.set(

      this.taxi.position.x,

      this.taxi.position.y +
      1.45,

      this.taxi.position.z
    );


    this.camera.lookAt(
      this.lookTarget
    );
  }


  // ==================================================
  // BUMPER CAMERA
  // ==================================================
  //
  // Your screenshot showed the old camera was almost
  // touching the road.
  //
  // This version raises it to approximately headlight /
  // grille height.
  // ==================================================

  updateBumperCamera() {

    this.tempOffset.set(

      0,

      1.45,

      -2.65
    );


    this.tempOffset
      .applyQuaternion(
        this.taxi.quaternion
      );


    this.camera.position.copy(
      this.taxi.position
    );


    this.camera.position.add(
      this.tempOffset
    );


    // Look directly forward.

    this.tempForward.set(

      0,

      0,

      -1
    );


    this.tempForward
      .applyQuaternion(
        this.taxi.quaternion
      );


    this.lookTarget.copy(
      this.camera.position
    );


    this.lookTarget
      .addScaledVector(

        this.tempForward,

        25
      );


    // Slight upward gaze so horizon sits naturally.

    this.lookTarget.y +=
      0.20;


    this.camera.lookAt(
      this.lookTarget
    );
  }


  // ==================================================
  // INTERIOR CAMERA
  // ==================================================
  //
  // Your screenshot showed this was still too low.
  //
  // This position simulates sitting in the driver's
  // seat rather than near the floor.
  // ==================================================

  updateInteriorCamera() {

    this.tempOffset.set(

      -0.38,

      1.95,

      -0.45
    );


    this.tempOffset
      .applyQuaternion(
        this.taxi.quaternion
      );


    this.camera.position.copy(
      this.taxi.position
    );


    this.camera.position.add(
      this.tempOffset
    );


    // ------------------------------------------------
    // Forward direction
    // ------------------------------------------------

    this.tempForward.set(

      0,

      -0.015,

      -1
    );


    this.tempForward
      .applyQuaternion(
        this.taxi.quaternion
      );


    this.lookTarget.copy(
      this.camera.position
    );


    this.lookTarget
      .addScaledVector(

        this.tempForward,

        25
      );


    this.lookTarget.y +=
      0.05;


    this.camera.lookAt(
      this.lookTarget
    );
  }
}