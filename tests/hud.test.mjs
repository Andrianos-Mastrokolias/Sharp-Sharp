// HUD logic test: node tests/hud.test.mjs
// The pure parts of the HUD: which pursuit states read as clear or spotted.
// The DOM itself is checked by playing (see the PR's manual checklist).
import assert from 'node:assert/strict';
import { CLEAR_STATES, SPOTTED_STATE, tailText } from '../src/ui/Hud.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ---------- Pursuit meter ----------

test('CLEAR_STATES: none, idle and patrolling read as clear', () => {
  for (const state of ['none', 'idle', 'patrolling']) {
    assert.ok(CLEAR_STATES.includes(state), state);
    assert.equal(tailText(state, 40), 'clear', state);
  }
});

test('CLEAR_STATES: states with a pursuer on the taxi are not clear', () => {
  for (const state of ['reacting', 'chasing', 'lost', 'searching', 'catching']) {
    assert.ok(!CLEAR_STATES.includes(state), state);
  }
});

test('spotted: the siren pause (reacting) shows SPOTTED, not a percentage', () => {
  assert.equal(SPOTTED_STATE, 'reacting');
  assert.equal(tailText('reacting', 0), 'SPOTTED');
});

test('chasing shows the pressure percentage', () => {
  assert.equal(tailText('chasing', 0), '0%');
  assert.equal(tailText('chasing', 73), '73%');
  assert.equal(tailText('searching', 12), '12%');
});


let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('PASS', name); }
  catch (err) { failed++; console.log('FAIL', name, '\n  ', err.message); }
}
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
