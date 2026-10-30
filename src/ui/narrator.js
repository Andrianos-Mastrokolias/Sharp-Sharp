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
// - narratorDialogueHTML(): a static dialogue box (round
//   portrait, name plate, speech bubble; no timers) docked to
//   the top of the level intro card and the results cards.

import { STORY } from './story.js';

// Relative, so they also work from the department server's subfolder
const WAVE_SRC = './assets/ui/sipho-wave.webp';
const PORTRAIT_SRC = './assets/ui/sipho-portrait.webp';

// How long each menu line stays up before the next one
const ADVANCE_MS = 5000;

// Main menu figure size: 58% of the viewport height, clamped.
// If he would cover a menu button he shrinks by SIZE_STEP until
// he fits, and below MIN_SIZE he is hidden instead.
const MAX_SIZE = 640;
const BASE_SIZE = 360;
const MIN_SIZE = 240;
const SIZE_STEP = 0.9;

function menuSize() {
  return Math.min(MAX_SIZE, Math.max(BASE_SIZE, window.innerHeight * 0.58));
}

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// alt="" because the bubble and name plate carry the meaning; a
// missing image then leaves an empty space, not a broken icon.
function image(className, src, size) {
  return `<img class="${className}" src="${src}" alt="" width="${size}" height="${size}" decoding="async" draggable="false">`;
}

// ============================================================
// DIALOGUE BOX (level intro, results)
// ============================================================

// Put it straight before the screen's .sign card: it docks to
// the card's top edge at the same width (theme.css).
export function narratorDialogueHTML(line) {
  return `
    <div class="sipho-dialogue">
      ${image('sipho-avatar', PORTRAIT_SRC, 320)}
      <p class="sipho-plate">${escapeHTML(STORY.narrator)}</p>
      <p class="sipho-bubble sipho-says">${escapeHTML(line)}</p>
    </div>
  `;
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
  // and route sign); if he would, he shrinks, or hides when too small.
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
      ${image('sipho-figure', WAVE_SRC, 800)}
      <div class="sipho-say" role="group" aria-label="${escapeHTML(STORY.narrator)}">
        <div class="sipho-bubble sipho-bubble-right">
          <p class="sipho-line" aria-live="polite"></p>
          <div class="sipho-foot">
            <span class="sipho-count" aria-hidden="true"></span>
            <button type="button" class="sipho-next" aria-label="Next line">›</button>
          </div>
        </div>
        <button type="button" class="sipho-skip">skip</button>
      </div>
    `;

    this.root = root;
    this.index = 0;
    this.listeners = new AbortController();
    const { signal } = this.listeners;

    // Clicking anywhere on the bubble advances; the Next button is
    // inside it, so its clicks (and Enter / Space) land here too.
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
    const last = this.index >= this.lines.length - 1;

    this.root.querySelector('.sipho-line').textContent = this.lines[this.index];
    this.root.querySelector('.sipho-count').textContent =
      `${this.index + 1} / ${this.lines.length}`;
    // On the last line the button closes the bubble
    const button = this.root.querySelector('.sipho-next');
    button.textContent = last ? '✓' : '›';
    button.setAttribute('aria-label', last ? 'Close' : 'Next line');
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

  // True if he or his bubble covers a menu button or the sign.
  covers(obstacles) {
    const root = this.root;
    const parts = [root.querySelector('.sipho-figure')];
    if (!root.classList.contains('is-quiet')) {
      parts.push(root.querySelector('.sipho-say'));
    }

    // Zero-size while hidden by the narrow-screen media query
    const boxes = parts
      .filter(el => el.offsetWidth > 0)
      .map(el => layoutRect(el, root));

    return obstacles.some(r => boxes.some(box => overlaps(box, r)));
  }

  // Start at the full size and shrink step by step until he
  // covers nothing; hide him if that would take him below MIN_SIZE.
  fit() {
    const root = this.root;
    if (!root) return;

    root.classList.remove('is-tucked');

    const obstacles = [...this.getObstacles()]
      .map(el => el.getBoundingClientRect())
      .filter(r => r.width > 0 && r.height > 0);

    let size = menuSize();
    root.style.setProperty('--sipho-size', `${Math.round(size)}px`);

    while (this.covers(obstacles)) {
      size *= SIZE_STEP;

      if (size < MIN_SIZE) {
        root.classList.add('is-tucked');
        return;
      }

      root.style.setProperty('--sipho-size', `${Math.round(size)}px`);
    }
  }
}
