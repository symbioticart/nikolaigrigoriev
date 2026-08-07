// The laws of the work, asserted.
//
// These are not tests of convenience. Each one guards a promise the work makes
// in its own certificate: that a finished day is never repainted, that a day is
// weighed only against the days before it, that silence begins on the second
// day and dissolves toward the ground, that no measurement can be read back
// out. If one of these fails, the work has changed — not the code.
//
// Node's own runner, no dependencies: `node --test test/`.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const rule = require(path.join(ROOT, 'rule.js'));
const rule89 = require(path.join(ROOT, 'rule89.js'));
const SILENCE = require(path.join(ROOT, 'art/silence.js'));

const RAW = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/daily-metrics.json'), 'utf8'));
const days = Array.isArray(RAW) ? RAW : RAW.days;
const OWNER = 'Nikolai Grigoriev';

test('the record we test against is the real one', () => {
  assert.ok(days.length > 900, `expected a long record, got ${days.length} days`);
  assert.match(days[0].day, /^\d{4}-\d{2}-\d{2}$/);
});

// ── Silence ────────────────────────────────────────────────────────────────
test('silence begins on the second day, not the first', () => {
  const first = SILENCE.params(1);
  assert.equal(first.gray, 0, 'a first silent day holds the painting untouched');
  assert.equal(first.fade, 0);
  assert.ok(SILENCE.params(2).gray > 0, 'the second day begins to lose colour');
});

test('colour is gone by the fourteenth day, the image by the thirtieth', () => {
  assert.equal(SILENCE.params(14).gray, 1, 'colour fully drained on day 14');
  assert.ok(SILENCE.params(13).gray < 1);
  assert.equal(SILENCE.params(30).fade, 1, 'dissolved into the ground by day 30');
  assert.ok(SILENCE.params(29).fade < 1);
});

test('silence only ever deepens, and never overshoots', () => {
  let prevGray = -1, prevFade = -1;
  for (let gap = 0; gap <= 120; gap++) {
    const p = SILENCE.params(gap);
    for (const k of ['gray', 'fade']) {
      assert.ok(p[k] >= 0 && p[k] <= 1, `${k} out of range at gap ${gap}`);
    }
    assert.ok(p.gray >= prevGray, `colour returned at gap ${gap}`);
    assert.ok(p.fade >= prevFade, `presence returned at gap ${gap}`);
    prevGray = p.gray; prevFade = p.fade;
  }
});

test('silence never touches the form of the work', () => {
  // Silence drains colour and dissolves presence. It must not move a single
  // mark: a `margin` here would reach back into the painter and reshape a day
  // that has already been written. It was removed deliberately; keep it gone.
  assert.equal(SILENCE.params(20).margin, undefined,
    'silence has regained a handle on the composition');
  assert.deepEqual(Object.keys(SILENCE.params(5)).sort(), ['fade', 'gray']);
});

test('an archive cell lightens with the silence it stands in', () => {
  const shade = (g) => Number(SILENCE.shade(g).match(/\d+/)[0]);
  assert.ok(shade(0) < 60, 'a written day is near black');
  assert.ok(shade(30) > 230, 'a dead day is near white');
  assert.ok(shade(14) > shade(2), 'and it lightens on the way');
});

// ── Variations 87: the past is frozen ──────────────────────────────────────
test('a finished day is never repainted as the record grows', () => {
  const full = rule.transformDays(days, OWNER);
  const idx = 500;
  const truncated = rule.transformDays(days.slice(0, idx + 1), OWNER);
  assert.deepEqual(truncated[idx], full[idx],
    'the same day, judged against a shorter and a longer record, must be identical');
});

test('a day is weighed only against the days before it', () => {
  // Rewrite the future beyond recognition; the past must not notice.
  const meddled = days.map((d, i) =>
    i > 600 ? Object.assign({}, d, { hrv: 999, sleepScore: 1, readinessScore: 1 }) : d);
  const before = rule.transformDays(days, OWNER)[400];
  const after = rule.transformDays(meddled, OWNER)[400];
  assert.deepEqual(after, before, 'a later day changed an earlier painting');
});

