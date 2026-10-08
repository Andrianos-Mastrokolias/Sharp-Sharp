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


// ==================================================
// TOWNSHIP PROPS (level 3)
// --------------------------------------------------
// Everything below builds BufferGeometry with a vertex
// `color` attribute, so one shared material can show many
// rusty paint jobs and merged geometry stays one draw call.
// ==================================================

// Small seeded generator (mulberry32): the township is laid out
// the same way every load, so counts are stable and testable.
export function createRandom(
  seed
) {

  let a =
    seed >>> 0;


  return () => {

    a =
      (a + 0x6D2B79F5) >>> 0;


    let t =
      a;


    t =
      Math.imul(
        t ^ (t >>> 15),
        t | 1
      );


    t ^=
      t +
      Math.imul(
        t ^ (t >>> 7),
        t | 61
      );


    return (
      (t ^ (t >>> 14)) >>> 0
    ) /
    4294967296;
  };
}


// Box with a vertex colour, UVs scaled so one texture tile
// covers `tile` metres (0 keeps the raw 0..1 UVs), then
// rotated / moved into place. Three.js box faces are
// +x, -x, +y, -y, +z, -z, four vertices each.
export function coloredBox({
  size: [w, h, d],
  position: [x, y, z],
  rotation: [rx, ry, rz] = [0, 0, 0],
  color,
  tile = 0,
  swapUV = false,
  skipTop = false
}) {

  const geometry =
    new THREE.BoxGeometry(
      w,
      h,
      d
    );


  // Drop the +y face's triangles (face 2 = indices 12..17). The
  // vertices stay, so the bounding box is unchanged; only the
  // textured top is no longer drawn. A roof covers it instead.
  if (
    skipTop
  ) {

    const kept =
      Array.from(
        geometry.index.array
      ).filter(
        (_, i) => i < 12 || i >= 18
      );


    geometry.setIndex(
      kept
    );
  }


  const uv =
    geometry.attributes.uv;


  if (
    tile > 0
  ) {

    const faceScale = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h]
    ];


    for (
      let face = 0;
      face < 6;
      face++
    ) {

      const [su, sv] =
        faceScale[
          face
        ];


      for (
        let v = face * 4;
        v < face * 4 + 4;
        v++
      ) {

        const u0 =
          uv.getX(v) *
          su /
          tile;


        const v0 =
          uv.getY(v) *
          sv /
          tile;


        uv.setXY(
          v,
          swapUV ? v0 : u0,
          swapUV ? u0 : v0
        );
      }
    }
  }


  const tint =
    new THREE.Color(
      color
    );


  const colors =
    new Float32Array(
      uv.count * 3
    );


  for (
    let i = 0;
    i < uv.count;
    i++
  ) {

    colors[i * 3] =
      tint.r;

    colors[i * 3 + 1] =
      tint.g;

    colors[i * 3 + 2] =
      tint.b;
  }


  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(
      colors,
      3
    )
  );


  geometry.applyMatrix4(
    new THREE.Matrix4().compose(

      new THREE.Vector3(
        x,
        y,
        z
      ),

      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          rx,
          ry,
          rz
        )
      ),

      new THREE.Vector3(
        1,
        1,
        1
      )
    )
  );


  return geometry;
}


// Merges coloredBox() parts into one geometry and frees the
// parts. Returns null for an empty list.
export function mergeParts(
  parts
) {

  if (
    parts.length === 0
  ) {

    return null;
  }


  const merged =
    parts.length === 1
      ? parts[0].clone()
      : mergeGeometries(
          parts
        );


  for (
    const part
    of parts
  ) {

    part.dispose();
  }


  return merged;
}


