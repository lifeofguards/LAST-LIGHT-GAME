// LAST LIGHT score. Fully procedural, sharing audio.js's AudioContext and master bus, so the M mute,
// the compressor and the first-gesture unlock all apply for free.
//  - Day, away from camp: folk-country. Fingerpicked guitar and banjo from Karplus-Strong strings
//    (each pitch rendered once into a small buffer, so a note is just BufferSource -> Gain), an upright
//    bass root, I-IV-V progressions in G/D/C/A, Travis picking in 4/4 or a 3/4 waltz, and sometimes a
//    harmonica or fiddle line built phrase by phrase (call, answer, varied call, cadence). Songs end,
//    and a stretch of plain forest follows before the next one, so it never turns into wallpaper.
//  - Dusk into night (and any daytime attack): a thriller score in E phrygian. Low drone, a pulsing
//    filtered ostinato, tremolo strings gliding between dark chords, dissonant swells, and low hits
//    locked to the heartbeat. All of it rises with G.threat and dread, and it cross-fades back at dawn.
//  - Near a lit fire the whole score ducks almost silent so the crackle owns the camp.
// Scheduling: a 40 ms timer schedules notes 0.3 s ahead at exact context times. The thriller and lead
// voices are persistent oscillators driven by automation, so there are no per-note node storms.
// Debug: window.__music.state(), .crackleCurve(fuel), .render('folk'|'thriller', secs, intensity).

const LOOKAHEAD = 0.3, TICK_MS = 40, MUSIC_LEVEL = 0.6;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const pickW = (arr, w) => { let s = 0; for (const x of w) s += x; let r = Math.random() * s; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; };
const atOrAbove = (pc, lo) => lo + (((pc - lo) % 12) + 12) % 12; // lowest midi >= lo with pitch class pc
const r3 = (v) => Math.round(v * 1000) / 1000;

// ---------- Karplus-Strong strings (rendered once per instrument + pitch, shared by every context) ----------
const KS_RATE = 24000;
const INSTR = {
  guitar: { dur: 2.4, t60: [3.4, 1.5], bright: 0.5, pick: 0.17, lo: 40, hi: 80 },
  banjo: { dur: 1.3, t60: [1.0, 0.55], bright: 0.92, pick: 0.07, lo: 55, hi: 84 },
  bass: { dur: 1.8, t60: [1.6, 1.1], bright: 0.1, pick: 0.28, lo: 24, hi: 50 },
};
const ksCache = new Map();
function ksBuffer(kind, midi) {
  const key = kind + midi; let b = ksCache.get(key); if (b) return b;
  const I = INSTR[kind], f = mtof(midi), R = KS_RATE, n = Math.ceil(I.dur * R), out = new Float32Array(n);
  const t60 = I.t60[0] + (I.t60[1] - I.t60[0]) * clamp((midi - I.lo) / (I.hi - I.lo), 0, 1);
  const w = 2 * Math.PI * f / R, gT = Math.pow(0.001, 1 / (f * t60)); // loss per period that gives this T60
  // loop lowpass y = (1-S)x[n] + S x[n-1] (Jaffe-Smith stretch). If the plain averager would decay too fast, shrink S.
  const q = (1 - gT * gT) / (2 * (1 - Math.cos(w)));
  let S = 0.5, rho = 1;
  if (q < 0.25) S = (1 - Math.sqrt(1 - 4 * q)) / 2; else rho = gT / Math.sqrt(1 - 0.5 * (1 - Math.cos(w)));
  // integer delay + first-order allpass for the fractional part keeps every string in tune
  const P = R / f; let N = Math.floor(P - S), fr = P - S - N; if (fr < 0.1) { N--; fr += 1; }
  const C = (1 - fr) / (1 + fr), d = new Float32Array(N), ex = new Float32Array(N), pk = Math.max(1, Math.round(I.pick * N));
  let lp = 0; for (let i = 0; i < N; i++) { lp += I.bright * ((Math.random() * 2 - 1) - lp); ex[i] = lp; } // pluck: filtered noise
  let mean = 0; for (let i = 0; i < N; i++) { d[i] = ex[i] - (i >= pk ? ex[i - pk] : 0); mean += d[i]; } // pick-position comb
  mean /= N; for (let i = 0; i < N; i++) d[i] -= mean;
  let idx = 0, prev = 0, ax = 0, ay = 0, dcx = 0, dcy = 0, peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const x = d[idx], y = rho * ((1 - S) * x + S * prev); prev = x;
    const a = C * y + ax - C * ay; ax = y; ay = a; d[idx] = a; if (++idx === N) idx = 0;
    const o = x - dcx + 0.995 * dcy; dcx = x; dcy = o; out[i] = o; const ab = o < 0 ? -o : o; if (ab > peak) peak = ab;
  }
  const fade = Math.floor(0.08 * R), sc = 0.9 / peak;
  for (let i = 0; i < n; i++) out[i] *= sc * (i > n - fade ? (n - i) / fade : 1);
  b = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: R }); b.copyToChannel(out, 0);
  ksCache.set(key, b); return b;
}

