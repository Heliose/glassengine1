import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { add, bladeGeo, ringArray, latheZ, tubeZ, cylZ, torus, sphere, box, boxUV } from '../../core/geo.js';

/* Shared sub-builders for both machines. Axis is +Z, radial is +Y before arraying. */

/** A ring of blades, merged. Returns a geometry. */
export function bladeRingGeo(opts, count, z, phase = 0) {
  const blade = bladeGeo(opts);
  const g = ringArray(blade, count, { z, phase });
  blade.dispose();
  return g;
}

/** Add a rotor stage: blades + a drum disc. */
export function stage(group, matBlades, matDrum, { z, count, blade, drum, phase = 0 }) {
  add(group, bladeRingGeo(blade, count, z, phase), matBlades);
  if (drum) add(group, tubeZ(drum.ri, drum.ro, drum.len, 72).translate(0, 0, z + (drum.dz || 0)), matDrum);
}

/** Torus flange around the axis at z. */
export function flange(group, mat, r, tube, z, seg = 96) {
  add(group, torus(r, tube, 10, seg).translate(0, 0, z), mat);
}

/** A ring of small spheres ("beads") — the jewellery. */
export function beadRing(group, mat, r, count, z, beadR = 0.02, phase = 0) {
  const bead = sphere(beadR, 14, 10).translate(0, r, 0);
  add(group, ringArray(bead, count, { z, phase }), mat);
  bead.dispose();
}

/** Radial struts between two radii. */
export function strutRing(group, mat, count, rIn, rOut, z, chord = 0.14, thick = 0.028, phase = 0) {
  const len = rOut - rIn;
  const g = box(thick, len, chord).translate(0, rIn + len / 2, 0);
  add(group, ringArray(g, count, { z, phase }), mat);
  g.dispose();
}

/** Cylinders along Z arranged around a ring (combustor cans, capacitors). */
export function canRing(group, mat, count, r, z, len, canR, phase = 0) {
  const g = cylZ(canR, canR, len, 24).translate(0, r, 0);
  add(group, ringArray(g, count, { z, phase }), mat);
  g.dispose();
}

/** Spinner / nose cone profile: smooth from radius r0 at z0 to a point at z1. */
export function spinnerProfile(r0, z0, z1, n = 14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([r0 * Math.pow(1 - Math.pow(t, 1.5), 0.62), z0 + (z1 - z0) * t]);
  }
  return pts;
}

/** Thin-walled shell of revolution: outer profile + inner offset, closed. */
export function shellProfile(outer, wall) {
  const inner = outer.map(([r, z]) => [Math.max(0.001, r - wall), z]).reverse();
  return [...outer, ...inner, outer[0]];
}

export { add, latheZ, tubeZ, cylZ, torus, sphere, box, boxUV, mergeGeometries, THREE };
