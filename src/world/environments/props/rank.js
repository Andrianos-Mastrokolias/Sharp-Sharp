
import * as THREE from 'three';

import {
  createMergeBatch,
  disposeObjectTree
} from '../helpers.js';

// ============================================================
// SHARP-SHARP — JOHANNESBURG TAXI RANK
// ============================================================
//
// Interface used by Leah's cityStreet.js:
//
// createTaxiRank({ materials, zFrom, zTo })
//   -> { group, collidables, dispose() }
//
// Coordinates:
//   Road centre: x = 0
//   Road width:  x = -9 to +9
//   Rank area:   approximately z = -60 to +170
//
// All solid scenery is kept outside x = +/-9.
// Road paint is visual only and cannot block vehicles.
//
// ============================================================

export function createTaxiRank({
  materials = null,
  zFrom = -60,
  zTo = 170
} = {}) {
  const group = new THREE.Group();
  group.name = 'JohannesburgTaxiRank';

  const collidables = [];

  const batch = createMergeBatch({
    chunkSize: 80,
    zMin: Math.min(zFrom, zTo)
  });

  const zMin = Math.min(zFrom, zTo);
  const zMax = Math.max(zFrom, zTo);
  const length = zMax - zMin;

  // ==========================================================
  // MATERIALS
  // ==========================================================

  const paintWhite = new THREE.MeshStandardMaterial({
    color: 0xf4f0d5,
    roughness: 1
  });

  const paintYellow = new THREE.MeshStandardMaterial({
    color: 0xf3c531,
    roughness: 1
  });

  const asphaltDark = new THREE.MeshStandardMaterial({
    color: 0x252729,
    roughness: 0.95
  });

  const concrete = new THREE.MeshStandardMaterial({
    color: 0x92938b,
    roughness: 0.9
  });

  const steel = new THREE.MeshStandardMaterial({
    color: 0x30373d,
    metalness: 0.55,
    roughness: 0.55
  });

  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0x426276,
    metalness: 0.25,
    roughness: 0.65
  });

  const boothMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8c99d,
    roughness: 0.85
  });

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x263d49,
    metalness: 0.15,
    roughness: 0.2
  });

  const stallRed = new THREE.MeshStandardMaterial({
    color: 0xb94b33,
    roughness: 0.85
  });

  const stallBlue = new THREE.MeshStandardMaterial({
    color: 0x2d6384,
    roughness: 0.85
  });

  const crateMaterial = new THREE.MeshStandardMaterial({
    color: 0x795335,
    roughness: 0.95
  });

  // ==========================================================
  // BASIC BOX HELPERS
  // ==========================================================

  function addBox(
    width,
    height,
    depth,
    material,
    x,
    y,
    z,
    {
      solid = false,
      shadow = false,
      batched = true
    } = {}
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      material
    );

    mesh.position.set(x, y, z);

    mesh.castShadow = shadow;
    mesh.receiveShadow = true;

    if (solid) {
      group.add(mesh);
      collidables.push(mesh);
    } else if (batched) {
      batch.add(mesh);

      // The batch clones the transformed geometry.
      // The temporary original geometry can be released.
      mesh.geometry.dispose();
    } else {
      group.add(mesh);
    }

    return mesh;
  }

  // ==========================================================
  // TEXT SIGNS
  // ==========================================================

  function makeSignTexture(text, options = {}) {
    if (typeof document === 'undefined') {
      return null;
    }

    const canvas = document.createElement('canvas');

    canvas.width = 1024;
    canvas.height = 256;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return null;
    }

    ctx.fillStyle = options.background ?? '#192f42';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = options.foreground ?? '#fff3c7';
    ctx.font = 'bold 105px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(text, 512, 128, 950);

    const texture = new THREE.CanvasTexture(canvas);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    return texture;
  }

  function addSign(
    text,
    x,
    y,
    z,
    width,
    height,
    options = {}
  ) {
    const texture = makeSignTexture(text, options);

    if (!texture) {
      return;
    }

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide
    });

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      material
    );

    // Plane faces along Z, so the main sign is visible
    // to a taxi approaching from the starting area.
    sign.position.set(x, y, z);

    group.add(sign);
  }

  // ==========================================================
  // PAINTED TAXI BAYS
  // ==========================================================

  // Keep markings safely inside the road.
  // They are visual only, not collidable.

  const bayStart = Math.min(zMax - 15, zMin + 115);
  const bayEnd = zMax - 12;
  const bayCount = 8;
  const baySpacing =
    Math.max(6, (bayEnd - bayStart) / bayCount);

  for (let i = 0; i < bayCount; i++) {
    const z = bayStart + i * baySpacing;

    // Angled loading bay marks.
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(
        new THREE.BoxGeometry(3.8, 0.012, 0.13),
        paintWhite
      );

      mark.position.set(side * 4.5, 0.032, z);
      mark.rotation.y = side * 0.45;

      mark.receiveShadow = true;

      group.add(mark);
    }
  }

  // Long edge markings.
  for (const side of [-1, 1]) {
    addBox(
      0.12,
      0.012,
      Math.max(8, bayEnd - bayStart + 3),
      paintYellow,
      side * 8.25,
      0.035,
      (bayStart + bayEnd) / 2
    );
  }

  // Taxi queue starting line.
  addBox(
    15,
    0.012,
    0.35,
    paintWhite,
    0,
    0.038,
    zMax - 8
  );

  // ==========================================================
  // TAXI RANK SHELTERS
  // ==========================================================

  function createShelter(side, z) {
    const x = side * 13.3;

    // Roof.
    addBox(
      4.1, 0.18, 10,
      roofMaterial,
      x, 3.05, z,
      { shadow: true }
    );

    // Supporting columns.
    for (const dx of [-1.65, 1.65]) {
      for (const dz of [-4.2, 4.2]) {
        addBox(
          0.13, 3.05, 0.13,
          steel,
          x + dx, 1.52, z + dz
        );
      }
    }

    // Rear windbreak panel.
    addBox(
      0.1, 1.4, 7.8,
      steel,
      x + side * 1.65,
      1.25,
      z
    );

    // Benches under shelter.
    for (const dz of [-2.5, 2.5]) {
      addBox(
        1.2, 0.16, 2,
        crateMaterial,
        x, 0.55, z + dz
      );

      addBox(
        1.2, 0.75, 0.12,
        steel,
        x + side * 0.5,
        1.0,
        z + dz
      );
    }
  }

  // Shelters immediately beside the starting rank.
