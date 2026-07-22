// Variations 87 — symbiotic server.
//
// The raw record of the body NEVER leaves this server. The browser receives
// only: the date, the seed, and anonymous entangled channels in [0,1] — each
// a convolution of at least two causally-percentiled signals. The rule itself
// lives in rule.js (hashed in the certificate §10).

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const rule  = require('./rule');

const dir  = __dirname;
const port = process.env.PORT || 3457;

// === THE WORK — fixed constants (mirrored in the certificate) ===
const WORK_BIRTH_DATE = '2022-05-24';   // first recorded day of the body
const WORK_OWNER      = 'Nikolai Grigoriev';
const TERMINAL_DAYS   = 90;             // confirmed silent days => the work is complete

// === SECRETS (env only — never commit) ===
let ACCESS_TOKEN  = process.env.OURA_TOKEN   || '';
let REFRESH_TOKEN = process.env.OURA_REFRESH || '';
const CLIENT_ID     = process.env.OURA_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || '';

const SYNC_INTERVAL = 6 * 60 * 60 * 1000;   // re-sync every 6h
const FETCH_CHUNK_DAYS = 90;                // API pull window per request

// === IN-MEMORY STATE ===
const STATE = {
  days: null,        // clean transported days [{d,s,c,i}]
  lastDataDay: null,
  live: false,       // true only after a successful living synchronisation
  lastSync: null,
  syncing: false,
};

const mimeTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.map': 'application/json', '.woff2': 'font/woff2',
};

// Security headers: the conservation promise ("no request to anyone else's
// server, nothing tracked") enforced as mechanism, not manners.
const BASE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; " +
    "img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
};
function head(extra) { return Object.assign({}, BASE_HEADERS, extra); }

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

// === WIT36 — WITHOUT WITNESS intake (served at /wit36) ===
const wit36Hits = {};
function wit36Limited(ip) {
  const now = Date.now();
  wit36Hits[ip] = (wit36Hits[ip] || []).filter(t => now - t < 60000);
  if (wit36Hits[ip].length >= 5) return true;
  wit36Hits[ip].push(now);
  return false;
}
// Deliver each application in full via Telegram — the sole store (reuses the TG_* env).
function notifyApplication(rec) {
  const tok = process.env.TG_BOT_TOKEN, chat = process.env.TG_CHAT_ID;
  if (!tok || !chat) return;
  try {
    const lang = rec.lang === 'es' ? 'ES' : (rec.lang === 'ca' ? 'CA' : 'EN');
    const text =
      `WITHOUT WITNESS — new application\n` +
      `Name: ${rec.name || '—'}\n` +
      `Email: ${rec.email || '—'}\n` +
      `Link: ${rec.link || '—'}\n` +
      `Language: ${lang}\n` +
      `Consent: ${rec.consent === true ? 'yes' : 'no'}\n` +
      `Submitted: ${rec.ts}\n\n` +
      `Statement:\n${rec.statement || '—'}`;
    const body = JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true });
    const req = https.request(`https://api.telegram.org/bot${tok}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
    req.on('error', () => {});
    req.setTimeout(8000, () => req.destroy());
    req.write(body); req.end();
  } catch (e) { /* never let notify break the server */ }
}

// ---------- upstream HTTP ----------
function apiGet(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(urlStr),
      { method: 'GET', headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject); req.end();
  });
}

// The rotated refresh token must survive a restart, or the sync dies silently
// after the first rotation — the most likely cause of a false weeks-long
// silence. Kept on the same persistent disk as the record.
function tokenFile() { return path.join(path.dirname(ARCHIVE_DIR), 'oauth-refresh.json'); }
function persistRefreshToken() {
  try { fs.writeFileSync(tokenFile(), JSON.stringify({ refresh: REFRESH_TOKEN })); }
  catch (e) { /* ephemeral disk — the env token remains the fallback */ }
}
function restoreRefreshToken() {
  try {
    const j = JSON.parse(fs.readFileSync(tokenFile(), 'utf8'));
    if (j.refresh) REFRESH_TOKEN = j.refresh;
  } catch (e) { /* none persisted */ }
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
      let j;
      try { j = JSON.parse(d); } catch (e) { return reject(new Error('refresh: malformed response')); }
      if (!j.access_token) return reject(new Error('refresh: no access_token'));
      ACCESS_TOKEN = j.access_token;
      if (j.refresh_token) { REFRESH_TOKEN = j.refresh_token; persistRefreshToken(); }
      console.log('[sync] access token refreshed');
      resolve();
    }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

async function apiGetAuthed(urlStr) {
  let r = await apiGet(urlStr);
  if (r.status === 401) { await refreshAccessToken(); r = await apiGet(urlStr); }
  return r;
}

async function fetchCollection(name, qs) {
  const url = `https://api.ouraring.com/v2/usercollection/${name}?${qs}`;
  const r = await apiGetAuthed(url);
  if (r.status !== 200) throw new Error(`${name} ${r.status}: ${r.body.slice(0,120)}`);
  return JSON.parse(r.body).data || [];
}

