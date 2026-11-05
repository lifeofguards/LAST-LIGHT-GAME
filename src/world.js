// World: ground, forest (instanced, choppable trees), berry bushes, rocks/logs/stumps, log pickups, collisions.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { MAP_R, reserved, mountainK } from './regions.js';

export function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const CLEAR_R = 17, CELL = 6; // MAP_R (160) lives in regions.js with the fire-level rings
const LOG_MAX = 5;

// Chunked instancing: one InstancedMesh per CHUNK-metre cell, so the camera and the sun's shadow frustum skip whole
// patches of the (much larger) forest. Returns an object with the InstancedMesh calls world.js uses, on global indices.
const CHUNK = 48;
function chunkedInstances(scene, geo, mat, pts, { cast = false, receive = true } = {}) {
  const cells = new Map(), where = new Array(pts.length);
  pts.forEach((p, i) => { const k = Math.floor(p.x / CHUNK) * 4096 + Math.floor(p.z / CHUNK); let c = cells.get(k); if (!c) cells.set(k, c = []); c.push(i); });
  const meshes = [];
  for (const ids of cells.values()) {
    const m = new THREE.InstancedMesh(geo, mat, ids.length); m.castShadow = cast; m.receiveShadow = receive;
    let cx = 0, cz = 0; for (const i of ids) { cx += pts[i].x; cz += pts[i].z; } cx /= ids.length; cz /= ids.length;
    let rr = 0; ids.forEach((i, j) => { where[i] = [m, j]; rr = Math.max(rr, Math.hypot(pts[i].x - cx, pts[i].z - cz)); });
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 4, cz), rr + 10); // fixed: felled (zero-scale) instances must not drag it to the origin
    scene.add(m); meshes.push(m);
  }
  const dirtyM = new Set(), dirtyC = new Set();
  return {
    meshes, count: pts.length,
    setMatrixAt(i, mx) { const [m, j] = where[i]; m.setMatrixAt(j, mx); dirtyM.add(m); },
    getMatrixAt(i, out) { const [m, j] = where[i]; m.getMatrixAt(j, out); return out; },
    setColorAt(i, c) { const [m, j] = where[i]; m.setColorAt(j, c); dirtyC.add(m); },
    getColorAt(i, out) { const [m, j] = where[i]; m.getColorAt(j, out); return out; },
    instanceMatrix: { set needsUpdate(v) { if (v) for (const m of dirtyM) m.instanceMatrix.needsUpdate = true; dirtyM.clear(); } },
    instanceColor: { set needsUpdate(v) { if (v) for (const m of dirtyC) if (m.instanceColor) m.instanceColor.needsUpdate = true; dirtyC.clear(); } },
  };
}

