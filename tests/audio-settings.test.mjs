import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GameAudio } from '../src/audio/GameAudio.js';
import * as THREE from 'three';
import { VehicleController } from '../src/vehicle/VehicleController.js';
import { CargoSystem } from '../src/vehicle/CargoSystem.js';
import { normalizePreferences, readPreferences, savePreferences, applyQuality } from '../src/game/preferences.js';

function audioContext() {
  const nodes = [];
  const parameter = () => ({ value: 0,
    setTargetAtTime(value) { this.value = value; },
    setValueAtTime(value) { this.value = value; },
    exponentialRampToValueAtTime(value) { this.value = value; }
  });
  return {
    state: 'suspended', currentTime: 1, destination: {}, nodes, resumes: 0,
    async resume() { this.resumes++; this.state = 'running'; },
    async close() { this.state = 'closed'; },
    createGain() { return { gain: parameter(), connect(target) { return target; }, disconnect() {} }; },
    createOscillator() {
      const node = { frequency: parameter(), starts: 0, stops: 0,
        connect(target) { return target; }, disconnect() {},
        start() { this.starts++; }, stop() { this.stops++; }
      };
      nodes.push(node);
      return node;
    }
  };
}

test('unlock shares one context and only three continuous sources across restarts', async () => {
  const context = audioContext();
  let created = 0;
  const audio = new GameAudio(() => { created++; return context; });
  assert.equal(created, 0);
  assert.equal(audio.cue('cargo'), false);
  await Promise.all([audio.unlock(), audio.unlock()]);
  for (let i = 0; i < 10; i++) {
    audio.setActive(true);
    audio.setActive(false);
    await audio.unlock();
  }
  assert.equal(created, 1);
  assert.equal(context.resumes, 1);
  assert.equal(context.nodes.length, 3);
  assert.ok(context.nodes.every(node => node.starts === 1));
  audio.dispose();
  assert.equal(context.state, 'closed');
  assert.equal(await new GameAudio(() => null).unlock(), false);
  assert.equal(await new GameAudio(() => { throw Error('unavailable'); }).unlock(), false);
});

test('speed changes engine pitch; siren follows pursuit and pause silences all sources', async () => {
  const context = audioContext();
  const audio = new GameAudio(() => context);
  await audio.unlock();
  audio.setActive(true);
  audio.update(0.016, 0, 'idle', false);
  const idle = audio.engine.frequency.value;
  audio.update(0.016, 25, 'chasing', false);
  assert.ok(audio.engine.frequency.value > idle);
  assert.ok(audio.sirenGain.gain.value > 0);
  context.currentTime += 0.1;
  const frequency = audio.siren.frequency.value;
  audio.update(0.016, 25, 'catching', false);
  assert.notEqual(audio.siren.frequency.value, frequency);
  audio.update(0.016, 25, 'lost', false);
  assert.equal(audio.sirenGain.gain.value, 0);
  audio.setActive(false);
  for (const gain of [audio.engineGain, audio.windGain, audio.sirenGain]) assert.equal(gain.gain.value, 0);
  assert.equal(audio.voices.size, 0);
  audio.dispose();
});

test('music scheduling is bounded, pauses, and does not catch up after a long stall', async () => {
  const context = audioContext();
  const audio = new GameAudio(() => context);
  await audio.unlock();
  const calls = [];
  audio.cue = (...args) => calls.push(args);
  audio.setActive(true);
  audio.update(0.016, 0, 'idle', false);
  const first = calls.length;
  for (let i = 0; i < 100; i++) audio.update(0.016, 0, 'idle', false);
  assert.equal(calls.length, first);
  context.currentTime += 100;
  audio.update(0.016, 0, 'idle', false);
  assert.ok(calls.length <= first + 2);
  audio.setActive(false);
  const paused = calls.length;
  context.currentTime += 100;
  audio.update(0.016, 0, 'idle', false);
  assert.equal(calls.length, paused);
  audio.dispose();
});

test('master mute covers continuous and transient audio; effect voices are bounded', async () => {
  const audio = new GameAudio(() => audioContext());
  await audio.unlock();
  audio.setVolume(0);
  assert.equal(audio.master.gain.value, 0);
  assert.equal(audio.cue('impact'), false);
  audio.setVolume(0.25);
  for (let i = 0; i < 8; i++) assert.equal(audio.cue(i % 2 ? 'cargo' : 'impact'), true);
  assert.equal(audio.cue('cargo'), false);
  [...audio.voices][0].onended();
  assert.equal(audio.cue('cargo'), true);
  audio.setActive(true);
  audio.setActive(false);
  assert.equal(audio.voices.size, 0);
  audio.dispose();
});

