// The Bear: roams the forest by day and charges if you wander too close; at night it STALKS you — keeps its
// distance at the edge of vision (green eyeshine, low growls), then rears up and roars (the telegraph) and charges.
// Has HP: axe hits stagger it, flash it red, and show an HP bar. It avoids the fire's light and gives up if outrun.
import * as THREE from '../../vendor/three.module.js';
import { glowTexture } from '../campfire.js';


// Night readability: a solid dark silhouette with a soft moonlit rim on the OUTER CONTOUR ONLY. Each box gets a
// back-face shell, but the shell is pushed ~0.7 m away from the camera in the vertex shader, so wherever it would
// cross another part of the same body (the box seams) it fails the depth test and vanishes; only where it pokes
// past the silhouette against the far background does it draw. Thickness grows with distance so it stays ~2 px.
export function addRim(root, color = '#9fb4d8', t = 0.035, minSize = 0.07) {
  const rimMat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false });
  rimMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      mvPosition.xyz += normalize(mvPosition.xyz) * 0.7; gl_Position = projectionMatrix * mvPosition;`);
  };
  const shells = []; const meshes = []; root.traverse(o => { if (o.isMesh && o.geometry?.parameters?.width) meshes.push(o); });
  for (const m of meshes) {
    const { width: w, height: h, depth: d } = m.geometry.parameters;
    if (Math.min(w, h, d) < minSize && Math.max(w, h, d) < 0.3) continue;
    const s = new THREE.Mesh(m.geometry, rimMat); s.castShadow = false; s.renderOrder = 2; m.add(s); shells.push([s, w, h, d]);
  }
  let lastT = -1;
  rimMat.userData.setDist = (dist) => {
    const tt = Math.round((t + Math.max(0, dist - 6) * 0.0018) * 200) / 200; if (tt === lastT) return; lastT = tt;
    for (const [s, w, h, d] of shells) s.scale.set((w + 2 * tt) / w, (h + 2 * tt) / h, (d + 2 * tt) / d);
  };
  rimMat.userData.setDist(0);
  return rimMat;
}
let _coreTex = null, _haloTex = null;
function radialTex(stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
}
// A readable PAIR of glowing eyes: two hot pin-point cores (always separate dots) + one soft colored halo around
// the pair. Additive, fog-free, not tone-mapped, so they punch through the night at 15-25 m.
export function makeEyePair(parent, xs, y, z, color) {
  _coreTex ||= radialTex([[0, 1], [0.35, 1], [0.6, 0.55], [1, 0]]);
  _haloTex ||= radialTex([[0, 0.55], [0.3, 0.25], [1, 0]]);
  const coreMat = new THREE.SpriteMaterial({ map: _coreTex, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, toneMapped: false });
  const haloMat = new THREE.SpriteMaterial({ map: _haloTex, color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, toneMapped: false });
  const cores = xs.map(x => { const s = new THREE.Sprite(coreMat); s.position.set(x, y, z); s.renderOrder = 5; parent.add(s); return s; });
  const halo = new THREE.Sprite(haloMat); halo.position.set(0, y, z - 0.02); halo.renderOrder = 4; parent.add(halo);
  const sep = Math.abs(xs[1] - xs[0]); const tmp = new THREE.Color();
  return {
    cores, halo, coreMat, haloMat,
    // dist in m, a = 0..1 visibility, col = glow color, blink 0..1, boost = size multiplier
    set(dist, a, col, blink = 1, boost = 1) {
      const c = Math.min(sep * 0.78, Math.max(0.1, dist * 0.012)) * boost;   // core never wider than the gap
      for (const s of cores) s.scale.set(c, c * blink, 1);
      coreMat.opacity = a; tmp.copy(col).lerp(new THREE.Color(1, 1, 1), 0.45); coreMat.color.copy(tmp).multiplyScalar(1.6);
      haloMat.color.copy(col); haloMat.opacity = a * 0.75 * blink;
      const h = Math.max(sep * 2.6, dist * 0.03) * boost; halo.scale.set(h * 1.2, h * 0.7, 1);
    },
  };
}
// at night the body skips fog, so it stands as a dark silhouette against the fogged tree line instead of melting into it
export function nightFog(mats, dark) {
  const want = dark < 0.55;
  for (const m of mats) if (m.fog !== want) { m.fog = want; m.needsUpdate = true; }
}
let _eyeTex = null;
export function eyeTexture() {
  if (_eyeTex) return _eyeTex;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,1)'); g.addColorStop(0.42, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); _eyeTex = new THREE.CanvasTexture(cv); _eyeTex.colorSpace = THREE.SRGBColorSpace; return _eyeTex;
}

// The bear's chunky box body, built once per bear. Exported so the gray bears and the gray Alpha (creatures)
// reuse the exact same rig with their own palette. Returns the posable parts and the materials.
export function buildBearRig(scene, pal = {}) {
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const fur = mat(pal.fur || '#5a3a23'), fur2 = mat(pal.fur2 || '#462c1a'), snoutM = mat(pal.snout || '#b08a60'), nose = mat('#141010'), claw = mat('#d8cfbf'), mouth = mat('#4a1010');
  const furMats = [fur, fur2, snoutM], allBearMats = [fur, fur2, snoutM, nose, claw, mouth];
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; return b; };
  const root = new THREE.Group(); scene.add(root);
  const rig = new THREE.Group(); root.add(rig);      // rig pivots at the hind feet for rearing up
  rig.position.z = -0.8;
  const body = new THREE.Group(); body.position.z = 0.8; rig.add(body);
  body.add(box(1.3, 1.1, 2.2, fur, 0, 1.25, 0));
  body.add(box(1.0, 0.25, 1.7, snoutM, 0, 0.68, 0.05)); // tan underbelly
  body.add(box(1.35, 0.55, 0.95, fur2, 0, 1.78, 0.5));  // shoulder hump
  body.add(box(0.3, 0.25, 0.2, fur2, 0, 1.55, -1.15));  // stub tail
  const head = new THREE.Group(); head.position.set(0, 1.5, 1.2); body.add(head);
  head.add(box(0.85, 0.75, 0.7, fur, 0, 0, 0.25)); head.add(box(0.45, 0.3, 0.45, snoutM, 0, -0.05, 0.75)); head.add(box(0.2, 0.14, 0.08, nose, 0, 0.05, 0.99));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.55); head.add(jaw);
  jaw.add(box(0.4, 0.12, 0.42, snoutM, 0, -0.05, 0.2)); jaw.add(box(0.32, 0.04, 0.36, mouth, 0, 0.02, 0.2));
  head.add(box(0.22, 0.22, 0.12, fur2, -0.32, 0.45, 0.15)); head.add(box(0.22, 0.22, 0.12, fur2, 0.32, 0.45, 0.15));
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#111' });
  head.add(box(0.09, 0.09, 0.02, eyeMat, -0.24, 0.14, 0.605)); head.add(box(0.09, 0.09, 0.02, eyeMat, 0.24, 0.14, 0.605));
  const eyePair = makeEyePair(head, [-0.25, 0.25], 0.15, 0.66, pal.eye || '#c8ff7a');
  const legs = [];
  for (const [x, z] of [[-0.45, 0.75], [0.45, 0.75], [-0.45, -0.75], [0.45, -0.75]]) {
    const p = new THREE.Group(); p.position.set(x, 0.95, z); body.add(p); p.add(box(0.42, 0.95, 0.5, fur2, 0, -0.47, 0));
    for (let k = -1; k <= 1; k++) p.add(box(0.06, 0.06, 0.14, claw, k * 0.12, -0.92, 0.3));
    legs.push(p);
  }
  if (pal.extra) pal.extra({ body, head, box, mats: { fur, fur2, snoutM, nose, claw, mouth } }); // optional decorations (scars, mane)
  const rimMat = addRim(root, pal.rim || '#a9bedf');
  return { root, rig, body, head, jaw, legs, eyePair, rimMat, furMats, allBearMats, box };
}

export function createBear(G) {
  const { scene } = G;
  const { root, rig, body, head, jaw, legs, eyePair, rimMat, furMats, allBearMats } = buildBearRig(scene);
  const shineMat = eyePair.coreMat;
  const EYE_STALK = new THREE.Color('#c8ff7a'), EYE_RAGE = new THREE.Color('#ffb03a'), RIM_CALM = new THREE.Color('#a9bedf'), RIM_RAGE = new THREE.Color('#ffc890');
  // HP bar (only after it's been hit)
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#1a0d0d', depthTest: false, fog: false, transparent: true, opacity: 0.75 }));
  const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#e0463a', depthTest: false, fog: false, transparent: true }));
  barBg.center.set(0, 0.5); barFg.center.set(0, 0.5); barBg.renderOrder = 998; barFg.renderOrder = 999;
  barBg.scale.set(1.9, 0.2, 1); barFg.scale.set(1.8, 0.12, 1); root.add(barBg); root.add(barFg);
  barBg.visible = barFg.visible = false;

  // day roam: out in the open land, past the chopping ring and inside the fog edge (L1: 60 m), wherever the fire level puts it
  const HOME = () => {
    const R = (G.progression && G.progression.forestR) || 60, a = Math.random() * 6.28, r = Math.max(30, R * 0.55) + Math.random() * Math.max(4, R * 0.4 - 6);
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  };
  const b = { type: 'bear', root, pos: HOME(), hp: 100, maxHp: 100, state: 'roam', stateT: 0, target: HOME(), t: 0, walk: 0, speed: 0, heading: 0,
    growlT: 5, stagger: 0, nightDelay: 0, angry: 0, rear: 0, flash: 0, barT: 0, blinkT: 2, noticed: false, hitDone: false };
  const setState = (s) => { if (b.state !== s) { b.state = s; b.stateT = 0; b.hitDone = false; G.events.emit('bearState', { state: s }); } };
  b.respawn = () => { b.pos.copy(HOME()); b.hp = b.maxHp; rig.rotation.set(0, 0, 0); root.position.y = 0; body.rotation.set(0, 0, 0); root.visible = true; setState('roam'); b.target = HOME(); };
  G.events.on('nightStart', () => { if (b.state === 'dead') b.respawn(); b.nightDelay = 14 + Math.random() * 8; b.noticed = false; });
  G.events.on('dayStart', () => { if (b.state === 'dead') b.respawn(); else setState('roam'); b.noticed = false; });

  b.tryHit = (pp, fwd) => {
    if (b.state === 'dead' || !root.visible) return false;
    const dx = b.pos.x - pp.x, dz = b.pos.z - pp.z, l = Math.hypot(dx, dz);
    if (l > 3.4 || (dx * fwd.x + dz * fwd.z) / (l || 1) < 0.25) return false;
    b.hp -= 25 * (G.progression?.axeDamage || 1); b.stagger = 0.5; b.flash = 1; b.barT = 5; G.events.emit('bearHit', { hp: b.hp }); // better axes (progression chests) hit harder
    b.pos.x += dx / (l || 1) * 0.6; b.pos.z += dz / (l || 1) * 0.6; // knocked back a step
    G.controls.shake = Math.max(G.controls.shake, 0.2);
    if (b.hp <= 0) { b.hp = 0; setState('dead'); G.events.emit('bearDeath'); }
    else { b.angry = 12; setState(b.hp <= 25 ? 'flee' : 'backoff'); }
    return true;
  };

  const moveToward = (tx, tz, speed, dt, turn = 4) => {
    const dx = tx - b.pos.x, dz = tz - b.pos.z, l = Math.hypot(dx, dz); if (l < 0.1) return l;
    const want = Math.atan2(dx, dz); let dh = want - b.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    b.heading += dh * Math.min(1, dt * turn);
    const s = speed * dt * Math.max(0.2, Math.cos(dh)); b.pos.x += Math.sin(b.heading) * s; b.pos.z += Math.cos(b.heading) * s; b.speed = speed; return l;
  };
  const faceToward = (tx, tz, dt, turn = 6) => { const want = Math.atan2(tx - b.pos.x, tz - b.pos.z); let dh = want - b.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); b.heading += dh * Math.min(1, dt * turn); };
  const growl = (dist) => G.events.emit('bearGrowl', { x: b.pos.x, z: b.pos.z, dist });

  b.update = (dt) => {
    b.t += dt; b.stateT += dt; b.speed = 0;
    if (G.mode === 'title') { root.position.copy(b.pos); return; }
    const P = G.controls.pos, fire = G.campfire, night = G.daynight.phase === 'night';
    const dist = Math.hypot(P.x - b.pos.x, P.z - b.pos.z);
    const playerSafe = fire.fuel > 0 && fire.inLight(P, 0.3);
    const avoidR = fire.fuel > 0 ? fire.lightRadius() + 2 : 0;
    b.stagger = Math.max(0, b.stagger - dt); b.angry = Math.max(0, b.angry - dt); b.nightDelay -= dt;
    b.flash = Math.max(0, b.flash - dt * 3); b.barT = Math.max(0, b.barT - dt);
    barBg.visible = barFg.visible = b.barT > 0 && b.state !== 'dead';
    if (barFg.visible) { const y = 2.9 + b.rear * 1.2; barBg.position.set(-0.95, y, 0); barFg.position.set(-0.9, y, 0); barFg.scale.x = 1.8 * Math.max(0, b.hp / b.maxHp); }
    if (b.state === 'dead') {
      body.rotation.z = Math.min(Math.PI / 2, body.rotation.z + dt * 3); rig.rotation.x *= 0.9; root.position.y = Math.min(0, -Math.max(0, b.stateT - 6) * 0.3);
      shineMat.opacity = Math.max(0, shineMat.opacity - dt); eyePair.haloMat.opacity = Math.min(eyePair.haloMat.opacity, shineMat.opacity * 0.5); rimMat.opacity = Math.max(0, rimMat.opacity - dt);
      if (b.stateT > 12) root.visible = false;
      return;
    }
    if (b.stagger > 0) { /* flinch in place */ }
    else switch (b.state) {
      case 'roam': {
        if (moveToward(b.target.x, b.target.z, 1.6, dt) < 2 || b.stateT > 30) { b.target = HOME(); b.stateT = 0; }
        if (night && b.nightDelay <= 0 && G.mode === 'playing') setState('stalk');
        // by day it only reacts if you walk right up to it
        const detect = night ? 0 : 13;
        if (G.mode === 'playing' && !playerSafe && ((b.angry > 0 && dist < 22) || dist < detect)) { setState('notice'); growl(dist); }
        break; }
      case 'notice': // stops, turns, growls — a beat to back away
        faceToward(P.x, P.z, dt);
        if (playerSafe || dist > 26) { setState(night ? 'stalk' : 'roam'); break; }
        if (b.stateT > (b.angry > 0 ? 0.6 : 1.6)) setState('rear');
        break;
      case 'stalk': {
        if (!night) { setState('roam'); break; }
        // hover 13-18 m from the player, just outside the fire light, circling slowly
        const a = Math.atan2(b.pos.z - P.z, b.pos.x - P.x) + dt * 0.15;
        const R = 14 + Math.sin(b.t * 0.3) * 3;
        moveToward(P.x + Math.cos(a) * R, P.z + Math.sin(a) * R, dist > 30 ? 5.5 : 2.2, dt);
        b.growlT -= dt; if (b.growlT <= 0 && dist < 32) { b.growlT = 5 + Math.random() * 5; growl(dist); }
        const patience = Math.max(7, 13 - (G.daynight.night || 1));
        if (!playerSafe && b.stateT > patience && dist < 22) setState('rear');
        break; }
      case 'rear': // stands on hind legs and roars: the charge telegraph
        faceToward(P.x, P.z, dt, 8);
        if (b.stateT < dt * 1.5) G.events.emit('bearRoar', { dist });
        if (b.stateT > 1.45) { setState(playerSafe ? 'backoff' : 'charge'); }
        break;
      case 'charge':
        if (playerSafe) { setState('backoff'); break; }
        moveToward(P.x, P.z, b.stateT < 0.4 ? 5 : 8.4, dt, 3); // turns wide: sidestep to dodge
        if (dist < 3.2) { setState('swipe'); growl(dist); break; } // skids to a stop at paw's reach, in view
        if (dist > 30 || b.stateT > 6) setState('backoff');  // outrun it and it gives up
        break;
      case 'swipe': // half-rears, paw cocked high (0.4 s dodge window), then a big raking swipe
        if (playerSafe) { setState('backoff'); break; }
        faceToward(P.x, P.z, dt, 8);
        if (dist > 3.0 && b.stateT < 0.4) moveToward(P.x, P.z, 2.5, dt, 8);
        if (b.stateT > 0.42 && !b.hitDone) {
          b.hitDone = true;
          const kx = P.x - b.pos.x, kz = P.z - b.pos.z, kl = Math.hypot(kx, kz) || 1;
          const fwd = (Math.sin(b.heading) * kx + Math.cos(b.heading) * kz) / kl;
          if (dist < 3.9 && fwd > 0.3) {
            G.survival.damage(28, 'the Bear');
            const c = G.controls;
            c.vel.x += kx / kl * 12; c.vel.z += kz / kl * 12; c.vel.y = 4.5; c.grounded = false; c.shake = Math.max(c.shake, 0.45);
            G.events.emit('bearSwipe');
          } else G.events.emit('bearMiss');
        }
        if (b.stateT > 0.95) setState('backoff');
        break;
      case 'backoff': case 'flee': {
        const dx = b.pos.x - P.x, dz = b.pos.z - P.z, l = Math.hypot(dx, dz) || 1;
        moveToward(b.pos.x + dx / l * 5, b.pos.z + dz / l * 5, b.state === 'flee' ? 7 : 4.5, dt);
        if (b.stateT > (b.state === 'flee' ? 8 : 3.5)) { if (b.state === 'flee') b.angry = 0; setState(night ? 'stalk' : (b.angry > 0 ? 'notice' : 'roam')); }
        break; }
    }
    // avoid fire light
    if (avoidR > 0) { const fx = b.pos.x - fire.x, fz = b.pos.z - fire.z, fl = Math.hypot(fx, fz); if (fl < avoidR) { b.pos.x = fire.x + fx / (fl || 1) * avoidR; b.pos.z = fire.z + fz / (fl || 1) * avoidR; } }
    G.world.collide(b.pos, 0.9);
    root.position.copy(b.pos); root.rotation.y = b.heading;
    // pose
    // while it rears, charges and swipes nearby, the camera swings to face it so every hit is seen coming
    if ((b.state === 'charge' || b.state === 'swipe' || (b.state === 'rear' && dist < 16)) && dist < 22 && G.mode === 'playing') {
      const c = G.controls, ty = Math.atan2(-(b.pos.x - P.x), -(b.pos.z - P.z));
      let cy = ty + 0.42 - c.yaw; // offset so the attacker stands beside the player model, not hidden behind it
      cy = Math.atan2(Math.sin(cy), Math.cos(cy)); c.yaw += cy * Math.min(1, dt * (b.state === 'rear' ? 4 : 5));
      if (typeof c.pitch === 'number') c.pitch += (0.04 - c.pitch) * Math.min(1, dt * 3);
    }
    // threat visibility: during notice/rear/charge/swipe/backoff the avatar fades to a ghost and the camera
    // rises a little, so the telegraph, the charge and the retreat are never hidden behind the player's head
    const tf = (G._threatFade ??= {});
    tf.bear = (['notice', 'rear', 'charge', 'swipe', 'backoff'].includes(b.state) && dist < 26 && b.state !== 'dead') ? 1 : 0;
    const wantF = Math.max(tf.deer || 0, tf.bear, tf.creatures || 0); // tf.creatures: wolves / gray bears / Alpha (creatures.js)
    tf.k = (tf.k || 0) + (wantF - (tf.k || 0)) * Math.min(1, dt * (wantF > (tf.k || 0) ? 8 : 2.5));
    if (tf.k > 0.01 && G.mode === 'playing' && G.player) {
      const pl = G.player, op = 1 - tf.k * 0.8;
      if (!tf.mats) { tf.mats = new Set(); pl.root.traverse(o => { if (o.isMesh && !o.userData.xray && o.material && o.material !== pl.lensMat) tf.mats.add(o.material); }); }
      if ((pl.fade ?? 1) > op) pl.setFade(Math.max(0.45, op));
      for (const m of tf.mats) { const o2 = Math.min(m.opacity, op); if (!m.transparent) { m.transparent = true; m.needsUpdate = true; } m.opacity = o2; m.depthWrite = false; }
      G.camera.position.y += 0.75 * tf.k; // lift over the shoulder: see past the head
    }
    const wantRear = b.state === 'swipe' ? (b.stateT < 0.42 ? Math.min(0.55, b.stateT * 3) : Math.max(0, 0.55 - (b.stateT - 0.42) * 2)) : b.state === 'rear' ? Math.min(1, b.stateT * 4) * (b.stateT > 1.25 ? Math.max(0, 1 - (b.stateT - 1.25) * 5) : 1) : 0;
    b.rear += (wantRear - b.rear) * Math.min(1, dt * 10);
    rig.rotation.x = -b.rear * 1.2;
    const gait = b.state === 'charge' ? 2.3 : 1.6;
    b.walk += dt * b.speed * gait;
    const amp = Math.min(1, b.speed / 3) * (b.state === 'charge' ? 0.9 : 0.6);
    const sw = Math.sin(b.walk) * amp;
    legs[0].rotation.z = legs[1].rotation.z = 0;
    if (b.rear > 0.05 && b.state !== 'swipe') { legs[0].rotation.x = legs[1].rotation.x = -1.1 * b.rear + Math.sin(b.t * 14) * 0.18 * b.rear; legs[0].rotation.z = -0.55 * b.rear; legs[1].rotation.z = 0.55 * b.rear; legs[2].rotation.x = legs[3].rotation.x = 1.15 * b.rear; }
    else if (b.state === 'swipe') { // right paw cocked up and back, then rakes down across toward the camera
      const s2 = b.stateT < 0.42 ? 0 : Math.min(1, (b.stateT - 0.42) / 0.12);
      legs[0].rotation.x = -2.2 * (1 - s2) + 0.5 * s2; legs[0].rotation.z = -0.7 * (1 - s2) + 0.6 * s2; legs[1].rotation.x = -0.5;
    }
    else if (b.state === 'charge') { legs[0].rotation.x = sw; legs[1].rotation.x = sw; legs[2].rotation.x = -sw; legs[3].rotation.x = -sw; } // bounding gallop
    else { legs[0].rotation.x = sw; legs[3].rotation.x = sw; legs[1].rotation.x = -sw; legs[2].rotation.x = -sw; }
    body.position.y = Math.abs(Math.sin(b.walk)) * (b.state === 'charge' ? 0.18 : 0.06) * Math.min(1, b.speed / 3);
    head.rotation.x = b.state === 'charge' ? 0.25 : b.rear > 0.1 ? 0.85 * b.rear : b.state === 'notice' ? -0.1 : Math.sin(b.t * 0.8) * 0.08;
    head.rotation.y = b.state === 'stalk' || b.state === 'roam' ? Math.sin(b.t * 0.4) * 0.3 : 0;
    jaw.rotation.x = b.state === 'swipe' ? 0.55 : b.state === 'rear' ? 0.6 * b.rear + 0.05 : b.state === 'charge' ? 0.35 : b.state === 'notice' ? 0.2 + Math.sin(b.t * 20) * 0.04 : 0.02;
    body.rotation.x = b.stagger > 0 ? -0.18 : 0;
    // eyeshine: bright in the dark, especially when it's focused on you; slow blinks
    b.blinkT -= dt; if (b.blinkT < -0.15) b.blinkT = 2 + Math.random() * 4;
    const focus = ['stalk', 'notice', 'rear', 'charge', 'swipe'].includes(b.state) ? 1 : 0.55;
    const dk = G.daynight.darkness ?? 0;
    const rage = b.state === 'rear' || b.state === 'charge' || b.state === 'swipe' ? 1 : 0;
    eyePair.set(dist, Math.min(1, dk * 1.4) * focus, rage ? EYE_RAGE : EYE_STALK, b.blinkT < 0 && !rage ? 0.12 : 1, rage ? 1.35 : 1);
    // moonlit rim + faint cold fill so the body reads against the night fog; flares warm on the rear-up telegraph
    const hunt = ['stalk', 'notice', 'rear', 'charge', 'swipe', 'backoff', 'flee'].includes(b.state) ? 1 : 0.6;
    rimMat.userData.setDist(dist);
    rimMat.opacity = Math.min(1, dk * 1.3) * (0.24 * hunt + b.rear * 0.55 + (b.state === 'charge' ? 0.2 : 0));
    rimMat.color.copy(RIM_CALM).lerp(RIM_RAGE, Math.min(1, b.rear * 1.2 + (b.state === 'charge' ? 0.5 : 0)));
    nightFog(allBearMats, dk);
    const fill = dk * (0.012 + b.rear * 0.02);
    for (const m of furMats) m.emissive.setRGB(b.flash * 0.55 + fill * 0.8, b.flash * 0.055 + fill * 0.85, b.flash * 0.044 + fill * 1.15);
  };
  b.snapshot = () => ({ type: 'bear', pos: { x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2) }, state: b.state, hp: b.hp });
  return b;
}
