import * as THREE from 'three';

import { menuBackdropHTML, titleLockup } from './screens.js';

// ============================================================
// LOADING SCREEN
// ============================================================

// Full-screen overlay driven by THREE.DefaultLoadingManager.
// Every loader in the game (MaterialLibrary textures, Lighting
// HDRIs, the taxi GLB) is created without its own manager, so
// they all report here. Construct this BEFORE any of them start
// loading, or the first files are not counted.

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

    this.element = document.createElement('div');
    this.element.className = 'ss-loading';

    this.element.innerHTML = `
      ${menuBackdropHTML()}

      <div class="ss-loading-panel">
        ${titleLockup()}

        <div class="ss-loading-meter">
          <div class="ss-loading-track">
            <div class="ss-loading-bar chevron"></div>
          </div>

          <div class="ss-loading-status">
            <span class="lk-rye">hold on, now-now…</span>
            <strong>
              <span class="ss-loading-files"></span>
              <span class="ss-loading-percent">0%</span>
            </strong>
          </div>

          <div class="ss-loading-error"></div>
        </div>
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
    this.filesText.textContent = `${loaded} / ${total} ·`;
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
