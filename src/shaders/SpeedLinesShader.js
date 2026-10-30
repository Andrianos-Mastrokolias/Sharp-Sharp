import * as THREE from 'three';

// Speed lines: thin streaks that rush outward from the middle of
// the screen when the taxi is fast. Plus a police siren: red and
// blue light flashing at the screen edges while you are chased.
// Both are drawn on one quad in front of the camera (main.js), so
// its uv covers the whole view and it is a single draw call.
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
      uSpeed: { value: 0 },
      // 0 = no siren, 1 = full (eased from the pursuit pressure in main.js).
      uPursuit: { value: 0 }
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
      uniform float uPursuit;

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
        vec3 lineColour = vec3(0.957, 0.957, 0.933);

        // ---------- Police siren at the screen edges ----------

        // 6. Edge glow from the same centred radius: 0 in the middle
        //    (radius < 0.30), rising to 1 at the screen edges (0.55+).
        float glow = smoothstep(0.30, 0.55, radius);

        // 7. Red on the left half of the screen, blue on the right.
        float left = 1.0 - step(0.5, vUv.x);        // 1 on the left, 0 on the right
        vec3 red = vec3(1.0, 0.12, 0.12);
        vec3 blue = vec3(0.15, 0.35, 1.0);
        vec3 sirenColour = mix(blue, red, left);

        // 8. Swap the lit side twice a second: flash is 1 for the first
        //    half of every 0.5 s, then 0. Left is lit when flash is 1,
        //    right when it is 0. (Its own name: "lit" is the streak slice.)
        float flash = step(0.5, fract(uTime * 2.0));
        float sideLit = flash * left + (1.0 - flash) * (1.0 - left);

        // 9. Siren strength follows the pursuit; never more than 0.35.
        float sirenAlpha = glow * sideLit * clamp(uPursuit, 0.0, 1.0) * 0.35;

        // 10. Add the siren to the speed lines: colours blend by their
        //     alphas, so with no siren the lines are unchanged.
        float total = alpha + sirenAlpha;
        vec3 colour = total > 0.0
          ? (lineColour * alpha + sirenColour * sirenAlpha) / total
          : lineColour;

        gl_FragColor = vec4(colour, min(total, 1.0));
      }
    `
  });
}
