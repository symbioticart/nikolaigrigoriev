/* ARCHIPELAGO — one night, one sheet.
 * ─────────────────────────────────────────────────────────────────────────────
 * Sleep is the only stretch of a day in which a person cannot pose. The rest of
 * the time he presents himself; a pose is held with muscle, attention and will,
 * and at night there is nothing left to hold it with. The ring does not record a
 * picture of the man — it records what is left of him when the pose cannot be
 * held.
 *
 * THE FORM. Every five minutes of sleep is one charge. Its weight is the depth
 * of those minutes, its radius the body's recovery in them. The painting is the
 * level set of their sum:
 *
 *      f(p) = Σ wᵢ · exp( −|p − cᵢ|² / 2σᵢ² ),      body: f(p) = τ
 *
 * While the body keeps returning, neighbouring minutes merge into one mass;
 * when it stops, the mass falls apart into islands. Nothing else decides whether
 * a night is one body or an archipelago — not composition, not the artist.
 *
 * BLACK ON BLACK. There are not two materials here, because at night there are
 * not two. There is one body and one darkness, and they differ not in colour but
 * in HOW THE INK WENT DOWN: in density, in the direction of the grain, and in
 * how much light the edge catches. The ground is the same print fill driven to
 * its darkest end — uneven, pooling, grained — so the night is not a backdrop
 * but the substance everything is made of, the body included. The body is not
 * lying on the night; it is cut out of it.
 *
 * THE EDGE IS THE PULSE. The rim is where the body meets the dark. Of everything
 * the ring records, the heart is the only thing the body never switches off:
 * phases, depth and recovery are states it enters and leaves, the heart neither
 * enters nor leaves. So the light on the boundary does not decorate the form —
 * it testifies that someone is inside the mass. An even light would mean an
 * object. An uneven one means something alive.
 *
 * NO RANDOMNESS. Where a "random" quantity is needed it is hashed from the exact
 * minute or the exact point of the sheet it describes, so it is a property of
 * that minute or that point. One night always yields the same sheet.
 *
 * NOT USED: the sleep score. The sheet never repeats the instrument's verdict.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  const RW = 900, RH = 1200;                 // the sheet is composed at this size
  const TAU = 0.60;                          // the level set that is the body
  const INK = [16, 15, 13];                  // the brush's own black

  // the ground and the body are the same fill, driven to two different ends
  const GROUND = { lo: [7, 7, 6],    hi: [22, 21, 19] };
  const ISLAND = { lo: [26, 25, 22], hi: [74, 71, 62] };
  const RIM    = [188, 182, 164];
  const RIM_A  = 0.62;                       // how much light the edge may catch
  const WEAR   = 0.16;                       // how much ink the dry brush lifts
  const GRAIN  = 0.52;

  // ── helpers ───────────────────────────────────────────────────────────────
  const off = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c.getContext('2d'); };
  const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const clamp01 = v => Math.max(0, Math.min(1, v));

  function seedOf(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // deterministic "noise": a property of that point of the sheet, never a throw
  function hsh(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + (s || 0) * 2246822519) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ── reading the night ─────────────────────────────────────────────────────
  // A cycle closes when REM gives way to something that is not REM. The shuttle
  // makes one pass per cycle, so the number of passes is the night's, not mine.
  function cyclesOf(night) {
    const s = night.phase5 || '', out = [];
    let start = 0, rem = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '3') rem = true;
      else if (rem && s[i] !== '4') { if (i - start >= 6) out.push({ a: start, b: i }); start = i; rem = false; }
    }
    if (s.length - start >= 6) out.push({ a: start, b: s.length });
    return out.length ? out : [{ a: 0, b: s.length }];
  }

  // Recovery is read against the owner's own record, never against a norm: the
  // question is whether this body came back, not whether it beat anyone.
  function buildNorms(nights) {
    const hrv = [];
    for (const n of nights) for (const v of (n.hrv || [])) if (v != null) hrv.push(v);
    hrv.sort((a, b) => a - b);
    if (!hrv.length) return { hrvLo: 0, hrvHi: 1 };
    return { hrvLo: hrv[Math.floor(hrv.length * 0.10)], hrvHi: hrv[Math.floor(hrv.length * 0.90)] };
  }
  function hrvN(night, i, norms) {
    const a = night.hrv || []; let v = a[i];
    for (let k = i; k >= 0 && v == null; k--) v = a[k];
    if (v == null) return 0.4;
    return clamp01((v - norms.hrvLo) / Math.max(1, norms.hrvHi - norms.hrvLo));
  }
  function moveAt(night, i) {                 // peak restlessness of those minutes
    const s = night.move30 || ''; let p = 1;
    for (let k = i * 10; k < Math.min(s.length, (i + 1) * 10); k++) p = Math.max(p, +s[k] || 1);
    return p;
  }

  // ── the charges ───────────────────────────────────────────────────────────
  const WGT = { '1': 1.00, '3': 0.66, '2': 0.38, '4': 0 };   // deep · rem · light · awake
  function chargesOf(night, norms) {
    const ML = RW * 0.095, MT = RH * 0.085;
    const AW = RW - ML * 2, AH = RH - MT - RH * 0.125;
    const s = night.phase5 || '', n = s.length || 1;
    const cyc = cyclesOf(night);
    const ROWS = Math.max(3, Math.min(9, cyc.length));
    const rowH = AH / ROWS;
    // falling asleep takes up its real space at the head of the first pass and
    // stays empty: the wait is part of the night, and it is not a form
    const latFrac = Math.min(0.5, (night.latency || 0) / 3600 / 3);

    // the pulse of this night on its own scale — absolute beats say nothing,
    // only how far the heart rose above its own floor
    const hrArr = night.hr || [], floor = night.lowest_hr || 0;
    const over = hrArr.filter(v => v != null).map(v => Math.max(0, v - floor)).sort((a, b) => a - b);
    const hrTop = over.length ? Math.max(4, over[Math.floor((over.length - 1) * 0.9)]) : 1;
    const pulseAt = i => {
      let v = hrArr[i];
      for (let k = i; k >= 0 && v == null; k--) v = hrArr[k];
      return v == null ? 0.35 : clamp01((v - floor) / hrTop);
    };

    const all = [];
    for (let i = 0; i < n; i++) {
      const w = WGT[s[i]]; if (!w) continue;        // awake is not drawn: it only parts
      let row = cyc.findIndex(c => i >= c.a && i < c.b);
      if (row < 0) row = Math.min(ROWS - 1, Math.floor(i / n * ROWS));
      row = Math.min(ROWS - 1, row);
      const c = cyc[Math.min(cyc.length - 1, row)];
      let t = (i - c.a) / Math.max(1, c.b - c.a);
      if (row === 0) t = latFrac + t * (1 - latFrac);
      const fine = hrvN(night, i, norms), mvt = (moveAt(night, i) - 1) / 3;
      all.push({
        x: ML + AW * (row % 2 === 0 ? t : 1 - t),     // the shuttle runs back and forth
        y: MT + rowH * (row + 0.5) + (0.5 - w) * rowH * 0.24,
        w: w * (1.18 - mvt * 0.34),                   // a restless minute weighs less
        s: 20 + fine * 40,                            // recovery reaches further
        pulse: pulseAt(i),
      });
    }
    return { all, rows: ROWS, band: rowH, top: MT };
  }

  // ── the field ─────────────────────────────────────────────────────────────
  function fieldOf(W, H, charges, scale) {
    scale = scale || 3;
    const w = Math.ceil(W / scale), h = Math.ceil(H / scale);
    const d = new Float32Array(w * h);
    for (const ch of charges) {
      const s = ch.s;
      const x0 = Math.max(0, Math.floor((ch.x - 3 * s) / scale)), x1 = Math.min(w - 1, Math.ceil((ch.x + 3 * s) / scale));
      const y0 = Math.max(0, Math.floor((ch.y - 3 * s) / scale)), y1 = Math.min(h - 1, Math.ceil((ch.y + 3 * s) / scale));
      const inv = 1 / (2 * s * s);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x * scale - ch.x, dy = y * scale - ch.y;
        d[y * w + x] += ch.w * Math.exp(-(dx * dx + dy * dy) * inv);
      }
    }
    return { w, h, scale, d };
  }
  // Same summation, but every kernel carries a number of its own; dividing the
  // weighted sum by the weight gives a smooth map of that quantity across the
  // sheet. The rim's brightness is read from here, so it never jumps.
  function valueField(W, H, charges, key, scale) {
    scale = scale || 3;
    const w = Math.ceil(W / scale), h = Math.ceil(H / scale);
    const num = new Float32Array(w * h), den = new Float32Array(w * h);
    for (const ch of charges) {
      const s = ch.s, v = ch[key] || 0;
      const x0 = Math.max(0, Math.floor((ch.x - 3 * s) / scale)), x1 = Math.min(w - 1, Math.ceil((ch.x + 3 * s) / scale));
      const y0 = Math.max(0, Math.floor((ch.y - 3 * s) / scale)), y1 = Math.min(h - 1, Math.ceil((ch.y + 3 * s) / scale));
      const inv = 1 / (2 * s * s);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = x * scale - ch.x, dy = y * scale - ch.y;
        const g = Math.exp(-(dx * dx + dy * dy) * inv);
        num[y * w + x] += g * v; den[y * w + x] += g;
      }
    }
    const d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = den[i] > 1e-6 ? num[i] / den[i] : 0.5;
    return { w, h, scale, d };
  }
  function samp(f, px, py) {
    const x = px / f.scale, y = py / f.scale;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= f.w || y0 >= f.h) return 0;
    const tx = x - x0, ty = y - y0;
    const x1 = Math.min(f.w - 1, x0 + 1), y1 = Math.min(f.h - 1, y0 + 1);
    const a = f.d[y0 * f.w + x0], b = f.d[y0 * f.w + x1];
    const c = f.d[y1 * f.w + x0], e = f.d[y1 * f.w + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
  }
  // 1 on the level set itself, 0 deep inside the mass
  const edgeFall = (a, tau) => clamp01(1 - (a - tau) / (tau * 0.95));

  // ── the ground's grain: the air of that night ─────────────────────────────
  // The ground belongs to no single minute — it is the whole night. So it
  // carries the two quantities that belong to no minute either, and both are
  // about air rather than body: how the man breathed, and how badly.
  // The ceiling is set so the grain cannot be seen without looking for it.
  function groundNoise(W, H, night, seed) {
    const breath = Math.max(9, Math.min(21, night.avg_breath || 14));
    const cell = Math.max(2, Math.min(7, Math.round(6 - (breath - 11) / 8 * 4)));   // slow breath, coarser grain
    const amp = 0.010 + Math.min(1, (night.bdi || 0) / 6) * 0.030;                  // 1.0 % … 4.0 %
    const ctx = off(W, H), img = ctx.createImageData(W, H), D = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = hsh((x / cell) | 0, (y / cell) | 0, seed & 0xffff);
      const i = (y * W + x) * 4;
      D[i] = D[i + 1] = D[i + 2] = n < 0.5 ? 0 : 255;
      D[i + 3] = Math.round(amp * 255 * (0.55 + Math.abs(n - 0.5)));
    }
    ctx.putImageData(img, 0, 0);
    return ctx.canvas;
  }

  // ── print fill ────────────────────────────────────────────────────────────
  const TEXCACHE = new Map();
  function texFor(seed, tempDev, ends, tag) {
    const key = tag + ':' + seed;
    if (TEXCACHE.has(key)) return TEXCACHE.get(key);
    // a body running warm lays the ink down heavier
    const t = Math.max(-0.7, Math.min(0.7, tempDev || 0)), lift = Math.round(-t * 7);
    const tx = PrintTexture.create(RW, RH, seed, {
      lo: ends.lo.map(v => Math.max(0, v + lift)),
      hi: ends.hi.map(v => Math.max(1, v + lift)),
      grain: 40, cloudScale: 9, cloudContrast: 1.55, cloudBias: 0.26,
    });
    if (TEXCACHE.size > 24) TEXCACHE.clear();
    TEXCACHE.set(key, tx);
    return tx;
  }

  // ── the dry brush ─────────────────────────────────────────────────────────
  // The furrows run with the shuttle and turn with it. The brush never invents a
  // shape — it only wears the ink it is given.
  function brushPass(p, ch, seed) {
    p.clear();
    oil.seed(seed);
    oil.set('impasto', INK, 20);
    const px = x => x - RW / 2, py = y => y - RH / 2;
    const w = Math.max(11, ch.band / 9);
    oil.strokeWeight(w);
    for (let r = 0; r < ch.rows; r++) {
      const y0r = ch.top + ch.band * r, tilt = (r % 2 ? -1 : 1) * 0.035;
      const lines = Math.max(3, Math.ceil(ch.band / (w * 0.6)));
      for (let i = 0; i < lines; i++) {
        const yy = y0r + ch.band * (i + 0.5) / lines;
        oil.line(px(-20), py(yy - tilt * RW / 2), px(RW + 20), py(yy + tilt * RW / 2));
      }
    }
    oil.flush();
  }

  // ── the press ─────────────────────────────────────────────────────────────
  // `sil` is the silence of this day (see art/silence.js). It is used for ONE
  // thing: the rim goes out first. When the signal stops, the heart is the first
  // thing to stop being visible; the mass loses density afterwards, and by the
  // ninetieth day only the bare dark ground is left — the night with nobody in
  // it. The form itself never moves: silence dims, it does not redraw.
  function paintDay(p, night, DATA, w, h, sil) {
    const nights = (DATA && DATA.nights) || [night];
    const norms = buildNorms(nights);
    const ch = chargesOf(night, norms);
    const seed = seedOf('archipelago|' + night.day);

    const out = off(RW, RH);

    const gTex = texFor(seed, night.temp_dev, GROUND, 'g');
    out.fillStyle = '#000'; out.fillRect(0, 0, RW, RH);
    out.drawImage(gTex.form, 0, 0, RW, RH);
    out.drawImage(groundNoise(RW, RH, night, seed), 0, 0);

    if (!ch.all.length) return finish(out.canvas, w, h);   // a night with nothing in it

    const fA = fieldOf(RW, RH, ch.all, 3);
    const fP = valueField(RW, RH, ch.all, 'pulse', 3);

    // the body, and the light its edge catches
    const bctx = off(RW, RH), bimg = bctx.createImageData(RW, RH), B = bimg.data;
    const ectx = off(RW, RH), eimg = ectx.createImageData(RW, RH), E = eimg.data;
    const rimDim = sil ? Math.max(0, 1 - (sil.gray || 0) * 1.35) : 1;   // the heart goes out first
    for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
      const a = samp(fA, x, y);
      if (a < TAU * 0.55) continue;
      const s = smooth01((a - TAU * 0.72) / (TAU * 0.56));
      if (s <= 0.004) continue;
      const i = (y * RW + x) * 4;
      B[i + 3] = Math.round(s * 255);
      // a calm heart barely shines
      const e = s * Math.pow(edgeFall(a, TAU), 2.1) * (0.22 + 1.34 * samp(fP, x, y)) * rimDim;
      E[i + 3] = Math.round(Math.min(1, e) * 255);
    }
    bctx.putImageData(bimg, 0, 0);
    ectx.putImageData(eimg, 0, 0);

    const isl = off(RW, RH);
    isl.drawImage(bctx.canvas, 0, 0);
    isl.globalCompositeOperation = 'source-in';
    isl.drawImage(texFor(seed ^ 0x9e3779b9, night.temp_dev, ISLAND, 'i').form, 0, 0, RW, RH);
    isl.globalCompositeOperation = 'source-over';

    // the brush wears the ink along its own furrows
    if (p && typeof oil !== 'undefined') {
      try {
        brushPass(p, ch, seed);
        const src = p.canvas || (p._renderer && p._renderer.canvas);
        if (src) {
          isl.globalCompositeOperation = 'destination-out';
          isl.globalAlpha = WEAR;
          isl.drawImage(src, 0, 0, src.width, src.height, 0, 0, RW, RH);
          isl.globalAlpha = 1; isl.globalCompositeOperation = 'source-over';
        }
      } catch (e) { /* the sheet stands without the brush; it must never fail on it */ }
    }
    out.drawImage(isl.canvas, 0, 0);

    // the edge catches light
    const rim = off(RW, RH);
    rim.drawImage(ectx.canvas, 0, 0);
    rim.globalCompositeOperation = 'source-in';
    rim.fillStyle = `rgb(${RIM[0]},${RIM[1]},${RIM[2]})`;
    rim.fillRect(0, 0, RW, RH);
    out.globalAlpha = RIM_A;
    out.globalCompositeOperation = 'lighter';
    out.drawImage(rim.canvas, 0, 0);
    out.globalAlpha = 1; out.globalCompositeOperation = 'source-over';

    PrintTexture.overlayGrain(out, gTex, GRAIN);
    return finish(out.canvas, w, h);
  }

  // The host asks for a particular delivery size; the sheet is always composed
  // at its own, so the work cannot change with the window it is shown in.
  function finish(canvas, w, h) {
    w = Math.round(w || RW); h = Math.round(h || RH);
    if (w === RW && h === RH) return canvas;
    const c = off(w, h);
    c.imageSmoothingQuality = 'high';
    c.drawImage(canvas, 0, 0, w, h);
    return c.canvas;
  }

  window.ArchipelagoPainter = { paintDay };
})();
