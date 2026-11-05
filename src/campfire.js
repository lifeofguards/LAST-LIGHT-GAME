// Campfire: fuel, particle flames, embers, smoke, warm flickering light whose radius (the safe zone) shrinks with fuel,
// a glowing safe-zone ring on the ground, a billboard fuel meter, thrown-log feeding with a flare-up, and the dread of it dying.
import * as THREE from '../vendor/three.module.js';

export function glowTexture(inner = 'rgba(255,200,120,1)', outer = 'rgba(255,120,40,0)') {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, inner); g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)')); g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// soft teardrop "flame lick" texture (white, tinted per sprite)
function flameTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 92, 2, 32, 80, 60);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.45, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.beginPath(); x.moveTo(32, 4);
  x.bezierCurveTo(46, 40, 62, 70, 58, 96); x.bezierCurveTo(54, 124, 10, 124, 6, 96); x.bezierCurveTo(2, 70, 18, 40, 32, 4); x.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  for (let i = 0; i < 6; i++) {
    const cx = 20 + Math.random() * 24, cy = 20 + Math.random() * 24, r = 14 + Math.random() * 14;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(cv);
}

const RING_VS = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const RING_FS = `
uniform float uR, uT, uDanger, uAlpha, uPulse, uFade;
uniform vec3 uThA, uThB; // (angle, strength, 0): a creature pressing against the edge heats that arc red
varying vec2 vP;
float arcHit(vec3 th, float a){ float da = abs(mod(a - th.x + 3.14159265, 6.2831853) - 3.14159265); return th.y * smoothstep(0.55, 0.0, da); }
void main(){
  // soft warm firelight falloff on the ground (no drawn edge): bright orange near the pit, fading to dark
  // by the safe radius. The radius is steady; only the overall intensity flickers, so the edge never jumps.
  float d = length(vP);
  float a = atan(vP.y, vP.x);
  float n = d / max(uR, 0.001);
  float fall = 1.0 - smoothstep(0.0, 1.12, n);
  float glow = pow(fall, 1.7);
  float flick = 0.86 + 0.07 * sin(uT * 11.3) + 0.05 * sin(uT * 17.9 + 1.3) + 0.03 * sin(uT * 29.1 + 2.1);
  float threat = max(arcHit(uThA, a), arcHit(uThB, a)) * smoothstep(0.55, 1.0, n) * (1.0 - smoothstep(1.0, 1.25, n));
  vec3 hot = vec3(1.0, 0.56, 0.2), cool = vec3(0.62, 0.2, 0.05);
  vec3 col = mix(cool, hot, glow);
  col = mix(col, vec3(0.75, 0.08, 0.03), clamp(uDanger * 0.6 + threat, 0.0, 1.0));
  float alpha = (glow * 0.5 * flick * (1.0 - uDanger * 0.25) + threat * 0.18 + glow * uPulse * 0.5) * uAlpha * uFade;
  // CRISP safe-zone edge: a bright line exactly at the light radius (world-space width, AA'd), with a soft
  // inner halo. Gold when healthy, red + pulsing faster as fuel runs low, flashes on a log feed.
  float e = d - uR;
  float aa = max(fwidth(d), 0.02);
  float line = 1.0 - smoothstep(0.13 - aa, 0.13 + aa, abs(e));
  float halo = exp(-abs(e) * 2.2) * step(e, 0.0) * 0.35 + exp(-abs(e) * 5.0) * 0.25;
  // dashes rotate slowly so the ring reads as a boundary, not a light falloff
  float dash = 0.72 + 0.28 * smoothstep(-0.2, 0.2, sin(a * floor(uR * 2.2) + uT * 0.6));
  float pulseSpd = mix(1.6, 7.0, uDanger);
  float pulse = mix(1.0, 0.45 + 0.55 * (0.5 + 0.5 * sin(uT * pulseSpd)), uDanger);
  vec3 edgeCol = mix(vec3(1.0, 0.78, 0.38), vec3(1.0, 0.1, 0.04), clamp(uDanger + threat, 0.0, 1.0));
  float edgeA = (line * dash + halo) * pulse * (0.9 + uPulse * 0.8) * max(uAlpha, 0.55) * uFade;
  col = col * alpha + edgeCol * edgeA;
  alpha = min(1.0, alpha + edgeA);
  gl_FragColor = vec4(col, alpha);
}`;

