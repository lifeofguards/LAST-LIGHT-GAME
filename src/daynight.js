// Day/night cycle: time of day, gradient sky dome, fog, sun/moon lighting, stars, night counter, phase events.
// Four readable phases (dawn / day / golden dusk / night) driven by keyframed palettes.
import * as THREE from '../vendor/three.module.js';

export const DAY_LEN = 150, NIGHT_LEN = 55, CYCLE = DAY_LEN + NIGHT_LEN, DAY_FRAC = DAY_LEN / CYCLE; // endless: no final night

// Keyframes across the whole cycle. `at` is in cycle position: day u (0..1) maps to [0, DAY_FRAC], night v maps to [DAY_FRAC, 1].
// zen = sky zenith, hor = horizon (also fog colour, so the tree line melts into the sky), glow = sun/moon halo colour.
const D = (u) => u * DAY_FRAC, N = (v) => DAY_FRAC + v * (1 - DAY_FRAC);
// ONE curve drives everything: `lum` (0 = true dark, 1 = full day) is interpolated with the same smoothstep as the sky
// colours, and sets hemi/sun intensity, fog, stars and dn.daylight/darkness (fire glow, beam, eyeshine, audio).
// Dusk is HELD at a readable violet with stars until the phase flips; the last light collapses over the NIGHT card (first ~2.6 s of night).
const KEYS = [
  // dawn relief: rose horizon, soft light returning (DAY card fires here)
  { at: D(0.00), lum: 0.42, zen: '#41538e', hor: '#f0a888', glow: '#ffbe7a', glowI: 1.1, sun: '#ffb77e', sunI: 0.8, hs: '#b9b6d6', hg: '#3a3a2c', hI: 0.7, near: 14, far: 85, stars: 0.2 },
  { at: D(0.08), lum: 0.85, zen: '#4f8fd6', hor: '#e6e2d2', glow: '#ffe6b0', glowI: 0.7, sun: '#ffe2b8', sunI: 2.2, hs: '#cfe6ff', hg: '#4a5a2a', hI: 1.3, near: 30, far: 140, stars: 0 },
  { at: D(0.18), lum: 1.00, zen: '#3a8ce6', hor: '#a9d6ee', glow: '#fff4d6', glowI: 0.45, sun: '#fff1d6', sunI: 2.7, hs: '#cfe6ff', hg: '#4f5f2c', hI: 1.5, near: 36, far: 155, stars: 0 },
  { at: D(0.58), lum: 1.00, zen: '#3f8ee0', hor: '#b8dcea', glow: '#fff0c8', glowI: 0.5, sun: '#fff0cf', sunI: 2.6, hs: '#d6e6f6', hg: '#4f5f2c', hI: 1.45, near: 36, far: 150, stars: 0 },
  // golden hour: long warm light, amber horizon — the "go home now" cue
  { at: D(0.70), lum: 0.92, zen: '#5a73b0', hor: '#ffb168', glow: '#ffb050', glowI: 1.2, sun: '#ffa24a', sunI: 2.3, hs: '#ffd2a0', hg: '#5a4a28', hI: 1.3, near: 32, far: 130, stars: 0 },
  // sunset: burning orange/pink band, purple zenith, fog closing in — still fully readable
  { at: D(0.82), lum: 0.74, zen: '#3c3674', hor: '#ec7a52', glow: '#ff6a38', glowI: 1.4, sun: '#ff7a48', sunI: 1.6, hs: '#c890a4', hg: '#3e2e26', hI: 1.05, near: 24, far: 110, stars: 0.12 },
  // violet dusk: held and readable, first stars out, the "getting dark" banner is up (~6 s before night)
  { at: D(0.93), lum: 0.52, zen: '#241f5c', hor: '#8a5684', glow: '#d0607a', glowI: 0.9, sun: '#9a78c0', sunI: 0.8, hs: '#7a74b4', hg: '#241e2a', hI: 0.78, near: 16, far: 82, stars: 0.6 },
  // last light: bruised violet, silhouettes still readable, stars bright (~1.3 s before night)
  { at: D(0.985), lum: 0.36, zen: '#17153f', hor: '#5a3a68', glow: '#a04a6a', glowI: 0.6, sun: '#7a68a8', sunI: 0.5, hs: '#5a5a96', hg: '#16141c', hI: 0.55, near: 12, far: 64, stars: 0.85 },
  // true night: the last light collapses across the NIGHT card (fires at nightfall, dark ~2.6 s later)
  { at: N(0.035), lum: 0.00, zen: '#02040c', hor: '#0c1428', glow: '#c8d4f0', glowI: 0.05, sun: '#8aa4e0', sunI: 0.32, hs: '#3a5290', hg: '#080a12', hI: 0.16, near: 3, far: 36, stars: 1 },
  { at: N(0.93), lum: 0.00, zen: '#02040c', hor: '#0c1428', glow: '#c8d4f0', glowI: 0.05, sun: '#8aa4e0', sunI: 0.32, hs: '#3a5290', hg: '#080a12', hI: 0.16, near: 3, far: 36, stars: 1 },
  // pre-dawn: first grey-violet relief in the east, ground brightening with it
  { at: N(1.00) - 1e-6, lum: 0.2, zen: '#1a2450', hor: '#6a5474', glow: '#e09080', glowI: 0.8, sun: '#a08ab8', sunI: 0.4, hs: '#6a6aa0', hg: '#1a1a1c', hI: 0.4, near: 8, far: 55, stars: 0.6 },
];
for (const k of KEYS) for (const c of ['zen', 'hor', 'glow', 'sun', 'hs', 'hg']) k[c] = new THREE.Color(k[c]);

