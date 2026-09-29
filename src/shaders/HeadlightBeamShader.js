import * as THREE from 'three';


export function createHeadlightBeamMaterial() {

  return new THREE.ShaderMaterial({

    transparent: true,

    depthWrite: false,

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
            0xffedc2
          )
      }
    },


    vertexShader: `
      varying vec3 vLocalPosition;
      varying vec2 vUv;

      void main() {

        vLocalPosition =
          position;

        vUv =
          uv;


        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(
            position,
            1.0
          );
      }
    `,


    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;

      varying vec3 vLocalPosition;
      varying vec2 vUv;


      float hash(vec2 p) {

        return fract(
          sin(
            dot(
              p,
              vec2(
                127.1,
                311.7
              )
            )
          ) *
          43758.5453123
        );
      }


      void main() {

        // --------------------------------------------
        // EDGE FADE
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
            1.6
          );


        // --------------------------------------------
        // DISTANCE FADE
        // --------------------------------------------

        float lengthFade =

          1.0 -
          vUv.y;


        lengthFade =
          clamp(
            lengthFade,
            0.0,
            1.0
          );


        // --------------------------------------------
        // ANIMATED DUST / FOG
        // --------------------------------------------

        vec2 noiseUv =

          vec2(

            vLocalPosition.x *
            0.7 +

            uTime *
            0.12,


            vLocalPosition.y *
            0.7 -

            uTime *
            0.08
          );


        float noise =
          hash(
            floor(
              noiseUv *
              4.0
            )
          );


        noise =
          0.65 +
          noise *
          0.35;


        // --------------------------------------------
        // FINAL ALPHA
        // --------------------------------------------

        float alpha =

          centreFade *
          lengthFade *
          noise *
          0.22 *
          uIntensity;


        gl_FragColor =

          vec4(

            uColor,

            alpha
          );
      }
    `
  });
}