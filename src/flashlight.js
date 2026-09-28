// Flashlight: an old handheld torch. SpotLight with a lens "cookie" (hot core + reflector ring),
// tree shadows, a soft volumetric beam with drifting haze, dust motes caught in the cone, lens glow,
// lagged/swaying aim, bulb warm-up on click, battery drain + brown-out flicker, recharge by the fire.
import * as THREE from '../vendor/three.module.js';

// Beam response patch (r169 chunks): the flashlight's light is applied with a lightly desaturated albedo
// (so green grass reads neutral-warm under a warm-white beam instead of a lime pool), with a small wrap so
// grazing ground far down the path still catches light, and whatever the beam lights cuts through the
// night fog (the fog is near-black at ~20 m; without this the beam dies after a few metres).
(function patchChunks() {
  const C = THREE.ShaderChunk; if (C.lights_fragment_begin.includes('flSpot')) return;
  const lf = C.lights_fragment_begin, a = lf.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )'), b = lf.indexOf('#if ( NUM_DIR_LIGHTS > 0 )');
  const call = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if (a < 0 || b < a || !lf.slice(a, b).includes(call)) return;
  const mine = `{ float flNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.12 ) / 1.12 );
      vec3 flIrr = directLight.color * flNL;
      vec3 flDC = material.diffuseColor; float flLum = dot( flDC, vec3( 0.2126, 0.7152, 0.0722 ) );
      vec3 flAlb = mix( flDC, vec3( flLum ) * vec3( 1.08, 0.97, 0.86 ), 0.3 ) * 1.15;
      reflectedLight.directDiffuse += flIrr * BRDF_Lambert( flAlb ); flSpot += flIrr; }`;
  C.lights_fragment_begin = lf.slice(0, a).replace('IncidentLight directLight;', 'IncidentLight directLight;\nvec3 flSpot = vec3( 0.0 );\n#define FL_SPOT 1')
    + lf.slice(a, b).replace(call, mine) + lf.slice(b);
  C.fog_fragment = C.fog_fragment.replace('gl_FragColor.rgb = mix(',
    `#ifdef FL_SPOT
	fogFactor *= 1.0 - 0.93 * smoothstep( 0.015, 0.45, dot( flSpot, vec3( 0.3, 0.5, 0.2 ) ) );
	#endif
	gl_FragColor.rgb = mix(`);
})();

// Lens cookie: smooth, ring-free — slightly hotter centre, even body, soft warm edge.
function makeCookie() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1, r = Math.hypot(u, v);
    const b = (0.38 + 0.62 * Math.exp(-r * r * 3.2)) * (1 - smooth(0.35, 1.0, r)) + 0.0;
    const warm = smooth(0.3, 1.0, r);
    const i = (y * S + x) * 4;
    d[i] = 255 * b; d[i + 1] = 255 * b * (1 - warm * 0.05); d[i + 2] = 255 * b * (1 - warm * 0.14); d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

function glowTexture() {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,248,225,1)'); gr.addColorStop(0.25, 'rgba(255,226,160,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); return new THREE.CanvasTexture(c);
}

