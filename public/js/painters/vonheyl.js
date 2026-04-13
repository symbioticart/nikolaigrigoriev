// Von Heyl — Symbiotic Art
// Three competing visual systems based on three physiological axes

(function() {

const ORDER_PALETTE = [
  [5, 5, 8], [8, 8, 6], [15, 10, 5], [5, 5, 15], [20, 14, 6],
];
const GESTURE_WARM = [
  [175, 35, 30], [195, 80, 15], [160, 40, 35], [200, 155, 55], [210, 140, 120], [170, 100, 30],
];
const GESTURE_COOL = [
  [30, 60, 155], [40, 110, 115], [60, 40, 130], [55, 65, 90], [20, 75, 130], [45, 35, 95],
];
const CLASH_COLORS = [
  [180, 155, 40], [165, 45, 70], [45, 95, 65], [190, 85, 30],
];

function normalizeDayVH(d) {
  const raw = normalizeDay(d);
  raw.axisA = (raw.hrv * 0.5 + (1 - raw.rhr) * 0.3 + (1 - Math.abs(raw.temp) / 1.3) * 0.2);
  raw.axisB = (raw.deepPct * 0.35 + raw.remPct * 0.35 + raw.efficiency * 0.3);
  raw.axisC = (raw.restless * 0.4 + raw.latency * 0.35 + raw.workoutIntensity * 0.25);
  return raw;
}

function gestureColor(rng, m) {
  const primary = m.temp > 0 ? GESTURE_WARM : GESTURE_COOL;
  const secondary = m.temp > 0 ? GESTURE_COOL : GESTURE_WARM;
  const warmBias = lerp(0.4, 0.75, m.axisB);
  const roll = rng();
  let pool;
  if (roll < warmBias) pool = primary;
  else if (roll < warmBias + 0.15) pool = secondary;
  else pool = CLASH_COLORS;
  const c = pool[Math.floor(rng() * pool.length)];
  let r = c[0], g = c[1], b = c[2];
  const sat = lerp(0.08, 1.0, m.axisB);
  const gray = (r + g + b) / 3;
  r = Math.round(gray + (r - gray) * sat + (rng()-0.5)*12);
  g = Math.round(gray + (g - gray) * sat + (rng()-0.5)*8);
  b = Math.round(gray + (b - gray) * sat + (rng()-0.5)*8);
  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}

function makeAttractors(rng, cx, cy, W, H) {
  const count = 2 + Math.floor(rng() * 2);
  const poles = [];
  for (let i = 0; i < count; i++) {
    let px, py;
    const rx = rng();
    if (rx < 0.35) px = cx - W * (0.15 + rng() * 0.25);
    else if (rx < 0.7) px = cx + W * (0.1 + rng() * 0.3);
    else if (rx < 0.85) px = cx - W * (0.35 + rng() * 0.1);
    else px = cx + (rng() - 0.5) * W * 0.2;
    const ry = rng();
    if (ry < 0.35) py = cy - H * (0.1 + rng() * 0.25);
    else if (ry < 0.7) py = cy + H * (0.1 + rng() * 0.25);
    else if (ry < 0.85) py = cy - H * (0.3 + rng() * 0.1);
    else py = cy + (rng() - 0.5) * H * 0.15;
    poles.push({ x: px, y: py, radius: 30 + rng() * 80, weight: 0.3 + rng() * 0.7 });
  }
  return poles;
}

function attractorPosition(rng, poles, cx, cy, W, H) {
  const r = rng();
  if (r < 0.75) {
    const totalW = poles.reduce((s, p) => s + p.weight, 0);
    let pick = rng() * totalW, acc = 0;
    let pole = poles[0];
    for (const p of poles) { acc += p.weight; if (acc >= pick) { pole = p; break; } }
    return { x: pole.x + (rng()-0.5)*pole.radius*2, y: pole.y + (rng()-0.5)*pole.radius*2 };
  } else if (r < 0.9) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = cx + (rng()-0.5)*W*0.8;
      const ty = cy + (rng()-0.5)*H*0.8;
      const minDist = Math.min(...poles.map(p => Math.hypot(p.x-tx, p.y-ty)));
      if (minDist > Math.min(W,H)*0.25) return { x: tx, y: ty };
    }
    return { x: cx + (rng()-0.5)*W*0.6, y: cy + (rng()-0.5)*H*0.6 };
  }
  return { x: cx + (rng()-0.5)*W*0.9, y: cy + (rng()-0.5)*H*0.9 };
}