// One Mesh from up to two part lists that use different
// materials (e.g. cinder block and corrugated iron). The
// result is a single childless Mesh, so it can be collidable.
export function createTwoMaterialMesh({
  blockParts,
  ironParts,
  blockMaterial,
  ironMaterial
}) {

  const block =
    mergeParts(
      blockParts
    );


  const iron =
    mergeParts(
      ironParts
    );


  let geometry;

  let material;


  if (
    block &&
    iron
  ) {

    geometry =
      mergeGeometries(
        [block, iron],
        true
      );


    block.dispose();
    iron.dispose();


    material =
      [blockMaterial, ironMaterial];
  }

  else {

    geometry =
      block ?? iron;


    material =
      block
        ? blockMaterial
        : ironMaterial;
  }


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


// ---- Canvas textures (the caller's material owns them) ----

function canvasTexture(
  size,
  draw
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
    size;


  canvas.height =
    size;


  draw(
    canvas.getContext(
      '2d'
    ),
    size
  );


  const texture =
    new THREE.CanvasTexture(
      canvas
    );


  texture.wrapS =
    THREE.RepeatWrapping;


  texture.wrapT =
    THREE.RepeatWrapping;


  texture.colorSpace =
    THREE.SRGBColorSpace;


  texture.anisotropy =
    4;


  return texture;
}


// Grey cinder blocks with dark mortar. One tile = 2 blocks
// across, 4 courses high.
export function createBlockTexture() {

  return canvasTexture(
    256,
    (g, size) => {

      const random =
        createRandom(
          11
        );


      g.fillStyle =
        '#5d5a54';


      g.fillRect(
        0,
        0,
        size,
        size
      );


      for (
        let row = 0;
        row < 4;
        row++
      ) {

        for (
          let col = -1;
          col < 2;
          col++
        ) {

          const shade =
            Math.round(
              150 +
              random() * 45
            );


          g.fillStyle =
            `rgb(${shade},${shade - 3},${shade - 9})`;


          g.fillRect(
            col * 128 +
            (row % 2) * 64 + 4,
            row * 64 + 4,
            120,
            56
          );
        }
      }
    }
  );
}


// Corrugated sheet: 16 ridges per tile, plus a few rust
// streaks. Stripes vary along u (horizontally).
export function createCorrugatedTexture() {

  return canvasTexture(
    256,
    (g, size) => {

      const random =
        createRandom(
          23
        );


      for (
        let x = 0;
        x < size;
        x++
      ) {

        const shade =
          Math.round(
            175 +
            Math.cos(
              x /
              16 *
              Math.PI *
              2
            ) *
            55
          );


        g.fillStyle =
          `rgb(${shade},${shade},${shade})`;


        g.fillRect(
          x,
          0,
          1,
          size
        );
      }


      g.fillStyle =
        'rgba(70, 35, 15, 0.25)';


      for (
        let i = 0;
        i < 14;
        i++
      ) {

        g.fillRect(
          random() * size,
          random() * size * 0.4,
          3 + random() * 6,
          size * (0.2 + random() * 0.5)
        );
      }
    }
  );
}


// ---- Roof ----

// A closed mono-pitch roof: a prism with a flat underside, a
// sloped top and flat ends (so no gaps at the sides), seen
// from the road as one corrugated sheet. World coordinates:
//   xLow / xHigh   x of the low and high eave
//   zFrom / zTo    ends along the road
//   y              underside (the wall top it sits on)
//   drop           rise from low to high eave
//   thickness      sheet thickness at the low eave
// Non-indexed, flat shaded; corrugation runs down the slope.
export function createRoofWedge({
  xLow,
  xHigh,
  zFrom,
  zTo,
  y,
  drop,
  thickness = 0.06,
  color,
  tile = 1.6
}) {

  const p = {
    l0b: [xLow, y, zFrom],
    l1b: [xLow, y, zTo],
    l0t: [xLow, y + thickness, zFrom],
    l1t: [xLow, y + thickness, zTo],
    h0b: [xHigh, y, zFrom],
    h1b: [xHigh, y, zTo],
    h0t: [xHigh, y + thickness + drop, zFrom],
    h1t: [xHigh, y + thickness + drop, zTo]
  };


  const centre =
    new THREE.Vector3(
      (xLow + xHigh) / 2,
      y + (thickness + drop) / 2,
      (zFrom + zTo) / 2
    );


  const faces = [
    { quad: ['l0t', 'l1t', 'h1t', 'h0t'], top: true },
    { quad: ['l0b', 'h0b', 'h1b', 'l1b'] },
    { quad: ['l0b', 'l0t', 'l1t', 'l1b'] },
    { quad: ['h0b', 'h1b', 'h1t', 'h0t'] },
    { quad: ['l0b', 'h0b', 'h0t', 'l0t'] },
    { quad: ['l1b', 'l1t', 'h1t', 'h1b'] }
  ];


  const slopeLength =
    Math.hypot(
      xHigh - xLow,
      drop
    );


  const positions =
    [];

  const uvs =
    [];


  const a =
    new THREE.Vector3();

  const b =
    new THREE.Vector3();

  const c =
    new THREE.Vector3();

  const mid =
    new THREE.Vector3();


  for (
    const { quad, top }
    of faces
  ) {

    let points =
      quad.map(
        (key) => new THREE.Vector3(
          ...p[key]
        )
      );


    // Face outwards: flip the winding if the normal points at
    // the middle of the prism
    a.subVectors(points[1], points[0]);
    b.subVectors(points[2], points[0]);
    c.crossVectors(a, b);

    mid.set(0, 0, 0);

    for (const point of points) {
      mid.add(point);
    }

    mid.multiplyScalar(0.25).sub(centre);


    if (
      c.dot(mid) < 0
    ) {

      points =
        [points[0], points[3], points[2], points[1]];
    }


    for (
      const i
      of [0, 1, 2, 0, 2, 3]
    ) {

      const point =
        points[i];


      positions.push(
        point.x,
        point.y,
        point.z
      );


      if (
        top
      ) {

        // across the sheet (along z) x down the slope
        uvs.push(
          (point.z - zFrom) / tile,
          Math.abs(point.x - xLow) /
          Math.abs(xHigh - xLow) *
          slopeLength /
          tile
        );
      }

      else {

        // end faces run along x, side faces along z
        uvs.push(
          (
            Math.abs(c.x) >= Math.abs(c.z)
              ? point.z
              : point.x
          ) / tile,
          point.y / tile
        );
      }
    }
  }


  const geometry =
    new THREE.BufferGeometry();


  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      positions,
      3
    )
  );


  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      uvs,
      2
    )
  );


  geometry.computeVertexNormals();


  const tint =
    new THREE.Color(
      color
    );


  const count =
    positions.length / 3;


  const colors =
    new Float32Array(
      count * 3
    );


  for (
    let i = 0;
    i < count;
    i++
  ) {

    colors[i * 3] =
      tint.r;

    colors[i * 3 + 1] =
      tint.g;

    colors[i * 3 + 2] =
      tint.b;
  }


  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(
      colors,
      3
    )
  );


  return geometry;
}


