import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { DEFAULTS, Store, clone, deepMerge, getPath, encodeState, decodeState } from './core/state.js';
import { PRESETS, VIEWS, ROLES, MODELS } from './core/content.js';
import { tween, tweenP, updateTweens, tweensActive, easeInOutCubic, easeOutCubic } from './core/tween.js';
import { damp, halton } from './core/rng.js';
import { GlassMaterial, createSharedGlassUniforms, TONE_MAP } from './scene/materials.js';
import { Studio } from './scene/studio.js';
import { buildJet } from './scene/engine/jet.js';
import { buildDrivetrain } from './scene/engine/drivetrain.js';
import { createPost } from './render/post.js';
import { Caustics } from './render/caustics.js';
import { PlanarReflection } from './render/reflection.js';
import { CameraJitter, CameraTracker } from './render/jitter.js';
import { FrameStats } from './render/quality.js';
import { UI } from './ui/ui.js';

/* ------------------------------------------------------------------ */
/* Boot: URL → state                                                   */
/* ------------------------------------------------------------------ */
const params = new URLSearchParams(location.search);
const hashState = location.hash.startsWith('#s=') ? decodeState(location.hash.slice(3)) : null;
let initial = hashState || clone(DEFAULTS);
if (!hashState && params.get('preset')) {
  const p = PRESETS.find((x) => x.id === params.get('preset'));
  if (p) initial = deepMerge(clone(DEFAULTS), p.patch);
}
if (params.get('model') && MODELS[params.get('model')]) initial.model.id = params.get('model');
const store = new Store(initial);
const S = () => store.state;

const host = document.getElementById('app');
const canvas = document.getElementById('scene');
const loaderBar = document.querySelector('#loader .ld-bar i');
const loaderStep = document.getElementById('ld-step');
const setProgress = (p, text) => {
  loaderBar.style.width = `${Math.round(p * 100)}%`;
  if (text) loaderStep.textContent = text;
};
// yield to the browser between loading steps; rAF can be throttled or paused in hidden panes, so race a timeout
const nextFrame = () => new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 80); });
const size = () => ({ w: Math.max(1, host.clientWidth || innerWidth), h: Math.max(1, host.clientHeight || innerHeight) });

/* ------------------------------------------------------------------ */
/* Renderer, scene, camera                                             */
/* ------------------------------------------------------------------ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
renderer.localClippingEnabled = true;
renderer.info.autoReset = false;
// transmissive glass writes depth and samples a pre-rendered buffer, so draw it front-to-back: early-z kills the overdraw
renderer.setTransparentSort((a, b) => (a.groupOrder !== b.groupOrder ? a.groupOrder - b.groupOrder : a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder : a.z !== b.z ? a.z - b.z : a.id - b.id));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 400);
camera.layers.enable(1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.7;
controls.panSpeed = 0.6;
controls.minPolarAngle = THREE.MathUtils.degToRad(4);
controls.maxPolarAngle = THREE.MathUtils.degToRad(89);
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.enabled = false;

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
const shared = createSharedGlassUniforms();
const materials = {};
for (const role of Object.keys(ROLES)) materials[role] = new GlassMaterial(role, shared);

const studio = new Studio(renderer, scene);
const caustics = new Caustics(1024);
const reflection = new PlanarReflection(0.5);
const jitter = new CameraJitter();
const tracker = new CameraTracker();
const stats = new FrameStats();

const app = {
  store,
  get: (p) => store.get(p),
  defaultOf: (p) => getPath(DEFAULTS, p.replace(/^glass\.slots\.[a-z]+\./, 'glass.slots.shell.')),
  set(path, value, meta = {}) {
    store.set(path, value, meta);
  },
  assembly: null,
  modelCenter: new THREE.Vector3(0, 1.3, 0),
  modelRadius: 2,
  hover: null,
  presetId: 'launch',
  view: 'hero',
  paused: false,
  autoPr: 1.5,
};
window.__app = app;
app.renderFrame = (now = performance.now()) => renderFrame(now); // manual stepping (tests, hidden panes)
app.camera = camera;
app.controls = controls;
let post, ui;

/* ---------- build / swap the machine ---------- */
function buildModel(id) {
  if (app.assembly) {
    scene.remove(app.assembly.root);
    app.assembly.dispose();
  }
  const A = id === 'drivetrain' ? buildDrivetrain(materials) : buildJet(materials);
  scene.add(A.root);
  A.root.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(A.root);
  const wc = wb.getCenter(new THREE.Vector3());
  const hover = 0.42;
  A.root.position.set(-wc.x, -wb.min.y + hover, -wc.z);
  A.baseY = A.root.position.y;
  A.root.updateMatrixWorld(true);
  app.modelCenter.set(0, A.baseY + wc.y, 0);
  app.modelRadius = wb.getSize(new THREE.Vector3()).length() / 2;
  app.assembly = A;
  studio.setModel(app.modelCenter, app.modelRadius, A);
  caustics.setAssembly(A);
  controls.target.copy(app.modelCenter);
  controls.minDistance = app.modelRadius * 0.7;
  controls.maxDistance = app.modelRadius * 8;
  applyModel();
  if (ui) ui.setAssembly(A);
  return A;
}