function paintGround(rng, m, cx, cy, W, H) {
  const gb = lerp(1.8, 0.6, m.axisA);
  const warmShift = lerp(-10, 30, m.axisA);
  const OX = 80, OY = 60;
  function groundColor(rc) {
    const v = (rng()-0.5)*6;
    return [Math.round(rc[0]*gb+v+warmShift), Math.round(rc[1]*gb+v+warmShift*0.6), Math.round(rc[2]*gb+v+warmShift*0.2)];
  }
  oil.pick('knife');
  oil.strokeWeight(45 + rng()*20);
  const rc0 = ORDER_PALETTE[Math.floor(rng()*ORDER_PALETTE.length)];
  for (let x = cx-W/2-OX; x < cx+W/2+OX; x += 16+rng()*8) {
    const c = groundColor(rc0);
    oil.stroke(c[0], c[1], c[2]);
    oil.line(x+(rng()-0.5)*4, cy-H/2-OY, x+(rng()-0.5)*8, cy+H/2+OY);
  }
  oil.pick('flatLarge');
  for (let pass = 0; pass < 3; pass++) {
    const rc = ORDER_PALETTE[Math.floor(rng()*ORDER_PALETTE.length)];
    const c = groundColor(rc);
    oil.stroke(c[0], c[1], c[2]);
    oil.strokeWeight(60+rng()*15);
    const step = 18+rng()*10;
    for (let y = cy-H/2-OY; y < cy+H/2+OY; y += step) {
      oil.line(cx-W/2-OX, y+(rng()-0.5)*5, cx+W/2+OX, y+(rng()-0.5)*5);
    }
  }
}

function paintGroundSurface(rng, m, cx, cy, W, H) {
  const gb = lerp(1.8, 0.6, m.axisA);
  const warmShift = lerp(-10, 30, m.axisA);
  const OX2 = 80, OY2 = 60;
  oil.pick('filbertLarge');
  oil.strokeWeight(35+rng()*15);
  const diagCount = 5+Math.floor(rng()*4);
  for (let i = 0; i < diagCount; i++) {
    const rc = ORDER_PALETTE[Math.floor(rng()*ORDER_PALETTE.length)];
    oil.stroke(Math.round(rc[0]*gb+3+warmShift+(rng()-0.5)*4), Math.round(rc[1]*gb+2+warmShift*0.6+(rng()-0.5)*4), Math.round(rc[2]*gb+warmShift*0.2+(rng()-0.5)*4));
    const y = cy-H/2-OY2+rng()*(H+OY2*2);
    const angle = (rng()<0.5?1:-1)*(0.15+rng()*0.3);
    oil.line(cx-W/2-OX2, y, cx+W/2+OX2, y+angle*W);
  }
  oil.pick('impasto');
  const patchCount = 2+Math.floor(rng()*3);
  for (let i = 0; i < patchCount; i++) {
    const rc = ORDER_PALETTE[Math.floor(rng()*ORDER_PALETTE.length)];
    oil.stroke(Math.round(rc[0]*gb+5+warmShift), Math.round(rc[1]*gb+3+warmShift*0.6), Math.round(rc[2]*gb+warmShift*0.2));
    oil.strokeWeight(25+rng()*15);
    const px = cx+(rng()-0.5)*W*0.6;
    const py = cy+(rng()-0.5)*H*0.6;
    for (let s = 0; s < 3+Math.floor(rng()*3); s++) {
      oil.line(px+(rng()-0.5)*60, py+(rng()-0.5)*40, px+(rng()-0.5)*50, py+(rng()-0.5)*30);
    }
  }
  oil.pick('flatLarge');
  oil.strokeWeight(40+rng()*15);
  const darkest = ORDER_PALETTE[0];
  oil.stroke(darkest[0], darkest[1], darkest[2]);
  for (let i = 0; i < 5; i++) {
    const y = cy+H/2-rng()*H*0.1;
    oil.line(cx-W/2-80, y+(rng()-0.5)*8, cx+W/2+80, y+(rng()-0.5)*8);
  }
  for (let i = 0; i < 4; i++) {
    const y = cy-H/2+rng()*H*0.08;
    oil.line(cx-W/2-80, y+(rng()-0.5)*6, cx+W/2+80, y+(rng()-0.5)*6);
  }
}

