// LAST LIGHT score. Fully procedural, sharing audio.js's AudioContext and master bus, so the M mute,
// the compressor and the first-gesture unlock all apply for free.
//  - Day, away from camp: a bright "overworld" adventure score (original material, written by the
//    generator below). An ocarina-like lead (pure sine body, breathy chiff, delayed vibrato) sings
//    4- and 8-bar phrases built as call / answer / sequenced call / cadence, over crisp harp
//    arpeggios, pizzicato strings and a light clean bass. Major keys with Lydian colour (#4 over I,
//    the II chord), heroic 4th / 5th / octave leaps, bVII-IV-I and I-IV-V-vi motion, a glockenspiel
//    sparkle now and then and soft timpani / snare pickups on phrase ends. Form: intro, A, B, A'
//    (the A tune comes back, so it sticks), a short tag, then a stretch of plain forest.
//  - Dusk into night (and any daytime attack): a dungeon-style thriller in E phrygian. Clean low
//    strings re-bowed on each chord, tremolo upper strings, a crisp marcato ostinato, a sparse eerie
//    lead with b2 / tritone sighs, dissonant swells, and short low hits locked to the heartbeat. All
//    of it rises with G.threat and dread, and it cross-fades back to day at dawn.
//  - Near a lit fire the whole score ducks almost silent so the crackle owns the camp.
// Clean mix: plucked / struck voices are additive renders cached per (sample rate, instrument, pitch),
// so a note is just BufferSource -> Gain with a defined attack and a tidy tail. Every non-bass voice is
// high-passed, and the only reverb is a short bright plate (~1.1 s) fed through a 320 Hz high-pass.
// Scheduling: a 40 ms timer schedules notes 0.3 s ahead at exact context times. The leads and the night
// strings are persistent oscillators driven by automation, so there are no per-note node storms.
// Debug: window.__music.state(), .crackleCurve(fuel), .nextSong(),
//        .render('overworld'|'thriller', secs, intensity) (offline peak / RMS / clipping / spectrum).

