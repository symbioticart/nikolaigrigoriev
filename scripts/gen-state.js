// How each work stands today, as one small picture.
//
// The paintings are made from a rule and a record — they are not photographs to
// be kept. Storing every day as a file would be storing the output of a
// function beside the function, and it would grow for ever. So only one image
// per work is kept: the last day the body wrote, painted at a size a screen can
// use. It is what a visitor sees in the first moment, before any engine has
// loaded. Everything else is drawn live by the work's own engine, which takes
// about half a second once it is warm.
//
// For 87 and 89 this image is the last WRITTEN day, with no silence in it. A
// silence is a pure function of how long the body has been quiet, and the
// browser applies it live — baking it here would freeze the fade at the moment
// of generation, which is exactly how the site once came to show a fortnight-old
// state labelled "Today".
//
// Archipelago is the exception: its pulse dims inside the mark rather than over
// it, so its silence cannot be laid on afterwards. Its image carries the state
// as it truly stands, and is repainted each morning.
//
//   node scripts/gen-state.js <site> <outDir> [--work <id>]

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const argv = process.argv.slice(2);
const value = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const positional = argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--work');

const SITE = positional[0] || 'https://nikolaigrigoriev.com';
const OUT = positional[1] || 'state';
const ONLY = value('--work', null);

// Painted large enough for a desktop plate on a retina screen, and squeezed
// hard enough that the whole set stays a rounding error on any connection.
const SIZES = { '87': [1400, 1000], '89': [920, 1350], archipelago: [900, 1200] };
const QUALITY = { archipelago: 0.86 };
const Q = (w) => QUALITY[w] || 0.88;
// Works whose silence is painted from the inside and cannot be filtered over.
const BAKED_SILENCE = new Set(['archipelago']);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
  });
  fs.mkdirSync(OUT, { recursive: true });

  const manifestPath = path.join(OUT, 'index.json');
  let manifest = {};
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* first run */ }

  for (const work of Object.keys(SIZES)) {
    if (ONLY && work !== ONLY) continue;
    const page = await browser.newPage();
    await page.setViewport({ width: 400, height: 400 });
    await page.evaluateOnNewDocument(() => {
      window.__m = []; window.__ready = null;
      addEventListener('message', (e) => {
        const m = e.data;
        if (m && m.__art) { window.__m.push(m); if (m.type === 'ready') window.__ready = m; }
      });
    });
    await page.goto(`${SITE}/art/render.html?work=${work}`, { waitUntil: 'networkidle2', timeout: 120000 });
    await page.waitForFunction('window.__ready !== null', { timeout: 180000 });
    const ready = await page.evaluate(() => window.__ready);

    const alive = ready.alive || [];
    const lastWritten = alive[alive.length - 1];
    if (!lastWritten) { console.log(`${work}: no record yet`); await page.close(); continue; }

    // The written day for works whose silence is laid on live; the state as it
    // truly stands for the one whose silence is painted from within.
    const date = BAKED_SILENCE.has(work) ? (ready.last || lastWritten) : lastWritten;
    const [w, h] = SIZES[work];

    const res = await page.evaluate(async (date, w, h) => await new Promise((resolve) => {
      const started = Date.now();
      const iv = setInterval(() => {
        const hit = window.__m.find((m) => m.type === 'render' && m.reqId === 1);
        if (hit) { clearInterval(iv); resolve(hit); }
        else if (Date.now() - started > 120000) { clearInterval(iv); resolve({ ok: false, err: 'timeout' }); }
      }, 30);
      postMessage({ __artcmd: true, type: 'render', reqId: 1, date, w, h }, '*');
    }), date, w, h);

    if (!res || !res.ok) {
      console.error(`${work}: could not paint ${date} (${res && res.err})`);
      await page.close();
      process.exitCode = 1;
      continue;
    }

    const webp = await page.evaluate(async (url, q) => {
      const im = new Image(); im.src = url; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      c.getContext('2d').drawImage(im, 0, 0);
      return c.toDataURL('image/webp', q);
    }, res.url, Q(work));

    const buf = Buffer.from(webp.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, `${work}.webp`), buf);
    manifest[work] = {
      last: lastWritten,                       // the last day the body wrote
      shown: date,                             // the day this picture holds
      bakedSilence: BAKED_SILENCE.has(work),
    };
    console.log(`${work}: ${date} — ${(buf.length / 1024).toFixed(0)}kb`);
    await page.close();
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