function paintGraphicShapes(rng, m, cx, cy, W, H) {
  const shapeCount = Math.round(lerp(1, 4, m.axisB));
  for (let i = 0; i < shapeCount; i++) {
    const roll = rng();
    let color;
    if (roll < 0.30) color = [8, 6, 4];
    else if (roll < 0.55) color = [220, 215, 210];
    else color = gestureColor(rng, m);
    oil.pick('knife');
    oil.stroke(color[0], color[1], color[2]);
    oil.strokeWeight(8);
    const edgeBreak = (i === 0);
    let sx, sy;
    if (edgeBreak) {
      const edge = Math.floor(rng()*4);
      if (edge===0) { sx=cx-W/2+W*(rng()*0.15); sy=cy+(rng()-0.5)*H*0.4; }
      else if (edge===1) { sx=cx+W/2-W*(rng()*0.15); sy=cy+(rng()-0.5)*H*0.4; }
      else if (edge===2) { sx=cx+(rng()-0.5)*W*0.4; sy=cy-H/2+H*(rng()*0.15); }
      else { sx=cx+(rng()-0.5)*W*0.4; sy=cy+H/2-H*(rng()*0.15); }
    } else {
      sx = cx+(rng()-0.5)*W*0.6;
      sy = cy+(rng()-0.5)*H*0.5;
    }
    const sizeMul = lerp(0.4, 1.5, m.axisB);
    const sw = W*lerp(0.08, 0.28, rng())*sizeMul;
    const sh = H*lerp(0.06, 0.22, rng())*sizeMul;
    const shapeType = Math.floor(rng()*3);
    if (shapeType === 0) {
      for (let y = -sh/2; y < sh/2; y += 3) {
        const wobble = Math.sin(y*0.02)*8;
        oil.line(sx-sw/2+wobble, sy+y, sx+sw/2+wobble*0.6, sy+y);
      }
    } else if (shapeType === 1) {
      const r = Math.min(sw, sh)/2;
      for (let y = -r; y < r; y += 3) {
        const halfW = Math.sqrt(r*r-y*y)*(sw/sh);
        oil.line(sx-halfW, sy+y, sx+halfW, sy+y);
      }
    } else {
      for (let y = -sh/2; y < sh/2; y += 3) {
        const t = (y+sh/2)/sh;
        const halfW = sw*t*0.5;
        oil.line(sx-halfW, sy+y, sx+halfW, sy+y);
      }
    }
  }
}

