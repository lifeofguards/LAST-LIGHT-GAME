// Passive wildlife so the forest feels alive: foxes, stags (an elk-like red stag: NOT the Deer monster), birds
// that flush from the ground when you come close, owls perched on dead snags with eyeshine at night, and mountain
// goats in the Mountain region once it is open. Foxes, stags and goats can be hunted with the axe for raw meat.
// Everything is chunky low-poly boxes in the game's palette; AI is a cheap idle/wander/flee loop that sleeps
// (and hides) beyond ~100 m. Emits animalFlee {type,x,z} (and owlHoot {x,z} at night) for the audio.
import * as THREE from '../vendor/three.module.js';
import { makeEyePair, nightFog } from './monsters/bear.js';

const SPECS = {
  fox: { n: 5, hp: 25, meat: 1, radius: 0.45, walk: 1.5, run: 8.0, scare: 9, scareSprint: 14 },
  stag: { n: 4, hp: 50, meat: 2, radius: 0.9, walk: 1.2, run: 8.6, scare: 15, scareSprint: 22 },
  goat: { n: 6, hp: 50, meat: 2, radius: 0.6, walk: 1.0, run: 6.5, scare: 10, scareSprint: 15 },
};
const CULL = 75, BIRD_CULL = 55, FLOCKS = 5, OWLS = 4;   // beyond these they sleep and aren't drawn
const FOX_EYE = new THREE.Color('#d8ffb0'), OWL_EYE = new THREE.Color('#ffd84a');

