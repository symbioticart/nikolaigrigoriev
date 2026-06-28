// Variations 87 — symbiotic server.
// Live Oura sync. Metrics are held IN MEMORY, never written to disk.
// The painting is a continuous loop: the body feeds the work daily; a gap in
// the data is left visible — the silence of a stopped signal is part of the work.

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const dir  = __dirname;
const port = process.env.PORT || 3457;

// === SECRETS (env only — never commit) ===
let ACCESS_TOKEN  = process.env.OURA_TOKEN   || '';   // PAT or OAuth access token
let REFRESH_TOKEN = process.env.OURA_REFRESH || '';   // optional, enables auto-refresh
const CLIENT_ID     = process.env.OURA_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || '';

const SYNC_DAYS     = 180;                  // rolling window pulled from Oura
const SYNC_INTERVAL = 6 * 60 * 60 * 1000;   // re-sync every 6h

// === IN-MEMORY STATE ===
const STATE = {
  payload: null,     // { stats, days, meta } served to the browser
  lastSync: null,    // ISO timestamp of last successful sync
  syncing: false,
};

// Whitelisted static types. Note: '.map' is intentionally absent — source maps
// are never served in production.
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};
// Files that must never be served even though their extension is whitelisted.
const DENY_FILES = new Set(['server.js', 'package.json', 'package-lock.json']);

// Security headers applied to every response.
function setSecurity(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
}

// ---------- Oura HTTP ----------
function ouraGet(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(urlStr),
      { method: 'GET', headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('oura request timeout')));
    req.end();
  });
}

