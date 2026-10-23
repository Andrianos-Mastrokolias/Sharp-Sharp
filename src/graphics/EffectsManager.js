import * as THREE from 'three';

import {
  createHeatHazeMaterial
} from '../shaders/HeatHazeShader.js';

import {
  roadFor
} from '../world/roads.js';


// ==================================================
// HEAT HAZE LAYOUT
// --------------------------------------------------
// Each haze layer is one plane laid over the road. A level's
// road is far longer than a plane, so a layer is a row of
// identical tiles sharing one geometry and one material.
// The shader fades a tile to nothing at both ends, so tiles are
// spaced at half their length: neighbours overlap by 50% and the
// seams do not show. (Stretching one plane over the whole road
// would stretch the shimmer bands.) Every tile is frustum
// culled, so only the ones in view are drawn.
//
// The tiles keep the original planes' places: one tile of each
// layer is exactly where that plane always was.
// ==================================================

const LOWER_HAZE = {
  width: 16,
  length: 240,
  segments: [40, 120],
  y: 0.13,
  z: -45
};

const UPPER_HAZE = {
  width: 15,
  length: 210,
  segments: [32, 100],
  y: 0.28,
  z: -40
};

// The small vertical shimmer; one every 190 m
const HORIZON_HAZE = {
  width: 18,
  height: 7,
  segments: [50, 20],
  y: 2.2,
  z: -95,
  spacing: 190
};


// Centres of a row of tiles `length` long, `spacing` apart, one of
// them at `z0`, that together cover [zMin, zMax]
function tileCentres(
  z0,
  length,
  spacing,
  zMin,
  zMax
) {

  const centres =
    [];


  for (
    let k = Math.ceil(
      (zMin - length / 2 - z0) /
      spacing
    );
    z0 + k * spacing - length / 2 < zMax;
    k++
  ) {

    const z =
      z0 + k * spacing;


    if (
      z + length / 2 > zMin
    ) {

      centres.push(
        z
      );
    }
  }


  return centres;
}


export class EffectsManager {

  constructor({
    scene
  }) {

    this.scene =
      scene;


    // ==================================================
    // CURRENT LEVEL
    // ==================================================

    this.currentLevel =
      1;


    // ==================================================
    // HEAT HAZE MATERIALS
    // ==================================================

    this.heatHazeMaterial =
      createHeatHazeMaterial();


    this.heatHazeMaterial
      .uniforms
      .uIntensity
      .value =
        0;


    this.upperHeatHazeMaterial =
      createHeatHazeMaterial();


    this.upperHeatHazeMaterial
      .uniforms
      .uColor
      .value
      .set(
        0xfff7e6
      );


    this.upperHeatHazeMaterial
      .uniforms
      .uIntensity
      .value =
        0;


    // ==================================================
    // DISTANT VERTICAL SHIMMER
    // ==================================================
    //
    // This layer sits farther ahead and gives the
    // impression that hot air is distorting the horizon.
    // ==================================================

    this.horizonHeatMaterial =
      createHeatHazeMaterial();


    this.horizonHeatMaterial
      .uniforms
      .uColor
      .value
      .set(
        0xffead0
      );


    this.horizonHeatMaterial
      .uniforms
      .uIntensity
      .value =
        0;


    // ==================================================
    // SHARED TILE GEOMETRIES
    // ==================================================

    this.lowerGeometry =
      new THREE.PlaneGeometry(
        LOWER_HAZE.width,
        LOWER_HAZE.length,
        ...LOWER_HAZE.segments
      );


    this.upperGeometry =
      new THREE.PlaneGeometry(
        UPPER_HAZE.width,
        UPPER_HAZE.length,
        ...UPPER_HAZE.segments
      );


    this.horizonGeometry =
      new THREE.PlaneGeometry(
        HORIZON_HAZE.width,
        HORIZON_HAZE.height,
        ...HORIZON_HAZE.segments
      );


    // The tiles of each layer (rebuilt for every level's road)
    this.lowerTiles =
      [];

    this.upperTiles =
      [];

    this.horizonTiles =
      [];


    this.hazeEnabled =
      false;


    this.setHeatHazeEnabled(
      false
    );
  }


  // ==================================================
  // TILES
  // ==================================================

  // One row of tiles of a layer over the road [zMin, zMax]
  buildTiles(
    list,
    {
      geometry,
      material,
      renderOrder,
      y,
      z,
      length,
      spacing,
      flat
    },
    zMin,
    zMax
  ) {

    for (
      const centre
      of tileCentres(
        z,
        length,
        spacing,
        zMin,
        zMax
      )
    ) {

      const tile =
        new THREE.Mesh(
          geometry,
          material
        );


      if (
        flat
      ) {

        tile.rotation.x =
          -Math.PI / 2;
      }


      tile.position.set(
        0,
        y,
        centre
      );


      tile.renderOrder =
        renderOrder;


      tile.visible =
        this.hazeEnabled;


      this.scene.add(
        tile
      );


      list.push(
        tile
      );
    }
  }


