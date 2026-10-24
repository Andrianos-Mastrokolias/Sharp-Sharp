// ============================================================
// MENU SCREENS
// ============================================================

// HTML builders for the overlay screens. The components below
// (road sign, taxi decal button, label, lettering
// lockup, shop band) are styled in theme.css; main.js and the
// loading screen build their screens from them. Buttons use
// data-action like the rest of the overlay.

// Per-level route code, sign arrow and destination for the
// road signs (main menu, level select, level intro and HUD).
export const ROUTES = {
  1: { code: 'L1', arrow: '↑', destination: 'CBD' },
  2: { code: 'L2', arrow: '↗', destination: 'DROP-OFF' },
  3: { code: 'L3', arrow: '→', destination: 'DROP-OFF' }
};

// "Rank to CBD" -> "Rank → CBD"
export function routeName(name) {
  return name.replace(/ to /i, ' → ');
}

// First sentence of a level's intro text, for a one-line summary.
function firstSentence(text = '') {
  const end = text.indexOf('. ');
  return end === -1 ? text : text.slice(0, end + 1);
}

// ============================================================
// COMPONENTS
// ============================================================

// rows: [[{ text, bg, font, size }]] - bg: ink | mustard |
// cream | maroon, font: rye | slab | bungee | sign,
// size: xl | lg (Bungee only).
export function lockup(rows) {
  const blocks = row => row
    .map(({ text, bg, font, size }) => `
      <span class="lk lk-${bg} lk-${font}${size ? ` lk-${size}` : ''}">${text}</span>
    `)
    .join('');

  return `
    <div class="lockup">
      ${rows.map(row => `<div class="lockup-row">${blocks(row)}</div>`).join('')}
    </div>
  `;
}

export function shopBand(text) {
  return `<div class="shop-band">${text}</div>`;
}

const DECAL_STRIPES =
  '<span class="decal-stripes" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

export function decalButton(action, text) {
  return `
    <button class="decal decal-btn" data-action="${action}">
      <span class="decal-label">${text}</span>
      ${DECAL_STRIPES}
    </button>
  `;
}

export function decalStripes() {
  return DECAL_STRIPES;
}

// Black label, like a taxi window sticker.
export function labelButton(action, text) {
  return `
    <button class="label" data-action="${action}">
      <span>${text}</span>
    </button>
  `;
}

export function labelRow(...labels) {
  return `<div class="label-row">${labels.join('')}</div>`;
}

// One button row per level: L1 | Rank → CBD | ↑
function routeRows(levels, descriptions) {
  return Object.keys(levels)
    .map(Number)
    .sort((a, b) => a - b)
    .map(level => {
      const route = ROUTES[level] ?? { code: `L${level}`, arrow: '→' };
      const summary = descriptions
        ? `<small>${firstSentence(descriptions[level])}</small>`
        : '';

      return `
        <button
          class="sign-row"
          data-action="playLevel"
          data-level="${level}"
        >
          <span class="sign-code">${route.code}</span>
          <span class="sign-name">${routeName(levels[level].name)}${summary}</span>
          <span class="sign-arrow" aria-hidden="true">${route.arrow}</span>
        </button>
      `;
    })
    .join('');
}

// Free-standing SELECT ROUTE sign. Pass descriptions to add a
// one-line summary under each route name.
export function routeSign(levels, { descriptions = null, poles = false } = {}) {
  return `
    <div class="sign">
      <div class="sign-head">SELECT ROUTE</div>
      <div class="sign-body">${routeRows(levels, descriptions)}</div>
      <div class="sign-chevron chevron"></div>
    </div>
    ${poles ? '<div class="sign-poles"><span></span><span></span></div>' : ''}
  `;
}

export function signStat(label, value) {
  return `
    <div class="sign-stat">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

const CONTROLS = [
  ['W / S', 'Drive'],
  ['A / D', 'Steer'],
  ['Space', 'Handbrake'],
  ['C', 'Camera'],
  ['L', 'Lights'],
  ['R', 'Retry'],
  ['Esc / P', 'Pause'],
  ['M', 'Mouse drive (LMB throttle, RMB brake, move to steer)'],
  ['Mouse drag', 'Look around (chase camera)'],
  ['Mouse wheel', 'Zoom (chase camera)']
];

export function controlsList() {
  return `
    <ul class="controls">
      ${CONTROLS.map(([key, action]) => `<li><kbd>${key}</kbd><span>${action}</span></li>`).join('')}
    </ul>
  `;
}

// Brick wall, cream wall, shop band and shutter behind the main
// menu screens and the loading screen.
export function menuBackdropHTML() {
  return `
    <div class="menu-backdrop" aria-hidden="true">
      <div class="menu-wall"></div>
      ${shopBand('SHARP-SHARP MOTOR SPARES (PTY) LTD')}
      <div class="shutter"></div>
    </div>
  `;
}

export function titleLockup() {
  return lockup([
    [
      { text: 'hola, driver', bg: 'ink', font: 'rye' },
      { text: 'LOADED', bg: 'mustard', font: 'slab' }
    ],
    [{ text: 'SHARP', bg: 'cream', font: 'bungee', size: 'xl' }],
    [
      { text: 'SHARP', bg: 'maroon', font: 'bungee', size: 'lg' },
      { text: "sho't left<br>to jozi", bg: 'ink', font: 'rye' }
    ],
    [{ text: 'RANK · CBD · HIGHWAY · EKASI', bg: 'mustard', font: 'sign' }]
  ]);
}

// ============================================================
// MAIN MENU
// ============================================================

export function mainMenuHTML(levels) {
  return `
    <div class="menu-layout">
      <div class="menu-left">
        ${titleLockup()}

        ${decalButton('startGame', 'PLAY GAME')}

        ${labelRow(
          `<details class="controls-menu">
            <summary class="label"><span>CONTROLS</span></summary>
            ${controlsList()}
          </details>`,
          labelButton('levelSelect', 'SELECT LEVEL'),
          labelButton('credits', 'CREDITS'),
          labelButton('settings', 'SETTINGS')
        )}
      </div>

      <div class="menu-right">
        ${routeSign(levels, { poles: true })}
      </div>
    </div>
  `;
}

// ============================================================
// LEVEL SELECT
// ============================================================

export function levelSelectHTML(levels, descriptions) {
  return `
    <div class="menu-center">
      ${lockup([[
        { text: 'choose your route', bg: 'ink', font: 'rye' },
        { text: 'SELECT LEVEL', bg: 'mustard', font: 'slab' }
      ]])}

      ${routeSign(levels, { descriptions })}

      ${labelButton('backToMenu', 'BACK')}
    </div>
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
  const sections = credits
    .map(section => `
      ${shopBand(section.heading)}
      ${section.entries.map(creditEntry).join('')}
    `)
    .join('');

  return `
    <div class="menu-center">
      ${lockup([[
        { text: 'sharp-sharp', bg: 'ink', font: 'rye' },
        { text: 'CREDITS', bg: 'mustard', font: 'slab' }
      ]])}

      <div class="credits-panel">
        ${sections}
      </div>

      ${labelButton('backToMenu', 'BACK')}
    </div>
  `;
}
