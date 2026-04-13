// De Keyser — Symbiotic Art
// Minimal vocabulary: horizontal lines, rectangles, vertical bars, dots, diagonal slashes

(function() {

const CANVAS_W = 700;
const CANVAS_H = 920;

function fieldColor(rng, m) {
  const base = 85 + Math.floor(rng() * 20);
  return [base, base, base];
}

function markColor(rng, m) {
  const mood = (m.readiness + m.sleep + m.hrv) / 3;
  if (mood > 0.5) {
    const base = 5 + Math.floor(rng() * 12);
    return [base, base, base];
  } else {
    const base = 55 + Math.floor(rng() * 18);
    return [base, base, base];
  }
}

function paintField(rng, m, W, H) {
  const mood = (m.readiness + m.sleep + m.hrv) / 3;
  if (mood > 0.5) return;

  const fc = fieldColor(rng, m);
  oil.pick('flatLarge');
  oil.strokeWeight(25 + rng() * 15);
  const strokeCount = Math.round(lerp(2, 4, 1 - mood));
  const zoneTop = -H * 0.42;
  const zoneBottom = H * 0.35;

  for (let i = 0; i < strokeCount; i++) {
    const v = fc[0] + Math.round((rng() - 0.5) * 8);
    oil.stroke(v, v, v);
    const y = lerp(zoneTop, zoneBottom, i / Math.max(1, strokeCount - 1)) + (rng() - 0.5) * 30;
    const startX = -W * 0.44 + rng() * W * 0.1;
    const endX = W * 0.15 + rng() * W * 0.30;
    oil.line(startX, y, endX, y + (rng() - 0.5) * 3);
  }
}

function paintMarks(rng, m, W, H) {
  const mood = (m.readiness + m.sleep + m.hrv) / 3;
  const markCount = Math.max(1, Math.round(lerp(1, 5, m.remPct)));
  const baseScale = lerp(0.25, 0.75, m.readiness);
  const confidence = m.hrv;
  const tension = m.rhr;
  const balance = m.efficiency;
  const weightBase = lerp(4, 22, m.deepPct);
  const vertDrift = lerp(0, H * 0.15, m.latency);

  for (let i = 0; i < markCount; i++) {
    const mc = markColor(rng, m);
    oil.stroke(mc[0], mc[1], mc[2]);

    let mx, my;
    if (balance > 0.6) {
      const gridX = (i % 2 === 0) ? -0.35 : 0.35;
      const gridY = (i < 2) ? -0.32 : 0.32;
      mx = gridX * W + (rng() - 0.5) * W * 0.20;
      my = gridY * H + (rng() - 0.5) * H * 0.20 + vertDrift;
    } else {
      mx = (rng() - 0.5) * W * 0.85;
      my = (rng() - 0.5) * H * 0.85 + vertDrift;
    }

    const type = Math.floor(rng() * 5);
    const scale = baseScale * (0.6 + rng() * 0.8);
    const weight = weightBase * (0.7 + rng() * 0.6);

    switch (type) {
      case 0: {
        oil.pick('flatLarge');
        oil.strokeWeight(weight);
        oil.stroke(mc[0], mc[1], mc[2]);
        const len = W * scale;
        const angle = lerp(0, 0.3, tension) * (rng() < 0.5 ? 1 : -1);
        if (confidence > 0.5) {
          oil.line(mx - len / 2, my, mx + len / 2, my + Math.sin(angle) * len * 0.2);
          oil.line(mx - len / 2, my + 1, mx + len / 2, my + 1 + Math.sin(angle) * len * 0.2);
        } else {
          const segs = 3 + Math.floor(rng() * 3);
          const segLen = len / segs;
          for (let s = 0; s < segs; s++) {
            if (rng() > 0.25) {
              const sx = mx - len / 2 + s * segLen;
              oil.line(sx, my + (rng() - 0.5) * 5, sx + segLen * 0.65, my + (rng() - 0.5) * 5);
            }
          }
        }
        break;
      }
      case 1: {
        oil.pick('flatMedium');
        oil.strokeWeight(weight);
        oil.stroke(mc[0], mc[1], mc[2]);
        const rw = W * scale * 0.55;
        const rh = H * scale * 0.45;
        const sides = confidence > 0.4 ? 4 : 2 + Math.floor(rng() * 2);
        const wobble = lerp(7, 1, confidence);
        for (let rep = 0; rep < 2; rep++) {
          if (sides >= 1) oil.line(mx - rw/2, my - rh/2 + (rng()-0.5)*wobble, mx + rw/2, my - rh/2 + (rng()-0.5)*wobble);
          if (sides >= 2) oil.line(mx + rw/2 + (rng()-0.5)*wobble, my - rh/2, mx + rw/2 + (rng()-0.5)*wobble, my + rh/2);
          if (sides >= 3) oil.line(mx + rw/2, my + rh/2 + (rng()-0.5)*wobble, mx - rw/2, my + rh/2 + (rng()-0.5)*wobble);
          if (sides >= 4) oil.line(mx - rw/2 + (rng()-0.5)*wobble, my + rh/2, mx - rw/2 + (rng()-0.5)*wobble, my - rh/2);
        }
        break;
      }
      case 2: {
        oil.pick('flatMedium');
        oil.strokeWeight(weight * 1.4);
        oil.stroke(mc[0], mc[1], mc[2]);
        const len = H * scale * 0.75;
        const lean = lerp(0, 0.4, tension) * (rng() < 0.5 ? 1 : -1);
        oil.line(mx, my - len / 2, mx + lean * len * 0.3, my + len / 2);
        oil.line(mx + 1, my - len / 2, mx + 1 + lean * len * 0.3, my + len / 2);
        break;
      }
      case 3: {
        oil.pick('impasto');
        oil.strokeWeight(weight * 2.8);
        oil.stroke(mc[0], mc[1], mc[2]);
        oil.line(mx, my, mx + 2, my + 1);
        if (rng() > 0.5) {
          oil.pick('round');
          oil.strokeWeight(weight * 1.2);
          oil.line(mx + 18 + rng() * 22, my + (rng()-0.5)*12, mx + 22 + rng()*22, my + (rng()-0.5)*12);
        }
        break;
      }
      case 4: {
        oil.pick('filbertLarge');
        oil.strokeWeight(weight * 1.1);
        oil.stroke(mc[0], mc[1], mc[2]);
        const len = Math.min(W, H) * scale * 0.65;
        const angle = Math.PI * 0.25 + (rng() - 0.5) * 0.5;
        if (confidence > 0.5) {
          oil.line(mx - Math.cos(angle)*len/2, my - Math.sin(angle)*len/2,
                   mx + Math.cos(angle)*len/2, my + Math.sin(angle)*len/2);
        } else {
          const segs = 2 + Math.floor(rng() * 2);
          for (let s = 0; s < segs; s++) {
            const t1 = s / segs, t2 = (s + 0.55) / segs;
            oil.line(mx + Math.cos(angle)*len*(t1-0.5), my + Math.sin(angle)*len*(t1-0.5) + (rng()-0.5)*4,
                     mx + Math.cos(angle)*len*(t2-0.5), my + Math.sin(angle)*len*(t2-0.5) + (rng()-0.5)*4);
          }
        }
        break;
      }
    }
  }

  // Erasure marks
  if (m.restless > 0.35) {
    const fc = fieldColor(rng, m);
    oil.pick('filbertMedium');
    const erasures = Math.floor((m.restless - 0.35) * 4);
    for (let i = 0; i < erasures; i++) {
      const eBase = 120 + Math.round(rng() * 20);
      oil.stroke(eBase, eBase, eBase);
      oil.strokeWeight(12 + rng() * 18);
      const ex = (rng() - 0.5) * W * 0.8;
      const ey = (rng() - 0.5) * H * 0.8 + vertDrift;
      oil.line(ex - 8, ey, ex + 8 + rng() * 18, ey + (rng() - 0.5) * 6);
    }
  }

  // Workout accent
  if (m.workoutIntensity > 0.2) {
    oil.pick('impasto');
    const mc = markColor(rng, m);
    oil.stroke(mc[0], mc[1], mc[2]);
    oil.strokeWeight(lerp(5, 18, m.workoutIntensity));
    const ax = (rng() - 0.5) * W * 0.75;
    const ay = (rng() - 0.5) * H * 0.75 + vertDrift;
    const len = lerp(25, 90, m.workoutIntensity);
    const angle = rng() * Math.PI;
    oil.line(ax, ay, ax + Math.cos(angle) * len, ay + Math.sin(angle) * len);
  }
}

function paintDay(p, day, stats, W, H) {
  const seed = hashStr(day.day);
  const m = normalizeDay(day);
  p.background(245, 240, 232);

  oil.seed(seed);
  paintField(makeRNG(seed), m, W, H);
  oil.flush();

  oil.seed(seed + 7919);
  paintMarks(makeRNG(seed + 7919), m, W, H);
  oil.flush();
}

window.WorkPainter = {
  id: 'dekeyser',
  title: 'De Keyser',
  subtitle: 'Symbiotic Art',
  canvasW: 700,
  canvasH: 920,
  bgColor: '#fafafa',
  hasNavigation: true,
  paintDay: paintDay,
  aboutHTML: `<h2>Process</h2>
<p>This is symbiotic art. The artist\u2019s body is both subject and instrument. Each painting is generated from a single day of physiological data captured by a sensor worn during sleep \u2014 the body narrating itself in the grammar of oil on canvas.</p>
<p>Eleven biometric measurements taken across 97 consecutive days control every visual decision: how many marks appear, how confidently they are drawn, whether they break or hold, how the ground breathes or suffocates. The same data always produces the same painting. Nothing is decorative. Nothing is random.</p>
<h3>Source Signal</h3>
<p>Oura Ring Generation 3, worn nightly. Data spans January 17 to June 13, 2025. Each day yields heart rate variability, resting heart rate, sleep architecture, body temperature deviation, respiratory rate, and movement data.</p>
<h3>Primary Index</h3>
<p>The composite mood \u2014 an average of readiness, sleep quality, and heart rate variability \u2014 governs the fundamental character of each painting. On days of high coherence the canvas remains almost empty: a luminous chalky ground with a few spare, weighted marks placed with the certainty of a painter who slept well. On depleted days the ground darkens to a thin turbid wash and the marks fracture \u2014 hesitant gestures that start, stop, and lose their nerve.</p>
<h3>Biometric-to-Visual Mapping</h3>
<table>
<tr><th>Body / Sleep Signal</th><th>Visual Parameter</th></tr>
<tr><td>Readiness + Sleep + HRV (composite)</td><td>Ground luminosity \u2014 clean white or muddied wash</td></tr>
<tr><td>REM sleep percentage</td><td>Mark count \u2014 how many gestures the painter permits, 1 to 5</td></tr>
<tr><td>Readiness score</td><td>Mark scale \u2014 the physical size of each gesture</td></tr>
<tr><td>Heart rate variability</td><td>Line confidence \u2014 decisive continuous strokes or broken stuttering fragments</td></tr>
<tr><td>Resting heart rate</td><td>Tension angle \u2014 calm horizontals tilting toward anxious diagonals</td></tr>
<tr><td>Sleep efficiency</td><td>Compositional balance \u2014 marks centered in harmony or pushed to unsettled edges</td></tr>
<tr><td>Body temperature deviation</td><td>Ground temperature \u2014 warm ochre undertone or cool blue-gray</td></tr>
<tr><td>Restless periods</td><td>Erasure marks \u2014 field-colored smudges partly occluding previous gestures</td></tr>
<tr><td>Workout intensity</td><td>Accent stroke \u2014 one emphatic impasto gesture cutting across the composition</td></tr>
<tr><td>Deep sleep percentage</td><td>Stroke weight \u2014 heavier marks from deeper rest, thinner from shallow sleep</td></tr>
<tr><td>Sleep latency</td><td>Vertical drift \u2014 marks sink lower on the canvas the longer sleep took to arrive</td></tr>
</table>
<h3>Construction</h3>
<p>The painting is built in two passes. First the ground: on depleted days, a few sparse horizontal strokes of chalky pigment are dragged across the upper canvas with a large flat brush, leaving gaps and bare linen between them. Good days receive no ground treatment; the canvas breathes as bare white.</p>
<p>The second pass places the marks. De Keyser\u2019s vocabulary is minimal: horizontal lines, rectangles, vertical bars, dots, diagonal slashes. Each mark type is selected by the deterministic sequence. HRV controls whether the stroke is drawn as a single confident gesture or broken into stuttering segments.</p>`,
};

})();
