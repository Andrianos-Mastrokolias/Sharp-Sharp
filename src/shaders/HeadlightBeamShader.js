
import * as THREE from 'three';

export function createHeadlightBeamMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,

    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uColor: {
        value: new THREE.Color(0xffeac8)
      }
    },

    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        vUv = uv;
        vPosition = position;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;

      varying vec2 vUv;
      varying vec3 vPosition;

      void main() {
        // UV X: centre of beam = 0.5.
        // UV Y: headlight = 0, far end = 1.

        float sideDistance = abs(vUv.x - 0.5) * 2.0;

        // Soft symmetrical edges.
        float edgeFade =
          1.0 - smoothstep(0.0, 1.0, sideDistance);

        edgeFade = pow(edgeFade, 1.8);

        // Beam fades in just outside the lamp.
        float nearFade =
          smoothstep(0.0, 0.12, vUv.y);

        // Dissipates gradually before the far end.
        float farFade =
          1.0 - smoothstep(0.08, 1.0, vUv.y);

        // Very slight atmospheric variation.
        float atmosphere =
          0.96 +
          0.04 * sin(
            uTime * 1.5 + vPosition.z * 0.5
          );

        float alpha =
          edgeFade *
          nearFade *
          farFade *
          atmosphere *
          0.035 *
          clamp(uIntensity, 0.0, 1.2);

        gl_FragColor = vec4(
          uColor,
          clamp(alpha, 0.0, 1.0)
        );
      }
    `
  });
}
