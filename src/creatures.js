// Creatures: wolf packs at the caves, gray bears and the gray Alpha, and passive
// wildlife. See docs/EXPANSION.md for the contract.
// This module is the hub: it owns the shared kit (chunky box builder, movement, fire avoidance, camera assist),
// resolves the cave records (G.progression.caves, or placeholder caves when progression has none yet), routes
// axe hits to whichever creature is in front of the player (G.creatures.hitAt), and sums threat.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { createWolves } from './monsters/wolf.js';
import { createGrayBears } from './monsters/graybear.js';
import { createAnimals } from './animals.js';

// ---------------- draw-call diet ----------------
// Every creature is built from chunky boxes (same look as the bear). Before it goes live, optimize() merges the boxes
// of each animated part into ONE vertex-coloured mesh, and builds ONE matching moonlit-rim shell per part (the same
// back-face, pushed-from-camera trick as bear.js addRim, inflated per box corner so it equals scaling each box).
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
function rimMaterial(color, t0) {
  const uThick = { value: t0 };
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uThick = uThick;
    sh.vertexShader = 'attribute vec3 inflate;\nuniform float uThick;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed += inflate * uThick;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      mvPosition.xyz += normalize(mvPosition.xyz) * 0.7; gl_Position = projectionMatrix * mvPosition;`);
  };
  m.customProgramCacheKey = () => 'creatureRim';
  let last = -1;
  m.userData.setDist = (dist) => { const tt = Math.round((t0 + Math.max(0, dist - 6) * 0.0018) * 200) / 200; if (tt !== last) { last = tt; uThick.value = tt; } };
  return m;
}
function coloured(geo, color, matrix) {
  const g = geo.clone(); g.deleteAttribute('uv'); if (matrix) g.applyMatrix4(matrix);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
}
function shell(geo, mesh, applyMatrix) {
  const g = new THREE.BufferGeometry(); g.setIndex(geo.index ? geo.index.clone() : null);
  const pos = geo.attributes.position, n = pos.count, P = new Float32Array(n * 3), I = new Float32Array(n * 3);
  if (applyMatrix) mesh.updateMatrix(); _q.copy(applyMatrix ? mesh.quaternion : _q.identity());
  for (let i = 0; i < n; i++) {
    _v.set(Math.sign(pos.getX(i)), Math.sign(pos.getY(i)), Math.sign(pos.getZ(i))).applyQuaternion(_q); I.set([_v.x, _v.y, _v.z], i * 3);
    _v.fromBufferAttribute(pos, i); if (applyMatrix) _v.applyMatrix4(mesh.matrix); P.set([_v.x, _v.y, _v.z], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('inflate', new THREE.BufferAttribute(I, 3)); return g;
}
export function optimizeCreature(root, { rim = null, t = 0.035, minSize = 0.07, strip = null, mat = null } = {}) {
  mat ||= new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true });
  if (strip) { const dead = []; root.traverse(o => { if (o.isMesh && o.material === strip) dead.push(o); }); for (const o of dead) o.parent.remove(o); }
  const rimMat = rim ? rimMaterial(rim, t) : null;
  const wantShell = (p) => { const { width: w, height: h, depth: d } = p.geometry.parameters; return !(Math.min(w, h, d) < minSize && Math.max(w, h, d) < 0.3); };
  const nodes = []; root.traverse(o => { if (!o.isMesh && !o.isSprite) nodes.push(o); });
  for (const g of nodes) {
    const parts = g.children.filter(o => o.isMesh && o.material?.isMeshLambertMaterial && o.geometry.parameters?.width && !o.userData.keep);
    const keeps = g.children.filter(o => o.isMesh && o.material?.isMeshLambertMaterial && o.geometry.parameters?.width && o.userData.keep);
    for (const k of keeps) {   // animated on its own (e.g. hackles): recolour in place, own rim child
      const c = k.material.color; k.geometry = coloured(k.geometry, c); k.material = mat;
      if (rimMat) { const s = new THREE.Mesh(shell(k.geometry, k, false), rimMat); s.renderOrder = 2; k.add(s); }
    }
    if (!parts.length) continue;
    const geos = [], shells = []; let cast = false;
    for (const p of parts) {
      p.updateMatrix(); cast ||= p.castShadow;
      geos.push(coloured(p.geometry, p.material.color, p.matrix));
      if (rimMat && wantShell(p)) shells.push(shell(p.geometry, p, true));
      g.remove(p);
    }
    const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = cast; g.add(m);
    if (shells.length) { const s = new THREE.Mesh(mergeGeometries(shells), rimMat); s.renderOrder = 2; s.castShadow = false; s.frustumCulled = false; g.add(s); }
  }
  return { mat, rimMat };
}

