/* S6-05 — one day of the ground a body crossed, written by a pen in red ink
 * into cloth.
 * ─────────────────────────────────────────────────────────────────────────────
 * It reads the record S6-03 reads, in the same public form: metres around a
 * point with the circle of the house removed, the heart as a share of the
 * day's own range, the night as a turn in degrees. S6-03 lays every day on one
 * sheet; S6-05 writes one day alone.
 *
 * THE HAND. The pen does not trace the way, it writes it: flat loops across the
 * sheet. The load of the hand at a place is the day's slowness woven with the
 * heart, each against the day's own range; a loaded hand makes wide, crowded
 * loops, a light one stretches them. Between outings the pen swings across dry.
 *
 * THE INK. Wherever the body stood twenty seconds or more, the hand rests and
 * writes a small knot; the longer the stand, the more ink. The cloth under the
 * sheet holds only so much in each place and passes the rest to its
 * neighbours, more along its threads than across them. The colour runs from
 * vermilion to carmine with the hour the body moved and the height it climbed.
 *
 * The sheet is turned by the body's nights, as in S6-03. Every random number
 * grows from the date: the same day always makes the same painting.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const W = 920, H = 1350;
  const RULE = {
    margin: 0.14,
    minSpan: 200,
    ground: [238, 233, 221],        // #eee9dd, the ground of the other works
    inkVermilion: [208, 80, 50],    // a light, open red
    inkCarmine: [172, 38, 40],      // a deep, blooded red
    nib: 1.9,                       // px: radius of the pen's contact
    loopR: [22, 120],                 // px: the hand's loop, from a quick light hand to a slow loaded one
    loopPitch: [80, 300],            // px of way per loop: slow → loops pile up, fast → they stretch out
    loopFlat: 0.34,                 // the loops are written across the sheet: flat ellipses
    lineInk: 1.25,                  // ink laid per px of way at the day's fastest
    slowInk: 2.6,                   // extra ink per px of way at the day's slowest
    poolAfter: 20,                  // s: a pause longer than this leaves a knot
    poolInk: 95,                    // ink of a drop per sqrt(second) of standing
    poolMax: 1500,                  // ink: largest drop
    spreadIters: 140,
    hold: 0.55,                     // how much ink the cloth holds before it lets it run
    water: 1.6,                     // water carried per unit of pigment
    waterIters: 25,
  };

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function prng(seedStr) {
    let h = 2166136261; for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // value noise on an integer lattice, hashed — deterministic, seedable
  function hash2(x, y, s) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) { let f = 0, amp = 0.5, fr = 1; for (let o = 0; o < oct; o++) { f += amp * vnoise(x * fr, y * fr, s + o * 17); amp *= 0.5; fr *= 2; } return f; }

  // ── THE CLOTH ──────────────────────────────────────────────────────────────
  // Linen: a plain weave of uneven flax. Weft rows ~3 px apart, warp columns a
  // little finer and weaker; every thread swells and thins along its length (slubs).
  // Returns tone (light the cloth reflects) and absorb (how much ink a cell holds,
  // and how hard it pulls ink from its neighbours).
  let CLOTH = null;
  function cloth() {
    if (CLOTH) return CLOTH;
    const N = W * H, tone = new Float32Array(N), absorb = new Float32Array(N), permH = new Float32Array(N), permV = new Float32Array(N);
    const r = prng('linen');
    // thread positions with jitter
    const rows = [], cols = [];
    for (let y = -2; y < H + 4;) { rows.push({ y, w: 1.0 + r() * 0.9, s: (r() * 1e6) | 0, dark: r() < 0.08 ? 0.5 + r() * 0.5 : 0 }); y += 2.6 + r() * 1.3; }
    for (let x = -2; x < W + 4;) { cols.push({ x, w: 0.9 + r() * 0.7, s: (r() * 1e6) | 0 }); x += 2.3 + r() * 1.0; }
    const rowAt = new Int32Array(H + 4), colAt = new Int32Array(W + 4);
    { let k = 0; for (let y = 0; y < H; y++) { while (k < rows.length - 2 && rows[k + 1].y <= y) k++; rowAt[y] = k; } }
    { let k = 0; for (let x = 0; x < W; x++) { while (k < cols.length - 2 && cols[k + 1].x <= x) k++; colAt[x] = k; } }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        // nearest weft thread and how far we are from its centre
        const R0 = rows[rowAt[y]], R1 = rows[rowAt[y] + 1];
        const R = (y - R0.y) < (R1.y - y) ? R0 : R1;
        const slubR = 0.6 + 0.8 * vnoise(x / 38, R.s, 3);           // thread thickness along its run
        const dR = Math.abs(y - R.y) / (R.w * slubR + 0.3);
        const weft = Math.exp(-dR * dR * 1.4);
        const C0 = cols[colAt[x]], C1 = cols[colAt[x] + 1];
        const C = (x - C0.x) < (C1.x - x) ? C0 : C1;
        const slubC = 0.6 + 0.8 * vnoise(y / 44, C.s, 5);
        const dC = Math.abs(x - C.x) / (C.w * slubC + 0.3);
        const warp = Math.exp(-dC * dC * 1.4);
        // the weft dominates the face of linen: fine ribs across, the warp only a whisper
        const top = 0.78 * weft + 0.22 * warp * (0.6 + 0.4 * weft);
        const cloud = fbm(x / 160, y / 160, 11, 4);                  // the cloth's uneven body
        const mott = fbm(x / 22, y / 9, 13, 3);                      // flax mottle, drawn out along the weft
        const fine = hash2(x, y, 7);
        let t = 0.885 + 0.085 * top + 0.06 * (cloud - 0.5) + 0.05 * (mott - 0.5) + 0.03 * (fine - 0.5);
        if (R.dark && weft > 0.5) t -= 0.06 * R.dark * vnoise(x / 20, R.s, 9);   // a darker flax thread
        tone[i] = t;
        // how much a cell holds: the thread and the fibre's own knots at the scale of a few threads —
        // this is what makes a drop's rim lobed instead of round
        const knot = fbm(x / 7, y / 5, 29, 3);
        const grit = fbm(x / 2.5, y / 2.5, 31, 2);                    // fine bumps on the rim of a drop
        absorb[i] = clamp(0.35 + 0.5 * top + 0.9 * (knot - 0.5) * 1.6 + 0.3 * (cloud - 0.5) + 0.25 * (fine - 0.5) + 0.7 * (grit - 0.5) + 0.25, 0.1, 1.7);
        // ink travels along the threads: along a weft row it runs easily, across rows less so
        // single fibres stray from the weave: ink and water race along them and leave feathers
        const fh = fbm(x / 1.4, y / 16, 51, 2), fv = fbm(x / 16, y / 1.4, 53, 2);
        permH[i] = 0.35 + 0.6 * weft + 2.2 * Math.pow(smooth(0.5, 0.85, fh), 2);
        permV[i] = 0.25 + 0.4 * warp + 1.8 * Math.pow(smooth(0.52, 0.85, fv), 2);
      }
    }
    // flax shives: short dark specks in the cloth
    for (let k = 0; k < 900; k++) {
      const x = r() * W, y = r() * H, l = 2 + r() * 7, a = (r() < 0.75 ? 0 : Math.PI / 2) + (r() - 0.5) * 0.2, d = 0.05 + r() * 0.1;
      for (let s = 0; s < l; s++) { const px = Math.round(x + Math.cos(a) * s), py = Math.round(y + Math.sin(a) * s); if (px >= 0 && py >= 0 && px < W && py < H) tone[py * W + px] -= d; }
    }
    CLOTH = { tone, absorb, permH, permV };
    return CLOTH;
  }

  // ── THE WAY ────────────────────────────────────────────────────────────────
  function ride(pts, step) {
    const out = [];
    if (pts.length < 2) { for (const p of pts) out.push(p); return out; }
    const at = i => pts[clamp(i, 0, pts.length - 1)];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      const n = Math.max(1, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        const lerp = (u, w) => u == null || w == null ? (u ?? w) : u + (w - u) * t;
        out.push({ x: cr(p0.x, p1.x, p2.x, p3.x), y: cr(p0.y, p1.y, p2.y, p3.y), v: lerp(p1.v, p2.v), hr: lerp(p1.hr, p2.hr), t: lerp(p1.t, p2.t), seg: i });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function paintSheet(day, opts) {
    opts = opts || {};
    const rnd = prng('ink:' + day.d);
    const { tone, absorb, permH, permV } = cloth();
    const N = W * H;
    const ink = new Float32Array(N);
    const st = day.stats;

    // where the sheet stands: turned by the nights, as in S6-03
    const ang = (opts.turn || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    const rot = (x, y) => [x * ca - y * sa, x * sa + y * ca];
    const all = day.segs.flat();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of all) { const [x, y] = rot(p[0], p[1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const spanX = Math.max(RULE.minSpan, x1 - x0), spanY = Math.max(RULE.minSpan, y1 - y0);
    const mg = Math.min(W, H) * RULE.margin;
    const mPerPx = Math.max(spanX / (W - 2 * mg), spanY / (H - 2 * mg));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const proj = (px, py) => { const [x, y] = rot(px, py); return [W / 2 + (x - cx) / mPerPx, H / 2 + (y - cy) / mPerPx]; };

    // the day's own range of speed: slowness is weighed against the day itself
    const vs = all.map(p => p[3]).filter(v => v > 0).sort((a, b) => a - b);
    const q = f => vs.length ? vs[Math.min(vs.length - 1, Math.floor(f * vs.length))] : 1;
    const vLo = q(0.1), vHi = Math.max(q(0.9), vLo + 0.05);
    // slowness woven with the heart, so the ink cannot be read back into either
    const load = (v, hr) => {
      const slow = 1 - clamp((v - vLo) / (vHi - vLo), 0, 1);
      const h = hr == null || !day.heart ? slow : clamp(hr, 0, 1);
      return 0.55 * slow + 0.45 * h;
    };

    // deposit: a small disc of ink at the nib
    const dab = (x, y, amt, rad) => {
      const r = Math.ceil(rad + 1), xi = Math.round(x), yi = Math.round(y);
      let wsum = 0; const cells = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(xi + dx - x, yi + dy - y); if (d > rad + 0.5) continue;
        const px = xi + dx, py = yi + dy; if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
        const w = clamp(rad + 0.5 - d, 0, 1); cells.push(py * W + px, w); wsum += w;
      }
      if (!wsum) return;
      for (let k = 0; k < cells.length; k += 2) ink[cells[k]] += amt * cells[k + 1] / wsum;
    };

    // the hand rests and writes a small knot in place: two to four tight turns,
    // so loaded that the turns run into one another and the cloth fuses them
    const knot = (x0, y0, vol, key) => {
      const rg = 5 + Math.sqrt(vol) * 0.33, turns = 2 + Math.floor(rnd() * 3);
      const dir = (lastDir ? Math.atan2(lastDir[1], lastDir[0]) : 0) + (rnd() - 0.5) * 1.2, run = rg * (1.5 + rnd() * 3);
      const steps = Math.ceil(turns * 2 * Math.PI * rg);
      for (let k = 0; k <= steps; k++) {
        const u = k / steps, ph = u * turns * 2 * Math.PI;
        const rr = rg * (0.35 + 0.95 * vnoise(u * 13, 8, key + segSeed * 97));
        dab(x0 + Math.cos(dir) * run * (u - 0.5) + Math.cos(ph) * rr, y0 + Math.sin(dir) * run * (u - 0.5) + Math.sin(ph) * rr * 0.75, vol / (steps + 1), 1.4);
      }
    };
    let lastDir = null, segPx = 0, prev = null, phase = rnd() * 6.283, lastPen = null, segSeed = 0;
    const flecks = [];
    // the hand's slant: the loops lean as a hand leans, a few degrees from level
    const hand = rnd() < 0.5 ? -1 : 1;
    const tilt = (rnd() - 0.5) * 0.35, tc = Math.cos(tilt), ts = Math.sin(tilt);
    for (const seg of day.segs) {
      segSeed++;
      const pts = seg.map(p => { const [x, y] = proj(p[0], p[1]); return { x, y, t: p[2], v: p[3], hr: p[5] == null ? null : p[5] }; });
      if (!pts.length) continue;
      // the pen is not lifted between outings: it flicks across, fast and dry
      if (prev) {
        const a = lastPen ? { x: lastPen[0], y: lastPen[1] } : prev, b = pts[0], L = Math.hypot(b.x - a.x, b.y - a.y);
        // one swing of the hand: it leaves the way the pen was going and curves round
        // to where it must land, always bending the same way, as a hand does
        const dx = (b.x - a.x) / (L || 1), dy = (b.y - a.y) / (L || 1);
        const hx = lastDir ? lastDir[0] : dx, hy = lastDir ? lastDir[1] : dy;
        const c1x = a.x + hx * L * 0.45 - dy * L * 0.25 * hand, c1y = a.y + hy * L * 0.45 + dx * L * 0.25 * hand;
        const c2x = b.x - dx * L * 0.35 - dy * L * 0.35 * hand, c2y = b.y - dy * L * 0.35 + dx * L * 0.35 * hand;
        const n = Math.max(2, Math.ceil(L * 1.6));
        for (let k = 0; k <= n; k++) {
          const u = k / n, m = 1 - u;
          const x = m * m * m * a.x + 3 * m * m * u * c1x + 3 * m * u * u * c2x + u * u * u * b.x;
          const y = m * m * m * a.y + 3 * m * m * u * c1y + 3 * m * u * u * c2y + u * u * u * b.y;
          // fast and dry: the ink thins in the middle of the swing and breaks where it runs out
          const dry = 0.3 + 0.7 * Math.pow(Math.abs(Math.cos(u * Math.PI)), 0.6) * (0.5 + 0.5 * vnoise(k / 40, 3, segSeed));
          dab(x, y, RULE.lineInk * 0.5 * dry * L * 1.25 / n, 0.8);
        }
        // a drop flung from the nib at the turn
        if (rnd() < 0.45) flecks.push([b.x + (rnd() - 0.5) * 60, b.y + (rnd() - 0.5) * 60, 8 + rnd() * 50]);
      }
      // the hand does not feel every jolt of the sky: the way is softened over ~18 px
      { const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
        // a fast hand smooths more: at speed it swings over whole blocks, slow it follows the way
        const sm = pts.map((p, k) => { let sx = 0, sy = 0, sw = 0;
          const sg = 22 + 75 * (1 - load(p.v, p.hr)), cut = sg * 2.5;
          for (let j = k; j >= 0 && cum[k] - cum[j] < cut; j--) { const w = Math.exp(-((cum[k] - cum[j]) ** 2) / (2 * sg * sg)); sx += pts[j].x * w; sy += pts[j].y * w; sw += w; }
          for (let j = k + 1; j < pts.length && cum[j] - cum[k] < cut; j++) { const w = Math.exp(-((cum[j] - cum[k]) ** 2) / (2 * sg * sg)); sx += pts[j].x * w; sy += pts[j].y * w; sw += w; }
          return [sx / sw, sy / sw]; });
        sm.forEach((q, k) => { pts[k].x = q[0]; pts[k].y = q[1]; });
        segPx = cum[cum.length - 1]; }
      const road = ride(pts, 1);
      // a short outing is a small knot; only a long way has room for wide loops
      const Rcap = 4 + segPx * 0.22;
      // THE HAND. The pen does not follow the way like a plotter: it writes it, in
      // flat loops across the sheet. A slow, effortful stretch loads the hand and
      // its loops swell and crowd; a fast light one stretches them into a run.
      // where the body stood, the hand will rest: the moments are collected first and
      // written where the pen happens to be at that moment, not on the way's centre
      const stops = [];
      for (let k = 1; k < pts.length; k++) {
        const dt = pts[k].t - pts[k - 1].t;
        if (dt < RULE.poolAfter) continue;
        const l = load(pts[k].v, pts[k].hr);
        stops.push({ t: pts[k].t, vol: Math.min(RULE.poolMax, RULE.poolInk * Math.sqrt(dt - RULE.poolAfter + 30) * (0.5 + 0.8 * l)), key: k });
      }
      let si = 0;
      // the hand's load changes as a hand's does, not from one fix of the sky to the next
      const lr = road.map(q => load(q.v, q.hr));
      for (let i = 1; i < lr.length; i++) lr[i] = lr[i - 1] + (lr[i] - lr[i - 1]) * 0.025;
      for (let i = lr.length - 2; i >= 0; i--) lr[i] = lr[i] + (lr[i + 1] - lr[i]) * 0.025;
      let pen = null;
      for (let i = 1; i < road.length; i++) {
        const a = road[i - 1], b = road[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const l = lr[i];
        const R = Math.min(Rcap, (RULE.loopR[0] + (RULE.loopR[1] - RULE.loopR[0]) * l) * (0.45 + 0.9 * vnoise(i / 140, 5, segSeed)));
        const pitch = Math.max(R * 0.9, (RULE.loopPitch[1] - (RULE.loopPitch[1] - RULE.loopPitch[0]) * l) * Math.min(1, Rcap / 70));
        phase += 2 * Math.PI * len / pitch * (0.35 + 1.3 * vnoise(i / 70, 6, segSeed));
        const ox = Math.cos(phase) * R, oy = Math.sin(phase) * R * RULE.loopFlat;
        const px = b.x + ox * tc - oy * ts, py = b.y + ox * ts + oy * tc;
        while (si < stops.length && b.t != null && b.t >= stops[si].t) { knot(px, py, stops[si].vol, stops[si].key); si++; }
        if (!pen) { pen = [px, py]; continue; }
        const d = Math.hypot(px - pen[0], py - pen[1]);
        // the pen is slowest at the ends of a loop: the ink beads there
        const bead = 1 + (0.4 + 3.2 * l * l) * Math.pow(1 - clamp(d / (len * (1 + 2 * Math.PI * R / pitch)), 0, 1), 4);
        const flood = 1 + 1.6 * (1 - Math.min(1, Rcap / 45));   // a small knot is written slowly: it floods
        const per = (RULE.lineInk + RULE.slowInk * Math.pow(l, 2.2)) * bead * flood;
        const n = Math.max(1, Math.ceil(d));
        for (let k = 1; k <= n; k++) {
          const u = k / n;
          dab(pen[0] + (px - pen[0]) * u, pen[1] + (py - pen[1]) * u, per * d / n, RULE.nib * (0.8 + 0.35 * l));
        }
        if (d > 0.3) lastDir = [(px - pen[0]) / d, (py - pen[1]) / d];
        pen = [px, py];
      }
      while (si < stops.length && pen) { knot(pen[0], pen[1], stops[si].vol, stops[si].key); si++; }
      if (pen) lastPen = pen;
      prev = pts[pts.length - 1];
    }
    for (const [x, y, v] of flecks) dab(x, y, v, 1.5);

    // ── THE CLOTH DRINKS ─────────────────────────────────────────────────────
    // Each cell holds as much ink as its fibre can; the rest runs to its
    // neighbours, more along the threads than across them, more into thirsty
    // fibre than into tight. Noise in the fibre makes the front lobed.
    const cap = new Float32Array(N);
    for (let i = 0; i < N; i++) cap[i] = absorb[i] * RULE.hold;
    const flow = new Float32Array(N);
    let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
    for (let i = 0; i < N; i++) if (ink[i] > 0) { const x = i % W, y = (i / W) | 0; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    for (let it = 0; it < RULE.spreadIters; it++) {
      bx0 = Math.max(1, bx0 - 1); by0 = Math.max(1, by0 - 1); bx1 = Math.min(W - 2, bx1 + 1); by1 = Math.min(H - 2, by1 + 1);
      let moved = 0;
      for (let y = by0; y <= by1; y++) {
        let i = y * W + bx0;
        for (let x = bx0; x <= bx1; x++, i++) {
          const e = ink[i] - cap[i];
          if (e <= 0.001) continue;
          const wl = permH[i] * absorb[i - 1], wr = permH[i] * absorb[i + 1], wu = permV[i] * absorb[i - W], wd = permV[i] * absorb[i + W];
          // the thirstier the neighbour already is (less ink), the more it pulls
          const fl = wl * Math.max(0, 1 - ink[i - 1] / (cap[i - 1] * 1.6)), fr = wr * Math.max(0, 1 - ink[i + 1] / (cap[i + 1] * 1.6));
          const fu = wu * Math.max(0, 1 - ink[i - W] / (cap[i - W] * 1.6)), fd = wd * Math.max(0, 1 - ink[i + W] / (cap[i + W] * 1.6));
          const s = fl + fr + fu + fd;
          const out = e * 0.6;
          if (s < 1e-4) { // surrounded by wet cloth: push evenly
            const o4 = out * 0.25; flow[i] -= out; flow[i - 1] += o4; flow[i + 1] += o4; flow[i - W] += o4; flow[i + W] += o4;
          } else {
            flow[i] -= out; flow[i - 1] += out * fl / s; flow[i + 1] += out * fr / s; flow[i - W] += out * fu / s; flow[i + W] += out * fd / s;
          }
          moved += out;
        }
      }
      for (let y = by0; y <= by1; y++) { let i = y * W + bx0; for (let x = bx0; x <= bx1; x++, i++) if (flow[i] !== 0) { ink[i] += flow[i]; flow[i] = 0; } }
      if (moved < 0.5) break;
    }

    // ── THE WATER RUNS ON ────────────────────────────────────────────────────
    // Ink is pigment in water. The pigment stops where the fibre filters it out;
    // the water runs on along the fibres, carrying a little colour with it, and
    // where it stops drying it leaves that colour at its edge — the tide line.
    const wet = new Float32Array(N);
    for (let i = 0; i < N; i++) wet[i] = ink[i] * RULE.water;
    for (let it = 0; it < RULE.waterIters; it++) {
      bx0 = Math.max(1, bx0 - 1); by0 = Math.max(1, by0 - 1); bx1 = Math.min(W - 2, bx1 + 1); by1 = Math.min(H - 2, by1 + 1);
      let moved = 0;
      for (let y = by0; y <= by1; y++) {
        let i = y * W + bx0;
        for (let x = bx0; x <= bx1; x++, i++) {
          const c = cap[i] * 0.3, e = wet[i] - c;
          if (e <= 0.001) continue;
          const fl = permH[i] * Math.max(0, 1 - wet[i - 1] / c), fr = permH[i] * Math.max(0, 1 - wet[i + 1] / c);
          const fu = permV[i] * Math.max(0, 1 - wet[i - W] / c), fd = permV[i] * Math.max(0, 1 - wet[i + W] / c);
          const ss = fl + fr + fu + fd;
          if (ss < 1e-4) continue;
          const o = e * 0.5;
          flow[i] -= o; flow[i - 1] += o * fl / ss; flow[i + 1] += o * fr / ss; flow[i - W] += o * fu / ss; flow[i + W] += o * fd / ss;
          moved += o;
        }
      }
      for (let y = by0; y <= by1; y++) { let i = y * W + bx0; for (let x = bx0; x <= bx1; x++, i++) if (flow[i] !== 0) { wet[i] += flow[i]; flow[i] = 0; } }
      if (moved < 0.5) break;
    }

    // ── THE SHEET ────────────────────────────────────────────────────────────
    // colour of the day's ink: the hour the body moved and how hard its heart worked
    const warm = clamp(0.5 - 0.5 * Math.cos((st.hourMean - 3) / 24 * 2 * Math.PI), 0, 1);
    const blood = clamp(0.5 * (st.altGain / 200) + 0.5 * (1 - warm), 0, 1);
    const inkC = RULE.inkVermilion.map((c, k) => c + (RULE.inkCarmine[k] - c) * blood);

    const out = opts.canvas || document.createElement('canvas');
    out.width = W; out.height = H;
    const g = out.getContext('2d');
    // the ground of the other works: #eee9dd with the same fixed paper grain and fibres
    g.fillStyle = `rgb(${RULE.ground})`; g.fillRect(0, 0, W, H);
    { const r = prng('sheet');
      for (let k = 0; k < 60000; k++) { const x = r() * W, y = r() * H, sz = 0.4 + r() * 1.3, a = 0.02 + r() * 0.07;
        g.fillStyle = r() < 0.25 ? `rgba(120,110,90,${a})` : `rgba(60,45,20,${a})`; g.fillRect(x, y, sz, sz); }
      for (let k = 0; k < 260; k++) { const x = r() * W, y = r() * H, l = 4 + r() * 26, a = r() * Math.PI;
        g.strokeStyle = `rgba(90,75,50,${0.03 + r() * 0.05})`; g.lineWidth = 0.5 + r() * 0.6;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } }
    const img = g.getImageData(0, 0, W, H), D = img.data;
    for (let i = 0; i < N; i++) {
      const v = ink[i], w = wet[i];
      if (v < 0.01 && w < 0.01) continue;
      let r = D[i * 4], gg = D[i * 4 + 1], b = D[i * 4 + 2];
      const x = i % W, y = (i / W) | 0;
      // the halo: water that ran past the pigment, faintly coloured, darker where it stopped
      const wr = w / (cap[i] * 0.3);
      const halo = smooth(0.05, 0.9, wr);
      const tide = smooth(0.08, 0.3, wr) * (1 - smooth(0.4, 0.9, wr));
      const ha = (0.05 * halo + 0.05 * tide) * (0.75 + 0.25 * hash2(x, y, 61));
      r = r * (1 - ha) + inkC[0] * ha; gg = gg * (1 - ha) + inkC[1] * ha; b = b * (1 - ha) + inkC[2] * ha;
      D[i * 4] = r; D[i * 4 + 1] = gg; D[i * 4 + 2] = b;
    }
    // the pigment: coverage first, softened over a pixel or two as wet ink softens in cloth
    const A = new Float32Array(N), DEEP = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = ink[i]; if (v < 0.01) continue;
      const x = i % W, y = (i / W) | 0;
      const sat = v / (cap[i] * 0.9);
      const resist = fbm(x / 3.5, y / 2.2, 41, 2);
      const hole = smooth(0.62, 0.76, resist) * (1 - 0.6 * smooth(2.5, 6, sat));
      let a = smooth(0.1, 0.8, sat) * (1 - 0.6 * hole) * (0.9 + 0.1 * hash2(x, y, 23));
      // thin ink is a stain, not a coat: the line lets the ground through, the pool does not
      a *= 0.88 + 0.12 * smooth(0.8, 3.0, sat);
      A[i] = a; DEEP[i] = smooth(0.9, 3.5, sat) * (0.5 + 0.5 * fbm(x / 12, y / 12, 43, 2));
    }
    const A2 = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) for (let x = 1, i = y * W + 1; x < W - 1; x++, i++) {
      const c = A[i], n = A[i - 1] + A[i + 1] + A[i - W] + A[i + W], d = A[i - W - 1] + A[i - W + 1] + A[i + W - 1] + A[i + W + 1];
      if (c === 0 && n === 0 && d === 0) continue;
      A2[i] = (c * 4 + n * 2 + d) / 16;
    }
    for (let i = 0; i < N; i++) {
      const a = A2[i]; if (a < 0.003) continue;
      const deep = DEEP[i];
      const ir = inkC[0] * (1 - 0.05 * deep), ig = inkC[1] * (1 - 0.1 * deep), ib = inkC[2] * (1 - 0.07 * deep);
      D[i * 4] = D[i * 4] * (1 - a) + ir * a; D[i * 4 + 1] = D[i * 4 + 1] * (1 - a) + ig * a; D[i * 4 + 2] = D[i * 4 + 2] * (1 - a) + ib * a;
    }
    g.putImageData(img, 0, 0);
    return out;
  }

  // The host's door. DATA is the whole record; the sheet's turn on a day is the
  // sum of the nights' turns up to and including it, as in S6-03.
  function paintDay(p, day, DATA, w, h) {
    const all = ((DATA && DATA.days) || [day]).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
    let turn = 0;
    for (const d of all) { if (d.d > day.d) break; if (typeof d.turn === 'number') turn += d.turn; }
    const sheet = paintSheet(day, { turn });
    w = Math.round(w || W); h = Math.round(h || H);
    if (w === W && h === H) return sheet;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const oc = out.getContext('2d'); oc.imageSmoothingQuality = 'high';
    oc.drawImage(sheet, 0, 0, w, h);
    return out;
  }

  window.S605Painter = { paintDay };
})();
