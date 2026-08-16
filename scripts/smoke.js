// Walk the site as a reader does, and say plainly what is wrong.
//
// Not a unit test: this opens the real pages of a running site in a real
// browser and asserts what a visitor would notice — that every page answers,
// that the paintings appear, that the console is quiet, that the caption agrees
// with what the server says about the record, that the links lead somewhere.
//
//   node scripts/smoke.js <site> [--rehearsal] [--auth user:pass]
//
// A rehearsal copy is blind by design, so its record is expected to be stored
// rather than live; production is held to the stricter promise.

const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const val = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SITE = (argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--auth')
  || 'https://nikolaigrigoriev.com').replace(/\/$/, '');
const REHEARSAL = argv.includes('--rehearsal');
const AUTH = val('--auth', process.env.SMOKE_AUTH || '');

const problems = [];
const note = [];
const fail = (m) => problems.push(m);

// A rehearsal copy asks for a password on everything but its health report, so
// every request this script makes carries one when it has one.
const headers = AUTH ? { Authorization: 'Basic ' + Buffer.from(AUTH).toString('base64') } : {};
async function json(path) {
  const r = await fetch(`${SITE}${path}`, { headers });
  if (!r.ok) { fail(`${path} answered ${r.status}`); return null; }
  try { return await r.json(); } catch { fail(`${path} did not answer with JSON`); return null; }
}

