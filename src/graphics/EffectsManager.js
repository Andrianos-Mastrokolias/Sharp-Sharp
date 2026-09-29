import * as THREE from 'three';

import {
  createHeatHazeMaterial
} from '../shaders/HeatHazeShader.js';


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
    // HEAT HAZE MATERIAL
    // ==================================================

    this.heatHazeMaterial =
      createHeatHazeMaterial();


    this.heatHazeMaterial
      .uniforms
      .uIntensity
      .value =
        0;


    // ==================================================
    // LOWER ROAD HAZE
    // ==================================================
    //
    // This is the main shimmer layer.
    // ==================================================

    const lowerGeometry =
      new THREE.PlaneGeometry(

        16,

        240,

        40,

        120
      );


    this.lowerHeatHaze =
      new THREE.Mesh(

        lowerGeometry,

        this.heatHazeMaterial
      );


    this.lowerHeatHaze.rotation.x =
      -Math.PI / 2;


    this.lowerHeatHaze.position.set(

      0,

      0.13,

      -45
    );


    this.lowerHeatHaze.renderOrder =
      4;


    this.lowerHeatHaze.frustumCulled =
      false;


    this.scene.add(
      this.lowerHeatHaze
    );


    // ==================================================
    // UPPER HAZE LAYER
    // ==================================================
    //
    // A second softer layer gives the heat effect more
    // depth and makes it easier to see from chase view.
    // ==================================================

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


    const upperGeometry =
      new THREE.PlaneGeometry(

        15,

        210,

        32,

        100
      );


    this.upperHeatHaze =
      new THREE.Mesh(

        upperGeometry,

        this.upperHeatHazeMaterial
      );


    this.upperHeatHaze.rotation.x =
      -Math.PI / 2;


    this.upperHeatHaze.position.set(

      0,

      0.28,

      -40
    );


    this.upperHeatHaze.renderOrder =
      5;


    this.upperHeatHaze.frustumCulled =
      false;


    this.scene.add(
      this.upperHeatHaze
    );


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


    const horizonGeometry =
      new THREE.PlaneGeometry(

        18,

        7,

        50,

        20
      );


    this.horizonHeatHaze =
      new THREE.Mesh(

        horizonGeometry,

        this.horizonHeatMaterial
      );


    this.horizonHeatHaze.position.set(

      0,

      2.2,

      -95
    );


    this.horizonHeatHaze.renderOrder =
      6;


    this.horizonHeatHaze.frustumCulled =
      false;


    this.scene.add(
      this.horizonHeatHaze
    );


    // ==================================================
    // START DISABLED
    // ==================================================

    this.setHeatHazeEnabled(
      false
    );
  }


  // ==================================================
  // SET LEVEL
  // ==================================================

  setLevel(level) {

    this.currentLevel =
      level;


    // ----------------------------------------------
    // LEVEL 1
    // ----------------------------------------------

    if (
      level === 1
    ) {

      this.setHeatHazeEnabled(
        false
      );


      return;
    }


    // ----------------------------------------------
    // LEVEL 2
    // ----------------------------------------------

    if (
      level === 2
    ) {

      this.setHeatHazeEnabled(
        true
      );


      return;
    }


    // ----------------------------------------------
    // LEVEL 3
    // ----------------------------------------------

    if (
      level === 3
    ) {

      this.setHeatHazeEnabled(
        false
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

  setHeatHazeEnabled(
    enabled
  ) {

    this.lowerHeatHaze.visible =
      enabled;


    this.upperHeatHaze.visible =
      enabled;


    this.horizonHeatHaze.visible =
      enabled;


    this.heatHazeMaterial
      .uniforms
      .uIntensity
      .value =

        enabled
          ? 1.15
          : 0;


    this.upperHeatHazeMaterial
      .uniforms
      .uIntensity
      .value =

        enabled
          ? 0.75
          : 0;


    this.horizonHeatMaterial
      .uniforms
      .uIntensity
      .value =

        enabled
          ? 0.65
          : 0;
  }


  // ==================================================
  // UPDATE
  // ==================================================

  update(
    elapsedTime
  ) {

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

    this.upperHeatHaze.position.y =

      0.28 +

      Math.sin(
        elapsedTime *
        1.7
      ) *

      0.025;


    this.horizonHeatHaze.position.y =

      2.2 +

      Math.sin(
        elapsedTime *
        1.2
      ) *

      0.08;
  }
}