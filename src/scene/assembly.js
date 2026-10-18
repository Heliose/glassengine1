import * as THREE from 'three';
import { mergeByMaterial } from '../core/geo.js';

/* ------------------------------------------------------------------ *
 * An Assembly is a machine built from parts. Parts belong to a spool
 * (a rotating group) or sit static. Each part is merged into one mesh
 * per glass material, so the whole engine costs a dozen draws.
 *
 *   root  → frame (model yaw) → spools / static parts
 *
 * Responsibilities: spin, explode, cutaway planes, part visibility,
 * bounds, the hot-axis segment, and the list of glass meshes that the
 * caustics and picking systems consume.
 * ------------------------------------------------------------------ */

export class Assembly {
  constructor({ id, name, sub, blurb, materials }) {
    this.id = id;
    this.name = name;
    this.sub = sub;
    this.blurb = blurb;
    this.materials = materials; // role → GlassMaterial
    this.root = new THREE.Group();
    this.root.name = `assembly-${id}`;
    this.frame = new THREE.Group();
    this.root.add(this.frame);
    this.parts = new Map();
    this.spools = new Map();
    this.speeds = []; // [{ id, label }] — which speed sliders this model uses
    this.glowSegment = { a: new THREE.Vector3(), b: new THREE.Vector3() };
    this.glassMeshes = [];
    this.bounds = new THREE.Box3();
    this.center = new THREE.Vector3();
    this.radius = 1;
    this.explode = 0;
    this.thicknessScale = 1; // glass thickness in the state is in turbofan units; smaller machines scale it
    this.cut = {
      planes: [new THREE.Plane(), new THREE.Plane()],
      local: [new THREE.Plane(), new THREE.Plane()],
      parked: [new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4), new THREE.Plane(new THREE.Vector3(0, 1, 0), -1e4)],
    };
  }

  mat(role) {
    return this.materials[role].material;
  }

  /** Register a spool: a group rotating about `axis` (local), at `center`. */
  addSpool(id, { center = [0, 0, 0], axis = [0, 0, 1], speed = null, gear = null } = {}) {
    const group = new THREE.Group();
    group.name = `spool-${id}`;
    group.position.set(...center);
    this.frame.add(group);
    const s = { id, group, axis: new THREE.Vector3(...axis).normalize(), speed, gear, angle: 0 };
    this.spools.set(id, s);
    return s;
  }

  /**
   * Register a part. `build(group)` adds meshes to the group. `spool` is a spool id or null.
   * `explode` is the displacement (metres) at explode = 1. `cut` marks shells for the cutaway.
   */
  addPart(id, { name, spec = '', spool = null, explode = [0, 0, 0], cut = false, build }) {
    const group = new THREE.Group();
    group.name = `part-${id}`;
    const parent = spool ? this.spools.get(spool).group : this.frame;
    parent.add(group);
    build(group);
    mergeByMaterial(group);
    const part = { id, name, spec, spool, group, cut, visible: true, base: group.position.clone(), explode: new THREE.Vector3(...explode) };
    group.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.part = id;
      o.userData.role = o.material.userData.role;
      o.castShadow = true;
      o.receiveShadow = false;
      this.glassMeshes.push(o);
    });
    this.parts.set(id, part);
    return part;
  }

  /** Call once after every part is added. */
  finalize() {
    this.root.updateMatrixWorld(true);
    // bounds in frame space, at rest
    const box = new THREE.Box3();
    const inv = new THREE.Matrix4().copy(this.frame.matrixWorld).invert();
    const tmp = new THREE.Box3(), m = new THREE.Matrix4();
    for (const mesh of this.glassMeshes) {
      mesh.geometry.computeBoundingBox();
      m.multiplyMatrices(inv, mesh.matrixWorld);
      tmp.copy(mesh.geometry.boundingBox).applyMatrix4(m);
      box.union(tmp);
    }
    this.bounds.copy(box);
    box.getCenter(this.center);
    this.radius = box.getSize(new THREE.Vector3()).length() / 2;
    this.triangles = this.glassMeshes.reduce((n, mesh) => n + (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3, 0);
    return this;
  }

  /* ---------- motion ---------- */
  update(dt, speeds, level = 1) {
    for (const s of this.spools.values()) {
      if (s.gear) {
        const d = this.spools.get(s.gear.driver);
        s.angle = s.gear.phase + s.gear.ratio * d.angle;
      } else if (s.speed) {
        const w = speeds[s.speed] ?? 0;
        s.angle += w * level * dt;
      }
      s.group.quaternion.setFromAxisAngle(s.axis, s.angle);
    }
  }

  setExplode(k) {
    this.explode = k;
    for (const p of this.parts.values()) p.group.position.copy(p.base).addScaledVector(p.explode, k);
  }

  setVisible(id, v) {
    const p = this.parts.get(id);
    if (!p) return;
    p.visible = v;
    p.group.visible = v;
  }

  /**
   * Cutaway: a wedge of `amount` (0..1 → 0..180°) removed around the axis, centred at `rotDeg`
   * (0 = top). Shell parts are always cut; others only when `cutCore`.
   */
  setCutaway(amount, rotDeg, cutCore, materials) {
    const w = THREE.MathUtils.clamp(amount, 0, 1) * Math.PI;
    const rho = THREE.MathUtils.degToRad(rotDeg);
    const t1 = rho - w / 2, t2 = rho + w / 2;
    // planes through the axis; points with negative signed distance to BOTH are clipped
    this.cut.local[0].normal.set(-Math.cos(t1), Math.sin(t1), 0);
    this.cut.local[0].constant = 0;
    this.cut.local[1].normal.set(Math.cos(t2), -Math.sin(t2), 0);
    this.cut.local[1].constant = 0;
    this.cutActive = w > 0.001;
    this.cutCore = cutCore;
    // every role always carries two planes (one shared program); non-shell roles get a parked copy unless the core is cut
    for (const [role, gm] of Object.entries(materials)) {
      const planes = role === 'shell' || cutCore ? this.cut.planes : this.cut.parked;
      if (gm.material.clippingPlanes !== planes) {
        gm.material.clippingPlanes = planes;
        gm.material.clipIntersection = true;
        gm.material.clipShadows = true;
      }
    }
    this.updateCutPlanes();
  }

  /** World-space planes follow the turntable; call every frame when the cut is active. */
  updateCutPlanes() {
    const fm = this.frame.matrixWorld;
    for (let i = 0; i < 2; i++) {
      this.cut.planes[i].copy(this.cut.local[i]).applyMatrix4(fm);
      if (!this.cutActive) {
        // park the planes far away: the material keeps its program, nothing is clipped
        this.cut.planes[i].normal.set(0, 1, 0);
        this.cut.planes[i].constant = 1e4 * (i === 0 ? 1 : -1);
      }
    }
  }

  /** The hot-axis segment in world space (for the inner fire). */
  glowWorld(a, b) {
    a.copy(this.glowSegment.a).applyMatrix4(this.frame.matrixWorld);
    b.copy(this.glowSegment.b).applyMatrix4(this.frame.matrixWorld);
  }

  dispose() {
    for (const m of this.glassMeshes) m.geometry.dispose();
    this.root.removeFromParent();
  }
}
