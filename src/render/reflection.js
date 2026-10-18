import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Planar reflection for the floor (y = 0): the scene rendered from the
 * mirrored camera into a mip-mapped texture the floor samples in screen
 * space. The floor itself sits on layer 1, which the mirror camera
 * cannot see. Ported from three's Reflector, but rendered explicitly
 * from the frame loop so it plays well with the composer and jitter.
 * ------------------------------------------------------------------ */
export class PlanarReflection {
  constructor(scale = 0.5) {
    this.scale = scale;
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      samples: 0,
    });
    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.enabled = true;
    this._w = 2; this._h = 2;
    this._normal = new THREE.Vector3(0, 1, 0);
    this._plane = new THREE.Plane();
    this._v = new THREE.Vector3(); this._t = new THREE.Vector3(); this._look = new THREE.Vector3(); this._rot = new THREE.Matrix4();
    this._clip = new THREE.Vector4(); this._q = new THREE.Vector4(); this._camPos = new THREE.Vector3(); this._origin = new THREE.Vector3();
  }
  setSize(w, h) {
    this._w = w; this._h = h;
    this.rt.setSize(Math.max(2, Math.round(w * this.scale)), Math.max(2, Math.round(h * this.scale)));
  }
  setScale(s) {
    this.scale = s;
    this.setSize(this._w, this._h);
  }
  render(renderer, scene, camera, floorY = 0, hidden = []) {
    if (!this.enabled) return;
    const n = this._normal, rc = this.camera;
    this._origin.set(0, floorY, 0);
    this._camPos.setFromMatrixPosition(camera.matrixWorld);
    this._v.subVectors(this._origin, this._camPos);
    if (this._v.dot(n) > 0) return; // camera below the floor: nothing to reflect
    this._v.reflect(n).negate().add(this._origin);
    this._rot.extractRotation(camera.matrixWorld);
    this._look.set(0, 0, -1).applyMatrix4(this._rot).add(this._camPos);
    this._t.subVectors(this._origin, this._look).reflect(n).negate().add(this._origin);
    rc.position.copy(this._v);
    rc.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    rc.lookAt(this._t);
    rc.near = camera.near; rc.far = camera.far;
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    rc.layers.mask = camera.layers.mask & ~(1 << 1);

    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);

    // oblique near plane: clip everything below the floor (Lengyel)
    this._plane.setFromNormalAndCoplanarPoint(n, this._origin).applyMatrix4(rc.matrixWorldInverse);
    const cp = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = rc.projectionMatrix, q = this._q;
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1;
    q.w = (1 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1 - 0.003; pm.elements[14] = cp.w;
    rc.projectionMatrixInverse.copy(pm).invert();

    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.xr.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    const vis = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, rc);
    hidden.forEach((o, i) => (o.visible = vis[i]));
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    renderer.shadowMap.autoUpdate = prevShadow;
  }
  dispose() {
    this.rt.dispose();
  }
}