function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    if (!REFRESH_TOKEN || !CLIENT_ID || !CLIENT_SECRET) return reject(new Error('no refresh creds'));
    const body = new URLSearchParams({
      grant_type: 'refresh_token', refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    }).toString();
    const req = https.request(new URL('https://api.ouraring.com/oauth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => {
      if (res.statusCode !== 200) return reject(new Error(`refresh ${res.statusCode}: ${d.slice(0,120)}`));
      const j = JSON.parse(d);
      ACCESS_TOKEN = j.access_token;
      if (j.refresh_token) REFRESH_TOKEN = j.refresh_token;  // rotate in memory
      console.log('[oura] access token refreshed');
      resolve();
    }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

// GET that transparently refreshes once on 401.
async function ouraGetAuthed(urlStr) {
  let r = await ouraGet(urlStr);
  if (r.status === 401) { await refreshAccessToken(); r = await ouraGet(urlStr); }
  return r;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Fetch one collection with retry + backoff on transient failures (network
// errors, timeouts, 429, 5xx). 401 still triggers the refresh path; other 4xx
// fail fast (no point retrying a bad request).
async function fetchCollection(name, qs, attempt = 0) {
  const url = `https://api.ouraring.com/v2/usercollection/${name}?${qs}`;
  try {
    const r = await ouraGetAuthed(url);
    if (r.status === 200) return JSON.parse(r.body).data || [];
    const transient = r.status === 429 || r.status >= 500;
    if (transient && attempt < 2) { await sleep([1500, 6000][attempt]); return fetchCollection(name, qs, attempt + 1); }
    throw new Error(`${name} ${r.status}: ${r.body.slice(0, 120)}`);
  } catch (e) {
    if (attempt < 2 && /timeout|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(e.message)) {
      await sleep([1500, 6000][attempt]); return fetchCollection(name, qs, attempt + 1);
    }
    throw e;
  }
}

// ---------- raw Oura -> daily metrics (mirror of build_30d_summary.py:build_day) ----------
const INTENSITY = { easy: 1, moderate: 2, hard: 3 };

function buildDays(sleepRaw, dailySleep, dailyReady, workoutRaw) {
  const dsByDay = Object.fromEntries(dailySleep.map(r => [r.day, r]));
  const rdByDay = Object.fromEntries(dailyReady.map(r => [r.day, r]));

  // Per day, keep the longest long_sleep document.
  const slByDay = {};
  for (const s of sleepRaw) {
    if (s.type !== 'long_sleep') continue;
    const cur = slByDay[s.day];
    if (!cur || (s.total_sleep_duration || 0) > (cur.total_sleep_duration || 0)) slByDay[s.day] = s;
  }

  // Workouts aggregated per day.
  const wkByDay = {};
  for (const w of workoutRaw) {
    const d = w.day; if (!d) continue;
    (wkByDay[d] ||= { count: 0, intensity: 0, activities: [] });
    wkByDay[d].count += 1;
    wkByDay[d].intensity += INTENSITY[w.intensity] ?? 1;
    if (w.activity) wkByDay[d].activities.push(w.activity);
  }

  const allDays = [...new Set([...Object.keys(slByDay), ...Object.keys(dsByDay), ...Object.keys(rdByDay)])].sort();
  const days = [];
  for (const d of allDays) {
    const sl = slByDay[d], ds = dsByDay[d], rd = rdByDay[d], wk = wkByDay[d];
    const ts = (sl && sl.total_sleep_duration) || 0;
    if (!sl && !ds && !rd) continue;
    days.push({
      day: d,
      readinessScore: rd ? rd.score : null,
      sleepScore:     ds ? ds.score : null,
      hrv:             sl ? sl.average_hrv : null,
      avgHeartRate:    sl ? sl.average_heart_rate : null,
      lowestHeartRate: sl ? sl.lowest_heart_rate : null,
      avgBreath:       sl ? sl.average_breath : null,
      totalSleepHours: ts ? +(ts / 3600).toFixed(2) : null,
      deepSleepPct:    sl && ts ? +(sl.deep_sleep_duration / ts).toFixed(3) : null,
      remSleepPct:     sl && ts ? +(sl.rem_sleep_duration / ts).toFixed(3) : null,
      efficiency:      sl ? sl.efficiency : null,
      latency:         sl ? sl.latency : null,
      restlessPeriods: sl ? sl.restless_periods : null,
      awakeTime:       sl ? sl.awake_time : null,
      tempDeviation:   rd ? rd.temperature_deviation : null,
      workoutCount:     wk ? wk.count : 0,
      workoutIntensity: wk ? wk.intensity : 0,
      activities:       wk ? [...new Set(wk.activities)] : [],
    });
  }
  return days;
}

const STAT_KEYS = ['hrv','avgHeartRate','readinessScore','sleepScore','tempDeviation',
                   'restlessPeriods','latency','workoutIntensity','avgBreath'];

function buildStats(days) {
  const stats = {};
  for (const k of STAT_KEYS) {
    const v = days.map(d => d[k]).filter(x => x != null && !isNaN(x));
    if (!v.length) continue;
    stats[k] = { min: Math.min(...v), max: Math.max(...v), mean: v.reduce((a,b)=>a+b,0)/v.length };
  }
  return stats;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }

// ---------- sync ----------
async function sync() {
  if (STATE.syncing) return;
  if (!ACCESS_TOKEN && !(REFRESH_TOKEN && CLIENT_ID)) { console.warn('[oura] no token configured — serving fallback'); return; }
  STATE.syncing = true;
  try {
    const end   = new Date();
    const start = new Date(end.getTime() - SYNC_DAYS * 864e5);
    const qs = `start_date=${isoDate(start)}&end_date=${isoDate(end)}`;

    // allSettled: one failing collection (e.g. workout) must not lose the rest.
    const settled = await Promise.allSettled([
      fetchCollection('sleep', qs),
      fetchCollection('daily_sleep', qs),
      fetchCollection('daily_readiness', qs),
      fetchCollection('workout', qs),
    ]);
    const [sleepRaw, dailySleep, dailyReady, workoutRaw] = settled.map(s => s.status === 'fulfilled' ? s.value : []);
    const failed = settled.map((s, i) => s.status === 'rejected' ? ['sleep','daily_sleep','daily_readiness','workout'][i] : null).filter(Boolean);
    if (failed.length) console.warn('[oura] partial sync, failed:', failed.join(', '));
    // Need at least the core sleep/readiness data to build a meaningful day.
    if (!sleepRaw.length && !dailySleep.length && !dailyReady.length) throw new Error('all core collections failed');

    const days = buildDays(sleepRaw, dailySleep, dailyReady, workoutRaw);
    if (!days.length) throw new Error('no days built');

    const lastDataDay = days[days.length - 1].day;
    const serverDate  = isoDate(end);
    const gapDays     = Math.max(0, daysBetween(lastDataDay, serverDate));
    const status      = gapDays <= 1 ? 'fresh' : gapDays <= 7 ? 'stable' : 'dormant';

    STATE.payload = {
      stats: buildStats(days),
      days,
      meta: { lastDataDay, serverDate, gapDays, status, live: true, syncedAt: new Date().toISOString() },
    };
    STATE.lastSync = new Date().toISOString();
    STATE.tokenError = false;
    console.log(`[oura] synced ${days.length} days, last=${lastDataDay}, gap=${gapDays}d, status=${status}`);
  } catch (e) {
    console.error('[oura] sync failed:', e.message);
    if (/401|refresh|token/i.test(e.message)) STATE.tokenError = true;
    if (!STATE.payload) loadFallback();
  } finally {
    STATE.syncing = false;
  }
}

// Cold-start fallback: bundled snapshot, flagged not-live.
function loadFallback() {
  if (STATE.payload && STATE.payload.meta && STATE.payload.meta.live) return; // don't clobber live data
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'daily-metrics.json'), 'utf8'));
    const days = raw.days || [];
    const lastDataDay = days.length ? days[days.length - 1].day : null;
    const serverDate  = isoDate(new Date());
    const gapDays     = lastDataDay ? Math.max(0, daysBetween(lastDataDay, serverDate)) : 0;
    STATE.payload = {
      stats: raw.stats || buildStats(days),
      days,
      meta: { lastDataDay, serverDate, gapDays, status: gapDays <= 7 ? 'stable' : 'dormant', live: false, syncedAt: null },
    };
    console.log(`[oura] fallback snapshot loaded (${days.length} days)`);
  } catch (e) { console.error('[oura] fallback failed:', e.message); }
}

