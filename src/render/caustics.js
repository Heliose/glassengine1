import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/* ------------------------------------------------------------------ *
 * Light-space caustics. Every glass triangle is rendered from the key
 * light's point of view, but each vertex is moved to where its refracted
 * ray hits the floor. Where triangles pile up, light concentrates: the
 * ratio of a triangle's original footprint to its refracted footprint is
 * the brightness. Three passes with slightly different IORs write R, G
 * and B, which gives the rainbow fringes. A separable blur softens it.
 * ------------------------------------------------------------------ */

const vert = /* glsl */ `
  uniform vec3 uLightDir; uniform float uFloorY, uEta, uSlab;
  varying vec3 vOld, vNew; varying float vFacing, vValid;
  #include <clipping_planes_pars_vertex>
  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 wn = normalize(mat3(modelMatrix) * normal);
    vFacing = dot(wn, uLightDir);
    vec3 n = vFacing > 0.0 ? -wn : wn;
    vec3 r = refract(uLightDir, n, uEta);
    if (dot(r, r) < 0.5) r = uLightDir;
    r = normalize(mix(r, uLightDir, uSlab));
    float t = (uFloorY - wp.y) / min(r.y, -1e-3);
    vec3 hit = wp + r * t;
    float t0 = (uFloorY - wp.y) / min(uLightDir.y, -1e-3);
    vOld = wp + uLightDir * t0;
    vNew = hit;
    vValid = (r.y < -0.2 && wp.y > uFloorY + 0.001) ? 1.0 : 0.0; // drop grazing rays: they smear giant triangles
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #include <clipping_planes_vertex>
    gl_Position = projectionMatrix * viewMatrix * vec4(hit, 1.0);
  }`;
const frag = /* glsl */ `
  uniform vec3 uChannel, uTint; uniform float uGain, uSharp;
  varying vec3 vOld, vNew; varying float vFacing, vValid;
  #include <clipping_planes_pars_fragment>
  void main() {
    #include <clipping_planes_fragment>
    if (vFacing > 0.0 || vValid < 0.5) discard;
    float oldA = length(dFdx(vOld.xz)) * length(dFdy(vOld.xz)) + 1e-7;
    float newA = length(dFdx(vNew.xz)) * length(dFdy(vNew.xz)) + 1e-7;
    float ratio = oldA / newA;
    if (ratio < 0.03) discard; // stretched far and thin: no energy worth adding
    // edge-on faces intercept almost no light and give noisy ratios: fade them out
    float w = smoothstep(0.04, 0.35, -vFacing);
    float I = pow(min(ratio, 8.0), uSharp) * uGain * w;
    gl_FragColor = vec4(uChannel * uTint * I, 1.0);
  }`;

