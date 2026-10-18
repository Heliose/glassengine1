import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ *
 * Geometry toolkit. Metres. Builders face +Z (intake forward), the
 * assembly axis is +Z, and everything is centred on the axis (y = 0).
 * ------------------------------------------------------------------ */

/* Box-projected UVs in local metres (every surface gets the same texel density). */
export function boxUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const n = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z; v = y; } else if (ay >= az) { u = x; v = z; } else { u = x; v = y; }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/* Create a mesh and add it to a parent */
export function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  if (opts.name) m.name = opts.name;
  if (opts.userData) Object.assign(m.userData, opts.userData);
  parent.add(m);
  return m;
}

export const box = (w, h, d) => boxUV(new THREE.BoxGeometry(w, h, d));
export const cyl = (rt, rb, h, seg = 32, open = false) => boxUV(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open));
export const sphere = (r, ws = 24, hs = 16) => boxUV(new THREE.SphereGeometry(r, ws, hs));
export const torus = (r, tube, rs = 12, ts = 64, arc = Math.PI * 2) => boxUV(new THREE.TorusGeometry(r, tube, rs, ts, arc));

/**
 * Lathe around the +Z axis. `profile` is a list of [radius, z] pairs; the surface is swept
 * through `seg` steps. The UV seam is placed at the bottom (−Y) so it is never seen first.
 */
export function latheZ(profile, seg = 96) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(0, r), z));
  const g = new THREE.LatheGeometry(pts, seg, Math.PI, Math.PI * 2);
  g.rotateX(Math.PI / 2); // lathe axis Y → +Z  (y → z, z → −y)
  g.computeVertexNormals();
  smoothSeams(g);
  return boxUV(g);
}

/** Cylinder along +Z (three's CylinderGeometry is along Y). */
export function cylZ(rt, rb, h, seg = 48, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.rotateX(Math.PI / 2);
  return boxUV(g);
}

/** A hollow tube (ring) along +Z: inner radius ri, outer ro, length h. Closed ends. */
export function tubeZ(ri, ro, h, seg = 64) {
  return latheZ([[ri, -h / 2], [ro, -h / 2], [ro, h / 2], [ri, h / 2], [ri, -h / 2]], seg);
}

/** Average normals of coincident vertices (removes the UV-seam lighting crease). */
export function smoothSeams(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let e = map.get(k);
    if (!e) map.set(k, (e = { x: 0, y: 0, z: 0, ids: [] }));
    e.x += nor.getX(i); e.y += nor.getY(i); e.z += nor.getZ(i);
    e.ids.push(i);
  }
  for (const e of map.values()) {
    if (e.ids.length < 2) continue;
    const l = Math.hypot(e.x, e.y, e.z) || 1;
    for (const i of e.ids) nor.setXYZ(i, e.x / l, e.y / l, e.z / l);
  }
  nor.needsUpdate = true;
  return geo;
}

/* ------------------------------------------------------------------ *
 * Airfoil blade loft.
 * Local frame: root at the origin, the blade points along +Y (radial),
 * +Z is axial (towards the intake), +X is circumferential. Stagger is the
 * angle between the chord and the axis: 0 = chord along the axis,
 * 90° = flat paddle. Returns a closed, smooth, watertight solid.
 * ------------------------------------------------------------------ */
