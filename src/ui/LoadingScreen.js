import * as THREE from 'three';

// ============================================================
// LOADING SCREEN
// ============================================================

// Full-screen overlay driven by THREE.DefaultLoadingManager.
// Every loader in the game (MaterialLibrary textures, Lighting
// HDRIs, the taxi GLB) is created without its own manager, so
// they all report here. Construct this BEFORE any of them start
// loading, or the first files are not counted.

const styles = `
  .ss-loading {
    position: fixed;
    inset: 0;
    z-index: 2000;

    display: flex;
    align-items: center;
    justify-content: center;

    background: #050c16;

    font-family: Arial, Helvetica, sans-serif;
    color: white;

    opacity: 1;
    transition: opacity 0.6s ease;
  }

  .ss-loading.hidden {
    opacity: 0;
    pointer-events: none;
  }

  .ss-loading-panel {
    width: min(520px, calc(100vw - 40px));
    padding: 35px;
    box-sizing: border-box;
    text-align: center;
  }

  .ss-loading-eyebrow {
    color: #f5c84c;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .ss-loading-title {
    margin: 14px 0 30px;
    font-size: clamp(32px, 6vw, 52px);
    line-height: 1.1;
    font-weight: 900;
  }

  .ss-loading-track {
    height: 10px;
    overflow: hidden;

    background: #26394c;
    border-radius: 10px;
  }

  .ss-loading-bar {
    width: 0%;
    height: 100%;

    background: #f5c84c;
    border-radius: 10px;

    transition: width 0.2s ease;
  }

  .ss-loading-status {
    display: flex;
    justify-content: space-between;
    margin-top: 12px;

    color: #aebdc8;
    font-size: 14px;
  }

  .ss-loading-status strong {
    color: white;
  }

  .ss-loading-error {
    margin-top: 14px;
    min-height: 1em;

    color: #ff7785;
    font-size: 13px;
  }
`;

export class LoadingScreen {

  constructor({
    manager = THREE.DefaultLoadingManager,
    onComplete = null
  } = {}) {

    this.manager = manager;
    this.onComplete = onComplete;

    this.started = false;
    this.done = false;
    this.progress = 0;
    this.errors = 0;

    this.build();

    manager.onStart = () => {
      this.started = true;
    };

    manager.onProgress = (url, loaded, total) => {
      this.started = true;
      this.setProgress(loaded, total);
    };

    // Loaders still call itemEnd after an error, so onLoad fires
    // anyway: report it and let the game start without that file.
    manager.onError = url => {
      this.errors++;
      console.warn(`Failed to load ${url}`);

      this.errorText.textContent =
        `${this.errors} file${this.errors === 1 ? '' : 's'} ` +
        'failed to load. The game will continue without them.';
    };

    manager.onLoad = () => this.finish();

    // Nothing was queued while main.js ran: don't wait forever.
    setTimeout(() => {
      if (!this.started) this.finish();
    }, 0);
  }


  build() {

    const style = document.createElement('style');
    style.textContent = styles;
    document.head.appendChild(style);

    this.element = document.createElement('div');
    this.element.className = 'ss-loading';

    this.element.innerHTML = `
      <div class="ss-loading-panel">
        <div class="ss-loading-eyebrow">South African Taxi Simulator</div>

        <h1 class="ss-loading-title">SHARP-SHARP</h1>

        <div class="ss-loading-track">
          <div class="ss-loading-bar"></div>
        </div>

        <div class="ss-loading-status">
          <span class="ss-loading-files">Loading assets…</span>
          <strong class="ss-loading-percent">0%</strong>
        </div>

        <div class="ss-loading-error"></div>
      </div>
    `;

    this.bar = this.element.querySelector('.ss-loading-bar');
    this.percentText = this.element.querySelector('.ss-loading-percent');
    this.filesText = this.element.querySelector('.ss-loading-files');
    this.errorText = this.element.querySelector('.ss-loading-error');

    document.body.appendChild(this.element);
  }


  setProgress(loaded, total) {

    // The HDRIs load one after another, so the total can grow
    // mid-load; never let the bar move backwards.
    this.progress = Math.max(
      this.progress,
      total > 0 ? loaded / total : 0
    );

    const percent = Math.round(this.progress * 100);

    this.bar.style.width = `${percent}%`;
    this.percentText.textContent = `${percent}%`;
    this.filesText.textContent = `Loading assets… ${loaded} / ${total}`;
  }


  // Runs once: later loads (or a second onLoad between the
  // sequential HDRIs) must not bring the menu back mid-game.
  finish() {

    if (this.done) return;
    this.done = true;

    this.manager.onStart = undefined;
    this.manager.onProgress = undefined;
    this.manager.onError = undefined;
    this.manager.onLoad = undefined;

    this.progress = 1;
    this.bar.style.width = '100%';
    this.percentText.textContent = '100%';

    this.element.classList.add('hidden');

    // Remove once the 0.6 s fade has finished
    setTimeout(() => this.element.remove(), 700);

    this.onComplete?.();
  }
}
