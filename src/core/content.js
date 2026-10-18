/* ------------------------------------------------------------------ *
 * Every user-visible string, preset and camera view lives here so the
 * engine code stays free of prose.
 * ------------------------------------------------------------------ */

export const TITLE = { kicker: 'A STUDY IN LIGHT', name: 'The Glass Engine' };

export const MODELS = {
  jet: {
    name: 'Turbofan',
    sub: 'High-bypass turbofan · 22-blade fan · twin spool',
    blurb: 'Every blade, disc and shaft of a high-bypass turbofan, cut from crystal.',
  },
  drivetrain: {
    name: 'EV Drive Unit',
    sub: 'Permanent-magnet motor · two-stage reduction · open differential',
    blurb: 'Motor, windings, gears and half-shafts of an electric drive unit, cut from crystal.',
  },
};

/** Role → label shown in the Glass panel. The model maps its parts onto these roles. */
export const ROLES = {
  shell: { label: 'Shell', hint: 'outer skins' },
  primary: { label: 'Primary rotor', hint: 'the hero moving part' },
  secondary: { label: 'Inner stages', hint: 'compressors, stators, laminations' },
  hot: { label: 'Hot section', hint: 'combustor, windings — carries the inner fire' },
  drive: { label: 'Drive', hint: 'turbines, gears' },
  detail: { label: 'Details', hint: 'shafts, struts, rings' },
};

/** Studio light rigs: emissive panels baked into the environment map. */
export const STUDIOS = {
  showroom: {
    name: 'Showroom',
    room: '#0a0b0e',
    panels: [
      { pos: [-2.5, 5.5, 3.5], look: [0, 1.2, 0], size: [6, 3.2], color: '#fff6ea', intensity: 7 },
      { pos: [5.5, 3.0, -4.0], look: [0, 1.2, 0], size: [1.0, 7], color: '#cfe4ff', intensity: 6 },
      { pos: [-5.5, 2.4, -5.0], look: [0, 1.2, 0], size: [0.8, 6], color: '#ffe6c8', intensity: 5 },
      { pos: [0, 1.5, 9], look: [0, 1.2, 0], size: [10, 4], color: '#dfe6f0', intensity: 0.9 },
      { pos: [0, 8, -1], look: [0, 0, 0], size: [3, 3], color: '#ffffff', intensity: 2.5 },
    ],
  },
  duotone: {
    name: 'Duotone',
    room: '#07070c',
    panels: [
      { pos: [-4.5, 4.5, 3.0], look: [0, 1.2, 0], size: [5, 3], color: '#4fd8ff', intensity: 9 },
      { pos: [5.0, 3.0, -3.5], look: [0, 1.2, 0], size: [1.2, 7], color: '#ff4fa3', intensity: 7 },
      { pos: [0, 1.0, 9], look: [0, 1.2, 0], size: [10, 3], color: '#2a2f55', intensity: 1.2 },
      { pos: [0, 8, 0], look: [0, 0, 0], size: [2.5, 2.5], color: '#ffffff', intensity: 1.5 },
    ],
  },
  gold: {
    name: 'Gold Rim',
    room: '#0b0906',
    panels: [
      { pos: [-3, 5, 4], look: [0, 1.2, 0], size: [5, 3], color: '#fff1dc', intensity: 5 },
      { pos: [0, 3.2, -6], look: [0, 1.2, 0], size: [9, 0.9], color: '#ffc873', intensity: 6 },
      { pos: [6, 2, 1], look: [0, 1.2, 0], size: [0.8, 5], color: '#ffe0b0', intensity: 4 },
      { pos: [0, 1.0, 9], look: [0, 1.2, 0], size: [10, 3], color: '#2b2a3a', intensity: 1.0 },
    ],
  },
  noir: {
    name: 'Noir',
    room: '#040405',
    panels: [
      { pos: [0, 7, 0.5], look: [0, 0, 0], size: [1.2, 9], color: '#ffffff', intensity: 9 },
      { pos: [7, 1.5, -3], look: [0, 1.2, 0], size: [0.5, 5], color: '#b8c8e0', intensity: 4 },
    ],
  },
  arctic: {
    name: 'Arctic',
    room: '#0d1218',
    panels: [
      { pos: [-3, 6, 2], look: [0, 1.2, 0], size: [8, 4], color: '#eaf4ff', intensity: 6 },
      { pos: [4, 5, -5], look: [0, 1.2, 0], size: [8, 4], color: '#cfe8ff', intensity: 5 },
      { pos: [0, 1.0, 9], look: [0, 1.2, 0], size: [12, 4], color: '#9fb8d8', intensity: 1.6 },
      { pos: [0, -1, 0], look: [0, 1, 0], size: [10, 10], color: '#3a4a60', intensity: 1.2 },
    ],
  },
};