const LOOKAHEAD = 0.3, TICK_MS = 40, MUSIC_LEVEL = 0.6;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const pickW = (arr, w) => { let s = 0; for (const x of w) s += x; let r = Math.random() * s; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; };
const atOrAbove = (pc, lo) => lo + (((pc - lo) % 12) + 12) % 12; // lowest midi >= lo with pitch class pc
const mod7 = (d) => ((d % 7) + 7) % 7;
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---------- sampled voices: additive renders at the context's own sample rate, cached ----------
// adds a * e^(-t/tau) * sin(2 pi f t) using a two-pole resonator (cheap, exact, starts at zero phase)
function partial(out, sr, f, a, tau) {
  if (f <= 0 || f >= 0.45 * sr || a <= 0) return;
  const w = 2 * Math.PI * f / sr, r = Math.exp(-1 / (tau * sr)), c = 2 * r * Math.cos(w), r2 = r * r;
  const n = Math.min(out.length, Math.ceil(tau * sr * Math.log(a / 1e-5 + 1)));
  let y2 = 0, y1 = a * r * Math.sin(w); if (n > 1) out[1] += y1;
  for (let i = 2; i < n; i++) { const y = c * y1 - r2 * y2; out[i] += y; y2 = y1; y1 = y; }
}
function noiseBurst(out, sr, a, tau, hp) { // decaying noise; hp=true takes the first difference (bright click)
  const n = Math.min(out.length, Math.ceil(tau * sr * 9)); let prev = 0, lp = 0;
  for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1, e = a * Math.exp(-i / (tau * sr));
    if (hp) { out[i] += (x - prev) * 0.5 * e; prev = x; } else { lp += 0.12 * (x - lp); out[i] += lp * 2.5 * e; } }
}
const VOICES = {
  // concert harp: bright plucked partials (pluck near the string end), upper partials die first
  harp: { dur: (m) => clamp(2.0 - (m - 55) * 0.035, 0.8, 2.0), att: 0.0015, fill(o, sr, f, m) {
    const t1 = clamp(0.8 - (m - 60) * 0.012, 0.3, 0.95);
    for (let k = 1; k <= 16 && f * k < 10000; k++) partial(o, sr, f * k, Math.abs(Math.sin(Math.PI * k * 0.08)) / Math.pow(k, 0.9), t1 / (1 + 0.42 * Math.pow(k - 1, 1.1)));
    noiseBurst(o, sr, 0.05, 0.0012, true); } },
  // violin-section pizzicato: short, woody (a body bump near 550 Hz), clean
  pizz: { dur: () => 0.55, att: 0.001, fill(o, sr, f, m) {
    const t1 = clamp(0.3 - (m - 55) * 0.006, 0.1, 0.32);
    for (let k = 1; k <= 14 && f * k < 8000; k++) { const fk = f * k; partial(o, sr, fk, (1 + 1.3 * Math.exp(-Math.pow((fk - 850) / 600, 2))) / Math.pow(k, 0.95), t1 / (1 + 0.3 * (k - 1))); }
    noiseBurst(o, sr, 0.03, 0.001, true); } },
  // light clean bass: round fundamental, a little 2nd / 3rd for pitch definition, a quick finger attack
  bass: { dur: () => 1.3, att: 0.005, fill(o, sr, f) {
    partial(o, sr, f, 1, 0.55); partial(o, sr, 2 * f, 0.32, 0.22); partial(o, sr, 3 * f, 0.13, 0.1); partial(o, sr, 4 * f, 0.07, 0.04); partial(o, sr, 5 * f, 0.05, 0.025); } },
  // glockenspiel: bar modes 1 : 2.76 : 5.40 : 8.93, hard mallet
  glock: { dur: () => 1.6, att: 0.0004, fill(o, sr, f) {
    [[1, 1, 1.1], [2.76, 0.22, 0.3], [5.4, 0.07, 0.09], [8.93, 0.025, 0.04]].forEach(([r, a, t]) => partial(o, sr, f * r, a, t)); } },
  // soft timpani: membrane modes plus a felt-mallet thud, short ring so it never booms
  timp: { dur: () => 1.0, att: 0.003, fill(o, sr, f) {
    [[1, 1, 0.5], [1.5, 0.45, 0.32], [1.98, 0.25, 0.2], [2.44, 0.12, 0.12], [2.9, 0.06, 0.08]].forEach(([r, a, t]) => partial(o, sr, f * r, a, t));
    noiseBurst(o, sr, 0.25, 0.008, false); } },
  // brushed snare: bright noise plus a short shell tone
  snare: { dur: () => 0.3, att: 0.0005, fill(o, sr) { noiseBurst(o, sr, 0.8, 0.055, true); partial(o, sr, 185, 0.35, 0.035); partial(o, sr, 330, 0.18, 0.02); } },
  // night ostinato: marcato low strings (bowed saw spectrum, crisp start, short body)
  marc: { dur: () => 0.55, att: 0.006, fill(o, sr, f) { for (let k = 1; f * k < 4200; k++) partial(o, sr, f * k, 1 / k, 0.2 / (1 + 0.12 * (k - 1))); } },
  // night hit: a tight low drum: falling sine body, a short body knock and a bright click
  hit: { dur: () => 0.8, att: 0.0008, fill(o, sr) {
    let ph = 0; for (let i = 0; i < o.length; i++) { const t = i / sr, f = 56 + 60 * Math.exp(-t / 0.04); ph += 2 * Math.PI * f / sr; o[i] += (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * Math.exp(-t / 0.15); }
    partial(o, sr, 185, 0.45, 0.035); noiseBurst(o, sr, 0.35, 0.004, true); noiseBurst(o, sr, 0.25, 0.025, false); } },
};
const sampCache = new Map();
function voiceBuffer(ctx, kind, midi) {
  const sr = ctx.sampleRate, key = sr + kind + midi; let b = sampCache.get(key); if (b) return b;
  const V = VOICES[kind], n = Math.ceil(V.dur(midi) * sr), out = new Float32Array(n);
  V.fill(out, sr, mtof(midi), midi);
  const at = Math.max(1, Math.floor(V.att * sr)), fade = Math.floor(0.03 * sr); let peak = 1e-9;
  for (let i = 0; i < n; i++) { if (i < at) out[i] *= i / at; const a = out[i] < 0 ? -out[i] : out[i]; if (a > peak) peak = a; }
  const sc = 0.9 / peak; for (let i = 0; i < n; i++) out[i] *= sc * (i > n - fade ? (n - i) / fade : 1);
  b = ctx.createBuffer(1, n, sr); b.copyToChannel(out, 0); sampCache.set(key, b); return b;
}

// ---------- overworld theory (all progressions, rhythms and melodies are this generator's own) ----------
const KEYS = [{ n: 'C', pc: 0 }, { n: 'D', pc: 2 }, { n: 'Eb', pc: 3 }, { n: 'F', pc: 5 }, { n: 'G', pc: 7 }, { n: 'A', pc: 9 }, { n: 'Bb', pc: 10 }];
// chord = [root scale degree, {degree: altered semitone}]: II is the Lydian major II, bVII / bVI / iv are borrowed colour
const CH = { I: [0], ii: [1], iii: [2], IV: [3], V: [4], vi: [5], II: [1, { 3: 6 }], bVII: [6, { 6: 10 }], bVI: [5, { 5: 8, 2: 3 }], iv: [3, { 5: 8 }] };
const PROGS = [ // 8 bars; a pair splits the bar at beat 3. Every one lands on I so the tune can cadence home.
  ['I', 'V', 'vi', 'IV', 'I', 'IV', 'V', 'I'], ['I', 'II', 'IV', 'I', 'vi', 'IV', ['bVII', 'IV'], 'I'],
  ['I', 'IV', 'I', 'V', 'vi', 'IV', 'V', 'I'], ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'bVII', 'I'],
  ['I', 'bVII', 'IV', 'I', 'vi', 'bVII', ['IV', 'V'], 'I'], ['IV', 'V', 'iii', 'vi', 'ii', 'V', 'I', 'I'],
  ['I', 'iii', 'IV', 'II', 'I', 'vi', ['IV', 'iv'], 'I'], ['I', 'V', 'IV', 'I', 'II', 'IV', ['bVII', 'IV'], 'I'],
  ['I', 'IV', 'vi', 'V', 'IV', 'bVI', ['bVII', 'IV'], 'I'],
];
// 2-bar rhythm cells in eighth steps (negative = rest, so every phrase breathes)
const CELLS4 = [[4, 2, 2, 4, 2, -2], [3, 1, 2, 2, 6, -2], [2, 2, 4, 6, -2], [6, 2, 2, 2, 2, -2], [4, 4, 2, 2, 2, -2], [2, 1, 1, 4, 4, -4], [3, 3, 2, 4, -4], [4, 2, 4, 4, -2]];
const ANS4 = [...CELLS4, [-2, 2, 4, 2, 4, -2], [-4, 2, 2, 6, -2], [-2, 1, 1, 2, 2, 6, -2]];
const CAD4 = [[2, 2, 2, 2, 6, -2], [4, 2, 2, 6, -2], [3, 1, 4, 6, -2], [-2, 2, 2, 2, 6, -2]];
const CELLS3 = [[4, 2, 4, -2], [2, 2, 2, 4, -2], [6, 2, 2, -2], [3, 1, 2, 4, -2], [4, 2, 2, 2, -2], [2, 4, 4, -2]];
const ANS3 = [...CELLS3, [-2, 2, 2, 4, -2], [-4, 2, 4, -2]];
const CAD3 = [[2, 2, 2, 4, -2], [4, 2, 4, -2], [3, 1, 2, 4, -2]];
// accompaniment: harp patterns index a ladder of chord tones; pizz tokens r root, f fifth, c two-note chord
const HARP4 = { up: [0, 1, 2, 3, 4, 3, 2, 1], climb: [0, 1, 2, 3, 4, 5, 6, 5], roll: [0, 2, 1, 3, 2, 4, 3, 5], pulse: [0, null, 2, null, 1, null, 3, null], wave: [0, 2, 4, 2, 1, 3, 5, 3] };
const HARP3 = { up: [0, 1, 2, 3, 2, 1], climb: [0, 2, 3, 4, 5, 4], pulse: [0, null, 2, null, 3, null], bell: [0, 1, 2, 4, 3, 2] };
const PIZZ4 = { off: [null, null, 'c', null, null, null, 'c', null], march: ['r', null, 'c', null, 'f', null, 'c', null], skip: ['c', null, null, 'c', null, null, 'c', null] };
const PIZZ3 = { waltz: [null, null, 'c', null, 'c', null], lilt: ['r', null, 'c', null, null, 'c'] };
const INTRO = 2; // bars of harp + bass before the tune

const chordOf = (prog, s, spb) => { const e = prog[Math.floor(s / spb) % prog.length]; return Array.isArray(e) ? e[(s % spb) < 4 ? 0 : 1] : e; };
function chordInfo(song, name) {
  let c = song.cc.get(name); if (c) return c;
  const [r, alt = {}] = CH[name], degs = [r, (r + 2) % 7, (r + 4) % 7], scale = [0, 2, 4, 5, 7, 9, 11];
  for (const k in alt) scale[k] = alt[k];
  if (song.lydian && (name === 'I' || name === 'iii' || name === 'V')) scale[3] = 6; // the raised 4th, the bright adventurous colour
  const pcs = degs.map((d) => (scale[d] + song.key.pc) % 12), ladder = [];
  for (let m = atOrAbove(pcs[0], 53); ladder.length < 7; m++) if (pcs.includes(m % 12)) ladder.push(m);
  const up = []; for (let m = 62; up.length < 2; m++) if (pcs.includes(m % 12)) up.push(m);
  const bass = atOrAbove(pcs[0], 40), pz = atOrAbove(pcs[0], 48);
  c = { name, degs, scale, pcs, rootPc: pcs[0], ladder, pizzC: up, pizzR: pz, pizzF: pz + 7 <= 62 ? pz + 7 : pz - 5, bass, bass5: bass + 7 > 55 ? bass - 5 : bass + 7 };
  song.cc.set(name, c); return c;
}
const degMidi = (song, deg, ci) => song.tonic + 12 * Math.floor(deg / 7) + ci.scale[mod7(deg)];

