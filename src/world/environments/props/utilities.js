import * as THREE from 'three';


// ==================================================
// UTILITIES FAMILY (poles, lamps, cables, lights)
// --------------------------------------------------
// Re-exported from ../props.js, which stays the one
// swap-point list for the 3D model team.
// ==================================================


// ==================================================
// CITY STREET LAMPS
// ==================================================

// The level 1 street lamp: a pole, an arm and a lamp head, three
// shared geometries. Stations are split into `chunkSize` metre
// chunks along z (and by side of the road) so frustum culling still drops the far ones;
// each chunk is three InstancedMeshes (pole, arm, head).
//
// The pole casts a shadow, the arm and head do not (as the
// original per-lamp meshes). Returns the meshes; the caller adds
// them to its group.
//
// stations: [{ x, z }]; the arm and head are placed on the road
// side of the pole, `x` is the pole's.
export function createStreetLamps({
  stations,
  poleMaterial,
  lampMaterial,
  chunkSize = 80,
  zMin = -200
}) {

  const poleGeometry =
    new THREE.CylinderGeometry(
      0.08,
      0.1,
      6,
      10
    );

  const armGeometry =
    new THREE.BoxGeometry(
      1.2,
      0.08,
      0.08
    );

  const lampGeometry =
    new THREE.BoxGeometry(
      0.45,
      0.12,
      0.3
    );


  const chunks =
    new Map();


  for (
    const station
    of stations
  ) {

    const key =
      `${Math.floor(
        (station.z - zMin) /
        chunkSize
      )}|${Math.sign(
        station.x
      )}`;


    if (
      !chunks.has(
        key
      )
    ) {

      chunks.set(
        key,
        []
      );
    }


    chunks.get(
      key
    ).push(
      station
    );
  }


  const meshes =
    [];

  const matrix =
    new THREE.Matrix4();


  for (
    const list
    of chunks.values()
  ) {

    const parts = [

      {
        geometry: poleGeometry,
        material: poleMaterial,
        dx: 0,
        y: 3,
        cast: true
      },

      {
        geometry: armGeometry,
        material: poleMaterial,
        dx: -0.55,
        y: 5.75,
        cast: false
      },

      {
        geometry: lampGeometry,
        material: lampMaterial,
        dx: -1.05,
        y: 5.7,
        cast: false
      }
    ];


    for (
      const part
      of parts
    ) {

      const mesh =
        new THREE.InstancedMesh(
          part.geometry,
          part.material,
          list.length
        );


      list.forEach(
        (station, i) => {

          // dx is towards the road (-x for a pole at +x)
          const side =
            Math.sign(
              station.x
            );


          mesh.setMatrixAt(
            i,
            matrix.makeTranslation(
              station.x +
              side * part.dx,
              part.y,
              station.z
            )
          );
        }
      );


      mesh.instanceMatrix.needsUpdate =
        true;

      mesh.castShadow =
        part.cast;


      meshes.push(
        mesh
      );
    }
  }


  return meshes;
}
