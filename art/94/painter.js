// S6-01 — the painter.
//
// The hand of Variation 87 — its ground, its two palettes, its colour
// modulation, its three registers and brush pools — laid on a body that is
// grown before a mark is made: five axes of a phenotype, a superformula plan,
// the edge device of S5-03 on its rim, a vein system colonising the inside, a
// reaction-diffusion skin, Perlin in every stroke. The body is never drawn; it
// is only the reason the brush is where it is.
//
// It reads the record 87 reads: twenty anonymous channels in [0,1], each a
// convolution of at least two causally-ranked signals of one body, and the
// seed of the day fixed by the certificate formula. Five axes are read off
// those channels, and everything else grows from the five. No raw measurement
// ever reaches this file.
//
// Built from the studio piece symbioticart dev claude/oil-morphogenesis by
// tools of that folder; the libraries below are its own, unchanged.
(function () {
'use strict';

// ---- lib/rng.js ----
// rng.js — deterministic seed + PRNG, verbatim from
// symbart-production-skill/references/data-schema.md.
// One day = one painting: every random number in this project grows from here.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RNG = api;
})(this, function () {
  function hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  function makeRNG(seed) {
    let s = seed >>> 0;
    return () => {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Each stage gets its own stream off the same day, so stage 3 cannot
  // shift stage 7 by drawing one more number.
  function seedFor(dayStr, stageN) {
    return (hashStr(dayStr) ^ Math.imul(stageN, 0x9E3779B9)) >>> 0;
  }

  return { hashStr, makeRNG, seedFor };
});


// ---- lib/phenotype.js ----
// phenotype.js — DATA -> PHENOTYPE -> MORPHOGENESIS -> MATERIAL.
//
// The point of this file: no stage ever reads a raw metric. A day becomes five
// dimensionless axes first, and only those axes grow the organism. No single
// measurement is readable back out of the picture — every axis is a mean of at
// least three signals, and every morphological parameter is a function of an axis.
//
// Works unchanged in node (scripts/check-phenotype.js) and in the browser.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Pheno = api;
})(this, function () {

  function clip01(x) {
    if (x === null || x === undefined || Number.isNaN(x)) return 0.5;
    return x < 0 ? 0 : (x > 1 ? 1 : x);
  }

  function lerp(a, b, t) { return a + (b - a) * clip01(t); }

  function mean(arr) {
    const v = arr.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));
    if (!v.length) return 0.5;
    return v.reduce((a, b) => a + b, 0) / v.length;
  }

  // Coefficient of variation of the night's HRV series — how ragged the
  // autonomic signal was, independent of its level.
  function cv(series) {
    if (!Array.isArray(series) || series.length < 4) return null;
    const m = series.reduce((a, b) => a + b, 0) / series.length;
    if (!m) return null;
    const v = series.reduce((a, b) => a + (b - m) * (b - m), 0) / series.length;
    return Math.sqrt(v) / m;
  }

  // A store of sorted history arrays; percentile of a value inside 955 days.
  function makePct(historyValues) {
    return function pct(field, value) {
      const arr = historyValues[field];
      if (!arr || !arr.length) return 0.5;
      if (value === null || value === undefined || Number.isNaN(value)) return 0.5;
      // binary search: share of history strictly below value
      let lo = 0, hi = arr.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid] < value) lo = mid + 1; else hi = mid;
      }
      return lo / arr.length;
    };
  }

  // ---- level 2: PHENOTYPE -------------------------------------------------
  function phenotype(day, pct) {
    const growth = mean([
      pct('readinessScore', day.readinessScore),
      pct('sleepScore', day.sleepScore),
      day.activityScore === null ? null : clip01(day.activityScore / 100),
    ]);

    const recovery = mean([
      pct('hrv', day.hrv),
      1 - pct('avgHeartRate', day.avgHeartRate),
      pct('deepSleepPct', day.deepSleepPct),
    ]);

    const stressLoad = (day.stressHighSec || 0)
      / ((day.stressHighSec || 0) + (day.recoveryHighSec || 0) + 1);
    const stress = mean([
      pct('tempDeviation', day.tempDeviation),
      pct('restlessRate', day.restlessRate),
      stressLoad,
    ]);

    const hrvCv = cv(day.hrvSeries);
    const stability = mean([
      pct('efficiency', day.efficiency),
      1 - pct('latency', day.latency),
      hrvCv === null ? null : 1 - clip01(hrvCv),
    ]);

    const expansion = mean([
      day.steps === null ? null : clip01(day.steps / 15000),
      day.activeCalories === null ? null : clip01(day.activeCalories / 900),
      pct('workoutIntensity', day.workoutIntensity),
    ]);

    return {
      growth: clip01(growth),
      recovery: clip01(recovery),
      stress: clip01(stress),
      stability: clip01(stability),
      expansion: clip01(expansion),
    };
  }

  // ---- level 3: MORPHOGENESIS --------------------------------------------
  // One organism, seven views: every stage reads this same table.
  function morph(P) {
    const lobes = Math.round(lerp(3, 12, P.growth));
    const curvature = lerp(0.2, 1.0, P.recovery);
    const asymmetry = lerp(0, 0.6, P.stress);
    const expansion = lerp(0.55, 1.0, P.expansion);
    const foldDensity = lerp(2, 9, 1 - P.recovery);
    const regularity = P.stability;
    const branchDensity = lerp(0.3, 1.0, 0.5 * P.growth + 0.5 * P.recovery);

    return {
      lobes,
      curvature,
      asymmetry,
      expansion,
      foldDensity,
      regularity,
      branchDensity,
      sf: {
        m: lobes,
        n1: lerp(0.4, 1.6, curvature),
        n2: lerp(0.6, 2.2, regularity),
        n3: lerp(0.6, 2.2, regularity),
        a: 1,
        b: 1 + asymmetry,
      },
    };
  }

  // ---- level 5: MATERIAL --------------------------------------------------
  function material(P) {
    return {
      hue: lerp(35, 260, 0.6 * P.growth + 0.4 * P.recovery),
      sat: lerp(0.25, 0.8, 1 - P.stress),
      alpha: lerp(0.35, 0.85, P.recovery),
      glow: P.growth,
      iridescence: P.stability,
      residue: lerp(0.3, 0.7, P.stress),
    };
  }

  // HSL -> RGB 0..255, so every stage tints from the same MAT.
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }

  // Bind a data file + history file into a ready reader.
  function bind(historyValues) {
    const pct = makePct(historyValues);
    return {
      pct,
      read(day) {
        const P = phenotype(day, pct);
        return { P, M: morph(P), MAT: material(P) };
      },
    };
  }

  return { clip01, lerp, mean, cv, makePct, phenotype, morph, material, hslToRgb, bind };
});


