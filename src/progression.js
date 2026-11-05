// Progression: campfire levels 1-4 that push back the edge of the playable land, the four caves (3 wolf caves +
// 1 gray-bear cave), their locks and keys, and the Mountain region unlocked by the final key. See docs/EXPANSION.md.
//
// Public (contract): fireLevel, limitR, caves[] (created here, never reordered), keys[] (keys lying on the ground),
// getInteraction(p), update(dt). Extras other modules may use: inBounds(x, z, pad), clampZone(p, r) (called by
// world.collide), limitPlayer(pos, vel, dt) (called by controls), levelInfo(), axeDamage / treeDamage / axeName,
// inCave (cave id or null), caveDark (0..1), inMountain (0..1), regions[], goalHint().
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { LEVEL_R, LEVEL_LOGS, CAVE_SITES, MOUNTAIN, MAP_R, mountainSD } from './regions.js';
import { createBarrier } from './barrier.js';
import { buildCave, KEY_COLORS } from './caves.js';
import { createMountain } from './mountain.js';
import { glowTexture } from './campfire.js';

const AXES = [
  null,
  { name: 'Old Axe', tree: 1, dmg: 1, head: '#9aa0a6', edge: '#d9dde0' },
  { name: 'Iron Axe', tree: 2, dmg: 1.4, head: '#6c747d', edge: '#eef2f5' },
  { name: 'Steel Axe', tree: 2, dmg: 1.8, head: '#9db7cc', edge: '#f4faff' },
  { name: "Woodsman's Axe", tree: 3, dmg: 2.3, head: '#c9963a', edge: '#ffe7a0' },
];
const LOOT = { wolf1: { meat: 2, axe: 2 }, wolf2: { meat: 3, axe: 3 }, wolf3: { meat: 3, axe: 4 }, bear: { meat: 4 } };
const KEY_NAMES = { wolf1: 'Den Key', wolf2: 'Hollow Key', wolf3: 'Ridge Key', bear: 'Bear Key', mountain: 'Mountain Key' };
const KEY_SHORT = { wolf1: 'Den', wolf2: 'Hollow', wolf3: 'Ridge', bear: 'Bear', mountain: 'Mountain' };
const CAVE_NAMES = { wolf1: 'the Wolf Den', wolf2: 'the Wolf Hollow', wolf3: 'the Ridge Den', bear: 'the Bear Cave' };
const LEVEL_SUBS = [null, null, 'The fog pulls back. Wolves stir in the new woods: find the Wolf Den.', 'Deeper woods. Another pack guards the Wolf Hollow.', 'The whole forest is open. Wolves hold the Ridge Den, gray bears guard the Bear Cave.'];
const LEVEL_NEXT = [null, 'Next: opens the Wolf Den', 'Next: opens the Wolf Hollow', 'Next: opens the Ridge Den + Bear Cave', 'The whole forest is open'];
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createProgression(G) {
  const { scene } = G, W = G.world;
  const prog = { fireLevel: 1, logsFed: 0, limitR: LEVEL_R[0], forestR: LEVEL_R[0], caves: [], keys: [], regions: [], inCave: null, caveDark: 0, inMountain: 0,
    axeTier: 1, axeDamage: 1, treeDamage: 1, axeName: AXES[1].name, alphaDown: false };
  const inv = G.survival.inventory; inv.keys = inv.keys || {};
  let hudEl = null, hudDirty = true, popKey = null;

  // ---------- world pieces ----------
  const barrier = createBarrier(G, prog.forestR);
  const impl = {};
  for (const s of CAVE_SITES) {
    const c = buildCave(G, s); impl[s.id] = c;
    prog.caves.push({ id: s.id, type: s.type, level: s.level, x: s.x, z: s.z, entrance: { ...s.entrance }, interior: { ...s.interior },
      locked: true, cleared: false, chestOpen: false, name: CAVE_NAMES[s.id], radius: s.Ro, chamberR: s.Ri, clearing: { ...s.clearing } });
  }
  const caveById = (id) => prog.caves.find(c => c.id === id);
  const mountain = createMountain(G);
  prog.regions.push({ id: 'mountain', open: false, x: MOUNTAIN.field.x, z: MOUNTAIN.field.z, r: MOUNTAIN.field.r, gate: { ...MOUNTAIN.gate }, pass: { a: { ...MOUNTAIN.pass.a }, b: { ...MOUNTAIN.pass.b }, w: MOUNTAIN.pass.w } });
  const region = prog.regions[0];

  // ---------- playable zone: disk of the fire level's radius ∪ the Mountain once open ----------
  const g2 = [0, 0], grad = [0, 0];
  function sdZone(x, z, out, forPlayer = true) {
    const r = Math.hypot(x, z) || 1e-6, R = forPlayer ? prog.forestR : MAP_R - 2, sD = r - R;
    if (out) { out[0] = x / r; out[1] = z / r; }
    if (forPlayer && !region.open) return sD;
    const sM = mountainSD(x, z, g2);
    if (sM < sD) { if (out) { out[0] = g2[0]; out[1] = g2[1]; } return sM; }
    return sD;
  }
  prog.inBounds = (x, z, pad = 0) => sdZone(x, z, null, true) <= pad;
  // called at the end of world.collide for every entity: cave rock + the edge of the land. Only the player is held
  // by the fog barrier (the Deer and the bear still come out of the fog at night); everything stays on the map.
  prog.clampZone = (p, r) => {
    for (const id in impl) impl[id].collide(p, r);
    const isPlayer = G.controls && p === G.controls.pos;
    const sd = sdZone(p.x, p.z, grad, isPlayer);
    if (isPlayer) { if (sd > 0.5 && sd < 4) { const k = sd - 0.5; p.x -= grad[0] * k; p.z -= grad[1] * k; } }
    else if (sd > 0 && sd < 12) { p.x -= grad[0] * sd; p.z -= grad[1] * sd; }
  };
  // soft push-back: outward velocity bleeds off near the wall, and a little overshoot springs back
  let edgeToast = -99;
  prog.limitPlayer = (pos, vel, dt) => {
    const sd = sdZone(pos.x, pos.z, grad, true); if (sd < -2.5 || sd > 4) return;
    const vo = vel.x * grad[0] + vel.z * grad[1];
    if (vo > 0) { const k = smooth(-2.5, 0.2, sd) * 0.92; vel.x -= grad[0] * vo * k; vel.z -= grad[1] * vo * k; }
    if (sd > 0) { const back = sd * (1 - Math.exp(-9 * dt)); pos.x -= grad[0] * back; pos.z -= grad[1] * back; }
    if (sd > -0.8 && G.mode === 'playing' && G.time - edgeToast > 8) {
      edgeToast = G.time;
      G.ui?.toast?.(prog.fireLevel < 4 ? 'The fog is too thick to pass. Feed the fire to push it back.' : 'The fog is too thick here. The Mountain Gate is the only way on.', 3);
    }
  };

  // ---------- fire levels ----------
  prog.levelInfo = () => {
    const L = prog.fireLevel, max = L >= 4, cur = LEVEL_LOGS[L - 1], next = max ? cur : LEVEL_LOGS[L];
    const span = next - cur, into = max ? span : Math.max(0, Math.min(span, prog.logsFed - cur)); // never negative, even after a debug jump
    return { level: L, fed: prog.logsFed, max, into, span, left: span - into, next, hint: LEVEL_NEXT[L], text: max ? `Lv ${L} · MAX` : `Lv ${L} · ${into}/${span} logs` };
  };
  function setLevel(n, celebrate) {
    n = Math.max(1, Math.min(4, n | 0)); const up = n > prog.fireLevel;
    prog.fireLevel = n; prog.forestR = LEVEL_R[n - 1]; if (!region.open) prog.limitR = prog.forestR;
    prog.logsFed = Math.max(prog.logsFed, LEVEL_LOGS[n - 1]);
    barrier.moveTo(prog.forestR, !celebrate);
    G.campfire.setLevel && G.campfire.setLevel(n, celebrate && up);
    if (celebrate && up) {
      G.ui?.showCard?.('THE FOREST OPENS', `FIRE LEVEL ${n} · ${LEVEL_SUBS[n]}`, 'open');
      G.ui?.pulseFireLevel?.();
      G.events.emit('fireLevelUp', { level: n });
    }
  }
  G.events.on('fireFed', () => {
    prog.logsFed++;
    while (prog.fireLevel < 4 && prog.logsFed >= LEVEL_LOGS[prog.fireLevel]) setLevel(prog.fireLevel + 1, true);
  });

  // ---------- axe tiers (chest rewards) ----------
  function setAxe(tier) {
    tier = Math.max(1, Math.min(4, tier)); const A = AXES[tier];
    Object.assign(prog, { axeTier: tier, axeDamage: A.dmg, treeDamage: A.tree, axeName: A.name });
    const ax = G.player && G.player.items && G.player.items.axe;
    if (ax && ax.children[1] && ax.children[2]) { ax.children[1].material.color.set(A.head); ax.children[2].material.color.set(A.edge); if (tier >= 4 && ax.children[1].material.emissive) ax.children[1].material.emissive.set('#2a1a00'); }
  }

  // ---------- keys: glowing pickups with a light beam you can spot from far off ----------
  const keyGeo = (() => {
    const bow = new THREE.TorusGeometry(0.2, 0.065, 4, 8); bow.translate(0, 0.36, 0);
    const shaft = new THREE.BoxGeometry(0.075, 0.62, 0.075); shaft.translate(0, -0.05, 0);
    const t1 = new THREE.BoxGeometry(0.16, 0.07, 0.07); t1.translate(0.11, -0.28, 0);
    const t2 = new THREE.BoxGeometry(0.11, 0.07, 0.07); t2.translate(0.085, -0.15, 0);
    return mergeGeometries([bow.toNonIndexed(), shaft.toNonIndexed(), t1.toNonIndexed(), t2.toNonIndexed()]);
  })();
  const beamTex = (() => { const cv = document.createElement('canvas'); cv.width = 4; cv.height = 64; const x = cv.getContext('2d'); const g = x.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(cv); })();
  const beamGeo = new THREE.CylinderGeometry(0.22, 0.55, 16, 8, 1, true); beamGeo.translate(0, 8, 0);
  const glowTex = glowTexture('rgba(255,250,220,1)', 'rgba(255,220,120,0)');
  function dropKey(id, x, z) {
    if (inv.keys[id] || prog.keys.some(k => k.id === id)) return null;
    const c = caveById(id);
    // make sure it lands somewhere the player can reach: in the open land, clear of the rock
    const p = new THREE.Vector3(x ?? (c ? c.clearing.x : 0), 0, z ?? (c ? c.clearing.z : 0));
    for (const k in impl) impl[k].collide(p, 0.6);
    if (!prog.inBounds(p.x, p.z, -1.5) && c) p.set(c.clearing.x, 0, c.clearing.z);
    if (!prog.inBounds(p.x, p.z, -1.5)) { const r = Math.hypot(p.x, p.z) || 1; p.multiplyScalar((prog.forestR - 2) / r); }
    const col = new THREE.Color(KEY_COLORS[id] || '#ffd24a');
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); scene.add(g);
    const mesh = new THREE.Mesh(keyGeo, new THREE.MeshLambertMaterial({ color: col, emissive: col.clone().multiplyScalar(0.35), flatShading: true })); mesh.castShadow = true; mesh.scale.setScalar(id === 'mountain' ? 1.5 : 1.25); g.add(mesh);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 })); glow.scale.setScalar(2.2); g.add(glow);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: beamTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, opacity: 0.4 })); g.add(beam);
    const k = { id, x: p.x, z: p.z, g, mesh, glow, beam, t: 0 };
    prog.keys.push(k);
    for (let n = 0; n < 18; n++) W.emitParticle && W.emitParticle(p.x, 1.2, p.z, (Math.random() - .5) * 4, 3 + Math.random() * 3, (Math.random() - .5) * 4, 0.08 + Math.random() * 0.06, '#' + col.getHexString(), 1.2, 7, 1, 8);
    G.events.emit('keyDrop', { caveId: id, x: p.x, z: p.z });
    return k;
  }
  function takeKey(k) {
    inv.keys[k.id] = true; scene.remove(k.g); prog.keys.splice(prog.keys.indexOf(k), 1);
    G.events.emit('keyPickup', { caveId: k.id, x: k.x, z: k.z });
    G.ui?.toast?.(k.id === 'mountain' ? 'The Mountain Key! The Mountain Gate waits at the end of the old trail.' : `You found the ${KEY_NAMES[k.id]}! It opens ${CAVE_NAMES[k.id]}.`, 3.2);
    hudDirty = true; popKey = k.id;
  }
  G.events.on('guardiansCleared', (d = {}) => {
    const c = caveById(d.caveId); if (!c || c.cleared) return;
    c.cleared = true; dropKey(c.id, d.x, d.z);
    G.ui?.toast?.(c.type === 'bear' ? 'The last gray bear falls. It dropped a key!' : 'The pack is broken. The last wolf dropped a key!', 3);
  });
  G.events.on('alphaDead', (d = {}) => {
    prog.alphaDown = true; const c = caveById('bear');
    dropKey('mountain', d.x ?? c?.interior.x, d.z ?? c?.interior.z);
  });

  // ---------- caves: unlock, chest, the Mountain ----------
  function unlockCave(id, quiet = false) {
    const c = caveById(id); if (!c || !c.locked) return false;
    c.locked = false; impl[id].unlock(); hudDirty = true;
    G.events.emit('caveUnlocked', { caveId: id, x: c.entrance.x, z: c.entrance.z });
    if (!quiet) G.ui?.toast?.(id === 'bear' ? 'The gate gives way. Something huge stirs in the dark...' : `${CAVE_NAMES[id].replace(/^the/, 'The')} is open. Bring your flashlight.`, 3.2);
    return true;
  }
  function openChest(id) {
    const c = caveById(id); if (!c || c.chestOpen || !impl[id].openChest()) return false;
    c.chestOpen = true; const L = LOOT[id] || {}, got = [];
    const cw = impl[id].chestWorld, s = CAVE_SITES.find(q => q.id === id);
    setTimeout(() => { if (L.meat) G.survival.spawnMeat?.(cw.x + s.mx * 1.4, cw.z + s.mz * 1.4, L.meat); }, 350);
    G.flashlight.battery = 100;
    if (L.meat) got.push(`${L.meat} raw meat`);
    got.push('fresh batteries');
    if (L.axe && L.axe > prog.axeTier) { setAxe(L.axe); got.push(`the ${AXES[L.axe].name}!`); }
    G.events.emit('chestOpen', { caveId: id, x: cw.x, z: cw.z, loot: { ...L } });
    G.ui?.toast?.(`Chest: ${got.join(' · ')}`, 3.6);
    return true;
  }
  function openRegion(quiet = false) {
    if (region.open) return false;
    region.open = true; prog.limitR = Math.ceil(Math.hypot(MOUNTAIN.field.x, MOUNTAIN.field.z) + MOUNTAIN.field.r + 2);
    mountain.openGate(quiet); barrier.setGapOpen(true); hudDirty = true;
    if (!quiet) G.ui?.showCard?.('THE MOUNTAIN OPENS', 'Snow, stone and thin cold air beyond the gate.', 'open');
    G.events.emit('regionUnlocked', { id: 'mountain' });
    return true;
  }

  // ---------- interactions ----------
  const keyName = (id) => KEY_NAMES[id];
  prog.getInteraction = (p) => {
    let best = null;
    const offer = (d, label, action, disabled = false) => { if (!best || d < best.dist) best = { dist: d, label, action: disabled ? () => {} : action, disabled }; };
    for (const k of prog.keys) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < 2.3) offer(d - 1.6, `[E] Pick up the ${keyName(k.id)}`, () => takeKey(k)); } // beats the meat that dropped beside it
    for (const c of prog.caves) {
      const I = impl[c.id];
      if (c.locked) {
        const d = Math.hypot(I.gateWorld.x - p.x, I.gateWorld.z - p.z);
        if (d < 3.4 && I.where(p.x, p.z) !== 'inside') {
          if (inv.keys[c.id]) offer(d - 1.2, `[E] Unlock ${CAVE_NAMES[c.id]} (${keyName(c.id)})`, () => unlockCave(c.id));
          else offer(d + 0.3, c.cleared ? `Locked · pick up the ${keyName(c.id)} the last ${c.type === 'bear' ? 'gray bear' : 'wolf'} dropped` : `Locked · ${c.type === 'bear' ? 'the gray bears guard' : 'the wolf pack carries'} the key`, null, true);
        }
      } else if (!c.chestOpen) {
        const d = Math.hypot(I.chestWorld.x - p.x, I.chestWorld.z - p.z);
        if (d < 2.4) {
          if (c.type === 'bear' && !prog.alphaDown) offer(d, 'The Alpha guards this chest', null, true);
          else offer(d - 0.2, '[E] Open the chest', () => openChest(c.id));
        }
      }
    }
    if (!region.open) {
      const gw = mountain.gateWorld, d = Math.hypot(gw.x - p.x, gw.z - p.z);
      if (d < 4.6) { if (inv.keys.mountain) offer(d - 1.2, '[E] Unlock the Mountain Gate (Mountain Key)', () => openRegion()); else offer(d + 0.3, 'The Mountain Gate is sealed · the Alpha holds its key', null, true); }
    }
    return best;
  };

  // ---------- HUD: key slots under the campfire panel ----------
  const keySvg = (col) => `<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="5" fill="none" stroke="${col}" stroke-width="2.6"/><path d="M11.5 11.5 20 20M16.5 16.5l2.2-2.2M18.6 18.6l2-2" stroke="${col}" stroke-width="2.6" stroke-linecap="round"/></svg>`;
  function drawHud() {
    if (!hudEl) { const hud = document.getElementById('hud'); if (!hud) return; hudEl = document.getElementById('keys') || Object.assign(document.createElement('div'), { id: 'keys' }); if (!hudEl.parentNode) hud.appendChild(hudEl); }
    if (!hudDirty) return; hudDirty = false;
    const ids = ['wolf1', 'wolf2', 'wolf3', 'bear', 'mountain'].filter(id => inv.keys[id]);
    hudEl.innerHTML = ids.map(id => { const used = id === 'mountain' ? region.open : !caveById(id)?.locked;
      return `<div class="kslot${used ? ' used' : ''}${popKey === id ? ' pop' : ''}" title="${KEY_NAMES[id]}">${keySvg(KEY_COLORS[id])}<span>${KEY_SHORT[id]}</span></div>`; }).join('');
    popKey = null;
  }

  // ---------- objective hints (used by the HUD tracker when nothing more urgent is going on) ----------
  const fwd = new THREE.Vector3(), ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const dirTo = (x, z) => {
    const P = G.controls.pos, dx = x - P.x, dz = z - P.z; G.camera.getWorldDirection(fwd);
    const fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
    const a = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz); // 0 ahead, + right
    return `${Math.round(Math.hypot(dx, dz))} m ${ARROWS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]}`;
  };
  prog.goalHint = () => {
    if (!G.controls) return null;
    const k = prog.keys[0]; if (k) return [`Pick up the ${keyName(k.id)}`, `Glowing key · ${dirTo(k.x, k.z)}`];
    for (const c of prog.caves) if (c.level <= prog.fireLevel && c.locked && inv.keys[c.id]) return [`Unlock ${CAVE_NAMES[c.id]}`, `[E] at the gate · ${dirTo(c.entrance.x, c.entrance.z)}`];
    for (const c of prog.caves) if (!c.locked && !c.chestOpen) {
      if (c.type === 'bear' && !prog.alphaDown) return ['Defeat the Alpha', `It waits in the Bear Cave · ${dirTo(c.interior.x, c.interior.z)}`];
      return [`Search ${CAVE_NAMES[c.id]}`, `Bring the flashlight · chest at the back · ${dirTo(c.interior.x, c.interior.z)}`];
    }
    if (inv.keys.mountain && !region.open) return ['Open the Mountain Gate', `End of the old trail · ${dirTo(MOUNTAIN.gate.x, MOUNTAIN.gate.z)}`];
    if (region.open && !prog.mountainVisited) return ['Climb into the Mountain', `Through the gate and up the pass · ${dirTo(MOUNTAIN.field.x, MOUNTAIN.field.z)}`];
    for (const c of prog.caves) if (c.level <= prog.fireLevel && !c.cleared) return [c.type === 'bear' ? 'Defeat the gray bears' : 'Clear the wolf pack', `${CAVE_NAMES[c.id].replace(/^the/, 'The')} · ${dirTo(c.clearing.x, c.clearing.z)}`];
    if (prog.fireLevel < 4) { const L = prog.levelInfo(); return ['Grow the fire', `${L.text} · each level pushes back the fog`]; }
    return null;
  };

  // ---------- environment inside caves / up the mountain (applied right after the day/night keyframes, so every
  // module that reads daynight.darkness this frame — flashlight beam, eyeshine, audio — sees the cave as dark) ----------
  const black = new THREE.Color('#040506'), cold = { sky: new THREE.Color('#e2eeff'), gnd: new THREE.Color('#b9c6d3'), sun: new THREE.Color('#eef5ff'), fogD: new THREE.Color('#e6eef4'), fogN: new THREE.Color('#1b2840') };
  const dn = G.daynight, dnUpdate = dn.update.bind(dn);
  dn.update = (dt) => {
    dnUpdate(dt);
    const P = G.controls.pos; let depth = 0, where = null, inId = null;
    for (const id in impl) { const w = impl[id].where(P.x, P.z); if (w && w !== 'outside') { const dd = impl[id].depth(P.x, P.z); if (dd >= depth) { depth = dd; where = w; inId = id; } } }
    prog.inCave = depth > 0.35 ? inId : null; prog._where = where; prog._caveId = inId;
    prog.caveDark += (depth - prog.caveDark) * Math.min(1, dt * 3.5);
    const k = prog.caveDark, f = scene.fog;
    if (k > 0.002) {
      dn.hemi.intensity *= 1 - 0.9 * k; dn.sun.intensity *= 1 - 0.96 * k;
      dn.darkness = Math.max(dn.darkness, 0.95 * k); dn.daylight = 1 - dn.darkness;
      if (f) { f.color.lerp(black, k * 0.92); f.far = f.far + (24 - f.far) * k; if (scene.background && scene.background.isColor) scene.background.copy(f.color); }
    }
    const mk = mountain.depth(P.x, P.z); prog.inMountain = mk; if (mk > 0.6) prog.mountainVisited = true;
    if (mk > 0.002) {
      const nd = dn.darkness;
      dn.hemi.color.lerp(cold.sky, mk * 0.45); dn.hemi.groundColor.lerp(cold.gnd, mk * 0.6); dn.sun.color.lerp(cold.sun, mk * 0.5);
      dn.hemi.intensity *= 1 + mk * (0.12 + nd * 0.7); // snow throws the moonlight back up
      if (f) { f.color.lerp(nd > 0.5 ? cold.fogN : cold.fogD, mk * (0.45 - nd * 0.15)); if (scene.background && scene.background.isColor) scene.background.copy(f.color); }
    }
  };

  // ---------- per frame ----------
  const pivot = new THREE.Vector3();
  prog.update = (dt) => {
    const P = G.controls.pos;
    barrier.update(dt);
    mountain.update(dt, prog.inMountain, prog.fireLevel);
    for (const id in impl) impl[id].update(dt, P, id === prog._caveId ? prog.caveDark : 0, id === prog._caveId ? prog._where : null);
    // keep the third-person camera out of the rock
    if (G.mode === 'playing') {
      const cam = G.camera.position; pivot.copy(G.controls.camTarget || P);
      for (const id in impl) {
        const s = impl[id].site, dc = Math.hypot(cam.x - s.x, cam.z - s.z), dp = Math.hypot(P.x - s.x, P.z - s.z);
        if (dc > s.Ro + 1.5 && dp > s.Ro + 2) continue;
        if (impl[id].clampCamera(cam, pivot, impl[id].where(P.x, P.z) || 'outside')) G.camera.updateMatrixWorld();
      }
    }
    for (const k of prog.keys) {
      k.t += dt; k.mesh.position.y = 1.0 + Math.sin(k.t * 2.2) * 0.15; k.mesh.rotation.y = k.t * 1.8; k.mesh.rotation.z = 0.25;
      k.glow.position.y = k.mesh.position.y; k.glow.material.opacity = 0.55 + 0.2 * Math.sin(k.t * 4);
      k.beam.material.opacity = 0.22 + 0.12 * (G.daynight.darkness || 0) + 0.06 * Math.sin(k.t * 3);
    }
    // standing over a closed chest the avatar would hide it: ghost the avatar so the chest (and its glint) reads
    if (G.mode === 'playing' && prog._caveId && G.player) { const c = caveById(prog._caveId), cw = impl[prog._caveId].chestWorld;
      if (c && !c.locked && !c.chestOpen && Math.hypot(cw.x - P.x, cw.z - P.z) < 3.4) G.player.setFade(Math.min(G.player.fade ?? 1, 0.55)); }
    // first steps into a black chamber without a light: say how to fix that
    if (prog.inCave && prog.inCave !== lastCave && G.mode === 'playing' && !G.flashlight.on && G.time - darkHintT > 25) { darkHintT = G.time; G.ui?.toast?.('It\'s pitch black in here. Press F for your flashlight.', 3); }
    lastCave = prog.inCave;
    drawHud();
  };
  let lastCave = null, darkHintT = -99;

  // ---------- debug helpers (window.__game wires these) ----------
  prog.debug = {
    roots: () => [barrier.root, ...Object.values(impl).map(c => c.root), mountain.root, mountain.gate],
    setFireLevel(n, celebrate = false) { n = Math.max(1, Math.min(4, n | 0)); prog.logsFed = n < prog.fireLevel ? LEVEL_LOGS[n - 1] : Math.max(prog.logsFed, LEVEL_LOGS[n - 1]); if (n < prog.fireLevel) { prog.fireLevel = n; } setLevel(n, celebrate); return prog.levelInfo().text; },
    giveKey(id) { inv.keys[id] = true; const k = prog.keys.find(q => q.id === id); if (k) { scene.remove(k.g); prog.keys.splice(prog.keys.indexOf(k), 1); } hudDirty = true; return { ...inv.keys }; },
    dropKey(id, x, z) { const k = dropKey(id, x, z); return k ? { id, x: +k.x.toFixed(1), z: +k.z.toFixed(1) } : null; },
    unlockCave(id) { const c = caveById(id); if (c && prog.fireLevel < c.level) setLevel(c.level, false); return unlockCave(id, true); },
    openChest(id) { return openChest(id); },
    openRegion() { if (prog.fireLevel < 4) setLevel(4, false); inv.keys.mountain = true; return openRegion(false); },
    setAxe(t) { setAxe(t); return prog.axeName; },
    // where: 'outside' (in the clearing, facing the gate), 'gate', 'inside' (chamber, facing the chest), 'chest'.
    // id may also be 'mountain' (the snowfield) or 'mountainGate'. Raises the fire level so the land there is open.
    teleport(id, where = 'outside') {
      if (G.mode === 'title') G.startGame();
      if (id === 'mountain' || id === 'mountainGate') {
        if (prog.fireLevel < 4) setLevel(4, false);
        const g = MOUNTAIN.gate, F = MOUNTAIN.field;
        if (id === 'mountain') { G.controls.teleport(F.x - MOUNTAIN.ca * 12, F.z - MOUNTAIN.sa * 12); G.controls.lookAt(F.x + MOUNTAIN.ca * 20, F.z + MOUNTAIN.sa * 20); }
        else { G.controls.teleport(g.x - MOUNTAIN.ca * (where === 'far' ? 12 : 3.8), g.z - MOUNTAIN.sa * (where === 'far' ? 12 : 3.8)); G.controls.lookAt(g.x, g.z); }
        return { x: +G.controls.pos.x.toFixed(1), z: +G.controls.pos.z.toFixed(1) };
      }
      const c = caveById(id), s = CAVE_SITES.find(q => q.id === id); if (!c) return null;
      if (prog.fireLevel < c.level) setLevel(c.level, false);
      if (where === 'gate') { G.controls.teleport(s.x + s.mx * (s.Ro + 1.6), s.z + s.mz * (s.Ro + 1.6)); G.controls.lookAt(s.x, s.z); }
      else if (where === 'inside') { G.controls.teleport(s.x + s.mx * (s.Ri - 2.5), s.z + s.mz * (s.Ri - 2.5)); G.controls.lookAt(impl[id].chestWorld.x, impl[id].chestWorld.z); }
      else if (where === 'chest') { const cw = impl[id].chestWorld; G.controls.teleport(cw.x + s.mx * 1.7, cw.z + s.mz * 1.7); G.controls.lookAt(cw.x, cw.z); }
      else { G.controls.teleport(s.clearing.x + s.mx * 4, s.clearing.z + s.mz * 4); G.controls.lookAt(c.entrance.x, c.entrance.z); }
      return { x: +G.controls.pos.x.toFixed(1), z: +G.controls.pos.z.toFixed(1) };
    },
    state() {
      return { fireLevel: prog.fireLevel, logsFed: prog.logsFed, level: prog.levelInfo().text, limitR: prog.limitR, forestR: prog.forestR, barrier: barrier.state(),
        keys: { ...inv.keys }, keysOnGround: prog.keys.map(k => ({ id: k.id, x: +k.x.toFixed(1), z: +k.z.toFixed(1) })),
        caves: prog.caves.map(c => ({ id: c.id, level: c.level, locked: c.locked, cleared: c.cleared, chestOpen: c.chestOpen })),
        mountainOpen: region.open, inCave: prog.inCave, caveDark: +prog.caveDark.toFixed(2), inMountain: +prog.inMountain.toFixed(2), axe: prog.axeName };
    },
  };
  return prog;
}