export function bladeGeo({
  rHub = 0.3,
  rTip = 0.9,
  chordRoot = 0.3,
  chordTip = 0.26,
  staggerRoot = 0.55, // rad
  staggerTip = 1.05,
  camber = 0.06, // max camber as a fraction of chord
  thickness = 0.08, // max thickness as a fraction of chord
  sweep = 0.12, // aft (−z) offset of the chord centre at the tip, metres
  lean = 0.0, // circumferential offset of the tip, metres
  tipRound = 0.35, // how much the chord shrinks over the last 35 % of span
  stations = 10,
  points = 22, // around the airfoil (even)
  twistPower = 0.85,
} = {}) {
  const span = rTip - rHub;
  const S = stations, M = points;
  const pos = [], idx = [];
  // airfoil sample parameter: t in [0,1) around the loop (upper LE→TE then lower TE→LE)
  const half = M / 2;
  const foil = (k, c, cam, th) => {
    // k in [0, M): 0..half upper surface LE→TE, half..M lower surface TE→LE
    let xs, side;
    if (k <= half) { xs = k / half; side = 1; } else { xs = 1 - (k - half) / half; side = -1; }
    // cosine spacing packs points near the leading edge
    const x = 0.5 - 0.5 * Math.cos(Math.PI * xs);
    const p = 0.4;
    const yc = x < p ? (cam / (p * p)) * (2 * p * x - x * x) : (cam / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x);
    const yt = 5 * th * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1036 * x * x * x * x);
    return [(x - 0.42) * c, (yc + side * yt) * c]; // chordwise (from 42 % chord), normal to chord
  };
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const r = rHub + span * t;
    let c = chordRoot + (chordTip - chordRoot) * t;
    const tipT = Math.max(0, (t - (1 - tipRound)) / tipRound);
    c *= 1 - 0.55 * tipT * tipT; // rounded tip
    const stagger = staggerRoot + (staggerTip - staggerRoot) * Math.pow(t, twistPower);
    const zc = -sweep * Math.pow(t, 1.6);
    const xc = lean * t;
    const cs = Math.cos(stagger), sn = Math.sin(stagger);
    for (let k = 0; k < M; k++) {
      const [a, b] = foil(k, c, camber, thickness * (1 - 0.35 * t));
      // chord direction d = (sin ψ, 0, cos ψ) in (x, y, z); normal to chord in the plane n = (cos ψ, 0, −sin ψ)
      const x = xc + a * sn + b * cs;
      const z = zc + a * cs - b * sn;
      pos.push(x, r, z);
    }
  }
  for (let i = 0; i < S; i++) {
    for (let k = 0; k < M; k++) {
      const a = i * M + k, b = i * M + ((k + 1) % M), c2 = (i + 1) * M + k, d = (i + 1) * M + ((k + 1) % M);
      idx.push(a, c2, b, b, c2, d);
    }
  }
  // caps (root and tip fans)
  const cap = (ring, flip) => {
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < M; k++) { cx += pos[(ring * M + k) * 3]; cy += pos[(ring * M + k) * 3 + 1]; cz += pos[(ring * M + k) * 3 + 2]; }
    pos.push(cx / M, cy / M, cz / M);
    for (let k = 0; k < M; k++) {
      const a = ring * M + k, b = ring * M + ((k + 1) % M);
      if (flip) idx.push(base, b, a); else idx.push(base, a, b);
    }
  };
  cap(0, false);
  cap(S, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // orient: make the outward normal consistent (check one quad on the upper surface)
  return boxUV(g, 2);
}

/**
 * Place `count` copies of a geometry around the +Z axis (rotating about Z), merged into one.
 * `geo` must be modelled with its radial direction along +Y.
 */