// ---------- raw upstream -> daily raw record ----------
const INTENSITY = { easy: 1, moderate: 2, hard: 3 };

function buildDays(sleepRaw, dailySleep, dailyReady, workoutRaw) {
  const dsByDay = Object.fromEntries(dailySleep.map(r => [r.day, r]));
  const rdByDay = Object.fromEntries(dailyReady.map(r => [r.day, r]));

  const slByDay = {};
  for (const s of sleepRaw) {
    if (s.type !== 'long_sleep') continue;
    const cur = slByDay[s.day];
    if (!cur || (s.total_sleep_duration || 0) > (cur.total_sleep_duration || 0)) slByDay[s.day] = s;
  }

  const wkByDay = {};
  for (const w of workoutRaw) {
    const d = w.day; if (!d) continue;
    (wkByDay[d] ||= { count: 0, intensity: 0 });
    wkByDay[d].count += 1;
    wkByDay[d].intensity += INTENSITY[w.intensity] ?? 1;
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
      avgBreath:       sl ? sl.average_breath : null,
      totalSleepHours: ts ? +(ts / 3600).toFixed(2) : null,
      deepSleepPct:    sl && ts ? +(sl.deep_sleep_duration / ts).toFixed(3) : null,
      remSleepPct:     sl && ts ? +(sl.rem_sleep_duration / ts).toFixed(3) : null,
      efficiency:      sl ? sl.efficiency : null,
      latency:         sl ? sl.latency : null,
      restlessPeriods: sl ? sl.restless_periods : null,
      tempDeviation:   rd ? rd.temperature_deviation : null,
      workoutCount:     wk ? wk.count : 0,
      workoutIntensity: wk ? wk.intensity : 0,
    });
  }
  return days;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }

// ---------- immutable per-day record ----------
// On a persistent disk (ARCHIVE_DIR env on the host) the record survives
// restarts; the repository copy is the conservation object.
const ARCHIVE_DIR = process.env.ARCHIVE_DIR || path.join(dir, 'data', 'archive');

function archiveWrite(days) {
  try {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    for (const d of days) {
      const f = path.join(ARCHIVE_DIR, `${d.day}.json`);
      if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(d));   // write once, never rewrite
    }
  } catch (e) { console.warn('[record] write skipped:', e.message); }
}

function archiveRead() {
  try {
    if (!fs.existsSync(ARCHIVE_DIR)) return [];
    return fs.readdirSync(ARCHIVE_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8')))
      .sort((a, b) => a.day < b.day ? -1 : 1);
  } catch (e) { console.warn('[record] read failed:', e.message); return []; }
}

// Bundled snapshot (repo) — the cold-start record.
function snapshotRead() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'daily-metrics.json'), 'utf8'));
    return raw.days || [];
  } catch (e) { return []; }
}

