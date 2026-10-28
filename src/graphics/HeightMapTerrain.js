
import * as THREE from 'three';

/**
 * Create terrain by displacing a grid of vertices
 * using a procedurally generated grayscale height map.
 *
 * Black (0) = minimum height.
 * White (255) = maximum height.
 */
export function createHeightMapTerrain({
  width = 54,
  depth = 90,
  segments = 32,
  maxHeight = 5
} = {}) {
  const size = segments + 1;

  // Each byte represents one grayscale height-map pixel.
  const heightMap = new Uint8Array(size * size);

  // Create a deterministic grayscale height map.
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const u = col / segments;
      const v = row / segments;

      // Two hills of different sizes and positions.
      const hill1 = Math.exp(
        -(
          ((u - 0.35) ** 2) / 0.035 +
          ((v - 0.42) ** 2) / 0.055
        )
      );

      const hill2 = 0.7 * Math.exp(
        -(
          ((u - 0.72) ** 2) / 0.025 +
          ((v - 0.65) ** 2) / 0.045
        )
      );

      // Small terrain variation.
      const detail =
        0.08 * Math.sin(u * Math.PI * 9) *
        Math.cos(v * Math.PI * 7);

      // Smoothly return to ground level at the edges.
      const edgeFade =
        Math.sin(Math.PI * u) ** 2 *
        Math.sin(Math.PI * v) ** 2;

      const height = THREE.MathUtils.clamp(
        (hill1 + hill2 + detail) * edgeFade,
        0,
        1
      );

      heightMap[row * size + col] =
        Math.round(height * 255);
    }
  }

  // Create the subdivided terrain mesh.
  const geometry = new THREE.PlaneGeometry(
    width,
    depth,
    segments,
    segments
  );

  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  const colours = [];

  const lowColour = new THREE.Color(0x52663b);
  const highColour = new THREE.Color(0x8a8769);
  const colour = new THREE.Color();

  // Apply the height-map values to the mesh vertices.
  for (let i = 0; i < positions.count; i++) {
    const grayscale = heightMap[i] / 255;
    const elevation = grayscale * maxHeight;

    // Displace the vertex vertically.
    positions.setY(i, elevation);

    // Subtle elevation-based terrain colouring.
    colour.copy(lowColour).lerp(highColour, grayscale);
    colours.push(colour.r, colour.g, colour.b);
  }

  geometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colours, 3)
  );

  // Recalculate normals for physically correct lighting.
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.FrontSide
  });

  const terrain = new THREE.Mesh(geometry, material);

  terrain.name = 'HeightMapTerrain';

  // Existing grass ground has a top surface at y = -0.1.
  terrain.position.y = -0.09;
  terrain.receiveShadow = true;
  terrain.castShadow = false;

  // Retain the generated height map for inspection.
  terrain.userData.heightMap = {
    width: size,
    height: size,
    pixels: heightMap,
    maxHeight
  };

  return terrain;
}