// ---- House ----

// Roof eave overhang on every side (metres)
export const OVERHANG =
  0.3;

const DOOR_COLOUR =
  0x2b2019;

const WINDOW_COLOUR =
  0x15191c;


// One low township house or shack, facing the road. `side` is
// +1 for the +x side. Returns lists of geometry parts:
//   blockWalls / ironWalls  walls, to be merged and made
//                           collidable by the caller
//   roofs                   mono-pitch corrugated roof
//   details                 dark door and window patches
// and `window`, the centre of the window facing the road
// (where a candle glow can go).
export function createTownshipHouse({
  side,
  front,
  z,
  length,
  depth,
  height,
  kind,
  wallColor,
  roofColor,
  roofDrop,
  slopeToRoad,
  annex
}) {

  const tile =
    1.6;

  const walls =
    [];

  const roofs =
    [];


  const bodyCentreX =
    side *
    (front + depth / 2);


  walls.push(
    coloredBox({
      size: [depth, height, length],
      position: [bodyCentreX, height / 2, z + length / 2],
      color: wallColor,
      tile,
      skipTop: true
    })
  );


  if (
    annex
  ) {

    const annexDepth =
      depth * 0.6;

    const annexHeight =
      height * 0.78;

    const annexLength =
      length * 0.55;


    walls.push(
      coloredBox({
        size: [annexDepth, annexHeight, annexLength],
        position: [
          side * (front + depth + annexDepth / 2 - 0.2),
          annexHeight / 2,
          z + length * annex.at
        ],
        color: annex.color,
        tile,
        skipTop: true
      })
    );


    // Low roof over the annex, sloping away from the house
    const annexNear =
      side * (front + depth - 0.2);

    const annexFar =
      side * (front + depth - 0.2 + annexDepth);


    roofs.push(
      createRoofWedge({
        xLow:
          annexFar + side * OVERHANG,

        xHigh:
          annexNear - side * OVERHANG,

        zFrom:
          z + length * annex.at - annexLength / 2 - OVERHANG,

        zTo:
          z + length * annex.at + annexLength / 2 + OVERHANG,

        y:
          annexHeight,

        drop:
          0.25,

        color:
          roofColor,

        tile
      })
    );
  }


  // Main roof: a closed wedge sitting on the wall tops, 0.3 m
  // overhang on every side. The low eave is on the road side
  // when slopeToRoad.
  const nearEdge =
    side * (front - OVERHANG);

  const farEdge =
    side * (front + depth + OVERHANG);


  roofs.push(
    createRoofWedge({
      xLow:
        slopeToRoad ? nearEdge : farEdge,

      xHigh:
        slopeToRoad ? farEdge : nearEdge,

      zFrom:
        z - OVERHANG,

      zTo:
        z + length + OVERHANG,

      y:
        height,

      drop:
        roofDrop,

      color:
        roofColor,

      tile
    })
  );


  // Door and window as dark patches, just proud of the wall
  const faceX =
    side *
    (front - 0.025);


  const details =
    [
      coloredBox({
        size: [0.05, 1.9, 0.9],
        position: [faceX, 0.95, z + length * 0.3],
        color: DOOR_COLOUR
      }),

      coloredBox({
        size: [0.05, 0.75, 0.9],
        position: [faceX, 1.5, z + length * 0.72],
        color: WINDOW_COLOUR
      })
    ];


  return {

    blockWalls:
      kind === 'block'
        ? walls
        : [],

    ironWalls:
      kind === 'block'
        ? []
        : walls,

    roofs,

    details,

    window: {
      x: side * (front - 0.055),
      y: 1.5,
      z: z + length * 0.72
    }
  };
}