// Merge raw day lists. Earlier sources win (immutability: what was recorded
// first stays as recorded); later sources only add missing days. A source
// that disagrees with the record is logged, never obeyed.
function mergeDays(...sources) {
  const byDay = new Map();
  for (const list of sources) {
    for (const d of list) {
      if (!d || !d.day) continue;
      if (!byDay.has(d.day)) byDay.set(d.day, d);
      else if (JSON.stringify(byDay.get(d.day)) !== JSON.stringify(d)) {
        console.warn('[record] upstream drift ignored for', d.day);
      }
    }
  }
  return [...byDay.values()].sort((a, b) => a.day < b.day ? -1 : 1);
}

// ---------- payload ----------
function setDays(rawDays, live) {
  STATE.days = rule.transformDays(rawDays, WORK_OWNER);
  // Variation 89 (a sibling work on this domain, /89) renders from the daily
  // record by its own older rule; it is served the record at /89/data.json.
  STATE.raw = rawDays;
  STATE.lastDataDay = rawDays.length ? rawDays[rawDays.length - 1].day : null;
  STATE.live = live;
}

// The clock of silence is true at the moment of the request, not at the
// moment of the last sync.
function currentMeta() {
  const serverDate = isoDate(new Date());
  const gapDays = STATE.lastDataDay ? Math.max(0, daysBetween(STATE.lastDataDay, serverDate)) : 0;
  const status = !STATE.live ? 'record'
    : gapDays <= 1 ? 'fresh'
    : gapDays <= 7 ? 'stable'
    : gapDays >= TERMINAL_DAYS ? 'terminal'
    : 'dormant';
  return {
    birth: WORK_BIRTH_DATE,
    terminalDays: TERMINAL_DAYS,
    lastDataDay: STATE.lastDataDay, serverDate, gapDays, status,
    live: STATE.live, syncedAt: STATE.lastSync,
  };
}

// ---------- sync ----------
async function sync() {
  if (STATE.syncing) return;
  if (!ACCESS_TOKEN && !(REFRESH_TOKEN && CLIENT_ID)) { console.warn('[sync] no token configured — serving the record'); return; }
  STATE.syncing = true;
  try {
    // Full history from the work's birth, pulled in chunks.
    const chunks = [];
    let cursor = new Date(Date.parse(WORK_BIRTH_DATE));
    const now = new Date();
    while (cursor < now) {
      const end = new Date(Math.min(now.getTime(), cursor.getTime() + FETCH_CHUNK_DAYS * 864e5));
      chunks.push([isoDate(cursor), isoDate(end)]);
      cursor = new Date(end.getTime() + 864e5);
    }

    const sleepRaw = [], dailySleep = [], dailyReady = [], workoutRaw = [];
    for (const [a, b] of chunks) {
      const qs = `start_date=${a}&end_date=${b}`;
      const [s1, s2, s3, s4] = await Promise.all([
        fetchCollection('sleep', qs),
        fetchCollection('daily_sleep', qs),
        fetchCollection('daily_readiness', qs),
        fetchCollection('workout', qs),
      ]);
      sleepRaw.push(...s1); dailySleep.push(...s2); dailyReady.push(...s3); workoutRaw.push(...s4);
    }

    const fetched = buildDays(sleepRaw, dailySleep, dailyReady, workoutRaw);
    if (!fetched.length) throw new Error('no days built');

    // Priority: the live-written archive is immutable and wins; the live
    // fetch is the source of truth for everything else; the bundled snapshot
    // (which may include locally-converted catalog days with fewer fields)
    // only fills days the living record cannot provide.
    const archived = archiveRead();
    const rawDays = mergeDays(archived, fetched, snapshotRead());
    // Only live-confirmed days petrify into the immutable archive.
    const fetchedSet = new Set(fetched.map(d => d.day));
    const alreadySet = new Set(archived.map(d => d.day));
    archiveWrite(rawDays.filter(d => fetchedSet.has(d.day) || alreadySet.has(d.day)));

    setDays(rawDays, true);
    STATE.lastSync = new Date().toISOString();
    if (STATE.alerted) { alert('sync recovered'); STATE.alerted = false; }
    const m = currentMeta();
    console.log(`[sync] ${rawDays.length} days, last=${m.lastDataDay}, gap=${m.gapDays}d, status=${m.status}`);
  } catch (e) {
    console.error('[sync] failed:', e.message);
    if (!STATE.alerted) { alert('sync failed: ' + e.message); STATE.alerted = true; }
    if (!STATE.days) loadRecord();
  } finally {
    STATE.syncing = false;
  }
}

