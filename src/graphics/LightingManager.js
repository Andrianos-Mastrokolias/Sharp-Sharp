
import * as THREE from 'three';

import {
  RGBELoader
} from 'three/examples/jsm/loaders/RGBELoader.js';

// Level 3's night HDRI is applied through scene.environment.
// Reduce its intensity so the headlights remain important.
const L3_ENVIRONMENT_INTENSITY = 0.5;

export class LightingManager {
  constructor({ scene, renderer }) {
    this.scene = scene;
    this.renderer = renderer;
    this.currentLevel = 1;
    this.environmentMaps = {};

    // ==================================================
    // RENDERER
    // ==================================================

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ==================================================
    // HDRI PROCESSING
    // ==================================================

    this.pmremGenerator = new THREE.PMREMGenerator(renderer);
    this.pmremGenerator.compileEquirectangularShader();

    // ==================================================
    // HEMISPHERE LIGHT
    // ==================================================

    this.hemisphereLight = new THREE.HemisphereLight(
      0xd7ecff,
      0x66705c,
      1.55
    );

    this.scene.add(this.hemisphereLight);

    // ==================================================
    // SUN
    // ==================================================

    this.sun = new THREE.DirectionalLight(
      0xffe7c2,
      2.35
    );

    this.sun.position.set(-45, 55, 40);
    this.sun.castShadow = true;

    this.sun.shadow.mapSize.set(2048, 2048);

    this.sun.shadow.camera.left = -75;
    this.sun.shadow.camera.right = 75;
    this.sun.shadow.camera.top = 100;
    this.sun.shadow.camera.bottom = -100;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 200;

    this.sun.shadow.bias = -0.00008;
    this.sun.shadow.normalBias = 0.035;

    this.scene.add(this.sun);

    // ==================================================
    // SUN SHADOW TRACKING — NEW
    // ==================================================

    // A directional light points towards its target.
    // By moving the sun and target together, the lighting
    // direction stays constant while the shadow camera
    // remains centred around the moving taxi.

    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(0, 0, 0);

    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;

    // Preserve the sun's level-specific direction.
    this.sunOffset = new THREE.Vector3(-45, 55, 40);

    // Avoid unnecessary shadow updates if the taxi
    // has barely moved.
    this.shadowTrackingPosition = new THREE.Vector3();
    this.shadowTrackingInitialized = false;

    // ==================================================
    // FILL LIGHT
    // ==================================================

    this.fillLight = new THREE.DirectionalLight(
      0xc9dfee,
      0.55
    );

    this.fillLight.position.set(40, 30, -40);
    this.scene.add(this.fillLight);

    // ==================================================
    // AMBIENT
    // ==================================================

    this.ambientLight = new THREE.AmbientLight(
      0xffffff,
      0.14
    );

    this.scene.add(this.ambientLight);

    // ==================================================
    // LOAD HDRIs
    // ==================================================

    this.loadHDRIs();

    // ==================================================
    // START LEVEL
    // ==================================================

    this.setLevel(1);
  }

  // ==================================================
  // LOAD HDRIs
  // ==================================================

  async loadHDRIs() {
    const loader = new RGBELoader();

    const paths = {
      1: './assets/hdri/level1_day.hdr',
      2: './assets/hdri/level2_midday.hdr',
      3: './assets/hdri/level3_night.hdr'
    };

    for (const [level, path] of Object.entries(paths)) {
      try {
        const hdrTexture = await loader.loadAsync(path);

        const environment = this.pmremGenerator
          .fromEquirectangular(hdrTexture)
          .texture;

        hdrTexture.dispose();

        this.environmentMaps[level] = environment;

        if (Number(level) === this.currentLevel) {
          this.applyEnvironment(Number(level));
        }
      } catch (error) {
        console.error(
          `Failed to load HDRI for Level ${level}:`,
          error
        );
      }
    }
  }

  // ==================================================
  // ENVIRONMENT
  // ==================================================

  applyEnvironment(level) {
    const environment = this.environmentMaps[level];

    if (!environment) {
      return;
    }

    this.scene.environment = environment;
  }

  // ==================================================
  // SET LEVEL
  // ==================================================