// one 8-bar tune: call (bars 0-1), answer (2-3), the call again sequenced up (4-5), cadence home (6-7)
function genMelody(song, prog, o = {}) {
  const spb = song.spb, L2 = spb * 2, m3 = song.meter === 3, lo = o.lo != null ? o.lo : -2, hi = o.hi != null ? o.hi : song.hiDeg;
  const ct = (s) => chordInfo(song, chordOf(prog, s, spb)).degs;
  const bound = (x) => x < lo ? Math.min(hi, 2 * lo - x) : x > hi ? Math.max(lo, 2 * hi - x) : x;
  const snap = (deg, s) => { const c = ct(s); for (const dd of [0, 1, -1, 2, -2]) { const x = deg + dd; if (x >= lo && x <= hi && c.includes(mod7(x))) return x; } return bound(deg); };
  const cellNotes = (cell, off) => { const r = []; let s = 0; for (const d of cell) { if (d > 0) r.push([off + s, d]); s += Math.abs(d); } return r; };
  const notes = [], push = (s, d, deg, tag) => { notes.push({ s, d, deg, tag }); return deg; };
  const line = (rh, start, target, heroic, tag) => {
    let deg = start, leap = 0; const out = [];
    rh.forEach(([s, d], i) => {
      if (i > 0) {
        if (i === 1 && heroic && Math.random() < 0.72) { const L = pick([3, 4, 4, 7]); leap = deg + L <= hi ? L : -L; deg += leap; } // a 4th, a 5th or the octave
        else if (leap) { deg -= Math.sign(leap) * (Math.random() < 0.7 ? 1 : 2); leap = 0; } // then step back to fill the gap
        else { let st = pickW([-2, -1, 1, 2], [1, 3, 3, 1]); if (target != null && target !== deg && Math.random() < 0.55) st = Math.sign(target - deg); deg = bound(deg + st); }
      }
      if (d >= 3 || s % spb === 0 || i === rh.length - 1) deg = snap(deg, s); // long and strong notes sit on chord tones
      out.push(push(s, d, deg, tag));
    });
    return out;
  };
  const cells = m3 ? CELLS3 : CELLS4, callCell = pick(cells), rc = cellNotes(callCell, 0);
  const callDegs = line(rc, snap(pick(o.start || [0, 2, 4]), 0), null, true, 'call');
  const last = callDegs[callDegs.length - 1], ra = cellNotes(pick((m3 ? ANS3 : ANS4).filter((c) => c !== callCell)), L2);
  line(ra, bound(last + pick([-1, 1, 2])), last - 3, false, 'answer');
  { const fin = notes[notes.length - 1], c = ct(fin.s); let best = null; // the answer ends open, on 2 or 5 (a half cadence)
    for (let x = lo; x <= hi; x++) if ((mod7(x) === 1 || mod7(x) === 4) && c.includes(mod7(x)) && (best === null || Math.abs(x - fin.deg) < Math.abs(best - fin.deg))) best = x;
    if (best !== null) fin.deg = best; }
  const shift = pick([0, 1, 1, 2]), half = Math.ceil(rc.length / 2); let deg = 0;
  rc.forEach(([s, d], i) => { const S = s + 2 * L2;
    deg = i < half ? bound(callDegs[i] + shift) : bound(deg + pickW([-1, 1, 2], [2, 2, 1]));
    if (d >= 3 || i === rc.length - 1 || S % spb === 0) deg = snap(deg, S); push(S, d, deg, 'call2'); });
  const rcad = cellNotes(pick(m3 ? CAD3 : CAD4), 3 * L2);
  let cd = notes[notes.length - 1].deg, H = 0; for (let x = lo; x <= hi; x++) if (mod7(x) === 0 && Math.abs(x - cd - 1) < Math.abs(H - cd - 1)) H = x;
  rcad.forEach(([s, d], i) => { const left = rcad.length - 1 - i;
    if (left === 0) cd = H; else if (left === 1) cd = bound(H + pick([1, 1, -1, 4])); // into the tonic by step, from the leading tone, or down a 5th
    else { cd = bound(cd + (cd > H + left ? -1 : cd < H - 1 ? 1 : pick([-1, 1]))); if (d >= 3 || s % spb === 0) cd = snap(cd, s); }
    push(s, d, cd, left === 0 ? 'home' : 'cad'); });
  return { notes, byStep: new Map(notes.map((n) => [n.s, n])), n: notes.length };
}

let songSeq = 0;
function newSong(prevKey) {
  const key = pick(KEYS.filter((k) => k !== prevKey)), meter = Math.random() < 0.3 ? 3 : 4, spb = meter * 2;
  const bpm = meter === 3 ? rnd(112, 136) : rnd(96, 116), tonic = atOrAbove(key.pc, 65);
  const song = { id: ++songSeq, key, meter, spb, bpm, tonic, hiDeg: tonic > 71 ? 7 : 9, lydian: Math.random() < 0.45, cc: new Map(), sections: [] };
  const harps = Object.keys(meter === 3 ? HARP3 : HARP4), pizzs = Object.keys(meter === 3 ? PIZZ3 : PIZZ4);
  const progA = pick(PROGS), progB = pick(PROGS.filter((p) => p !== progA)), melA = genMelody(song, progA);
  const melB = genMelody(song, progB, { start: [4, 7], hi: song.hiDeg + 1 });
  const harpA = pick(harps), form = pickW([['A', 'B', 'A2'], ['A', 'A2', 'B'], ['A', 'B']], [6, 2, 2]);
  song.form = form.join(' ');
  for (const name of form) {
    if (name === 'A') song.sections.push({ name, prog: progA, mel: melA, harp: harpA, pizz: Math.random() < 0.45 ? pick(pizzs) : null, answer: 'lead', glock: false });
    else if (name === 'B') song.sections.push({ name, prog: progB, mel: melB, harp: Math.random() < 0.6 ? pick(harps.filter((h) => h !== harpA)) : null, pizz: pick(pizzs), answer: pickW(['harp', 'glock', 'lead'], [4, 2, 3]), glock: false });
    else song.sections.push({ name, prog: progA, mel: melA, harp: harpA, pizz: pick(pizzs), answer: 'lead', glock: true }); // A': same tune, fuller, glock doubling
  }
  song.introProg = [progA[0] === 'vi' ? 'IV' : 'I', Math.random() < 0.5 ? 'I' : 'IV'];
  song.bars = INTRO + 8 * song.sections.length; // then one tag bar and one bar of ring-out
  return song;
}