test('the seed of a day is fixed by owner, date and record together', () => {
  const one = rule.transformDays(days.slice(0, 50), OWNER);
  const two = rule.transformDays(days.slice(0, 50), OWNER);
  assert.equal(one[49].s, two[49].s, 'the same inputs must give the same seed');
  const other = rule.transformDays(days.slice(0, 50), 'Someone Else');
  assert.notEqual(other[49].s, one[49].s, 'a different owner must give a different seed');
});

test('no measurement can be read back out of the channels', () => {
  const out = rule.transformDays(days, OWNER);
  assert.ok(out.every(d => d.c.length === 20), 'twenty channels per day');
  assert.ok(out.every(d => d.c.every(v => v >= 0 && v <= 1)), 'channels stay in [0,1]');
  // No channel may be a bare copy of a single ranked signal.
  const raw = days.map(d => d.hrv).filter(v => v != null);
  const chan = out.map(d => d.c[0]);
  assert.notDeepEqual(chan.slice(0, 50), raw.slice(0, 50));
  for (const d of out) {
    assert.equal(Object.keys(d).sort().join(','), 'c,d,i,s',
      'a served day carries only date, seed, channels and completeness');
  }
});

// ── Variation 89: frozen normalisation ─────────────────────────────────────
test('89 ranks a day causally, so its past is frozen too', () => {
  const full = rule89.freezeDays89(days);
  const idx = 500;
  const truncated = rule89.freezeDays89(days.slice(0, idx + 1));
  assert.deepEqual(truncated[idx], full[idx],
    'the same day must look the same however long the record has grown');
});

test('89 seeds from the body alone — the server and the painter agree', () => {
  // A byte-for-byte replica of hashMetrics() in art/89/painter.js. If the
  // painter's formula ever drifts from the server's, this fails loudly rather
  // than quietly repainting every day of the work.
  function painterHash(day) {
    const parts = [
      day.readinessScore, day.sleepScore, day.hrv,
      day.avgHeartRate, day.avgBreath,
      day.totalSleepHours, day.deepSleepPct, day.remSleepPct,
      day.efficiency, day.latency, day.restlessPeriods,
      day.tempDeviation, day.workoutCount, day.workoutIntensity,
    ];
    let h = 0x811c9dc5;
    for (const v of parts) {
      const q = Math.round(((v ?? 0) + 1e-9) * 1000) | 0;
      h = ((h << 5) - h + q) | 0;
      h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
    }
    return Math.abs(h) || 1;
  }
  const frozen = rule89.freezeDays89(days);
  let checked = 0;
  for (let i = 0; i < days.length; i++) {
    assert.equal(frozen[i]._s, painterHash(days[i]), `seed disagrees on ${days[i].day}`);
    checked++;
  }
  assert.ok(checked > 900);
});

test('89 serves channels, never the raw body', () => {
  const frozen = rule89.freezeDays89(days.slice(0, 100));
  for (const d of frozen) {
    assert.deepEqual(Object.keys(d).sort(), ['_m', '_s', 'day']);
    assert.equal(d.readinessScore, undefined, 'a raw measurement escaped');
    for (const [chan] of rule89.RANKED) {
      assert.ok(d._m[chan] >= 0 && d._m[chan] <= 1, `${chan} out of range`);
    }
  }
});

// ── The percentile itself ──────────────────────────────────────────────────
test('a short history reads quietly rather than hysterically', () => {
  const loud = rule.causalPercentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 20);
  const quiet = rule.causalPercentile([1, 2, 3], 3);
  assert.ok(loud > 0.9, 'with history behind it, a high day ranks high');
  assert.ok(quiet < loud, 'with almost none, the same day is damped toward the middle');
});

test('an absent measurement sits in the middle, it does not fail', () => {
  assert.equal(rule.causalPercentile([1, 2, 3], null), 0.5);
  assert.equal(rule.causalPercentile([], 5), 0.5);
  assert.equal(rule.causalPercentile([1, 2, 3], NaN), 0.5);
});
