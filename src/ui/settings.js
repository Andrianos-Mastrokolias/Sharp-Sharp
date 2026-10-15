import { lockup, labelButton } from './screens.js';

export function settingsHTML(preferences) {
  return `<div class="menu-center">
    ${lockup([[{ text: 'make it yours', bg: 'ink', font: 'rye' },
      { text: 'SETTINGS', bg: 'mustard', font: 'slab' }]])}
    <div class="sign">
      <div class="sign-head">SOUND &amp; GRAPHICS</div>
      <div class="sign-body">
        <label class="sign-stat" for="master-volume">Master volume
          <output for="master-volume">${Math.round(preferences.volume * 100)}%</output>
        </label>
        <input id="master-volume" name="volume" type="range" min="0" max="100"
          value="${Math.round(preferences.volume * 100)}" style="width:100%">
        <label class="sign-stat">Mute all audio
          <input name="muted" type="checkbox" ${preferences.muted ? 'checked' : ''}>
        </label>
        <label class="sign-stat">Graphics resolution
          <select name="quality">
            ${['low', 'medium', 'high'].map(quality => `<option value="${quality}"
              ${preferences.quality === quality ? 'selected' : ''}>${quality.toUpperCase()}</option>`).join('')}
          </select>
        </label>
        <p class="sign-text">Low reduces resolution for smoother driving. High uses up to 2× resolution on supported displays. Settings save automatically.</p>
      </div>
    </div>
    ${labelButton('closeSettings', 'BACK')}
  </div>`;
}