// ---------- thriller theory (E phrygian; audio.js keeps a faint E drone floor underneath) ----------
const TSEQ = [[[40, 'm'], [36, 'M'], [41, 'M'], [40, 'm']], [[40, 'm'], [43, 'M'], [41, 'M'], [40, 'm']], [[40, 'm'], [45, 'm'], [40, 'm'], [46, 'd']], [[40, 'm'], [41, 'M'], [38, 'M'], [41, 'M']]];
const QUAL = { m: [0, 3, 7], M: [0, 4, 7], d: [0, 3, 6] };
const OST = [
  [0, null, 0, null, 0, null, 1, null, 0, null, 0, null, 3, null, 1, null], [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 1, 0, 12, 1],
  [0, null, 0, 0, null, 0, 0, null, 0, null, 0, 0, 6, null, 5, null], [0, 7, 12, 7, 0, 7, 13, 7, 0, 7, 12, 7, 0, 6, 1, 0],
];
// sparse eerie lead figures, in semitones above the chord root: b2 sighs, tritones, a falling minor 6th
const NSHAPES = [[7, 8, 7], [12, 13, 12, 7], [0, 6, 5], [12, 11, 7], [3, 1, 0], [7, 6, 1, 0], [8, 7], [15, 13, 12]];

// short bright plate: a few discrete early reflections, then a dense tail that barely darkens
function makePlate(ctx, secs) {
  const sr = ctx.sampleRate, n = Math.floor(sr * secs), b = ctx.createBuffer(2, n, sr), pre = Math.floor(0.006 * sr);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0;
    for (const [ms, a] of [[7, 0.5], [11, 0.38], [17, 0.3], [23, 0.22], [31, 0.16]]) { const i = Math.floor((ms + c * 1.3) * sr / 1000); if (i < n) d[i] += a * (Math.random() < 0.5 ? -1 : 1); }
    for (let i = pre; i < n; i++) { const t = (i - pre) / sr, k = 0.8 - 0.35 * Math.min(1, t / secs); lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] += lp * 0.35 * Math.exp(-6.9 * t / (secs * 0.8)) * (t < 0.004 ? t / 0.004 : 1) * (i > n - 256 ? (n - i) / 256 : 1); } }
  return b;
}