const SKY_VS = `varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FS = `uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uSunDir; uniform float uGlowI; uniform float uBand; uniform vec3 uFireDir; uniform float uFireI;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHor, uZen, pow(smoothstep(0.0, 1.0, h), 0.42));
  // warm band hugging the horizon on the sun side
  float side = dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-5)) * 0.5 + 0.5;
  col += uGlow * uBand * pow(1.0 - h, 6.0) * pow(side, 2.0) * 0.55;
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uGlow * uGlowI * (pow(s, 24.0) * 0.6 + pow(s, 4.0) * 0.18);
  // campfire sky glow: warm light bleeding up into the smoke/fog above the camp — a beacon through the trees
  vec2 fd = normalize(uFireDir.xz + 1e-5); float fs = max(dot(normalize(d.xz + 1e-5), fd), 0.0);
  col += vec3(1.0, 0.42, 0.12) * uFireI * pow(fs, 10.0) * exp(-max(d.y - uFireDir.y, 0.0) * 5.0) * 0.55;
  if (d.y < 0.0) col = uHor;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function discTexture(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.22, inner); g.addColorStop(0.3, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createDayNight(G) {
  const { scene } = G;
  const dn = { t: 0.03, phase: 'day', night: 0, day: 1, darkness: 0, daylight: 1, dusk: 0, paused: false };
  scene.fog = new THREE.Fog('#bfe0ee', 36, 155);
  scene.background = new THREE.Color('#bfe0ee');

  const hemi = new THREE.HemisphereLight('#cfe6ff', '#4a5a2a', 1.5); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 160;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  dn.hemi = hemi; dn.sun = sun;

  // gradient sky dome (follows camera, drawn behind everything)
  const skyU = { uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uGlowI: { value: 0 }, uBand: { value: 0 }, uFireDir: { value: new THREE.Vector3(1, 0, 0) }, uFireI: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // sun & moon: soft glowing sprites
  const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture('rgba(255,250,225,1)', 'rgba(255,210,140,0.35)'), fog: false, depthWrite: false, transparent: true }));
  sunDisc.scale.setScalar(70); sunDisc.renderOrder = -9;
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture('rgba(235,240,255,1)', 'rgba(200,210,240,0.06)'), fog: false, depthWrite: false, transparent: true }));
  moonDisc.scale.setScalar(30); moonDisc.renderOrder = -9;
  scene.add(sunDisc, moonDisc);

  // campfire beacon: a big soft warm halo at the fire that ignores fog, so the camp glows through the black woods
  // (trees in front occlude it, giving silhouettes against the glow)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture('rgba(255,150,60,0.55)', 'rgba(255,90,30,0.18)'), color: '#ffffff', fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.scale.set(34, 26, 1); halo.renderOrder = 3; scene.add(halo);

  // stars (twinkling via two layers at different phases)
  const r = () => Math.random();
  const mkStars = (n, size) => {
    const sp = [];
    for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = Math.acos(0.08 + r() * 0.92); sp.push(Math.sin(ph) * Math.cos(th) * 420, Math.cos(ph) * 420, Math.sin(ph) * Math.sin(th) * 420); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const m = new THREE.PointsMaterial({ color: '#ffffff', size, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false });
    const p = new THREE.Points(g, m); p.renderOrder = -9; p.frustumCulled = false; scene.add(p); return p;
  };
  const starsA = mkStars(700, 1.5), starsB = mkStars(160, 2.4);

  const tmpDir = new THREE.Vector3();
  const lerpC = (out, a, b, f) => out.copy(a).lerp(b, f);
  const cur = { zen: new THREE.Color(), hor: new THREE.Color(), glow: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color() };
  const COLS = ['zen', 'hor', 'glow', 'sun', 'hs', 'hg'];
  function sample(t) {
    let i = 0; while (i < KEYS.length - 1 && KEYS[i + 1].at <= t) i++;
    const a = KEYS[i], b = KEYS[(i + 1) % KEYS.length];
    const span = ((b.at - a.at) + 1) % 1 || 1, f = THREE.MathUtils.smoothstep((((t - a.at) + 1) % 1) / span, 0, 1);
    for (const c of COLS) lerpC(cur[c], a[c], b[c], f);
    const L = (k) => a[k] + (b[k] - a[k]) * f;
    cur.glowI = L('glowI'); cur.sunI = L('sunI'); cur.hI = L('hI'); cur.near = L('near'); cur.far = L('far'); cur.stars = L('stars'); cur.lum = L('lum');
    return cur;
  }

  dn.setTime = (t) => { dn.t = ((t % 1) + 1) % 1; };
  dn.skipToNight = () => { dn.t = DAY_FRAC + 0.0005; };
  dn.clock = () => {
    // human-readable 24h-ish clock: day 06:00->19:30, night 19:30->06:00
    const hours = dn.t < DAY_FRAC ? 6 + (dn.t / DAY_FRAC) * 13.5 : 19.5 + ((dn.t - DAY_FRAC) / (1 - DAY_FRAC)) * 10.5;
    const h = Math.floor(hours) % 24, m = Math.floor((hours % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  dn.phaseProgress = () => dn.t < DAY_FRAC ? dn.t / DAY_FRAC : (dn.t - DAY_FRAC) / (1 - DAY_FRAC);
  dn.timeLeft = () => dn.t < DAY_FRAC ? (DAY_FRAC - dn.t) * CYCLE : (1 - dn.t) * CYCLE;

  let warned = false;
  dn.update = (dt) => {
    if (G.mode === 'playing' && !dn.paused) dn.t += dt / CYCLE;
    if (dn.t >= 1) dn.t -= 1;
    const phase = dn.t < DAY_FRAC ? 'day' : 'night';
    if (phase !== dn.phase) {
      dn.phase = phase;
      if (phase === 'night') { dn.night++; G.events.emit('nightStart', dn.night); }
      else { warned = false; dn.day = dn.night + 1; G.events.emit('dayStart', dn.day); }
    }
    // dusk warning ~20s before nightfall
    const left = dn.timeLeft();
    if (phase === 'day' && left < 20 && left > 17 && !warned && G.mode === 'playing') {
      warned = true; G.events.emit('duskWarning', dn.day);
    }
    if (phase === 'day' && left > 20) warned = false;

    // light factor (kept stable for other modules: darkness drives fire glow, beam strength, eyeshine, audio)
    const k = sample(dn.t);
    let dusk = 0;
    if (phase === 'day') { const u = dn.t / DAY_FRAC; dusk = Math.max(1 - THREE.MathUtils.smoothstep(u, 0, 0.12), THREE.MathUtils.smoothstep(u, 0.62, 0.9)); }
    dn.daylight = k.lum; dn.darkness = 1 - k.lum; dn.dusk = dusk;
    scene.background.copy(k.hor);
    scene.fog.color.copy(k.hor); scene.fog.near = k.near; scene.fog.far = k.far;

    // sun/moon arcs: rises in the east (+x), sets in the west (-x), tilted south
    const p = G.controls.pos;
    const sunAng = phase === 'day' ? THREE.MathUtils.lerp(-0.06, Math.PI + 0.06, dn.t / DAY_FRAC) : THREE.MathUtils.lerp(0.15, Math.PI - 0.15, (dn.t - DAY_FRAC) / (1 - DAY_FRAC));
    const dir = tmpDir.set(Math.cos(sunAng) * 0.85, Math.sin(sunAng) * 0.8 + 0.05, 0.5).normalize();
    // shadows never come from below the horizon
    // light elevation never grazes: ground brightness follows the intensity curve, not the sun angle
    const ly = Math.max(dir.y, 0.55);
    sun.position.set(p.x + dir.x * 80, ly * 80, p.z + dir.z * 80); sun.target.position.set(p.x, 0, p.z);
    sun.color.copy(k.sun); sun.intensity = k.sunI;
    hemi.color.copy(k.hs); hemi.groundColor.copy(k.hg); hemi.intensity = k.hI;

    // sky dome + bodies follow the camera
    const cam = G.camera.position;
    sky.position.copy(cam);
    skyU.uZen.value.copy(k.zen); skyU.uHor.value.copy(k.hor); skyU.uGlow.value.copy(k.glow); skyU.uGlowI.value = k.glowI;
    skyU.uSunDir.value.copy(dir); skyU.uBand.value = phase === 'day' ? Math.max(dusk, 0.15) * 1.4 : 0.25;
    sunDisc.visible = phase === 'day'; moonDisc.visible = phase === 'night';
    const body = phase === 'day' ? sunDisc : moonDisc;
    body.position.set(cam.x + dir.x * 400, cam.y + dir.y * 400, cam.z + dir.z * 400);
    sunDisc.material.color.set('#ffffff').lerp(k.glow, dusk * 0.8);
    sunDisc.scale.setScalar(70 + dusk * 30);
    const tw = Math.sin(G.time * 1.7) * 0.5 + 0.5;
    starsA.material.opacity = k.stars * 0.85; starsB.material.opacity = k.stars * (0.45 + tw * 0.5);
    starsA.position.copy(cam); starsB.position.copy(cam);
    starsA.rotation.y = starsB.rotation.y = G.time * 0.004;

    // fire beacon: sky glow + halo scale with fuel and darkness, flicker with the flames
    const cf = G.campfire; const fuel = cf ? Math.max(0, Math.min(1, cf.fuel / (cf.maxFuel || 100))) : 0;
    const fx = cf ? cf.x : 0, fz = cf ? cf.z : 0;
    const fl = 0.85 + Math.sin(G.time * 11.3) * 0.06 + Math.sin(G.time * 17.1 + 1.3) * 0.05;
    const beacon = (1 - k.lum) * (fuel > 0 ? 0.35 + fuel * 0.65 : 0) * fl;
    const fdx = fx - cam.x, fdz = fz - cam.z, fdist = Math.hypot(fdx, fdz);
    skyU.uFireDir.value.set(fdx, Math.atan2(6, Math.max(fdist, 1)), fdz);
    skyU.uFireI.value = beacon * THREE.MathUtils.clamp((fdist - 8) / 25, 0, 1) * 0.9;
    halo.position.set(fx, 3.2 + fuel * 1.5, fz);
    halo.material.opacity = beacon * THREE.MathUtils.clamp((fdist - 6) / 14, 0, 1) * 0.9;
    halo.visible = halo.material.opacity > 0.01;
    const hs = (0.7 + fuel * 0.5) * fl; halo.scale.set(34 * hs, 26 * hs, 1);
  };
  return dn;
}