/* ---------- apply state → scene ---------- */
function applyModel() {
  const M = S().model, A = app.assembly;
  A.setExplode(M.explode);
  A.setCutaway(M.cutaway, M.cutawayRotation, M.cutCore, materials);
  for (const p of A.parts.values()) A.setVisible(p.id, M.parts[p.id] !== false);
  ui?.refreshParts(A);
}
function applyGlass() {
  const G = S().glass;
  for (const [role, gm] of Object.entries(materials)) gm.apply(G.slots[role], app.assembly?.thicknessScale ?? 1);
  shared.uRainbow.value = G.rainbow;
  shared.uRainbowSpread.value = G.rainbowSpread;
  shared.uRainbowPower.value = G.rainbowPower;
  shared.uGlowRadius.value = G.glowRadius;
}
function applyLight() {
  studio.applyLight(S().light);
  studio.applyFloor(S().floor, reflection, caustics); // caustic colour follows the key
}
function applyFloor() {
  const F = S().floor;
  reflection.enabled = F.reflectionRes > 0 && F.visible;
  if (F.reflectionRes > 0 && reflection.scale !== F.reflectionRes) reflection.setScale(F.reflectionRes);
  studio.applyFloor(F, reflection, caustics);
  caustics.enabled = F.visible && F.caustics > 0;
}
function applyImage() {
  if (!post) return;
  const I = S().image;
  renderer.toneMappingExposure = I.exposure;
  const tm = TONE_MAP[I.toneMapping] ?? THREE.ACESFilmicToneMapping;
  if (renderer.toneMapping !== tm) renderer.toneMapping = tm;
  post.bloom.strength = I.bloom;
  post.bloom.radius = I.bloomRadius;
  post.bloom.threshold = I.bloomThreshold;
  post.finish.uniforms.uVignette.value = I.vignette;
  post.finish.uniforms.uGrain.value = I.grain;
  post.finish.uniforms.uAberration.value = I.aberration;
  post.finish.uniforms.uLetterbox.value = I.letterbox ? 1 : 0;
  studio.setBackground(I.background, I);
  renderer.transmissionResolutionScale = I.transmissionScale;
  camera.fov = S().camera.fov;
  camera.updateProjectionMatrix();
  applyResolution();
}
function pixelRatio() {
  const r = S().image.resolution;
  return r === 'auto' ? Math.min(devicePixelRatio, app.autoPr) : Math.min(r, 3);
}
function applyResolution() {
  const pr = pixelRatio();
  if (Math.abs(renderer.getPixelRatio() - pr) < 1e-3 && post?.pr === pr) return;
  const { w, h } = size();
  renderer.setPixelRatio(pr);
  post.setPixelRatio(pr, w, h);
  post.pr = pr;
  reflection.setSize(w * pr, h * pr);
  post.accum.reset();
}
function applyRefine() {
  if (!post) return;
  post.accum.max = S().refine.maxSamples;
}
function applyAll() {
  if (!app.assembly) return;
  applyGlass();
  applyLight();
  applyFloor();
  applyModel();
  applyImage();
  applyRefine();
  ui?.setPaused(S().motion.paused);
}

