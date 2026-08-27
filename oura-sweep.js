// Everything the ring gives, kept as it was given.
//
// The site's own record is a reduction: fourteen scalars a day, and the night
// series one work needs. That is what the paintings read, and it is deliberately
// narrow. But a reduction cannot be un-reduced later — a signal the sync never
// asked for is a signal no future work can ever paint, because the days it
// belonged to have passed. So the sweep asks Oura for every collection it
// publishes and writes the answers down raw, beside the archive, untouched.
//
// It is deliberately separate from sync(): the paintings must not wait on it,
// and it must not be able to break them. Nothing here returns into the record.
const fs = require('fs');
const path = require('path');

// Everything Oura v2 publishes, by the shape of its query.
const DATED = [
  'daily_activity', 'daily_readiness', 'daily_sleep', 'daily_spo2', 'daily_stress',
  'daily_cardiovascular_age', 'daily_resilience', 'sleep', 'sleep_time', 'workout',
  'session', 'tag', 'enhanced_tag', 'rest_mode_period', 'vO2_max',
];
const SINGLETON = ['personal_info', 'ring_configuration'];
const HEARTRATE = 'heartrate';          // asked by the hour, not by the day

const CHUNK_DAYS = 90;                  // one request per window, as the sync does
const HR_CHUNK_DAYS = 7;                // five-minute samples: a week is already large

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

function windows(from, to, days) {
  const out = [];
  let cur = new Date(from);
  while (cur < to) {
    const end = new Date(Math.min(to.getTime(), addDays(cur, days).getTime()));
    out.push([iso(cur), iso(end)]);
    cur = addDays(end, 1);
  }
  return out;
}

// A page at a time until Oura says there are no more. The sync never followed
// next_token; a window that overflowed one page lost the rest in silence.
async function fetchAll(get, name, qs) {
  const rows = [];
  let token = null;
  for (let page = 0; page < 200; page++) {
    const url = `https://api.ouraring.com/v2/usercollection/${name}?${qs}` +
                (token ? `&next_token=${encodeURIComponent(token)}` : '');
    const r = await get(url);
    if (r.status !== 200) throw new Error(`${name} ${r.status}: ${String(r.body).slice(0, 120)}`);
    const j = JSON.parse(r.body);
    if (Array.isArray(j.data)) rows.push(...j.data);
    else if (j && !j.data) return [j];              // singletons answer with the object itself
    token = j.next_token;
    if (!token) break;
  }
  return rows;
}

const keyOf = (r) => r.id || (r.day != null ? String(r.day) + '|' + (r.timestamp || '') : JSON.stringify(r));

function readJson(f, dflt) {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return dflt; }
}
function writeJson(f, v) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f + '.tmp', JSON.stringify(v));
  fs.renameSync(f + '.tmp', f);                     // never leave a half-written record
}

// One sweep. `birth` is the first day worth asking about; `full` reaches back to
// it, otherwise only the recent tail is refreshed.
async function sweep({ get, dir, birth, full, log }) {
  log = log || (() => {});
  const now = new Date();
  const from = full ? new Date(Date.parse(birth)) : addDays(now, -(CHUNK_DAYS - 1));
  const report = {};

  for (const name of DATED) {
    try {
      const fetched = [];
      for (const [a, b] of windows(from, now, CHUNK_DAYS)) {
        fetched.push(...await fetchAll(get, name, `start_date=${a}&end_date=${b}`));
      }
      const f = path.join(dir, name + '.json');
      const held = readJson(f, []);
      const byKey = new Map(held.map((r) => [keyOf(r), r]));
      let added = 0;
      // What was written first stays as written: upstream may revise a day, and
      // the point of this file is what the ring actually said at the time.
      for (const r of fetched) { const k = keyOf(r); if (!byKey.has(k)) { byKey.set(k, r); added++; } }
      const all = [...byKey.values()].sort((x, y) => String(x.day || '') < String(y.day || '') ? -1 : 1);
      if (added || !held.length) writeJson(f, all);
      report[name] = { ok: true, held: all.length, added };
    } catch (e) {
      report[name] = { ok: false, err: e.message };
      log(`[sweep] ${name}: ${e.message}`);
    }
  }

  for (const name of SINGLETON) {
    try {
      const rows = await fetchAll(get, name, '');
      writeJson(path.join(dir, name + '.json'), rows[0] || rows);
      report[name] = { ok: true, held: 1, added: 0 };
    } catch (e) {
      report[name] = { ok: false, err: e.message };
      log(`[sweep] ${name}: ${e.message}`);
    }
  }

  // The pulse, by the day, written once. A past day never changes, and the
  // series is bulky enough that rewriting one file would be the whole cost of
  // the sweep.
  try {
    const hrDir = path.join(dir, HEARTRATE);
    fs.mkdirSync(hrDir, { recursive: true });
    const have = new Set(fs.readdirSync(hrDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, 10)));
    const today = iso(now);
    let added = 0, days = 0;
    for (const [a, b] of windows(from, now, HR_CHUNK_DAYS)) {
      // A whole window already on disk costs no request at all.
      const span = [];
      for (let d = new Date(Date.parse(a)); iso(d) <= b; d = addDays(d, 1)) span.push(iso(d));
      if (span.every((d) => have.has(d) && d < today)) continue;
      const rows = await fetchAll(get, HEARTRATE,
        `start_datetime=${a}T00:00:00%2B00:00&end_datetime=${b}T23:59:59%2B00:00`);
      const byDay = new Map();
      for (const r of rows) {
        const d = String(r.timestamp || '').slice(0, 10);
        if (!d) continue;
        (byDay.get(d) || byDay.set(d, []).get(d)).push(r);
      }
      for (const [d, list] of byDay) {
        const f = path.join(hrDir, d + '.json');
        if (fs.existsSync(f) && d < today) continue;   // written once; today hardens tomorrow
        writeJson(f, list);
        if (!have.has(d)) added++;
        days++;
      }
    }
    report[HEARTRATE] = { ok: true, held: fs.readdirSync(hrDir).length, added };
  } catch (e) {
    report[HEARTRATE] = { ok: false, err: e.message };
    log(`[sweep] heartrate: ${e.message}`);
  }

  return report;
}

module.exports = { sweep, DATED, SINGLETON, HEARTRATE };
