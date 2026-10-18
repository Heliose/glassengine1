import { makeControls, el } from './controls.js';
import { PRESETS, VIEWS, ROLES, STUDIOS, MODELS, HELP, TONE_MAPPINGS, BACKGROUNDS, POLICIES } from '../core/content.js';

/* ------------------------------------------------------------------ *
 * The deck: presets, seven folders of controls, toolbar, views, HUD,
 * tooltip, toast, help. Built once; `refresh()` re-reads the store.
 * ------------------------------------------------------------------ */

const $ = (s) => document.querySelector(s);
const deg = (v) => `${Math.round(v)}°`;
const pct = (v) => `${Math.round(v * 100)}%`;
const fix = (n) => (v) => v.toFixed(n);

export class UI {
  constructor(app) {
    this.app = app;
    this.registry = [];
    this.C = makeControls(app, this.registry);
    this.role = 'shell';
    this.buildPresets();
    this.buildDeck();
    this.buildViews();
    this.buildHelp();
    this.toastEl = $('#toast');
    this.tooltipEl = $('#tooltip');
    this.hud = { wrap: $('#hud'), status: $('#hud-status'), bar: $('#hud-bar i'), count: $('#hud-count'), stats: $('#hud-stats') };
    this.wireToolbar();
  }

  /* ---------- presets ---------- */
  buildPresets() {
    const wrap = $('#presets');
    this.presetEls = {};
    for (const p of PRESETS) {
      const b = el('button', 'preset');
      b.innerHTML = `<span class="strip">${p.strip.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span class="pn">${p.name}</span><span class="ps">${p.sub}</span>`;
      b.title = `${p.name} — ${p.sub}`;
      b.addEventListener('click', () => this.app.applyPreset(p.id));
      wrap.appendChild(b);
      this.presetEls[p.id] = b;
    }
  }
  markPreset(id) {
    for (const [k, b] of Object.entries(this.presetEls)) b.classList.toggle('on', k === id);
  }

