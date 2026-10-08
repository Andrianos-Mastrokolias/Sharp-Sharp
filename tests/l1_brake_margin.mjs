// Level 1 brake window (analysis, not part of the suite):
//   node tests/l1_brake_margin.mjs
// Measures how late/early a taxi at top speed can start braking and
// still deliver at the Level 1 zone with the relentless pursuer on its
// bumper (starting at CRUISE_GAP). For each brake point (metres before
// the delivery-zone edge) it reports whether the run delivers, and the
// "margin": seconds of spare time before the pursuer would have been in
// capture range for the full captureTime. Two driver models: hold the
// brake until stopped, or brake down to 3.9 m/s and crawl in.
// Vehicle braking copied (read-only) from VehicleController.update:
// speed -= brakingForce*dt, then air resistance speed -= v*|v|*airResistance*dt;
// W (acceleration 13) is held until the brake, so the taxi arrives at top speed.
import * as THREE from 'three';
import { LevelManager, LEVELS } from '../src/world/LevelManager.js';
import { CRUISE_GAP } from '../src/world/PursuitSystem.js';

const DT = 1 / 60;
const TOP = 28, BRAKE = 24, AIR = 0.012, ACCEL = 13;
const dest = LEVELS[1].destination;
const edgeZ = dest.z + dest.radius;          // zone edge the taxi meets first

function trial(brakeAt, crawl = false) {   // brakeAt: metres before the zone edge
  const taxi = new THREE.Object3D();
  let speed = TOP;
  const out = { delivered: null, captured: null };
  const vehicle = {
    settings: { maxForwardSpeed: TOP },
    cargoSystem: { getState: () => ({}) },
    setBounds() {}, setSpawn() {}, setGroundHeightProvider() {},
    reset(s) { taxi.position.set(s.x, 0, s.z); },
    getSpeed: () => speed, getHighSpeedTime: () => 0, getLevel2Pressure: () => 0
  };
  const lm = new LevelManager({
    scene: new THREE.Scene(), vehicle, taxi, collidables: [], potholes: [],
    getHeadlightsEnabled: () => true,
    onDelivered: () => { out.delivered = t; }, onCaptured: () => { out.captured = t; }
  });
  lm.load(1);
  taxi.position.set(0, 0, -80);
  lm.update(DT, 0); lm.update(DT, 0);        // trigger the pursuer
  const startZ = edgeZ + brakeAt;
  taxi.position.set(0, 0, startZ + 60);      // cruise 60 m before the brake point
  lm.pursuit.x = 0; lm.pursuit.z = taxi.position.z + CRUISE_GAP;
  lm.pursuit.heading = 0; lm.pursuit.speed = TOP;

  let t = 0, braking = false, brakeT = null, contactT = null;
  for (; t < 30 && !out.delivered && !out.captured; t += DT) {
    if (!braking && taxi.position.z <= startZ) { braking = true; brakeT = t; }
    if (braking) { speed -= BRAKE * DT; } else { speed += ACCEL * DT; }   // W held until the brake
    speed -= speed * Math.abs(speed) * AIR * DT;
    speed = Math.min(Math.max(speed, crawl && braking ? 3.9 : 0), TOP);   // crawl: release S at 3.9 m/s
    taxi.position.z -= speed * DT;
    lm.update(DT, t);
    if (contactT === null && lm.pursuit.distance <= 7) contactT = t;
  }
  const margin = out.delivered
    ? (contactT === null ? Infinity : 1.5 - (out.delivered - contactT)) : null;
  return { ...out, brakeT, contactT, margin, endZ: taxi.position.z };
}

for (const crawl of [false, true]) {
  if (crawl) console.log();
  console.log(crawl ? 'Brake to 3.9 m/s then crawl' : 'Hold the brake until stopped');
  let lo = null, hi = null, minMargin = Infinity;
  for (let b = 80; b >= -16; b -= 0.5) {
    const r = trial(b, crawl);
    if (!r.delivered) continue;
    hi ??= { b, r }; lo = { b, r };
    minMargin = Math.min(minMargin, r.margin);
  }
  const f = x => `${x.b} m (delivered ${x.r.margin === Infinity ? 'with no contact' : 'margin ' + x.r.margin.toFixed(2) + ' s'})`;
  console.log('  earliest brake point that delivers:', f(hi), '(m before zone edge)');
  console.log('  latest brake point that delivers:  ', f(lo), '(negative = inside zone)');
  console.log('  smallest margin anywhere in the window:', minMargin.toFixed(2), 's');
}