  setLevel(level) {
    this.currentLevel = level;

    if (level === 1) {
      this.setLevel1();
    } else if (level === 2) {
      this.setLevel2();
    } else if (level === 3) {
      this.setLevel3();
    } else {
      this.setLevel1();
    }

    // NEW: Save the sunlight direction selected by
    // the level preset. These presets position the sun
    // relative to the world's original origin.
    this.sunOffset.copy(this.sun.position);

    // Force the next update to centre the shadow
    // camera on the taxi.
    this.shadowTrackingInitialized = false;

    this.applyEnvironment(this.currentLevel);
  }

  // ==================================================
  // LEVEL 1
  // ==================================================

  setLevel1() {
    // The procedural sky provides the visible sky.
    // This background is primarily the fog fallback.

    this.scene.background = new THREE.Color(0xaed5e8);

    this.scene.fog = new THREE.Fog(
      0xb8d9e8,
      150,
      360
    );

    // SUN
    this.sun.color.set(0xffe8c7);
    this.sun.intensity = 2.35;
    this.sun.position.set(-45, 55, 40);

    // SKY BOUNCE
    this.hemisphereLight.color.set(0xd8edff);
    this.hemisphereLight.groundColor.set(0x69745d);
    this.hemisphereLight.intensity = 1.55;

    // FILL
    this.fillLight.color.set(0xc7deee);
    this.fillLight.intensity = 0.55;
    this.fillLight.position.set(40, 30, -40);

    // AMBIENT
    this.ambientLight.intensity = 0.14;

    // EXPOSURE
    this.renderer.toneMappingExposure = 0.92;
    this.scene.environmentIntensity = 1;
  }

  // ==================================================
  // LEVEL 2
  // ==================================================

  setLevel2() {
    this.scene.background = new THREE.Color(0xb9ddea);

    this.scene.fog = new THREE.Fog(
      0xc6e2ed,
      155,
      400
    );

    this.sun.color.set(0xfff7e8);
    this.sun.intensity = 3.2;
    this.sun.position.set(-10, 80, 10);

    this.hemisphereLight.color.set(0xe8f5ff);
    this.hemisphereLight.groundColor.set(0x817a68);
    this.hemisphereLight.intensity = 1.5;

    this.fillLight.color.set(0xdbe8ef);
    this.fillLight.intensity = 0.4;

    this.ambientLight.intensity = 0.12;

    this.renderer.toneMappingExposure = 1.0;
    this.scene.environmentIntensity = 1;
  }

  // ==================================================
  // LEVEL 3
  // ==================================================

  setLevel3() {
    this.scene.background = new THREE.Color(0x040711);

    this.scene.fog = new THREE.Fog(
      0x040711,
      30,
      150
    );

    this.sun.color.set(0x7284a8);
    this.sun.intensity = 0.06;
    this.sun.position.set(-20, 55, 20);

    this.hemisphereLight.color.set(0x152344);
    this.hemisphereLight.groundColor.set(0x020304);
    this.hemisphereLight.intensity = 0.22;

    this.fillLight.color.set(0x26395d);
    this.fillLight.intensity = 0.08;

    this.ambientLight.intensity = 0.018;

    this.renderer.toneMappingExposure = 0.72;

    this.scene.environmentIntensity =
      L3_ENVIRONMENT_INTENSITY;
  }

  // ==================================================
  // SUN SHADOW TRACKING — NEW
  // ==================================================

  updateShadowTracking(taxi) {
    if (!taxi) {
      return;
    }

    // Check the taxi's current world position.
    // The taxi is a root-level scene object, so its
    // position is already in world coordinates.

    const taxiPosition = taxi.position;

    // Keep the shadow position accurate without
    // updating the light for microscopic movements.
    const movementThreshold = 0.05;

    if (
      this.shadowTrackingInitialized &&
      this.shadowTrackingPosition.distanceToSquared(
        taxiPosition
      ) < movementThreshold * movementThreshold
    ) {
      return;
    }

    this.shadowTrackingPosition.copy(taxiPosition);
    this.shadowTrackingInitialized = true;

    // Centre the directional light target on the taxi.
    // Keep the target at road level rather than at
    // a moving suspension or chassis height.
    this.sunTarget.position.set(
      taxiPosition.x,
      0,
      taxiPosition.z
    );

    // Move the sun by exactly the same amount.
    // This preserves the per-level light direction.
    this.sun.position.copy(this.sunTarget.position);
    this.sun.position.add(this.sunOffset);

    // Update both matrices before the shadow pass.
    this.sunTarget.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }

  // ==================================================
  // GET LEVEL
  // ==================================================

  getLevel() {
    return this.currentLevel;
  }
}
