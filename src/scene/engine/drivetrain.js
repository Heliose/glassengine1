import * as THREE from 'three';
import { Assembly } from '../assembly.js';
import { gearGeo, gearPhase, ringArray, box, torus, sphere } from '../../core/geo.js';
import { add, latheZ, tubeZ, cylZ, flange, beadRing, canRing, shellProfile } from './parts.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ *
 * An EV drive unit: permanent-magnet motor, two-stage reduction gear
 * train, open differential with half-shafts, and the inverter on top.
 * Built with shafts along local +Z, then yawed so they run across the
 * stage (world X).
 * ------------------------------------------------------------------ */

export function buildDrivetrain(materials) {
  const A = new Assembly({
    id: 'drivetrain',
    name: 'EV Drive Unit',
    sub: 'Permanent-magnet motor · two-stage reduction · open differential',
    materials,
  });
  const M = (role) => A.mat(role);
  A.frame.rotation.y = -Math.PI / 2;
  A.thicknessScale = 0.35;
  A.speeds = [{ id: 'fan', label: 'Motor' }];

  // gear train geometry
  const m = 0.011;
  const N1 = 17, N2 = 57, N3 = 21, N4 = 73;
  const rp = (n) => (m * n) / 2;
  const a1 = -0.55; // direction pinion → intermediate (angle from +X in the XY plane)
  const C2 = new THREE.Vector2(Math.cos(a1), Math.sin(a1)).multiplyScalar(rp(N1) + rp(N2));
  const a2 = 0.38; // intermediate → output
  const C4 = C2.clone().add(new THREE.Vector2(Math.cos(a2), Math.sin(a2)).multiplyScalar(rp(N3) + rp(N4)));

  A.addSpool('rotor', { speed: 'fan' });
  A.addSpool('inter', { center: [C2.x, C2.y, 0], gear: { driver: 'rotor', ratio: -N1 / N2, phase: gearPhase(a1, N1, N2) } });
  A.addSpool('output', { center: [C4.x, C4.y, 0], gear: { driver: 'inter', ratio: -N3 / N4, phase: gearPhase(a2, N3, N4) } });

  A.glowSegment.a.set(0, 0, -0.24);
  A.glowSegment.b.set(0, 0, 0.24);

  /* ---- motor housing (shell) ---- */
  A.addPart('housing', {
    name: 'Motor housing',
    spec: 'cast shell · 28 cooling fins',
    cut: true,
    explode: [0, 0, -0.9],
    build: (g) => {
      add(g, tubeZ(0.3, 0.318, 0.56, 112), M('shell'));
      // end bells
      add(g, latheZ(shellProfile([[0.06, -0.33], [0.2, -0.3], [0.3, -0.28]], 0.02), 96), M('shell'));
      add(g, latheZ(shellProfile([[0.3, 0.28], [0.22, 0.3], [0.08, 0.31]], 0.02), 96), M('shell'));
      const fin = box(0.012, 0.055, 0.5).translate(0, 0.345, 0);
      add(g, ringArray(fin, 28, {}), M('detail'));
      fin.dispose();
      flange(g, M('detail'), 0.33, 0.016, -0.27);
      flange(g, M('detail'), 0.33, 0.016, 0.27);
      beadRing(g, M('detail'), 0.33, 16, 0.3, 0.018, Math.PI / 16);
      beadRing(g, M('detail'), 0.33, 16, -0.3, 0.018, Math.PI / 16);
    },
  });

  /* ---- stator: laminated ring with 48 teeth, copper end windings (hot) ---- */
  A.addPart('stator', {
    name: 'Stator',
    spec: '48 slots · hairpin windings',
    explode: [0, 0, -0.45],
    build: (g) => {
      add(g, tubeZ(0.235, 0.272, 0.42, 112), M('secondary'));
      const tooth = box(0.017, 0.07, 0.42).translate(0, 0.2, 0);
      add(g, ringArray(tooth, 48, {}), M('secondary'));
      tooth.dispose();
      // end windings: loops standing in the radial–axial plane
      const coil = torus(0.034, 0.011, 10, 28);
      coil.rotateY(Math.PI / 2);
      const front = coil.clone().translate(0, 0.205, 0.235), back = coil.clone().translate(0, 0.205, -0.235);
      add(g, ringArray(front, 24, {}), M('hot'));
      add(g, ringArray(back, 24, { phase: Math.PI / 24 }), M('hot'));
      coil.dispose(); front.dispose(); back.dispose();
      flange(g, M('hot'), 0.25, 0.009, 0.285);
      flange(g, M('hot'), 0.25, 0.009, -0.285);
    },
  });

  /* ---- rotor + shaft + pinion (spool rotor) ---- */
  A.addPart('rotor', {
    name: 'Rotor',
    spec: '8-pole permanent magnets',
    spool: 'rotor',
    explode: [0, 0, 0.0],
    build: (g) => {
      add(g, cylZ(0.165, 0.165, 0.4, 96), M('primary'));
      const mag = box(0.1, 0.014, 0.37).translate(0, 0.146, 0);
      add(g, ringArray(mag, 8, { phase: Math.PI / 8 }), M('detail'));
      mag.dispose();
      add(g, tubeZ(0.04, 0.167, 0.012, 96).translate(0, 0, 0.205), M('detail'));
      add(g, tubeZ(0.04, 0.167, 0.012, 96).translate(0, 0, -0.205), M('detail'));
      add(g, cylZ(0.036, 0.036, 1.3, 40).translate(0, 0, 0.3), M('detail'));
    },
  });
  A.addPart('pinion', {
    name: 'Input pinion',
    spec: `${N1} teeth · module ${(m * 1000).toFixed(0)} mm`,
    spool: 'rotor',
    explode: [0, 0, 0.3],
    build: (g) => add(g, gearGeo({ teeth: N1, module: m, thickness: 0.07, bore: 0.036 }).translate(0, 0, 0.58), M('drive')),
  });

  /* ---- intermediate gear + pinion (spool inter) ---- */
  A.addPart('intermediate', {
    name: 'Intermediate gears',
    spec: `${N2} + ${N3} teeth · ratio ${(N2 / N1).toFixed(2)}`,
    spool: 'inter',
    explode: [0, 0, 0.3],
    build: (g) => {
      add(g, gearGeo({ teeth: N2, module: m, thickness: 0.06, bore: 0.035 }).translate(0, 0, 0.58), M('drive'));
      add(g, gearGeo({ teeth: N3, module: m, thickness: 0.07, bore: 0.035 }).translate(0, 0, 0.69), M('drive'));
      add(g, cylZ(0.035, 0.035, 0.42, 32).translate(0, 0, 0.62), M('detail'));
    },
  });

  /* ---- output gear + differential + half-shafts (spool output) ---- */
  A.addPart('output', {
    name: 'Final drive',
    spec: `${N4} teeth · overall ${((N2 / N1) * (N4 / N3)).toFixed(2)}:1`,
    spool: 'output',
    explode: [0, 0, 0.3],
    build: (g) => add(g, gearGeo({ teeth: N4, module: m, thickness: 0.06, bore: 0.06 }).translate(0, 0, 0.69), M('drive')),
  });
  A.addPart('differential', {
    name: 'Differential & half-shafts',
    spec: 'open differential · CV joints',
    spool: 'output',
    explode: [0, 0, 0.0],
    build: (g) => {
      add(g, latheZ([[0.06, 0.73], [0.17, 0.76], [0.19, 0.86], [0.17, 0.97], [0.06, 1.0], [0.06, 0.73]], 72), M('detail'));
      add(g, cylZ(0.03, 0.03, 2.35, 32).translate(0, 0, 0.42), M('detail'));
      for (const z of [-0.68, 1.52]) add(g, latheZ([[0.03, z - 0.1], [0.075, z - 0.06], [0.078, z + 0.06], [0.03, z + 0.1], [0.03, z - 0.1]], 48), M('detail'));
      beadRing(g, M('detail'), 0.14, 12, 0.74, 0.013);
    },
  });

  /* ---- gearbox housing: thin walls around the gear train + end plates (shell) ---- */
  A.addPart('gearcase', {
    name: 'Gear case',
    spec: 'open frame · flanged rims',
    cut: true,
    explode: [0, 0, 0.75],
    build: (g) => {
      const circles = [
        [0, 0, rp(N1) + m + 0.05], [C2.x, C2.y, rp(N2) + m + 0.05], [C4.x, C4.y, rp(N4) + m + 0.05],
      ];
      const hull = hullOfCircles(circles, 0);
      const inner = hullOfCircles(circles, -0.03);
      const shape = new THREE.Shape(hull);
      shape.holes.push(new THREE.Path(inner.slice().reverse()));
      // an open frame: perimeter wall plus two flanged rims, so the gear train stays in view
      const wall = new THREE.ExtrudeGeometry(shape, { depth: 0.26, bevelEnabled: false, curveSegments: 12 });
      wall.translate(0, 0, 0.5);
      wall.computeVertexNormals();
      add(g, wall, M('shell'));
      const rimShape = new THREE.Shape(hullOfCircles(circles, 0.03));
      rimShape.holes.push(new THREE.Path(hullOfCircles(circles, -0.06).reverse()));
      for (const z of [0.48, 0.76]) {
        const rim = new THREE.ExtrudeGeometry(rimShape, { depth: 0.02, bevelEnabled: false, curveSegments: 12 });
        rim.translate(0, 0, z);
        rim.computeVertexNormals();
        add(g, rim, M('detail'));
      }
    },
  });

  /* ---- inverter on top (shell box + hot internals) ---- */
  A.addPart('inverter', {
    name: 'Inverter',
    spec: 'DC-link capacitors · busbars · power stage',
    cut: true,
    explode: [0, 0.6, 0],
    build: (g) => {
      const y = 0.46;
      add(g, boxShell(0.5, 0.15, 0.42, 0.012).translate(0, y, 0), M('shell'));
      add(g, box(0.46, 0.006, 0.38).translate(0, y - 0.055, 0), M('detail'));
      const cap = new THREE.CylinderGeometry(0.034, 0.034, 0.085, 28);
      const caps = [];
      for (let i = 0; i < 6; i++) caps.push(cap.clone().translate(-0.17 + i * 0.068, y - 0.005, -0.1));
      add(g, mergeGeometries(caps, false), M('hot'));
      cap.dispose();
      for (let i = 0; i < 3; i++) add(g, box(0.42, 0.006, 0.03).translate(0, y - 0.03 + i * 0.012, 0.08 + i * 0.045), M('hot'));
      beadRing(g, M('detail'), 0.215, 10, y + 0.08, 0.012);
    },
  });

  return A.finalize();
}

/** Convex hull of the union of circles (as a polygon of THREE.Vector2), offset by `inset`. */
function hullOfCircles(circles, inset) {
  const pts = [];
  for (const [x, y, r] of circles) {
    const rr = r + inset;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector2(x + rr * Math.cos(a), y + rr * Math.sin(a)));
    }
  }
  // Andrew's monotone chain
  pts.sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

/** A hollow box shell (six thin walls) centred on the origin. */
function boxShell(w, h, d, t) {
  const parts = [
    box(w, t, d).translate(0, h / 2 - t / 2, 0),
    box(w, t, d).translate(0, -h / 2 + t / 2, 0),
    box(t, h - 2 * t, d).translate(w / 2 - t / 2, 0, 0),
    box(t, h - 2 * t, d).translate(-w / 2 + t / 2, 0, 0),
    box(w - 2 * t, h - 2 * t, t).translate(0, 0, d / 2 - t / 2),
    box(w - 2 * t, h - 2 * t, t).translate(0, 0, -d / 2 + t / 2),
  ];
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}
