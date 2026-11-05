// Regions: the shared layout of the expansion (no THREE, no state), so world.js can keep the forest out of the
// cave mounds and the Mountain wedge while it places trees, and progression/caves can build on the same numbers.
export const MAP_R = 160;                       // forest fills this; non-interactive backdrop forest goes beyond
export const LEVEL_R = [60, 90, 120, 150];      // playable radius per fire level (G.progression.limitR)
export const LEVEL_LOGS = [0, 6, 16, 30];       // cumulative logs fed to reach each level

// Caves sit on different sides of the map. Mouths face roughly along the ring (tangential, leaning toward camp),
// so the clearing in front of each mouth is inside that cave's own level band.
// Ro/Ho: outer mound radius/height. Ri/Hi: inner chamber radius/height. side: which way the mouth turns.
export const CAVE_DEFS = [
  { id: 'wolf1', type: 'wolf', level: 2, a: 1.40, r: 76, Ro: 11.5, Ho: 8.5, Ri: 8.2, Hi: 6.2, side: 1 },
  { id: 'wolf2', type: 'wolf', level: 3, a: 3.75, r: 104, Ro: 11.5, Ho: 8.5, Ri: 8.2, Hi: 6.2, side: -1 },
  { id: 'wolf3', type: 'wolf', level: 4, a: 5.55, r: 135, Ro: 11.5, Ho: 8.5, Ri: 8.2, Hi: 6.2, side: 1 },
  { id: 'bear', type: 'bear', level: 4, a: 3.00, r: 135, Ro: 14, Ho: 10.5, Ri: 10.6, Hi: 7.8, side: -1 },
];
const MOUTH_LEAN = 0.35; // radians the mouth turns from tangential toward the camp

export function caveLayout(d) {
  const x = Math.cos(d.a) * d.r, z = Math.sin(d.a) * d.r;
  const ma = d.a + d.side * (Math.PI / 2 + MOUTH_LEAN); // world angle the mouth faces
  const mx = Math.cos(ma), mz = Math.sin(ma);
  return {
    x, z, ma, mx, mz,
    entrance: { x: x + mx * (d.Ro - 0.6), z: z + mz * (d.Ro - 0.6) },   // the locked gate
    interior: { x, z },                                                 // centre of the chamber
    clearing: { x: x + mx * (d.Ro + 7), z: z + mz * (d.Ro + 7), r: 9 }, // open ground in front of the mouth
  };
}
export const CAVE_SITES = CAVE_DEFS.map(d => ({ ...d, ...caveLayout(d) }));

// Mountain: a wedge past the L4 edge at the end of the third trail. A stone gate at r≈149 opens a short pass
// that leads into a ring of snowy peaks around a walkable snowfield.
export const MOUNTAIN = (() => {
  const a = 4.31, ca = Math.cos(a), sa = Math.sin(a);
  const at = (r, t = 0) => ({ x: ca * r - sa * t, z: sa * r + ca * t });
  return {
    id: 'mountain', a, ca, sa, at,
    gateR: 149, gate: at(149),
    pass: { a: at(145), b: at(176), w: 5.2 },   // walkable capsule through the pass
    field: { ...at(198), r: 29 },               // walkable snowfield
    peakR: 33,                                  // peaks ring the field at about this distance from its centre
  };
})();

// polar helpers
const wrapA = (x) => Math.atan2(Math.sin(x), Math.cos(x));
// 0 outside, 1 deep inside the Mountain wedge (snow); used for ground tint and to keep the forest out
export function mountainK(x, z) {
  const r = Math.hypot(x, z); if (r < 140) return 0;
  const half = (14 + (r - 146) * 1.15) / Math.max(r, 1);   // wedge half-angle widens with distance
  const da = Math.abs(wrapA(Math.atan2(z, x) - MOUNTAIN.a));
  if (da > half + 0.07) return 0;
  const edge = Math.min(1, Math.max(0, (half + 0.07 - da) / 0.07)), radial = Math.min(1, Math.max(0, (r - 140) / 8));
  return edge * radial;
}
// true where world.js should not place forest (trees, rocks, logs, decor): cave mounds + clearings, the Mountain
export function reserved(x, z, pad = 0) {
  for (const c of CAVE_SITES) {
    const dx = x - c.x, dz = z - c.z, R = c.Ro + 2.5 + pad;
    if (dx * dx + dz * dz < R * R) return true;
    const ex = x - c.clearing.x, ez = z - c.clearing.z, ER = c.clearing.r + pad;
    if (ex * ex + ez * ez < ER * ER) return true;
  }
  const g = MOUNTAIN.gate, gx = x - g.x, gz = z - g.z; if (gx * gx + gz * gz < (10 + pad) * (10 + pad)) return true;
  return mountainK(x, z) > 0.02;
}
// signed distance (m) to the walkable Mountain (the pass capsule ∪ the snowfield); <0 inside. Also returns the
// outward gradient of the nearest piece in out[0], out[1] when `out` is given.
export function mountainSD(x, z, out) {
  const { a, b, w } = MOUNTAIN.pass, F = MOUNTAIN.field;
  const abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  const qx = x - (a.x + abx * t), qz = z - (a.z + abz * t), dq = Math.hypot(qx, qz) || 1e-6, sP = dq - w;
  const fx = x - F.x, fz = z - F.z, df = Math.hypot(fx, fz) || 1e-6, sF = df - F.r;
  if (sP < sF) { if (out) { out[0] = qx / dq; out[1] = qz / dq; } return sP; }
  if (out) { out[0] = fx / df; out[1] = fz / df; } return sF;
}