  /* ---------- deck ---------- */
  buildDeck() {
    const { slider, color, toggle, select, folder, note, divider } = this.C;
    const sections = $('#sections');

    /* Model */
    this.partsWrap = el('div', 'parts');
    this.speedsWrap = el('div');
    const model = folder('Model', [
      select({ label: 'Machine', path: 'model.id', options: Object.entries(MODELS).map(([id, m]) => ({ id, label: m.name })) }),
      slider({ label: 'Explode', path: 'model.explode', min: 0, max: 1, format: pct, hint: 'slide the parts apart along the axis' }),
      slider({ label: 'Cutaway', path: 'model.cutaway', min: 0, max: 1, format: (v) => deg(v * 180), hint: 'a wedge removed from the shells' }),
      slider({ label: 'Cut position', path: 'model.cutawayRotation', min: -180, max: 180, step: 1, format: deg }),
      toggle({ label: 'Cut the core too', path: 'model.cutCore' }),
      divider(),
      el('div', 'ctl-sub', 'Parts'),
      this.partsWrap,
    ], { open: true, id: 'fold-model' });

    /* Glass */
    this.roleWrap = el('div', 'roles');
    this.slotWrap = el('div', 'slot');
    const glass = folder('Glass', [
      el('div', 'ctl-sub', 'Which glass'),
      this.roleWrap,
      this.slotWrap,
      divider(),
      el('div', 'ctl-sub', 'Every glass'),
      slider({ label: 'Edge rainbow', path: 'glass.rainbow', min: 0, max: 2, format: fix(2), hint: 'spectral rim where light splits at grazing angles' }),
      slider({ label: 'Rainbow spread', path: 'glass.rainbowSpread', min: 0.2, max: 3, format: fix(2) }),
      slider({ label: 'Rainbow edge', path: 'glass.rainbowPower', min: 1, max: 8, format: fix(1), hint: 'higher keeps it to the very edge' }),
      slider({ label: 'Rainbow drift', path: 'glass.rainbowDrift', min: 0, max: 2, format: fix(2), hint: 'how fast the colours sweep while the engine turns' }),
      slider({ label: 'Fire reach', path: 'glass.glowRadius', min: 0.1, max: 2.5, format: (v) => `${v.toFixed(2)} m`, hint: 'how far the inner fire reaches from the hot axis' }),
    ], { open: true, id: 'fold-glass' });

    /* Light */
    const light = folder('Light', [
      select({ label: 'Studio', path: 'light.studio', options: Object.entries(STUDIOS).map(([id, s]) => ({ id, label: s.name })), wrap: true }),
      slider({ label: 'Environment', path: 'light.envIntensity', min: 0, max: 3, format: fix(2) }),
      slider({ label: 'Env. rotation', path: 'light.envRotation', min: -180, max: 180, step: 1, format: deg }),
      divider(),
      slider({ label: 'Key', path: 'light.keyIntensity', min: 0, max: 8, format: fix(2) }),
      slider({ label: 'Key azimuth', path: 'light.keyAzimuth', min: -180, max: 180, step: 1, format: deg }),
      slider({ label: 'Key elevation', path: 'light.keyElevation', min: 10, max: 85, step: 1, format: deg }),
      slider({ label: 'Key softness', path: 'light.keySize', min: 0, max: 1.5, format: fix(2), hint: 'size of the light: soft shadows and soft caustics once refined' }),
      color({ label: 'Key colour', path: 'light.keyColor' }),
      divider(),
      slider({ label: 'Rim', path: 'light.rimIntensity', min: 0, max: 8, format: fix(2) }),
      color({ label: 'Rim colour', path: 'light.rimColor' }),
      slider({ label: 'Fill', path: 'light.fillIntensity', min: 0, max: 1.5, format: fix(2) }),
      slider({ label: 'Sparkle', path: 'light.sparkle', min: 0, max: 3, format: fix(2), hint: 'two small hard lights for glints' }),
      divider(),
      slider({ label: 'Inner fire', path: 'light.fire', min: 0, max: 5, format: fix(2) }),
      color({ label: 'Fire colour', path: 'light.fireColor' }),
    ], { id: 'fold-light' });

    /* Floor */
    const floor = folder('Floor', [
      toggle({ label: 'Stage floor', path: 'floor.visible' }),
      color({ label: 'Colour', path: 'floor.color' }),
      slider({ label: 'Roughness', path: 'floor.roughness', min: 0.02, max: 0.8, format: fix(2) }),
      divider(),
      slider({ label: 'Reflection', path: 'floor.reflection', min: 0, max: 1.5, format: fix(2) }),
      slider({ label: 'Reflection blur', path: 'floor.reflectionBlur', min: 0, max: 1.5, format: fix(2) }),
      select({ label: 'Reflection res.', path: 'floor.reflectionRes', options: [{ id: 0, label: 'Off' }, { id: 0.35, label: '⅓' }, { id: 0.5, label: '½' }, { id: 1, label: 'Full' }], parse: parseFloat }),
      divider(),
      slider({ label: 'Caustics', path: 'floor.caustics', min: 0, max: 3, format: fix(2), hint: 'light focused through the glass onto the floor' }),
      slider({ label: 'Caustic spread', path: 'floor.causticSpread', min: 0, max: 1, format: pct, hint: 'how far refraction throws the light: thin glass keeps it tight' }),
      slider({ label: 'Caustic contrast', path: 'floor.causticSharp', min: 0, max: 1.5, format: fix(2) }),
      slider({ label: 'Caustic blur', path: 'floor.causticBlur', min: 0, max: 3, format: fix(2) }),
      slider({ label: 'Caustic dance', path: 'floor.causticDance', min: 0, max: 2, format: fix(2), hint: 'shimmer while the engine turns' }),
      slider({ label: 'Shadow', path: 'floor.shadow', min: 0, max: 1, format: pct }),
      slider({ label: 'Horizon fade', path: 'floor.fade', min: 0, max: 1, format: pct }),
    ], { id: 'fold-floor' });

    /* Motion */
    const motion = folder('Motion', [
      slider({ label: 'Turntable', path: 'motion.turntable', min: -0.5, max: 0.5, format: (v) => `${(v * 9.5493).toFixed(1)} rpm` }),
      this.speedsWrap,
      toggle({ label: 'Counter-rotate', path: 'motion.counter' }),
      slider({ label: 'Float', path: 'motion.bob', min: 0, max: 1, format: pct, hint: 'a slow vertical breathing' }),
      divider(),
      select({ label: 'While refining', path: 'motion.policy', options: POLICIES }),
      slider({ label: 'Crawl speed', path: 'motion.crawl', min: 0, max: 0.5, format: pct }),
      slider({ label: 'Settle after', path: 'motion.settleDelay', min: 0, max: 4, format: (v) => `${v.toFixed(1)} s` }),
      slider({ label: 'Turn for', path: 'motion.turnSeconds', min: 1, max: 30, step: 0.5, format: (v) => `${v.toFixed(1)} s` }),
      slider({ label: 'Rest for', path: 'motion.holdSeconds', min: 2, max: 60, step: 0.5, format: (v) => `${v.toFixed(1)} s` }),
      toggle({ label: 'Paused', path: 'motion.paused' }),
    ], { id: 'fold-motion' });

    /* Refine */
    const refine = folder('Refine', [
      toggle({ label: 'Refine when still', path: 'refine.enabled', hint: 'accumulate jittered frames into a photoreal still' }),
      select({ label: 'Samples', path: 'refine.maxSamples', options: [32, 64, 128, 256, 512, 1024].map((n) => ({ id: n, label: String(n) })), parse: parseInt }),
      toggle({ label: 'Anti-alias', path: 'refine.aa' }),
      divider(),
      slider({ label: 'Aperture', path: 'refine.aperture', min: 0, max: 0.2, format: (v) => `${(v * 100).toFixed(1)} cm`, hint: 'lens size: depth of field that converges as it refines' }),
      select({ label: 'Focus', path: 'refine.focusMode', options: [{ id: 'auto', label: 'Model centre' }, { id: 'manual', label: 'Manual' }] }),
      slider({ label: 'Focus distance', path: 'refine.focusDistance', min: 0.5, max: 30, step: 0.01, format: (v) => `${v.toFixed(2)} m`, hint: 'double-click the engine to set it' }),
      slider({ label: 'Light size', path: 'refine.lightSize', min: 0, max: 1, format: fix(2), hint: 'multiplies the key softness during refinement' }),
      toggle({ label: 'Spectral sampling', path: 'refine.spectral', hint: 'vary the refraction per frame for a continuous spectrum' }),
      toggle({ label: 'Show progress', path: 'refine.hud' }),
    ], { id: 'fold-refine' });

    /* Image */
    const image = folder('Image', [
      slider({ label: 'Exposure', path: 'image.exposure', min: 0.2, max: 3, format: fix(2) }),
      select({ label: 'Tone', path: 'image.toneMapping', options: TONE_MAPPINGS.map((t) => ({ id: t, label: t })), wrap: true }),
      divider(),
      slider({ label: 'Bloom', path: 'image.bloom', min: 0, max: 1.5, format: fix(2) }),
      slider({ label: 'Bloom radius', path: 'image.bloomRadius', min: 0, max: 1, format: fix(2) }),
      slider({ label: 'Bloom threshold', path: 'image.bloomThreshold', min: 0.2, max: 3, format: fix(2) }),
      divider(),
      slider({ label: 'Vignette', path: 'image.vignette', min: 0, max: 1, format: fix(2) }),
      slider({ label: 'Grain', path: 'image.grain', min: 0, max: 0.08, format: fix(3) }),
      slider({ label: 'Lens aberration', path: 'image.aberration', min: 0, max: 2, format: fix(2) }),
      toggle({ label: 'Letterbox 2.39:1', path: 'image.letterbox' }),
      divider(),
      select({ label: 'Backdrop', path: 'image.background', options: BACKGROUNDS }),
      color({ label: 'Backdrop base', path: 'image.bgColor' }),
      color({ label: 'Backdrop top', path: 'image.bgTop' }),
      color({ label: 'Spot glow', path: 'image.glowColor' }),
      slider({ label: 'Spot size', path: 'image.glowSize', min: 0.2, max: 3, format: fix(2) }),
      divider(),
      select({ label: 'Resolution', path: 'image.resolution', options: [{ id: 'auto', label: 'Auto' }, { id: 1, label: '1×' }, { id: 1.5, label: '1.5×' }, { id: 2, label: '2×' }], parse: (v) => (v === 'auto' ? v : parseFloat(v)) }),
      select({ label: 'Refraction res.', path: 'image.transmissionScale', options: [{ id: 0.5, label: '½' }, { id: 0.75, label: '¾' }, { id: 1, label: 'Full' }], parse: parseFloat }),
      note('Double-click any slider to reset it.'),
    ], { id: 'fold-image' });

    for (const s of [model, glass, light, floor, motion, refine, image]) sections.appendChild(s);
    this.buildRoles();
    this.buildSlot();
  }

