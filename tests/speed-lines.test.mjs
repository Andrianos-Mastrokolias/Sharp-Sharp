// Speed lines test: node --test tests/speed-lines.test.mjs
// The speed-lines material (src/shaders/SpeedLinesShader.js): its two uniforms
// (uTime, uSpeed), the uv varying passed from the vertex to the fragment
// shader, and the settings that keep it an overlay on top of everything.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeedLinesMaterial } from '../src/shaders/SpeedLinesShader.js';

test('the material has uTime and uSpeed, both starting at 0', () => {
  const material = createSpeedLinesMaterial();

  assert.deepEqual(Object.keys(material.uniforms).sort(), ['uSpeed', 'uTime']);
  assert.equal(material.uniforms.uTime.value, 0);
  assert.equal(material.uniforms.uSpeed.value, 0);

  material.dispose();
});

test('both shaders use the vUv varying', () => {
  const material = createSpeedLinesMaterial();

  assert.match(material.vertexShader, /varying vec2 vUv;/);
  assert.match(material.vertexShader, /vUv = uv;/);
  assert.match(material.fragmentShader, /varying vec2 vUv;/);
  assert.match(material.fragmentShader, /uniform float uTime;/);
  assert.match(material.fragmentShader, /uniform float uSpeed;/);

  material.dispose();
});

test('it is drawn as a transparent overlay', () => {
  const material = createSpeedLinesMaterial();

  assert.equal(material.transparent, true);
  assert.equal(material.depthTest, false);
  assert.equal(material.depthWrite, false);
  assert.equal(material.fog, false);
  assert.equal(material.toneMapped, false);

  material.dispose();
});