// ---------- HTTP server ----------
http.createServer((req, res) => {
  setSecurity(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Method Not Allowed'); return; }

  let url = req.url.split('?')[0];

  if (url === '/data/daily-metrics.json') {
    if (!STATE.payload) loadFallback();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(STATE.payload || { stats: {}, days: [], meta: { status: 'dormant', live: false } }));
    return;
  }
  if (url === '/health') {
    const m = STATE.payload && STATE.payload.meta;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, live: !!(m && m.live), status: m ? m.status : 'dormant', tokenError: !!STATE.tokenError }));
    return;
  }

  if (url === '/') url = '/index.html';

  // Resolve and keep strictly within the served directory (no path traversal),
  // serve only whitelisted file types, and never expose runtime files.
  const filePath = path.normalize(path.join(dir, decodeURIComponent(url)));
  if (filePath !== dir && !filePath.startsWith(dir + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  const ext = path.extname(filePath).toLowerCase();
  if (!mimeTypes[ext] || DENY_FILES.has(path.basename(filePath))) { res.writeHead(404); res.end('Not found'); return; }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const etag = '"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
    const cache = ext === '.html' ? 'public, max-age=300' : 'public, max-age=86400';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': cache }); res.end(); return;
    }
    if (req.method === 'HEAD') {
      res.writeHead(200, { 'Content-Type': mimeTypes[ext], 'Cache-Control': cache, 'ETag': etag }); res.end(); return;
    }
    fs.readFile(filePath, (e2, data) => {
      if (e2) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mimeTypes[ext], 'Cache-Control': cache, 'ETag': etag });
      res.end(data);
    });
  });
}).listen(port, () => {
  console.log(`Variations 87 — http://localhost:${port}`);
  loadFallback();          // serve something immediately
  sync();                  // then pull live data
  setInterval(sync, SYNC_INTERVAL);
});
