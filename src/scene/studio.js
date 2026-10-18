import * as THREE from 'three';
import { STUDIOS } from '../core/content.js';
import { createBackdropMaterial, createFloorMaterial } from './materials.js';

/* ------------------------------------------------------------------ *
 * The studio: an environment map baked from emissive softboxes, a key
 * light that casts the (soft) shadow and drives the caustics, a rim, a
 * fill, two sparkle lights for glints, the inner fire, the backdrop and
 * the floor. The light count never changes.
 * ------------------------------------------------------------------ */
export class Studio {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTexture = null;
    this.studioId = null;

    const key = new THREE.DirectionalLight('#fff3e4', 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 2;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
    scene.add(key, key.target);
    this.key = key;

    this.rim = new THREE.DirectionalLight('#9ad0ff', 2);
    scene.add(this.rim, this.rim.target);
    this.fill = new THREE.HemisphereLight('#b9c8e0', '#1a1612', 0.25);
    scene.add(this.fill);
    this.fire = new THREE.PointLight('#ff8f3c', 0, 7, 2);
    scene.add(this.fire);
    this.sparkA = new THREE.PointLight('#ffffff', 0, 9, 2);
    this.sparkB = new THREE.PointLight('#ffffff', 0, 9, 2);
    scene.add(this.sparkA, this.sparkB);

    this.backdrop = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 24), createBackdropMaterial());
    this.backdrop.renderOrder = -10;
    this.backdrop.frustumCulled = false;
    this.backdrop.castShadow = this.backdrop.receiveShadow = false;
    scene.add(this.backdrop);

    this.floorMat = createFloorMaterial();
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80, 1, 1), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.floor.layers.set(1); // invisible to the mirror camera
    scene.add(this.floor);

    this.center = new THREE.Vector3(0, 1.3, 0);
    this.radius = 2;
    this.keyDir = new THREE.Vector3(0, -1, 0); // direction light travels
    this._baseDir = new THREE.Vector3();
    this._u = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._glowA = new THREE.Vector3();
    this._glowB = new THREE.Vector3();
  }

  /* ---------- environment ---------- */
  setStudio(id) {
    const def = STUDIOS[id] || STUDIOS.showroom;
    this.studioId = id;
    const s = new THREE.Scene();
    s.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: def.room, side: THREE.BackSide })));
    for (const p of def.panels) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.intensity), side: THREE.DoubleSide });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1]), mat);
      m.position.set(...p.pos);
      m.lookAt(...p.look);
      s.add(m);
    }
    const tex = this.pmrem.fromScene(s, 0.0, 0.1, 100).texture;
    s.traverse((o) => o.isMesh && (o.geometry.dispose(), o.material.dispose()));
    if (this.envTexture) this.envTexture.dispose();
    this.envTexture = tex;
    this.scene.environment = tex;
    if (this.backgroundMode === 'studio') this.scene.background = tex;
  }

  setBackground(mode, { bgColor, bgTop, glowColor, glowSize }) {
    this.backgroundMode = mode;
    const u = this.backdrop.material.uniforms;
    u.uBottom.value.set(bgColor);
    u.uTop.value.set(bgTop);
    u.uGlowColor.value.set(glowColor);
    u.uGlowSize.value = glowSize;
    u.uMode.value = mode === 'void' ? 0 : mode === 'spot' ? 1 : 2;
    this.backdrop.visible = mode !== 'studio';
    if (mode === 'studio') {
      this.scene.background = this.envTexture;
      this.scene.backgroundBlurriness = 0.4;
      this.scene.backgroundIntensity = 0.55;
    } else this.scene.background = null;
    this.floorMat.userData.uniforms.uFadeColor.value.set(bgColor);
  }

  /* ---------- lights ---------- */
  applyLight(L) {
    const az = THREE.MathUtils.degToRad(L.keyAzimuth), el = THREE.MathUtils.degToRad(L.keyElevation);
    this._baseDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); // from target towards the light
    this.keyDist = this.radius * 5;
    this.key.color.set(L.keyColor);
    this.key.intensity = L.keyIntensity;
    this.keySize = L.keySize;
    this.key.target.position.copy(this.center);
    const sc = this.key.shadow.camera, R = this.radius * 1.25;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 0.5; sc.far = this.keyDist + this.radius * 2;
    sc.updateProjectionMatrix();
    this.setKeyJitter(0, 0);

    this.rim.color.set(L.rimColor);
    this.rim.intensity = L.rimIntensity;
    this.rim.position.copy(this.center).add(new THREE.Vector3(-Math.sin(az) * 4, this.radius * 1.4, -Math.cos(az) * 4).multiplyScalar(1.2));
    this.rim.target.position.copy(this.center);
    this.fill.intensity = L.fillIntensity;
    this.fill.color.set(L.rimColor).lerp(new THREE.Color('#ffffff'), 0.5);
    this.scene.environmentIntensity = L.envIntensity;
    this.scene.environmentRotation.y = THREE.MathUtils.degToRad(L.envRotation);
    this.scene.backgroundRotation.y = this.scene.environmentRotation.y;
    this.fire.color.set(L.fireColor);
    this.fire.intensity = L.fire * 6;
    // two small hard lights close to the glass for glints; their range ends before the floor
    const sp = L.sparkle * 9;
    this.sparkA.intensity = sp;
    this.sparkB.intensity = sp * 0.7;
    this.sparkA.color.set(L.keyColor);
    this.sparkB.color.set(L.rimColor);
    this.sparkA.distance = this.sparkB.distance = this.radius * 1.3;
    this.sparkA.position.copy(this.center).add(new THREE.Vector3(this.radius * 0.85, this.radius * 0.55, this.radius * 0.7));
    this.sparkB.position.copy(this.center).add(new THREE.Vector3(-this.radius * 0.9, this.radius * 0.35, -this.radius * 0.5));
    if (L.studio !== this.studioId) this.setStudio(L.studio);
  }

  /** Move the key light on its disc (soft shadow sampling). (jx, jy) in the unit disc. */
  setKeyJitter(jx, jy) {
    const d = this._baseDir;
    this._u.set(d.z, 0, -d.x).normalize();
    if (this._u.lengthSq() < 0.5) this._u.set(1, 0, 0);
    this._v.crossVectors(d, this._u).normalize();
    const r = this.keySize * this.keyDist * 0.14;
    this.key.position.copy(this.center).addScaledVector(d, this.keyDist).addScaledVector(this._u, jx * r).addScaledVector(this._v, jy * r);
    this.keyDir.subVectors(this.key.target.position, this.key.position).normalize();
  }

  /** Follow the model: centre, radius and the hot segment (world). */
  setModel(center, radius, assembly) {
    this.center.copy(center);
    this.radius = radius;
    this.assembly = assembly;
    this.floorMat.userData.uniforms.uCenter.value.set(center.x, center.z);
    this.floorMat.userData.uniforms.uFadeRadius.value = radius * 7;
  }
  updateFire(shared) {
    if (!this.assembly) return;
    this.assembly.glowWorld(this._glowA, this._glowB);
    shared.uGlowA.value.copy(this._glowA);
    shared.uGlowB.value.copy(this._glowB);
    this.fire.position.lerpVectors(this._glowA, this._glowB, 0.5);
  }
  /** The backdrop glow sits behind the model from the camera's point of view. */
  updateBackdrop(cameraPos) {
    this.backdrop.material.uniforms.uGlowDir.value.subVectors(this.center, cameraPos).normalize();
  }

  /* ---------- floor ---------- */
  applyFloor(F, reflection, caustics) {
    const u = this.floorMat.userData.uniforms;
    this.floor.visible = F.visible;
    this.floorMat.color.set(F.color);
    this.floorMat.roughness = F.roughness;
    u.uReflStrength.value = reflection.enabled ? F.reflection : 0;
    u.uReflBlur.value = F.reflectionBlur;
    u.uCausticGain.value = F.caustics;
    u.uDance.value = F.causticDance;
    u.uFade.value = F.fade;
    u.uDirectSpec.value = 0.12; // the stage floor shows the softboxes and the mirror image, not hard light pin-points
    this.floorMat.envMapIntensity = reflection.enabled ? 0.2 : 0.7;
    this.key.shadow.intensity = F.shadow;
    caustics.blurRadius = F.causticBlur * 1.6;
    caustics.uniforms.uSlab.value = 1 - F.causticSpread; // thin glass bends light back on exit: blend towards straight-through
    caustics.uniforms.uSharp.value = 1 + F.causticSharp;
    u.tReflect.value = reflection.rt.texture;
    u.tCaustic.value = caustics.texture;
  }
  /** Per-frame floor uniforms (matrices from this frame's passes). */
  updateFloor(reflection, caustics, time) {
    const u = this.floorMat.userData.uniforms;
    u.uReflMatrix.value.copy(reflection.textureMatrix);
    u.uCausticVP.value.copy(caustics.viewProj);
    u.tCaustic.value = caustics.texture;
    u.uTime.value = time;
    // key irradiance on the floor, scaled by the fraction the shadow takes away (what clear glass would give back)
    u.uCausticColor.value.copy(this.key.color).multiplyScalar(this.key.intensity * Math.max(0, -this.keyDir.y) * this.key.shadow.intensity);
  }

  dispose() {
    this.pmrem.dispose();
    this.envTexture?.dispose();
  }
}
