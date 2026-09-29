import * as THREE from 'three';


export class SkyManager {

  constructor({
    scene,
    renderer
  }) {

    this.scene =
      scene;

    this.renderer =
      renderer;


    // ==================================================
    // SKY DOME
    // ==================================================

    this.skyMaterial =
      new THREE.ShaderMaterial({

        side:
          THREE.BackSide,

        depthWrite:
          false,

        fog:
          false,

        toneMapped:
          false,


        uniforms: {

          uTopColor: {
            value:
              new THREE.Color(
                0x3f91c9
              )
          },


          uHorizonColor: {
            value:
              new THREE.Color(
                0xc5dfeb
              )
          },


          uGroundColor: {
            value:
              new THREE.Color(
                0x9fb6bd
              )
          },


          uSunColor: {
            value:
              new THREE.Color(
                0xffe0a3
              )
          },


          uSunDirection: {
            value:
              new THREE.Vector3(
                -0.5,
                0.6,
                -0.4
              ).normalize()
          },


          uSunStrength: {
            value:
              0.55
          }
        },


        vertexShader: `
          varying vec3 vWorldDirection;

          void main() {

            vec4 worldPosition =
              modelMatrix *
              vec4(
                position,
                1.0
              );

            vWorldDirection =
              normalize(
                worldPosition.xyz -
                cameraPosition
              );

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
          uniform vec3 uTopColor;
          uniform vec3 uHorizonColor;
          uniform vec3 uGroundColor;

          uniform vec3 uSunColor;
          uniform vec3 uSunDirection;

          uniform float uSunStrength;

          varying vec3 vWorldDirection;


          void main() {

            vec3 direction =
              normalize(
                vWorldDirection
              );


            // ==========================================
            // SKY GRADIENT
            // ==========================================

            float height =
              direction.y;


            float skyAmount =
              smoothstep(
                -0.05,
                0.75,
                height
              );


            float horizonAmount =
              smoothstep(
                0.0,
                0.45,
                height
              );


            vec3 skyColor =
              mix(
                uHorizonColor,
                uTopColor,
                horizonAmount
              );


            // Slightly darker / greyer below horizon.

            skyColor =
              mix(
                uGroundColor,
                skyColor,
                skyAmount
              );


            // ==========================================
            // SUN GLOW
            // ==========================================

            float sunDot =
              max(
                dot(
                  direction,
                  normalize(
                    uSunDirection
                  )
                ),
                0.0
              );


            float sunDisc =
              pow(
                sunDot,
                900.0
              );


            float sunGlow =
              pow(
                sunDot,
                18.0
              );


            skyColor +=

              uSunColor *

              (
                sunDisc *
                0.9 +

                sunGlow *
                0.13
              ) *

              uSunStrength;


            // ==========================================
            // OUTPUT
            // ==========================================

            gl_FragColor =
              vec4(
                skyColor,
                1.0
              );
          }
        `
      });


    this.sky =
      new THREE.Mesh(

        new THREE.SphereGeometry(
          450,
          48,
          32
        ),

        this.skyMaterial
      );


    this.sky.frustumCulled =
      false;


    this.sky.renderOrder =
      -100;


    this.scene.add(
      this.sky
    );


    // ==================================================
    // STARS
    // ==================================================

    this.stars =
      this.createStars();


    this.scene.add(
      this.stars
    );


    this.stars.visible =
      false;


    // ==================================================
    // START
    // ==================================================

    this.setLevel(
      1
    );
  }


  // ==================================================
  // STARS
  // ==================================================

