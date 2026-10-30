import * as THREE from 'three';

// Speed lines: thin streaks that rush outward from the middle of
// the screen when the taxi is fast. Drawn on a quad in front of
// the camera (main.js), so its uv covers the whole view.
export function createSpeedLinesMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,

    uniforms: {
      // Seconds of driving; scrolls the streaks outward.
      uTime: { value: 0 },
      // 0 = no lines, 1 = full strength (eased from the speed in main.js).
      uSpeed: { value: 0 }
    },

    vertexShader: `
      varying vec2 vUv;

      void main() {
        // Hand the quad's uv (0..1 across the screen) to the fragment shader.
        vUv = uv;

        gl_Position =
          projectionMatrix *
          modelViewMatrix *
          vec4(position, 1.0);
      }
    `,

    fragmentShader: `
      uniform float uTime;
      uniform float uSpeed;

      varying vec2 vUv;

      // Pseudo-random 0..1 for a number (common GLSL hash).
      float hash(float n) {
        return fract(sin(n) * 43758.5453);
      }

      void main() {
        // 1. Centre the uv, so (0, 0) is the middle of the screen,
        //    then switch to polar coordinates.
        vec2 p = vUv - 0.5;
        float angle = atan(p.y, p.x);   // -PI..PI around the centre
        float radius = length(p);       // 0 in the middle, ~0.7 in the corners

        // 2. Cut the circle into 120 slices (0..120 around it).
        float around = (angle / 6.2831853 + 0.5) * 120.0;
        float slice = floor(around);

        // The hash gives each slice a fixed random number; about
        // one slice in four gets a streak.
        float lit = step(0.75, hash(slice));

        // Thin line: bright in the middle of its slice, gone at the sides.
        float across = abs(fract(around) - 0.5) * 2.0;
        float thin = 1.0 - smoothstep(0.2, 0.7, across);

        // 3. Scroll outward: radius grows outward, time pulls the
        //    pattern along it. Each slice starts at its own offset.
        float dash = fract(radius * 4.0 - uTime * 3.0 + hash(slice + 17.0));

        // Keep a short dash (the first 30% of each cycle), brightest
        // at its outer end.
        float streak = lit * thin * step(dash, 0.3) * smoothstep(0.0, 0.3, dash);

        // 4. Clear centre (radius < 0.28), strongest at the edges.
        float edge = smoothstep(0.28, 0.65, radius);

        // 5. Strength follows the speed; never more than 0.35.
        float alpha = streak * edge * clamp(uSpeed, 0.0, 1.0) * 0.35;

        // Near-white cream, #F4F4EE.
        gl_FragColor = vec4(0.957, 0.957, 0.933, alpha);
      }
    `
  });
}
