// Variations 87 — symbiotic server.
// Live Oura sync. Metrics are held IN MEMORY, never written to disk.
// The painting is a continuous loop: the body feeds the work daily; a gap in
// the data is left visible — the silence of a stopped signal is part of the work.

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const zlib   = require('zlib');

const dir  = __dirname;
const port = process.env.PORT || 3457;

// === SECRETS (env only — never commit) ===
let ACCESS_TOKEN  = process.env.OURA_TOKEN   || '';   // PAT or OAuth access token
let REFRESH_TOKEN = process.env.OURA_REFRESH || '';   // optional, enables auto-refresh
const CLIENT_ID     = process.env.OURA_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || '';

// Full history: ring data begins 2022-05-24; pull everything from a safe earlier
// date through today. The whole life of the body feeds the work.
const SYNC_START    = '2022-01-01';
const SYNC_INTERVAL = 6 * 60 * 60 * 1000;   // re-sync every 6h

const BUILD_SHA = (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7);
const BOOT_TIME = Date.now();

// === IN-MEMORY STATE ===
const STATE = {
  payload: null,     // { stats, days, meta } served to the browser
  lastSync: null,    // ISO timestamp of last successful sync
  syncing: false,
  tokenError: false,
  degraded: false,
  degradedReasons: [],
  perCollection: {}, // { name: { ok, count } }
  lastKnownGoodCount: 0,
  lastDataDayPrev: null,
  alertedBad: false, // dedup: true while in a degraded/alerted state
};

// === ALERTING (Telegram, optional — no-op until configured) ===
function alert(text) {
  const tok = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!tok || !chat) return;
  try {
    const body = JSON.stringify({ chat_id: chat, text: `[Variations 87] ${text}`, disable_notification: false });
    const req = https.request(`https://api.telegram.org/bot${tok}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
    req.on('error', () => {});
    req.setTimeout(8000, () => req.destroy());
    req.write(body); req.end();
  } catch (e) { /* never let alerting break the server */ }
}

// === WIT36 — WITHOUT WITNESS open-call intake (served at /wit36) ===
const wit36Hits = {};
function wit36Limited(ip) {
  const now = Date.now();
  wit36Hits[ip] = (wit36Hits[ip] || []).filter(t => now - t < 60000);
  if (wit36Hits[ip].length >= 5) return true;
  wit36Hits[ip].push(now);
  return false;
}
// Deliver each application via Telegram (reuses the same TG_* env as alert()).
function notifyApplication(rec) {
  const tok = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!tok || !chat) return;
  try {
    const body = JSON.stringify({ chat_id: chat,
      text: `WITHOUT WITNESS — application\n${rec.name}\n${rec.email || ''}\n${rec.link}\n\n${rec.statement}\n\n${rec.ts}` });
    const req = https.request(`https://api.telegram.org/bot${tok}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
    req.on('error', () => {});
    req.setTimeout(8000, () => req.destroy());
    req.write(body); req.end();
  } catch (e) { /* never let notify break the server */ }
}

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

// Fetch one page with retry + backoff on transient failures (network errors,
// timeouts, 429, 5xx). 401 triggers the refresh path; other 4xx fail fast.
async function fetchPage(url, attempt = 0) {
  try {
    const r = await ouraGetAuthed(url);
    if (r.status === 200) return JSON.parse(r.body);
    const transient = r.status === 429 || r.status >= 500;
    if (transient && attempt < 2) { await sleep([1500, 6000][attempt]); return fetchPage(url, attempt + 1); }
    throw new Error(`${r.status}: ${r.body.slice(0, 120)}`);
  } catch (e) {
    if (attempt < 2 && /timeout|ECONN|ENOTFOUND|EAI_AGAIN|socket/i.test(e.message)) {
      await sleep([1500, 6000][attempt]); return fetchPage(url, attempt + 1);
    }
    throw e;
  }
}