  buildRoles() {
    this.roleWrap.innerHTML = '';
    this.roleBtns = {};
    for (const [id, r] of Object.entries(ROLES)) {
      const b = el('button', 'role', `<i></i>${r.label}`);
      b.title = r.hint;
      b.addEventListener('click', () => this.setRole(id));
      this.roleWrap.appendChild(b);
      this.roleBtns[id] = b;
    }
    this.paintRoles();
  }
  paintRoles() {
    for (const [id, b] of Object.entries(this.roleBtns)) {
      b.classList.toggle('on', id === this.role);
      const s = this.app.get(`glass.slots.${id}`);
      if (s) b.querySelector('i').style.background = `linear-gradient(135deg, ${s.tint}, ${s.attenuation})`;
    }
  }
  setRole(id) {
    this.role = id;
    this.paintRoles();
    this.buildSlot();
    this.app.highlightRole(id);
  }
  buildSlot() {
    const { slider, color } = this.C;
    // drop the old slot widgets from the registry
    this.registry = this.registry.filter((w) => !w.dataset.path?.startsWith('glass.slots.'));
    this.C = makeControls(this.app, this.registry);
    const P = (k) => `glass.slots.${this.role}.${k}`;
    this.slotWrap.innerHTML = '';
    const kids = [
      el('div', 'slot-name', `${ROLES[this.role].label} <span class="muted">· ${ROLES[this.role].hint}</span>`),
      this.C.color({ label: 'Tint', path: P('tint') }),
      this.C.slider({ label: 'Refraction (IOR)', path: P('ior'), min: 1.0, max: 2.6, format: fix(2) }),
      this.C.slider({ label: 'Dispersion', path: P('dispersion'), min: 0, max: 4, format: fix(2), hint: 'how far the colours split' }),
      this.C.slider({ label: 'Roughness', path: P('roughness'), min: 0, max: 0.5, format: fix(3), hint: 'frosting' }),
      this.C.slider({ label: 'Thickness', path: P('thickness'), min: 0.02, max: 1.5, format: (v) => `${v.toFixed(2)} m`, hint: 'how far the refracted ray travels inside' }),
      this.C.color({ label: 'Depth tint', path: P('attenuation') }),
      this.C.slider({ label: 'Depth reach', path: P('attenuationDist'), min: 0.1, max: 6, format: (v) => `${v.toFixed(2)} m`, hint: 'distance over which the depth tint builds up' }),
      this.C.slider({ label: 'Iridescence', path: P('iridescence'), min: 0, max: 1, format: fix(2) }),
      this.C.slider({ label: 'Clearcoat', path: P('clearcoat'), min: 0, max: 1, format: fix(2) }),
      this.C.slider({ label: 'Inner fire', path: P('glow'), min: 0, max: 3, format: fix(2) }),
      this.C.color({ label: 'Fire tint', path: P('glowColor') }),
    ];
    for (const k of kids) this.slotWrap.appendChild(k);
    void slider; void color;
  }

