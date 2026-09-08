import * as THREE from 'three';
import './style.css';

// --------------------------------------------------
// 1. Scene, camera and renderer
// --------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b9d9);
scene.fog = new THREE.Fog(0x87b9d9, 80, 250);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --------------------------------------------------
// 2. Lighting
// --------------------------------------------------
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 2));

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(-30, 60, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -100;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
scene.add(sun);

// --------------------------------------------------
// 3. Helpers for creating objects
// --------------------------------------------------
function createBox(width, height, depth, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color })
  );

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// --------------------------------------------------
// 4. Ground and road
// --------------------------------------------------
const ground = createBox(400, 0.2, 400, 0x7b9368);
ground.position.y = -0.2;
scene.add(ground);

const road = createBox(18, 0.05, 400, 0x30343b);
road.position.y = -0.05;
scene.add(road);

// Road markings
for (let z = -190; z < 200; z += 12) {
  const line = createBox(0.18, 0.02, 5, 0xf4e9bf);
  line.position.set(0, 0.01, z);
  scene.add(line);
}

// Sidewalks and simple buildings
for (let z = -180; z <= 180; z += 30) {
  for (const side of [-1, 1]) {
    const sidewalk = createBox(7, 0.3, 28, 0xb8b8b0);
    sidewalk.position.set(side * 12.5, 0.05, z);
    scene.add(sidewalk);

    const height = 8 + ((Math.abs(z) + side + 5) % 5) * 3;
    const building = createBox(10, height, 22, 0x9aa8b1);
    building.position.set(side * 22, height / 2, z);
    scene.add(building);
  }
}

// --------------------------------------------------
// 5. Taxi hierarchy
// --------------------------------------------------
const taxi = new THREE.Group();
scene.add(taxi);

// Main body
const body = createBox(2.2, 1.1, 4.4, 0xe8c547);
body.position.y = 1.1;
taxi.add(body);

// Upper passenger cabin
const cabin = createBox(2.05, 1.0, 2.8, 0xe8c547);
cabin.position.set(0, 2.05, -0.15);
taxi.add(cabin);

// Windscreen
const windscreen = createBox(1.85, 0.65, 0.04, 0x28485c);
windscreen.position.set(0, 2.1, -1.57);
taxi.add(windscreen);

// Rear window
const rearWindow = createBox(1.85, 0.65, 0.04, 0x28485c);
rearWindow.position.set(0, 2.1, 1.27);
taxi.add(rearWindow);

// Headlights
for (const x of [-0.75, 0.75]) {
  const light = createBox(0.4, 0.25, 0.05, 0xfff4c2);
  light.position.set(x, 0.95, -2.23);
  taxi.add(light);
}

// Wheels are children of the taxi, so they move with it.
const wheels = [];
for (const x of [-1.15, 1.15]) {
  for (const z of [-1.45, 1.45]) {
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16),
      new THREE.MeshStandardMaterial({ color: 0x202124 })
    );

    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.45, z);
    wheel.castShadow = true;
    taxi.add(wheel);
    wheels.push(wheel);
  }
}

// Roof rack and placeholder luggage
const rack = createBox(1.9, 0.1, 3.1, 0x333333);
rack.position.set(0, 2.65, -0.1);
taxi.add(rack);

const luggage1 = createBox(0.9, 0.65, 1.0, 0x9b5c3c);
luggage1.position.set(-0.45, 3.03, -0.6);
taxi.add(luggage1);

const luggage2 = createBox(0.75, 0.9, 0.8, 0x596b75);
luggage2.position.set(0.5, 3.15, 0.4);
taxi.add(luggage2);

// --------------------------------------------------
// 6. Keyboard input
// --------------------------------------------------
const keys = {};

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;

  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === 'KeyR') {
    taxi.position.set(0, 0, 60);
    taxi.rotation.y = 0;
    speed = 0;
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

window.addEventListener('blur', () => {
  for (const key in keys) keys[key] = false;
});

// --------------------------------------------------
// 7. Mouse camera control
// --------------------------------------------------
let cameraAngle = 0;
let cameraDistance = 11;
let dragging = false;
let lastMouseX = 0;

renderer.domElement.addEventListener('pointerdown', (event) => {
  dragging = true;
  lastMouseX = event.clientX;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging) return;

  cameraAngle += (event.clientX - lastMouseX) * 0.005;
  lastMouseX = event.clientX;
});

renderer.domElement.addEventListener('pointerup', () => {
  dragging = false;
});

renderer.domElement.addEventListener('wheel', (event) => {
  cameraDistance = THREE.MathUtils.clamp(
    cameraDistance + event.deltaY * 0.01,
    6,
    20
  );
});

// --------------------------------------------------
// 8. Simple arcade driving
// --------------------------------------------------
let speed = 0;
const clock = new THREE.Clock();

taxi.position.set(0, 0, 60);

function updateVehicle(dt) {
  const accelerating = keys.KeyW || keys.ArrowUp;
  const braking = keys.KeyS || keys.ArrowDown;
  const left = keys.KeyA || keys.ArrowLeft;
  const right = keys.KeyD || keys.ArrowRight;

  if (accelerating) speed += 12 * dt;
  if (braking) speed -= 18 * dt;

  // Rolling resistance
  if (!accelerating && !braking) {
    speed *= Math.pow(0.97, dt * 60);
  }

  speed = THREE.MathUtils.clamp(speed, -8, 24);

  const steering = (left ? 1 : 0) - (right ? 1 : 0);

  // Steering has a stronger effect as the taxi moves.
  taxi.rotation.y += steering * speed * 0.035 * dt;

  // The taxi faces local -Z.
  taxi.translateZ(-speed * dt);

  // Keep the first prototype on the road.
  taxi.position.x = THREE.MathUtils.clamp(taxi.position.x, -8, 8);
  taxi.position.z = THREE.MathUtils.clamp(taxi.position.z, -190, 190);

  // Rotate wheels according to distance travelled.
  for (const wheel of wheels) {
    wheel.rotation.x -= speed * dt / 0.45;
  }
}

function updateCamera(dt) {
  const angle = taxi.rotation.y + cameraAngle;

  const desiredPosition = new THREE.Vector3(
    taxi.position.x + Math.sin(angle) * cameraDistance,
    taxi.position.y + cameraDistance * 0.45,
    taxi.position.z + Math.cos(angle) * cameraDistance
  );

  camera.position.lerp(desiredPosition, 1 - Math.exp(-6 * dt));
  camera.lookAt(
    taxi.position.x,
    taxi.position.y + 1.5,
    taxi.position.z
  );
}

// --------------------------------------------------
// 9. HUD
// --------------------------------------------------
const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <h1>SHARP-SHARP</h1>
  <p>Level 1 — Driving Prototype</p>
  <div id="speed">Speed: 0 km/h</div>
  <div class="instructions">
    W / S — Accelerate / Brake<br>
    A / D — Steer<br>
    Mouse drag — Rotate camera<br>
    Mouse wheel — Zoom<br>
    R — Reset taxi
  </div>
`;
document.body.appendChild(hud);

const speedDisplay = document.getElementById('speed');

// --------------------------------------------------
// 10. Animation loop
// --------------------------------------------------
function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  updateVehicle(dt);
  updateCamera(dt);

  speedDisplay.textContent =
    `Speed: ${Math.round(Math.abs(speed) * 3.6)} km/h`;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// --------------------------------------------------
// 11. Handle window resizing
// --------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});