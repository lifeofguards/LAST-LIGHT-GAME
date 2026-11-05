// Caves: big low-poly rock mounds (mossy tops, chunky boulders framing a dark mouth), a boarded-up gate with a
// padlock, a hollow dark chamber inside with stalagmites, bones and faint glowing mushrooms, and a reward chest.
// Each cave also owns its collision (solid mound, walkable tunnel, gate that blocks until unlocked) and keeps the
// third-person camera out of the rock.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { rng } from './world.js';
import { glowTexture } from './campfire.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const MAT = {
  wood: lam('#7a5232'), wood2: lam('#6b4428'), post: lam('#5e4128'), iron: lam('#3a3f46'),
  chest: lam('#8a5a32'), chestDark: lam('#5e3c22'), gold: lam('#e8b84a', { emissive: '#3a2400' }),
  rockIn: lam('#4a4640'), rockIn2: lam('#3c3833'), rockOut: lam('#8b8a84'), rockOut2: lam('#7a7872'),
  floor: lam('#3d3730'), bone: lam('#e9e0cc'), straw: lam('#b99a52'),
  shroom: new THREE.MeshBasicMaterial({ color: '#7ff0d8', fog: false }), shroomCap: new THREE.MeshBasicMaterial({ color: '#4fd6ff', fog: false }),
};
// Merge every static mesh under `root` into one mesh per material (draw calls: ~100 meshes per cave -> ~12).
// Meshes under any node in `keep` (animated gate/chest/lock, fading planes) are left alone.
export function mergeStatic(root, keep = []) {
  const skip = new Set(keep), groups = new Map(), inv = new THREE.Matrix4(), rel = new THREE.Matrix4(), dead = [];
  root.updateMatrixWorld(true); inv.copy(root.matrixWorld).invert();
  const walk = (o) => {
    if (skip.has(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !Array.isArray(o.material)) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(rel);
      const vc = !!o.material.vertexColors;
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(vc && k === 'color')) g.deleteAttribute(k);
      const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
      if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
      groups.get(key).geos.push(g); dead.push(o);
    }
    for (const c of o.children) walk(c);
  };
  for (const c of root.children) walk(c);
  for (const o of dead) if (o.parent) o.parent.remove(o); // (a merged mesh's own child meshes were merged too)
  for (const { mat, cast, recv, geos } of groups.values()) {
    const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], mat); m.castShadow = cast; m.receiveShadow = recv; m.matrixAutoUpdate = false; root.add(m);
  }
  return groups.size;
}
export const KEY_COLORS = { wolf1: '#d08a4a', wolf2: '#d6dde4', wolf3: '#ffd24a', bear: '#e0563a', mountain: '#9fe8ff' };