// ---- lib/superformula.js ----
// superformula.js — Gielis' equation and the 3D supershape built from it.
//
// One set of six numbers moves the same surface from a near-sphere to a star,
// a flower, a cell. Those six numbers are morphogenesis output, never raw data.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SF = api;
})(this, function () {

  // r(angle) for parameters {m, n1, n2, n3, a, b}
  function sf(angle, q) {
    const t = q.m * angle / 4;
    const c = Math.pow(Math.abs(Math.cos(t) / q.a), q.n2);
    const s = Math.pow(Math.abs(Math.sin(t) / q.b), q.n3);
    const d = Math.pow(c + s, 1 / q.n1);
    return (!Number.isFinite(d) || d === 0) ? 0 : 1 / d;
  }

  // The 2D outline, used by the venation membrane.
  function outline(q, steps, radius) {
    const pts = [];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2 - Math.PI;
      const r = sf(a, q) * radius;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }

  // Sample the 3D supershape onto a lat/long grid.
  // displace(x, y, z, u, v) -> radial multiplier, optional (stage 3 uses it).
  function sample(M, opts) {
    const q1 = M.sf;                       // longitude profile
    const q2 = Object.assign({}, M.sf, {   // latitude profile: fewer lobes, so the
      m: Math.max(2, Math.round(M.sf.m / 2)),  // body reads as a body and not a pincushion
    });
    const nu = opts.res || 96;             // longitude samples
    const nv = Math.max(24, Math.round((opts.res || 96) / 2));  // latitude samples
    const radius = opts.radius || 200;
    const disp = opts.displace || null;
    const uvs = opts.uvScale || 1;   // the RD field wraps, so its texture tiles
    const shear = (M.asymmetry || 0) * 0.35;

    const P = [];                          // (nv+1) rows of (nu+1) points
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      const lat = -Math.PI / 2 + v * Math.PI;
      const r2 = sf(lat, q2);
      const row = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const lon = -Math.PI + u * Math.PI * 2;
        const r1 = sf(lon, q1);
        let x = r1 * Math.cos(lon) * r2 * Math.cos(lat);
        let y = r1 * Math.sin(lon) * r2 * Math.cos(lat);
        let z = r2 * Math.sin(lat);
        // stress leans the whole body off its own axis
        x += z * shear;
        // scale to canvas units BEFORE displacing, so a stage that pushes
        // vertices around is sampling noise over the real body, not over a
        // unit sphere where every sample lands in the same noise cell
        const px = x * radius, py = y * radius, pz = z * radius;
        const k = disp ? disp(px, py, pz, u, v) : 1;
        row.push([px * k, py * k, pz * k, u * uvs, v * uvs]);
      }
      P.push(row);
    }
    return { P, nu, nv };
  }


  // Build a p5.Geometry from one or more grids of [x, y, z, u, v] rows.
  //
  // Written by hand rather than through p.buildGeometry(): that path pushes every
  // vertex through a spread call and blows the JS stack somewhere above ~30k
  // vertices, and it also emits degenerate triangles at the poles. Indexing the
  // grid gives one vertex per sample instead of six, and lets us drop the
  // zero-area faces where a whole row collapses onto the axis.
  function meshFromGrids(p, grids) {
    const geom = new p5.Geometry();
    geom.vertices = [];
    geom.uvs = [];
    geom.faces = [];
    geom.vertexNormals = [];

    for (const g of grids) {
      const base = geom.vertices.length;
      const rows = g.length, cols = g[0].length;
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const v = g[j][i];
          geom.vertices.push(new p5.Vector(v[0], v[1], v[2]));
          geom.uvs.push(v[3], v[4]);
        }
      }
      const idx = (j, i) => base + j * cols + i;
      const same = (a, b) => {
        const A = geom.vertices[a], B = geom.vertices[b];
        return Math.abs(A.x - B.x) < 1e-9 && Math.abs(A.y - B.y) < 1e-9 && Math.abs(A.z - B.z) < 1e-9;
      };
      for (let j = 0; j < rows - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = idx(j, i), b = idx(j, i + 1), c = idx(j + 1, i + 1), d = idx(j + 1, i);
          if (!same(a, b) && !same(b, c) && !same(a, c)) geom.faces.push([a, b, c]);
          if (!same(a, c) && !same(c, d) && !same(a, d)) geom.faces.push([a, c, d]);
        }
      }
    }
    geom.computeNormals();
    return geom;
  }

  // Build a retained p5.Geometry. Cached per key — a day must not be re-meshed
  // every time the page repaints.
  const cache = new Map();
  function buildSupershape(p, M, opts) {
    const key = opts.key;
    if (key && cache.has(key)) return cache.get(key);

    const { P } = sample(M, opts);
    const geom = meshFromGrids(p, [P]);
    if (key) {
      if (cache.size > 60) { const first = cache.keys().next().value; cache.delete(first); }
      cache.set(key, geom);
    }
    return geom;
  }

  return { sf, outline, sample, meshFromGrids, buildSupershape, cache };
});


// ---- lib/rd.js ----
// rd.js — Gray-Scott reaction-diffusion on the CPU.
//
// The micro texture of the organism: skin, coral, veins, cell walls. Which
// regime the chemistry falls into is set by the day's regularity — a steady
// body grows a fine dense network, an unsteady one breaks into coarse islands.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.RD = api;
})(this, function () {

  // Sized for a browser: the field is only ever read through a rank at three
  // scales, so a finer grid buys nothing a viewer can see and costs the frame.
  const N = 80;          // grid side
  const STEPS = 1500;
  const DA = 1.0, DB = 0.5, DT = 1.0;

  // Two named Gray-Scott regimes the day is interpolated between.
  const COARSE = { f: 0.022, k: 0.051 };   // few large islands
  const FINE = { f: 0.058, k: 0.065 };     // dense fine branching

  function simulate(M, regularity, rng) {
    const n = N, len = n * n;
    let A = new Float32Array(len).fill(1);
    let B = new Float32Array(len).fill(0);
    let A2 = new Float32Array(len);
    let B2 = new Float32Array(len);

    const f = COARSE.f + (FINE.f - COARSE.f) * regularity;
    const k = COARSE.k + (FINE.k - COARSE.k) * regularity;

    // one seed per lobe: the chemistry starts where the body has parts
    const seeds = Math.max(2, M.lobes);
    for (let s = 0; s < seeds; s++) {
      const cx = Math.floor(rng() * n), cy = Math.floor(rng() * n);
      const r = 3 + Math.floor(rng() * 4);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const x = (cx + dx + n) % n, y = (cy + dy + n) % n;
          B[y * n + x] = 1;
        }
      }
    }

    // precomputed wrap tables — the inner loop must not do modulo
    const up = new Int32Array(n), dn = new Int32Array(n);
    for (let i = 0; i < n; i++) { up[i] = (i - 1 + n) % n; dn[i] = (i + 1) % n; }

    for (let step = 0; step < STEPS; step++) {
      for (let y = 0; y < n; y++) {
        const yu = up[y] * n, yd = dn[y] * n, yc = y * n;
        for (let x = 0; x < n; x++) {
          const xl = up[x], xr = dn[x];
          const c = yc + x;
          const lapA = A[yu + xl] * 0.05 + A[yu + x] * 0.2 + A[yu + xr] * 0.05
                     + A[yc + xl] * 0.2 - A[c] + A[yc + xr] * 0.2
                     + A[yd + xl] * 0.05 + A[yd + x] * 0.2 + A[yd + xr] * 0.05;
          const lapB = B[yu + xl] * 0.05 + B[yu + x] * 0.2 + B[yu + xr] * 0.05
                     + B[yc + xl] * 0.2 - B[c] + B[yc + xr] * 0.2
                     + B[yd + xl] * 0.05 + B[yd + x] * 0.2 + B[yd + xr] * 0.05;
          const a = A[c], b = B[c], abb = a * b * b;
          let na = a + (DA * lapA - abb + f * (1 - a)) * DT;
          let nb = b + (DB * lapB + abb - (k + f) * b) * DT;
          A2[c] = na < 0 ? 0 : (na > 1 ? 1 : na);
          B2[c] = nb < 0 ? 0 : (nb > 1 ? 1 : nb);
        }
      }
      let t = A; A = A2; A2 = t;
      t = B; B = B2; B2 = t;
    }
    return { B, n };
  }

  // Fraction of cells above the mean — how patterned the field actually is.
  function coverage(field) {
    let sum = 0;
    for (let i = 0; i < field.length; i++) sum += field[i];
    const m = sum / field.length;
    let above = 0;
    for (let i = 0; i < field.length; i++) if (field[i] > m) above++;
    return above / field.length;
  }

  const cache = new Map();

  // Returns { img: p5.Image, coverage } tinted with the day's material.
  function texture(p, M, MAT, regularity, rng, key) {
    if (key && cache.has(key)) return cache.get(key);
    const { B, n } = simulate(M, regularity, rng);

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < B.length; i++) { if (B[i] < lo) lo = B[i]; if (B[i] > hi) hi = B[i]; }
    const span = (hi - lo) || 1;

    const dark = window.Pheno.hslToRgb(MAT.hue, MAT.sat, 0.09);
    const light = window.Pheno.hslToRgb(MAT.hue + 30, Math.min(1, MAT.sat + 0.2), 0.82);

    const img = p.createImage(n, n);
    img.loadPixels();
    for (let i = 0; i < B.length; i++) {
      const t = (B[i] - lo) / span;
      const o = i * 4;
      img.pixels[o] = dark[0] + (light[0] - dark[0]) * t;
      img.pixels[o + 1] = dark[1] + (light[1] - dark[1]) * t;
      img.pixels[o + 2] = dark[2] + (light[2] - dark[2]) * t;
      img.pixels[o + 3] = 255;
    }
    img.updatePixels();

    const out = { img, coverage: coverage(B) };
    if (key) {
      if (cache.size > 24) cache.delete(cache.keys().next().value);
      cache.set(key, out);
    }
    return out;
  }

  return { simulate, texture, coverage, cache, N, STEPS };
});


