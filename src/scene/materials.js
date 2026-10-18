import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Materials. Every part of the engine is one of six GlassMaterials
 * (one per role). They extend MeshPhysicalMaterial (transmission,
 * dispersion, iridescence, clearcoat) with three patches:
 *   · an edge rainbow: a fresnel-weighted spectral rim where light splits
 *   · an inner fire: emissive glow that falls off from the hot axis
 *   · a hover highlight
 * Defines never flip at runtime: dispersion / iridescence / clearcoat
 * are clamped to a tiny epsilon so every slot shares one program.
 * ------------------------------------------------------------------ */

const EPS = 0.0005;

export const SPECTRAL_GLSL = /* glsl */ `
  vec3 bump3y(vec3 x, vec3 yoffset) { vec3 y = 1.0 - x * x; return clamp(y - yoffset, 0.0, 1.0); }
  // Zucconi 6-term fit of the visible spectrum, x in [0,1] (violet → red)
  vec3 spectral(float x) {
    const vec3 c1 = vec3(3.54585104, 2.93225262, 2.41593945);
    const vec3 x1 = vec3(0.69549072, 0.49228336, 0.27699880);
    const vec3 y1 = vec3(0.02312639, 0.15225084, 0.52607955);
    const vec3 c2 = vec3(3.90307140, 3.21182957, 3.96587128);
    const vec3 x2 = vec3(0.11748627, 0.86755042, 0.66077860);
    const vec3 y2 = vec3(0.84897130, 0.88445281, 0.73949448);
    return bump3y(c1 * (x - x1), y1) + bump3y(c2 * (x - x2), y2);
  }
  float segDist(vec3 p, vec3 a, vec3 b) {
    vec3 ab = b - a; float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    return length(p - (a + ab * t));
  }
`;

/** Uniforms shared by every glass slot (one object, updated once per frame). */
export function createSharedGlassUniforms() {
  return {
    uRainbow: { value: 0.55 },
    uRainbowSpread: { value: 1.0 },
    uRainbowPower: { value: 3.2 },
    uRainbowTime: { value: 0 },
    uGlowA: { value: new THREE.Vector3() },
    uGlowB: { value: new THREE.Vector3() },
    uGlowRadius: { value: 0.7 },
    uHiColor: { value: new THREE.Color('#9fe6ff') },
  };
}