export function createAnimals(G, cr, K) {
  const { scene } = G;
  const { box } = K;
  const animals = [], flocks = [], owls = [];
  const tmp = { x: 0, z: 0 };

  // ---------------- builders (all face +z) ----------------
  function quadLegs(body, mat, hoof, pts, y, w, h, hoofH = 0.08) {
    return pts.map(([x, z]) => { const hip = new THREE.Group(); hip.position.set(x, y, z); body.add(hip); hip.add(box(w, h, w * 1.1, mat, 0, -h / 2, 0)); if (hoof) hip.add(box(w * 1.05, hoofH, w * 1.25, hoof, 0, -h + hoofH / 2, 0.01)); return hip; });
  }
  function buildFox() {
    const orange = K.mat('#c8662c'), white = K.mat('#efe6d6'), black = K.mat('#2a201b'), nose = K.mat('#141010');
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    body.add(box(0.34, 0.3, 0.78, orange, 0, 0.47, 0));
    body.add(box(0.28, 0.24, 0.2, white, 0, 0.42, 0.36));
    const head = new THREE.Group(); head.position.set(0, 0.62, 0.42); body.add(head);
    head.add(box(0.3, 0.25, 0.27, orange, 0, 0.02, 0.05)); head.add(box(0.15, 0.12, 0.22, white, 0, -0.04, 0.26)); head.add(box(0.06, 0.05, 0.04, nose, 0, -0.0, 0.38));
    for (const sx of [-1, 1]) { head.add(box(0.09, 0.15, 0.05, orange, sx * 0.09, 0.21, -0.01)); head.add(box(0.09, 0.05, 0.055, black, sx * 0.09, 0.3, -0.01, false)); head.add(box(0.04, 0.04, 0.02, black, sx * 0.08, 0.06, 0.19, false)); }
    const legs = quadLegs(body, black, null, [[-0.1, 0.27], [0.1, 0.27], [-0.1, -0.27], [0.1, -0.27]], 0.36, 0.09, 0.36);
    const tail = new THREE.Group(); tail.position.set(0, 0.52, -0.4); body.add(tail);
    tail.add(box(0.18, 0.18, 0.52, orange, 0, 0, -0.24)); tail.add(box(0.19, 0.19, 0.14, white, 0, 0, -0.55));
    const eyes = makeEyePair(head, [-0.08, 0.08], 0.06, 0.2, '#d8ffb0');
    return { root, body, head, legs, tail, eyes, flashMats: [orange], fogMats: [orange, white, black] };
  }
  function buildStag() {
    const hide = K.mat('#8a5a34'), mane = K.mat('#5a3a22'), rump = K.mat('#e2d3b6'), dark = K.mat('#2e2219'), antler = K.mat('#cdbb96');
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    body.add(box(0.7, 0.72, 1.6, hide, 0, 1.45, 0));
    body.add(box(0.74, 0.5, 0.5, mane, 0, 1.55, 0.6));            // shaggy shoulders
    body.add(box(0.6, 0.5, 0.08, rump, 0, 1.5, -0.8));            // pale rump patch
    body.add(box(0.12, 0.16, 0.08, hide, 0, 1.72, -0.84));        // short tail
    const neck = new THREE.Group(); neck.position.set(0, 1.7, 0.72); neck.rotation.x = 0.55; body.add(neck);
    neck.add(box(0.36, 0.85, 0.4, mane, 0, 0.38, 0));
    const head = new THREE.Group(); head.position.set(0, 0.82, 0.02); head.rotation.x = -0.55; neck.add(head);
    head.add(box(0.3, 0.3, 0.5, hide, 0, 0.05, 0.15)); head.add(box(0.23, 0.22, 0.2, dark, 0, -0.01, 0.48));
    for (const sx of [-1, 1]) {
      const ear = box(0.07, 0.22, 0.12, hide, sx * 0.2, 0.2, -0.04); ear.rotation.z = -sx * 0.6; head.add(ear);
      head.add(box(0.05, 0.05, 0.02, dark, sx * 0.13, 0.1, 0.33, false));
      // antlers: a main beam sweeping up and back with three tines
      const a = new THREE.Group(); a.position.set(sx * 0.09, 0.2, -0.02); a.rotation.set(-0.35, 0, -sx * 0.45); head.add(a);
      a.add(box(0.06, 0.8, 0.06, antler, 0, 0.4, 0));
      const t1 = box(0.045, 0.34, 0.045, antler, 0, 0.3, 0.12); t1.rotation.x = 0.9; a.add(t1);
      const t2 = box(0.045, 0.32, 0.045, antler, 0, 0.6, 0.12); t2.rotation.x = 0.8; a.add(t2);
      const t3 = box(0.045, 0.3, 0.045, antler, sx * 0.08, 0.82, 0.02); t3.rotation.z = -sx * 0.6; a.add(t3);
    }
    const legs = quadLegs(body, hide, dark, [[-0.22, 0.6], [0.22, 0.6], [-0.22, -0.6], [0.22, -0.6]], 1.12, 0.16, 1.1, 0.12);
    return { root, body, head, neck, legs, tail: null, eyes: null, flashMats: [hide], fogMats: [hide, mane, rump, dark, antler] };
  }
  function buildGoat() {
    const coat = K.mat('#e0d3b8'), shag = K.mat('#c4b394'), horn = K.mat('#3a332c'), hoof = K.mat('#211b16'), nose = K.mat('#6b5f55');
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    body.add(box(0.5, 0.52, 0.95, coat, 0, 0.86, 0));
    body.add(box(0.54, 0.2, 0.9, shag, 0, 0.56, 0));            // shaggy skirt
    body.add(box(0.56, 0.3, 0.32, shag, 0, 1.06, 0.34));        // shoulder hump
    const head = new THREE.Group(); head.position.set(0, 1.12, 0.52); body.add(head);
    head.add(box(0.26, 0.28, 0.4, coat, 0, 0.0, 0.1)); head.add(box(0.2, 0.18, 0.12, nose, 0, -0.06, 0.32));
    head.add(box(0.08, 0.2, 0.07, shag, 0, -0.22, 0.24));       // beard
    for (const sx of [-1, 1]) {
      const hn = box(0.06, 0.3, 0.07, horn, sx * 0.08, 0.26, -0.04); hn.rotation.x = -0.55; head.add(hn);
      const ear = box(0.16, 0.06, 0.06, coat, sx * 0.17, 0.08, -0.02); ear.rotation.z = sx * 0.3; head.add(ear);
      head.add(box(0.04, 0.04, 0.02, hoof, sx * 0.1, 0.06, 0.305, false));
    }
    const legs = quadLegs(body, coat, hoof, [[-0.15, 0.33], [0.15, 0.33], [-0.15, -0.33], [0.15, -0.33]], 0.62, 0.12, 0.56, 0.09);
    return { root, body, head, legs, tail: null, eyes: null, flashMats: [coat], fogMats: [coat, shag, horn, hoof] };
  }
  const BUILD = { fox: buildFox, stag: buildStag, goat: buildGoat };

  // ---------------- mountain region (from progression, whatever shape it publishes) ----------------
  let mountainOpen = false;
  G.events.on('regionUnlocked', (e) => { if (!e || e.id === 'mountain') { mountainOpen = true; for (const a of animals) if (a.type === 'goat') place(a); } });
  // the region record from progression (G.progression.regions[{id:'mountain', open, x, z, r}]); no allocation per call
  const mReg = { ring: false, x: 0, z: 0, r: 30, minR: 0, maxR: 0 }; let regRef = null;
  function mountain() {
    const pr = G.progression || {};
    const m = pr.mountain || (regRef ||= (Array.isArray(pr.regions) ? pr.regions.find(r => r.id === 'mountain') : pr.regions?.mountain) || null);
    if (!(mountainOpen || (m && (m.unlocked || m.open)))) return null;
    if (m && typeof m.x === 'number') { mReg.ring = false; mReg.x = m.x; mReg.z = m.z; mReg.r = m.r || m.radius || 30; return mReg; }
    // unknown shape: the far ring of the land
    const lr = K.limitR(); mReg.ring = true; mReg.minR = Math.max(lr - 30, 60); mReg.maxR = lr - 4; return mReg;
  }

  // ---------------- land animals ----------------
  function place(a) {
    const P = G.controls.pos;
    if (a.type === 'goat') {
      const m = mountain();
      if (!m) { a.alive = false; a.hidden = true; a.root.visible = false; return; }
      if (m.ring) K.findSpot(m.minR, m.maxR, tmp, 1.6, 0, 0, P, 30); else K.findSpot(2, m.r * 0.85, tmp, 1.2, m.x, m.z, P, 20);
    } else K.findSpot(a.type === 'stag' ? 30 : 24, Math.max(34, K.landR() - 4), tmp, a.type === 'stag' ? 2 : 1.4, 0, 0, P, 35);
    a.pos.set(tmp.x, 0, tmp.z); a.home.x = tmp.x; a.home.z = tmp.z;
    a.alive = true; a.hidden = false; a.hp = a.spec.hp; a.state = 'idle'; a.stateT = 0; a.idleFor = 2 + Math.random() * 5;
    a.body.rotation.set(0, 0, 0); a.root.position.y = 0;
  }
  for (const type of Object.keys(SPECS)) {
    const spec = SPECS[type];
    for (let i = 0; i < spec.n; i++) {
      const parts = BUILD[type](); scene.add(parts.root);
      const om = K.optimize(parts.root).mat; parts.flashMats = [om]; parts.fogMats = [om];
      const a = Object.assign(parts, { type, spec, i, pos: new THREE.Vector3(), home: { x: 0, z: 0 }, heading: Math.random() * 6.28, hp: spec.hp, state: 'idle', stateT: 0, t: Math.random() * 9,
        idleFor: 3, walk: 0, speed: 0, flash: 0, fleeDir: 0, fleeFor: 0, lastFlee: -99, alive: true, hidden: false, deadT: 0, dist: 999, target: { x: 0, z: 0 }, graze: Math.random() > 0.5 });
      a.radius = spec.radius;
      a.canHit = () => a.alive && a.root.visible && a.state !== 'dead';
      a.hurt = (dmg, from) => hurtAnimal(a, dmg, from);
      K.addTarget(a);
      animals.push(a); place(a);
    }
  }
  function flee(a, P, boost = 1) {
    a.fleeDir = Math.atan2(a.pos.x - P.x, a.pos.z - P.z) + (Math.random() - 0.5) * 0.7; a.fleeFor = 3 + Math.random() * 2; a.fleeBoost = boost;
    if (a.state !== 'flee' && G.time - a.lastFlee > 4) { a.lastFlee = G.time; K.emit('animalFlee', { type: a.type, x: a.pos.x, z: a.pos.z }); }
    a.state = 'flee'; a.stateT = 0;
  }
  function hurtAnimal(a, dmg, from) {
    a.hp -= dmg; a.flash = 1;
    if (a.hp <= 0) {
      a.state = 'dead'; a.stateT = 0; a.alive = false;
      G.survival?.spawnMeat?.(a.pos.x, a.pos.z, a.spec.meat);
      K.emit('animalKill', { type: a.type, x: a.pos.x, z: a.pos.z });
      K.toast(a.type === 'fox' ? 'You caught a fox. Raw meat dropped.' : a.type === 'stag' ? 'The stag falls. It dropped plenty of meat.' : 'Mountain goat down. Raw meat dropped.', 2.4);
      return;
    }
    flee(a, from, 1.15);
  }
  G.events.on('dayStart', () => { for (const a of animals) if (!a.alive && a.state === 'dead' || a.hidden) place(a); });

  function updateAnimal(a, dt, P, sprint, lr) {
    a.t += dt; a.stateT += dt; a.speed = 0; a.flash = Math.max(0, a.flash - dt * 3);
    const dist = a.dist = Math.hypot(P.x - a.pos.x, P.z - a.pos.z);
    if (a.state === 'dead') return;
    const scare = sprint ? a.spec.scareSprint : a.spec.scare;
    if (K.playing() && dist < scare && a.state !== 'flee') flee(a, P);
    switch (a.state) {
      case 'idle':
        if (a.stateT > a.idleFor) {
          const ang = Math.random() * 6.28, r = 4 + Math.random() * 12;
          a.target.x = a.home.x + Math.cos(ang) * r; a.target.z = a.home.z + Math.sin(ang) * r; a.state = 'walk'; a.stateT = 0;
        }
        break;
      case 'walk':
        if (K.moveToward(a, a.target.x, a.target.z, a.spec.walk, dt, 2.5) < 0.6 || a.stateT > 15) { a.state = 'idle'; a.stateT = 0; a.idleFor = 2 + Math.random() * 6; a.graze = Math.random() > 0.35; }
        break;
      case 'flee': {
        const sp = a.spec.run * (a.fleeBoost || 1);
        a.heading += K.wrap(a.fleeDir - a.heading) * Math.min(1, dt * 6);
        a.pos.x += Math.sin(a.heading) * sp * dt; a.pos.z += Math.cos(a.heading) * sp * dt; a.speed = sp;
        if (a.stateT > a.fleeFor && dist > scare * 1.4) { a.state = 'idle'; a.stateT = 0; a.idleFor = 1.5 + Math.random() * 3; a.home.x = a.pos.x; a.home.z = a.pos.z; }
        else if (a.stateT > a.fleeFor) a.fleeDir = Math.atan2(a.pos.x - P.x, a.pos.z - P.z);
        break; }
    }
    K.fireAvoid(a.pos, 3);
    const before = a.pos.x + a.pos.z;
    G.world.collide(a.pos, a.radius * 0.8);
    // stay on open land: turn back at the edge (goats stay in their region)
    const m = a.type === 'goat' ? mountain() : null;
    if (m && !m.ring) {
      const dx = a.pos.x - m.x, dz = a.pos.z - m.z, l = Math.hypot(dx, dz);
      if (l > m.r - 1) { a.pos.x = m.x + dx / l * (m.r - 1); a.pos.z = m.z + dz / l * (m.r - 1); a.fleeDir = Math.atan2(-dx, -dz) + (Math.random() - 0.5); a.target.x = m.x; a.target.z = m.z; }
    } else {
      const r = Math.hypot(a.pos.x, a.pos.z);
      if (r > lr - 2) { a.pos.x *= (lr - 2) / r; a.pos.z *= (lr - 2) / r; a.fleeDir = Math.atan2(-a.pos.x, -a.pos.z) + (Math.random() - 0.5) * 1.5; a.target.x = a.home.x = a.pos.x * 0.9; a.target.z = a.home.z = a.pos.z * 0.9; }
    }
    if (a.state === 'flee' && Math.abs(a.pos.x + a.pos.z - before) > 0.2) a.fleeDir += 0.6; // slid along a trunk: veer off
  }
  function poseAnimal(a, dt, dk) {
    const { root, body, head, legs, tail } = a;
    root.position.set(a.pos.x, 0, a.pos.z); root.rotation.y = a.heading;
    if (a.state === 'dead') {
      body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + dt * 6); root.position.y = -Math.max(0, a.stateT - 4) * 0.2;
      if (a.eyes) a.eyes.coreMat.opacity = a.eyes.haloMat.opacity = 0;
      if (a.stateT > 7) root.visible = false;
      return;
    }
    const run = a.state === 'flee', k = Math.min(1, a.speed / 2);
    a.walk += dt * a.speed * (run ? (a.type === 'stag' ? 1.3 : 2.2) : 3.2);
    const sw = Math.sin(a.walk) * (run ? 0.9 : 0.5) * k;
    if (run) { legs[0].rotation.x = legs[1].rotation.x = sw; legs[2].rotation.x = legs[3].rotation.x = -sw; }
    else { legs[0].rotation.x = legs[3].rotation.x = sw; legs[1].rotation.x = legs[2].rotation.x = -sw; }
    body.position.y = Math.abs(Math.sin(a.walk)) * (run ? (a.type === 'goat' ? 0.25 : 0.15) : 0.02) * k;
    body.rotation.x = run ? Math.sin(a.walk) * 0.06 : 0;
    const grazing = a.state === 'idle' && a.graze;
    const lookUp = a.dist < a.spec.scare * 1.6 && a.state === 'idle'; // ears up, watching you, right before it bolts
    if (a.type === 'stag') a.neck.rotation.x += ((grazing && !lookUp ? 1.9 + Math.sin(a.t * 2) * 0.05 : run ? 0.9 : 0.5) - a.neck.rotation.x) * Math.min(1, dt * 3);
    else head.rotation.x += ((grazing && !lookUp ? 0.7 + Math.sin(a.t * 3) * 0.08 : run ? 0.15 : -0.1) - head.rotation.x) * Math.min(1, dt * 4);
    head.rotation.y = a.state === 'idle' ? (lookUp ? K.wrap(Math.atan2(G.controls.pos.x - a.pos.x, G.controls.pos.z - a.pos.z) - a.heading) * 0.5 : Math.sin(a.t * 0.5 + a.i) * 0.3) : 0;
    head.rotation.y = Math.max(-0.9, Math.min(0.9, head.rotation.y));
    if (tail) { tail.rotation.x = run ? 0.1 : -0.35; tail.rotation.y = Math.sin(a.t * (run ? 4 : 1.5)) * 0.3; }
    if (a.eyes) K.eyes(a.eyes, a.dist, Math.min(1, dk * 1.4) * 0.6, FOX_EYE, 1, 0.8);
    nightFog(a.fogMats, dk);
    for (const m of a.flashMats) m.emissive.setRGB(a.flash * 0.55, a.flash * 0.05, a.flash * 0.04);
  }

  // ---------------- birds: little flocks pecking in the open that burst up when you come close ----------------
  const birdMat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true });
  const birdCols = [['#4a3a2c', '#c8642a'], ['#2c2c32', '#3e3e46'], ['#6b5a3c', '#d9c8a0']];
  function makeBird(cols) {
    const bm = K.mat(cols[0]), br = K.mat(cols[1]), beak = K.mat('#e0a030');
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    body.add(box(0.16, 0.14, 0.26, bm, 0, 0.13, 0, false)); body.add(box(0.12, 0.08, 0.12, br, 0, 0.09, 0.07, false));
    const head = new THREE.Group(); head.position.set(0, 0.22, 0.12); body.add(head);
    head.add(box(0.11, 0.1, 0.11, bm, 0, 0, 0, false)); head.add(box(0.04, 0.03, 0.06, beak, 0, -0.01, 0.08, false));
    body.add(box(0.06, 0.03, 0.12, bm, 0, 0.16, -0.17, false));
    const wings = [-1, 1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.08, 0.17, 0); body.add(w); w.add(box(0.22, 0.025, 0.16, bm, sx * 0.11, 0, 0, false)); return w; });
    K.optimize(root, { mat: birdMat }); scene.add(root);
    return { root, body, head, wings, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ph: Math.random() * 6, hopT: Math.random() * 2, h: Math.random() * 6.28 };
  }
  function landFlock(f, far = true) {
    const P = G.controls.pos;
    K.findSpot(22, Math.max(32, K.landR() - 4), tmp, 2.0, 0, 0, far ? P : null, far ? 40 : 0);
    f.x = tmp.x; f.z = tmp.z; f.state = 'ground'; f.t = 0;
    for (const b of f.birds) { b.x = f.x + (Math.random() - 0.5) * 3; b.z = f.z + (Math.random() - 0.5) * 3; b.y = 0; b.root.visible = true; b.root.rotation.set(0, b.h, 0); }
  }
  for (let i = 0; i < FLOCKS; i++) {
    const cols = birdCols[i % birdCols.length], n = 3 + (i % 3);
    const f = { type: 'bird', birds: [], x: 0, z: 0, state: 'ground', t: 0, back: 0 };
    for (let k = 0; k < n; k++) f.birds.push(makeBird(cols));
    landFlock(f, false); flocks.push(f);
  }
  G.events.on('nightStart', () => { for (const f of flocks) if (f.state === 'ground') { f.state = 'gone'; for (const b of f.birds) b.root.visible = false; } });
  G.events.on('dayStart', () => { for (const f of flocks) if (f.state === 'gone') landFlock(f); });
  function flush(f, P) {
    f.state = 'fly'; f.t = 0;
    K.emit('animalFlee', { type: 'bird', x: f.x, z: f.z, n: f.birds.length });
    for (const b of f.birds) {
      const a = Math.atan2(b.z - P.z, b.x - P.x) + (Math.random() - 0.5) * 1.4, s = 6 + Math.random() * 3;
      b.vx = Math.cos(a) * s; b.vz = Math.sin(a) * s; b.vy = 4 + Math.random() * 2.5; b.h = Math.atan2(b.vx, b.vz);
    }
  }
  function updateFlock(f, dt, P, sprint) {
    f.t += dt;
    const dist = Math.hypot(P.x - f.x, P.z - f.z);
    if (f.state === 'gone') { f.back -= dt; if (f.back <= 0 && !K.night()) landFlock(f); return; }
    const vis = dist < BIRD_CULL;
    if (f.state === 'ground') {
      if (K.playing() && dist < (sprint ? 12 : 7.5)) flush(f, P);
      if (!vis) { for (const b of f.birds) b.root.visible = false; return; }
      for (const b of f.birds) {
        b.root.visible = true; b.hopT -= dt;
        if (b.hopT <= 0) { b.hopT = 0.6 + Math.random() * 1.8; b.h += (Math.random() - 0.5) * 2; const nx = b.x + Math.sin(b.h) * 0.3, nz = b.z + Math.cos(b.h) * 0.3; if (Math.hypot(nx - f.x, nz - f.z) < 2.2) { b.x = nx; b.z = nz; } b.y = 0.12; }
        b.y = Math.max(0, b.y - dt * 0.8);
        b.head.rotation.x = Math.max(0, Math.sin(G.time * 7 + b.ph)) * 0.9; // pecking
        b.wings[0].rotation.z = b.wings[1].rotation.z = 0;
        b.root.position.set(b.x, b.y, b.z); b.root.rotation.y = b.h;
      }
    } else if (f.state === 'fly') {
      for (const b of f.birds) {
        b.vy = Math.max(1.2, b.vy - dt * 1.5); b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        const flap = Math.sin(G.time * 28 + b.ph) * 1.1;
        b.wings[0].rotation.z = flap; b.wings[1].rotation.z = -flap; b.head.rotation.x = 0;
        b.root.position.set(b.x, b.y, b.z); b.root.rotation.set(-0.3, b.h, 0);
      }
      if (f.t > 5) { f.state = 'gone'; f.back = 25 + Math.random() * 25; for (const b of f.birds) b.root.visible = false; }
    }
  }

  // ---------------- owls on dead snags ----------------
  const bark = K.mat('#4a3524'), barkD = K.mat('#3a2a1c');
  const snagMat = new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true });
  function makeOwl() {
    const snag = new THREE.Group(); scene.add(snag);
    snag.add(box(0.38, 3.3, 0.38, bark, 0, 1.65, 0)); snag.add(box(0.3, 0.5, 0.3, barkD, 0.04, 3.5, 0.02));
    const br = box(0.12, 0.12, 1.1, bark, 0, 2.65, 0.5); snag.add(br);
    const br2 = box(0.1, 0.7, 0.1, barkD, -0.25, 2.2, 0); br2.rotation.z = 0.7; snag.add(br2);
    const plumage = K.mat('#7a6248'), belly = K.mat('#c9b89a'), disc = K.mat('#d8c8a8'), beak = K.mat('#3a3028'), iris = K.basic('#f0b020');
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    body.add(box(0.36, 0.48, 0.32, plumage, 0, 0.26, 0)); body.add(box(0.28, 0.34, 0.04, belly, 0, 0.22, 0.165));
    const head = new THREE.Group(); head.position.set(0, 0.6, 0); body.add(head);
    head.add(box(0.36, 0.28, 0.3, plumage, 0, 0, 0)); head.add(box(0.3, 0.22, 0.03, disc, 0, -0.01, 0.15));
    head.add(box(0.05, 0.07, 0.05, beak, 0, -0.05, 0.18, false));
    for (const sx of [-1, 1]) { head.add(box(0.06, 0.12, 0.05, plumage, sx * 0.13, 0.18, 0.02)); head.add(box(0.06, 0.06, 0.02, iris, sx * 0.075, 0.03, 0.168, false)); }
    const wings = [-1, 1].map(sx => { const w = new THREE.Group(); w.position.set(sx * 0.19, 0.42, 0); body.add(w); w.add(box(0.05, 0.4, 0.26, plumage, sx * 0.02, -0.16, 0)); return w; });
    const eyes = makeEyePair(head, [-0.075, 0.075], 0.03, 0.2, '#ffd84a');
    K.optimize(snag, { mat: snagMat }); const om = K.optimize(root).mat; scene.add(root);
    return { type: 'owl', snag, root, body, head, wings, eyes, plumage, x: 0, z: 0, perch: new THREE.Vector3(), pos: new THREE.Vector3(), state: 'perch', t: 0, hootT: 6 + Math.random() * 14, vx: 0, vy: 0, vz: 0, h: 0, back: 0, dist: 999, fogMats: [om, snagMat] };
  }
  function placeOwl(o) {
    K.findSpot(24, Math.max(34, K.landR() - 6), tmp, 2.2, 0, 0, G.controls.pos, 30);
    o.x = tmp.x; o.z = tmp.z; o.snag.position.set(o.x, 0, o.z); o.snag.rotation.y = Math.random() * 6.28;
    if (o.collider) G.world.removeCollider(o.collider);
    o.collider = G.world.addCollider({ x: o.x, z: o.z, r: 0.3 });
    // perch at the end of the side branch
    o.snag.updateMatrixWorld(true); o.perch.set(0, 2.72, 0.95).applyMatrix4(o.snag.matrixWorld);
    o.pos.copy(o.perch); o.h = o.snag.rotation.y; o.state = 'perch'; o.root.visible = true;
  }
  for (let i = 0; i < OWLS; i++) { const o = makeOwl(); placeOwl(o); owls.push(o); }
  function updateOwl(o, dt, P, dk) {
    o.t += dt;
    const dist = o.dist = Math.hypot(P.x - o.x, P.z - o.z), vis = dist < CULL;
    o.snag.visible = vis;
    if (o.state === 'perch') {
      o.root.visible = vis; if (!vis) return;
      if (K.playing() && dist < 4.5) {
        o.state = 'fly'; o.t = 0; const a = Math.atan2(o.pos.z - P.z, o.pos.x - P.x) + (Math.random() - 0.5);
        o.vx = Math.cos(a) * 7; o.vz = Math.sin(a) * 7; o.vy = 1.5; o.h = Math.atan2(o.vx, o.vz);
        K.emit('animalFlee', { type: 'owl', x: o.x, z: o.z });
      }
      o.root.position.copy(o.pos); o.root.rotation.set(0, o.h, 0);
      // the head swivels to follow you (owls can look almost straight behind them)
      const want = Math.max(-2.3, Math.min(2.3, K.wrap(Math.atan2(P.x - o.pos.x, P.z - o.pos.z) - o.h)));
      o.head.rotation.y += ((dist < 40 ? want : Math.sin(o.t * 0.3) * 1.2) - o.head.rotation.y) * Math.min(1, dt * 2.5);
      o.head.rotation.z = Math.sin(o.t * 0.9) * 0.12;
      o.wings[0].rotation.z = o.wings[1].rotation.z = 0;
      // night: big yellow eyeshine and the odd hoot
      K.eyes(o.eyes, dist, Math.min(1, dk * 1.5), OWL_EYE, 1, 1.2);
      if (K.night() && dist < 70 && K.playing()) { o.hootT -= dt; if (o.hootT <= 0) { o.hootT = 14 + Math.random() * 18; K.emit('owlHoot', { x: o.x, z: o.z }); } }
    } else if (o.state === 'fly') {
      o.root.visible = true;
      o.pos.x += o.vx * dt; o.pos.y += o.vy * dt; o.pos.z += o.vz * dt; o.vy = Math.max(0.6, o.vy - dt * 0.3);
      const flap = Math.sin(o.t * 12) * 1.0; o.wings[0].rotation.z = -1.2 + flap; o.wings[1].rotation.z = 1.2 - flap;
      o.root.position.copy(o.pos); o.root.rotation.set(0.2, o.h, 0); K.eyes(o.eyes, dist, Math.min(1, dk * 1.5) * 0.7, OWL_EYE, 1, 1);
      if (o.t > 4.5) { o.state = 'gone'; o.back = 25 + Math.random() * 20; o.root.visible = false; }
    } else if (o.state === 'gone') {
      o.back -= dt; if (o.back <= 0 && dist > 25) { o.pos.copy(o.perch); o.state = 'perch'; }
    }
    nightFog(o.fogMats, dk);
  }

  const A = {
    animals, flocks, owls,
    update(dt) {
      if (G.mode === 'title') return;
      const P = G.controls.pos, sprint = G.controls.sprinting, dk = K.dark(), lr = K.landR();
      for (const a of animals) {
        if (a.hidden) continue;
        a.dist = Math.hypot(P.x - a.pos.x, P.z - a.pos.z);
        if (a.dist > CULL && a.state !== 'flee') { a.root.visible = false; continue; }  // far: sleeps
        updateAnimal(a, dt, P, sprint, lr);
        a.root.visible = a.state !== 'dead' || a.stateT < 7;
        if (a.root.visible) poseAnimal(a, dt, dk);
      }
      for (const f of flocks) updateFlock(f, dt, P, sprint);
      for (const o of owls) updateOwl(o, dt, P, dk);
    },
    // debug: put an animal of a type ~dist m in front of the player, idle and facing them
    spawnNear(type, dist = 7) {
      const c = G.controls, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), x = c.pos.x + fx * dist, z = c.pos.z + fz * dist;
      if (type === 'bird') { const f = flocks[0]; landFlock(f, false); f.x = x; f.z = z; for (const b of f.birds) { b.x = x + (Math.random() - 0.5) * 2.4; b.z = z + (Math.random() - 0.5) * 2.4; } return { type, x, z }; }
      if (type === 'owl') { const o = owls[0]; o.snag.position.set(x, 0, z); o.snag.rotation.y = Math.atan2(-fx, -fz) + Math.PI / 2; o.x = x; o.z = z; o.snag.updateMatrixWorld(true); o.perch.set(0, 2.72, 0.95).applyMatrix4(o.snag.matrixWorld); o.pos.copy(o.perch); o.h = Math.atan2(-fx, -fz); o.state = 'perch'; return { type, x, z }; }
      if (type === 'goat') mountainOpen = true;
      const a = animals.find(q => q.type === type); if (!a) return null;
      a.alive = true; a.hidden = false; a.hp = a.spec.hp; a.state = 'idle'; a.stateT = 0; a.idleFor = 30; a.graze = false;
      a.body.rotation.set(0, 0, 0); a.root.position.y = 0;
      a.pos.set(x, 0, z); a.home.x = x; a.home.z = z; a.heading = Math.atan2(-fx, -fz) + 1.2; a.root.visible = true;
      a.lastFlee = G.time; return { type, x: +x.toFixed(1), z: +z.toFixed(1) };
    },
    summary() {
      const by = {};
      for (const a of animals) { const s = by[a.type] ||= { alive: 0, dead: 0, hidden: 0, fleeing: 0 }; if (a.hidden) s.hidden++; else if (a.state === 'dead') s.dead++; else { s.alive++; if (a.state === 'flee') s.fleeing++; } }
      by.birds = flocks.map(f => f.state); by.owls = owls.map(o => o.state);
      return by;
    },
  };
  return A;
}
