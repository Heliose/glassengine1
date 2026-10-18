/* ------------------------------------------------------------------ *
 * App state: a plain object tree, outside the scene graph. The scene
 * reflects the state. Paths are dot strings ('glass.slots.shell.ior').
 * Presets are partial patches merged over the defaults. The state
 * serialises as a diff against the defaults into the URL hash.
 * ------------------------------------------------------------------ */

const slot = (over = {}) => ({
  tint: '#ffffff',
  ior: 1.52,
  dispersion: 0.55,
  roughness: 0.02,
  thickness: 0.35,
  attenuation: '#ffffff',
  attenuationDist: 3.0,
  iridescence: 0.0,
  clearcoat: 0.0,
  glow: 0.0,
  glowColor: '#ffb070',
  ...over,
});

export const DEFAULTS = {
  model: {
    id: 'jet',
    explode: 0,
    cutaway: 0, // 0..1 → wedge angle 0..180°
    cutawayRotation: 40, // deg, where the wedge sits
    cutCore: false,
    parts: {}, // partId → false when hidden (missing = visible)
    scale: 1,
  },
  glass: {
    rainbow: 0.55,
    rainbowSpread: 1.0,
    rainbowPower: 3.2,
    rainbowDrift: 0.35,
    glowRadius: 0.7,
    slots: {
      shell: slot({ dispersion: 0.7, thickness: 0.25 }),
      primary: slot({ dispersion: 0.9, thickness: 0.4 }),
      secondary: slot({ dispersion: 0.6, thickness: 0.3 }),
      hot: slot({ tint: '#ffd9b3', attenuation: '#ff9b4a', attenuationDist: 1.2, glow: 1.0, glowColor: '#ff9a4a' }),
      drive: slot({ dispersion: 0.8, glow: 0.25, glowColor: '#ffb070' }),
      detail: slot({ dispersion: 0.4, thickness: 0.15, glow: 0.15 }),
    },
  },
  light: {
    studio: 'showroom',
    envIntensity: 1.0,
    envRotation: 0,
    keyIntensity: 3.2,
    keyAzimuth: -38,
    keyElevation: 52,
    keyColor: '#fff3e4',
    keySize: 0.4,
    rimIntensity: 2.2,
    rimColor: '#9ad0ff',
    fillIntensity: 0.25,
    sparkle: 1.0,
    fire: 1.6,
    fireColor: '#ff8f3c',
  },
  floor: {
    visible: true,
    color: '#0e0f12',
    roughness: 0.18,
    reflection: 0.8,
    reflectionBlur: 0.55,
    reflectionRes: 0.5,
    caustics: 1.6,
    causticSpread: 0.45,
    causticSharp: 0.6,
    causticBlur: 1.0,
    causticDance: 0.6,
    shadow: 0.45,
    fade: 1.0,
  },
  motion: {
    turntable: 0.1, // rad/s
    fan: 0.55, // rad/s, primary rotor
    core: 1.0, // rad/s, secondary rotor
    counter: false,
    bob: 0.0,
    paused: false,
    policy: 'pause', // pause | crawl | continuous
    crawl: 0.12,
    settleDelay: 0.9,
    turnSeconds: 6,
    holdSeconds: 9,
  },
  refine: {
    enabled: true,
    maxSamples: 256,
    aa: true,
    aperture: 0.03,
    focusMode: 'auto', // auto | manual
    focusDistance: 7,
    lightSize: 0.35,
    spectral: true,
    hud: true,
  },
  image: {
    exposure: 1.0,
    toneMapping: 'ACES', // ACES | AgX | Neutral | Filmic | Reinhard | Linear
    bloom: 0.38,
    bloomRadius: 0.55,
    bloomThreshold: 1.05,
    vignette: 0.42,
    grain: 0.018,
    aberration: 0.35,
    letterbox: false,
    background: 'spot', // void | spot | gradient | studio
    bgColor: '#05060a',
    bgTop: '#0c1018',
    glowColor: '#1f2838',
    glowSize: 1.4,
    resolution: 'auto', // auto | 1 | 1.5 | 2
    transmissionScale: 1.0,
  },
  camera: { fov: 28 },
};

/* ---------- utilities ---------- */
export const clone = (o) => JSON.parse(JSON.stringify(o));

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}
export function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object') target[k] = {};
      deepMerge(target[k], v);
    } else target[k] = v;
  }
  return target;
}
/** The minimal patch that turns `base` into `obj`. */
export function diff(base, obj) {
  const out = {};
  for (const k of new Set([...Object.keys(base || {}), ...Object.keys(obj || {})])) {
    const a = base?.[k], b = obj?.[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      const d = diff(a || {}, b);
      if (Object.keys(d).length) out[k] = d;
    } else if (a !== b) out[k] = b;
  }
  return out;
}

/* ---------- URL serialisation ---------- */
const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeState(state) {
  const d = diff(DEFAULTS, state);
  return Object.keys(d).length ? b64(JSON.stringify(d)) : '';
}
export function decodeState(str) {
  try {
    const d = JSON.parse(unb64(str));
    return deepMerge(clone(DEFAULTS), d);
  } catch {
    return null;
  }
}

/* ---------- a tiny observable store ---------- */
export class Store {
  constructor(initial) {
    this.state = initial;
    this.listeners = [];
  }
  get(path) {
    return getPath(this.state, path);
  }
  /** Set one path and notify listeners with (path, value). */
  set(path, value, meta = {}) {
    setPath(this.state, path, value);
    for (const l of this.listeners) l(path, value, meta);
  }
  /** Replace the whole state (preset load, URL restore); listeners get ('*'). */
  replace(next, meta = {}) {
    this.state = next;
    for (const l of this.listeners) l('*', next, meta);
  }
  subscribe(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
}
