// The Deer: tall gaunt antlered facultative biped. Night only. Stands upright and watches from the tree line,
// goes still when you look at it, drops to all fours to chase (accelerating), telegraphs every lunge
// (bellow -> rear up + jaw open + red eyes -> lunge). Cannot enter the fire's light. The flashlight stuns it
// (diminishing stun, and it gets a little faster each time). Fire out at night = it comes straight for you.
import * as THREE from '../../vendor/three.module.js';
import { addRim, makeEyePair, nightFog } from './bear.js';

export function createDeer(G) {
  const { scene } = G;
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const hide = mat('#3a2a1e'), dark = mat('#17120f'), bone = mat('#cfc3a8'), rib = mat('#2a1f18'), antlerM = mat('#241b15'), gum = mat('#3b0d0d'), tooth = mat('#e8e0cc');
  const allMats = [hide, dark, bone, rib, antlerM], fogMats = [...allMats, gum, tooth];
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b; };
  const root = new THREE.Group(); root.visible = false; scene.add(root);
  const body = new THREE.Group(); root.add(body);
  // legs: digitigrade (thigh, shin, hoof)
  const mkLeg = (x) => {
    const hip = new THREE.Group(); hip.position.set(x, 1.75, 0); body.add(hip);
    hip.add(box(0.22, 0.9, 0.26, hide, 0, -0.4, 0.12));
    const knee = new THREE.Group(); knee.position.set(0, -0.85, 0.2); hip.add(knee);
    knee.add(box(0.12, 0.95, 0.12, dark, 0, -0.45, -0.18)); knee.children[0].rotation.x = 0.35;
    knee.add(box(0.17, 0.14, 0.26, dark, 0, -0.88, -0.28));
    return hip;
  };
  const legL = mkLeg(-0.24), legR = mkLeg(0.24);
  // torso (gaunt, hunched, wide shoulders)
  const torso = new THREE.Group(); torso.position.y = 1.75; torso.rotation.x = 0.28; body.add(torso);
  torso.add(box(0.66, 1.3, 0.36, hide, 0, 0.65, 0));
  torso.add(box(0.95, 0.3, 0.42, hide, 0, 1.2, 0));
  for (let i = 0; i < 4; i++) torso.add(box(0.68, 0.05, 0.38, rib, 0, 0.5 + i * 0.16, 0.005));
  // arms: long, clawed, reaching past the knees
  const mkArm = (x) => { const s = new THREE.Group(); s.position.set(x, 1.22, 0); torso.add(s);
    s.add(box(0.14, 1.1, 0.14, hide, 0, -0.55, 0)); s.add(box(0.1, 0.9, 0.1, dark, 0, -1.5, 0.05));
    for (let k = -1; k <= 1; k++) { const c = box(0.035, 0.34, 0.035, bone, k * 0.045, -2.08, 0.1); c.rotation.x = 0.3; s.add(c); } return s; };
  const armL = mkArm(-0.46), armR = mkArm(0.46);
  // neck + head (long skull, gaping jaw)
  const neck = new THREE.Group(); neck.position.set(0, 1.3, 0.05); neck.rotation.x = 0.45; torso.add(neck);
  neck.add(box(0.17, 0.55, 0.17, hide, 0, 0.25, 0));
  const head = new THREE.Group(); head.position.set(0, 0.55, 0.02); head.rotation.x = -0.5; neck.add(head);
  head.add(box(0.34, 0.32, 0.36, bone, 0, 0.1, 0)); head.add(box(0.2, 0.16, 0.46, bone, 0, 0.06, 0.34)); head.add(box(0.11, 0.07, 0.06, dark, 0, 0.1, 0.58));
  head.add(box(0.3, 0.08, 0.14, hide, -0.26, 0.2, -0.02)); head.add(box(0.3, 0.08, 0.14, hide, 0.26, 0.2, -0.02));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.04, 0.12); head.add(jaw);
  jaw.add(box(0.18, 0.06, 0.46, bone, 0, -0.03, 0.2)); jaw.add(box(0.14, 0.04, 0.4, gum, 0, 0.01, 0.2));
  for (let i = 0; i < 4; i++) { jaw.add(box(0.025, 0.07, 0.025, tooth, -0.06, 0.05, 0.08 + i * 0.1)); jaw.add(box(0.025, 0.07, 0.025, tooth, 0.06, 0.05, 0.08 + i * 0.1)); }
  const mkAntler = (sx) => { const a = new THREE.Group(); a.position.set(sx * 0.11, 0.25, -0.05); a.rotation.z = -sx * 0.5; head.add(a);
    a.add(box(0.06, 0.7, 0.06, antlerM, 0, 0.35, 0)); const b1 = box(0.045, 0.45, 0.045, antlerM, sx * 0.1, 0.55, 0.05); b1.rotation.z = -sx * 0.7; a.add(b1);
    const b2 = box(0.045, 0.4, 0.045, antlerM, -sx * 0.05, 0.8, 0.1); b2.rotation.x = 0.6; a.add(b2);
    const t = new THREE.Group(); t.position.set(0, 0.7, 0); t.rotation.z = sx * 0.6; a.add(t); t.add(box(0.045, 0.6, 0.045, antlerM, 0, 0.3, 0));
    const b3 = box(0.04, 0.35, 0.04, antlerM, sx * 0.08, 0.4, 0); b3.rotation.z = -sx * 0.8; t.add(b3);
    const b4 = box(0.035, 0.3, 0.035, antlerM, -sx * 0.06, 0.55, 0.05); b4.rotation.z = sx * 0.7; t.add(b4); };
  mkAntler(-1); mkAntler(1);
  // eyes: white sclera normally, burning red when it hunts. Glow sprites ignore fog so they read far past the light.
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#fff6d8', fog: false });
  for (const sx of [-1, 1]) { const e = box(0.08, 0.07, 0.02, eyeMat, sx * 0.14, 0.15, 0.185); e.castShadow = false; head.add(e); }
  const eyePair = makeEyePair(head, [-0.15, 0.15], 0.15, 0.25, '#fff0b8');
  const rimMat = addRim(root, '#b9c6dc', 0.028, 0.05);
  const EYE_CALM = new THREE.Color('#fff0b8'), EYE_HUNT = new THREE.Color('#ff2a12'), EYE_STUN = new THREE.Color('#ffffff');
  const eyeWorld = new THREE.Vector3();

  const d = { type: 'deer', root, pos: new THREE.Vector3(0, 0, -200), state: 'hidden', t: 0, stateT: 0, spawnDelay: 0, cooldown: 0, orbit: Math.random() * 6.28,
    stunT: 0, stunCount: 0, speedMul: 1, walk: 0, speed: 0, spotted: false, quad: 0, blinkT: 3, hungry: false, watched: false, flash: 0,
    lungeX: 0, lungeZ: 1, knockT: 0, knockX: 0, knockZ: 0, leapFX: 0, leapFZ: 0, leapTX: 0, leapTZ: 0, hopY: 0 };
  const setState = (s) => { if (d.state !== s) { d.state = s; d.stateT = 0; G.events.emit('deerState', { state: s }); } };
  d.spawn = (dist = 34, near = null) => {
    const p = near || G.controls.pos, a = Math.random() * Math.PI * 2;
    d.pos.set(p.x + Math.cos(a) * dist, 0, p.z + Math.sin(a) * dist);
    const l = Math.hypot(d.pos.x, d.pos.z); if (l > 112) d.pos.multiplyScalar(112 / l);
    root.visible = true; d.orbit = Math.atan2(d.pos.z - G.controls.pos.z, d.pos.x - G.controls.pos.x); d.cooldown = 6; d.spotted = false; setState('stalk');
  };
  d.despawn = () => { root.visible = false; setState('hidden'); d.pos.set(0, 0, -200); };
  G.events.on('nightStart', (n) => { d.spawnDelay = 5 + Math.random() * 4; d.stunCount = 0; d.speedMul = 1 + ((n || 1) - 1) * 0.05; setState('waiting'); });
  G.events.on('dayStart', () => { if (root.visible && d.state !== 'hidden') setState('dawn'); else d.despawn(); });
  G.events.on('win', () => d.despawn());
  G.events.on('gameStart', () => d.despawn());
  // the worst thing that can happen: fire dies at night -> it appears by the fire, hungry, and charges
  G.events.on('fireOut', () => {
    if (G.daynight.phase !== 'night' || G.mode !== 'playing') return;
    const f = G.campfire; if (d.state === 'hidden' || d.state === 'waiting' || Math.hypot(d.pos.x - f.x, d.pos.z - f.z) > 30) d.spawn(14, { x: f.x, z: f.z });
    d.cooldown = 0; setState('approach');
  });

  const moveToward = (tx, tz, speed, dt) => { const dx = tx - d.pos.x, dz = tz - d.pos.z, l = Math.hypot(dx, dz); if (l < 0.05) return l; const s = Math.min(l, speed * dt); d.pos.x += dx / l * s; d.pos.z += dz / l * s; d.speed = speed; return l; };
  const SPRINT = 9; // approx player sprint speed

  d.update = (dt) => {
    d.t += dt; d.stateT += dt; d.speed = 0;
    if (G.mode === 'title') return;
    if (d.state === 'hidden') return;
    if (d.state === 'waiting') { d.spawnDelay -= dt; if (d.spawnDelay <= 0 && G.mode === 'playing') d.spawn(); return; }
    const P = G.controls.pos, fire = G.campfire;
    const fireOut = fire.fuel <= 0;
    const keepOut = fireOut ? 0 : fire.lightRadius() + 1.5;
    const playerSafe = !fireOut && fire.inLight(P, 0.3);
    const dist = Math.hypot(P.x - d.pos.x, P.z - d.pos.z);
    head.updateWorldMatrix(true, false); eyeWorld.set(0, 0.1, 0.1); head.localToWorld(eyeWorld);
    const lit = d.state !== 'dawn' && (G.flashlight.isLighting({ x: d.pos.x, y: 2.3, z: d.pos.z }) || G.flashlight.isLighting(eyeWorld) || G.flashlight.isLighting({ x: d.pos.x, y: 1.2, z: d.pos.z }));
    d.lit = lit;
    // is the player looking at it? (camera forward within ~22 deg) -> uncanny stillness while stalking
    const yaw = G.controls.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    d.watched = dist < 45 && ((d.pos.x - P.x) * fx + (d.pos.z - P.z) * fz) / (dist || 1) > 0.92;
    if (!d.spotted && dist < 26 && d.watched) { d.spotted = true; G.events.emit('deerSpotted'); }
    d.cooldown -= dt; d.flash = Math.max(0, d.flash - dt * 2.5);
    if (lit && !['stunned', 'flee', 'dawn', 'leap'].includes(d.state)) {
      d.stunT = Math.max(0.8, 2.6 - d.stunCount * 0.45); d.stunCount++; d.speedMul = Math.min(1.5, d.speedMul + 0.06); d.flash = 1;
      setState('stunned'); G.events.emit('deerFlinch', { stun: d.stunT }); G.events.emit('deerStunned', { stun: d.stunT, count: d.stunCount });
    }
    if (d.knockT > 0) {
      const k = d.knockT / 0.4; d.knockT = Math.max(0, d.knockT - dt);
      P.x += d.knockX * 17 * k * dt; P.z += d.knockZ * 17 * k * dt; G.world.collide(P, 0.45);
    }
    switch (d.state) {
      case 'stunned':
        if (d.stateT > d.stunT) { if (lit) { setState('flee'); } else { d.cooldown = Math.max(d.cooldown, 2.5); setState(playerSafe ? 'repelled' : 'stalk'); } }
        break;
      case 'repelled': case 'stalk': {
        if (playerSafe && d.state === 'stalk') setState('repelled'); else if (!playerSafe && d.state === 'repelled') setState('stalk');
        d.orbit += dt * 0.12;
        let tx, tz;
        if (playerSafe) { const a = Math.atan2(d.pos.z - fire.z, d.pos.x - fire.x) + Math.sin(d.t * 0.25) * dt * 0.6; const R = keepOut + 1.5 + Math.sin(d.t * 0.4) * 2; tx = fire.x + Math.cos(a) * R; tz = fire.z + Math.sin(a) * R; }
        else { const R = Math.max(14, 22 - d.stateT * 0.4); tx = P.x + Math.cos(d.orbit) * R; tz = P.z + Math.sin(d.orbit) * R; }
        // it goes perfectly still while you look at it (from afar); moves the moment you look away
        if (!(d.watched && dist > 10 && !playerSafe)) moveToward(tx, tz, 2.2, dt);
        const delay = fireOut ? 2 : Math.max(4, 8 - (G.daynight.night || 1) * 0.6);
        if (!playerSafe && d.cooldown <= 0 && d.stateT > delay) { setState('approach'); G.events.emit('deerBellow'); }
        break; }
      case 'approach': {
        if (playerSafe) { setState('repelled'); break; }
        // starts slower than a sprint, accelerates the longer the chase lasts
        const sp = SPRINT * Math.min(1.12, 0.5 + d.stateT * 0.09) * d.speedMul * (fireOut ? 1.15 : 1);
        moveToward(P.x, P.z, sp, dt);
        if (dist < 7) { setState('windup'); G.events.emit('deerScreech'); }
        else if (d.stateT > 14) { d.cooldown = 6; setState('retreat'); }
        break; }
      case 'windup': // rears up, jaw wide, eyes flare: the dodge window
        moveToward(P.x, P.z, 1.5, dt);
        if (playerSafe) { setState('repelled'); break; }
        if (d.stateT > 0.55) { const lx = P.x - d.pos.x, lz = P.z - d.pos.z, ll = Math.hypot(lx, lz); if (ll > 0.01) { d.lungeX = lx / ll; d.lungeZ = lz / ll; } setState('lunge'); }
        break;
      case 'lunge':
        { // strike to just in front of the player, never into them
          const lx = P.x - d.pos.x, lz = P.z - d.pos.z, ll = Math.hypot(lx, lz);
          if (ll > 0.01) { d.lungeX = lx / ll; d.lungeZ = lz / ll; }
          // stops at claw's reach in front of the player (in camera view), then swipes
          if (ll > 2.5) moveToward(P.x - d.lungeX * 2.4, P.z - d.lungeZ * 2.4, 12.5 * d.speedMul, dt);
          else if (!playerSafe) { setState('strike'); G.events.emit('deerScreech'); break; }
        }
        if (d.stateT > 1.1 || playerSafe) { d.cooldown = 5; setState('retreat'); }
        break;
      case 'strike': { // raises the claws high (0.3 s, the last dodge window) then rakes down across you
        const lx = P.x - d.pos.x, lz = P.z - d.pos.z, ll = Math.hypot(lx, lz);
        if (ll > 0.01) { d.lungeX = lx / ll; d.lungeZ = lz / ll; }
        if (ll > 2.6) moveToward(P.x - d.lungeX * 2.4, P.z - d.lungeZ * 2.4, 4, dt);
        if (d.stateT < 0.34) break;
        if (dist < 3.4 && !playerSafe) {
          const dmg = 32 + (G.daynight.night || 1) * 3;
          G.survival.damage(dmg, 'the Deer'); G.events.emit('deerHit', { damage: dmg });
          const c = G.controls;
          // knock the player back along the lunge line, then leap away backwards into the dark (eyes on you)
          d.knockX = d.lungeX; d.knockZ = d.lungeZ; d.knockT = 0.4;
          c.vel.x = d.lungeX * 6; c.vel.z = d.lungeZ * 6; c.vel.y = 5.5; c.grounded = false; c.shake = Math.max(c.shake, 0.6);
          const L = 9 + Math.random() * 2.5;
          d.leapFX = d.pos.x; d.leapFZ = d.pos.z; d.leapTX = d.pos.x - d.lungeX * L; d.leapTZ = d.pos.z - d.lungeZ * L;
          const tl = Math.hypot(d.leapTX, d.leapTZ); if (tl > 112) { d.leapTX *= 112 / tl; d.leapTZ *= 112 / tl; }
          d.cooldown = 9; setState('leap');
        } else { G.events.emit('deerMiss'); d.cooldown = 5; setState('retreat'); }
        break; }
      case 'leap': { // two bounding hops backwards, still facing you, then it holds in the dark
        const u = Math.min(1, d.stateT / 0.75), e = 1 - (1 - u) * (1 - u);
        const nx = d.leapFX + (d.leapTX - d.leapFX) * e, nz = d.leapFZ + (d.leapTZ - d.leapFZ) * e;
        d.speed = Math.hypot(nx - d.pos.x, nz - d.pos.z) / Math.max(dt, 1e-4); d.pos.x = nx; d.pos.z = nz;
        d.hopY = Math.abs(Math.sin(u * Math.PI * 2)) * 1.1 * (1 - u * 0.3);
        if (u >= 1) { d.hopY = 0; setState('lurk'); }
        break; }
      case 'lurk': // crouched at the tree line, eyes glowing, watching you recover
        d.hopY = 0;
        if (d.stateT > 1.8) { d.orbit = Math.atan2(d.pos.z - P.z, d.pos.x - P.x); d.cooldown = Math.max(d.cooldown, 5); setState('stalk'); }
        break;
      case 'flee': case 'retreat': case 'dawn': {
        let dx = d.pos.x - P.x, dz = d.pos.z - P.z, l = Math.hypot(dx, dz);
        if (l < 0.01) { dx = -d.lungeX; dz = -d.lungeZ; l = 1; }
        moveToward(d.pos.x + dx / l * 5, d.pos.z + dz / l * 5, d.state === 'retreat' ? 5 : 8, dt);
        if (d.state === 'dawn') { if (d.stateT > 4 || dist > 60) d.despawn(); break; }
        if (dist > (d.state === 'flee' ? 30 : 14) || d.stateT > (d.state === 'flee' ? 3 : 4)) { d.cooldown = Math.max(d.cooldown, 6); d.orbit = Math.atan2(d.pos.z - P.z, d.pos.x - P.x); setState('stalk'); }
        break; }
    }
    if (d.state === 'hidden') return;
    // cannot enter the fire's light
    if (keepOut > 0) { const fx2 = d.pos.x - fire.x, fz2 = d.pos.z - fire.z, fl = Math.hypot(fx2, fz2); if (fl < keepOut) { d.pos.x = fire.x + fx2 / (fl || 1) * keepOut; d.pos.z = fire.z + fz2 / (fl || 1) * keepOut; } }
    G.world.collide(d.pos, 0.4);

    // during windup/lunge/strike the camera swings to face the Deer so the attack is always seen coming
    if ((d.state === 'windup' || d.state === 'lunge' || d.state === 'strike') && dist < 14 && G.mode === 'playing') {
      const c = G.controls, ty = Math.atan2(-(d.pos.x - P.x), -(d.pos.z - P.z));
      let cy = ty + 0.22 - c.yaw; // offset so the attacker stands beside the player model, not hidden behind it
      cy = Math.atan2(Math.sin(cy), Math.cos(cy)); c.yaw += cy * Math.min(1, dt * 5);
      if (typeof c.pitch === 'number') c.pitch += (0.02 - c.pitch) * Math.min(1, dt * 3);
    }
    // threat visibility: while the Deer winds up / lunges / strikes near you, ask the avatar to go see-through
    (G._threatFade ??= {}).deer = (['windup', 'lunge', 'strike', 'stunned'].includes(d.state) && dist < 18) ? 1 : 0;
    // ---------- pose ----------
    if (d.state !== 'leap') d.hopY = Math.max(0, d.hopY - dt * 4);
    root.position.copy(d.pos); root.position.y = d.hopY;
    const away = d.state === 'flee' || d.state === 'retreat' || d.state === 'dawn';
    const face = away ? Math.atan2(d.pos.x - P.x, d.pos.z - P.z) : Math.atan2(P.x - d.pos.x, P.z - d.pos.z);
    let dy = face - root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); root.rotation.y += dy * Math.min(1, dt * (d.state === 'lunge' || d.state === 'leap' ? 12 : d.state === 'stunned' ? 1 : 4));
    // drops to all fours to sprint
    const wantQuad = (d.state === 'approach' && d.stateT > 0.8) || (d.state === 'lunge' && d.stateT < 0.35) || d.state === 'leap' || d.state === 'lurk' || ((away) && d.speed > 4) ? 1 : 0;
    d.quad += (wantQuad - d.quad) * Math.min(1, dt * 5);
    const q = d.quad;
    d.walk += dt * d.speed * (1.2 - q * 0.45);
    const amp = Math.min(1, d.speed / 3);
    const sw = Math.sin(d.walk) * amp * 0.7;
    legL.rotation.x = sw * (1 - q * 0.2) - q * 0.5; legR.rotation.x = -sw * (1 - q * 0.2) - q * 0.5;
    const stunned = d.state === 'stunned', windup = d.state === 'windup' || (d.state === 'strike' && d.stateT < 0.34);
    torso.rotation.x = THREE.MathUtils.lerp(windup ? -0.2 : stunned ? -0.05 : 0.28, 1.25, q);
    body.position.y = -q * 0.45 + (windup ? 0.15 : 0);
    const gallop = Math.sin(d.walk) * amp * 0.9;
    if (stunned) { // covers its face, recoils, shudders
      const sh = Math.sin(d.t * 45) * 0.06;
      armL.rotation.set(-2.3 + sh, 0, 0.5); armR.rotation.set(-2.4 - sh, 0, -0.5);
    } else if (windup) {
      armL.rotation.set(-1.9, 0, 0.9); armR.rotation.set(-1.9, 0, -0.9);
    } else if (d.state === 'strike') { // claws raised overhead, then rake down toward the camera
      const k = Math.min(1, d.stateT / 0.34), sw2 = d.stateT < 0.34 ? 0 : Math.min(1, (d.stateT - 0.34) / 0.12);
      armL.rotation.set(-2.9 * k + sw2 * 2.3, 0, 0.6 * k - sw2 * 0.9); armR.rotation.set(-3.0 * k + sw2 * 2.4, 0, -0.6 * k + sw2 * 0.9);
    } else if (d.state === 'lunge' && q < 0.5) {
      armL.rotation.set(-1.5, 0, 0); armR.rotation.set(-1.6, 0, 0);
    } else {
      const upright = -sw * 0.5 + Math.sin(d.t * 1.3) * 0.05;
      armL.rotation.set(THREE.MathUtils.lerp(upright, -1.25 + gallop, q), 0, 0);
      armR.rotation.set(THREE.MathUtils.lerp(sw * 0.5, -1.25 - gallop, q), 0, 0);
    }
    neck.rotation.x = THREE.MathUtils.lerp(0.45, -0.55, q) + (stunned ? -0.6 : 0) + (windup ? -0.35 : 0);
    // slow unnatural head tilt when idle-watching; violent shudder when stunned
    head.rotation.z = stunned ? Math.sin(d.t * 40) * 0.12 : (d.watched && d.state === 'stalk' ? 0.35 + Math.sin(d.t * 0.5) * 0.05 : Math.sin(d.t * 0.7) * 0.15);
    jaw.rotation.x = windup ? Math.min(0.75, d.stateT * 2.5) : d.state === 'lunge' ? 0.7 : stunned ? 0.5 + Math.sin(d.t * 30) * 0.1 : d.state === 'approach' ? 0.25 + Math.sin(d.t * 4) * 0.1 : 0.05;
    // eyes: calm white-gold while stalking, red when hunting, white flare when stunned; occasional blink
    d.hungry = ['approach', 'windup', 'lunge', 'strike', 'leap', 'lurk'].includes(d.state) || fireOut;
    eyeMat.color.copy(d.hungry && !stunned ? EYE_HUNT : EYE_STUN);
    d.blinkT -= dt; if (d.blinkT < -0.13) d.blinkT = 2.5 + Math.random() * 4;
    const blink = d.blinkT < 0 && !d.hungry && !stunned ? 0.08 : 1;
    const dark = G.daynight.darkness ?? 1;
    // two separate pin-point eyes (size tracks distance so they stay a readable pair, never one merged blob)
    const eb = THREE.MathUtils.clamp(dist * 0.009, 0.13, 0.24);
    const es = (stunned ? 1 + d.flash * 2.5 : d.hungry ? 1.3 + Math.sin(d.t * 9) * 0.12 : 1 + Math.sin(d.t * 2) * 0.06) * eb * (0.5 + dark * 0.5);
    // faint moonlit rim so the gaunt silhouette reads against the night fog; brighter when it hunts / rears
    nightFog(fogMats, dark);
    rimMat.opacity = d.state === 'dawn' ? 0 : Math.min(1, dark * 1.3) * (0.22 + (d.hungry ? 0.1 : 0) + (windup ? 0.3 : 0));
    rimMat.userData.setDist(dist);
    eyePair.set(dist, d.state === 'dawn' ? 0 : Math.min(1, 0.35 + dark), stunned ? EYE_STUN : d.hungry ? EYE_HUNT : EYE_CALM, blink, es / eb);
    // stun flash: the beam "catches" it (brief pale highlight)
    const em = d.flash * 0.35; for (const m of allMats) m.emissive.setRGB(em, em * 0.95, em * 0.8);
  };
  d.snapshot = () => ({ type: 'deer', pos: { x: +d.pos.x.toFixed(2), z: +d.pos.z.toFixed(2) }, state: d.state, lit: !!d.lit, stuns: d.stunCount, speedMul: +d.speedMul.toFixed(2), quad: +d.quad.toFixed(2) });
  // test hook: force the telegraph -> lunge sequence from where it stands
  d.debugLunge = () => { d.cooldown = 0; setState('windup'); return d.snapshot(); };
  if (typeof window !== 'undefined') window.__deer = d;
  return d;
}