test('a cue before the first gameplay frame is still stopped by an inactive transition', async () => {
  const audio = new GameAudio(() => audioContext());
  await audio.unlock();
  assert.equal(audio.active, false);
  assert.equal(audio.cue('cargo'), true);
  const voice = [...audio.voices][0];
  audio.setActive(false);
  assert.equal(audio.voices.size, 0);
  assert.equal(voice.stops, 2);
  audio.dispose();
});

test('every cue name main.js plays exists in CUES, and pedestrianHit thuds', async () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const names = new Set();
  for (const match of source.matchAll(/\b(?:playCue|audio\.cue)\??\.?\(\s*'([^']+)'/g)) names.add(match[1]);
  const scoreCues = source.match(/SCORE_CUES\s*=\s*\{([^}]*)\}/);
  assert.ok(scoreCues, 'SCORE_CUES not found in main.js');
  for (const match of scoreCues[1].matchAll(/:\s*'([^']+)'/g)) names.add(match[1]);
  for (const name of ['beaten', 'firstOut', 'pedestrianHit', 'cargo', 'impact']) {
    assert.ok(names.has(name), `expected main.js to play ${name}`);
  }
  // main.js plays these through playCue(countdown.cue), so there is no literal to parse
  names.add('countdown').add('go');
  const context = audioContext();
  const audio = new GameAudio(() => context);
  await audio.unlock();
  for (const name of names) {
    assert.equal(audio.cue(name), true, `main.js plays '${name}' but CUES has no such cue`);
    for (const voice of [...audio.voices]) voice.onended();
  }
  const types = context.nodes.slice(3).map(node => node.type);
  assert.equal(types[[...names].indexOf('pedestrianHit')], 'sawtooth');
  audio.dispose();
});

test('preferences tolerate invalid storage and persist volume, mute and real pixel ratio', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(normalizePreferences({ volume: NaN, quality: 'bad', muted: 'yes' }).volume, 0.6);
  const settings = { volume: 0.25, muted: true, quality: 'low' };
  savePreferences(storage, settings);
  assert.deepEqual(readPreferences(storage), settings);
  assert.equal(readPreferences({ getItem() { throw Error('blocked'); } }).quality, 'high');
  let ratio;
  const renderer = { setPixelRatio(value) { ratio = value; } };
  for (const [quality, expected] of [['low', 0.75], ['medium', 1], ['high', 2]]) {
    applyQuality(renderer, quality, 3);
    assert.equal(ratio, expected);
  }
});

test('actual obstacle collision reports impact speed and preserves updated physics and cargo stress', () => {
  const taxi = new THREE.Group();
  const obstacle = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  obstacle.updateMatrixWorld();
  const impacts = [];
  const stresses = [];
  const vehicle = Object.assign(Object.create(VehicleController.prototype), {
    taxi, collidableObjects: [obstacle], speed: 10, lateralVelocity: 4, suspensionVelocity: 0,
    taxiBox: new THREE.Box3(), obstacleBox: new THREE.Box3(),
    localTaxiCollisionBox: new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)),
    cargoSystem: { applyStress: value => stresses.push(value) },
    onCollision: speed => impacts.push(speed)
  });
  assert.equal(vehicle.checkCollisions(new THREE.Vector3(0, 0, 5)), true);
  assert.deepEqual(impacts, [10]);
  assert.equal(vehicle.speed, -2);
  assert.equal(vehicle.lateralVelocity, -1);
  assert.equal(vehicle.suspensionVelocity, -0.6);
  assert.deepEqual(stresses, [6]);
  assert.equal(vehicle.checkCollisions(taxi.position.clone()), false);
  assert.deepEqual(impacts, [10]);
  obstacle.geometry.dispose();
  obstacle.material.dispose();
});

test('updated cargo detachment emits one audio cue and pause stops it', async () => {
  const audio = new GameAudio(() => audioContext());
  await audio.unlock();
  audio.setActive(true);
  const scene = new THREE.Scene();
  const taxi = new THREE.Group();
  const chassis = new THREE.Group();
  const luggage = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  scene.add(taxi);
  taxi.add(chassis);
  chassis.add(luggage);
  const events = [];
  const cargo = new CargoSystem({
    scene, taxi, chassis,
    cargoItems: [{ name: 'luggage', mesh: luggage, vulnerability: 1 }],
    onCargoLost: event => { events.push(event); audio.cue('cargo'); }
  });
  cargo.detach(cargo.items[0], 10);
  cargo.detach(cargo.items[0], 10);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'luggage');
  assert.equal(events[0].remaining, 0);
  assert.equal(luggage.parent, scene);
  assert.equal(audio.voices.size, 1);
  audio.setActive(false);
  assert.equal(audio.voices.size, 0);
  audio.dispose();
  luggage.geometry.dispose();
  luggage.material.dispose();
});
