
import test from 'node:test';
import assert from 'node:assert/strict';
import { VehicleController } from '../src/vehicle/VehicleController.js';

function makeVehicle(level = 2) {
  const stresses = [];

  const vehicle = Object.create(VehicleController.prototype);
  vehicle.currentLevel = level;
  vehicle.speed = 0;
  vehicle.highSpeedTime = 0;

  vehicle.settings = {
    level2SpeedThreshold: 22,
    level2GraceTime: 3,
    level2StressRate: 1.2
  };

  vehicle.cargoSystem = {
    applyStress(amount) {
      stresses.push(amount);
    }
  };

  return { vehicle, stresses };
}

test('safe speed causes no sustained-speed stress', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.speed = 20;

  for (let i = 0; i < 600; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  assert.equal(stresses.length, 0);
});

test('high speed applies stress after grace period', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.speed = 31;

  for (let i = 0; i < 240; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  assert.ok(stresses.length > 0);
  assert.ok(stresses.every(value => value > 0));
});

test('slowing down stops additional sustained-speed stress', () => {
  const { vehicle, stresses } = makeVehicle();

  vehicle.speed = 31;

  for (let i = 0; i < 300; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  const previousCount = stresses.length;

  vehicle.speed = 20;

  for (let i = 0; i < 120; i++) {
    vehicle.updateLevel2Mechanic(1 / 60);
  }

  assert.equal(stresses.length, previousCount);
});

test('other levels do not receive Level 2 stress', () => {
  const { vehicle, stresses } = makeVehicle(1);

  vehicle.speed = 31;
  vehicle.highSpeedTime = 5;

  vehicle.updateLevel2Mechanic(1);

  assert.equal(stresses.length, 0);
  assert.equal(vehicle.highSpeedTime, 0);
});
