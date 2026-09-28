// Player character: blocky R6-style body, held items, walk/swing animation.
import * as THREE from '../vendor/three.module.js';

export function createPlayer(G) {
  const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o });
  const skin = mat('#f1c27d'), shirt = mat('#b5362f'), shirt2 = mat('#7d231f'), pants = mat('#34465e'), shoe = mat('#2a2522'), black = mat('#1a1a1a'), hair = mat('#4a3020');
  const S = 0.68; // world units per "stud"
  const root = new THREE.Group();          // at feet, rotated to face yaw
  const body = new THREE.Group(); body.scale.setScalar(S); root.add(body);
  const box = (w, h, d, m) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.castShadow = true; g.receiveShadow = true; return g; };

  // legs (pivot at hip)
  const mkLeg = (x) => { const p = new THREE.Group(); p.position.set(x, 1.0, 0); const l = box(0.48, 0.8, 0.5, pants); l.position.y = -0.4; const s = box(0.5, 0.2, 0.56, shoe); s.position.set(0, -0.9, 0.03); p.add(l, s); body.add(p); return p; };
  const legL = mkLeg(-0.26), legR = mkLeg(0.26);
  // torso
  const torso = new THREE.Group(); torso.position.y = 1.0; body.add(torso);
  const chest = box(1.0, 1.0, 0.5, shirt); chest.position.y = 0.5; torso.add(chest);
  const stripe = box(1.02, 0.12, 0.52, shirt2); stripe.position.y = 0.35; torso.add(stripe);
  const belt = box(1.02, 0.1, 0.52, mat('#3a2a1e')); belt.position.y = 0.05; torso.add(belt);
  // head
  const head = new THREE.Group(); head.position.y = 1.0; torso.add(head);
  const skull = box(0.62, 0.62, 0.62, skin); skull.position.y = 0.33; head.add(skull);
  const hairTop = box(0.66, 0.16, 0.66, hair); hairTop.position.y = 0.66; head.add(hairTop);
  const hairBack = box(0.66, 0.4, 0.14, hair); hairBack.position.set(0, 0.46, -0.27); head.add(hairBack);
  const eyeL = box(0.08, 0.13, 0.02, black); eyeL.position.set(-0.13, 0.4, 0.315); head.add(eyeL);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.13; head.add(eyeR);
  const mouth = box(0.2, 0.04, 0.02, black); mouth.position.set(0, 0.2, 0.315); head.add(mouth);
  // arms (pivot at shoulder)
  const mkArm = (x) => { const p = new THREE.Group(); p.position.set(x, 0.92, 0); const sl = box(0.48, 0.42, 0.5, shirt); sl.position.y = -0.17; const a = box(0.46, 0.6, 0.46, skin); a.position.y = -0.66; p.add(sl, a); torso.add(p); return p; };
  const armL = mkArm(0.74), armR = mkArm(-0.74); // facing +z: anatomical right is -x
  const hand = new THREE.Group(); hand.position.set(0, -0.95, 0.05); armR.add(hand);

  // items
  const items = {};
  { const g = new THREE.Group(); const handle = box(0.09, 1.2, 0.09, mat('#8a5a32')); handle.position.set(0, 0.3, 0.02);
    const headM = box(0.1, 0.34, 0.5, mat('#9aa0a6', { flatShading: true })); headM.position.set(0, 0.78, 0.22);
    const edge = box(0.11, 0.38, 0.08, mat('#d9dde0')); edge.position.set(0, 0.78, 0.49);
    g.add(handle, headM, edge); g.scale.setScalar(1.45); g.rotation.set(1.05, 0, 0.55); g.position.set(-0.08, 0, 0.05); items.axe = g; }
  { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), mat('#2c2f33')); b.position.y = 0.1;
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.22, 8), mat('#4a4f55')); h.position.y = 0.48;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.13, 12), new THREE.MeshBasicMaterial({ color: '#555' })); lens.rotation.x = -Math.PI / 2; lens.position.y = 0.595;
    g.add(b, h, lens); g.scale.setScalar(1.35); g.rotation.x = Math.PI; g.position.set(-0.04, 0, 0.05); g.userData.lens = lens; items.flashlight = g; }
  { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), mat('#8c6f47')); s.scale.set(1, 1.2, 0.9); s.position.y = -0.35;
    const tie = box(0.2, 0.12, 0.2, mat('#5b4630')); tie.position.y = 0.12; g.add(s, tie); g.scale.setScalar(1.35); g.position.x = -0.12; items.sack = g; }
  for (const k in items) { items[k].visible = false; hand.add(items[k]); items[k].traverse(o => o.castShadow = true); }

  // fade support: every material on the avatar (incl. held items) can be dimmed together
  const fadeMats = new Set();
  root.traverse(o => { if (o.isMesh && o !== items.flashlight.userData.lens) fadeMats.add(o.material); });
  // x-ray silhouette: faint blocky outline drawn only where the avatar is hidden behind bushes/trees
  const xray = new THREE.MeshBasicMaterial({ color: '#ffe2b0', transparent: false, blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, opacity: 0.22, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
  const xrayMeshes = [];
  root.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry' && o.parent && !Object.values(items).some(it => it === o.parent)) xrayMeshes.push(o); });
  for (const o of xrayMeshes) { const x = new THREE.Mesh(o.geometry, xray); x.position.copy(o.position); x.rotation.copy(o.rotation); x.scale.copy(o.scale); x.renderOrder = 50; x.castShadow = false; x.userData.xray = true; o.parent.add(x); }
  root.traverse(o => { if (o.isMesh && !o.userData.xray) o.renderOrder = 100; });

  const player = {
    root, body, head, armL, armR, legL, legR, torso, hand, items,
    equipped: 'axe', swingT: 0, walkPhase: 0,
    lensMat: items.flashlight.userData.lens.material,
    setEquipped(name) { this.equipped = name; for (const k in items) items[k].visible = k === name; },
    swing() { this.swingT = 0.001; },
    fade: 1,
    // op 0..1: avatar opacity (camera pulled in close fades rather than hiding the model)
    setFade(op) {
      op = Math.max(0.45, Math.min(1, op)); if (Math.abs(op - this.fade) < 0.01 && (op === 1) === (this.fade === 1)) return;
      this.fade = op; const tr = op < 0.999;
      for (const m of fadeMats) { if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } m.opacity = op; m.depthWrite = !tr || op > 0.6; }
      xray.opacity = 0.22 * op;
    },
    // speed: horizontal m/s; pitch: camera pitch for aiming the flashlight arm; o: {sprint, vy, land, turn, tired}
    animate(dt, speed, grounded, pitch, o = {}) {
      const moving = speed > 0.3, run = Math.min(1, speed / 5), sprintK = o.sprint ? 1 : 0;
      this.idleT = (this.idleT || 0) + dt;
      // stride rate scales with speed; sprint = longer, punchier stride
      this.walkPhase += dt * (moving ? 3.2 + speed * 1.15 : 0);
      const amp = moving ? run * (0.75 + 0.35 * sprintK) : 0;
      const sw = Math.sin(this.walkPhase) * amp;
      const k = 1 - Math.pow(0.0005, dt), kk = 1 - Math.pow(0.02, dt);
      let lL = sw, lR = -sw, aL = -sw * 0.9;
      if (!grounded) { // jump pose: tuck one leg, arms up a bit
        const up = (o.vy || 0) > 0;
        lL = up ? -0.9 : -0.4; lR = up ? 0.35 : 0.15; aL = up ? -1.0 : -0.6;
      }
      legL.rotation.x += (lL - legL.rotation.x) * k; legR.rotation.x += (lR - legR.rotation.x) * k;
      armL.rotation.x += (aL - armL.rotation.x) * k;
      armL.rotation.z += ((!grounded ? 0.35 : moving ? 0.06 : 0.03 + Math.sin(this.idleT * 1.6) * 0.02) - armL.rotation.z) * k;
      // body: stride bounce, idle breathing, landing squash
      const bounce = moving && grounded ? Math.abs(Math.cos(this.walkPhase)) * (0.05 + 0.05 * sprintK) : 0;
      const breathe = moving ? 0 : Math.sin(this.idleT * 1.8) * 0.012 * (o.tired ? 2.5 : 1);
      const land = o.land || 0;
      body.position.y = bounce + breathe - land * 0.12;
      body.scale.set(0.68 * (1 + land * 0.06), 0.68 * (1 - land * 0.1), 0.68 * (1 + land * 0.06));
      // torso: forward lean with speed, sway, lean into turns, heavy breathing when tired
      const lean = moving ? 0.05 + 0.13 * sprintK * run : (o.tired ? 0.12 : 0);
      torso.rotation.x += (lean - torso.rotation.x) * kk;
      const bank = THREE.MathUtils.clamp(-(o.turn || 0) * 0.35 * run, -0.2, 0.2);
      torso.rotation.z += (bank + (moving ? Math.sin(this.walkPhase) * 0.035 : 0) - torso.rotation.z) * kk;
      let twist = moving ? -Math.sin(this.walkPhase) * 0.08 * run : 0;
      head.rotation.x = THREE.MathUtils.clamp(-pitch * 0.5 - lean * 0.8, -0.45, 0.45) + (moving ? 0 : Math.sin(this.idleT * 0.9) * 0.02);
      head.rotation.y += ((moving ? 0 : Math.sin(this.idleT * 0.37) * 0.18) - head.rotation.y) * kk; // idle look-around
      // right arm by item
      let target = sw * 0.9, tz = 0;
      if (this.equipped === 'flashlight') { target = -Math.PI / 2 - pitch + torso.rotation.x * -1 + (moving ? Math.sin(this.walkPhase) * 0.04 : 0); tz = -0.08; }
      else if (this.equipped === 'axe') { target = -0.4 + sw * 0.35; tz = -0.05; }
      else if (this.equipped === 'sack') { target = -2.6; tz = 0.35; } // sack slung over the shoulder
      if (this.holdSwing != null) this.swingT = this.holdSwing; // debug: freeze a swing pose for screenshots
      if (this.swingT > 0) {
        if (this.holdSwing == null) this.swingT += dt; const t = this.swingT / 0.46;
        // overhead chop: raise the axe high above the head (out to the right so it clears the torso
        // from the chase camera), hold a beat, slam down in front, recover. Torso arches back then crunches in.
        let z = 0.05, lean2 = 0, wr = 1.05; // z = outward lift (sign flipped below: right arm sits at -x)
        if (t < 0.32) { const e = t / 0.32, q = 1 - (1 - e) * (1 - e); target = THREE.MathUtils.lerp(-0.4, -3.35, q); z = 0.05 + 0.5 * q; twist = -0.3 * q; lean2 = -0.18 * q; wr = THREE.MathUtils.lerp(1.05, 2.5, q); }
        else if (t < 0.4) { target = -3.35; z = 0.55; twist = -0.3; lean2 = -0.18; wr = 2.5; }
        else if (t < 0.58) { const e = (t - 0.4) / 0.18, q = e * e; target = THREE.MathUtils.lerp(-3.35, -0.15, q); z = THREE.MathUtils.lerp(0.55, 0.12, q); twist = THREE.MathUtils.lerp(-0.3, 0.2, q); lean2 = THREE.MathUtils.lerp(-0.18, 0.28, q); wr = THREE.MathUtils.lerp(2.5, 1.5, q); }
        else { const e = Math.min(1, (t - 0.58) / 0.42); target = THREE.MathUtils.lerp(-0.15, -0.4, e); z = THREE.MathUtils.lerp(0.12, 0.05, e); twist = 0.2 * (1 - e); lean2 = 0.28 * (1 - e); wr = THREE.MathUtils.lerp(1.5, 1.05, e); }
        items.axe.rotation.x = wr; armR.rotation.x = target; armR.rotation.z = -z; tz = -z; armL.rotation.x = target * 0.4; if (t >= 1) this.swingT = 0;
        torso.rotation.x = lean2;
      } else { armR.rotation.x += (target - armR.rotation.x) * k; items.axe.rotation.x += (1.05 - items.axe.rotation.x) * k; }
      torso.rotation.y += (twist - torso.rotation.y) * (this.swingT > 0 ? 1 : kk);
      armR.rotation.z += (tz - armR.rotation.z) * k;
    },
  };
  player.setEquipped('axe');
  G.scene.add(root);
  return player;
}