// ---- lib/colonize.js ----
// colonize.js — space colonization (Runions et al.), the algorithm that grows
// leaf venation and vascular trees.
//
// The wing is not drawn. A field of attractors is scattered inside the outline,
// a vein grows toward whichever attractors can see it, and the membrane is
// stretched over what grew.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.Colonize = api;
})(this, function () {

  function inPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function bounds(poly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of poly) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1 };
  }

  // grow(poly, opts) -> { nodes, order }
  // nodes: { x, y, parent, depth, thickness }
  function grow(poly, opts) {
    const rng = opts.rng;
    const count = opts.attractors;
    const attractionDist = opts.attractionDist;
    const killDist = opts.killDist;
    const step = opts.step || 4;
    const maxIter = opts.maxIter || 400;

    // rejection-sample the attractor cloud inside the outline
    const b = bounds(poly);
    const atts = [];
    let guard = 0;
    while (atts.length < count && guard < count * 60) {
      guard++;
      const x = b.x0 + rng() * (b.x1 - b.x0);
      const y = b.y0 + rng() * (b.y1 - b.y0);
      if (inPolygon(x, y, poly)) atts.push({ x, y, alive: true });
    }

    // One root gives a starburst. A body with several lobes puts out several
    // trunks, and the field fills instead of radiating from a point.
    const roots = (opts.roots && opts.roots.length) ? opts.roots : [{ x: 0, y: 0 }];
    const nodes = roots.map((r) => ({ x: r.x, y: r.y, parent: -1, depth: 0 }));
    const ad2 = attractionDist * attractionDist;
    const kd2 = killDist * killDist;

    // A uniform grid over the nodes. Without it every attractor is compared
    // against every node on every iteration, which is most of this piece's
    // running time; with it only the nine cells around the attractor are read.
    const cs = Math.max(1, attractionDist);
    const grid = new Map();
    const key = (cx, cy) => cx * 73856093 ^ cy * 19349663;
    const addToGrid = (i) => {
      const k = key(Math.floor(nodes[i].x / cs), Math.floor(nodes[i].y / cs));
      const cell = grid.get(k);
      if (cell) cell.push(i); else grid.set(k, [i]);
    };
    for (let i = 0; i < nodes.length; i++) addToGrid(i);
    const near = (x, y, out) => {
      out.length = 0;
      const cx = Math.floor(x / cs), cy = Math.floor(y / cs);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get(key(cx + dx, cy + dy));
          if (cell) for (let i = 0; i < cell.length; i++) out.push(cell[i]);
        }
      }
      return out;
    };
    const bucket = [];

    for (let iter = 0; iter < maxIter; iter++) {
      const pull = new Map();
      let anyAlive = false;

      for (const a of atts) {
        if (!a.alive) continue;
        anyAlive = true;
        let best = -1, bestD = ad2;
        const cand = near(a.x, a.y, bucket);
        for (let c = 0; c < cand.length; c++) {
          const i = cand[c];
          const dx = a.x - nodes[i].x, dy = a.y - nodes[i].y;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = i; }
        }
        if (best < 0) continue;
        const dx = a.x - nodes[best].x, dy = a.y - nodes[best].y;
        const len = Math.hypot(dx, dy) || 1;
        const cur = pull.get(best) || { x: 0, y: 0 };
        cur.x += dx / len; cur.y += dy / len;
        pull.set(best, cur);
      }

      if (!anyAlive || pull.size === 0) break;

      for (const [i, dir] of pull) {
        const len = Math.hypot(dir.x, dir.y) || 1;
        // a little seeded wobble, so veins are not perfectly straight
        const jx = (rng() - 0.5) * 0.35, jy = (rng() - 0.5) * 0.35;
        const nx = nodes[i].x + (dir.x / len + jx) * step;
        const ny = nodes[i].y + (dir.y / len + jy) * step;
        if (!inPolygon(nx, ny, poly)) continue;
        nodes.push({ x: nx, y: ny, parent: i, depth: nodes[i].depth + 1 });
        addToGrid(nodes.length - 1);
      }

      for (const a of atts) {
        if (!a.alive) continue;
        const cand = near(a.x, a.y, bucket);
        for (let c = 0; c < cand.length; c++) {
          const i = cand[c];
          const dx = a.x - nodes[i].x, dy = a.y - nodes[i].y;
          if (dx * dx + dy * dy < kd2) { a.alive = false; break; }
        }
      }
    }

    // thickness: how much of the tree hangs below each node
    const weight = new Float64Array(nodes.length).fill(1);
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].parent >= 0) weight[nodes[i].parent] += weight[i];
    }
    let maxW = 1; for (let i = 0; i < roots.length; i++) maxW = Math.max(maxW, weight[i]);
    for (let i = 0; i < nodes.length; i++) {
      nodes[i].thickness = Math.sqrt(weight[i] / maxW);
    }

    let length = 0;
    for (let i = roots.length; i < nodes.length; i++) {
      if (nodes[i].parent < 0) continue;
      const par = nodes[nodes[i].parent];
      length += Math.hypot(nodes[i].x - par.x, nodes[i].y - par.y);
    }

    return { nodes, roots: roots.length, attractors: atts, length, killed: atts.filter((a) => !a.alive).length };
  }

  return { grow, inPolygon, bounds };
});


