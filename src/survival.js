// Survival: health / hunger / stamina, inventory & hotbar, eating, damage & death.
// Also owns: berry-bush harvesting (visible depletion + regrowth), eat/damage feedback
// (floating numbers, bar pulses, berry particles, knockback, i-frames), logs on the player's back.
import * as THREE from '../vendor/three.module.js';
export const HOTBAR = ['axe', 'flashlight', 'sack'];

const BUSH_CHARGES = 2;        // handfuls per bush
const BUSH_REGROW = 1e9;       // bushes regrow only at dawn (once per day)
const HANDFUL = 7;             // hunger per berry handful: berries are a snack, meat is a meal
const POCKET_MAX = 4;          // berries you can carry
const BUSH_KEEP = 5, BUSH_MIN_R = 36; // a handful of far bushes past the fire's light
const BUSH_NEAR = 2, BUSH_NEAR_R = [20, 26]; // two near camp: enough to learn eating, not enough to live on
const RAW_EAT = 8, RAW_SICK = 10, COOKED_EAT = 40, COOK_TIME = 3.5, MEAT_MAX = 3, RABBITS = 6;
const HUNGER_DRAIN = 0.6;      // per second (~100 hunger per day+night cycle; all berries on the map ~98, near camp only 28)
const FIRE_HEAL = 1 / 3;       // hp per second inside the fire's light (1 HP every 3s); no regen in the dark
const STARVE_TICK = 1.5, STARVE_DMG = 3; // at 0 hunger: 3 hp every 1.5s (~50s from full to dead)
const IFRAMES = 0.55;

