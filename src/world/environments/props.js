import * as THREE from 'three';

import {
  mergeGeometries
} from 'three/addons/utils/BufferGeometryUtils.js';

import {
  prepareAO
} from './helpers.js';


// ==================================================
// PROP FACTORIES
// --------------------------------------------------
// One function per repeated prop. Each takes plain
// numbers + materials and returns ready-to-add
// objects, so the 3D model team can replace the body
// of a factory with a loaded model and nothing else
// has to change. Geometry is built here once per call;
// nothing here runs per frame.
// ==================================================


// ==================================================
// MOTORWAY BARRIER (New Jersey profile)
// ==================================================

// Cross-section in (x across the road, y up), centred on x = 0,
// 0.6 m wide and 0.81 m tall.
const BARRIER_PROFILE = [
  [-0.30, 0],
  [-0.30, 0.15],
  [-0.17, 0.43],
  [-0.13, 0.81],
  [0.13, 0.81],
  [0.17, 0.43],
  [0.30, 0.15],
  [0.30, 0]
];


export const BARRIER_WIDTH = 0.6;
export const BARRIER_HEIGHT = 0.81;


// Profile extruded along z from -length / 2 to +length / 2.
// `grow` fattens it slightly (used by the rib rings).
function createBarrierGeometry(
  length,
  grow = 1
) {

  const shape =
    new THREE.Shape();


  BARRIER_PROFILE.forEach(
    ([x, y], i) => {

      if (
        i === 0
      ) {

        shape.moveTo(
          x * grow,
          y * grow
        );
      }

      else {

        shape.lineTo(
          x * grow,
          y * grow
        );
      }
    }
  );


  const geometry =
    new THREE.ExtrudeGeometry(
      shape,
      {
        depth:
          length,

        bevelEnabled:
          false
      }
    );


  geometry.translate(
    0,
    0,
    -length / 2
  );


  return prepareAO(
    geometry
  );
}


// One long solid barrier: a single collidable Mesh.
// Caller positions it (x = +-10.3, z = 0).
export function createBarrierMesh({
  length,
  material
}) {

  const mesh =
    new THREE.Mesh(

      createBarrierGeometry(
        length
      ),

      material
    );


  mesh.castShadow =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}


// The visible panel joints: slightly fatter short slices of
// the same profile, every `spacing` metres, on each x in
// `xs`. One InstancedMesh, not collidable.
export function createBarrierRibs({
  length,
  spacing,
  xs,
  material,
  ribDepth = 0.14
}) {

  const count =
    Math.floor(
      length /
      spacing
    );


  const mesh =
    new THREE.InstancedMesh(

      createBarrierGeometry(
        ribDepth,
        1.045
      ),

      material,

      count *
      xs.length
    );


  const matrix =
    new THREE.Matrix4();


  let index =
    0;


  for (
    const x
    of xs
  ) {

    for (
      let i = 0;
      i < count;
      i++
    ) {

      matrix.makeTranslation(
        x,
        0,
        -length / 2 +
        (i + 0.5) *
        spacing
      );


      mesh.setMatrixAt(
        index++,
        matrix
      );
    }
  }


  mesh.instanceMatrix.needsUpdate =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}


// ==================================================
// LANE DASHES
// ==================================================

// Dashed lane lines: one InstancedMesh for every dash on
// every x in `xs`.
export function createLaneDashes({
  xs,
  zFrom,
  zTo,
  period,
  dashLength,
  width,
  y,
  material
}) {

  const perLine =
    Math.floor(
      (zTo - zFrom) /
      period
    );


  const mesh =
    new THREE.InstancedMesh(

      new THREE.BoxGeometry(
        width,
        0.025,
        dashLength
      ),

      material,

      perLine *
      xs.length
    );


  const matrix =
    new THREE.Matrix4();


  let index =
    0;


  for (
    const x
    of xs
  ) {

    for (
      let i = 0;
      i < perLine;
      i++
    ) {

      matrix.makeTranslation(
        x,
        y,
        zFrom +
        (i + 0.5) *
        period
      );


      mesh.setMatrixAt(
        index++,
        matrix
      );
    }
  }


  mesh.instanceMatrix.needsUpdate =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}


// ==================================================
// HIGHWAY LAMP POLES
// ==================================================

export const LAMP_POLE_HEIGHT = 12;


