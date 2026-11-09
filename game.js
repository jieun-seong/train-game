'use strict';
/* The Night Sleeper: keep the lamp lit until morning.
   The compartment is raycast once into a low-res buffer (real perspective, lights and
   shadows, then posterised), and only the windows and glows animate on top of it. */

const $ = id => document.getElementById(id);
const cv = $('c'), g = cv.getContext('2d');
const W = 270, H = 480, F = 190, VX = 135, VY = 190;
const CLOSE = .15, BEAT = 1.5;
const SAVE = 'night-sleeper-v1', NIGHTS = 7, NIGHT_LEN = 90;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const project = (x, y, z) => [VX + F * x / z, VY - F * y / z];

/* ---------- content ---------- */
const UPGRADES = {
  bear:    { name: 'Old Teddy Bear',    desc: 'Sleep restores far more nerve.' },
  lamp:    { name: 'Brass Desk Lamp',   desc: 'Burns 30% less oil. Flashes cost less too.' },
  radio:   { name: 'Crackling Radio',   desc: 'Close passes shake you less.' },
  curtain: { name: 'Mustard Curtains',  desc: 'They take longer to notice you.' },
  flowers: { name: 'Sunflowers in a Jar', desc: 'Tea restores twice as much nerve.' },
  crate:   { name: 'Stores Crate',      desc: 'One extra oil can and coal each morning.' },
};
const SCENES = [
  { name: 'fog',   sky: ['#8d9690', '#a3aaa2', '#b6bbb1', '#c6c9bd'], ground: '#55604f', fog: [214, 218, 208], rain: 0 },
  { name: 'ruin',  sky: ['#59596e', '#74748a', '#9490a0', '#b4a9a8'], ground: '#3e3d48', fog: [160, 156, 170], rain: 0, town: 1 },
  { name: 'flood', sky: ['#17304f', '#1f4468', '#2d5f83', '#3f7999'], ground: '#17324a', fog: [64, 106, 140], rain: 1, town: 1, water: 1 },
  { name: 'snow',  sky: ['#54688a', '#7388a6', '#9aacc2', '#c2cfdc'], ground: '#d5dfe8', fog: [226, 234, 240], snow: 1 },
];
const NIGHT_SCENE = [0, 1, 2, 3, 0, 2, 1];
const STOPS = [
  ['Marigold Halt', 'Grey light. The figures thin out when the sun comes up. A kettle is still warm on the platform.'],
  ['Upper Lockhart', 'The town clock stopped at teatime. You walk the platform with your collar up and find a few useful things.'],
  ['Saint Agnes Flood', 'The water came up to the second floor and stayed. Someone left a boat full of supplies tied to the signal.'],
  ['The Quiet Pass', 'Snow on everything. Nothing moves for miles. It is almost possible to believe that.'],
  ['Foxglove Sidings', 'Old carriages sleep under bindweed. One of them has a very good larder.'],
  ['Little Tern', 'You smell salt on the wind, faintly, under the smoke.'],
];

/* ---------- state ---------- */
let S = null, R = null, phase = 'menu', hover = null;
function newRun() { S = { night: 1, oil: 100, warm: 90, nerve: 100, cans: 2, coal: 2, up: [], seen: {} }; }
function newNight() { R = { clock: 0, figs: [], flash: [0, 0, 0], mug: .4, sleeping: false, spawn: 4, t: 0 }; }
const has = u => S.up.includes(u);
function save() { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) { } }
function loadSaveRaw() { try { return localStorage.getItem(SAVE); } catch (e) { return null; } }
function loadSave() { try { return JSON.parse(loadSaveRaw()); } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE); } catch (e) { } }

/* ---------- raycast scene ---------- */
const RX = 1.1, FLOOR = -1.6, YC = 1.55, ARCH = .55, D = 3;
function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, sx = u * u * (3 - 2 * u), sy = v * v * (3 - 2 * v);
  const h = (a, b) => rnd(a * 57 + b * 131);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), sx), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), sx), sy);
}
const fbm = (x, y) => vn(x, y) * .6 + vn(x * 2.3, y * 2.3) * .3 + vn(x * 5.1, y * 5.1) * .1;
const box = (x0, y0, z0, x1, y1, z1, mat, id, opt) => ({ k: 0, a: [x0, y0, z0], b: [x1, y1, z1], mat, id: id || 0, ...opt });
const ell = (x, y, z, rx, ry, rz, mat, id, opt) => ({ k: 1, c: [x, y, z], r: [rx, ry, rz], mat, id: id || 0, ...opt });
const ID = { bed: 1, stove: 2, oil: 3, tea: 4, win0: 5, win1: 6, win2: 7 };

