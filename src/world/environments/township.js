import * as THREE from 'three';

import {
  createBox,
  createTexturedBox,
  prepareAO,
  scaleLengthUV,
  createGeometryCache,
  MAIN_POTHOLES,
  ROAD_TILE_LENGTH,
  disposeObjectTree
} from './helpers.js';

import {
  DEFAULT_ROAD,
  alignedFrom,
  roadCentre,
  roadLength
} from '../roads.js';

import {
  createRandom,
  createLaneDashes,
  createRoadPatches,
  createBlockTexture,
  createCorrugatedTexture,
  createTownshipHouse,
  createFenceSection,
  createTwoMaterialMesh,
  mergeParts,
  createDeadLampPoles,
  createWreckGeometry,
  createWreckMesh,
  createBinGeometry,
  createBinMesh,
  createCandleWindows
} from './props.js';


// ==================================================
// LEVEL 3: TOWNSHIP BACK ROAD ("Load Shedding")
// --------------------------------------------------
// Night level: nothing here lights the road. The lamp poles
// are dead, the windows are dark, and the only emissive
// things are at most 6 very faint candle squares on house
// fronts (landmarks, no real lights). The headlights do the
// work.
//
//   x  |x| < 7.5      route corridor: nothing collidable
//      7.5 .. 9.9     shoulder: wrecks and bins (collidable)
//      9.6            dead lamp poles
//      10.1 .. 10.4   fence / low wall (collidable)
//      >= 11          houses and shacks (collidable bodies)
//
// Collidables (all childless single Meshes), per 100 m of road:
//   2 fence chunks + 2 house-body chunks + 3 wrecks + 2.5 bins
//   (the original 400 m: 8 fences + 8 houses + 12 wrecks + 10 bins).
//
// The road is z -200..200 or longer (roads.js). The original
// stretch is built exactly as it always was; a longer road adds
// stretches of the same kind of township, each with seeds of its
// own, so nothing in the original stretch moves.
// ==================================================

const ROAD_HALF_WIDTH = 9;

// House bodies, roofs and fences are merged per chunk this long,
// on a grid anchored at z -200
const CHUNK_LENGTH = 100;

export const CORRIDOR_HALF_WIDTH = 7.5;

// The road's albedo in linear RGB: the mean of the asphalt
// texture (public/assets/textures/road/asphalt_pit_lane_diff_2k.jpg,
// measured: 0.0551, 0.0447, 0.0361) times the tint set on the
// material below (0x8d8d8d = 0.2664 linear). Markings and
// patches are built from this so nothing on the road is
// brighter than ~1.2x the tarmac, which at night is what
// would otherwise glow in the headlights.
const ROAD_TINT = 0x8d8d8d;

export const ROAD_ALBEDO = [
  0.0551 * 0.2664,
  0.0447 * 0.2664,
  0.0361 * 0.2664
];

// Faded markings and patches stay within these multiples
export const PATCH_SHADE_RANGE = [0.8, 1.2];
export const DASH_SHADE = 1.2;

const SHOULDER_X = 8.8;
const FENCE_X = 10.25;
const LAMP_X = 9.6;

const WRECK_COUNT = 12;
const BIN_COUNT = 10;
const MAX_CANDLES = 6;

// Rusty / faded township paint
const WALL_BLOCK = [0xb9b3a8, 0xc9a98a, 0x9fb0b5, 0xcdbf86, 0xa8a39a];
const WALL_IRON = [0x8c4a2f, 0xa35b34, 0x6e7378, 0x4f6a73, 0x7c3b30, 0x8a7a55, 0x5c6f4f];
const WRECK_COLOURS = [0x7c3b30, 0x6e7378, 0x8a7a55, 0x4f6a73];
const BIN_COLOURS = [0x2f5d3a, 0x2a3f5c, 0x3a3a3a, 0x5c2f2a];


function pick(
  random,
  list
) {

  return list[
    Math.floor(
      random() * list.length
    )
  ];
}