// ---------- folk theory ----------
const KEYS = [{ n: 'G', pc: 7 }, { n: 'D', pc: 2 }, { n: 'C', pc: 0 }, { n: 'A', pc: 9 }];
const CHORDS = { I: [0, 4, 7], IV: [5, 9, 0], V: [7, 11, 2], V7: [7, 11, 2, 5], vi: [9, 0, 4], ii: [2, 5, 9] };
const PROG4 = [
  ['I', 'I', 'IV', 'I', 'I', 'I', 'V', 'I'], ['I', 'IV', 'I', 'V', 'I', 'IV', 'V', 'I'], ['I', 'I', 'IV', 'IV', 'I', 'I', 'V', 'V7'],
  ['I', 'V', 'vi', 'IV', 'I', 'IV', 'V', 'I'], ['I', 'IV', 'I', 'I', 'IV', 'IV', 'V', 'I'], ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'V7', 'I'],
  ['I', 'I', 'V', 'V', 'IV', 'IV', 'I', 'I'], ['I', 'ii', 'V', 'I', 'I', 'IV', 'V7', 'I'],
];
const PROG3 = [['I', 'I', 'IV', 'I', 'V', 'V', 'I', 'I'], ['I', 'IV', 'V', 'I', 'I', 'IV', 'V7', 'I'], ['I', 'vi', 'IV', 'V', 'I', 'vi', 'V7', 'I'], ['I', 'I', 'V', 'V', 'V', 'V', 'I', 'I']];
// guitar tokens: R bass root, F alternate bass, L/M/T treble low/mid/top, P pinch (R+T), S down-strum, u up-strum, s treble strum
const GPAT4 = {
  travisA: ['P', 'M', 'F', 'T', 'R', 'M', 'F', 'L'], travisB: ['P', null, 'F', 'M', 'R', 'T', 'F', 'M'], arp: ['R', 'L', 'M', 'T', 'F', 'T', 'M', 'L'],
  sparse: ['P', null, null, 'M', 'F', null, 'T', null], ballad: ['R', 'M', 'T', 'M', 'F', 'M', 'T', 'M'], strum: ['S', null, 'u', null, 'S', 'u', null, 'u'],
  boomchick: ['R', null, 's', null, 'F', null, 's', null],
};
const GPAT3 = { waltzA: ['R', null, 's', null, 's', null], waltzB: ['R', 'L', 'M', 'T', 'M', 'L'], waltzC: ['P', null, 'M', 'T', 'F', 'M'], waltzD: ['R', null, 'T', 'M', 'L', 'M'] };
// banjo tokens: l/m/t chord tones, D the high drone string
const BPAT4 = { forward: ['l', 'm', 't', 'D', 'l', 'm', 't', 'D'], fwdrev: ['l', 'm', 'D', 't', 'm', 'l', 'D', 't'], frail: ['t', null, 'm', 'D', 'l', null, 'm', 'D'], sparse: ['t', null, null, 'D', 'm', null, null, 'D'] };
const BPAT3 = { roll3: ['l', 'm', 't', 'D', 'm', 't'], frail3: ['t', null, 'm', 'D', 'l', 'D'] };
const vCache = new Map();
function voicing(keyPc, ch) {
  const k = keyPc + ch; let v = vCache.get(k); if (v) return v;
  const semis = CHORDS[ch], rootPc = (keyPc + semis[0]) % 12, pcs = semis.map((s) => (keyPc + s) % 12);
  const R = atOrAbove(rootPc, 40), F = R + 7 <= 55 ? R + 7 : R - 5;
  const near = (lo, hi, centre) => { const t = []; for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) t.push(m);
    let best = 0, bd = 1e9; for (let i = 0; i + 2 < t.length; i++) { const dd = Math.abs(t[i + 1] - centre); if (dd < bd) { bd = dd; best = i; } } return t.slice(best, best + 3); };
  const tre = near(55, 77, 64), bj = near(62, 81, 70), ub = atOrAbove(rootPc, 31);
  v = { R, F, L: tre[0], M: tre[1], T: tre[2], l: bj[0], m: bj[1], t: bj[2], D: atOrAbove(keyPc, 67), ubR: ub, ubF: ub + 7 <= 47 ? ub + 7 : ub - 5, pcs, rootPc };
  vCache.set(k, v); return v;
}
// a lead line for one 8-bar section: call (bars 0-1), answer (2-3), varied call (4-5), cadence (6-7)
function genLead(song, sec, kind) {
  const spb = song.spb, len = spb * 2, lo = kind === 'harp' ? 64 : 62, hi = kind === 'harp' ? 84 : 86;
  const scale = kind === 'fiddle' && Math.random() < 0.5 ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 4, 7, 9];
  const pool = []; for (let m = lo; m <= hi; m++) if (scale.includes((((m - song.key.pc) % 12) + 12) % 12)) pool.push(m);
  const dens = kind === 'harp' ? [1, 4, 2, 3, 1.5] : [3, 4, 2, 2, 0.6];
  const rhythm = () => { const r = []; let s = Math.random() < 0.35 ? (Math.random() < 0.5 ? 1 : 2) : 0;
    while (s < len - 1) { let d = pickW([1, 2, 3, 4, 6], dens); if (s + d > len) d = len - s; r.push([s, d]); s += d; } return r; };
  const closest = (arr, x) => arr.reduce((a, m) => Math.abs(m - x) < Math.abs(a - x) ? m : a, arr[0]);
  let idx = pool.indexOf(closest(pool, 71));
  const pcsAt = (s) => voicing(song.key.pc, sec.prog[Math.floor(s / spb) % sec.prog.length]).pcs;
  const walk = (s) => { const strong = s % spb === 0 || (spb === 8 && s % 4 === 0);
    if (strong) { const c = []; for (let k = -3; k <= 3; k++) { const j = idx + k; if (j >= 0 && j < pool.length && pcsAt(s).includes(pool[j] % 12)) c.push(j); } if (c.length) idx = pick(c); }
    else { let st = pickW([-2, -1, 1, 2, 0], [1, 3, 3, 1, 0.6]); if (idx < pool.length * 0.3) st = Math.abs(st); if (idx > pool.length * 0.75) st = -Math.abs(st); idx = clamp(idx + st, 0, pool.length - 1); }
    return pool[idx]; };
  const notes = [], add = (s, d, m) => notes.push({ s, d, m, bend: kind === 'harp' && d >= 3 && Math.random() < 0.45 });
  const rA = rhythm(), startIdx = idx, aPitch = rA.map(([s]) => walk(s));
  rA.forEach(([s, d], i) => add(s, d, aPitch[i]));
  if (kind === 'fiddle' || Math.random() < 0.5) rhythm().forEach(([s, d]) => add(len + s, d, walk(len + s))); // answer (harmonica often just breathes here)
  idx = startIdx; rA.forEach(([s, d], i) => add(2 * len + s, d, i < rA.length / 2 ? aPitch[i] : walk(2 * len + s))); // the call again, new tail
  const rC = rhythm().filter(([s]) => s < len - spb); rC.forEach(([s, d]) => add(3 * len + s, d, walk(3 * len + s)));
  const lastS = rC.length ? 3 * len + rC[rC.length - 1][0] + rC[rC.length - 1][1] : 3 * len;
  const home = pool.filter((m) => m % 12 === song.key.pc || m % 12 === (song.key.pc + 4) % 12);
  add(lastS, 4 * len - lastS, closest(home, pool[idx])); // land home
  const byStep = new Map(); for (const nt of notes) if (nt.d > 0) byStep.set(nt.s, nt);
  return { kind, byStep, n: byStep.size };
}
let songSeq = 0;
function newSong(prevKey) {
  const key = pick(KEYS.filter((k) => k !== prevKey)), meter = Math.random() < 0.28 ? 3 : 4, spb = meter * 2;
  const bpm = meter === 3 ? rnd(100, 124) : rnd(84, 106), swing = meter === 4 ? rnd(0.04, 0.22) : rnd(0, 0.06);
  const nSec = 2 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.2 ? 1 : 0), leadKind = pick(['harp', 'fiddle']);
  const gp = meter === 3 ? GPAT3 : GPAT4, bp = meter === 3 ? BPAT3 : BPAT4, pr = meter === 3 ? PROG3 : PROG4;
  const song = { id: ++songSeq, key, meter, spb, bpm, swing, sections: [], leadKind };
  for (let i = 0; i < nSec; i++) {
    const banjo = i > 0 ? Math.random() < 0.55 : Math.random() < 0.15;
    const sec = { prog: pick(pr), gpat: pick(Object.keys(gp)), bpat: banjo ? pick(Object.keys(bp)) : null, guitar: !(banjo && i > 0 && Math.random() < 0.3), bass: i > 0 || Math.random() < 0.35, lead: null };
    if (i > 0 && Math.random() < 0.6) sec.lead = genLead(song, sec, leadKind);
    song.sections.push(sec);
  }
  song.bars = nSec * 8; // then one ending bar (a strum left to ring) and one bar of silence
  return song;
}

