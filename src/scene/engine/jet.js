import * as THREE from 'three';
import { Assembly } from '../assembly.js';
import { add, latheZ, tubeZ, cylZ, stage, flange, beadRing, strutRing, canRing, spinnerProfile, shellProfile } from './parts.js';

/* ------------------------------------------------------------------ *
 * A high-bypass turbofan, twin spool. Axis +Z, intake at +Z.
 * Length ≈ 3.9 m, fan diameter 1.72 m. Everything is glass; the role
 * of each piece decides which GlassMaterial it wears.
 * ------------------------------------------------------------------ */

export function buildJet(materials) {
  const A = new Assembly({
    id: 'jet',
    name: 'Turbofan',
    sub: 'High-bypass turbofan · 22-blade fan · twin spool',
    materials,
  });
  const M = (role) => A.mat(role);

  A.addSpool('lp', { speed: 'fan' });
  A.addSpool('hp', { speed: 'core' });
  A.speeds = [
    { id: 'fan', label: 'Fan & LP spool' },
    { id: 'core', label: 'HP spool' },
  ];
  A.glowSegment.a.set(0, 0, -0.32);
  A.glowSegment.b.set(0, 0, -0.78);

  /* ---- nacelle: one closed profile — outer skin forward, around the lip, inner duct back ---- */
  A.addPart('nacelle', {
    name: 'Nacelle',
    spec: 'inlet cowl · fan case · bypass duct',
    cut: true,
    explode: [0, 0, 0.75],
    build: (g) => {
      const prof = [
        [0.9, -0.8], [0.96, -0.55], [1.02, -0.1], [1.05, 0.45], [1.03, 1.05], [0.99, 1.45], [0.95, 1.62], [0.905, 1.72],
        [0.86, 1.745], [0.835, 1.7], [0.845, 1.55], [0.87, 1.3], [0.885, 1.0], [0.885, 0.2], [0.87, -0.3], [0.85, -0.78], [0.9, -0.8],
      ];
      add(g, latheZ(prof, 128), M('shell'));
      flange(g, M('detail'), 1.0, 0.016, -0.1);
      flange(g, M('detail'), 1.03, 0.016, 1.05);
      beadRing(g, M('detail'), 0.875, 36, -0.8, 0.022);
    },
  });

  /* ---- core cowl: encloses compressors, combustor and turbines; ends as the core nozzle ---- */
  const cowlOuter = [
    [0.38, 0.86], [0.47, 0.6], [0.52, 0.2], [0.56, -0.3], [0.58, -0.7], [0.575, -1.1], [0.6, -1.4], [0.56, -1.75], [0.5, -1.98],
  ];
  A.addPart('coreCowl', {
    name: 'Core cowl',
    spec: 'core casing · nozzle',
    cut: true,
    explode: [0, 1.1, 0],
    build: (g) => {
      add(g, latheZ(shellProfile(cowlOuter, 0.025), 112), M('shell'));
      for (const [r, z] of [[0.525, 0.2], [0.565, -0.3], [0.585, -0.76], [0.605, -1.42]]) flange(g, M('detail'), r + 0.008, 0.018, z);
    },
  });

  /* ---- fan + disk + spinner (LP spool) ---- */
  A.addPart('fan', {
    name: 'Fan',
    spec: '22 wide-chord blades · ∅1.72 m',
    spool: 'lp',
    explode: [0, 0, 0.45],
    build: (g) => {
      stage(g, M('primary'), M('primary'), {
        z: 1.06,
        count: 22,
        blade: { rHub: 0.33, rTip: 0.86, chordRoot: 0.3, chordTip: 0.27, staggerRoot: 0.58, staggerTip: 1.08, camber: 0.07, thickness: 0.07, sweep: 0.14, lean: 0.02, stations: 12, points: 24 },
        drum: { ri: 0.09, ro: 0.34, len: 0.14 },
      });
      add(g, latheZ([[0.34, 1.13], ...spinnerProfile(0.34, 1.13, 1.62, 16)], 96), M('primary'));
      beadRing(g, M('detail'), 0.3, 18, 1.15, 0.02);
    },
  });

  /* ---- low-pressure compressor (LP spool) ---- */
  const lpc = [
    { z: 0.56, count: 36, rTip: 0.455 },
    { z: 0.44, count: 38, rTip: 0.44 },
    { z: 0.32, count: 40, rTip: 0.425 },
  ];
  A.addPart('lpc', {
    name: 'LP compressor',
    spec: '3 stages · 114 blades',
    spool: 'lp',
    explode: [0, 0, 0.25],
    build: (g) => {
      for (const s of lpc) {
        stage(g, M('secondary'), M('secondary'), {
          z: s.z,
          count: s.count,
          blade: { rHub: 0.3, rTip: s.rTip, chordRoot: 0.085, chordTip: 0.075, staggerRoot: 0.5, staggerTip: 0.95, camber: 0.08, thickness: 0.09, sweep: 0.0, stations: 5, points: 14 },
        });
      }
      add(g, tubeZ(0.1, 0.3, 0.38, 72).translate(0, 0, 0.44), M('secondary'));
    },
  });

  /* ---- high-pressure compressor (HP spool) ---- */
  const hpc = [];
  for (let i = 0; i < 6; i++) hpc.push({ z: 0.16 - i * 0.08, count: 50 + i * 2, rTip: 0.45 - i * 0.018, rHub: 0.28 + i * 0.004 });
  A.addPart('hpc', {
    name: 'HP compressor',
    spec: '6 stages · 330 blades',
    spool: 'hp',
    explode: [0, 0, 0.08],
    build: (g) => {
      for (const s of hpc) {
        stage(g, M('secondary'), M('secondary'), {
          z: s.z,
          count: s.count,
          blade: { rHub: s.rHub, rTip: s.rTip, chordRoot: 0.062, chordTip: 0.055, staggerRoot: 0.55, staggerTip: 0.9, camber: 0.08, thickness: 0.1, sweep: 0.0, stations: 4, points: 12 },
        });
      }
      add(g, latheZ([[0.14, 0.2], [0.28, 0.2], [0.3, -0.26], [0.14, -0.26], [0.14, 0.2]], 72), M('secondary'));
    },
  });

  /* ---- stator vanes (static) ---- */
  A.addPart('stators', {
    name: 'Stator vanes',
    spec: 'guide vanes between every stage',
    explode: [0, 0, 0.1],
    build: (g) => {
      const rows = [
        { z: 0.5, count: 41, rTip: 0.45, rHub: 0.31 }, { z: 0.38, count: 43, rTip: 0.435, rHub: 0.31 }, { z: 0.26, count: 45, rTip: 0.42, rHub: 0.31 },
        ...Array.from({ length: 6 }, (_, i) => ({ z: 0.12 - i * 0.08, count: 55 + i * 2, rTip: 0.44 - i * 0.018, rHub: 0.29 + i * 0.004 })),
        { z: -0.78, count: 44, rTip: 0.46, rHub: 0.31 }, { z: -0.9, count: 46, rTip: 0.46, rHub: 0.31 },
        ...Array.from({ length: 4 }, (_, i) => ({ z: -1.12 - i * 0.12, count: 60 + i * 4, rTip: 0.49 + i * 0.026, rHub: 0.3 - i * 0.012 })),
      ];
      for (const r of rows) {
        stage(g, M('secondary'), null, {
          z: r.z,
          count: r.count,
          blade: { rHub: r.rHub, rTip: r.rTip, chordRoot: 0.055, chordTip: 0.05, staggerRoot: -0.5, staggerTip: -0.85, camber: 0.08, thickness: 0.1, stations: 4, points: 12 },
        });
      }
    },
  });

  /* ---- combustor (static, hot) ---- */
  A.addPart('combustor', {
    name: 'Combustor',
    spec: '14 cans · annular liner',
    explode: [0, 0, 0],
    build: (g) => {
      canRing(g, M('hot'), 14, 0.405, -0.55, 0.36, 0.078);
      add(g, tubeZ(0.3, 0.52, 0.045, 96).translate(0, 0, -0.345), M('hot'));
      add(g, tubeZ(0.3, 0.52, 0.045, 96).translate(0, 0, -0.755), M('hot'));
      add(g, tubeZ(0.29, 0.31, 0.44, 72).translate(0, 0, -0.55), M('hot'));
      beadRing(g, M('detail'), 0.47, 28, -0.345, 0.018);
    },
  });

  /* ---- high-pressure turbine (HP spool) ---- */
  A.addPart('hpt', {
    name: 'HP turbine',
    spec: '2 stages · 116 blades',
    spool: 'hp',
    explode: [0, 0, -0.2],
    build: (g) => {
      for (const s of [{ z: -0.84, count: 56 }, { z: -0.96, count: 60 }]) {
        stage(g, M('drive'), M('drive'), {
          z: s.z,
          count: s.count,
          blade: { rHub: 0.3, rTip: 0.46, chordRoot: 0.08, chordTip: 0.07, staggerRoot: 0.85, staggerTip: 1.15, camber: 0.12, thickness: 0.14, stations: 4, points: 12 },
        });
      }
      add(g, tubeZ(0.15, 0.3, 0.2, 72).translate(0, 0, -0.9), M('drive'));
    },
  });

  /* ---- low-pressure turbine (LP spool) ---- */
  A.addPart('lpt', {
    name: 'LP turbine',
    spec: '4 stages · 280 blades',
    spool: 'lp',
    explode: [0, 0, -0.42],
    build: (g) => {
      for (let i = 0; i < 4; i++) {
        stage(g, M('drive'), M('drive'), {
          z: -1.06 - i * 0.12,
          count: 64 + i * 4,
          blade: { rHub: 0.3 - i * 0.012, rTip: 0.48 + i * 0.026, chordRoot: 0.085, chordTip: 0.08, staggerRoot: 0.8, staggerTip: 1.1, camber: 0.12, thickness: 0.13, stations: 4, points: 12 },
        });
      }
      add(g, latheZ([[0.1, -1.0], [0.3, -1.0], [0.26, -1.48], [0.1, -1.48], [0.1, -1.0]], 72), M('drive'));
    },
  });

  /* ---- exhaust plug (static) ---- */
  A.addPart('exhaust', {
    name: 'Exhaust plug',
    spec: 'centre body',
    explode: [0, 0, -0.85],
    build: (g) => {
      add(g, latheZ([[0.0, -1.5], [0.27, -1.5], ...spinnerProfile(0.27, -1.5, -2.15, 14).slice(1)], 80), M('detail'));
      flange(g, M('detail'), 0.275, 0.014, -1.52);
    },
  });

  /* ---- shafts ---- */
  A.addPart('shaftLP', {
    name: 'LP shaft',
    spec: 'fan ↔ LP turbine',
    spool: 'lp',
    explode: [0, 0, 0],
    build: (g) => add(g, cylZ(0.07, 0.07, 2.5, 40).translate(0, 0, -0.22), M('detail')),
  });
  A.addPart('shaftHP', {
    name: 'HP shaft',
    spec: 'HP compressor ↔ HP turbine',
    spool: 'hp',
    explode: [0, 0, 0],
    build: (g) => add(g, tubeZ(0.11, 0.14, 1.26, 48).translate(0, 0, -0.4), M('detail')),
  });

  /* ---- bypass struts (static) ---- */
  A.addPart('struts', {
    name: 'Bypass struts',
    spec: '8 outlet guide struts',
    explode: [0, 0, 0.3],
    build: (g) => strutRing(g, M('detail'), 8, 0.46, 0.88, 0.6, 0.16, 0.03, Math.PI / 8),
  });

  return A.finalize();
}
