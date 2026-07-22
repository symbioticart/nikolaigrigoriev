// Variations 87 — the painter.
// Composition is a continuous function of the day's entangled channels.
// The painter never sees a raw measurement: it receives the date, the seed,
// and anonymous channels in [0,1], each a convolution of at least two
// causally-ranked signals of one body. The rule is fixed; the body moves.

// === PALETTES ===
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

// === CHANNEL MAP (transport indexes — meanings live in the sealed appendix) ===
const CH = {
  KEY: 0, GROUND: 1, WAKING: 2, AGITATION: 3, SCATTER: 4, FLOW: 5,
  SPAN: 6, SWAY: 7, DEPTH: 8, FULLNESS: 9, ONSET: 10, HEAT: 11,
  EXERTION: 12, PHASE_A: 13, PHASE_B: 14, PHASE_C: 15, PHASE_D: 16,
  FIELD_X: 17, FIELD_Y: 18, TILT: 19,
};

// === HSL MODULATION ===
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
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

// Apply day-keyed modulation to a color, ensuring contrast with background.
function modulateColor(rgb, ch, keyT, bgL, jitter = 0) {
  let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  // Saturation compression gives the palette its noble, earthy register
  // (terracotta, ochre, teal, dusty red) — the muting IS the colour identity
  // of the work. Fullness scales it, with a floor so hard days still read.
  s *= (0.55 + 0.45 * ch[CH.FULLNESS]);

  // Key shifts lightness slightly
  l += (keyT - 0.5) * 0.12;

  // Heat: shift hue warm/cool
  h -= (ch[CH.HEAT] - 0.5) * 2 * 25;

  // Depth pushes tonal contrast: lightness away from 0.5
  const contrast = 0.55 + ch[CH.DEPTH] * 0.45;
  l = 0.5 + (l - 0.5) * contrast;

  // Ensure the mark has contrast with the ground
  if (bgL != null) {
    const delta = l - bgL;
    if (bgL < 0.35 && delta < 0.18) l = bgL + 0.18 + jitter * 0.35;
    else if (bgL > 0.7 && delta > -0.18) l = bgL - 0.18 - jitter * 0.45;
  }

  l = Math.max(0.05, Math.min(0.95, l));
  s = Math.max(0, Math.min(1, s));

  return hslToRgb(h, s, l);
}

// Ground color: fixed warm ivory (cream paper)
function backgroundColor() {
  return hslToRgb(42, 0.35, 0.90);
}

// Mulberry32 PRNG — deterministic, fast, good distribution
function makeRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// === HALTON LOW-DISCREPANCY SEQUENCE ===
function halton(i, base) {
  let f = 1, r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

// === CONTINUOUS PALETTE SAMPLING ===
function samplePalette(palette, t) {
  t = Math.max(0, Math.min(1, t));
  const p = t * (palette.length - 1);
  const i = Math.floor(p);
  const frac = p - i;
  const a = palette[i];
  const b = palette[Math.min(i + 1, palette.length - 1)];
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  ];
}

// Palette pick as a continuous function of the key and field value at (x, y).
function pickColorField(ch, keyT, bgL, fv, rng) {
  const useWarm = (fv * 0.4 + 0.5) < keyT;
  const pool = useWarm ? WARM : DEEP;
  const t = Math.abs(fv);
  const base = samplePalette(pool, t);
  return modulateColor(base, ch, keyT, bgL, rng ? rng() : 0);
}