export class GlassMaterial {
  constructor(role, shared) {
    this.role = role;
    this.shared = shared;
    this.uniforms = {
      uGlow: { value: 0 },
      uGlowColor: { value: new THREE.Color('#ffb070') },
      uHighlight: { value: 0 },
    };
    const m = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      ior: 1.52,
      thickness: 0.35,
      dispersion: 0.5,
      attenuationColor: '#ffffff',
      attenuationDistance: 3,
      specularIntensity: 1,
      envMapIntensity: 1,
      iridescence: EPS,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [120, 480],
      clearcoat: EPS,
      clearcoatRoughness: 0.03,
      side: THREE.DoubleSide,
    });
    m.userData.role = role;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, this.shared);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGPos; varying vec3 vGNor;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
          vGPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vGNor = normalize(mat3(modelMatrix) * objectNormal);`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vGPos; varying vec3 vGNor;
          uniform float uRainbow, uRainbowSpread, uRainbowPower, uRainbowTime, uGlowRadius, uGlow, uHighlight;
          uniform vec3 uGlowA, uGlowB, uGlowColor, uHiColor;
          ${SPECTRAL_GLSL}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float dAxis = segDist(vGPos, uGlowA, uGlowB);
            float glowF = exp(-dAxis / max(uGlowRadius, 0.02));
            totalEmissiveRadiance += uGlowColor * (uGlow * glowF);
            totalEmissiveRadiance += uHiColor * (uHighlight * 0.35);
          }`)
        .replace('#include <opaque_fragment>', `
          {
            vec3 Vw = normalize(cameraPosition - vGPos);
            vec3 Nw = normalize(vGNor);
            if (!gl_FrontFacing) Nw = -Nw;
            float fr = pow(clamp(1.0 - abs(dot(Nw, Vw)), 0.0, 1.0), uRainbowPower); // clamp: a hair below zero would be NaN
            // real prismatic rims come from thickness changing at edges, so weight by how fast the normal
            // turns across the screen: silhouettes and curved glass keep it, flat plates lose it
            float curv = smoothstep(0.0, 0.02, length(fwidth(Nw)));
            fr *= mix(0.25, 1.0, curv);
            float h = fr * uRainbowSpread * 1.35 + dot(vGPos, vec3(0.21, 0.13, 0.17)) * 0.6 + uRainbowTime;
            float x = abs(fract(h) * 2.0 - 1.0);
            outgoingLight += spectral(x) * (fr * uRainbow * 0.9);
          }
          #include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'glass-engine-v1';
    this.material = m;
  }

  /** Apply a slot parameter set from the state. */
  apply(p, thicknessScale = 1) {
    const m = this.material;
    m.color.set(p.tint);
    m.ior = p.ior;
    m.dispersion = Math.max(EPS, p.dispersion);
    m.roughness = Math.max(0, p.roughness);
    m.thickness = p.thickness * thicknessScale;
    m.attenuationColor.set(p.attenuation);
    m.attenuationDistance = Math.max(0.05, p.attenuationDist);
    m.iridescence = Math.max(EPS, p.iridescence);
    m.clearcoat = Math.max(EPS, p.clearcoat);
    this.uniforms.uGlow.value = p.glow;
    this.uniforms.uGlowColor.value.set(p.glowColor);
  }
}

/* ------------------------------------------------------------------ *
 * Floor: a dark glossy stage. Planar reflection (screen-space texture
 * from the mirrored camera), projected caustics, and a horizon fade so
 * the stage dissolves into the backdrop.
 * ------------------------------------------------------------------ */
export function createFloorMaterial() {
  const uniforms = {
    tReflect: { value: null },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflStrength: { value: 0.8 },
    uReflBlur: { value: 0.55 },
    tCaustic: { value: null },
    uCausticVP: { value: new THREE.Matrix4() },
    uCausticGain: { value: 1 },
    uCausticColor: { value: new THREE.Color('#ffffff') },
    uDance: { value: 0.6 },
    uTime: { value: 0 },
    uFade: { value: 1 },
    uFadeRadius: { value: 14 },
    uFadeColor: { value: new THREE.Color('#05060a') },
    uCenter: { value: new THREE.Vector2() },
    uDirectSpec: { value: 0.12 },
  };
  const m = new THREE.MeshPhysicalMaterial({ color: '#0e0f12', roughness: 0.18, metalness: 0, envMapIntensity: 0.35 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vFPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFPos;
        uniform sampler2D tReflect, tCaustic;
        uniform mat4 uReflMatrix, uCausticVP;
        uniform float uReflStrength, uReflBlur, uCausticGain, uDance, uTime, uFade, uFadeRadius, uDirectSpec;
        uniform vec3 uCausticColor, uFadeColor; uniform vec2 uCenter;`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          reflectedLight.directSpecular *= uDirectSpec;
          vec3 Vw = normalize(cameraPosition - vFPos);
          float NoV = clamp(Vw.y, 0.0, 1.0);
          float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
          vec4 rp = uReflMatrix * vec4(vFPos, 1.0);
          vec2 ruv = rp.xy / max(rp.w, 1e-4);
          float lod = uReflBlur * material.roughness * 12.0;
          vec3 refl = textureLod(tReflect, ruv, lod).rgb;
          reflectedLight.indirectSpecular += refl * (F * uReflStrength);
          vec4 cp = uCausticVP * vec4(vFPos, 1.0);
          vec2 cuv = cp.xy * 0.5 + 0.5;
          float inside = step(0.0, cuv.x) * step(cuv.x, 1.0) * step(0.0, cuv.y) * step(cuv.y, 1.0);
          vec2 dance = uDance * 0.0045 * vec2(sin(vFPos.x * 7.0 + uTime * 1.3) + sin(vFPos.z * 5.3 - uTime * 0.9), cos(vFPos.z * 6.1 + uTime * 1.1) + cos(vFPos.x * 4.7 - uTime * 0.7));
          vec3 caus = texture2D(tCaustic, cuv + dance).rgb * inside;
          // concentration ratio × key irradiance × the light the shadow removed × Lambert
          reflectedLight.directDiffuse += caus * uCausticColor * uCausticGain * BRDF_Lambert(diffuseColor.rgb);
        }`)
      .replace('#include <opaque_fragment>', `
        {
          float fd = smoothstep(uFadeRadius * 0.35, uFadeRadius, length(vFPos.xz - uCenter));
          outgoingLight = mix(outgoingLight, uFadeColor, fd * uFade);
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'glass-floor-v1';
  m.userData.uniforms = uniforms;
  return m;
}

/* ------------------------------------------------------------------ *
 * Backdrop: a huge inverted sphere with a vertical gradient and a soft
 * glow that always sits behind the model (the spotlight on the sweep).
 * ------------------------------------------------------------------ */
export function createBackdropMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uBottom: { value: new THREE.Color('#05060a') },
      uTop: { value: new THREE.Color('#0c1018') },
      uGlowColor: { value: new THREE.Color('#1a2230') },
      uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
      uGlowSize: { value: 1 },
      uMode: { value: 1 }, // 0 void · 1 spot · 2 gradient
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDir = normalize(wp.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uBottom, uTop, uGlowColor, uGlowDir; uniform float uGlowSize, uMode;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec3 d = normalize(vDir);
        vec3 c = uBottom;
        if (uMode > 0.5) c = mix(uBottom, uTop, smoothstep(-0.35, 0.8, d.y));
        if (uMode > 0.5 && uMode < 1.5) {
          float ang = acos(clamp(dot(d, uGlowDir), -1.0, 1.0));
          c += uGlowColor * exp(-pow(ang / (0.5 * uGlowSize), 2.0));
        }
        c += (hash(gl_FragCoord.xy) - 0.5) * 0.004; // dither against banding
        gl_FragColor = vec4(max(c, 0.0), 1.0);
      }`,
  });
}

export const TONE_MAP = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
  Filmic: THREE.CineonToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Linear: THREE.LinearToneMapping,
};