// Fetch a full collection, following Oura's next_token pagination so multi-year
// windows are never silently truncated.
async function fetchCollection(name, qs) {
  const base = `https://api.ouraring.com/v2/usercollection/${name}`;
  let url = `${base}?${qs}`;
  let all = [];
  for (let guard = 0; url && guard < 100; guard++) {
    const j = await fetchPage(url);
    if (Array.isArray(j.data)) all = all.concat(j.data);
    url = j.next_token ? `${base}?${qs}&next_token=${encodeURIComponent(j.next_token)}` : null;
  }
  return all;
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

// Set the degraded flag and alert ONLY on state transitions (ok->bad, bad->ok),
// so a problem that persists across 6h syncs doesn't spam Telegram.
function setDegraded(reasons) {
  STATE.degraded = reasons.length > 0 || STATE.tokenError;
  STATE.degradedReasons = STATE.degraded ? (reasons.length ? reasons : ['tokenError']) : [];
  if (STATE.degraded && !STATE.alertedBad) {
    STATE.alertedBad = true;
    alert('⚠ degraded — ' + STATE.degradedReasons.join('; '));
  } else if (!STATE.degraded && STATE.alertedBad) {
    STATE.alertedBad = false;
    alert('✓ recovered — sync healthy again');
  }
}

// ---------- sync ----------
async function sync() {
  if (STATE.syncing) return;
  if (!ACCESS_TOKEN && !(REFRESH_TOKEN && CLIENT_ID)) { console.warn('[oura] no token configured — serving fallback'); return; }
  STATE.syncing = true;
  try {
    const end = new Date();
    const qs = `start_date=${SYNC_START}&end_date=${isoDate(end)}`;

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

    // per-collection observability
    const names = ['sleep', 'daily_sleep', 'daily_readiness', 'workout'];
    STATE.perCollection = {};
    settled.forEach((s, i) => {
      STATE.perCollection[names[i]] = { ok: s.status === 'fulfilled', count: s.status === 'fulfilled' ? s.value.length : 0 };
    });

    // self-check: catch silent degradation (data malfunction, not slow Oura).
    // Note: gapDays/freshness is judged by the daily external check (time-of-day
    // aware), not here — so a normal morning gap of 1 never raises a server alert.
    const reasons = [];
    if (failed.length) reasons.push('collections failed: ' + failed.join(','));
    if (days.length < STATE.lastKnownGoodCount) reasons.push(`dayCount ${days.length} < known-good ${STATE.lastKnownGoodCount}`);
    if (STATE.lastDataDayPrev && lastDataDay < STATE.lastDataDayPrev) reasons.push(`lastDataDay regressed ${STATE.lastDataDayPrev}->${lastDataDay}`);
    if (days.length >= STATE.lastKnownGoodCount) STATE.lastKnownGoodCount = days.length;
    STATE.lastDataDayPrev = lastDataDay;

    STATE.payload = {
      stats: buildStats(days),
      days,
      meta: { lastDataDay, serverDate, gapDays, status, live: true, syncedAt: new Date().toISOString() },
    };
    STATE.lastSync = new Date().toISOString();
    STATE.tokenError = false;
    setDegraded(reasons);
    console.log(`[oura] synced ${days.length} days, last=${lastDataDay}, gap=${gapDays}d, status=${status}${reasons.length ? ' DEGRADED: ' + reasons.join('; ') : ''}`);
  } catch (e) {
    console.error('[oura] sync failed:', e.message);
    if (/401|refresh|token/i.test(e.message)) STATE.tokenError = true;
    if (!STATE.payload) loadFallback();
    setDegraded(['sync failed: ' + e.message]);
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

  // WIT36 application intake — POST /wit36/apply (must precede the GET-only guard).
  if (req.method === 'POST' && req.url.split('?')[0] === '/wit36/apply') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').toString().split(',')[0].trim();
    if (wit36Limited(ip)) { res.writeHead(429, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Too many attempts. Try again in a minute.' })); return; }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      let d = {}; try { d = JSON.parse(body || '{}'); } catch (e) {}
      if (d.website) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; } // honeypot filled → drop
      const name = (d.name || '').toString().trim(), email = (d.email || '').toString().trim(), link = (d.link || '').toString().trim(), st = (d.statement || '').toString().trim();
      if (!name || !email || !link || !st) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Please fill all four fields.' })); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: "That email doesn't look right." })); return; }
      if (st.split(/\s+/).length > 150) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Your statement is over 150 words.' })); return; }
      const rec = { ts: new Date().toISOString(), name: name.slice(0, 200), email: email.slice(0, 200), link: link.slice(0, 400), statement: st.slice(0, 2000) };
      try { fs.appendFileSync(path.join(dir, 'data', 'wit36-applications.jsonl'), JSON.stringify(rec) + '\n'); } catch (e) { console.error('[wit36] store:', e.message); }
      console.log('[wit36] APPLICATION', rec.ts, rec.name);
      notifyApplication(rec);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
    });
    req.on('error', () => { try { res.writeHead(400); res.end(); } catch (e) {} });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Method Not Allowed'); return; }

  let url = req.url.split('?')[0];

  if (url === '/data/daily-metrics.json') {
    if (!STATE.payload) loadFallback();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(STATE.payload || { stats: {}, days: [], meta: { status: 'dormant', live: false } }));
    return;
  }
  if (url === '/health') {
    const m = (STATE.payload && STATE.payload.meta) || {};
    const dayCount = (STATE.payload && STATE.payload.days && STATE.payload.days.length) || 0;
    // Always 200 while the process is alive (Render's native health check restarts
    // only on process death/hang). Data problems are signalled by `degraded`, not 5xx.
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      ok: true,
      live: !!m.live,
      status: m.status || 'dormant',
      tokenError: !!STATE.tokenError,
      degraded: !!STATE.degraded,
      degradedReasons: STATE.degradedReasons || [],
      lastDataDay: m.lastDataDay || null,
      serverDate: isoDate(new Date()),
      gapDays: m.gapDays != null ? m.gapDays : null,
      dayCount,
      lastKnownGoodDayCount: STATE.lastKnownGoodCount || 0,
      dataAdvancing: dayCount > 0 && dayCount >= (STATE.lastKnownGoodCount || 0),
      lastSyncAgeSec: STATE.lastSync ? Math.round((Date.now() - Date.parse(STATE.lastSync)) / 1000) : null,
      syncedAt: STATE.lastSync,
      perCollection: STATE.perCollection || {},
      buildSha: BUILD_SHA,
      uptimeSec: Math.round((Date.now() - BOOT_TIME) / 1000),
    }));
    return;
  }

  if (url === '/') url = '/index.html';
  // /89 — the vertical daily-story view (Variation 89). Same live data, same origin.
  if (url === '/89' || url === '/89/') url = '/89/index.html';
  // /lab — HOSQ R&D lab canvas (Voronoi × curved edges). Same origin.
  if (url === '/lab' || url === '/lab/') url = '/lab/index.html';
  // /wit36 — WITHOUT WITNESS open-call (MONOMO). Same origin.
  if (url === '/wit36' || url === '/wit36/') url = '/wit36/index.html';

  // Resolve and keep strictly within the served directory (no path traversal),
  // serve only whitelisted file types, and never expose runtime files.
  const filePath = path.normalize(path.join(dir, decodeURIComponent(url)));
  if (filePath !== dir && !filePath.startsWith(dir + path.sep)) { res.writeHead(403); res.end('Forbidden'); return; }
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  // never serve dotfiles / macOS AppleDouble sidecars (._*) / .git / .env, regardless of extension
  if (!mimeTypes[ext] || DENY_FILES.has(base) || base.charAt(0) === '.') { res.writeHead(404); res.end('Not found'); return; }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const etag = '"' + st.size.toString(16) + '-' + Math.round(st.mtimeMs).toString(16) + '"';
    // images rarely change → cache a week; html short so edits show; other assets a day
    const cache = ext === '.html' ? 'public, max-age=300'
      : (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.svg' || ext === '.webp') ? 'public, max-age=604800'
      : 'public, max-age=86400';
    // text assets compress well; images are already compressed, don't bother
    const compressible = ext === '.html' || ext === '.js' || ext === '.css' || ext === '.svg' || ext === '.json';
    const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const baseHead = { 'Content-Type': mimeTypes[ext], 'Cache-Control': cache, 'ETag': etag };
    if (compressible) baseHead['Vary'] = 'Accept-Encoding';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': cache }); res.end(); return;
    }
    if (req.method === 'HEAD') { res.writeHead(200, baseHead); res.end(); return; }
    fs.readFile(filePath, (e2, data) => {
      if (e2) { res.writeHead(404); res.end('Not found'); return; }
      if (compressible && acceptsGzip) {
        zlib.gzip(data, (gz, out) => {
          if (gz) { res.writeHead(200, baseHead); return res.end(data); }   // fall back to identity on error
          res.writeHead(200, Object.assign({ 'Content-Encoding': 'gzip' }, baseHead));
          res.end(out);
        });
        return;
      }
      res.writeHead(200, baseHead);
      res.end(data);
    });
  });
}).listen(port, () => {
  console.log(`Variations 87 — http://localhost:${port}`);
  loadFallback();          // serve something immediately
  sync();                  // then pull live data
  setInterval(sync, SYNC_INTERVAL);
});