/** Curated looks. Each is a patch over DEFAULTS. */
export const PRESETS = [
  {
    id: 'launch',
    name: 'Launch',
    sub: 'clear crystal · amber core',
    strip: ['#0b0c10', '#cfe3ff', '#ffffff', '#ff9a4a', '#171a22'],
    patch: {},
  },
  {
    id: 'sapphire',
    name: 'Sapphire',
    sub: 'blue glass · gold fire',
    strip: ['#0a0f1e', '#2a66d8', '#8fb8ff', '#ffc24a', '#101420'],
    patch: {
      glass: {
        rainbow: 0.4,
        slots: {
          shell: { tint: '#dbe8ff', attenuation: '#3f7bff', attenuationDist: 2.2, dispersion: 0.9 },
          primary: { tint: '#cfe0ff', attenuation: '#2558d6', attenuationDist: 1.6, dispersion: 1.2 },
          secondary: { tint: '#e6eeff', attenuation: '#5b86e0', attenuationDist: 2.5 },
          hot: { tint: '#fff0cc', attenuation: '#ffb03a', attenuationDist: 1.0, glow: 1.3, glowColor: '#ffc24a' },
          drive: { tint: '#e2ecff', attenuation: '#3a6fe0', attenuationDist: 2.0, glowColor: '#ffc24a' },
          detail: { tint: '#fff4dc', attenuation: '#e0a040', attenuationDist: 1.5 },
        },
      },
      light: { studio: 'gold', keyColor: '#fff7ec', rimColor: '#ffd38a', fire: 2.0, fireColor: '#ffb347' },
      image: { glowColor: '#131c33', bgTop: '#0a0f1c' },
    },
  },
  {
    id: 'rose',
    name: 'Rose Quartz',
    sub: 'soft pink · iridescent',
    strip: ['#160f12', '#f5c3cf', '#ffe9ee', '#ff9bb2', '#2a1a20'],
    patch: {
      glass: {
        rainbow: 0.7,
        rainbowSpread: 1.4,
        slots: {
          shell: { tint: '#ffe9ef', attenuation: '#ff8fb0', attenuationDist: 2.8, roughness: 0.06, iridescence: 0.55 },
          primary: { tint: '#fff0f4', attenuation: '#ff7aa6', attenuationDist: 2.0, iridescence: 0.7 },
          secondary: { tint: '#fff4f7', attenuation: '#ffa8c2', attenuationDist: 3.0, iridescence: 0.4 },
          hot: { tint: '#fff2e0', attenuation: '#ffb27a', attenuationDist: 1.2, glow: 0.9, glowColor: '#ffb28a' },
          drive: { tint: '#fff0f4', attenuation: '#ff86ad', attenuationDist: 2.0, iridescence: 0.5 },
          detail: { tint: '#ffffff', attenuation: '#ffc7d6', attenuationDist: 2.0, iridescence: 0.3 },
        },
      },
      light: { studio: 'arctic', keyColor: '#fff0f3', rimColor: '#ffb6c9', fire: 1.0, fireColor: '#ffb28a', keySize: 0.6 },
      floor: { color: '#141016', reflection: 0.7 },
      image: { toneMapping: 'AgX', glowColor: '#2a1a24', bgTop: '#140e14', bloom: 0.45, vignette: 0.35 },
    },
  },
  {
    id: 'smoke',
    name: 'Smoke',
    sub: 'dark glass · prismatic rims',
    strip: ['#06060a', '#2a2c33', '#6b6f7a', '#c0c6d2', '#0e1016'],
    patch: {
      glass: {
        rainbow: 1.1,
        rainbowPower: 2.6,
        slots: {
          shell: { tint: '#9a9ea8', attenuation: '#303238', attenuationDist: 1.2, dispersion: 1.0 },
          primary: { tint: '#b8bcc6', attenuation: '#3a3c44', attenuationDist: 1.0, dispersion: 1.3 },
          secondary: { tint: '#a8acb6', attenuation: '#34363d', attenuationDist: 1.2 },
          hot: { tint: '#ffd2a8', attenuation: '#ff7a2a', attenuationDist: 0.9, glow: 1.4, glowColor: '#ff7a2a' },
          drive: { tint: '#b4b8c2', attenuation: '#3a3c44', attenuationDist: 1.1, glow: 0.35, glowColor: '#ff8a3a' },
          detail: { tint: '#c8ccd6', attenuation: '#505460', attenuationDist: 1.0 },
        },
      },
      light: { studio: 'noir', keyIntensity: 4.2, rimIntensity: 3.5, rimColor: '#dbe6ff', fire: 2.2, sparkle: 1.4 },
      floor: { color: '#08090b', reflection: 0.9, reflectionBlur: 0.3 },
      image: { vignette: 0.55, grain: 0.028, bloom: 0.5, glowColor: '#0c0e14', bgTop: '#070809' },
    },
  },
  {
    id: 'prism',
    name: 'Prism',
    sub: 'maximum dispersion',
    strip: ['#ff3b3b', '#ffb03b', '#4fe07a', '#3b8dff', '#b36bff'],
    patch: {
      glass: {
        rainbow: 1.4,
        rainbowSpread: 1.8,
        rainbowPower: 2.2,
        slots: {
          shell: { dispersion: 2.4, thickness: 0.3 },
          primary: { dispersion: 3.0, thickness: 0.5 },
          secondary: { dispersion: 2.4 },
          hot: { dispersion: 2.0, glow: 0.6, tint: '#ffffff', attenuation: '#ffffff', attenuationDist: 4 },
          drive: { dispersion: 2.6 },
          detail: { dispersion: 1.8 },
        },
      },
      light: { studio: 'showroom', keyIntensity: 4.0, envIntensity: 1.3, fire: 0.6, sparkle: 1.6 },
      floor: { color: '#15161a', caustics: 1.6, causticSharp: 0.8, reflection: 0.85 },
      image: { bloom: 0.3, glowColor: '#1e2430', bgTop: '#0e1218' },
    },
  },
  {
    id: 'ice',
    name: 'Ice',
    sub: 'frosted · soft light',
    strip: ['#0e141c', '#9fc4e8', '#e6f3ff', '#ffffff', '#1a2634'],
    patch: {
      glass: {
        rainbow: 0.3,
        slots: {
          shell: { tint: '#eaf4ff', attenuation: '#9ec8ff', attenuationDist: 2.5, roughness: 0.16, dispersion: 0.3 },
          primary: { tint: '#f1f7ff', attenuation: '#b9d8ff', attenuationDist: 2.5, roughness: 0.12 },
          secondary: { tint: '#f1f7ff', attenuation: '#c5deff', attenuationDist: 3, roughness: 0.1 },
          hot: { tint: '#fff5ea', attenuation: '#ffc896', attenuationDist: 1.4, glow: 0.7, glowColor: '#ffd0a0', roughness: 0.08 },
          drive: { tint: '#eef6ff', attenuation: '#a9cfff', attenuationDist: 2.2, roughness: 0.1 },
          detail: { tint: '#ffffff', roughness: 0.06 },
        },
      },
      light: { studio: 'arctic', keySize: 0.8, keyIntensity: 2.6, rimIntensity: 1.2, fire: 0.8, fireColor: '#ffd0a0', envIntensity: 1.2 },
      floor: { color: '#161a20', roughness: 0.3, reflection: 0.55, reflectionBlur: 0.9, shadow: 0.3, causticBlur: 1.8 },
      image: { toneMapping: 'Neutral', glowColor: '#243040', bgTop: '#101820', bloom: 0.3, grain: 0.012 },
    },
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    sub: 'black glass · molten core',
    strip: ['#030304', '#1a1212', '#ff6a1a', '#ffd27a', '#0a0a0c'],
    patch: {
      glass: {
        rainbow: 0.6,
        glowRadius: 0.9,
        slots: {
          shell: { tint: '#5a5a62', attenuation: '#14141a', attenuationDist: 0.7, dispersion: 0.8, clearcoat: 1 },
          primary: { tint: '#6a6a74', attenuation: '#1a1a22', attenuationDist: 0.6, dispersion: 1.0, clearcoat: 1 },
          secondary: { tint: '#777882', attenuation: '#202026', attenuationDist: 0.8 },
          hot: { tint: '#ffc48a', attenuation: '#ff5a10', attenuationDist: 0.6, glow: 2.4, glowColor: '#ff6a1a' },
          drive: { tint: '#8a8a94', attenuation: '#2a2a30', attenuationDist: 0.8, glow: 0.8, glowColor: '#ff7a2a' },
          detail: { tint: '#ffe2b0', attenuation: '#c08030', attenuationDist: 1.0, glow: 0.4, glowColor: '#ffb060' },
        },
      },
      light: { studio: 'gold', keyIntensity: 2.6, rimIntensity: 3.0, rimColor: '#ffb070', fire: 3.2, fireColor: '#ff6a1a', fillIntensity: 0.1 },
      floor: { color: '#07070a', reflection: 0.95, reflectionBlur: 0.25, caustics: 1.3 },
      image: { exposure: 1.05, vignette: 0.6, bloom: 0.55, bloomThreshold: 0.95, glowColor: '#1c120c', bgTop: '#0a0708' },
    },
  },
  {
    id: 'cinema',
    name: 'Cinema',
    sub: 'duotone · letterbox',
    strip: ['#070a14', '#2fc4ff', '#ffffff', '#ff4f9f', '#13081a'],
    patch: {
      glass: { rainbow: 0.5, slots: { hot: { glow: 1.1, glowColor: '#ff7fb8', attenuation: '#ff5aa0' } } },
      light: { studio: 'duotone', keyColor: '#bfe9ff', rimColor: '#ff5aa0', rimIntensity: 3.2, fire: 1.4, fireColor: '#ff7fb8' },
      floor: { color: '#0a0c14', reflection: 0.85 },
      image: { letterbox: true, aberration: 0.6, vignette: 0.5, grain: 0.03, glowColor: '#141a30', bgTop: '#0b0f22', bloom: 0.5 },
      motion: { turntable: 0.12 },
    },
  },
];

