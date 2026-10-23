
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VehicleController } from '../src/vehicle/VehicleController.js';

function simulateCollision(velocity) {
  const taxi = new THREE.Group();
  const obstacle = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2)
  );

  obstacle.position.y = 1;

  if (velocity !== null) {
    obstacle.userData.velocity = velocity;
  }

  const stresses = [];
  const vehicle = Object.create(VehicleController.prototype);

  vehicle.taxi = taxi;
  vehicle.taxiBox = new THREE.Box3();
  vehicle.obstacleBox = new THREE.Box3();
  vehicle.localTaxiCollisionBox = new THREE.Box3(
    new THREE.Vector3(-1.35, 0, -2.3),
    new THREE.Vector3(1.35, 2.8, 2.3)
  );

  vehicle.collidableObjects = [obstacle];
  vehicle.speed = 20;
  vehicle.lateralVelocity = 0;
  vehicle.suspensionVelocity = 0;
  vehicle.cargoSystem = {
    applyStress(amount) {
      stresses.push(amount);
    }
  };

  const collided = vehicle.checkCollisions(
    new THREE.Vector3(0, 0, 3)
  );

  assert.equal(collided, true);
  assert.equal(stresses.length, 1);
  return stresses[0];
}

test('static collision keeps original stress', () => {
  assert.equal(simulateCollision(null), 12);
});

test('oncoming vehicle increases collision stress', () => {
  const stress = simulateCollision(
    new THREE.Vector3(0, 0, 12)
  );

  assert.equal(stress, 17);
});

test('same-direction vehicle reduces collision stress', () => {
  const stress = simulateCollision(
    new THREE.Vector3(0, 0, -12)
  );

  assert.ok(Math.abs(stress - 4.8) < 1e-9);
});
