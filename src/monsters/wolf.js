// Wolf packs: 4-5 wolves guard each wolf cave (G.progression.caves, type 'wolf'). A pack sleeps until its land
// is open (fireLevel >= cave.level), then patrols in front of the cave mouth. It notices the player at ~18 m
// (22 m at night), howls, and the pack circles. Only ONE wolf attacks at a time: it walks in, stops, crouches with
// raised hackles, bared fangs and flaring amber eyes (the telegraph, ~0.65 s), then lunges in a straight, locked
// line: sidestep and it snaps on air. It backs off after every bite. Wolves never enter the fire's light, back off
// when the player stands in it, shy from the flashlight at night and give up past their leash. Two axe hits kill
// a wolf (raw meat drop); the LAST wolf of a pack emits guardiansCleared {caveId,x,z}. Packs never respawn.
import * as THREE from '../../vendor/three.module.js';
import { makeEyePair, nightFog } from './bear.js';

const PALS = [   // gray wolves, with a darker saddle and a paler mask than before so they separate from rock and bark by day
  { fur: '#8a8279', back: '#4e4842', pale: '#ddd3c3' },
  { fur: '#7b7369', back: '#423d38', pale: '#cfc5b4' },
  { fur: '#93897a', back: '#574f45', pale: '#e2d7c4' },
];
const DAY_LINE = new THREE.Color('#1c1712');
const EYE_CALM = new THREE.Color('#ffcf48'), EYE_RAGE = new THREE.Color('#ff5a1a'), RIM_CALM = new THREE.Color('#a9bedf'), RIM_RAGE = new THREE.Color('#ffc890');
const HP = 50, NOTICE_DAY = 18, NOTICE_NIGHT = 22, LEASH = 40, CULL = 120;
const WINDUP = 0.68, LUNGE_SPEED = 12.5, BITE_R = 1.35;

function buildWolf(K, scene, pal, size) {
  const { box } = K;
  const fur = K.mat(pal.fur), back = K.mat(pal.back), pale = K.mat(pal.pale);
  const nose = K.mat('#141010'), mouth = K.mat('#4a1010'), tooth = K.mat('#e8e0cc'), eyeD = K.basic('#111');
  const root = new THREE.Group(); root.scale.setScalar(size); scene.add(root);
  const body = new THREE.Group(); root.add(body);
  body.add(box(0.5, 0.5, 1.3, fur, 0, 0.8, -0.05));          // barrel
  body.add(box(0.6, 0.62, 0.5, fur, 0, 0.88, 0.42));         // deep chest / ruff
  body.add(box(0.52, 0.16, 0.95, back, 0, 1.1, -0.12));      // dark saddle
  body.add(box(0.4, 0.14, 0.95, pale, 0, 0.53, 0.02));       // pale belly
  body.add(box(0.44, 0.32, 0.12, pale, 0, 0.74, 0.68));      // pale throat
  const hackles = box(0.22, 0.14, 0.62, back, 0, 1.2, 0.18); hackles.userData.keep = true; body.add(hackles);
  const head = new THREE.Group(); head.position.set(0, 1.03, 0.74); body.add(head);
  head.add(box(0.42, 0.36, 0.4, fur, 0, 0.04, 0.08));
  head.add(box(0.24, 0.17, 0.34, pale, 0, -0.04, 0.42));     // muzzle
  head.add(box(0.11, 0.08, 0.06, nose, 0, 0.03, 0.6));
  head.add(box(0.46, 0.13, 0.2, pale, 0, -0.1, 0.0));        // cheek ruff
  for (const sx of [-1, 1]) { const e = box(0.11, 0.21, 0.07, back, sx * 0.13, 0.3, -0.02); e.rotation.z = -sx * 0.18; head.add(e); }
  for (const sx of [-1, 1]) head.add(box(0.07, 0.05, 0.02, eyeD, sx * 0.12, 0.1, 0.285, false));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, 0.3); head.add(jaw);
  jaw.add(box(0.2, 0.06, 0.3, pale, 0, -0.03, 0.12)); jaw.add(box(0.16, 0.03, 0.26, mouth, 0, 0.01, 0.12));
  for (const sx of [-1, 1]) { jaw.add(box(0.035, 0.07, 0.035, tooth, sx * 0.065, 0.045, 0.24, false)); head.add(box(0.035, 0.07, 0.035, tooth, sx * 0.07, -0.15, 0.53, false)); }
  const eyePair = makeEyePair(head, [-0.12, 0.12], 0.1, 0.3, '#ffcf48');
  const legs = [];
  for (const [x, z] of [[-0.17, 0.45], [0.17, 0.45], [-0.17, -0.5], [0.17, -0.5]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.66, z); body.add(hip);
    hip.add(box(0.15, 0.62, 0.17, fur, 0, -0.3, 0)); hip.add(box(0.17, 0.08, 0.22, back, 0, -0.62, 0.03));
    legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.98, -0.68); body.add(tail);
  tail.add(box(0.15, 0.15, 0.55, fur, 0, 0, -0.27)); tail.add(box(0.16, 0.16, 0.16, pale, 0, 0, -0.6));
  const { mat, rimMat } = K.optimize(root, { rim: '#a9bedf', t: 0.03, minSize: 0.05 });   // one mesh + one rim per part
  // HP bar (after a hit), same look as the bear's
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#1a0d0d', depthTest: false, fog: false, transparent: true, opacity: 0.75 }));
  const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#e0463a', depthTest: false, fog: false, transparent: true }));
  barBg.center.set(0, 0.5); barFg.center.set(0, 0.5); barBg.renderOrder = 998; barFg.renderOrder = 999;
  barBg.scale.set(1.1, 0.14, 1); barFg.scale.set(1.04, 0.08, 1); root.add(barBg, barFg); barBg.visible = barFg.visible = false;
  barBg.position.set(-0.55, 1.75, 0); barFg.position.set(-0.52, 1.75, 0);
  return { root, body, head, jaw, legs, tail, hackles, eyePair, rimMat, barFg, barBg, furMats: [mat], allMats: [mat] };
}

