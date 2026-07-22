// Variations 87 — the rule (the second half of the machine).
// This module holds everything that turns the raw record of one body into
// the transported form: causal percentiles, the entangled channels, and the
// seed formula. Its SHA-256 is printed in the certificate §10; any change is
// either a conservation treatment or a new state of the work.
//
// Causal percentiles: a day is ranked only against the days that precede it
// (a trailing window from the immutable record). Once a day has ended, its
// inputs never change — so its painting never changes.

'use strict';

const PCT_WINDOW    = 180;   // trailing causal window for ranking
const SHORT_HISTORY = 14;    // damping horizon for the first days

const PCT_FIELDS = [
  'readinessScore', 'sleepScore', 'hrv', 'avgHeartRate', 'avgBreath',
  'totalSleepHours', 'deepSleepPct', 'remSleepPct', 'efficiency',
  'latency', 'restlessPeriods', 'workoutIntensity', 'workoutCount',
];
const CORE_FIELDS = PCT_FIELDS.slice(0, 11);   // completeness is judged on these

// Percentile with mid-rank ties: p = (below + 0.5*equal) / n.
function causalPercentile(values, v) {
  if (v == null || isNaN(v) || values.length === 0) return 0.5;
  let below = 0, equal = 0;
  for (const x of values) { if (x < v) below++; else if (x === v) equal++; }
  const p = (below + 0.5 * equal) / values.length;
  // Short history reads quietly, not hysterically.
  const n = values.length;
  return n < SHORT_HISTORY ? 0.5 + (p - 0.5) * (n / SHORT_HISTORY) : p;
}

// FNV-1a over a string — the seed formula fixed in the certificate:
// seed = fnv1a(owner + '|' + ISO date + '|' + record hash)
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
}

function recordHash(day) {
  const parts = PCT_FIELDS.map(k => {
    const v = day[k];
    return v == null || isNaN(v) ? 'x' : Math.round((v + 1e-9) * 1000).toString(36);
  });
  return parts.join(',');
}

const clamp01 = v => Math.max(0, Math.min(1, v));

// Transform the raw history into the clean transported form.
// Every channel entangles >= 2 ranked signals; no raw name or value survives.
function transformDays(rawDays, owner) {
  const out = [];
  for (let i = 0; i < rawDays.length; i++) {
    const day = rawDays[i];
    const lo = Math.max(0, i - (PCT_WINDOW - 1));
    const win = rawDays.slice(lo, i + 1);

    const P = {};
    for (const k of PCT_FIELDS) {
      const values = win.map(d => d[k]).filter(v => v != null && !isNaN(v));
      P[k] = causalPercentile(values, day[k]);
    }

    const r  = P.readinessScore, sl = P.sleepScore,  hv = P.hrv;
    const hr = P.avgHeartRate,   br = P.avgBreath;
    const th = P.totalSleepHours, dp = P.deepSleepPct, rm = P.remSleepPct;
    const ef = P.efficiency,     la = P.latency,      rs = P.restlessPeriods;
    const wi = P.workoutIntensity, wc = P.workoutCount;
    const tempDev = Math.max(-1, Math.min(1, day.tempDeviation ?? 0));

    const ground = (hv + dp + sl) / 3;

    const c = [
      /*  0 key       */ (r + sl + hv) / 3,
      /*  1 ground    */ ground,
      /*  2 waking    */ (r + wi) / 2,
      /*  3 agitation */ (rs + br + (1 - ef) + hr) / 4,
      /*  4 scatter   */ (hv + dp) / 2,
      /*  5 flow      */ ((1 - hr) + (1 - br)) / 2,
      /*  6 span      */ (th + ef) / 2,
      /*  7 sway      */ (rm + (1 - la)) / 2,
      /*  8 depth     */ (dp + th) / 2,
      /*  9 fullness  */ (sl + ef) / 2,
      /* 10 onset     */ ((1 - la) + wi) / 2,
      /* 11 heat      */ clamp01(0.5 + tempDev * 0.20 + (hr - 0.5) * 0.22 + (br - 0.5) * 0.12),
      /* 12 exertion  */ clamp01(wi * 0.38 + wc * 0.24 + (1 - ground) * 0.38),
      /* 13 phase-a   */ (ef + br) / 2,
      /* 14 phase-b   */ (hr + la) / 2,
      /* 15 phase-c   */ (th + rs) / 2,
      /* 16 phase-d   */ (dp + rm) / 2,
      /* 17 field-x   */ (hv + br) / 2,
      /* 18 field-y   */ (sl + dp) / 2,
      /* 19 tilt      */ (r + (1 - hr)) / 2,
    ].map(v => +clamp01(v).toFixed(4));

    const missing = CORE_FIELDS.filter(k => day[k] == null || isNaN(day[k])).length;

    out.push({
      d: day.day,
      s: fnv1a(`${owner}|${day.day}|${recordHash(day)}`),
      c,
      i: missing >= 3 ? 1 : 0,
    });
  }
  return out;
}

module.exports = {
  PCT_WINDOW, SHORT_HISTORY, PCT_FIELDS, CORE_FIELDS,
  causalPercentile, fnv1a, recordHash, transformDays,
};
