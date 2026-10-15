
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createHeadlightBeamMaterial } from '../shaders/HeadlightBeamShader.js';

export function createTaxi(createBox) {
  const taxi = new THREE.Group();
  const chassis = new THREE.Group();

  taxi.add(chassis);

  // ==================================================
  // INVISIBLE FALLBACK / PHYSICS BODY
  // ==================================================

  const body = createBox(2.2, 1.1, 4.4, 0xe8c547);
  body.position.set(0, 1.1, 0);
  body.visible = false;
  chassis.add(body);

  const cabin = createBox(2.05, 1, 2.8, 0xe8c547);
  cabin.position.set(0, 2.05, -0.15);
  cabin.visible = false;
  chassis.add(cabin);

  const windscreen = createBox(1.85, 0.65, 0.04, 0x28485c);
  windscreen.position.set(0, 2.1, -1.57);
  windscreen.visible = false;
  chassis.add(windscreen);

  const rearWindow = createBox(1.85, 0.65, 0.04, 0x28485c);
  rearWindow.position.set(0, 2.1, 1.27);
  rearWindow.visible = false;
  chassis.add(rearWindow);

  // ==================================================
  // WHEELS
  // ==================================================

  // Arrays shared with VehicleController.
  // GLB wheel pivots are added after loading.

  const wheels = [];
  const frontWheelPivots = [];

  function createFallbackWheel(x, z, front = false) {
    const pivot = new THREE.Group();

    pivot.position.set(x, 0.45, z);
    taxi.add(pivot);

    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16),
      new THREE.MeshStandardMaterial({
        color: 0x202124
      })
    );

    wheel.rotation.z = Math.PI / 2;
    wheel.visible = false;

    pivot.add(wheel);
    wheels.push(wheel);

    if (front) {
      frontWheelPivots.push(pivot);
    }
  }

  createFallbackWheel(-1.15, -1.45, true);
  createFallbackWheel(1.15, -1.45, true);
  createFallbackWheel(-1.15, 1.45);
  createFallbackWheel(1.15, 1.45);

  // ==================================================
  // ROOF RACK
  // ==================================================

  const rackMaterial = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.55,
    metalness: 0.65
  });

  const rack = new THREE.Mesh(
    new RoundedBoxGeometry(
      1.75,
      0.07,
      2.75,
      3,
      0.035
    ),
    rackMaterial
  );

  rack.position.set(0, 1.92, 1.1);
  rack.castShadow = true;

  chassis.add(rack);

  // ==================================================
  // CARGO HELPER
  // ==================================================

  function roundedCargo(
    width,
    height,
    depth,
    color,
    radius = 0.08
  ) {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(
        width,
        height,
        depth,
        5,
        radius
      ),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.72,
        metalness: 0.02
      })
    );

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    return mesh;
  }

  // ==================================================
  // SUITCASE
  // ==================================================

  // The suitcase and its strap move together.
  const suitcase = new THREE.Group();

  suitcase.position.set(-0.48, 2.24, 0.42);

  const suitcaseBody = roundedCargo(
    0.8,
    0.55,
    0.9,
    0x8e542f,
    0.09
  );

  suitcase.add(suitcaseBody);

  const suitcaseStrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.56, 0.91),
    new THREE.MeshStandardMaterial({
      color: 0x3c291c,
      roughness: 0.8
    })
  );

  suitcaseStrap.castShadow = true;
  suitcase.add(suitcaseStrap);

  chassis.add(suitcase);

  // ==================================================
  // TRAVEL BAG
  // ==================================================

  const travelBag = roundedCargo(
    0.72,
    0.48,
    0.78,
    0x485d67,
    0.14
  );

  travelBag.position.set(0.45, 2.22, 0.42);
  chassis.add(travelBag);

  // ==================================================
  // CRATE
  // ==================================================

  const crate = roundedCargo(
    0.85,
    0.7,
    0.85,
    0x8a643c,
    0.035
  );

  crate.position.set(-0.45, 2.32, 1.28);
  chassis.add(crate);

  // ==================================================
  // MATTRESS
  // ==================================================

  const mattress = roundedCargo(
    1.65,
    0.22,
    1.15,
    0xcfc8ab,
    0.1
  );

  mattress.position.set(0, 2.12, 1.92);
  chassis.add(mattress);

  // ==================================================
  // FRIDGE
  // ==================================================

  // Group ensures the fridge's split line stays attached.
  const fridge = new THREE.Group();

  fridge.position.set(0.48, 2.58, 1.25);

  const fridgeBody = roundedCargo(
    0.75,
    1.25,
    0.7,
    0xe0e3e3,
    0.045
  );

  fridgeBody.material.roughness = 0.35;
  fridgeBody.material.metalness = 0.1;

  fridge.add(fridgeBody);

  const fridgeLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.025, 0.015),
    new THREE.MeshStandardMaterial({
      color: 0x8f9495
    })
  );

  fridgeLine.position.set(0, 0.17, -0.355);
  fridge.add(fridgeLine);

  chassis.add(fridge);

  // ==================================================
  // CARGO PHYSICS LIST
  // ==================================================

  const cargoItems = [
    {
      name: 'Suitcase',
      mesh: suitcase,
      vulnerability: 1
    },
    {
      name: 'Travel Bag',
      mesh: travelBag,
      vulnerability: 0.9
    },
    {
      name: 'Crate',
      mesh: crate,
      vulnerability: 0.75
    },
    {
      name: 'Mattress',
      mesh: mattress,
      vulnerability: 1.35
    },
    {
      name: 'Fridge',
      mesh: fridge,
      vulnerability: 1.15
    }
  ];

  // ==================================================
  // HEADLIGHTS
  // ==================================================

  let headlightsEnabled = false;

  const headlightTarget = new THREE.Object3D();

  // Slightly downward-directed headlights.
  headlightTarget.position.set(0, 0.25, -24);

  chassis.add(headlightTarget);

  function createHeadlight(x) {
    const light = new THREE.SpotLight(
      0xfff1d5,
      420,
      65,
      THREE.MathUtils.degToRad(28),
      0.65,
      1.25
    );

    light.position.set(x, 1.05, -2.15);

    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);

    light.shadow.bias = -0.0001;
    light.shadow.normalBias = 0.02;

    light.target = headlightTarget;

    chassis.add(light);

    return light;
  }

  const leftHeadlight = createHeadlight(-0.62);
  const rightHeadlight = createHeadlight(0.62);

  // ==================================================
  // HEADLIGHT GLOW
  // ==================================================

  function createGlow(x) {
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.35,
        0.18,
        0.04
      ),
      new THREE.MeshStandardMaterial({
        color: 0xfff1c7,
        emissive: 0xffdd99,
        emissiveIntensity: 2.8,
        roughness: 0.2
      })
    );

    glow.position.set(x, 0.95, -2.19);

    chassis.add(glow);

    return glow;
  }

  const leftGlow = createGlow(-0.62);
  const rightGlow = createGlow(0.62);

  // ==================================================
  // CUSTOM HEADLIGHT BEAMS
  // ==================================================

  // Two intersecting planes per headlight.
  // The shader controls soft fading and intensity.

  const beamLength = 16;

  function createBeam(x) {
    const geometry = new THREE.BufferGeometry();

    const nearZ = 0;
    const farZ = -beamLength;

    const positions = new Float32Array([
      // Horizontal beam
      -0.10, 0, nearZ,
       0.10, 0, nearZ,
      -2.20, 0, farZ,
       2.20, 0, farZ,

      // Vertical beam
       0, -0.06, nearZ,
       0,  0.06, nearZ,
       0, -0.75, farZ,
       0,  0.75, farZ
    ]);

    const uvs = new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      1, 1,

      0, 0,
      1, 0,
      0, 1,
      1, 1
    ]);

    const indices = [
      0, 2, 1,
      1, 2, 3,

      4, 6, 5,
      5, 6, 7
    ];

    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(uvs, 2)
    );

    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const beam = new THREE.Mesh(
      geometry,
      createHeadlightBeamMaterial()
    );

    beam.position.set(x, 0.95, -2.20);

    beam.renderOrder = 2;
    beam.frustumCulled = false;

    chassis.add(beam);

    return beam;
  }

  const leftBeam = createBeam(-0.55);
  const rightBeam = createBeam(0.55);

  // ==================================================
  // HEADLIGHT CONTROL
  // ==================================================

  function setHeadlightsEnabled(enabled) {
    headlightsEnabled = Boolean(enabled);

    leftHeadlight.visible = headlightsEnabled;
    rightHeadlight.visible = headlightsEnabled;

    leftGlow.visible = headlightsEnabled;
    rightGlow.visible = headlightsEnabled;

    leftBeam.visible = headlightsEnabled;
    rightBeam.visible = headlightsEnabled;

    const intensity = headlightsEnabled ? 1.0 : 0.0;

    leftBeam.material.uniforms.uIntensity.value = intensity;
    rightBeam.material.uniforms.uIntensity.value = intensity;
  }

  function toggleHeadlights() {
    setHeadlightsEnabled(!headlightsEnabled);
    return headlightsEnabled;
  }

  function getHeadlightsEnabled() {
    return headlightsEnabled;
  }

  // ==================================================
  // HEADLIGHT SHADER ANIMATION
  // ==================================================

  function updateVisualEffects(elapsedTime) {
    const leftUniforms = leftBeam.material.uniforms;
    const rightUniforms = rightBeam.material.uniforms;

    leftUniforms.uTime.value = elapsedTime;
    rightUniforms.uTime.value = elapsedTime;

    const subtleFlicker =
      0.98 +
      Math.sin(elapsedTime * 6.0) * 0.01;

    const intensity = headlightsEnabled
      ? subtleFlicker
      : 0;

    leftUniforms.uIntensity.value = intensity;
    rightUniforms.uIntensity.value = intensity;
  }

  setHeadlightsEnabled(false);

  // ==================================================
  // GLB WHEEL PIVOTS
  // ==================================================

  // Preserve the teammate's animated wheel implementation.

  function registerGlbWheelPivots(model) {
    const tyreGroups = [];

    model.traverse(child => {
      const name = child.name
        .toLowerCase()
        .replace(/\s/g, '');

      const looksLikeWheel =
        name.includes('tyre') ||
        name.includes('tire') ||
        name.includes('wheel');

      if (!looksLikeWheel) {
        return;
      }

      let hasMesh = false;

      child.traverse(part => {
        if (part.isMesh) {
          hasMesh = true;
        }
      });

      if (
        hasMesh &&
        !tyreGroups.includes(child)
      ) {
        tyreGroups.push(child);
      }
    });

    console.log(
      'GLB wheels found:',
      tyreGroups.map(tyre => tyre.name)
    );

    model.updateMatrixWorld(true);

    for (let i = 0; i < tyreGroups.length; i++) {
      const tyre = tyreGroups[i];
      const parent = tyre.parent;

      if (!parent) {
        continue;
      }

      // Find wheel centre.
      const box = new THREE.Box3().setFromObject(tyre);

      const centreWorld = box.getCenter(
        new THREE.Vector3()
      );

      const centreLocal = parent.worldToLocal(
        centreWorld.clone()
      );

      // Steering pivot.
      const steeringPivot = new THREE.Group();

      steeringPivot.name =
        `${tyre.name}-steering-pivot`;

      steeringPivot.position.copy(centreLocal);

      parent.add(steeringPivot);

      parent.updateWorldMatrix(true, false);
      steeringPivot.updateWorldMatrix(true, false);

      steeringPivot.attach(tyre);

      // Wheel spin pivot.
      const spinPivot = new THREE.Group();

      spinPivot.name =
        `${tyre.name}-spin-pivot`;

      spinPivot.userData.spinAxis = 'z';

      steeringPivot.add(spinPivot);

      steeringPivot.updateWorldMatrix(true, false);
      spinPivot.updateWorldMatrix(true, false);

      spinPivot.attach(tyre);

      wheels.push(spinPivot);

      // Determine front wheels.
      const wheelPosition = centreWorld.clone();

      chassis.worldToLocal(wheelPosition);

      if (wheelPosition.z < 0) {
        frontWheelPivots.push(steeringPivot);
      }
    }

    console.log(
      'Registered wheel pivots:',
      tyreGroups.length
    );
  }

  // ==================================================
  // SES'FIKILE GLB
  // ==================================================

  const loader = new GLTFLoader();

  loader.load(
    './assets/models/sesfikile.glb',

    gltf => {
      const model = gltf.scene;

      model.name = 'SesfikileModel';
      model.scale.setScalar(1);
      model.rotation.y = -Math.PI / 2;

      model.traverse(child => {
        if (!child.isMesh) {
          return;
        }

        child.castShadow = true;
        child.receiveShadow = true;

        const childMaterials = Array.isArray(child.material)
          ? child.material
          : [child.material];

        for (const material of childMaterials) {
          if (!material) {
            continue;
          }

          material.envMapIntensity = 1.25;

          if (
            material.isMeshStandardMaterial ||
            material.isMeshPhysicalMaterial
          ) {
            material.roughness = Math.min(
              material.roughness ?? 0.6,
              0.55
            );
          }

          material.needsUpdate = true;
        }
      });

      // Centre the model around X/Z.
      model.updateMatrixWorld(true);

      const initialBox = new THREE.Box3()
        .setFromObject(model);

      const centre = new THREE.Vector3();

      initialBox.getCenter(centre);

      model.position.x -= centre.x;
      model.position.z -= centre.z;

      model.updateMatrixWorld(true);

      // Position tyres close to ground level.
      const centredBox = new THREE.Box3()
        .setFromObject(model);

      model.position.y -= centredBox.min.y;
      model.position.y += 0.02;

      model.updateMatrixWorld(true);

      registerGlbWheelPivots(model);

      chassis.add(model);
    },

    undefined,

    error => {
      console.error(
        'Failed to load Sesfikile:',
        error
      );

      body.visible = true;
      cabin.visible = true;
      windscreen.visible = true;
      rearWindow.visible = true;

      for (const wheel of wheels) {
        wheel.visible = true;
      }
    }
  );

  // ==================================================
  // RETURN
  // ==================================================

  return {
    taxi,
    chassis,
    wheels,
    frontWheelPivots,
    cargoItems,
    setHeadlightsEnabled,
    toggleHeadlights,
    getHeadlightsEnabled,
    updateVisualEffects
  };
}
