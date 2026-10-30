// Story test: node --test tests/story.test.mjs
// Bra Sipho's lines (src/ui/story.js): the menu lines, one intro line for every
// level, a win and a lose line, and no empty strings anywhere. Plus the small
// narrator card puts a line on screen as text, not HTML.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY } from '../src/ui/story.js';
import { LEVELS } from '../src/world/LevelManager.js';
import { narratorCardHTML, withNarrator } from '../src/ui/narrator.js';

const isLine = value => typeof value === 'string' && value.trim().length > 0;

// Every string in the story object, with its path for the error message
function strings(value, path = 'STORY') {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  }
  return [[path, value]];
}

test('the narrator has a name', () => {
  assert.ok(isLine(STORY.narrator));
});

test('the main menu has the four lines, in order', () => {
  assert.equal(STORY.menu.length, 4);
  assert.match(STORY.menu[0], /^Sharp-sharp! I'm Bra Sipho/);
  assert.match(STORY.menu[3], /Hold on tight!$/);
});

test('every level has an intro line', () => {
  const levels = Object.keys(LEVELS).map(Number);
  assert.ok(levels.length >= 3);

  for (const level of levels) {
    assert.ok(isLine(STORY.intro[level]), `no intro line for level ${level}`);
  }

  // No lines for levels that don't exist
  for (const level of Object.keys(STORY.intro).map(Number)) {
    assert.ok(LEVELS[level], `intro line for unknown level ${level}`);
  }
});

test('there are win and lose lines', () => {
  assert.ok(isLine(STORY.win));
  assert.ok(isLine(STORY.lose));
  assert.notEqual(STORY.win, STORY.lose);
});

test('no empty strings anywhere', () => {
  const all = strings(STORY);
  assert.ok(all.length > 0);

  for (const [path, value] of all) {
    assert.ok(isLine(value), `${path} is empty or not a string`);
  }
});

test('the narrator card shows a line as text', () => {
  const html = narratorCardHTML('Eish <b>"cops"</b> & co');
  assert.match(html, /Eish &lt;b&gt;&quot;cops&quot;&lt;\/b&gt; &amp; co/);
  assert.match(html, /\.\/assets\/ui\/sipho-wave\.webp/);

  const screen = withNarrator('<div class="ss-column">X</div>', STORY.win);
  assert.ok(screen.startsWith('<div class="sipho-row"><div class="ss-column">X</div>'));
  assert.ok(screen.includes(STORY.win));
});
