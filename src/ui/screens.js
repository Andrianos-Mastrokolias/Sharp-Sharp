// ============================================================
// MENU SCREENS
// ============================================================

// HTML builders for the level select and credits panels. They
// render into main.js's existing overlay and reuse its ss-*
// classes; only the extra pieces are styled here. Buttons use
// data-action like the rest of the overlay.

const styles = `
  .ss-level-button {
    text-align: left;
  }

  .ss-level-button small {
    display: block;
    margin-top: 4px;

    font-size: 13px;
    font-weight: normal;
    opacity: 0.8;
  }

  .ss-credits {
    text-align: left;
  }

  .ss-credits h2 {
    margin: 22px 0 8px;

    color: #f5c84c;
    font-size: 13px;
    letter-spacing: 3px;
    text-transform: uppercase;
  }

  .ss-credit {
    padding: 8px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  }

  .ss-credit span {
    display: block;
    color: #aebdc8;
    font-size: 14px;
  }

  .ss-credit small {
    display: block;
    color: #7f93a3;
    font-size: 12px;
    line-height: 1.6;
    word-break: break-all;
  }

  .ss-credit .ss-todo {
    color: #ff7785;
  }

  .ss-sticky-back {
    position: sticky;
    bottom: 0;
  }
`;

let stylesAdded = false;

function addStyles() {
  if (stylesAdded) return;
  stylesAdded = true;

  const style = document.createElement('style');
  style.textContent = styles;
  document.head.appendChild(style);
}

// First sentence of a level's intro text, for a one-line summary.
function firstSentence(text = '') {
  const end = text.indexOf('. ');
  return end === -1 ? text : text.slice(0, end + 1);
}

// ============================================================
// LEVEL SELECT
// ============================================================

export function levelSelectHTML(levels, descriptions) {
  addStyles();

  const buttons = Object.keys(levels)
    .map(Number)
    .sort((a, b) => a - b)
    .map(level => `
      <button
        class="ss-button secondary ss-level-button"
        data-action="playLevel"
        data-level="${level}"
      >
        LEVEL ${level} — ${levels[level].name}
        <small>${firstSentence(descriptions[level])}</small>
      </button>
    `)
    .join('');

  return `
    <div class="ss-eyebrow">Choose your route</div>

    <h1 class="ss-title">SELECT LEVEL</h1>

    ${buttons}

    <button class="ss-button" data-action="backToMenu">
      BACK
    </button>
  `;
}

// ============================================================
// CREDITS
// ============================================================

function creditEntry({ name, detail, files = [] }) {
  const todo = detail?.includes('TODO');

  return `
    <div class="ss-credit">
      <strong>${name}</strong>
      ${detail ? `<span class="${todo ? 'ss-todo' : ''}">${detail}</span>` : ''}
      ${files.length ? `<small>${files.join('<br>')}</small>` : ''}
    </div>
  `;
}

export function creditsHTML(credits) {
  addStyles();

  const sections = credits
    .map(section => `
      <h2>${section.heading}</h2>
      ${section.entries.map(creditEntry).join('')}
    `)
    .join('');

  return `
    <div class="ss-eyebrow">Sharp-Sharp</div>

    <h1 class="ss-title">CREDITS</h1>

    <div class="ss-credits">
      ${sections}
    </div>

    <button class="ss-button ss-sticky-back" data-action="backToMenu">
      BACK
    </button>
  `;
}
