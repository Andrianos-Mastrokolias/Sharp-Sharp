
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { CargoSystem } from '../src/vehicle/CargoSystem.js';
import { VehicleController } from '../src/vehicle/VehicleController.js';

function simulateHighway(speed) {
  const scene = new THREE.Scene();
  const taxi = new THREE.Group();
  const chassis = new THREE.Group();

  scene.add(taxi);
  taxi.add(chassis);

  const vulnerabilities = [1, 0.9, 0.75, 1.35, 1.15];

  const cargoItems = vulnerabilities.map((v, index) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1)
    );

    mesh.position.set(0, 2, index);
    chassis.add(mesh);

    return {
      name: `Cargo ${index}`,
      mesh,
      vulnerability: v
    };
  });

  const cargoSystem = new CargoSystem({
    scene,
    taxi,
    chassis,
    cargoItems
  });

  // Test the real sustained-speed and cargo methods
  // without loading the full 3D environment.
  const vehicle = Object.create(VehicleController.prototype);
  vehicle.currentLevel = 2;
  vehicle.highSpeedTime = 0;
  vehicle.speed = speed;
  vehicle.cargoSystem = cargoSystem;
  vehicle.settings = {
    level2SpeedThreshold: 26,
    level2GraceTime: 3,
    level2StressRate: 2.0
  };

  const dt = 1 / 60;
  let distance = 0;

  while (distance < 1100) {
    vehicle.updateLevel2Mechanic(dt);

    cargoSystem.updateAttached(dt, {
      speed,
      previousSpeed: speed,
      steeringInput: 0,
      lateralVelocity: 0,
      handbrake: false,
      suspensionVelocity: 0,
      level: 2
    });

    distance += speed * dt;
  }

  return cargoSystem.getState();
}

test('Controlled highway driving preserves all cargo', () => {
  const result = simulateHighway(25);

  assert.equal(result.remaining, 5);
  assert.equal(result.straps, 100);
});

test('Flat-out highway remains winnable', () => {
  const result = simulateHighway(31);

  assert.ok(result.remaining >= 3);
  assert.ok(result.straps < 100);
});
