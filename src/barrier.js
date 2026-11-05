// Barrier: the edge of the unopened land. Layered walls of slow, drifting dark fog standing in a double row of
// dense dark pines. When the fire levels up the old tree line sinks into the ground, the fog rolls outward to the
// new radius and a new tree line rises there. Built from the forest's own geometry/materials so it looks native.
import * as THREE from '../vendor/three.module.js';
import { CAVE_SITES, MOUNTAIN } from './regions.js';
import { rng } from './world.js';

const WALL_VS = `
varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const WALL_FS = `
uniform float uT, uA, uR, uSeed; uniform vec3 uCol, uTop, uCam; uniform vec3 uGap; // gap: (angle, half-width rad, strength)
uniform vec3 uFlPos, uFlDir; uniform float uFlPow, uFlCos; // the flashlight beam lights up the mist it hits
varying vec3 vW;
#include <fog_pars_fragment>
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  float ang = atan(vW.z, vW.x);
  vec2 q = vec2(ang * uR * 0.085 + uSeed, vW.y * 0.17);
  float n = vn(q + vec2(uT * 0.05, -uT * 0.035)) * 0.62 + vn(q * 2.4 + vec2(-uT * 0.09, uT * 0.02)) * 0.38;
  float top = 11.0 + n * 6.0;
  float a = uA * (1.0 - smoothstep(4.5, top, vW.y)) * (0.6 + 0.6 * n) * (1.0 + 0.5 * (1.0 - smoothstep(0.0, 3.5, vW.y)));
  float g = abs(mod(ang - uGap.x + 3.14159265, 6.2831853) - 3.14159265);
  a *= 1.0 - uGap.z * (1.0 - smoothstep(uGap.y, uGap.y * 1.7 + 0.004, g));
  a *= smoothstep(1.0, 4.5, distance(vW, uCam)); // never blank the screen when the camera grazes it
  vec3 col = mix(uCol, uTop, smoothstep(0.0, 13.0, vW.y)) * (0.82 + 0.36 * n);
  vec3 tv = vW - uFlPos; float td = max(length(tv), 0.001);
  float beam = smoothstep(uFlCos, mix(uFlCos, 1.0, 0.55), dot(tv / td, uFlDir)) * uFlPow * (1.0 - smoothstep(12.0, 48.0, td)) * (0.55 + 0.45 * n);
  col += vec3(0.9, 0.74, 0.52) * beam * 0.32; a = max(a, beam * 0.5 * (1.0 - smoothstep(4.5, top, vW.y)));
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createBarrier(G, startR) {
  const { scene } = G, W = G.world;
  const bar = { R: startR, visR: startR, target: startR, anim: 0 };
  const root = new THREE.Group(); scene.add(root); bar.root = root;

  // ---------- fog walls: 3 nested open cylinders, far ones drawn first, all before other transparents ----------
  const cyl = new THREE.CylinderGeometry(1, 1, 18, 160, 1, true); cyl.translate(0, 9 - 0.3, 0);
  const LAYERS = [{ off: 9.0, a: 1.25 }, { off: 4.6, a: 1.1 }, { off: 1.0, a: 0.95 }];
  const walls = LAYERS.map((L, i) => {
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 }, uA: { value: L.a }, uR: { value: startR }, uSeed: { value: i * 17.3 },
      uCol: { value: new THREE.Color() }, uTop: { value: new THREE.Color() }, uCam: { value: new THREE.Vector3() }, uGap: { value: new THREE.Vector3(0, 0, 0) }, uFlPos: { value: new THREE.Vector3() }, uFlDir: { value: new THREE.Vector3(0, 0, -1) }, uFlPow: { value: 0 }, uFlCos: { value: 0.9 } }]);
    const m = new THREE.Mesh(cyl, new THREE.ShaderMaterial({ uniforms: u, vertexShader: WALL_VS, fragmentShader: WALL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    m.renderOrder = -4 + i; m.frustumCulled = false; root.add(m); return { m, u, off: L.off };
  });
  const darkDay = new THREE.Color('#0f1a18'), darkNight = new THREE.Color('#020308'), tmpC = new THREE.Color(), tmpD = new THREE.Color();

  // ---------- rolling fog billows along the foot of the wall: camera-facing quads in ONE draw call ----------
  const puffTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); const pr = rng(77);
    for (let i = 0; i < 9; i++) { const cx = 34 + pr() * 60, cy = 40 + pr() * 50, r = 22 + pr() * 26; const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.6, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const PUFFS = 240, pc = new Float32Array(PUFFS * 12), pk = new Float32Array(PUFFS * 16), pidx = [];
  const puffs = []; { const pr = rng(4711); for (let i = 0; i < PUFFS; i++) puffs.push({ a: pr(), off: -0.6 + pr() * 3.2, y: 0.8 + pr() * 3.2, s: 6 + pr() * 6, ph: pr() * 6.28 }); }
  for (let i = 0; i < PUFFS; i++) { const q = i * 4; pidx.push(q, q + 1, q + 2, q, q + 2, q + 3); }
  const puffGeo = new THREE.BufferGeometry();
  puffGeo.setAttribute('position', new THREE.BufferAttribute(pc, 3)); puffGeo.setAttribute('corner', new THREE.BufferAttribute(pk, 4)); puffGeo.setIndex(pidx);
  const puffU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uCol: { value: new THREE.Color() }, uOp: { value: 0.8 }, uT: { value: 0 } }]); puffU.map.value = puffTex;
  const puffMesh = new THREE.Mesh(puffGeo, new THREE.ShaderMaterial({ uniforms: puffU, transparent: true, depthWrite: false, fog: true,
    vertexShader: `attribute vec4 corner; uniform float uT; varying vec2 vUv; varying float vK;
      #include <fog_pars_vertex>
      void main(){ vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); float r = sin(uT * 0.06 + corner.w) * 0.6; vec2 c = corner.xy - 0.5;
        mvPosition.xy += mat2(cos(r), sin(r), -sin(r), cos(r)) * (c * vec2(corner.z * 1.5, corner.z)); vUv = corner.xy; vK = step(0.01, corner.z);
        gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uCol; uniform float uOp; varying vec2 vUv; varying float vK;
      #include <fog_pars_fragment>
      void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(uCol, t.a * uOp * vK);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }` }));
  puffMesh.frustumCulled = false; puffMesh.renderOrder = -1; root.add(puffMesh);
  let puffR = -1;
  function placePuffs(R) {
    puffR = R; const n = Math.min(PUFFS, Math.floor(Math.PI * 2 * R / 3.9));
    puffs.forEach((p, i) => {
      const a = (i + p.a * 0.8) / n * Math.PI * 2, r = R + p.off, g = Math.abs(Math.atan2(Math.sin(a - MOUNTAIN.a), Math.cos(a - MOUNTAIN.a))) * R;
      const on = i < n && !(Math.abs(R - MOUNTAIN.gateR) < 3 && g < 7);
      for (let k = 0; k < 4; k++) { const v = (i * 4 + k); pc[v * 3] = Math.cos(a) * r; pc[v * 3 + 1] = p.y; pc[v * 3 + 2] = Math.sin(a) * r;
        pk[v * 4] = k === 1 || k === 2 ? 1 : 0; pk[v * 4 + 1] = k >= 2 ? 1 : 0; pk[v * 4 + 2] = on ? p.s : 0; pk[v * 4 + 3] = p.ph; }
    });
    puffGeo.attributes.position.needsUpdate = puffGeo.attributes.corner.needsUpdate = true;
  }

  // ---------- blocking tree line: three staggered rows of big dark pines (no colliders: the zone clamp holds the player) ----------
  // split into angular sectors (one InstancedMesh pair each) so only the part of the ring in view is drawn
  const SECT = 16, SCAP = 96;
  const sectors = [];
  for (let k = 0; k < SECT; k++) {
    const tr = new THREE.InstancedMesh(W.geo.trunkGeo, W.mats.barkMat, SCAP), cr = new THREE.InstancedMesh(W.geo.pineGeo, W.mats.leafMat, SCAP);
    for (const m of [tr, cr]) { m.receiveShadow = true; m.count = 0; m.boundingSphere = new THREE.Sphere(); root.add(m); }
    sectors.push({ tr, cr, n: 0 });
  }
  let line = [];
  const o3 = new THREE.Object3D();
  const skip = (x, z) => {
    for (const c of CAVE_SITES) if (Math.hypot(x - c.x, z - c.z) < c.Ro + 1.6) return true;
    return Math.hypot(x - MOUNTAIN.gate.x, z - MOUNTAIN.gate.z) < 8.5;
  };
  function layout(R) {
    const rand = rng(Math.round(R * 31) + 7); line = [];
    for (const S of sectors) S.n = 0;
    for (const [off, sp] of [[1.6, 2.5], [3.9, 2.7], [6.4, 3.4]]) {
      const rr = R + off, n = Math.floor(Math.PI * 2 * rr / sp);
      for (let i = 0; i < n; i++) {
        const a = (i + rand() * 0.6) / n * Math.PI * 2, r2 = rr + (rand() - 0.5) * 1.2, x = Math.cos(a) * r2, z = Math.sin(a) * r2;
        if (skip(x, z)) continue;
        const S = sectors[Math.floor(((a % (Math.PI * 2)) / (Math.PI * 2)) * SECT) % SECT]; if (S.n >= SCAP) continue;
        const s = 1.15 + rand() * 0.6;
        const t = { x, z, s, sy: s * (1.0 + rand() * 0.45), rot: rand() * 6.28, delay: rand() * 0.5, S, j: S.n++ };
        S.cr.setColorAt(t.j, tmpC.setHSL(0.37 + rand() * 0.04, 0.34, 0.1 + rand() * 0.06)); line.push(t);
      }
    }
    sectors.forEach((S, k) => {
      S.tr.count = S.cr.count = S.n; if (S.cr.instanceColor) S.cr.instanceColor.needsUpdate = true;
      const am = (k + 0.5) / SECT * Math.PI * 2, rc = R + 4;
      for (const m of [S.tr, S.cr]) m.boundingSphere.set(new THREE.Vector3(Math.cos(am) * rc, 4, Math.sin(am) * rc), rc * Math.sin(Math.PI / SECT) + 14);
    });
  }
  function place(rise) { // rise 0 = sunk below the ground, 1 = standing
    for (const t of line) {
      const k = Math.max(0, Math.min(1, (rise - t.delay * (1 - rise)))), e = k * k * (3 - 2 * k);
      o3.position.set(t.x, -(1 - e) * 8 * t.sy, t.z); o3.rotation.set((1 - e) * 0.25, t.rot, 0); o3.scale.set(t.s, t.sy, t.s); o3.updateMatrix();
      t.S.tr.setMatrixAt(t.j, o3.matrix); t.S.cr.setMatrixAt(t.j, o3.matrix);
    }
    for (const S of sectors) S.tr.instanceMatrix.needsUpdate = S.cr.instanceMatrix.needsUpdate = true;
  }
  layout(startR); place(1);

  let rise = 1, phase = 'idle', gapOpen = 0;
  bar.moveTo = (R, instant = false) => {
    bar.target = R;
    if (instant) { bar.visR = R; layout(R); rise = 1; place(1); phase = 'idle'; return; }
    phase = 'sink';
  };
  bar.state = () => ({ R: bar.target, visR: +bar.visR.toFixed(2), phase, trees: line.length });
  bar.setGapOpen = (v) => { gapOpen = v; };

  bar.update = (dt) => {
    const t = G.time;
    // level-up: old tree line sinks, fog rolls outward, new line rises when the fog arrives
    if (phase === 'sink') { rise = Math.max(0, rise - dt / 1.3); place(rise); if (rise <= 0) { phase = 'roll'; } }
    if (phase === 'roll' || phase === 'sink') {
      const d = bar.target - bar.visR; bar.visR += Math.sign(d) * Math.min(Math.abs(d), dt * (3 + Math.abs(d) * 0.4)); // ~4 s to roll out to the new edge
      if (phase === 'roll' && Math.abs(bar.target - bar.visR) < 0.05) { bar.visR = bar.target; layout(bar.target); phase = 'rise'; rise = 0; }
    }
    if (phase === 'rise') { rise = Math.min(1, rise + dt / 1.6); place(rise); if (rise >= 1) phase = 'idle'; }

    // colour: a darker, denser version of whatever the sky fog is doing right now
    const f = scene.fog, dark = G.daynight ? G.daynight.darkness || 0 : 0;
    if (f) { tmpD.copy(darkDay).lerp(darkNight, dark); tmpC.copy(tmpD).lerp(f.color, 0.03 + dark * 0.2); } // (linear space: keep it really dark)
    const top = tmpD.copy(f ? f.color : tmpC).lerp(tmpC, 0.3);
    // the Mountain Gate always cuts a gap in the L4 wall; once open, the pass through it is clear
    const atGate = Math.abs(bar.visR - MOUNTAIN.gateR) < 3;
    if (Math.abs(puffR - bar.visR) > 0.01) placePuffs(bar.visR);
    puffU.uCol.value.copy(tmpC).lerp(top, 0.2); puffU.uOp.value = 0.8 - dark * 0.15; puffU.uT.value = t;
    for (const w of walls) {
      const u = w.u; w.m.scale.set(bar.visR + w.off, 1, bar.visR + w.off);
      u.uT.value = t; u.uR.value = bar.visR + w.off; u.uCol.value.copy(tmpC); u.uTop.value.copy(top); u.uCam.value.copy(G.camera.position);
      const FL = G.flashlight; if (FL) { u.uFlPos.value.copy(FL.origin); u.uFlDir.value.copy(FL.dir); u.uFlPow.value = (FL.on ? FL.lit || 0 : 0) * (0.35 + 0.65 * dark); u.uFlCos.value = Math.cos((FL.angle || 0.44) * 1.05); }
      u.uGap.value.set(MOUNTAIN.a, (gapOpen ? 6.5 : 4.2) / (bar.visR + w.off), atGate ? 1 : 0);
    }
  };
  return bar;
}