// ---- painter ----
// Oil Morphogenesis — the hand of Variation 87, the body of the morphology lab.
//
// What is kept from 87, unchanged: the ivory ground, the two palettes, the
// continuous palette sampling, modulateColor with its saturation compression
// and its guarantee of contrast against the ground, the three registers, the
// brush pools, the thrown marks, the impasto accents, and the fact that the
// only drawing call is oil.line.
//
// What is replaced: where the brush goes. In 87 the marks are scattered over
// the rectangle by a Halton cloud and turned by an analytic flow field, so the
// composition is a field. Here a body is grown first — five phenotype axes, a
// superformula outline, a vein system colonising the space inside it, a
// reaction-diffusion skin — and every mark is laid along a vein. The organism
// is never drawn. It is only the reason the brush is where it is.
//
// The sheet is covered because the body has more than a skeleton. A vein tree
// is a one-dimensional thing: marks laid on it can line a plane but never fill
// one. So the three registers are read as three tissues, painted in the order
// a body is built and therefore back to front:
//
//   FOUNDATION  the flesh    — placed by the reaction-diffusion skin over the
//                              whole sheet, broad and low in contrast, an
//                              underpainting rather than a set of gestures
//   MODULATION  the membrane — placed on the skin's own contours, the seams
//                              between one region of tissue and the next
//   TREMOR      the vessels  — placed on the vein tree, finest and last, so
//                              the vasculature lies over the flesh as it does
//                              in a body
//
// Large behind, small in front, and no layer invented for the sake of filling
// the paper: each one is a structure the morphogenesis already grew.
//
// Placement of the flesh is 87's own Halton cloud. Its scatter and our
// morphogenesis are not rivals — they turn out to be two different tissues.

// === PALETTES (Variation 87, verbatim) ===
const WARM = [
  [230, 57, 70],    // red
  [241, 196, 15],   // yellow
  [6, 174, 213],    // cyan
  [42, 157, 143],   // teal
  [231, 111, 81],   // coral
  [38, 70, 83],     // deep blue
  [244, 162, 97],   // orange
  [102, 155, 188],  // sky blue
  [255, 183, 3],    // golden
];

const DEEP = [
  [74, 14, 14],     // deep red
  [107, 39, 55],    // maroon
  [139, 0, 0],      // dark red
  [44, 24, 16],     // dark brown
  [61, 0, 0],       // blood red
  [26, 10, 10],     // near black
  [92, 31, 31],     // wine
  [138, 54, 15],    // burnt sienna dark
  [55, 20, 20],     // dark maroon
];

// === HSL (Variation 87, verbatim) ===
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

// 87's modulation, with the twenty anonymous channels replaced by the five
// phenotype axes. The arithmetic and the constants are 87's.
function modulateColor(rgb, P, keyT, bgL, jitter = 0) {
  let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  // Saturation compression: the muting IS the colour identity of this hand.
  s *= (0.55 + 0.45 * P.growth);

  l += (keyT - 0.5) * 0.12;

  // Stress rotates the hue warm; a calm body keeps the palette where it was.
  h -= (P.stress - 0.5) * 2 * 25;

  // A steady body carries more tonal contrast.
  const contrast = 0.55 + P.stability * 0.45;
  l = 0.5 + (l - 0.5) * contrast;

  if (bgL != null) {
    const delta = l - bgL;
    if (bgL < 0.35 && delta < 0.18) l = bgL + 0.18 + jitter * 0.35;
    else if (bgL > 0.7 && delta > -0.18) l = bgL - 0.18 - jitter * 0.45;
  }

  l = Math.max(0.05, Math.min(0.95, l));
  s = Math.max(0, Math.min(1, s));
  return hslToRgb(h, s, l);
}

function backgroundColor() { return hslToRgb(42, 0.35, 0.90); }

function samplePalette(palette, t) {
  t = Math.max(0, Math.min(1, t));
  const p = t * (palette.length - 1);
  const i = Math.floor(p);
  const frac = p - i;
  const a = palette[i];
  const b = palette[Math.min(i + 1, palette.length - 1)];
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac, a[2] + (b[2] - a[2]) * frac];
}

// In 87 the boundary between the two palettes is a level set of the flow field.
// Here it is a level set of the skin: the reaction-diffusion pattern decides
// which pool a mark comes from and where in the ramp it sits.
function pickColorField(P, keyT, bgL, fv, rng) {
  const useWarm = (fv * 0.4 + 0.5) < keyT;
  const pool = useWarm ? WARM : DEEP;
  const base = samplePalette(pool, Math.abs(fv));
  return modulateColor(base, P, keyT, bgL, rng ? rng() : 0);
}


// === THE EDGE, AFTER S5-03 =================================================
// Variation 91 does not compute a superellipse. It takes the polygon of a cell
// and replaces every edge with either a signed arc or a sharp beak: one signed
// amplitude carries the silhouette from an astroid sucked in on all sides to a
// full rounded body, and a minority of the longest edges crack outward instead
// of swelling. The amplitude of an arc is hashed from the edge's own endpoints,
// so an edge always bows the same way whatever order it is drawn in.
//
// Here the superformula supplies the plan — how many lobes and how they sit —
// and 91's device decides what happens at the rim of each. The two numbers it
// needs are the two 91 itself uses: the bow comes from the heart's variability,
// the beaks from the hours of stress. In this piece those are the recovery and
// stress axes, which are built from exactly those signals.
const EDGE = { bowLo: -0.30, bowHi: 0.55, beakMax: 6, beakShare: 0.4, beakOut: 0.55 };

function edgeHash(x0, y0, x1, y1, salt) {
  const a = Math.round(x0) + Math.round(x1), b = Math.round(y0) + Math.round(y1);
  let h = (a * 73856093) ^ (b * 19349663) ^ (salt * 83492791);
  h >>>= 0;
  let t = h;
  t |= 0; t = t + 0x6D2B79F5 | 0;
  let u = Math.imul(t ^ t >>> 15, 1 | t);
  u = u + Math.imul(u ^ u >>> 7, 61 | u) ^ u;
  return ((u ^ u >>> 14) >>> 0) / 4294967296;
}