const BLUR = {
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRadius: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uDir, uTexel; uniform float uRadius; varying vec2 vUv;
    void main(){
      const float w[5] = float[5](0.2270270, 0.1945946, 0.1216216, 0.0540541, 0.0162162);
      vec3 c = texture2D(tDiffuse, vUv).rgb * w[0];
      for (int i = 1; i < 5; i++) {
        vec2 o = uDir * uTexel * uRadius * float(i);
        c += texture2D(tDiffuse, vUv + o).rgb * w[i];
        c += texture2D(tDiffuse, vUv - o).rgb * w[i];
      }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Caustics {
  constructor(size = 1024) {
    this.size = size;
    const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    this.rtA = new THREE.WebGLRenderTarget(size, size, opts);
    this.rtB = new THREE.WebGLRenderTarget(size, size, opts);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
    this.camera.up.set(0, 0, -1);
    this.scene = new THREE.Scene();
    this.proxies = [];
    this.uniforms = {
      uLightDir: { value: new THREE.Vector3(0, -1, 0) },
      uFloorY: { value: 0 },
      uEta: { value: 1 / 1.5 },
      uSlab: { value: 0.0 },
      uChannel: { value: new THREE.Vector3(1, 0, 0) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uGain: { value: 1 },
      uSharp: { value: 1.6 },
    };
    const mk = (clipping) =>
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        // max blending: stacked glass layers do not pile up, the strongest focus wins
        blending: THREE.CustomBlending,
        blendEquation: THREE.MaxEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        clipping,
      });
    this.matPlain = mk(false);
    this.matClip = mk(true);
    this.blur = new THREE.ShaderMaterial({ ...BLUR, uniforms: THREE.UniformsUtils.clone(BLUR.uniforms), depthTest: false, depthWrite: false });
    this.blur.uniforms.uTexel.value.set(1 / size, 1 / size);
    this.quad = new FullScreenQuad(this.blur);
    this.viewProj = new THREE.Matrix4();
    this.enabled = true;
    this.blurRadius = 1;
    this.spread = 0.08;
    this.texture = this.rtB.texture;
  }

  /** Point the proxies at an assembly's glass meshes (call when the model changes). */
  setAssembly(assembly) {
    for (const p of this.proxies) this.scene.remove(p);
    this.proxies = [];
    for (const mesh of assembly.glassMeshes) {
      const p = new THREE.Mesh(mesh.geometry, this.matPlain);
      p.matrixAutoUpdate = false;
      p.matrixWorldAutoUpdate = false;
      p.frustumCulled = false;
      p.userData.src = mesh;
      p.onBeforeRender = onBefore;
      this.scene.add(p);
      this.proxies.push(p);
    }
    this.assembly = assembly;
  }

  /**
   * Render the caustic texture.
   * `lightDir` is the direction light travels (normalised, world); `center` the model's world centre.
   */
  render(renderer, { lightDir, floorY, center, radius, intensity }) {
    if (!this.enabled || !this.assembly) return;
    // frame the floor region under the model, shifted to where the light lands
    const t = (floorY - center.y) / Math.min(lightDir.y, -0.05);
    const cx = center.x + lightDir.x * t, cz = center.z + lightDir.z * t;
    const S = radius * 1.5;
    const cam = this.camera;
    cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S;
    cam.position.set(cx, floorY + 30, cz);
    cam.lookAt(cx, floorY, cz);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    this.uniforms.uLightDir.value.copy(lightDir);
    this.uniforms.uFloorY.value = floorY;
    this.uniforms.uGain.value = intensity; // the texture holds the concentration ratio

    // the proxies follow their source meshes; pick the clipped material for cut parts
    let anyClip = false;
    for (const p of this.proxies) {
      const src = p.userData.src;
      p.visible = src.visible && src.parent?.visible !== false && isShown(src);
      p.matrixWorld.copy(src.matrixWorld);
      const planes = src.material.clippingPlanes;
      const live = planes && this.assembly.cutActive && planes === this.assembly.cut.planes;
      p.material = live ? this.matClip : this.matPlain;
      if (live) { this.matClip.clippingPlanes = planes; this.matClip.clipIntersection = true; anyClip = true; }
    }
    if (!anyClip) this.matClip.clippingPlanes = null;

    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.shadowMap.autoUpdate;
    const prevClip = renderer.localClippingEnabled;
    const prevAutoClear = renderer.autoClear;
    renderer.shadowMap.autoUpdate = false;
    renderer.localClippingEnabled = true;
    renderer.setRenderTarget(this.rtA);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.autoClear = false; // the three channel passes draw into the same target
    // three passes, one colour channel each, with per-channel IOR
    const channels = [[1, 0, 0, -1], [0, 1, 0, 0], [0, 0, 1, 1]];
    for (const [r, g, b, k] of channels) {
      this.uniforms.uChannel.value.set(r, g, b);
      for (const p of this.proxies) {
        if (!p.visible) continue;
        const gm = p.userData.src.material;
        const half = (gm.ior - 1) * this.spread * gm.dispersion;
        p.userData.eta = 1 / Math.max(1.01, gm.ior + k * half);
      }
      // the eta varies per proxy: set it just before each draw
      for (const p of this.proxies) p.onBeforeRender = onBefore;
      renderer.render(this.scene, cam);
    }
    // blur: A → B (x), then B → A (y); the result lives in A
    renderer.autoClear = true;
    this.blur.uniforms.uRadius.value = this.blurRadius;
    this.blur.uniforms.tDiffuse.value = this.rtA.texture;
    this.blur.uniforms.uDir.value.set(1, 0);
    renderer.setRenderTarget(this.rtB);
    this.quad.render(renderer);
    this.blur.uniforms.tDiffuse.value = this.rtB.texture;
    this.blur.uniforms.uDir.value.set(0, 1);
    renderer.setRenderTarget(this.rtA);
    this.quad.render(renderer);
    this.texture = this.rtA.texture;
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = prevAuto;
    renderer.localClippingEnabled = prevClip;
  }

  setSize(size) {
    if (size === this.size) return;
    this.size = size;
    this.rtA.setSize(size, size);
    this.rtB.setSize(size, size);
    this.blur.uniforms.uTexel.value.set(1 / size, 1 / size);
  }
  dispose() {
    this.rtA.dispose(); this.rtB.dispose(); this.matPlain.dispose(); this.matClip.dispose(); this.blur.dispose(); this.quad.dispose();
  }
}

function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}
function onBefore(renderer, scene, camera, geometry, material) {
  const gm = this.userData.src.material;
  material.uniforms.uTint.value.copy(gm.color);
  if (gm.attenuationColor) material.uniforms.uTint.value.lerp(gm.attenuationColor, 0.5);
  material.uniforms.uEta.value = this.userData.eta ?? 1 / (gm.ior || 1.5);
}