export function createSurvival(G) {
  const { scene, camera } = G;
  const s = {
    stats: { health: 100, hunger: 100, stamina: 100 },
    inventory: { logs: 0, berries: 0 },
    equipped: 'axe', god: false, lastDamage: 99, cause: '',
  };
  let iframe = 0, starveT = 0, warnedHunger = 0, hpChip = 100;
  const kb = new THREE.Vector3();

  // ---------------- DOM feedback helpers ----------------
  const $ = (id) => document.getElementById(id);
  const floats = [];
  function floatText(text, color, wx, wy, wz, size = 22) {
    const hud = $('hud'); if (!hud) return;
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;font-weight:800;font-size:${size}px;color:${color};` +
      `text-shadow:0 2px 0 rgba(0,0,0,.75),0 0 6px rgba(0,0,0,.5);-webkit-text-stroke:1px rgba(0,0,0,.35);white-space:nowrap;will-change:transform,opacity;z-index:5`;
    hud.appendChild(d);
    floats.push({ el: d, p: new THREE.Vector3(wx, wy, wz), t: 0, dx: (Math.random() - 0.5) * 30 });
  }
  const v3 = new THREE.Vector3();
  function updateFloats(dt) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.t += dt;
      if (f.t > 1.3) { f.el.remove(); floats.splice(i, 1); continue; }
      v3.copy(f.p).project(camera);
      if (v3.z > 1) { f.el.style.opacity = 0; continue; }
      const x = (v3.x * 0.5 + 0.5) * innerWidth + f.dx * f.t, y = (-v3.y * 0.5 + 0.5) * innerHeight - f.t * 55;
      const sc = f.t < 0.12 ? 0.6 + f.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (f.t - 0.12) * 1.2);
      f.el.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(${sc})`;
      f.el.style.opacity = f.t > 0.85 ? String(1 - (f.t - 0.85) / 0.45) : '1';
    }
  }
  function pulse(id, color) {
    const e = $(id); if (!e) return;
    e.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.12)', filter: `brightness(1.8) drop-shadow(0 0 8px ${color})` }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 420, easing: 'ease-out' });
  }
  function shakeEl(id) {
    const e = $(id); if (!e) return;
    e.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 320 });
  }
  // trailing white "chip" behind the health fill so you can see how much a hit took
  let chipEl = null;
  function ensureChip() {
    if (chipEl) return chipEl;
    const fill = $('hpfill'); if (!fill || !fill.parentElement) return null;
    fill.parentElement.style.position = 'relative'; fill.style.position = 'relative'; fill.style.zIndex = '1';
    chipEl = document.createElement('div');
    chipEl.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:100%;background:#fff3c4;opacity:.85;border-radius:inherit;z-index:0;pointer-events:none';
    fill.parentElement.insertBefore(chipEl, fill);
    return chipEl;
  }

  // ---------------- berry particles ----------------
  const partGeo = new THREE.BoxGeometry(0.13, 0.13, 0.13);
  const partMat = new THREE.MeshLambertMaterial({ color: '#e0283e', emissive: '#4a0010', flatShading: true });
  const leafMat = new THREE.MeshLambertMaterial({ color: '#4f9a3f', flatShading: true });
  const parts = [];
  function burst(x, y, z, toPlayer, n = 7) {
    for (let i = 0; i < n; i++) {
      const leaf = i % 3 === 2;
      const m = new THREE.Mesh(partGeo, leaf ? leafMat : partMat); m.position.set(x + (Math.random() - .5) * 0.8, y + Math.random() * 0.5, z + (Math.random() - .5) * 0.8);
      m.rotation.set(Math.random() * 3, Math.random() * 3, 0); scene.add(m);
      parts.push({ m, v: new THREE.Vector3((Math.random() - .5) * 3, 3 + Math.random() * 2.5, (Math.random() - .5) * 3), t: 0, home: toPlayer && !leaf });
    }
  }
  function updateParts(dt) {
    const p = G.controls.pos;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.t += dt;
      if (q.home && q.t > 0.25) { // berries fly into the player's hands
        v3.set(p.x, p.y + 1.3, p.z).sub(q.m.position); const d = v3.length();
        q.v.lerp(v3.multiplyScalar(14 / Math.max(d, 0.1)), Math.min(1, dt * 10));
        if (d < 0.4) q.t = 9;
      } else q.v.y -= 14 * dt;
      q.m.position.addScaledVector(q.v, dt); q.m.rotation.x += dt * 8; q.m.rotation.y += dt * 6;
      if (q.m.position.y < 0.07 && !q.home) { q.m.position.y = 0.07; q.v.set(q.v.x * 0.4, Math.abs(q.v.y) * 0.25, q.v.z * 0.4); }
      const life = q.home ? 1.2 : 1.1;
      if (q.t > life) { scene.remove(q.m); parts.splice(i, 1); continue; }
      if (!q.home && q.t > 0.7) q.m.scale.setScalar(Math.max(0.01, 1 - (q.t - 0.7) / 0.4));
    }
  }

  // ---------------- berry bushes: take over harvesting from world ----------------
  const W = G.world;
  const LEAF_FULL = new THREE.Color('#3f7a35'), LEAF_BARE = new THREE.Color('#7a6a3a');
  const twigMat = new THREE.MeshLambertMaterial({ color: '#5a3b22', flatShading: true });
  const twigGeo = new THREE.BoxGeometry(0.06, 0.55, 0.06); twigGeo.translate(0, 0.27, 0);
  const tmpW = new THREE.Vector3();
  // food is scarce: keep only BUSH_KEEP bushes, spread around the ring and all far from camp
  {
    const far = W.bushes.filter(b => Math.hypot(b.x - (G.campfire?.x || 0), b.z - (G.campfire?.z || 0)) >= BUSH_MIN_R);
    far.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
    const keep = new Set(); const step = far.length / BUSH_KEEP;
    for (let k = 0; k < BUSH_KEEP && k * step < far.length; k++) keep.add(far[Math.floor(k * step)]);
    // move a few spare bushes to 17-23m from the fire, spread around camp, clear of trees
    const spare = W.bushes.filter(b => !keep.has(b)), cx = G.campfire?.x || 0, cz = G.campfire?.z || 0;
    const blocked = (x, z) => W.trees.some(t => t.alive !== false && Math.hypot(t.x - x, t.z - z) < 2.2) || [...keep].some(o => Math.hypot(o.x - x, o.z - z) < 4);
    for (let k = 0; k < BUSH_NEAR && spare.length; k++) {
      const b = spare.shift(); let x = 0, z = 0;
      for (let tries = 0; tries < 24; tries++) {
        const a = (k / BUSH_NEAR) * 6.28 + 0.5 + (tries % 2 ? 1 : -1) * Math.floor((tries + 1) / 2) * 0.12;
        const r = BUSH_NEAR_R[0] + ((k * 3 + tries) % 5) / 4 * (BUSH_NEAR_R[1] - BUSH_NEAR_R[0]);
        x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r; if (!blocked(x, z)) break;
      }
      b.x = x; b.z = z; b.group.position.x = x; b.group.position.z = z; b.near = true;
      if (b.collider) W.removeCollider(b.collider); b.collider = W.addCollider({ x, z, r: 0.7 });
      keep.add(b);
    }
    for (const b of W.bushes) if (!keep.has(b)) { scene.remove(b.group); b.group.visible = false; if (b.collider) W.removeCollider(b.collider); }
    W.bushes.splice(0, W.bushes.length, ...keep);
  }
  for (const b of W.bushes) {
    b.charges = BUSH_CHARGES; b.growT = 0; b.jiggle = 0; b.regrow = 1e9; b.ready = true; b.bare = 0;
    b.berryMeshes = [...b.berries.children]; b.berryMeshes.forEach(m => { m.userData.s = 1; m.userData.target = 1; m.userData.delay = 0; });
    b.leaf = b.group.children[0]; b.leaf.material = b.leaf.material.clone();
    // bare twigs poke out of a picked-clean bush so it reads differently at a glance
    b.twigs = new THREE.Group(); b.twigs.visible = false;
    for (let k = 0; k < 6; k++) {
      const t = new THREE.Mesh(twigGeo, twigMat), th = k / 6 * 6.28 + 0.4;
      t.position.set(Math.cos(th) * 0.45, 0.75 + (k % 2) * 0.2, Math.sin(th) * 0.45);
      t.rotation.set(Math.sin(th) * 0.7, 0, -Math.cos(th) * 0.7); b.twigs.add(t);
    }
    b.group.add(b.twigs);
  }
  // one berry at a time: flies off the bush into the player's hands
  function flyBerry(m) {
    m.getWorldPosition(tmpW);
    const q = new THREE.Mesh(partGeo, partMat); q.position.copy(tmpW); q.scale.setScalar(1.3); scene.add(q);
    parts.push({ m: q, v: new THREE.Vector3((Math.random() - .5) * 1.5, 3.5 + Math.random() * 1.5, (Math.random() - .5) * 1.5), t: 0, home: true });
  }
  function bushVisual(b, stagger = true) {
    const n = b.berryMeshes.length, show = Math.ceil(n * b.charges / BUSH_CHARGES);
    let k = 0;
    b.berryMeshes.forEach((m, i) => {
      const want = i < show ? 1 : 0, u = m.userData;
      if (u.target === want) return;
      u.target = want; u.delay = stagger ? (want ? 0.15 + Math.random() * 0.9 : 0.12 + (k++) * 0.11) : 0; u.flew = false;
    });
  }
  function harvest(b) {
    if (b.charges <= 0 || G.time - (b.lastPick || -9) < 0.2) return; // debounce one pick per press
    b.lastPick = G.time;
    const p = G.controls.pos, st = s.stats;
    b.charges--; b.jiggle = 0.5; if (b.charges < BUSH_CHARGES && b.growT <= 0) b.growT = BUSH_REGROW;
    bushVisual(b);
    burst(b.x, 0.9, b.z, false, 3); // a few leaves flutter off
    startPickCam(b);
    if (st.hunger < 92) {
      s.eat(HANDFUL);
      floatText(`+${HANDFUL} Hunger`, '#ffb347', p.x, p.y + 2.3, p.z);
    } else if (s.inventory.berries < POCKET_MAX) {
      const add = 1; s.inventory.berries += add;
      floatText(`+${add} Berries`, '#ff6b7a', p.x, p.y + 2.3, p.z, 20); G.events.emit('pickup', { item: 'berry' });
    }
    if (b.charges <= 0) setTimeout(() => G.ui?.toast?.('Bush picked clean. It regrows at dawn — find another.', 2.2), 700);
  }

  // ---------------- pick cam: swing to the side so the bush is in view while you pick ----------------
  let pickB = null, pickT = 0, pickW = 0, pickSide = 1, pickAnim = 0;
  const pcPos = new THREE.Vector3(), pcLook = new THREE.Vector3(), pcQ = new THREE.Quaternion(), pcM = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  function camSpot(b, side, out) {
    const P = G.controls.pos; let dx = b.x - P.x, dz = b.z - P.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    pcLook.set(P.x + dx * L * 0.62, 0.8, P.z + dz * L * 0.62);
    return out.set(pcLook.x - dz * side * 3.9 - dx * 0.35, 2.05, pcLook.z + dx * side * 3.9 - dz * 0.35);
  }
  function spotBlocked(v) {
    for (const t of W.trees) { if (!t.alive) continue; if (Math.hypot(t.x - v.x, t.z - v.z) < 0.6 * t.s + 0.6) return true; }
    for (const o of W.bushes) if (o !== pickB && Math.hypot(o.x - v.x, o.z - v.z) < 1.1) return true;
    return false;
  }
  function startPickCam(b) {
    if (pickB !== b || pickT <= 0) {
      // keep whichever side the camera is already on (over the right shoulder by default)
      const P = G.controls.pos, dx = b.x - P.x, dz = b.z - P.z;
      const cr = dx * (camera.position.z - P.z) - dz * (camera.position.x - P.x);
      pickSide = cr >= 0 ? 1 : -1; pickB = b;
      if (spotBlocked(camSpot(b, pickSide, pcPos))) pickSide = -pickSide;
    }
    pickT = 2.4; pickAnim = 0.9;
    const P = G.controls.pos; G.controls.facing = Math.atan2(b.x - P.x, b.z - P.z); G.player.root.rotation.y = G.controls.facing;
  }
  function updatePickCam(dt) {
    const c = G.controls;
    if (pickB) {
      const d = Math.hypot(pickB.x - c.pos.x, pickB.z - c.pos.z);
      if (d > 3.2 || c.speed > 2.2 || G.mode !== 'playing') pickT = Math.min(pickT, 0); // walking away releases it
      else if (G.interaction?.target === pickB) pickT = Math.max(pickT, 0.5);   // stay framed while standing at the bush
      pickT -= dt;
    }
    const want = pickB && pickT > 0 ? 1 : 0;
    pickW += (want - pickW) * (1 - Math.exp(-(want ? 5 : 3.5) * dt));
    const pl = G.player;
    // put the tool away and reach into the bush with both hands while picking
    if (pl.hand) pl.hand.visible = !(pickW > 0.3 && want);
    if (pickAnim > 0) {
      pickAnim -= dt; const k = Math.min(1, pickAnim * 4), bob = Math.sin((0.9 - pickAnim) * 18) * 0.22;
      pl.armR.rotation.x = -1.25 * k + bob * k; pl.armL.rotation.x = -1.15 * k - bob * k;
    }
    if (pickW < 0.002) { pickW = 0; if (!want) pickB = null; return; }
    const w = pickW * pickW * (3 - 2 * pickW);
    camSpot(pickB, pickSide, pcPos);
    pcM.lookAt(pcPos, pcLook, UP); pcQ.setFromRotationMatrix(pcM);
    camera.position.lerp(pcPos, w); camera.quaternion.slerp(pcQ, w);
    if (want && c.speed < 0.6) { c.facing += Math.atan2(Math.sin(Math.atan2(pickB.x - c.pos.x, pickB.z - c.pos.z) - c.facing), Math.cos(Math.atan2(pickB.x - c.pos.x, pickB.z - c.pos.z) - c.facing)) * Math.min(1, dt * 10); G.player.root.rotation.y = c.facing; }
    G.player.setFade(1);
  }
  s.pickCam = () => ({ active: !!pickB && pickT > 0, weight: +pickW.toFixed(2), side: pickSide });

  const origGetInteraction = W.getInteraction.bind(W);
  W.getInteraction = (p) => {
    // hide bushes from the world's own (single-shot) berry logic, then offer ours
    const saved = W.bushes.map(b => b.ready); W.bushes.forEach(b => { b.ready = false; });
    let best = null;
    try { best = origGetInteraction(p); } finally { W.bushes.forEach((b, i) => { b.ready = saved[i]; }); }
    const st = s.stats;
    for (const b of W.bushes) {
      const d = Math.hypot(b.x - p.x, b.z - p.z) - 0.6;
      if (d > 2.0 || (best && d >= best.dist)) continue;
      if (b.charges <= 0) { best = { dist: d, label: 'Bush is bare — berries regrow at dawn', disabled: true, target: b, action: () => {} }; continue; }
      const full = st.hunger >= 92, pocketFull = s.inventory.berries >= POCKET_MAX;
      const label = !full ? `[E] Eat berries (${b.charges}/${BUSH_CHARGES})` : pocketFull ? `Not hungry — pockets full (${s.inventory.berries})` : `[E] Pick berries for later (${b.charges}/${BUSH_CHARGES})`;
      best = { dist: d, label, disabled: full && pocketFull, target: b, action: () => harvest(b) };
    }
    const mi = meatInteraction(p); if (mi && (!best || mi.dist < best.dist)) best = mi;
    return best;
  };
  // all bushes fill back up once per day, at dawn
  G.events.on('dayStart', () => {
    let n = 0;
    for (const b of W.bushes) if (b.charges < BUSH_CHARGES) { b.charges = BUSH_CHARGES; b.growT = 0; bushVisual(b); b.jiggle = 0.3; n++; }
    if (n) setTimeout(() => G.ui?.toast?.('The berry bushes have regrown overnight.', 2.5), 2600);
  });
  function updateBushes(dt) {
    for (const b of W.bushes) {
      b.regrow = 1e9; b.ready = b.charges > 0; b.berries.visible = true;
      if (b.charges < BUSH_CHARGES) {
        b.growT -= dt;
        if (b.growT <= 0 && BUSH_REGROW < 1e8) { b.charges++; bushVisual(b); b.jiggle = Math.max(b.jiggle, 0.25); b.growT = b.charges < BUSH_CHARGES ? BUSH_REGROW : 0; }
      }
      for (const m of b.berryMeshes) {
        const u = m.userData; if (u.s === u.target) continue;
        if (u.delay > 0) { u.delay -= dt; continue; }
        if (u.target === 0 && !u.flew) { u.flew = true; flyBerry(m); b.jiggle = Math.max(b.jiggle, 0.12); }
        u.s += Math.sign(u.target - u.s) * dt * (u.target > u.s ? 2.6 : 14);
        u.s = Math.max(0, Math.min(1, u.s)); if (Math.abs(u.s - u.target) < 0.02) u.s = u.target;
        const pop = u.target > 0 && u.s < 1 ? Math.sin(u.s * Math.PI) * 0.45 : 0;
        m.scale.setScalar(Math.max(0.001, u.s + pop)); m.visible = u.s > 0.01;
      }
      // bare look: leaves fade to a dry olive-brown, the bush sags, twigs poke out
      const bareWant = b.charges <= 0 ? 1 : 0;
      if (b.bare !== bareWant) {
        b.bare += (bareWant - b.bare) * Math.min(1, dt * (bareWant ? 3 : 1.5)); if (Math.abs(b.bare - bareWant) < 0.01) b.bare = bareWant;
        b.leaf.material.color.copy(LEAF_FULL).lerp(LEAF_BARE, b.bare);
        b.leaf.scale.set(1 - b.bare * 0.12, 1 - b.bare * 0.22, 1 - b.bare * 0.12);
        b.twigs.visible = b.bare > 0.05; b.twigs.scale.setScalar(Math.max(0.01, b.bare));
      }
      if (b.jiggle > 0) { b.jiggle = Math.max(0, b.jiggle - dt); const k = b.jiggle * 2; b.group.scale.set(1 + Math.sin(G.time * 40) * 0.07 * k, 1 - Math.sin(G.time * 40) * 0.06 * k, 1 + Math.cos(G.time * 40) * 0.07 * k); }
      else if (b.group.scale.x !== 1) b.group.scale.set(1, 1, 1);
    }
  }

  // ---------------- logs strapped to the player's back (sack contents made visible) ----------------
  const backLogs = new THREE.Group();
  { const bark = new THREE.MeshLambertMaterial({ color: '#6b4428', flatShading: true }), end = new THREE.MeshLambertMaterial({ color: '#d9b27c', flatShading: true });
    const geo = new THREE.CylinderGeometry(0.17, 0.19, 1.25, 7); geo.rotateZ(Math.PI / 2);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.58), new THREE.MeshLambertMaterial({ color: '#4a3622' })); strap.position.set(0.28, 0.5, -0.03);
    backLogs.add(strap); backLogs.userData.logs = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(geo, [bark, end, end]); m.castShadow = true;
      if (i < 3) m.position.set(0.04 * (i - 1), 0.18 + i * 0.32, -0.44); else m.position.set(0.05 * (i === 3 ? -1 : 1), 0.34 + (i - 3) * 0.34, -0.74);
      m.rotation.y = (i % 2 ? 0.08 : -0.08); m.visible = false; m.userData.s = 0; backLogs.add(m); backLogs.userData.logs.push(m);
    }
    strap.visible = false; backLogs.userData.strap = strap;
    G.player.torso.add(backLogs);
  }
  let lastLogs = 0;
  function updateBackLogs(dt) {
    const n = s.inventory.logs, L = backLogs.userData.logs;
    if (n > lastLogs) { floatText(`+1 Log  ${n}/${W.logMax}`, '#ffd9a0', G.controls.pos.x, G.controls.pos.y + 2.3, G.controls.pos.z, 18); pulse('hotbar', '#ffd9a0'); }
    if (n >= W.logMax && lastLogs < W.logMax) G.ui?.toast?.('Sack is full! Bring the logs to the fire.', 2.2);
    lastLogs = n;
    backLogs.userData.strap.visible = n > 0;
    L.forEach((m, i) => {
      const want = i < n ? 1 : 0; const u = m.userData;
      u.s += (want - u.s) * Math.min(1, dt * 12); if (Math.abs(u.s - want) < 0.01) u.s = want;
      m.visible = u.s > 0.02; m.scale.setScalar(Math.max(0.01, u.s < 1 && want ? u.s * (1 + Math.sin(u.s * Math.PI) * 0.4) : u.s));
    });
  }


  // ---------------- meat: rabbits in the forest, raw meat must be cooked at the fire ----------------
  const inv = s.inventory; inv.rawMeat = 0; inv.cookedMeat = 0;
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const furM = lam('#b8a48a'), tailM = lam('#f2ece0'), eyeM = new THREE.MeshBasicMaterial({ color: '#1a1010' });
  const meatRawM = lam('#c8475a'), meatCookM = lam('#7a3f1e'), boneM = lam('#efe6d2');
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; return o; };
  const rabbits = [], meats = [];
  function makeRabbit() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    body.add(box(0.34, 0.3, 0.5, furM, 0, 0.25, 0), box(0.26, 0.24, 0.26, furM, 0, 0.42, 0.28),
      box(0.07, 0.28, 0.05, furM, -0.07, 0.66, 0.26), box(0.07, 0.28, 0.05, furM, 0.07, 0.66, 0.26),
      box(0.14, 0.14, 0.1, tailM, 0, 0.3, -0.28), box(0.04, 0.04, 0.02, eyeM, -0.1, 0.46, 0.41), box(0.04, 0.04, 0.02, eyeM, 0.1, 0.46, 0.41));
    scene.add(g); return { g, body, x: 0, z: 0, dir: Math.random() * 6.28, hop: Math.random(), alive: true, idle: 1, flee: 0 };
  }
  function placeRabbit(r) {
    const a = Math.random() * 6.28, d = 34 + Math.random() * 60; r.x = Math.cos(a) * d; r.z = Math.sin(a) * d;
    r.alive = true; r.g.visible = true; r.g.rotation.set(0, 0, 0); r.g.position.set(r.x, 0, r.z);
  }
  for (let i = 0; i < RABBITS; i++) { const r = makeRabbit(); placeRabbit(r); rabbits.push(r); }
  function spawnMeat(x, z, n = 1) {
    for (let k = 0; k < n; k++) {
      const g = new THREE.Group(); g.add(box(0.42, 0.2, 0.3, meatRawM, 0, 0.14, 0), box(0.3, 0.07, 0.07, boneM, 0.3, 0.14, 0));
      const a = Math.random() * 6.28, rr = n > 1 ? 0.7 : 0; g.position.set(x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr); g.rotation.y = Math.random() * 6;
      scene.add(g); meats.push({ g, x: g.position.x, z: g.position.z, t: 0 });
    }
  }
  s.spawnMeat = spawnMeat; s.rabbits = rabbits; s.meats = meats;
  G.events.on('bearDeath', () => { const b = G.bear?.pos; if (b) { spawnMeat(b.x, b.z, 3); G.ui?.toast?.('The bear dropped raw meat — cook it at the fire!', 3); } });
  G.events.on('dayStart', () => { for (const r of rabbits) if (!r.alive) placeRabbit(r); });
  // axe swings can hit a rabbit (same timing as the tree/bear hit)
  let rabbitHitT = -1;
  G.events.on('swing', () => { rabbitHitT = 0.24; });
  function tryHitRabbit() {
    const p = G.controls.pos, f = G.controls.facing ?? 0, fx = Math.sin(f), fz = Math.cos(f);
    for (const r of rabbits) {
      if (!r.alive) continue; const dx = r.x - p.x, dz = r.z - p.z, d = Math.hypot(dx, dz);
      if (d < 2.6 && (d < 1 || (dx * fx + dz * fz) / d > 0.2)) {
        r.alive = false; r.dead = 0.6; spawnMeat(r.x, r.z, 1);
        floatText('Rabbit!', '#ffd9a0', r.x, 1.4, r.z, 20); G.events.emit('rabbitKill'); return true;
      }
    }
    return false;
  }
  let cookT = 0;
  function updateMeat(dt) {
    if (rabbitHitT > 0) { rabbitHitT -= dt; if (rabbitHitT <= 0) tryHitRabbit(); }
    const p = G.controls.pos;
    for (const r of rabbits) {
      if (!r.alive) { if (r.dead > 0) { r.dead -= dt; r.g.rotation.z = Math.min(1.57, r.g.rotation.z + dt * 8); if (r.dead <= 0) r.g.visible = false; } continue; }
      const d = Math.hypot(r.x - p.x, r.z - p.z);
      if (d < 4 && G.mode === 'playing') { r.flee = 1.0; r.dir = Math.atan2(r.x - p.x, r.z - p.z) + (Math.random() - 0.5) * 0.6; }
      const moving = r.flee > 0 || r.idle < 0;
      r.flee -= dt; r.idle -= dt; if (r.idle < -1.2) r.idle = 1 + Math.random() * 3, r.dir += (Math.random() - 0.5) * 2;
      if (moving) {
        const sp = r.flee > 0 ? 4 : 1.4; r.hop += dt * (r.flee > 0 ? 9 : 5);
        let nx = r.x + Math.sin(r.dir) * sp * dt, nz = r.z + Math.cos(r.dir) * sp * dt;
        const rr = Math.hypot(nx, nz); if (rr > 108 || rr < 26) { r.dir += Math.PI; nx = r.x; nz = r.z; }
        r.x = nx; r.z = nz;
      }
      r.g.position.set(r.x, moving ? Math.abs(Math.sin(r.hop)) * 0.35 : 0, r.z); r.g.rotation.y = r.dir;
    }
    for (const m of meats) { m.t += dt; m.g.rotation.y += dt * 1.2; m.g.position.y = 0.1 + Math.sin(m.t * 3) * 0.06; }
    // cooking: stand close to a lit fire holding raw meat
    const fire = G.campfire, near = fire && fire.fuel > 0 && Math.hypot(p.x - fire.x, p.z - fire.z) < 4.2;
    if (near && inv.rawMeat > 0 && G.mode === 'playing') {
      cookT += dt;
      if (cookT >= COOK_TIME) { cookT = 0; inv.rawMeat--; inv.cookedMeat++; floatText('Cooked meat!', '#ffb347', p.x, p.y + 2.3, p.z, 22); G.events.emit('pickup', { item: 'meat' }); pulse('st-hunger', '#ffb347'); }
    } else cookT = 0;
  }
  s.cookProgress = () => cookT / COOK_TIME;
  function meatInteraction(p) {
    let best = null;
    for (const m of meats) {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (d < 2.0 && (!best || d < best.dist)) {
        const full = inv.rawMeat + inv.cookedMeat >= MEAT_MAX;
        best = { dist: d, label: full ? `Can't carry more meat (${MEAT_MAX})` : '[E] Pick up raw meat', disabled: full, target: m,
          action: () => { if (full) return; inv.rawMeat++; scene.remove(m.g); meats.splice(meats.indexOf(m), 1); G.events.emit('pickup', { item: 'meat' });
            floatText('+1 Raw meat', '#ff7a8a', p.x, p.y + 2.3, p.z, 20); if (!s._meatTip) { s._meatTip = 1; G.ui?.toast?.('Raw meat: stand by the fire to cook it, then press Q to eat.', 3.5); } } };
      }
    }
    return best;
  }
  s.foodHint = () => {
    const parts = [];
    if (inv.cookedMeat) parts.push(`Cooked meat ${inv.cookedMeat}`);
    if (inv.rawMeat) parts.push(cookT > 0 ? `Cooking… ${Math.round(cookT / COOK_TIME * 100)}%` : `Raw meat ${inv.rawMeat} (cook at fire)`);
    if (inv.berries) parts.push(`Berries ${inv.berries}/${POCKET_MAX}`);
    return parts.length ? `<b style="background:#fff;color:#111;border-radius:5px;padding:0 6px">Q</b> Eat — ${parts.join(' · ')}` : '';
  };

  // ---------------- core API ----------------
  s.equip = (name) => {
    if (!HOTBAR.includes(name) || s.equipped === name) return;
    s.equipped = name; G.player.setEquipped(name); G.events.emit('equip', { item: name });
    const slot = document.querySelector(`#hotbar .slot[data-item="${name}"]`);
    slot?.animate([{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-8px) scale(1.12)' }, { transform: 'translateY(0) scale(1)' }], { duration: 260, easing: 'ease-out' });
  };
  s.give = (item, count = 1) => {
    if (item === 'log' || item === 'logs') s.inventory.logs = Math.max(0, Math.min(W.logMax, s.inventory.logs + count));
    else if (item === 'berry' || item === 'berries') s.inventory.berries = Math.max(0, Math.min(POCKET_MAX, s.inventory.berries + count));
    else if (item === 'meat' || item === 'rawMeat' || item === 'raw_meat') s.inventory.rawMeat = Math.max(0, s.inventory.rawMeat + count);
    else if (item === 'cookedMeat' || item === 'cooked_meat') s.inventory.cookedMeat = Math.max(0, s.inventory.cookedMeat + count);
    else if (item === 'battery') G.flashlight.battery = 100;
    else if (item === 'fuel') G.campfire.fuel = Math.min(100, G.campfire.fuel + count);
    else s.inventory[item] = (s.inventory[item] || 0) + count;
  };
  s.eat = (amount) => {
    s.stats.hunger = Math.min(100, s.stats.hunger + amount);
    G.events.emit('eat'); pulse('st-hunger', '#ffb347');
    // chewing bob on the head
    G.player.head?.scale && G.player.head.scale.set(1.08, 0.94, 1.08); chew = 0.45;
  };
  let chew = 0;
  s.damage = (amount, cause = 'unknown') => {
    if (s.god || G.mode !== 'playing' || s.stats.health <= 0) return;
    if (iframe > 0 && amount < 999) return;
    s.stats.health = Math.max(0, s.stats.health - amount); s.lastDamage = 0; s.cause = cause; iframe = IFRAMES;
    G.events.emit('damage', { amount, cause });
    const p = G.controls.pos;
    // (single damage number lives in the HUD next to the health bar: see ui.js #dmgnum)
    shakeEl('st-hp');
    // knockback away from the attacker
    const src = /bear/i.test(cause) ? G.bear?.pos : /deer/i.test(cause) ? G.deer?.pos : null;
    if (src && amount >= 5) {
      let dx = p.x - src.x, dz = p.z - src.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const f = Math.min(16, 6 + amount * 0.3); kb.set(dx * f, 0, dz * f);
      if (G.controls.grounded) { G.controls.vel.y = 4.5; G.controls.grounded = false; }
      G.controls.shake = Math.max(G.controls.shake || 0, 0.3);
    } else G.controls.shake = Math.max(G.controls.shake || 0, 0.12);
    if (s.stats.health <= 0) G.events.emit('death', { cause });
  };

  s.update = (dt) => {
    s.lastDamage += dt; iframe = Math.max(0, iframe - dt);
    updateFloats(dt); updateParts(dt); updateBushes(dt); updateMeat(dt); updateBackLogs(dt); updatePickCam(dt);
    if (chew > 0) { chew -= dt; const h = G.player.head; if (h) { const k = chew > 0 ? Math.abs(Math.sin(chew * 22)) * 0.06 : 0; h.scale.set(1 + k, 1 - k, 1 + k); } }
    // health chip trails the real value
    const chip = ensureChip();
    if (chip) { const hp = s.stats.health; if (hp >= hpChip) hpChip = hp; else if (s.lastDamage > 0.45) hpChip = Math.max(hp, hpChip - dt * 60); chip.style.width = hpChip + '%'; }
    if (G.mode !== 'playing') return;
    // knockback displacement (decays; collides with the world)
    if (kb.lengthSq() > 0.01) {
      const c = G.controls; c.pos.addScaledVector(kb, dt); G.world.collide(c.pos, 0.45);
      kb.multiplyScalar(Math.pow(0.004, dt)); G.player.root.position.copy(c.pos);
    } else kb.set(0, 0, 0);

    const input = G.input;
    if (input.pressed('Digit1')) s.equip('axe');
    if (input.pressed('Digit2')) s.equip('flashlight');
    if (input.pressed('Digit3')) s.equip('sack');
    if (wheel) { const i = HOTBAR.indexOf(s.equipped); s.equip(HOTBAR[(i + wheel + HOTBAR.length) % HOTBAR.length]); wheel = 0; }
    if (input.pressed('KeyQ')) {
      const pp = G.controls.pos;
      if ((inv.cookedMeat > 0 || inv.berries > 0 || inv.rawMeat > 0) && s.stats.hunger >= 100) G.ui?.toast?.('You are not hungry.', 1.2);
      else if (inv.cookedMeat > 0) { inv.cookedMeat--; s.eat(COOKED_EAT); floatText(`+${COOKED_EAT} Hunger`, '#ffb347', pp.x, pp.y + 2.3, pp.z, 28); }
      else if (s.inventory.berries <= 0 && inv.rawMeat > 0) {
        inv.rawMeat--; s.eat(RAW_EAT); floatText(`+${RAW_EAT} Hunger`, '#ffb347', pp.x, pp.y + 2.3, pp.z);
        const g = s.god; s.damage(RAW_SICK, 'raw meat'); if (!g) G.ui?.toast?.('Ugh — raw meat made you sick. Cook it at the fire!', 2.5);
      } else if (s.inventory.berries > 0 && s.stats.hunger < 100) {
        s.inventory.berries--; s.eat(HANDFUL); const p = G.controls.pos;
        floatText(`+${HANDFUL} Hunger`, '#ffb347', p.x, p.y + 2.3, p.z);
      } else if (s.inventory.berries > 0) G.ui?.toast?.('You are not hungry.', 1.2);
    }
    const st = s.stats;
    const drain = HUNGER_DRAIN * (G.controls.sprinting ? 1.6 : 1);
    if (!s.god) st.hunger = Math.max(0, st.hunger - dt * drain);
    if (st.hunger <= 0) {
      starveT += dt;
      if (starveT >= STARVE_TICK) { starveT = 0; s.damage(STARVE_DMG, 'hunger'); }
    } else {
      starveT = 0;
      const byFire = G.campfire?.inLight?.(G.controls.pos);
      if (byFire && st.hunger > 40 && s.lastDamage > 5) st.health = Math.min(100, st.health + dt * FIRE_HEAL);
    }
    // hunger warnings (once per threshold crossing)
    const lvl = st.hunger <= 0 ? 3 : st.hunger < 12 ? 2 : st.hunger < 28 ? 1 : 0;
    if (lvl > warnedHunger) {
      G.ui?.toast?.(lvl === 1 ? 'You\'re getting hungry. Berries are only a snack: hit a rabbit with the axe and cook the meat by the fire [Q to eat].' : lvl === 2 ? 'Starving soon! Hunt a rabbit with the axe and cook it by the fire, or find a berry bush [E].' : 'You are starving — losing health!', 3);
      pulse('st-hunger', '#ff5a3a');
    }
    if (lvl < warnedHunger && st.hunger > 35) warnedHunger = 0; else warnedHunger = Math.max(warnedHunger, lvl);
    updateStarveFx(dt, st.hunger);
    if (s.god) { st.health = 100; st.hunger = Math.max(st.hunger, 50); }
  };

  // ---------------- starving feedback: pulsing red-brown vignette in heartbeat rhythm + audio heartbeat hook ----------------
  let starveFx = null, starvePh = 0, starveK = 0;
  function updateStarveFx(dt, hunger) {
    if (!starveFx) {
      starveFx = document.createElement('div'); starveFx.id = 'starve-vignette';
      starveFx.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 30%, rgba(150,18,6,0.7) 62%, rgba(70,0,0,1) 100%);mix-blend-mode:normal;';
      const gm = $('game'); if (gm && gm.parentNode) gm.parentNode.insertBefore(starveFx, gm.nextSibling); else document.body.appendChild(starveFx); // under the HUD
    }
    // 0 above 15 hunger, ramps to 0.55 at 1 hunger, 1.0 while starving (hunger 0)
    const target = G.mode !== 'playing' || s.god ? 0 : hunger <= 0 ? 1 : hunger < 15 ? 0.2 + 0.35 * (1 - hunger / 15) : 0;
    starveK += (target - starveK) * Math.min(1, dt * 3);
    s.starve = +starveK.toFixed(3);  // read by audio.js to drive the heartbeat
    const bpm = 60 + 50 * starveK; starvePh = (starvePh + dt * bpm / 60) % 1;
    const lub = Math.exp(-Math.pow((starvePh - 0.05) / 0.06, 2)), dub = 0.7 * Math.exp(-Math.pow((starvePh - 0.3) / 0.06, 2));
    const o = starveK <= 0.01 ? 0 : starveK * (0.6 + 0.4 * Math.max(lub, dub));
    starveFx.style.opacity = o.toFixed(3);
    const hb = $('st-hunger'); if (hb) hb.style.filter = starveK > 0.3 ? `drop-shadow(0 0 ${(6 * Math.max(lub, dub)).toFixed(1)}px #ff3a2a)` : '';
  }

  let wheel = 0;
  addEventListener('wheel', (e) => { if (G.mode === 'playing' && (e.altKey || e.ctrlKey || e.metaKey) && Math.abs(e.deltaY) > 2) wheel = e.deltaY > 0 ? 1 : -1; }, { passive: true });
  return s;
}
