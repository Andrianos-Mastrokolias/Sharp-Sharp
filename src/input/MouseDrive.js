// ============================================================
// MOUSE DRIVE
// ============================================================

// Optional mouse driving, toggled with M. While on and playing,
// the canvas holds pointer lock and the mouse is mapped onto the
// same keys VehicleController already reads, so the physics is
// unchanged and the keyboard keeps working at the same time:
//
//   left button    KeyW   throttle
//   right button   KeyS   brake / reverse
//   middle button  Space  handbrake
//   move X         KeyA / KeyD once the steer value leaves the
//                  deadzone; it eases back to centre on its own
//
// While on, pointerdown is stopped before it reaches the canvas
// so the chase camera's drag-to-look never starts. While off,
// nothing here touches the mouse.

const STEER_SENSITIVITY = 0.004;  // steer per pixel: 250 px = full lock
const STEER_RETURN_RATE = 3;      // 1/s, exponential ease back to centre
const STEER_DEADZONE = 0.15;

export class MouseDrive {

  constructor({ canvas, isPlaying, onLockLost }) {
    this.canvas = canvas;
    this.isPlaying = isPlaying;
    this.onLockLost = onLockLost;

    this.enabled = false;
    this.steer = 0;              // -1 (left) .. 1 (right)
    this.buttons = { left: false, right: false, middle: false };

    // Reused every frame: no allocation in update()
    this.input = {};

    this.setupListeners();
  }


  get locked() {
    return document.pointerLockElement === this.canvas;
  }


  setEnabled(enabled) {
    this.enabled = enabled;
    this.reset();

    if (enabled) {
      this.requestLock();
    } else if (this.locked) {
      // enabled is already false, so this is not a pause
      document.exitPointerLock();
    }
  }


  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }


  // Needs a user gesture (key press or click). Browsers refuse a
  // re-lock right after Esc; the next click on the canvas retries.
  requestLock() {
    if (!this.enabled || !this.isPlaying() || this.locked) return;

    try {
      const request = this.canvas.requestPointerLock();
      request?.catch?.(() => {});
    } catch {
      // Unsupported or refused: clicking the canvas retries
    }
  }


  reset() {
    this.steer = 0;
    this.buttons.left = false;
    this.buttons.right = false;
    this.buttons.middle = false;
  }


  setupListeners() {

    // Capture phase on window runs before the canvas's own
    // listeners (CameraSystem drag-to-look).
    window.addEventListener('pointerdown', event => {
      if (!this.enabled || event.target !== this.canvas) return;

      event.stopPropagation();

      if (!this.locked) this.requestLock();
    }, true);

    // mousedown / mouseup fire per button; pointer events don't
    // when buttons are chorded.
    document.addEventListener('mousedown', event => {
      if (!this.enabled || !this.locked) return;

      this.setButton(event.button, true);

      // Middle click would start autoscroll
      if (event.button === 1) event.preventDefault();
    });

    document.addEventListener('mouseup', event => {
      this.setButton(event.button, false);
    });

    document.addEventListener('mousemove', event => {
      if (!this.enabled || !this.locked) return;

      this.steer = Math.min(
        Math.max(this.steer + event.movementX * STEER_SENSITIVITY, -1),
        1
      );
    });

    this.canvas.addEventListener('contextmenu', event => {
      if (this.enabled) event.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      if (this.locked) return;

      this.reset();

      // Esc while driving: the browser drops the lock and may not
      // send the key, so pause here, as Esc does without the lock.
      if (this.enabled && this.isPlaying()) {
        this.onLockLost?.();
      }
    });

    window.addEventListener('blur', () => this.reset());
  }


  setButton(button, down) {
    if (button === 0) this.buttons.left = down;
    if (button === 1) this.buttons.middle = down;
    if (button === 2) this.buttons.right = down;
  }


  // Called every frame. Returns the key state VehicleController
  // reads: `keys` itself when mouse drive is off or not driving,
  // otherwise keys merged with the mouse.
  update(dt, keys, playing) {

    // Menus, pause and end screens need the cursor back
    if (!playing && this.locked) {
      document.exitPointerLock();
    }

    if (!this.enabled || !playing || !this.locked) {
      return keys;
    }

    this.steer *= Math.exp(-STEER_RETURN_RATE * dt);

    const mouseLeft = this.steer < -STEER_DEADZONE;
    const mouseRight = this.steer > STEER_DEADZONE;

    const input = this.input;

    input.KeyW = keys.KeyW || this.buttons.left;
    input.ArrowUp = keys.ArrowUp;
    input.KeyS = keys.KeyS || this.buttons.right;
    input.ArrowDown = keys.ArrowDown;
    input.KeyA = keys.KeyA || mouseLeft;
    input.ArrowLeft = keys.ArrowLeft;
    input.KeyD = keys.KeyD || mouseRight;
    input.ArrowRight = keys.ArrowRight;
    input.Space = keys.Space || this.buttons.middle;

    return input;
  }
}
