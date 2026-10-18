import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { AccumulatePass } from './accumulate.js';

/* Post chain: Render (HDR, MSAA) → Accumulate → Bloom (linear) → Output (tone map, sRGB) → Finish */

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.018 },
    uAberration: { value: 0.35 },
    uLetterbox: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uAberration, uLetterbox; uniform vec2 uResolution; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 q = vUv - 0.5;
      float r2 = dot(q, q);
      vec2 off = q * r2 * uAberration * 0.028;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - off).b;
      float v = 1.0 - smoothstep(0.15, 1.15, r2 * 4.0) * uVignette;
      c *= v;
      float g = hash(vUv * uResolution * 0.37 + fract(uTime) * 100.0) - 0.5;
      c += g * uGrain * (0.35 + 0.65 * (1.0 - clamp(dot(c, vec3(0.333)), 0.0, 1.0)));
      if (uLetterbox > 0.5) {
        float aspect = uResolution.x / uResolution.y;
        float barH = max(0.0, 0.5 - (aspect / 2.39) * 0.5);
        if (vUv.y < barH || vUv.y > 1.0 - barH) c = vec3(0.0);
      }
      if (any(isnan(c))) c = vec3(0.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createPost(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const accum = new AccumulatePass();
  composer.addPass(accum);
  const bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, size.x / 2), Math.max(1, size.y / 2)), 0.38, 0.55, 1.05);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  function setSize(w, h) {
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    finish.uniforms.uResolution.value.set(w * pr, h * pr);
  }
  return {
    composer,
    accum,
    bloom,
    finish,
    output,
    setSize,
    setPixelRatio(pr, w, h) {
      composer.setPixelRatio(pr);
      setSize(w, h);
    },
    render(t) {
      finish.uniforms.uTime.value = t;
      composer.render();
    },
    dispose() {
      composer.dispose();
      accum.dispose();
    },
  };
}