function paintStructure(rng, m, cx, cy, W, H) {
  const coherence = m.axisA;
  const density = Math.round(lerp(3, 6, coherence));
  function structColor() {
    const r = rng();
    if (r < 0.25) return [10, 8, 5];
    if (r < 0.5) return [200, 195, 185];
    const g = lerp(95, 175, coherence);
    return [g, g-5, g-15];
  }
  oil.pick('filbertLarge');
  const baseWeight = lerp(14, 22, coherence);
  const wobble = lerp(25, 2, coherence);

  const ht = 0.3+rng()*0.15;
  const hy = cy-H/2+ht*H;
  let sc = structColor();
  oil.stroke(sc[0], sc[1], sc[2]);
  oil.strokeWeight(baseWeight);
  if (coherence > 0.4) {
    oil.line(cx-W/2+10, hy+(rng()-0.5)*wobble, cx+W/2-10, hy+(rng()-0.5)*wobble);
  } else {
    const segs = 2+Math.floor(rng()*3);
    const segW = W/segs;
    for (let s = 0; s < segs; s++) {
      if (rng() > 0.2) {
        const sx = cx-W/2+10+s*segW;
        oil.line(sx, hy+(rng()-0.5)*wobble*1.5, sx+segW*0.65, hy+(rng()-0.5)*wobble*2);
      }
    }
  }
  if (density > 2) {
    const vt = 0.55+rng()*0.25;
    const vx = cx-W/2+vt*W;
    sc = structColor();
    oil.stroke(sc[0], sc[1], sc[2]);
    oil.strokeWeight(baseWeight*0.8);
    if (coherence > 0.5) {
      oil.line(vx+(rng()-0.5)*wobble, cy-H/2+10, vx+(rng()-0.5)*wobble, cy+H/2-10);
    } else {
      const segs = 2+Math.floor(rng()*2);
      const segH = H/segs;
      for (let s = 0; s < segs; s++) {
        if (rng() > 0.25) {
          const sy = cy-H/2+10+s*segH;
          oil.line(vx+(rng()-0.5)*wobble, sy, vx+(rng()-0.5)*wobble*1.5, sy+segH*0.6);
        }
      }
    }
  }
  if (density > 3) {
    sc = structColor();
    oil.stroke(sc[0], sc[1], sc[2]);
    oil.strokeWeight(baseWeight*1.2);
    const da = (0.2+rng()*0.6)*(rng()<0.5?1:-1);
    const startY = cy+(rng()-0.5)*H*0.3;
    oil.line(cx-W/2+5, startY, cx+W/2-5, startY+da*W);
  }
  oil.pick('impasto');
  oil.strokeWeight(lerp(10, 22, coherence));
  sc = structColor();
  oil.stroke(sc[0], sc[1], sc[2]);
  const rw = W*lerp(0.12, 0.35, rng());
  const rh = H*lerp(0.08, 0.25, rng());
  const rx = cx+(rng()-0.5)*W*0.35;
  const ry = cy+(rng()-0.5)*H*0.35;
  oil.line(rx-rw/2-3, ry-rh/2, rx+rw/2+3, ry-rh/2);
  oil.line(rx+rw/2, ry-rh/2-3, rx+rw/2, ry+rh/2+3);
  oil.line(rx+rw/2+3, ry+rh/2, rx-rw/2-3, ry+rh/2);
  oil.line(rx-rw/2, ry+rh/2+3, rx-rw/2, ry-rh/2-3);
  oil.strokeWeight(lerp(14, 28, coherence));
  oil.line(rx-rw/2-5, ry-rh/2, rx+rw/2+5, ry-rh/2);
}

function paintGesture(rng, m, cx, cy, W, H) {
  const poles = makeAttractors(rng, cx, cy, W, H);
  const gestureCount = Math.round(lerp(3, 24, m.axisC));
  const speed = m.rhr;

  // Spanning gesture
  oil.pick('flatLarge');
  oil.strokeWeight(lerp(24, 50, m.axisA));
  const c = gestureColor(rng, m);
  oil.stroke(c[0], c[1], c[2]);
  const len = W*lerp(0.5, 0.85, rng());
  let px = cx+(rng()-0.5)*W*0.3;
  let py = cy+(rng()-0.5)*H*0.3;
  let a = rng()*Math.PI*2;
  const segments = Math.round(lerp(2, 8, m.axisA));
  for (let s = 0; s < segments; s++) {
    a += (rng()-0.5)*lerp(1.2, 0.4, m.axisA);
    const nx = px+Math.cos(a)*len/5;
    const ny = py+Math.sin(a)*len/5;
    oil.line(px, py, nx, ny);
    px = nx; py = ny;
  }

  for (let i = 0; i < gestureCount; i++) {
    const color = gestureColor(rng, m);
    oil.stroke(color[0], color[1], color[2]);
    const w = lerp(14, 36, 1-m.axisC)*(0.7+rng()*0.7);
    const pos = attractorPosition(rng, poles, cx, cy, W, H);
    const gx = pos.x, gy = pos.y;
    const typeRoll = rng();
    let gType;
    if (m.axisA > 0.5) {
      gType = typeRoll<0.45?0:typeRoll<0.65?1:typeRoll<0.85?2:3;
    } else {
      gType = typeRoll<0.15?0:typeRoll<0.45?1:typeRoll<0.75?2:3;
    }
    switch (gType) {
      case 0: {
        oil.pick('filbertLarge');
        oil.strokeWeight(w);
        const segs = Math.round(lerp(3, 7, 1-speed));
        let angle = rng()*Math.PI*2;
        const curve = (rng()<0.5?1:-1)*lerp(0.2, 0.8, 1-speed);
        let px2 = gx, py2 = gy;
        const arcLen = lerp(40, 150, 1-speed);
        for (let s = 0; s < segs; s++) {
          angle += curve*(0.5+rng()*0.5);
          const nx = px2+Math.cos(angle)*arcLen/segs;
          const ny = py2+Math.sin(angle)*arcLen/segs;
          oil.line(px2, py2, nx, ny);
          px2 = nx; py2 = ny;
        }
        break;
      }
      case 1: {
        oil.pick('knifeSmall');
        oil.strokeWeight(w*0.7);
        const scratchCount = Math.round(lerp(2, 7, m.axisC));
        for (let s = 0; s < scratchCount; s++) {
          const sx = gx+(rng()-0.5)*35;
          const sy = gy+(rng()-0.5)*35;
          const len2 = 10+rng()*45;
          const angle = rng()*Math.PI*2;
          oil.line(sx, sy, sx+Math.cos(angle)*len2, sy+Math.sin(angle)*len2);
        }
        break;
      }
      case 2: {
        oil.pick('flatLarge');
        oil.strokeWeight(w*1.8);
        const len2 = lerp(40, 180, 1-m.axisC)*(0.6+rng()*0.8);
        const angle = rng()*Math.PI;
        oil.line(gx-Math.cos(angle)*len2/2, gy-Math.sin(angle)*len2/2, gx+Math.cos(angle)*len2/2, gy+Math.sin(angle)*len2/2);
        break;
      }
      case 3: {
        oil.pick('impasto');
        oil.strokeWeight(w*2.5);
        oil.line(gx, gy, gx+(rng()-0.5)*30, gy+(rng()-0.5)*25);
        break;
      }
    }
  }
}