export function createWolves(G, cr, K) {
  const { scene } = G;
  const packs = [];
  const probe = { x: 0, y: 0.9, z: 0 };   // reused flashlight probe point

  function homeOf(cave) {
    // patrol ground: the open clearing in front of the cave mouth
    if (cave.clearing) return { x: cave.clearing.x, z: cave.clearing.z, r: cave.clearing.r || 9 };
    const e = cave.entrance || cave, dx = e.x - cave.x, dz = e.z - cave.z, l = Math.hypot(dx, dz) || 1;
    return { x: e.x + dx / l * 6, z: e.z + dz / l * 6, r: 9 };
  }

  function makePack(cave, idx) {
    const n = cave.id === 'wolf1' ? 4 : 5;
    const pack = { id: cave.id, cave, home: homeOf(cave), wolves: [], active: false, forced: false, alerted: false, cleared: false, attacker: null, attackCD: 2, howlT: 8 + Math.random() * 10, calmT: 0 };
    for (let i = 0; i < n; i++) {
      const parts = buildWolf(K, scene, PALS[(idx + i) % PALS.length], 0.95 + Math.random() * 0.14 + (i === 0 ? 0.08 : 0));
      const w = Object.assign(parts, { pack, i, pos: new THREE.Vector3(), heading: Math.random() * 6.28, hp: HP, maxHp: HP, state: 'dormant', stateT: 0, t: Math.random() * 9,
        walk: 0, speed: 0, flash: 0, barT: 0, blinkT: 2, stagger: 0, target: { x: 0, z: 0 }, ring: 6.5 + i * 0.55, dir: i % 2 ? 1 : -1, cool: 0,
        lx: 0, lz: 1, lungeLeft: 0, bit: false, howl: 0, crouch: 0, dist: 999, visible: true });
      w.radius = 0.6;
      w.canHit = () => w.state !== 'dead' && w.root.visible;
      w.hurt = (dmg, from) => hurt(w, dmg, from);
      K.addTarget(w);
      pack.wolves.push(w);
    }
    placeAtHome(pack);
    return pack;
  }
  function placeAtHome(pack) {
    pack.home = homeOf(pack.cave);
    for (const w of pack.wolves) {
      const a = w.i / pack.wolves.length * 6.28 + Math.random() * 0.5, r = 2.5 + Math.random() * 5;
      w.pos.set(pack.home.x + Math.cos(a) * r, 0, pack.home.z + Math.sin(a) * r); G.world.collide(w.pos, 0.45);
      w.target.x = w.pos.x; w.target.z = w.pos.z;
    }
  }
  const setState = (w, s) => { if (w.state !== s) { w.state = s; w.stateT = 0; } };
  const release = (w) => { const p = w.pack; if (p.attacker === w) { p.attacker = null; p.attackCD = (K.night() ? 1.1 : 1.6) + Math.random() * 1.0; } };

  function alertPack(pack, w) {
    if (pack.alerted || !pack.active) return;   // a sleeping pack behind the fog never hunts
    pack.alerted = true; pack.attackCD = 1.6; pack.calmT = 0;
    K.emit('wolfHowl', { x: w.pos.x, z: w.pos.z, caveId: pack.id, alert: true });
    w.howl = 1.4;
    for (const o of pack.wolves) if (o.state !== 'dead') setState(o, 'circle');
  }
  function calmPack(pack) {
    pack.alerted = false; pack.attacker = null;
    for (const o of pack.wolves) if (o.state !== 'dead') setState(o, 'return');
  }

  function hurt(w, dmg, from) {
    if (w.state === 'dead') return;
    w.hp -= dmg; w.flash = 1; w.barT = 5;
    const dx = w.pos.x - from.x, dz = w.pos.z - from.z, l = Math.hypot(dx, dz) || 1;
    w.pos.x += dx / l * 0.9; w.pos.z += dz / l * 0.9;
    release(w);
    if (w.hp <= 0) { die(w); return; }
    K.emit('wolfHurt', { x: w.pos.x, z: w.pos.z, hp: w.hp });
    w.stagger = 0.45; setState(w, 'retreat'); w.cool = 2.5;
    if (!w.pack.alerted) alertPack(w.pack, w);
  }
  function die(w, quiet = false) {
    const pack = w.pack;
    w.hp = 0; setState(w, 'dead'); release(w); w.barT = 0;
    K.emit('wolfDie', { x: w.pos.x, z: w.pos.z, caveId: pack.id });
    G.survival?.spawnMeat?.(w.pos.x, w.pos.z, 1);
    if (!pack.alerted && !quiet) alertPack(pack, w);
    if (!pack.cleared && pack.wolves.every(o => o.state === 'dead')) {
      pack.cleared = true; pack.alerted = false;
      K.emit('guardiansCleared', { caveId: pack.id, x: w.pos.x, z: w.pos.z });   // progression drops the key and says so
    } else if (!quiet) { const left = pack.wolves.filter(o => o.state !== 'dead').length; K.toast(left === 1 ? 'A wolf falls. One left: it carries the key.' : `A wolf falls. ${left} left in the pack.`, 2); }
  }

  function updateWolf(w, pack, dt, P, night, safe, active) {
    w.t += dt; w.stateT += dt; w.speed = 0;
    w.flash = Math.max(0, w.flash - dt * 3); w.barT = Math.max(0, w.barT - dt); w.cool -= dt; w.howl = Math.max(0, w.howl - dt);
    w.stagger = Math.max(0, w.stagger - dt);
    const dist = w.dist = Math.hypot(P.x - w.pos.x, P.z - w.pos.z);
    const notice = night ? NOTICE_NIGHT : NOTICE_DAY;
    if (w.state === 'dead') return;
    if (w.stagger > 0) { /* flinch in place */ }
    else switch (w.state) {
      case 'dormant':
        if (active) setState(w, 'pause');
        break;
      case 'patrol':
        if (K.moveToward(w, w.target.x, w.target.z, 1.7, dt) < 1 || w.stateT > 14) setState(w, 'pause');
        break;
      case 'pause':
        if (w.stateT > 2.5 + (w.i % 3) * 1.3) {
          const a = Math.random() * 6.28, r = 2 + Math.random() * (pack.home.r + 2);
          w.target.x = pack.home.x + Math.cos(a) * r; w.target.z = pack.home.z + Math.sin(a) * r; setState(w, 'patrol');
        }
        break;
      case 'circle': {
        // orbit the player just out of reach, eyes always on you
        const a = Math.atan2(w.pos.z - P.z, w.pos.x - P.x) + w.dir * dt * 0.6;
        const R = w.ring + Math.sin(w.t * 0.7 + w.i) * 0.8;
        K.moveToward(w, P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, dist > R + 5 ? 7.6 : 4.2, dt, 6);
        if (dist < R + 2) K.faceToward(w, P.x, P.z, dt, 3);
        break; }
      case 'approach': // the one chosen wolf walks in, head low
        K.moveToward(w, P.x, P.z, 6.4, dt, 7);
        if (dist < 4.1) { setState(w, 'windup'); K.emit('wolfSnarl', { x: w.pos.x, z: w.pos.z }); }
        else if (w.stateT > 3.2) { release(w); setState(w, 'circle'); }
        break;
      case 'windup': { // stops dead, crouches, hackles up, fangs bared, eyes flare: the dodge cue
        K.faceToward(w, P.x, P.z, dt, 9);
        if (dist < 2.6) K.moveToward(w, w.pos.x - (P.x - w.pos.x), w.pos.z - (P.z - w.pos.z), 1.2, dt, 0); // edge back a touch
        if (w.stateT > (night ? WINDUP - 0.06 : WINDUP)) {
          const dx = P.x - w.pos.x, dz = P.z - w.pos.z, l = Math.hypot(dx, dz) || 1;
          w.lx = dx / l; w.lz = dz / l; w.heading = Math.atan2(dx, dz); w.lungeLeft = l + 1.1; w.bit = false; setState(w, 'lunge');
        }
        break; }
      case 'lunge': { // a straight, committed line: no steering
        const s = Math.min(w.lungeLeft, LUNGE_SPEED * dt); w.pos.x += w.lx * s; w.pos.z += w.lz * s; w.lungeLeft -= s; w.speed = LUNGE_SPEED;
        if (!w.bit && dist < BITE_R) {
          w.bit = true;
          G.survival.damage(night ? 12 : 9, 'the Wolves', w.pos);
          K.emit('wolfBite', { x: w.pos.x, z: w.pos.z });
          G.controls.shake = Math.max(G.controls.shake, 0.3);
        }
        if (w.lungeLeft <= 0.01 || w.stateT > 0.5) { if (!w.bit) K.emit('wolfMiss', { x: w.pos.x, z: w.pos.z }); setState(w, 'retreat'); w.cool = 1.5; }
        break; }
      case 'retreat': {
        release(w);
        const dx = w.pos.x - P.x, dz = w.pos.z - P.z, l = Math.hypot(dx, dz) || 1;
        K.moveToward(w, w.pos.x + dx / l * 4, w.pos.z + dz / l * 4, 5.6, dt, 7);
        if (w.stateT > 1.1 || dist > w.ring + 1) setState(w, pack.alerted ? 'circle' : 'return');
        break; }
      case 'return':
        if (K.moveToward(w, pack.home.x, pack.home.z, 6, dt) < 5) setState(w, 'pause');
        break;
    }
    // notice the player
    if (active && K.playing() && !pack.alerted && !safe && (w.state === 'patrol' || w.state === 'pause') && dist < notice
      && Math.hypot(P.x - pack.home.x, P.z - pack.home.z) < LEASH + 4) alertPack(pack, w);
    // the flashlight makes a wolf that is coming for you shy away at night
    if (night && (w.state === 'approach' || w.state === 'windup') && dist < 16 && (probe.x = w.pos.x, probe.z = w.pos.z, G.flashlight.isLighting(probe))) {
      release(w); setState(w, 'retreat'); w.cool = 3; K.emit('wolfHurt', { x: w.pos.x, z: w.pos.z, shy: true });
    }
    // leash around the cave, keep out of the fire light, stay on open land
    const hx = w.pos.x - pack.home.x, hz = w.pos.z - pack.home.z, hl = Math.hypot(hx, hz);
    if (hl > LEASH + 6) { w.pos.x = pack.home.x + hx / hl * (LEASH + 6); w.pos.z = pack.home.z + hz / hl * (LEASH + 6); }
    K.fireAvoid(w.pos, 2);
    G.world.collide(w.pos, 0.45);
    if (active && !pack.forced) { const lr = K.landR() - 1.5, r = Math.hypot(w.pos.x, w.pos.z); if (r > lr) { w.pos.x *= lr / r; w.pos.z *= lr / r; } }
  }

  function poseWolf(w, dt, dk) {
    const { root, body, head, jaw, legs, tail, hackles } = w;
    root.position.set(w.pos.x, 0, w.pos.z); root.rotation.y = w.heading;
    if (w.state === 'dead') {
      body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + dt * 5); body.position.y = Math.max(-0.35, body.position.y - dt * 2);
      root.position.y = -Math.max(0, w.stateT - 8) * 0.25;
      w.eyePair.coreMat.opacity = Math.max(0, w.eyePair.coreMat.opacity - dt); w.eyePair.haloMat.opacity = Math.min(w.eyePair.haloMat.opacity, w.eyePair.coreMat.opacity * 0.5);
      w.rimMat.opacity = Math.max(0, w.rimMat.opacity - dt); w.rimMat.visible = w.rimMat.opacity > 0.01;
      w.barBg.visible = w.barFg.visible = false;
      if (w.stateT > 13) root.visible = false;
      return;
    }
    body.rotation.z = 0;
    const lying = w.state === 'dormant';
    const wantCrouch = w.state === 'windup' ? Math.min(1, w.stateT * 6) : w.state === 'lunge' ? 0.35 : w.state === 'approach' ? 0.3 : 0;
    w.crouch += (wantCrouch - w.crouch) * Math.min(1, dt * 12);
    const run = w.speed > 5, k = Math.min(1, w.speed / 3);
    w.walk += dt * w.speed * (run ? 2.0 : 2.6);
    const sw = Math.sin(w.walk) * (run ? 0.85 : 0.5) * k;
    if (lying) { body.position.y += (-0.38 - body.position.y) * Math.min(1, dt * 4); legs[0].rotation.x = legs[1].rotation.x = -1.35; legs[2].rotation.x = legs[3].rotation.x = 1.35; }
    else {
      const bob = Math.abs(Math.sin(w.walk)) * (run ? 0.12 : 0.04) * k;
      body.position.y += (bob - w.crouch * 0.2 - body.position.y) * Math.min(1, dt * 14);
      if (w.state === 'lunge') { legs[0].rotation.x = legs[1].rotation.x = -1.0; legs[2].rotation.x = legs[3].rotation.x = 0.9; }
      else if (run) { legs[0].rotation.x = legs[1].rotation.x = sw; legs[2].rotation.x = legs[3].rotation.x = -sw; }
      else { legs[0].rotation.x = legs[3].rotation.x = sw; legs[1].rotation.x = legs[2].rotation.x = -sw; }
      if (w.crouch > 0.05 && w.state !== 'lunge') { legs[0].rotation.x = -0.35 * w.crouch; legs[1].rotation.x = -0.35 * w.crouch; legs[2].rotation.x = legs[3].rotation.x = 0.5 * w.crouch; }
    }
    body.rotation.x = w.stagger > 0 ? -0.22 : w.crouch * 0.1;
    const alert = w.pack.alerted;
    const sniff = w.state === 'pause' || w.state === 'patrol' ? 0.35 + Math.sin(w.t * 2.2 + w.i) * 0.12 : 0;
    head.rotation.x = w.howl > 0 ? -0.9 : lying ? 0.45 : sniff + w.crouch * 0.25 + (w.state === 'lunge' ? 0.15 : 0);
    head.rotation.y = !alert && !lying ? Math.sin(w.t * 0.6 + w.i) * 0.35 : 0;
    jaw.rotation.x = w.howl > 0 ? 0.45 : w.state === 'windup' ? 0.48 + Math.sin(w.t * 34) * 0.06 : w.state === 'lunge' ? 0.75 : alert ? 0.12 : 0.03;
    hackles.scale.y = 1 + w.crouch * 1.8 + (alert ? 0.4 : 0);
    tail.rotation.x = alert ? -0.25 - w.crouch * 0.2 : lying ? -1.1 : -0.75;
    tail.rotation.y = Math.sin(w.t * (alert ? 6 : 2)) * (alert ? 0.12 : 0.25);
    // eyeshine: amber, flaring orange on the telegraph; slow blinks
    w.blinkT -= dt; if (w.blinkT < -0.15) w.blinkT = 2 + Math.random() * 4;
    const rage = w.state === 'windup' || w.state === 'lunge' ? 1 : 0;
    const focus = alert ? 1 : lying ? 0.0 : 0.55;
    K.eyes(w.eyePair, w.dist, Math.min(1, dk * 1.5) * focus, rage ? EYE_RAGE : EYE_CALM, w.blinkT < 0 && !rage ? 0.12 : 1, rage ? 1.5 : 1.2);
    // moonlit rim on the silhouette; hot on the telegraph
    const nightA = Math.min(1, dk * 1.3) * (0.2 * (alert ? 1 : 0.6) + w.crouch * 0.6);
    // by day the same shell is a soft dark contour, so a gray wolf still reads against gray rock and bark
    const dayA = (1 - Math.min(1, dk * 1.6)) * (alert ? 0.5 + w.crouch * 0.3 : 0.3) * (w.dist < 60 ? 1 : 0);
    const rimA = Math.max(nightA, dayA);
    w.rimMat.opacity = rimA; w.rimMat.visible = rimA > 0.01;
    if (w.rimMat.visible) { w.rimMat.userData.setDist(w.dist); if (nightA >= dayA) w.rimMat.color.copy(RIM_CALM).lerp(RIM_RAGE, w.crouch); else w.rimMat.color.copy(DAY_LINE).lerp(RIM_RAGE, w.crouch * 0.35); }
    nightFog(w.allMats, dk);
    const fill = dk * (0.014 + w.crouch * 0.02);
    for (const m of w.furMats) m.emissive.setRGB(w.flash * 0.55 + fill * 0.8, w.flash * 0.055 + fill * 0.85, w.flash * 0.044 + fill * 1.15);
    const showBar = w.barT > 0;
    w.barBg.visible = w.barFg.visible = showBar;
    if (showBar) w.barFg.scale.x = 1.04 * Math.max(0, w.hp / w.maxHp);
  }

  const caves = cr.caves().filter(c => c.type === 'wolf');
  caves.forEach((c, i) => packs.push(makePack(c, i)));

  const W = {
    packs,
    update(dt) {
      if (G.mode === 'title') return;
      const P = G.controls.pos, night = K.night(), safe = K.playerSafe(), dk = K.dark(), fl = K.fireLevel();
      for (const pack of packs) {
        // progression may publish real cave records after us: re-anchor the pack while it is still asleep
        const cave = cr.cave(pack.id);
        if (cave && cave !== pack.cave) { pack.cave = cave; if (!pack.alerted) placeAtHome(pack); }
        const active = pack.forced || fl >= (pack.cave.level || 2);
        if (active && !pack.active && night) pack.howlT = Math.min(pack.howlT, 4);
        pack.active = active;
        const pd = Math.hypot(P.x - pack.home.x, P.z - pack.home.z);
        if (pd > CULL + 20 && !pack.alerted) { for (const w of pack.wolves) w.root.visible = false; continue; }   // cheap: far packs don't think
        pack.attackCD -= dt;
        if (pack.alerted) {
          // give up: player left the leash or is standing in the fire's light
          if (Math.hypot(P.x - pack.home.x, P.z - pack.home.z) > LEASH + 10 || !K.playing()) calmPack(pack);
          else if (safe) { pack.calmT += dt; if (pack.calmT > 1.2) calmPack(pack); } else pack.calmT = 0;
        }
        for (const w of pack.wolves) {
          updateWolf(w, pack, dt, P, night, safe, active);
          w.root.visible = w.state === 'dead' ? w.stateT < 13 : w.dist < CULL;
          if (w.root.visible) poseWolf(w, dt, dk);
        }
        // one attacker at a time: pick the closest ready circling wolf
        if (pack.alerted && !pack.attacker && pack.attackCD <= 0 && !safe) {
          let best = null;
          for (const w of pack.wolves) if (w.state === 'circle' && w.cool <= 0 && w.dist < 12 && (!best || w.dist < best.dist)) best = w;
          if (best) { pack.attacker = best; setState(best, 'approach'); }
        }
        const a = pack.attacker;
        if (a && (a.state === 'approach' || a.state === 'windup') && a.dist < 12 && K.offScreen(a.pos.x, a.pos.z)) K.wantLook(a.pos.x, a.pos.z, 3.5);
        if (a && (a.state === 'windup' || a.state === 'lunge') && a.dist < 7) K.fade = 1;
        // wolves separate a little so the circle reads as a pack, not a blob
        const ws = pack.wolves;
        for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
          const p = ws[i], q = ws[j]; if (p.state === 'dead' || q.state === 'dead') continue;
          const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, d2 = dx * dx + dz * dz;
          if (d2 < 1.3 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (1.14 - d) * 0.5 / d; p.pos.x -= dx * push; p.pos.z -= dz * push; q.pos.x += dx * push; q.pos.z += dz * push; }
        }
        // ambient howls at night from an open pack
        if (active && night && !pack.cleared && !pack.alerted && pd < 110 && K.playing()) {
          pack.howlT -= dt;
          if (pack.howlT <= 0) {
            pack.howlT = 22 + Math.random() * 26;
            const alive = ws.filter(w => w.state !== 'dead'); const w = alive[Math.floor(Math.random() * alive.length)];
            if (w) { w.howl = 2.2; K.emit('wolfHowl', { x: w.pos.x, z: w.pos.z, caveId: pack.id }); }
          }
        }
      }
    },
    threatAt(p) {
      let th = 0;
      for (const pack of packs) {
        if (!pack.alerted) continue;
        for (const w of pack.wolves) {
          if (w.state === 'dead') continue;
          const d = Math.hypot(w.pos.x - p.x, w.pos.z - p.z), hot = w.state === 'approach' || w.state === 'windup' || w.state === 'lunge';
          th = Math.max(th, (1 - d / 28) * (hot ? 1.05 : 0.75));
        }
      }
      return Math.max(0, th);
    },
    pack: (id) => packs.find(p => p.id === id),
    // debug: (re)spawn a pack at its cave, active regardless of fire level
    spawn(id) {
      const pack = W.pack(id); if (!pack) return null;
      pack.forced = true; pack.cleared = false; pack.alerted = false; pack.attacker = null;
      for (const w of pack.wolves) { w.hp = w.maxHp; w.state = 'pause'; w.stateT = 0; w.root.visible = true; w.root.position.y = 0; w.body.rotation.set(0, 0, 0); w.body.position.y = 0; w.eyePair.coreMat.opacity = 1; }
      placeAtHome(pack);
      return W.summaryOf(pack);
    },
    clear(id) {
      const pack = W.pack(id); if (!pack) return null;
      for (const w of pack.wolves) if (w.state !== 'dead') die(w, true);
      return W.summaryOf(pack);
    },
    summaryOf: (pack) => ({ id: pack.id, active: pack.active, alerted: pack.alerted, cleared: pack.cleared, home: { x: Math.round(pack.home.x), z: Math.round(pack.home.z) },
      wolves: pack.wolves.map(w => ({ state: w.state, hp: w.hp, x: +w.pos.x.toFixed(1), z: +w.pos.z.toFixed(1) })) }),
    summary: () => packs.map(p => W.summaryOf(p)),
  };
  return W;
}