  /** Rebuild the parts list and speed sliders for the current assembly. */
  setAssembly(A) {
    this.partsWrap.innerHTML = '';
    this.partBtns = {};
    for (const p of A.parts.values()) {
      const b = el('button', 'part', p.name);
      b.title = p.spec;
      b.addEventListener('click', () => this.app.togglePart(p.id));
      this.partsWrap.appendChild(b);
      this.partBtns[p.id] = b;
    }
    this.refreshParts(A);
    this.speedsWrap.innerHTML = '';
    const map = { fan: 'motion.fan', core: 'motion.core' };
    for (const s of A.speeds) {
      const w = this.C.slider({ label: s.label, path: map[s.id], min: -4, max: 4, format: (v) => `${(v * 9.5493).toFixed(0)} rpm` });
      this.speedsWrap.appendChild(w);
    }
    $('#model-name').textContent = A.name;
    $('#model-sub').textContent = A.sub;
    $('#model-spec').textContent = `${A.parts.size} parts · ${Math.round(A.triangles / 1000)}k triangles · ${A.glassMeshes.length} draws`;
  }
  refreshParts(A) {
    for (const [id, b] of Object.entries(this.partBtns || {})) b.classList.toggle('off', !A.parts.get(id)?.visible);
  }

  /* ---------- views + toolbar ---------- */
  buildViews() {
    const wrap = $('#views');
    this.viewBtns = {};
    for (const [id, v] of Object.entries(VIEWS)) {
      const b = el('button', 'view', `<span>${v.name}</span><kbd>${v.key}</kbd>`);
      b.addEventListener('click', () => this.app.gotoView(id));
      wrap.appendChild(b);
      this.viewBtns[id] = b;
    }
  }
  markView(id) {
    for (const [k, b] of Object.entries(this.viewBtns)) b.classList.toggle('on', k === id);
  }
  wireToolbar() {
    $('#btn-still').onclick = () => this.app.saveStill();
    $('#btn-share').onclick = () => this.app.share();
    $('#btn-eye').onclick = () => this.app.toggleUI();
    $('#btn-pause').onclick = () => this.app.togglePause();
    $('#btn-reset').onclick = () => this.app.gotoView('hero');
    $('#btn-help').onclick = () => this.toggleHelp();
    $('#btn-deck').onclick = () => this.toggleDeck();
    $('#help-close').onclick = () => this.toggleHelp(false);
    $('#help').addEventListener('click', (e) => e.target.id === 'help' && this.toggleHelp(false));
  }
  setPaused(p) {
    $('#btn-pause').classList.toggle('on', p);
  }
  toggleDeck(force) {
    const hidden = force === undefined ? document.body.classList.toggle('deck-hidden') : document.body.classList.toggle('deck-hidden', force);
    $('#btn-deck').classList.toggle('on', hidden);
  }
  buildHelp() {
    const ul = $('#help ul');
    for (const [k, v] of HELP) ul.appendChild(el('li', null, `<b>${k}</b><span>${v}</span>`));
  }
  toggleHelp(force) {
    const h = $('#help');
    const show = force === undefined ? h.hidden : force;
    h.hidden = !show;
  }