// === MAIN PAINTER ===
// day = { d: ISO date, s: seed, c: channels[20], i: incomplete flag }.
// `silence` in [0,1]: how deep the current stillness is (0 = a living day,
// 1 = the terminal threshold). The unwritten ground grows with silence —
// absence is painted as form, not simulated as decay.
function paintDay(p, day, data, W, H, silence = 0) {
  const ch = day.c;
  const keyT = ch[CH.KEY];

  // Seed comes from the server-fixed formula: owner | date | record.
  const seed = day.s;
  const rng = makeRNG(seed);
  oil.seed(seed);

  // Incomplete days (the body was only partly recorded) are written faintly:
  // fewer marks, never substituted with an invented "average" day.
  const presence = day.i ? 0.55 : 1;

  // === FRACTAL FLOW FIELD (3 octaves) ===
  const freqX = 0.004 + ch[CH.FIELD_X] * 0.016;
  const freqY = 0.004 + ch[CH.FIELD_Y] * 0.016;

  const phiX  = keyT * Math.PI * 2;
  const phiY  = (1 - keyT) * Math.PI * 2;
  const phiX2 = ch[CH.SCATTER]  * Math.PI * 2;
  const phiY2 = ch[CH.FULLNESS] * Math.PI * 2;
  const phiX3 = ch[CH.DEPTH] * Math.PI * 2;
  const phiY3 = ch[CH.SWAY]  * Math.PI * 2;

  const OCT2 = 2.0;
  const OCT3 = 4.3;
  const A1 = 0.55, A2 = 0.30, A3 = 0.15;

  const fieldVal = (x, y) =>
      A1 * Math.sin(       freqX * x + phiX ) * Math.cos(       freqY * y + phiY )
    + A2 * Math.sin(OCT2 * freqX * x + phiX2) * Math.cos(OCT2 * freqY * y + phiY2)
    + A3 * Math.sin(OCT3 * freqX * x + phiX3) * Math.cos(OCT3 * freqY * y + phiY3);

  const fieldRot = (x, y) => {
    const s1x = freqX * x + phiX,   s1y = freqY * y + phiY;
    const s2x = OCT2 * freqX * x + phiX2, s2y = OCT2 * freqY * y + phiY2;
    const s3x = OCT3 * freqX * x + phiX3, s3y = OCT3 * freqY * y + phiY3;
    const gx =
        A1 *         freqX * Math.cos(s1x) * Math.cos(s1y)
      + A2 * OCT2 *  freqX * Math.cos(s2x) * Math.cos(s2y)
      + A3 * OCT3 *  freqX * Math.cos(s3x) * Math.cos(s3y);
    const gy = -(
        A1 *         freqY * Math.sin(s1x) * Math.sin(s1y)
      + A2 * OCT2 *  freqY * Math.sin(s2x) * Math.sin(s2y)
      + A3 * OCT3 *  freqY * Math.sin(s3x) * Math.sin(s3y)
    );
    return Math.atan2(gy, gx);
  };

  // === WARP FIELD — breaks the lattice ===
  const warpFx1 = freqX * 1.3, warpFy1 = freqY * 1.7;
  const warpFx2 = freqX * 1.9, warpFy2 = freqY * 1.1;
  const warpPhi1 = ch[CH.PHASE_A] * Math.PI * 2;
  const warpPhi2 = ch[CH.PHASE_B] * Math.PI * 2;
  const warpPhi3 = ch[CH.PHASE_C] * Math.PI * 2;
  const warpPhi4 = ch[CH.PHASE_D] * Math.PI * 2;
  const warpVec = (x, y, amp) => {
    const dx = Math.sin(warpFy1 * y + warpPhi1) * Math.cos(warpFx1 * x + warpPhi2);
    const dy = Math.cos(warpFx2 * x + warpPhi3) * Math.sin(warpFy2 * y + warpPhi4);
    return [dx * amp, dy * amp];
  };

  // === COMPOSITION ARMATURE ===
  const composeAngle = (ch[CH.TILT] - 0.5) * (Math.PI / 2);
  const fieldAngleMix = ch[CH.SCATTER] * 1.5;

  // Ground
  const bg = backgroundColor();
  const bgL = rgbToHsl(bg[0], bg[1], bg[2])[2];
  p.background(bg[0], bg[1], bg[2]);

  // === CONTAINMENT FRAME — the unwritten ground grows with silence ===
  const minDim = Math.min(W, H);
  const MARGIN = minDim * (0.085 + 0.28 * Math.max(0, Math.min(1, silence)));
  const xMax = W / 2 - MARGIN;
  const yMax = H / 2 - MARGIN;

  // === COMPOSITE STATES ===
  const densityFactor = 1 - keyT;
  const grounded  = ch[CH.GROUND];
  const agitation = ch[CH.AGITATION];

  // Scatter → size variance: an adaptive day spreads marks across a wide
  // range of sizes; a rigid day collapses them toward a single nervous scale.
  const sizeVar = 0.30 + ch[CH.SCATTER] * 1.50;

  const wScale = minDim / 700;

  // === THREE REGISTERS — an explicit scale hierarchy ===
  // FOUNDATION — solid colour leaves; few, mid scale; larger when the ground is deep.
  const nLarge   = Math.round((6 + grounded * 9) * presence);
  const lenLarge = minDim * (0.216 + ch[CH.SPAN] * 0.192);
  const wLarge   = (18 + grounded * 22) * wScale;
  // MODULATION — curved gestures; the woven middle.
  const nMedium   = Math.round((32 + ch[CH.WAKING] * 34) * presence);
  const lenMedium = minDim * (0.085 + ch[CH.FLOW] * 0.10);
  const wMedium   = (8 + (1 - ch[CH.FLOW]) * 10) * wScale;
  // TREMOR — beaded dotted chains: the dense network.
  const nSmall   = Math.round((60 + agitation * 85 + densityFactor * 70) * presence);
  const lenSmall = minDim * (0.08 + ch[CH.SWAY] * 0.10);
  const wSmall   = (3 + agitation * 4) * wScale;

  const curvatureMul  = 0.3 + ch[CH.SWAY] * 2.2;
  const jitterAmp     = agitation;
  const splatterCount = Math.round((ch[CH.EXERTION] * 14 + 6) * presence);

  // === STROKE HELPERS (containment-aware) ===
  const clampPt = (v, lim) => Math.max(-lim, Math.min(lim, v));

  function fitHalf(px, py, ang, half) {
    const cx = Math.abs(Math.cos(ang)), cy = Math.abs(Math.sin(ang));
    const lx = cx > 1e-3 ? (xMax - Math.abs(px)) / cx : Infinity;
    const ly = cy > 1e-3 ? (yMax - Math.abs(py)) / cy : Infinity;
    return Math.max(0, Math.min(half, lx, ly));
  }

  function innerCloud(count, startIdx, hx, hy) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const n = startIdx + i;
      pts.push({ x: (halton(n, 2) - 0.5) * 2 * hx, y: (halton(n, 3) - 0.5) * 2 * hy });
    }
    return pts;
  }

  const placeX = () => xMax * 0.94;
  const placeY = () => yMax * 0.94;

  const sizeFactor = () => Math.max(0.25, 1 + (rng() - 0.5) * sizeVar);
  const warpAmp = minDim * 0.03;

  function setWidth(baseW, fv) {
    oil.strokeWeight(baseW * (0.5 + Math.abs(fv) * 0.6) * (0.45 + rng() * 1.1));
  }

  function markStraight(cx0, cy0, baseLen, baseW, keyBias) {
    const px = clampPt(cx0, xMax), py = clampPt(cy0, yMax);
    const fv = fieldVal(px, py);
    const color = pickColorField(ch, Math.min(1, keyT + keyBias), bgL, fv, rng);
    oil.stroke(color[0], color[1], color[2]);
    setWidth(baseW, fv);
    const ang = composeAngle + fieldRot(px, py) * fieldAngleMix;
    const half = fitHalf(px, py, ang, baseLen * 0.5 * sizeFactor());
    oil.line(px - Math.cos(ang) * half, py - Math.sin(ang) * half,
             px + Math.cos(ang) * half, py + Math.sin(ang) * half);
  }

  function markCurved(cx0, cy0, baseLen, baseW, keyBias) {
    const cx = clampPt(cx0, xMax), cy = clampPt(cy0, yMax);
    const fv = fieldVal(cx, cy);
    const color = pickColorField(ch, Math.min(1, keyT + keyBias), bgL, fv, rng);
    oil.stroke(color[0], color[1], color[2]);
    setWidth(baseW, fv);
    const ang = composeAngle + fieldRot(cx, cy) * fieldAngleMix;
    const len = baseLen * sizeFactor();
    const segments = 3 + Math.floor(curvatureMul * 3);
    const segLen = len / segments;
    let x = cx - Math.cos(ang) * len / 2, y = cy - Math.sin(ang) * len / 2;
    let curA = ang;
    const pts = [{ x: clampPt(x, xMax), y: clampPt(y, yMax) }];
    for (let s = 0; s < segments; s++) {
      let dA = fieldRot(x, y) - curA;
      while (dA > Math.PI)  dA -= 2 * Math.PI;
      while (dA < -Math.PI) dA += 2 * Math.PI;
      curA += dA * curvatureMul * 0.18 + (rng() - 0.5) * 0.35 * jitterAmp;
      x += Math.cos(curA) * segLen; y += Math.sin(curA) * segLen;
      pts.push({ x: clampPt(x, xMax), y: clampPt(y, yMax) });
    }
    for (let s = 0; s < pts.length - 1; s++)
      oil.line(pts[s].x, pts[s].y, pts[s+1].x, pts[s+1].y);
  }

  // === MARK DIVERSITY ===
  // How widely the hand varies is the scatter channel: an adaptive day
  // produces a wider vocabulary of marks; a rigid one repeats itself.
  const typeVar = 0.35 + ch[CH.SCATTER] * 0.6;
  const FOUND_BRUSHES = ['filbertLarge', 'flatLarge', 'impasto'];
  const MOD_BRUSHES   = ['filbertMedium', 'filbertLarge', 'knifeSmall'];
  const TREM_BRUSHES  = ['knifeSmall', 'filbertMedium', 'knifeSmall'];

  function paintMark(cx, cy, baseLen, baseW, pool, curlBase, keyBias) {
    const bi = rng() < typeVar ? Math.floor(rng() * pool.length) : 0;
    oil.pick(pool[bi]);
    const r = rng();
    if (r < 0.12 * typeVar) {
      markStraight(cx, cy, baseLen * 0.28, baseW * 1.25, keyBias);
    } else if (r < curlBase) {
      markCurved(cx, cy, baseLen, baseW, keyBias);
    } else {
      markStraight(cx, cy, baseLen, baseW, keyBias);
    }
  }

  // === REGISTER 1 — FOUNDATION ===
  for (const c of innerCloud(nLarge, 7, placeX(), placeY())) {
    const [wx, wy] = warpVec(c.x, c.y, warpAmp);
    paintMark(c.x + wx, c.y + wy, lenLarge, wLarge, FOUND_BRUSHES, 0.25, 0);
  }

  // === REGISTER 2 — MODULATION ===
  const medHx = placeX(), medHy = placeY();
  for (let i = 0; i < nMedium; i++) {
    const c = innerCloud(1, 1019 + i, medHx, medHy)[0];
    const [wx, wy] = warpVec(c.x, c.y, warpAmp);
    paintMark(c.x + wx, c.y + wy, lenMedium, wMedium, MOD_BRUSHES, 0.7, 0);
  }

  // === REGISTER 3 — TREMOR ===
  for (const c of innerCloud(nSmall, 5003, placeX(), placeY())) {
    const jx = (rng() - 0.5) * minDim * 0.04 * jitterAmp;
    const jy = (rng() - 0.5) * minDim * 0.04 * jitterAmp;
    paintMark(c.x + jx, c.y + jy, lenSmall, wSmall, TREM_BRUSHES, 0.82, 0);
  }

  // === THROWN MARKS — exertion cast onto the surface ===
  oil.pick('knifeSmall');
  for (let i = 0; i < splatterCount; i++) {
    const px = clampPt((rng() - 0.5) * 2 * xMax * 0.92, xMax);
    const py = clampPt((rng() - 0.5) * 2 * yMax * 0.92, yMax);
    const fv = fieldVal(px, py);
    const color = pickColorField(ch, keyT, bgL, fv, rng);
    oil.stroke(color[0], color[1], color[2]);
    oil.strokeWeight((2 + Math.abs(fv) * 5) * wScale);
    const tangle = fieldRot(px, py);
    const tlen = 3 + rng() * 16;
    oil.line(px, py, clampPt(px + Math.cos(tangle) * tlen, xMax), clampPt(py + Math.sin(tangle) * tlen, yMax));
    const nSpatter = 1 + Math.floor(rng() * 3);
    for (let s = 0; s < nSpatter; s++) {
      const sa = tangle + (rng() - 0.5) * 1.6;
      const sd = 4 + rng() * 22;
      const ox = clampPt(px + Math.cos(sa) * sd, xMax);
      const oy = clampPt(py + Math.sin(sa) * sd, yMax);
      oil.line(ox, oy, clampPt(ox + (rng() - 0.5) * 4, xMax), clampPt(oy + (rng() - 0.5) * 4, yMax));
    }
  }

  // === HEAVY ACCENTS — immediate, thick, confident dabs at the field's peaks ===
  oil.pick('impasto');
  const accentCount = Math.round((3 + ch[CH.ONSET] * 6.6) * presence);
  const cand = innerCloud(Math.max(accentCount * 12, 80), 2999, xMax * 0.88, yMax * 0.88);
  const ranked = cand.map(c => ({ c, f: fieldVal(c.x, c.y) }))
                     .sort((a, b) => b.f - a.f)
                     .slice(0, accentCount);
  for (const { c } of ranked) {
    markStraight(c.x, c.y, lenLarge * 0.5, wLarge * 1.1, 0.15);
  }

  oil.flush();

  return { keyT, seed };
}

// Expose globally
window.Painter = { paintDay, CH };