function paintSurface(rng, m, cx, cy, W, H) {
  const negations = Math.round(lerp(1, 8, m.axisC));
  oil.pick('flatLarge');
  for (let i = 0; i < negations; i++) {
    oil.stroke(12+rng()*10, 10+rng()*8, 6+rng()*6);
    oil.strokeWeight(lerp(8, 28, m.axisC));
    const nx = cx+(rng()-0.5)*W*0.65;
    const ny = cy+(rng()-0.5)*H*0.65;
    const len = 40+rng()*lerp(60, 140, m.axisC);
    const angle = rng()*Math.PI;
    oil.line(nx-Math.cos(angle)*len/2, ny-Math.sin(angle)*len/2, nx+Math.cos(angle)*len/2, ny+Math.sin(angle)*len/2);
  }
  if (m.workoutIntensity > 0.2) {
    oil.pick('impasto');
    const ac = gestureColor(rng, m);
    oil.stroke(ac[0], ac[1], ac[2]);
    oil.strokeWeight(lerp(12, 35, m.workoutIntensity));
    const angle = rng()*Math.PI;
    const len = W*lerp(0.3, 0.7, m.workoutIntensity);
    oil.line(cx-Math.cos(angle)*len/2, cy+(rng()-0.5)*H*0.3-Math.sin(angle)*len/2, cx+Math.cos(angle)*len/2, cy+(rng()-0.5)*H*0.3+Math.sin(angle)*len/2);
  }
  const scratchCount = Math.round(lerp(2, 20, m.latency));
  oil.pick('knifeSmall');
  oil.strokeWeight(4+rng()*5);
  for (let i = 0; i < scratchCount; i++) {
    oil.stroke(40+rng()*25, 35+rng()*20, 30+rng()*15);
    const sx = cx+(rng()-0.5)*W*0.7;
    const sy = cy+(rng()-0.5)*H*0.7;
    const len = 8+rng()*25;
    const angle = rng()*Math.PI;
    oil.line(sx, sy, sx+Math.cos(angle)*len, sy+Math.sin(angle)*len);
  }
  oil.pick('knifeSmall');
  oil.strokeWeight(2);
  const clusterX = cx+(rng()-0.5)*W*0.5;
  const clusterY = cy+(rng()-0.5)*H*0.5;
  const tinyCount = Math.round(lerp(4, 16, m.axisC));
  for (let t = 0; t < tinyCount; t++) {
    oil.stroke(18+rng()*15, 15+rng()*12, 12+rng()*10);
    const tx = clusterX+(rng()-0.5)*40;
    const ty = clusterY+(rng()-0.5)*40;
    oil.line(tx, ty, tx+(rng()-0.5)*12, ty+(rng()-0.5)*12);
  }
}