store.subscribe((path, value, meta) => {
  if (path === '*') {
    if (S().model.id !== app.assembly?.id) buildModel(S().model.id);
    applyAll();
    ui?.refresh();
  } else if (path === 'model.id') {
    buildModel(value);
    ui?.refresh();
  } else if (path.startsWith('model.parts.')) {
    app.assembly.setVisible(path.split('.')[2], value !== false);
    ui?.refreshParts(app.assembly);
  } else if (path.startsWith('model.')) applyModel();
  else if (path.startsWith('glass.')) applyGlass();
  else if (path.startsWith('light.')) applyLight();
  else if (path.startsWith('floor.')) applyFloor();
  else if (path.startsWith('image.')) applyImage();
  else if (path.startsWith('refine.')) applyRefine();
  else if (path === 'motion.paused') ui?.setPaused(value);
  if (!path.startsWith('refine.hud') && !path.startsWith('motion.')) post?.accum.reset();
  if (path !== '*') ui?.refreshPath(path);
  if (!meta.preset && path !== '*') {
    app.presetId = null;
    ui?.markPreset(null);
  }
  scheduleHash();
});

let hashTimer = 0;
function scheduleHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const enc = encodeState(S());
    history.replaceState(null, '', enc ? `#s=${enc}` : location.pathname + location.search);
  }, 400);
}

/* ---------- presets, parts, roles ---------- */
app.applyPreset = (id) => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  const keepModel = S().model.id;
  const next = deepMerge(clone(DEFAULTS), p.patch);
  next.model.id = keepModel;
  next.model.parts = {};
  store.replace(next, { preset: true });
  app.presetId = id;
  ui.markPreset(id);
  ui.toast(`${p.name} · ${p.sub}`);
};
app.togglePart = (id) => {
  const cur = S().model.parts[id] !== false;
  store.set(`model.parts.${id}`, !cur);
};
app.highlightRole = (role) => {
  const u = materials[role].uniforms.uHighlight;
  u.value = 0.9;
  tween({ duration: 900, ease: easeOutCubic, onUpdate: (k) => (u.value = 0.9 * (1 - k)) });
  post.accum.reset();
};

/* ------------------------------------------------------------------ */
/* Camera views                                                        */
/* ------------------------------------------------------------------ */
function poseOf(view) {
  const v = VIEWS[view], R = app.modelRadius, c = app.modelCenter;
  const az = THREE.MathUtils.degToRad(v.az), polar = THREE.MathUtils.degToRad(v.polar), dist = v.dist * R * Math.max(1, 1.25 / camera.aspect) ** 0.8;
  return new THREE.Vector3(c.x + dist * Math.sin(polar) * Math.sin(az), c.y + dist * Math.cos(polar), c.z + dist * Math.sin(polar) * Math.cos(az));
}
let camTween = null;
function goto(pos, target, ms = 1400) {
  camTween?.stop();
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  controls.enabled = false;
  camTween = tween({
    duration: ms,
    ease: easeInOutCubic,
    onUpdate: (k) => {
      camera.position.lerpVectors(p0, pos, k);
      controls.target.lerpVectors(t0, target, k);
      camera.lookAt(controls.target);
    },
    onDone: () => {
      camTween = null;
      controls.enabled = true;
      controls.update();
    },
  });
}
app.gotoView = (id) => {
  app.view = id;
  ui.markView(id);
  goto(poseOf(id), app.modelCenter.clone(), 1500);
  motion.touch(performance.now());
};

/* ------------------------------------------------------------------ */
/* Motion director: turn → rest (refine) → turn …                      */
/* ------------------------------------------------------------------ */
const motion = {
  level: 1,
  phase: 'turning',
  phaseStart: 0,
  lastTouch: 0,
  touch(now) {
    this.lastTouch = now;
    if (this.phase !== 'turning') {
      this.phase = 'turning';
      this.phaseStart = now;
    }
  },
  update(now, dt, M, cameraStill) {
    let target = 1;
    if (M.paused) target = 0;
    else if (M.policy === 'continuous') target = 1;
    else {
      const idle = cameraStill && (now - this.lastTouch) / 1000 > M.settleDelay;
      if (!idle) {
        this.phase = 'turning';
        this.phaseStart = now;
      } else if (this.phase === 'turning') {
        if ((now - this.phaseStart) / 1000 > M.turnSeconds) {
          this.phase = 'resting';
          this.phaseStart = now;
        }
      } else if ((now - this.phaseStart) / 1000 > M.holdSeconds) {
        this.phase = 'turning';
        this.phaseStart = now;
      }
      if (this.phase === 'resting') target = M.policy === 'crawl' ? M.crawl : 0;
    }
    this.level = damp(this.level, target, 2.8, dt);
    if (Math.abs(this.level - target) < 2e-3) this.level = target;
    return this.level;
  },
};

