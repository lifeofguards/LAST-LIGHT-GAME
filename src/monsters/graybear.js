// Gray bears: 4 guard the bear cave (G.progression.caves id 'bear'). They are the brown bear's own rig
// (buildBearRig) recoloured gray and a little bigger, with the brown bear's daytime behaviour: notice -> growl,
// rear up and roar (the telegraph) -> charge -> raking swipe -> back off. Only one charges at a time; the others
// pace and growl. The last one emits guardiansCleared {caveId:'bear'}.
// The gray Alpha: a huge silver bear asleep in the cave chamber. After caveUnlocked {caveId:'bear'} it wakes when
// the player comes in, shows a boss health bar, and fights inside its chamber (enrages at half health). Its death
// emits alphaDead {x,z}.
import * as THREE from '../../vendor/three.module.js';
import { buildBearRig, nightFog } from './bear.js';

const GRAY = { fur: '#77797b', fur2: '#55585b', snout: '#b3aca0', rim: '#a9bedf', eye: '#c8ff7a' };
const ALPHA = { fur: '#8b8e91', fur2: '#4c4f53', snout: '#c4bdb0', rim: '#bcd0ee', eye: '#ff9a3a' };
const EYE_STALK = new THREE.Color('#c8ff7a'), EYE_RAGE = new THREE.Color('#ffb03a'), EYE_ALPHA = new THREE.Color('#ff8a2a'), EYE_ALPHA_RAGE = new THREE.Color('#ff3b1a');
const RIM_CALM = new THREE.Color('#a9bedf'), RIM_RAGE = new THREE.Color('#ffc890');
const ATTACKING = new Set(['rear', 'charge', 'swipe']);
const GRAY_HP = 125, ALPHA_HP = 450, NOTICE_DAY = 16, NOTICE_NIGHT = 20, LEASH = 42, CULL = 125;