export function ringArray(geo, count, { phase = 0, z = 0, tilt = 0 } = {}) {
  const parts = [];
  const m = new THREE.Matrix4(), rz = new THREE.Matrix4(), tz = new THREE.Matrix4().makeTranslation(0, 0, z), tx = new THREE.Matrix4().makeRotationY(tilt);
  for (let i = 0; i < count; i++) {
    const a = phase + (i / count) * Math.PI * 2;
    rz.makeRotationZ(a);
    m.copy(tz).multiply(rz).multiply(tx);
    const g = geo.clone();
    g.applyMatrix4(m);
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * Spur gear outline → extruded solid along +Z (centred). `module` is the tooth size in metres.
 * Teeth are drawn as rounded trapezoids, which read as gears and refract beautifully.
 */
export function gearGeo({ teeth = 24, module = 0.012, thickness = 0.06, bore = 0.02, hubR = 0, hubDepth = 0, pressure = 0.35, bevel = true } = {}) {
  const N = teeth, m = module;
  const rp = (m * N) / 2, ra = rp + m, rd = rp - 1.25 * m;
  const pitch = (Math.PI * 2) / N;
  const shape = new THREE.Shape();
  const pts = [];
  const tipHalf = pitch * 0.17, rootHalf = pitch * 0.32, flankR = (ra + rp) / 2;
  for (let i = 0; i < N; i++) {
    const a = i * pitch;
    // root segment → flank → tip → flank
    const seq = [
      [rd, a - pitch / 2 + rootHalf * 0.0],
      [rd, a - rootHalf],
      [rp - m * 0.15, a - rootHalf * 0.75],
      [flankR, a - (tipHalf + rootHalf) * 0.5],
      [ra, a - tipHalf],
      [ra, a + tipHalf],
      [flankR, a + (tipHalf + rootHalf) * 0.5],
      [rp - m * 0.15, a + rootHalf * 0.75],
      [rd, a + rootHalf],
    ];
    for (const [r, ang] of seq) pts.push(new THREE.Vector2(r * Math.cos(ang), r * Math.sin(ang)));
  }
  shape.setFromPoints(pts);
  shape.closePath();
  if (bore > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const bevelSize = bevel ? Math.min(m * 0.22, thickness * 0.2) : 0;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - 2 * bevelSize,
    bevelEnabled: bevel,
    bevelThickness: bevelSize,
    bevelSize: bevelSize * 0.9,
    bevelSegments: 2,
    curveSegments: 4,
  });
  g.translate(0, 0, -(thickness - 2 * bevelSize) / 2);
  g.computeVertexNormals();
  const out = [boxUV(g, 2)];
  if (hubR > 0 && hubDepth > 0) {
    out.push(tubeZ(bore, hubR, thickness + hubDepth * 2, 48));
  }
  const merged = out.length > 1 ? mergeGeometries(out, false) : out[0];
  merged.userData.gear = { teeth: N, module: m, rp, ra };
  return merged;
}

/**
 * Initial angle for gear 2 so its teeth mesh with gear 1 (whose tooth 0 sits at angle 0).
 * `phi` is the direction from gear 1's centre to gear 2's centre. Drive with
 * θ2 = phase − (N1 / N2) · θ1.
 */
export function gearPhase(phi, n1, n2) {
  return phi + Math.PI + (n1 / n2) * phi - Math.PI / n2;
}

/* ------------------------------------------------------------------ *
 * Merge every static mesh in a group into one mesh per
 * material + shadow flags + renderOrder. Revised version (indexed,
 * boundaries, winding fix, colour attribute handling).
 * ------------------------------------------------------------------ */
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), keep = [], remove = [];
  const visit = (o) => {
    for (const ch of [...o.children]) {
      if (ch.userData.mergeBoundary || ch.isLight || ch.userData.keep) { keep.push(ch); continue; }
      if (ch.isMesh) {
        if (ch.userData.noMerge || ch.isInstancedMesh || Array.isArray(ch.material) || !ch.visible) keep.push(ch);
        else {
          const key = `${ch.material.uuid}|${+ch.castShadow}${+ch.receiveShadow}|${ch.renderOrder}`;
          const g = ch.geometry.clone();
          for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
          if (!g.attributes.normal) g.computeVertexNormals();
          if (!g.attributes.uv) boxUV(g);
          if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld));
          if (ch.matrixWorld.determinant() < 0) {
            const ix = g.index.array;
            for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
          }
          if (!buckets.has(key)) buckets.set(key, { mat: ch.material, cast: ch.castShadow, recv: ch.receiveShadow, order: ch.renderOrder, geos: [], userData: { ...ch.userData } });
          buckets.get(key).geos.push(g);
          remove.push(ch);
        }
      }
      visit(ch);
      if (!ch.isMesh && !ch.userData.keep) remove.push(ch);
    }
  };
  visit(group);
  for (const k of keep) {
    if (k.parent !== group) {
      const m = new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld);
      k.parent.remove(k);
      m.decompose(k.position, k.quaternion, k.scale);
      group.add(k);
    }
  }
  for (const o of remove) o.parent?.remove(o);
  for (const b of buckets.values()) {
    const hasColor = b.geos.some((g) => g.attributes.color);
    for (const g of b.geos) {
      if (hasColor && !g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      if (!hasColor && g.attributes.color) g.deleteAttribute('color');
    }
    const geo = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    const m = new THREE.Mesh(geo, b.mat);
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.renderOrder = b.order;
    Object.assign(m.userData, b.userData);
    group.add(m);
  }
  return group;
}

/** Count triangles under an object (for the HUD / measurement). */
export function countTriangles(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry;
    n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  return Math.round(n);
}
