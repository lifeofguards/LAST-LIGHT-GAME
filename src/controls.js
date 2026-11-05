// Controls: player movement (WASD, sprint, jump), collisions, third-person over-the-shoulder camera, using items.
// Feel goals (Roblox-like): snappy accel, character turns toward travel, coyote-time jumps with a crisp arc,
// smooth follow camera with collision against trunks/canopies, scroll-wheel zoom, sprint FOV kick.
import * as THREE from '../vendor/three.module.js';

export function createControls(G) {
  const { camera, input, player } = G;
  const c = {
    pos: new THREE.Vector3(0, 0, 6), vel: new THREE.Vector3(), yaw: 0, pitch: -0.12, grounded: true,
    speed: 0, sprinting: false, exhausted: false, staminaDelay: 0, stepDist: 0,
    sensitivity: 0.0022, swingCD: 0, pendingHit: -1,
    forward: new THREE.Vector3(), camTarget: new THREE.Vector3(), shake: 0,
    zoom: 4.6, camDist: 4.6, facing: 0, coyote: 0, jumpBuf: 0, airTime: 0, landT: 0, faceCamT: 0,
  };
  const WALK = 5.0, SPRINT = 8.0, GRAV = 24, JUMP = 7.6, FALL_MULT = 1.45;
  const BASE_FOV = camera.fov;
  const tmp = new THREE.Vector3(), camQ = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, 'YXZ');
  const pivot = new THREE.Vector3(), want = new THREE.Vector3(), probe = new THREE.Vector3(), dir = new THREE.Vector3(), side = new THREE.Vector3();
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let camInit = false;

  c.lookAt = (x, z) => {
    c.yaw = Math.atan2(-(x - c.pos.x), -(z - c.pos.z)); c.pitch = -0.08;
    c.facing = c.yaw + Math.PI; player.root.rotation.y = c.facing; camInit = false;
  };
  c.teleport = (x, z) => { c.pos.set(x, 0, z); c.vel.set(0, 0, 0); G.world.collide(c.pos, 0.45); camInit = false; };

  // ---- camera collision: analytic sphere-cast against the real tree shapes (trunk cylinder, pine cones, oak blobs) ----
  const MIN_D = 1.7; // spring-arm minimum: the avatar never becomes a ghost box
  const CAM_R = 0.32; // camera "sphere" radius: keeps the near plane out of bark and leaves
  const PINE = [[1.6, 1.9, 4.2], [3.05, 1.5, 5.35], [4.4, 1.0, 6.4]]; // [baseY, baseR, apexY] (unscaled, matches world.js)
  const OAK = [[0, 3.7, 0, 1.9], [0.9, 4.6, 0.4, 1.3], [-0.8, 4.4, -0.5, 1.2]];
  const near = [], skipCanopy = new Set(); let canopyCeil = 99, groundOn = true;
  function gatherNear() {
    near.length = 0;
    for (const t of G.world.trees) {
      if (!t.alive) continue;
      const dx = t.x - c.pos.x, dz = t.z - c.pos.z;
      if (dx * dx + dz * dz < 196) near.push(t);
    }
  }
  function trunkD(t, p) {
    const d = Math.hypot(p.x - t.x, p.z - t.z) - 0.4 * t.s, top = 2.4 * (t.sy || t.s);
    return p.y > top ? Math.hypot(Math.max(0, d), p.y - top) : d;
  }
  function canopyD(t, p) {
    const s = t.s, sy = t.sy || s, dh = Math.hypot(p.x - t.x, p.z - t.z);
    let best = 1e9;
    if (t.type === 'pine') {
      for (const [yb, rb, ya] of PINE) {
        const y0 = yb * sy, y1 = ya * sy, r0 = rb * s;
        let d;
        if (p.y < y0) d = Math.hypot(Math.max(0, dh - r0), y0 - p.y);
        else if (p.y > y1) d = Math.hypot(dh, p.y - y1);
        else d = (dh - r0 * (1 - (p.y - y0) / (y1 - y0))) * 0.8; // perpendicular distance to the slanted side (approx)
        if (d < best) best = d;
      }
    } else {
      const cr = Math.cos(t.rot || 0), sr = Math.sin(t.rot || 0);
      for (const [ox, oy, oz, r] of OAK) {
        const cx = t.x + (ox * cr + oz * sr) * s, cz = t.z + (-ox * sr + oz * cr) * s, cy = oy * sy;
        const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz) - r * s * 0.97;
        if (d < best) best = d;
      }
    }
    return best;
  }
  function clearance(p) {
    let m = groundOn ? p.y - 0.25 : 99;
    for (const t of near) {
      const a = trunkD(t, p); if (a < m) m = a;
      // spring arm only respects the player-height part of canopies: leaves above head height are ignored
      if (p.y < canopyCeil && !skipCanopy.has(t)) { const b = canopyD(t, p); if (b < m) m = b; }
    }
    return m;
  }
  // sphere-cast from `from` along unit `d` up to `len`; returns the farthest free distance
  function sphereCast(from, d, len) {
    let lo = 0, t = 0;
    while (t < len) {
      const step = Math.min(0.1, len - t); t += step;
      probe.copy(from).addScaledVector(d, t);
      if (clearance(probe) < CAM_R) {
        let a = lo, b = t; // refine the contact point
        for (let i = 0; i < 5; i++) { const m = (a + b) / 2; probe.copy(from).addScaledVector(d, m); if (clearance(probe) < CAM_R) b = m; else a = m; }
        return Math.max(0, a - 0.04);
      }
      lo = t;
    }
    return len;
  }
  const lookQ = new THREE.Quaternion();
  const offCur = new THREE.Vector3(0.95, 0.35, 4.6), offTry = new THREE.Vector3(), camOut = new THREE.Vector3();

  c.update = (dt) => {
    const st = G.survival.stats;
    if (G.mode === 'title') {
      const t = G.time * 0.08; c.yaw = t; c.pitch = -0.18;
      camera.position.set(Math.sin(t) * 14, 4.2, Math.cos(t) * 14);
      camera.lookAt(0, 1.2, 0); camInit = false; return;
    }
    const playing = G.mode === 'playing';
    if (playing) {
      const [dx, dy] = input.consumeMouse();
      c.yaw -= dx * c.sensitivity; c.pitch = THREE.MathUtils.clamp(c.pitch - dy * c.sensitivity, -1.0, 0.45);
      const wh = input.consumeWheel ? input.consumeWheel() : 0;
      if (wh) c.zoom = THREE.MathUtils.clamp(c.zoom + wh * 0.004, 2.4, 8.5);
    } else { input.consumeMouse(); input.consumeWheel && input.consumeWheel(); }
    const f = c.forward.set(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
    const r = tmp.set(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    let mx = 0, mz = 0;
    if (playing) {
      if (input.down('KeyW') || input.down('ArrowUp')) { mx += f.x; mz += f.z; }
      if (input.down('KeyS') || input.down('ArrowDown')) { mx -= f.x; mz -= f.z; }
      if (input.down('KeyD') || input.down('ArrowRight')) { mx += r.x; mz += r.z; }
      if (input.down('KeyA') || input.down('ArrowLeft')) { mx -= r.x; mz -= r.z; }
    }
    const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }

    // stamina: ~7s of sprint, ~4s to refill after a short breather; exhausted until 30%
    const wantSprint = playing && ml > 0 && (input.down('ShiftLeft') || input.down('ShiftRight'));
    if (st.stamina <= 0 && !c.exhausted) { c.exhausted = true; G.events.emit('exhausted'); }
    if (c.exhausted && st.stamina > 30) c.exhausted = false;
    c.sprinting = wantSprint && !c.exhausted;
    if (c.sprinting) { st.stamina = Math.max(0, st.stamina - 14 * dt); c.staminaDelay = 0.7; }
    else { c.staminaDelay -= dt; if (c.staminaDelay <= 0) st.stamina = Math.min(100, st.stamina + (ml > 0 ? 20 : 28) * dt); }
    const hungerSlow = st.hunger <= 0 ? 0.8 : 1, tiredSlow = c.exhausted ? 0.85 : 1;
    const sp = (c.sprinting ? SPRINT : WALK) * hungerSlow * tiredSlow;

    // snappy ground accel, quicker stop than start, light air control
    const accel = c.grounded ? (ml > 0 ? 16 : 22) : 5;
    const ka = 1 - Math.exp(-accel * dt);
    c.vel.x += (mx * sp - c.vel.x) * ka;
    c.vel.z += (mz * sp - c.vel.z) * ka;

    // jump: buffer + coyote time, faster fall, short hop on early release
    c.coyote = c.grounded ? 0.12 : c.coyote - dt;
    c.jumpBuf = playing && input.pressed('Space') ? 0.14 : c.jumpBuf - dt;
    if (c.jumpBuf > 0 && c.coyote > 0) {
      c.vel.y = JUMP; c.grounded = false; c.coyote = 0; c.jumpBuf = 0; G.events.emit('jump');
    }
    const g = GRAV * (c.vel.y < 0 ? FALL_MULT : (!input.down('Space') && c.vel.y > 0 ? 1.8 : 1));
    c.vel.y -= g * dt;
    c.pos.addScaledVector(c.vel, dt);
    if (!c.grounded) c.airTime += dt;
    if (c.pos.y <= 0) {
      if (!c.grounded) { if (c.vel.y < -4) { G.events.emit('land'); c.landT = Math.min(1, -c.vel.y / 12); } }
      c.pos.y = 0; c.vel.y = 0; c.grounded = true; c.airTime = 0;
    }
    if (G.progression && G.progression.limitPlayer) G.progression.limitPlayer(c.pos, c.vel, dt); // soft push-back at the fog barrier
    G.world.collide(c.pos, 0.45);
    c.speed = Math.hypot(c.vel.x, c.vel.z);
    if (c.grounded && c.speed > 0.5) { c.stepDist += c.speed * dt; if (c.stepDist > (c.sprinting ? 2.1 : 1.6)) { c.stepDist = 0; G.events.emit('footstep', { sprint: c.sprinting }); } }

    // facing: turn toward travel direction; face the camera when aiming the flashlight or chopping
    c.faceCamT -= dt;
    const aimLock = player.equipped === 'flashlight' || c.faceCamT > 0 || player.swingT > 0;
    let wantFace = c.facing;
    if (aimLock) wantFace = c.yaw + Math.PI;
    else if (ml > 0) wantFace = Math.atan2(mx, mz);
    const turnRate = aimLock ? 20 : 12;
    c.facing += wrap(wantFace - c.facing) * (1 - Math.exp(-turnRate * dt));
    player.root.rotation.y = c.facing;
    player.root.position.copy(c.pos);
    const turnVel = wrap(wantFace - c.facing);
    c.landT = Math.max(0, c.landT - dt * 4);
    player.animate(dt, c.speed, c.grounded, c.pitch, { sprint: c.sprinting, vy: c.vel.y, land: c.landT, turn: turnVel, tired: c.exhausted || st.stamina < 20 });

    // use item
    c.swingCD -= dt;
    // buffer a click made during the cooldown so rapid clicking never drops a swing
    if (playing && input.clicked('left') && player.equipped === 'axe') { c.swingQueued = 0.6; c.faceCamT = 0.7; }
    else c.swingQueued = Math.max(0, (c.swingQueued || 0) - dt);
    if (playing && c.swingQueued > 0 && player.equipped === 'axe' && c.swingCD <= 0) {
      c.swingQueued = 0; c.swingCD = 0.52; player.swing(); c.pendingHit = 0.24; c.faceCamT = 0.7; G.events.emit('swing');
      c.facing = c.yaw + Math.PI + wrap(c.facing - c.yaw - Math.PI) * 0.3; // snap most of the way to aim
    }
    if (c.pendingHit > 0) {
      c.pendingHit -= dt;
      if (c.pendingHit <= 0) {
        c.pendingHit = -1;
        // the brown bear first (unchanged), then any other creature in front (wolves, gray bears, the Alpha, game animals)
        const hitBear = (G.bear && G.bear.tryHit(c.pos, f)) || (G.creatures && G.creatures.hitAt && G.creatures.hitAt(c.pos, f));
        if (!hitBear) { const t = G.world.findChopTarget(c.pos.x, c.pos.z, f.x, f.z); if (t) { G.world.hitTree(t, c.pos.x, c.pos.z, (G.progression && G.progression.treeDamage) || 1); c.shake = Math.max(c.shake, 0.12); } }
        else c.shake = Math.max(c.shake, 0.18);
      }
    }

    // ---- camera: smoothed follow over the right shoulder, collision pull-in, sprint FOV kick ----
    // camera rig is driven ONLY by the player's root position + mouse yaw/pitch: chopping, hits and tree falls never move it
    // chop: no orbit / pull-back (that swung the arm into neighbouring trunks). Instead the view is held steady:
    // mouse yaw is still live, but the arm length is frozen at its pre-chop value unless something truly blocks it.
    { const W = G.world, on = W && W.chopCamT > 0 && W.chopFocus; c.chopK = (c.chopK || 0) + ((on ? 1 : 0) - (c.chopK || 0)) * (1 - Math.exp(-dt * (on ? 5 : 2))); }
    const ck = c.chopK || 0;
    eul.set(c.pitch - 0.06 * ck, c.yaw, 0); camQ.setFromEuler(eul);
    const tgtY = c.pos.y * 0.6 + 1.75; // damp vertical follow so jumps don't yank the view
    if (!camInit) { c.camTarget.set(c.pos.x, tgtY, c.pos.z); c.camDist = c.zoom; offCur.set(0.95, 0.35, c.zoom); camInit = true; c._snap = true; }
    const kf = 1 - Math.exp(-22 * dt), ky = 1 - Math.exp(-9 * dt);
    c.camTarget.x += (c.pos.x - c.camTarget.x) * kf;
    c.camTarget.z += (c.pos.z - c.camTarget.z) * kf;
    c.camTarget.y += (tgtY - c.camTarget.y) * ky;
    const zoomWant = c.zoom + (c.sprinting && c.speed > 6 ? 0.5 : 0);
    const shoulder = THREE.MathUtils.clamp((c.zoom - 2.4) / 3, 0.35, 1);
    pivot.copy(c.camTarget);
    gatherNear();
    canopyCeil = pivot.y + 0.7; // head height + a little: foliage above this never shoves the camera
    skipCanopy.clear();
    for (const t of near) if (canopyD(t, pivot) < CAM_R + 0.05) skipCanopy.add(t);
    // single right-shoulder spring arm (no rig switching = no sideways pops). Length is the only thing collision changes.
    const zw = zoomWant;
    offCur.set(0.95 * shoulder, 0.35, zw);
    const L2 = offCur.length();
    dir.copy(offCur).applyQuaternion(camQ).divideScalar(L2);
    groundOn = false; // ground is handled by lifting the camera, never by collapsing the arm
    let free = sphereCast(pivot, dir, L2);
    if (free < L2 - 0.01) {
      // thin occluder (a single trunk crossing the line of sight): if the far side is clear and the camera spot itself
      // is open, keep the full arm and let the trunk slide past instead of collapsing the view onto the head
      const skip = free + 0.75;
      if (skip < L2) { probe.copy(pivot).addScaledVector(dir, skip);
        if (clearance(probe) >= CAM_R && sphereCast(probe.clone(), dir, L2 - skip) >= L2 - skip - 0.01) free = L2; }
    }
    groundOn = true;
    const armWant = THREE.MathUtils.clamp(free, Math.min(MIN_D, L2), L2); // never closer than the 1.7 m minimum
    if (!(c.camDist > 0) || c._snap) { c.camDist = armWant; c._snap = false; }
    // pull in fast but smooth (~0.1 s, rate-limited so a single frame never jumps), return to full in ~0.4 s once clear
    const diff = armWant - c.camDist;
    // (effective dt capped so a slow/hitched frame still moves the arm in small steps: never a visible pop)
    const dte = Math.min(dt, 1 / 30);
    if (diff < 0) c.camDist += Math.max(diff * (1 - Math.exp(-30 * dte)), -Math.min(40 * dte, 0.55));
    else c.camDist += Math.min(diff * (1 - Math.exp(-9 * dte)), Math.min(14 * dte, 0.4));
    camOut.copy(pivot).addScaledVector(dir, c.camDist);
    if (camOut.y < 0.55) camOut.y = 0.55; // stay above the grass
    camera.position.copy(camOut);
    camera.quaternion.copy(camQ);
    // when slid wide around a trunk, turn the view back toward the avatar so it stays in frame
    const wide = THREE.MathUtils.clamp((Math.abs(offCur.x) - 1.1) / 1.2, 0, 1);
    if (wide > 0) {
      probe.set(0, 0, -0.8).applyQuaternion(camQ).add(pivot);
      camera.lookAt(probe); lookQ.copy(camera.quaternion); camera.quaternion.slerpQuaternions(camQ, lookQ, wide);
    }
    // fade the avatar only once the camera really is right on top of it (never drop it)
    player.root.visible = true;
    player.setFade((c.camDist - 0.55) / 0.6);
    const fovWant = BASE_FOV + (c.sprinting && c.speed > 6 ? 7 : 0);
    if (Math.abs(camera.fov - fovWant) > 0.01) { camera.fov += (fovWant - camera.fov) * (1 - Math.exp(-6 * dt)); camera.updateProjectionMatrix(); }
    // impact feedback: a tiny rotational jolt (<0.4 deg) instead of moving the rig, so the view stays put on every chop
    if (c.shake > 0) { c.shake = Math.max(0, c.shake - dt); const s = c.shake * 0.04; camera.rotateX((Math.random() - .5) * s); camera.rotateY((Math.random() - .5) * s); }
  };
  return c;
}