/* ------------------------------------------------------------------ */
/* Interaction                                                         */
/* ------------------------------------------------------------------ */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
raycaster.layers.set(0);
function pick(x, y) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const list = app.assembly.glassMeshes.filter((m) => m.visible && m.parent.visible && (!m.parent.parent || m.parent.parent.visible));
  const hits = raycaster.intersectObjects(list, false);
  return hits[0] || null;
}
function setHover(hit, x, y) {
  const mesh = hit?.object || null;
  if (app.hover && app.hover !== mesh) materials[app.hover.userData.role].uniforms.uHighlight.value = 0;
  app.hover = mesh;
  if (mesh) {
    const part = app.assembly.parts.get(mesh.userData.part);
    materials[mesh.userData.role].uniforms.uHighlight.value = 0.22;
    ui.tooltip(part.name, `${part.spec} · ${ROLES[mesh.userData.role].label.toLowerCase()} glass`, x, y);
    canvas.className = 'pointer';
  } else {
    ui.tooltip(null);
    canvas.className = '';
  }
  post.accum.reset();
}
function overUI(e) {
  const t = document.elementFromPoint(e.clientX, e.clientY);
  return t && t !== canvas;
}

function wire() {
  let press = null, lastPick = 0, pendingHover = null;
  controls.addEventListener('start', () => {
    app.interacting = true;
    motion.touch(performance.now());
    hideHint();
  });
  controls.addEventListener('end', () => {
    app.interacting = false;
    motion.touch(performance.now());
  });
  canvas.addEventListener('wheel', () => motion.touch(performance.now()), { passive: true });
  canvas.addEventListener('pointerdown', (e) => {
    press = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  window.addEventListener('pointermove', (e) => {
    if (press || app.interacting) {
      if (app.hover) setHover(null);
      return;
    }
    if (overUI(e)) {
      if (app.hover) setHover(null);
      return;
    }
    pendingHover = e;
  });
  // hover picking is throttled: the blades are dense
  setInterval(() => {
    if (!pendingHover || !app.assembly) return;
    const e = pendingHover;
    pendingHover = null;
    const now = performance.now();
    if (now - lastPick < 80) return;
    lastPick = now;
    const hit = pick(e.clientX, e.clientY);
    if (hit?.object !== app.hover) setHover(hit, e.clientX, e.clientY);
    else if (hit) ui.tooltip(app.assembly.parts.get(hit.object.userData.part).name, `${app.assembly.parts.get(hit.object.userData.part).spec} · ${ROLES[hit.object.userData.role].label.toLowerCase()} glass`, e.clientX, e.clientY);
  }, 40);
  window.addEventListener('pointerup', (e) => {
    const p = press;
    press = null;
    if (!p || e.target !== canvas) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5 || performance.now() - p.t > 400) return;
    const hit = pick(e.clientX, e.clientY);
    if (hit) {
      const role = hit.object.userData.role;
      ui.setRole(role);
      document.getElementById('fold-glass').classList.add('open');
      ui.toast(`${app.assembly.parts.get(hit.object.userData.part).name} · ${ROLES[role].label} glass selected`);
    }
  });
  canvas.addEventListener('dblclick', (e) => {
    const hit = pick(e.clientX, e.clientY);
    if (!hit) return;
    const d = hit.distance;
    store.set('refine.focusMode', 'manual');
    store.set('refine.focusDistance', Math.round(d * 100) / 100);
    const ring = document.getElementById('focus-ring');
    ring.style.transform = '';
    ring.style.left = `${e.clientX}px`;
    ring.style.top = `${e.clientY}px`;
    ring.classList.remove('flash');
    void ring.offsetWidth;
    ring.classList.add('flash');
    ui.toast(`Focus set · ${d.toFixed(2)} m`);
  });
  canvas.addEventListener('pointerleave', () => app.hover && setHover(null));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); app.togglePause(); }
    else if (k === 'h') app.toggleUI();
    else if (k === 's') app.saveStill();
    else if (k === 'r') app.gotoView('hero');
    else if (k === 'd') app.showStats = !app.showStats;
    else if (k === 'c') ui.toggleDeck();
    else if (e.key === '?') ui.toggleHelp();
    else if (e.key === 'Escape') ui.toggleHelp(false);
    else {
      const v = Object.entries(VIEWS).find(([, x]) => x.key === e.key);
      if (v) app.gotoView(v[0]);
    }
  });
}