const shelterA = zMax - 30;
const shelterB = zMax - 60;

  if (length > 90) {
    createShelter(-1, shelterA);
    createShelter(1, shelterB);
  }

  // ==========================================================
  // HAWKER STALLS
  // ==========================================================

  function createStall(side, z, canopyMaterial) {
    const x = side * 13.25;

    // Counter.
    addBox(
      2.3, 0.95, 2,
      crateMaterial,
      x, 0.475, z
    );

    // Four thin supports.
    for (const dx of [-1, 1]) {
      for (const dz of [-0.8, 0.8]) {
        addBox(
          0.08, 2.1, 0.08,
          steel,
          x + dx, 1.95, z + dz
        );
      }
    }

    // Coloured canopy.
    addBox(
      3.2, 0.14, 2.7,
      canopyMaterial,
      x, 3.02, z,
      { shadow: true }
    );

    // Merchandise boxes.
    for (let i = -1; i <= 1; i++) {
      addBox(
        0.48, 0.35, 0.48,
        i === 0 ? paintYellow : crateMaterial,
        x + i * 0.58,
        1.13,
        z
      );
    }
  }

  if (length > 100) {
  createStall(-1, zMax - 45, stallRed);
  createStall(-1, zMax - 70, stallBlue);
  createStall(1, zMax - 35, stallBlue);
  createStall(1, zMax - 65, stallRed);
}

  // ==========================================================
  // MARSHAL'S BOOTH
  // ==========================================================

  if (length > 75) {
    const boothX = -13.5;
    const boothZ = zMax - 85;

    // Booth lower body.
    addBox(
      3.2, 1.3, 3.4,
      boothMaterial,
      boothX, 0.65, boothZ,
      { solid: true, shadow: true }
    );

    // Window enclosure.
    addBox(
      3.0, 1.15, 3.15,
      glassMaterial,
      boothX, 1.85, boothZ,
      { shadow: true }
    );

    // Roof.
    addBox(
      4, 0.22, 4.1,
      roofMaterial,
      boothX, 2.55, boothZ,
      { shadow: true }
    );

    addSign(
      'TAXI MARSHAL',
      boothX,
      2.3,
      boothZ + 2.09,
      2.6,
      0.6
    );
  }
// ==========================================================
// STARTING RANK SIGN
// ==========================================================

// High roadside identification sign, visible immediately
// when the player spawns facing towards negative Z.
addBox(
  0.25, 5.2, 0.25,
  steel,
  -11.2, 2.6, zMax - 13,
  { shadow: true }
);

addBox(
  4.6, 1.35, 0.15,
  asphaltDark,
  -11.2, 4.8, zMax - 13,
  { shadow: true }
);

addSign(
  'TAXI RANK',
  -11.2,
  4.8,
  zMax - 12.89,
  4.4,
  1.2,
  {
    background: '#173e56',
    foreground: '#ffe08b'
  }
);
  // ==========================================================
  // EXIT GANTRY
  // ==========================================================

  // zFrom is the rank's exit towards the CBD.
  const exitZ = zMin;

  // Supporting columns are outside the driving road.
  for (const side of [-1, 1]) {
    addBox(
      0.45, 5.8, 0.45,
      steel,
      side * 10.3,
      2.9,
      exitZ,
      { shadow: true }
    );
  }

  // Horizontal frame.
  addBox(
    21,
    0.32,
    0.4,
    steel,
    0,
    5.55,
    exitZ,
    { shadow: true }
  );

  // Sign backing.
  addBox(
    11,
    1.5,
    0.16,
    asphaltDark,
    0,
    4.7,
    exitZ,
    { shadow: true }
  );

  addSign(
    'TAXI RANK',
    0,
    4.7,
    exitZ + 0.11,
    10.3,
    1.35,
    {
      background: '#173e56',
      foreground: '#ffe08b'
    }
  );

  // Exit line under the gantry.
  addBox(
    17,
    0.012,
    0.3,
    paintYellow,
    0,
    0.038,
    exitZ + 0.5
  );

  // ==========================================================
  // FINALISE BATCHES
  // ==========================================================

  batch.build(group);

  // Group can be attached to the environment directly.
  // The environment remains responsible for adding its
  // collidables to the shared collision array.

  return {
    group,
    collidables,

    dispose() {
      disposeObjectTree(group, materials);
    }
  };
}