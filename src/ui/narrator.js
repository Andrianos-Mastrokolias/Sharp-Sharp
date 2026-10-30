// ============================================================
// NARRATOR: BRA SIPHO
// ============================================================

// The narrator around the overlay screens. UI only: it reads
// its lines from story.js and never touches the game state.
//
// - MenuNarrator: the big waving figure in the bottom-right
//   corner of the main menu, with a speech bubble that steps
//   through the menu lines. main.js hides it on every screen
//   change, which clears its timer, listeners and element.
// - withNarrator(): a small static version (no timers) beside
//   the level intro card and the results screens.

import { STORY } from './story.js';

// Relative, so it also works from the department server's subfolder
const IMAGE_SRC = './assets/ui/sipho-wave.webp';

// How long each menu line stays up before the next one
const ADVANCE_MS = 5000;

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function portrait(className) {
  // alt="" because the bubble carries the meaning; a missing
  // image then leaves an empty space instead of a broken icon.
  return `<img class="${className}" src="${IMAGE_SRC}" alt="" width="800" height="800" decoding="async" draggable="false">`;
}

// ============================================================
// SMALL VERSION (level intro, results)
// ============================================================

export function narratorCardHTML(line) {
  return `
    <aside class="sipho-card" aria-label="${escapeHTML(STORY.narrator)}">
      <p class="sipho-bubble sipho-bubble-down">${escapeHTML(line)}</p>
      ${portrait('sipho-portrait')}
    </aside>
  `;
}

// Puts Bra Sipho beside an in-game screen column.
export function withNarrator(columnHTML, line) {
  return `<div class="sipho-row">${columnHTML}${narratorCardHTML(line)}</div>`;
}

// ============================================================
// MAIN MENU VERSION
// ============================================================

// Layout box of el in viewport coordinates, ignoring CSS
// transforms, so the slide-in doesn't affect the overlap test.
function layoutRect(el, root) {
  const base = root.getBoundingClientRect();
  return {
    left: base.left + el.offsetLeft,
    top: base.top + el.offsetTop,
    right: base.left + el.offsetLeft + el.offsetWidth,
    bottom: base.top + el.offsetTop + el.offsetHeight
  };
}

function overlaps(a, b) {
  return a.left < b.right && b.left < a.right &&
    a.top < b.bottom && b.top < a.bottom;
}

export class MenuNarrator {
  // host: the overlay element to draw in (anchored bottom-right).
  // getObstacles: elements he must never cover (the menu buttons
  // and route sign); if he would, he is hidden instead.
  constructor({ host, lines = STORY.menu, getObstacles = () => [] }) {
    this.host = host;
    this.lines = lines;
    this.getObstacles = getObstacles;

    // Once skipped, the bubble stays closed for this session
    this.skipped = false;

    this.root = null;
    this.index = 0;
    this.timer = 0;
    this.frame = 0;
    this.listeners = null;
  }

  show() {
    this.hide();

    const root = document.createElement('div');
    root.className = 'sipho-menu';
    root.innerHTML = `
      ${portrait('sipho-figure')}
      <div class="sipho-say" role="group" aria-label="${escapeHTML(STORY.narrator)}">
        <button type="button" class="sipho-bubble sipho-bubble-right" aria-live="polite">
          <span class="sipho-line"></span>
          <span class="sipho-count" aria-hidden="true"></span>
        </button>
        <button type="button" class="sipho-skip">skip</button>
      </div>
    `;

    this.root = root;
    this.index = 0;
    this.listeners = new AbortController();
    const { signal } = this.listeners;

    root.querySelector('.sipho-bubble').addEventListener('click', () => this.next(), { signal });
    root.querySelector('.sipho-skip').addEventListener('click', () => this.skip(), { signal });
    window.addEventListener('resize', () => this.fit(), { signal });
    // The CONTROLS list opens in place and can grow towards him
    this.host.addEventListener('toggle', () => this.fit(), { signal, capture: true });

    if (this.skipped) {
      root.classList.add('is-quiet');
    } else {
      this.render();
      this.schedule();
    }

    this.host.appendChild(root);
    this.fit();

    // Next frame, so the slide-in transition runs
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      root.classList.add('is-in');
    });
  }

  // Removes the element, timer and listeners. Safe to call twice.
  hide() {
    clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    this.timer = 0;
    this.frame = 0;

    this.listeners?.abort();
    this.listeners = null;

    this.root?.remove();
    this.root = null;
  }

  render() {
    this.root.querySelector('.sipho-line').textContent = this.lines[this.index];
    this.root.querySelector('.sipho-count').textContent =
      `${this.index + 1} / ${this.lines.length}`;
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = 0;

    if (this.index < this.lines.length - 1) {
      this.timer = setTimeout(() => this.next(), ADVANCE_MS);
    }
  }

  // Next line; after the last one the bubble closes.
  next() {
    if (!this.root) return;

    if (this.index >= this.lines.length - 1) {
      this.close();
      return;
    }

    this.index += 1;
    this.render();
    this.schedule();
  }

  skip() {
    this.skipped = true;
    this.close();
  }

  close() {
    clearTimeout(this.timer);
    this.timer = 0;
    this.root?.classList.add('is-quiet');
    // Without the bubble he may fit where he didn't before
    this.fit();
  }

  // Hide him if he or his bubble would cover a menu button.
  fit() {
    const root = this.root;
    if (!root) return;

    root.classList.remove('is-tucked');

    const parts = [root.querySelector('.sipho-figure')];
    if (!root.classList.contains('is-quiet')) {
      parts.push(root.querySelector('.sipho-say'));
    }

    // Zero-size while hidden by the narrow-screen media query
    const boxes = parts
      .filter(el => el.offsetWidth > 0)
      .map(el => layoutRect(el, root));

    const covered = [...this.getObstacles()].some(el => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      return boxes.some(box => overlaps(box, r));
    });

    root.classList.toggle('is-tucked', covered);
  }
}
