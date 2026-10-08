import * as THREE from 'three';

import {
  mergeGeometries
} from 'three/addons/utils/BufferGeometryUtils.js';


// ==================================================
// SHARED HAZARD POSITIONS
// --------------------------------------------------
// The three main-road potholes feed the vehicle's
// ground-height physics (main.js hands a copy of this
// list to VehicleController). The speed bump is fixed
// inside VehicleController (z 25, |x| < 7, depth 3,
// height 0.35). Environments may restyle these but must
// draw them at exactly these positions.
// ==================================================

export const MAIN_POTHOLES = [

  {
    x: 0,
    z: 5,
    radius: 1.5,
    depth: 0.35
  },

  {
    x: -2.5,
    z: -20,
    radius: 1.7,
    depth: 0.35
  },

  {
    x: 2.5,
    z: -50,
    radius: 1.6,
    depth: 0.32
  }
];


export const SPEED_BUMP = {
  x: 0,
  z: 25,
  width: 14,
  height: 0.35,
  depth: 3
};


// ==================================================
// GEOMETRY HELPERS
// ==================================================

export function prepareAO(
  geometry
) {

  if (
    geometry.attributes.uv &&
    !geometry.attributes.uv1
  ) {

    geometry.setAttribute(

      'uv1',

      geometry.attributes.uv
    );
  }


  return geometry;
}


export function createBox(
  width,
  height,
  depth,
  color
) {

  const mesh =
    new THREE.Mesh(

      new THREE.BoxGeometry(
        width,
        height,
        depth
      ),

      new THREE.MeshStandardMaterial({

        color,

        roughness:
          0.82,

        metalness:
          0.02
      })
    );


  mesh.castShadow =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}


export function createTexturedBox(
  width,
  height,
  depth,
  material
) {

  const geometry =
    prepareAO(

      new THREE.BoxGeometry(
        width,
        height,
        depth
      )
    );


  const mesh =
    new THREE.Mesh(

      geometry,

      material
    );


  mesh.castShadow =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}


// geo('pole', () => new THREE.CylinderGeometry(...)) builds
// each distinct geometry once. Disposal is handled by
// disposeObjectTree() through the meshes that use it.
export function createGeometryCache() {

  const cache =
    new Map();


  return (
    key,
    make
  ) => {

    let geometry =
      cache.get(
        key
      );


    if (
      !geometry
    ) {

      geometry =
        make();


      cache.set(
        key,
        geometry
      );
    }


    return geometry;
  };
}


// Collects ordinary meshes and builds one merged Mesh per
// (z chunk, side of the road, material, shadow flags) instead.
// Chunks keep frustum culling working: a merged mesh is only
// drawn while its own ~chunkSize metres of street are in view.
//
//   const batch = createMergeBatch({ chunkSize: 60 });
//   batch.add(mesh);            // instead of group.add(mesh)
//   batch.build(group);         // once, after everything is added
//
// A merged mesh keeps its parts' world positions; its origin is
// moved to the middle of its own box (geometry re-centred), so
// transparent sorting uses the chunk's centre, not the world
// origin. Triangle counts are unchanged by merging.
export function createMergeBatch({
  chunkSize = 60,
  zMin = -200
} = {}) {

  const bins =
    new Map();

  const matrix =
    new THREE.Matrix4();


  return {

    add(
      mesh
    ) {

      mesh.updateMatrix();


      const chunk =
        Math.floor(
          (
            mesh.position.z -
            zMin
          ) /
          chunkSize
        );


      const side =
        Math.sign(
          mesh.position.x
        );


      const key =
        `${chunk}|${side}|${mesh.material.uuid}|` +
        `${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}`;


      let bin =
        bins.get(
          key
        );


      if (
        !bin
      ) {

        bin = {
          material: mesh.material,
          castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow,
          parts: []
        };

        bins.set(
          key,
          bin
        );
      }


      bin.parts.push(
        mesh.geometry
          .clone()
          .applyMatrix4(
            matrix.copy(
              mesh.matrix
            )
          )
      );
    },


    build(
      group
    ) {

      const meshes =
        [];

      const centre =
        new THREE.Vector3();


      for (
        const bin
        of bins.values()
      ) {

        const geometry =
          bin.parts.length === 1
            ? bin.parts[0]
            : mergeGeometries(
                bin.parts
              );


        if (
          bin.parts.length > 1
        ) {

          for (
            const part
            of bin.parts
          ) {

            part.dispose();
          }
        }


        geometry.computeBoundingBox();

        geometry.boundingBox.getCenter(
          centre
        );

        geometry.translate(
          -centre.x,
          -centre.y,
          -centre.z
        );


        const mesh =
          new THREE.Mesh(
            geometry,
            bin.material
          );


        mesh.position.copy(
          centre
        );

        mesh.castShadow =
          bin.castShadow;

        mesh.receiveShadow =
          bin.receiveShadow;


        group.add(
          mesh
        );

        meshes.push(
          mesh
        );
      }


      bins.clear();


      return meshes;
    }
  };
}


// ==================================================
// DISPOSAL
// ==================================================

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'aoMap',
  'bumpMap',
  'emissiveMap',
  'metalnessMap',
  'alphaMap',
  'envMap'
];


// The library's own base texture sets (road, grass, ...).
// Every create*Material() call clones these, so a material's
// maps belong to the environment that made it, but a base
// texture must never be disposed.
function collectBaseTextures(
  materials
) {

  const base =
    new Set();


  for (
    const value
    of Object.values(
      materials ?? {}
    )
  ) {

    if (
      value &&
      value.color?.isTexture
    ) {

      for (
        const texture
        of Object.values(
          value
        )
      ) {

        if (
          texture?.isTexture
        ) {

          base.add(
            texture
          );
        }
      }
    }
  }


  return base;
}


// Disposes every geometry, material and material texture
// under `root` (each only once, whatever number of meshes
// share it) and detaches `root` from its parent. Never
// touches the MaterialLibrary's base textures.
export function disposeObjectTree(
  root,
  materials
) {

  const base =
    collectBaseTextures(
      materials
    );

  const geometries =
    new Set();

  const mats =
    new Set();


  root.traverse(
    (object) => {

      if (
        object.geometry
      ) {

        geometries.add(
          object.geometry
        );
      }


      if (
        object.material
      ) {

        for (
          const material
          of [].concat(
            object.material
          )
        ) {

          mats.add(
            material
          );
        }
      }


      // InstancedMesh owns its instance buffers.
      if (
        object.isInstancedMesh
      ) {

        object.dispose();
      }
    }
  );


  const textures =
    new Set();


  for (
    const material
    of mats
  ) {

    for (
      const slot
      of TEXTURE_SLOTS
    ) {

      const texture =
        material[
          slot
        ];


      if (
        texture?.isTexture &&
        !base.has(
          texture
        )
      ) {

        textures.add(
          texture
        );
      }
    }
  }


  for (
    const geometry
    of geometries
  ) {

    geometry.dispose();
  }


  for (
    const material
    of mats
  ) {

    material.dispose();
  }


  for (
    const texture
    of textures
  ) {

    texture.dispose();
  }


  root.parent?.remove(
    root
  );

  root.clear();
}
