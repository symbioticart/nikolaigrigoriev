/* S6-06 — a colony spun from the nights of one sleeping body.
 * ─────────────────────────────────────────────────────────────────────────────
 * Each night one sprout leaves the centre of the sheet and joins every sprout
 * already there. The colony is never cleared: the painting of a night is every
 * night recorded up to it, the newest at full strength and the rest dimmed by
 * one step, the oldest settled into the felt of the ground.
 *
 * WHAT ARRIVES HERE. The night record Archipelago (S5-01) reads:
 * /archipelago/data.json?all=1 → { nights:[{ day, phase5, move30, hr[], … }] }.
 *
 * WEAVING. No feature is one signal. Each is two signals, each ranked against
 * the ninety nights of this body that came before it and never against those
 * that follow, so a past night is never repainted as the record grows:
 *   reach       heart rate variability · total sleep
 *   straightness lowest heart rate · hour of falling asleep against its habit
 *   threads     deep sleep · slowness of the breath
 *   hairs       movement in sleep · time awake
 *   branches    dream sleep · how quickly sleep came
 *   turn        temperature deviation · breath
 *   colour      the phases of the night in order, each stretched by how hard
 *               the heart worked during it
 * A night the ring did not record leaves no sprout, only an empty grey spore.
 *
 * Every random number grows from the night's date. No Math.random.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const W = 920, H = 1350, CX = W / 2, CY = H / 2;
  const RULE = {
    window: 90,          // nights each signal is ranked against
    minHistory: 7,       // fewer nights than this behind it: the night sits in the middle
    fresh: 10,           // days a sprout keeps its threads before it starts to felt
    felt: 45,            // days over which a sprout settles into the ground
    dim: 0.5,            // every sprout but the newest, on the morning of the newest
    turnMax: 0.5,        // radians a night can turn the colony, either way
    regularity: 30,      // nights that make the habit of falling asleep
  };
  const PI = Math.PI;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const DAY = 864e5;
  const dayNum = (iso) => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);
  const isoOf = (n) => new Date(n * DAY).toISOString().slice(0, 10);

  function hashStr(s) { let h = 2166136261 >>> 0; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function prng(seedStr) {
    let a = hashStr(seedStr);
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0; while (u === 0) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * PI * r()); }
  function h2(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h2(xi, yi, s), h2(xi + 1, yi, s), u), lerp(h2(xi, yi + 1, s), h2(xi + 1, yi + 1, s), u), v); }
  function fbm(x, y, s) { let t = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < 3; i++) { t += a * vnoise(x * f, y * f, s + i * 101); n += a; a *= 0.5; f *= 2.03; } return t / n; }
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  // moss, spruce, peat, duckweed, lichen
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const P = {
    ink:    ['#1d2617', '#26321f', '#22332c', '#352f20'].map(hex),
    deep:   ['#2e3a22', '#36402a', '#2c3b33', '#433a26'].map(hex),
    mid:    ['#4f5a2e', '#5e6a3a', '#4a5a45', '#6a5f38'].map(hex),
    copper: ['#8e7442', '#9a8150', '#7f7a48', '#a08452'].map(hex),
    pale:   ['#a7a57d', '#b6b28a', '#9ca385', '#bdb08c'].map(hex),
    felt:   ['#c9c5ae', '#c3c1a8', '#cdc6ad', '#bfbea6'].map(hex),
    ash:    ['#9b9a8a', '#8f8f80', '#a6a393', '#888779'].map(hex),
  };
  const PHASE = { '1': P.ink, '2': P.mid, '3': P.copper, '4': P.pale };   // deep, light, dream, awake
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

  // ── the night in the form the rule reads ─────────────────────────────────
  function bedMinutes(iso) {           // minutes after local noon, read from the stamp itself
    const m = /T(\d\d):(\d\d)/.exec(iso || ''); if (!m) return null;
    let v = (+m[1]) * 60 + (+m[2]) - 720; if (v < 0) v += 1440; return v;
  }
  function restless(move30) {
    const mv = []; for (const c of move30 || '') if (c >= '1' && c <= '4') mv.push(+c);
    return mv.length ? mv.reduce((a, b) => a + b, 0) / mv.length - 1 : null;
  }
  function median(a) { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; }

  function rank(nights, i, key) {
    const v = nights[i][key]; if (v == null) return 0.5;
    let n = 0, lo = 0;
    for (let j = Math.max(0, i - RULE.window); j < i; j++) {
      const w = nights[j][key]; if (w == null) continue;
      n++; if (w < v) lo++; else if (w === v) lo += 0.5;
    }
    return n < RULE.minHistory ? 0.5 : lo / n;
  }

  // The ranked form of every night, built once per record. Each night is judged
  // only against the nights before it, so this list never changes behind a night.
  const CACHE = new WeakMap();
  function derive(raw) {
    if (CACHE.has(raw)) return CACHE.get(raw);
    const nights = raw.slice().sort((a, b) => (a.day < b.day ? -1 : 1)).map((n) => ({
      day: n.day, phases: n.phase5 || '', hr: n.hr || [],
      hrv: n.avg_hrv, rhr: n.lowest_hr, tst: n.tst, deep: n.deep, rem: n.rem, awake: n.awake,
      latency: n.latency, breath: n.avg_breath, temp: n.temp_dev,
      bed: bedMinutes(n.bedtime_start), rest: restless(n.move30),
    }));
    let dir = -PI / 2;
    nights.forEach((n, i) => {
      const beds = []; for (let j = Math.max(0, i - RULE.regularity); j < i; j++) if (nights[j].bed != null) beds.push(nights[j].bed);
      const mb = median(beds); n.bedDev = (mb == null || n.bed == null) ? null : Math.abs(n.bed - mb);
    });
    nights.forEach((n, i) => {
      const r = (k) => rank(nights, i, k);
      n.L = 0.5 * r('hrv') + 0.5 * r('tst');
      n.S = 0.5 * (1 - r('rhr')) + 0.5 * (1 - r('bedDev'));
      n.K = 0.5 * r('deep') + 0.5 * (1 - r('breath'));
      n.F = 0.5 * r('rest') + 0.5 * r('awake');
      n.B = 0.5 * r('rem') + 0.5 * (1 - r('latency'));
      dir += ((r('temp') - 0.5) * 0.6 + (r('breath') - 0.5) * 0.4) * 2 * RULE.turnMax;
      n.dir = dir;
    });
    // heart-stretched positions of the phases along a thread
    for (const n of nights) {
      const ph = n.phases, m = ph.length; n.cum = null;
      if (!m) continue;
      const hr = n.hr.filter((v) => v != null);
      const lo = hr.length ? Math.min(...hr) : 0, hi = hr.length ? Math.max(...hr) : 1;
      const cum = new Float32Array(m + 1);
      for (let k = 0; k < m; k++) {
        const v = n.hr.length ? n.hr[Math.min(n.hr.length - 1, Math.floor(k / m * n.hr.length))] : null;
        cum[k + 1] = cum[k] + 0.5 + (v == null || hi === lo ? 0.5 : (v - lo) / (hi - lo));
      }
      for (let k = 0; k <= m; k++) cum[k] /= cum[m];
      n.cum = cum;
    }
    const out = { nights, byDay: new Map(nights.map((n, i) => [n.day, i])) };
    CACHE.set(raw, out);
    return out;
  }
  function phaseAt(n, t) {                 // t ∈ [0,1] along the thread → phase char
    const ph = n.phases; if (!ph) return '2';
    const c = n.cum; let lo = 0, hi = ph.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= t) lo = m; else hi = m - 1; }
    return ph[lo];
  }

  // ── growth ───────────────────────────────────────────────────────────────
  function walk(r, x, y, h0, n, sigma, pull, w0, q) {
    const pts = []; let h = h0; const R = Math.min(W, H) * lerp(0.36, 0.44, r());
    for (let i = 0; i < n; i++) {
      pts.push({ x, y, w: Math.max(1.2, w0 * Math.pow(1 - i / n, 0.6)), h });
      h += gauss(r) * sigma + angDiff(h0, h) * pull;
      if (r() < 0.04 * (1 - q)) h += gauss(r) * 1.1;
      if (Math.hypot(x - CX, y - CY) > R) break;
      x += Math.cos(h) * 3.1 + gauss(r) * 0.7 * (1 - q * 0.6);
      y += Math.sin(h) * 3.1 + gauss(r) * 0.7 * (1 - q * 0.6);
    }
    return pts;
  }
  function grow(n) {
    const r = prng('S6-06:' + n.day);
    const steps = Math.round(lerp(45, 300, n.L)), sigma = lerp(0.65, 0.05, n.S), pull = lerp(0.005, 0.1, n.S);
    const main = walk(r, CX, CY, n.dir, steps, sigma, pull, lerp(5, 18, n.K), n.S), paths = [main];
    const nb = Math.round(lerp(0, 5, n.B));
    for (let b = 0; b < nb; b++) {
      const i = Math.floor(lerp(0.12, 0.8, r()) * main.length), s = main[i];
      paths.push(walk(r, s.x, s.y, s.h + (r() < 0.5 ? -1 : 1) * lerp(0.5, 1.25, r()),
        Math.round(steps * lerp(0.12, 0.35, r())), sigma * 1.5 + 0.08, pull * 0.4, s.w * 0.55, n.S * 0.6));
    }
    return { paths, r };
  }

  function thread(ctx, pts, n, r, spread, drift, felt, alpha, lw) {
    const shade = Math.floor(r() * 4), off = (r() - 0.5) * 0.06;
    let o = gauss(r) * 0.3, cur = null;
    ctx.lineWidth = lw; ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1;
      o = clamp(o + gauss(r) * drift, -spread, spread);
      const X = pts[i].x + nx / nl * o * pts[i].w, Y = pts[i].y + ny / nl * o * pts[i].w;
      const c = phaseAt(n, clamp(i / pts.length + off, 0, 0.9999));
      if (c !== cur) {
        if (cur !== null) { ctx.lineTo(X, Y); ctx.stroke(); ctx.beginPath(); }
        ctx.strokeStyle = rgb(mix((PHASE[c] || P.mid)[shade], P.felt[shade], felt)); ctx.globalAlpha = alpha;
        ctx.moveTo(X, Y); cur = c;
      } else ctx.lineTo(X, Y);
    }
    ctx.stroke();
  }

  function laySprout(ctx, n, age) {
    const { paths, r } = grow(n);
    const f = age === 0 ? 1 : RULE.dim * Math.exp(-Math.max(0, age - RULE.fresh) / RULE.felt);
    const loose = 1 - n.S;
    for (const pts of paths) {
      const full = Math.round(lerp(6, 38, n.K) * (pts === paths[0] ? 1 : 0.6));
      const K = Math.max(1, Math.round(full * Math.max(f, 0.04)));
      for (let k = 0; k < K; k++) {
        thread(ctx, pts, n, r, lerp(0.55, 1.15, loose), lerp(0.02, 0.08, loose), (1 - f) * 0.75,
          f < 0.15 ? 0.07 + 0.25 * f : lerp(0.3, 0.9, r()) * lerp(0.35, 1, f), lerp(0.6, 2.2, r()) * (f < 0.15 ? 0.8 : 1));
      }
      if (f < 0.45) continue;
      ctx.lineWidth = 0.6;
      for (let i = 2; i < pts.length - 1; i += 2) {
        if (r() > lerp(0.08, 0.85, n.F)) continue;
        const a = pts[i - 1], b = pts[i + 1], nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1, sd = r() < 0.5 ? -1 : 1;
        const bx = pts[i].x + nx / nl * sd * pts[i].w * 0.5, by = pts[i].y + ny / nl * sd * pts[i].w * 0.5;
        const L = 3 + Math.abs(gauss(r)) * lerp(3, 11, n.F), ang = Math.atan2(ny * sd, nx * sd) + gauss(r) * 0.6;
        ctx.strokeStyle = rgb(r() < 0.6 ? P.pale[Math.floor(r() * 4)] : P.deep[Math.floor(r() * 4)]); ctx.globalAlpha = 0.6 * f;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(ang) * L, by + Math.sin(ang) * L); ctx.stroke();
      }
      const tip = pts[pts.length - 1];
      for (let s = 0; s < Math.round(4 + pts[0].w * 0.6); s++) {
        ctx.globalAlpha = lerp(0.4, 0.9, r()) * f;
        ctx.fillStyle = rgb(r() < 0.5 ? P.copper[Math.floor(r() * 4)] : P.ink[Math.floor(r() * 4)]);
        ctx.beginPath(); ctx.arc(tip.x + gauss(r) * pts[0].w * 0.4, tip.y + gauss(r) * pts[0].w * 0.4, lerp(0.7, 2.3, r()), 0, 2 * PI); ctx.fill();
      }
    }
  }
  function laySpore(ctx, iso, dir, age) {
    const r = prng('S6-06:gap:' + iso), dist = lerp(28, 70, r());
    const x = CX + Math.cos(dir) * dist + gauss(r) * 6, y = CY + Math.sin(dir) * dist + gauss(r) * 6;
    ctx.globalAlpha = age <= RULE.fresh ? 0.9 : 0.55; ctx.strokeStyle = rgb(P.ash[Math.floor(r() * 4)]); ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(x, y, lerp(2, 4.5, r()), 0, 2 * PI); ctx.stroke();
  }

  let GROUND = null;
  function ground(pw, ph) {
    if (GROUND && GROUND.width === pw && GROUND.height === ph) return GROUND;
    const c = document.createElement('canvas'); c.width = pw; c.height = ph;
    const g = c.getContext('2d'), img = g.createImageData(pw, ph), D = img.data, k = W / pw;
    for (let y = 0, i = 0; y < ph; y++) for (let x = 0; x < pw; x++, i++) {
      const lo = fbm(x * k / 95, y * k / 95, 1906), hs = h2(x, y, 1906);
      const col = P.felt[Math.min(3, Math.floor(clamp(lo * 0.9 + hs * 0.55 - 0.2, 0, 0.999) * 4))], v = (hs - 0.5) * 12;
      D[i * 4] = col[0] + v; D[i * 4 + 1] = col[1] + v; D[i * 4 + 2] = col[2] + v; D[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (GROUND = c);
  }

  // The painting of a night: every night recorded up to it, the oldest below.
  function paintDay(p, day, DATA, w, h) {
    const raw = (DATA && DATA.nights) || [day];
    const { nights, byDay } = derive(raw);
    const last = byDay.has(day.day) ? byDay.get(day.day) : nights.length - 1;
    const today = dayNum(nights[last].day);
    w = Math.round(w || W); h = Math.round(h || H);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    ctx.drawImage(ground(w, h), 0, 0);
    ctx.save(); ctx.scale(w / W, h / H); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    let prev = null;
    for (let i = 0; i <= last; i++) {
      const n = nights[i], d = dayNum(n.day);
      if (prev != null) for (let g = prev + 1; g < d; g++) laySpore(ctx, isoOf(g), nights[i - 1].dir, today - g);
      laySprout(ctx, n, today - d);
      prev = d;
    }
    ctx.restore(); ctx.globalAlpha = 1;
    return out;
  }

  window.S606Painter = { paintDay, RULE };
})();