export function createCampfire(G) {
  const { scene } = G;
  const fire = { x: 0, z: 0, fuel: 70, maxFuel: 100, logValue: 22, flare: 0, level: 1 }; // level: fire level 1-4 (progression.js feeds it)
  const root = new THREE.Group(); scene.add(root);
  const P0 = () => G.controls.pos;

  // ---------- pit: stones, logs, coals ----------
  const stoneMat = new THREE.MeshLambertMaterial({ color: '#4f4c48', flatShading: true });
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34, 0), stoneMat);
    s.position.set(Math.cos(a) * 1.18, 0.14, Math.sin(a) * 1.18); s.scale.set(1.1, 0.72, 0.9 + (i % 3) * 0.1); s.rotation.set(a, a * 2, 0); s.castShadow = true; root.add(s);
  }
  const bark = new THREE.MeshLambertMaterial({ color: '#4d3320', flatShading: true });
  // ---------- fire levels: the pit grows as the fire levels up ----------
  // L2: a second, stacked stone course · L3: a paved hearth ring · L4: four standing stones with ember-lit cracks
  const tiers = [null, new THREE.Group(), new THREE.Group(), new THREE.Group()];
  for (let i = 1; i < 4; i++) { tiers[i].visible = false; root.add(tiers[i]); }
  const runeMat = new THREE.MeshBasicMaterial({ color: '#ff8a2a', toneMapped: false });
  { const hearth = new THREE.MeshLambertMaterial({ color: '#5d5a55', flatShading: true });
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.17, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), stoneMat);
      s.position.set(Math.cos(a) * 1.22, 0.4, Math.sin(a) * 1.22); s.scale.set(1.05, 0.62, 0.85); s.rotation.set(a * 1.3, a, 0.3); s.castShadow = true; tiers[1].add(s); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 0), hearth);
      s.position.set(Math.cos(a) * 2.05, 0.03, Math.sin(a) * 2.05); s.scale.set(1.15, 0.16, 0.9); s.rotation.set(0, -a, 0); s.receiveShadow = true; tiers[2].add(s); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, g = new THREE.Group(); g.position.set(Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0); g.rotation.y = -a;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.7, 0.4), stoneMat); st.position.y = 0.85; st.rotation.z = 0.05 * (i % 2 ? 1 : -1); st.castShadow = true; g.add(st);
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.33, 0), stoneMat); cap.position.y = 1.75; cap.scale.set(1, 0.5, 0.8); g.add(cap);
      for (const [y, h] of [[0.55, 0.32], [1.05, 0.22], [1.38, 0.14]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.03), runeMat); r.position.set(0, y, -0.21); g.add(r); }
      tiers[3].add(g); g.userData.coll = { x: g.position.x, z: g.position.z, r: 0.35 }; }
  }
  // shockwave ring that rolls out across the ground on a level-up
  const waveMat = new THREE.MeshBasicMaterial({ color: '#ffc457', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), waveMat); wave.position.y = 0.12; wave.visible = false; root.add(wave);
  let waveT = -1;
  // charred wood: near-black, matte, lit only dimly by the flames; a faint ember glow that dies with the fire
  const charMat = new THREE.MeshLambertMaterial({ color: '#120b07', flatShading: true, emissive: '#6a1a04', emissiveIntensity: 0.35 });
  const charMat2 = new THREE.MeshLambertMaterial({ color: '#1a110b', flatShading: true, emissive: '#6a1a04', emissiveIntensity: 0.2 });
  const ashMat = new THREE.MeshLambertMaterial({ color: '#3a3430', flatShading: true });
  const pitLogs = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 1.3, 6), i % 2 ? charMat2 : charMat);
    l.position.set(Math.cos(a) * 0.4, 0.42, Math.sin(a) * 0.4); l.lookAt(0, 1.25, 0); l.rotateX(Math.PI / 2); l.castShadow = true; root.add(l); pitLogs.push(l);
    // grey ash tips where the wood has burned through
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.22, 6), ashMat); tip.position.y = 0.72; l.add(tip);
  }
  const ash = new THREE.Mesh(new THREE.CircleGeometry(0.95, 16), new THREE.MeshLambertMaterial({ color: '#2a221c' })); ash.rotation.x = -Math.PI / 2; ash.position.y = 0.02; root.add(ash);
  // glowing coals bed (stays faintly red when the fire is out)
  const coalMat = new THREE.MeshBasicMaterial({ color: '#ff5a18', fog: false, toneMapped: false });
  const deadCoal = new THREE.Color('#1d1a18');
  const coals = new THREE.Group(); root.add(coals);
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.1 + Math.random() * 0.06, 0), coalMat);
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.55; c.position.set(Math.cos(a) * r, 0.07, Math.sin(a) * r); coals.add(c);
  }

  // ---------- flames: rising, shrinking, colour-shifting licks + a hot core ----------
  const fTex = flameTexture();
  const flames = new THREE.Group(); flames.position.y = 0.2; root.add(flames);
  const NF = 26, licks = [];
  const cHot = new THREE.Color('#ffd23a'), cMid = new THREE.Color('#ff8a1a'), cCool = new THREE.Color('#e0360a');
  const cLowHot = new THREE.Color('#ff7a18'), cLowCool = new THREE.Color('#b82206'), tmpA = new THREE.Color(), tmpB = new THREE.Color();
  for (let i = 0; i < NF; i++) {
    const m = new THREE.SpriteMaterial({ map: fTex, color: '#ff8a1a', blending: THREE.NormalBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false });
    const s = new THREE.Sprite(m); flames.add(s);
    licks.push({ s, life: Math.random(), dur: 0.5 + Math.random() * 0.45, ox: 0, oz: 0, w: 0.5, sway: Math.random() * 6 });
  }
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: fTex, color: '#ffc848', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.45, toneMapped: false }));
  core.position.y = 0.55; flames.add(core);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,150,60,0.8)', 'rgba(255,90,20,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
  glow.position.y = 0.9; root.add(glow);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(255,150,70,0.55)', 'rgba(255,100,30,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.05; root.add(pool);
  // warm TINT layer (normal blend): pulls the green grass inside the ring toward a cozy orange instead of olive/khaki
  const tCv = document.createElement('canvas'); tCv.width = tCv.height = 128; { const x = tCv.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,150,50,1)'); g.addColorStop(0.55, 'rgba(255,105,25,0.85)'); g.addColorStop(0.85, 'rgba(230,70,15,0.45)'); g.addColorStop(1, 'rgba(200,50,10,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const tTex = new THREE.CanvasTexture(tCv); tTex.colorSpace = THREE.SRGBColorSpace;
  const tintMat = new THREE.MeshBasicMaterial({ map: tTex, transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const tint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tintMat); tint.rotation.x = -Math.PI / 2; tint.position.y = 0.045; tint.renderOrder = 1; root.add(tint);

  const light = new THREE.PointLight('#ff7a26', 60, 30, 1.1); light.position.set(0, 1.4, 0); light.castShadow = false; root.add(light);
  // second, low 'bounce' light: warms faces/legs of the player and props near the fire (no painted floor)
  const bounce = new THREE.PointLight('#ff9a4a', 10, 12, 1.4); bounce.position.set(0, 0.5, 0); root.add(bounce);
  fire.light = light;

  // ---------- safe-zone ring on the ground ----------
  const ringU = { uR: { value: 10 }, uT: { value: 0 }, uDanger: { value: 0 }, uAlpha: { value: 1 }, uPulse: { value: 0 }, uFade: { value: 1 }, uThA: { value: new THREE.Vector3() }, uThB: { value: new THREE.Vector3() } };
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.ShaderMaterial({
    uniforms: ringU, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07; ring.renderOrder = 2; root.add(ring);

  // ---------- embers ----------
  const N = 70, ep = new Float32Array(N * 3), ev = [];
  for (let i = 0; i < N; i++) ev.push({ life: Math.random() * 2, vx: 0, vz: 0, vy: 0 });
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(eg, new THREE.PointsMaterial({ map: glowTexture('rgba(255,230,160,1)', 'rgba(255,140,40,0)'), color: '#ffb050', size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  root.add(embers);
  const spawnEmber = (i, burst) => {
    const e = ev[i]; e.life = burst ? 0.8 + Math.random() * 1.2 : 1 + Math.random() * 1.6;
    ep[i * 3] = (Math.random() - .5) * .6; ep[i * 3 + 1] = 0.4; ep[i * 3 + 2] = (Math.random() - .5) * .6;
    const sp = burst ? 2.2 : 0.5; e.vx = (Math.random() - .5) * sp; e.vz = (Math.random() - .5) * sp; e.vy = (burst ? 2.5 : 1) + Math.random() * (burst ? 3 : 1.6);
  };

  // ---------- smoke ----------
  const sTex = smokeTexture(), NS = 16, puffs = [];
  for (let i = 0; i < NS; i++) {
    const m = new THREE.SpriteMaterial({ map: sTex, color: '#6b625c', transparent: true, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(m); root.add(s);
    puffs.push({ s, life: Math.random() * 4, dur: 4, vx: 0, vz: 0, rot: 0 });
  }
  let snuff = 0; // thick smoke burst when the fire dies

  // ---------- billboard fuel meter ----------
  const mCv = document.createElement('canvas'); mCv.width = 256; mCv.height = 64; const mx = mCv.getContext('2d');
  const mTex = new THREE.CanvasTexture(mCv); mTex.colorSpace = THREE.SRGBColorSpace;
  const meter = new THREE.Sprite(new THREE.SpriteMaterial({ map: mTex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  meter.scale.set(2.4, 0.6, 1); meter.position.y = 3.3; meter.renderOrder = 10; root.add(meter); fire.meter = meter; // ui.js hides it while full-screen overlays / phase cards are up
  let lastDrawn = -1, lastBlink = -1;
  const rr = (x0, y0, w, h, r) => { mx.beginPath(); mx.moveTo(x0 + r, y0); mx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); mx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); mx.arcTo(x0, y0 + h, x0, y0, r); mx.arcTo(x0, y0, x0 + w, y0, r); mx.closePath(); };
  const drawMeter = (fuel, blink) => {
    mx.clearRect(0, 0, 256, 64);
    rr(4, 10, 248, 44, 22); mx.fillStyle = 'rgba(15,10,8,0.72)'; mx.fill(); mx.lineWidth = 4; mx.strokeStyle = fuel < 25 && blink ? '#ff4a2a' : 'rgba(255,255,255,0.85)'; mx.stroke();
    // fire icon (vanishes when out)
    if (fuel > 0) {
      mx.save(); mx.translate(32, 32); mx.fillStyle = '#ff7a2a'; mx.beginPath(); mx.moveTo(0, -17); mx.bezierCurveTo(8, -6, 13, 0, 12, 8); mx.bezierCurveTo(10, 18, -10, 18, -12, 8); mx.bezierCurveTo(-13, 0, -6, -4, 0, -17); mx.fill();
      mx.fillStyle = '#ffd060'; mx.beginPath(); mx.moveTo(0, -3); mx.bezierCurveTo(5, 3, 7, 6, 6, 10); mx.bezierCurveTo(4, 15, -4, 15, -6, 10); mx.bezierCurveTo(-6, 6, -3, 3, 0, -3); mx.fill(); mx.restore();
    } else { mx.fillStyle = '#ff5040'; mx.font = 'bold 22px sans-serif'; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.fillText('OUT', 32, 33); }
    if (fire.level > 1) { mx.beginPath(); mx.arc(46, 46, 10, 0, Math.PI * 2); mx.fillStyle = '#ffc247'; mx.fill(); mx.lineWidth = 2; mx.strokeStyle = 'rgba(15,10,8,0.9)'; mx.stroke();
      mx.fillStyle = '#2a1608'; mx.font = 'bold 14px sans-serif'; mx.textAlign = 'center'; mx.textBaseline = 'middle'; mx.fillText(String(fire.level), 46, 47); }
    rr(58, 22, 180, 20, 10); mx.fillStyle = 'rgba(255,255,255,0.12)'; mx.fill();
    if (fuel > 0) {
      const w = Math.max(20, 180 * fuel / 100); rr(58, 22, w, 20, 10);
      const g = mx.createLinearGradient(58, 0, 238, 0);
      if (fuel < 25) { g.addColorStop(0, '#ff2a1a'); g.addColorStop(1, '#ff6a2a'); } else { g.addColorStop(0, '#ff6a1a'); g.addColorStop(1, '#ffd060'); }
      mx.fillStyle = g; mx.fill();
      rr(62, 25, Math.max(10, w - 8), 6, 3); mx.fillStyle = 'rgba(255,255,255,0.35)'; mx.fill();
    }
    mTex.needsUpdate = true;
  };

  // ---------- thrown logs (feeding) ----------
  const flying = [];
  const logGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.9, 6);
  const throwLog = () => {
    const p = P0(), m = new THREE.Mesh(logGeo, bark); m.castShadow = true;
    const from = new THREE.Vector3(p.x, (p.y || 0) + 1.3, p.z); m.position.copy(from); scene.add(m);
    flying.push({ m, from, t: 0, dur: 0.42, spin: (Math.random() - .5) * 14 });
  };
  const land = (f) => {
    scene.remove(f.m); fire.flare = 1; ringU.uPulse.value = 1;
    for (let k = 0, n = 0; k < N && n < 26; k++) if (ev[k].life < 0.9 || Math.random() < 0.3) { spawnEmber(k, true); n++; }
    for (let k = 0; k < 3; k++) { const pf = puffs[(Math.random() * NS) | 0]; pf.life = 0; }
    G.events.emit('fireFlare');
  };

  G.world.addCollider({ x: 0, z: 0, r: 1.1 });

  fire.lightRadius = () => fire.fuel > 0 ? 4 + fire.fuel * 0.13 + (fire.level - 1) * 1.3 : 0;       // safe-zone radius (a bigger fire lights a bit more ground)
  fire.inLight = (p, pad = 0) => Math.hypot(p.x - fire.x, p.z - fire.z) < fire.lightRadius() - pad;
  fire.feed = () => {
    const inv = G.survival.inventory; if (inv.logs <= 0) return false;
    const wasOut = fire.fuel <= 0;
    inv.logs--; fire.fuel = Math.min(fire.maxFuel, fire.fuel + fire.logValue);
    throwLog(); G.events.emit('fireFed', { fuel: fire.fuel, relit: wasOut }); return true;
  };
  fire.getInteraction = (p) => {
    const d = Math.hypot(p.x - fire.x, p.z - fire.z) - 1.1;
    if (d > 2.6) return null;
    const logs = G.survival.inventory.logs;
    if (logs > 0) {
      const lv = G.progression && G.progression.levelInfo ? G.progression.levelInfo() : null, xp = lv && !lv.max ? ` · ${lv.left} more to Lv ${lv.level + 1}` : '';
      // a full fire still takes logs while it is levelling up (the extra wood stokes it toward the next level)
      if (fire.fuel >= fire.maxFuel - 1) return lv && !lv.max ? { dist: d, label: `[E] Add log to fire (full)${xp}`, action: fire.feed } : { dist: d, label: 'The fire is roaring — full!', disabled: true, action: () => {} };
      return { dist: d, label: `[E] ${fire.fuel <= 0 ? 'Relight the fire' : 'Add log to fire'} (${Math.round(fire.fuel)}%)${xp}`, action: fire.feed };
    }
    const lv = G.progression && G.progression.levelInfo ? G.progression.levelInfo() : null;
    return { dist: d + 1, label: fire.fuel <= 0 ? 'The fire is out! Bring logs to relight it' : fire.fuel < 60 || !lv || lv.max ? 'Fire needs logs — chop trees with the axe' : `Fire Lv ${lv.level} · ${lv.left} more log${lv.left === 1 ? '' : 's'} to Lv ${lv.level + 1}`, disabled: true, action: () => {} };
  };

  // level 1-4: show the pit tier, and on a real level-up flare hard, burst embers and roll a shockwave outward
  const tierColl = [];
  fire.setLevel = (n, celebrate = false) => {
    fire.level = Math.max(1, Math.min(4, n | 0));
    for (let i = 1; i < 4; i++) tiers[i].visible = fire.level > i;
    for (const c of tierColl) G.world.removeCollider(c); tierColl.length = 0;
    if (fire.level >= 4) for (const g of tiers[3].children) tierColl.push(G.world.addCollider({ ...g.userData.coll }));
    lastDrawn = -1;
    if (!celebrate) return;
    fire.flare = 1.7; ringU.uPulse.value = 1; waveT = 0; wave.visible = true;
    for (let k = 0; k < N; k++) { spawnEmber(k, true); ev[k].vy *= 1.6; ev[k].life += 0.6; }
    for (let k = 0; k < NS; k++) puffs[k].life = Math.random() * 0.3;
    G.events.emit('fireFlare');
  };
  let t = 0, wasOut = false, visR = fire.lightRadius(), ringR = visR, sputter = 1, sputterT = 0;
  fire.update = (dt) => {
    t += dt;
    const night = G.daynight.phase === 'night', dark = G.daynight.darkness || 0;
    if (G.mode === 'playing') fire.fuel = Math.max(0, fire.fuel - dt * (night ? Math.min(1.4, 0.8 + 0.07 * Math.max(0, (G.daynight.night || 1) - 1)) : 0.45)); // integration: gentler first night, ramps to ~1.08/s by night 5
    const out = fire.fuel <= 0;
    if (out !== wasOut) { wasOut = out; G.events.emit(out ? 'fireOut' : 'fireLit'); if (out) snuff = 1; }
    fire.flare = Math.max(0, fire.flare - dt * 1.1);
    snuff = Math.max(0, snuff - dt * 0.25);
    ringU.uPulse.value = Math.max(0, ringU.uPulse.value - dt * 1.4);

    // warmth: resting right by the fire slowly heals
    const p = P0(), pd = Math.hypot(p.x - fire.x, p.z - fire.z);
    if (!out && G.mode === 'playing' && pd < 4.5 && G.survival.stats.health > 0) G.survival.stats.health = Math.min(100, G.survival.stats.health + dt * 0.17); // small bonus right at the fire (survival owns ring healing)

    // low fuel: the flame sputters (random dips), stronger the lower it gets
    const low = out ? 0 : Math.max(0, 1 - fire.fuel / 25);
    sputterT -= dt;
    if (sputterT <= 0) { sputterT = 0.08 + Math.random() * 0.25; sputter = Math.random() < low * 0.6 ? 0.45 + Math.random() * 0.3 : 1; }
    const k = Math.min(1, fire.fuel / 60);
    // flame body scales with fuel: tall yellow-orange blaze when full, low guttering orange tongues below 25%
    const hN = out ? 0 : Math.min(1, fire.fuel / 80);
    const lvK = 1 + (fire.level - 1) * 0.1; // each fire level burns a little taller and wider
    const hgt = out ? 0 : (0.2 + Math.pow(hN, 1.3) * 2.3 + fire.flare * 0.8) * (0.8 + 0.2 * sputter) * lvK;   // how high licks rise
    const wid = out ? 0 : (0.42 + Math.min(1, fire.fuel / 60) * 0.95 + fire.flare * 0.35) * (0.85 + 0.15 * sputter) * (1 + (fire.level - 1) * 0.08);
    const hotK = out ? 0 : Math.min(1, Math.max(0, (fire.fuel - 8) / 40) + fire.flare);        // 0 = deep orange/red, 1 = yellow core
    const active = out ? 0 : Math.round(NF * Math.min(1, 0.4 + fire.fuel / 40 + fire.flare));   // fewer licks when low
    const spread = 0.14 + Math.min(1, fire.fuel / 60) * 0.34;
    const s = hgt; // (kept for glow/core sizing below)

    // flame licks
    flames.visible = !out;
    tmpA.copy(cLowHot).lerp(cHot, hotK); tmpB.copy(cLowCool).lerp(cCool, hotK);
    for (let i = 0; i < NF; i++) {
      const L = licks[i];
      L.life += dt / L.dur;
      if (L.life >= 1) { L.life = 0; L.dur = (0.45 + Math.random() * 0.45) * (0.8 + 0.2 * hN); const a = Math.random() * 6.28, r = Math.random() * spread; L.ox = Math.cos(a) * r; L.oz = Math.sin(a) * r; L.w = 0.75 + Math.random() * 0.45; }
      const on = i < active;
      L.s.visible = on; if (!on) continue;
      const u = L.life, rise = u * (0.25 + hgt * 1.15);
      const cen = Math.max(0, 1 - Math.hypot(L.ox, L.oz) / (spread + 0.02)); // centre licks are taller/hotter
      L.s.position.set(L.ox * (1 - u * 0.7) + Math.sin(t * 5 + L.sway) * 0.06 * u, rise + 0.08, L.oz * (1 - u * 0.7));
      const sz = L.w * wid * (1 - u * 0.62) * (0.8 + cen * 0.35) * (1 + hN * 0.35);
      L.s.scale.set(sz, sz * (1.1 + hN * 0.8 + cen * 0.5 + fire.flare * 0.4), 1);
      const c = L.s.material.color; if (u < 0.35) c.copy(tmpA).lerp(cMid, u / 0.35 * (0.4 + 0.6 * hotK)); else c.copy(cMid).lerp(tmpB, (u - 0.35) / 0.65);
      if (hotK < 1) c.lerp(tmpB, (1 - hotK) * 0.35 * u);
      L.s.material.opacity = Math.min(1, u * 7) * Math.pow(1 - u, 0.8) * (0.8 + 0.15 * hotK);
    }
    const cf = 1 + Math.sin(t * 14) * 0.06 + Math.sin(t * 31) * 0.04;
    core.scale.set(0.75 * wid * cf, (0.5 + hgt * 0.9) * cf * (1 + fire.flare * 0.3), 1); core.position.y = 0.2 + hgt * 0.3;
    core.material.color.copy(cLowHot).lerp(cHot, hotK); core.material.opacity = 0.2 + 0.3 * hotK;

    // light flicker (~8-12 Hz jitter, smoothed) + flare + sputter
    const flick = (1 + Math.sin(t * 17) * 0.05 + Math.sin(t * 7.3) * 0.07 + Math.sin(t * 11.1 + 1.3) * 0.04) * (0.7 + 0.3 * sputter);
    const R = fire.lightRadius();
    visR += (R - visR) * Math.min(1, dt * 3);
    if (out) visR = 0;
    // REAL light: smooth physical falloff that reaches ~0 right at the safe-zone edge (window cutoff = distance), shrinks with fuel
    const rN = Math.min(1, visR / 17);
    light.intensity = out ? 0 : (22 + visR * 5.5 + fire.flare * 90) * flick * (0.85 + dark * 0.35);
    light.color.setRGB(1, 0.5 + 0.1 * hotK, 0.2 + 0.06 * hotK); // warm firelight; lit surfaces keep their own colour
    light.decay = 1.25;
    light.distance = out ? 0.01 : visR * 1.3 + 1.5 + fire.flare * 4;
    light.position.set(Math.sin(t * 9) * 0.12, 1.6 + hgt * 0.35 + Math.sin(t * 13) * 0.06, Math.cos(t * 8) * 0.12); // moving light = living shadows
    // firelight bouncing back onto the player's camera-facing side, so they aren't a black cut-out in front of the blaze
    { const cam = G.camera.position, bx = p.x + (cam.x - p.x) * 0.3 - fire.x, bz = p.z + (cam.z - p.z) * 0.3 - fire.z;
      const inK = out ? 0 : Math.max(0, 1 - pd / Math.max(1, visR * 1.1));
      bounce.position.set(bx, 2.2, bz);
      bounce.intensity = (3 + rN * 5 + fire.flare * 8) * inK * flick * (0.4 + dark * 0.8);
      bounce.distance = 4.5; bounce.decay = 1.5; bounce.color.setRGB(1, 0.58, 0.3); }
    glow.visible = !out;
    glow.scale.setScalar(out ? 0.001 : (1.1 + hN * 3.4 + fire.flare * 1.8) * flick);
    glow.position.y = 0.5 + hgt * 0.45;
    glow.material.opacity = (0.25 + dark * 0.3) * (0.5 + 0.5 * hotK);
    // only a small soft hot-spot under the flames (radiant heat on the ash), no flat painted floor
    pool.scale.setScalar(Math.max(0.01, (2.2 + hN * 2.2 + fire.flare * 1.5) * flick)); pool.visible = !out; poolMat.opacity = (0.15 + dark * 0.35) * (0.75 + 0.25 * sputter);
    tint.visible = false;
    if (out) coalMat.color.copy(deadCoal);
    else coalMat.color.setRGB(1, 0.22 + 0.1 * Math.sin(t * 2.3) + 0.1 * hotK, 0.05).multiplyScalar(0.55 + 0.45 * Math.min(1, fire.fuel / 30) * (0.8 + 0.2 * sputter));
    charMat.emissiveIntensity = out ? 0 : (0.12 + k * 0.3) * flick; charMat2.emissiveIntensity = out ? 0 : (0.06 + k * 0.18) * flick;

    // safe-zone ring
    // always visible while lit; shrinks smoothly with fuel, reddens + pulses faster as it dies,
    // and when the fire goes out it collapses inward and fades instead of vanishing.
    if (out) { ringR = Math.max(0, ringR - dt * (ringR * 1.6 + 2)); ringU.uFade.value = Math.max(0, ringU.uFade.value - dt * 0.9); }
    else { ringR = visR; ringU.uFade.value = Math.min(1, ringU.uFade.value + dt * 3); }
    ring.visible = ringU.uFade.value > 0.01 && ringR > 0.3;
    ringU.uR.value = ringR; ringU.uT.value = t;
    const dangerT = out ? 1 : Math.min(1, Math.max(0, (35 - fire.fuel) / 20));
    ringU.uDanger.value += (dangerT - ringU.uDanger.value) * Math.min(1, dt * 2);
    ringU.uAlpha.value = 0.12 + dark * 0.88; // barely there by day, real firelight pool at night
    // creatures pressing on the edge heat that arc of the ring
    const ths = [ringU.uThA.value, ringU.uThB.value], mons = [G.deer, G.bear];
    for (let i = 0; i < 2; i++) {
      const mp = mons[i]?.pos;
      let str = 0, ang = 0;
      if (mp && !out && night) { const dx = mp.x - fire.x, dz = mp.z - fire.z, md = Math.hypot(dx, dz); ang = Math.atan2(-dz, dx); str = Math.max(0, 1 - Math.abs(md - ringR) / 6); if (mons[i].root?.visible === false || mons[i].state === 'hidden' || mons[i].state === 'dead') str = 0; }
      ths[i].x = ang; ths[i].y += (str - ths[i].y) * Math.min(1, dt * 3);
    }

    // level-up shockwave + ember-lit cracks in the standing stones
    if (waveT >= 0) { waveT += dt / 1.8; const e = 1 - Math.pow(1 - Math.min(1, waveT), 3); wave.scale.setScalar(1.5 + e * 46); waveMat.opacity = (1 - Math.min(1, waveT)) * 0.85; if (waveT >= 1) { waveT = -1; wave.visible = false; } }
    if (fire.level >= 4) runeMat.color.setRGB(1, 0.45 + 0.1 * Math.sin(t * 2.1), 0.12).multiplyScalar(out ? 0.15 : 0.55 + 0.45 * Math.min(1, fire.fuel / 40) * (0.85 + 0.15 * Math.sin(t * 7)));

    // embers
    for (let i = 0; i < N; i++) {
      const e = ev[i]; e.life -= dt;
      if (e.life <= 0) { if (out || Math.random() > 0.25 + 0.75 * Math.min(1, fire.fuel / 40)) { ep[i * 3 + 1] = -50; e.life = 0.3; continue; } spawnEmber(i, false); }
      ep[i * 3] += (e.vx + Math.sin(t * 3 + i) * 0.3) * dt; ep[i * 3 + 1] += e.vy * dt; ep[i * 3 + 2] += e.vz * dt;
      e.vx *= 1 - dt * 0.6; e.vz *= 1 - dt * 0.6;
    }
    eg.attributes.position.needsUpdate = true; embers.visible = !out; embers.material.size = 0.14 + k * 0.1 + fire.flare * 0.08;

    // smoke: thin wisps normally, a thick column right after the fire dies or on a fresh log
    const smokeAmt = out ? snuff : 0.35 + low * 0.4 + fire.flare * 0.4;
    for (const pf of puffs) {
      pf.life += dt / pf.dur;
      if (pf.life >= 1) { pf.life = 0; pf.dur = 3.2 + Math.random() * 2; pf.vx = (Math.random() - .5) * 0.3 + 0.25; pf.vz = (Math.random() - .5) * 0.3; pf.rot = (Math.random() - .5); pf.s.material.rotation = Math.random() * 6; }
      const u = pf.life;
      pf.s.position.set(pf.vx * u * pf.dur, 1.5 + u * 5.5, pf.vz * u * pf.dur);
      pf.s.scale.setScalar(0.7 + u * 2.6);
      pf.s.material.rotation += pf.rot * dt;
      pf.s.material.opacity = Math.min(1, u * 5) * (1 - u) * 0.55 * smokeAmt;
      // warm underside near the flames at night
      pf.s.material.color.setRGB(0.42 + (1 - u) * 0.25 * dark * (out ? 0 : 1), 0.39 + (1 - u) * 0.08 * dark, 0.36);
    }

    // thrown logs arc into the fire
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]; f.t += dt / f.dur; const u = Math.min(1, f.t);
      f.m.position.set(f.from.x + (fire.x - f.from.x) * u, f.from.y + (0.5 - f.from.y) * u + Math.sin(u * Math.PI) * 1.4, f.from.z + (fire.z - f.from.z) * u);
      f.m.rotation.x += f.spin * dt; f.m.rotation.z += f.spin * 0.6 * dt;
      if (u >= 1) { land(f); flying.splice(i, 1); }
    }

    // billboard meter (redraw only when it visibly changes)
    const blink = fire.fuel < 25 && Math.floor(t * 3) % 2 === 0;
    const q = Math.round(fire.fuel * 2) / 2;
    if (q !== lastDrawn || blink !== lastBlink) { drawMeter(fire.fuel, blink); lastDrawn = q; lastBlink = blink; }
    const md = Math.hypot(G.camera.position.x - fire.x, G.camera.position.z - fire.z);
    const ms = 1 + Math.max(0, md - 10) * 0.035; meter.scale.set(2.4 * ms, 0.6 * ms, 1);
    meter.position.y = 3.1 + ms * 0.3 + fire.flare * 0.15;
  };
  // relight: replace any lingering "fire went out" warning right away
  G.events.on('fireLit', () => { if (G.mode === 'playing') G.ui?.toast?.('The fire roars back to life!', 2); });
  drawMeter(fire.fuel, false);
  return fire;
}