// poly -> a dense outline with bowed and beaked edges
function curvySilhouette(poly, cx, cy, bow, beaks, minEdge) {
  const n = poly.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    edges.push({ i, L: Math.hypot(b[0] - a[0], b[1] - a[1]) });
  }
  const cap = Math.min(beaks, Math.floor(n * EDGE.beakShare));
  const sharp = {};
  edges.filter((e) => e.L > minEdge)
       .sort((p, q) => q.L - p.L || p.i - q.i)
       .slice(0, cap)
       .forEach((e) => { sharp[e.i] = 1; });

  const out = [];
  for (let i = 0; i < n; i++) {
    const x0 = poly[i][0], y0 = poly[i][1];
    const x1 = poly[(i + 1) % n][0], y1 = poly[(i + 1) % n][1];
    const dx = x1 - x0, dy = y1 - y0;
    const L = Math.hypot(dx, dy) || 1;
    let nx = -dy / L, ny = dx / L;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
    if (sharp[i]) {
      const k = L * EDGE.beakOut;
      out.push([mx + nx * k, my + ny * k], [x1, y1]);
    } else {
      const h = edgeHash(x0, y0, x1, y1, 1);
      const amp = (0.55 + 0.9 * h) * L * bow;
      const qx = mx + nx * amp, qy = my + ny * amp;
      for (let t = 1; t <= 6; t++) {
        const u = t / 6, iu = 1 - u;
        out.push([iu * iu * x0 + 2 * iu * u * qx + u * u * x1,
                  iu * iu * y0 + 2 * iu * u * qy + u * u * y1]);
      }
    }
  }
  return out;
}

// Signed distance to a closed polygon: positive inside. Used to say how deep
// in the body a point falls, now that the rim is no longer a smooth radius.
function signedDist(x, y, poly) {
  let best = Infinity, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((x - xi) * dx + (y - yi) * dy) / L2;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const px = xi + dx * t, py = yi + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return inside ? best : -best;
}