// ---------- the engine: works on the live context or an OfflineAudioContext ----------
function buildEngine(ctx, dest, G) {
  const E = { ctx, counts: { lead: 0, harp: 0, pizz: 0, bass: 0, glock: 0, timp: 0, snare: 0, ostinato: 0, hits: 0, swells: 0, chords: 0, nightLead: 0, songs: 0 }, live: 0, ahead: [] };
  const gain = (v, to) => { const n = ctx.createGain(); n.gain.value = v; if (to) n.connect(to); return n; };
  const bq = (type, f, q = 0.7, db = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = db; return n; };
  const panTo = (p, to) => { const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(to); return n; };
  const chain = (...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); ns[0]._tail = ns[ns.length - 1]; return ns[0]; };
  const music = gain(0, dest), day = gain(0, music), thrill = gain(0, music), dayIn = gain(1.0, day);
  // one short plate; the sends follow their bus levels so the room fades with its score
  const dSend = gain(0), tSend = gain(0), verbIn = bq('highpass', 320, 0.7), verb = ctx.createConvolver(); verb.buffer = makePlate(ctx, 1.1);
  dSend.connect(verbIn); tSend.connect(verbIn); chain(verbIn, verb, gain(0.6, music));
  // a channel: high-pass (every non-bass voice), optional EQ, low-pass, pan, plus a post-EQ reverb send
  const channel = (out, send, hp, lp, pan, sendAmt, extra = [], lvl = 1) => { const inp = gain(lvl); let last = inp; const add = (n) => { last.connect(n); last = n; };
    if (hp) add(bq('highpass', hp, 0.7)); for (const e of extra) add(e); if (lp) add(bq('lowpass', lp, 0.7));
    last.connect(panTo(pan, out)); if (sendAmt) last.connect(gain(sendAmt, send)); return inp; };
  const inst = {
    // last argument = channel level: the ocarina leads, harp and pizz sit just under it, the bass stays light
    lead: channel(dayIn, dSend, 240, 6500, 0.02, 0.2),
    harp: channel(dayIn, dSend, 190, 0, -0.28, 0.15, [bq('highshelf', 3500, 0.7, 3)], 1.3),
    pizz: channel(dayIn, dSend, 170, 7500, 0.3, 0.1, [bq('peaking', 2500, 1, 2)], 1.6),
    bass: channel(dayIn, null, 38, 1400, 0, 0, [bq('peaking', 220, 1.2, -2)], 0.5),
    glock: channel(dayIn, dSend, 700, 0, 0.16, 0.22, [], 2.0),
    timp: channel(dayIn, dSend, 50, 3200, -0.12, 0.07),
    snare: channel(dayIn, dSend, 300, 9500, 0.1, 0.08, [], 2.5),
  };
  // night channels: the ostinato's low-pass and level ride the threat
  const ostLP = bq('lowpass', 1200, 0.6), ostG = gain(0, thrill); const ostIn = chain(gain(1), bq('highpass', 70, 0.7), ostLP); ostIn._tail.connect(ostG); ostIn._tail.connect(gain(0.06, tSend));
  const hitIn = chain(gain(1), bq('highpass', 32, 0.7)); hitIn._tail.connect(thrill);
  const nLeadG = gain(1), nLeadIn = channel(nLeadG, tSend, 300, 4200, 0.18, 0.3); nLeadG.connect(thrill);
  const nStrIn = channel(thrill, tSend, 0, 0, -0.1, 0.16), nLowIn = channel(thrill, tSend, 0, 0, 0, 0.06), swellIn = channel(thrill, tSend, 0, 0, 0.05, 0.15);
  E.buses = { music, day, thrill }; E.inst = { ...inst, ost: ostIn, hit: hitIn, nlead: nLeadIn, nstr: nStrIn, nlow: nLowIn, swell: swellIn }; // (all soloable in render)
  const noiseBuf = (() => { const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; })();

  const track = (t) => { E.ahead.push(t); };
  const play = (kind, midi, t, v, to = inst[kind], cnt = kind) => {
    if (!(v > 0)) return; const s = ctx.createBufferSource(); s.buffer = voiceBuffer(ctx, kind, midi);
    const g = gain(v); s.connect(g); g.connect(to); s.start(Math.max(t, ctx.currentTime));
    E.live++; s.onended = () => { E.live--; g.disconnect(); }; E.counts[cnt]++; track(t);
  };

  // persistent mono lead voice: sine body + a touch of 2nd harmonic and triangle, a band-passed breath, delayed vibrato
  const mkLead = (cfg, out, nodes) => {
    const vca = gain(0, out), tone = gain(1, vca), mk = (type, mult, g) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = 440 * mult; o.connect(gain(g, tone)); o._m = mult; return o; };
    const oscs = [mk('sine', 1, 1), mk('sine', 2, cfg.h2), mk('triangle', 1, cfg.tri)];
    const br = ctx.createBufferSource(); br.buffer = noiseBuf; br.loop = true; const bpf = bq('bandpass', 2400, 1.1), bG = gain(0, out); chain(br, bpf, bG);
    const vib = ctx.createOscillator(); vib.frequency.value = cfg.vibRate; const vibG = gain(0); vib.connect(vibG); for (const o of oscs) vibG.connect(o.detune);
    for (const o of [...oscs, br, vib]) { o.start(); if (nodes) nodes.push(o); }
    return { oscs, vca, bG, bpf, vibG, cfg };
  };
  // a tongued note: soft breath chiff, a small upward scoop, the vibrato blooms only on held notes, a tidy release
  const leadNote = (L, t, midi, dur, v = 1) => {
    const c = L.cfg, f = mtof(midi), pk = c.level * v, rel = t + Math.max(0.05, dur - c.rel * 2);
    for (const o of L.oscs) { o.frequency.setValueAtTime(f * o._m * c.scoop, t); o.frequency.setTargetAtTime(f * o._m, t + 0.004, 0.018); }
    L.vca.gain.setTargetAtTime(pk, t, c.att); L.vca.gain.setTargetAtTime(pk * c.sus, t + c.att * 4, 0.3); L.vca.gain.setTargetAtTime(0, rel, c.rel);
    L.bpf.frequency.setValueAtTime(clamp(f * 2.5, 1200, 6500), t);
    L.bG.gain.setTargetAtTime(c.chiff * v, t, 0.003); L.bG.gain.setTargetAtTime(c.breath * v, t + 0.02, 0.03); L.bG.gain.setTargetAtTime(0, rel, c.rel);
    L.vibG.gain.setTargetAtTime(0, t, 0.02); if (dur > c.vibDelay + 0.15) L.vibG.gain.setTargetAtTime(c.vibDepth, t + c.vibDelay, 0.18);
  };
  // a slurred phrase: one breath, gliding between pitches (the night lead)
  const leadPhrase = (L, t, seq, v = 1) => {
    const c = L.cfg, pk = c.level * v; let tt = t;
    L.vca.gain.setTargetAtTime(pk, t, c.att); L.bG.gain.setTargetAtTime(c.breath * v, t, 0.05);
    seq.forEach(([m, d], i) => { const f = mtof(m);
      for (const o of L.oscs) { if (i === 0) o.frequency.setValueAtTime(f * o._m, tt); else o.frequency.setTargetAtTime(f * o._m, tt, c.glide); }
      L.vibG.gain.setTargetAtTime(0, tt, 0.05); if (d > c.vibDelay + 0.2) L.vibG.gain.setTargetAtTime(c.vibDepth, tt + c.vibDelay, 0.25);
      tt += d; });
    L.vca.gain.setTargetAtTime(0, tt - c.rel * 2, c.rel); L.bG.gain.setTargetAtTime(0, tt - c.rel * 2, c.rel);
    return tt;
  };
  const OCARINA = { h2: 0.07, tri: 0.12, level: 0.145, att: 0.012, sus: 0.86, rel: 0.03, scoop: 0.986, chiff: 0.05, breath: 0.011, vibRate: 5.3, vibDepth: 14, vibDelay: 0.28, glide: 0.02 };
  const NIGHT_LEAD = { h2: 0, tri: 0.32, level: 0.1, att: 0.07, sus: 1, rel: 0.22, scoop: 1, chiff: 0, breath: 0.005, vibRate: 4.2, vibDepth: 10, vibDelay: 0.45, glide: 0.07 };
  let ocarina = null;

  // ---- overworld player
  const D = E.D = { song: null, k: 0, nextT: 0, resumeAt: 0, lastKey: null };
  const hv = (b) => b * (0.92 + Math.random() * 0.14); // tight velocity humanising
  const sparkle = (t, ci, n, v) => { const ms = []; for (let m = 84; ms.length < n && m < 100; m++) if (ci.pcs.includes(m % 12)) ms.push(m); ms.forEach((m, i) => play('glock', m, t + i * 0.075, hv(v * (1 - i * 0.12)))); };
  const timpTonic = (song) => atOrAbove(song.key.pc, 41), timpFifth = (song) => { const x = timpTonic(song) + 7; return x > 53 ? x - 12 : x; };
  const playDayStep = (t, song, k) => {
    const spb = song.spb, bar = Math.floor(k / spb), s = k % spb, stepDur = 60 / song.bpm / 2;
    if (bar >= song.bars) { // tag: a harp roll up the tonic chord, low root, glock and a soft timpani; then let it ring
      if (bar === song.bars && s === 0) { const ci = chordInfo(song, 'I');
        ci.ladder.slice(0, 6).forEach((m, i) => play('harp', m, t + i * 0.038, hv(0.17 + i * 0.012)));
        play('bass', ci.bass, t, 0.3); play('timp', timpTonic(song), t, 0.2); play('glock', song.tonic + 12, t + 0.23, 0.1);
        if (ocarina) leadNote(ocarina, t, song.tonic + 12 > 88 ? song.tonic : song.tonic + 12, stepDur * 6, 0.7); }
      return; }
    if (bar < INTRO) { // harp + bass set up the key, a sparkle on the downbeat
      const sec = song.sections[0], ci = chordInfo(song, song.introProg[bar]), pat = (song.meter === 3 ? HARP3 : HARP4)[sec.harp || 'up'];
      if (pat[s] != null) play('harp', ci.ladder[pat[s]], t, hv(s === 0 ? 0.2 : 0.15));
      if (s === 0) play('bass', ci.bass, t, hv(0.3));
      if (bar === 0 && s === 0 && Math.random() < 0.6) sparkle(t + 0.01, ci, 3, 0.08);
      if (bar === INTRO - 1 && s === spb - 2 && Math.random() < 0.5) for (let i = 0; i < 4; i++) play('snare', 0, t + i * stepDur / 2, 0.035 + i * 0.012); // pickup into the tune
      return; }
    const si = Math.floor((bar - INTRO) / 8), b8 = (bar - INTRO) % 8, sec = song.sections[si], S = b8 * spb + s;
    const ci = chordInfo(song, chordOf(sec.prog, S, spb)), last = si === song.sections.length - 1;
    if (sec.harp) { const p = (song.meter === 3 ? HARP3 : HARP4)[sec.harp][s]; if (p != null) play('harp', ci.ladder[p], t, hv(s === 0 ? 0.19 : p >= 4 ? 0.15 : 0.13)); }
    if (sec.pizz) { const tok = (song.meter === 3 ? PIZZ3 : PIZZ4)[sec.pizz][s];
      if (tok === 'c') { play('pizz', ci.pizzC[0], t, hv(0.12)); play('pizz', ci.pizzC[1], t + 0.004, hv(0.11)); }
      else if (tok === 'r') play('pizz', ci.pizzR, t, hv(0.14)); else if (tok === 'f') play('pizz', ci.pizzF, t, hv(0.12)); }
    { const nextName = s === spb - 2 ? chordOf(b8 === 7 && song.sections[si + 1] ? song.sections[si + 1].prog : sec.prog, (S + 2) % (8 * spb), spb) : null; // bass: root, fifth, walk into a change
      if (s === 0) play('bass', ci.bass, t, hv(0.3));
      else if (s === 4 && song.meter === 4) play('bass', ci.bass5, t, hv(0.22));
      else if (nextName && nextName !== ci.name && song.meter === 4 && Math.random() < 0.35) { const nb = chordInfo(song, nextName).bass; play('bass', nb + (Math.random() < 0.5 ? -1 : 2), t, hv(0.17)); } }
    const nt = sec.mel.byStep.get(S);
    if (nt) { const m = degMidi(song, nt.deg, ci), dur = nt.d * stepDur * (nt.d <= 1 ? 0.78 : 0.9), v = (nt.tag === 'home' ? 0.95 : 0.85) + Math.random() * 0.12;
      const ans = nt.tag === 'answer' && sec.answer !== 'lead';
      if (ans && sec.answer === 'harp') { play('harp', m, t, hv(0.22)); if (nt.d >= 4) play('harp', m - 12, t + 0.012, hv(0.1)); }
      else if (ans) play('glock', m + 12 <= 100 ? m + 12 : m, t, hv(0.12));
      else { if (!ocarina) ocarina = mkLead(OCARINA, inst.lead, null); leadNote(ocarina, t, m, dur, v); E.counts.lead++; track(t); }
      if (sec.glock && (nt.tag === 'home' || (nt.tag === 'call' && S === sec.mel.notes[0].s))) play('glock', m + 12 <= 100 ? m + 12 : m, t + 0.002, hv(0.07)); }
    // phrase-end percussion: soft timpani on the 4-bar half-way and the cadence, a snare pickup into the next section
    if (b8 === 3 && s === spb - 2 && Math.random() < 0.5) play('timp', timpFifth(song), t, hv(0.13));
    if (b8 === 7 && s === 0) play('timp', timpTonic(song), t, hv(0.19));
    if (b8 === 7 && s === spb - 2 && (!last || Math.random() < 0.4) && Math.random() < 0.65) for (let i = 0; i < 4; i++) play('snare', 0, t + i * stepDur / 2, 0.03 + i * 0.013);
    if (b8 === 0 && s === 0 && si > 0 && Math.random() < 0.55) { play('timp', timpTonic(song), t, hv(0.16)); sparkle(t + 0.01, ci, 2, 0.07); }
    if ((b8 === 1 || b8 === 5) && s === 0 && Math.random() < 0.12) sparkle(t + stepDur, ci, 1, 0.06);
  };
  const schedDay = (from, to, allow) => {
    if (!D.song) { if (!allow || from < D.resumeAt) return; D.song = newSong(D.lastKey); D.lastKey = D.song.key; D.k = 0; D.nextT = from + 0.1; E.counts.songs++; }
    if (!allow) { D.song = null; D.resumeAt = from + 3; return; } // night took over: the next song starts fresh after dawn
    if (D.nextT < from - 0.2) D.nextT = from + 0.02; // timer stalled: skip ahead rather than bursting
    const song = D.song, stepDur = 60 / song.bpm / 2;
    while (D.nextT < to) {
      playDayStep(D.nextT + (Math.random() - 0.5) * 0.003, song, D.k); // straight time, about +-1.5 ms of humanising
      D.k++; D.nextT += stepDur;
      if (D.k >= (song.bars + 2) * song.spb) { D.song = null; D.resumeAt = D.nextT + rnd(8, 18); break; } // a quiet stretch between songs
    }
  };

  // ---- thriller voice (created at dusk, released a few seconds after dawn)
  let T = null;
  const buildThr = () => {
    const nodes = [], osc = (type, f, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.start(); nodes.push(o); return o; };
    // clean low strings: root + fifth, one saw each (no detuned stacks), gently low-passed, re-bowed on every chord
    const lowBow = gain(1), lowLP = bq('lowpass', 700, 0.5), lowG = gain(0, nLowIn); chain(lowBow, bq('highpass', 55, 0.7), lowLP, lowG);
    const lowR = osc('sawtooth', 82.4), lowF = osc('sawtooth', 123.5); lowR.connect(gain(0.6, lowBow)); lowF.connect(gain(0.38, lowBow));
    // tremolo upper strings: three single saws, high-passed so they never thicken the low mids
    const strHP = bq('highpass', 240, 0.7), strLP = bq('lowpass', 2000, 0.5), trem = gain(0.75), strG = gain(0); chain(strHP, strLP, trem, strG); strG.connect(nStrIn);
    const tremLfo = osc('sine', 7); tremLfo.connect(gain(0.25, trem.gain));
    const voices = []; for (let i = 0; i < 3; i++) { const o = osc('sawtooth', 330); o.connect(gain(0.2, strHP)); voices.push(o); }
    const whG = gain(0, nStrIn); osc('sine', 1318.5).connect(whG); osc('sine', 1396.9).connect(gain(0.7, whG)); // high sul-ponticello whine, two sines beating
    const nl = mkLead(NIGHT_LEAD, nLeadIn, nodes);
    return { nodes, lowBow, lowLP, lowG, lowR, lowF, strG, strLP, tremLfo, voices, whG, nl, nextT: 0, step: 0, seq: pick(TSEQ), pat: pick(OST), root: 40, chord: null, nextSwell: 0, nextLead: 0, leadBusyTo: 0, lastHit: -1, beatN: 0, quietFor: 0 };
  };
  E.thrLevels = (I, t, tau = 0.3) => { if (!T) return; const set = (p, v, tc = tau) => p.setTargetAtTime(v, t, tc);
    set(T.lowG.gain, 0.21 * (0.75 + 0.35 * I)); set(T.lowLP.frequency, 480 + 1100 * I + 60 * Math.sin(t * 0.11), 0.8);
    set(T.strG.gain, 0.13 + 0.25 * I); set(T.strLP.frequency, 1500 + 2800 * I, 0.8); set(T.tremLfo.frequency, 5 + 8 * I, 0.8);
    set(ostG.gain, 0.38 * sstep(0.08, 0.45, I)); set(ostLP.frequency, 900 + 3200 * I, 0.5); set(T.whG.gain, 0.005 * sstep(0.55, 1, I));
    set(nLeadG.gain, 1 - 0.55 * sstep(0.6, 1, I)); };
  const setChord = (t, [root, q], I) => { const iv = QUAL[q], ms = [root + 24, root + 24 + iv[1], I > 0.65 ? root + 25 : root + 24 + iv[2]];
    T.voices.forEach((o, i) => o.frequency.setTargetAtTime(mtof(ms[i]), t, 0.06));
    T.lowR.frequency.setValueAtTime(mtof(root), t); T.lowF.frequency.setValueAtTime(mtof(root + 7), t);
    T.lowBow.gain.setTargetAtTime(0.45, t - 0.04, 0.015); T.lowBow.gain.setTargetAtTime(1, t + 0.02, 0.35); // a clean re-bow, not a smear
    T.root = atOrAbove(root % 12, 36); T.chord = [root, q]; E.counts.chords++; };
  const ostNote = (t, midi, acc, I) => { play('marc', midi, t, (0.5 + 0.5 * I) * acc, ostIn, 'ostinato'); };
  const hit = (t, I) => { play('hit', 0, t, 0.26 + 0.26 * I, hitIn, 'hits'); };
  const swell = (t, I) => { // dissonant cluster crescendo with a light noise wash; lands on a hit when things are bad
    const dur = rnd(3, 5.5), r = T.root + 12, ms = [r, r + 1, r + 6, r + 12, r + 13].sort(() => Math.random() - 0.5).slice(0, 3 + (I > 0.5 ? 1 : 0));
    const lp = bq('lowpass', 300, 0.8); lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(1800 + 1800 * I, t + dur);
    const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((0.07 + 0.06 * I) / Math.sqrt(ms.length), t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    chain(lp, bq('highpass', 120, 0.7), g); g.connect(swellIn);
    for (const m of ms) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = rnd(-10, 10); o.connect(lp); o.start(t); o.stop(t + dur + 0.15); }
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const ng = gain(0); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.012 + 0.012 * I, t + dur); ng.gain.linearRampToValueAtTime(0, t + dur + 0.06);
    chain(n, bq('highpass', 2500), ng, swellIn); n.start(t); n.stop(t + dur + 0.1);
    if (I > 0.5) hit(t + dur + 0.02, I); E.counts.swells++; track(t); };
  const nightPhrase = (t, I) => { // 2-4 slurred notes, long first and last; quieter and rarer as the ostinato takes over
    const base = atOrAbove(T.chord ? T.chord[0] % 12 : 4, 64), shape = pick(NSHAPES), beat = 60 / (70 + 60 * I);
    const seq = shape.map((st, i) => [base + st, (i === 0 ? rnd(1.2, 2) : i === shape.length - 1 ? rnd(1.8, 2.8) : rnd(0.5, 1.1)) * beat * 1.6]);
    T.leadBusyTo = leadPhrase(T.nl, t, seq, 0.85 + Math.random() * 0.2); E.counts.nightLead++; track(t); };
  const schedThr = (from, to, S) => {
    if (!T) { T = buildThr(); T.nextT = from + 0.05; T.nextSwell = from + rnd(6, 12); T.nextLead = from + rnd(3, 7); E.thrLevels(S.intensity, from, 0.01); }
    const I = S.intensity, A = G && G.audio, hb = !!(A && A.bpm > 0); // hits lock to the heartbeat when it beats, else to the bar
    if (T.nextT < from - 0.2) T.nextT = from + 0.02;
    while (T.nextT < to) {
      const t = T.nextT, sib = T.step % 16, bar = Math.floor(T.step / 16);
      if (sib === 0 && bar % 2 === 0) { const ci = (bar / 2) % T.seq.length; setChord(t, T.seq[ci], I); if (ci === T.seq.length - 1 && Math.random() < 0.5) { T.seq = pick(TSEQ); T.pat = pick(OST); } }
      const off = T.pat[sib], stepDur = 60 / (70 + 60 * I) / 4;
      if (I > 0.08 && off !== null && (I > 0.55 || sib % 2 === 0)) ostNote(t, T.root + 12 + off, sib % 4 === 0 ? 1 : 0.66, I);
      if (!hb && I > 0.45 && sib === 0) hit(t, I);
      if (!hb && I > 0.8 && sib === 8) hit(t, I * 0.8);
      T.nextT += stepDur; T.step++;
    }
    if (hb && I > 0.45) { const nb = A.nextBeatAt;
      if (nb > T.lastHit + 0.25 && nb >= from && nb < to + 0.2) { T.beatN++; if (I > 0.75 || T.beatN % 2 === 0) hit(nb, I * 0.85); T.lastHit = nb; } }
    if (from >= T.nextSwell) { if (I > 0.1) swell(from + 0.05, I); T.nextSwell = from + (30 - 20 * I) * rnd(0.7, 1.3); }
    if (from >= T.nextLead && from >= T.leadBusyTo) { if (I < 0.92) nightPhrase(from + 0.05, I); T.nextLead = from + rnd(7, 14) * (1 + 0.6 * I); }
  };
  E.dropThr = () => { if (!T) return; for (const o of T.nodes) { try { o.stop(); } catch (e) { /* already stopped */ } } for (const n of [T.lowG, T.strG, T.whG, T.nl.vca, T.nl.bG]) n.disconnect(); T = null; };
  E.thrInfo = () => T ? { alive: true, bpm: Math.round(70 + 60 * (E.lastI || 0)), chord: T.chord, step: T.step, nextSwellIn: r3(T.nextSwell - ctx.currentTime), nextLeadIn: r3(Math.max(T.nextLead, T.leadBusyTo) - ctx.currentTime), lowStrings: r3(T.lowG.gain.value), strings: r3(T.strG.gain.value), ostinato: r3(ostG.gain.value), whine: r3(T.whG.gain.value) } : { alive: false };

  // one scheduling pass over [from, to)
  E.schedule = (from, to, S) => {
    E.lastI = S.intensity;
    schedDay(from, to, D.song ? S.nightMix < 0.65 : S.nightMix < 0.35);
    if (S.nightMix > 0.005) { schedThr(from, to, S); T.quietFor = 0; }
    else if (T) { T.quietFor += to - from; if (T.quietFor > 6) E.dropThr(); }
    let i = 0; while (i < E.ahead.length && E.ahead[i] < from) i++; if (i) E.ahead.splice(0, i); // keep only notes not yet started
  };
  E.levels = (L, t, tau) => { music.gain.setTargetAtTime(L.music, t, tau.music); day.gain.setTargetAtTime(L.day, t, tau.mix); thrill.gain.setTargetAtTime(L.thrill, t, tau.mix);
    dSend.gain.setTargetAtTime(L.day, t, tau.mix); tSend.gain.setTargetAtTime(L.thrill, t, tau.mix); E.thrLevels(L.I, t); };
  E.songInfo = () => { const s = D.song; if (!s) return { playing: false, resumeIn: r3(Math.max(0, D.resumeAt - ctx.currentTime)) };
    const bar = Math.floor(D.k / s.spb), inTune = bar >= INTRO && bar < s.bars, si = inTune ? Math.floor((bar - INTRO) / 8) : bar < INTRO ? 0 : s.sections.length - 1, sec = s.sections[si];
    return { playing: true, id: s.id, key: s.key.n, colour: s.lydian ? 'lydian' : 'major', meter: `${s.meter}/4`, bpm: Math.round(s.bpm), form: s.form,
      section: bar < INTRO ? 'intro' : inTune ? `${sec.name} (${si + 1}/${s.sections.length})` : 'tag', bar,
      chord: inTune ? chordOf(sec.prog, ((bar - INTRO) % 8) * s.spb + (D.k % s.spb), s.spb) : 'I', harp: sec.harp, pizz: sec.pizz, answer: sec.answer, tune: `${sec.mel.n} notes` }; };
  return E;
}

