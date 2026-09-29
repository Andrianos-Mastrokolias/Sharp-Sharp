import * as THREE from 'three';

import {
  GLTFLoader
} from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  RoundedBoxGeometry
} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import {
  createHeadlightBeamMaterial
} from '../shaders/HeadlightBeamShader.js';


export function createTaxi(
  createBox
) {

  const taxi =
    new THREE.Group();


  const chassis =
    new THREE.Group();


  taxi.add(
    chassis
  );


  // ==================================================
  // INVISIBLE PHYSICS BODY
  // ==================================================

  const body =
    createBox(
      2.2,
      1.1,
      4.4,
      0xe8c547
    );


  body.position.set(
    0,
    1.1,
    0
  );


  body.visible =
    false;


  chassis.add(
    body
  );


  const cabin =
    createBox(
      2.05,
      1,
      2.8,
      0xe8c547
    );


  cabin.position.set(
    0,
    2.05,
    -0.15
  );


  cabin.visible =
    false;


  chassis.add(
    cabin
  );


  const windscreen =
    createBox(
      1.85,
      0.65,
      0.04,
      0x28485c
    );


  windscreen.position.set(
    0,
    2.1,
    -1.57
  );


  windscreen.visible =
    false;


  chassis.add(
    windscreen
  );


  const rearWindow =
    createBox(
      1.85,
      0.65,
      0.04,
      0x28485c
    );


  rearWindow.position.set(
    0,
    2.1,
    1.27
  );


  rearWindow.visible =
    false;


  chassis.add(
    rearWindow
  );


  // ==================================================
  // PHYSICS WHEELS
  // ==================================================

  const wheels =
    [];


  const frontWheelPivots =
    [];


  function createWheel(
    x,
    z,
    front = false
  ) {

    const pivot =
      new THREE.Group();


    pivot.position.set(
      x,
      0.45,
      z
    );


    taxi.add(
      pivot
    );


    const wheel =
      new THREE.Mesh(

        new THREE.CylinderGeometry(
          0.45,
          0.45,
          0.25,
          16
        ),

        new THREE.MeshStandardMaterial({
          color:
            0x202124
        })
      );


    wheel.rotation.z =
      Math.PI / 2;


    wheel.visible =
      false;


    pivot.add(
      wheel
    );


    wheels.push(
      wheel
    );


    if (
      front
    ) {

      frontWheelPivots.push(
        pivot
      );
    }
  }


  createWheel(
    -1.15,
    -1.45,
    true
  );


  createWheel(
    1.15,
    -1.45,
    true
  );


  createWheel(
    -1.15,
    1.45
  );


  createWheel(
    1.15,
    1.45
  );


  // ==================================================
  // ROOF RACK
  // ==================================================

  const rackMaterial =
    new THREE.MeshStandardMaterial({

      color:
        0x222222,

      roughness:
        0.55,

      metalness:
        0.65
    });


  const rack =
    new THREE.Mesh(

      new RoundedBoxGeometry(
        1.75,
        0.07,
        2.75,
        3,
        0.035
      ),

      rackMaterial
    );


  rack.position.set(
    0,
    1.92,
    1.1
  );


  rack.castShadow =
    true;


  chassis.add(
    rack
  );


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

    const mesh =
      new THREE.Mesh(

        new RoundedBoxGeometry(
          width,
          height,
          depth,
          5,
          radius
        ),

        new THREE.MeshStandardMaterial({

          color,

          roughness:
            0.72,

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


  // ==================================================
  // SUITCASE
  // ==================================================

  const suitcase =
    roundedCargo(
      0.8,
      0.55,
      0.9,
      0x8e542f,
      0.09
    );


  suitcase.position.set(
    -0.48,
    2.24,
    0.42
  );


  chassis.add(
    suitcase
  );


  // Suitcase straps.

  const suitcaseStrap =
    new THREE.Mesh(

      new THREE.BoxGeometry(
        0.1,
        0.56,
        0.91
      ),

      new THREE.MeshStandardMaterial({
        color:
          0x3c291c,

        roughness:
          0.8
      })
    );


  suitcaseStrap.position.copy(
    suitcase.position
  );


  chassis.add(
    suitcaseStrap
  );


  // ==================================================
  // TRAVEL BAG
  // ==================================================

  const travelBag =
    roundedCargo(
      0.72,
      0.48,
      0.78,
      0x485d67,
      0.14
    );


  travelBag.position.set(
    0.45,
    2.22,
    0.42
  );


  chassis.add(
    travelBag
  );


  // ==================================================
  // CRATE
  // ==================================================

  const crate =
    roundedCargo(
      0.85,
      0.7,
      0.85,
      0x8a643c,
      0.035
    );


  crate.position.set(
    -0.45,
    2.32,
    1.28
  );


  chassis.add(
    crate
  );


  // ==================================================
  // MATTRESS
  // ==================================================

  const mattress =
    roundedCargo(
      1.65,
      0.22,
      1.15,
      0xcfc8ab,
      0.1
    );


  mattress.position.set(
    0,
    2.12,
    1.92
  );


  chassis.add(
    mattress
  );


  // ==================================================
  // FRIDGE
  // ==================================================

  const fridge =
    roundedCargo(
      0.75,
      1.25,
      0.7,
      0xe0e3e3,
      0.045
    );


  fridge.position.set(
    0.48,
    2.58,
    1.25
  );


  fridge.material.roughness =
    0.35;


  fridge.material.metalness =
    0.1;


  chassis.add(
    fridge
  );


  // Fridge split line.

  const fridgeLine =
    new THREE.Mesh(

      new THREE.BoxGeometry(
        0.7,
        0.025,
        0.015
      ),

      new THREE.MeshStandardMaterial({
        color:
          0x8f9495
      })
    );


  fridgeLine.position.set(
    0.48,
    2.75,
    0.895
  );


  chassis.add(
    fridgeLine
  );


  // ==================================================
  // CARGO PHYSICS LIST
  // ==================================================

  const cargoItems = [

    {
      name:
        'Suitcase',

      mesh:
        suitcase,

      vulnerability:
        1
    },

    {
      name:
        'Travel Bag',

      mesh:
        travelBag,

      vulnerability:
        0.9
    },

    {
      name:
        'Crate',

      mesh:
        crate,

      vulnerability:
        0.75
    },

    {
      name:
        'Mattress',

      mesh:
        mattress,

      vulnerability:
        1.35
    },

    {
      name:
        'Fridge',

      mesh:
        fridge,

      vulnerability:
        1.15
    }
  ];


  // ==================================================
  // HEADLIGHTS
  // ==================================================

  let headlightsEnabled =
    false;


  const headlightTarget =
    new THREE.Object3D();


  headlightTarget.position.set(
    0,
    0.45,
    -28
  );


  chassis.add(
    headlightTarget
  );


  function createHeadlight(
    x
  ) {

    const light =
      new THREE.SpotLight(

        0xfff1c7,

        120,

        45,

        THREE.MathUtils.degToRad(
          25
        ),

        0.6,

        1.7
      );


    light.position.set(
      x,
      0.95,
      -2.15
    );


    light.castShadow =
      true;


    light.shadow.mapSize.set(
      1024,
      1024
    );


    light.target =
      headlightTarget;


    chassis.add(
      light
    );


    return light;
  }


  const leftHeadlight =
    createHeadlight(
      -0.62
    );


  const rightHeadlight =
    createHeadlight(
      0.62
    );


  // ==================================================
  // HEADLIGHT GLOW
  // ==================================================

  function createGlow(
    x
  ) {

    const glow =
      new THREE.Mesh(

        new THREE.BoxGeometry(
          0.35,
          0.18,
          0.04
        ),

        new THREE.MeshStandardMaterial({

          color:
            0xfff1c7,

          emissive:
            0xffdd99,

          emissiveIntensity:
            2.8,

          roughness:
            0.2
        })
      );


    glow.position.set(
      x,
      0.95,
      -2.19
    );


    chassis.add(
      glow
    );


    return glow;
  }


  const leftGlow =
    createGlow(
      -0.62
    );


  const rightGlow =
    createGlow(
      0.62
    );


  // ==================================================
  // CUSTOM HEADLIGHT BEAMS
  // ==================================================

  const beamLength =
    20;


  function createBeam(
    x
  ) {

    const beam =
      new THREE.Mesh(

        new THREE.ConeGeometry(
          5.5,
          beamLength,
          32,
          1,
          true
        ),

        createHeadlightBeamMaterial()
      );


    beam.rotation.x =
      Math.PI / 2;


    beam.position.set(

      x,

      0.85,

      -2.15 -
      beamLength / 2
    );


    beam.renderOrder =
      2;


    beam.frustumCulled =
      false;


    chassis.add(
      beam
    );


    return beam;
  }


  const leftBeam =
    createBeam(
      -0.55
    );


  const rightBeam =
    createBeam(
      0.55
    );


  // ==================================================
  // HEADLIGHT CONTROL
  // ==================================================

  function setHeadlightsEnabled(
    enabled
  ) {

    headlightsEnabled =
      enabled;


    leftHeadlight.visible =
      enabled;


    rightHeadlight.visible =
      enabled;


    leftGlow.visible =
      enabled;


    rightGlow.visible =
      enabled;


    leftBeam.visible =
      enabled;


    rightBeam.visible =
      enabled;
  }


  function toggleHeadlights() {

    setHeadlightsEnabled(
      !headlightsEnabled
    );


    return headlightsEnabled;
  }


  function getHeadlightsEnabled() {

    return headlightsEnabled;
  }


  function updateVisualEffects(
    elapsedTime
  ) {

    leftBeam.material.uniforms
      .uTime.value =
        elapsedTime;


    rightBeam.material.uniforms
      .uTime.value =
        elapsedTime;
  }


  setHeadlightsEnabled(
    false
  );


  // ==================================================
  // SES'FIKILE GLB
  // ==================================================

  const loader =
    new GLTFLoader();


  loader.load(

    './assets/models/sesfikile.glb',

    (gltf) => {

      const model =
        gltf.scene;


      model.name =
        'SesfikileModel';


      model.scale.setScalar(
        1
      );


      model.rotation.y =
        -Math.PI / 2;


      model.traverse(
        (child) => {

          if (
            !child.isMesh
          ) {

            return;
          }


          child.castShadow =
            true;


          child.receiveShadow =
            true;


          const materials =
            Array.isArray(
              child.material
            )
              ? child.material
              : [
                  child.material
                ];


          for (
            const material
            of materials
          ) {

            if (
              !material
            ) {

              continue;
            }


            // Let the HDRI affect taxi surfaces.

            material.envMapIntensity =
              1.25;


            // Avoid overly flat white paint.

            if (
              material.isMeshStandardMaterial ||
              material.isMeshPhysicalMaterial
            ) {

              material.roughness =
                Math.min(
                  material.roughness ??
                  0.6,

                  0.55
                );
            }


            material.needsUpdate =
              true;
          }
        }
      );


      // Centre GLB.

      model.updateMatrixWorld(
        true
      );


      const initialBox =
        new THREE.Box3()
          .setFromObject(
            model
          );


      const centre =
        new THREE.Vector3();


      initialBox.getCenter(
        centre
      );


      model.position.x -=
        centre.x;


      model.position.z -=
        centre.z;


      model.updateMatrixWorld(
        true
      );


      const centredBox =
        new THREE.Box3()
          .setFromObject(
            model
          );


      model.position.y -=
        centredBox.min.y;


      model.position.y +=
        0.02;


      chassis.add(
        model
      );
    },


    undefined,


    (error) => {

      console.error(
        'Failed to load Sesfikile:',
        error
      );


      body.visible =
        true;


      cabin.visible =
        true;


      windscreen.visible =
        true;


      rearWindow.visible =
        true;


      for (
        const wheel
        of wheels
      ) {

        wheel.visible =
          true;
      }
    }
  );


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