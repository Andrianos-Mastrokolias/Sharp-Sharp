
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Decorative skyline for Levels 1 and 2.
// Geometry follows the taxi so the distant buildings
// stay near the horizon as the player moves.
export class SkylineManager {
  constructor({ scene }) {
    this.scene = scene;
    this.currentLevel = 1;

    this.group = new THREE.Group();
    this.group.name = 'johannesburg-skyline';
    this.group.visible = false;

    // Shared materials keep the skyline inexpensive.
    this.buildingMaterial = new THREE.MeshBasicMaterial({
      color: 0x647d8c,
      fog: true
    });

    this.dumpMaterial = new THREE.MeshBasicMaterial({
      color: 0x9b9384,
      fog: true
    });

    this.createSkyline();
    this.scene.add(this.group);
  }

  createSkyline() {
    const buildingParts = [];
    const dumpParts = [];

    // Create a distant tower or building.
    const addBuilding = (x, height, width, depth, z = -250) => {
      const geometry = new THREE.BoxGeometry(width, height, depth);

      // Place the bottom on the ground.
      geometry.translate(x, height / 2, z);
      buildingParts.push(geometry);
    };

    // Lower-rise buildings around the Johannesburg towers.
    const buildings = [
      [-210, 22, 16],
      [-190, 36, 13],
      [-170, 27, 17],
      [-145, 42, 15],
      [-120, 32, 20],
      [-94, 50, 14],
      [-70, 39, 19],
      [-43, 56, 17],
      [-15, 34, 21],
      [15, 44, 18],
      [44, 58, 16],
      [72, 37, 20],
      [103, 48, 16],
      [132, 31, 18],
      [158, 45, 15],
      [186, 29, 21],
      [215, 23, 17]
    ];

    for (const [x, height, width] of buildings) {
      addBuilding(x, height, width, 15);
    }

    // Hillbrow-style communications tower.
    const hillbrowShaft = new THREE.CylinderGeometry(
      2.2, 3.2, 83, 8
    );
    hillbrowShaft.translate(-60, 41.5, -265);
    buildingParts.push(hillbrowShaft);

    const hillbrowPod = new THREE.CylinderGeometry(
      8, 6, 8, 12
    );
    hillbrowPod.translate(-60, 66, -265);
    buildingParts.push(hillbrowPod);

    const antenna = new THREE.CylinderGeometry(
      0.55, 0.8, 22, 6
    );
    antenna.translate(-60, 92, -265);
    buildingParts.push(antenna);

    // Ponte-style cylindrical high-rise.
    const ponte = new THREE.CylinderGeometry(
      9, 9, 74, 12
    );
    ponte.translate(86, 37, -260);
    buildingParts.push(ponte);

    // Mine dumps: low, broad silhouettes at the horizon.
    const mineDumps = [
      [-190, -285, 32, 16],
      [-135, -290, 25, 12],
      [156, -285, 38, 18],
      [220, -290, 30, 14]
    ];

    for (const [x, z, radius, height] of mineDumps) {
      const geometry = new THREE.ConeGeometry(
        radius,
        height,
        5
      );

      geometry.translate(x, height / 2, z);
      dumpParts.push(geometry);
    }

    // Merge individual shapes to minimise draw calls.
    const buildingGeometry = mergeGeometries(buildingParts);
    const dumpGeometry = mergeGeometries(dumpParts);

    for (const geometry of [...buildingParts, ...dumpParts]) {
      geometry.dispose();
    }

    this.buildings = new THREE.Mesh(
      buildingGeometry,
      this.buildingMaterial
    );

    this.dumps = new THREE.Mesh(
      dumpGeometry,
      this.dumpMaterial
    );

    // Decorative scenery should not create shadow passes.
    this.buildings.castShadow = false;
    this.buildings.receiveShadow = false;
    this.dumps.castShadow = false;
    this.dumps.receiveShadow = false;

    this.buildings.name = 'johannesburg-buildings';
    this.dumps.name = 'johannesburg-mine-dumps';

    this.group.add(this.buildings, this.dumps);
  }

  setLevel(level) {
    this.currentLevel = level;

    // Skyline is only intended for the daytime city/highway.
    this.group.visible = level === 1 || level === 2;

    if (level === 1) {
      this.buildingMaterial.color.set(0x647d8c);
      this.dumpMaterial.color.set(0x9b9384);
    } else if (level === 2) {
      this.buildingMaterial.color.set(0x72828b);
      this.dumpMaterial.color.set(0xa39b87);
    }
  }

  update(taxiPosition) {
    if (!this.group.visible || !taxiPosition) return;

    // Follow the taxi across the ground plane.
    // Only the skyline moves; it never affects gameplay.
    this.group.position.set(
      taxiPosition.x,
      0,
      taxiPosition.z
    );
  }

  dispose() {
    this.scene.remove(this.group);
    this.buildings.geometry.dispose();
    this.dumps.geometry.dispose();
    this.buildingMaterial.dispose();
    this.dumpMaterial.dispose();
  }
}