export function createMusic(G) {
  const M = { mode: 'off', active: false, targets: null };
  const S = { nightMix: 0, intensity: 0.1, duck: 1, nearK: 0, fireDist: 0, danger: 0 };
  let E = null, timer = 0;
  const tick = () => { if (!E || E.ctx.state !== 'running') return; const t = E.ctx.currentTime; E.schedule(t, t + LOOKAHEAD, S); };
  M.update = (dt) => {
    const A = G.audio; if (!A || !A.started || !A.ctx || !A.master) return;
    if (!E) { E = buildEngine(A.ctx, A.master, G); timer = setInterval(tick, TICK_MS); M.active = true; }
    if (A.ctx.state !== 'running') return;
    const t = A.ctx.currentTime, dn = G.daynight, playing = G.mode === 'playing';
    // dusk -> night cross-fade over the last ~20 s of day; dawn fades back. A daytime attack also pulls the score dark.
    const nightT = dn.phase === 'night' ? 1 : clamp((20 - dn.timeLeft()) / 14, 0, 1), dread = A.dread || 0;
    S.danger = playing ? sstep(0.3, 0.7, Math.max(dread, G.threat || 0)) : 0;
    const mixT = Math.max(nightT, S.danger);
    S.nightMix += (mixT - S.nightMix) * Math.min(1, dt / (mixT > S.nightMix ? 2.5 : 5));
    const iT = playing ? Math.max(G.threat || 0, dread * 0.9, dn.phase === 'night' ? 0.1 + 0.32 * dn.phaseProgress() : 0.1) : 0.1;
    S.intensity += (iT - S.intensity) * Math.min(1, dt * (iT > S.intensity ? 1.5 : 0.3));
    // duck under a lit fire: about -26 dB inside 8 m, full beyond 18 m. At night a high threat pushes back through.
    const fire = G.campfire, P = G.controls.pos, lit = fire.fuel > 0; S.fireDist = Math.hypot(P.x - fire.x, P.z - fire.z);
    S.nearK = G.mode === 'title' ? 0 : (1 - sstep(8, 18, S.fireDist)) * (lit ? 1 : 0.3);
    S.duck = 1 - S.nearK * (1 - (0.05 + S.nightMix * (0.05 + 0.35 * S.intensity)));
    const fade = G.mode === 'dead' || G.mode === 'won' ? 0 : G.mode === 'title' ? 0.85 : 1;
    M.mode = fade === 0 ? 'off' : S.nearK > 0.5 && lit ? 'fire' : S.nightMix > 0.5 ? 'thriller' : 'overworld';
    M.targets = { music: MUSIC_LEVEL * S.duck * fade, day: 1 - S.nightMix, thrill: S.nightMix, I: S.intensity };
    E.levels(M.targets, t, { music: fade === 0 ? 1.2 : 0.5, mix: 0.3 });
  };
  M.state = () => {
    const A = G.audio; if (!E) return { active: false, mode: M.mode, why: 'audio not started yet (needs a first key or click)' };
    const b = E.buses, now = E.ctx.currentTime;
    return {
      active: M.active, mode: M.mode, ctxState: E.ctx.state, muted: !!A.muted, time: r3(now),
      nightMix: r3(S.nightMix), intensity: r3(S.intensity), danger: r3(S.danger), duck: r3(S.duck), nearFire: r3(S.nearK), fireDist: r3(S.fireDist),
      buses: { music: r3(b.music.gain.value), day: r3(b.day.gain.value), thrill: r3(b.thrill.gain.value) },
      targets: M.targets ? Object.fromEntries(Object.entries(M.targets).map(([k, v]) => [k, r3(v)])) : null,
      notes: { ...E.counts, scheduledAhead: E.ahead.filter((x) => x >= now).length, sounding: E.live },
      song: E.songInfo(), thriller: E.thrInfo(),
      crackle: A.fireState ? A.fireState() : null,
    };
  };
  M.crackleCurve = (fuel) => [0, 2, 4, 6, 8, 10, 14, 18, 24, 30, 40, 50].map((d) => ({ d, gain: G.audio.fireGainAt(d, fuel) }));
  M.nextSong = () => { if (E) { E.D.song = null; E.D.resumeAt = 0; } return true; };
  // offline check of levels/clipping: renders the score alone (pre-compressor) and reports peak / RMS in dBFS,
  // plus the share of energy per band (the "mud" check is below250)
  M.render = async (kind = 'overworld', secs = 12, intensity = 0.5, solo = null) => { // solo: one channel (day: lead|harp|pizz|bass|glock|timp|snare, night: nlow|nstr|ost|nlead|hit|swell)
    const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * secs), sr), e = buildEngine(oc, oc.destination, null), th = kind === 'thriller' || kind === 'night';
    e.buses.music.gain.value = MUSIC_LEVEL; e.buses.day.gain.value = th ? 0 : 1; e.buses.thrill.gain.value = th ? 1 : 0;
    if (solo) for (const k in e.inst) if (k !== solo) e.inst[k].gain.value = 0;
    const S2 = { nightMix: th ? 1 : 0, intensity }; e.levels({ music: MUSIC_LEVEL, day: th ? 0 : 1, thrill: th ? 1 : 0, I: intensity }, 0, { music: 0.001, mix: 0.001 });
    for (let t = 0; t < secs; t += 0.25) { e.schedule(t, Math.min(secs, t + 0.25), S2); if (th) e.thrLevels(intensity, t, 0.05); }
    const info = e.songInfo(), buf = await oc.startRendering(); let peak = 0, sum = 0, clip = 0; const per = [];
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 1) clip++; sum += d[i] * d[i]; } }
    const d0 = buf.getChannelData(0), d1 = buf.getChannelData(1); for (let s = 0; s < Math.floor(secs); s++) { let ss = 0; for (let i = s * sr; i < (s + 1) * sr; i++) ss += d0[i] * d0[i]; per.push(Math.round(10 * Math.log10(ss / sr + 1e-12))); }
    // band energy via a Hann-windowed 4096-point FFT over the whole render
    const N = 4096, re = new Float64Array(N), im = new Float64Array(N), edges = [0, 120, 250, 500, 1000, 2000, 4000, 8000, sr / 2], acc = new Float64Array(edges.length - 1);
    for (let off = 0; off + N <= d0.length; off += N) {
      for (let i = 0; i < N; i++) { re[i] = (d0[off + i] + d1[off + i]) * 0.5 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; }
      for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
      for (let len = 2; len <= N; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
        for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < h; k++) { const p = i + k, q = p + h, vr = re[q] * cr - im[q] * ci, vi = re[q] * ci + im[q] * cr;
          re[q] = re[p] - vr; im[q] = im[p] - vi; re[p] += vr; im[p] += vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
      for (let k = 1, b = 0; k < N / 2; k++) { const f = k * sr / N; while (f >= edges[b + 1]) b++; acc[b] += re[k] * re[k] + im[k] * im[k]; }
    }
    let tot = 1e-30; for (const a of acc) tot += a; const bands = {}; for (let b = 0; b < acc.length; b++) bands[`${edges[b]}-${Math.round(edges[b + 1])}`] = Math.round(1000 * acc[b] / tot) / 10;
    const db = (x) => Math.round(20 * Math.log10(x + 1e-12) * 10) / 10;
    return { kind: th ? 'thriller' : 'overworld', secs, intensity, solo, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / (buf.length * 2))), clippedSamples: clip, rmsPerSecondDb: per,
      below250Pct: Math.round(1000 * (acc[0] + acc[1]) / tot) / 10, bandsPct: bands, notes: { ...e.counts }, song: info };
  };
  M.stop = () => { clearInterval(timer); };
  window.__music = M;
  return M;
}
