/* S6-07 — a cell grown from one day and the night that opened it.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each day, one cell of cobalt on paper. The better the day was for this body,
 * the nearer the cell comes to a circle, an oval, a soft blob; the harder the
 * day, the more its edge folds. Rare events of the day — a long walk, a great
 * number of steps, a nap of an hour, a practice — open islands inside it.
 *
 * WHAT ARRIVES HERE. Not the record the house keeps. Before a day leaves the
 * house it is reduced to its public form (/100/data.json):
 *   p    each measure as its rank against the ninety days of this body before it;
 *   cls  the day's activity class in five-minute steps (0 not worn … 5 high);
 *   ph   the night's phases in five-minute steps (1 deep, 2 light, 3 dream, 4 awake);
 *   isl  the rare events, each as its size against its own threshold;
 *   s    a seed hashed from the day's record — the date plays no part in it.
 *
 * WEAVING. No feature is one signal:
 *   folding of the edge   the night (variability of the heart, sleep, resting heart)
 *                         and the day (steps, time active, time sitting), together
 *   size                  steps, time active, time sitting
 *   the ring around       the hour of the day along the length of the edge — its
 *                         activity class and how often the class changed — scaled
 *                         by the day and by the night
 *   layers of the fill    the night's phases from the edge inward, their weight set
 *                         by how long the night was
 *   fibres                combed by the heart's variability and the resting heart;
 *                         long by sleep and calm; thick by steps and time active
 *   vacuoles              restless sleep and a short night
 *   islands               the event and the day
 *
 * The edge is the day's clock: it is divided by its length into twenty-four
 * equal hours from 04:00, so the clock holds whatever shape the edge takes.
 * Every random number grows from the day's seed. No Math.random.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const W = 920, H = 1350, CX = W / 2, CY = H / 2, N = W * H;
  const PI = Math.PI;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function strHash(s) { let h = 2166136261 >>> 0; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function prng(s) { let a = strHash(s); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * r()); }
  function h2(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h2(xi, yi, s), h2(xi + 1, yi, s), u), lerp(h2(xi, yi + 1, s), h2(xi + 1, yi + 1, s), u), v); }
  function fbm(x, y, s, o = 3) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 101); n += a; a *= 0.5; f *= 2.03; } return t / n; }

  // cobalt on paper
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const P = {
    ink:   ['#061583', '#0c2484', '#0f298c', '#10208a'].map(hex),
    deep:  ['#1f3a92', '#244890', '#30489c', '#2a3f95'].map(hex),
    mid:   ['#304d9b', '#5167a2', '#4a62a8', '#3d58a0'].map(hex),
    light: ['#6c84b4', '#768db0', '#7890b4', '#6a80b0'].map(hex),
    pale:  ['#a8b4cc', '#b4c0cc', '#9ca8c0', '#c0cccc'].map(hex),
    paper: ['#e4e4d8', '#e6e5d9', '#e2e2d6', '#e8e7dc'].map(hex),
  };
  const UNDER = ['#08105e', '#061583', '#061583', '#0c2484', '#0c2484', '#13238a', '#1a2c9e', '#2338b0', '#1f3a92', '#2a3f95', '#3b4f8f'].map(hex);
  const FIB = [...P.deep, ...P.mid, P.light[0], P.light[1], P.light[2], P.pale[0]];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const pick = (g, lo, hs) => g[Math.min(3, Math.floor(clamp(lo * 0.9 + hs * 0.55 - 0.2, 0, 0.999) * 4))];

  // ── the day in the form the rule reads ───────────────────────────────────
  function read(day) {
    const p = Object.assign({ hrv: .5, tst: .5, rhr: .5, steps: .5, active: .5, sed: .5, rest: .5 }, day.p || {});
    const night = (p.hrv + p.tst + (1 - p.rhr)) / 3, dayq = (p.steps + p.active + (1 - p.sed)) / 3;
    const seed = 'S6-07|' + (day.s || day.d);
    return { d: day.d, p, night, dayq, q: 0.5 * night + 0.5 * dayq, cls: day.cls || '', ph: day.ph || '',
             isl: (day.isl || []).map(([k, m]) => ({ k, m })), seed, sn: strHash(seed) % 9999 };
  }

  // ── the cell: harmonics and a wavy edge; folding is a hard day ───────────
  function cellShape(d) {
    const r = prng(d.seed), bad = 1 - d.q;
    const R0 = lerp(290, 350, d.dayq), ell = lerp(0.04, 0.14, r());
    const K = Math.round(lerp(2, 10, bad)), harm = [];
    for (let k = 3; k <= K + 2; k++) harm.push({ k, a: lerp(0, 0.20, bad) * Math.pow(r(), 0.7) / Math.sqrt(k - 1.5), ph: r() * 2 * PI });
    const wavA = lerp(0.006, 0.035, Math.pow(bad, 1.2)), wavK = Math.round(lerp(18, 46, bad)), wph = r() * 2 * PI;
    const rot = r() * PI, M = 900, pts = [];
    for (let i = 0; i < M; i++) {
      const t = i / M * 2 * PI; let f = 1 + ell * Math.cos(2 * (t - rot));
      for (const h of harm) f += h.a * Math.cos(h.k * t + h.ph);
      f += wavA * Math.sin(wavK * t + wph) + (fbm(Math.cos(t) * 2 + 5, Math.sin(t) * 2 + 5, d.sn, 3) - 0.5) * lerp(0.05, 0.22, bad);
      pts.push([CX + Math.cos(t) * R0 * f, CY + Math.sin(t) * R0 * f]);
    }
    const isl = [];
    for (const e of d.isl) {
      const rad = lerp(34, 70, clamp(e.m / 2.5)) * lerp(0.85, 1.15, d.q);
      for (let tries = 0; tries < 60; tries++) {
        const a = r() * 2 * PI, s = Math.sqrt(r()) * 0.5 * R0, x = CX + Math.cos(a) * s, y = CY + Math.sin(a) * s;
        if (isl.every((o) => Math.hypot(o.x - x, o.y - y) > o.rad + rad + 30)) { isl.push({ x, y, rad, ph: r() * 2 * PI, a2: lerp(0.05, 0.18, r()), a3: lerp(0.02, 0.1, r()) }); break; }
      }
    }
    return { pts, isl };
  }

  function rasterize(paths) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff';
    for (const pts of paths) { x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); }
    const id = x.getImageData(0, 0, W, H).data, m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = id[i * 4] > 127 ? 1 : 0; return m;
  }
  function chamfer(mask, target) {
    const D = new Float32Array(N), INF = 1e9;
    for (let i = 0; i < N; i++) D[i] = mask[i] === target ? 0 : INF;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; let v = D[i]; if (!v) continue;
      if (x > 0) v = Math.min(v, D[i - 1] + 3); if (y > 0) { v = Math.min(v, D[i - W] + 3); if (x > 0) v = Math.min(v, D[i - W - 1] + 4); if (x < W - 1) v = Math.min(v, D[i - W + 1] + 4); } D[i] = v; }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; let v = D[i]; if (!v) continue;
      if (x < W - 1) v = Math.min(v, D[i + 1] + 3); if (y < H - 1) { v = Math.min(v, D[i + W] + 3); if (x < W - 1) v = Math.min(v, D[i + W + 1] + 4); if (x > 0) v = Math.min(v, D[i + W - 1] + 4); } D[i] = v; }
    for (let i = 0; i < N; i++) D[i] /= 3; return D;
  }
  // The day's clock on the edge: twenty-four equal hours by length, from 04:00
  // at the top of the cell, clockwise.
  function edgeTimes(pts) {
    const M = pts.length; let top = 0, best = 1e9;
    for (let k = 0; k < M; k++) { const a = Math.atan2(pts[k][1] - CY, pts[k][0] - CX), d = Math.abs(Math.atan2(Math.sin(a + PI / 2), Math.cos(a + PI / 2))); if (d < best) { best = d; top = k; } }
    const cum = new Float64Array(M + 1); for (let k = 0; k < M; k++) { const p = pts[(top + k) % M], q = pts[(top + k + 1) % M]; cum[k + 1] = cum[k] + Math.hypot(q[0] - p[0], q[1] - p[1]); }
    const T = new Float32Array(M); for (let k = 0; k < M; k++) T[(top + k) % M] = cum[k] / cum[M];
    return T;
  }
  function labelOutside(cell, pts, T) {      // every point outside takes the hour of the nearest point of the edge
    const L = new Float32Array(N).fill(-1), D = new Float32Array(N).fill(1e9);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!cell[i]) continue;
      if (cell[i - 1] && cell[i + 1] && cell[i - W] && cell[i + W]) continue;
      let bk = 0, bd = 1e18; for (let k = 0; k < pts.length; k++) { const dx = pts[k][0] - x, dy = pts[k][1] - y, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; bk = k; } }
      L[i] = T[bk]; D[i] = 0; }
    const step = (i, j, c) => { if (D[j] + c < D[i]) { D[i] = D[j] + c; L[i] = L[j]; } };
    for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (cell[i] && D[i] > 0) continue; step(i, i - 1, 3); step(i, i - W, 3); step(i, i - W - 1, 4); step(i, i - W + 1, 4); }
    for (let y = H - 2; y >= 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; if (cell[i] && D[i] > 0) continue; step(i, i + 1, 3); step(i, i + W, 3); step(i, i + W + 1, 4); step(i, i + W - 1, 4); }
    return L;
  }
  function islandPoly(o) { const pts = []; for (let i = 0; i < 240; i++) { const t = i / 240 * 2 * PI;
    const f = 1 + o.a2 * Math.cos(2 * t + o.ph) + o.a3 * Math.cos(3 * t + o.ph * 1.7) + 0.03 * Math.sin(17 * t + o.ph);
    pts.push([o.x + Math.cos(t) * o.rad * f, o.y + Math.sin(t) * o.rad * f]); } return pts; }

  function build(d) {
    const s = cellShape(d), seed = strHash('noise|' + d.seed) % 100000;
    const cell = rasterize([s.pts]), isl = rasterize(s.isl.map(islandPoly));
    const out = chamfer(cell, 1), inn = chamfer(cell, 0), iOut = chamfer(isl, 1), iIn = chamfer(isl, 0);
    const LO = new Float32Array(N), MI = new Float32Array(N), HS = new Float32Array(N);
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) { LO[i] = fbm(x / 90, y / 90, seed); MI[i] = vnoise(x / 4.5, y / 4.5, seed + 77); HS[i] = h2(x, y, seed); }
    let maxInn = 1; for (let i = 0; i < N; i++) if (inn[i] > maxInn) maxInn = inn[i];
    const TL = labelOutside(cell, s.pts, edgeTimes(s.pts));
    return { d, s, cell, isl, out, inn, iOut, iIn, LO, MI, HS, maxInn, TL, hasIsl: s.isl.length > 0 };
  }

  // ── the ring around: the hour of the day along the edge ──────────────────
  const BINS = 720, SLOTS = 288;
  function haloClock(d) {
    const c = d.cls, seed = d.sn, cnt = new Float32Array(BINS), band = new Float32Array(BINS), rag = new Float32Array(BINS);
    const at = (j) => { j = ((j % SLOTS) + SLOTS) % SLOTS; return j < c.length ? +c[j] : 1; };   // the unrecorded tail of a day is rest
    for (let b = 0; b < BINS; b++) {
      const t = b / BINS; let sum = 0, k = 0, flips = 0, zero = 0, prev = null;
      for (let j = -9; j <= 9; j++) { const v = at(Math.floor(t * SLOTS) + j); if (v === 0) zero++; else { sum += v; k++; } if (prev !== null && v !== prev) flips++; prev = v; }
      const a = k ? clamp((sum / k - 1.5) / 3) : 0.35, wob = fbm(Math.cos(t * 2 * PI) * 1.5 + 3, Math.sin(t * 2 * PI) * 1.5 + 3, seed, 3);
      const off = clamp((zero - 6) / 13);
      cnt[b] = lerp(2.7, 6.4, a) * lerp(0.8, 1.2, wob) * (1 - 0.55 * off) * lerp(0.88, 1.12, d.dayq);
      band[b] = lerp(11, 21, a) * lerp(0.75, 1.3, fbm(Math.cos(t * 2 * PI) * 4 + 9, Math.sin(t * 2 * PI) * 4 + 9, seed + 3, 2)) * lerp(0.88, 1.12, d.night);
      rag[b] = lerp(0.35, 1.25, clamp(flips / 9)) + off * 0.6;
    }
    const sm = (A) => { const B = new Float32Array(BINS); for (let b = 0; b < BINS; b++) { let t = 0; for (let j = -12; j <= 12; j++) t += A[(b + j + BINS) % BINS]; B[b] = t / 25; } return B; };
    return { cnt: sm(cnt), band: sm(band), rag: sm(rag) };
  }
  function ringV(dist, band, lo, mi, hs, count, rag) {
    const v = dist / band + ((lo - 0.5) * 0.9 + (mi - 0.5) * 0.55 + (hs - 0.5) * 0.25) * rag;
    if (v < 0 || v >= count) return null; const k = Math.floor(v), t = v - k; return { k, t, fade: k / count };
  }
  const ring = (dist, band, lo, mi, hs, count) => ringV(dist, band, lo, mi, hs, count, 1);
  function ringCol(r, lo, hs) {
    if (r.t > 0.84) return mix(pick(P.ink, lo, hs), pick(P.deep, lo, hs), 0.25 + r.fade * 0.5);
    return mix(mix(pick(P.pale, lo, hs), pick(P.paper, lo, hs), 0.25 + r.fade * 0.6), pick(P.light, lo, hs), Math.pow(1 - r.t / 0.84, 1.6) * (0.85 - r.fade * 0.4));
  }
  function paper(lo, hs) { const p = pick(P.paper, lo, hs), g = (hs - 0.5) * 9; return [p[0] + g, p[1] + g, p[2] + g]; }

  // ── the fill: a melange of fibres in which the night is read ─────────────
  function phaseAt(d, t) { const c = d.ph; if (!c) return 2; return +c[Math.min(c.length - 1, Math.floor(t * c.length))] || 2; }
  const TONE = [0, -0.12, 0, 0.08, 0.22];              // 1 deep, 2 light, 3 dream, 4 awake
  function fillLayer(f) {
    const d = f.d, p = d.p, r = prng('fill|' + d.seed);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.beginPath(); f.s.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath();
    x.fillStyle = 'rgb(12,36,132)'; x.fill(); x.save(); x.clip(); x.lineCap = 'round';
    const comb = lerp(2.6, 0.35, 0.6 * p.hrv + 0.4 * (1 - p.rhr));
    const len = lerp(5, 20, 0.6 * p.tst + 0.4 * (1 - p.rest));
    const n = Math.round(lerp(5000, 14000, 0.5 * p.steps + 0.5 * p.active));
    const flow = (X, Y) => fbm(X / 160, Y / 160, d.sn + 5, 2) * comb * 2 * PI + fbm(X / 40, Y / 40, d.sn + 9, 2) * comb * 0.8;
    for (let k = 0; k < 70000; k++) {
      let X = CX + (r() - 0.5) * W * 0.9, Y = CY + (r() - 0.5) * H * 0.7; if (!f.cell[(Y | 0) * W + (X | 0)]) continue;
      const col = UNDER[Math.floor(r() * UNDER.length)];
      x.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`; x.globalAlpha = lerp(0.35, 0.9, r()); x.lineWidth = lerp(1, 2.6, r());
      x.beginPath(); x.moveTo(X, Y);
      for (let s2 = 0; s2 < 3; s2++) { const th = flow(X, Y) + gauss(r) * 0.2; X += Math.cos(th) * len / 4; Y += Math.sin(th) * len / 4; x.lineTo(X, Y); }
      x.stroke();
    }
    for (let k = 0; k < n; k++) {
      let X = CX + (r() - 0.5) * W * 0.9, Y = CY + (r() - 0.5) * H * 0.7; if (!f.cell[(Y | 0) * W + (X | 0)]) continue;
      const a = phaseAt(d, clamp(f.inn[(Y | 0) * W + (X | 0)] / f.maxInn));
      const light = a === 4 ? 0.35 : a === 3 ? 0.15 : 0.04;
      const col = r() < light ? P.light[Math.floor(r() * 4)] : FIB[Math.floor(r() * FIB.length)];
      x.strokeStyle = `rgb(${col[0]},${col[1]},${col[2]})`; x.globalAlpha = lerp(0.15, 0.55, r()); x.lineWidth = lerp(0.4, 1.2, r());
      x.beginPath(); x.moveTo(X, Y);
      for (let s2 = 0; s2 < 4; s2++) { const th = flow(X, Y) + gauss(r) * 0.15; X += Math.cos(th) * len / 4; Y += Math.sin(th) * len / 4; x.lineTo(X, Y); }
      x.stroke();
    }
    const nv = Math.round(lerp(4, 90, clamp(0.6 * p.rest + 0.4 * (1 - p.tst))));
    for (let k = 0; k < nv; k++) {
      const X = CX + (r() - 0.5) * W * 0.8, Y = CY + (r() - 0.5) * H * 0.6; if (!f.cell[(Y | 0) * W + (X | 0)] || f.inn[(Y | 0) * W + (X | 0)] < 14) continue;
      const R = lerp(1.5, 5.5, Math.pow(r(), 2));
      x.globalAlpha = 0.55; x.fillStyle = 'rgb(150,166,200)'; x.beginPath(); x.arc(X, Y, R, 0, 2 * PI); x.fill();
      x.globalAlpha = 0.8; x.strokeStyle = 'rgb(6,21,131)'; x.lineWidth = 0.8; x.beginPath(); x.arc(X, Y, R + 1.2, 0, 2 * PI); x.stroke();
    }
    x.restore(); x.globalAlpha = 1;
    return x.getImageData(0, 0, W, H).data;
  }

  function render(f) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
    const FL = fillLayer(f), d = f.d, HC = haloClock(d), weight = lerp(0.75, 1.25, d.p.tst);
    const img = ctx.createImageData(W, H), D = img.data;
    for (let i = 0; i < N; i++) {
      const lo = f.LO[i], mi = f.MI[i], hs = f.HS[i]; let col;
      if (f.cell[i]) {
        if (f.isl[i]) { const r = ring(f.iIn[i], 13, lo, mi, hs, 6); col = r ? ringCol({ k: r.k, t: 1 - r.t, fade: r.fade }, lo, hs) : paper(lo, hs); }
        else {
          const r = ring(f.iOut[i], 12, lo, mi, hs, 3);
          if (r && f.hasIsl && r.t > 0.8) col = mix(pick(P.ink, lo, hs), pick(P.deep, lo, hs), 0.5);
          else {
            col = [FL[i * 4], FL[i * 4 + 1], FL[i * 4 + 2]];
            const t = clamp((f.inn[i] + (lo - 0.5) * 26 + (mi - 0.5) * 6) / f.maxInn), tone = (TONE[phaseAt(d, t)] || 0) * weight;
            col = tone > 0 ? mix(col, P.light[1], tone) : mix(col, P.ink[0], -tone * 2.5);
            col = mix(col, P.mid[1], clamp((lo - 0.6) * 3) * 0.10);
            if (f.inn[i] < 3 + (mi - 0.5) * 3) col = mix(col, P.ink[0], 0.6);
            const g = (hs - 0.5) * 14; col = [col[0] + g, col[1] + g, col[2] + g];
          }
        }
      } else {
        const b = Math.min(BINS - 1, Math.max(0, Math.floor((f.TL[i] < 0 ? 0 : f.TL[i]) * BINS)));
        const r = ringV(f.out[i], HC.band[b], lo, mi, hs, HC.cnt[b], HC.rag[b]); col = r ? ringCol(r, lo, hs) : paper(lo, hs);
      }
      D[i * 4] = col[0]; D[i * 4 + 1] = col[1]; D[i * 4 + 2] = col[2]; D[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function paintDay(p, day, DATA, w, h) {
    const sheet = render(build(read(day)));
    w = Math.round(w || W); h = Math.round(h || H);
    if (w === W && h === H) return sheet;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const oc = out.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(sheet, 0, 0, w, h);
    return out;
  }

  window.S607Painter = { paintDay };
})();