  createStars() {

    const count =
      1300;


    const positions =
      new Float32Array(
        count *
        3
      );


    for (
      let i = 0;
      i < count;
      i++
    ) {

      const radius =
        350;


      const theta =
        Math.random() *
        Math.PI *
        2;


      // Mostly upper hemisphere.

      const y =

        Math.random() *
        0.95 +
        0.05;


      const horizontalRadius =

        Math.sqrt(
          1 -
          y *
          y
        );


      const x =

        horizontalRadius *

        Math.cos(
          theta
        );


      const z =

        horizontalRadius *

        Math.sin(
          theta
        );


      positions[
        i *
        3
      ] =
        x *
        radius;


      positions[
        i *
        3 +
        1
      ] =
        y *
        radius;


      positions[
        i *
        3 +
        2
      ] =
        z *
        radius;
    }


    const geometry =
      new THREE.BufferGeometry();


    geometry.setAttribute(

      'position',

      new THREE.BufferAttribute(
        positions,
        3
      )
    );


    const material =
      new THREE.PointsMaterial({

        color:
          0xffffff,

        size:
          0.55,

        transparent:
          true,

        opacity:
          0.85,

        depthWrite:
          false,

        fog:
          false,

        toneMapped:
          false
      });


    const stars =
      new THREE.Points(

        geometry,

        material
      );


    stars.frustumCulled =
      false;


    return stars;
  }


  // ==================================================
  // LEVEL SWITCH
  // ==================================================

  setLevel(level) {

    if (
      level === 1
    ) {

      this.setLevel1();
      return;
    }


    if (
      level === 2
    ) {

      this.setLevel2();
      return;
    }


    if (
      level === 3
    ) {

      this.setLevel3();
      return;
    }


    this.setLevel1();
  }


  // ==================================================
  // LEVEL 1
  // CLEAR JOHANNESBURG DAY
  // ==================================================

  setLevel1() {

    this.sky.visible =
      true;


    this.stars.visible =
      false;


    this.skyMaterial.uniforms
      .uTopColor.value.set(
        0x378bc3
      );


    this.skyMaterial.uniforms
      .uHorizonColor.value.set(
        0xc0dce9
      );


    this.skyMaterial.uniforms
      .uGroundColor.value.set(
        0x98adb5
      );


    this.skyMaterial.uniforms
      .uSunColor.value.set(
        0xffdf9a
      );


    this.skyMaterial.uniforms
      .uSunDirection.value.set(
        -0.55,
        0.62,
        -0.35
      ).normalize();


    this.skyMaterial.uniforms
      .uSunStrength.value =
        0.55;
  }


  // ==================================================
  // LEVEL 2
  // HOT MIDDAY
  // ==================================================

  setLevel2() {

    this.sky.visible =
      true;


    this.stars.visible =
      false;


    // Slightly paler, hotter midday blue.

    this.skyMaterial.uniforms
      .uTopColor.value.set(
        0x55a7d1
      );


    this.skyMaterial.uniforms
      .uHorizonColor.value.set(
        0xd8e8ec
      );


    this.skyMaterial.uniforms
      .uGroundColor.value.set(
        0xb5c1bf
      );


    this.skyMaterial.uniforms
      .uSunColor.value.set(
        0xfff1c7
      );


    this.skyMaterial.uniforms
      .uSunDirection.value.set(
        -0.15,
        0.96,
        -0.15
      ).normalize();


    this.skyMaterial.uniforms
      .uSunStrength.value =
        0.75;
  }


  // ==================================================
  // LEVEL 3
  // LOAD SHEDDING NIGHT
  // ==================================================

  setLevel3() {

    this.sky.visible =
      true;


    this.stars.visible =
      true;


    this.skyMaterial.uniforms
      .uTopColor.value.set(
        0x020714
      );


    this.skyMaterial.uniforms
      .uHorizonColor.value.set(
        0x0a1730
      );


    this.skyMaterial.uniforms
      .uGroundColor.value.set(
        0x020307
      );


    // No visible sun.

    this.skyMaterial.uniforms
      .uSunStrength.value =
        0;
  }


  // ==================================================
  // UPDATE
  // ==================================================

  update(
    elapsedTime
  ) {

    // Keep the sky centred around the world origin.
    // Since the level is currently small this is enough.

    if (
      this.stars.visible
    ) {

      this.stars.rotation.y =

        elapsedTime *
        0.002;
    }
  }
}