export function createWorld(G) {
  const { scene } = G;
  const rand = rng(1337);
  const world = { radius: MAP_R, clearingRadius: CLEAR_R, trees: [], bushes: [], logs: [], props: [], logMax: LOG_MAX };

  // ---------- collision grid ----------
  const grid = new Map();
  const key = (ix, iz) => ix * 10007 + iz;
  world.addCollider = (c) => { const k = key(Math.floor(c.x / CELL), Math.floor(c.z / CELL)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); c.active = true; return c; };
  world.removeCollider = (c) => { c.active = false; };
  world.collide = (p, r) => {
    const ix = Math.floor(p.x / CELL), iz = Math.floor(p.z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(key(ix + dx, iz + dz)); if (!list) continue;
      for (const c of list) {
        if (!c.active) continue;
        const ox = p.x - c.x, oz = p.z - c.z, d2 = ox * ox + oz * oz, rr = c.r + r;
        if (d2 < rr * rr && d2 > 1e-6) { const d = Math.sqrt(d2), push = (rr - d) / d; p.x += ox * push; p.z += oz * push; }
      }
    }
    // edge of the land: the fog barrier at the fire level's radius (and the Mountain once it is open)
    if (G.progression && G.progression.clampZone) G.progression.clampZone(p, r);
    else { const len = Math.hypot(p.x, p.z), lim = MAP_R - 2; if (len > lim) { p.x *= lim / len; p.z *= lim / len; } }
    return p;
  };

  // ---------- trails: a few wiggly dirt paths radiating from camp ----------
  const PATHS = [0.35, 2.4, 4.3].map((a0, i) => ({ a0, w1: 0.18 + i * 0.05, f1: 0.045 + i * 0.01 }));
  const pathAngle = (P, r) => P.a0 + Math.sin(r * P.f1 + P.a0 * 3) * P.w1 + Math.sin(r * 0.11) * 0.05;
  world.pathDist = (x, z) => {
    const r = Math.hypot(x, z); if (r < 6 || r > MAP_R - 12) return 99;
    let best = 99; const a = Math.atan2(z, x);
    for (const P of PATHS) { let d = a - pathAngle(P, r); d = Math.atan2(Math.sin(d), Math.cos(d)); best = Math.min(best, Math.abs(d) * r); }
    return best;
  };
  world.paths = PATHS.map(P => (r) => { const a = pathAngle(P, r); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; });

  // ---------- ground ----------
  const groundGeo = new THREE.PlaneGeometry(340, 340, 150, 150); groundGeo.rotateX(-Math.PI / 2);
  const cols = [], pos = groundGeo.attributes.position, c = new THREE.Color();
  const grassA = new THREE.Color('#5f8c3c'), grassB = new THREE.Color('#47702f'), dirt = new THREE.Color('#7b5e40'), dark = new THREE.Color('#2c4221'), snowC = new THREE.Color('#dfe8ee');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    const n = (Math.sin(x * 0.21) * Math.cos(z * 0.17) + Math.sin(x * 0.05 + z * 0.07)) * 0.25 + 0.5 + (rand() - 0.5) * 0.25;
    c.copy(grassA).lerp(grassB, THREE.MathUtils.clamp(n, 0, 1));
    if (r < 7) c.lerp(dirt, THREE.MathUtils.smoothstep(7 - r, 0, 3.5) * 0.85);
    const pd = world.pathDist(x, z); if (pd < 2.4) c.lerp(dirt, (1 - pd / 2.4) * 0.7 * Math.min(1, (r - 6) / 5, (MAP_R - 12 - r) / 10));
    if (r > MAP_R) c.lerp(dark, Math.min(1, (r - MAP_R) / 20));
    { const sk = mountainK(x, z); if (sk > 0) c.lerp(snowC, sk * 0.9); }
    pos.setY(i, r > 6 ? (Math.sin(x * 0.13) * Math.sin(z * 0.11)) * 0.12 : 0);
    cols.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  ground.receiveShadow = true; scene.add(ground);
  world.ground = ground;

  // grass tufts
  {
    const g = new THREE.ConeGeometry(0.09, 0.45, 3); g.translate(0, 0.2, 0);
    const n = 4200, m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: '#6f9c45', flatShading: true }), n);
    const o = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = 5 + Math.sqrt(rand()) * (MAP_R - 5);
      o.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); o.rotation.set((rand() - .5) * .5, rand() * 6, (rand() - .5) * .5);
      o.scale.setScalar((0.6 + rand() * 0.9) * (world.pathDist(o.position.x, o.position.z) < 1.3 || reserved(o.position.x, o.position.z, -2) ? 0 : 1)); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, col.setHSL(0.24 + rand() * 0.06, 0.45, 0.32 + rand() * 0.12));
    }
    scene.add(m);
  }

  // ---------- trees (instanced) ----------
  const barkMat = new THREE.MeshLambertMaterial({ color: '#6e4b2e', flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true });
  const trunkGeo = new THREE.CylinderGeometry(0.26, 0.38, 2.4, 6); trunkGeo.translate(0, 1.2, 0);
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(1.9, 2.6, 7).translate(0, 2.9, 0),
    new THREE.ConeGeometry(1.5, 2.3, 7).translate(0, 4.2, 0),
    new THREE.ConeGeometry(1.0, 2.0, 7).translate(0, 5.4, 0),
  ]);
  const oakGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(1.9, 0).translate(0, 3.7, 0),
    new THREE.IcosahedronGeometry(1.3, 0).translate(0.9, 4.6, 0.4),
    new THREE.IcosahedronGeometry(1.2, 0).translate(-0.8, 4.4, -0.5),
  ]);
  const stumpGeo = new THREE.CylinderGeometry(0.34, 0.4, 0.5, 7); stumpGeo.translate(0, 0.25, 0);
  world.geo = { trunkGeo, pineGeo, oakGeo }; world.mats = { barkMat, leafMat };

  // place trees
  const cand = [];
  const occ = new Map();
  const tooClose = (x, z, d) => { const ix = Math.floor(x / 4), iz = Math.floor(z / 4); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = occ.get(key(ix + a, iz + b)); if (l) for (const q of l) if ((q[0] - x) ** 2 + (q[1] - z) ** 2 < d * d) return true; } return false; };
  const mark = (x, z) => { const k = key(Math.floor(x / 4), Math.floor(z / 4)); if (!occ.has(k)) occ.set(k, []); occ.get(k).push([x, z]); };
  for (let i = 0; i < 16000 && cand.length < 1880; i++) {
    const a = rand() * Math.PI * 2, r = CLEAR_R + 3 + Math.sqrt(rand()) * (MAP_R + 14 - CLEAR_R);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const spacing = r < 30 ? 5.5 : r > MAP_R ? 2.6 : 3.4;
    if (rand() < (r < 28 ? 0.5 : 0)) continue;
    if (tooClose(x, z, spacing)) continue;
    if (world.pathDist(x, z) < 2.6) continue;
    if (reserved(x, z)) continue;
    mark(x, z); cand.push({ x, z, r });
  }
  const pineIdx = [], oakIdx = [];
  for (const p of cand) {
    const type = rand() < 0.68 ? 'pine' : 'oak';
    const s = 0.8 + rand() * 0.65 + (p.r > 45 ? rand() * 0.25 : 0);
    const t = { x: p.x, z: p.z, s, sy: s * (type === 'pine' ? 0.95 + rand() * 0.4 : 0.9 + rand() * 0.2), rot: rand() * 6.28, type, alive: true, wobble: 0, wobbleDir: 0, idx: 0 };
    t.maxHp = t.hp = s < 1.0 ? 3 : s < 1.3 ? 4 : 5; t.logs = s < 1.0 ? 2 : 3;
    t.idx = type === 'pine' ? pineIdx.length : oakIdx.length;
    (type === 'pine' ? pineIdx : oakIdx).push(t);
    t.i = world.trees.length; world.trees.push(t);
    t.collider = world.addCollider({ x: t.x, z: t.z, r: 0.45 * t.s, tree: t });
  }
  const trunks = chunkedInstances(scene, trunkGeo, barkMat, world.trees, { cast: true });
  const pines = chunkedInstances(scene, pineGeo, leafMat, pineIdx, { cast: true });
  const oaks = chunkedInstances(scene, oakGeo, leafMat, oakIdx, { cast: true });
  const stumps = chunkedInstances(scene, stumpGeo, barkMat, world.trees, { receive: false });

  // ---------- endless backdrop: dense non-interactive forest past the map edge + far ground disc ----------
  // Nothing past the playable ring is ever empty: the fog swallows row after row of trees instead of a flat edge.
  {
    const far = new THREE.Mesh(new THREE.CircleGeometry(520, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#34502a' }));
    far.position.y = -0.06; scene.add(far);
    const bt = [], bRand = rng(4242);
    for (let i = 0; i < 6000 && bt.length < 1100; i++) {
      const a = bRand() * Math.PI * 2, r = MAP_R + 12 + Math.sqrt(bRand()) * 80;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (tooClose(x, z, r < MAP_R + 40 ? 2.8 : 3.6)) continue;
      if (reserved(x, z)) continue;
      mark(x, z); bt.push({ x, z, s: 0.95 + bRand() * 0.7, pine: bRand() < 0.75, rot: bRand() * 6.28 });
    }
    const bp = bt.filter(t => t.pine), bo = bt.filter(t => !t.pine);
    const bTr = chunkedInstances(scene, trunkGeo, barkMat, bt);
    const bPi = chunkedInstances(scene, pineGeo, leafMat, bp), bOa = chunkedInstances(scene, oakGeo, leafMat, bo);
    const o = new THREE.Object3D(), cc = new THREE.Color();
    bt.forEach((t, i) => { o.position.set(t.x, 0, t.z); o.rotation.set(0, t.rot, 0); o.scale.set(t.s, t.s * (1 + bRand() * 0.35), t.s); o.updateMatrix(); t.m = o.matrix.clone(); bTr.setMatrixAt(i, t.m); });
    bp.forEach((t, i) => { bPi.setMatrixAt(i, t.m); bPi.setColorAt(i, cc.setHSL(0.36 + bRand() * 0.05, 0.4, 0.22 + bRand() * 0.07)); });
    bo.forEach((t, i) => { bOa.setMatrixAt(i, t.m); bOa.setColorAt(i, cc.setHSL(0.26 + bRand() * 0.05, 0.42, 0.26 + bRand() * 0.07)); });
    world.backdrop = { trunks: bTr, pines: bPi, oaks: bOa, count: bt.length };
  }

  // ---------- exponential depth fog ----------
  // daynight.js drives fog colour + near/far per keyframe; we swap its linear Fog for FogExp2 whose density is
  // derived from `far`, so the curve is always gradual: by day the map edge sits in ~98% haze, at night trunks
  // dissolve into the dark over 10-30 m instead of snapping to a flat wall.
  const fogDensity = (far) => { const k = THREE.MathUtils.clamp((far - 32) / 123, 0, 1); return (2.1 + 1.3 * k) / Math.max(far, 8); };
  const makeFog = (src) => {
    const f = new THREE.FogExp2(src ? src.color.getHex() : 0xbfe0ee, fogDensity(src && src.far || 155));
    let _near = src ? src.near : 36, _far = src ? src.far : 155;
    Object.defineProperty(f, 'near', { get: () => _near, set: (v) => { _near = v; } });
    Object.defineProperty(f, 'far', { get: () => _far, set: (v) => { _far = v; f.density = fogDensity(v); } });
    f.__lastLight = true; return f;
  };
  world.fogDensity = fogDensity;
  const ensureFog = () => { const f = scene.fog; if (f && !f.__lastLight && !f.isFogExp2) scene.fog = makeFog(f); };
  // Night depth: runs at render time (after daynight has written its keyframe) so the fog, background and the sky's
  // lower band are ONE colour — a deep blue-black the tree line dissolves into, never black slabs on a navy wall.
  const nightFog = new THREE.Color('#0a1226'), tmpF = new THREE.Color();
  let skyUni = null;
  const moonLift = new THREE.Color('#050916'), liftMats = [barkMat, leafMat, ground.material];
  const prevBR = scene.onBeforeRender;
  scene.onBeforeRender = function (...args) {
    if (prevBR) prevBR.apply(this, args);
    const dn = G.daynight, f = scene.fog; if (!dn || !f) return;
    if (!skyUni) scene.traverse(o => { if (!skyUni && o.material && o.material.uniforms && o.material.uniforms.uBand) skyUni = o.material.uniforms; });
    const d = THREE.MathUtils.clamp(dn.darkness || 0, 0, 1), k = d * d * (3 - 2 * d);
    // faint moon-lift so near trunks/crowns are deep blue-black shapes that match the fog, not pure-black cut-outs
    for (const m of liftMats) m.emissive.copy(moonLift).multiplyScalar(k);
    if (k <= 0.001) return;
    tmpF.copy(f.color).lerp(nightFog, k * 0.85);
    f.color.copy(tmpF);
    if (scene.background && scene.background.isColor) scene.background.copy(tmpF);
    if (skyUni) { skyUni.uHor.value.copy(tmpF); skyUni.uBand.value *= 1 - k * 0.9; skyUni.uZen.value.lerp(tmpF, k * 0.35); }
  };
  world.instanced = { trunks, pines, oaks, stumps };
  const o3 = new THREE.Object3D(), tmpC = new THREE.Color(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const setTree = (t) => {
    o3.position.set(t.x, 0, t.z); o3.rotation.set(0, t.rot, 0); o3.scale.set(t.s, t.sy, t.s);
    if (t.wobble > 0) { const a = Math.sin(t.wobble * 38) * t.wobble * 0.17; o3.rotation.x = Math.cos(t.wobbleDir) * a; o3.rotation.z = Math.sin(t.wobbleDir) * a; }
    o3.updateMatrix();
    const m = t.alive ? o3.matrix : zero;
    trunks.setMatrixAt(t.i, m); (t.type === 'pine' ? pines : oaks).setMatrixAt(t.idx, m);
    trunks.instanceMatrix.needsUpdate = true; (t.type === 'pine' ? pines : oaks).instanceMatrix.needsUpdate = true;
  };
  for (const t of world.trees) {
    setTree(t);
    stumps.setMatrixAt(t.i, zero);
    const leaf = t.type === 'pine' ? tmpC.setHSL(0.36 + rand() * 0.05, 0.42, 0.24 + rand() * 0.08) : tmpC.setHSL(0.25 + rand() * 0.06, 0.45, 0.3 + rand() * 0.08);
    (t.type === 'pine' ? pines : oaks).setColorAt(t.idx, leaf);
  }

  // ---------- props: rocks, fallen logs, stumps ----------
  const rockMat = new THREE.MeshLambertMaterial({ color: '#8b8a84', flatShading: true });
  for (let i = 0; i < 64; i++) {
    const a = rand() * 6.28, r = 12 + rand() * (MAP_R - 16), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (tooClose(x, z, 2.2) || reserved(x, z)) continue;
    const s = 0.4 + rand() * 1.1;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat);
    m.position.set(x, s * 0.35, z); m.scale.set(s * (1 + rand() * .5), s * (0.6 + rand() * .4), s); m.rotation.set(rand(), rand() * 6, rand());
    m.castShadow = m.receiveShadow = true; scene.add(m); mark(x, z);
    if (s > 0.7) world.addCollider({ x, z, r: s * 0.9 });
  }
  const bark2 = new THREE.MeshLambertMaterial({ color: '#5e4128', flatShading: true });
  const endMat = new THREE.MeshLambertMaterial({ color: '#c9a36b', flatShading: true });
  for (let i = 0; i < 20; i++) {
    const a = rand() * 6.28, r = 20 + rand() * (MAP_R - 26), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (tooClose(x, z, 3) || reserved(x, z)) continue;
    const L = 3 + rand() * 2.5;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, L, 7), [bark2, endMat, endMat]);
    m.rotation.set(0, rand() * 6, Math.PI / 2); m.position.set(x, 0.35, z); m.castShadow = true; scene.add(m);
    m.rotation.order = 'YXZ';
    world.addCollider({ x, z, r: 0.8 });
  }
  for (let i = 0; i < 24; i++) {
    const a = rand() * 6.28, r = 14 + rand() * (MAP_R - 20), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (tooClose(x, z, 2) || reserved(x, z)) continue;
    const m = new THREE.Mesh(stumpGeo, [bark2, endMat, endMat]); m.position.set(x, 0, z); m.scale.setScalar(1 + rand() * .6); m.castShadow = true; scene.add(m);
    world.addCollider({ x, z, r: 0.45 });
  }

  // ---------- ground decor: ferns, flowers, mushrooms (instanced, cheap) ----------
  {
    const fernGeo = mergeGeometries([0, 1, 2, 3, 4].map(k => new THREE.BoxGeometry(0.12, 0.04, 0.9).translate(0, 0.2, 0.42).rotateX(-0.45).rotateY(k * 1.256)));
    const fn = 700, ferns = new THREE.InstancedMesh(fernGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), fn);
    const flGeo = mergeGeometries([new THREE.BoxGeometry(0.04, 0.3, 0.04).translate(0, 0.15, 0), new THREE.BoxGeometry(0.16, 0.08, 0.16).translate(0, 0.32, 0)]);
    const fln = 360, flowers = new THREE.InstancedMesh(flGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), fln);
    const muGeo = mergeGeometries([new THREE.CylinderGeometry(0.05, 0.06, 0.2, 5).translate(0, 0.1, 0), new THREE.ConeGeometry(0.17, 0.14, 6).translate(0, 0.25, 0)]);
    const mun = 200, mush = new THREE.InstancedMesh(muGeo, new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), mun);
    const o = new THREE.Object3D(), col = new THREE.Color();
    const place = (m, n, rMin, near, colorFn, sMin, sMax) => {
      for (let i = 0; i < n; i++) {
        let x, z;
        if (near && world.trees.length) { const t = world.trees[Math.floor(rand() * world.trees.length)]; const a = rand() * 6.28, d = 0.7 + rand() * 1.4; x = t.x + Math.cos(a) * d; z = t.z + Math.sin(a) * d; }
        else { const a = rand() * 6.28, r = rMin + Math.sqrt(rand()) * (MAP_R - rMin); x = Math.cos(a) * r; z = Math.sin(a) * r; }
        const ok = world.pathDist(x, z) > 1.5 && Math.hypot(x, z) > rMin && !reserved(x, z, -1);
        o.position.set(x, 0, z); o.rotation.set(0, rand() * 6.28, 0); o.scale.setScalar(ok ? sMin + rand() * (sMax - sMin) : 0); o.updateMatrix();
        m.setMatrixAt(i, o.matrix); m.setColorAt(i, colorFn(col));
      }
      m.receiveShadow = true; scene.add(m);
    };
    world.decorPending = () => {
      place(ferns, fn, 16, true, c => c.setHSL(0.29 + rand() * 0.05, 0.5, 0.22 + rand() * 0.08), 0.9, 1.7);
      const fc = ['#f4f1e6', '#f2d14b', '#c98be0', '#f08aa0'];
      place(flowers, fln, 8, false, c => c.set(fc[Math.floor(rand() * fc.length)]), 0.8, 1.3);
      place(mush, mun, 18, true, c => rand() < 0.7 ? c.set('#c8352c') : c.set('#d9b98a'), 0.8, 1.6);
    };
    world.decorPending();
  }

  // ---------- berry bushes ----------
  const bushMat = new THREE.MeshLambertMaterial({ color: '#3f7a35', flatShading: true });
  const berryMat = new THREE.MeshLambertMaterial({ color: '#d8283c', emissive: '#3a0008', flatShading: true });
  const bushGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.75, 0).translate(0, 0.55, 0),
    new THREE.IcosahedronGeometry(0.55, 0).translate(0.55, 0.45, 0.2),
    new THREE.IcosahedronGeometry(0.5, 0).translate(-0.5, 0.4, -0.2),
  ]);
  const berryGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  for (let i = 0; i < 18; i++) {
    let x, z, tries = 0;
   
    do { const a = rand() * 6.28, r = (i < 2 ? 18 : 32) + rand() * (i < 2 ? 3 : 50); x = Math.cos(a) * r; z = Math.sin(a) * r; tries++; } while ((tooClose(x, z, 2.5) || reserved(x, z)) && tries < 30);
    mark(x, z);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rand() * 6;
    const b = new THREE.Mesh(bushGeo, bushMat); b.castShadow = true; g.add(b);
    const berries = new THREE.Group();
    for (let k = 0; k < 10; k++) {
      const bm = new THREE.Mesh(berryGeo, berryMat);
      const th = rand() * 6.28, ph = 0.3 + rand() * 1.0;
      bm.position.set(Math.cos(th) * Math.sin(ph) * 0.8, 0.5 + Math.cos(ph) * 0.6, Math.sin(th) * Math.sin(ph) * 0.8); bm.rotation.set(rand(), rand(), 0);
      berries.add(bm);
    }
    g.add(berries); scene.add(g);
    world.bushes.push({ x, z, group: g, berries, ready: true, regrow: 0, collider: world.addCollider({ x, z, r: 0.7 }) });
  }

  // ---------- log pickups ----------
  const logGeo = new THREE.CylinderGeometry(0.2, 0.22, 1.3, 7); logGeo.rotateZ(Math.PI / 2);
  world.spawnLog = (x, z, rotY = Math.random() * 6) => {
    const m = new THREE.Mesh(logGeo, [bark2, endMat, endMat]);
    m.position.set(x, 0.22, z); m.rotation.y = rotY; m.castShadow = true; scene.add(m);
    const l = { x, z, mesh: m, t: 0 }; world.logs.push(l); return l;
  };
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + rand() * 0.5, r = 8 + rand() * 8; world.spawnLog(Math.cos(a) * r, Math.sin(a) * r); }

  // ---------- chip / leaf / dust particles (one instanced pool) ----------
  const PN = 260, parts = [];
  const partMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), PN);
  partMesh.frustumCulled = false; partMesh.castShadow = false;
  for (let i = 0; i < PN; i++) { partMesh.setMatrixAt(i, zero); partMesh.setColorAt(i, tmpC.set('#fff')); parts.push({ life: 0 }); }
  scene.add(partMesh);
  let pNext = 0; const pc = new THREE.Color();
  const emit = (x, y, z, vx, vy, vz, size, color, life, grav = 14, drag = 0.5, spin = 12) => {
    const q = parts[pNext]; const i = pNext; pNext = (pNext + 1) % PN;
    Object.assign(q, { x, y, z, vx, vy, vz, size, life, max: life, grav, drag, rx: rand() * 6, ry: rand() * 6, spin: (Math.random() - .5) * spin });
    partMesh.setColorAt(i, pc.set(color)); partMesh.instanceColor.needsUpdate = true;
  };
  world.emitParticle = emit;
  const woodCols = ['#e3c38f', '#d2ab72', '#c49a5e', '#7a5232'];
  world.chips = (x, y, z, dirX, dirZ, n = 9) => {
    for (let k = 0; k < n; k++) {
      const sp = 3 + Math.random() * 4, a = Math.atan2(dirZ, dirX) + (Math.random() - .5) * 2.2;
      emit(x, y, z, Math.cos(a) * sp, 2.5 + Math.random() * 4, Math.sin(a) * sp, 0.07 + Math.random() * 0.09, woodCols[k % 4], 0.9 + Math.random() * 0.6);
    }
  };
  const leafBurst = (x, y, z, col, n, spread = 2.2) => {
    for (let k = 0; k < n; k++) emit(x + (Math.random() - .5) * spread, y + (Math.random() - .5) * spread * 0.8, z + (Math.random() - .5) * spread,
      (Math.random() - .5) * 2.5, Math.random() * 1.5, (Math.random() - .5) * 2.5, 0.1 + Math.random() * 0.12, pc.copy(col).offsetHSL(0, 0, (Math.random() - .5) * 0.12).getHex(), 1.6 + Math.random() * 1.4, 2.2, 1.8, 6);
  };
  const dust = (x, z, n) => { for (let k = 0; k < n; k++) { const a = Math.random() * 6.28, sp = 2 + Math.random() * 4; emit(x + Math.cos(a) * 2.5 * Math.random(), 0.2, z + Math.sin(a) * 2.5 * Math.random(), Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp, 0.18 + Math.random() * 0.2, '#9a8466', 0.8 + Math.random() * 0.5, 4, 2.5, 3); } };
  const updateParts = (dt) => {
    let any = false;
    for (let i = 0; i < PN; i++) {
      const q = parts[i]; if (q.life <= 0) continue; any = true;
      q.life -= dt;
      if (q.life <= 0) { partMesh.setMatrixAt(i, zero); continue; }
      q.vy -= q.grav * dt; const dk = Math.exp(-q.drag * dt); q.vx *= dk; q.vz *= dk; if (q.drag > 1) q.vy *= dk;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.size * 0.5) { q.y = q.size * 0.5; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; q.spin *= 0.5; }
      q.rx += q.spin * dt; q.ry += q.spin * 0.7 * dt;
      const sc = q.size * Math.min(1, q.life / 0.3);
      o3.position.set(q.x, q.y, q.z); o3.rotation.set(q.rx, q.ry, 0); o3.scale.set(sc, sc * 0.6, sc); o3.updateMatrix();
      partMesh.setMatrixAt(i, o3.matrix);
    }
    if (any || partMesh.userData.dirty) { partMesh.instanceMatrix.needsUpdate = true; partMesh.userData.dirty = any; }
  };

  // ---------- chopping ----------
  const falling = [];
  world.findChopTarget = (px, pz, fx, fz, reach = 2.7) => {
    let best = null, bd = 1e9;
    const ix = Math.floor(px / CELL), iz = Math.floor(pz / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(key(ix + dx, iz + dz)); if (!list) continue;
      for (const c of list) {
        if (!c.active || !c.tree) continue;
        if (G.progression && !G.progression.inBounds(c.x, c.z, 0.5)) continue; // trees in the fog wall can't be reached
        const ox = c.x - px, oz = c.z - pz, d = Math.hypot(ox, oz) - c.r;
        if (d > reach) continue;
        const dot = (ox * fx + oz * fz) / (Math.hypot(ox, oz) || 1);
        if (dot < 0.35) continue;
        if (d < bd) { bd = d; best = c.tree; }
      }
    }
    return best;
  };
  world.hitTree = (t, px, pz, dmg = 1) => {
    if (!t || !t.alive) return;
    t.hp -= dmg; t.wobble = 0.55; world.chopCamT = Math.max(world.chopCamT || 0, 3); world.chopFocus = { x: t.x, z: t.z }; t.wobbleDir = Math.atan2(t.z - pz, t.x - px);
    { const dx = px - t.x, dz = pz - t.z, d = Math.hypot(dx, dz) || 1, rr = 0.36 * t.s;
      world.chips(t.x + dx / d * rr, 1.0 + Math.random() * 0.3, t.z + dz / d * rr, dx / d, dz / d, 10);
      const col = new THREE.Color(); (t.type === 'pine' ? pines : oaks).getColorAt(t.idx, col);
      leafBurst(t.x, 3.6 * t.sy, t.z, col, 4); }
    G.events.emit('treeHit', { tree: t });
    if (t.hp <= 0) fell(t, px, pz);
  };
  function fell(t, px, pz) {
    t.alive = false; t.wobble = 0; setTree(t); world.removeCollider(t.collider);
    o3.position.set(t.x, 0, t.z); o3.rotation.set(0, t.rot, 0); o3.scale.setScalar(t.s); o3.updateMatrix();
    stumps.setMatrixAt(t.i, o3.matrix); stumps.instanceMatrix.needsUpdate = true;
    const pivot = new THREE.Group(); pivot.position.set(t.x, 0.45 * t.s, t.z);
    const inner = new THREE.Group(); inner.rotation.y = t.rot; inner.scale.set(t.s, t.sy, t.s); inner.position.y = -0.45 * t.s; pivot.add(inner);
    const trunk = new THREE.Mesh(trunkGeo, barkMat); trunk.castShadow = true;
    const col = new THREE.Color(); (t.type === 'pine' ? pines : oaks).getColorAt(t.idx, col);
    const leaf = new THREE.Mesh(t.type === 'pine' ? pineGeo : oakGeo, new THREE.MeshLambertMaterial({ color: col, flatShading: true, emissive: col.clone().multiplyScalar(0.05), transparent: false, opacity: 1 })); leaf.castShadow = true;
    inner.add(trunk, leaf); scene.add(pivot);
    // fall SIDEWAYS across the camera's view (perpendicular to the chopper->tree line), angled a little away from the player
    const away = Math.atan2(t.z - pz, t.x - px);
    // fall across the (orbited) chop-camera's view: toward screen-right, angled slightly away from the camera
    let fx = Math.cos(away + 1.4), fz = Math.sin(away + 1.4);
    if (G.camera) { const q = world.lastCamQ || G.camera.quaternion, r = new THREE.Vector3(1, 0, 0).applyQuaternion(q), f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      r.y = 0; f.y = 0; r.normalize(); f.normalize(); if (r.x * Math.cos(away) + r.z * Math.sin(away) < 0) r.negate(); if (f.x * Math.cos(away) + f.z * Math.sin(away) < 0) f.negate(); fx = r.x * 0.85 + f.x * 0.53; fz = r.z * 0.85 + f.z * 0.53; }
    const dir = Math.atan2(fz, fx), side = 1;
    falling.push({ t, pivot, inner, trunk, leaf, col, dir, side, ang: 0, vel: 0, phase: 'creak', timer: 0 });
    world.chips(t.x, 0.6, t.z, Math.cos(away), Math.sin(away), 14);
    world.chopCamT = Math.max(world.chopCamT || 0, 3);
    G.events.emit('treeFall', { tree: t });
  }

  // ---------- interactions ----------
  world.getInteraction = (p) => {
    let best = null;
    const inv = G.survival.inventory;
    for (const l of world.logs) {
      const d = Math.hypot(l.x - p.x, l.z - p.z);
      if (d < 2.3 && (!best || d < best.dist)) {
        const full = inv.logs >= LOG_MAX;
        best = { dist: d, label: full ? `Sack full (${inv.logs}/${LOG_MAX})` : `[E] Pick up log (${inv.logs}/${LOG_MAX})`, disabled: full, target: l,
          action: () => { if (full) return; inv.logs++; scene.remove(l.mesh); world.logs.splice(world.logs.indexOf(l), 1); G.events.emit('pickup', { item: 'log' }); } };
      }
    }
    for (const b of world.bushes) {
      const d = Math.hypot(b.x - p.x, b.z - p.z) - 0.6;
      if (b.ready && d < 2.0 && (!best || d < best.dist)) {
        best = { dist: d, label: '[E] Eat berries', target: b, action: () => { b.ready = false; b.regrow = 55; b.berries.visible = false; G.survival.eat(35); } };
      }
    }
    return best;
  };

  world.update = (dt) => {
    ensureFog();
    for (const t of world.trees) if (t.wobble > 0) { t.wobble = Math.max(0, t.wobble - dt); setTree(t); }
    if (world.chopCamT > 0) world.chopCamT = Math.max(0, world.chopCamT - dt);
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i], T = f.t;
      f.timer += dt;
      if (f.phase === 'creak') {
        // groan + shudder: leans a few degrees in jerks before it lets go
        const k = Math.min(1, f.timer / 0.85);
        f.ang = k * k * 0.14 + Math.sin(f.timer * 42) * 0.012 * (1 - k * 0.5);
        if (Math.random() < dt * 14) world.emitParticle(T.x + (Math.random() - .5) * .5, 0.5 * T.s, T.z + (Math.random() - .5) * .5, (Math.random() - .5) * 2, 1.6, (Math.random() - .5) * 2, 0.07, '#d9b98a', 0.6, 9, 1, 3);
        if (f.timer >= 0.85) { f.phase = 'fall'; f.vel = 0.35; f.timer = 0; G.events.emit('treeTopple', { tree: T }); }
      } else if (f.phase === 'fall') {
        f.vel += (1.4 + f.ang * 6) * dt; f.ang += f.vel * dt;
        const END = Math.PI / 2 - 0.06;
        if (f.ang >= END) {
          f.ang = END; f.phase = 'landed'; f.timer = 0;
          const lx = T.x + Math.cos(f.dir) * 2.4 * T.sy, lz = T.z + Math.sin(f.dir) * 2.4 * T.sy;
          G.events.emit('treeLand', { x: lx, z: lz });
          dust(lx, lz, 16); dust(T.x + Math.cos(f.dir) * 4.6 * T.sy, T.z + Math.sin(f.dir) * 4.6 * T.sy, 14);
          leafBurst(T.x + Math.cos(f.dir) * 4.2 * T.sy, 0.9, T.z + Math.sin(f.dir) * 4.2 * T.sy, f.col, 26, 3.6);
          if (G.controls) { const pd = Math.hypot(G.controls.pos.x - lx, G.controls.pos.z - lz); if (pd < 16) G.controls.shake = Math.max(G.controls.shake || 0, 0.35 * (1 - pd / 16)); }
        }
      } else if (f.phase === 'landed') {
        // heavy bounce, then settles; after a beat the trunk splits into logs lying along its length
        const bounce = f.timer < 0.45 ? Math.sin(f.timer / 0.45 * Math.PI) * 0.1 * (1 - f.timer / 0.45 * 0.5) : 0;
        f.ang = Math.PI / 2 - 0.06 - bounce;
        if (f.timer > 1.0) {
          f.phase = 'split'; f.timer = 0;
          f.inner.remove(f.trunk); f.leaf.castShadow = false; f.leaf.material.transparent = true; f.leaf.material.needsUpdate = true;
          // crown bursts into leaf cubes along its length, then fades/sinks out so the logs are clearly visible
          for (const r of (T.type === 'pine' ? [3.0, 4.2, 5.3] : [3.4, 4.2, 4.8])) {
            leafBurst(T.x + Math.cos(f.dir) * r * T.sy, 0.8 + Math.random() * 0.4, T.z + Math.sin(f.dir) * r * T.sy, f.col, 16, 3.2);
          }
          const n = T.logs, len = 2.4 * T.sy - 0.45 * T.s, seg = len / n;
          for (let k = 0; k < n; k++) {
            const d = 0.1 * T.s + seg * (k + 0.5) + (k - (n - 1) / 2) * 0.25;
            let x = T.x + Math.cos(f.dir) * d, z = T.z + Math.sin(f.dir) * d;
            { const dd = 1.4 + k * 1.3 * T.sy; x = T.x + Math.cos(f.dir) * dd; z = T.z + Math.sin(f.dir) * dd; }
            const l = world.spawnLog(x + (Math.random() - .5) * .25, z + (Math.random() - .5) * .25, -f.dir + (Math.random() - .5) * 0.35);
            l.pop = 0.32 + k * 0.06; l.popMax = l.pop;
            world.chips(x, 0.45, z, -Math.sin(f.dir), Math.cos(f.dir), 7);
            if (k < n - 1) world.chips(x + Math.cos(f.dir) * seg / 2, 0.45, z + Math.sin(f.dir) * seg / 2, Math.sin(f.dir), -Math.cos(f.dir), 6);
          }
          G.events.emit('treeHit', { tree: T, split: true });
          G.events.emit('treeSplit', { tree: T });
        }
      } else if (f.phase === 'split') {
        // the crown stays on the ground as brush; it slowly settles/sinks after a long while
        { const k = Math.min(1, f.timer / 0.9); f.leaf.material.opacity = 1 - k * k; f.leaf.material.depthWrite = k < 0.3; f.pivot.position.y = 0.45 * T.s - k * 0.9 * T.s;
          if (k >= 1) { scene.remove(f.pivot); f.leaf.material.dispose(); falling.splice(i, 1); continue; } }
      }
      if (f.phase !== 'split') world.chopCamT = Math.max(world.chopCamT, 1.2);
      // rotate about horizontal axis perpendicular to fall dir
      const axis = new THREE.Vector3(Math.sin(f.dir), 0, -Math.cos(f.dir));
      f.pivot.quaternion.setFromAxisAngle(axis, f.ang);
    }
    updateParts(dt);
    for (const l of world.logs) if (l.pop > 0) {
      l.pop = Math.max(0, l.pop - dt); const k = 1 - l.pop / l.popMax;
      l.mesh.position.y = 0.22 + Math.sin(k * Math.PI) * 0.9 * (1 - k * 0.5); l.mesh.rotation.x = k * Math.PI * 2;
      if (l.pop === 0) { l.mesh.rotation.x = 0; for (let n = 0; n < 4; n++) world.emitParticle(l.x, 0.1, l.z, (Math.random() - .5) * 3, 1.5, (Math.random() - .5) * 3, 0.12, '#9a8466', 0.5, 6, 2, 2); }
    }
    for (const b of world.bushes) if (!b.ready) { b.regrow -= dt; if (b.regrow <= 0) { b.ready = true; b.berries.visible = true; } }
  };
  // ---------- chop camera + canopy fade (render time, after every other system has placed the camera) ----------
  // While chopping, the camera swings out to a side 3/4 view: player on the left, trunk + impact point centre, and the
  // fall/log-drop zone on screen-right. Any crown that the camera sits in or that blocks the view becomes a see-through ghost.
  {
    const cc = { k: 0, side: 1, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
    const mA = new THREE.Matrix4(), camQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), lookV = new THREE.Vector3(), helper = new THREE.Camera();
    world.lastCamQ = new THREE.Quaternion();
    const ghostMat = new THREE.MeshLambertMaterial({ color: '#5f8a45', flatShading: true, transparent: true, opacity: 0.22, depthWrite: false });
    const ghosts = []; for (let i = 0; i < 10; i++) { const g = new THREE.Mesh(pineGeo, ghostMat); g.matrixAutoUpdate = false; g.visible = false; scene.add(g); ghosts.push(g); }
    const faded = new Set();
    const blocked = (x, y, z, lx, ly, lz, focus) => { // camera spot inside a trunk, or trunk on the sight line
      for (const t of world.trees) { if (!t.alive || t === focus) continue;
        const dx = t.x - x, dz = t.z - z; if (dx * dx + dz * dz > 100) continue;
        if (Math.hypot(dx, dz) < 0.5 * t.s + 0.6) return true;
        const sx = lx - x, sz = lz - z, L2 = sx * sx + sz * sz || 1, u = Math.max(0, Math.min(1, (dx * sx + dz * sz) / L2));
        if (u > 0.05 && u < 0.92 && Math.hypot(x + sx * u - t.x, z + sz * u - t.z) < 0.45 * t.s + 0.25) return true; }
      return false; };
    const inCanopy = (t, x, y, z) => { const R = (t.type === 'pine' ? 2.0 : 2.5) * t.s + 0.5, h = Math.hypot(x - t.x, z - t.z);
      return h < R && y > 1.3 * t.sy && y < 7 * t.sy; };
    const prevBR2 = scene.onBeforeRender;
    scene.onBeforeRender = function (renderer, sc, camera, ...rest) {
      if (prevBR2) prevBR2.call(this, renderer, sc, camera, ...rest);
      const C = G.controls; if (!C || !camera) return;
      const now = performance.now(), dt = Math.min(0.1, cc.last ? (now - cc.last) / 1000 : 1 / 60); cc.last = now;
      const focusTree = world.chopFocus && world.trees.find(t => t.x === world.chopFocus.x && t.z === world.chopFocus.z);
      const on = world.chopCamT > 0 && world.chopFocus && (!G.mode || G.mode === 'playing');
      if (on && cc.k < 0.02) cc.init = false;
      cc.k += ((on ? 1 : 0) - cc.k) * (1 - Math.exp(-dt * (on ? 4 : 2.2)));
      if (cc.k > 0.003 && world.chopFocus) {
        const P = C.pos, T = world.chopFocus; let fx = T.x - P.x, fz = T.z - P.z; const d = Math.hypot(fx, fz) || 1; fx /= d; fz /= d;
        const px = -fz, pz = fx; // perpendicular: camera on this side sees the tree fall to screen-right, away from the player
        const fall = falling.find(f => f.t === focusTree);
        let lx = P.x + fx * d * 0.7, lz = P.z + fz * d * 0.7, ly = 1.35;
        if (fall && fall.phase !== 'creak') { const k2 = fall.phase === 'fall' ? 0.6 : 1; lx += Math.cos(fall.dir) * 2.2 * k2; lz += Math.sin(fall.dir) * 2.2 * k2; ly = 1.0; }
        const tryPos = (side, dist) => { const x = P.x - fx * 1.6 + px * side * dist, z = P.z - fz * 1.6 + pz * side * dist, y = 2.3 + dist * 0.18;
          return blocked(x, y, z, lx, ly, lz, focusTree) ? null : [x, y, z]; };
        let best = null;
        if (!cc.init) { for (const [sd, ds] of [[1, 6], [1, 4.8], [-1, 6], [-1, 4.8], [1, 3.6], [-1, 3.6]]) { const r = tryPos(sd, ds); if (r) { best = r; cc.side = sd; cc.dist = ds; break; } }
          if (!best) { cc.side = 1; cc.dist = 3.2; best = [P.x - fx * 2.5 + px * 2.2, 3.0, P.z - fz * 2.5 + pz * 2.2]; }
          cc.pos.copy(camera.position); cc.look.set(lx, ly, lz); cc.init = true; }
        else best = tryPos(cc.side, cc.dist) || tryPos(cc.side, 3.6) || [P.x - fx * 2.5 + px * cc.side * 2.2, 3.0, P.z - fz * 2.5 + pz * cc.side * 2.2];
        const kp = 1 - Math.exp(-dt * 5); cc.pos.x += (best[0] - cc.pos.x) * kp; cc.pos.y += (best[1] - cc.pos.y) * kp; cc.pos.z += (best[2] - cc.pos.z) * kp;
        cc.look.x += (lx - cc.look.x) * kp; cc.look.y += (ly - cc.look.y) * kp; cc.look.z += (lz - cc.look.z) * kp;
        helper.position.copy(cc.pos); helper.lookAt(cc.look); camQ.copy(helper.quaternion);
        const e = cc.k * cc.k * (3 - 2 * cc.k);
        camera.position.lerp(cc.pos, e); camera.quaternion.slerp(camQ, e);
        if (C.shake > 0) camera.position.y += (Math.random() - .5) * C.shake * 0.2;
        camera.updateMatrixWorld();
      }
      world.lastCamQ.copy(camera.quaternion);
      // canopy fade: crowns the camera sits in, or that sit on the line to the player's head
      const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, P = C.pos;
      const want = new Set();
      for (const t of world.trees) { if (!t.alive) continue; const dx = t.x - cx, dz = t.z - cz; if (dx * dx + dz * dz > 144) continue;
        if (inCanopy(t, cx, cy, cz)) { want.add(t); continue; }
        for (let u = 0.3; u < 0.95; u += 0.3) if (inCanopy(t, cx + (P.x - cx) * u, cy + (P.y + 1.6 - cy) * u, cz + (P.z - cz) * u)) { want.add(t); break; }
        if (want.size >= ghosts.length) break; }
      for (const t of faded) if (!want.has(t)) { faded.delete(t); setTree(t); }
      let gi = 0;
      for (const t of want) { faded.add(t); setTree(t); const im = t.type === 'pine' ? pines : oaks; im.getMatrixAt(t.idx, mA);
        const g = ghosts[gi++]; g.geometry = t.type === 'pine' ? pineGeo : oakGeo; g.matrix.copy(mA); g.matrixWorld.copy(mA); g.visible = true;
        im.setMatrixAt(t.idx, zero); im.instanceMatrix.needsUpdate = true; }
      for (; gi < ghosts.length; gi++) ghosts[gi].visible = false;
    };
  }
  return world;
}
