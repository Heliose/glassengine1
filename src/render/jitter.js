import * as THREE from 'three';
import { halton } from '../core/rng.js';

/* ------------------------------------------------------------------ *
 * Progressive refinement = many slightly different renders averaged.
 * Each refining frame jitters the camera by a sub-pixel offset (anti-
 * aliasing), moves it on a thin-lens aperture disc while shearing the
 * projection so the focus plane stays put (true depth of field), and
 * returns a disc sample for the key light (soft shadows + soft caustics).
 * ------------------------------------------------------------------ */

const _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _T = new THREE.Matrix4(), _S = new THREE.Matrix4(), _P = new THREE.Matrix4();

export class CameraJitter {
  constructor() {
    this.index = 0;
    this.saved = new THREE.Vector3();
    this.active = false;
    this.light = { x: 0, y: 0 };
  }
  reset() {
    this.index = 0;
  }
  /** Apply this frame's jitter. `w, h` are the drawing-buffer size in pixels. */
  apply(camera, w, h, { aa = true, aperture = 0, focus = 5 } = {}) {
    const i = ++this.index;
    const ax = aa ? halton(i, 2) - 0.5 : 0, ay = aa ? halton(i, 3) - 0.5 : 0;
    const r = Math.sqrt(halton(i, 5)), th = Math.PI * 2 * halton(i, 7);
    const dx = r * Math.cos(th) * aperture, dy = r * Math.sin(th) * aperture;
    const r2 = Math.sqrt(halton(i, 11)), t2 = Math.PI * 2 * halton(i, 13);
    this.light.x = r2 * Math.cos(t2);
    this.light.y = r2 * Math.sin(t2);

    this.saved.copy(camera.position);
    this.active = true;
    camera.updateMatrixWorld();
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position.addScaledVector(_right, dx).addScaledVector(_up, dy);
    camera.updateMatrixWorld();

    camera.updateProjectionMatrix();
    _P.copy(camera.projectionMatrix);
    _S.identity();
    _S.elements[8] = -dx / Math.max(focus, 0.05); // x' = x + S02·z → the focus plane projects where it did
    _S.elements[9] = -dy / Math.max(focus, 0.05);
    _T.makeTranslation((2 * ax) / w, (2 * ay) / h, 0);
    camera.projectionMatrix.copy(_T).multiply(_P).multiply(_S);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    return this.light;
  }
  /** Put the camera back after rendering. */
  restore(camera) {
    if (!this.active) return;
    camera.position.copy(this.saved);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    this.active = false;
  }
}

/** Detects camera motion between frames (compare before jittering). */
export class CameraTracker {
  constructor() {
    this.prev = new Float64Array(19);
    this.first = true;
  }
  changed(camera, eps = 1e-7) {
    const e = camera.matrixWorld.elements;
    let d = 0;
    for (let i = 0; i < 16; i++) {
      d = Math.max(d, Math.abs(e[i] - this.prev[i]));
      this.prev[i] = e[i];
    }
    const extra = [camera.fov, camera.aspect, camera.zoom];
    for (let i = 0; i < 3; i++) {
      d = Math.max(d, Math.abs(extra[i] - this.prev[16 + i]));
      this.prev[16 + i] = extra[i];
    }
    if (this.first) {
      this.first = false;
      return true;
    }
    return d > eps;
  }
}
