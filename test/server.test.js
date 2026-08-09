// The server, exercised as a stranger meets it.
//
// A real process is started on a spare port with no Oura token and a scratch
// archive, so nothing here can touch the living record. What is asserted is
// the contract the outside world depends on: which surfaces exist, what they
// promise, what they must never leak, and what the health report says when
// the server is blind.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3599;
const BASE = `http://127.0.0.1:${PORT}`;
let child, scratch;

before(async () => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'record-'));
  child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), OURA_TOKEN: '', ARCHIVE_DIR: scratch,
           TG_BOT_TOKEN: '', TG_CHAT_ID: '', STAGING_AUTH: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i++) {
    try { await fetch(`${BASE}/health`); return; } catch { await new Promise(r => setTimeout(r, 250)); }
  }
  throw new Error('the server never came up');
});

after(() => {
  if (child) child.kill('SIGKILL');
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

// ── What the server says about itself ──────────────────────────────────────
test('a blind server admits it', async () => {
  const h = await (await fetch(`${BASE}/health`)).json();
  assert.equal(h.ok, false, 'a server with no token must not report itself ok');
  assert.equal(h.live, false);
  assert.equal(h.status, 'record');
  assert.ok(h.dayCount > 0, 'it still serves the record it has');
});

test('the health report keeps its shape', async () => {
  const h = await (await fetch(`${BASE}/health`)).json();
  for (const k of ['ok', 'live', 'status', 'tokenError', 'degraded', 'degradedReasons',
    'lastDataDay', 'serverDate', 'gapDays', 'dayCount', 'lastKnownGoodDayCount',
    'dataAdvancing', 'lastSyncAgeSec', 'syncedAt', 'perCollection', 'dormantDays',
    'buildSha', 'uptimeSec']) {
    assert.ok(k in h, `the watcher depends on ${k} and it is gone`);
  }
  assert.match(h.lastDataDay, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(h.serverDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('silence is never declared from a stored record', async () => {
  // The guard that keeps a dead instrument from being painted as a dead body.
  const h = await (await fetch(`${BASE}/health`)).json();
  assert.equal(h.live, false);
  assert.equal(h.status, 'record', 'a blind server must never report bodily silence');
});

// ── What it serves ─────────────────────────────────────────────────────────
test('every page a reader can reach is served', async () => {
  for (const p of ['/', '/works.html', '/work.html', '/archive.html', '/about.html',
    '/rule.html', '/conditions.html', '/assets/site.js', '/assets/site.css']) {
    const r = await fetch(`${BASE}${p}`);
    assert.equal(r.status, 200, `${p} answered ${r.status}`);
  }
});

test('the works announce themselves before any engine loads', async () => {
  const m = await (await fetch(`${BASE}/state/meta.json`)).json();
  assert.ok(Object.keys(m).length >= 2, 'at least the two selected works');
  for (const [id, w] of Object.entries(m)) {
    assert.ok(w.ratio > 0, `${id} has no shape`);
    assert.ok(Array.isArray(w.alive), `${id} has no calendar`);
  }
  // The two selected works carry a bundled record and must always have days.
  for (const id of ['87', '89']) {
    assert.match(m[id].birth, /^\d{4}-\d{2}-\d{2}$/, `${id} has no birth`);
    assert.ok(m[id].alive.length > 900, `${id} lost its days`);
  }
});

test('a work whose record lives only on the disk is empty without it — knowingly', async () => {
  // Archipelago is painted from nights, and nights are not bundled: on a cold
  // machine with no disk it has no days at all. That is honest rather than
  // wrong — but it means the disk is not optional for that work, and the
  // fallback that saves the other two does not exist here. Asserted so the
  // day this changes, it changes on purpose.
  const m = await (await fetch(`${BASE}/state/meta.json`)).json();
  if (m.archipelago) {
    assert.equal(m.archipelago.alive.length, 0,
      'archipelago found nights without a disk — the bundle now carries them');
  }
});

test('the transported form carries channels, never measurements', async () => {
  const d = await (await fetch(`${BASE}/data/days.json`)).json();
  assert.ok(d.days.length > 900);
  const day = d.days[500];
  assert.deepEqual(Object.keys(day).sort(), ['c', 'd', 'i', 's']);
  assert.equal(day.c.length, 20);
  assert.equal(day.hrv, undefined, 'a raw measurement escaped into the world');

  const n = await (await fetch(`${BASE}/89/data.json`)).json();
  assert.deepEqual(Object.keys(n.days[500]).sort(), ['_m', '_s', 'day']);
  assert.equal(n.days[500].readinessScore, undefined);
});

// ── What it refuses ────────────────────────────────────────────────────────
test('the record itself stays sealed', async () => {
  for (const p of ['/data/daily-metrics.json', '/server.js', '/rule.js', '/rule89.js',
    '/package.json', '/data/archive/2026-01-01.json']) {
    const r = await fetch(`${BASE}${p}`);
    assert.equal(r.status, 404, `${p} is reachable and must not be`);
  }
});

test('a path cannot climb out of the site', async () => {
  for (const p of ['/assets/../server.js', '/art/../../etc/passwd', '/state/../server.js']) {
    const r = await fetch(`${BASE}${p}`);
    assert.notEqual(r.status, 200, `${p} escaped the site`);
  }
});

test('an unknown address is refused, not guessed at', async () => {
  const r = await fetch(`${BASE}/there-is-no-such-page`);
  assert.equal(r.status, 404);
  // A person who mistyped deserves a page and a way onward, not a bare word.
  const body = await r.text();
  assert.match(body, /<html/i, 'a mistyped address answered with no page at all');
  assert.match(body, /href="\//, 'the page offers no way back into the work');
});

test('what is plainly not a page keeps the bare answer', async () => {
  const r = await fetch(`${BASE}/nothing.png`);
  assert.equal(r.status, 404);
  assert.doesNotMatch(await r.text(), /<html/i, 'a missing image should not cost a whole page');
});

test('a crawler is told where to look and where not to', async () => {
  const robots = await fetch(`${BASE}/robots.txt`);
  assert.equal(robots.status, 200);
  const text = await robots.text();
  assert.match(text, /Sitemap:/, 'the map is not announced');
  assert.match(text, /Disallow: \/wit36\/apply/, 'the intake should not be crawled');

  const map = await fetch(`${BASE}/sitemap.xml`);
  assert.equal(map.status, 200);
  const xml = await map.text();
  assert.match(xml, /sitemaps\.org\/schemas\/sitemap/, 'the map is not a sitemap');
  for (const page of ['works.html', 'about.html', 'conditions.html']) {
    assert.ok(xml.includes(page), `${page} is missing from the map`);
  }
});

test('the tab carries a mark', async () => {
  const r = await fetch(`${BASE}/favicon.ico`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /svg/);
});

// ── How it is dressed ──────────────────────────────────────────────────────
test('the promise of touching no other server is a header, not a manner', async () => {
  const r = await fetch(`${BASE}/`);
  const csp = r.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'self'/, 'the work must reach no one else');
  assert.match(csp, /base-uri 'none'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/);
});

test('what cannot change is cached forever, what can is revalidated', async () => {
  const font = await fetch(`${BASE}/fonts/manrope-latin.woff2`);
  assert.match(font.headers.get('cache-control') || '', /immutable/);
  const page = await fetch(`${BASE}/`);
  assert.match(page.headers.get('cache-control') || '', /no-cache/);
  assert.ok(page.headers.get('etag'), 'without an ETag every visit refetches the page');
});

// ── The intake ─────────────────────────────────────────────────────────────
test('a bot filling the hidden field is thanked and ignored', async () => {
  const r = await fetch(`${BASE}/wit36/apply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Probe', email: 'probe@example.com', practice: 'probe',
      statement: 'a synthetic application that must leave no trace',
      consent: true, website: 'https://a-bot-was-here.example',
    }),
  });
  assert.equal(r.status, 200, 'the honeypot must answer normally, never reveal itself');
  const j = await r.json();
  assert.equal(j.ok, true);
});

test('an incomplete application is refused', async () => {
  const r = await fetch(`${BASE}/wit36/apply`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Nobody' }),
  });
  assert.ok(r.status >= 400, 'a half-filled application was accepted');
});

test('a method the site does not use is refused', async () => {
  const r = await fetch(`${BASE}/`, { method: 'DELETE' });
  assert.equal(r.status, 405);
});

// ── The rehearsal copy ─────────────────────────────────────────────────────
test('production is not gated', async () => {
  // This server runs without STAGING_AUTH, as production does. If a gate ever
  // appeared here it would be shutting the public out of the work.
  const r = await fetch(`${BASE}/`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-robots-tag'), null, 'production must stay readable to the world');
});

test('a rehearsal copy asks who is knocking, and hides from crawlers', async () => {
  const { spawn } = require('node:child_process');
  const port = 3601;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), OURA_TOKEN: '', ARCHIVE_DIR: scratch,
           TG_BOT_TOKEN: '', TG_CHAT_ID: '', STAGING_AUTH: 'rehearsal:let-me-look' },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 60; i++) {
      try { await fetch(`${base}/health`); break; } catch { await new Promise(r => setTimeout(r, 250)); }
    }
    const shut = await fetch(`${base}/`);
    assert.equal(shut.status, 401, 'a rehearsal copy must not be readable without a password');
    assert.match(shut.headers.get('www-authenticate') || '', /^Basic/);
    assert.match(shut.headers.get('x-robots-tag') || '', /noindex/);

    const wrong = await fetch(`${base}/`, {
      headers: { Authorization: 'Basic ' + Buffer.from('rehearsal:wrong').toString('base64') },
    });
    assert.equal(wrong.status, 401, 'a wrong password must not open it');

    const right = await fetch(`${base}/`, {
      headers: { Authorization: 'Basic ' + Buffer.from('rehearsal:let-me-look').toString('base64') },
    });
    assert.equal(right.status, 200);
    assert.match(right.headers.get('x-robots-tag') || '', /noindex/,
      'even to its reader, a rehearsal must tell crawlers to stay away');

    // The watchers must still be able to see it without a password.
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const h = await health.json();
    assert.equal(h.live, false, 'a rehearsal copy is blind by design, and says so');
  } finally {
    child.kill('SIGKILL');
  }
});

test('a bare password is enough, and it is still a password', async () => {
  const { spawn } = require('node:child_process');
  const port = 3602;
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), OURA_TOKEN: '', ARCHIVE_DIR: scratch,
           TG_BOT_TOKEN: '', TG_CHAT_ID: '', STAGING_AUTH: '112358' },
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  const knock = (creds) => fetch(`${base}/`, creds
    ? { headers: { Authorization: 'Basic ' + Buffer.from(creds).toString('base64') } } : undefined);
  try {
    for (let i = 0; i < 60; i++) {
      try { await fetch(`${base}/health`); break; } catch { await new Promise(r => setTimeout(r, 250)); }
    }
    assert.equal((await knock()).status, 401);
    // Whatever name the browser dialog insists on, the password decides.
    assert.equal((await knock(':112358')).status, 200, 'a bare password must open it');
    assert.equal((await knock('anyone:112358')).status, 200, 'the name is not asked of anyone');
    assert.equal((await knock(':112357')).status, 401, 'a near miss is still a miss');
    assert.equal((await knock('112358')).status, 200, 'a client that sends no colon at all');
    assert.equal((await knock(':')).status, 401);
  } finally {
    child.kill('SIGKILL');
  }
});

// ── One head, on every page ────────────────────────────────────────────────
test('every page carries an icon, a description and a card', async () => {
  for (const p of ['/', '/works.html', '/work.html?id=87', '/archive.html?id=87',
    '/about.html', '/rule.html?id=87', '/conditions.html']) {
    const html = await (await fetch(`${BASE}${p}`)).text();
    assert.match(html, /rel="icon"/, `${p} has no icon`);
    assert.match(html, /property="og:title" content="[^"]+"/, `${p} shares without a title`);
    assert.match(html, /name="description" content="[^"]{20,}"/, `${p} has no description`);
    assert.match(html, /property="og:image"/, `${p} shares without a picture`);
    // The card must carry the page's own words, not a title glued to every page.
    const og = html.match(/property="og:title" content="([^"]+)"/)[1];
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    assert.equal(og, title, `${p} says one thing in the tab and another when shared`);
  }
});

test('the picture a shared link shows is reachable', async () => {
  const r = await fetch(`${BASE}/og.jpg`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /image\/jpeg/);
});

test('the site asks for no camera, no microphone, no place', async () => {
  const r = await fetch(`${BASE}/`);
  const p = r.headers.get('permissions-policy') || '';
  for (const f of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()']) {
    assert.ok(p.includes(f), `${f} is not refused`);
  }
});

test('no page reaches for anyone else’s server', async () => {
  // The conservation promise, checked in the markup rather than trusted: the
  // /89 poster used to pull its faces from a font CDN.
  for (const p of ['/', '/works.html', '/about.html', '/conditions.html', '/89/']) {
    const html = await (await fetch(`${BASE}${p}`)).text();
    const outside = (html.match(/(?:href|src)="https?:\/\/[^"]+"/g) || [])
      .filter((u) => !/schema\.org|www\.w3\.org|instagram\.com|t\.me|nikolaigrigoriev\.com/.test(u));
    assert.deepEqual(outside, [], `${p} loads from elsewhere`);
  }
});

test('a work is one shape, whichever file is asked', async () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'works.json'), 'utf8'));
  const m = await (await fetch(`${BASE}/state/meta.json`)).json();
  for (const [id, w] of Object.entries(m)) {
    const c = reg[id].canvas;
    assert.ok(Math.abs(w.ratio - c.w / c.h) < 1e-9,
      `${id} is ${w.ratio} to the server and ${c.w / c.h} in the registry`);
  }
});