// ---- Fence / wall ----

// One run of boundary: a corrugated sheet fence or a low
// cinder-block wall, thin along x so it stays at |x| ~ 10.25.
// Returns { material: 'iron' | 'block', parts }.
export function createFenceSection({
  x,
  z,
  length,
  kind,
  height,
  color
}) {

  if (
    kind === 'block'
  ) {

    return {

      material:
        'block',

      parts: [
        coloredBox({
          size: [0.2, height, length],
          position: [x, height / 2, z],
          color,
          tile: 1.6
        })
      ]
    };
  }


  return {

    material:
      'iron',

    parts: [

      coloredBox({
        size: [0.06, height, length - 0.1],
        position: [x, height / 2 + 0.1, z],
        color,
        tile: 1.6
      }),

      // post at the start of the run
      coloredBox({
        size: [0.14, height + 0.25, 0.14],
        position: [x, (height + 0.25) / 2, z - length / 2],
        color: 0x3a342d
      })
    ]
  };
}


// ---- Dead street lamps ----

export const DEAD_LAMP_HEIGHT = 6.5;


// Same shape as a working street lamp (pole, arm, head) but
// every part is one plain unlit material: no emissive, no
// light. `stations`: [{ x, z, lean }], lean in radians about
// the road axis, positive = towards the road. A station with
// x < 0 is turned round so its arm still points at the road.
export function createDeadLampPoles({
  stations,
  material,
  height = DEAD_LAMP_HEIGHT
}) {

  const pole =
    new THREE.CylinderGeometry(
      0.07,
      0.11,
      height + 0.3,
      8
    );


  pole.translate(
    0,
    height / 2 -
    0.15,
    0
  );


  const arm =
    new THREE.BoxGeometry(
      1.2,
      0.08,
      0.08
    );


  arm.translate(
    -0.6,
    height - 0.25,
    0
  );


  const head =
    new THREE.BoxGeometry(
      0.45,
      0.12,
      0.3
    );


  head.translate(
    -1.1,
    height - 0.32,
    0
  );


  const geometry =
    mergeGeometries(
      [pole, arm, head]
    );


  pole.dispose();
  arm.dispose();
  head.dispose();


  const mesh =
    new THREE.InstancedMesh(
      geometry,
      material,
      stations.length
    );


  const matrix =
    new THREE.Matrix4();

  const lean =
    new THREE.Matrix4();


  stations.forEach(
    (station, i) => {

      matrix.makeRotationY(
        station.x < 0
          ? Math.PI
          : 0
      );


      lean.makeRotationZ(
        station.lean ?? 0
      );


      matrix.multiply(
        lean
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


  mesh.castShadow =
    true;


  return mesh;
}


// ---- Wreck ----

// A stripped parked car, length along z. The geometry is
// built once per colour (use the createGeometryCache) and the
// meshes share it. `wheels` 0..4: how many wheels it still has.
export function createWreckGeometry({
  color,
  wheels = 2
}) {

  const body =
    new THREE.Color(
      color
    );


  const darker =
    body.clone().multiplyScalar(
      0.82
    );


  const parts =
    [

      coloredBox({
        size: [1.9, 0.6, 4.3],
        position: [0, 0.65, 0],
        color: body
      }),

      coloredBox({
        size: [1.62, 0.5, 2.2],
        position: [0, 1.2, -0.25],
        color: darker
      }),

      // glass band (windows gone, so it reads as dark holes)
      coloredBox({
        size: [1.66, 0.3, 2.0],
        position: [0, 1.22, -0.25],
        color: 0x101214
      })
    ];


  const wheelSpots =
    [
      [-0.9, 1.4],
      [0.9, 1.4],
      [-0.9, -1.4],
      [0.9, -1.4]
    ];


  wheelSpots.forEach(
    ([x, z], i) => {

      parts.push(
        coloredBox(
          i < wheels
            ? {
                size: [0.25, 0.6, 0.6],
                position: [x, 0.3, z],
                color: 0x121212
              }

            // no wheel: the car sits on a brick stack
            : {
                size: [0.35, 0.3, 0.4],
                position: [x * 0.95, 0.15, z],
                color: 0x8a4b38
              }
        )
      );
    }
  );


  return mergeParts(
    parts
  );
}


export function createWreckMesh({
  geometry,
  material
}) {

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


// ---- Bin ----

export function createBinGeometry({
  color
}) {

  return mergeParts([

    coloredBox({
      size: [0.62, 0.95, 0.75],
      position: [0, 0.475, 0],
      color
    }),

    coloredBox({
      size: [0.68, 0.08, 0.82],
      position: [0, 0.99, 0],
      color: 0x1d1f20
    })
  ]);
}


export function createBinMesh({
  geometry,
  material
}) {

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


// ---- Candle windows ----

// A few very faint warm squares on house fronts. Emissive
// only (the material decides how faint); no lights.
// spots: [{ x, y, z, side }].
export function createCandleWindows({
  spots,
  material,
  width = 0.55,
  height = 0.6
}) {

  const mesh =
    new THREE.InstancedMesh(

      new THREE.PlaneGeometry(
        width,
        height
      ),

      material,

      spots.length
    );


  const matrix =
    new THREE.Matrix4();


  spots.forEach(
    (spot, i) => {

      matrix.makeRotationY(
        spot.side === -1
          ? Math.PI / 2
          : -Math.PI / 2
      );


      matrix.setPosition(
        spot.x,
        spot.y,
        spot.z
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


// ---- Road patches ----

// Faded repair patches on worn tarmac: flat slabs, one
// InstancedMesh, lit standard material (pass one). Each
// instance is the road's own albedo times a shade in
// `shadeRange` (e.g. [0.8, 1.2]), so a patch is never brighter
// than shadeRange[1] x the road. `albedo` is linear RGB. Sits
// below the lane dashes and the pothole discs.
export function createRoadPatches({
  count,
  seed,
  xRange,
  zRange,
  albedo,
  shadeRange,
  material
}) {

  const random =
    createRandom(
      seed
    );


  const mesh =
    new THREE.InstancedMesh(

      new THREE.BoxGeometry(
        1,
        0.01,
        1
      ),

      material,

      count
    );


  const matrix =
    new THREE.Matrix4();

  const position =
    new THREE.Vector3();

  const quaternion =
    new THREE.Quaternion();

  const scale =
    new THREE.Vector3();

  const up =
    new THREE.Vector3(
      0,
      1,
      0
    );

  const tint =
    new THREE.Color();


  for (
    let i = 0;
    i < count;
    i++
  ) {

    position.set(
      xRange[0] +
      random() * (xRange[1] - xRange[0]),
      0,
      zRange[0] +
      random() * (zRange[1] - zRange[0])
    );


    quaternion.setFromAxisAngle(
      up,
      (random() - 0.5) * 0.6
    );


    scale.set(
      1.2 + random() * 2.6,
      1,
      1.2 + random() * 3.4
    );


    mesh.setMatrixAt(
      i,
      matrix.compose(
        position,
        quaternion,
        scale
      )
    );


    const shade =
      shadeRange[0] +
      random() * (shadeRange[1] - shadeRange[0]);


    mesh.setColorAt(
      i,
      tint.setRGB(
        albedo[0] * shade,
        albedo[1] * shade,
        albedo[2] * shade
      )
    );
  }


  mesh.instanceMatrix.needsUpdate =
    true;


  mesh.instanceColor.needsUpdate =
    true;


  mesh.receiveShadow =
    true;


  return mesh;
}