// ---------- thriller theory (E phrygian; the existing night drone in audio.js sits on E1/B1/F2) ----------
const TSEQ = [[[40, 'm'], [36, 'M'], [41, 'M'], [40, 'm']], [[40, 'm'], [43, 'M'], [41, 'M'], [40, 'm']], [[40, 'm'], [45, 'm'], [40, 'm'], [46, 'd']], [[40, 'm'], [41, 'M'], [38, 'M'], [41, 'M']]];
const QUAL = { m: [0, 3, 7], M: [0, 4, 7], d: [0, 3, 6] };
const OST = [
  [0, null, 0, null, 0, null, 1, null, 0, null, 0, null, 3, null, 1, null], [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 1, 0, 12, 1],
  [0, null, 0, 0, null, 0, 0, null, 0, null, 0, 0, 6, null, 5, null], [0, 7, 12, 7, 0, 7, 13, 7, 0, 7, 12, 7, 0, 6, 1, 0],
];

function makeIR(ctx, secs) {
  const sr = ctx.sampleRate, n = Math.floor(sr * secs), b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / sr, a = 0.08 + 0.55 * Math.exp(-t * 1.8); lp += a * ((Math.random() * 2 - 1) - lp); // darker as it decays
      d[i] = lp * Math.pow(1 - i / n, 2) * Math.exp(-t * 2.0) * (t < 0.01 ? t / 0.01 : 1); } }
  return b;
}

