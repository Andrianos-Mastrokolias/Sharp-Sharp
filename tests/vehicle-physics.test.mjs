
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  VehicleController
} from '../src/vehicle/VehicleController.js';

// Creates a lightweight, real VehicleController.
// We don't need the renderer, GLB models or full game.
function makeVehicle() {
  const stresses = [];

  const taxi = new THREE.Group();
  const chassis = new THREE.Group();
  taxi.add(chassis);

  const cargoSystem = {
    velocityX: 0,
    velocityZ: 0,

    applyStress(amount) {
      stresses.push(amount);
    },

    updateAttached() {},
    updateDetached() {},
    reset() {},
    getState() {
      return {};
    }
  };

  const collidableObjects = [];

  const vehicle = new VehicleController({
    taxi,
    chassis,
    wheels: [],
    frontWheelPivots: [],
    cargoSystem,
    collidableObjects,
    potholes: []
  });

  return {
    vehicle,
    taxi,
    stresses,
    collidableObjects
  };
}

function almostEqual(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${expected}, got ${actual}`
  );
}

// --------------------------------------------------
// COLLISION TESTS
// --------------------------------------------------

function testImpact(obstacleVelocity = null) {
  const { vehicle, taxi, stresses, collidableObjects } =
    makeVehicle();

  taxi.position.set(0, 0, 0);
  vehicle.speed = 20;

  const obstacle = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial()
  );

  obstacle.position.set(0, 1, 0);

  if (obstacleVelocity !== null) {
    obstacle.userData.velocity = obstacleVelocity;
  }

  collidableObjects.push(obstacle);

  const previousPosition = new THREE.Vector3(0, 0, 5);
  const collided = vehicle.checkCollisions(previousPosition);

  assert.equal(collided, true);
  assert.equal(stresses.length, 1);

  // Existing collision response should still apply.
  almostEqual(vehicle.speed, -4);
  almostEqual(taxi.position.z, 5);

  obstacle.geometry.dispose();
  obstacle.material.dispose();

  return stresses[0];
}

test('Static collision retains original cargo stress', () => {
  almostEqual(testImpact(), 12);
});

test('Head-on moving vehicle causes more damage', () => {
  // Player: -20 m/s along Z
  // Oncoming vehicle: +12 m/s along Z
  // Relative speed: 32 m/s
  const stress = testImpact(
    new THREE.Vector3(0, 0, 12)
  );

  almostEqual(stress, 17); // Maximum collision stress
});

test('Same-direction vehicle causes less damage', () => {
  // Player: -20 m/s along Z
  // Other vehicle: -12 m/s along Z
  // Relative speed: 8 m/s
  const stress = testImpact(
    new THREE.Vector3(0, 0, -12)
  );

  almostEqual(stress, 4.8);
});

test('No collision means no cargo stress', () => {
  const { vehicle, stresses, collidableObjects } =
    makeVehicle();

  vehicle.speed = 20;

  const obstacle = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2)
  );

  obstacle.position.set(100, 1, 100);
  collidableObjects.push(obstacle);

  const collided = vehicle.checkCollisions(
    new THREE.Vector3(0, 0, 3)
  );

  assert.equal(collided, false);
  assert.equal(stresses.length, 0);
  almostEqual(vehicle.speed, 20);

  obstacle.geometry.dispose();
});

// --------------------------------------------------
// LEVEL 2 STRAP PRESSURE
// --------------------------------------------------

test('Level 2 safe speed applies no extra stress', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(2);

  const threshold = vehicle.settings.level2SpeedThreshold;
  vehicle.speed = threshold - 1;

  for (let i = 0; i < 600; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  assert.equal(stresses.length, 0);
  almostEqual(vehicle.highSpeedTime, 0);
});

test('Level 2 sustained high speed applies stress', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(2);
  vehicle.speed = vehicle.settings.level2SpeedThreshold + 8;

  for (let i = 0; i < 300; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  assert.ok(stresses.length > 0);
  assert.ok(stresses.every(value => value > 0));
});

test('Slowing below threshold stops extra stress', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(2);
  const threshold = vehicle.settings.level2SpeedThreshold;

  vehicle.speed = threshold + 8;

  for (let i = 0; i < 300; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  const stressCount = stresses.length;
  assert.ok(stressCount > 0);

  vehicle.speed = threshold - 1;

  for (let i = 0; i < 120; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  assert.equal(stresses.length, stressCount);
});

test('Level 2 pressure does not affect other levels', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(1);
  vehicle.speed = 30;
  vehicle.highSpeedTime = 10;

  vehicle.updateLevel2Mechanic(1 / 60);

  assert.equal(stresses.length, 0);
  almostEqual(vehicle.highSpeedTime, 0);
});

// --------------------------------------------------
// LEVEL 3 HAZARD COOLDOWN
// --------------------------------------------------

test('Level 3 hazard cannot damage twice during cooldown', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(3);
  vehicle.speed = 20;

  vehicle.triggerLevel3Hazard(1, 1);

  assert.equal(stresses.length, 1);
  assert.ok(vehicle.level3HazardCooldown > 0);

  const speedAfterFirstHit = vehicle.speed;
  const suspensionAfterFirstHit =
    vehicle.suspensionVelocity;

  vehicle.triggerLevel3Hazard(1, 1);

  assert.equal(stresses.length, 1);
  almostEqual(vehicle.speed, speedAfterFirstHit);
  almostEqual(
    vehicle.suspensionVelocity,
    suspensionAfterFirstHit
  );
});

test('Level 3 hazard works again after cooldown expires', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(3);
  vehicle.speed = 20;

  vehicle.triggerLevel3Hazard(1, 1);
  assert.equal(stresses.length, 1);

  // Run an ordinary simulation frame long enough
  // for the cooldown timer to expire.
  vehicle.update(
    vehicle.settings.level3HazardCooldown + 0.01,
    {}
  );

  almostEqual(vehicle.level3HazardCooldown, 0);

  vehicle.speed = 20;
  vehicle.triggerLevel3Hazard(1, 1);

  assert.equal(stresses.length, 2);
});

test('Level 3 hazard is ignored in Level 1', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(1);
  vehicle.speed = 20;

  vehicle.triggerLevel3Hazard(1, 1);

  assert.equal(stresses.length, 0);
  almostEqual(vehicle.speed, 20);
});

// --------------------------------------------------
// LEVEL 1 KERB COOLDOWN
// --------------------------------------------------

test('Kerb impact slows the taxi and respects cooldown', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.setLevel(1);
  vehicle.speed = 12;

  vehicle.triggerKerbImpact(1, 1);

  assert.equal(stresses.length, 1);
  assert.ok(vehicle.speed < 12);
  assert.ok(vehicle.kerbImpactCooldown > 0);

  const speedAfterHit = vehicle.speed;

  vehicle.triggerKerbImpact(1, 1);

  assert.equal(stresses.length, 1);
  almostEqual(vehicle.speed, speedAfterHit);
});

test('Reset clears hazard cooldowns', () => {
  const { vehicle } = makeVehicle();

  vehicle.level3HazardCooldown = 0.6;
  vehicle.kerbImpactCooldown = 0.25;

  vehicle.reset();

  almostEqual(vehicle.level3HazardCooldown, 0);
  almostEqual(vehicle.kerbImpactCooldown, 0);
});
