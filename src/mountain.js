// Mountain region: the stone Mountain Gate at the L4 edge, a short pass and a snowfield ringed by snowy slopes and
// low-poly peaks, snow-dusted pines, pale rocks, a frozen pond and falling snow. Same chunky flat-shaded look as the
// forest; built once, hidden until the land around it is open.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { MOUNTAIN, mountainSD, mountainK, LEVEL_R } from './regions.js';
import { rng } from './world.js';
import { glowTexture } from './campfire.js';
import { KEY_COLORS, mergeStatic } from './caves.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ground height of the region: flat where you can walk, rising into snowy slopes around it
export function mountainHeight(x, z) {
  const r = Math.hypot(x, z), sd = mountainSD(x, z);
  if (sd < 1.5 || r < LEVEL_R[3]) return 0;
  const n = Math.sin(x * 0.11 + z * 0.07) * Math.cos(z * 0.13 - x * 0.05);
  return Math.min(52, 0.45 * Math.pow(sd - 1.5, 1.28) * (1 + 0.18 * n)) * smooth(LEVEL_R[3], LEVEL_R[3] + 6, r);
}

export function createMountain(G) {
  const { scene } = G, W = G.world, M = MOUNTAIN, rand = rng(90210);
  const root = new THREE.Group(); scene.add(root); root.visible = false;
  const mt = { root, open: false };
  const at = M.at;

  // ---------- snow ground with slopes (per-face colours: snow, blue-white drifts, rock on the steep bits) ----------
  {
    const S = 3.6, pos = [], col = [], c = new THREE.Color();
    const snow = ['#eef3f6', '#e4ecf1', '#dbe5ec', '#f4f7f9'].map(h => new THREE.Color(h)), rock = ['#8f949a', '#9da2a8', '#7f858c'].map(h => new THREE.Color(h));
    const V = (u, v) => { const p = at(u, v); return [p.x, mountainHeight(p.x, p.z) + 0.16, p.z]; };
    for (let u = 147; u < 318; u += S) for (let v = -175; v < 175; v += S) {
      const ctr = at(u + S / 2, v + S / 2); if (mountainK(ctr.x, ctr.z) < 0.01) continue;
      const a = V(u, v), b = V(u + S, v), d = V(u, v + S), e = V(u + S, v + S);
      for (const tri of [[a, d, b], [b, d, e]]) {
        for (const p of tri) pos.push(...p);
        const dy = Math.max(...tri.map(p => p[1])) - Math.min(...tri.map(p => p[1]));
        c.copy(dy > 2.2 && rand() < 0.75 ? rock[Math.floor(rand() * 3)] : snow[Math.floor(rand() * 4)]);
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, lam('#ffffff', { vertexColors: true })); m.receiveShadow = true; root.add(m);
  }

  // ---------- peaks: jittered cones, grey-blue rock with snow caps ----------
  {
    const geos = [];
    const peak = (x, z, R, H, seed) => {
      const pr = rng(seed), g = new THREE.ConeGeometry(R, H, 7, 3).toNonIndexed(), P = g.attributes.position, cols = [], c = new THREE.Color();
      const jit = new Map();
      for (let i = 0; i < P.count; i++) {
        const k = `${Math.round(P.getX(i) * 100)},${Math.round(P.getY(i) * 100)},${Math.round(P.getZ(i) * 100)}`;
        if (!jit.has(k)) jit.set(k, [(pr() - 0.5) * R * 0.28, (pr() - 0.5) * H * 0.08, (pr() - 0.5) * R * 0.28]);
        const [jx, jy, jz] = jit.get(k), top = P.getY(i) > H / 2 - 0.01;
        P.setXYZ(i, P.getX(i) + (top ? 0 : jx), P.getY(i) + (top ? 0 : jy), P.getZ(i) + (top ? 0 : jz));
      }
      for (let f = 0; f < P.count; f += 3) {
        const cy = (P.getY(f) + P.getY(f + 1) + P.getY(f + 2)) / 3 / H + 0.5;
        c.set(cy > 0.6 + pr() * 0.1 ? (pr() < 0.5 ? '#f2f6f8' : '#e3ebf0') : cy > 0.45 && pr() < 0.4 ? '#c9d2da' : (pr() < 0.5 ? '#7d8590' : '#6c747e'));
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.translate(x, H / 2 + mountainHeight(x, z) - 6, z); geos.push(g);
    };
    const toCamp = Math.atan2(-M.field.z, -M.field.x);
    for (let i = 0; i < 11; i++) {
      const a = toCamp + 0.75 + (i / 10) * (Math.PI * 2 - 1.5) + (rand() - 0.5) * 0.2, d = M.peakR + 8 + rand() * 14;
      peak(M.field.x + Math.cos(a) * d, M.field.z + Math.sin(a) * d, 20 + rand() * 14, 38 + rand() * 30, 100 + i);
    }
    for (let i = 0; i < 10; i++) { const p = at(250 + rand() * 70, (rand() - 0.5) * 220); peak(p.x, p.z, 34 + rand() * 20, 60 + rand() * 40, 300 + i); }
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const p = at(160 + i * 10, sd * (24 + i * 6 + rand() * 6)); peak(p.x, p.z, 12 + rand() * 6, 22 + rand() * 12, 500 + i + sd * 10); }
    const m = new THREE.Mesh(mergeGeometries(geos), lam('#ffffff', { vertexColors: true })); m.castShadow = false; m.receiveShadow = true; root.add(m);
  }

  // ---------- snow-dusted pines (green crowns with white tips), on the slopes and around the snowfield ----------
  const snowPine = (() => {
    const parts = [[1.9, 2.6, 2.9], [1.5, 2.3, 4.2], [1.0, 2.0, 5.4]].map(([r, h, y]) => {
      const g = new THREE.ConeGeometry(r, h, 7).toNonIndexed(), P = g.attributes.position, cols = [], c = new THREE.Color();
      for (let i = 0; i < P.count; i++) { const yy = P.getY(i) / h + 0.5; c.set(yy > 0.95 ? '#f4f8fa' : yy > 0.4 ? '#dfe9ee' : '#2f5a40'); if (yy < 0.05 && P.getY(i) < -h / 2 + 0.01 && i % 3 === 0) c.set('#244a34'); cols.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.translate(0, y, 0); return g;
    });
    return mergeGeometries(parts);
  })();
  {
    const pts = [];
    const tryAdd = (x, z) => { for (const q of pts) if ((q.x - x) ** 2 + (q.z - z) ** 2 < 9) return; pts.push({ x, z, y: mountainHeight(x, z), s: 0.8 + rand() * 0.6 }); };
    for (let i = 0; i < 400 && pts.length < 120; i++) { const a = rand() * 6.28, d = 11 + Math.sqrt(rand()) * 17; tryAdd(M.field.x + Math.cos(a) * d, M.field.z + Math.sin(a) * d); }
    for (let i = 0; i < 600 && pts.length < 230; i++) { const p = at(150 + rand() * 120, (rand() - 0.5) * 160); const sd = mountainSD(p.x, p.z); if (sd > 2 && sd < 26 && mountainK(p.x, p.z) > 0.5) tryAdd(p.x, p.z); }
    // keep the pass, the frozen pond and a lane through the field clear
    const pond = at(204, 9), lanes = (x, z) => Math.hypot(x - pond.x, z - pond.z) < 8 || (mountainSD(x, z) < 1 && Math.abs((x - M.field.x) * -M.sa + (z - M.field.z) * M.ca) < 4);
    const keep = pts.filter(p => !lanes(p.x, p.z));
    const cr = new THREE.InstancedMesh(snowPine, lam('#ffffff', { vertexColors: true }), keep.length), tr = new THREE.InstancedMesh(W.geo.trunkGeo, W.mats.barkMat, keep.length);
    const o = new THREE.Object3D(), c = new THREE.Color();
    keep.forEach((p, i) => {
      o.position.set(p.x, p.y, p.z); o.rotation.set(0, rand() * 6.28, 0); o.scale.set(p.s, p.s * (0.95 + rand() * 0.35), p.s); o.updateMatrix();
      cr.setMatrixAt(i, o.matrix); tr.setMatrixAt(i, o.matrix); cr.setColorAt(i, c.setHSL(0.55, 0.1, 0.86 + rand() * 0.14));
      if (mountainSD(p.x, p.z) < 1.2) W.addCollider({ x: p.x, z: p.z, r: 0.5 * p.s });
    });
    for (const m of [cr, tr]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
    mt.pines = keep;
    // frozen pond
    const ice = new THREE.Mesh(new THREE.CircleGeometry(6.5, 9).rotateX(-Math.PI / 2), lam('#bfe2f0', { emissive: '#1a2a34' })); ice.position.set(pond.x, 0.19, pond.z); root.add(ice);
    mt.pond = pond;
  }
  // ---------- pale rocks with snow caps ----------
  {
    const rockM = lam('#c3c6cb'), capM = lam('#f2f6f8'), g = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 34; i++) {
      const p = i < 20 ? (() => { const a = rand() * 6.28, d = 6 + rand() * 24; return { x: M.field.x + Math.cos(a) * d, z: M.field.z + Math.sin(a) * d }; })() : at(150 + rand() * 30, (rand() < 0.5 ? -1 : 1) * (4.5 + rand() * 6));
      const s = 0.5 + rand() * 1.3, y = mountainHeight(p.x, p.z);
      const m = new THREE.Mesh(g, rockM); m.position.set(p.x, y + s * 0.35, p.z); m.scale.set(s * (1 + rand() * 0.5), s * (0.6 + rand() * 0.4), s); m.rotation.set(rand(), rand() * 6, rand()); m.castShadow = m.receiveShadow = true; root.add(m);
      const cap = new THREE.Mesh(g, capM); cap.position.set(0, 0.55, 0); cap.scale.set(0.8, 0.35, 0.8); m.add(cap);
      if (s > 0.8 && mountainSD(p.x, p.z) < 1) W.addCollider({ x: p.x, z: p.z, r: s * 0.9 });
    }
  }

  // ---------- falling snow (only drawn while the player is in the region) ----------
  const NSN = 650, sp = new Float32Array(NSN * 3);
  for (let i = 0; i < NSN; i++) { sp[i * 3] = (Math.random() - 0.5) * 44; sp[i * 3 + 1] = Math.random() * 20; sp[i * 3 + 2] = (Math.random() - 0.5) * 44; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.11, transparent: true, opacity: 0, depthWrite: false }));
  snowPts.frustumCulled = false; snowPts.visible = false; scene.add(snowPts);

  // ---------- the Mountain Gate: pale stone pillars, lintel, heavy double doors, a big ice-blue padlock ----------
  const gate = new THREE.Group(); gate.position.set(M.gate.x, 0, M.gate.z); gate.rotation.y = Math.atan2(M.ca, M.sa); scene.add(gate); // local +z = outward
  const stone = lam('#a9a7a0'), stone2 = lam('#97958e'), capM = lam('#f2f6f8'), wood = lam('#6b4428'), wood2 = lam('#7a5232'), iron = lam('#3a3f46');
  const box = (w, h, d, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; return o; };
  const PX = 4.7, colls = [];
  for (const sd of [-1, 1]) {
    gate.add(box(2.4, 2.6, 2.4, stone, sd * PX, 1.3, 0, 0.05 * sd), box(2.2, 2.4, 2.2, stone2, sd * PX, 3.8, 0, -0.08 * sd), box(2.0, 2.2, 2.0, stone, sd * PX, 6.1, 0, 0.1 * sd), box(2.3, 0.35, 2.3, capM, sd * PX, 7.35, 0));
    // rubble at the pillar feet
    for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rand() * 0.5, 0), stone2); r.position.set(sd * (PX + 1.6 + rand()), 0.35, (rand() - 0.5) * 3); r.castShadow = true; gate.add(r); }
    const wp = gate.localToWorld(new THREE.Vector3(sd * PX, 0, 0)); colls.push(W.addCollider({ x: wp.x, z: wp.z, r: 1.6 }));
  }
  gate.add(box(PX * 2 + 2.6, 1.3, 2.4, stone2, 0, 8.1, 0), box(PX * 2 + 2.8, 0.35, 2.6, capM, 0, 8.9, 0));
  { const em = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.0, 3), capM); em.position.set(0, 8.1, 1.25); em.rotation.set(Math.PI / 2, 0, 0); gate.add(em); }
  const doors = [];
  const DW = PX - 1.2;
  for (const sd of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(sd * (PX - 1.2), 0, 0.2); gate.add(pivot);
    for (let k = 0; k < 6; k++) pivot.add(box(DW / 6 - 0.04, 6.4 - (k % 2) * 0.25, 0.28, k % 2 ? wood : wood2, -sd * (DW / 12 + k * DW / 6), 3.2, 0));
    for (const y of [1.0, 3.3, 5.6]) pivot.add(box(DW, 0.28, 0.34, iron, -sd * DW / 2, y, 0.04));
    doors.push({ pivot, sd });
  }
  const kc = new THREE.Color(KEY_COLORS.mountain);
  const lock = new THREE.Group(); lock.position.set(0, 3.2, 0.62); gate.add(lock);
  lock.add(box(0.9, 0.8, 0.32, lam(kc.clone().multiplyScalar(0.7), { emissive: kc.clone().multiplyScalar(0.15) }), 0, 0, 0));
  { const sh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 4, 8, Math.PI), iron); sh.position.y = 0.4; lock.add(sh); }
  lock.add(box(0.12, 0.26, 0.06, iron, 0, -0.06, 0.18));
  const lockGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(200,240,255,0.9)', 'rgba(120,200,255,0)'), color: kc, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.5 }));
  lockGlow.scale.setScalar(2.2); lock.add(lockGlow);
  const doorColl = [-2.6, -1.3, 0, 1.3, 2.6].map(v => { const p = gate.localToWorld(new THREE.Vector3(v, 0, 0.2)); return W.addCollider({ x: p.x, z: p.z, r: 0.85 }); });
  mergeStatic(gate, doors.map(d => d.pivot).concat([lock])); mergeStatic(root);
  mt.gate = gate; mt.gateWorld = { x: M.gate.x, z: M.gate.z };

  let openT = -1, lockFall = null;
  mt.openGate = (instant = false) => {
    if (mt.open) return; mt.open = true; root.visible = true;
    for (const c of doorColl) W.removeCollider(c);
    if (instant) { openT = 1; for (const d of doors) d.pivot.rotation.y = d.sd * 1.45; lock.visible = false; return; }
    openT = 0; lockFall = { vy: 2, t: 0 };
    for (let k = 0; k < 24; k++) W.emitParticle && W.emitParticle(M.gate.x + (Math.random() - .5) * 8, 0.5 + Math.random() * 5, M.gate.z + (Math.random() - .5) * 2, (Math.random() - .5) * 3, 1 + Math.random() * 2, (Math.random() - .5) * 3, 0.1 + Math.random() * 0.1, '#f2f6f8', 1.4 + Math.random(), 3, 1.5, 4);
  };

    mt.update = (dt, mk, fireLevel) => {
    root.visible = mt.open || fireLevel >= 4;
    lockGlow.material.opacity = mt.open ? 0 : 0.35 + 0.2 * Math.sin(G.time * 2.4);
    if (openT >= 0 && openT < 1) {
      openT = Math.min(1, openT + dt / 2.4); const e = openT * openT * (3 - 2 * openT);
      for (const d of doors) d.pivot.rotation.y = d.sd * 1.45 * e;
      if (G.controls && Math.random() < dt * 8) G.controls.shake = Math.max(G.controls.shake || 0, 0.08);
    }
    if (lockFall) { lockFall.t += dt; lockFall.vy -= 14 * dt; lock.position.y = Math.max(0.25, lock.position.y + lockFall.vy * dt); lock.position.z += dt * 1.2; lock.rotation.x += dt * 5; if (lockFall.t > 3) { lock.visible = false; lockFall = null; } }
    // snowfall follows the camera, fades in with the region
    snowPts.visible = mk > 0.01; snowPts.material.opacity = mk * 0.9;
    if (snowPts.visible) {
      const cam = G.camera.position;
      for (let i = 0; i < NSN; i++) {
        let x = sp[i * 3], y = sp[i * 3 + 1] - dt * (1.1 + (i % 5) * 0.12), z = sp[i * 3 + 2];
        x += Math.sin(G.time * 0.7 + i) * dt * 0.35;
        // wrap into a 44 m box around the camera
        x = cam.x + ((((x - cam.x + 22) % 44) + 44) % 44) - 22; z = cam.z + ((((z - cam.z + 22) % 44) + 44) % 44) - 22;
        if (y < cam.y - 4) y += 22; else if (y > cam.y + 18) y -= 22;
        sp[i * 3] = x; sp[i * 3 + 1] = y; sp[i * 3 + 2] = z;
      }
      sg.attributes.position.needsUpdate = true;
    }
  };
  // 0..1 how deep into the Mountain the point is (for colder light/snow)
  mt.depth = (x, z) => { const r = Math.hypot(x, z); if (r < M.gateR - 4) return 0; return smooth(-1, 6, -mountainSD(x, z) + 6) * smooth(M.gateR - 4, M.gateR + 8, r); };
  return mt;
}