function buildPrims() {
  const P = [];
  // Luggage racks and cases
  for (const sx of [-1, 1]) {
    const a = sx * RX, b = sx * .78, x0 = Math.min(a, b), x1 = Math.max(a, b);
    P.push(box(x0, 1.38, 2, x1, 1.42, 2.95, 'rack'));
    const c0 = sx < 0 ? -1.08 : .82, c1 = sx < 0 ? -.82 : 1.08;
    P.push(box(c0, 1.42, 2.05, c1, 1.72, 2.5, sx < 0 ? 'caseG' : 'caseR'));
    
  }
  // Sconces and ceiling lamp
  for (const sx of [-1, 1]) {
    P.push(box(sx * .93 - .11, .1, 2.93, sx * .93 + .11, .17, 3, 'brass'));
    P.push(ell(sx * .93, .36, 2.92, .1, .22, .07, 'glow', 0, { noShadow: 1 }));
  }
  P.push(ell(0, 2, 2.75, .3, .05, .2, 'glow', 0, { noShadow: 1 }));
  // Bed
  P.push(box(-.86, -1.6, 2.92, .86, -.25, 3, 'head'));
  P.push(box(-.8, -1.6, .25, .8, -.94, 2.92, 'sheet', ID.bed));
  P.push(box(-.52, -.94, 2.42, .52, -.8, 2.88, 'pillow', ID.bed));
  P.push(box(-.84, -1.3, .2, .84, -.9, 2.25, 'wool', ID.bed));
  
  // Stove with kettle (left)
  P.push(box(-1.1, -1.6, 2, -.76, -.48, 2.62, 'stove', ID.stove));
  P.push(box(-1.08, -.48, 2.04, -.78, -.44, 2.58, 'iron', ID.stove));
  P.push(ell(-.93, -.31, 2.28, .13, .13, .13, 'brass', ID.stove));
  P.push(box(-.96, -.2, 2.26, -.9, -.13, 2.3, 'iron', ID.stove));
  P.push(box(-.86, -.3, 2.26, -.75, -.26, 2.3, 'brass', ID.stove));
  // Shelf with oil can and mug (right)
  P.push(box(.74, -.6, 1.96, 1.1, -.54, 2.72, 'shelf'));
  P.push(box(.86, -1.6, 2.5, .94, -.6, 2.6, 'shelf'));
  P.push(box(.84, -.54, 2.3, 1.08, -.12, 2.56, 'oilcan', ID.oil));
  P.push(box(.93, -.12, 2.41, .99, -.02, 2.46, 'iron', ID.oil));
  P.push(box(.78, -.54, 2, .98, -.32, 2.18, 'mug', ID.tea));
  
  // Notices either side of the rear window
  P.push(box(-1.03, .72, 2.97, -.82, 1.02, 3, 'notice'));
  P.push(box(.84, .72, 2.97, 1.04, .95, 3, 'map'));
  P.push(box(-.32, 1.33, 2.97, .32, 1.45, 3, 'plaque'));
  if (!S) return P;
  if (has('bear')) { const x = .5, z = 1.72, y = -.65; [[0, -.1, 0, .14, .15, .11, 'bear'], [0, .1, 0, .11, .1, .1, 'bear'], [-.09, .19, 0, .04, .04, .03, 'bear'], [.09, .19, 0, .04, .04, .03, 'bear'], [-.16, -.09, -.02, .05, .09, .05, 'bear'], [.16, -.09, -.02, .05, .09, .05, 'bear'], [0, .08, -.09, .05, .04, .03, 'bearL']].forEach(b => P.push(ell(x + b[0], y + b[1], z + b[2], b[3], b[4], b[5], b[6]))); }
  if (has('lamp')) { P.push(box(.8, -.22, 2.2, .86, .08, 2.26, 'brass')); P.push(ell(.83, .12, 2.23, .14, .1, .14, 'glow', 0, { noShadow: 1 })); }
  if (has('radio')) { P.push(box(-1.04, 1.5, 2.36, -.74, 1.72, 2.72, 'radio')); }
  if (has('crate')) { P.push(box(.74, -.54, 2.65, 1.08, -.35, 2.74, 'caseG')); }
  if (has('curtain')) for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const x = sx * (.56 + i * .065); P.push(box(x - .034, -.46, 2.86 + (i % 2) * .04, x + .034, 1.2, 2.92 + (i % 2) * .04, 'curtain')); }
  if (has('flowers')) { const x = -.94, z = 2.5, y = -.32; P.push(box(x - .06, -.44, z - .05, x + .06, y - .02, z + .05, 'mug')); [[0, .32], [-.1, .24], [.1, .26]].forEach(f => { P.push(box(x + f[0] - .01, y, z, x + f[0] + .01, y + f[1], z + .01, 'leaf')); P.push(ell(x + f[0], y + f[1], z, .09, .09, .03, 'sunf')); }); }
  return P;
}
function hitPrim(p, ox, oy, oz, dx, dy, dz, far) {
  if (p.k === 0) {
    let t0 = 1e-4, t1 = far, axis = -1, sign = 0;
    for (let i = 0; i < 3; i++) {
      const o = i === 0 ? ox : i === 1 ? oy : oz, d = i === 0 ? dx : i === 1 ? dy : dz;
      if (Math.abs(d) < 1e-9) { if (o < p.a[i] || o > p.b[i]) return null; continue; }
      let a = (p.a[i] - o) / d, b = (p.b[i] - o) / d, s = -1;
      if (a > b) { const c = a; a = b; b = c; s = 1; }
      if (a > t0) { t0 = a; axis = i; sign = s; }
      if (b < t1) t1 = b;
      if (t0 > t1) return null;
    }
    return axis < 0 ? null : { t: t0, n: [axis === 0 ? sign : 0, axis === 1 ? sign : 0, axis === 2 ? sign : 0] };
  }
  const [cx, cy, cz] = p.c, [rx, ry, rz] = p.r;
  const lx = (ox - cx) / rx, ly = (oy - cy) / ry, lz = (oz - cz) / rz, ex = dx / rx, ey = dy / ry, ez = dz / rz;
  const A = ex * ex + ey * ey + ez * ez, B = lx * ex + ly * ey + lz * ez, C = lx * lx + ly * ly + lz * lz - 1, disc = B * B - A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / A;
  if (t < 1e-4 || t > far) return null;
  const nx = (ox + dx * t - cx) / (rx * rx), ny = (oy + dy * t - cy) / (ry * ry), nz = (oz + dz * t - cz) / (rz * rz), l = Math.hypot(nx, ny, nz);
  return { t, n: [nx / l, ny / l, nz / l] };
}
function rrect(px, py, cx, cy, hw, hh, r) { const x = Math.abs(px - cx) - hw + r, y = Math.abs(py - cy) - hh + r; return Math.hypot(Math.max(x, 0), Math.max(y, 0)) + Math.min(Math.max(x, y), 0) - r; }
function wood(u, v, c, seed) {
  const plank = Math.floor(u / .17), f = u / .17 - plank, j = rnd(plank * 3.1 + seed);
  const grain = fbm(u * 26 + plank * 9, v * 2.2 + plank * 5);
  const k = (.72 + j * .3) * (.72 + grain * .5) * (f < .07 ? .42 : 1);
  return [c[0] * k, c[1] * k, c[2] * k];
}
function material(mat, x, y, z, n) {
  const f = n ? Math.abs(n[1]) : 0;
  switch (mat) {
    case 'sheet': return [.86, .85, .83];
    case 'wool': { const w = .92 + vn(x * 95, z * 95) * .14; if (z > 2.02) return [.84 * w, .8 * w, .7 * w]; if (z > 1.9 && z < 1.96) return [.8 * w, .68 * w, .46 * w]; return [.43 * w, .52 * w, .58 * w]; }
    case 'pillow': return [.92, .9, .86];
    case 'head': return wood(x, y, [.5, .24, .13], 4);
    case 'rack': return f > .5 ? [.74, .76, .78] : [.45, .44, .44];
    case 'caseR': case 'caseG': { const base = mat === 'caseR' ? [.5, .22, .13] : [.34, .34, .19]; const strap = Math.abs(((z * 2.8) % 1) - .5) < .08; const l = .86 + fbm(x * 18, z * 18) * .28; return strap ? [.2, .11, .07] : [base[0] * l, base[1] * l, base[2] * l]; }
    case 'brass': return [.86, .62, .25];
    case 'iron': return [.17, .17, .19];
    case 'stove': { const l = .9 + fbm(x * 16, y * 16) * .24; return [.21 * l, .22 * l, .25 * l]; }
    case 'shelf': return wood(z, x, [.68, .38, .17], 8);
    case 'oilcan': return Math.abs(y + .33) < .05 ? [.92, .82, .45] : [.72, .17, .13];
    case 'mug': return [.8, .85, .83];
    case 'notice': return Math.floor(y * 42) % 2 ? [.86, .79, .61] : [.5, .44, .34];
    case 'map': return fbm(x * 18, y * 18) > .5 ? [.59, .72, .63] : [.78, .75, .55];
    case 'plaque': return [.72, .64, .44];
    case 'bear': return [.56, .34, .17];
    case 'bearL': return [.85, .68, .45];
    case 'radio': return Math.abs(z - 2.6) < .08 ? [.75, .63, .4] : [.35, .19, .1];
    case 'curtain': return [.86, .62, .16];
    case 'leaf': return [.3, .46, .2];
    case 'sunf': return n && n[2] < -.88 ? [.28, .15, .06] : [.96, .71, .13];
    default: return [.7, .7, .7];
  }
}
function roomHit(dx, dy, dz) {
  let t = Infinity, s = 0;
  const tx = (dx > 0 ? RX : -RX) / dx; if (tx > 0 && tx < t) { t = tx; s = dx > 0 ? 1 : 2; }
  if (dy < 0) { const a = FLOOR / dy; if (a < t) { t = a; s = 3; } }
  const tz = D / dz; if (tz < t) { t = tz; s = 4; }
  if (dy > 0 && t * dy > YC) {
    const A = dx * dx / (RX * RX) + dy * dy / (ARCH * ARCH), B = -2 * dy * YC / (ARCH * ARCH), C = YC * YC / (ARCH * ARCH) - 1;
    const c = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
    if (c < tz) { t = c; s = 5; } else { t = tz; s = 4; }
  }
  return { t, s };
}
function wallShade(s, x, y, z) {
  // Returns albedo, normal, alpha (0 = glass), id
  if (s === 3) return { c: wood(x, z, [.3, .19, .12], 2), n: [0, 1, 0], a: 1, id: 0 };
  if (s === 5) {
    const rib = Math.abs(((z * 1.4) % 1) - .5) < .025, d = .9 + fbm(x * 4, z * 4) * .18;
    const l = Math.hypot(x / (RX * RX), (y - YC) / (ARCH * ARCH));
    return { c: rib ? [.48, .38, .25] : [.74 * d, .63 * d, .43 * d], n: [-x / (RX * RX) / l, -(y - YC) / (ARCH * ARCH) / l, 0], a: 1, id: 0 };
  }
  let u, n, win, cx, cy, hw, hh, rad;
  if (s === 4) { u = x; n = [0, 0, -1]; win = ID.win1; cx = 0; cy = .47; hw = .54; hh = .8; rad = .17; }
  else { u = z; n = s === 1 ? [-1, 0, 0] : [1, 0, 0]; win = s === 1 ? ID.win2 : ID.win0; cx = 2.05; cy = .45; hw = .58; hh = .68; rad = .1; }
  const d = rrect(u, y, cx, cy, hw, hh, rad);
  if (d < 0) return { c: [0, 0, 0], n, a: 0, id: win };
  if (d < .022) return { c: [.15, .14, .15], n, a: 1, id: win };
  if (d < .09) { const l = .78 + (d / .09) * .22; return { c: [.66 * l, .69 * l, .69 * l], n, a: 1, id: win }; }
  if (d < .115) return { c: [.13, .08, .06], n, a: 1, id: win };
  if (Math.abs(y + .34) < .03 || Math.abs(y - 1.3) < .025) return { c: [.66, .47, .27], n, a: 1, id: 0 };
  const tone = y < -.34 ? [.42, .25, .15] : [.6, .39, .22];
  return { c: wood(u + (s === 4 ? 0 : 1.7 * s), y, tone, s), n, a: 1, id: 0 };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const scratch = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const Bake = { lit: scratch(), dark: scratch(), ids: new Uint8Array(W * H), hl: {}, box: {} };

function bake() {
  const P = buildPrims();
  const lamps = [
    { p: [0, 1.8, 2.6], c: [1.05, .88, .66], s: .44 },
    { p: [0, 1.5, .95], c: [1.02, .9, .72], s: .62 },
    { p: [-.93, .36, 2.75], c: [1.15, .8, .45], s: .34 },
    { p: [.93, .36, 2.75], c: [1.15, .8, .45], s: .34 },
    { p: [-.72, -.7, 1.75], c: [1.1, .42, .16], s: .16 },
    { p: [.05, -.12, 1.25], c: [1.1, .9, .72], s: .16 },
  ];
  if (S && has('lamp')) lamps.push({ p: [.8, .12, 2.02], c: [1.15, .85, .5], s: .22 });
  const casters = P.filter(p => !p.noShadow);
  const occluded = (ox, oy, oz, dx, dy, dz, dist, self) => { for (const p of casters) { if (p === self) continue; if (hitPrim(p, ox, oy, oz, dx, dy, dz, dist)) return true; } return false; };
  const lctx = Bake.lit.getContext('2d'), dctx = Bake.dark.getContext('2d');
  const lit = lctx.createImageData(W, H), dark = dctx.createImageData(W, H);
  const depth = new Float32Array(W * H), obj = new Int16Array(W * H);
  const ids = Bake.ids;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let dx = (px + .5 - VX) / F, dy = -(py + .5 - VY) / F, dz = 1;
    const room = roomHit(dx, dy, dz);
    let t = room.t, hit = null, prim = null, pi = -1;
    P.forEach((p, i) => { const h = hitPrim(p, 0, 0, 0, dx, dy, dz, t); if (h) { t = h.t; hit = h; prim = p; pi = i; } });
    const x = dx * t, y = dy * t, z = dz * t;
    let alb, n, alpha = 1, id = 0, emissive = false;
    if (prim) {
      n = hit.n; id = prim.id;
      if (prim.mat === 'glow') { emissive = true; alb = [1, .86, .55]; }
      else {
        alb = material(prim.mat, x, y, z, n);
      }
    } else { const w = wallShade(room.s, x, y, z); alb = w.c; n = w.n; alpha = w.a; id = w.id; }
    const i = py * W + px; depth[i] = t; obj[i] = prim ? pi : -room.s; ids[i] = id;
    const j = i * 4, by = BAYER[(px & 3) + (py & 3) * 4] / 16 - .5;
    if (alpha === 0) continue;
    let r = 0, gg = 0, b = 0;
    if (emissive) { r = 1.3; gg = 1.12; b = .78; }
    else for (const L of lamps) {
      let lx = L.p[0] - x, ly = L.p[1] - y, lz = L.p[2] - z; const dist = Math.hypot(lx, ly, lz); lx /= dist; ly /= dist; lz /= dist;
      const nl = n[0] * lx + n[1] * ly + n[2] * lz;
      if (nl <= 0) continue;
      const ox = x + n[0] * .012, oy = y + n[1] * .012, oz = z + n[2] * .012;
      const vis = occluded(ox, oy, oz, lx, ly, lz, dist - .03, prim) ? .12 : 1;
      const e = L.s * (.25 + nl * .95) * vis / (.3 + dist * dist * .5);
      r += L.c[0] * e; gg += L.c[1] * e; b += L.c[2] * e;
    }
    // Banded light is what makes it read as pixel art rather than a render
    const band = 7, lift = (by * .85);
    const qt = v => Math.max(0, Math.round(v * band + lift)) / band;
    const shadeL = [alb[0] * (qt(r) + .08), alb[1] * (qt(gg) + .07), alb[2] * (qt(b) + .07)];
    const ambient = .1 + .24 * Math.max(0, Math.min(1, (y + 1.4) / 3));
    const shadeD = emissive ? [.28, .25, .22] : [alb[0] * ambient * .82, alb[1] * ambient * .95, alb[2] * ambient * 1.5];
    const post = v => Math.round(clamp(v, 0, 1) * 26) / 26 * 255;
    for (let c = 0; c < 3; c++) { lit.data[j + c] = post(shadeL[c]); dark.data[j + c] = post(shadeD[c]); }
    lit.data[j + 3] = 255; dark.data[j + 3] = 255;
  }
  // Dark edges between objects, as a pixel artist would ink them
  for (let py = 1; py < H - 1; py++) for (let px = 1; px < W - 1; px++) {
    const i = py * W + px; if (lit.data[i * 4 + 3] === 0) continue;
    let edge = false;
    for (const k of [i - 1, i + 1, i - W, i + W]) if (obj[k] !== obj[i] && depth[k] > depth[i] * 1.025) edge = true;
    if (edge) for (let c = 0; c < 3; c++) { lit.data[i * 4 + c] *= .34; dark.data[i * 4 + c] *= .34; }
  }
  lctx.putImageData(lit, 0, 0); dctx.putImageData(dark, 0, 0);
  // Hotspot glow masks and window bounds
  for (const k in ID) {
    const v = ID[k], c = scratch(), x = c.getContext('2d'), d = x.createImageData(W, H);
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let i = 0; i < W * H; i++) if (ids[i] === v) {
      const px = i % W, py = (i - px) / W;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      d.data[i * 4] = 255; d.data[i * 4 + 1] = 214; d.data[i * 4 + 2] = 130; d.data[i * 4 + 3] = 255;
    }
    x.putImageData(d, 0, 0); Bake.hl[v] = c; Bake.box[v] = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
}