// placeholder caves (contract radii) used only while G.progression.caves is empty
const CAVE_FALLBACK = [
  { id: 'wolf1', type: 'wolf', level: 2, r: 72, a: 0.85 },
  { id: 'wolf2', type: 'wolf', level: 3, r: 102, a: 2.85 },
  { id: 'wolf3', type: 'wolf', level: 4, r: 132, a: 4.45 },
  { id: 'bear', type: 'bear', level: 4, r: 132, a: 5.85 },
];

export function createCreatures(G) {
  const cr = { list: [], targets: [] };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------------- caves ----------------
  let fallback = null;
  // prefers the real records from progression; falls back to placeholders built from the contract's radii
  cr.caves = () => {
    const pc = G.progression?.caves;
    if (pc && pc.length) return pc;
    return fallback ||= CAVE_FALLBACK.map(c => {
      const x = Math.cos(c.a) * c.r, z = Math.sin(c.a) * c.r, ux = -Math.cos(c.a), uz = -Math.sin(c.a);
      return { id: c.id, type: c.type, level: c.level, x, z, entrance: { x: x + ux * 8, z: z + uz * 8 }, interior: { x, z }, locked: true, cleared: false, placeholder: true };
    });
  };
  cr.cave = (id) => { const cs = cr.caves(); for (const c of cs) if (c.id === id) return c; return null; };

  // ---------------- shared kit ----------------
  const geoCache = new Map(), matCache = new Map();
  const geo = (w, h, d) => { const k = w + ',' + h + ',' + d; let g = geoCache.get(k); if (!g) geoCache.set(k, g = new THREE.BoxGeometry(w, h, d)); return g; };
  const look = { rate: 0, x: 0, z: 0 };
  const K = {
    THREE, wrap,
    lam: (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }),             // per-instance (can flash red)
    mat: (c) => { let m = matCache.get(c); if (!m) matCache.set(c, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); return m; },
    basic: (c) => { const k = 'b' + c; let m = matCache.get(k); if (!m) matCache.set(k, m = new THREE.MeshBasicMaterial({ color: c })); return m; },
    box(w, h, d, m, x = 0, y = 0, z = 0, shadow = true) { const b = new THREE.Mesh(geo(w, h, d), m); b.position.set(x, y, z); b.castShadow = shadow; return b; },
    fireLevel: () => G.progression?.fireLevel ?? 1,
    limitR: () => G.progression?.limitR ?? 60,
    landR: () => G.progression?.forestR ?? G.progression?.limitR ?? 60,   // the open forest disk (limitR also spans the Mountain once it opens)
    inLand: (x, z, pad = 0) => (G.progression && G.progression.inBounds ? G.progression.inBounds(x, z, -pad) : Math.hypot(x, z) < K.landR() - pad),
    dark: () => G.daynight.darkness ?? 0,
    night: () => G.daynight.phase === 'night',
    playing: () => G.mode === 'playing',
    playerSafe: () => { const f = G.campfire; return f.fuel > 0 && f.inLight(G.controls.pos, 0.3); },
    axeDamage: () => 25 * (G.progression?.axeDamage || 1),   // the brown bear's 25 per hit, times the axe tier (progression chests)
    emit: (n, d) => G.events.emit(n, d),
    moveToward(e, tx, tz, speed, dt, turn = 5) {
      const dx = tx - e.pos.x, dz = tz - e.pos.z, l = Math.hypot(dx, dz); if (l < 0.1) return l;
      const dh = wrap(Math.atan2(dx, dz) - e.heading); e.heading += dh * Math.min(1, dt * turn);
      const s = Math.min(l, speed * dt * Math.max(0.2, Math.cos(dh))); e.pos.x += Math.sin(e.heading) * s; e.pos.z += Math.cos(e.heading) * s; e.speed = speed; return l;
    },
    faceToward(e, tx, tz, dt, turn = 6) { e.heading += wrap(Math.atan2(tx - e.pos.x, tz - e.pos.z) - e.heading) * Math.min(1, dt * turn); },
    // keep out of the campfire's light (every predator respects it)
    fireAvoid(p, pad = 2) {
      const f = G.campfire; if (f.fuel <= 0) return false;
      const R = f.lightRadius() + pad, fx = p.x - f.x, fz = p.z - f.z, fl = Math.hypot(fx, fz);
      if (fl < R) { p.x = f.x + fx / (fl || 1) * R; p.z = f.z + fz / (fl || 1) * R; return true; }
      return false;
    },
    // is this point outside the camera's view cone? (used to swing the view to an off-screen attacker)
    offScreen(x, z, ang = 0.95) {
      const c = G.controls, dx = x - c.pos.x, dz = z - c.pos.z, l = Math.hypot(dx, dz) || 1;
      return (dx * -Math.sin(c.yaw) + dz * -Math.cos(c.yaw)) / l < Math.cos(ang);
    },
    wantLook(x, z, rate) { if (rate > look.rate) { look.rate = rate; look.x = x; look.z = z; } },
    // is (x,z) a clear spot of open land? (no trunk, not at camp, not at a cave)
    clearSpot(x, z, clr = 1.6) {
      if (Math.hypot(x - G.campfire.x, z - G.campfire.z) < 20) return false;
      for (const c of cr.caves()) if (Math.hypot(c.x - x, c.z - z) < 20) return false;
      for (const t of G.world.trees) if (t.alive && Math.abs(t.x - x) < clr + 1 && Math.abs(t.z - z) < clr + 1 && Math.hypot(t.x - x, t.z - z) < clr + 0.4 * t.s) return false;
      return true;
    },
    // random clear spot in the ring minR..maxR around (cx,cz), optionally at least awayD from a point
    findSpot(minR, maxR, out, clr = 1.6, cx = 0, cz = 0, awayFrom = null, awayD = 0) {
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * 6.28, r = Math.sqrt(minR * minR + Math.random() * (maxR * maxR - minR * minR));
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < awayD) continue;
        if (!K.inLand(x, z, 4)) continue;   // the exact playable shape: never in the fog band past the edge
        if (K.clearSpot(x, z, clr)) { out.x = x; out.z = z; return true; }
      }
      for (let i = 0; i < 20; i++) { // fallback: any open-land spot in the ring, pulled inward until it is in bounds
        const a = Math.random() * 6.28; let r = (minR + maxR) / 2;
        for (let k = 0; k < 8 && !K.inLand(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 4); k++) r *= 0.8;
        out.x = cx + Math.cos(a) * r; out.z = cz + Math.sin(a) * r; if (K.inLand(out.x, out.z, 4)) return false;
      }
      return false;
    },
    // a creature registers itself as an axe target: { pos, radius, canHit(), hurt(dmg, fromPos) }
    addTarget(t) { cr.targets.push(t); },
    toast: (m, s) => G.ui?.toast?.(m, s),
    optimize: optimizeCreature,
    // eyeshine pair: set it, and skip drawing the sprites entirely while they're invisible (by day)
    eyes(pair, dist, a, col, blink = 1, boost = 1) {
      const on = a > 0.01; if (pair.halo.visible !== on) { pair.halo.visible = on; for (const c of pair.cores) c.visible = on; }
      if (on) pair.set(dist, a, col, blink, boost);
    },
  };
  cr.kit = K;

  // ---------------- modules ----------------
  cr.wolves = createWolves(G, cr, K);
  cr.gray = createGrayBears(G, cr, K);
  cr.animals = createAnimals(G, cr, K);
  cr.list = [cr.wolves, cr.gray, cr.animals];

  // ---------------- combat: the axe hits whatever creature is in front ----------------
  // called by controls.js on the swing's hit frame when the brown bear wasn't hit; returns true if something was hit
  cr.hitAt = (pp, fwd) => {
    let best = null, bd = 1e9;
    for (const t of cr.targets) {
      if (!t.canHit()) continue;
      const B = cr.bodyOf && cr.bodyOf(t);
      if (B) { // big bears: measure reach from the body's surface (the Alpha is 6 m nose to tail)
        const r = cr.reachQ(B, pp, fwd); if (r < 1 && r < bd) { bd = r; best = t; }
        continue;
      }
      const dx = t.pos.x - pp.x, dz = t.pos.z - pp.z, l = Math.hypot(dx, dz);
      if (l > 2.3 + t.radius) continue;
      const dot = (dx * fwd.x + dz * fwd.z) / (l || 1);
      if (dot < 0.25 && l > t.radius + 0.7) continue;
      if (l - t.radius < bd) { bd = l - t.radius; best = t; }
    }
    if (!best) return false;
    best.hurt(K.axeDamage(), pp);
    G.controls.shake = Math.max(G.controls.shake, 0.2);
    return true;
  };

  // ---------------- big bodies: the player can't walk into a bear, and the camera never ends up inside one ----------------
  // Each bear (brown, gray, the Alpha) is an ellipsoid along its heading, scaled by the rig and lifted when it rears.
  // controls.js calls blockPlayer() after its own collisions and clampCamera() before placing the camera.
  const bodies = [];
  const addBody = (e, s) => bodies.push({ e, s });
  if (G.bear) addBody(G.bear, 1);
  for (const b of cr.gray.bears) addBody(b, b.scale);
  addBody(cr.gray.alpha, cr.gray.alpha.scale);
  const live = (e) => e.state !== 'dead' && e.state !== 'hidden' && e.root && e.root.visible;
  const ell = { cx: 0, cy: 0, cz: 0, sh: 0, ch: 1, ax: 1, ay: 1, az: 1 };
  function shape(B, pad) {
    const e = B.e, s = B.s, rr = Math.max(0, Math.min(1, e.rear || 0)), h = e.heading || 0;
    ell.sh = Math.sin(h); ell.ch = Math.cos(h);
    const fwd = 0.45 * s * (1 - rr * 0.7);
    ell.cx = e.pos.x + ell.sh * fwd; ell.cz = e.pos.z + ell.ch * fwd; ell.cy = (1.1 + rr * 0.8) * s;
    ell.ax = 0.82 * s + pad; ell.az = (1.8 - rr * 0.9) * s + pad; ell.ay = (1.2 + rr * 0.9) * s + pad;
  }
  const q3 = (x, y, z) => { const dx = x - ell.cx, dz = z - ell.cz, lz = dx * ell.sh + dz * ell.ch, lx = dx * ell.ch - dz * ell.sh, ly = y - ell.cy;
    return Math.sqrt((lx / ell.ax) ** 2 + (ly / ell.ay) ** 2 + (lz / ell.az) ** 2); };
  cr.blockPlayer = (p) => {
    for (const B of bodies) {
      if (!live(B.e)) continue;
      const dx0 = p.x - B.e.pos.x, dz0 = p.z - B.e.pos.z; if (dx0 * dx0 + dz0 * dz0 > 49 * B.s * B.s) continue;
      shape(B, 0.42);
      const dx = p.x - ell.cx, dz = p.z - ell.cz, lz = dx * ell.sh + dz * ell.ch, lx = dx * ell.ch - dz * ell.sh;
      const q = Math.hypot(lx / ell.ax, lz / ell.az); if (q >= 1) continue;
      const k = q > 1e-3 ? 1 / q : 1, nx = q > 1e-3 ? lx * k : ell.ax, nz = q > 1e-3 ? lz * k : 0; // out to the rim
      p.x = ell.cx + nx * ell.ch + nz * ell.sh; p.z = ell.cz - nx * ell.sh + nz * ell.ch;
    }
  };
  cr.bodyOf = (e) => { for (const B of bodies) if (B.e === e) return B; return null; };
  // < 1 when the axe (swung from pp along fwd) reaches this body; smaller is closer
  cr.reachQ = (B, pp, fwd) => {
    shape(B, 0.42 + 1.75);
    const dx = pp.x - ell.cx, dz = pp.z - ell.cz, lz = dx * ell.sh + dz * ell.ch, lx = dx * ell.ch - dz * ell.sh, q = Math.hypot(lx / ell.ax, lz / ell.az);
    if (q >= 1) return 9;
    const l = Math.hypot(dx, dz) || 1; if ((-dx * fwd.x - dz * fwd.z) / l < 0.1) return 9; // must be swinging toward it
    return q - 1; // always < 1 here; ranks against the small creatures' (l - radius) metres loosely
  };
  const cv = new THREE.Vector3();
  // pulls `cam` toward `pivot` until it sits outside every bear; returns true if it moved
  cr.clampCamera = (cam, pivot) => {
    let moved = false;
    for (const B of bodies) {
      if (!live(B.e)) continue;
      const dx0 = pivot.x - B.e.pos.x, dz0 = pivot.z - B.e.pos.z; if (dx0 * dx0 + dz0 * dz0 > 144 * B.s * B.s) continue;
      shape(B, 0.45);
      if (q3(cam.x, cam.y, cam.z) >= 1 || q3(pivot.x, pivot.y, pivot.z) < 1) continue;
      let lo = 0, hi = 1;
      for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; cv.copy(pivot).lerp(cam, m); if (q3(cv.x, cv.y, cv.z) >= 1) lo = m; else hi = m; }
      cv.copy(cam); cam.copy(pivot).lerp(cv, lo * 0.98); moved = true;
    }
    return moved;
  };

  // fight framing: when a big bear is close and hostile, the camera eases back and up so the whole animal (and its
  // telegraph) stays in frame instead of one huge face. controls.js reads cr.camFrame (extra arm metres) and cr.camLift.
  const HOSTILE = new Set(['notice', 'rear', 'charge', 'swipe', 'backoff', 'stalk', 'pace', 'wake']);
  cr.camFrame = 0; cr.camLift = 0;
  function updateFraming(dt) {
    let want = 0; const P = G.controls.pos;
    if (G.mode === 'playing') for (const B of bodies) {
      const e = B.e; if (!live(e) || !HOSTILE.has(e.state)) continue;
      if (e === G.bear && e.state === 'stalk') continue;   // the brown bear circling at night stays a distant threat
      const d = Math.hypot(e.pos.x - P.x, e.pos.z - P.z), s = B.s, near = 1 - Math.max(0, Math.min(1, (d - 3 * s) / (9 * s)));
      want = Math.max(want, near * (s - 0.6) * 1.9);   // brown bear ~0.75 m, gray bears ~1.1 m, the Alpha ~2.3 m
    }
    cr.camFrame += (want - cr.camFrame) * Math.min(1, dt * (want > cr.camFrame ? 2.2 : 0.8));
    cr.camLift = cr.camFrame * 0.45;
  }

  cr.getInteraction = () => null;
  cr.threatAt = (p) => Math.max(cr.wolves.threatAt(p), cr.gray.threatAt(p));

  cr.update = (dt) => {
    look.rate = 0; K.fade = 0;
    cr.wolves.update(dt); cr.gray.update(dt); cr.animals.update(dt); updateFraming(dt);
    // an attacker right on top of the player ghosts the avatar (bear.js applies G._threatFade), so the bite is seen
    (G._threatFade ??= {}).creatures = K.fade;
    // swing the view toward an attacker winding up off-screen (like the bear does), so every hit is seen coming
    if (look.rate > 0 && G.mode === 'playing') {
      const c = G.controls, P = c.pos, ty = Math.atan2(-(look.x - P.x), -(look.z - P.z));
      c.yaw += wrap(ty + 0.42 - c.yaw) * Math.min(1, dt * look.rate);
    }
  };

  cr.summary = () => ({
    caves: cr.caves().map(c => ({ id: c.id, level: c.level, x: Math.round(c.x), z: Math.round(c.z), placeholder: !!c.placeholder })),
    fireLevel: K.fireLevel(), limitR: K.limitR(),
    packs: cr.wolves.summary(), gray: cr.gray.summary(), animals: cr.animals.summary(),
  });
  return cr;
}