export function createGrayBears(G, cr, K) {
  const { scene } = G;
  const group = { alerted: false, attacker: null, attackCD: 0, cleared: false, forced: false, cave: cr.cave('bear'), home: { x: 0, z: 0 }, calmT: 0 };
  const bears = [];

  function makeBear(pal, scale, extra) {
    const R = buildBearRig(scene, { ...pal, extra });
    R.root.scale.setScalar(scale);
    const o = K.optimize(R.root, { rim: pal.rim, strip: R.rimMat });   // same rig, merged per part (far fewer draw calls)
    R.rimMat = o.rimMat; R.furMats = [o.mat]; R.allBearMats = [o.mat];
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#1a0d0d', depthTest: false, fog: false, transparent: true, opacity: 0.75 }));
    const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#e0463a', depthTest: false, fog: false, transparent: true }));
    barBg.center.set(0, 0.5); barFg.center.set(0, 0.5); barBg.renderOrder = 998; barFg.renderOrder = 999;
    barBg.scale.set(1.9, 0.2, 1); barFg.scale.set(1.8, 0.12, 1); R.root.add(barBg, barFg); barBg.visible = barFg.visible = false;
    return Object.assign(R, { barBg, barFg, pos: new THREE.Vector3(), heading: Math.random() * 6.28, state: 'guard', stateT: 0, t: Math.random() * 9, walk: 0, speed: 0,
      rear: 0, flash: 0, barT: 0, blinkT: 2, stagger: 0, hitDone: false, target: { x: 0, z: 0 }, dist: 999, scale, growlT: 3 + Math.random() * 4 });
  }
  const setState = (b, s) => { if (b.state !== s) { b.state = s; b.stateT = 0; b.hitDone = false; } };

  // ---------------- the four gray guardians ----------------
  function homeOf(cave) {
    if (cave.clearing) return { x: cave.clearing.x, z: cave.clearing.z };
    const e = cave.entrance || cave, dx = e.x - cave.x, dz = e.z - cave.z, l = Math.hypot(dx, dz) || 1;
    return { x: e.x + dx / l * 8, z: e.z + dz / l * 8 };
  }
  function placeGuards() {
    group.home = homeOf(group.cave);
    bears.forEach((b, i) => {
      const a = i / bears.length * 6.28 + 0.4, r = 5 + (i % 2) * 4;
      b.pos.set(group.home.x + Math.cos(a) * r, 0, group.home.z + Math.sin(a) * r); G.world.collide(b.pos, 1.0);
      b.target.x = b.pos.x; b.target.z = b.pos.z;
    });
  }
  for (let i = 0; i < 4; i++) {
    const b = makeBear(GRAY, 1.12 + i * 0.03);
    b.i = i; b.hp = b.maxHp = GRAY_HP; b.radius = 1.0;
    b.canHit = () => b.state !== 'dead' && b.root.visible;
    b.hurt = (dmg, from) => hurtGray(b, dmg, from);
    K.addTarget(b); bears.push(b);
  }
  placeGuards();
  const release = (b) => { if (group.attacker === b) { group.attacker = null; group.attackCD = 1.2 + Math.random() * 1.5; } };
  function alertGroup(b) {
    if (group.alerted) return;
    group.alerted = true; group.attackCD = 0.6; group.calmT = 0;
    for (const o of bears) if (o.state !== 'dead' && o !== b) setState(o, 'notice');
  }
  function calmGroup() { group.alerted = false; group.attacker = null; for (const o of bears) if (o.state !== 'dead') setState(o, 'return'); }
  function hurtGray(b, dmg, from) {
    if (b.state === 'dead') return;
    b.hp -= dmg; b.stagger = 0.5; b.flash = 1; b.barT = 5;
    const dx = b.pos.x - from.x, dz = b.pos.z - from.z, l = Math.hypot(dx, dz) || 1; b.pos.x += dx / l * 0.6; b.pos.z += dz / l * 0.6;
    G.events.emit('bearHit', { hp: b.hp, gray: true });
    if (b.hp <= 0) { dieGray(b); return; }
    release(b); setState(b, 'backoff'); alertGroup(b);
  }
  function dieGray(b) {
    b.hp = 0; release(b); setState(b, 'dead'); b.barT = 0;
    K.emit('grayBearDie', { x: b.pos.x, z: b.pos.z });
    G.survival?.spawnMeat?.(b.pos.x, b.pos.z, 2);
    if (!group.cleared && bears.every(o => o.state === 'dead')) {
      group.cleared = true; group.alerted = false;
      K.emit('guardiansCleared', { caveId: 'bear', x: b.pos.x, z: b.pos.z });   // progression drops the key and says so
    } else { const left = bears.filter(o => o.state !== 'dead').length; K.toast(`A gray bear falls. ${left} left.`, 2); }
  }

  function updateGray(b, dt, P, night, safe, active) {
    b.t += dt; b.stateT += dt; b.speed = 0;
    b.stagger = Math.max(0, b.stagger - dt); b.flash = Math.max(0, b.flash - dt * 3); b.barT = Math.max(0, b.barT - dt);
    const dist = b.dist = Math.hypot(P.x - b.pos.x, P.z - b.pos.z);
    if (b.state === 'dead') return;
    if (b.stagger > 0) { /* flinch */ }
    else switch (b.state) {
      case 'guard':
        if (K.moveToward(b, b.target.x, b.target.z, 1.4, dt) < 1.5 || b.stateT > 20) {
          const a = Math.random() * 6.28, r = 3 + Math.random() * 11; b.target.x = group.home.x + Math.cos(a) * r; b.target.z = group.home.z + Math.sin(a) * r; b.stateT = 0;
        }
        if (active && K.playing() && !safe && dist < (night ? NOTICE_NIGHT : NOTICE_DAY) && Math.hypot(P.x - group.home.x, P.z - group.home.z) < LEASH) {
          setState(b, 'notice'); K.emit('bearGrowl', { x: b.pos.x, z: b.pos.z, dist, gray: true }); alertGroup(b);
        }
        break;
      case 'notice':
        K.faceToward(b, P.x, P.z, dt);
        if (b.stateT > 1.2) setState(b, 'pace');
        break;
      case 'pace': { // hold ~11 m off, sidestepping and growling, until it's this bear's turn
        const a = Math.atan2(b.pos.z - P.z, b.pos.x - P.x) + (b.i % 2 ? 1 : -1) * dt * 0.18, R = 10.5 + (b.i % 2) * 2;
        K.moveToward(b, P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, dist > R + 6 ? 5 : 2.0, dt);
        if (dist < R + 3) K.faceToward(b, P.x, P.z, dt, 3);
        b.growlT -= dt; if (b.growlT <= 0 && dist < 26) { b.growlT = 4 + Math.random() * 5; K.emit('bearGrowl', { x: b.pos.x, z: b.pos.z, dist, gray: true }); }
        break; }
      case 'rear':
        K.faceToward(b, P.x, P.z, dt, 8);
        if (b.stateT < dt * 1.5) K.emit('grayBearRoar', { x: b.pos.x, z: b.pos.z, dist });
        if (b.stateT > 1.45) setState(b, safe ? 'backoff' : 'charge');
        break;
      case 'charge':
        if (safe) { setState(b, 'backoff'); break; }
        K.moveToward(b, P.x, P.z, b.stateT < 0.4 ? 5 : 8.0, dt, 3);
        if (dist < 3.4) { setState(b, 'swipe'); K.emit('bearGrowl', { x: b.pos.x, z: b.pos.z, dist, gray: true }); }
        else if (dist > 30 || b.stateT > 6) setState(b, 'backoff');
        break;
      case 'swipe':
        if (safe) { setState(b, 'backoff'); break; }
        K.faceToward(b, P.x, P.z, dt, 8);
        if (dist > 3.2 && b.stateT < 0.4) K.moveToward(b, P.x, P.z, 2.5, dt, 8);
        if (b.stateT > 0.42 && !b.hitDone) {
          b.hitDone = true;
          const kx = P.x - b.pos.x, kz = P.z - b.pos.z, kl = Math.hypot(kx, kz) || 1, fwd = (Math.sin(b.heading) * kx + Math.cos(b.heading) * kz) / kl;
          if (dist < 4.1 && fwd > 0.3) {
            G.survival.damage(24, 'a Gray Bear', b.pos);
            const c = G.controls; c.vel.x += kx / kl * 12; c.vel.z += kz / kl * 12; c.vel.y = 4.5; c.grounded = false; c.shake = Math.max(c.shake, 0.45);
            K.emit('bearSwipe', { gray: true });
          } else K.emit('bearMiss', { gray: true });
        }
        if (b.stateT > 0.95) setState(b, 'backoff');
        break;
      case 'backoff': {
        release(b);
        const dx = b.pos.x - P.x, dz = b.pos.z - P.z, l = Math.hypot(dx, dz) || 1;
        K.moveToward(b, b.pos.x + dx / l * 5, b.pos.z + dz / l * 5, 4.5, dt);
        if (b.stateT > 3) setState(b, group.alerted ? 'pace' : 'return');
        break; }
      case 'return':
        if (K.moveToward(b, group.home.x, group.home.z, 4, dt) < 6) setState(b, 'guard');
        break;
    }
    const hx = b.pos.x - group.home.x, hz = b.pos.z - group.home.z, hl = Math.hypot(hx, hz);
    if (hl > LEASH + 6) { b.pos.x = group.home.x + hx / hl * (LEASH + 6); b.pos.z = group.home.z + hz / hl * (LEASH + 6); }
    K.fireAvoid(b.pos, 2);
    G.world.collide(b.pos, 1.0);
    if (active && !group.forced) { const lr = K.landR() - 2, r = Math.hypot(b.pos.x, b.pos.z); if (r > lr) { b.pos.x *= lr / r; b.pos.z *= lr / r; } }
  }

  // ---------------- the gray Alpha ----------------
  const alpha = makeBear(ALPHA, 1.8, ({ body, head, box, mats }) => {
    const scar = K.mat('#d9d2c4'), dark = mats.fur2;
    body.add(box(1.45, 0.4, 1.2, dark, 0, 2.02, 0.35));          // heavy mane over the hump
    head.add(box(0.06, 0.32, 0.03, scar, 0.22, 0.12, 0.605));     // scar across the right eye
    body.add(box(0.03, 0.5, 0.7, scar, 0.66, 1.35, 0.2));         // claw scars on the flank
    body.add(box(0.03, 0.42, 0.6, scar, 0.66, 1.15, 0.35));
  });
  Object.assign(alpha, { hp: ALPHA_HP, maxHp: ALPHA_HP, radius: 1.7, state: 'sleep', unlocked: false, enraged: false, awake: false, snoreT: 3, deadT: 0, swipes: 0 });
  alpha.canHit = () => alpha.state !== 'dead' && alpha.root.visible;
  alpha.hurt = (dmg, from) => {
    if (alpha.state === 'dead') return;
    alpha.hp -= dmg; alpha.flash = 1;
    const dx = alpha.pos.x - from.x, dz = alpha.pos.z - from.z, l = Math.hypot(dx, dz) || 1; alpha.pos.x += dx / l * 0.25; alpha.pos.z += dz / l * 0.25;
    G.events.emit('bearHit', { hp: alpha.hp, alpha: true });
    if (alpha.state === 'sleep') { wakeAlpha(); return; }
    if (alpha.hp <= 0) {
      alpha.hp = 0; setState(alpha, 'dead'); alpha.deadT = 0;
      K.emit('alphaDead', { x: alpha.pos.x, z: alpha.pos.z });
      G.survival?.spawnMeat?.(alpha.pos.x, alpha.pos.z, 4);
      K.toast('The Gray Alpha falls! It dropped the Mountain Key.', 3.5);
      return;
    }
    if (!alpha.enraged && alpha.hp <= alpha.maxHp * 0.5) { alpha.enraged = true; setState(alpha, 'rear'); return; }
    if (alpha.state === 'stalk' || alpha.state === 'backoff') { alpha.stagger = 0.25; }
  };
  K.addTarget(alpha);
  const chamber = () => { const c = group.cave; return c.interior || c; };
  function placeAlpha() { const c = chamber(); alpha.pos.set(c.x, 0, c.z); const e = group.cave.entrance || group.cave; alpha.heading = Math.atan2(e.x - c.x, e.z - c.z); }
  placeAlpha();
  function wakeAlpha() {
    if (alpha.state !== 'sleep' && alpha.state !== 'guard') return;
    alpha.awake = true; setState(alpha, alpha.state === 'sleep' ? 'wake' : 'stalk'); boss.show();
  }
  G.events.on('caveUnlocked', (e) => { if (e && e.caveId === 'bear') alpha.unlocked = true; });

  function updateAlpha(dt, P, safe) {
    const a = alpha; a.t += dt; a.stateT += dt; a.speed = 0;
    a.flash = Math.max(0, a.flash - dt * 3); a.stagger = Math.max(0, a.stagger - dt);
    const dist = a.dist = Math.hypot(P.x - a.pos.x, P.z - a.pos.z), C = chamber();
    const CHAMBER = Math.max(5, (group.cave.chamberR || 11) - 3);   // the Alpha's body stays clear of the chamber walls
    const pIn = Math.hypot(P.x - C.x, P.z - C.z);
    const fast = a.enraged ? 1.18 : 1;
    if (a.state === 'dead') { a.deadT += dt; if (a.deadT > 2.5) boss.hide(); return; }
    if (a.stagger > 0) { /* flinch */ }
    else switch (a.state) {
      case 'sleep':
        a.snoreT -= dt; if (a.snoreT <= 0) { a.snoreT = 3.6; if (dist < 30) K.emit('alphaSnore', { x: a.pos.x, z: a.pos.z }); }
        if (a.unlocked && K.playing() && (G.progression?.inCave === 'bear' || pIn < CHAMBER + 2)) wakeAlpha();
        break;
      case 'wake': // heaves itself up, then rears and roars
        if (a.stateT > 1.1) K.faceToward(a, P.x, P.z, dt, 3);
        if (a.stateT > 1.4 && !a.hitDone) { a.hitDone = true; K.emit('alphaRoar', { x: a.pos.x, z: a.pos.z }); }
        if (a.stateT > 2.9) setState(a, 'stalk');
        break;
      case 'guard': // player left the chamber: stands over its spot, watching the mouth
        K.moveToward(a, C.x, C.z, 3, dt);
        if (K.playing() && pIn < CHAMBER + 4) { setState(a, 'rear'); boss.show(); }
        break;
      case 'stalk': {
        const ang = Math.atan2(a.pos.z - P.z, a.pos.x - P.x) + dt * 0.35, R = 9;
        let tx = P.x + Math.cos(ang) * R, tz = P.z + Math.sin(ang) * R;
        const cx = tx - C.x, cz = tz - C.z, cl = Math.hypot(cx, cz); if (cl > CHAMBER) { tx = C.x + cx / cl * CHAMBER; tz = C.z + cz / cl * CHAMBER; }
        K.moveToward(a, tx, tz, 3.2 * fast, dt);
        if (dist < 14) K.faceToward(a, P.x, P.z, dt, 3);
        if (a.stateT > (a.enraged ? 1.3 : 2.4) && !safe) setState(a, 'rear');
        break; }
      case 'rear':
        K.faceToward(a, P.x, P.z, dt, 6);
        if (a.stateT < dt * 1.5) K.emit('alphaRoar', { x: a.pos.x, z: a.pos.z, enraged: a.enraged });
        if (a.stateT > (a.enraged ? 1.0 : 1.25)) { a.swipes = 0; setState(a, 'charge'); }
        break;
      case 'charge':
        K.moveToward(a, P.x, P.z, a.stateT < 0.35 ? 5 : 9 * fast, dt, 2.6);
        if (dist < 4.6) setState(a, 'swipe');
        else if (a.stateT > 3.5) setState(a, 'backoff');
        break;
      case 'swipe':
        K.faceToward(a, P.x, P.z, dt, 7);
        if (dist > 4.4 && a.stateT < 0.4) K.moveToward(a, P.x, P.z, 3, dt, 8);
        if (a.stateT > 0.45 && !a.hitDone) {
          a.hitDone = true;
          const kx = P.x - a.pos.x, kz = P.z - a.pos.z, kl = Math.hypot(kx, kz) || 1, fwd = (Math.sin(a.heading) * kx + Math.cos(a.heading) * kz) / kl;
          if (dist < 5.4 && fwd > 0.3) {
            G.survival.damage(32, 'the Gray Alpha', a.pos);
            const c = G.controls; c.vel.x += kx / kl * 14; c.vel.z += kz / kl * 14; c.vel.y = 5; c.grounded = false; c.shake = Math.max(c.shake, 0.55);
            K.emit('bearSwipe', { alpha: true });
          } else K.emit('bearMiss', { alpha: true });
        }
        if (a.stateT > 1.0) { a.swipes++; if (a.enraged && a.swipes < 2 && dist < 6) { a.hitDone = false; a.stateT = 0; } else setState(a, 'backoff'); }
        break;
      case 'backoff': {
        const dx = a.pos.x - P.x, dz = a.pos.z - P.z, l = Math.hypot(dx, dz) || 1;
        K.moveToward(a, a.pos.x + dx / l * 4, a.pos.z + dz / l * 4, 3.6, dt);
        if (a.stateT > (a.enraged ? 1.1 : 1.7)) setState(a, 'stalk');
        break; }
    }
    // the Alpha never leaves its chamber; it waits there if you run
    if (a.awake && a.state !== 'wake' && a.state !== 'guard' && pIn > CHAMBER + 13) { setState(a, 'guard'); boss.hide(); }
    if (a.state !== 'sleep') {
      const cx = a.pos.x - C.x, cz = a.pos.z - C.z, cl = Math.hypot(cx, cz); if (cl > CHAMBER + 0.5) { a.pos.x = C.x + cx / cl * (CHAMBER + 0.5); a.pos.z = C.z + cz / cl * (CHAMBER + 0.5); }
      K.fireAvoid(a.pos, 2);
    }
    if (ATTACKING.has(a.state) && dist < 22 && K.offScreen(a.pos.x, a.pos.z, 0.7)) K.wantLook(a.pos.x, a.pos.z, 5);
    if ((ATTACKING.has(a.state) || a.state === 'wake') && dist < 24) K.fade = 1;
  }

  // ---------------- pose (shared by gray bears and the Alpha; mirrors the brown bear's) ----------------
  function poseBear(b, dt, dk, isAlpha) {
    const { root, rig, body, head, jaw, legs, eyePair, rimMat } = b;
    root.position.set(b.pos.x, 0, b.pos.z); root.rotation.y = b.heading;
    if (b.state === 'dead') {
      body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + dt * 3); rig.rotation.x *= 0.9;
      root.position.y = Math.min(0, -Math.max(0, b.stateT - 8) * 0.3 * b.scale);
      eyePair.coreMat.opacity = Math.max(0, eyePair.coreMat.opacity - dt); eyePair.haloMat.opacity = Math.min(eyePair.haloMat.opacity, eyePair.coreMat.opacity * 0.5);
      rimMat.opacity = Math.max(0, rimMat.opacity - dt); rimMat.visible = rimMat.opacity > 0.01; b.barBg.visible = b.barFg.visible = false;
      if (b.stateT > 14) root.visible = false;
      return;
    }
    // asleep (or still getting up): curled low, legs tucked, slow breathing, eyes shut
    const sleepK = b.state === 'sleep' ? 1 : b.state === 'wake' ? Math.max(0, 1 - b.stateT / 1.1) : 0;
    const wantRear = b.state === 'swipe' ? (b.stateT < 0.42 ? Math.min(0.55, b.stateT * 3) : Math.max(0, 0.55 - (b.stateT - 0.42) * 2))
      : b.state === 'rear' ? Math.min(1, b.stateT * 4) * (b.stateT > 1.25 ? Math.max(0, 1 - (b.stateT - 1.25) * 5) : 1)
      : b.state === 'wake' && b.stateT > 1.2 ? Math.min(1, (b.stateT - 1.2) * 3) * Math.max(0, Math.min(1, (2.6 - b.stateT) * 3)) : 0;
    b.rear += (wantRear - b.rear) * Math.min(1, dt * 10);
    rig.rotation.x = -b.rear * 1.2;
    const charge = b.state === 'charge';
    b.walk += dt * b.speed * (charge ? 2.3 : 1.6) / b.scale;
    const amp = Math.min(1, b.speed / 3) * (charge ? 0.9 : 0.6), sw = Math.sin(b.walk) * amp;
    legs[0].rotation.z = legs[1].rotation.z = 0;
    if (sleepK > 0.01) { legs[0].rotation.x = legs[1].rotation.x = -1.45 * sleepK; legs[2].rotation.x = legs[3].rotation.x = 1.45 * sleepK; }
    else if (b.rear > 0.05 && b.state !== 'swipe') { legs[0].rotation.x = legs[1].rotation.x = -1.1 * b.rear + Math.sin(b.t * 14) * 0.18 * b.rear; legs[0].rotation.z = -0.55 * b.rear; legs[1].rotation.z = 0.55 * b.rear; legs[2].rotation.x = legs[3].rotation.x = 1.15 * b.rear; }
    else if (b.state === 'swipe') { const s2 = b.stateT < 0.42 ? 0 : Math.min(1, (b.stateT - 0.42) / 0.12); legs[0].rotation.x = -2.2 * (1 - s2) + 0.5 * s2; legs[0].rotation.z = -0.7 * (1 - s2) + 0.6 * s2; legs[1].rotation.x = -0.5; }
    else if (charge) { legs[0].rotation.x = sw; legs[1].rotation.x = sw; legs[2].rotation.x = -sw; legs[3].rotation.x = -sw; }
    else { legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw; }
    body.position.y = -0.62 * sleepK + Math.abs(Math.sin(b.walk)) * (charge ? 0.18 : 0.06) * Math.min(1, b.speed / 3);
    body.rotation.z = 0.1 * sleepK;
    const breathe = sleepK > 0 ? 1 + Math.sin(b.t * 1.4) * 0.03 * sleepK : 1; body.scale.set(1, breathe, 1);
    head.rotation.x = sleepK > 0.01 ? 0.32 * sleepK : charge ? 0.25 : b.rear > 0.1 ? 0.85 * b.rear : b.state === 'notice' ? -0.1 : Math.sin(b.t * 0.8) * 0.08;
    head.rotation.y = b.state === 'guard' || b.state === 'pace' ? Math.sin(b.t * 0.4) * 0.3 : 0;
    jaw.rotation.x = b.state === 'swipe' ? 0.55 : b.state === 'rear' || b.state === 'wake' ? 0.6 * b.rear + 0.05 : charge ? 0.35 : b.state === 'notice' || b.state === 'pace' ? 0.18 + Math.sin(b.t * 20) * 0.04 : 0.02;
    body.rotation.x = b.stagger > 0 ? -0.18 : 0;
    // eyeshine (shut while asleep) and the moonlit rim
    b.blinkT -= dt; if (b.blinkT < -0.15) b.blinkT = 2 + Math.random() * 4;
    const hunting = b.state !== 'guard' && b.state !== 'return' && b.state !== 'sleep';
    const rage = b.state === 'rear' || charge || b.state === 'swipe' ? 1 : 0;
    const eyeA = sleepK > 0.5 ? 0 : isAlpha ? Math.max(0.4, Math.min(1, dk * 1.4)) : Math.min(1, dk * 1.4) * (hunting ? 1 : 0.55);
    const col = isAlpha ? (b.enraged || rage ? EYE_ALPHA_RAGE : EYE_ALPHA) : rage ? EYE_RAGE : EYE_STALK;
    K.eyes(eyePair, b.dist, eyeA, col, b.blinkT < 0 && !rage ? 0.12 : 1, (rage ? 1.35 : 1) * (isAlpha ? 1.3 : 1));
    const rimA = Math.min(1, (isAlpha ? Math.max(dk, 0.7) : dk) * 1.3) * (0.24 * (hunting ? 1 : 0.6) + b.rear * 0.55 + (charge ? 0.2 : 0)) * (1 - sleepK * 0.6);
    rimMat.opacity = rimA; rimMat.visible = rimA > 0.01;
    if (rimMat.visible) { rimMat.userData.setDist(b.dist); rimMat.color.copy(RIM_CALM).lerp(RIM_RAGE, Math.min(1, b.rear * 1.2 + (charge ? 0.5 : 0))); }
    nightFog(b.allBearMats, dk);
    const fill = dk * (0.012 + b.rear * 0.02);
    for (const m of b.furMats) m.emissive.setRGB(b.flash * 0.55 + fill * 0.8, b.flash * 0.055 + fill * 0.85, b.flash * 0.044 + fill * 1.15);
    if (!isAlpha) {
      b.barBg.visible = b.barFg.visible = b.barT > 0;
      if (b.barT > 0) { const y = 2.9 + b.rear * 1.2; b.barBg.position.set(-0.95, y, 0); b.barFg.position.set(-0.9, y, 0); b.barFg.scale.x = 1.8 * Math.max(0, b.hp / b.maxHp); }
    }
  }

  // ---------------- boss health bar (HUD style: dark glass panel, Fredoka, the health-bar gradient) ----------------
  const boss = (() => {
    const el = document.createElement('div');
    el.id = 'bossbar';
    el.style.cssText = 'position:fixed;left:50%;top:172px;transform:translateX(-50%);width:min(460px,80vw);padding:8px 14px 10px;border-radius:14px;background:rgba(12,14,18,.55);border:1px solid rgba(255,255,255,.12);font-family:var(--ui-font);color:#f4efe6;text-align:center;opacity:0;transition:opacity .5s;pointer-events:none;z-index:4';
    el.innerHTML = '<div style="font-weight:700;font-size:16px;letter-spacing:3px;text-shadow:0 2px 0 rgba(0,0,0,.5);margin-bottom:5px">THE GRAY ALPHA</div>'
      + '<div style="position:relative;height:14px;border-radius:8px;background:rgba(0,0,0,.5);overflow:hidden"><div class="chip" style="position:absolute;inset:0;width:100%;background:#fff3c4;opacity:.8;border-radius:8px"></div>'
      + '<div class="fill" style="position:absolute;inset:0;width:100%;background:linear-gradient(90deg,#d63a3a,#ff6b5b);border-radius:8px"></div></div>';
    const fill = el.querySelector('.fill'), chip = el.querySelector('.chip'), title = el.firstChild;
    let on = false, chipV = 1;
    // attached lazily: ui.js rebuilds #ui after creatures are created
    const attach = () => { if (!el.isConnected) (document.getElementById('ui') || document.body).appendChild(el); };
    return {
      show() { attach(); on = true; el.style.opacity = 1; },
      hide() { on = false; el.style.opacity = 0; },
      get on() { return on; },
      update(dt) {
        if (!on) return;
        const v = Math.max(0, alpha.hp / alpha.maxHp); if (v >= chipV) chipV = v; else chipV = Math.max(v, chipV - dt * 0.35);
        fill.style.width = (v * 100).toFixed(1) + '%'; chip.style.width = (chipV * 100).toFixed(1) + '%';
        title.textContent = alpha.state === 'dead' ? 'THE GRAY ALPHA — DEFEATED' : alpha.enraged ? 'THE GRAY ALPHA — ENRAGED' : 'THE GRAY ALPHA';
        if (G.mode !== 'playing') el.style.opacity = 0; else el.style.opacity = 1;
      },
    };
  })();

  const GB = {
    bears, alpha, group,
    update(dt) {
      if (G.mode === 'title') return;
      const cave = cr.cave('bear');
      if (cave && cave !== group.cave) { group.cave = cave; if (!group.alerted) placeGuards(); if (alpha.state === 'sleep') placeAlpha(); }
      const P = G.controls.pos, night = K.night(), safe = K.playerSafe(), dk = K.dark();
      const active = group.forced || K.fireLevel() >= (group.cave.level || 4);
      const pd = Math.hypot(P.x - group.home.x, P.z - group.home.z);
      if (pd < CULL + 30 || group.alerted) {
        group.attackCD -= dt;
        if (group.alerted) {
          if (pd > LEASH + 12 || !K.playing()) calmGroup();
          else if (safe) { group.calmT += dt; if (group.calmT > 1.5) calmGroup(); } else group.calmT = 0;
        }
        for (const b of bears) {
          updateGray(b, dt, P, night, safe, active);
          b.root.visible = b.state === 'dead' ? b.stateT < 14 : b.dist < CULL;
          if (b.root.visible) poseBear(b, dt, dk, false);
        }
        if (group.alerted && !group.attacker && group.attackCD <= 0 && !safe) {
          let best = null; for (const b of bears) if ((b.state === 'pace' || b.state === 'notice') && b.dist < 20 && (!best || b.dist < best.dist)) best = b;
          if (best) { group.attacker = best; setState(best, 'rear'); }
        }
        const a = group.attacker;
        if (a && ATTACKING.has(a.state) && a.dist < 22 && K.offScreen(a.pos.x, a.pos.z, 0.7)) K.wantLook(a.pos.x, a.pos.z, 4.5);
        if (a && ATTACKING.has(a.state) && a.dist < 24) K.fade = 1;
      } else for (const b of bears) b.root.visible = false;
      // the Alpha
      const ad = Math.hypot(P.x - alpha.pos.x, P.z - alpha.pos.z);
      if (ad < CULL || alpha.awake) {
        updateAlpha(dt, P, safe);
        alpha.root.visible = alpha.state === 'dead' ? alpha.stateT < 20 : ad < CULL;
        if (alpha.root.visible) poseBear(alpha, dt, dk, true);
      } else alpha.root.visible = false;
      boss.update(dt);
    },
    threatAt(p) {
      let th = 0;
      for (const b of bears) {
        if (b.state === 'dead' || !group.alerted) continue;
        const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
        th = Math.max(th, (1 - d / 26) * (b.state === 'charge' ? 1.2 : 0.75));
      }
      if (alpha.awake && alpha.state !== 'dead' && alpha.state !== 'guard') th = Math.max(th, 1 - Math.hypot(alpha.pos.x - p.x, alpha.pos.z - p.z) / 40 + 0.25);
      return Math.max(0, th);
    },
    wake() { alpha.unlocked = true; if (alpha.state === 'sleep' || alpha.state === 'guard') wakeAlpha(); return GB.alphaSummary(); },
    spawn() {
      group.forced = true; group.cleared = false; group.alerted = false; group.attacker = null;
      for (const b of bears) { b.hp = b.maxHp; b.state = 'guard'; b.stateT = 0; b.root.visible = true; b.root.position.y = 0; b.body.rotation.set(0, 0, 0); b.eyePair.coreMat.opacity = 1; }
      placeGuards(); return GB.summary();
    },
    clear() { for (const b of bears) if (b.state !== 'dead') dieGray(b); return GB.summary(); },
    alphaSummary: () => ({ state: alpha.state, hp: alpha.hp, enraged: alpha.enraged, unlocked: alpha.unlocked, x: +alpha.pos.x.toFixed(1), z: +alpha.pos.z.toFixed(1), bossBar: boss.on }),
    summary: () => ({ alerted: group.alerted, cleared: group.cleared, home: { x: Math.round(group.home.x), z: Math.round(group.home.z) },
      bears: bears.map(b => ({ state: b.state, hp: b.hp, x: +b.pos.x.toFixed(1), z: +b.pos.z.toFixed(1) })), alpha: GB.alphaSummary() }),
  };
  return GB;
}
