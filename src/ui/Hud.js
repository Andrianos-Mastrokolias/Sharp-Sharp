import { ROUTES, routeName, lockup, decalStripes } from './screens.js';

// ============================================================
// HUD
// ============================================================

// In-game HUD, styled in theme.css. The DOM is built once;
// update() runs every frame and only writes text / styles
// that have actually changed.

// Pursuit states with nobody chasing the taxi.
const CLEAR_STATES = ['none', 'idle'];

export class Hud {

  constructor() {

    this.element = document.createElement('div');
    this.element.className = 'hud';

    this.element.innerHTML = `
      <div class="hud-route sign">
        <div class="sign-head" data-hud="route"></div>
        <div class="sign-body">
          <div class="sign-row">
            <span class="sign-code" data-hud="code"></span>
            <span data-hud="destination"></span>
            <span class="hud-distance" data-hud="distance"></span>
            <span class="sign-arrow" data-hud="arrow"></span>
          </div>
        </div>
      </div>

      <div class="hud-right">
        <div class="hud-tail">
          ${lockup([[
            { text: 'on your tail', bg: 'ink', font: 'rye' },
            { text: '<span data-hud="tail">clear</span>', bg: 'mustard', font: 'slab' }
          ]])}
          <div class="hud-tail-track">
            <div class="hud-tail-fill chevron" data-hud="tailFill"></div>
          </div>
        </div>

        <div class="hud-labels">
          <div class="label"><span data-hud="camera"></span></div>
          <div class="label"><span data-hud="lights"></span></div>
          <div class="label"><span data-hud="mouseDrive"></span></div>
        </div>
      </div>

      <div class="hud-speed decal">
        <div class="hud-speed-row">
          <span class="decal-label hud-speed-value" data-hud="speed">0</span>
          <span class="hud-speed-unit">km/h</span>
        </div>
        ${decalStripes()}
      </div>

      <div class="hud-roof">
        <div class="hud-roof-head">
          <span>ROOF LOAD</span>
          <span class="hud-roof-count" data-hud="count"></span>
        </div>
        <div class="hud-roof-body">
          <div class="hud-roof-boxes" data-hud="boxes"></div>
          <div class="hud-roof-stats" data-hud="stats"></div>
          <div class="hud-roof-status" data-hud="status"></div>
        </div>
      </div>

      <div class="hud-hint label">
        <span>ESC — PAUSE &amp; CONTROLS</span>
      </div>
    `;

    this.fields = {};

    for (const node of this.element.querySelectorAll('[data-hud]')) {
      this.fields[node.dataset.hud] = node;
    }

    // Last value written to each field / style
    this.last = {};
    this.boxes = [];

    document.body.appendChild(this.element);
  }


  setText(field, value) {
    const text = String(value);

    if (this.last[field] === text) return;
    this.last[field] = text;

    this.fields[field].textContent = text;
  }


  // Called with the current game state every frame.
  // objective: levelManager.getState(), cargo: cargoSystem.getState()
  update({ level, levelName, objective, cargo, speedKmh, cameraMode, headlightsOn, mouseDrive }) {

    // ---------- Route sign ----------

    const route = ROUTES[level] ?? { code: `L${level}`, arrow: '→', destination: '' };
    const driving = objective.status === 'driving';

    this.setText('route', `LEVEL ${level} · ${routeName(levelName).toUpperCase()}`);
    this.setText('code', route.code);
    this.setText('destination', route.destination);
    this.setText('arrow', route.arrow);
    this.setText(
      'distance',
      driving ? `${Math.round(objective.distanceToDestination)} m` : '— m'
    );

    // ---------- Pursuer meter ----------

    const pursuit = objective.pursuit;
    const clear = !driving || !pursuit || CLEAR_STATES.includes(pursuit.state);
    const pressure = clear ? 0 : Math.min(Math.max(pursuit.pressure ?? 0, 0), 1);
    const percent = Math.round(pressure * 100);

    this.setText('tail', clear ? 'clear' : `${percent}%`);

    if (this.last.tailFill !== percent) {
      this.last.tailFill = percent;
      this.fields.tailFill.style.width = `${percent}%`;
    }

    // ---------- Labels and speed ----------

    this.setText('camera', `CAMERA: ${cameraMode.toUpperCase()}`);
    this.setText('lights', `LIGHTS: ${headlightsOn ? 'ON' : 'OFF'}`);
    this.setText('mouseDrive', `MOUSE DRIVE: ${mouseDrive ? 'ON' : 'OFF'}`);
    this.setText('speed', Math.round(speedKmh));

    // ---------- Roof load ----------

    this.setText('count', `${cargo.remaining}/${cargo.total}`);
    this.updateBoxes(cargo.remaining, cargo.total);

    this.setText(
      'stats',
      `Stability ${Math.round(cargo.stability)}% · Straps ${Math.round(cargo.straps)}%`
    );

    const secure = cargo.status === 'SECURE';

    this.setText('status', secure ? 'sharp' : `eish, ${cargo.status.toLowerCase()}`);

    if (this.last.secure !== secure) {
      this.last.secure = secure;
      this.fields.status.classList.toggle('secure', secure);
    }
  }


  // One box per cargo item: filled while it's still on the roof.
  updateBoxes(remaining, total) {

    if (this.boxes.length !== total) {
      this.fields.boxes.replaceChildren();
      this.boxes = [];

      for (let i = 0; i < total; i++) {
        const box = document.createElement('i');
        this.fields.boxes.appendChild(box);
        this.boxes.push(box);
      }

      this.last.remaining = null;
    }

    if (this.last.remaining === remaining) return;
    this.last.remaining = remaining;

    this.boxes.forEach((box, i) => {
      box.classList.toggle('full', i < remaining);
    });
  }
}