// === THE PAINTER ===
// ctx = { day, P, M, MAT, seed, rng }
function paintDay(p, ctx, W, H) {
  const { P, M, rng, seed } = ctx;
  const presence = ctx.presence == null ? 1 : ctx.presence;
  oil.seed(seed);

  const minDim = Math.min(W, H);
  const MARGIN = minDim * 0.085;
  const xMax = W / 2 - MARGIN;
  const yMax = H / 2 - MARGIN;
  const wScale = minDim / 700;

  const bg = backgroundColor();
  const bgL = rgbToHsl(bg[0], bg[1], bg[2])[2];
  p.background(bg[0], bg[1], bg[2]);

  // ---- the body, grown before a single mark is made ---------------------
  // The superformula gives the plan: one vertex at every lobe tip and every
  // notch between them. 91's device then decides what happens at each rim.
  // The body must not fill the sheet: 91's rim is the point of this edge, and
  // an edge outside the trim is no edge at all. The paper still closes, but it
  // closes with the surround tissue, which is another thing than the body.
  const radius = minDim * 0.395 * (0.76 + 0.24 * M.expansion);
  // The body follows the sheet: on a landscape it is stretched across, on a
  // portrait it is stretched down, so it stands at the same share of the long
  // side either way. Variation 89's sheet is a portrait; 87's is a landscape.
  const sx = W >= H ? (W / H) * 0.96 : 1;
  const sy = H > W ? (H / W) * 0.96 : 1;
  const nv = Math.max(8, M.lobes * 2);
  const plan = [];
  for (let i = 0; i < nv; i++) {
    const a = (i / nv) * Math.PI * 2 - Math.PI;
    const r = window.SF.sf(a, M.sf) * radius;
    plan.push([Math.cos(a) * r * sx, Math.sin(a) * r * sy]);
  }
  const bow = window.Pheno.lerp(EDGE.bowLo, EDGE.bowHi, P.recovery);
  const beaks = Math.round(window.Pheno.lerp(0, EDGE.beakMax, P.stress));
  const poly = curvySilhouette(plan, 0, 0, bow, beaks, minDim * 0.011);

  // one trunk per lobe, on a small ring: the body pushes out several vessels
  // rather than radiating everything from a single point
  const roots = [];
  for (let k = 0; k < M.lobes; k++) {
    const a = (k / M.lobes) * Math.PI * 2 + (rng() - 0.5) * M.asymmetry;
    const rr = radius * (0.10 + 0.13 * rng());
    roots.push({ x: Math.cos(a) * rr * sx, y: Math.sin(a) * rr * sy });
  }

  const cacheKey = ctx.day.day;
  const cached = paintDay._cache && paintDay._cache.key === cacheKey ? paintDay._cache : null;

  const tree = cached ? cached.tree : window.Colonize.grow(poly, {
    rng,
    roots,
    attractors: Math.round(window.Pheno.lerp(260, 1000, M.branchDensity)),
    attractionDist: window.Pheno.lerp(0.16, 0.38, M.curvature) * radius,
    killDist: window.Pheno.lerp(0.052, 0.022, M.branchDensity) * radius,
    step: Math.max(5, radius * 0.017),
    maxIter: 460,
  });

  const nodes = tree.nodes;
  const kids = new Array(nodes.length);
  for (let i = 1; i < nodes.length; i++) {
    const par = nodes[i].parent;
    (kids[par] || (kids[par] = [])).push(i);
  }

  // ---- the skin: one reaction-diffusion field, read as 87 reads its flow --
  const rdRng = window.RNG.makeRNG((seed ^ Math.imul(41, 0x9E3779B9)) >>> 0);
  const skin = cached ? cached.skin : window.RD.simulate(M, M.regularity, rdRng);
  const B = skin.B, n = skin.n;
  paintDay._cache = { key: cacheKey, tree, skin };

  // 87 reads a sine field, whose values crowd around zero: its palette sampler
  // is built for that, and only the extremes reach the muddy end of the ramp
  // where sky blue interpolates into golden. Gray-Scott saturates instead —
  // read raw, it would sit in that muddy end permanently. So the field is
  // flattened to its own rank and then shaped back toward the centre, which
  // gives the sampler the distribution it was written for.
  const sorted = Float32Array.from(B).sort();
  const rankOf = (v) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
    return lo / sorted.length;
  };
  // fine enough that the colour turns several times across one body: the
  // registers cluster spatially, and a coarse field would hand a whole
  // register the same swatch
  const tiles = 3.2 + M.foldDensity * 0.9;
  // Macro, meso, micro: the same skin read at three scales, one per tissue.
  // The flesh sees its large regions, the membrane its native seams, the
  // vessels its finest grain. This is the source text's own stack, and it is
  // why the three layers do not fight each other for the same detail.
  const SCALE = { flesh: 0.34, membrane: 1, vessel: 1.7 };
  const fieldAt = (x, y, scale) => {
    const t = tiles * (scale === undefined ? 1 : scale);
    const u = (x / (2 * xMax) + 0.5) * t;
    const v = (y / (2 * yMax) + 0.5) * t;
    let i = Math.floor(u * n) % n, j = Math.floor(v * n) % n;
    if (i < 0) i += n; if (j < 0) j += n;
    const q = 2 * rankOf(B[j * n + i]) - 1;
    return Math.sign(q) * Math.pow(Math.abs(q), 1.7);
  };
  const fieldVal = (x, y) => fieldAt(x, y, 1);

  // The gradient of the skin: the grain of the tissue. Flesh strokes run along
  // it, membrane strokes run across it.
  const GSTEP = Math.max(6, minDim * 0.006);
  const skinAngle = (x, y, scale) => {
    const st = GSTEP / (scale || 1);
    const gx = fieldAt(x + st, y, scale) - fieldAt(x - st, y, scale);
    const gy = fieldAt(x, y + st, scale) - fieldAt(x, y - st, scale);
    return Math.atan2(gy, gx);
  };

  // ---- Perlin in the stroke ---------------------------------------------
  // The skin's grain gives a stroke its direction; that direction is
  // mathematical, and a hand is not. Perlin noise displaces every point of a
  // stroke along its own normal — the source text's third stage, moved off the
  // surface and onto the mark. Frequency is the density of the folds, depth is
  // stress against recovery: the same two axes that fold a body in the lab
  // piece bend the brush here.
  p.noiseSeed(seed);
  const nFreq = M.foldDensity / (minDim * 0.62);
  const nDepth = window.Pheno.lerp(0.35, 1.85, 0.5 * P.stress + 0.5 * (1 - P.recovery));
  // (x, y) -> how far this point is pushed sideways, in units of stroke width
  const wander = (x, y, salt) =>
    (p.noise(x * nFreq + salt, y * nFreq + salt * 1.7) - 0.5) * 2 * nDepth;

  // A tissue that lies under another is seen through it. There is no glazing
  // in this engine, so depth is written into the colour: the deeper the layer,
  // the more of the ground stands in front of it.
  const veil = (c, amount) => [
    c[0] + (bg[0] - c[0]) * amount,
    c[1] + (bg[1] - c[1]) * amount,
    c[2] + (bg[2] - c[2]) * amount,
  ];

  // How far inside the body a point lies, 1 at the core, 0 well outside. The
  // flesh runs to the edges of the sheet, but only inside the outline is it
  // full: outside, the tissue thins and cools. The body still reads as a form
  // without being cut out of the paper with scissors.
  const BAND = radius * 0.24;
  const belongAt = (x, y) => {
    const d = signedDist(x, y, poly) / BAND;
    if (d >= 1) return 1;
    if (d <= -1) return 0;
    const u = (d + 1) / 2;
    return u * u * (3 - 2 * u);
  };

  // 87's low-discrepancy cloud, verbatim: an even scatter that never clumps.
  const halton = (i, base) => {
    let f = 1, r = 0;
    while (i > 0) { f /= base; r += f * (i % base); i = Math.floor(i / base); }
    return r;
  };

  // ---- the three tissues, sized from the five axes -----------------------
  // FLESH — the mass. Enough of them to close the sheet; broad, and with a
  // deliberately narrow spread of size, because a mass is not a set of
  // gestures. Recovery decides how substantial the tissue is.
  // The covered sheet is the format of the work, not a property of the day:
  // a contracted body still closes the paper, it just closes it differently.
  // So the count barely moves; what the day decides is the colour, the grain
  // and how much ground stands in front of the tissue.
  const nFlesh = Math.round((158 + 34 * P.recovery + 26 * P.expansion) * presence);
  const lenFlesh = minDim * (0.34 + 0.24 * P.expansion);
  const wFlesh = (40 + 34 * P.recovery) * wScale;

  // MEMBRANE — the seams of the skin. Growth decides how much tissue there is
  // to have seams between.
  const nMembrane = Math.round((70 + 80 * P.growth) * presence);
  const lenMembrane = minDim * (0.085 + 0.10 * M.curvature);
  const wMembrane = (8 + 10 * (1 - M.curvature)) * wScale;

  // VESSELS — the vasculature, on the vein tree, drawn last and finest.
  const nVessel = Math.round((130 + 130 * P.stress + 100 * (1 - P.growth)) * presence);
  const lenVessel = minDim * (0.085 + 0.105 * M.regularity);
  const wVessel = (5 + 6 * P.stress) * wScale;
  // The vasculature is the last thing laid and the most decisive: no ground
  // stands in front of it, and its colour is pulled toward the deep pool —
  // 87's own keyBias, used the way it was written. Blood over tissue.
  const VESSEL_BIAS = -0.34;

  const keyT = 0.5 * P.growth + 0.5 * P.recovery;
  const sizeVar = 0.30 + 1.50 * (1 - M.regularity);
  const typeVar = 0.35 + 0.6 * (1 - M.regularity);
  const curvatureMul = 0.3 + 2.2 * M.curvature;
  const jitterAmp = P.stress;
  const composeAngle = (P.stability - 0.5) * (Math.PI / 4);

  const FLESH_BRUSHES = ['flatLarge', 'filbertLarge', 'impasto'];
  const MEMB_BRUSHES = ['filbertMedium', 'filbertLarge', 'knifeSmall'];
  const VESSEL_BRUSHES = ['knifeSmall', 'filbertMedium', 'knifeSmall'];

  const clampPt = (v, lim) => Math.max(-lim, Math.min(lim, v));
  const sizeFactor = (spread) => Math.max(0.25, 1 + (rng() - 0.5) * (spread === undefined ? sizeVar : spread));

  // A stroke may never be fatter than the run it is drawn along: a bristle
  // stroke wider than it is long is not a stroke, it is a blob, and the
  // engine's highlight run turns it white.
  function setWidth(baseW, fv, maxRun) {
    let w = baseW * (0.5 + Math.abs(fv) * 0.6) * (0.45 + rng() * 1.1);
    if (maxRun) w = Math.min(w, maxRun * 0.42);
    oil.strokeWeight(Math.max(1.2, w));
    return w;
  }

  function fitHalf(px, py, ang, half) {
    const cx = Math.abs(Math.cos(ang)), cy = Math.abs(Math.sin(ang));
    const lx = cx > 1e-3 ? (xMax - Math.abs(px)) / cx : Infinity;
    const ly = cy > 1e-3 ? (yMax - Math.abs(py)) / cy : Infinity;
    return Math.max(0, Math.min(half, lx, ly));
  }

  // ---- the free mark: a stroke laid at a place, along a given grain -------
  // Used by the two tissue layers, which have positions but no vessel to walk.
  function strokeFree(px0, py0, ang, baseLen, baseW, keyBias, spread, curl, layer) {
    const L = layer || { scale: 1, veil: 0 };
    const px = clampPt(px0, xMax), py = clampPt(py0, yMax);
    const fv = fieldAt(px, py, L.scale);
    const half = fitHalf(px, py, ang, baseLen * 0.5 * sizeFactor(spread));
    if (half < 4) return;
    const color = veil(pickColorField(P, Math.max(0, Math.min(1, keyT + keyBias)), bgL, fv, rng), L.veil);
    oil.stroke(color[0], color[1], color[2]);
    const w = setWidth(baseW, fv, half * 2);

    // Every free stroke is a short polyline: even the straight ones, because a
    // straight line cannot carry noise. Segments stay longer than the stroke
    // is wide, so the count is small and the engine's cost stays bounded.
    const turning = rng() < curl;
    const segments = Math.max(2, Math.min(turning ? 3 + Math.floor(curvatureMul * 2) : 3,
                                          Math.floor(half * 2 / Math.max(24, w * 1.1))));
    const segLen = (half * 2) / segments;
    const salt = 3 + (L.scale || 1) * 11;
    let x = px - Math.cos(ang) * half, y = py - Math.sin(ang) * half;
    let curA = ang;
    const raw = [{ x, y }];
    for (let sIdx = 0; sIdx < segments; sIdx++) {
      if (turning) {
        let dA = skinAngle(x, y, L.scale) + Math.PI / 2 - curA;
        while (dA > Math.PI) dA -= 2 * Math.PI;
        while (dA < -Math.PI) dA += 2 * Math.PI;
        curA += dA * curvatureMul * 0.14 + (rng() - 0.5) * 0.3 * jitterAmp;
      }
      x += Math.cos(curA) * segLen; y += Math.sin(curA) * segLen;
      raw.push({ x, y });
    }
    const pts = raw.map((q, k) => {
      const edge = k === 0 || k === raw.length - 1 ? 0.35 : 1;   // ends stay put
      const off = wander(q.x, q.y, salt) * w * edge;
      return { x: clampPt(q.x - Math.sin(curA) * off, xMax),
               y: clampPt(q.y + Math.cos(curA) * off, yMax) };
    });
    for (let sIdx = 0; sIdx < pts.length - 1; sIdx++) {
      oil.line(pts[sIdx].x, pts[sIdx].y, pts[sIdx + 1].x, pts[sIdx + 1].y);
    }
  }

  function freeMark(px, py, ang, baseLen, baseW, pool, curl, keyBias, spread, layer) {
    const bi = rng() < typeVar ? Math.floor(rng() * pool.length) : 0;
    oil.pick(pool[bi]);
    const r = rng();
    if (r < 0.10 * typeVar) strokeFree(px, py, ang, baseLen * 0.30, baseW * 1.2, keyBias, spread, 0, layer);
    else strokeFree(px, py, ang, baseLen, baseW, keyBias, spread, curl, layer);
  }

  // ---- the vessel mark: a stroke that walks a vein -----------------------
  function markStraight(node, baseLen, baseW, keyBias) {
    const ca = Math.cos(composeAngle), sa = Math.sin(composeAngle);
    const px = clampPt(node.x * ca - node.y * sa, xMax);
    const py = clampPt(node.x * sa + node.y * ca, yMax);
    const par = nodes[node.parent >= 0 ? node.parent : 0];
    const ang = Math.atan2(node.y - par.y, node.x - par.x) + composeAngle;
    const fv = fieldAt(px, py, SCALE.vessel);
    const half = fitHalf(px, py, ang, baseLen * 0.5 * sizeFactor());
    if (half < 4) return;
    const color = pickColorField(P, Math.max(0, Math.min(1, keyT + keyBias)), bgL, fv, rng);
    oil.stroke(color[0], color[1], color[2]);
    setWidth(baseW, fv, half * 2);
    oil.line(px - Math.cos(ang) * half, py - Math.sin(ang) * half,
             px + Math.cos(ang) * half, py + Math.sin(ang) * half);
  }

  // Where 87 steers a polyline toward a sine field, this one is handed the
  // vessel's own path: the gesture is the branch, trembling by the day's stress.
  function markCurved(node, idx, baseLen, baseW, keyBias) {
    const px = clampPt(node.x, xMax), py = clampPt(node.y, yMax);
    const fv = fieldAt(px, py, SCALE.vessel);
    const color = pickColorField(P, Math.max(0, Math.min(1, keyT + keyBias)), bgL, fv, rng);
    const want = baseLen * sizeFactor();

    const back = [];
    let cur = idx, run = 0;
    while (nodes[cur].parent >= 0 && run < want * 0.5 && back.length < 400) {
      const nx = nodes[cur].parent;
      run += Math.hypot(nodes[nx].x - nodes[cur].x, nodes[nx].y - nodes[cur].y);
      back.push(nx); cur = nx;
    }
    const fwd = [];
    cur = idx; run = 0;
    while (kids[cur] && run < want * 0.5 && fwd.length < 400) {
      let best = kids[cur][0];
      for (const k of kids[cur]) if (nodes[k].thickness > nodes[best].thickness) best = k;
      run += Math.hypot(nodes[best].x - nodes[cur].x, nodes[best].y - nodes[cur].y);
      fwd.push(best); cur = best;
    }

    const path = back.reverse().concat([idx], fwd).map((i) => nodes[i]);
    if (path.length < 2) { markStraight(node, baseLen, baseW, keyBias); return; }

    // The vein is sampled every few pixels; a stroke drawn node to node would
    // be far wider than it is long. Resample by arc length instead.
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
    }
    const total = cum[cum.length - 1];
    if (total < 12) { markStraight(node, baseLen, baseW, keyBias); return; }

    oil.stroke(color[0], color[1], color[2]);
    const w = setWidth(baseW, fv, total);
    const maxSeg = 3 + Math.floor(curvatureMul * 3);
    const segments = Math.max(1, Math.min(maxSeg, Math.floor(total / Math.max(18, w * 0.9))));

    const ca = Math.cos(composeAngle), sa = Math.sin(composeAngle);
    const pA = path[0], pB = path[path.length - 1];
    const ang0 = Math.atan2(pB.y - pA.y, pB.x - pA.x) + composeAngle;
    const pts = [];
    let seg = 1;
    for (let sIdx = 0; sIdx <= segments; sIdx++) {
      const target = total * sIdx / segments;
      while (seg < cum.length - 1 && cum[seg] < target) seg++;
      const t0 = cum[seg - 1], t1 = cum[seg];
      const f = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
      const a = path[seg - 1], b = path[seg];
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
      const rx = x * ca - y * sa, ry = x * sa + y * ca;
      const jx = (rng() - 0.5) * baseW * 0.5 * jitterAmp;
      const jy = (rng() - 0.5) * baseW * 0.5 * jitterAmp;
      // the vessel wanders too, but half as far: a vein is held by the tissue
      const edge = (sIdx === 0 || sIdx === segments) ? 0.3 : 1;
      const off = wander(rx, ry, 29) * w * 0.5 * edge;
      pts.push({ x: clampPt(rx + jx - Math.sin(ang0) * off, xMax),
                 y: clampPt(ry + jy + Math.cos(ang0) * off, yMax) });
    }
    for (let sIdx = 0; sIdx < pts.length - 1; sIdx++) {
      oil.line(pts[sIdx].x, pts[sIdx].y, pts[sIdx + 1].x, pts[sIdx + 1].y);
    }
  }

  function paintVessel(idx, baseLen, baseW, pool, curlBase, keyBias) {
    const node = nodes[idx];
    const bi = rng() < typeVar ? Math.floor(rng() * pool.length) : 0;
    oil.pick(pool[bi]);
    const r = rng();
    if (r < 0.12 * typeVar) markStraight(node, baseLen * 0.28, baseW * 1.25, keyBias);
    else if (r < curlBase) markCurved(node, idx, baseLen, baseW, keyBias);
    else markStraight(node, baseLen, baseW, keyBias);
  }

  // ===== PASS 1 — THE FLESH ===============================================
  // Halton over the whole sheet. Each stroke lies along the grain of the skin
  // and is scaled by how deep in the body it falls, so the paper closes while
  // the form still reads. The size spread is kept narrow: an underpainting.
  for (let i = 0; i < nFlesh; i++) {
    const px = (halton(i + 11, 2) - 0.5) * 2 * xMax * 1.02;
    const py = (halton(i + 11, 3) - 0.5) * 2 * yMax * 1.02;
    const bel = belongAt(px, py);
    const ang = skinAngle(px, py, SCALE.flesh) + composeAngle;
    const k = 0.46 + 0.54 * bel;                 // outside the body: smaller, thinner
    // and further under: the surround is the medium the body sits in, so it
    // lies deeper and more of the ground stands in front of it. The sheet is
    // covered everywhere; the form is where the tissue comes up to meet you.
    const layer = { scale: SCALE.flesh, veil: 0.20 + 0.42 * (1 - bel) };
    freeMark(px, py, ang, lenFlesh * k, wFlesh * k, FLESH_BRUSHES, 0.30, 0, 0.5, layer);
  }

  // ===== PASS 2 — THE MEMBRANE ============================================
  // Only where the skin crosses its own middle: the seam between one region of
  // tissue and the next. The stroke runs along the seam, not across it.
  const MEMBRANE = { scale: SCALE.membrane, veil: 0.12 };
  let placed = 0;
  for (let i = 0; placed < nMembrane && i < nMembrane * 24; i++) {
    const px = (halton(i + 1019, 2) - 0.5) * 2 * xMax;
    const py = (halton(i + 1019, 5) - 0.5) * 2 * yMax;
    if (Math.abs(fieldAt(px, py, SCALE.membrane)) > 0.30) continue;   // not on a seam
    const bel = belongAt(px, py);
    if (rng() > 0.25 + 0.75 * bel) continue;              // seams thin out beyond the body
    placed++;
    const ang = skinAngle(px, py, SCALE.membrane) + Math.PI / 2 + composeAngle;
    freeMark(px, py, ang, lenMembrane, wMembrane, MEMB_BRUSHES, 0.7, 0, undefined, MEMBRANE);
  }

  // ===== PASS 3 — THE VESSELS =============================================
  // The vein tree, thinnest branches, laid last so the vasculature sits over
  // the flesh as it does in a body.
  const order = [];
  for (let i = 0; i < nodes.length; i++) if (nodes[i].parent >= 0) order.push(i);
  order.sort((a, b) => nodes[b].thickness - nodes[a].thickness);

  function band(from, to, count) {
    const lo = Math.floor(order.length * from), hi = Math.floor(order.length * to);
    const len = Math.max(1, hi - lo);
    const out = [];
    for (let i = 0; i < count; i++) out.push(order[lo + Math.floor((i + rng()) / count * len) % len]);
    return out;
  }

  const nTrunk = Math.round(9 + 13 * P.recovery);
  for (const i of band(0.00, 0.12, nTrunk)) {
    paintVessel(i, lenVessel * 2.3, wVessel * 2.8, MEMB_BRUSHES, 0.5, VESSEL_BIAS);
  }
  for (const i of band(0.10, 1.00, nVessel)) {
    paintVessel(i, lenVessel, wVessel, VESSEL_BRUSHES, 0.82, VESSEL_BIAS);
  }

  // ---- thrown marks: exertion cast onto the surface ----------------------
  oil.pick('knifeSmall');
  const splatterCount = Math.round(6 + 16 * P.expansion);
  for (let i = 0; i < splatterCount; i++) {
    const px = clampPt((rng() - 0.5) * 2 * xMax * 0.92, xMax);
    const py = clampPt((rng() - 0.5) * 2 * yMax * 0.92, yMax);
    const fv = fieldVal(px, py);
    const color = pickColorField(P, keyT, bgL, fv, rng);
    oil.stroke(color[0], color[1], color[2]);
    oil.strokeWeight((2 + Math.abs(fv) * 5) * wScale);
    const tangle = rng() * Math.PI * 2;
    const tlen = (3 + rng() * 16) * wScale;
    oil.line(px, py, clampPt(px + Math.cos(tangle) * tlen, xMax), clampPt(py + Math.sin(tangle) * tlen, yMax));
    const nSpatter = 1 + Math.floor(rng() * 3);
    for (let sIdx = 0; sIdx < nSpatter; sIdx++) {
      const sa = tangle + (rng() - 0.5) * 1.6;
      const sd = (4 + rng() * 22) * wScale;
      const ox = clampPt(px + Math.cos(sa) * sd, xMax);
      const oy = clampPt(py + Math.sin(sa) * sd, yMax);
      oil.line(ox, oy, clampPt(ox + (rng() - 0.5) * 4, xMax), clampPt(oy + (rng() - 0.5) * 4, yMax));
    }
  }

  // ---- heavy accents at the peaks of the skin, on the trunks -------------
  oil.pick('impasto');
  const accentCount = Math.round(3 + 7 * P.growth);
  const cand = order.slice(0, Math.max(40, Math.floor(order.length * 0.12)));
  const ranked = cand.map((i) => ({ i, f: fieldVal(nodes[i].x, nodes[i].y) }))
    .sort((a, b) => b.f - a.f)
    .slice(0, accentCount);
  for (const { i } of ranked) markStraight(nodes[i], lenVessel * 2.6, wVessel * 3.6, VESSEL_BIAS);

  
  oil.flush();

  return { keyT, seed, nodes: nodes.length, veinLength: Math.round(tree.length) };
}