  clearTiles() {

    for (
      const list
      of [
        this.lowerTiles,
        this.upperTiles,
        this.horizonTiles
      ]
    ) {

      for (
        const tile
        of list
      ) {

        this.scene.remove(
          tile
        );
      }


      list.length =
        0;
    }
  }


  // ==================================================
  // SET LEVEL
  // ==================================================

  setLevel(level) {

    this.currentLevel =
      level;


    this.clearTiles();


    // Only Level 2 (midday on the motorway) has heat haze

    if (
      level === 2
    ) {

      const {
        zMin,
        zMax
      } =
        roadFor(
          level
        );


      this.hazeEnabled =
        true;


      this.buildTiles(
        this.lowerTiles,
        {
          geometry:
            this.lowerGeometry,

          material:
            this.heatHazeMaterial,

          renderOrder:
            4,

          y:
            LOWER_HAZE.y,

          z:
            LOWER_HAZE.z,

          length:
            LOWER_HAZE.length,

          spacing:
            LOWER_HAZE.length / 2,

          flat:
            true
        },
        zMin,
        zMax
      );


      this.buildTiles(
        this.upperTiles,
        {
          geometry:
            this.upperGeometry,

          material:
            this.upperHeatHazeMaterial,

          renderOrder:
            5,

          y:
            UPPER_HAZE.y,

          z:
            UPPER_HAZE.z,

          length:
            UPPER_HAZE.length,

          spacing:
            UPPER_HAZE.length / 2,

          flat:
            true
        },
        zMin,
        zMax
      );


      this.buildTiles(
        this.horizonTiles,
        {
          geometry:
            this.horizonGeometry,

          material:
            this.horizonHeatMaterial,

          renderOrder:
            6,

          y:
            HORIZON_HAZE.y,

          z:
            HORIZON_HAZE.z,

          length:
            0,

          spacing:
            HORIZON_HAZE.spacing,

          flat:
            false
        },
        zMin,
        zMax
      );


      this.setHeatHazeEnabled(
        true
      );


      return;
    }


    this.setHeatHazeEnabled(
      false
    );
  }


  // ==================================================
  // ENABLE / DISABLE
  // ==================================================

  
  // ==================================================
  // ENABLE / DISABLE
  // ==================================================

  setHeatHazeEnabled(enabled) {

    // Store whether the heat haze is active.
    this.hazeEnabled = enabled;

    // Show or hide every haze tile.
    for (const list of [
      this.lowerTiles,
      this.upperTiles,
      this.horizonTiles
    ]) {
      for (const tile of list) {
        tile.visible = enabled;
      }
    }

    // Reduced intensity prevents neighbouring lower tiles
    // from creating an excessively bright road surface.
    this.heatHazeMaterial.uniforms.uIntensity.value =
      enabled ? 0.70 : 0;

    // Keep the upper shimmer subtle so overlapping layers
    // blend naturally with the road.
    this.upperHeatHazeMaterial.uniforms.uIntensity.value =
      enabled ? 0.45 : 0;

    // The distant shimmer should remain faint.
    this.horizonHeatMaterial.uniforms.uIntensity.value =
      enabled ? 0.40 : 0;
  }



  // ==================================================
  // UPDATE
  // ==================================================

  update(elapsedTime) {

    this.heatHazeMaterial
      .uniforms
      .uTime
      .value =
        elapsedTime;


    this.upperHeatHazeMaterial
      .uniforms
      .uTime
      .value =
        elapsedTime *
        0.88;


    this.horizonHeatMaterial
      .uniforms
      .uTime
      .value =
        elapsedTime *
        1.15;


    // --------------------------------------------------
    // Small moving offsets make the two layers feel
    // slightly independent.
    // --------------------------------------------------

    const upperY =

      UPPER_HAZE.y +

      Math.sin(
        elapsedTime *
        1.7
      ) *

      0.025;


    for (
      const tile
      of this.upperTiles
    ) {

      tile.position.y =
        upperY;
    }


    const horizonY =

      HORIZON_HAZE.y +

      Math.sin(
        elapsedTime *
        1.2
      ) *

      0.08;


    for (
      const tile
      of this.horizonTiles
    ) {

      tile.position.y =
        horizonY;
    }
  }
}