app.togglePause = () => store.set('motion.paused', !S().motion.paused);
app.toggleUI = () => {
  const hidden = document.body.classList.toggle('ui-hidden');
  document.getElementById('btn-eye').classList.toggle('on', hidden);
  ui.toast(hidden ? 'Interface hidden · H brings it back' : 'Interface back');
};
app.saveStill = () => {
  renderFrame(performance.now(), true);
  const url = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `glass-engine-${app.assembly.id}-${Date.now()}.png`;
  a.click();
  ui.toast(post.accum.converged ? 'Photoreal still saved' : 'Still saved · hold still longer for a fully refined one');
};
app.share = async () => {
  const enc = encodeState(S());
  const url = `${location.origin}${location.pathname}${enc ? `#s=${enc}` : ''}`;
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    ui.toast('Link copied · it reproduces this exact look');
  } catch {
    ui.toast('The address bar now holds a link to this exact look', 3600);
  }
};
function hideHint() {
  document.getElementById('hint').classList.add('gone');
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */
let last = performance.now();
let errored = false;
let introDone = false;
let bobPhase = 0, rainbowPhase = 0;
const baseIor = {};
const _dir = new THREE.Vector3();

function renderFrame(now, forStill = false) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const st = S();
  const A = app.assembly;
  renderer.info.reset();
  updateTweens(now);
  if (introDone && !camTween) controls.update();
  camera.updateMatrixWorld();

  /* ---- motion ---- */
  const cameraMoved = tracker.changed(camera);
  const cameraStill = !cameraMoved && !app.interacting && !camTween;
  const level = motion.update(now, dt, st.motion, cameraStill);
  const speeds = { fan: st.motion.fan, core: st.motion.core * (st.motion.counter ? -1 : 1) };
  A.update(dt, speeds, level);
  A.root.rotation.y += st.motion.turntable * level * dt;
  bobPhase += dt * 0.7 * level;
  A.root.position.y = A.baseY + Math.sin(bobPhase) * 0.08 * st.motion.bob;
  rainbowPhase += dt * 0.05 * st.glass.rainbowDrift * level;
  shared.uRainbowTime.value = rainbowPhase;
  A.root.updateMatrixWorld(true);
  if (A.cutActive) A.updateCutPlanes();
  studio.updateFire(shared);

  /* ---- refine? ---- */
  const R = st.refine, pol = st.motion.policy;
  const motionStopped = level < 1e-3;
  let refining = R.enabled && cameraStill && !tweensActive() && !forStill;
  if (pol === 'pause') refining = refining && motionStopped;
  post.accum.max = pol === 'continuous' ? 12 : pol === 'crawl' && !motionStopped ? 32 : R.maxSamples;
  const resting = !motionStopped && motion.phase === 'resting' && pol === 'pause';
  post.accum.enabled = refining;
  if (!refining) {
    post.accum.reset();
    jitter.reset();
  }
  let lj = null;
  if (refining) {
    const focus = R.focusMode === 'manual' ? R.focusDistance : camera.position.distanceTo(app.modelCenter);
    const db = renderer.getDrawingBufferSize(new THREE.Vector2());
    lj = jitter.apply(camera, db.x, db.y, { aa: R.aa, aperture: R.aperture, focus });
    studio.setKeyJitter(lj.x * R.lightSize, lj.y * R.lightSize);
    if (R.spectral) {
      const d = (halton(jitter.index, 17) - 0.5) * 1.8;
      for (const [role, gm] of Object.entries(materials)) {
        const base = st.glass.slots[role].ior;
        baseIor[role] = base;
        gm.material.ior = base + d * (base - 1) * 0.025 * gm.material.dispersion;
      }
    }
  } else {
    studio.setKeyJitter(0, 0);
    for (const [role, gm] of Object.entries(materials)) gm.material.ior = st.glass.slots[role].ior;
  }
  studio.updateBackdrop(camera.position);

  /* ---- passes ---- */
  renderer.shadowMap.needsUpdate = true;
  caustics.render(renderer, { lightDir: studio.keyDir, floorY: 0, center: app.modelCenter, radius: app.modelRadius, intensity: 1 });
  if (reflection.enabled) reflection.render(renderer, scene, camera, 0, []);
  studio.updateFloor(reflection, caustics, now / 1000);
  post.render(now / 1000);
  jitter.restore(camera);

  /* ---- hud ---- */
  stats.sample(now);
  if (st.image.resolution === 'auto' && stats.tooSlow(28) && app.autoPr > 1.0) {
    app.autoPr = Math.max(1.0, app.autoPr - 0.25);
    stats.reset();
    applyResolution();
  }
  const converged = refining && post.accum.converged;
  ui.setHud({
    visible: R.hud,
    refining,
    count: post.accum.count,
    max: post.accum.max,
    converged,
    resting,
    text: converged ? 'Photoreal' : refining ? 'Refining' : resting ? 'Coming to rest' : st.motion.paused ? 'Paused' : 'Live',
    stats: app.showStats ? `${stats.fps.toFixed(0)} fps · ${renderer.info.render.calls} draws · ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris · ${renderer.getPixelRatio().toFixed(2)}×` : '',
  });
}