function paintDay(p, day, stats, W, H) {
  const m = normalizeDayVH(day);
  const seed = hashStr(day.day);
  const cx = 0, cy = 0;

  p.background(233, 228, 217);

  oil.seed(seed);
  paintGround(makeRNG(seed), m, cx, cy, W, H);
  oil.flush();

  oil.seed(seed+3);
  paintGroundSurface(makeRNG(seed+3), m, cx, cy, W, H);
  oil.flush();

  oil.seed(seed+7919);
  paintGraphicShapes(makeRNG(seed+7919), m, cx, cy, W, H);
  oil.flush();

  oil.seed(seed+15887);
  paintStructure(makeRNG(seed+15887), m, cx, cy, W, H);
  oil.flush();

  oil.seed(seed+31771);
  paintGesture(makeRNG(seed+31771), m, cx, cy, W, H);
  oil.flush();

  oil.seed(seed+63541);
  paintSurface(makeRNG(seed+63541), m, cx, cy, W, H);
  oil.flush();
}

window.WorkPainter = {
  id: 'vonheyl',
  title: 'Von Heyl',
  subtitle: 'Symbiotic Art',
  canvasW: 480,
  canvasH: 620,
  bgColor: '#fafafa',
  hasNavigation: true,
  paintDay: paintDay,
  aboutHTML: `<h2>Process</h2>
<p>This is a symbiotic artwork. The paintings are translated from the artist\u2019s own physiological data, recorded by a wearable biometric sensor (Oura Ring) during sleep. The body becomes both the subject and the instrument. Each painting is a portrait of a single night: the body\u2019s argument with itself, transcribed in oil.</p>
<p>Every night, consciousness abdicates. The body \u2014 ungoverned \u2014 negotiates between integration and disintegration. Eleven physiological measurements are extracted from each cycle, grouped into three axes, and mapped to three competing visual systems. The same data always produces the same painting. The process is deterministic.</p>
<h3>Three Axes</h3>
<p><strong>Autonomic Tone</strong> \u2014 heart rate variability, resting heart rate, temperature deviation. The nervous system\u2019s posture. High coherence: stable geometry, clean lines. Low coherence: broken grids, wobbling fragments.</p>
<p><strong>Sleep Architecture</strong> \u2014 deep sleep, REM sleep, efficiency. How the brain rebuilt itself overnight. This axis governs color. Rich architecture: saturated, specific pigment. Fragmented: desaturated, muddy.</p>
<p><strong>Agitation</strong> \u2014 restless periods, onset latency, workout intensity. The body\u2019s resistance to rest. This axis drives mark density. Low agitation: few deliberate gestures. High agitation: frantic accumulation, overpainting.</p>
<h3>Biometric-to-Visual Mapping</h3>
<table>
<tr><th>Axis / Signal</th><th>Visual System</th></tr>
<tr><td>A: HRV + RHR + Temperature</td><td>Structure \u2014 geometric coherence, grid integrity</td></tr>
<tr><td>B: Deep + REM + Efficiency</td><td>Color saturation \u2014 rich pigment or desaturated mud</td></tr>
<tr><td>C: Restless + Latency + Workout</td><td>Mark density \u2014 deliberate calm or frantic turbulence</td></tr>
<tr><td>Body temperature</td><td>Dominant palette \u2014 warm oxide or cool slate</td></tr>
<tr><td>Resting heart rate</td><td>Gesture speed \u2014 sweeping arcs or jittery scratches</td></tr>
</table>
<h3>Construction</h3>
<p>Each painting is built in six sequential passes over warm ivory. A multi-directional ground is scraped with palette knife and broad flat strokes. Opaque graphic shapes assert or fragment. Asymmetric lines divide the canvas. Gestural marks cluster around attraction poles. Dark negation strokes overwrite what came before. Fine scratches score the surface.</p>`,
};

})();
