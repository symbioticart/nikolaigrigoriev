// Sleep Form — Daily Portraits
// Biomorphic black forms on warm white ground, driven by sleep metrics

(function() {

function generateContour(rng, m, W, H) {
  const scale = lerp(0.50, 0.92, m.sleep);
  const baseRadius = scale * Math.min(W, H) * 0.92;
  const cpCount = Math.round(lerp(14, 6, m.efficiency));
  const controlRadii = [];
  for (let i = 0; i < cpCount; i++) {
    let r = baseRadius * (0.85 + rng() * 0.3);
    if (rng() < m.remPct * 0.5) r *= lerp(0.55, 0.4, rng());
    controlRadii.push(r);
  }
  const symmetry = lerp(0.05, 0.8, m.deepPct);
  for (let i = 0; i < Math.floor(cpCount / 2); i++) {
    const mirror = cpCount - 1 - i;
    if (mirror !== i) {
      const avg = (controlRadii[i] + controlRadii[mirror]) * 0.5;
      controlRadii[i] = lerp(controlRadii[i], avg, symmetry);
      controlRadii[mirror] = lerp(controlRadii[mirror], avg, symmetry);
    }
  }
  const ptCount = 200;
  const points = [];
  const offX = lerp(1, 0, m.efficiency) * (rng() - 0.5) * W * 0.08;
  const offY = lerp(1, 0, m.efficiency) * (rng() - 0.5) * H * 0.06;
  for (let i = 0; i < ptCount; i++) {
    const angle = (i / ptCount) * Math.PI * 2;
    const ci = (i / ptCount) * cpCount;
    const i0 = Math.floor(ci) % cpCount;
    const i1 = (i0 + 1) % cpCount;
    const i2 = (i0 + 2) % cpCount;
    const im1 = (i0 - 1 + cpCount) % cpCount;
    const t = ci - Math.floor(ci);
    const t2 = t * t, t3 = t2 * t;
    const r = Math.max(15, 0.5 * (
      (2 * controlRadii[i0]) +
      (-controlRadii[im1] + controlRadii[i1]) * t +
      (2 * controlRadii[im1] - 5 * controlRadii[i0] + 4 * controlRadii[i1] - controlRadii[i2]) * t2 +
      (-controlRadii[im1] + 3 * controlRadii[i0] - 3 * controlRadii[i1] + controlRadii[i2]) * t3
    ));
    points.push({ x: offX + Math.cos(angle) * r, y: offY + Math.sin(angle) * r });
  }
  return points;
}

function paintStout(rng, m, day, cx, cy, W, H) {
  const mood = m.sleep;
  const points = generateContour(rng, m, W, H);
  const shifted = points.map(p => ({ x: p.x + cx, y: p.y + cy }));
  const temp = m.temp;
  let bR = 15, bG = 15, bB = 15;
  if (temp > 0.2) { bR += 4; bG += 3; bB += 2; }
  else if (temp < -0.2) { bR -= 2; bG -= 1; bB += 1; }
  const baseTone = Math.round((bR + bG + bB) / 3);
  const fillPasses = Math.round(lerp(3, 8, m.sleep));
  const allY = shifted.map(p => p.y);
  const minY = Math.min(...allY), maxY = Math.max(...allY);

  function getCrossingsAtY(scanY) {
    const crossings = [];
    for (let i = 0; i < shifted.length; i++) {
      const a = shifted[i], b = shifted[(i + 1) % shifted.length];
      if ((a.y <= scanY && b.y > scanY) || (b.y <= scanY && a.y > scanY)) {
        const t = (scanY - a.y) / (b.y - a.y);
        crossings.push(a.x + t * (b.x - a.x));
      }
    }
    crossings.sort((a, b) => a - b);
    return crossings;
  }

  const tonalRange = lerp(4, 22, m.remPct);
  for (let pass = 0; pass < fillPasses; pass++) {
    const brushes = ['flatLarge', 'filbertLarge', 'filbertMedium', 'flatMedium'];
    oil.pick(brushes[pass % brushes.length]);
    const passShift = (pass / Math.max(1, fillPasses - 1) - 0.5) * tonalRange;
    const passTone = Math.round(baseTone + passShift + (rng() - 0.5) * tonalRange * 0.3);
    oil.stroke(passTone, passTone, passTone);
    const w = lerp(25, 10, pass / Math.max(1, fillPasses - 1)) * (0.8 + rng() * 0.4);
    oil.strokeWeight(w);
    const step = w * (0.22 + rng() * 0.18);
    for (let sy = minY + rng() * step; sy < maxY; sy += step) {
      const crossings = getCrossingsAtY(sy);
      const lineTone = Math.round(passTone + (rng() - 0.5) * tonalRange * 0.5);
      oil.stroke(lineTone, lineTone, lineTone);
      for (let c = 0; c < crossings.length - 1; c += 2) {
        const x1 = crossings[c], x2 = crossings[c + 1];
        if (x2 - x1 < 3) continue;
        const wobble = (rng() - 0.5) * 4;
        oil.line(x1 + rng() * 3, sy + wobble, x2 - rng() * 3, sy - wobble);
      }
    }
  }

  oil.pick('filbertMedium');
  oil.stroke(baseTone, baseTone, baseTone);
  oil.strokeWeight(lerp(4, 10, mood));
  const arcCount = Math.round(lerp(3, 6, mood));
  for (let a = 0; a < arcCount; a++) {
    const start = Math.floor(rng() * shifted.length);
    const arcLen = Math.floor(shifted.length * (0.08 + rng() * 0.15));
    for (let j = 0; j < arcLen; j += 3) {
      const p1 = shifted[(start + j) % shifted.length];
      const p2 = shifted[(start + j + 3) % shifted.length];
      oil.line(p1.x, p1.y, p2.x, p2.y);
    }
  }

  if (mood > 0.4) {
    oil.pick('impasto');
    oil.stroke(baseTone + 4, baseTone + 4, baseTone + 4);
    oil.strokeWeight(lerp(4, 12, mood));
    const edgeMarks = Math.round(lerp(3, 8, mood));
    for (let i = 0; i < edgeMarks; i++) {
      const start = Math.floor(rng() * shifted.length);
      const arcLen = Math.floor(shifted.length * (0.05 + rng() * 0.12));
      for (let j = 0; j < arcLen; j += 3) {
        const a = shifted[(start + j) % shifted.length];
        const b = shifted[(start + j + 3) % shifted.length];
        oil.line(a.x, a.y, b.x, b.y);
      }
    }
  }

  if (m.restless > 0.3) {
    oil.pick('knifeSmall');
    const tears = Math.floor(m.restless * 20);
    for (let i = 0; i < tears; i++) {
      const pi = Math.floor(rng() * shifted.length);
      const pt = shifted[pi];
      oil.stroke(baseTone + 18, baseTone + 18, baseTone + 18);
      oil.strokeWeight(1.5 + rng() * 3);
      const len = 8 + rng() * 18;
      const angle = Math.atan2(pt.y - cy, pt.x - cx) + (rng() - 0.5) * 0.8;
      oil.line(pt.x, pt.y, pt.x + Math.cos(angle) * len, pt.y + Math.sin(angle) * len);
    }
  }

  if (m.latency > 0.2) {
    oil.pick('flatMedium');
    const ox = lerp(10, 25, m.latency) * (rng() < 0.5 ? 1 : -1);
    const oy = lerp(5, 15, m.latency) * (rng() < 0.5 ? 1 : -1);
    oil.stroke(baseTone + 25, baseTone + 25, baseTone + 25);
    oil.strokeWeight(lerp(4, 10, m.latency));
    for (let i = 0; i < shifted.length; i += 5) {
      const a = shifted[i], b = shifted[(i + 5) % shifted.length];
      oil.line(a.x + ox, a.y + oy, b.x + ox, b.y + oy);
    }
  }
}

function paintDay(p, day, stats, W, H) {
  p.background(248, 245, 238);
  const m = normalizeDay(day);
  const seed = hashStr(day.day);
  oil.seed(seed);
  paintStout(makeRNG(seed), m, day, 0, 0, W, H);
  oil.flush();
}

window.WorkPainter = {
  id: 'sleep-form',
  title: 'Sleep Form',
  subtitle: 'Daily Portraits',
  canvasW: 700,
  canvasH: 980,
  bgColor: '#fafafa',
  hasNavigation: true,
  paintDay: paintDay,
  aboutHTML: `<h2>Process</h2>
<p>This is a symbiotic artwork. Each painting is not composed by the artist directly \u2014 it is generated from the artist\u2019s own physiological data, recorded during sleep by a wearable biometric sensor (Oura Ring). The sleeping body becomes both the subject and the instrument. Each painting is a portrait of a single night, rendered as a single form.</p>
<p>Seven sleep measurements are extracted from each night, normalized, and mapped to independent parameters of a biomorphic black shape on a warm white ground. The same data always produces the same form \u2014 the process is deterministic.</p>
<h3>Sleep Score</h3>
<p>The sleep score is the primary index. It governs the scale and density of the form: a high score produces a large, commanding shape that fills the canvas \u2014 confident, resolved, present. A low score yields a small, sparse form \u2014 uncertain, retreating, barely there.</p>
<h3>Sleep-to-Visual Mapping</h3>
<table>
<tr><th>Sleep Signal</th><th>Visual Parameter</th></tr>
<tr><td>Sleep score</td><td>Form scale and fill density</td></tr>
<tr><td>Sleep efficiency</td><td>Contour smoothness</td></tr>
<tr><td>Deep sleep %</td><td>Bilateral symmetry</td></tr>
<tr><td>REM sleep %</td><td>Concavities and tonal range</td></tr>
<tr><td>Body temperature</td><td>Base tone</td></tr>
<tr><td>Restless periods</td><td>Edge tears</td></tr>
<tr><td>Sleep onset latency</td><td>Shadow offset</td></tr>
</table>
<h3>Construction</h3>
<p>Each form is built from a closed contour generated in polar coordinates. Control radii are interpolated with Catmull-Rom splines to produce a smooth, organic silhouette. The interior is filled with horizontal scanlines using multiple oil brush passes at varying weights and gray tones. On restless nights, fine scratches radiate outward from the boundary. On nights with long sleep latency, a displaced shadow echoes the form \u2014 the body\u2019s anxiety made visible.</p>`,
};

})();