export function createTownship({
  materials,
  road: roadExtent = DEFAULT_ROAD
}) {

  const ROAD_Z_MIN =
    roadExtent.zMin;

  const ROAD_Z_MAX =
    roadExtent.zMax;

  const ROAD_LENGTH =
    roadLength(
      roadExtent
    );

  const ROAD_CENTRE =
    roadCentre(
      roadExtent
    );

  // The original road, then whatever was added below and above it
  const STRETCHES =
    [
      { index: 0, from: -200, to: 200 }
    ];

  if (
    ROAD_Z_MIN < -200
  ) {

    STRETCHES.push({
      index: 1,
      from: ROAD_Z_MIN,
      to: -200
    });
  }

  if (
    ROAD_Z_MAX > 200
  ) {

    STRETCHES.push({
      index: 2,
      from: 200,
      to: ROAD_Z_MAX
    });
  }

  const group =
    new THREE.Group();

  const collidables =
    [];

  const geo =
    createGeometryCache();


  // ----------------------------------------------
  // GROUND (dirt) AND ROAD (worn tarmac)
  // ----------------------------------------------

  const dirtMaterial =
    materials.createRoughConcreteMaterial(
      60,
      60
    );


  dirtMaterial.color.setHex(
    0x5a4733
  );


  const ground =
    createTexturedBox(
      400,
      0.2,
      ROAD_LENGTH,
      dirtMaterial,
      ROAD_TILE_LENGTH
    );


  ground.position.y =
    -0.2;

  ground.position.z =
    ROAD_CENTRE;


  group.add(
    ground
  );


  const roadMaterial =
    materials.createRoadMaterial();


  roadMaterial.color.setHex(
    ROAD_TINT
  );


  const road =
    createTexturedBox(
      ROAD_HALF_WIDTH * 2,
      0.05,
      ROAD_LENGTH,
      roadMaterial,
      ROAD_TILE_LENGTH
    );


  road.position.y =
    -0.05;

  road.position.z =
    ROAD_CENTRE;


  group.add(
    road
  );


  // Dirt shoulders creeping over the tarmac edge
  const shoulderMaterial =
    materials.createRoughConcreteMaterial(
      1,
      80
    );


  shoulderMaterial.color.setHex(
    0x826a4a
  );


  const shoulderGeometry =
    scaleLengthUV(
      prepareAO(
        new THREE.BoxGeometry(
          3.3,
          0.04,
          ROAD_LENGTH
        )
      ),
      ROAD_LENGTH,
      ROAD_TILE_LENGTH
    );


  for (
    const side
    of [-1, 1]
  ) {

    const shoulder =
      new THREE.Mesh(
        shoulderGeometry,
        shoulderMaterial
      );


    shoulder.position.set(
      side * 10.35,
      -0.005,
      ROAD_CENTRE
    );


    shoulder.receiveShadow =
      true;


    group.add(
      shoulder
    );
  }


  // Faded centre dashes and repair patches
  const dashes =
    createLaneDashes({
      xs:
        [0],

      // dashes keep the original phase (z -200 + 14 k)
      zFrom:
        alignedFrom(
          -200,
          14,
          ROAD_Z_MIN
        ),

      zTo:
        ROAD_Z_MAX,

      period:
        14,

      dashLength:
        3.5,

      width:
        0.12,

      y:
        0.015,

      material:
        // faded paint: at most DASH_SHADE x the tarmac
        new THREE.MeshStandardMaterial({

          color:
            new THREE.Color().setRGB(
              ROAD_ALBEDO[0] * DASH_SHADE,
              ROAD_ALBEDO[1] * DASH_SHADE,
              ROAD_ALBEDO[2] * DASH_SHADE
            ),

          roughness:
            1
        })
    });


  dashes.name =
    'township-dashes';


  group.add(
    dashes
  );


  // Added stretches get their own patches (the same density, a
  // seed of their own), so the original ones stay where they were
  for (
    const stretch
    of STRETCHES
  ) {

    const patches =
      createRoadPatches({
        count:
          stretch.index === 0
            ? 26
            : Math.round(
                26 *
                (stretch.to - stretch.from - 10) /
                390
              ),

        seed:
          99 + stretch.index,

        xRange:
          [-8, 8],

        zRange:
          [stretch.from + 5, stretch.to - 5],

        albedo:
          ROAD_ALBEDO,

        shadeRange:
          PATCH_SHADE_RANGE,

        // white: each instance carries its own (road-like) colour
        material:
          new THREE.MeshStandardMaterial({

            color:
              0xffffff,

            roughness:
              1
          })
      });


    patches.name =
      'township-patches';


    group.add(
      patches
    );
  }

  // ----------------------------------------------
  // POTHOLES
  // Same positions as the vehicle physics expects;
  // dark and unmarked so only the headlights show them.
  // Level 3 has no speed bump (no physics there), so none is drawn.
  // ----------------------------------------------

  const potholeMaterial =
    new THREE.MeshStandardMaterial({

      color:
        0x070707,

      roughness:
        1
    });


  for (
    const pothole
    of MAIN_POTHOLES
  ) {

    const visual =
      new THREE.Mesh(

        new THREE.CircleGeometry(
          pothole.radius,
          40
        ),

        potholeMaterial
      );


    visual.rotation.x =
      -Math.PI / 2;


    visual.position.set(
      pothole.x,
      0.018,
      pothole.z
    );


    visual.receiveShadow =
      true;


    group.add(
      visual
    );
  }


  // ----------------------------------------------
  // MATERIALS FOR STRUCTURES (vertex-coloured)
  // ----------------------------------------------

  const blockMaterial =
    new THREE.MeshStandardMaterial({

      map:
        createBlockTexture(),

      vertexColors:
        true,

      roughness:
        0.95
    });


  const ironMaterial =
    new THREE.MeshStandardMaterial({

      map:
        createCorrugatedTexture(),

      vertexColors:
        true,

      roughness:
        0.6,

      metalness:
        0.35
    });


  const plainMaterial =
    new THREE.MeshStandardMaterial({

      vertexColors:
        true,

      roughness:
        0.9,

      metalness:
        0.2
    });


  // ----------------------------------------------
  // HOUSES AND SHACKS
  // ----------------------------------------------
  // Laid out stretch by stretch (see STRETCHES): the original
  // road's houses come first and are exactly the ones the
  // township always had; each added stretch has its own seeds.
  // Bodies, roofs and door / window patches are merged per 100 m
  // chunk on a grid anchored at z -200, so culling still drops
  // the far ones.

  const chunkOf =
    (z) =>
      Math.floor(
        (z + 200) /
        CHUNK_LENGTH
      );

  const sortedChunks =
    (map) =>
      [...map.entries()]
        .sort(
          (a, b) => a[0] - b[0]
        )
        .map(
          ([, value]) => value
        );

  const roofChunks =
    new Map();

  const detailChunks =
    new Map();

  const candleSpots =
    [];

  const bodyChunks =
    [];


  let houseNumber =
    0;


  for (
    const stretch
    of STRETCHES
  ) {

    // The candle landmarks keep their density per metre
    const maxCandles =
      Math.round(
        MAX_CANDLES *
        (stretch.to - stretch.from) /
        400
      );

    let candles =
      0;


    for (
      const side
      of [-1, 1]
    ) {

      const random =
        createRandom(
          (
            side === -1
              ? 1337
              : 7331
          ) +
          stretch.index * 100000
        );


      const chunks =
        new Map();


      let z =
        stretch.from + 4 +
        random() * 3;


      while (
        true
      ) {

        const length =
          6 +
          random() * 4;


        if (
          z + length > stretch.to - 2
        ) {

          break;
        }


        // Some plots are empty
        if (
          random() < 0.12
        ) {

          z +=
            length +
            1.5;

          continue;
        }


        const kind =
          random() < 0.55
            ? 'block'
            : 'shack';


        const house =
          createTownshipHouse({

            side,

            front:
              11.4 +
              random() * 1.6,

            z,

            length,

            depth:
              4 +
              random() * 2.5,

            height:
              2.3 +
              random() * 0.7,

            kind,

            wallColor:
              pick(
                random,
                kind === 'block'
                  ? WALL_BLOCK
                  : WALL_IRON
              ),

            roofColor:
              pick(
                random,
                WALL_IRON
              ),

            roofDrop:
              0.45 +
              random() * 0.3,

            slopeToRoad:
              random() < 0.5,

            annex:
              random() < 0.4
                ? {
                    at: random() < 0.5 ? 0.3 : 0.7,

                    color:
                      pick(
                        random,
                        WALL_IRON
                      )
                  }
                : null
          });


        const index =
          chunkOf(
            z + length / 2
          );


        if (
          !chunks.has(
            index
          )
        ) {

          chunks.set(
            index,
            { block: [], iron: [] }
          );
        }


        const chunk =
          chunks.get(
            index
          );


        chunk.block.push(
          ...house.blockWalls
        );


        chunk.iron.push(
          ...house.ironWalls
        );


        for (
          const [map, parts]
          of [
            [roofChunks, house.roofs],
            [detailChunks, house.details]
          ]
        ) {

          if (
            !map.has(
              index
            )
          ) {

            map.set(
              index,
              []
            );
          }

          map.get(
            index
          ).push(
            ...parts
          );
        }


        if (
          houseNumber % 11 === 4 &&
          candles < maxCandles
        ) {

          candleSpots.push({
            ...house.window,
            side
          });

          candles++;
        }


        houseNumber++;


        z +=
          length +
          1.2 +
          random() * 2.2;
      }


      bodyChunks.push(
        ...sortedChunks(
          chunks
        )
      );
    }
  }


  // House bodies: one collidable Mesh per 100 m chunk per side
  for (
    const chunk
    of bodyChunks
  ) {

    const bodies =
      createTwoMaterialMesh({

        blockParts:
          chunk.block,

        ironParts:
          chunk.iron,

        blockMaterial,

        ironMaterial
      });


    bodies.name =
      'township-houses';


    group.add(
      bodies
    );


    collidables.push(
      bodies
    );
  }


  // Roofs and door / window patches: one merged Mesh per chunk
  for (
    const parts
    of sortedChunks(
      roofChunks
    )
  ) {

    const roofs =
      new THREE.Mesh(
        mergeParts(
          parts
        ),
        ironMaterial
      );


    roofs.name =
      'township-roofs';


    roofs.castShadow =
      true;


    roofs.receiveShadow =
      true;


    group.add(
      roofs
    );
  }


  for (
    const parts
    of sortedChunks(
      detailChunks
    )
  ) {

    const details =
      new THREE.Mesh(
        mergeParts(
          parts
        ),
        plainMaterial
      );


    details.name =
      'township-details';


    group.add(
      details
    );
  }


  // Candle glow landmarks (emissive only, no lights)
  const candles =
    createCandleWindows({

      spots:
        candleSpots,

      material:
        new THREE.MeshStandardMaterial({

          color:
            0x1a0f08,

          emissive:
            0xff9a45,

          emissiveIntensity:
            0.4,

          roughness:
            1
        })
    });


  candles.name =
    'township-candles';


  group.add(
    candles
  );


  // ----------------------------------------------
  // FENCES AND LOW WALLS (one collidable per side per chunk)
  // ----------------------------------------------

  for (
    const stretch
    of STRETCHES
  ) {

    for (
      const side
      of [-1, 1]
    ) {

      const random =
        createRandom(
          (
            side === -1
              ? 4242
              : 2424
          ) +
          stretch.index * 100000
        );


      const chunks =
        new Map();


      const SECTION =
        3;

      let runLeft =
        0;

      let runKind =
        'iron';


      for (
        let z = stretch.from + SECTION / 2;
        z < stretch.to;
        z += SECTION
      ) {

        if (
          runLeft === 0
        ) {

          runLeft =
            3 +
            Math.floor(
              random() * 6
            );


          runKind =
            random() < 0.35
              ? 'block'
              : 'iron';
        }


        runLeft--;


        const section =
          createFenceSection({

            x:
              side * FENCE_X,

            z,

            length:
              SECTION,

            kind:
              runKind,

            height:
              runKind === 'block'
                ? 1 + random() * 0.4
                : 1.1 + random() * 0.7,

            color:
              runKind === 'block'
                ? pick(
                    random,
                    WALL_BLOCK
                  )
                : pick(
                    random,
                    WALL_IRON
                  )
          });


        const index =
          chunkOf(
            z
          );


        if (
          !chunks.has(
            index
          )
        ) {

          chunks.set(
            index,
            { block: [], iron: [] }
          );
        }


        (
          section.material === 'block'
            ? chunks.get(index).block
            : chunks.get(index).iron
        ).push(
          ...section.parts
        );
      }


      for (
        const chunk
        of sortedChunks(
          chunks
        )
      ) {

        const fence =
          createTwoMaterialMesh({

            blockParts:
              chunk.block,

            ironParts:
              chunk.iron,

            blockMaterial,

            ironMaterial
          });


        fence.name =
          'township-fence';


        group.add(
          fence
        );


        collidables.push(
          fence
        );
      }
    }
  }


  // ----------------------------------------------
  // WRECKS AND BINS (collidable, on the shoulders)
  // ----------------------------------------------

  const wreckMaterial =
    new THREE.MeshStandardMaterial({

      vertexColors:
        true,

      roughness:
        0.85,

      metalness:
        0.3
    });


  const binMaterial =
    new THREE.MeshStandardMaterial({

      vertexColors:
        true,

      roughness:
        0.7
    });


  // Everything taken so far, so no two props (or a lamp) overlap
  const taken =
    [];


  const clearOf =
    (side, z, gap) =>
      taken.every(
        (spot) =>
          spot.side !== side ||
          Math.abs(
            spot.z - z
          ) > gap
      );


  for (
    const stretch
    of STRETCHES
  ) {

    const length =
      stretch.to -
      stretch.from;

    const props =
      createRandom(
        555 +
        stretch.index * 1000
      );

    // Same number per metre as the original 12 and 10 in 400 m
    const wreckCount =
      Math.round(
        WRECK_COUNT *
        length /
        400
      );

    const binCount =
      Math.round(
        BIN_COUNT *
        length /
        400
      );


    for (
      let i = 0;
      i < wreckCount;
      i++
    ) {

      const side =
        props() < 0.5
          ? -1
          : 1;


      const z =
        stretch.from + 20 +
        i * 32 +
        props() * 10;


      const colour =
        i % WRECK_COLOURS.length;


      const wheels =
        (i * 7) % 4;


      const wreck =
        createWreckMesh({

          geometry:
            geo(
              `wreck-${colour}-${wheels}`,
              () => createWreckGeometry({
                color: WRECK_COLOURS[colour],
                wheels
              })
            ),

          material:
            wreckMaterial
        });


      wreck.name =
        'township-wreck';


      wreck.position.set(
        side * SHOULDER_X,
        0,
        z
      );


      // Parked roughly parallel to the road
      wreck.rotation.y =
        (props() - 0.5) *
        0.16;


      group.add(
        wreck
      );


      collidables.push(
        wreck
      );


      taken.push(
        { side, z }
      );
    }


    for (
      let i = 0, tries = 0;
      i < binCount && tries < 200;
      tries++
    ) {

      const side =
        props() < 0.5
          ? -1
          : 1;


      const z =
        stretch.from + 15 +
        props() * (length - 30);


      if (
        !clearOf(
          side,
          z,
          4
        )
      ) {

        continue;
      }


      const colour =
        i % BIN_COLOURS.length;


      const bin =
        createBinMesh({

          geometry:
            geo(
              `bin-${colour}`,
              () => createBinGeometry({
                color: BIN_COLOURS[colour]
              })
            ),

          material:
            binMaterial
        });


      bin.name =
        'township-bin';


      bin.position.set(
        side * 9.45,
        0,
        z
      );


      bin.rotation.y =
        (props() - 0.5) *
        0.8;


      group.add(
        bin
      );


      collidables.push(
        bin
      );


      taken.push(
        { side, z }
      );


      i++;
    }
  }


  // ----------------------------------------------
  // DEAD STREET LAMPS (no emissive, no light)
  // ----------------------------------------------
  // z -160 + 40 k along the whole road (the original ones are the
  // same as before)

  const stations =
    [];


  let lampNumber =
    0;


  for (
    let z = alignedFrom(
      -160,
      40,
      ROAD_Z_MIN +
      40
    );
    z <= ROAD_Z_MAX - 40;
    z += 40
  ) {

    for (
      const side
      of [-1, 1]
    ) {

      lampNumber++;


      if (
        !clearOf(
          side,
          z,
          3.4
        )
      ) {

        continue;
      }


      stations.push({

        x:
          side * LAMP_X,

        z,

        // a few have been knocked askew
        lean:
          lampNumber % 7 === 3
            ? -0.14
            : lampNumber % 11 === 5
              ? 0.1
              : 0
      });
    }
  }


  const lamps =
    createDeadLampPoles({

      stations,

      material:
        new THREE.MeshStandardMaterial({

          color:
            0x3b4043,

          roughness:
            0.55,

          metalness:
            0.5
        })
    });


  lamps.name =
    'township-lamps';


  group.add(
    lamps
  );


  return {

    group,

    collidables,

    dispose() {

      disposeObjectTree(
        group,
        materials
      );
    }
  };
}