/** Camera views: spherical pose around the model centre (az/polar in degrees, dist in model radii). */
export const VIEWS = {
  hero: { name: 'Hero', az: 38, polar: 66, dist: 3.1, key: '1' },
  intake: { name: 'Intake', az: 8, polar: 80, dist: 2.6, key: '2' },
  profile: { name: 'Profile', az: 90, polar: 78, dist: 3.4, key: '3' },
  exhaust: { name: 'Exhaust', az: 150, polar: 70, dist: 3.0, key: '4' },
  macro: { name: 'Macro', az: 22, polar: 72, dist: 1.35, key: '5' },
  top: { name: 'Overhead', az: 60, polar: 20, dist: 3.2, key: '6' },
};

export const HELP = [
  ['Drag', 'orbit · right-drag pans · wheel zooms'],
  ['Hold still', 'the image refines itself to photoreal and the engine comes to rest for its portrait'],
  ['Double-click', 'sets the focus plane for depth of field'],
  ['Click a part', 'selects its glass in the panel · hover for its name'],
  ['Space', 'pause / resume motion'],
  ['1 – 6', 'camera views · R returns to the hero view'],
  ['H', 'hide the interface · S saves a still · ? toggles this card'],
];

export const TONE_MAPPINGS = ['ACES', 'AgX', 'Neutral', 'Filmic', 'Reinhard', 'Linear'];
export const BACKGROUNDS = [
  { id: 'spot', label: 'Spot' },
  { id: 'void', label: 'Void' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'studio', label: 'Studio' },
];
export const POLICIES = [
  { id: 'pause', label: 'Rest' },
  { id: 'crawl', label: 'Crawl' },
  { id: 'continuous', label: 'Keep turning' },
];
