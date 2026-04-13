// After Forrest Bess — Hypnagogic Visions
// Side-by-side comparison of good day vs bad day

(function() {

function visionColor(rng, temp, mood) {
  const warm = [[220,80,30],[200,45,20],[230,160,40],[190,30,30],[240,120,20]];
  const cool = [[40,90,160],[30,130,130],[60,110,140],[80,160,120],[50,70,140]];
  const neutral = [[230,210,120],[240,230,200],[200,180,100],[220,200,150],[250,240,220]];
  let pool;
  if (temp > 0.2) pool = warm;
  else if (temp < -0.2) pool = cool;
  else pool = neutral;
  const c = pool[Math.floor(rng() * pool.length)];
  const brightness = lerp(0.7, 1.5, mood);
  return [
    Math.min(255, Math.round(c[0]*brightness + (rng()-0.5)*15)),
    Math.min(255, Math.round(c[1]*brightness + (rng()-0.5)*12)),
    Math.min(255, Math.round(c[2]*brightness + (rng()-0.5)*10)),
  ];
}

function drawSymbol(rng, cx, cy, size, color, mood) {
  oil.stroke(color[0], color[1], color[2]);
  const type = Math.floor(rng() * 6);
  const w = lerp(8, 22, mood) * (0.7 + rng() * 0.6);
  oil.strokeWeight(w);
  switch (type) {
    case 0:
      oil.pick('filbertLarge');
      oil.circle(cx, cy, size * 0.5);
      oil.pick('round');
      oil.strokeWeight(w * 2);
      oil.line(cx - 4, cy, cx + 4, cy);
      break;
    case 1:
      oil.pick('flatLarge');
      const arm = size * 0.5;
      oil.line(cx - arm, cy, cx + arm, cy);
      oil.line(cx, cy - arm, cx, cy + arm);
      break;
    case 2:
      oil.pick('filbertLarge');
      const arcR = size * 0.45;
      for (let s = 0; s < 10; s++) {
        const a1 = (s/10)*Math.PI + rng()*0.15;
        const a2 = ((s+1)/10)*Math.PI;
        oil.line(cx+Math.cos(a1)*arcR, cy+Math.sin(a1)*arcR, cx+Math.cos(a2)*arcR, cy+Math.sin(a2)*arcR);
      }
      break;
    case 3:
      oil.pick('flatMedium');
      const ts = size * 0.45;
      oil.line(cx, cy-ts, cx-ts*0.8, cy+ts*0.6);
      oil.line(cx-ts*0.8, cy+ts*0.6, cx+ts*0.8, cy+ts*0.6);
      oil.line(cx+ts*0.8, cy+ts*0.6, cx, cy-ts);
      break;
    case 4:
      oil.pick('flatLarge');
      oil.strokeWeight(w * 2);
      const barW = size * 0.6;
      oil.line(cx-barW, cy+(rng()-0.5)*5, cx+barW, cy+(rng()-0.5)*5);
      break;
    case 5:
      oil.pick('round');
      const dots = 4 + Math.floor(rng()*5);
      for (let d = 0; d < dots; d++) {
        const da = rng()*Math.PI*2;
        const dd = rng()*size*0.35;
        oil.strokeWeight(4+rng()*8);
        oil.line(cx+Math.cos(da)*dd, cy+Math.sin(da)*dd, cx+Math.cos(da)*dd+3, cy+Math.sin(da)*dd+3);
      }
      break;
  }
}

function paintBessGround(rng, m, cx, cy, W, H) {
  const groundBase = lerp(45, 18, m.sleep);
  for (let pass = 0; pass < 10; pass++) {
    oil.pick(pass < 5 ? 'flatLarge' : 'filbertLarge');
    const variation = (rng()-0.5)*2;
    let gR = groundBase+variation;
    let gG = groundBase+variation-1;
    let gB = groundBase+variation;
    if (m.temp > 0.2) gR += 2;
    else if (m.temp < -0.2) gB += 2;
    oil.stroke(Math.round(gR), Math.round(gG), Math.round(gB));
    oil.strokeWeight(50+rng()*20);
    const step = 12+rng()*5;
    for (let y = cy-H/2-50; y < cy+H/2+50; y += step) {
      const wobble = (rng()-0.5)*2;
      oil.line(cx-W/2-30, y+wobble, cx+W/2+30, y-wobble);
    }
  }
}

function paintBessSymbols(rng, m, cx, cy, W, H) {
  const mood = (m.readiness+m.sleep+m.hrv)/3;
  const symbolCount = Math.round(lerp(2, 10, m.remPct));
  const baseSize = lerp(60, 180, m.readiness);
  const coherence = m.hrv;

  for (let i = 0; i < symbolCount; i++) {
    let sx, sy;
    if (coherence > 0.5 && i === 0) {
      sx = cx+(rng()-0.5)*W*0.25;
      sy = cy+(rng()-0.5)*H*0.25;
    } else {
      const baseAngle = i*2.399+rng()*0.8;
      const minDist = W*0.08;
      const maxDist = Math.min(W,H)*0.38;
      const dist = minDist+rng()*(maxDist-minDist);
      sx = cx+Math.cos(baseAngle)*dist;
      sy = cy+Math.sin(baseAngle)*dist*(H/W);
    }
    const size = baseSize*(0.5+rng()*0.8);
    const color = visionColor(rng, m.temp, mood);
    drawSymbol(rng, sx, sy, size, color, mood);
  }

  if (m.restless > 0.3) {
    const groundBase = lerp(55, 22, m.sleep);
    oil.pick('knifeSmall');
    const interference = Math.floor(m.restless*12);
    for (let i = 0; i < interference; i++) {
      oil.stroke(groundBase+15, groundBase+12, groundBase+10);
      oil.strokeWeight(1+rng()*2);
      const sx = cx+(rng()-0.5)*W*0.7;
      const sy = cy+(rng()-0.5)*H*0.7;
      const len = 15+rng()*50;
      const angle = rng()*Math.PI*2;
      oil.line(sx, sy, sx+Math.cos(angle)*len, sy+Math.sin(angle)*len);
    }
  }

  if (m.deepPct > 0.4) {
    oil.pick('flatLarge');
    const glowColor = visionColor(rng, m.temp, mood);
    oil.stroke(Math.round(glowColor[0]*0.3), Math.round(glowColor[1]*0.3), Math.round(glowColor[2]*0.3));
    oil.strokeWeight(40+rng()*20);
    for (let i = 0; i < 3; i++) {
      const gx = cx+(rng()-0.5)*W*0.3;
      const gy = cy+(rng()-0.5)*H*0.3;
      oil.line(gx-30, gy, gx+30, gy);
    }
  }
}

// Bess uses single-day painting (not comparison) when viewed as part of portfolio
function paintDay(p, day, stats, W, H) {
  const m = normalizeDay(day);
  const seed = hashStr(day.day);

  p.background(8, 7, 6);

  oil.seed(seed);
  paintBessGround(makeRNG(seed), m, 0, 0, W, H);
  oil.flush();

  oil.seed(seed + 7919);
  paintBessSymbols(makeRNG(seed + 7919), m, 0, 0, W, H);
  oil.flush();
}

window.WorkPainter = {
  id: 'bess',
  title: 'After Forrest Bess',
  subtitle: 'Hypnagogic Visions',
  canvasW: 480,
  canvasH: 580,
  bgColor: '#0a0a0a',
  hasNavigation: true,
  paintDay: paintDay,
  aboutHTML: `<h2>Process</h2>
<p>After Forrest Bess \u2014 the American outsider artist who painted what he saw in the moment between waking and sleep. Small, crude, powerful symbols on dark grounds.</p>
<p>Each painting is generated from a single day of physiological data captured by a wearable sensor (Oura Ring). The painting IS the sleep experience itself.</p>
<h3>Interpretation</h3>
<p><strong>Good sleep</strong> (deep, efficient, vivid REM): Rich dark ground, bold bright symbols, clarity of vision. The dreamer reaches deep and returns with clear images.</p>
<p><strong>Bad sleep</strong> (shallow, restless, no REM): Murky gray ground, faint marks, fragmented. The dreamer never fully descends. Visions are broken.</p>
<h3>Biometric-to-Visual Mapping</h3>
<table>
<tr><th>Body Signal</th><th>Visual Parameter</th></tr>
<tr><td>Sleep score</td><td>Ground darkness \u2014 deep dark (good) vs murky gray (bad)</td></tr>
<tr><td>REM sleep %</td><td>Symbol count \u2014 2 to 10 visions</td></tr>
<tr><td>Readiness</td><td>Symbol size \u2014 small fragments to bold forms</td></tr>
<tr><td>Body temperature</td><td>Vision color \u2014 warm (red/orange), cool (blue/teal), or neutral (gold/cream)</td></tr>
<tr><td>HRV</td><td>Coherence \u2014 centered primary vision vs scattered fragments</td></tr>
<tr><td>Restless periods</td><td>Interference lines \u2014 dark scratches across the vision field</td></tr>
<tr><td>Deep sleep %</td><td>Glow \u2014 subtle luminescence behind symbols on deep-sleep nights</td></tr>
</table>`,
};

})();
