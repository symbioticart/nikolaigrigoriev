// Variation 89 — the freeze rule.
// Variation 89's painter (art/89/painter.js) ranks each metric against a
// percentile distribution. Historically that distribution was rebuilt over the
// WHOLE record on every load (a global sort), so a past day's ranking — and
// therefore its painting — DRIFTED every time the record grew. That breaks the
// work's own law: once a day has ended its painting must never change.
//
// The fix mirrors Variation 87 (rule.js): rank each day CAUSALLY — only against
// the days that precede it, in the same trailing window, with the SAME certified
// percentile function (mid-rank ties + short-history damping). We reuse
// rule.causalPercentile so there is exactly ONE percentile implementation on the
// site. The seed is unchanged: 89 already seeds from the body only
// (hashMetrics), which is date-independent and therefore never drifted.
//
// Output: one frozen `m` (the normalized channels the painter consumes) per day,
// aligned by index with the raw record. The server attaches it to each served
// day as `day._m`; the painter renders from it and skips the global sort.

'use strict';

const rule = require('./rule');

// The eleven ranked fields, mapped to the painter's channel names
// (must match normalizeMetrics() in art/89/painter.js exactly).
const RANKED = [
  ['readiness',  'readinessScore'],
  ['sleep',      'sleepScore'],
  ['hrv',        'hrv'],
  ['rhr',        'avgHeartRate'],
  ['breath',     'avgBreath'],
  ['sleepHours', 'totalSleepHours'],
  ['deepPct',    'deepSleepPct'],
  ['remPct',     'remSleepPct'],
  ['efficiency', 'efficiency'],
  ['latency',    'latency'],
  ['restless',   'restlessPeriods'],
];

// Build the frozen channels for every day, ranked causally (trailing window of
// the days up to and including it — never the future). Returns an array aligned
// by index with rawDays.
function freezeDays89(rawDays) {
  const out = [];
  for (let i = 0; i < rawDays.length; i++) {
    const day = rawDays[i];
    const lo = Math.max(0, i - (rule.PCT_WINDOW - 1));
    const win = rawDays.slice(lo, i + 1);

    const m = {};
    for (const [chan, field] of RANKED) {
      const values = win.map(d => d[field]).filter(v => v != null && !isNaN(v));
      m[chan] = +rule.causalPercentile(values, day[field]).toFixed(4);
    }
    // Non-ranked channels are per-day facts — they never drifted; carry them as-is.
    m.temp             = Math.max(-1, Math.min(1, day.tempDeviation ?? 0));
    m.workoutCount     = day.workoutCount || 0;
    m.workoutIntensity = day.workoutIntensity || 0;

    out.push(m);
  }
  return out;
}

module.exports = { RANKED, freezeDays89 };