const YP = 0.7; // dome profile exponent (see shellR)
// horizontal radius of a shell at height y (same profile as shellGeo, without the jitter)
const shellR = (R, H, y) => { const yu = Math.pow(Math.max(0, Math.min(1, y / H)), 1 / YP); return R * Math.sqrt(Math.max(0, 1 - yu * yu)); };
// hemisphere-ish shell from a subdivided icosahedron: jittered (watertight), flattened bottom, a hole cut for the mouth
function shellGeo(R, H, mx, mz, holeHalf, holeTop, seed, inner) {
  const base = new THREE.IcosahedronGeometry(1, 2), P = base.attributes.position, rand = rng(seed);
  const jit = new Map(), key = (x, y, z) => `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
  const out = [], cols = [], c = new THREE.Color();
  const palette = inner ? ['#4a4640', '#423e38', '#3a3631', '#47423b'] : ['#8b8a84', '#7f7d77', '#96948c', '#858179'];
  const moss = [new THREE.Color('#5f8c3c'), new THREE.Color('#4f7a33'), new THREE.Color('#6a9446')];
  const vtx = (i) => {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i); const k = key(x, y, z);
    if (!jit.has(k)) jit.set(k, [(rand() - 0.5), (rand() - 0.5)]);
    const [j1, j2] = jit.get(k), yy = Math.max(y, -0.04), gk = 0.35 + 0.65 * Math.max(0, yy);
    const rf = 1 + j1 * 0.16 * gk * (inner ? 0.7 : 1);
    const yr = yy > 0 ? Math.pow(yy, YP) : yy; // steeper sides near the ground, a rounder dome on top
    return [x * R * rf, yr * H * (1 + j2 * 0.1 * gk), z * R * rf];
  };
  for (let f = 0; f < P.count; f += 3) {
    const cx = (P.getX(f) + P.getX(f + 1) + P.getX(f + 2)) / 3, cy = (P.getY(f) + P.getY(f + 1) + P.getY(f + 2)) / 3, cz = (P.getZ(f) + P.getZ(f + 1) + P.getZ(f + 2)) / 3;
    if (Math.max(P.getY(f), P.getY(f + 1), P.getY(f + 2)) < 0.0) continue; // fully below ground
    const hl = Math.hypot(cx, cz) || 1, along = (cx * mx + cz * mz) / hl;
    if (along > Math.cos(holeHalf) && cy < Math.pow(holeTop, 1 / YP)) continue; // the mouth (holeTop is a fraction of the height)
    const v = [vtx(f), vtx(f + 1), vtx(f + 2)];
    for (const p of v) out.push(...p);
    // per-face colour: weathered greys, mossy grass on the upward faces of the outside
    c.set(palette[Math.floor(rand() * palette.length)]);
    if (!inner && cy > 0.45) { const up = cy / Math.hypot(cx, cy, cz); if (up > 0.62 && rand() < 0.85) c.copy(moss[Math.floor(rand() * 3)]); }
    for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals(); return g;
}

function softArchTexture() {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 64, 4, 32, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.62, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv);
}
let ARCH = null;

export function buildCave(G, site) {
  const { scene } = G, W = G.world;
  const rand = rng(site.id.length * 977 + Math.round(site.r * 13));
  const { x: cx, z: cz, mx, mz, Ro, Ho, Ri, Hi } = site;
  const px = -mz, pz = mx;                       // perpendicular to the mouth
  const halfW = site.type === 'bear' ? 2.9 : 2.4, mouthH = site.type === 'bear' ? 5.0 : 4.1;
  const gateD = Ro - 0.6;
  const root = new THREE.Group(); root.position.set(cx, 0, cz); scene.add(root);
  const L = (along, perp, y = 0) => new THREE.Vector3(mx * along + px * perp, y, mz * along + pz * perp); // local offsets

  // ---------- the mound: outer shell, inner chamber shell, floor ----------
  const outer = new THREE.Mesh(shellGeo(Ro, Ho, mx, mz, Math.asin(Math.min(0.95, (halfW + 1.6) / Ro)), (mouthH + 0.8) / Ho, 11 + site.r, false), lam('#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
  outer.castShadow = true; outer.receiveShadow = true; root.add(outer);
  const inner = new THREE.Mesh(shellGeo(Ri, Hi, mx, mz, Math.asin(Math.min(0.95, (halfW + 1.3) / Ri)), (mouthH + 0.6) / Hi, 29 + site.r, true), lam('#ffffff', { vertexColors: true, side: THREE.BackSide }));
  root.add(inner);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(Ri + 0.6, 14).rotateX(-Math.PI / 2), MAT.floor); floor.position.y = 0.14; floor.receiveShadow = true; root.add(floor);
  const tunnelLen = Ro - Ri + 2.2;
  const tfloor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 0.6, tunnelLen).rotateX(-Math.PI / 2), MAT.floor);
  tfloor.position.copy(L(Ri - 0.6 + tunnelLen / 2, 0, 0.145)); tfloor.rotation.y = Math.atan2(mx, mz); tfloor.receiveShadow = true; root.add(tfloor);

  // ---------- chunky boulders framing the mouth and walling the tunnel ----------
  const bGeo = new THREE.DodecahedronGeometry(1, 0);
  const boulder = (along, perp, y, s, sy, mat) => {
    const m = new THREE.Mesh(bGeo, mat); m.position.copy(L(along, perp, y)); m.scale.set(s * (0.9 + rand() * 0.3), s * sy, s * (0.9 + rand() * 0.3));
    m.rotation.set(rand() * 3, rand() * 6, rand() * 3); m.castShadow = true; m.receiveShadow = true; root.add(m); return m;
  };
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 4; k++) { const along = Ri - 0.4 + k * (Ro - Ri + 0.8) / 3, s = 1.5 + rand() * 0.4; boulder(along, sd * (halfW + s * 1.02), 0.9 + rand() * 0.4, s, 1.3, k >= 2 ? (k === 3 ? MAT.rockOut : MAT.rockOut2) : MAT.rockIn); }
    boulder(Ro - 0.2, sd * (halfW + 1.55), 3.0, 1.5, 1.4, MAT.rockOut2);
    boulder(Ro + 0.4, sd * (halfW + 1.9), 0.6, 1.3, 0.9, MAT.rockOut);
  }
  // lintel + tunnel ceiling
  for (const [R, H, mat, y] of [[Ro, Ho, MAT.rockOut2, mouthH + 0.7], [Ri, Hi, MAT.rockIn2, mouthH + 0.5]]) { const m = boulder(shellR(R, H, y) - 0.4, 0, y, halfW + 0.6, 0.4, mat); m.rotation.set(0, Math.atan2(mx, mz) + (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.2); }

  // ---------- dark mouth (seen from outside) + daylight glow (seen from inside) ----------
  ARCH = ARCH || softArchTexture();
  const voidMat = new THREE.MeshBasicMaterial({ color: '#050403', alphaMap: ARCH, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const voidM = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 1.0, mouthH + 0.6), voidMat);
  voidM.position.copy(L(Ro - 1.6, 0, (mouthH + 0.6) / 2 + 0.1)); voidM.rotation.y = Math.atan2(mx, mz); root.add(voidM);
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffffff', alphaMap: ARCH, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, opacity: 0 });
  const glowM = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 0.6, mouthH + 0.4), glowMat);
  glowM.position.copy(L(Ro + 0.2, 0, (mouthH + 0.4) / 2 + 0.1)); glowM.rotation.y = Math.atan2(mx, mz); glowM.visible = false; root.add(glowM);

  // ---------- inside: stalagmites, bones / straw den, glowing mushrooms ----------
  const colliders = [];
  const stG = new THREE.ConeGeometry(0.5, 2.2, 5); stG.translate(0, 1.1, 0);
  for (let k = 0; k < 7; k++) {
    const a = rand() * 6.28, along = Math.cos(a), r0 = Ri - 1.0 - rand() * 1.6;
    if (along > 0.55) continue; // keep the tunnel side clear
    const m = new THREE.Mesh(stG, rand() < 0.5 ? MAT.rockIn : MAT.rockIn2); const s = 0.6 + rand() * 0.9;
    const lx = Math.cos(a) * r0, lz = Math.sin(a) * r0; m.position.set(mx * lx + px * lz, 0, mz * lx + pz * lz); m.scale.set(s, s * (0.8 + rand() * 0.8), s); m.rotation.y = rand() * 6; m.castShadow = true; root.add(m);
    colliders.push(W.addCollider({ x: cx + m.position.x, z: cz + m.position.z, r: 0.45 * s }));
  }
  const boneG = new THREE.BoxGeometry(0.7, 0.1, 0.1);
  for (let k = 0; k < (site.type === 'bear' ? 14 : 9); k++) {
    const m = new THREE.Mesh(boneG, MAT.bone); const a = rand() * 6.28, rr = rand() * (Ri - 2.5);
    m.position.set(Math.cos(a) * rr, 0.2, Math.sin(a) * rr); m.rotation.set(0, rand() * 6, 0); m.scale.setScalar(site.type === 'bear' ? 1.4 : 1); root.add(m);
  }
  if (site.type === 'wolf') {
    const sG = new THREE.BoxGeometry(1.2, 0.12, 0.5);
    for (let k = 0; k < 10; k++) { const m = new THREE.Mesh(sG, MAT.straw); const a = rand() * 6.28, rr = 1.5 + rand() * 1.6; m.position.copy(L(-1.2 + Math.cos(a) * rr * 0.6, Math.sin(a) * rr, 0.2)); m.rotation.y = rand() * 6; root.add(m); }
  }
  { const capG = new THREE.ConeGeometry(0.16, 0.12, 6), stemG = new THREE.CylinderGeometry(0.035, 0.045, 0.22, 5);
    for (let k = 0; k < 9; k++) {
      const a = rand() * 6.28, r0 = Ri - 0.6 - rand() * 0.8; if (Math.cos(a) > 0.6) continue;
      const lx = Math.cos(a) * r0, lz = Math.sin(a) * r0, g = new THREE.Group(); g.position.set(mx * lx + px * lz, 0.15, mz * lx + pz * lz);
      for (let j = 0; j < 3; j++) { const st = new THREE.Mesh(stemG, MAT.shroom), cp = new THREE.Mesh(capG, MAT.shroomCap); const ox = (rand() - 0.5) * 0.5, oz = (rand() - 0.5) * 0.5, s = 0.7 + rand() * 0.8;
        st.position.set(ox, 0.11 * s, oz); st.scale.setScalar(s); cp.position.set(ox, 0.25 * s, oz); cp.scale.setScalar(s); g.add(st, cp); }
      root.add(g);
    }
  }

  // ---------- the gate: posts, boarded planks, chain + padlock ----------
  const gate = new THREE.Group(); gate.position.copy(L(gateD, 0, 0)); gate.rotation.y = Math.atan2(mx, mz); root.add(gate);
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
  for (const sd of [-1, 1]) gate.add(box(0.38, mouthH + 0.3, 0.38, MAT.post, sd * (halfW + 0.05), (mouthH + 0.3) / 2, 0));
  const planks = [];
  const pw = halfW * 2 + 0.7;
  [0.55, 1.35, 2.15, 2.95, 3.7].forEach((y, i) => { if (y > mouthH - 0.2) return; const p = box(pw, 0.36, 0.13, i % 2 ? MAT.wood2 : MAT.wood, (rand() - 0.5) * 0.2, y, 0.16); p.rotation.z = (rand() - 0.5) * 0.08; gate.add(p); planks.push(p); });
  { const p = box(Math.hypot(pw - 0.4, 2.6), 0.34, 0.12, MAT.wood2, 0, 1.75, 0.27); p.rotation.z = Math.atan2(2.6, pw - 0.4); gate.add(p); planks.push(p); }
  const keyCol = new THREE.Color(KEY_COLORS[site.id] || '#e8b84a');
  const lock = new THREE.Group(); lock.position.set(0, 1.75, 0.42); gate.add(lock);
  lock.add(box(0.46, 0.4, 0.2, lam(keyCol.clone().multiplyScalar(0.8), { emissive: keyCol.clone().multiplyScalar(0.12) }), 0, 0, 0));
  { const sh = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 4, 8, Math.PI), MAT.iron); sh.position.y = 0.2; lock.add(sh); }
  lock.add(box(0.07, 0.14, 0.04, MAT.iron, 0, -0.03, 0.11));
  for (const sd of [-1, 1]) { const ch = box(halfW - 0.2, 0.07, 0.07, MAT.iron, sd * (halfW / 2), 1.85, 0.36); ch.rotation.z = sd * 0.08; gate.add(ch); planks.push(ch); }
  const lockGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,230,160,0.9)', 'rgba(255,200,80,0)'), color: keyCol, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.45 }));
  lockGlow.scale.setScalar(1.1); lock.add(lockGlow);

  // ---------- reward chest at the back of the chamber, facing the mouth ----------
  const chest = new THREE.Group(); chest.position.copy(L(-(Ri - 2.3), 0, 0.14)); chest.rotation.y = Math.atan2(mx, mz); root.add(chest);
  chest.add(box(1.3, 0.7, 0.85, MAT.chest, 0, 0.35, 0));
  for (const sx of [-0.42, 0.42]) chest.add(box(0.12, 0.72, 0.88, MAT.iron, sx, 0.36, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.7, -0.43); chest.add(lid);
  lid.add(box(1.34, 0.32, 0.88, MAT.chestDark, 0, 0.16, 0.43));
  for (const sx of [-0.42, 0.42]) lid.add(box(0.13, 0.34, 0.9, MAT.iron, sx, 0.16, 0.43));
  lid.add(box(0.2, 0.24, 0.08, MAT.gold, 0, 0.0, 0.89));
  const chestGlint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,225,140,0.9)', 'rgba(255,190,60,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0.3 }));
  chestGlint.position.set(0, 0.9, 0.3); chestGlint.scale.setScalar(1.4); chest.add(chestGlint);
  const loot = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,240,190,1)', 'rgba(255,200,90,0)'), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
  loot.position.set(0, 0.95, 0); loot.scale.setScalar(2.2); chest.add(loot);
  const chestCol = W.addCollider({ x: cx + chest.position.x, z: cz + chest.position.z, r: 0.75 });
  const chestWorld = { x: cx + chest.position.x, z: cz + chest.position.z };

  // ---------- state + API ----------
  const cave = {
    site, root, gateD, halfW, mouthH, chestWorld,
    gateWorld: { x: cx + mx * gateD, z: cz + mz * gateD },
    locked: true, chestOpen: false,
  };
  let gateFall = null, lidT = -1, lockDrop = null;

  // collision: solid mound, walkable tunnel (gate blocks it while locked), stay inside the chamber once in
  cave.collide = (p, r) => {
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz, outR = Ro + r;
    if (d2 > outR * outR) return;
    const d = Math.sqrt(d2), inR = Ri - 0.3 - r;
    if (d < inR) return;
    const along = dx * mx + dz * mz, perp = dx * px + dz * pz;
    if (along > 0 && Math.abs(perp) < halfW + 0.15 && d > Ri - 1.5) {
      // in the tunnel: side walls, and the gate line
      const lim = halfW - r * 0.8; if (Math.abs(perp) > lim) { const s = Math.sign(perp) * lim - perp; p.x += px * s; p.z += pz * s; }
      if (cave.locked) {
        const a2 = dx * mx + dz * mz;
        if (a2 >= gateD) { if (a2 < gateD + r + 0.25) { const s = gateD + r + 0.25 - a2; p.x += mx * s; p.z += mz * s; } }
        else if (a2 > gateD - r - 0.25) { const s = gateD - r - 0.25 - a2; p.x += mx * s; p.z += mz * s; }
      }
      return;
    }
    const want = d < (Ri + Ro) / 2 ? inR : outR, k = want / (d || 1);
    p.x = cx + dx * k; p.z = cz + dz * k;
  };
  // where is a point: 'inside' (chamber), 'tunnel', 'outside', or null if far away
  cave.where = (x, z) => {
    const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); if (d > Ro + 2) return null;
    if (d < Ri - 0.2) return 'inside';
    const along = dx * mx + dz * mz, perp = dx * px + dz * pz;
    if (along > 0 && Math.abs(perp) < halfW + 0.3 && d <= Ro + 0.6) return 'tunnel';
    return 'outside';
  };
  // 0 at the gate → 1 a couple of metres into the chamber
  cave.depth = (x, z) => { const d = Math.hypot(x - cx, z - cz); if (d > Ro) return 0; const w = cave.where(x, z); if (w === 'outside') return 0; return THREE.MathUtils.smoothstep(Ro - 0.5 - d, 0, Ro - Ri + 1.5); };

  // keep the camera out of the rock: pull it toward the player's head until it sits somewhere open
  const v = new THREE.Vector3();
  const inEll = (q, R, H) => { const dx = q.x - cx, dz = q.z - cz; return q.y < H && dx * dx + dz * dz < shellR(R, H, Math.max(0, q.y)) ** 2; };
  const inTunnel = (q) => { const dx = q.x - cx, dz = q.z - cz, along = dx * mx + dz * mz, perp = dx * px + dz * pz; return along > Ri - 1.5 && along < Ro + 1.5 && Math.abs(perp) < halfW - 0.25 && q.y < mouthH - 0.2; };
  cave.clampCamera = (cam, pivot, where) => {
    const free = where === 'inside' ? (q) => inEll(q, Ri - 0.7, Hi - 0.5) || inTunnel(q)
      : where === 'tunnel' ? (q) => inTunnel(q) || inEll(q, Ri - 0.7, Hi - 0.5) || !inEll(q, Ro + 0.6, Ho + 0.6)
        : (q) => !inEll(q, Ro + 0.6, Ho + 0.6) || inTunnel(q);
    if (free(cam)) return false;
    let lo = 0, hi = 1;
    for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; v.copy(pivot).lerp(cam, m); if (free(v)) lo = m; else hi = m; }
    v.copy(cam); cam.copy(pivot).lerp(v, lo * 0.97); return true;
  };

  cave.unlock = () => {
    if (!cave.locked) return; cave.locked = false;
    lockDrop = { t: 0, vy: 2.2 };
    gateFall = planks.map((p, i) => ({ p, t: -0.12 * i, vx: (rand() - 0.5) * 1.5, vy: 2.5 + rand() * 2, vz: 3 + rand() * 2.5, sx: (rand() - 0.5) * 6, sz: (rand() - 0.5) * 6 }));
    const g = cave.gateWorld; W.chips && W.chips(g.x, 1.6, g.z, mx, mz, 16);
  };
  cave.openChest = () => { if (cave.chestOpen) return false; cave.chestOpen = true; lidT = 0; return true; };

  const gv = new THREE.Vector3();
  cave.update = (dt, P, depth, where) => {
    const t = G.time;
    // the dark mouth fades as the player walks into it; the daylight glow shows only from inside
    const dO = Math.hypot(P.x - cx, P.z - cz);
    voidMat.opacity = THREE.MathUtils.clamp((dO - (Ro + 0.6)) / 4, 0, 1) * 0.96; voidM.visible = voidMat.opacity > 0.01;
    const dl = G.daynight ? G.daynight.daylight : 1;
    glowM.visible = depth > 0.05; glowMat.opacity = depth * (0.25 + dl * 0.55); if (glowM.visible && G.scene.fog) glowMat.color.copy(G.scene.fog.color).lerp(new THREE.Color(1, 1, 1), 0.25 * dl);
    lockGlow.material.opacity = cave.locked ? 0.3 + 0.18 * Math.sin(t * 3) : 0;
    chestGlint.material.opacity = cave.chestOpen ? 0 : (0.16 + 0.12 * Math.sin(t * 2.2)) * (0.4 + depth);
    if (lockDrop) {
      lockDrop.t += dt; lockDrop.vy -= 14 * dt; lock.position.y = Math.max(0.12, lock.position.y + lockDrop.vy * dt); lock.position.z += dt * 0.9; lock.rotation.x += dt * 6;
      if (lockDrop.t > 3) { lock.visible = false; lockDrop = null; }
    }
    if (gateFall) {
      let alive = false;
      for (const f of gateFall) {
        f.t += dt; if (f.t < 0) { alive = true; continue; }
        const p = f.p; if (!p.visible) continue; alive = true;
        if (f.t < 1.4) { f.vy -= 14 * dt; p.position.x += f.vx * dt; p.position.y = Math.max(0.1, p.position.y + f.vy * dt); p.position.z += f.vz * dt; if (p.position.y > 0.1) { p.rotation.x += f.sx * dt; p.rotation.z += f.sz * dt; } else { f.vx *= 0.8; f.vz *= 0.8; } }
        else { p.position.y -= dt * 0.35; if (f.t > 3.2) p.visible = false; }
      }
      if (!alive) gateFall = null;
    }
    if (lidT >= 0 && lidT < 1) {
      lidT = Math.min(1, lidT + dt / 0.55); const e = 1 + 2.2 * Math.pow(lidT - 1, 3) + 1.2 * Math.pow(lidT - 1, 2); // ease-out-back
      lid.rotation.x = -1.95 * e;
      loot.material.opacity = Math.sin(lidT * Math.PI) * 0.9 + (lidT >= 1 ? 0.35 : 0);
      if (W.emitParticle && Math.random() < 0.9) { chest.getWorldPosition(gv); for (let k = 0; k < 2; k++) W.emitParticle(gv.x + (Math.random() - .5) * 0.8, 1.0, gv.z + (Math.random() - .5) * 0.6, (Math.random() - .5) * 2.5, 3 + Math.random() * 3, (Math.random() - .5) * 2.5, 0.08 + Math.random() * 0.06, Math.random() < 0.5 ? '#ffd34d' : '#fff0b0', 1.0 + Math.random() * 0.6, 7, 1, 8); }
    } else if (cave.chestOpen) loot.material.opacity = 0.2 + 0.1 * Math.sin(t * 3);
  };
  cave.setVisible = (v2) => { root.visible = v2; };
  cave.drawGroups = mergeStatic(root, [gate, chest, voidM, glowM]);
  return cave;
}
