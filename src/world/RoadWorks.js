
import * as THREE from 'three';

// Level 2 only. All locations are AFTER the flyover.
// The narrower gap lets ordinary traffic pass, but the
// wider player taxi needs to use the open lane.
export const ROADWORK_SECTIONS = [
  { z: -250, blockedX: 0, openX: -3.6 },
  { z: -475, blockedX: -3.6, openX: 0 },
  { z: -700, blockedX: 0, openX: -3.6 }
];

export function buildHighwayRoadworks({
  parent,
  registerCollidable
}) {
  const meshes = [];
  const cones = [];

  const orange = new THREE.MeshStandardMaterial({
    color: 0xf47724,
    roughness: 0.85
  });

  const yellow = new THREE.MeshBasicMaterial({
    color: 0xffdc45,
    side: THREE.DoubleSide
  });

  const black = new THREE.MeshStandardMaterial({
    color: 0x202329,
    roughness: 0.85
  });

  const materials = [orange, yellow, black];

  function add(mesh, solid = false) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshes.push(mesh);

    if (solid) {
      registerCollidable?.(mesh);
    }

    return mesh;
  }

  function box(w, h, d, material, x, y, z, solid = false) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      material
    );

    mesh.position.set(x, y, z);
    return add(mesh, solid);
  }

  
function cone(x, z) {
  // Group the cone and reflective tip so they fall together.
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.78, 6),
    orange
  );
  body.position.y = 0.39;
  body.castShadow = true;
  group.add(body);

  const tip = new THREE.Mesh(
    new THREE.BoxGeometry(0.17, 0.10, 0.17),
    yellow
  );
  tip.position.y = 0.57;
  group.add(tip);

  // Identifies a soft obstacle to VehicleController.
  group.userData.roadworkCone = true;
  group.userData.roadworkConeHit = false;

  // Original position for restarting the level.
  group.userData.startX = x;
  group.userData.startZ = z;

  cones.push(group);

  // Register the whole group for collision detection.
  add(group, true);
}


  function warningSign(section) {
    const x = section.blockedX === 0 ? 7.5 : -7.5;
    const z = section.z + 62;

    // Post and black sign backing.
    // Solid signpost.
    box(0.09, 1.65, 0.09, black, x, 0.825, z, true);

    // Solid warning sign backing.
    box(1.75, 1.08, 0.10, black, x, 2.05, z, true);

    // Yellow warning panel.
    box(1.56, 0.89, 0.11, yellow, x, 2.05, z + 0.06);

    // Large black arrow towards the open lane.
    const shape = new THREE.Shape();

    shape.moveTo(-0.60, -0.13);
    shape.lineTo(0.13, -0.13);
    shape.lineTo(0.13, -0.34);
    shape.lineTo(0.65, 0);
    shape.lineTo(0.13, 0.34);
    shape.lineTo(0.13, 0.13);
    shape.lineTo(-0.60, 0.13);
    shape.closePath();

    const arrow = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      black
    );

    arrow.position.set(x, 2.05, z + 0.125);
    arrow.scale.x =
      section.openX < section.blockedX ? -1 : 1;

    add(arrow);
  }

  function barrier(x, z) {
    // Actual solid collision object.
    // Two barriers create a lane-narrowing section.
    box(
      0.8, 0.85, 4,
      orange,
      x, 0.425, z,
      true
    );

    // Warning panel facing approaching traffic (+Z).
    box(
      0.74, 0.46, 0.06,
      black,
      x, 0.55, z + 2.04
    );

    // Diagonal high-visibility stripes.
    for (const offset of [-0.22, 0, 0.22]) {
      const stripe = box(
        0.11, 0.53, 0.07,
        yellow,
        x + offset, 0.55, z + 2.09
      );

      stripe.rotation.z = -Math.PI / 6;
    }

    // Cones indicate the restriction beforehand.
    for (const ahead of [9, 16, 23, 30]) {
      cone(x, z + ahead);
    }
  }

  for (const section of ROADWORK_SECTIONS) {
    warningSign(section);

    // The 2.4 m gap is wide enough for the game's
    // normal traffic, but narrower than the 2.7 m taxi.
    barrier(section.blockedX - 1.6, section.z);
    barrier(section.blockedX + 1.6, section.z);
  }

  
return {
  reset() {
    // Stand all cones back up when the level restarts.
    for (const cone of cones) {
      cone.position.set(
        cone.userData.startX,
        0,
        cone.userData.startZ
      );

      cone.rotation.set(0, 0, 0);
      cone.userData.roadworkConeHit = false;
    }
  },

  dispose() {
    for (const mesh of meshes) {
      mesh.parent?.remove(mesh);

      // Dispose geometries, including grouped cone parts.
      mesh.traverse(child => {
        child.geometry?.dispose();
      });
    }

    for (const material of materials) {
      material.dispose();
    }

    cones.length = 0;
    meshes.length = 0;
  }
};

}
