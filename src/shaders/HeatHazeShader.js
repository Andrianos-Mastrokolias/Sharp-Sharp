import * as THREE from 'three';


export function createHeatHazeMaterial() {

  return new THREE.ShaderMaterial({

    transparent: true,

    depthWrite: false,

    depthTest: true,

    side: THREE.DoubleSide,

    blending:
      THREE.AdditiveBlending,


    uniforms: {

      uTime: {
        value: 0
      },


      uIntensity: {
        value: 1
      },


      uColor: {
        value:
          new THREE.Color(
            0xfff1cf
          )
      }
    },


    vertexShader: `
      uniform float uTime;

      varying vec2 vUv;
      varying float vWave;


      void main() {

        vUv =
          uv;


        vec3 displaced =
          position;


        // --------------------------------------------
        // VERTICAL HEAT RIPPLE
        // --------------------------------------------

        float waveA =

          sin(
            position.z *
            0.45 +

            uTime *
            3.2
          );


        float waveB =

          sin(
            position.z *
            0.9 +

            position.x *
            1.4 -

            uTime *
            2.4
          );


        float waveC =

          sin(
            position.x *
            2.2 +

            uTime *
            1.8
          );


        float combinedWave =

          (
            waveA +
            waveB +
            waveC
          ) /

          3.0;


        displaced.y +=

          combinedWave *
          0.11;


        vWave =
          combinedWave;


        gl_Position =

          projectionMatrix *

          modelViewMatrix *

          vec4(
            displaced,
            1.0
          );
      }
    `,


    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;

      varying vec2 vUv;
      varying float vWave;


      float random(
        vec2 st
      ) {

        return fract(

          sin(

            dot(

              st,

              vec2(
                12.9898,
                78.233
              )
            )
          ) *

          43758.5453
        );
      }


      void main() {

        // --------------------------------------------
        // FADE AT ROAD EDGES
        // --------------------------------------------

        float centreFade =

          1.0 -

          abs(
            vUv.x -
            0.5
          ) *

          2.0;


        centreFade =

          clamp(
            centreFade,
            0.0,
            1.0
          );


        centreFade =

          pow(
            centreFade,
            0.65
          );


        // --------------------------------------------
        // FADE AT FRONT / BACK
        // --------------------------------------------

        float distanceFade =

          sin(
            vUv.y *
            3.14159265
          );


        distanceFade =

          clamp(
            distanceFade,
            0.0,
            1.0
          );


        // --------------------------------------------
        // HORIZONTAL SHIMMER BANDS
        // --------------------------------------------

        float bands =

          sin(

            vUv.y *
            120.0 +

            uTime *
            5.0 +

            vWave *
            4.0
          );


        bands =

          bands *
          0.5 +

          0.5;


        // --------------------------------------------
        // SECONDARY RIPPLE
        // --------------------------------------------

        float ripple =

          sin(

            vUv.x *
            30.0 -

            vUv.y *
            45.0 +

            uTime *
            3.0
          );


        ripple =

          ripple *
          0.5 +

          0.5;


        // --------------------------------------------
        // MOVING NOISE
        // --------------------------------------------

        vec2 noiseUv =

          vec2(

            floor(
              vUv.x *
              40.0
            ),

            floor(
              (
                vUv.y +
                uTime *
                0.05
              ) *
              80.0
            )
          );


        float noise =
          random(
            noiseUv
          );


        // --------------------------------------------
        // FINAL SHIMMER STRENGTH
        // --------------------------------------------

        float shimmer =

          bands *
          0.5 +

          ripple *
          0.3 +

          noise *
          0.2;


        // --------------------------------------------
        // FINAL ALPHA
        // --------------------------------------------

        float alpha =

          (
            0.035 +

            shimmer *
            0.055
          ) *

          centreFade *

          distanceFade *

          uIntensity;


        // --------------------------------------------
        // SLIGHT WARM TINT
        // --------------------------------------------

        vec3 finalColor =

          uColor *

          (
            0.75 +

            shimmer *
            0.35
          );


        gl_FragColor =

          vec4(

            finalColor,

            alpha
          );
      }
    `
  });
}