  /* ---------- refresh from state ---------- */
  refresh() {
    for (const w of this.registry) w.refresh?.();
    this.paintRoles();
    const st = this.app.get('model.id');
    document.body.dataset.model = st;
  }
  refreshPath(path) {
    for (const w of this.registry) if (w.dataset.path === path) w.refresh?.();
    if (path.startsWith('glass.slots.')) this.paintRoles();
  }

  /* ---------- HUD ---------- */
  setHud({ visible, refining, count, max, converged, resting, text, stats }) {
    const h = this.hud;
    h.wrap.classList.toggle('hidden', !visible);
    if (!visible) return;
    h.wrap.classList.toggle('refining', refining && !converged);
    h.wrap.classList.toggle('done', converged);
    h.status.textContent = text;
    h.bar.style.width = `${Math.round((Math.min(count, max) / max) * 100)}%`;
    h.count.textContent = refining ? `${count} / ${max}` : resting ? 'settling' : 'live';
    if (stats != null) h.stats.textContent = stats;
  }

  /* ---------- tooltip / toast ---------- */
  tooltip(title, sub, x, y) {
    const t = this.tooltipEl;
    if (!title) return t.classList.remove('show');
    t.querySelector('.tt-title').textContent = title;
    t.querySelector('.tt-sub').textContent = sub || '';
    t.classList.add('show');
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = x + 14, top = y - h - 14;
    left = Math.max(8, Math.min(innerWidth - w - 8, left));
    if (top < 8) top = y + 22;
    t.style.transform = `translate(${left}px, ${top}px)`;
  }
  toast(msg, ms = 2400) {
    const t = this.toastEl;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
}
