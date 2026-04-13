// Chizenkai — Daily Portraits
// Density = Vitality. Good day fills the canvas. Bad day is empty.

(function() {

const SHIRAGA_POWER = [
  [74, 14, 14], [92, 18, 12], [68, 10, 20], [85, 16, 10],
  [60, 8, 8], [100, 20, 14], [50, 10, 10], [80, 12, 18],
];
const SHIRAGA_EXHAUST = [
  [60, 48, 42], [70, 55, 38], [52, 44, 40], [75, 58, 35],
  [58, 46, 40], [65, 52, 38], [48, 38, 34], [80, 62, 40],
];

function pickShiragaColor(rng, mood, temp) {
  const usePower = rng() < mood;
  const pool = usePower ? SHIRAGA_POWER : SHIRAGA_EXHAUST;
  const c = pool[Math.floor(rng() * pool.length)];
  const t = (temp || 0);
  const warmShift = t > 0 ? t * 6 : 0;
  const coolShift = t < 0 ? -t * 5 : 0;
  return [
    Math.max(0, Math.min(255, c[0] + Math.round((rng() - 0.5) * 10) + Math.round(warmShift))),
    Math.max(0, Math.min(255, c[1] + Math.round((rng() - 0.5) * 6))),
    Math.max(0, Math.min(255, c[2] + Math.round((rng() - 0.5) * 6) + Math.round(coolShift))),
  ];
}

function paintShiraga(p, rng, m, cx, cy, W, H) {
  const mood = (m.readiness + m.sleep + m.hrv) / 3;
  const density = Math.pow(mood, 1.3);

  const bgR = Math.round(lerp(12, 26, m.remPct));
  const bgG = Math.round(lerp(10, 20, m.remPct));
  const bgB = Math.round(lerp(8, 14, m.remPct));
  p.background(bgR, bgG, bgB);

  const layers = Math.round(lerp(2, 7, density));
  const strokesPerLayer = Math.round(lerp(6, 38, density));
  const thickProb = lerp(0.15, 0.45, density);
  const thinWeight = lerp(2, 5, density);
  const thickWeight = lerp(25, 55, density);
  const arcLength = lerp(80, 550, mood);
  const segments = Math.round(lerp(3, 12, mood));
  const spread = lerp(0.15, 0.55, density);
  const curvatureBase = lerp(0.1, 0.5, m.hrv);

  for (let layer = 0; layer < layers; layer++) {
    for (let i = 0; i < strokesPerLayer; i++) {
      const color = pickShiragaColor(rng, mood, m.temp);
      oil.stroke(color[0], color[1], color[2]);

      const isThick = rng() < thickProb;
      if (isThick) {
        const brushes = ['flatLarge', 'filbertLarge', 'impasto'];
        oil.pick(brushes[Math.floor(rng() * brushes.length)]);
        oil.strokeWeight(thickWeight * (0.7 + rng() * 0.6));
      } else {
        const brushes = ['flatSmall', 'filbertSmall', 'round'];
        oil.pick(brushes[Math.floor(rng() * brushes.length)]);
        oil.strokeWeight(thinWeight * (0.6 + rng() * 0.8));
      }

      const startAngle = rng() * Math.PI * 2;
      const startDist = rng() * Math.min(W, H) * spread + rng() * 20;
      const sx = cx + Math.cos(startAngle) * startDist * (W / H);
      const sy = cy + Math.sin(startAngle) * startDist;

      const arcSegs = isThick ? Math.max(2, Math.round(segments * 0.6)) : segments;
      const segLen = arcLength / arcSegs * (0.6 + rng() * 0.8);
      let curAngle = startAngle + (rng() - 0.5) * Math.PI;
      const curvature = (rng() < 0.5 ? 1 : -1) * curvatureBase * (0.7 + rng() * 0.6);

      let px = sx, py = sy;
      for (let s = 0; s < arcSegs; s++) {
        curAngle += curvature;
        const nx = px + Math.cos(curAngle) * segLen;
        const ny = py + Math.sin(curAngle) * segLen;
        oil.line(px, py, nx, ny);
        px = nx; py = ny;
      }
    }

    if (density > 0.3 && layer < layers - 1) oil.flush();
  }

  // Restless scratches
  if (m.restless > 0.3) {
    oil.flush();
    oil.pick('knifeSmall');
    const scratches = Math.floor(m.restless * 15);
    for (let i = 0; i < scratches; i++) {
      oil.stroke(bgR + 12, bgG + 10, bgB + 8);
      oil.strokeWeight(1 + rng() * 2);
      const sx = cx + (rng() - 0.5) * W * 0.8;
      const sy = cy + (rng() - 0.5) * H * 0.8;
      const len = 20 + rng() * 60;
      const angle = rng() * Math.PI * 2;
      oil.line(sx, sy, sx + Math.cos(angle) * len, sy + Math.sin(angle) * len);
    }
  }

  // Impasto highlights on strong days
  if (mood > 0.5) {
    oil.flush();
    oil.pick('impasto');
    const highlights = Math.round(lerp(4, 22, density));
    const baseWeight = lerp(25, 55, density);
    for (let i = 0; i < highlights; i++) {
      const c = SHIRAGA_POWER[Math.floor(rng() * SHIRAGA_POWER.length)];
      oil.stroke(
        Math.min(255, c[0] + Math.round(rng() * 20)),
        Math.min(255, c[1] + Math.round(rng() * 4)),
        Math.min(255, c[2] + Math.round(rng() * 4))
      );
      oil.strokeWeight(baseWeight * (1.2 + rng() * 1.0));
      const angle = rng() * Math.PI * 2;
      const dist = rng() * Math.min(W, H) * spread * 1.1;
      const sx = cx + Math.cos(angle) * dist * (W / H);
      const sy = cy + Math.sin(angle) * dist;
      const len = lerp(30, 150, mood);
      const dir = angle + (rng() - 0.5) * 1.5;
      oil.line(sx, sy, sx + Math.cos(dir) * len, sy + Math.sin(dir) * len);
    }
  }

  oil.flush();
}

function paintDay(p, day, stats, W, H) {
  const m = normalizeDay(day);
  const seed = hashStr(day.day);
  oil.seed(seed);
  paintShiraga(p, makeRNG(seed), m, 0, 0, W, H);
}

window.WorkPainter = {
  id: 'chizenkai',
  title: 'Chizenkai',
  subtitle: 'Daily Portraits',
  canvasW: 800,
  canvasH: 900,
  bgColor: '#fafafa',
  hasNavigation: true,
  paintDay: paintDay,
  aboutHTML: `<h2>Process</h2>
<p>This is a symbiotic artwork. The paintings are generated from the artist\u2019s own physiological data, recorded continuously by a wearable biometric sensor (Oura Ring). The body becomes both the subject and the instrument. Each painting is a portrait of a single day.</p>
<p>The central principle is density. A body at full capacity fills the canvas \u2014 thick spiraling arcs of deep red, layer upon layer of accumulated paint, impasto erupting through the surface. A depleted body leaves emptiness \u2014 thin pale marks on a dark ground, the canvas barely touched. The painting does not illustrate health data. It <em>is</em> the body\u2019s capacity, made visible as physical mass on a surface.</p>
<h3>Source Signal</h3>
<p>Oura Ring tracks the body during sleep and activity. Eleven measurements are extracted from each 24-hour cycle: readiness score, sleep score, heart rate variability, resting heart rate, deep and REM sleep percentage, sleep efficiency, onset latency, restless periods, body temperature deviation, and workout intensity.</p>
<h3>Vitality Index</h3>
<p>Three core metrics \u2014 readiness, sleep quality, and HRV \u2014 are compressed into a single value between 0 and 1. This index governs everything: the number of layers, the number of strokes per layer, the weight of each mark, the area of canvas reached, the palette. High vitality produces dense, saturated crimson. Low vitality thins to gray scratches on near-black ground. The relationship is nonlinear \u2014 mediocre days are closer to emptiness than to fullness. The body either gives or it does not.</p>
<h3>Biometric-to-Visual Mapping</h3>
<table>
<tr><th>Body Signal</th><th>Visual Parameter</th></tr>
<tr><td>Readiness + Sleep + HRV</td><td>Overall density \u2014 layer count, stroke count, stroke weight, canvas coverage, palette saturation</td></tr>
<tr><td>Resting heart rate</td><td>Arc length \u2014 low pulse yields long confident spirals, high pulse produces short convulsive fragments</td></tr>
<tr><td>Heart rate variability</td><td>Spiral curvature \u2014 high HRV sweeps wide arcs, low HRV cramps the gesture into tight coils</td></tr>
<tr><td>REM sleep %</td><td>Ground warmth \u2014 dreams heat the dark surface from cold charcoal toward warm umber</td></tr>
<tr><td>Workout intensity</td><td>Stroke energy per layer \u2014 physical exertion during the day adds raw accumulated force</td></tr>
<tr><td>Body temperature</td><td>Hue shift \u2014 warm body pushes red toward orange, cool body toward purple</td></tr>
<tr><td>Restless periods</td><td>Destructive scratches \u2014 dark knife marks scored across every layer beneath</td></tr>
</table>
<h3>Construction</h3>
<p>Each painting begins on a dark ground whose warmth is set by REM sleep. Between two and eight layers of spiraling arcs are drawn with flat and filbert brushes \u2014 each layer flushed to the surface before the next begins, building physical depth. On strong days the canvas disappears under accumulated pigment. Thick impasto highlights erupt in crimson. On depleted days, a few thin marks emerge from near-darkness \u2014 the body suspended above the canvas with nothing to release. On restless nights, fine scratches are scored across whatever surface exists.</p>`,
};

})();