// === THE CONTRACT OF THE SITE ============================================
// day = { d: ISO date, s: seed, c: channels[20], i: incomplete flag }
const CH = { KEY: 0, GROUND: 1, WAKING: 2, AGITATION: 3, SPAN: 6, SWAY: 7, HEAT: 11, EXERTION: 12 };
const clip01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Five axes off the channels. Each channel is already several signals ranked
// against the days before; each axis here is one or two of them.
//   growth     KEY        readiness, sleep, hrv
//   recovery   GROUND     hrv, deep sleep, sleep
//   stress     AGITATION + HEAT   restlessness, breath, inefficiency, resting hr; temperature, hr, breath
//   stability  SPAN + SWAY        hours slept, efficiency; REM, latency
//   expansion  EXERTION + WAKING  training, workouts, ground; readiness, workouts
function axesOf(c) {
  const g = (i) => (typeof c[i] === 'number' ? c[i] : 0.5);
  return {
    growth: clip01(g(CH.KEY)),
    recovery: clip01(g(CH.GROUND)),
    stress: clip01((g(CH.AGITATION) + g(CH.HEAT)) / 2),
    stability: clip01((g(CH.SPAN) + g(CH.SWAY)) / 2),
    expansion: clip01((g(CH.EXERTION) + g(CH.WAKING)) / 2),
  };
}

function paintDaySite(p, day, DATA, W, H) {
  const P = axesOf(day.c || []);
  const M = window.Pheno.morph(P);
  const MAT = window.Pheno.material(P);
  const seed = (day.s >>> 0) || 1;
  const ctx = {
    day: { day: day.d },
    P, M, MAT, seed,
    rng: window.RNG.makeRNG(seed),
    presence: day.i ? 0.55 : 1,
  };
  return paintDay(p, ctx, W, H);
}

window.OilMorphogenesisPainter = { paintDay: paintDaySite, axesOf };
})();
