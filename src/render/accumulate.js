import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';

/* ------------------------------------------------------------------ *
 * Accumulation pass: a running average of the linear HDR frame.
 * Weight 1/(n+1) gives a progressive mean; once `max` is reached it
 * holds (an EMA with a long window). Reset whenever anything moves.
 * ------------------------------------------------------------------ */
export class AccumulatePass extends Pass {
  constructor() {
    super();
    this.count = 0;
    this.max = 256;
    const mk = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.history = [mk(), mk()];
    this.material = new THREE.ShaderMaterial({
      uniforms: { tCurrent: { value: null }, tHistory: { value: null }, uWeight: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tCurrent, tHistory; uniform float uWeight; varying vec2 vUv;
        void main(){
          vec3 cur = texture2D(tCurrent, vUv).rgb;
          vec3 his = texture2D(tHistory, vUv).rgb;
          // a NaN anywhere would poison the running mean forever (NaN * 0 is still NaN)
          if (any(isnan(cur)) || any(isinf(cur))) cur = vec3(0.0);
          if (uWeight >= 1.0 || any(isnan(his)) || any(isinf(his))) his = cur;
          gl_FragColor = vec4(mix(his, cur, uWeight), 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.copy = new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(w, h) {
    for (const rt of this.history) rt.setSize(w, h);
    this.count = 0;
  }
  reset() {
    this.count = 0;
  }
  get converged() {
    return this.count >= this.max;
  }
  render(renderer, writeBuffer, readBuffer) {
    const n = this.count;
    const w = n === 0 ? 1 : 1 / (Math.min(n, this.max - 1) + 1);
    const [hist, out] = this.history;
    this.material.uniforms.tCurrent.value = readBuffer.texture;
    this.material.uniforms.tHistory.value = hist.texture;
    this.material.uniforms.uWeight.value = w;
    renderer.setRenderTarget(out);
    this.quad.material = this.material;
    this.quad.render(renderer);
    this.copy.uniforms.tDiffuse.value = out.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.material = this.copy;
    this.quad.render(renderer);
    this.history.reverse();
    this.count = Math.min(n + 1, this.max);
  }
  dispose() {
    for (const rt of this.history) rt.dispose();
    this.material.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
