import * as THREE from 'three';


// ==================================================
// SIGNAGE FAMILY (road markings, signs, billboards)
// --------------------------------------------------
// Re-exported from ../props.js, which stays the one
// swap-point list for the 3D model team.
// ==================================================


// ==================================================
// ZEBRA CROSSING
// ==================================================

// Painted bars across a street that runs along x: the bars lie
// along x (the way the traffic goes) and are laid side by side
// along z (the way people cross), centred between z0 and z1.
// One InstancedMesh, flat, never collidable.
//
//   x       centre of the crossing along x, length its extent
//   z0, z1  the stretch to cover (the street's width)
//   y       height of the surface the paint sits on
export function createZebraCrossing({
  x,
  z0,
  z1,
  y,
  length = 2.6,
  barWidth = 0.5,
  period = 1,
  material
}) {

  const count =
    Math.max(
      1,
      Math.floor(
        (z1 - z0 + (period - barWidth)) /
        period
      )
    );


  const span =
    (count - 1) * period +
    barWidth;


  const first =
    (z0 + z1) / 2 -
    span / 2 +
    barWidth / 2;


  const mesh =
    new THREE.InstancedMesh(

      new THREE.BoxGeometry(
        length,
        0.025,
        barWidth
      ),

      material,

      count
    );


  const matrix =
    new THREE.Matrix4();


  for (
    let i = 0;
    i < count;
    i++
  ) {

    mesh.setMatrixAt(
      i,
      matrix.makeTranslation(
        x,
        y + 0.015,
        first + i * period
      )
    );
  }


  mesh.instanceMatrix.needsUpdate =
    true;

  mesh.receiveShadow =
    true;


  return mesh;
}