function frame(now) {
  requestAnimationFrame(frame);
  try {
    renderFrame(now);
  } catch (err) {
    if (!errored) console.error(err);
    errored = true;
  }
}

/* ------------------------------------------------------------------ */
/* Resize                                                              */
/* ------------------------------------------------------------------ */
function onResize() {
  const { w, h } = size();
  const pr = renderer.getPixelRatio();
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  post?.setSize(w, h);
  reflection.setSize(w * pr, h * pr);
  post?.accum.reset();
  const z = THREE.MathUtils.clamp(Math.min(w / 1500, h / 980), 0.72, 1.1);
  document.documentElement.style.setProperty('--z', z.toFixed(3));
  if (ui && w < 900 && !app.deckAuto) {
    app.deckAuto = true;
    ui.toggleDeck(true);
  }
}
new ResizeObserver(onResize).observe(host);

/* ------------------------------------------------------------------ */
/* Init                                                                */
/* ------------------------------------------------------------------ */
async function init() {
  const t0 = performance.now(), lap = (what) => params.has('debug') && console.info(`[glass] ${what} ${(performance.now() - t0).toFixed(0)} ms`);
  setProgress(0.06, 'warming the studio');
  await nextFrame();
  studio.setStudio(S().light.studio);
  lap('studio');
  setProgress(0.2, 'cutting the crystal');
  await nextFrame();
  buildModel(S().model.id);
  lap('model');
  setProgress(0.55, 'polishing the floor');
  await nextFrame();
  post = createPost(renderer, scene, camera);
  post.pr = renderer.getPixelRatio();
  ui = new UI(app);
  app.ui = ui;
  ui.setAssembly(app.assembly);
  ui.markPreset(hashState ? null : app.presetId);
  ui.markView('hero');
  onResize();
  applyAll();
  ui.refresh();
  wire();
  setProgress(0.75, 'compiling the light');
  await nextFrame();
  // intro pose, then warm the shaders with one real frame of every pass
  const hero = poseOf('hero');
  const intro = poseOf('hero').sub(app.modelCenter).multiplyScalar(1.9).add(app.modelCenter).add(new THREE.Vector3(-app.modelRadius * 0.6, app.modelRadius * 0.5, 0));
  camera.position.copy(intro);
  controls.target.copy(app.modelCenter);
  camera.lookAt(controls.target);
  const fire = S().light.fire;
  studio.fire.intensity = 0;
  lap('ui');
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 3000))]);
  lap('compile');
  renderFrame(performance.now());
  lap('first frame');
  setProgress(1, 'lights');
  await nextFrame();
  document.getElementById('loader').classList.add('done');
  last = performance.now();
  requestAnimationFrame(frame);
  motion.touch(performance.now());
  if (params.has('skip')) {
    camera.position.copy(hero);
    camera.lookAt(controls.target);
    introDone = true;
    controls.enabled = true;
    controls.update();
    studio.fire.intensity = fire * 6;
  } else {
    tween({ duration: 3400, ease: easeInOutCubic, onUpdate: (k) => (studio.fire.intensity = fire * 6 * k) });
    goto(hero, app.modelCenter.clone(), 3400);
    await tweenP({ duration: 3400, onUpdate: () => {} });
    introDone = true;
  }
  setTimeout(hideHint, 14000);
}

init().catch((e) => {
  console.error(e);
  loaderStep.textContent = `something broke: ${e.message}`;
});
