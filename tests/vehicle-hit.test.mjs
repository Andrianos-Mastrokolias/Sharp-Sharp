
import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleController } from '../src/vehicle/VehicleController.js';

function createTestVehicle(speed = 20) {
  const stresses = [];
  const vehicle = Object.create(VehicleController.prototype);

  vehicle.speed = speed;
  vehicle.suspensionVelocity = 0;
  vehicle.cargoSystem = {
    applyStress(amount) {
      stresses.push(amount);
    }
  };

  return { vehicle, stresses };
}

test('applyHit reduces speed and applies stress once', () => {
  const { vehicle, stresses } = createTestVehicle();

  vehicle.applyHit({
    speedLoss: 0.3,
    stress: 2,
    kick: 0.5
  });

  assert.equal(vehicle.speed, 14);
  assert.deepEqual(stresses, [2]);
  assert.equal(vehicle.suspensionVelocity, -0.5);
});

test('applyHit preserves reverse direction', () => {
  const { vehicle } = createTestVehicle(-10);

  vehicle.applyHit({ speedLoss: 0.5 });

  assert.equal(vehicle.speed, -5);
});

test('applyHit clamps invalid ranges', () => {
  const { vehicle, stresses } = createTestVehicle();

  vehicle.applyHit({
    speedLoss: 2,
    stress: -5,
    kick: 3
  });

  assert.equal(vehicle.speed, 0);
  assert.deepEqual(stresses, []);
  assert.equal(vehicle.suspensionVelocity, -1);
});

test('applyHit defaults cause no changes', () => {
  const { vehicle, stresses } = createTestVehicle();

  vehicle.applyHit();

  assert.equal(vehicle.speed, 20);
  assert.deepEqual(stresses, []);
  assert.equal(vehicle.suspensionVelocity, 0);
});
