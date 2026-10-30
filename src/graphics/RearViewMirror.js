
import * as THREE from 'three';

export class RearViewMirror {
  constructor({ scene, renderer, taxi }) {
    this.scene = scene;
    this.renderer = renderer;
    this.taxi = taxi;
    this.enabled = false;
    // The mirror renders everything except objects on layer 1.
this.cameraDustLayer = 1;

    // Independent camera looking toward the rear (+Z).
    this.camera = new THREE.PerspectiveCamera(
      70,
      3,
      0.1,
      350
    );
    // Mirror only renders the default scene layer.
this.camera.layers.set(0);

    // Reusable vectors avoid allocations each frame.
    this.offset = new THREE.Vector3(0, 2.75, 3.8);
    this.backward = new THREE.Vector3(0, 0, 1);
    this.position = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.target = new THREE.Vector3();

    this.oldViewport = new THREE.Vector4();
    this.oldScissor = new THREE.Vector4();
    this.drawingBufferSize = new THREE.Vector2();

    // HTML frame around the rendered mirror.
    this.frame = document.createElement('div');
    this.frame.setAttribute('aria-label', 'Rear-view mirror');
    Object.assign(this.frame.style, {
      position: 'fixed',
      top: '14px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '280px',
      maxWidth: '40vw',
      height: '94px',
      boxSizing: 'border-box',
      border: '4px solid #242424',
      borderRadius: '10px',
      boxShadow: '0 5px 12px #0009',
      pointerEvents: 'none',
      zIndex: '20',
      display: 'none'
    });

    document.body.appendChild(this.frame);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.frame.style.display = this.enabled ? 'block' : 'none';
  }

  updateCamera() {
    // Taxi faces -Z, so +Z points behind it.
    this.position.copy(this.offset)
      .applyQuaternion(this.taxi.quaternion)
      .add(this.taxi.position);

    this.direction.copy(this.backward)
      .applyQuaternion(this.taxi.quaternion);

    this.target.copy(this.position)
      .addScaledVector(this.direction, 30);

    this.camera.position.copy(this.position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);

    // Match the current level's visibility range.
    if (this.scene.fog) {
      this.camera.far = Math.min(350, this.scene.fog.far + 40);
    }
    this.camera.updateProjectionMatrix();
  }

  render() {
    if (!this.enabled) return;

    const canvasRect =
      this.renderer.domElement.getBoundingClientRect();
    const mirrorRect = this.frame.getBoundingClientRect();

    if (!canvasRect.width || !canvasRect.height) return;

    this.renderer.getDrawingBufferSize(this.drawingBufferSize);

    const scaleX = this.drawingBufferSize.x / canvasRect.width;
    const scaleY = this.drawingBufferSize.y / canvasRect.height;

    // Convert CSS coordinates to WebGL viewport coordinates.
    const x = Math.round(
      (mirrorRect.left - canvasRect.left + 4) * scaleX
    );
    const y = Math.round(
      (canvasRect.bottom - mirrorRect.bottom + 4) * scaleY
    );
    const width = Math.round(
      (mirrorRect.width - 8) * scaleX
    );
    const height = Math.round(
      (mirrorRect.height - 8) * scaleY
    );

    if (width <= 0 || height <= 0) return;

    this.camera.aspect = width / height;
    this.updateCamera();

    // Save renderer state before rendering a second view.
    this.renderer.getViewport(this.oldViewport);
    this.renderer.getScissor(this.oldScissor);
    const oldScissorTest = this.renderer.getScissorTest();
    const oldAutoUpdate = this.renderer.shadowMap.autoUpdate;

    // Shadows are already prepared during the main render.
    this.renderer.shadowMap.autoUpdate = false;

    try {
      this.renderer.setViewport(x, y, width, height);
      this.renderer.setScissor(x, y, width, height);
      this.renderer.setScissorTest(true);

      // Render the scene into the mirror's screen rectangle.
      this.renderer.render(this.scene, this.camera);
    } finally {
      // Restore settings for normal gameplay rendering.
      this.renderer.setViewport(this.oldViewport);
      this.renderer.setScissor(this.oldScissor);
      this.renderer.setScissorTest(oldScissorTest);
      this.renderer.shadowMap.autoUpdate = oldAutoUpdate;
    }
  }

  dispose() {
    this.frame.remove();
  }
}