// Knock until someone answers. A site deployed onto a persistent disk is
// replaced by stopping the old instance and starting a new one, so for a few
// seconds around a release there is nothing behind the address at all. Asking
// once and calling it dead failed a good release and put the previous version
// back — twice.
async function reach(path, tries = 12, waitMs = 15000) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${SITE}${path}`, { headers });
      if (r.ok) return await r.json();
    } catch { /* nothing there yet */ }
    if (i === 0) process.stdout.write('  waiting for the site to answer');
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, waitMs));
  }
  process.stdout.write('\n');
  return null;
}

(async () => {
  let health = await reach('/health');
  if (!health) { console.error('the site did not answer at all'); process.exit(1); }

  // A server that has just started has not yet asked the ring anything, so for
  // its first minutes it honestly reports that it is serving a stored record.
  // That is waking, not breaking — wait for it rather than rolling back a
  // deploy that was fine.
  if (!REHEARSAL && !health.live && health.uptimeSec < 300) {
    process.stdout.write('  just started, waiting for it to reach the ring');
    for (let i = 0; i < 20 && !health.live; i++) {
      await new Promise((r) => setTimeout(r, 10000));
      process.stdout.write('.');
      health = (await json('/health')) || health;
    }
    process.stdout.write('\n');
  }
  note.push(`build ${health.buildSha}, ${health.dayCount} days, last written ${health.lastDataDay}`);

  if (REHEARSAL) {
    if (health.live) fail('the rehearsal is reading the live record — it must be blind');
  } else {
    if (!health.ok) fail(`the site reports itself unwell: ${(health.degradedReasons || []).join('; ') || 'ok=false'}`);
    if (!health.live) fail('the site is serving a stored record instead of the living one');
    if (health.tokenError) fail('the ring authorisation has lapsed');
    if (health.gapDays > 2) note.push(`the body has been silent ${health.gapDays} days`);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  if (AUTH) {
    const [username, ...rest] = AUTH.split(':');
    await page.authenticate({ username, password: rest.join(':') });
  }

  // What the browser complains about. Console messages about a resource that
  // did not load carry no address, so those are watched on the responses
  // instead, where the address is known and the optional ones can be excused.
  const optional = /favicon|cv\.pdf|portrait/;
  const noise = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/Failed to load resource/.test(t)) noise.push(t.slice(0, 160));
  });
  page.on('pageerror', (e) => noise.push(String(e.message).slice(0, 160)));
  page.on('response', (r) => {
    if (r.status() >= 400 && !optional.test(r.url())) {
      noise.push(`${r.status()} on ${r.url().replace(SITE, '').slice(0, 100)}`);
    }
  });
  page.on('requestfailed', (r) => {
    // Leaving a page cancels whatever it had in flight — an engine that was
    // still warming when the reader moved on has not failed, it was let go.
    const why = (r.failure() && r.failure().errorText) || '';
    if (/ABORTED/i.test(why)) return;
    if (!optional.test(r.url())) noise.push(`request failed (${why}): ${r.url().slice(0, 100)}`);
  });

  const open = async (path) => {
    const r = await page.goto(`${SITE}${path}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    if (!r || r.status() >= 400) fail(`${path} answered ${r && r.status()}`);
    return r;
  };

  // The home page, met by someone who has never been here — on its own tab, so
  // that engines legitimately started elsewhere are not counted against it.
  const first = await browser.newPage();
  await first.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true });
  if (AUTH) {
    const [username, ...rest] = AUTH.split(':');
    await first.authenticate({ username, password: rest.join(':') });
  }


  const started = Date.now();
  await first.goto(`${SITE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const shown = await first.waitForFunction(() => {
    const imgs = [...document.querySelectorAll('.home-stage .plate img')];
    return imgs.length >= 2 && imgs.every((i) => i.complete && i.naturalWidth > 0 && i.classList.contains('in'));
  }, { timeout: 60000 }).then(() => true).catch(() => false);
  const took = ((Date.now() - started) / 1000).toFixed(1);
  if (!shown) fail('the home page did not show its paintings within a minute');
  else note.push(`home showed both works in ${took}s`);

  // Where the pictures came from is the honest question. Counting whether an
  // engine loaded is not: it warms on a timer once the page is quiet, and on a
  // slow machine that timer can fire while the pictures are still arriving —
  // which is a good thing being reported as a fault.
  const sources = await first.evaluate(() =>
    [...document.querySelectorAll('.home-stage .plate img')].map((i) => i.src));
  const painted = sources.filter((s) => s.startsWith('data:'));
  if (shown && painted.length) {
    fail(`the home page had to paint ${painted.length} of its works instead of showing what was ready`);
  }
  await first.close();

  // One day, one record, one painting — including the size it is asked at.
  // The paint is simulated and the simulation is sized, so a page that painted
  // its own copy at its own width showed a different picture of the same day
  // than the page beside it.
  const sameDay = await page.evaluate(async () => {
    const out = {};
    for (const w of (window.Site ? Site.WORKS : [])) {
      const day = '2026-05-10';
      const a = await Site.render(w.id, day, 300, 200);
      const b = await Site.render(w.id, day, 1400, 1000);
      out[w.id] = a === b;
    }
    return out;
  }).catch(() => ({}));
  for (const [id, same] of Object.entries(sameDay)) {
    if (!same) fail(`${id} paints a different picture of the same day depending on how big it is shown`);
  }

  // Every page a reader can reach.
  for (const p of ['/', '/works.html', '/archive.html?id=87', '/archive.html?id=89',
    '/about.html', '/rule.html?id=87', '/conditions.html']) {
    await open(p);
  }
  await open('/');

  // The dates arrive a moment after the picture — the picture is what matters
  // first — so wait for them rather than catching the page mid-breath.
  await page.waitForFunction(() => {
    const cur = document.querySelector('.caption .cur');
    return cur && cur.textContent.trim().length > 0;
  }, { timeout: 30000 }).catch(() => fail('the painting never got its dates'));

  // The caption must agree with the record.
  const caption = await page.evaluate(() => {
    const cur = document.querySelector('.caption .cur');
    const state = document.querySelector('.caption .state');
    return { cur: cur && cur.textContent.trim(), state: state && state.textContent.trim() };
  });
  if (!caption.cur) fail('the painting carries no dates');
  else if (!/Today$/.test(caption.cur)) fail(`the home page is not showing today: "${caption.cur}"`);
  // Only the living site can be held to this. A rehearsal reads a stored
  // record, so it deliberately shows no silence at all — a stopped instrument
  // must never be painted as a stopped body — and its gap count means nothing.
  if (!REHEARSAL) {
    if (health.gapDays > 1 && !/Silence/.test(caption.state || '')) {
      fail(`the body has been silent ${health.gapDays} days and the work does not say so`);
    }
    // The line under the day used to be empty unless the body had stopped, so
    // any words in it meant a silence. It now always says something — the date
    // behind "Today", or where the day falls in the record — and a silence is
    // only one of the things it can say. What must hold is that it never claims
    // one that is not happening.
    if (health.gapDays === 0 && /Silence/.test(caption.state || '')) {
      fail(`the record is current but the work claims: "${caption.state}"`);
    }
  }

  // What the works show must be the last day the body wrote.
  const manifest = (await json('/state/index.json')) || {};
  const meta = (await json('/state/meta.json')) || {};
  for (const [id, w] of Object.entries(meta)) {
    const alive = w.alive || [];
    if (!alive.length) continue;
    const m = manifest[id];
    if (!m) { fail(`${id} is missing from the list of what the site can show`); continue; }
    // The pictures travel with the code, so on a rehearsal they are newer than
    // its bundled record. Only the living site must agree with itself.
    //
    // The painter runs once a morning, by the artist's decision, so a day the
    // ring hands over later in the day is legitimately unpainted until the next
    // one — the site shows the morning's painting and says which day it is.
    // Two days behind is not a rhythm, it is a stall.
    const wrote = alive[alive.length - 1];
    const behind = m.last === wrote ? 0
      : Math.round((Date.parse(wrote) - Date.parse(m.last)) / 86400000);
    if (!REHEARSAL && !(behind >= 0 && behind <= 1)) {
      fail(`${id} shows ${m.last} while the body wrote to ${wrote}`);
    }
    const img = await fetch(`${SITE}/state/${id}.webp`, { headers });
    if (!img.ok) fail(`${id} has no picture on the site (HTTP ${img.status})`);
  }

  // The intake must still accept an application. The hidden field is filled, so
  // the server answers normally and files nothing.
  const intake = await fetch(`${SITE}/wit36/apply`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: JSON.stringify({
      name: 'Smoke', email: 'smoke@example.com', practice: 'a check',
      statement: 'a synthetic application that leaves no trace',
      consent: true, website: 'https://a-bot-was-here.example',
    }),
  });
  if (!intake.ok) fail(`the application form is refusing applications (HTTP ${intake.status})`);

  // Nothing may be broken in the console.
  if (noise.length) fail(`the browser complained: ${[...new Set(noise)].slice(0, 3).join(' | ')}`);

  await browser.close();

  for (const n of note) console.log(`  ${n}`);
  if (problems.length) {
    console.error('\nwrong:');
    for (const p of problems) console.error(`  - ${p}`);
    // Left on disk so the report that follows can say what was wrong instead of
    // only that something was. "Проверка не прошла" is not news anyone can act
    // on; "the site shows 13 August, the body wrote to 15 August" is.
    try { require('fs').writeFileSync('wrong.txt', problems.join('\n')); } catch (e) { /* the report will fall back */ }
    process.exit(1);
  }
  console.log('\nthe site is as it should be');
})().catch((e) => { console.error(e); process.exit(1); });
