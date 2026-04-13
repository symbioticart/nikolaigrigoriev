// Rothko Matisse — Daily Portraits
// Pollock-style oil painter driven by Oura Ring metrics

(function() {

const MATISSE = [
  [230, 57, 70], [241, 196, 15], [6, 174, 213], [42, 157, 143],
  [231, 111, 81], [38, 70, 83], [244, 162, 97], [102, 155, 188], [255, 183, 3],
];
const ROTHKO = [
  [74, 14, 14], [107, 39, 55], [139, 0, 0], [44, 24, 16],
  [61, 0, 0], [26, 10, 10], [92, 31, 31], [138, 54, 15], [55, 20, 20],
];

function normalizeMetrics(day, stats) {
  return {
    readiness: norm(day.readinessScore, 30, 95),
    sleep: norm(day.sleepScore, 20, 75),
    hrv: norm(day.hrv, 25, 100),
    rhr: norm(day.avgHeartRate, 50, 75),
    breath: norm(day.avgBreath, 12.5, 17),
    sleepHours: norm(day.totalSleepHours, 4, 9),
    deepPct: norm(day.deepSleepPct, 0.05, 0.22),
    remPct: norm(day.remSleepPct, 0.10, 0.30),
    efficiency: norm(day.efficiency, 60, 95),
    latency: norm(day.latency, 120, 3600),
    restless: norm(day.restlessPeriods, 100, 450),
    temp: day.tempDeviation ?? 0,
    workoutCount: day.workoutCount || 0,
    workoutIntensity: day.workoutIntensity || 0,
    _raw: day,
  };
}

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

function modulateColor(rgb, m, moodT, bgL) {
  let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  s *= (0.55 + 0.45 * m.sleep);
  l += (moodT - 0.5) * 0.12;
  const tempShift = (m.temp || 0) * 25;
  h -= tempShift;
  const contrast = 0.55 + m.deepPct * 0.45;
  l = 0.5 + (l - 0.5) * contrast;
  if (bgL != null) {
    const delta = l - bgL;
    if (bgL < 0.35 && delta < 0.18) l = bgL + 0.18 + Math.random() * 0.35;
    else if (bgL > 0.7 && delta > -0.18) l = bgL - 0.18 - Math.random() * 0.45;
  }
  l = Math.max(0.05, Math.min(0.95, l));
  s = Math.max(0, Math.min(1, s));
  return hslToRgb(h, s, l);
}

function pickColor(rng, m, moodT, bgL) {
  const useMatisse = rng() < moodT;
  const pool = useMatisse ? MATISSE : ROTHKO;
  const idx = Math.floor(rng() * pool.length);
  return modulateColor(pool[idx], m, moodT, bgL);
}

function backgroundColor(moodT, m, rng) {
  return hslToRgb(42, 0.35, 0.90);
}

function paintDay(p, day, stats, W, H) {
  const m = normalizeMetrics(day, stats);
  const moodT = (m.readiness + m.sleep + m.hrv) / 3;
  const seed = hashStr(day.day);
  const rng = makeRNG(seed);
  oil.seed(seed);

  const bg = backgroundColor(moodT, m, rng);
  const bgHSL = rgbToHsl(bg[0], bg[1], bg[2]);
  const bgL = bgHSL[2];
  p.background(bg[0], bg[1], bg[2]);

  const densityFactor = 1 - moodT;
  const baseLen = 80 + (1 - m.rhr) * 200;
  const lengthVariance = 0.15 + m.hrv * 0.95;
  const baseWeight = 7 + m.rhr * 18 + densityFactor * 16;
  const curvatureMul = 0.3 + m.remPct * 2.2;
  const spreadMul = 1.25 + (1 - m.efficiency) * 0.3;
  const layers = 1 + Math.floor(1 + densityFactor * 4);
  const baseStrokeCount = Math.floor(12 + densityFactor * 26 + m.workoutIntensity * 1.5);
  const baseAngle = rng() * Math.PI * 2;
  const angleVariance = Math.PI * 0.2 + (1 - m.readiness) * Math.PI * 0.8;
  const splatterCount = Math.floor(m.workoutIntensity * 10 + m.workoutCount * 6 + 12);
  const cx = 0, cy = 0;

  // PHASE 1: UNDERPAINTING
  oil.pick('flatLarge');
  for (let i = 0; i < Math.max(4, Math.floor(baseStrokeCount * 0.5)); i++) {
    const color = pickColor(rng, m, moodT, bgL);
    oil.stroke(color[0], color[1], color[2]);
    oil.strokeWeight(baseWeight * (0.9 + rng() * 0.6));
    const angle = baseAngle + (rng() - 0.5) * angleVariance;
    const len = baseLen * (1 - lengthVariance * 0.3 + rng() * lengthVariance * 1.2);
    const px = cx + (rng() - 0.5) * W * spreadMul;
    const py = cy + (rng() - 0.5) * H * spreadMul;
    oil.line(px - Math.cos(angle) * len / 2, py - Math.sin(angle) * len / 2,
             px + Math.cos(angle) * len / 2, py + Math.sin(angle) * len / 2);
  }

  // PHASE 2: MID-LAYER
  for (let layer = 0; layer < layers; layer++) {
    oil.pick(rng() < 0.5 ? 'filbertLarge' : 'filbertMedium');
    const layerStrokes = baseStrokeCount + Math.floor(rng() * baseStrokeCount * 0.6);
    for (let i = 0; i < layerStrokes; i++) {
      const color = pickColor(rng, m, moodT, bgL);
      oil.stroke(color[0], color[1], color[2]);
      oil.strokeWeight(baseWeight * (0.5 + rng() * 0.9) * (1 - layer * 0.08));
      const angle = baseAngle + (rng() - 0.5) * angleVariance * 1.3;
      const len = baseLen * (1 - lengthVariance * 0.4 + rng() * lengthVariance * 1.4);
      const px = cx + (rng() - 0.5) * W * spreadMul;
      const py = cy + (rng() - 0.5) * H * spreadMul;
      const segments = 3 + Math.floor(curvatureMul * 3);
      const pts = [];
      let x = px - Math.cos(angle) * len / 2;
      let y = py - Math.sin(angle) * len / 2;
      pts.push({ x, y });
      let curA = angle;
      const segLen = len / segments;
      for (let s = 0; s < segments; s++) {
        curA += (rng() - 0.5) * curvatureMul * 0.6;
        x += Math.cos(curA) * segLen;
        y += Math.sin(curA) * segLen;
        pts.push({ x, y });
      }
      for (let s = 0; s < pts.length - 1; s++) {
        oil.line(pts[s].x, pts[s].y, pts[s + 1].x, pts[s + 1].y);
      }
    }
  }

  // PHASE 3: DRIPS & SPLATTERS
  oil.pick('knifeSmall');
  for (let i = 0; i < splatterCount; i++) {
    const color = pickColor(rng, m, moodT, bgL);
    oil.stroke(color[0], color[1], color[2]);
    oil.strokeWeight(2 + rng() * 5);
    const px = cx + (rng() - 0.5) * W * spreadMul * 1.05;
    const py = cy + (rng() - 0.5) * H * spreadMul * 1.05;
    const tlen = 3 + rng() * 18;
    const tangle = rng() * Math.PI * 2;
    oil.line(px, py, px + Math.cos(tangle) * tlen, py + Math.sin(tangle) * tlen);
    const nSpatter = 1 + Math.floor(rng() * 4);
    for (let s = 0; s < nSpatter; s++) {
      const sa = rng() * Math.PI * 2;
      const sd = 4 + rng() * 25;
      oil.line(px + Math.cos(sa) * sd, py + Math.sin(sa) * sd,
               px + Math.cos(sa) * sd + (rng() - 0.5) * 4,
               py + Math.sin(sa) * sd + (rng() - 0.5) * 4);
    }
  }

  // PHASE 4: IMPASTO ACCENTS
  oil.pick('impasto');
  const impastoCount = 3 + Math.floor(m.workoutIntensity * 0.6 + (1 - m.latency) * 5);
  for (let i = 0; i < impastoCount; i++) {
    const color = pickColor(rng, m, Math.min(1, moodT + 0.15), bgL);
    oil.stroke(color[0], color[1], color[2]);
    oil.strokeWeight(baseWeight * (1.2 + rng() * 0.8));
    const angle = baseAngle + (rng() - 0.5) * angleVariance;
    const len = baseLen * (0.4 + rng() * 0.5);
    const px = cx + (rng() - 0.5) * W * 0.85;
    const py = cy + (rng() - 0.5) * H * 0.85;
    oil.line(px - Math.cos(angle) * len / 2, py - Math.sin(angle) * len / 2,
             px + Math.cos(angle) * len / 2, py + Math.sin(angle) * len / 2);
  }

  // PHASE 5: RESTLESS NOISE
  if (m.restless > 0.6) {
    oil.pick('knifeSmall');
    const noise = Math.floor(m.restless * 40);
    for (let i = 0; i < noise; i++) {
      const color = pickColor(rng, m, moodT, bgL);
      oil.stroke(color[0], color[1], color[2]);
      oil.strokeWeight(1 + rng() * 3);
      const px = cx + (rng() - 0.5) * W * 1.1;
      const py = cy + (rng() - 0.5) * H * 1.1;
      oil.line(px, py, px + (rng() - 0.5) * 8, py + (rng() - 0.5) * 8);
    }
  }

  oil.flush();
  return { m, moodT };
}

window.WorkPainter = {
  id: 'rothko-matisse',
  title: 'Rothko Matisse',
  subtitle: 'Daily Portraits',
  canvasW: 980,
  canvasH: 700,
  bgColor: '#fafafa',
  hasNavigation: true,
  paintDay: paintDay,
  aboutHTML: `<h2>Process</h2>
<p>This is a symbiotic artwork. The paintings are not composed by the artist directly \u2014 they are generated from the artist\u2019s own physiological data, recorded continuously by a wearable biometric sensor (Oura Ring). The body becomes both the subject and the instrument. Each painting is a portrait of a single day, rendered through the involuntary signals of sleep, heart, and nervous system.</p>
<p>Fourteen physiological measurements are extracted from each 24-hour cycle, normalized, and mapped to independent visual parameters. The same data always produces the same painting \u2014 the process is deterministic.</p>
<h3>Source Signal</h3>
<p>The sensor tracks the body during sleep and activity. From each day, the system reads: readiness score, sleep score, heart rate variability, resting heart rate, deep and REM sleep percentage, sleep efficiency, onset latency, restless periods, body temperature deviation, and workout intensity and frequency.</p>
<h3>Mood Index</h3>
<p>Three core metrics \u2014 readiness, sleep quality, and HRV \u2014 are averaged into a single value between 0 and 1. This index determines the probability of drawing from either color palette: a higher value favors the bright palette (warm, open), a lower value favors the dark palette (deep wine, bordeaux, near-black). The selection is stochastic \u2014 on a mid-range day, each individual stroke may come from either pool.</p>
<h3>Biometric-to-Visual Mapping</h3>
<table>
<tr><th>Body Signal</th><th>Visual Parameter</th></tr>
<tr><td>Readiness + Sleep + HRV</td><td>Palette probability, stroke density, layer count</td></tr>
<tr><td>Resting heart rate</td><td>Stroke length and weight</td></tr>
<tr><td>Heart rate variability</td><td>Spread between shortest and longest strokes</td></tr>
<tr><td>REM sleep</td><td>Curvature of gestural marks</td></tr>
<tr><td>Deep sleep</td><td>Tonal contrast</td></tr>
<tr><td>Sleep quality</td><td>Color saturation</td></tr>
<tr><td>Sleep efficiency</td><td>Compositional spread</td></tr>
<tr><td>Sleep onset latency</td><td>Impasto accent count</td></tr>
<tr><td>Body temperature</td><td>Hue rotation</td></tr>
<tr><td>Restless periods</td><td>Edge noise layer</td></tr>
<tr><td>Workout intensity</td><td>Drip trails and splatters</td></tr>
</table>
<h3>Construction</h3>
<p>Each painting is built in five sequential passes using simulated oil brushes. Broad underpainting sweeps establish the tonal field. Curved gestural strokes build up in layers \u2014 two on well-rested days, six on exhausted ones. Drip trails and micro-splatters accumulate from physical activity. Thick impasto accents mark quick sleep onset. On restless nights, a final scatter of fine marks appears at the edges.</p>`,
};

})();