// Every pole is the same shape: a tapered pole, an arm
// reaching `armLength` towards the road and a lamp head on
// the arm. Pole and arm are merged into one geometry; the
// head is a second group so it can carry its own faintly
// emissive material. One InstancedMesh, no real lights.
//
// stations: [{ x, z }]. A station with x < 0 is turned
// round so its arm still points at the road.
export function createHighwayLampPoles({
  stations,
  poleMaterial,
  headMaterial,
  armLength = 2.4
}) {

  const base =
    -0.5;

  const height =
    LAMP_POLE_HEIGHT -
    base;


  const pole =
    new THREE.CylinderGeometry(
      0.1,
      0.18,
      height,
      10
    );


  pole.translate(
    0,
    base +
    height / 2,
    0
  );


  const arm =
    new THREE.BoxGeometry(
      armLength,
      0.14,
      0.14
    );


  arm.translate(
    -armLength / 2,
    LAMP_POLE_HEIGHT -
    0.3,
    0
  );


  const head =
    new THREE.BoxGeometry(
      0.9,
      0.14,
      0.4
    );


  head.translate(
    -armLength + 0.1,
    LAMP_POLE_HEIGHT -
    0.38,
    0
  );


  const poleAndArm =
    mergeGeometries(
      [pole, arm],
      false
    );


  const geometry =
    mergeGeometries(
      [poleAndArm, head],
      true
    );


  pole.dispose();
  arm.dispose();
  head.dispose();
  poleAndArm.dispose();


  const mesh =
    new THREE.InstancedMesh(

      geometry,

      [
        poleMaterial,
        headMaterial
      ],

      stations.length
    );


  const matrix =
    new THREE.Matrix4();


  stations.forEach(
    (station, i) => {

      matrix.makeRotationY(
        station.x < 0
          ? Math.PI
          : 0
      );


      matrix.setPosition(
        station.x,
        0,
        station.z
      );


      mesh.setMatrixAt(
        i,
        matrix
      );
    }
  );


  mesh.instanceMatrix.needsUpdate =
    true;


  return mesh;
}


// ==================================================
// GANTRY SIGN
// ==================================================

// Canvas-drawn road sign. The caller owns the returned
// texture (it is on the sign material's map, so the
// environment's dispose() frees it). Without a DOM (the
// headless tests) an empty texture stands in.
export function createSignTexture(
  text,
  {
    width = 1024,
    height = 272,
    background = '#0b6b3e',
    foreground = '#ffffff'
  } = {}
) {

  if (
    typeof document ===
    'undefined'
  ) {

    return new THREE.Texture();
  }


  const canvas =
    document.createElement(
      'canvas'
    );


  canvas.width =
    width;


  canvas.height =
    height;


  const g =
    canvas.getContext(
      '2d'
    );


  g.fillStyle =
    background;


  g.fillRect(
    0,
    0,
    width,
    height
  );


  g.strokeStyle =
    foreground;


  g.lineWidth =
    10;


  g.strokeRect(
    14,
    14,
    width - 28,
    height - 28
  );


  g.fillStyle =
    foreground;


  g.textAlign =
    'center';


  g.textBaseline =
    'middle';


  g.font =
    `bold ${Math.round(height * 0.52)}px Arial, Helvetica, sans-serif`;


  g.fillText(
    text,
    width / 2,
    height / 2 +
    6
  );


  const texture =
    new THREE.CanvasTexture(
      canvas
    );


  texture.colorSpace =
    THREE.SRGBColorSpace;


  texture.anisotropy =
    4;


  return texture;
}


// Overhead gantry across the carriageway: two legs outside
// the barriers, a beam and a sign board hung in front of it.
// Parts are named so tests can measure them. Returns a Group
// whose meshes are all non-collidable.
export function createGantry({
  z,
  legX,
  legSize = 0.7,
  beamY,
  beamHeight = 0.6,
  beamDepth = 0.9,
  signWidth,
  signHeight,
  signCentreY,
  frameMaterial,
  signMaterial
}) {

  const group =
    new THREE.Group();


  group.name =
    'gantry';


  const top =
    beamY +
    beamHeight / 2;

  const legBottom =
    -0.5;

  const legHeight =
    top -
    legBottom;


  const legGeometry =
    new THREE.BoxGeometry(
      legSize,
      legHeight,
      legSize
    );


  for (
    const side
    of [-1, 1]
  ) {

    const leg =
      new THREE.Mesh(
        legGeometry,
        frameMaterial
      );


    leg.name =
      'gantry-leg';


    leg.position.set(
      side * legX,
      legBottom +
      legHeight / 2,
      z
    );


    leg.castShadow =
      true;


    group.add(
      leg
    );
  }


  const beam =
    new THREE.Mesh(

      new THREE.BoxGeometry(
        legX * 2 +
        legSize,
        beamHeight,
        beamDepth
      ),

      frameMaterial
    );


  beam.name =
    'gantry-beam';


  beam.position.set(
    0,
    beamY,
    z
  );


  beam.castShadow =
    true;


  group.add(
    beam
  );


  // Board in front of the beam, facing +z (the approach
  // direction: the taxi drives towards -z).
  const sign =
    new THREE.Mesh(

      new THREE.BoxGeometry(
        signWidth,
        signHeight,
        0.1
      ),

      signMaterial
    );


  sign.name =
    'gantry-sign';


  sign.position.set(
    0,
    signCentreY,
    z +
    beamDepth / 2 +
    0.06
  );


  group.add(
    sign
  );


  return group;
}