export function createFlashlight(G) {
  const { scene, camera, player } = G;
  const fl = { on: false, battery: 100, range: 60, angle: 0.44, flickerT: 0, lit: 0, power: 0, onT: 0, lowWarned: false };
  const WARM = new THREE.Color('#ffd9a8'), DYING = new THREE.Color('#ff9f4a'), tmpC = new THREE.Color();

  const spot = new THREE.SpotLight("#fff0d6", 0, fl.range, fl.angle, 0.95, 0.5);
  // no lens cookie: its projection clipped one side of the pool into a hard black arc; penumbra gives the soft hot centre
  spot.castShadow = true; spot.shadow.mapSize.set(512, 512); spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.03;
  spot.shadow.camera.near = 1.6; /* beyond hand/arm/body: the avatar never shadows its own beam */ spot.shadow.camera.far = fl.range; spot.shadow.autoUpdate = false;
  scene.add(spot, spot.target); fl.spot = spot;
  // wide soft spill around the hot beam (real torches throw a dim halo), so the ground lights up from
  // a metre in front of your feet instead of starting a few metres ahead
  const spill = new THREE.SpotLight('#ffe2c0', 0, 9, 0.7, 1.0, 2.0); scene.add(spill, spill.target);
  // light on the avatar itself: warm bounce off the lit ground in front of the hand (catches arm, hand,
  // side of the torso) + a faint cool kicker from behind the shoulder so the back never reads pure black
  const bounce = new THREE.PointLight('#ffd6a8', 0, 2.6, 1.4); scene.add(bounce);
  const kicker = new THREE.PointLight('#9fb4ff', 0, 3.6, 1.4); scene.add(kicker);
  let shoulderK = 0;

  // --- volumetric beam: two nested open cones, view-angle soft edges + drifting 3D haze ---
  const L = 30;
  const beamShader = (core) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uStrength: { value: 0 }, uColor: { value: new THREE.Color(core ? '#fff3d6' : '#ffdca0') }, uTime: { value: 0 } },
    vertexShader: `varying float vLen; varying vec3 vN; varying vec3 vView; varying vec3 vW;
      void main(){ vLen = position.z / ${L.toFixed(1)}; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
      vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uStrength; uniform vec3 uColor; uniform float uTime; varying float vLen; varying vec3 vN; varying vec3 vView; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x), mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x), mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x), f.y), f.z); }
      void main(){ float edge = 0.32 + 0.68 * pow(abs(dot(normalize(vN), normalize(vView))), ${core ? '2.0' : '1.3'});
        float t = clamp(vLen, 0.0, 1.0);
        float fade = pow(1.0 - t, ${core ? '1.5' : '1.1'}) * smoothstep(0.0, 0.03, t) * (1.0 + ${core ? '1.6' : '0.9'} * (1.0 - smoothstep(0.0, 0.18, t)));
        vec3 q = vW * 0.45 + vec3(uTime * 0.18, uTime * 0.05, -uTime * 0.12);
        float haze = 0.55 + 0.75 * n3(q) * n3(q * 2.3 + 7.0);
        gl_FragColor = vec4(uColor * edge * fade * haze * uStrength, 1.0); }`,
  });
  const coneGeo = (tipR, baseR) => { const g = new THREE.CylinderGeometry(tipR, baseR, L, 32, 1, true); g.translate(0, -L / 2, 0); g.rotateX(-Math.PI / 2); return g; };
  const beam = new THREE.Group(); beam.frustumCulled = false; scene.add(beam);
  const outerMat = beamShader(false), coreMat = beamShader(true);
  const outer = new THREE.Mesh(coneGeo(0.08, Math.tan(fl.angle) * L), outerMat);
  const core = new THREE.Mesh(coneGeo(0.05, Math.tan(fl.angle * 0.45) * L), coreMat);
  for (const m of [outer, core]) { m.frustumCulled = false; m.renderOrder = 5; beam.add(m); }

  // --- lens glow ---
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe9c0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.scale.setScalar(0.3); glow.renderOrder = 6; scene.add(glow);

  // --- dust motes drifting in the cone (only visible where the beam hits them) ---
  const N = 220, dpos = new Float32Array(N * 3), dcol = new Float32Array(N * 3), dvel = new Float32Array(N * 3);
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dustGeo.setAttribute('color', new THREE.BufferAttribute(dcol, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.06, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
  dust.frustumCulled = false; scene.add(dust);
  const seedMote = (i, anywhere) => {
    // scatter around the beam's first ~12 m
    const t = anywhere ? Math.random() : 0.02 + Math.random() * 0.1, dd = 0.5 + t * 12, spread = Math.tan(fl.angle) * dd * 1.3;
    tmpV.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0).multiplyScalar(spread);
    const p = fl.origin.clone().addScaledVector(fl.dir, dd).addScaledVector(rightV, tmpV.x).addScaledVector(upV, tmpV.y);
    dpos[i * 3] = p.x; dpos[i * 3 + 1] = p.y; dpos[i * 3 + 2] = p.z;
    dvel[i * 3] = (Math.random() - 0.5) * 0.15; dvel[i * 3 + 1] = (Math.random() - 0.4) * 0.08; dvel[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
  };

  const lens = new THREE.Vector3(), aim = new THREE.Vector3(), fwd = new THREE.Vector3(), want = new THREE.Vector3();
  const tmpV = new THREE.Vector3(), rightV = new THREE.Vector3(), upV = new THREE.Vector3(), WUP = new THREE.Vector3(0, 1, 0);
  fl.dir = new THREE.Vector3(0, 0, -1); fl.origin = new THREE.Vector3();
  let dustSeeded = false, shadowTick = 0;

  fl.setOn = (v) => {
    if (v && fl.battery <= 2) { G.events.emit('flashlightClick', { on: true }); G.events.emit('flashlightDead'); return; }
    if (v && player.equipped !== 'flashlight') G.survival.equip('flashlight');
    if (fl.on !== v) { fl.on = v; fl.onT = 0; G.events.emit('flashlightClick', { on: v }); }
  };
  fl.toggle = () => fl.setOn(!fl.on);
  // true if world point p (Vector3-like) is inside the lit cone
  fl.isLighting = (p, maxDist = fl.range * 0.9) => {
    if (!fl.on || fl.lit < 0.35) return false;
    const dx = p.x - fl.origin.x, dy = (p.y ?? 1.5) - fl.origin.y, dz = p.z - fl.origin.z;
    const d = Math.hypot(dx, dy, dz); if (d > maxDist || d < 0.01) return false;
    const cos = (dx * fl.dir.x + dy * fl.dir.y + dz * fl.dir.z) / d;
    return cos > Math.cos(fl.angle * 1.15 + 0.6 / Math.max(d, 1));
  };

  fl.update = (dt) => {
    const input = G.input;
    if (G.mode === 'playing') {
      if (input.pressed('KeyF')) fl.toggle();
      if (input.clicked('left') && player.equipped === 'flashlight') fl.toggle();
    }
    if (player.equipped !== 'flashlight' && fl.on) fl.on = false;
    fl.onT += dt;

    // battery: ~85 s of beam per charge; the fire recharges it
    if (fl.on) fl.battery = Math.max(0, fl.battery - dt * 1.18);
    if (G.campfire.inLight(G.controls.pos)) fl.battery = Math.min(100, fl.battery + dt * (fl.on ? 1.8 : 3.2));
    if (fl.on && fl.battery <= 0) { fl.on = false; G.events.emit('flashlightDead'); }
    if (fl.on && fl.battery < 20 && !fl.lowWarned) { fl.lowWarned = true; G.events.emit('flashlightLow'); }
    if (fl.battery > 30) fl.lowWarned = false;

    // power: bulb catches on with a tiny stutter, snaps off
    const target = fl.on ? 1 : 0;
    fl.power += (target - fl.power) * (1 - Math.exp(-dt * (fl.on ? 30 : 45)));
    let lit = fl.power;
    if (fl.on && fl.onT < 0.16) lit *= fl.onT < 0.05 ? 0.35 : fl.onT < 0.09 ? 0.9 : fl.onT < 0.12 ? 0.55 : 1;
    // low battery: brown-out dimming + random stutters, worse as it dies
    const bf = smooth(0, 25, fl.battery);
    if (fl.on && fl.battery < 20) {
      fl.flickerT -= dt;
      if (fl.flickerT <= 0) fl.flickerT = Math.random() * (0.25 + fl.battery / 20 * 1.6) + 0.04;
      if (fl.flickerT < 0.1) lit *= Math.random() < 0.55 ? 0.03 : 0.35;
      lit *= 0.9 + 0.1 * Math.sin(G.time * 23) * Math.sin(G.time * 7.3); // weak-contact buzz
    }
    lit *= 0.42 + 0.58 * bf;
    fl.lit = lit;

    // over-the-shoulder offset while holding the torch: slide the camera right so the avatar sits left of
    // the beam instead of standing in the middle of it (runs after controls, so it rides on its result)
    const holding = player.equipped === 'flashlight' && G.mode === 'playing';
    shoulderK += ((holding ? 1 : 0) - shoulderK) * (1 - Math.exp(-dt * 5));
    if (shoulderK > 0.001) {
      rightV.set(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(rightV, 0.62 * shoulderK); camera.position.y -= 0.12 * shoulderK;
      camera.updateMatrixWorld();
    }

    // aim: lens in hand, pointed at what the camera looks at (ground hit or far point), with lag + sway
    player.items.flashlight.updateWorldMatrix(true, true);
    lens.set(0, 0.64, 0); player.items.flashlight.localToWorld(lens);
    camera.getWorldDirection(fwd);
    // aim far down the view line; keep the aim point off the ground so the beam throws down the path
    // (floor of the cone lands ~4 m ahead, the body reaches ~30 m) instead of pooling at your feet
    aim.copy(camera.position).addScaledVector(fwd, 30);
    aim.y = Math.max(aim.y, lens.y - 30 * 0.12);
    want.copy(aim).sub(lens).normalize();
    // hand sway: walk bob + slow breathing drift
    const ws = player.walkPhase || 0, moving = (G.controls.speed || 0) > 0.3, sprint = G.controls.sprinting ? 1.8 : 1;
    rightV.crossVectors(want, WUP).normalize(); upV.crossVectors(rightV, want).normalize();
    const swayX = (moving ? Math.sin(ws) * 0.022 * sprint : 0) + Math.sin(G.time * 0.9) * 0.006 + Math.sin(G.time * 2.3) * 0.002;
    const swayY = (moving ? Math.abs(Math.cos(ws)) * 0.018 * sprint - 0.009 : 0) + Math.sin(G.time * 1.3 + 1) * 0.005;
    want.addScaledVector(rightV, swayX).addScaledVector(upV, swayY).normalize();
    if (fl.dir.lengthSq() < 0.5 || fl.power < 0.01) fl.dir.copy(want);
    else fl.dir.lerp(want, 1 - Math.exp(-dt * 6.5)).normalize();
    fl.origin.copy(lens);

    // light emitted a little ahead of the lens so the holder's hand/arm can never occlude it
    spot.position.copy(lens).addScaledVector(fl.dir, 0.3); spot.target.position.copy(lens).addScaledVector(fl.dir, 30);
    spot.updateMatrixWorld(); spot.target.updateMatrixWorld();
    const dark = G.daynight.darkness ?? 1;
    tmpC.copy(WARM).lerp(DYING, 1 - bf);
    spot.color.copy(tmpC);
    spot.intensity = 95 * lit * (0.55 + 0.45 * dark);
    // shadows only while lit (every other frame is enough for a hand-held light)
    shadowTick = (shadowTick + 1) % 2;
    spot.shadow.needsUpdate = lit > 0.02 && shadowTick === 0;

    // spill + avatar lighting
    spill.position.copy(lens); spill.target.position.copy(lens).addScaledVector(fl.dir, 6); spill.target.position.y -= 1.2;
    spill.updateMatrixWorld(); spill.target.updateMatrixWorld();
    spill.color.copy(tmpC); spill.intensity = 1.2 * lit * (0.4 + 0.6 * dark);
    bounce.position.copy(lens).addScaledVector(fl.dir, 0.9).addScaledVector(rightV, 0.25); bounce.position.y = Math.max(1.15, bounce.position.y - 0.1);
    bounce.color.copy(tmpC); bounce.intensity = 1.1 * lit * (0.3 + 0.7 * dark);
    camera.getWorldDirection(fwd); rightV.set(1, 0, 0).applyQuaternion(camera.quaternion);
    kicker.position.copy(player.root.position).addScaledVector(fwd, -1.3).addScaledVector(rightV, 0.5); kicker.position.y += 2.3;
    kicker.intensity = 0; // removed: lit nearby canopy/trunks as a teal blob; moonlight fill (daynight) keeps the avatar readable

    const vis = lit > 0.02;
    beam.visible = vis; glow.visible = vis; dust.visible = vis && dark > 0.25;
    beam.position.copy(lens); beam.lookAt(tmpV.copy(lens).add(fl.dir));
    const bs = lit * (0.25 + dark * 0.75);
    outerMat.uniforms.uStrength.value = 0.5 * bs; coreMat.uniforms.uStrength.value = 0.45 * bs;
    outerMat.uniforms.uTime.value = coreMat.uniforms.uTime.value = G.time;
    outerMat.uniforms.uColor.value.copy(tmpC);
    glow.position.copy(lens).addScaledVector(fl.dir, 0.06);
    glow.material.opacity = Math.min(0.75, lit * 0.8); glow.scale.setScalar(0.22 + 0.12 * lit);
    player.lensMat.color.copy(tmpC).multiplyScalar(lit > 0.3 ? 1 : 0.25 + lit);

    // dust
    if (dust.visible) {
      if (!dustSeeded) { for (let i = 0; i < N; i++) seedMote(i, true); dustSeeded = true; }
      const cosA = Math.cos(fl.angle * 0.95);
      for (let i = 0; i < N; i++) {
        const k = i * 3;
        dpos[k] += dvel[k] * dt + Math.sin(G.time * 0.7 + i) * 0.02 * dt;
        dpos[k + 1] += dvel[k + 1] * dt + Math.sin(G.time * 0.5 + i * 1.7) * 0.015 * dt;
        dpos[k + 2] += dvel[k + 2] * dt;
        const dx = dpos[k] - lens.x, dy = dpos[k + 1] - lens.y, dz = dpos[k + 2] - lens.z, d = Math.hypot(dx, dy, dz);
        const c = d > 0.01 ? (dx * fl.dir.x + dy * fl.dir.y + dz * fl.dir.z) / d : 0;
        if (d > 13.5 || c < cosA * 0.9) { seedMote(i, Math.random() < 0.5); dcol[k] = dcol[k + 1] = dcol[k + 2] = 0; continue; }
        const inCone = smooth(cosA, 1, c) * 0.7 + smooth(cosA * 0.985, cosA, c) * 0.3;
        const twinkle = 0.6 + 0.4 * Math.sin(G.time * 3 + i * 12.9);
        const b = inCone * (1 - d / 13.5) * smooth(0.35, 1.4, d) * lit * twinkle * 0.8;
        dcol[k] = b; dcol[k + 1] = b * 0.9; dcol[k + 2] = b * 0.72;
      }
      dustGeo.attributes.position.needsUpdate = true; dustGeo.attributes.color.needsUpdate = true;
    } else dustSeeded = false;
  };
  return fl;
}
