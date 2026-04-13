// Shared utilities for all symbiotic art painters

function makeRNG(seed) {
  let s = seed >>> 0;
  return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function norm(v, min, max) {
  if (v == null || isNaN(v)) return 0.5;
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

function lerp(a, b, t) { return a + (b - a) * t; }

function normalizeDay(d) {
  return {
    readiness: norm(d.readinessScore, 19, 95),
    sleep: norm(d.sleepScore, 20, 73),
    hrv: norm(d.hrv, 14, 116),
    rhr: norm(d.avgHeartRate, 52, 83),
    deepPct: norm(d.deepSleepPct, 0.04, 0.25),
    remPct: norm(d.remSleepPct, 0.03, 0.30),
    efficiency: norm(d.efficiency, 60, 95),
    restless: norm(d.restlessPeriods, 73, 495),
    temp: d.tempDeviation || 0,
    workoutIntensity: norm(d.workoutIntensity, 0, 24),
    latency: norm(d.latency, 60, 6420),
  };
}

function fmtDate(d) {
  const [y, m, day] = d.split('-');
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${day} ${months[parseInt(m,10)-1]} ${y}`;
}