/* ---------- pre-rendered glows and fog ---------- */
function makeGlow(r, col) {
  const c = document.createElement('canvas'); c.width = c.height = r * 2;
  const x = c.getContext('2d');
  for (let py = 0; py < r * 2; py++) for (let px = 0; px < r * 2; px++) {
    const d = Math.hypot(px - r, py - r) / r; if (d >= 1) continue;
    const a = Math.round((1 - d) ** 2 * 6 + BAYER[(px & 3) + (py & 3) * 4] / 16) / 6;
    if (a > 0) { x.fillStyle = `rgba(${col},${a})`; x.fillRect(px, py, 1, 1); }
  }
  return c;
}
function makeFog(col) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  for (let py = 0; py < 128; py++) for (let px = 0; px < 256; px++) {
    // Blended across the seam so it can scroll forever
    const u = px / 256, n = lerp(fbm(u * 7, py / 16), fbm((u - 1) * 7, py / 16), u) + BAYER[(px & 3) + (py & 3) * 4] / 90;
    const a = n > .54 ? .9 : n > .47 ? .62 : n > .4 ? .3 : 0;
    if (a) { x.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`; x.fillRect(px, py, 1, 1); }
  }
  return c;
}
const glowW = makeGlow(46, '255,190,100'), glowS = makeGlow(26, '255,120,50'), glowC = makeGlow(70, '255,205,130');
const fogCache = {};
const fogFor = sc => fogCache[sc.name] || (fogCache[sc.name] = makeFog(sc.fog));

/* ---------- sim ---------- */
function act(what, arg) {
  if (phase !== 'night') return;
  audioStart();
  if (R.sleeping) { R.sleeping = false; toast('You sit up, heart going.'); return; }
  if (what === 'window') {
    sfx('knock');
    const f = R.figs.filter(x => x.w === arg).sort((a, b) => a.d - b.d)[0];
    if (!f) return;
    const cost = has('lamp') ? 3 : 5;
    if (S.oil < cost) return toast('Not enough oil to flash the lamp.');
    S.oil -= cost; R.flash[arg] = 1; R.figs = R.figs.filter(x => x !== f);
  } else if (what === 'oil') {
    if (S.cans <= 0) return toast('No oil cans left.');
    if (S.oil > 85) return toast('The lamp is full.');
    S.cans--; S.oil = Math.min(100, S.oil + 55); sfx('fill');
  } else if (what === 'stove') {
    if (S.coal <= 0) return toast('The coal scuttle is empty.');
    if (S.warm > 88) return toast('The stove is roaring already.');
    S.coal--; S.warm = Math.min(100, S.warm + 50); sfx('coal');
  } else if (what === 'tea') {
    if (R.mug < 1) return toast('The kettle has not boiled yet.');
    R.mug = 0; S.nerve = Math.min(100, S.nerve + (has('flowers') ? 44 : 22)); sfx('fill');
  } else if (what === 'bed') {
    R.sleeping = true; sfx('sleep'); hint('sleep', 'Sleeping makes the night pass three times faster. The things outside do not sleep.');
  }
}
function step(dt) {
  R.t += dt;
  const n = S.night, speedMul = S.oil <= 15 ? 1.4 : 1, tn = R.sleeping ? 3 : 1;
  R.clock += dt * tn / NIGHT_LEN;
  S.oil = Math.max(0, S.oil - dt * (has('lamp') ? .28 : .4));
  S.warm = Math.max(0, S.warm - dt * .85);
  if (S.warm > 25) R.mug = Math.min(1, R.mug + dt / 13);
  if (S.warm <= 0) S.nerve -= dt * 3;
  if (R.sleeping) S.nerve = Math.min(100, S.nerve + dt * (has('bear') ? 10 : 5));
  R.spawn -= dt;
  if (R.spawn <= 0) {
    R.spawn = lerp(9, 5, (n - 1) / 6) * (.75 + Math.random() * .5);
    const w = Math.floor(Math.random() * 3);
    if (R.figs.filter(f => f.w === w).length < 2) R.figs.push({ w, d: 1, x: .22 + Math.random() * .56, glass: 0, seed: Math.random(), fade: Math.random() < .45 ? .5 + Math.random() * .38 : 0 });
    hint('fig', 'Something is out there. Tap its window to flash it away, or let it pass and steel yourself.');
  }
  const slow = has('curtain') ? .84 : 1, approach = lerp(1 / 13, 1 / 7.5, (n - 1) / 6) * speedMul * slow;
  for (const f of R.figs) {
    if (f.dir) { f.x += f.dir * 1.4 * dt; if (f.x < -1.2 || f.x > 2.2) f.gone = true; continue; }
    if (f.mist !== undefined) { f.mist -= dt / 1.6; if (f.mist <= 0) f.gone = true; continue; }
    f.d -= approach * dt;
    if (f.fade && f.d < f.fade) f.mist = 1;
    else if (f.d <= CLOSE) { f.d = CLOSE; f.dir = f.w === 0 ? -1 : f.w === 2 ? 1 : f.x < .5 ? -1 : 1; S.nerve = Math.max(0, S.nerve - (has('radio') ? 4 : 8)); }
  }
  R.figs = R.figs.filter(f => !f.gone);
  S.nerve = Math.max(0, S.nerve);
  for (let i = 0; i < 3; i++) R.flash[i] = Math.max(0, R.flash[i] - dt * 3.5);
  if (S.oil < 25 && S.cans > 0) hint('oil', 'The lamp is running low. Tap the red oil can on the shelf.');
  if (S.warm < 30 && S.coal > 0) hint('coal', 'It is getting cold. Tap the stove to add coal.');
  if (S.nerve < 60 && R.mug >= 1) hint('tea', 'The tea is ready. Tap the mug to steady yourself.');
  if (R.clock >= 1) morning();
}
function morning() {
  phase = 'menu'; R.sleeping = false; sfx('dawn');
  if (S.night >= NIGHTS) { clearSave(); ending(); return; }
  const stop = STOPS[(S.night - 1) % STOPS.length];
  const left = Object.keys(UPGRADES).filter(k => !S.up.includes(k)).sort(() => Math.random() - .5).slice(0, 3);
  const steady = S.nerve >= 50, cans = (has('crate') ? 2 : 1) + (steady ? 1 : 0), coal = has('crate') ? 2 : 1;
  S.cans += cans; S.coal += coal; S.nerve = Math.min(100, S.nerve + 30); S.warm = Math.max(S.warm, 45); S.oil = Math.max(S.oil, 45);
  sheet(`<h2>Morning at ${stop[0]}</h2><p>${stop[1]}</p><p class="small">Found: ${cans} oil cans, ${coal} coal. ${steady ? 'Calm enough to search properly, you turned up an extra can.' : 'Your hands shook too much to search for long.'}</p><p>Bring one thing aboard:</p>` +
    left.map(k => `<button data-u="${k}">${UPGRADES[k].name}<span>${UPGRADES[k].desc}</span></button>`).join(''));
  document.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { S.up.push(b.dataset.u); S.night++; bake(); save(); startNight(); });
}
function ending() {
  sheet(`<h1>The Sea</h1><p>On the seventh morning the rails run out in pale sand. Nothing walks on the beach. The kettle is still warm.</p><p>You open every window in the carriage, and then you sleep, properly, for the first time in years.</p><p class="small">You brought ${S.up.length} small comforts all the way to the end of the line.</p><button class="main" id="again">Ride again</button>`);
  $('again').onclick = () => titleScreen(true);
}
function startNight() {
  newNight(); hideSheet(); phase = 'night'; save();
  toast(`Night ${S.night} of ${NIGHTS}. Hold on until dawn.`);
}
function sheet(h) { $('sheet').innerHTML = h; $('modal').classList.add('show'); const b = $('sheet').querySelector('button'); if (b) b.focus({ preventScroll: true }); }
function hideSheet() { $('modal').classList.remove('show'); }
let tT;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('show'), 3400); }
function hint(k, m) { if (S.seen[k]) return; S.seen[k] = 1; toast(m); }

/* ---------- pixel font ---------- */
const GLYPH = { A: '010101111101101', D: '110101101101110', G: '011100101101011', H: '101101111101101', I: '111010010010111', L: '100100100100111', N: '110101101101101', O: '010101101101010', R: '110101110101101', T: '111010010010010', V: '101101101101010', W: '101101101111101', X: '101101010101101', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110' };
function text(str, x, y, col) { g.fillStyle = col; for (const ch of str) { const b = GLYPH[ch]; if (b) for (let i = 0; i < 15; i++) if (b[i] === '1') g.fillRect(x + i % 3, y + Math.floor(i / 3), 1, 1); x += 4; } }

/* ---------- windows ---------- */
function drawFigure(cx, foot, h, seed, close, t) {
  const col = close > .5 ? '#121016' : '#201e26', top = Math.round(foot - h), sw = Math.sin(t * 2.2 + seed * 7) * h * .025;
  g.fillStyle = col; cx = Math.round(cx);
  const widest = h * .24;
  for (let i = 0; i < Math.ceil(h); i++) {
    const v = i / h; let l = 0, r = 0, gapL = 0, gapR = 0;
    if (v < .15) { const q = (v - .075) / .075; r = l = h * .085 * Math.sqrt(Math.max(0, 1 - q * q)); }
    else if (v < .19) l = r = h * .05;
    else if (v < .3) l = r = lerp(h * .08, widest, (v - .19) / .11);
    else if (v < .6) { l = r = lerp(widest, widest * .75, (v - .3) / .3); }
    else { l = r = widest * .68; gapL = gapR = lerp(0, h * .03, clamp((v - .6) * 8, 0, 1)); }
    const j = Math.round((rnd(i * 2.3 + seed * 90) - .5) * Math.max(1, h * .025));
    const lean = Math.round(sw * (1 - v) * 2);
    const y = top + i;
    if (gapL) { g.fillRect(cx + lean - Math.round(l) + j, y, Math.max(1, Math.round(l - gapL)), 1); g.fillRect(cx + lean + Math.round(gapR), y, Math.max(1, Math.round(r - gapR)) - j, 1); }
    else g.fillRect(cx + lean - Math.round(l) + j, y, Math.max(1, Math.round(l + r)) - j, 1);
  }
  if (h > 34) {
    const hy = top + Math.round(h * .07), e = Math.max(1, Math.round(h / 44)), o = Math.max(2, Math.round(h * .035));
    g.fillStyle = Math.sin(t * .8 + seed * 9) > -.85 ? '#ff4a2b' : col;
    g.fillRect(cx + Math.round(sw * 2) - o - e + 1, hy, e, e); g.fillRect(cx + Math.round(sw * 2) + o, hy, e, e);
  }
}
/* One outdoor world seen from one eye: all three windows look onto the same picture. */
const HZ = 156, EYE = 1.47, WORLD = 130, SPEED = 7;
const xAt = (x, z) => VX + F * x / z, yAt = (wy, z) => HZ - (wy - EYE) * F / z;
const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const shade = (c, m) => c.map(v => v * m);
const rgbOf = c => 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')';
const worldCache = {};
function worldFor(sc) {
  if (worldCache[sc.name]) return worldCache[sc.name];
  const o = [];
  if (sc.town) for (let i = 0; i < 28; i++) {
    const s = i % 2 ? 1 : -1, w = 7 + rnd(i * 3 + 1) * 9;
    o.push({ k: 'b', x: s * (10 + rnd(i * 5 + 2) * 20 + w / 2), w, d: 8 + rnd(i + 9) * 8, h: 8 + rnd(i * 7 + 3) * 22, p: i * WORLD / 28 + rnd(i) * 3, seed: i });
  } else for (let i = 0; i < 80; i++) {
    const s = i % 2 ? 1 : -1;
    o.push({ k: 't', x: s * (4.6 + Math.pow(rnd(i * 5 + 2), 1.4) * 34), h: 7 + rnd(i * 7 + 3) * 9, p: i * WORLD / 80 + rnd(i) * 2, seed: i });
  }
  for (let i = 0; i < 7; i++) o.push({ k: 'p', x: -3.8, p: i * WORLD / 7, seed: i });
  return worldCache[sc.name] = o;
}
function drawBuilding(o, z, base, fog, far, sc) {
  const mixK = Math.min(.92, z / far), face = base.map((v, i) => lerp(v, fog[i], mixK)), side = shade(face, .68);
  const s = Math.sign(o.x), xin = o.x - s * o.w / 2, xout = o.x + s * o.w / 2;
  const x0 = xAt(xin, z), x1 = xAt(xin, z + o.d), a = Math.round(Math.min(x0, x1)), b = Math.round(Math.max(x0, x1));
  const bot = yAt(0, z), top = yAt(o.h, z);
  if (sc.water) { g.globalAlpha = .34; g.fillStyle = rgbOf(face); g.fillRect(Math.round(Math.min(x0, xAt(xout, z))), Math.round(bot), Math.round(Math.abs(xAt(xout, z) - x0)), Math.round((bot - top) * .45)); g.globalAlpha = 1; }
  g.fillStyle = rgbOf(side);
  for (let sx = a; sx <= b; sx++) { const zc = F * xin / (sx + .5 - VX); if (zc <= 0) continue; const ty = yAt(o.h, zc); g.fillRect(sx, Math.round(ty), 1, Math.round(yAt(0, zc) - ty) + 1); }
  const fx0 = Math.round(Math.min(x0, xAt(xout, z))), fx1 = Math.round(Math.max(x0, xAt(xout, z)));
  g.fillStyle = rgbOf(face); g.fillRect(fx0, Math.round(top), fx1 - fx0, Math.round(bot - top));
  const sz = F / z;
  if (sz > 3) {
    const nx = Math.max(2, Math.floor(o.w / 2.4)), ny = Math.max(2, Math.floor(o.h / 3.2)), wx = (fx1 - fx0) / nx, wy = (bot - top) / ny;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx; i++) {
      const r = rnd(o.seed * 11 + j * 7 + i);
      g.fillStyle = r > .84 ? (sc.water ? '#ff8038' : '#e8a95e') : rgbOf(shade(face, .72));
      g.fillRect(Math.round(fx0 + (i + .25) * wx), Math.round(top + (j + .25) * wy), Math.max(1, Math.round(wx * .5)), Math.max(1, Math.round(wy * .5)));
    }
  }
}
function drawTree(o, z, base, fog, far, sc) {
  const col = base.map((v, i) => lerp(v, fog[i], Math.min(.92, z / far))), S = F / z, cx = Math.round(xAt(o.x, z)), bot = yAt(0, z), hpx = o.h * S;
  g.fillStyle = rgbOf(shade(col, .75)); g.fillRect(cx - Math.max(1, Math.round(S * .12)), Math.round(bot - hpx * .3), Math.max(1, Math.round(S * .24)), Math.round(hpx * .3));
  g.fillStyle = rgbOf(col);
  const rows = Math.round(hpx * .86), top = Math.round(bot - hpx);
  for (let i = 0; i < rows; i++) {
    const v = i / rows, half = hpx * (sc.snow ? .04 + v * .2 : .05 + Math.sin(v * 3.14) * .19 + v * .05), j = Math.round((rnd(i * 3.1 + o.seed * 17) - .5) * Math.max(1, hpx * .05));
    g.fillRect(Math.round(cx - half) + j, top + i, Math.max(1, Math.round(half * 2)), 1);
  }
}
function drawPole(o, z, fog, far) {
  g.fillStyle = rgbOf([45, 44, 46].map((v, i) => lerp(v, fog[i], Math.min(.9, z / far))));
  const S = F / z, cx = Math.round(xAt(o.x, z)), bot = yAt(0, z), top = yAt(8, z);
  g.fillRect(cx, Math.round(top), Math.max(1, Math.round(S * .16)), Math.round(bot - top));
  g.fillRect(Math.round(cx - S * .9), Math.round(top + S * .4), Math.round(S * 1.8), Math.max(1, Math.round(S * .1)));
}
function outsideWorld(sc, t) {
  const S = t * SPEED, fog = sc.fog, far = sc.town ? 95 : 62, K = F * EYE;
  // Sky
  const bandH = (HZ - 60) / sc.sky.length;
  g.fillStyle = sc.sky[0]; g.fillRect(0, 0, W, 61);
  sc.sky.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, Math.floor(60 + i * bandH), W, Math.ceil(bandH) + 1); });
  // Ground, rows nearest the eye last; the rails sit dead centre on the vanishing point
  const ground = hexRGB(sc.ground);
  for (let y = HZ; y < 250; y++) {
    const rz = K / (y - HZ + .5), wz = rz + S, stripe = Math.floor(wz / 3.2) % 2 === 0 ? .92 : 1;
    g.fillStyle = rgbOf(ground.map((v, i) => lerp(v * stripe, fog[i], Math.min(.85, rz / far)))); g.fillRect(0, y, W, 1);
    if (sc.water && rnd(y * 3.7 + Math.floor(t * 2)) > .55) { g.fillStyle = '#2a5a80'; const len = 30 + rnd(y) * 90; g.fillRect(Math.round(rnd(y * 9) * W - len / 2 + Math.sin(t + y) * 4), y, Math.round(len), 1); }
    const px = F / rz, ballast = 1.75 * px;
    g.fillStyle = rgbOf(hexRGB(sc.water ? '#10283c' : sc.snow ? '#a8b5bf' : '#3f3a35').map((v, i) => lerp(v, fog[i], Math.min(.85, rz / far))));
    g.fillRect(Math.round(VX - ballast), y, Math.round(ballast * 2), 1);
    if (rz < 34) {
      const sleeper = (wz / 1.5) % 1 < .42;
      if (sleeper) { g.fillStyle = sc.snow ? '#7a6d60' : '#5b4634'; g.fillRect(Math.round(VX - 1.2 * px), y, Math.round(2.4 * px), 1); }
    }
    g.fillStyle = sc.snow ? '#667078' : '#c7c9c4';
    const wd = Math.max(1, Math.round(.08 * px));
    g.fillRect(Math.round(VX - .72 * px), y, wd, 1); g.fillRect(Math.round(VX + .72 * px), y, wd, 1);
  }
  // Things in the world and the figures walking through it, far to near
  const list = [], base = hexRGB(sc.town ? (sc.water ? '#25334c' : '#4b4a5c') : sc.snow ? '#3d5966' : '#55645a');
  for (const o of worldFor(sc)) { const z = ((o.p - S) % WORLD + WORLD) % WORLD + 3; if (z > 3.4) list.push({ z, o }); }
  if (R) for (const f of R.figs) list.push({ z: lerp(3.4, 36, f.d * f.d), f });
  list.sort((a, b) => b.z - a.z);
  for (const it of list) {
    if (it.f) {
      const f = it.f, b = Bake.box[ID['win' + f.w]], k = 1 - f.d, h = 1.85 * F / it.z, foot = yAt(0, it.z);
      g.globalAlpha = lerp(.55, 1, Math.min(1, k * 1.4)) * (f.mist === undefined ? 1 : Math.max(0, f.mist));
      drawFigure(b.x + b.w * f.x, foot, h, f.seed, k, t);
      g.globalAlpha = 1;
    } else if (it.o.k === 'b') drawBuilding(it.o, it.z, base, fog, far, sc);
    else if (it.o.k === 't') drawTree(it.o, it.z, base, fog, far, sc);
    else drawPole(it.o, it.z, fog, far);
  }
  // A single drifting fog bank spans all three windows
  const bank = fogFor(sc), off = (t * 9) % 256;
  g.globalAlpha = .42; for (let x = -256; x < W + 256; x += 256) g.drawImage(bank, Math.round(x + off), HZ - 66); g.globalAlpha = 1;
  // Weather and glass
  if (sc.rain) { g.fillStyle = 'rgba(205,228,240,.65)'; for (let i = 0; i < 70; i++) { const x = Math.round(rnd(i * 2) * W), y = 60 + Math.round((rnd(i) * 180 + t * (120 + rnd(i * 3) * 90)) % 180); g.fillRect(x, y, 1, 5); } }
  if (sc.snow) { g.fillStyle = '#fff'; for (let i = 0; i < 70; i++) { const x = Math.round((rnd(i * 2) * W + Math.sin(t + i) * 5 + W) % W), y = 60 + Math.round((rnd(i) * 180 + t * 22) % 180); g.fillRect(x, y, 1, 1); } }
  for (let w = 0; w < 3; w++) {
    const b = Bake.box[ID['win' + w]];
    g.fillStyle = 'rgba(220,235,240,.12)'; for (let i = 0; i < 3; i++) g.fillRect(b.x + 5 + i * 6, b.y + 6 + i * 3, 2, b.h - 22);
    if (R && R.flash[w] > 0) { g.fillStyle = 'rgba(255,240,190,' + R.flash[w] + ')'; g.fillRect(b.x, b.y, b.w, b.h); }
  }
}

function trainBob(t) {
  const p = ((t % BEAT) + BEAT) % BEAT, s = Math.sin(t * Math.PI * 2 / (BEAT * 2));
  return [s > .6 ? 1 : s < -.6 ? -1 : 0, p < .09 || (p >= .17 && p < .26) ? 1 : 0];
}
function draw() {
  const t = performance.now() / 1000;
  const sc = SCENES[NIGHT_SCENE[(S.night - 1) % 7]], oil = S.oil, night = phase === 'night';
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, W, H);
  const [bx, by] = trainBob(t);
  g.save(); g.translate(bx, by);
  outsideWorld(sc, t);
  const flick = (Math.sin(t * 11) + Math.sin(t * 17.3)) * .012 + (oil < 15 ? (Math.sin(t * 31) * .15) : 0);
  const level = R && R.sleeping ? 0 : clamp(.1 + Math.min(oil, 45) / 45 * .9 + flick, 0, 1);
  g.drawImage(Bake.dark, 0, 0);
  g.globalAlpha = level; g.drawImage(Bake.lit, 0, 0); g.globalAlpha = 1;
  // Glows
  g.globalCompositeOperation = 'lighter';
  const [lx, ly] = project(-.93, .36, 2.92), [rx, ry] = project(.93, .36, 2.92), [cx, cy] = project(0, 2, 2.75), [sx, sy] = project(-.92, -.72, 2);
  g.globalAlpha = .34 * level; g.drawImage(glowW, Math.round(lx - 46), Math.round(ly - 46)); g.drawImage(glowW, Math.round(rx - 46), Math.round(ry - 46));
  g.globalAlpha = .18 * level; g.drawImage(glowC, Math.round(cx - 70), Math.round(cy - 70));
  if (has('lamp')) { const [ax, ay] = project(.83, .12, 2.23); g.globalAlpha = .5 * level; g.drawImage(glowW, Math.round(ax - 46), Math.round(ay - 46)); }
  const heat = S.warm / 100; g.globalAlpha = (.3 + heat * .6) * (.8 + Math.sin(t * 9) * .2); g.drawImage(glowS, Math.round(sx - 26), Math.round(sy - 26));
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // Stove door embers
  const [d0x, d0y] = project(-1.02, -.5, 2), [d1x, d1y] = project(-.84, -.72, 2), flame = clamp(heat * 1.4, 0, 1);
  if (flame > 0) { const dx = Math.round(d0x), dy = Math.round(d0y), dw = Math.round(d1x - d0x), dh = Math.round(d1y - d0y); g.fillStyle = '#17120f'; g.fillRect(dx - 1, dy - 1, dw + 2, dh + 2); g.fillStyle = `rgba(232,${88 + Math.sin(t * 8) * 22 | 0},32,${flame})`; g.fillRect(dx, dy + 2, dw, dh - 2); g.fillStyle = `rgba(255,${190 + Math.sin(t * 13) * 30 | 0},90,${flame})`; for (let i = 0; i < dw; i += 3) g.fillRect(dx + i, dy + dh - 3 - (Math.sin(t * 7 + i) + 1) * 2 | 0, 2, 3); }
  const sleeping = R && R.sleeping;
  // Steam
  if (R && R.mug >= 1) { const [mx, my] = project(.88, -.34, 2.1); g.fillStyle = 'rgba(240,240,235,.75)'; for (let i = 0; i < 4; i++) g.fillRect(Math.round(mx + Math.sin(t * 3 + i) * 2), Math.round(my - 3 - i * 4 - (t * 6) % 4), 2, 2); }
  if (S.warm > 40) { const [kx, ky] = project(-.8, -.25, 2.28); g.fillStyle = 'rgba(240,240,235,.5)'; for (let i = 0; i < 3; i++) g.fillRect(Math.round(kx + i * 2 + Math.sin(t * 2 + i)), Math.round(ky - 2 - i * 4 - (t * 5) % 4), 2, 2); }
  // Attention glows on things that need you
  if (night && R && !sleeping) {
    const pulse = .22 + Math.sin(t * 5) * .14, on = (v, a) => { g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.drawImage(Bake.hl[v], 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
    if (S.oil < 30 && S.cans > 0) on(ID.oil, pulse);
    if (S.warm < 35 && S.coal > 0) on(ID.stove, pulse);
    if (R.mug >= 1 && S.nerve < 75) on(ID.tea, pulse);
    if (hover) on(hover, .22);
  }
  if (sleeping) { g.fillStyle = 'rgba(8,10,28,.22)'; g.fillRect(0, 0, W, H); const z = Math.floor(t * 2) % 3; for (let i = 0; i <= z; i++) text('Z', 150 + i * 9, 240 - i * 9, '#d9d2f0'); }
  g.restore();
  // Fill the 1px sliver the bob uncovers
  if (by) g.drawImage(cv, 0, 1, W, 1, 0, 0, W, 1);
  if (bx > 0) g.drawImage(cv, 1, 0, 1, H, 0, 0, 1, H); else if (bx < 0) g.drawImage(cv, W - 2, 0, 1, H, W - 1, 0, 1, H);
  if (night && R) hud();
}
function bar(x, y, label, v, col, extra) {
  text(label, x, y, '#f2dfbd');
  g.fillStyle = '#1b100b'; g.fillRect(x + 22, y - 1, 44, 7);
  g.fillStyle = v < 30 ? '#e8492f' : col; g.fillRect(x + 23, y, Math.round(42 * clamp(v, 0, 100) / 100), 5);
  if (extra !== undefined) text('X' + extra, x + 69, y, '#f2dfbd');
}
function hud() {
  g.fillStyle = 'rgba(20,12,9,.82)'; g.fillRect(0, 0, W, 34);
  g.fillStyle = '#8a5a2f'; g.fillRect(0, 34, W, 1);
  bar(6, 5, 'OIL', S.oil, '#f0a94a', S.cans);
  bar(6, 14, 'HOT', S.warm, '#df6d3a', S.coal);
  bar(6, 23, 'NRV', S.nerve, '#7fbf8a');
  text('NIGHT ' + S.night, 196, 5, '#f0a94a');
  g.fillStyle = '#1b100b'; g.fillRect(150, 14, 114, 7);
  g.fillStyle = '#c9b6e8'; g.fillRect(151, 15, Math.round(112 * clamp(R.clock, 0, 1)), 5);
  text('DAWN', 248, 23, '#bb9f7c');
}

/* ---------- input ---------- */
function pickAt(e) {
  const r = cv.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  const small = id => id === ID.oil || id === ID.tea, at = (a, b) => (a >= 0 && b >= 0 && a < W && b < H) ? Bake.ids[b * W + a] : 0;
  // Generous targets for the little objects, for thumbs
  if (small(at(x, y))) return at(x, y);
  for (let rad = 2; rad <= 10; rad += 2) for (let a = 0; a < 8; a++) { const v = at(Math.round(x + Math.cos(a * .785) * rad), Math.round(y + Math.sin(a * .785) * rad)); if (small(v)) return v; }
  return at(x, y);
}
function dispatch(id) {
  if (id === ID.bed) act('bed'); else if (id === ID.stove) act('stove'); else if (id === ID.oil) act('oil'); else if (id === ID.tea) act('tea');
  else if (id >= ID.win0 && id <= ID.win2) act('window', id - ID.win0);
}
cv.addEventListener('pointerdown', e => { if (phase === 'night') dispatch(pickAt(e)); });
cv.addEventListener('pointermove', e => { const id = phase === 'night' ? pickAt(e) : 0; hover = id; cv.style.cursor = id ? 'pointer' : 'default'; });
addEventListener('keydown', e => {
  if (phase !== 'night') return;
  const m = { 1: ['window', 0], 2: ['window', 1], 3: ['window', 2], o: ['oil'], c: ['stove'], t: ['tea'], s: ['bed'] }[e.key.toLowerCase()];
  if (m) act(...m);
});
function resize() {
  const k = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = W * k + 'px'; cv.style.height = H * k + 'px';
}
addEventListener('resize', resize);

/* ---------- audio ---------- */
const A = { ctx: null, out: null, next: 0, bar: 0 };
const CHORDS = [[45, 57, 60, 64], [41, 53, 57, 60], [48, 55, 60, 64], [43, 55, 59, 62]];
function audioStart() {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const c = A.ctx = new AC();
  A.out = c.createGain(); A.out.gain.value = .75; A.out.connect(c.destination);
  const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
  src.buffer = buf; src.loop = true; f.type = 'lowpass'; f.frequency.value = 780; v.gain.value = .07;
  src.connect(f); f.connect(v); v.connect(A.out); src.start();
  A.next = c.currentTime + .1; setInterval(music, 250);
}
function tone(m, t, vol, len, type) {
  const c = A.ctx, o = c.createOscillator(), v = c.createGain();
  o.type = type || 'triangle'; o.frequency.value = 440 * 2 ** ((m - 69) / 12);
  v.gain.setValueAtTime(0, t); v.gain.linearRampToValueAtTime(vol, t + .015); v.gain.exponentialRampToValueAtTime(.0001, t + len);
  o.connect(v); v.connect(A.out); o.start(t); o.stop(t + len + .05);
}
function music() {
  const c = A.ctx; if (!c) return;
  while (A.next < c.currentTime + .7) {
    const ch = CHORDS[A.bar % 4], vol = has('radio') ? 1.4 : 1;
    tone(ch[0], A.next, .09 * vol, 4.5);
    [2, 3, 1, 2].forEach((n, i) => tone(ch[n] + 12, A.next + .8 + i * .85, .035 * vol, 3));
    A.next += 4.6; A.bar++;
  }
}
function noiseHit(freq, vol, len) {
  const c = A.ctx, n = Math.floor(c.sampleRate * len), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
  f.type = 'lowpass'; f.frequency.value = freq; v.gain.value = vol; s.buffer = b; s.connect(f); f.connect(v); v.connect(A.out); s.start();
}
function sfx(k) {
  if (!A.ctx) return; const t = A.ctx.currentTime;
  if (k === 'clack') noiseHit(420, .13, .05);
  else if (k === 'knock') {
    // A knuckle on glass: a quick falling thud with a muffled tick on top
    const o = A.ctx.createOscillator(), v = A.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(215, t); o.frequency.exponentialRampToValueAtTime(130, t + .07);
    v.gain.setValueAtTime(.0001, t); v.gain.exponentialRampToValueAtTime(.1, t + .012); v.gain.exponentialRampToValueAtTime(.0001, t + .13);
    o.connect(v); v.connect(A.out); o.start(t); o.stop(t + .15);
    noiseHit(600, .03, .03);
  }
  else if (k === 'fill') { tone(72, t, .07, .5); tone(79, t + .12, .06, .6); }
  else if (k === 'coal') noiseHit(1100, .24, .35);
  else if (k === 'sleep') tone(57, t, .08, 1.5);
  else if (k === 'dawn') [72, 76, 79, 84].forEach((m, i) => tone(m, t + i * .18, .07, 2));
}

/* ---------- flow ---------- */
function titleScreen(fresh) {
  phase = 'menu';
  const saved = !fresh && loadSave();
  newRun(); newNight(); bake();
  sheet(`<h1>The Night Sleeper</h1><p>The last train runs at walking pace now. Your compartment has a stove, a warm bed and three windows you would rather not look through.</p><p class="small">Nothing can get in, but they will come close. Tap a window to flash your lamp at them. Tap the oil can, stove and mug to keep going. Tap the bed to sleep the night away faster, if you dare. Seven nights to the sea.</p>${saved ? `<button class="main" id="cont">Continue: night ${saved.night}</button><button id="ng">Start over</button>` : '<button class="main" id="ng">Board the train</button>'}`);
  $('ng').onclick = () => { audioStart(); clearSave(); newRun(); bake(); startNight(); };
  if (saved) $('cont').onclick = () => { audioStart(); S = saved; bake(); startNight(); };
}
let last = performance.now(), lastBeat = -1;
function frame(now) {
  const beat = Math.floor(now / 1000 / BEAT);
  if (beat !== lastBeat) { lastBeat = beat; sfx('clack'); setTimeout(() => sfx('clack'), 170); }
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (phase === 'night') step(dt);
  draw();
  requestAnimationFrame(frame);
}
resize(); titleScreen();
requestAnimationFrame(frame);
window.__g = { get S() { return S; }, get R() { return R; }, get phase() { return phase; }, step, draw, act, bake, startNight, setPhase: p => { phase = p; } };