// ---------- the engine: works on the live context or an OfflineAudioContext ----------
function buildEngine(ctx, dest, G) {
  const E = { ctx, counts: { guitar: 0, banjo: 0, bass: 0, lead: 0, ostinato: 0, hits: 0, swells: 0, chords: 0, songs: 0 }, live: 0, ahead: [] };
  const gain = (v, to) => { const n = ctx.createGain(); n.gain.value = v; if (to) n.connect(to); return n; };
  const bq = (type, f, q = 0.7, db = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = db; return n; };
  const panTo = (p, to) => { const n = ctx.createStereoPanner(); n.pan.value = p; n.connect(to); return n; };
  const chain = (...ns) => { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); ns[0]._tail = ns[ns.length - 1]; return ns[0]; };
  const music = gain(0, dest), folk = gain(0, music), thrill = gain(0, music), folkIn = gain(2.4, folk); // folkIn: trim so plucks sit level with the night score
  const verb = ctx.createConvolver(); verb.buffer = makeIR(ctx, 2.6); chain(verb, gain(0.5, music));
  folk.connect(gain(0.22, verb)); thrill.connect(gain(0.4, verb));
  // instrument channels: a little body EQ and a place in the stereo field
  const instIn = {
    guitar: chain(gain(1), bq('peaking', 110, 1, 3), bq('peaking', 230, 1.2, 2), bq('peaking', 2500, 1, 2), bq('highshelf', 6000, 0.7, -6), panTo(-0.22, folkIn)),
    banjo: chain(gain(1), bq('highpass', 180), bq('peaking', 650, 1.5, 5), bq('peaking', 3000, 1, 3), panTo(0.3, folkIn)),
    bass: chain(gain(1), bq('lowpass', 900), bq('peaking', 90, 1, 3), panTo(0.02, folkIn)),
  };
  E.buses = { music, folk, thrill };
  const noiseBuf = (() => { const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; })();

  const track = (t) => { E.ahead.push(t); };
  const pluck = (kind, midi, t, vel) => {
    if (!(midi > 0)) return; const s = ctx.createBufferSource(); s.buffer = ksBuffer(kind, midi);
    const g = gain(vel); s.connect(g).connect(instIn[kind]); s.start(Math.max(t, ctx.currentTime));
    E.live++; s.onended = () => { E.live--; g.disconnect(); }; E.counts[kind]++; track(t);
  };

  // persistent mono lead voices (harmonica / fiddle): a note is just automation on these nodes
  const leads = {};
  const lead = (kind) => {
    if (leads[kind]) return leads[kind];
    const harp = kind === 'harp', vca = gain(0); vca.connect(panTo(harp ? 0.1 : -0.06, folkIn));
    const filt = harp ? chain(bq('highpass', 330), bq('peaking', 1300, 1.2, 6), bq('lowpass', 3200, 0.8)) // reed: nasal mid hump
      : chain(bq('peaking', 480, 1.2, 4), bq('peaking', 1600, 1.4, 3), bq('peaking', 2900, 2, 4), bq('lowpass', 5200, 0.7)); // fiddle body resonances
    filt._tail.connect(vca);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = harp ? 'square' : 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = harp ? 7 : -5;
    const vib = ctx.createOscillator(); vib.frequency.value = harp ? 5.2 : 5.7; const vibG = gain(0); vib.connect(vibG); vibG.connect(o1.detune); vibG.connect(o2.detune);
    const pre = gain(1); pre.connect(filt); o1.connect(gain(harp ? 0.45 : 0.55, pre)); o2.connect(gain(harp ? 0.35 : 0.45, pre));
    const br = ctx.createBufferSource(); br.buffer = noiseBuf; br.loop = true; chain(br, bq('bandpass', harp ? 1800 : 3600, 0.9), gain(harp ? 0.12 : 0.05, pre)); // breath / bow hair
    for (const o of [o1, o2, vib, br]) o.start();
    return (leads[kind] = { o1, o2, vca, vibG, harp, lastEnd: 0 });
  };
  const leadNote = (kind, t, midi, dur, bend, vel = 1) => {
    const L = lead(kind), f = mtof(midi), legato = t - L.lastEnd < 0.03;
    for (const o of [L.o1, L.o2]) { if (bend) { o.frequency.setValueAtTime(f * 0.944, t); o.frequency.setTargetAtTime(f, t + 0.03, 0.06); } else if (legato && !L.harp) o.frequency.setTargetAtTime(f, t, 0.025); else o.frequency.setValueAtTime(f, t); }
    const pk = (L.harp ? 0.12 : 0.1) * vel, att = L.harp ? 0.025 : 0.07;
    L.vca.gain.setTargetAtTime(pk, t, att); L.vca.gain.setTargetAtTime(pk * 0.72, t + att * 3, 0.25); L.vca.gain.setTargetAtTime(0, t + Math.max(0.06, dur - 0.04), L.harp ? 0.05 : 0.08);
    L.vibG.gain.setValueAtTime(0, t); L.vibG.gain.setTargetAtTime(L.harp ? 22 : 14, t + 0.18, 0.15);
    L.lastEnd = t + dur; E.counts.lead++; track(t);
  };

  // ---- folk player
  const F = E.F = { song: null, k: 0, nextT: 0, resumeAt: 0, lastKey: null };
  const vel = (b) => b * (0.82 + Math.random() * 0.3);
  const strum = (t, v, dir, amt) => { const ns = dir === 'S' ? [v.R, v.L, v.M, v.T] : dir === 'u' ? [v.T, v.M, v.L] : [v.L, v.M, v.T];
    ns.forEach((m, i) => pluck('guitar', m, t + i * (dir === 'S' ? 0.016 : 0.011), vel(0.15 * amt * (i === 0 && dir === 'S' ? 1.2 : 1)))); };
  const guitarTok = (tok, t, v, acc) => { const b = 0.17 * acc;
    if (tok === 'P') { pluck('guitar', v.R, t, vel(b * 1.1)); pluck('guitar', v.T, t + 0.004, vel(b * 0.8)); }
    else if (tok === 'R' || tok === 'F') pluck('guitar', v[tok], t, vel(b * 1.05));
    else if (tok === 'S') strum(t, v, 'S', acc * 0.8); else if (tok === 'u') strum(t, v, 'u', acc * 0.45); else if (tok === 's') strum(t, v, 's', acc * 0.6);
    else pluck('guitar', v[tok], t, vel(b * 0.75)); };
  const playFolkStep = (t, song, k) => {
    const bar = Math.floor(k / song.spb), s = k % song.spb, si = Math.floor(bar / 8);
    if (si >= song.sections.length) { // ending: one strum on I, a low root, let it ring
      if (bar === song.bars && s === 0) { const v = voicing(song.key.pc, 'I'); strum(t, v, 'S', 1); pluck('bass', v.ubR, t, 0.3); if (song.sections[song.sections.length - 1].bpat) pluck('banjo', v.t, t + 0.03, 0.09); }
      return; }
    const sec = song.sections[si], b8 = bar % 8, ch = sec.prog[b8 % sec.prog.length], v = voicing(song.key.pc, ch);
    const nextCh = b8 === 7 ? (song.sections[si + 1] ? song.sections[si + 1].prog[0] : 'I') : sec.prog[b8 + 1];
    if (sec.guitar) { const tok = (song.meter === 3 ? GPAT3 : GPAT4)[sec.gpat][s]; if (tok) guitarTok(tok, t, v, s === 0 ? 1.12 : 1); }
    if (sec.bpat) { const tok = (song.meter === 3 ? BPAT3 : BPAT4)[sec.bpat][s]; if (tok) pluck('banjo', v[tok], t, vel(tok === 'D' ? 0.08 : 0.11)); }
    if (sec.bass) {
      if (s === 0) pluck('bass', v.ubR, t, vel(0.34));
      else if (s === 4 && (song.meter === 4 || Math.random() < 0.5)) pluck('bass', v.ubF, t, vel(song.meter === 4 ? 0.27 : 0.2));
      else if (s === 6 && song.meter === 4 && nextCh !== ch && Math.random() < 0.45) { const nr = voicing(song.key.pc, nextCh).ubR; pluck('bass', nr + (Math.random() < 0.5 ? -1 : 2), t, vel(0.2)); } // walk into the change
    }
    if (sec.lead) { const nt = sec.lead.byStep.get(b8 * song.spb + s); if (nt) leadNote(sec.lead.kind, t, nt.m, nt.d * (60 / song.bpm / 2) * 0.95, nt.bend, 0.85 + Math.random() * 0.3); }
  };
  const schedFolk = (from, to, allow) => {
    if (!F.song) { if (!allow || from < F.resumeAt) return; F.song = newSong(F.lastKey); F.lastKey = F.song.key; F.k = 0; F.nextT = from + 0.1; E.counts.songs++; }
    if (!allow) { F.song = null; F.resumeAt = from + 3; return; } // night took over: the next song starts fresh after dawn
    if (F.nextT < from - 0.2) F.nextT = from + 0.02; // timer stalled: skip ahead rather than bursting
    const song = F.song, stepDur = 60 / song.bpm / 2;
    while (F.nextT < to) {
      const s = F.k % song.spb, off = (s & 1) ? song.swing * stepDur : 0;
      playFolkStep(F.nextT + off + (Math.random() - 0.5) * 0.008, song, F.k);
      F.k++; F.nextT += stepDur;
      if (F.k >= (song.bars + 2) * song.spb) { F.song = null; F.resumeAt = F.nextT + rnd(7, 20); break; } // silence between songs
    }
  };

  // ---- thriller voice (created at dusk, released a few seconds after dawn)
  let T = null;
  const buildThr = () => {
    const nodes = [], osc = (type, f, det = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; o.start(); nodes.push(o); return o; };
    const droneLP = bq('lowpass', 110, 5), droneG = gain(0, thrill); droneLP.connect(droneG);
    osc('sawtooth', 41.2, -8).connect(droneLP); osc('sawtooth', 41.2, 7).connect(droneLP); osc('sine', 82.4).connect(gain(0.8, droneLP));
    const b2G = gain(0, thrill); osc('sine', 87.31).connect(b2G); osc('sine', 174.6, 4).connect(gain(0.3, b2G)); // the flat-2 rubbing against the root
    const hp = bq('highpass', 150), strLP = bq('lowpass', 1200, 0.6), trem = gain(0.6), strG = gain(0, thrill); chain(hp, strLP, trem, strG);
    const tremLfo = osc('sine', 9); tremLfo.connect(gain(0.4, trem.gain)); // bowed tremolo: amplitude flutter 0.2..1.0
    const voices = []; for (let i = 0; i < 4; i++) { const vg = gain(0.2, hp), a = osc('sawtooth', 220, -9), b = osc('sawtooth', 220, 8); a.connect(vg); b.connect(vg); voices.push([a, b]); }
    const ostLP = bq('lowpass', 300, 7), ostVCA = gain(0), ostG = gain(0, thrill); chain(ostLP, ostVCA, ostG);
    const o1 = osc('sawtooth', 82.4), o2 = osc('square', 164.8); o1.connect(ostLP); o2.connect(gain(0.25, ostLP));
    const whG = gain(0, thrill); osc('sine', 1318.5).connect(whG); osc('sine', 1396.9).connect(gain(0.7, whG)); // high sul-ponticello whine, two sines beating
    return { nodes, droneG, droneLP, b2G, strG, strLP, tremLfo, voices, ostLP, ostVCA, ostG, o1, o2, whG, nextT: 0, step: 0, seq: pick(TSEQ), pat: pick(OST), root: 40, chord: null, nextSwell: 0, lastHit: -1, beatN: 0, quietFor: 0 };
  };
  E.thrLevels = (I, t, tau = 0.3) => { if (!T) return; const set = (p, v, tc = tau) => p.setTargetAtTime(v, t, tc);
    set(T.droneG.gain, 0.1 * (0.75 + 0.25 * I)); set(T.droneLP.frequency, 90 + 380 * I + 40 * Math.sin(t * 0.11), 0.8); set(T.b2G.gain, 0.035 * sstep(0.3, 0.8, I));
    set(T.strG.gain, 0.03 + 0.055 * I); set(T.strLP.frequency, 900 + 2200 * I, 0.8); set(T.tremLfo.frequency, 6 + 8 * I, 0.8);
    set(T.ostG.gain, 0.11 * sstep(0.08, 0.45, I)); set(T.whG.gain, 0.006 * sstep(0.55, 1, I)); };
  const setChord = (t, [root, q], I) => { const iv = QUAL[q], ms = [root + 12, root + 12 + iv[1], root + 12 + iv[2], I > 0.65 ? root + 13 : root + 24];
    T.voices.forEach(([a, b], i) => { const f = mtof(ms[i]); a.frequency.setTargetAtTime(f, t, 0.12); b.frequency.setTargetAtTime(f, t, 0.12); });
    T.root = atOrAbove(root % 12, 36); T.chord = [root, q]; E.counts.chords++; };
  const ostNote = (t, midi, acc, I, dur) => { const f = mtof(midi); T.o1.frequency.setValueAtTime(f, t); T.o2.frequency.setValueAtTime(f * 2, t);
    T.ostLP.frequency.setValueAtTime(220 + 1500 * I * acc, t); T.ostLP.frequency.setTargetAtTime(150 + 220 * I, t + 0.004, 0.05);
    T.ostVCA.gain.setTargetAtTime(0.9 * acc, t, 0.003); T.ostVCA.gain.setTargetAtTime(0, t + dur * 0.55, 0.025); E.counts.ostinato++; track(t); };
  const hit = (t, I) => { // low boom: pitch-dropping sine, a body thump and a dull noise smack
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(31, t + 0.7); const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 + 0.3 * I, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(thrill); o.start(t); o.stop(t + 1);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(140, t); o2.frequency.exponentialRampToValueAtTime(55, t + 0.2); const g2 = gain(0); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.12 + 0.1 * I, t + 0.005); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o2.connect(g2).connect(thrill); o2.start(t); o2.stop(t + 0.3);
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; const ng = gain(0); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.08 + 0.08 * I, t + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    chain(n, bq('lowpass', 500), ng, thrill); n.start(t, Math.random()); n.stop(t + 0.35); E.counts.hits++; track(t); };
  const swell = (t, I) => { // dissonant cluster crescendo with a rising noise wash; lands on a hit when things are bad
    const dur = rnd(3, 5.5), r = T.root + 12, ms = [r, r + 1, r + 6, r + 12, r + 13].sort(() => Math.random() - 0.5).slice(0, 3 + (I > 0.5 ? 1 : 0));
    const lp = bq('lowpass', 250, 2); lp.frequency.setValueAtTime(250, t); lp.frequency.exponentialRampToValueAtTime(1800 + 1500 * I, t + dur);
    const g = gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime((0.05 + 0.05 * I) / Math.sqrt(ms.length), t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.15); lp.connect(g).connect(thrill);
    for (const m of ms) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = rnd(-12, 12); o.connect(lp); o.start(t); o.stop(t + dur + 0.25); }
    const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; const ng = gain(0); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.02 + 0.02 * I, t + dur); ng.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    chain(n, bq('highpass', 1200), ng, thrill); n.start(t); n.stop(t + dur + 0.2);
    if (I > 0.5) hit(t + dur + 0.02, I); E.counts.swells++; track(t); };
  const schedThr = (from, to, S) => {
    if (!T) { T = buildThr(); T.nextT = from + 0.05; T.nextSwell = from + rnd(6, 12); E.thrLevels(S.intensity, from, 0.01); }
    const I = S.intensity, A = G && G.audio, hb = !!(A && A.bpm > 0); // hits lock to the heartbeat when it beats, else to the bar
    if (T.nextT < from - 0.2) T.nextT = from + 0.02;
    while (T.nextT < to) {
      const t = T.nextT, sib = T.step % 16, bar = Math.floor(T.step / 16);
      if (sib === 0 && bar % 2 === 0) { const ci = (bar / 2) % T.seq.length; setChord(t, T.seq[ci], I); if (ci === T.seq.length - 1 && Math.random() < 0.5) { T.seq = pick(TSEQ); T.pat = pick(OST); } }
      const off = T.pat[sib], stepDur = 60 / (70 + 60 * I) / 4;
      if (I > 0.08 && off !== null && (I > 0.55 || sib % 2 === 0)) ostNote(t, T.root + off, sib % 4 === 0 ? 1 : 0.68, I, stepDur * (I > 0.55 ? 1 : 2));
      if (!hb && I > 0.45 && sib === 0) hit(t, I);
      if (!hb && I > 0.8 && sib === 8) hit(t, I * 0.8);
      T.nextT += stepDur; T.step++;
    }
    if (hb && I > 0.45) { const nb = A.nextBeatAt;
      if (nb > T.lastHit + 0.25 && nb >= from && nb < to + 0.2) { T.beatN++; if (I > 0.75 || T.beatN % 2 === 0) hit(nb, I * 0.85); T.lastHit = nb; } }
    if (from >= T.nextSwell) { if (I > 0.1) swell(from + 0.05, I); T.nextSwell = from + (30 - 20 * I) * rnd(0.7, 1.3); }
  };
  E.dropThr = () => { if (!T) return; for (const o of T.nodes) { try { o.stop(); } catch (e) { /* already stopped */ } } for (const n of [T.droneG, T.b2G, T.strG, T.ostG, T.whG]) n.disconnect(); T = null; };
  E.thrInfo = () => T ? { alive: true, bpm: Math.round(70 + 60 * (E.lastI || 0)), chord: T.chord, step: T.step, nextSwellIn: r3(T.nextSwell - ctx.currentTime), drone: r3(T.droneG.gain.value), strings: r3(T.strG.gain.value), ostinato: r3(T.ostG.gain.value), b2: r3(T.b2G.gain.value), whine: r3(T.whG.gain.value) } : { alive: false };

  // one scheduling pass over [from, to)
  E.schedule = (from, to, S) => {
    E.lastI = S.intensity;
    schedFolk(from, to, F.song ? S.nightMix < 0.65 : S.nightMix < 0.35);
    if (S.nightMix > 0.005) { schedThr(from, to, S); T.quietFor = 0; }
    else if (T) { T.quietFor += to - from; if (T.quietFor > 6) E.dropThr(); }
    let i = 0; while (i < E.ahead.length && E.ahead[i] < from) i++; if (i) E.ahead.splice(0, i); // keep only notes not yet started
  };
  E.levels = (L, t, tau) => { music.gain.setTargetAtTime(L.music, t, tau.music); folk.gain.setTargetAtTime(L.folk, t, tau.mix); thrill.gain.setTargetAtTime(L.thrill, t, tau.mix); E.thrLevels(L.I, t); };
  E.songInfo = () => { const s = F.song; if (!s) return { playing: false, resumeIn: r3(Math.max(0, F.resumeAt - ctx.currentTime)) };
    const bar = Math.floor(F.k / s.spb), si = Math.min(s.sections.length - 1, Math.floor(bar / 8)), sec = s.sections[si];
    return { playing: true, id: s.id, key: s.key.n, meter: `${s.meter}/4`, bpm: Math.round(s.bpm), swing: r3(s.swing), section: `${si + 1}/${s.sections.length}`, bar, chord: bar < s.bars ? sec.prog[bar % 8] : 'end', guitar: sec.guitar ? sec.gpat : null, banjo: sec.bpat, bass: sec.bass, lead: sec.lead ? `${sec.lead.kind} (${sec.lead.n} notes)` : null }; };
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
    M.mode = fade === 0 ? 'off' : S.nearK > 0.5 && lit ? 'fire' : S.nightMix > 0.5 ? 'thriller' : 'folk';
    M.targets = { music: MUSIC_LEVEL * S.duck * fade, folk: 1 - S.nightMix, thrill: S.nightMix, I: S.intensity };
    E.levels(M.targets, t, { music: fade === 0 ? 1.2 : 0.5, mix: 0.3 });
  };
  M.state = () => {
    const A = G.audio; if (!E) return { active: false, mode: M.mode, why: 'audio not started yet (needs a first key or click)' };
    const b = E.buses, now = E.ctx.currentTime;
    return {
      active: M.active, mode: M.mode, ctxState: E.ctx.state, muted: !!A.muted, time: r3(now),
      nightMix: r3(S.nightMix), intensity: r3(S.intensity), danger: r3(S.danger), duck: r3(S.duck), nearFire: r3(S.nearK), fireDist: r3(S.fireDist),
      buses: { music: r3(b.music.gain.value), folk: r3(b.folk.gain.value), thrill: r3(b.thrill.gain.value) },
      targets: M.targets ? Object.fromEntries(Object.entries(M.targets).map(([k, v]) => [k, r3(v)])) : null,
      notes: { ...E.counts, scheduledAhead: E.ahead.filter((x) => x >= now).length, sounding: E.live },
      song: E.songInfo(), thriller: E.thrInfo(),
      crackle: A.fireState ? A.fireState() : null,
    };
  };
  M.crackleCurve = (fuel) => [0, 2, 4, 6, 8, 10, 14, 18, 24, 30, 40, 50].map((d) => ({ d, gain: G.audio.fireGainAt(d, fuel) }));
  M.nextSong = () => { if (E) { E.F.song = null; E.F.resumeAt = 0; } return true; };
  // offline check of levels/clipping: renders the score alone (pre-compressor) and reports peak / RMS in dBFS
  M.render = async (kind = 'folk', secs = 12, intensity = 0.5) => {
    const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * secs), sr), e = buildEngine(oc, oc.destination, null), th = kind !== 'folk';
    e.buses.music.gain.value = MUSIC_LEVEL; e.buses.folk.gain.value = th ? 0 : 1; e.buses.thrill.gain.value = th ? 1 : 0;
    const S2 = { nightMix: th ? 1 : 0, intensity };
    for (let t = 0; t < secs; t += 0.25) { e.schedule(t, Math.min(secs, t + 0.25), S2); if (th) e.thrLevels(intensity, t, 0.05); }
    const info = e.songInfo(), buf = await oc.startRendering(); let peak = 0, sum = 0, clip = 0; const per = [];
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a >= 1) clip++; sum += d[i] * d[i]; } }
    const d0 = buf.getChannelData(0); for (let s = 0; s < Math.floor(secs); s++) { let ss = 0; for (let i = s * sr; i < (s + 1) * sr; i++) ss += d0[i] * d0[i]; per.push(Math.round(10 * Math.log10(ss / sr + 1e-12))); }
    const db = (x) => Math.round(20 * Math.log10(x + 1e-12) * 10) / 10;
    return { kind, secs, intensity, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / (buf.length * 2))), clippedSamples: clip, rmsPerSecondDb: per, notes: { ...e.counts }, song: info };
  };
  M.stop = () => { clearInterval(timer); };
  window.__music = M;
  return M;
}