// Cold-start: serve the immutable record, flagged not-live. A silent state is
// NEVER declared from the record alone — silence must be confirmed by a live
// sync, otherwise a sleeping host would show a false death.
function loadRecord() {
  if (STATE.days && STATE.live) return;
  const rawDays = mergeDays(archiveRead(), snapshotRead());
  if (!rawDays.length) { console.error('[record] empty'); return; }
  setDays(rawDays, false);
  console.log(`[record] loaded (${rawDays.length} days)`);
}

// ---------- HTTP ----------
http.createServer((req, res) => {
  // WIT36 application intake — POST /wit36/apply (must precede the GET-only guard).
  if (req.method === 'POST' && req.url.split('?')[0] === '/wit36/apply') {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '?').toString().split(',')[0].trim();
    if (wit36Limited(ip)) { res.writeHead(429, head({ 'Content-Type': 'application/json' })); res.end(JSON.stringify({ ok: false, error: 'Too many attempts. Try again in a minute.' })); return; }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 65536) req.destroy(); });
    req.on('end', () => {
      let d = {}; try { d = JSON.parse(body || '{}'); } catch (e) {}
      if (d.website) { res.writeHead(200, head({ 'Content-Type': 'application/json' })); res.end('{"ok":true}'); return; } // honeypot filled → drop
      const name = (d.name || '').toString().trim(), email = (d.email || '').toString().trim(), link = (d.link || '').toString().trim(), st = (d.statement || '').toString().trim();
      if (!name || !email || !link || !st) { res.writeHead(400, head({ 'Content-Type': 'application/json' })); res.end(JSON.stringify({ ok: false, error: 'Please fill all four fields.' })); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.writeHead(400, head({ 'Content-Type': 'application/json' })); res.end(JSON.stringify({ ok: false, error: "That email doesn't look right." })); return; }
      if (st.split(/\s+/).length > 150) { res.writeHead(400, head({ 'Content-Type': 'application/json' })); res.end(JSON.stringify({ ok: false, error: 'Your statement is over 150 words.' })); return; }
      if (d.consent !== true) { res.writeHead(400, head({ 'Content-Type': 'application/json' })); res.end(JSON.stringify({ ok: false, error: 'Please accept the Terms & Privacy.' })); return; }
      // consent + ts stored as proof of consent (art. 7.1 GDPR)
      const lang = (d.lang === 'es' || d.lang === 'ca') ? d.lang : 'en';
      const rec = { ts: new Date().toISOString(), name: name.slice(0, 200), email: email.slice(0, 200), link: link.slice(0, 400), statement: st.slice(0, 2000), consent: true, lang };
      console.log('[wit36] APPLICATION', rec.ts, rec.name, lang);
      notifyApplication(rec);   // Telegram is the sole store — nothing written to disk
      res.writeHead(200, head({ 'Content-Type': 'application/json' })); res.end('{"ok":true}');
    });
    req.on('error', () => { try { res.writeHead(400); res.end(); } catch (e) {} });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, head({})); res.end('Method Not Allowed'); return; }

  let url = req.url.split('?')[0];

  // Ops heartbeat (GitHub Action). Dates only — no signal ever leaves.
  if (url === '/health') {
    const m = currentMeta();
    res.writeHead(200, head({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify({ ok: true, live: m.live, status: m.status, lastDataDay: m.lastDataDay, serverDate: m.serverDate, gapDays: m.gapDays }));
    return;
  }

  // /wit36 — WITHOUT WITNESS (a participatory work; MONOMO). Same origin.
  if (url === '/wit36' || url === '/wit36/') url = '/wit36/index.html';
  if (url === '/wit36/terms' || url === '/wit36/terms/') url = '/wit36/terms.html';
  if (url === '/wit36/es' || url === '/wit36/es/') url = '/wit36/es.html';
  if (url === '/wit36/es/terms' || url === '/wit36/es/terms/') url = '/wit36/es/terms.html';

  if (url === '/data/days.json') {
    if (!STATE.days) loadRecord();
    res.writeHead(200, head({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify(STATE.days
      ? { days: STATE.days, meta: currentMeta() }
      : { days: [], meta: { status: 'record', live: false } }));
    return;
  }
  // Only the work's own surfaces are served. The raw record, the rule, the
  // server source, and every working file stay sealed.
  // ── Variation 89 (vertical daily story) — its own data contract ──
  if (url === '/89/data.json') {
    if (!STATE.days) loadRecord();
    res.writeHead(200, head({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify({ days: STATE.raw || [], meta: currentMeta() }));
    return;
  }
  if (url === '/') url = '/index.html';
  if (url === '/89' || url === '/89/') url = '/89/index.html';
  if (url === '/lab' || url === '/lab/') url = '/lab/index.html';
  // Sibling works keep their own files; only safe extensions, no data files.
  if (url === '/wit36/build-es.js') { res.writeHead(404, head({})); res.end('Not found'); return; }
  if (/^\/(89|lab|wit36)\//.test(url)) {
    const subExt = path.extname(url).toLowerCase();
    const SUB_OK = new Set(['.html', '.js', '.css', '.png', '.jpg', '.woff2', '.svg']);
    if (!SUB_OK.has(subExt)) { res.writeHead(404, head({})); res.end('Not found'); return; }
    const fp = path.join(dir, decodeURIComponent(url));
    if (!fp.startsWith(dir)) { res.writeHead(404, head({})); res.end('Not found'); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
      res.writeHead(200, head({ 'Content-Type': mimeTypes[subExt] || 'text/plain', 'Cache-Control': 'no-cache' }));
      res.end(data);
    });
    return;
  }
  if (url === '/og.jpg') {
    fs.readFile(path.join(dir, 'og.jpg'), (err, data) => {
      if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
      res.writeHead(200, head({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }));
      res.end(data);
    });
    return;
  }
  // The certificate's conditions are a public surface (council C-8): the terms
  // of the work are part of its honesty. Appendix A alone stays sealed.
  const SERVED = new Set([
    '/index.html', '/archive.html', '/conditions.html',
    '/painter.js', '/p5.oil.js', '/p5.oil.js.map',
    '/vendor/p5.min.js',
    '/fonts/manrope-latin.woff2', '/fonts/jetbrainsmono-latin.woff2',
  ]);
  if (!SERVED.has(url)) { res.writeHead(404, head({})); res.end('Not found'); return; }
  const filePath = path.join(dir, decodeURIComponent(url));
  if (!filePath.startsWith(dir)) { res.writeHead(404, head({})); res.end('Not found'); return; }
  const ext = path.extname(filePath);
  // vendor + fonts are hashed in the certificate — immutable by definition;
  // the pages and the painter must always revalidate so the served bytes
  // match the published hashes.
  const cache = (url.startsWith('/fonts/') || url.startsWith('/vendor/'))
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  // The previous build served painter.js with a 24h TTL: every returning
  // browser holds a poisoned copy (new page + old engine = black canvas).
  // Clear-Site-Data on the page response wipes the origin's cache the moment
  // the page revalidates; assets are also version-stamped (?v87r2).
  const extra = (url === '/index.html' || url === '/archive.html' || url === '/conditions.html')
    ? { 'Clear-Site-Data': '"cache"' } : {};
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
    res.writeHead(200, head(Object.assign({ 'Content-Type': mimeTypes[ext] || 'text/plain', 'Cache-Control': cache }, extra)));
    res.end(data);
  });
}).listen(port, () => {
  console.log(`Variations 87 — http://localhost:${port}`);
  restoreRefreshToken();
  loadRecord();          // serve the record immediately
  sync();                // then pull the living history
  setInterval(sync, SYNC_INTERVAL);
});
