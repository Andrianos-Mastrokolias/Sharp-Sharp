import { ROUTES, routeName, lockup, decalStripes } from './screens.js';

// ============================================================
// HUD
// ============================================================

// In-game HUD, styled in theme.css. The DOM is built once;
// update() runs every frame and only writes text / styles
// that have actually changed.

// Pursuit states with nobody chasing the taxi (PursuitSystem.js).
export const CLEAR_STATES = ['none', 'idle', 'patrolling'];

// First sighting: the pursuer brakes and holds still with its
// siren going before it gives chase.
export const SPOTTED_STATE = 'reacting';

// Text for the "on your tail" block.
export function tailText(state, percent) {
  if (CLEAR_STATES.includes(state)) return 'clear';
  if (state === SPOTTED_STATE) return 'SPOTTED';
  return `${percent}%`;
}

// ---------- Level 1 rank-race score ----------

// How long a score pop-up stays up (matches hud-popup in theme.css)
// and how many can stack before the oldest is dropped.
const POPUP_TIME = 1600;
const MAX_POPUPS = 4;

const SCORE_REASONS = {
  beaten: 'Rival beaten',
  firstOut: 'First out',
  pedestrian: 'Pedestrian'
};

// levelManager's onScore event -> "+100 Rival beaten", "-50 Pedestrian"
export function scorePopupText({ delta, reason }) {
  const sign = delta < 0 ? '-' : '+';
  return `${sign}${Math.abs(delta)} ${SCORE_REASONS[reason] ?? reason}`;
}

export function rivalsBeatenText(score) {
  return `Rivals beaten ${score.beaten}/${score.rivalsTotal}`;
}

export class Hud {

  constructor() {

    this.element = document.createElement('div');
    this.element.className = 'hud';

    this.element.innerHTML = `
      <div class="hud-left">
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

        <div class="hud-score" data-hud="score" hidden>
          <div class="hud-score-head">
            <span>POINTS</span>
            <span class="hud-score-points" data-hud="points"></span>
          </div>
          <div class="hud-score-body" data-hud="beaten"></div>
        </div>
      </div>

      <div class="hud-popups" data-hud="popups"></div>

      <div class="hud-countdown" data-hud="countdown" hidden></div>

      <div class="hud-right">
        <div class="hud-tail" data-hud="tailBox">
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

    // Score pop-up removal timers, cleared on restart
    this.popupTimers = new Set();

    document.body.appendChild(this.element);
  }


  setText(field, value) {
    const text = String(value);

    if (this.last[field] === text) return;
    this.last[field] = text;

    this.fields[field].textContent = text;
  }


  // Called with the current game state every frame.
  // objective: levelManager.getState(), cargo: cargoSystem.getState(),
  // countdown: CountdownTracker text ('' hides the overlay)
  update({ level, levelName, objective, cargo, speedKmh, cameraMode, headlightsOn, mouseDrive, countdown = '' }) {

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
    const state = driving && pursuit ? pursuit.state : 'none';
    const clear = CLEAR_STATES.includes(state);
    const pressure = clear ? 0 : Math.min(Math.max(pursuit.pressure ?? 0, 0), 1);
    const percent = Math.round(pressure * 100);
    const spotted = state === SPOTTED_STATE;

    this.setText('tail', tailText(state, percent));

    if (this.last.spotted !== spotted) {
      this.last.spotted = spotted;
      this.fields.tailBox.classList.toggle('spotted', spotted);
    }

    if (this.last.tailFill !== percent) {
      this.last.tailFill = percent;
      this.fields.tailFill.style.width = `${percent}%`;
    }

    // ---------- Score (Level 1 only; null elsewhere) ----------

    const score = objective.score ?? null;
    const scored = score !== null;

    if (this.last.scored !== scored) {
      this.last.scored = scored;
      this.fields.score.hidden = !scored;
    }

    if (scored) {
      this.setText('points', score.points);
      this.setText('beaten', rivalsBeatenText(score));
    }

    // ---------- Race countdown (3, 2, 1, GO!) ----------

    this.updateCountdown(countdown);

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


  // Re-runs the pop animation each time the text changes.
  updateCountdown(text) {

    if (this.last.countdown === text) return;
    this.last.countdown = text;

    const node = this.fields.countdown;

    node.hidden = text === '';
    node.textContent = text;
    node.classList.toggle('go', text === 'GO!');

    // Restart the CSS animation (only on a change, not per frame)
    node.classList.remove('animate');
    void node.offsetWidth;
    node.classList.add('animate');
  }


  // A short-lived pop-up for levelManager's onScore event.
  // Several can stack; the oldest goes once there are too many.
  showScorePopup(event) {

    const popup = document.createElement('div');
    popup.className = `hud-popup ${event.delta < 0 ? 'negative' : 'positive'}`;
    popup.textContent = scorePopupText(event);

    const container = this.fields.popups;
    container.appendChild(popup);

    while (container.childElementCount > MAX_POPUPS) {
      container.firstElementChild.remove();
    }

    const timer = setTimeout(() => {
      this.popupTimers.delete(timer);
      popup.remove();
    }, POPUP_TIME);

    this.popupTimers.add(timer);
  }


  // Restart / level change: no pop-ups carried over.
  clearScorePopups() {

    for (const timer of this.popupTimers) {
      clearTimeout(timer);
    }

    this.popupTimers.clear();
    this.fields.popups.replaceChildren();
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
