/* S6-03 — the ground a body covered, on one sheet, turned by its nights.
 * ─────────────────────────────────────────────────────────────────────────────
 * The rule of S6-02 with one law changed: the sheet is not turned by the
 * calendar but by the nights. Each day adds to the turn of the sheet the turn of
 * the night that opened it — that night's heart against every night written
 * before it, up to 45° either way.
 *
 * WHAT ARRIVES HERE. Not the record the house keeps. Before a day leaves the
 * house it is reduced to its public form: metres around a point instead of
 * latitude and longitude, every point inside the 250 m circle of the house
 * removed, the heart as a share of that day's own range instead of beats per
 * minute, and the night as its turn in degrees. Nothing on this page can be
 * read back into where the body lives or how fast its heart beat.
 *
 * THE SHEET OF A DAY is every frozen day up to and including it, oldest below,
 * that day on top, each weighed by its age on the morning it froze. The same
 * day always makes the same sheet: every random number is grown from the date.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const RULE = {
    margin: 0.085,                   // of the shorter side, as in Variation 87: 78 px; the day fills the sheet inside it
    minSpan: 200,                    // m: a day smaller than this is not blown up beyond it
    homeRadius: 250,                 // m around home: removed before the record leaves the house; nothing inside it reaches this page
    turnMax: 45,                     // degrees: a night calmer than every earlier one turns the sheet 45° clockwise, a faster one 45° against
    ground: '#eee9dd',
    inkCold: [31, 36, 48],           // night and early hours: blue-black
    inkWarm: [58, 36, 24],           // afternoon: sienna-black
    inkBlood: [92, 44, 34],          // the warm ink of effort: the more the heart works, the more hairs carry it
    wetLift: 0.35,                   // water on the brush after a lift: a bloom on return, one px of radius per minute under a roof
    wetDwell: 60,                   // s: standing this long lets water into the paper before it pools
    wMin: 1.5, wMax: 30,               // pressure: the day's slowest tenth of steps → widest, its fastest tenth → thinnest
    heart: 0.55,                     // how much of the pressure is the heart and how much the step: a slow walk with a
                                     // high beat and a fast one with a low beat press the same, so the stroke is not read back
    poolAfter: 90, poolMax: 40,      // a stop longer than 90 s pools ink, up to 40 px
    liftGap: 600, liftJump: 300,     // s / m: the brush leaves the sky, the lift is a hairline
    riverAt: 4,                      // days on the same ground for the riverbed to be full: ground walked again is darker
    riverInk: 0.16,                  // how much ink a full riverbed lays under the stroke
    ageStep: 0.05, ageFloor: 0.05    // each past day loses 5% presence; nothing goes below 5%, ever
  };

  const W = 920, H = 1350, M = 111320;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

  // one seeded chain per day: the same day always gives the same stroke
  function prng(seedStr) {
    let h = 2166136261; for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Pressure is the step woven with the heart, each weighed against the day's own range and not
  // against a standard. A slow step presses, an effort presses; a slow step with a quiet heart and
  // a fast one with a loud heart press the same, so the width cannot be read back into either.
  // A day with no heard beat is written by the step alone.
  function widthFn(day) {
    const pts = day.segs.flat();
    const q = (arr, f) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(f * arr.length))] : null;
    const vs = pts.map(p => p[3]).filter(v => v > 0).sort((a, b) => a - b);
    const vLo = q(vs, 0.10) ?? 0, vHi = Math.max(q(vs, 0.90) ?? 1, vLo + 0.05);
    // the heart arrives already weighed against the day's own range: 0 its quiet tenth, 1 its busy tenth
    const w = day.heart ? RULE.heart : 0;
    return (v, hr) => {
      const slow = 1 - clamp((v - vLo) / (vHi - vLo), 0, 1);
      const eff = hr == null || !day.heart ? slow : clamp(hr, 0, 1);
      const press = (1 - w) * slow + w * eff;
      return RULE.wMin + (RULE.wMax - RULE.wMin) * Math.pow(press, 1.3);
    };
  }

  // The line the brush rides: the day's points drawn through as one curve and sampled
  // evenly, so the hand does not step from point to point. Catmull-Rom, two pixels a step.
  function ride(pts, step) {
    if (pts.length < 2) return pts.map(p => ({ x: p.xy[0], y: p.xy[1], v: p.v, hr: p.hr, acc: p.acc, rep: p.rep, t: p.t }));
    const out = [];
    const at = i => pts[clamp(i, 0, pts.length - 1)];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = at(i - 1).xy, p1 = at(i).xy, p2 = at(i + 1).xy, p3 = at(i + 2).xy;
      const seglen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(1, Math.round(seglen / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        const a = pts[i], b = pts[i + 1];
        const mix = (u, w2) => u == null || w2 == null ? (u == null ? w2 : u) : u + (w2 - u) * t;
        out.push({ x, y, v: mix(a.v, b.v), hr: mix(a.hr, b.hr), acc: mix(a.acc, b.acc), rep: t < 0.5 ? a.rep : b.rep, t: mix(a.t, b.t) });
      }
    }
    const last = pts[pts.length - 1];
    out.push({ x: last.xy[0], y: last.xy[1], v: last.v, hr: last.hr, acc: last.acc, rep: last.rep, t: last.t });
    return out;
  }

  // A wash: pigment let into wet paper. Soft in the middle, and darkest where it
  // dried last, at the edge — the water carries the pigment outward and leaves it there.
  function wash(g, x, y, r, ink, a, rnd) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${ink[0]},${ink[1]},${ink[2]},${a * 0.30})`);
    grd.addColorStop(0.55, `rgba(${ink[0]},${ink[1]},${ink[2]},${a * 0.38})`);
    grd.addColorStop(0.86, `rgba(${ink[0]},${ink[1]},${ink[2]},${a * 0.75})`);
    grd.addColorStop(0.95, `rgba(${ink[0]},${ink[1]},${ink[2]},${a * 1.15})`);
    grd.addColorStop(1, `rgba(${ink[0]},${ink[1]},${ink[2]},0)`);
    g.fillStyle = grd;
    // the water's edge is lobed, not round: three slow waves and a little tremor
    const f1 = rnd() * 6.28, f2 = rnd() * 6.28, f3 = rnd() * 6.28, N = 40;
    g.beginPath();
    for (let k = 0; k <= N; k++) {
      const ang = k / N * Math.PI * 2;
      const rr = r * (1 + 0.16 * Math.sin(2 * ang + f1) + 0.12 * Math.sin(3 * ang + f2) + 0.08 * Math.sin(5 * ang + f3) + 0.05 * (rnd() - 0.5));
      const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
      if (!k) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath(); g.fill();
  }

  function layDay(ctx, lc, day, TURN, today) {
    const st = day.stats, rnd = prng(day.d), widthAt = widthFn(day);
    // where the sheet stands on this day: turned by the body's nights so far
    const ang = (TURN[day.d] || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    // the day's own frame: metres around home, turned, then fitted to the sheet inside the margin
    const mxy = (x, y) => [x * ca - y * sa, x * sa + y * ca];   // metres around home, as the record arrives
    const all = day.segs.flat();                                  // the circle of the house never left the house
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of all) { const [x, y] = mxy(p[0], p[1]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (!all.length) return;
    const spanX = Math.max(RULE.minSpan, x1 - x0), spanY = Math.max(RULE.minSpan, y1 - y0);
    const mg = Math.min(W, H) * RULE.margin;
    const mPerPx = Math.max(spanX / (W - 2 * mg), spanY / (H - 2 * mg));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const proj = (px, py) => { const [x, y] = mxy(px, py); return [W / 2 + (x - cx) / mPerPx, H / 2 + (y - cy) / mPerPx]; };

    // ink of the day: temperature from the hour the body moved, density from how new and how winding the way was
    const warm = clamp(0.5 - 0.5 * Math.cos((st.hourMean - 3) / 24 * 2 * Math.PI) - 0.6 * st.nightFrac, 0, 1);
    const ink = RULE.inkCold.map((c, i) => Math.round(c + (RULE.inkWarm[i] - c) * warm));
    // the two inks the day's brush is loaded with: the cold of the hour and the warm of the blood.
    // Which one a hair carries at a point is the heart's share of effort there — the melange.
    const inkA = RULE.inkCold.map((c, i) => Math.round(c + (RULE.inkWarm[i] - c) * warm * 0.7));
    const inkB = RULE.inkBlood;
    const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
    const effortAt = e => e == null || !day.effort ? 0.3 : clamp(e, 0, 1);
    const wind = clamp(((st.tortuosity || 1) - 1) / 3, 0, 1);
    const density = 0.74 + 0.26 * clamp(0.6 * st.newFrac + 0.4 * wind, 0, 1);
    const inkCss = `rgb(${ink[0]},${ink[1]},${ink[2]})`;
    // dry brush: a day of many reversals leaves a streaky stroke
    const dry = clamp((st.turns / Math.max(0.3, st.distance / 1000)) / 25, 0, 0.7);
    // bleed: the climb soaks into the paper around the stroke
    const bleed = clamp(st.altGain / 120, 0, 1);

    lc.clearRect(0, 0, W, H);
    let prevEnd = null, prevT = null;
    for (const seg of day.segs) {
      const pts = [];
      for (const p of seg) pts.push({ xy: proj(p[0], p[1]), t: p[2], v: p[3], acc: p[4] == null ? 12 : p[4], hr: p[5] == null ? null : p[5], rep: p[6] || 0 });
      if (!pts.length) continue;
      if (prevEnd) {   // the brush was lifted: a hairline joins the two touches, broken by hand, the longer the lift the sparser
        const gap = clamp((pts[0].t - prevT) / 60, 1, 180);
        const ax = prevEnd[0], ay = prevEnd[1], bx = pts[0].xy[0], by = pts[0].xy[1];
        const L = Math.hypot(bx - ax, by - ay), on = Math.max(2, 40 - gap / 5), off = 3 + gap / 20;
        lc.strokeStyle = css(inkA); lc.lineWidth = 0.5;
        for (let s = 0; s < L; s += on + off) {
          const e = Math.min(L, s + on * (0.6 + rnd() * 0.8));
          const j = (rnd() - 0.5) * 1.6, ux = (bx - ax) / (L || 1), uy = (by - ay) / (L || 1);
          lc.globalAlpha = 0.3 + rnd() * 0.35;
          lc.beginPath();
          lc.moveTo(ax + ux * s - uy * j, ay + uy * s + ux * j);
          lc.lineTo(ax + ux * e - uy * j, ay + uy * e + ux * j);
          lc.stroke();
        }
        lc.globalAlpha = 1;
      }
      const road = ride(pts, 2);
      const L = road.length;
      // Pressure: the step woven with the heart, smoothed a little, then made uneven by the
      // heart's own unevenness — a beat that jumps from the beat before makes the hand jump.
      const wAt = road.map(p => widthAt(p.v, p.hr));
      for (let i = 1; i < L; i++) wAt[i] = wAt[i - 1] + (wAt[i] - wAt[i - 1]) * 0.45;
      for (let i = L - 2; i >= 0; i--) wAt[i] = wAt[i] + (wAt[i + 1] - wAt[i]) * 0.45;
      { let hs = road[0].hr;
        for (let i = 0; i < L; i++) {
          const hr = road[i].hr;
          if (hr != null && hs != null) { hs += (hr - hs) * 0.06; const jump = clamp((hr - hs) * (day.span || 0) / 12, -1, 1); wAt[i] *= 1 + 0.8 * jump; }
          else if (hr != null) hs = hr;
        } }
      const nrm = [];
      for (let i = 0; i < L; i++) {
        const a = road[Math.max(0, i - 1)], b = road[Math.min(L - 1, i + 1)];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        nrm.push([-dy / len, dx / len]);
      }
      const taperAt = i => { const e = Math.max(3, Math.min(30, L * 0.12)); return Math.pow(Math.min(clamp(i / e, 0, 1), clamp((L - 1 - i) / e, 0, 1)), 0.45); };
      const grainAt = i => clamp((road[i].acc - 6) / 25, 0, 1);

      // WATER. The brush comes back wet from under a roof: the longer the lift, the wider the bloom
      // where it first touches the paper again.
      if (prevEnd) {
        const mins = clamp((pts[0].t - prevT) / 60, 0, 180), r = Math.min(64, 6 + mins * RULE.wetLift);
        for (let k = 0; k < 3; k++) { const ang = rnd() * 6.28, d = r * 0.3 * rnd(); wash(lc, pts[0].xy[0] + Math.cos(ang) * d, pts[0].xy[1] + Math.sin(ang) * d, r * (0.6 + 0.6 * rnd()), inkA, 0.24, rnd); }
      }
      // Standing lets water into the paper before it pools: every dwell of forty seconds and more
      // spreads a wash the size of the wait, in the ink of the effort at that place.
      for (let i = 1; i < pts.length; i++) {
        const dt = pts[i].t - pts[i - 1].t;
        if (dt < RULE.wetDwell || dt > RULE.poolAfter || rnd() < 0.4) continue;
        const r = 10 + Math.sqrt(dt) * 2.2, e = effortAt(pts[i].hr), c = inkA.map((v, k) => Math.round(v + (inkB[k] - v) * e));
        wash(lc, pts[i].xy[0], pts[i].xy[1], r * (0.8 + 0.5 * rnd()), c, 0.22 + 0.12 * e, rnd);
      }
      // the riverbed: ground walked on earlier days keeps a wet stain under the stroke
      for (let i = 0; i < L; i += 4) {
        const deep = clamp(road[i].rep / RULE.riverAt, 0, 1);
        if (deep <= 0) continue;
        wash(lc, road[i].x, road[i].y, wAt[i] * (1.2 + 1.4 * deep), inkA, RULE.riverInk * deep * 0.6, rnd);
      }
      // the bleed: the climb lets ink into the paper along the stroke
      if (bleed > 0.05) {
        for (let i = 0; i < L; i += 13) {
          if (rnd() > 0.35 * bleed) continue;
          const side = rnd() < 0.5 ? -1 : 1, d = wAt[i] * (0.5 + rnd() * 0.5) * side;
          wash(lc, road[i].x + nrm[i][0] * d, road[i].y + nrm[i][1] * d, wAt[i] * (0.5 + rnd() * 0.9), inkA, 0.07 + 0.10 * bleed, rnd);
        }
      }

      // THE BODY: one loaded pass in the cold ink, edges ragged where the sky was narrow,
      // thinning to nothing where the brush comes down and lifts off
      const edge = (i, side) => {
        const w = wAt[i] * taperAt(i) * 0.5, g = grainAt(i);
        const j = 1 + g * 0.45 * (rnd() - 0.5) + 0.12 * (rnd() - 0.5);
        return [road[i].x + nrm[i][0] * w * j * side, road[i].y + nrm[i][1] * w * j * side];
      };
      lc.fillStyle = css(inkA); lc.globalAlpha = 0.93;
      lc.beginPath();
      { const [x, y] = edge(0, 1); lc.moveTo(x, y); }
      for (let i = 1; i < L; i++) { const [x, y] = edge(i, 1); lc.lineTo(x, y); }
      for (let i = L - 1; i >= 0; i--) { const [x, y] = edge(i, -1); lc.lineTo(x, y); }
      lc.closePath(); lc.fill();
      // THE MELANGE: the warm ink of the blood laid into the body in patches, as much as the heart worked there
      for (let i0 = 0; i0 < L - 1; i0 += 8) {
        const i1 = Math.min(L - 1, i0 + 10), e = effortAt(road[Math.min(L - 1, i0 + 4)].hr);
        if (e < 0.05) continue;
        lc.fillStyle = css(inkB); lc.globalAlpha = 0.7 * e * e;
        const side = rnd() < 0.5 ? 1 : -1, part = 0.3 + 0.5 * rnd();        // a patch inside the body, not its edge
        lc.beginPath();
        for (let i = i0; i <= i1; i++) { const w = wAt[i] * taperAt(i) * 0.5; const x = road[i].x + nrm[i][0] * w * side * (part - 0.55), y = road[i].y + nrm[i][1] * w * side * (part - 0.55); if (i === i0) lc.moveTo(x, y); else lc.lineTo(x, y); }
        for (let i = i1; i >= i0; i--) { const w = wAt[i] * taperAt(i) * 0.5; lc.lineTo(road[i].x + nrm[i][0] * w * side * (part + 0.3), road[i].y + nrm[i][1] * w * side * (part + 0.3)); }
        lc.closePath(); lc.fill();
      }

      // the hairs: bristles scratched through the body and dragged past its edge, each hair
      // taking the ink of the effort where it runs and skipping where the brush has run dry
      const nB = clamp(Math.round(3 + wAt.reduce((a, b) => a + b, 0) / L * 0.5), 4, 12);
      lc.lineCap = 'round';
      for (let b = 0; b < nB; b++) {
        const off = nB === 1 ? 0 : (b / (nB - 1) - 0.5) * (1.05 + rnd() * 0.3);
        const pale = rnd() < 0.35, thr = rnd();                         // a scraping hair, or where this hair turns warm
        let hold = 0.6 + rnd() * 0.4, run = null, cur = null;
        lc.lineWidth = Math.max(0.35, (wAt[0] / nB) * (0.4 + rnd() * 0.6));
        for (let i = 0; i < L; i++) {
          hold = Math.max(0.1, hold - (0.0004 + rnd() * 0.0012));
          const skip = rnd() < dry * 0.55 + grainAt(i) * 0.12 || (pale && rnd() < 0.25);
          const w = wAt[i] * taperAt(i) * 0.5;
          const col = pale ? RULE.ground : (effortAt(road[i].hr) > thr ? css(inkB) : css(inkA));
          if (skip || w < 0.6 || (run && col !== cur)) { if (run) { lc.stroke(); run = null; } if (skip || w < 0.6) continue; }
          const lat = off * w * (1 + 0.12 * Math.sin(i * 0.07 + b));
          const x = road[i].x + nrm[i][0] * lat, y = road[i].y + nrm[i][1] * lat;
          if (!run) { cur = col; lc.strokeStyle = col; lc.globalAlpha = clamp((pale ? 0.30 : 0.5) * hold, 0.05, 0.6); lc.beginPath(); lc.moveTo(x, y); run = 1; }
          else lc.lineTo(x, y);
        }
        if (run) lc.stroke();
      }
      lc.globalAlpha = 1;

      // a stop pools ink: the longer the body stood, the wider the pool, dark in the middle
      // and hardest at the rim, where the water dried last
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], dt = b.t - a.t;
        if (dt <= RULE.poolAfter) continue;
        const r = Math.min(RULE.poolMax, 8 + Math.sqrt(dt - RULE.poolAfter) * 0.8) / 2;
        const e = effortAt(b.hr), c = inkA.map((v, k) => Math.round(v + (inkB[k] - v) * e));
        for (let k = 0; k < 2; k++) { const ang = rnd() * 6.28, d = r * 0.4 * rnd(); wash(lc, b.xy[0] + Math.cos(ang) * d, b.xy[1] + Math.sin(ang) * d, r * (1.3 + 1.0 * rnd()), c, 0.30, rnd); }
        lc.fillStyle = css(c); lc.globalAlpha = 0.9;
        lc.beginPath();
        const N = 22;
        for (let k = 0; k <= N; k++) { const ang = k / N * Math.PI * 2, rr = r * 0.62 * (0.88 + 0.24 * rnd()); const px = b.xy[0] + Math.cos(ang) * rr, py = b.xy[1] + Math.sin(ang) * rr; if (!k) lc.moveTo(px, py); else lc.lineTo(px, py); }
        lc.closePath(); lc.fill();
        lc.globalAlpha = 1;
      }
      lc.globalAlpha = 1;
      prevEnd = pts[pts.length - 1].xy; prevT = pts[pts.length - 1].t;
    }
    const age = daysBetween(day.d, today);
    ctx.globalAlpha = density * Math.max(RULE.ageFloor, 1 - RULE.ageStep * age);
    ctx.drawImage(lc.canvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }


  const DAY = 864e5;
  const nextDay = (iso) => new Date(Date.parse(iso + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);

  // A day is frozen the morning after it was walked, and that morning is the
  // one its sheet shows: the youngest day on it is one day old.
  function paintDay(p, day, DATA, w, h) {
    const all = ((DATA && DATA.days) || [day]).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
    const days = all.filter((d) => d.d <= day.d);
    const today = nextDay(day.d);
    const TURN = {};
    { let a = 0; for (const d of days) { a += typeof d.turn === 'number' ? d.turn : 0; TURN[d.d] = a; } }

    const sheet = document.createElement('canvas'); sheet.width = W; sheet.height = H;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = RULE.ground; ctx.fillRect(0, 0, W, H);
    { // paper: a fixed grain and a few fibres, the same on every sheet
      const r = prng('sheet');
      for (let i = 0; i < 60000; i++) {
        const x = r() * W, y = r() * H, s = 0.4 + r() * 1.3, a = 0.02 + r() * 0.07;
        ctx.fillStyle = r() < 0.25 ? `rgba(120,110,90,${a})` : `rgba(60,45,20,${a})`;
        ctx.fillRect(x, y, s, s);
      }
      for (let i = 0; i < 260; i++) {
        const x = r() * W, y = r() * H, l = 4 + r() * 26, a = r() * Math.PI;
        ctx.strokeStyle = `rgba(90,75,50,${0.03 + r() * 0.05})`; ctx.lineWidth = 0.5 + r() * 0.6;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    }
    const layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    const lc = layer.getContext('2d'); lc.lineCap = 'round'; lc.lineJoin = 'round';
    for (const d of days) layDay(ctx, lc, d, TURN, today);

    w = Math.round(w || W); h = Math.round(h || H);
    if (w === W && h === H) return sheet;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const oc = out.getContext('2d'); oc.imageSmoothingQuality = 'high';
    oc.drawImage(sheet, 0, 0, w, h);
    return out;
  }

  window.S603Painter = { paintDay };
})();
