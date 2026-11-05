// Procedural WebAudio for LAST LIGHT. Everything is synthesized: no samples.
// Beds: wind + leaf rustle, fire roar/crackle (spatial), night drone that swells with threat.
// Critters: birds by day, crickets / owl / distant wolf howls at night.
// Monsters: continuous spatial loops (Deer wet breathing, Bear huffing) with distance + direction + muffling,
// twig snaps near a stalking Deer, bellow telegraph before a lunge, pounding paws on a Bear charge.
// SFX: footsteps, axe, tree fall, flashlight click on/off, eat, pickup, stingers, heartbeat.
// Debug: window.__audio.state() -> plain JSON (ctx state, bed gains, loop gains, recent events). M toggles mute.
export function createAudio(G) {
  const A = { ctx: null, started: false, muted: false, threat: 0, log: [], counts: {} };
  let ctx, master, muteGain, noise, brown;
  let tensionGain, tensionFilter, tensionOsc = [], hbFilter;
  let windGain, windFilter, rustleGain, rustleFilter, fireGain, fireFilter, firePan, droneGain, droneFilter, dayPadGain;
  const loops = {};
  let nextRustle = 0, nextBearStep = 0, seenT = 0, unseenT = 0, lastSting = -99, deerStingArmed = true, prevDeerState = 'hidden', visCheckT = 0, lastDX = 0, lastDZ = 0, deerSpeed = 0, lastBX = 0, lastBZ = 0;
  const vis = { dist: 0, occ: 0, inView: false, visible: false, range: 0 };
  let birdBus = null, threatHold = 0, nextHuff = 0, bearMovingNow = false, bearProx = 0;
  let nextCricket = 0, nextBird = 0, nextCrackle = 0, nextBeat = 0, nextHowl = 0, nextOwl = 0, nextTwig = 0, nextPaw = 0, duskDay = 0;
  let fireBus, fireMuffle, flutterF, flutterGain, hissF, hissGain, crackSubs = [], clickBufs = [], popBufs = [], nextPop = 0, nextRoar = 0;
  const fireStats = { dist: 0, fall: 0, fuelK: 0, level: 1, rate: 0, crackles: 0, pops: 0, sizzles: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // ---- fire one-shots are pre-rendered once into small buffers, so each crackle is just BufferSource -> Gain
  // crackle: a sub-millisecond noise snap blended with a short resonant "tick" (wood fibre / ember burst)
  const mkCrackleBuf = () => { const sr = ctx.sampleRate, n = Math.floor(sr * 0.035), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const f = 1100 + Math.random() * 5200, dec = 0.0007 + Math.random() * 0.0035, w = 2 * Math.PI * f / sr, r = Math.exp(-1 / (sr * dec)), a1 = 2 * r * Math.cos(w), a2 = -r * r;
    const res = new Float32Array(n); let y1 = 0, y2 = 0, pr = 1e-9, pi = 1e-9;
    for (let i = 0; i < n; i++) { const imp = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.00035)); const y = imp + a1 * y1 + a2 * y2; y2 = y1; y1 = y; res[i] = y; d[i] = imp; pr = Math.max(pr, Math.abs(y)); pi = Math.max(pi, Math.abs(imp)); }
    const mix = 0.35 + Math.random() * 0.4; let pk = 1e-9;
    for (let i = 0; i < n; i++) { d[i] = d[i] / pi * (1 - mix) + res[i] / pr * mix; pk = Math.max(pk, Math.abs(d[i])); }
    for (let i = 0; i < n; i++) d[i] = d[i] / pk * (i > n - 64 ? (n - i) / 64 : 1);
    return b; };
  // pop: a sap pocket bursting. Hard transient + a low woody body that drops in pitch + a bright snap
  const mkPopBuf = () => { const sr = ctx.sampleRate, n = Math.floor(sr * 0.2), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const f0 = 130 + Math.random() * 240, fs = 1800 + Math.random() * 1600, w = 2 * Math.PI * fs / sr, r = Math.exp(-1 / (sr * 0.004)), a1 = 2 * r * Math.cos(w), a2 = -r * r;
    let ph = 0, y1 = 0, y2 = 0, pk = 1e-9;
    for (let i = 0; i < n; i++) { const t = i / sr, nz = Math.random() * 2 - 1; ph += 2 * Math.PI * f0 * (1 - 0.35 * t / 0.2) / sr;
      const snapIn = nz * Math.exp(-t / 0.003), y = snapIn + a1 * y1 + a2 * y2; y2 = y1; y1 = y;
      d[i] = nz * Math.exp(-t / 0.0012) * 1.0 + Math.sin(ph) * Math.exp(-t / 0.022) * 0.7 + y * 0.012; pk = Math.max(pk, Math.abs(d[i])); }
    for (let i = 0; i < n; i++) d[i] = d[i] / pk * (i > n - 128 ? (n - i) / 128 : 1);
    return b; };
  // distance -> fire loudness: full on top of it, ~-18 dB at the 14 m camp edge, gone by ~48 m
  const fireFall = (d) => Math.pow(clamp(1 - d / 48, 0, 1), 1.5) / (1 + Math.pow(Math.max(0, d - 1.5) / 5, 1.6));
  const fuelKOf = (fuel) => fuel > 0 ? 0.3 + 0.7 * Math.min(1, fuel / 70) : 0;
  const note = (name) => { A.counts[name] = (A.counts[name] || 0) + 1; A.log.push({ ev: name, t: +(ctx ? ctx.currentTime : 0).toFixed(2) }); if (A.log.length > 30) A.log.shift(); };

  const makeLoopSrc = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * 2); return s; };
  // a spatial continuous loop: source -> filter -> gain -> panner -> master
  const makeLoop = (name, buf, rate, ftype, freq, q) => {
    const src = makeLoopSrc(buf, rate), f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const mf = ctx.createBiquadFilter(); mf.type = 'lowpass'; mf.frequency.value = 8000; // distance / behind muffle
    const g = ctx.createGain(); g.gain.value = 0; const p = ctx.createStereoPanner();
    src.connect(f).connect(mf).connect(g).connect(p).connect(master);
    return (loops[name] = { src, f, mf, g, p, level: 0 });
  };

  const start = () => {
    if (A.started) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = A.ctx = new AC(); A.started = true;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    muteGain = ctx.createGain(); muteGain.gain.value = A.muted ? 0 : 1;
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
    birdBus = ctx.createGain(); birdBus.gain.value = 1; birdBus.connect(master); // birds route here so any bear/deer threat can hard-mute them instantly (incl. already-scheduled chirps)
    comp.connect(muteGain); muteGain.connect(ctx.destination); // (this line used to sit inside the comment above, so nothing reached the speakers)
    A.master = master; // music.js mixes into this same bus (same compressor, same M mute)
    // white + brown noise buffers
    const len = ctx.sampleRate * 3;
    noise = ctx.createBuffer(1, len, ctx.sampleRate); const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    brown = ctx.createBuffer(1, len, ctx.sampleRate); const b = brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // wind bed (brown noise, bandpassed, gusting)
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 420; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0.05; makeLoopSrc(brown).connect(windFilter).connect(windGain).connect(master);
    // leaf rustle (high white noise that rides the gusts)
    rustleFilter = ctx.createBiquadFilter(); rustleFilter.type = 'highpass'; rustleFilter.frequency.value = 3500;
    rustleGain = ctx.createGain(); rustleGain.gain.value = 0; makeLoopSrc(noise, 0.9).connect(rustleFilter).connect(rustleGain).connect(master);
    // campfire voice, all into one spatial fire bus (distance gain -> distance/behind muffle -> pan):
    // low roar (brown noise, lowpassed, "breathing"), a fluttering mid band, a thin hiss, plus scheduled crackles and pops
    fireBus = ctx.createGain(); fireBus.gain.value = 0; fireMuffle = ctx.createBiquadFilter(); fireMuffle.type = 'lowpass'; fireMuffle.frequency.value = 12000; firePan = ctx.createStereoPanner();
    fireBus.connect(fireMuffle).connect(firePan).connect(master);
    fireFilter = ctx.createBiquadFilter(); fireFilter.type = 'lowpass'; fireFilter.frequency.value = 380; fireFilter.Q.value = 0.9;
    fireGain = ctx.createGain(); fireGain.gain.value = 0; makeLoopSrc(brown, 0.8).connect(fireFilter).connect(fireGain).connect(fireBus);
    flutterF = ctx.createBiquadFilter(); flutterF.type = 'bandpass'; flutterF.frequency.value = 650; flutterF.Q.value = 0.8;
    flutterGain = ctx.createGain(); flutterGain.gain.value = 0; makeLoopSrc(brown, 1.7).connect(flutterF).connect(flutterGain).connect(fireBus);
    hissF = ctx.createBiquadFilter(); hissF.type = 'highpass'; hissF.frequency.value = 5200;
    hissGain = ctx.createGain(); hissGain.gain.value = 0; makeLoopSrc(noise, 1).connect(hissF).connect(hissGain).connect(fireBus);
    crackSubs = [-0.5, -0.17, 0.17, 0.5].map((p) => { const g = ctx.createGain(), sp = ctx.createStereoPanner(); sp.pan.value = p; g.connect(sp).connect(fireBus); return g; });
    clickBufs = Array.from({ length: 12 }, mkCrackleBuf); popBufs = Array.from({ length: 6 }, mkPopBuf);
    // night drone: detuned low saws through a slow-moving lowpass; swells with threat
    droneFilter = ctx.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 220; droneFilter.Q.value = 4;
    droneGain = ctx.createGain(); droneGain.gain.value = 0; droneFilter.connect(droneGain).connect(master);
    for (const [f, dt] of [[41.2, -7], [41.2, 6], [61.7, 3], [87.3, -11]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(droneFilter); o.start(); }
    // day pad: very soft warm triangles (A major-ish), makes daytime feel safe
    dayPadGain = ctx.createGain(); dayPadGain.gain.value = 0; const padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 900;
    padF.connect(dayPadGain).connect(master);
    for (const f of [220, 277.2, 329.6, 440]) { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 12; o.connect(padF); o.start(); }
    // tension bed: close minor-second sines + thin high whine, pitch and gain rise with stalking dread
    tensionFilter = ctx.createBiquadFilter(); tensionFilter.type = 'bandpass'; tensionFilter.frequency.value = 700; tensionFilter.Q.value = 0.7;
    tensionGain = ctx.createGain(); tensionGain.gain.value = 0; tensionFilter.connect(tensionGain).connect(master);
    for (const [f, ty, lv] of [[233.1, 'triangle', 1], [246.9, 'triangle', 0.9], [349.2, 'sine', 0.5], [1864, 'sine', 0.18]]) { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = lv; o.connect(g).connect(tensionFilter); o.start(); tensionOsc.push({ o, f }); }
    // heartbeat bus: lowpassed so it reads as a chest thump
    hbFilter = ctx.createBiquadFilter(); hbFilter.type = 'lowpass'; hbFilter.frequency.value = 180; hbFilter.connect(master);
    // monster loops
    makeLoop('deerBreath', noise, 0.5, 'bandpass', 520, 3);
    makeLoop('bearBreath', brown, 0.6, 'lowpass', 260, 2);
    note('start');
  };
  G.events.on('gesture', start);
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  addEventListener('keydown', (e) => { if (e.code === 'KeyM' && !e.repeat) { A.setMuted(!A.muted); } });
  A.setMuted = (m) => { A.muted = !!m; if (muteGain) muteGain.gain.setTargetAtTime(A.muted ? 0 : 1, ctx.currentTime, 0.05); return A.muted; };

  const now = () => ctx.currentTime;
  const out = (gain = 1, panV = 0, bus = null) => { const dst = bus || master, g = ctx.createGain(); g.gain.value = gain; if (panV && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(panV, -1, 1); g.connect(p).connect(dst); } else g.connect(dst); return g; };
  const env = (g, t, a, peak, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); };
  const noiseBurst = ({ t = now(), dur = 0.1, type = 'lowpass', freq = 800, q = 1, gain = 0.2, pan = 0, attack = 0.005, rate = 1, sweepTo = 0, buf = null }) => {
    const s = ctx.createBufferSource(); s.buffer = buf || noise; s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(freq, t); fl.Q.value = q; if (sweepTo) fl.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); env(g, t, attack, gain, dur); s.connect(fl).connect(g).connect(out(1, pan)); s.start(t, Math.random() * 2); s.stop(t + dur + 0.05);
  };
  const tone = ({ t = now(), type = 'sine', f0 = 440, f1 = 0, dur = 0.2, gain = 0.1, attack = 0.005, pan = 0, filter = 0, q = 1, detune = 0, bus = null }) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.detune.value = detune;
    const g = ctx.createGain(); env(g, t, attack, gain, dur);
    let n = o; if (filter) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; fl.Q.value = q; o.connect(fl); n = fl; }
    n.connect(g).connect(out(1, pan, bus)); o.start(t); o.stop(t + dur + 0.05); return o;
  };
  // pan, distance attenuation and "behind you" factor for a world position, relative to the camera
  const spatial = (x, z, maxD = 40) => {
    const cam = G.camera, dx = x - cam.position.x, dz = z - cam.position.z, dist = Math.hypot(dx, dz) || 1;
    const yaw = G.controls.yaw, rx = Math.cos(yaw), rz = -Math.sin(yaw), fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    return { pan: (dx * rx + dz * rz) / dist * 0.85, vol: Math.max(0, 1 - dist / maxD) ** 1.3, behind: (dx * fx + dz * fz) / dist < -0.2, dist };
  };
  const ok = () => A.started && ctx && ctx.state === 'running';
  // fire one-shots, scheduled at exact times into the fire bus (so distance, pan and muffle apply)
  const crackleAt = (tt, k) => { const n = Math.random() < 0.58 ? 1 : Math.random() < 0.75 ? 2 + (Math.random() * 2 | 0) : 4 + (Math.random() * 5 | 0);
    const sub = crackSubs[(Math.random() * crackSubs.length) | 0]; let x = tt, amp = (0.05 + 0.42 * Math.random() ** 2.2) * (0.55 + 0.45 * k);
    for (let i = 0; i < n; i++) { const s = ctx.createBufferSource(); s.buffer = clickBufs[(Math.random() * clickBufs.length) | 0]; s.playbackRate.value = 0.65 + Math.random() * 0.9;
      const g = ctx.createGain(); g.gain.value = amp; s.connect(g).connect(sub); s.start(x); x += 0.004 + Math.random() * 0.04; amp *= 0.5 + Math.random() * 0.45; }
    fireStats.crackles += n; };
  const sizzle = (tt, dur, gain, sub) => { const s = ctx.createBufferSource(); s.buffer = noise; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(5000 + Math.random() * 3000, tt); f.frequency.linearRampToValueAtTime(3500 + Math.random() * 2000, tt + dur); f.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(gain, tt + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
    s.connect(f).connect(g).connect(sub); s.start(tt, Math.random() * 2); s.stop(tt + dur + 0.05); fireStats.sizzles++; };
  const popAt = (tt, k, lvl) => { const sub = crackSubs[(Math.random() * crackSubs.length) | 0], s = ctx.createBufferSource(); s.buffer = popBufs[(Math.random() * popBufs.length) | 0];
    s.playbackRate.value = (0.8 + Math.random() * 0.45) * (1 - 0.05 * (lvl - 1)); const g = ctx.createGain(); g.gain.value = (0.2 + 0.35 * Math.random()) * (0.5 + 0.5 * k); s.connect(g).connect(sub); s.start(tt);
    if (Math.random() < 0.3) sizzle(tt + 0.05 + Math.random() * 0.1, 0.3 + Math.random() * 0.7, 0.02 + 0.03 * k, sub); // steam hissing out of the split
    if (Math.random() < 0.4) crackleAt(tt + 0.03 + Math.random() * 0.08, k); fireStats.pops++; };

  const on = (ev, fn) => G.events.on(ev, (d) => { if (ok()) { note(ev); fn(d || {}); } });
  let stepAlt = 0;
  on('footstep', (d) => { stepAlt ^= 1; const pan = stepAlt ? -0.08 : 0.08, night = G.daynight.darkness > 0.6;
    noiseBurst({ dur: 0.09, freq: 480 + Math.random() * 260, gain: d.sprint ? 0.16 : 0.11, q: 0.8, pan, buf: brown, rate: 1.4 });
    noiseBurst({ dur: 0.06, type: 'bandpass', freq: 2600 + Math.random() * 1400, q: 1.2, gain: 0.03 + (d.sprint ? 0.02 : 0), pan }); // grass swish
    if (night && Math.random() < 0.08) noiseBurst({ t: now() + 0.03, dur: 0.03, type: 'bandpass', freq: 1800, q: 5, gain: 0.08, pan }); // twig under foot
  });
  on('jump', () => noiseBurst({ dur: 0.12, freq: 600, gain: 0.08 }));
  on('land', () => { tone({ f0: 90, f1: 45, dur: 0.15, gain: 0.2 }); noiseBurst({ dur: 0.12, freq: 400, gain: 0.15, buf: brown }); });
  on('swing', () => noiseBurst({ dur: 0.18, type: 'bandpass', freq: 500, sweepTo: 2200, q: 2, gain: 0.08, attack: 0.04 }));
  on('treeHit', () => { const p = (Math.random() - .5) * 0.2; tone({ f0: 180 + Math.random() * 30, f1: 70, dur: 0.14, gain: 0.35, type: 'triangle', pan: p }); noiseBurst({ dur: 0.08, type: 'bandpass', freq: 1100, q: 1.5, gain: 0.3, pan: p }); noiseBurst({ t: now() + 0.02, dur: 0.25, type: 'bandpass', freq: 3000, q: 4, gain: 0.03 }); tone({ t: now() + 0.01, f0: 340, f1: 300, dur: 0.35, gain: 0.03, type: 'sine' }); });
  on('treeFall', () => { const t = now(); tone({ t, type: 'sawtooth', f0: 95, f1: 55, dur: 1.1, gain: 0.08, filter: 500, q: 6, attack: 0.1 }); for (let k = 1; k < 4; k++) tone({ t: t + 0.4 + k * 0.6, type: 'sawtooth', f0: 80 + k * 6, f1: 60, dur: 0.6, gain: 0.05 + k * 0.012, filter: 480, q: 7, attack: 0.15 }); for (let i = 0; i < 7; i++) noiseBurst({ t: t + i * 0.1 + Math.random() * 0.05, dur: 0.05, type: 'bandpass', freq: 1500 + Math.random() * 900, q: 3, gain: 0.09 }); noiseBurst({ t: t + 0.3, dur: 1.0, type: 'highpass', freq: 3000, gain: 0.05, attack: 0.3 }); });
  on('treeLand', (d) => { const s = spatial(d.x, d.z, 50); tone({ f0: 70, f1: 28, dur: 0.7, gain: 0.5 * s.vol + 0.1, pan: s.pan }); noiseBurst({ dur: 0.8, freq: 350, gain: 0.35, pan: s.pan, attack: 0.01, buf: brown }); noiseBurst({ t: now() + 0.05, dur: 1.2, type: 'highpass', freq: 2500, gain: 0.05, attack: 0.05 }); G.controls.shake = Math.max(G.controls.shake || 0, 0.12 * s.vol); });
  on('treeTopple', (d) => { const T = d.tree || {}, s = spatial(T.x ?? G.controls.pos.x, T.z ?? G.controls.pos.z, 50), t = now();
    tone({ t, type: 'sawtooth', f0: 110, f1: 40, dur: 1.3, gain: 0.1, filter: 420, q: 8, attack: 0.05, pan: s.pan }); // tearing groan as it goes
    for (let i = 0; i < 9; i++) noiseBurst({ t: t + i * 0.07 + Math.random() * 0.04, dur: 0.04, type: 'bandpass', freq: 1200 + Math.random() * 1400, q: 3, gain: 0.1, pan: s.pan }); // fibres snapping
    noiseBurst({ t: t + 0.2, dur: 1.1, type: 'bandpass', freq: 600, sweepTo: 2400, q: 0.7, gain: 0.08, attack: 0.7, pan: s.pan }); }); // branch whoosh into the crash
  on('treeSplit', () => { const t = now(); tone({ t, f0: 220, f1: 90, dur: 0.12, gain: 0.3, type: 'triangle' }); noiseBurst({ t, dur: 0.12, type: 'bandpass', freq: 1400, q: 1.5, gain: 0.25 }); noiseBurst({ t: t + 0.05, dur: 0.3, type: 'bandpass', freq: 2600, q: 3, gain: 0.06 }); tone({ t: t + 0.25, f0: 140, f1: 70, dur: 0.12, gain: 0.15, type: 'triangle' }); });
  on('bearSwipe', () => { killBirds(25, 'swipe');  const s = spatial(G.bear.pos.x, G.bear.pos.z, 20), t = now(); noiseBurst({ t, dur: 0.22, type: 'bandpass', freq: 700, sweepTo: 2600, q: 1.2, gain: 0.22, attack: 0.02, pan: s.pan }); tone({ t, type: 'sawtooth', f0: 130, f1: 70, dur: 0.5, gain: 0.16, filter: 700, pan: s.pan }); for (let i = 0; i < 3; i++) noiseBurst({ t: t + 0.12 + i * 0.03, dur: 0.03, type: 'highpass', freq: 3500, gain: 0.1, pan: s.pan }); });
  on('flashlightLow', () => { const t = now(); for (let i = 0; i < 3; i++) tone({ t: t + i * 0.14, f0: 1250 - i * 180, dur: 0.06, gain: 0.04, type: 'square', filter: 3000 }); noiseBurst({ t: t + 0.45, dur: 0.15, type: 'highpass', freq: 5000, gain: 0.02 }); });
  on('exhausted', () => { const t = now(); for (let i = 0; i < 4; i++) { noiseBurst({ t: t + i * 0.55, dur: 0.28, type: 'bandpass', freq: 1100, q: 1.2, gain: 0.07 - i * 0.012, attack: 0.08 }); noiseBurst({ t: t + i * 0.55 + 0.3, dur: 0.22, type: 'bandpass', freq: 800, q: 1.2, gain: 0.05 - i * 0.008, attack: 0.05 }); } });
  on('fireFlare', () => { const s = spatial(G.campfire.x, G.campfire.z, 40), t = now(); noiseBurst({ t, dur: 0.9, type: 'bandpass', freq: 300, sweepTo: 1800, q: 0.7, gain: 0.1 + 0.2 * s.vol, attack: 0.08, pan: s.pan, buf: brown }); tone({ t, f0: 55, f1: 95, dur: 0.8, gain: 0.08 + 0.1 * s.vol, attack: 0.1 }); for (let i = 0; i < 8; i++) noiseBurst({ t: t + 0.1 + Math.random() * 0.8, dur: 0.02, type: 'highpass', freq: 3000, gain: 0.05 + 0.1 * s.vol, pan: s.pan }); });
  on('deerBellow', () => {}); // counted; the bellow itself plays on deerState 'approach' so it is not doubled
  on('duskWarning', () => { if (duskDay !== G.daynight.day) { duskDay = G.daynight.day; stinger([55, 82.4], 4, 0.05, 'sawtooth', 350); howl(); } });
  on('pickup', () => { tone({ f0: 300, f1: 200, dur: 0.1, gain: 0.12, type: 'triangle' }); noiseBurst({ dur: 0.06, freq: 900, gain: 0.08 }); tone({ t: now() + 0.05, f0: 660, f1: 880, dur: 0.08, gain: 0.03 }); });
  on('fireFed', () => { const s = spatial(G.campfire.x, G.campfire.z, 30); noiseBurst({ dur: 0.7, type: 'bandpass', freq: 400, sweepTo: 1600, q: 0.8, gain: 0.25, attack: 0.1, pan: s.pan, buf: brown }); tone({ f0: 70, f1: 110, dur: 0.6, gain: 0.12, attack: 0.08 }); for (let i = 0; i < 10; i++) noiseBurst({ t: now() + 0.1 + Math.random() * 1.0, dur: 0.02, type: 'highpass', freq: 2500, gain: 0.12, pan: s.pan + (Math.random() - .5) * 0.3 }); });
  on('eat', () => { for (let i = 0; i < 3; i++) noiseBurst({ t: now() + i * 0.13, dur: 0.07, type: 'bandpass', freq: 1500 + Math.random() * 800, q: 2, gain: 0.12 }); tone({ t: now() + 0.42, f0: 520, f1: 780, dur: 0.12, gain: 0.03 }); });
  on('equip', () => noiseBurst({ dur: 0.06, type: 'bandpass', freq: 1200, q: 2, gain: 0.07 }));
  // flashlight: two-part mechanical click, higher on "on", lower thunk on "off"
  on('flashlightClick', (d) => { const up = d.on !== false, t = now();
    tone({ t, f0: up ? 2600 : 1700, dur: 0.018, gain: 0.08, type: 'square' }); noiseBurst({ t, dur: 0.025, type: 'highpass', freq: 4000, gain: 0.07 });
    tone({ t: t + 0.035, f0: up ? 1900 : 1200, dur: 0.015, gain: 0.04, type: 'square' }); if (up) tone({ t: t + 0.02, f0: 9000, dur: 0.25, gain: 0.004, attack: 0.05 }); });
  on('flashlightDead', () => { tone({ f0: 1400, dur: 0.02, gain: 0.05, type: 'square' }); tone({ t: now() + 0.08, f0: 1400, dur: 0.02, gain: 0.05, type: 'square' }); tone({ t: now() + 0.1, f0: 300, f1: 90, dur: 0.4, gain: 0.03, type: 'sine' }); });
  on('damage', () => { tone({ f0: 120, f1: 50, dur: 0.3, gain: 0.45 }); noiseBurst({ dur: 0.2, freq: 900, gain: 0.3 }); tone({ t: now() + 0.02, type: 'sawtooth', f0: 2400, f1: 2300, dur: 0.9, gain: 0.015, filter: 3000, attack: 0.02 }); }); // ear-ring
  // any bear threat event hard-ducks the bird scheduler for a while (no birdsong over an attack)
  const killBirds = (hold, why) => { threatHold = Math.max(threatHold, now() + hold); if (birdBus) { birdBus.gain.cancelScheduledValues(now()); birdBus.gain.setTargetAtTime(0, now(), 0.03); A.birdBusT = 0; } note('birdDuck:' + why); };
  on('bearGrowl', () => { killBirds(20, 'growl');  const s = spatial(G.bear.pos.x, G.bear.pos.z, 45); const t = now(), g = 0.25 * s.vol + 0.03, flt = s.behind ? 260 : 380;
    for (const f of [62, 71, 93]) { const o = tone({ t, type: 'sawtooth', f0: f, f1: f * 0.8, dur: 1.4, gain: g * 0.5, filter: flt, q: 3, attack: 0.25, pan: s.pan }); const lfo = ctx.createOscillator(); lfo.frequency.value = 9 + Math.random() * 4; const lg = ctx.createGain(); lg.gain.value = f * 0.15; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.5); }
    noiseBurst({ t, dur: 1.3, freq: 300, gain: g * 0.6, attack: 0.3, pan: s.pan, buf: brown }); });
  on('bearRoar', () => { killBirds(25, 'roar');  const s = spatial(G.bear.pos.x, G.bear.pos.z, 45); const t = now();
    for (const f of [85, 110, 150]) tone({ t, type: 'sawtooth', f0: f, f1: f * 0.6, dur: 1.6, gain: 0.18, filter: 900, q: 2, attack: 0.08, pan: s.pan });
    noiseBurst({ t, dur: 1.5, type: 'bandpass', freq: 600, q: 0.7, gain: 0.35, attack: 0.08, pan: s.pan }); });
  on('bearHit', () => { tone({ f0: 160, f1: 80, dur: 0.15, gain: 0.35, type: 'triangle' }); noiseBurst({ dur: 0.1, type: 'bandpass', freq: 700, q: 1, gain: 0.25, buf: brown }); tone({ type: 'sawtooth', f0: 220, f1: 120, dur: 0.5, gain: 0.15, filter: 1200 }); });
  on('bearDeath', () => { tone({ type: 'sawtooth', f0: 140, f1: 40, dur: 2, gain: 0.2, filter: 700, attack: 0.05 }); const s = spatial(G.bear.pos.x, G.bear.pos.z, 45); tone({ t: now() + 1.2, f0: 60, f1: 30, dur: 0.6, gain: 0.35, pan: s.pan }); });
  const screech = (gain = 0.2) => { const t = now(), s = spatial(G.deer.pos.x, G.deer.pos.z, 60);
    const ws = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 4); } ws.curve = c;
    const g = ctx.createGain(); env(g, t, 0.03, gain, 1.4); ws.connect(g).connect(out(1, s.pan));
    for (const f of [820, 1130, 1470, 1990]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 1.35, t + 0.25); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 1.3); o.connect(ws); o.start(t); o.stop(t + 1.5); }
    noiseBurst({ t, dur: 1.2, type: 'highpass', freq: 2000, gain: gain * 0.5, attack: 0.02, pan: s.pan }); };
  on('deerScreech', () => screech(0.22));
  on('deerHit', () => screech(0.28));
  on('deerFlinch', () => { const s = spatial(G.deer.pos.x, G.deer.pos.z, 60); tone({ type: 'sawtooth', f0: 600, f1: 300, dur: 0.5, gain: 0.08, filter: 2500, pan: s.pan }); noiseBurst({ dur: 0.4, type: 'bandpass', freq: 900, sweepTo: 400, q: 2, gain: 0.08, pan: s.pan }); });
  // Deer telegraph: a guttural bellow that rises as it starts to close in (the "always a warning" rule)
  const bellow = () => { const s = spatial(G.deer.pos.x, G.deer.pos.z, 60), t = now(), g = 0.1 + 0.12 * s.vol;
    for (const f of [70, 105, 142]) { const o = tone({ t, type: 'sawtooth', f0: f * 0.8, f1: f * 1.3, dur: 1.6, gain: g * 0.45, filter: s.behind ? 500 : 900, q: 5, attack: 0.6, pan: s.pan }); const lfo = ctx.createOscillator(); lfo.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = f * 0.08; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.7); }
    noiseBurst({ t, dur: 1.5, type: 'bandpass', freq: 500, sweepTo: 1100, q: 1.5, gain: g * 0.5, attack: 0.6, pan: s.pan }); };
  G.events.on('deerState', ({ state }) => { if (!ok()) return; note('deer:' + state); if (state === 'approach') bellow(); if (state === 'frozen') { const s = spatial(G.deer.pos.x, G.deer.pos.z, 60); noiseBurst({ dur: 0.35, type: 'bandpass', freq: 1400, sweepTo: 700, q: 3, gain: 0.07 + 0.08 * s.vol, pan: s.pan }); } });
  G.events.on('bearState', ({ state }) => { if (!ok()) return; note('bear:' + state); if (['notice', 'rear', 'stalk', 'charge', 'attack'].includes(state)) killBirds(20, state); if (state === 'stalk') { const s = spatial(G.bear.pos.x, G.bear.pos.z, 45); noiseBurst({ dur: 0.9, type: 'lowpass', freq: 220, gain: 0.08 + 0.15 * s.vol, attack: 0.2, pan: s.pan, buf: brown }); } });
  const stinger = (freqs, dur, gain, type = 'sawtooth', filter = 900) => { const t = now(); for (const f of freqs) tone({ t, type, f0: f, dur, gain, filter, attack: dur * 0.3, detune: (Math.random() - .5) * 20 }); };
  // "spotted" stinger: driven by the game's own deerSpotted / deerStunned events (deer.js), gated only on the
  // Deer being READABLE on screen: in front of the camera, inside the frame, close enough, not behind the NIGHT/DAY banner.
  const spottedSting = (why) => { lastSting = now(); deerStingArmed = false; stingPending = 0; note('deerSpottedSting:' + why); stinger([55, 58.3, 82.4, 116.5], 3, 0.09, 'sawtooth', 700); tone({ type: 'sine', f0: 1760, f1: 1720, dur: 2.5, gain: 0.014, attack: 0.02 });
    noiseBurst({ dur: 0.6, type: 'bandpass', freq: 3000, sweepTo: 900, q: 1.5, gain: 0.05, attack: 0.01 }); tone({ f0: 90, f1: 38, dur: 0.5, gain: 0.3 }); };
  let scrV = null;
  const readable = () => { const T = G.THREE, d = G.deer, cam = G.camera; if (!scrV) scrV = new T.Vector3();
    const dist = Math.hypot(d.pos.x - cam.position.x, d.pos.z - cam.position.z); read.dist = dist; read.why = '';
    if (dist > 32) { read.why = 'far'; return false; }
    cam.updateMatrixWorld(); const W = innerWidth, H = innerHeight, pts = [];
    for (const y of [2.5, 1.6]) { scrV.set(d.pos.x, y, d.pos.z).project(cam); if (scrV.z < 1 && Math.abs(scrV.x) < 0.92 && Math.abs(scrV.y) < 0.92) pts.push([(scrV.x + 1) / 2 * W, (1 - scrV.y) / 2 * H]); }
    if (!pts.length) { read.why = 'offscreen'; return false; }
    const card = document.getElementById('card'); // big NIGHT N / DAY N banner: the Deer is unreadable behind it
    if (card && +getComputedStyle(card).opacity > 0.2) { const r = card.querySelector('h1')?.getBoundingClientRect(), rp = card.querySelector('p')?.getBoundingClientRect();
      const under = ([x, y]) => [r, rp].some(b => b && b.width > 0 && x > b.left - 20 && x < b.right + 20 && y > b.top - 20 && y < b.bottom + 20);
      if (pts.every(under)) { read.why = 'banner'; return false; } }
    read.why = 'ok'; return true; };
  const read = { dist: 0, why: '' };
  let stingPending = 0; // seconds left to wait for the Deer to become readable after a deerSpotted event
  G.events.on('deerSpotted', () => { if (!ok()) return; if (G.mode === 'playing' && readable()) spottedSting('spotted'); else { stingPending = 6; note('deerSpotted:deferred:' + read.why); } });
  // flashlight catches the Deer: ALWAYS a stinger + shriek (it is the payoff of the beam), plus the spotted sting if it never played
  G.events.on('deerStunned', (e) => { if (!ok()) return; note('deerStunned'); const t = now(), s = spatial(G.deer.pos.x, G.deer.pos.z, 60);
    if (deerStingArmed || stingPending > 0) spottedSting('stunned');
    note('deerStunSting'); stinger([73.4, 77.8, 110, 155.6], 1.6, 0.07, 'sawtooth', 1400); screech(0.12 + 0.08 * s.vol);
    tone({ t, type: 'square', f0: 2900, f1: 2500, dur: 0.12, gain: 0.03, filter: 5000 }); lastSting = t; });
  on('nightStart', () => { stinger([41.2, 61.7, 87.3], 5, 0.1, 'sawtooth', 500); noiseBurst({ dur: 4, freq: 200, gain: 0.15, attack: 1.5, buf: brown }); nextHowl = now() + 6 + Math.random() * 6; });
  on('dayStart', () => { stinger([261.6, 329.6, 392, 523.3], 3.5, 0.05, 'triangle', 3000); nextBird = now() + 1.5; });
  on('fireOut', () => noiseBurst({ dur: 1.5, type: 'bandpass', freq: 900, sweepTo: 200, gain: 0.2, attack: 0.05 }));
  on('death', () => stinger([36.7, 43.7, 55, 58.3], 6, 0.14, 'sawtooth', 400));
  on('win', () => stinger([261.6, 329.6, 392, 493.9, 587.3], 6, 0.07, 'triangle', 4000));
  on('gameStart', () => { nextBird = now() + 0.8; });

  // distant wolf howl from a random direction (spatial pan, heavy lowpass = far away)
  const howl = () => { const t = now(), p = (Math.random() - .5) * 1.6, base = 380 + Math.random() * 120, n = Math.random() < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) { const tk = t + k * (0.6 + Math.random() * 0.8), b = base * (1 + k * 0.12);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(b * 0.8, tk); o.frequency.linearRampToValueAtTime(b * 1.25, tk + 0.6); o.frequency.linearRampToValueAtTime(b * 1.2, tk + 1.8); o.frequency.exponentialRampToValueAtTime(b * 0.7, tk + 2.8);
      const vib = ctx.createOscillator(); vib.frequency.value = 5.5; const vg = ctx.createGain(); vg.gain.value = b * 0.015; vib.connect(vg).connect(o.frequency);
      const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100; const g = ctx.createGain(); env(g, tk, 0.5, 0.035, 2.9);
      o.connect(fl).connect(g).connect(out(1, p + (Math.random() - .5) * 0.2)); o.start(tk); vib.start(tk); o.stop(tk + 3); vib.stop(tk + 3); }
    note('howl'); };
  const owl = (p = (Math.random() - .5) * 1.4, v = 1) => { const t = now(); for (const [dt, f, d] of [[0, 420, 0.25], [0.35, 400, 0.2], [0.62, 380, 0.45]]) tone({ t: t + dt, f0: f, f1: f * 0.92, dur: d, gain: 0.02 * v, attack: 0.05, pan: p, filter: 900 }); note('owl'); };

  // ---------- expansion events (wolves, gray bears, the Alpha, keys, gates, fire levels, regions, wildlife) ----------
  // every handler tolerates a missing payload; {x,z} makes it spatial, otherwise it plays close and centred
  const where = (d, maxD = 60) => d && Number.isFinite(d.x) && Number.isFinite(d.z) ? spatial(d.x, d.z, maxD) : { pan: 0, vol: 0.85, behind: false, dist: 4 };
  // one wolf: slide up into the howl, hold, sag down; saw + 2nd harmonic through a throat formant, with vibrato
  const wolfVoice = (tk, base, s, len, g) => { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = (s.behind ? 900 : 1700) * (0.45 + 0.55 * s.vol) + 350;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = base * 1.7; fl.Q.value = 1.1; const h2 = ctx.createGain(); h2.gain.value = 0.4;
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, tk); e.gain.exponentialRampToValueAtTime(g, tk + 0.45); e.gain.linearRampToValueAtTime(g * 0.8, tk + len * 0.7); e.gain.exponentialRampToValueAtTime(0.0001, tk + len);
    const vib = ctx.createOscillator(); vib.frequency.value = 4.5 + Math.random() * 2; const vg = ctx.createGain(); vg.gain.value = 16; vib.connect(vg);
    [['sawtooth', 1, fl], ['sine', 2, h2]].forEach(([ty, m, dst]) => { const o = ctx.createOscillator(); o.type = ty; const f = base * m;
      o.frequency.setValueAtTime(f * 0.76, tk); o.frequency.linearRampToValueAtTime(f * 1.2, tk + 0.55); o.frequency.linearRampToValueAtTime(f * 1.14, tk + len * 0.65); o.frequency.exponentialRampToValueAtTime(f * 0.6, tk + len);
      vg.connect(o.detune); o.connect(dst); o.start(tk); o.stop(tk + len + 0.05); });
    fl.connect(lp); h2.connect(lp); lp.connect(e).connect(out(1, s.pan)); vib.start(tk); vib.stop(tk + len + 0.05); };
  // throaty snarl: buzzy saw chopped by a fast square flutter, plus gritty breath through a mouth formant
  const snarl = (t, s, dur, g) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(125 + Math.random() * 30, t); o.frequency.linearRampToValueAtTime(175, t + dur * 0.45); o.frequency.linearRampToValueAtTime(110, t + dur);
    const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 24 + Math.random() * 12; const amG = ctx.createGain(); amG.gain.value = 0.5; const vca = ctx.createGain(); vca.gain.value = 0.5; am.connect(amG).connect(vca.gain);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 720; f.Q.value = 1.3; const e = ctx.createGain(); env(e, t, 0.05, g, dur);
    o.connect(vca).connect(f).connect(e).connect(out(1, s.pan)); o.start(t); am.start(t); o.stop(t + dur + 0.05); am.stop(t + dur + 0.05);
    noiseBurst({ t, dur, type: 'bandpass', freq: 1100, q: 1.2, gain: g * 0.6, attack: 0.05, pan: s.pan }); };
  const jawSnap = (t, s, g) => { noiseBurst({ t, dur: 0.025, type: 'highpass', freq: 2500, gain: g, pan: s.pan }); tone({ t, f0: 1400, f1: 500, dur: 0.04, gain: g * 0.5, type: 'triangle', pan: s.pan }); noiseBurst({ t: t + 0.06, dur: 0.02, type: 'highpass', freq: 3200, gain: g * 0.5, pan: s.pan }); };
  on('wolfHowl', (d) => { const s = where(d, 110), t = now(), base = 410 + Math.random() * 120, g = 0.025 + 0.08 * s.vol;
    wolfVoice(t, base, s, 2.3 + Math.random() * 1.1, g); const n = Math.random() < 0.65 ? 2 : 1; // the pack joins in
    for (let k = 0; k < n; k++) wolfVoice(t + 0.45 + k * 0.7 + Math.random() * 0.5, base * (1.07 + 0.11 * k + Math.random() * 0.05), { ...s, pan: clamp(s.pan + (Math.random() - .5) * 0.5, -1, 1) }, 1.9 + Math.random(), g * 0.6); });
  on('wolfBite', (d) => { const s = where(d, 40), t = now(); snarl(t, s, 0.32, 0.1 + 0.12 * s.vol); jawSnap(t + 0.28, s, 0.18 + 0.15 * s.vol); });
  for (const ev of ['wolfSnarl', 'wolfGrowl']) on(ev, (d) => { const s = where(d, 40); snarl(now(), s, 0.6 + Math.random() * 0.4, 0.05 + 0.11 * s.vol); });
  on('wolfHurt', (d) => { const s = where(d, 50), t = now(), g = 0.05 + 0.1 * s.vol; // two sharp yelps
    for (const [dt, a, b] of [[0, 850, 1500], [0.19, 920, 1300]]) { tone({ t: t + dt, type: 'triangle', f0: a, f1: b, dur: 0.06, gain: g, pan: s.pan, filter: 3000 }); tone({ t: t + dt + 0.06, type: 'triangle', f0: b, f1: a * 0.6, dur: 0.12, gain: g * 0.9, pan: s.pan, filter: 3000 }); }
    noiseBurst({ t, dur: 0.09, type: 'bandpass', freq: 700, q: 1, gain: g, pan: s.pan, buf: brown }); });
  on('wolfDie', (d) => { const s = where(d, 50), t = now(), g = 0.04 + 0.08 * s.vol; // falling whimper, then the body hits the ground
    const o = tone({ t, type: 'triangle', f0: 1150, f1: 430, dur: 1.0, gain: g, attack: 0.03, pan: s.pan, filter: 2400 }); const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 40; lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + 1.1);
    tone({ t: t + 0.75, f0: 85, f1: 40, dur: 0.3, gain: 0.12 + 0.2 * s.vol, pan: s.pan }); noiseBurst({ t: t + 0.75, dur: 0.3, freq: 320, gain: 0.08 + 0.15 * s.vol, pan: s.pan, buf: brown }); });
  // big roars: stacked saws sliding down with a growling detune wobble, a breath band and optional sub
  const bigRoar = (s, freqs, dur, g, sub) => { const t = now();
    for (const f of freqs) { const o = tone({ t, type: 'sawtooth', f0: f * 0.92, f1: f * 0.55, dur, gain: g, filter: s.behind ? 520 : 880, q: 2.5, attack: 0.12, pan: s.pan }); const lfo = ctx.createOscillator(); lfo.frequency.value = 7 + Math.random() * 5; const lg = ctx.createGain(); lg.gain.value = 45; lfo.connect(lg).connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.1); }
    noiseBurst({ t, dur: dur * 0.9, type: 'bandpass', freq: 520, q: 0.8, gain: g * 1.8, attack: 0.1, pan: s.pan });
    if (sub) tone({ t, f0: sub, f1: sub * 0.7, dur: dur * 0.85, gain: g * 2, attack: 0.15 }); };
  on('grayBearRoar', (d) => { killBirds(25, 'grayRoar'); const s = where(d, 60); bigRoar(s, [74, 98, 131], 1.9, 0.07 + 0.1 * s.vol, 46); });
  on('alphaRoar', (d) => { killBirds(40, 'alpha'); const s = where(d, 80); bigRoar(s, [52, 69, 92, 123], 2.8, 0.08 + 0.09 * s.vol, 34);
    noiseBurst({ t: now() + 0.05, dur: 2.4, freq: 180, gain: 0.25, attack: 0.3, buf: brown, pan: s.pan }); G.controls.shake = Math.max(G.controls.shake || 0, 0.25 * (0.4 + 0.6 * s.vol)); });
  // glassy bell: inharmonic partials, fast attack, long ring
  const bell = (t, f, g, dur = 1.4, pan = 0) => { for (const [r, gg, dd] of [[1, 1, 1], [2, 0.25, 0.7], [2.76, 0.3, 0.45], [5.4, 0.12, 0.25]]) tone({ t, f0: f * r, dur: dur * dd, gain: g * gg, attack: 0.003, pan }); };
  on('keyPickup', () => { const t = now(); [1318.5, 1661.2, 1975.5, 2637].forEach((f, i) => bell(t + i * 0.085, f, 0.045 - i * 0.006, 1.7, (i - 1.5) * 0.25));
    noiseBurst({ t, dur: 1.2, type: 'highpass', freq: 7000, gain: 0.02, attack: 0.3 }); tone({ t, f0: 330, f1: 660, dur: 0.5, gain: 0.04, type: 'triangle', attack: 0.02 }); });
  on('caveUnlocked', (d) => { const s = where(d, 40), t = now(), g = 0.5 + 0.5 * s.vol;
    for (const [dt, f] of [[0, 2300], [0.12, 2650], [0.36, 1700]]) { noiseBurst({ t: t + dt, dur: 0.02, type: 'highpass', freq: 3000, gain: 0.08 * g, pan: s.pan }); for (const r of [1, 1.58, 2.37, 3.1]) tone({ t: t + dt, f0: f * r, dur: 0.18 / r + 0.05, gain: 0.02 * g / r, pan: s.pan }); } // key turns, shackle snaps
    for (let i = 0; i < 9; i++) { const tt = t + 0.45 + i * 0.045 + Math.random() * 0.03; tone({ t: tt, f0: 2800 + Math.random() * 2200, dur: 0.05, gain: 0.014 * g, pan: s.pan }); noiseBurst({ t: tt, dur: 0.012, type: 'highpass', freq: 4000, gain: 0.03 * g, pan: s.pan }); } // chain rattles off
    tone({ t: t + 0.9, f0: 90, f1: 42, dur: 0.45, gain: 0.32 * g, pan: s.pan }); noiseBurst({ t: t + 0.9, dur: 0.35, freq: 500, gain: 0.22 * g, buf: brown, pan: s.pan }); // plank bar thrown down
    const cr = tone({ t: t + 1.25, type: 'sawtooth', f0: 170, f1: 120, dur: 1.1, gain: 0.03 * g, filter: 1300, q: 5, attack: 0.15, pan: s.pan }); const jit = ctx.createOscillator(); jit.type = 'square'; jit.frequency.value = 23; const jg = ctx.createGain(); jg.gain.value = 300; jit.connect(jg).connect(cr.detune); jit.start(t + 1.25); jit.stop(t + 2.4); // dry hinge
    noiseBurst({ t: t + 1.2, dur: 2.5, freq: 260, gain: 0.1 * g, attack: 0.8, buf: brown, pan: s.pan }); tone({ t: t + 1.1, f0: 55, f1: 52, dur: 2.6, gain: 0.05, attack: 0.6 }); }); // cold air from the dark
  // brass-ish horn: two detuned saws through a lowpass that opens on the attack
  const horn = (t, f, dur, g, pan = 0) => { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(f * 5, t + 0.12); lp.frequency.setTargetAtTime(f * 3, t + 0.15, 0.3);
    const e = ctx.createGain(); e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(g, t + 0.1); e.gain.setTargetAtTime(g * 0.7, t + 0.12, 0.3); e.gain.setTargetAtTime(0.0001, t + Math.max(0.2, dur - 0.25), 0.12);
    for (const dt of [-7, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt; o.connect(lp); o.start(t); o.stop(t + dur + 0.5); }
    lp.connect(e).connect(out(1, pan)); };
  on('fireLevelUp', (d) => { const lvl = (d && d.level) || 2, s = spatial(G.campfire.x, G.campfire.z, 70), t = now(), g = 0.4 + 0.6 * s.vol;
    noiseBurst({ t, dur: 1.8, type: 'bandpass', freq: 170, sweepTo: 2400, q: 0.6, gain: 0.32 * g, attack: 0.5, pan: s.pan, buf: brown }); // whoosh as it flares
    noiseBurst({ t: t + 0.4, dur: 1.5, type: 'lowpass', freq: 700, gain: 0.22 * g, attack: 0.2, buf: brown, pan: s.pan }); tone({ t, f0: 40, f1: 72, dur: 2, gain: 0.22 * g, attack: 0.4 });
    for (let i = 0; i < 24; i++) crackleAt(t + 0.3 + Math.random() * 1.8, 1); popAt(t + 0.5, 1, lvl); popAt(t + 1.1, 1, lvl);
    const root = [196, 196, 220, 246.9, 261.6, 293.7][Math.min(5, lvl)]; // a warm major swell, one step higher each level
    for (const [r, dt] of [[1, 0.45], [1.26, 0.6], [1.5, 0.75], [2, 0.9]]) horn(t + dt, root * r, 2.6, 0.028); });
  on('regionUnlocked', () => { const t = now();
    for (let i = 0; i < 14; i++) tone({ t: t + i * 0.07, f0: 98, f1: 82, dur: 0.25, gain: 0.04 + i * 0.008, attack: 0.004 }); // timpani roll
    for (const [dt, f, dur] of [[1.0, 220, 0.24], [1.2, 293.7, 0.24], [1.4, 370, 0.24], [1.6, 440, 0.95], [2.6, 392, 0.3], [2.9, 440, 0.3]]) horn(t + dt, f, dur, 0.05, 0.1);
    for (const f of [293.7, 370, 440, 587.3]) horn(t + 3.2, f, 3, 0.035, (f - 440) / 600); tone({ t: t + 3.2, f0: 73.4, f1: 60, dur: 1.2, gain: 0.35 });
    noiseBurst({ t: t + 3.2, dur: 3, type: 'highpass', freq: 6000, gain: 0.05, attack: 0.02 }); stinger([146.8, 220], 5, 0.03, 'triangle', 2000); });
  on('animalFlee', (d) => { const type = String((d && d.type) || '').toLowerCase(), s = where(d, 45), t = now(); if (s.vol <= 0.01) return;
    if (/bird|owl|crow|raven/.test(type)) { const owlT = type.includes('owl'), n = owlT ? 6 : 9 + (Math.random() * 5 | 0); let tt = t, g = (owlT ? 0.05 : 0.07) * (0.3 + 0.7 * s.vol);
      for (let i = 0; i < n; i++) { noiseBurst({ t: tt, dur: owlT ? 0.09 : 0.045, type: 'bandpass', freq: (owlT ? 450 : 850) + Math.random() * 500, q: 0.9, gain: g, attack: 0.008, pan: clamp(s.pan + (Math.random() - .5) * 0.2, -1, 1), buf: owlT ? brown : null }); tt += (owlT ? 0.16 : 0.07) + Math.random() * 0.03; g *= 0.86; } // wingbeats climbing away
      if (!owlT && Math.random() < 0.7) for (let i = 0; i < 3; i++) tone({ t: t + 0.05 + i * 0.09, f0: 3200 + Math.random() * 600, f1: 2600, dur: 0.06, gain: 0.02 * (0.3 + 0.7 * s.vol), pan: s.pan, bus: birdBus }); // alarm chirps
      return; }
    const heavy = /stag|elk|deer|goat|bear|boar/.test(type); let tt = t, g = 1; // a dash through the undergrowth, receding
    for (let i = 0; i < (heavy ? 6 : 8); i++) { noiseBurst({ t: tt, dur: heavy ? 0.12 : 0.07, freq: heavy ? 320 : 600, gain: (heavy ? 0.12 : 0.07) * s.vol * g + 0.01, pan: s.pan, buf: brown, rate: heavy ? 0.9 : 1.4 }); noiseBurst({ t: tt + 0.01, dur: 0.09, type: 'bandpass', freq: 2200 + Math.random() * 1500, q: 1, gain: 0.04 * s.vol * g, pan: s.pan }); tt += (heavy ? 0.2 : 0.11) + Math.random() * 0.05; g *= 0.82; }
    if (/stag|elk/.test(type)) noiseBurst({ t, dur: 0.25, type: 'bandpass', freq: 420, q: 2, gain: 0.12 * s.vol + 0.02, attack: 0.02, pan: s.pan }); // alarm snort
    if (/goat/.test(type)) { for (let i = 0; i < 4; i++) noiseBurst({ t: t + i * 0.13, dur: 0.02, type: 'bandpass', freq: 2400, q: 4, gain: 0.08 * s.vol, pan: s.pan }); const b = tone({ t: t + 0.2, type: 'sawtooth', f0: 520, f1: 470, dur: 0.45, gain: 0.03 * s.vol, filter: 1800, attack: 0.03, pan: s.pan }); const l = ctx.createOscillator(); l.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 60; l.connect(lg).connect(b.detune); l.start(t + 0.2); l.stop(t + 0.7); } // hooves on rock + bleat
    if (/fox/.test(type) && Math.random() < 0.5) tone({ t: t + 0.1, type: 'triangle', f0: 900, f1: 1300, dur: 0.09, gain: 0.04 * s.vol, pan: s.pan }); });
  on('owlHoot', (d) => { const s = where(d, 60); owl(s.pan, 0.4 + 1.2 * s.vol); });

  // line-of-sight: how many standing tree trunks sit between the camera and a world point (2D segment test)
  const occluders = (x, z) => {
    const cx = G.camera.position.x, cz = G.camera.position.z, dx = x - cx, dz = z - cz, L2 = dx * dx + dz * dz || 1;
    const minX = Math.min(cx, x) - 1.5, maxX = Math.max(cx, x) + 1.5, minZ = Math.min(cz, z) - 1.5, maxZ = Math.max(cz, z) + 1.5; let n = 0;
    for (const t of G.world.trees) { if (!t.alive || t.x < minX || t.x > maxX || t.z < minZ || t.z > maxZ) continue;
      const tx = t.x - cx, tz = t.z - cz, u = (tx * dx + tz * dz) / L2; if (u <= 0.03 || u >= 0.96) continue;
      const px = tx - u * dx, pz = tz - u * dz, r = 0.45 * t.s + 0.3; if (px * px + pz * pz < r * r) n++; }
    return n;
  };
  let frustum = null, projM = null, tmpV = null;
  const inView = (x, y, z) => { const T = G.THREE; if (!frustum) { frustum = new T.Frustum(); projM = new T.Matrix4(); tmpV = new T.Vector3(); }
    G.camera.updateMatrixWorld(); projM.multiplyMatrices(G.camera.projectionMatrix, G.camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projM); return frustum.containsPoint(tmpV.set(x, y, z)); };
  // a creature's footfall in the undergrowth, from its real position; occlusion + distance muffle the highs
  const rustle = (x, z, heavy, maxD, occ) => { const s = spatial(x, z, maxD); if (s.vol <= 0.001) return; const t = now(), m = (s.behind ? 0.6 : 1) * (occ > 0 ? 0.65 : 1);
    noiseBurst({ t, dur: heavy ? 0.16 : 0.1, freq: heavy ? 260 : 520, gain: (heavy ? 0.06 : 0.03) + (heavy ? 0.3 : 0.2) * s.vol, pan: s.pan, buf: brown, rate: heavy ? 0.8 : 1.3 });
    noiseBurst({ t: t + 0.02, dur: 0.14, type: 'bandpass', freq: (1800 + Math.random() * 1400) * m, q: 1.1, gain: 0.015 + 0.09 * s.vol, pan: s.pan, attack: 0.02 });
    note(heavy ? 'bearRustle' : 'deerRustle'); };
  const twig = (x, z, maxD, occ) => { const s = spatial(x, z, maxD), t = now(), m = occ > 0 ? 0.7 : 1;
    noiseBurst({ t, dur: 0.03, type: 'bandpass', freq: (1500 + Math.random() * 1200) * m, q: 6, gain: 0.04 + 0.26 * s.vol, pan: s.pan });
    noiseBurst({ t: t + 0.04 + Math.random() * 0.04, dur: 0.02, type: 'bandpass', freq: 2200 * m, q: 6, gain: 0.025 + 0.12 * s.vol, pan: s.pan }); note('twig'); };
  let beatPhase = 0;

  A.update = (dt) => {
    if (!ok()) return;
    const t = now(), dn = G.daynight, dark = dn.darkness, playing = G.mode === 'playing';
    // wind gusts + leaf rustle riding them
    const gust = 0.5 + 0.5 * Math.sin(t * 0.23) * Math.sin(t * 0.61 + 1.3);
    // dread ducks the ambience (wind/leaves/crickets/fire/pad) so the heartbeat + tension read clearly on small speakers
    const duck = A.duck = playing ? clamp(1 - (A.dread || 0) * 0.8, 0.2, 1) : 1;
    windGain.gain.setTargetAtTime((0.03 + 0.04 * gust + dark * 0.025) * duck, t, 0.35);
    windFilter.frequency.setTargetAtTime(260 + 300 * (0.5 + 0.5 * Math.sin(t * 0.17)) + gust * 120, t, 0.8);
    rustleGain.gain.setTargetAtTime(Math.max(0, gust - 0.45) * 0.03 * duck, t, 0.4);
    // fire: distance + direction + fuel + fire level. Beds breathe; crackles/pops are Poisson-timed and scheduled
    // ~150 ms ahead at exact context times (clustered like real wood), never more than the lookahead window per frame
    const fire = G.campfire, fs = spatial(fire.x, fire.z, 48), lvl = clamp(G.progression?.fireLevel || 1, 1, 6);
    const fuelK = fuelKOf(fire.fuel), fall = fireFall(fs.dist), fv = fall * fuelK, lk = 1 + 0.22 * (lvl - 1), flare = fire.flare || 0; A.fireVol = fv;
    Object.assign(fireStats, { dist: fs.dist, fall, fuelK, level: lvl });
    fireBus.gain.setTargetAtTime(fv * (0.6 + 0.4 * duck), t, 0.15);
    firePan.pan.setTargetAtTime(clamp(fs.pan, -1, 1) * 0.75 * clamp((fs.dist - 0.8) / 3, 0, 1), t, 0.1); // centred when you stand over it
    fireMuffle.frequency.setTargetAtTime((fs.behind ? 0.45 : 1) * (1600 + 10400 * clamp(1 - fs.dist / 40, 0, 1) ** 2), t, 0.25);
    fireFilter.frequency.setTargetAtTime(230 + 60 * lvl + 220 * fuelK + 300 * flare, t, 0.3);
    if (t > nextRoar) { nextRoar = t + 0.12 + Math.random() * 0.4; const breath = 0.6 + Math.random() * 0.8;
      fireGain.gain.setTargetAtTime(0.22 * lk * (0.45 + 0.55 * fuelK) * breath * (1 + flare), t, 0.14);
      flutterGain.gain.setTargetAtTime(0.06 * fuelK * lk * (0.25 + Math.random()) * (1 + flare), t, 0.07);
      hissGain.gain.setTargetAtTime(0.014 * fuelK * (0.5 + Math.random()), t, 0.2); }
    const crackOn = fire.fuel > 0 && fv > 0.002, rate = (3 + 11 * fuelK) * (1 + 0.25 * (lvl - 1)) * (1 + 2.5 * flare); fireStats.rate = crackOn ? rate : 0;
    if (nextCrackle < t) nextCrackle = t + Math.random() * 0.03;
    while (nextCrackle < t + 0.15) { if (crackOn) crackleAt(nextCrackle, fuelK); nextCrackle += -Math.log(1 - Math.random()) / rate; }
    if (nextPop < t) nextPop = t + Math.random() * 0.4;
    while (nextPop < t + 0.15) { if (crackOn) popAt(nextPop, fuelK, lvl); nextPop += -Math.log(1 - Math.random()) / ((0.2 + 0.45 * fuelK) * lk * (1 + flare)); }
    // music-ish beds: warm day pad vs. night drone that swells with danger
    A.threat = G.threat || 0;
    // ---- stalking dread: starts the moment a creature is hunting you, mapped to state + distance (out to ~55m), not just to charge threat
    const deer = G.deer, bear = G.bear, P = G.controls.pos;
    const dDist = Math.hypot(deer.pos.x - P.x, deer.pos.z - P.z), bDist = Math.hypot(bear.pos.x - P.x, bear.pos.z - P.z);
    const bearAlive = bear.state !== 'dead' && bear.state !== 'hidden'; bearProx = playing && bearAlive ? clamp(1 - bDist / 15, 0, 1) : 0; A.bearProx = bearProx;
    // bear motion from its REAL displacement (knockback excluded via its own speed flag): steps/rustles only while it walks
    const bearV = Math.hypot(bear.pos.x - lastBX, bear.pos.z - lastBZ) / Math.max(dt, 1e-3); lastBX = bear.pos.x; lastBZ = bear.pos.z;
    bearMovingNow = bearAlive && bearV > 0.3 && bearV < 30 && (bear.speed === undefined || bear.speed > 0.2); A.bearMoving = bearMovingNow; A.bearV = bearV;
    const hunting = ['approach', 'windup', 'lunge'].includes(deer.state);
    let dd = 0;
    if (hunting || deer.state === 'leap') dd = 1;
    else if (deer.state === 'lurk') dd = 0.55 + 0.4 * clamp(1 - dDist / 40, 0, 1);
    else if (['stalk', 'frozen', 'stunned'].includes(deer.state)) dd = 0.15 + 0.75 * clamp(1 - dDist / 55, 0, 1);
    else if (deer.state === 'repelled') dd = 0.1 + 0.4 * clamp(1 - dDist / 55, 0, 1);
    else if (deer.state === 'flee' || deer.state === 'retreat') dd = 0.1;
    let bd = 0;
    if (bear.state === 'charge') bd = 1; else if (['stalk', 'notice', 'rear'].includes(bear.state)) bd = 0.12 + 0.7 * clamp(1 - bDist / 50, 0, 1);
    if (bearProx > 0) bd = Math.max(bd, 0.4 + 0.6 * bearProx); // a bear at arm's length is dread, whatever it is doing
    const hp = G.survival?.stats?.health ?? 100, lowHp = hp > 0 && hp < 30 ? 0.35 + 0.6 * (1 - hp / 30) : 0;
    const starve = (G.survival?.starve || 0) * 0.55; // starving: heartbeat pounds even with no monster near
    const target = playing ? Math.max(dd, bd, A.threat, lowHp, starve) : 0, cur = A.dread || 0;
    A.dread = cur + (target - cur) * Math.min(1, dt * (target > cur ? 1.8 : 0.5));
    const D = A.dread;
    const scored = !!(G.music && G.music.active); // music.js owns the harmony: the A-major pad would clash with its keys
    dayPadGain.gain.setTargetAtTime(scored ? 0 : playing ? (1 - dark) * 0.006 * duck : 0.004, t, 1.5);
    droneGain.gain.setTargetAtTime((dark * (0.018 + D * 0.06) + (playing && fire.fuel <= 0 && dark > 0.5 ? 0.03 : 0)) * (scored ? 0.55 : 1), t, 0.8);
    droneFilter.frequency.setTargetAtTime(140 + 120 * (0.5 + 0.5 * Math.sin(t * 0.09)) + D * 520, t, 0.6);
    const tPulse = 0.8 + 0.2 * Math.sin(t * Math.PI * 2 * (0.5 + D * 1.5)); A.tensionTarget = playing && D > 0.08 ? (0.05 + Math.pow(D, 0.9) * 0.17) * tPulse : 0;
    tensionGain.gain.setTargetAtTime(A.tensionTarget, t, 0.25); tensionFilter.frequency.setTargetAtTime(600 + D * 1400, t, 0.8); tensionFilter.Q.value = 0.5;
    for (const { o, f } of tensionOsc) o.frequency.setTargetAtTime(f * (1 + D * 0.09), t, 1.2);
    // dusk warning cue, once per day, ~12s before night
    if (playing && dn.phase === 'day' && dn.timeLeft() < 12 && duskDay !== dn.day) { duskDay = dn.day; note('dusk'); stinger([55, 82.4], 4, 0.05, 'sawtooth', 350); howl(); }
    // critters: crickets thin out when something is near; birds by day
    if (dark > 0.6 && t > nextCricket) { nextCricket = t + 0.35 + Math.random() * 0.8; A.counts.cricket = (A.counts.cricket || 0) + 1; const p = (Math.random() - .5) * 1.6, f = 4200 + Math.random() * 700, reps = 2 + (Math.random() * 3 | 0); for (let i = 0; i < reps; i++) tone({ t: t + i * 0.055, f0: f, dur: 0.035, gain: 0.012 * clamp(1 - (A.dread || 0) * 1.6, 0.05, 1), pan: p }); }
    const birdsOk = playing ? (t > threatHold && (A.dread || 0) < 0.1 && bearProx <= 0 && !['notice', 'rear', 'stalk', 'charge', 'attack'].includes(bear.state)) : true; A.birdsOk = birdsOk;
    if (!birdsOk) { threatHold = Math.max(threatHold, t + 4); birdBus.gain.setTargetAtTime(0, t, 0.03); A.birdBusT = 0; } else { birdBus.gain.setTargetAtTime(1, t, 1.5); A.birdBusT = 1; }
    if (dark < 0.4 && birdsOk && t > nextBird) { nextBird = t + 1.6 + Math.random() * 3.5; note('bird'); const p = (Math.random() - .5) * 1.6, base = 2200 + Math.random() * 1500, n = 2 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) tone({ t: t + i * 0.13, f0: base * (1 + (i % 2) * 0.2), f1: base * 1.4, dur: 0.09, gain: 0.02, pan: p, bus: birdBus }); }
    if (dark > 0.7 && playing && t > nextHowl) { nextHowl = t + 18 + Math.random() * 22; if ((A.dread || 0) < 0.35) howl(); }
    if (dark > 0.7 && t > nextOwl) { nextOwl = t + 12 + Math.random() * 18; if ((A.dread || 0) < 0.25) owl(); }
    // Deer: wet breathing loop, louder as it nears; twig snaps while it stalks you from the tree line
    const dActive = !['hidden', 'waiting'].includes(deer.state), ds = spatial(deer.pos.x, deer.pos.z, 45);
    // track Deer speed + line of sight (throttled): visible = in camera frustum, inside fog/dark range, no trunk in between
    deerSpeed = dt > 0 ? Math.hypot(deer.pos.x - lastDX, deer.pos.z - lastDZ) / dt : 0; lastDX = deer.pos.x; lastDZ = deer.pos.z;
    if (prevDeerState !== deer.state) { if (['hidden', 'waiting', 'dawn'].includes(prevDeerState) || deer.state === 'hidden') { if (now() - lastSting > 3) deerStingArmed = true; seenT = 0; } prevDeerState = deer.state; }
    if (t > visCheckT) { visCheckT = t + 0.1;
      const fog = G.scene.fog, range = Math.min(70, fog ? Math.max(fog.far * 0.85, 32) : 70); // eye glow ignores fog, so it reads a bit past the fog wall
      vis.dist = ds.dist; vis.range = range; vis.inView = dActive && inView(deer.pos.x, 2.2, deer.pos.z); vis.occ = dActive && vis.inView && ds.dist < range ? occluders(deer.pos.x, deer.pos.z) : (dActive ? occluders(deer.pos.x, deer.pos.z) : 0);
      vis.visible = dActive && vis.inView && ds.dist < range && vis.occ === 0; }
    // re-arm after the Deer has been out of view a while; pending deerSpotted fires the moment it becomes readable
    if (deer.watched) unseenT = 0; else { unseenT += dt; if (unseenT > 12 && t - lastSting > 25) deerStingArmed = true; }
    if (stingPending > 0) { stingPending -= dt; if (playing && dActive && readable()) spottedSting('spotted-late'); }
    else if (playing && dActive && deerStingArmed && deer.watched && deer.state !== 'dawn' && t - lastSting > 25 && ds.dist < 26 && readable()) spottedSting('rewatched');
    const dAgg = deer.state === 'approach' || deer.state === 'lunge' || deer.state === 'leap' ? 1.6 : deer.state === 'lurk' ? 1.5 : deer.state === 'frozen' ? 0.4 : 1;
    const breathe = 0.5 + 0.5 * Math.sin(t * (deer.state === 'approach' || deer.state === 'lunge' ? 9 : 3.2));
    const dl = dActive ? ds.vol * dAgg * (0.25 + 0.75 * breathe) * 0.14 : 0;
    const L = loops.deerBreath; L.level = dl; L.g.gain.setTargetAtTime(dl, t, 0.06); L.p.pan.setTargetAtTime(clamp(ds.pan, -1, 1), t, 0.08);
    L.mf.frequency.setTargetAtTime((ds.behind ? 900 : 2800) * (vis.occ > 0 ? 0.55 : 1), t, 0.2); L.f.frequency.setTargetAtTime(380 + breathe * 380, t, 0.05);
    const stalking = ['stalk', 'repelled', 'approach', 'lurk'].includes(deer.state);
    const deerStill = deer.state !== 'approach' && (deerSpeed < 0.25 || (deer.watched && ds.dist > 10)); A.deerStill = deerStill;
    if (playing && dActive && stalking && !deerStill && ds.dist < 60 && t > nextRustle) { const moving = deerSpeed > 0.6 || deer.state === 'approach';
      nextRustle = t + (deer.state === 'approach' ? 0.3 + Math.random() * 0.15 : moving ? 0.55 + Math.random() * 0.5 : 1.6 + Math.random() * 2.2);
      rustle(deer.pos.x, deer.pos.z, false, 60, vis.occ); if (moving && deer.state !== 'approach') rustle(deer.pos.x, deer.pos.z, false, 60, vis.occ); }
    if (playing && dActive && stalking && !deerStill && ds.dist < 55 && t > nextTwig) { nextTwig = t + 1.8 + Math.random() * 3.5 * (ds.dist / 55 + 0.3); twig(deer.pos.x, deer.pos.z, 55, vis.occ); }
    // Bear: breathing/huffing in EVERY live state within ~15m (louder as it closes), plus the long-range stalk/charge huff.
    // Footfalls + undergrowth rustles fire ONLY while it is actually moving (none while it stands in notice/rear).
    const bs = spatial(bear.pos.x, bear.pos.z, 45), bActive = ['stalk', 'charge'].includes(bear.state);
    const bRate = bear.state === 'charge' ? 11 : ['rear', 'notice', 'attack'].includes(bear.state) ? 5.5 : bearMovingNow ? 3.4 : 2.2;
    const huff = 0.5 + 0.5 * Math.sin(t * bRate);
    const farL = bActive ? bs.vol * (bear.state === 'charge' ? 0.3 : 0.16) : 0;
    const nearL = bearProx > 0 ? 0.05 + Math.pow(bearProx, 1.3) * 0.4 : 0;
    const bl = Math.max(farL, nearL) * (0.3 + 0.7 * huff);
    const B = loops.bearBreath; B.level = bl; B.g.gain.setTargetAtTime(bl, t, 0.06); B.p.pan.setTargetAtTime(clamp(bs.pan, -1, 1), t, 0.08); B.mf.frequency.setTargetAtTime(bs.behind ? 500 : 1400 + bearProx * 1600, t, 0.2);
    A.bearBreath = r3(bl);
    // discrete chuffs/snorts when it's close: audible on small speakers (brown-noise body + nasal band), rate by state
    if (bearProx > 0 && t > nextHuff) { nextHuff = t + (['rear', 'notice', 'charge', 'attack'].includes(bear.state) ? 0.7 : 1.4) + Math.random() * 0.9; const g = 0.06 + 0.34 * bearProx;
      noiseBurst({ dur: 0.32, type: 'lowpass', freq: 380, gain: g, attack: 0.03, pan: bs.pan, buf: brown }); noiseBurst({ t: t + 0.02, dur: 0.22, type: 'bandpass', freq: 900 + bearProx * 500, q: 1.3, gain: g * 0.45, attack: 0.02, pan: bs.pan });
      if (Math.random() < 0.4) noiseBurst({ t: t + 0.4, dur: 0.25, type: 'lowpass', freq: 300, gain: g * 0.7, attack: 0.04, pan: bs.pan, buf: brown }); note('bearHuff'); }
    if (bear.state === 'charge' && bearMovingNow && t > nextPaw) { nextPaw = t + 0.28; note('bearPaw'); tone({ f0: 75, f1: 38, dur: 0.18, gain: 0.08 + 0.35 * bs.vol, pan: bs.pan }); noiseBurst({ dur: 0.1, freq: 300, gain: 0.05 + 0.15 * bs.vol, pan: bs.pan, buf: brown }); }
    if (playing && bearMovingNow && bear.state !== 'charge' && bDist < 50 && t > nextBearStep) { nextBearStep = t + clamp(1.6 / Math.max(bearV, 0.8), 0.3, 1.6) + Math.random() * 0.25; note('bearStep'); rustle(bear.pos.x, bear.pos.z, true, 50, 0); }
    if (!bearMovingNow) nextBearStep = Math.max(nextBearStep, t + 0.25); // first step lands a beat after it starts moving
    // heartbeat (lub-dub): starts quietly as soon as stalking begins (dread), speeds up / swells as it closes in
    A.bpm = 0; A.nextBeatAt = 0;
    if (playing && D > 0.12) { const bpm = 56 + D * 100; A.bpm = Math.round(bpm);
      if (t + 0.04 > nextBeat) { const t = Math.max(now(), nextBeat); nextBeat = t + 60 / bpm; const g = 0.12 + D * 0.4, body = 0.1 + D * 0.34; // beats land on exact times, so music.js can lock its hits to them
        const beat = (tt, f, gg, bb) => {
          // sub (chest weight on headphones)
          const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * 0.65, tt + 0.13); const e = ctx.createGain(); env(e, tt, 0.008, gg, 0.16); o.connect(e).connect(hbFilter); o.start(tt); o.stop(tt + 0.2);
          // audible body 150-400Hz: pitched-down thump that laptop/phone speakers reproduce
          const ob = ctx.createOscillator(); ob.type = 'triangle'; ob.frequency.setValueAtTime(f * 5.2, tt); ob.frequency.exponentialRampToValueAtTime(f * 2.6, tt + 0.1); const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 260; bf.Q.value = 0.9;
          const eb = ctx.createGain(); env(eb, tt, 0.005, bb, 0.14); ob.connect(bf).connect(eb).connect(master); ob.start(tt); ob.stop(tt + 0.18);
          // soft knock transient (thud onset) around 400Hz
          noiseBurst({ t: tt, dur: 0.035, type: 'bandpass', freq: 380, q: 1.4, gain: bb * 0.9 });
          const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(f * 2, tt); const e2 = ctx.createGain(); env(e2, tt, 0.005, gg * 0.25, 0.08); o2.connect(e2).connect(master); o2.start(tt); o2.stop(tt + 0.1); };
        beat(t, 60, g, body); beat(t + 0.19 - D * 0.04, 52, g * 0.7, body * 0.72); A.lastBeat = { t: +t.toFixed(2), sub: +g.toFixed(3), body: +body.toFixed(3), bodyHz: [312, 156] }; A.beats = (A.beats || 0) + 1; }
      A.nextBeatAt = nextBeat; }
  };

  // debug snapshot for critics (they cannot hear): proves context running + spatial gains moving
  const r3 = (v) => Math.round(v * 1000) / 1000;
  A.state = () => ctx ? ({
    started: A.started, ctxState: ctx.state, muted: A.muted, time: r3(ctx.currentTime), threat: r3(A.threat), dread: r3(A.dread || 0), deerStill: !!A.deerStill, bear: { moving: !!A.bearMoving, v: r3(A.bearV || 0), prox15: r3(A.bearProx || 0), breath: A.bearBreath || 0 }, birdsOk: A.birdsOk !== false, birdBusTarget: A.birdBusT ?? 1, bearBreathTarget: A.bearBreath || 0, threatHold: r3(Math.max(0, threatHold - (ctx ? ctx.currentTime : 0))), fireVol: r3(A.fireVol || 0), heartBpm: A.bpm || 0, beats: A.beats || 0, duck: r3(A.duck ?? 1), tensionTarget: r3(A.tensionTarget || 0), lastBeat: A.lastBeat || null,
    deerLOS: { dist: r3(vis.dist), inView: vis.inView, occluders: vis.occ, visible: vis.visible, range: r3(vis.range), stingArmed: deerStingArmed, stingPending: r3(stingPending), readable: read.why, readDist: r3(read.dist), lastSting: r3(lastSting) },
    beds: { wind: r3(windGain.gain.value), rustle: r3(rustleGain.gain.value), fire: r3(fireGain.gain.value), firePan: r3(firePan.pan.value), drone: r3(droneGain.gain.value), tension: r3(tensionGain.gain.value), dayPad: r3(dayPadGain.gain.value) },
    fire: A.fireState(),
    loops: Object.fromEntries(Object.entries(loops).map(([k, l]) => [k, { gain: r3(l.g.gain.value), pan: r3(l.p.pan.value), muffle: Math.round(l.mf.frequency.value) }])),
    counts: { ...A.counts }, recent: A.log.slice(-10).map(e => e.ev),
  }) : { started: false, ctxState: 'none (needs first click/key)' };
  // fire debug: live bus gains, and the pure distance curve (what the bus gain would be at distance d)
  A.fireState = () => ctx && fireBus ? { dist: r3(fireStats.dist), fall: r3(fireStats.fall), fuelK: r3(fireStats.fuelK), level: fireStats.level, busGain: r3(fireBus.gain.value), roar: r3(fireGain.gain.value), flutter: r3(flutterGain.gain.value), hiss: r3(hissGain.gain.value), muffleHz: Math.round(fireMuffle.frequency.value), pan: r3(firePan.pan.value), cracklesPerSec: r3(fireStats.rate), crackles: fireStats.crackles, pops: fireStats.pops, sizzles: fireStats.sizzles } : null;
  A.fireGainAt = (d, fuel = G.campfire.fuel) => r3(fireFall(d) * fuelKOf(fuel));
  A.start = start;
  window.__audio = A;
  return A;
}
