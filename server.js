// Variations 87 — symbiotic server.
//
// The raw record of the body NEVER leaves this server. The browser receives
// only: the date, the seed, and anonymous entangled channels in [0,1] — each
// a convolution of at least two causally-percentiled signals. The rule itself
// lives in rule.js (hashed in the certificate §10).

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const rule   = require('./rule');
const rule89 = require('./rule89');
const { sweep } = require('./oura-sweep');
// Set only on the rehearsal copy: "name:password". Production leaves it unset.
const STAGING_AUTH = process.env.STAGING_AUTH || '';
// A rehearsal copy: kept out of search, whether or not it also asks a password.
const REHEARSAL = process.env.REHEARSAL === '1' || !!STAGING_AUTH;
// The studio exists only where the artist is. Set on his own machine, never on
// a public host: the works he has not shown, and the ones he set aside, are not
// the site's business. Its private record lives one level ABOVE the repository,
// so no `git add` can carry it into a public history.
const STUDIO = process.env.STUDIO === '1';
const STUDIO_FILE = process.env.STUDIO_FILE || path.join(__dirname, '..', 'studio.json');



const dir  = __dirname;
const port = process.env.PORT || 3457;

// Who the works are. One description, read once at boot and handed to everyone
// who needs it: the site (injected into assets/site.js as it is served), the
// painting host, the meta endpoint, the morning painter. Adding a work is then
// an act of description rather than an archaeology through eight files.
let WORKS_REGISTRY = {};
let WORKS_JSON = '{}';
let WORKS_STAMP = '0';
function loadWorks() {
  try {
    const f = path.join(dir, 'works.json');
    const raw = fs.readFileSync(f, 'utf8');
    const all = JSON.parse(raw);
    delete all._;                                   // the note to the reader
    WORKS_REGISTRY = all;
    WORKS_JSON = JSON.stringify(all);
    WORKS_STAMP = Math.round(fs.statSync(f).mtimeMs).toString(36);
  } catch (e) {
    console.error('[works] could not read works.json —', e.message);
  }
}
loadWorks();

// === THE WORK — fixed constants (mirrored in the certificate) ===
const WORK_BIRTH_DATE = '2022-05-24';   // first recorded day of the body
const WORK_OWNER      = 'Nikolai Grigoriev';
// The work does not die (canon, ratified 2026-07-23). A short silence PAUSES it
// (the last day petrifies); a long silence DESICCATES it toward disappearance,
// full absence reached at DISAPPEAR_DAYS. Any return of a signal resurrects it.
const PAUSE_DAYS      = 14;             // ≤ this: a pause (frozen), not desiccation
const DISAPPEAR_DAYS  = 90;             // confirmed-silent days => the work has faded to absence (still resurrectable)

// === SECRETS (env only — never commit) ===
let ACCESS_TOKEN  = process.env.OURA_TOKEN   || '';
let REFRESH_TOKEN = process.env.OURA_REFRESH || '';
const CLIENT_ID     = process.env.OURA_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET || '';

const NIGHT_WINDOW  = 200;                  // nights served without ?all=1
const FETCH_CHUNK_DAYS = 90;                // API pull window per request

// The ring is asked on Barcelona's clock, not on the process uptime. The grid
// used to be `setInterval(sync, 6h)` counted from boot, so every deploy moved
// all four sync times: on 15 August they landed at 03:47/09:47/15:47/21:47 and
// the morning frame at 09:00 was drawn from a record six hours old.
//
// 09:30 is the load-bearing one. The body writes the night while it sleeps, but
// the ring only hands it over once the phone opens it — around 8 or 9. A sync
// before that reads yesterday, and the day's painting comes out a day behind.
const TZ          = 'Europe/Madrid';        // Barcelona's zone
const SYNC_HOURS  = [3, 9, 15, 21];
const SYNC_MINUTE = 30;
// Full history costs ~90 requests (four years in 90-day windows) and is only
// needed to repair the archive, which is write-once and never drifts. Every
// other sync takes the tail in a single request per collection: the archive
// already holds everything older, and mergeDays gives it priority anyway.
const FULL_SYNC_WEEKDAY = 0;                // Sunday, at the first slot of the day

const BUILD_SHA = (process.env.RENDER_GIT_COMMIT || 'dev').slice(0, 7);
const BOOT_TIME = Date.now();
const SITE     = 'https://nikolaigrigoriev.com';

// === IN-MEMORY STATE ===
const STATE = {
  days: null,        // clean transported days [{d,s,c,i}]
  lastDataDay: null,
  live: false,       // true only after a successful living synchronisation
  lastSync: null,
  syncing: false,
  // observability (read by /health and the external healthcheck action)
  tokenError: false,
  degraded: false,
  degradedReasons: [],
  perCollection: {},        // { name: { ok, count } }
  lastKnownGoodCount: 0,
  // Archipelago reads the night itself, not the day it belongs to: the
  // five-minute hypnogram, the movement, the heart and the recovery inside those
  // hours. The daily record cannot carry them — it is fourteen scalars.
  nights: null,             // [{ day, phase5, move30, hrv[], hr[], … }]
};

const mimeTypes = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json',
  '.map': 'application/json', '.woff2': 'font/woff2',
  '.webp': 'image/webp', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
};

// Security headers: the conservation promise ("no request to anyone else's
// server, nothing tracked") enforced as mechanism, not manners.
const BASE_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; " +
    "img-src 'self' data:; frame-src 'self'; child-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  // The work needs no camera, no microphone, no location, no payment. Refusing
  // them out loud is the same promise the CSP makes, in the other direction.
  //
  // The motion sensors are deliberately NOT refused: p5 attaches a device-motion
  // listener of its own accord, and a refusal it never asked for showed up as a
  // policy violation in the console of every page that paints. Nothing can leave
  // this origin anyway — connect-src is 'self'.
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), ' +
    'midi=(), display-capture=(), interest-cohort=()',
};
function head(extra) { return Object.assign({}, BASE_HEADERS, extra); }

// One head for every page.
//
// A page carries its own title and its own description — those are its words.
// Everything else that belongs in a head is the same on all of them, and was
// therefore missing from most: no icon, no card when a link is shared. It is
// written here once and put into the page as it is served, so a new page
// inherits it by existing rather than by remembering to copy it.
function sharedHead(html, host) {
  const site = `https://${(host || 'nikolaigrigoriev.com').split(':')[0]}`;
  const grab = (re) => { const m = html.match(re); return m ? m[1].trim() : ''; };
  const title = grab(/<title>([^<]*)<\/title>/i) || 'Nikolai Grigoriev';
  const desc = grab(/<meta\s+name="description"\s+content="([^"]*)"/i);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const tag = (p, k, v) => (v ? `<meta ${p}="${k}" content="${esc(v)}">\n` : '');
  return '\n<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
    + '<meta name="theme-color" content="#eee9dd">\n'
    + tag('property', 'og:type', 'website')
    + tag('property', 'og:site_name', 'Nikolai Grigoriev')
    + tag('property', 'og:title', title)
    + tag('property', 'og:description', desc)
    + tag('property', 'og:image', `${site}/og.jpg`)
    + tag('name', 'twitter:card', 'summary_large_image')
    + tag('name', 'twitter:title', title)
    + tag('name', 'twitter:description', desc);
}

// A page is read, given its head, and sent with a validator over what was
// actually sent — the head is written in code, so a stat-based tag would go on
// claiming the old bytes after the code changed underneath it.
function servePage(req, res, fp, cache, extra) {
  fs.readFile(fp, 'utf8', (err, raw) => {
    if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
    // After the charset, never before it: a browser reads the encoding from the
    // first bytes of the head, and pushing it down is how a page starts
    // guessing at its own letters.
    const anchor = /<meta\s+charset=[^>]*>/i.test(raw) ? /<meta\s+charset=[^>]*>/i : /<head>/i;
    const body = raw.replace(anchor, (m) => m + sharedHead(raw, req.headers.host));
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('base64').slice(0, 22) + '"';
    const h = head(Object.assign({
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cache, 'ETag': etag,
    }, extra || {}));
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
    res.writeHead(200, h); res.end(body);
  });
}

// Serve a static file with a validator (ETag + Last-Modified) so a `no-cache`
// asset revalidates to a tiny 304 instead of re-downloading its full body — the
// 926 KB p5 lib, painters and CSS stop being re-fetched on every navigation,
// while any real change is still picked up immediately (no stale-engine risk).
function serveFile(req, res, fp, mime, cache, extra) {
  fs.stat(fp, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, head({})); res.end('Not found'); return; }
    const etag = 'W/"' + st.size.toString(36) + '-' + Math.round(st.mtimeMs).toString(36) + '"';
    const h = head(Object.assign({
      'Content-Type': mime, 'Cache-Control': cache,
      'ETag': etag, 'Last-Modified': st.mtime.toUTCString(),
    }, extra || {}));
    const inm = req.headers['if-none-match'];
    if (inm && inm === etag) { res.writeHead(304, h); res.end(); return; }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
      res.writeHead(200, h); res.end(data);
    });
  });
}

// Serve a live JSON payload with an ETag over its body: identical data (no new
// day, no new sync) revalidates to a 304, so the ~0.5 MB record is not re-sent
// on every navigation — yet any change mints a new ETag and is delivered at once.
function serveJSON(req, res, obj) {
  const body = JSON.stringify(obj);
  const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('base64').slice(0, 22) + '"';
  const h = head({ 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'ETag': etag });
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
  res.writeHead(200, h); res.end(body);
}

// === OPS — Telegram monitoring + two-way bot ===
// Every outgoing message is plain Russian: what happened, is the site OK,
// what to do. Problems alert once + a reminder every 48h; recovery once.
const TG_API = process.env.TG_API_BASE || 'https://api.telegram.org';
const OPS = {
  alerts: {},            // key -> { since, lastSent }
  muteUntil: 0,          // /mute
  lastDigestDate: null,  // Barcelona date of the last evening digest
  lastNotifiedDay: null, // last data day announced to the channel
  apps: [],              // wit36 applications since boot: { ts, name, lang }
  lastSyncSlot: null,    // Barcelona slot key of the last scheduled sync
  lastFullSync: null,    // ISO timestamp of the last full-history pull
  // What the outside watchers found, latest per source. They no longer speak to
  // Telegram themselves — see POST /ops/report.
  reports: {},           // source -> { level, headline, detail, action, runUrl, at }
};
const RU_MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function ruDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${RU_MONTHS[m - 1]}` + (y !== new Date().getUTCFullYear() ? ` ${y}` : '');
}
function ruDur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'меньше минуты';
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} ч ${m % 60} мин`;
  return `${Math.floor(h / 24)} дн`;
}
function ruAgo(ms) { return ms < 30000 ? 'только что' : `${ruDur(ms)} назад`; }

function tgApi(method, payload) {
  const tok = process.env.TG_BOT_TOKEN;
  if (!tok) return;
  try {
    const body = JSON.stringify(payload);
    const mod = TG_API.startsWith('http://') ? http : https;   // http only for the local test mock
    const req = mod.request(`${TG_API}/bot${tok}/${method}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
    req.on('error', () => {});
    req.setTimeout(8000, () => req.destroy());
    req.write(body); req.end();
  } catch (e) { /* never let telegram break the server */ }
}
function tgSend(text, opts = {}) {
  const chat = opts.chatId || process.env.TG_CHAT_ID;
  if (!chat) return;
  if (!opts.isReply && Date.now() < OPS.muteUntil) return;   // /mute silences broadcasts, not replies
  const p = { chat_id: chat, text, disable_notification: !!opts.silent, disable_web_page_preview: true };
  if (opts.buttons) p.reply_markup = { inline_keyboard: opts.buttons };
  tgApi('sendMessage', p);
}
// The standard button row under /status and the digest — the bot's "menu".
// The first one is the one that matters in the morning: the ring has just been
// synchronised and the site does not know it yet.
function menuButtons() {
  return [
    [{ text: 'Обновить данные', callback_data: '/sync' }, { text: 'Как дела', callback_data: '/status' }],
    [{ text: 'Проект 89', callback_data: '/89' }, { text: 'Заявки', callback_data: '/apps' }, { text: 'Тихо 12ч', callback_data: '/mute' }],
  ];
}

// Three levels and no more. Broken means a viewer sees the wrong thing or the
// data has stopped, and it is worth interrupting the day for. Watch means it is
// worth knowing and it usually mends itself — it waits for the evening. Green
// exists only to close something that was announced.
function opsProblem(key, text, level = 'watch') {
  const now = Date.now(), a = OPS.alerts[key];
  if (now < OPS.muteUntil) return;   // muted: don't mark as announced — it will fire after unmute
  if (!a) {
    OPS.alerts[key] = { since: now, lastSent: now, level, text, announced: level === 'broken' };
    if (level === 'broken') tgSend(text);   // anything milder waits for the digest
    return;
  }
  a.text = text;
  // A thing can get worse. Something that was only worth knowing and has become
  // broken must be said now — not held for another 48 hours because an entry
  // already existed. And once said out loud, its recovery is said out loud too,
  // whatever level it has drifted to since.
  const escalated = level === 'broken' && a.level !== 'broken';
  a.level = level;
  if (escalated) { a.lastSent = now; a.announced = true; tgSend(text); return; }
  if (level === 'broken' && now - a.lastSent > 48 * 3600e3) {
    a.lastSent = now;
    tgSend(`${text}\n\nДержится уже ${ruDur(now - a.since)}.`);
  }
}
function opsRecovered(key, text) {
  const a = OPS.alerts[key];
  if (!a) return;
  delete OPS.alerts[key];
  if (a.announced) tgSend(`${text} Длилось ${ruDur(Date.now() - a.since)}.`);
}

// Russian counts things by the last digit and then changes its mind about it.
// Every message that names a number of days went through this or said "2 дней".
function ruPlural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const ruDays = (n) => `${n} ${ruPlural(n, 'день', 'дня', 'дней')}`;

// What the work is doing right now, in the words the canon uses (ratified
// 2026-07-23): it does not die. A short silence pauses it, a long one dries it
// toward absence, any signal at all brings it back.
function workState() {
  const m = currentMeta();
  if (!STATE.live) return { line: 'показываю сохранённую запись, живого синка ещё не было', worry: true };
  if (m.gapDays <= 1) return { line: 'в полном цвете', worry: false };
  if (m.gapDays <= PAUSE_DAYS) {
    return { line: `на паузе, ${ruDays(m.gapDays)} тишины — последний день застыл, цвет уходит`, worry: false };
  }
  if (m.gapDays < DISAPPEAR_DAYS) {
    return { line: `иссыхает, ${ruDays(m.gapDays)} тишины — до полного исчезновения ещё ${ruDays(DISAPPEAR_DAYS - m.gapDays)}`, worry: true };
  }
  return { line: `исчезла — ${ruDays(m.gapDays)} тишины. Не стёрлась: любой сигнал вернёт её`, worry: true };
}

// One honest paragraph about the whole system — reused by /status and the digest.
// Written as a column so the eye finds the one line that changed.
function statusText() {
  const m = currentMeta();
  const dayCount = (STATE.raw || []).length;
  const st = workState();
  const paint = statePainting();

  const ring = STATE.tokenError ? 'авторизация слетела, данные не идут'
    : STATE.lastSync ? `${bcnClock(STATE.lastSync)}, ${ruAgo(Date.now() - Date.parse(STATE.lastSync))}`
    : 'ещё не спрашивали';

  const rows = [
    ['Сайт', `работает, версия ${BUILD_SHA}, поднят ${ruDur(Date.now() - BOOT_TIME)} назад`],
    ['Запись', `${ruDays(dayCount)}, последняя ночь — ${ruDate(m.lastDataDay)}`],
    ['Кольцо', ring],
    ['Картина', st.line],
  ];
  if (paint.known) {
    rows.push(['На сайте', paint.behind > 1
      ? `картины от ${ruDate(paint.day)}, запись дошла до ${ruDate(m.lastDataDay)}`
      : `картины от ${ruDate(paint.day)} — сходится с записью`]);
  }
  const width = Math.max(...rows.map(r => r[0].length));
  return rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`).join('\n');
}

// Evening digest: one quiet message at 21:00 Barcelona instead of noise.
const DIGEST_HOUR = parseInt(process.env.OPS_DIGEST_HOUR || '21', 10);
function barcelonaParts() {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
  const date = s.slice(0, 10);
  // The weekday is taken from that local date rather than from the clock, so it
  // can never disagree with it on either side of midnight.
  return { date, hour: +s.slice(11, 13), minute: +s.slice(14, 16), weekday: new Date(`${date}T12:00:00Z`).getUTCDay() };
}
// Barcelona time, as a reader would write it.
function bcnClock(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour12: false, hour: '2-digit', minute: '2-digit' })
    .format(new Date(iso));
}
// Everything that is off, gathered from the server's own senses and from the
// watchers that reported in. One list, one vocabulary, one place that decides
// what is worth waking someone for.
//
// The digest used to count only the server's internal alerts. It knew nothing
// about the checks running on GitHub, so on 15 August it said the site was fine
// at 21:00 and a red alarm about the same site arrived at 21:27. Both were true
// on their own terms, and together they meant nothing.
function troubles() {
  const out = [];
  const m = currentMeta();
  const paint = statePainting();
  if (paint.known && paint.behind > 1) {
    out.push({
      level: 'broken',
      what: `Зритель видит картины от ${ruDate(paint.day)}, а запись дошла до ${ruDate(m.lastDataDay)}.`,
      why: 'Статичные состояния на сайте отстали от тела. Движок дорисует верное, но первое, что видит человек, — позавчерашнее.',
      act: 'Нажми «Переложить картины» — перерисую и выложу заново.',
    });
  }
  if (STATE.tokenError) {
    out.push({
      level: 'broken',
      what: 'Oura не пускает к данным — авторизация слетела.',
      why: 'Новые дни не приходят, картина замерла на последнем записанном.',
      act: 'Обновить OURA_TOKEN: dashboard.render.com/web/srv-d7ektha8qa3s73ddeqd0 → Environment.',
    });
  }
  if (STATE.live && m.gapDays > PAUSE_DAYS) {
    out.push({
      level: 'broken',
      what: `Кольцо молчит ${ruDays(m.gapDays)}.`,
      why: `Картина иссыхает, до полного исчезновения ещё ${ruDays(Math.max(0, DISAPPEAR_DAYS - m.gapDays))}.`,
      act: 'Открой Oura на телефоне и дай кольцу синхронизироваться — картина вернётся в цвет.',
    });
  }
  for (const [src, r] of Object.entries(OPS.reports)) {
    if (!r || r.level === 'ok') continue;
    if (Date.now() - Date.parse(r.at) > 36 * 3600e3) continue;   // stale news is not news
    out.push({ level: r.level, what: r.headline, why: r.detail, act: r.action, src });
  }
  // Milder things the server noticed itself. They were never sent on their own —
  // this is where they come out. Anything keyed `w:` came from a watcher and is
  // already in OPS.reports above; counting it here too listed it twice.
  for (const [key, a] of Object.entries(OPS.alerts)) {
    if (a.level === 'broken' || !a.text || key.startsWith('w:')) continue;
    out.push({ level: 'watch', what: a.text, src: key });
  }
  return out;
}
function troubleBlock(t) {
  return [t.what, t.why, t.act && `Что делать: ${t.act}`].filter(Boolean).join('\n');
}

function digestTick() {
  try {
    const { date, hour } = barcelonaParts();
    if (hour < DIGEST_HOUR || OPS.lastDigestDate === date) return;
    if (Date.now() < OPS.muteUntil) return;   // deferred: arrives after unmute, not lost
    OPS.lastDigestDate = date;
    const today = isoDate(new Date());
    const apps = OPS.apps.filter(a => a.ts.slice(0, 10) === today).length;
    const bad = troubles();

    const head = `Вечер, ${ruDate(today)}`;
    const table = `${statusText()}\nЗаявки    ${apps ? `${apps} за сегодня` : 'нет'}`;
    const tail = bad.length
      ? bad.map(troubleBlock).join('\n\n')
      : 'За день ничего не потребовало вмешательства.';
    let text = `${head}\n\n${tail}\n\n${table}`;

    if (date.slice(8) === '01') {
      const alive = daysBetween(WORK_BIRTH_DATE, today);
      text += `\n\nРабота живёт ${ruDays(alive)}, с ${ruDate(WORK_BIRTH_DATE)}. `
        + `Она не умирает: до ${ruDays(PAUSE_DAYS)} тишины — пауза, дальше иссыхание, `
        + `полное исчезновение на ${DISAPPEAR_DAYS}-й день. И любой сигнал возвращает её. `
        + `Сейчас тишина — ${ruDays(currentMeta().gapDays)}.`;
    }
    tgSend(text, { silent: true, buttons: menuButtons() });
  } catch (e) { /* the digest must never crash the server */ }
}

// Register the "/" command menu with Telegram (idempotent, refreshed on boot).
function registerBotMenu() {
  tgApi('setMyCommands', { commands: [
    { command: 'sync',   description: 'Спросить кольцо прямо сейчас' },
    { command: 'status', description: 'Как дела у сайта и у картины' },
    { command: '89',     description: 'Проект 89 — последний день' },
    { command: 'apps',   description: 'Заявки WIT36 за неделю' },
    { command: 'deploy', description: 'Какая версия на проде' },
    { command: 'health', description: 'Сырой JSON состояния' },
    { command: 'mute',   description: 'Тишина на N часов, по умолчанию 12' },
    { command: 'unmute', description: 'Вернуть голос' },
  ] });
}

// Incoming bot commands (webhook): typed commands and menu-button taps.
// Only the channel itself or the owner's private chat are answered; everyone
// else is silently ignored.
function tgAuthorized(chat, from) {
  if (!chat) return false;
  const fromChannel = process.env.TG_CHAT_ID && String(chat.id) === String(process.env.TG_CHAT_ID);
  const fromOwner = chat.type === 'private' && process.env.TG_ADMIN_ID
    && String((from || {}).id) === String(process.env.TG_ADMIN_ID);
  return fromChannel || fromOwner;
}
function handleTgUpdate(u) {
  // Menu-button tap (inline keyboard under /status or the digest).
  if (u.callback_query) {
    const cq = u.callback_query;
    const chat = cq.message && cq.message.chat;
    tgApi('answerCallbackQuery', { callback_query_id: cq.id });
    if (!tgAuthorized(chat, cq.from) || typeof cq.data !== 'string' || !cq.data.startsWith('/')) return;
    runCommand(cq.data, chat.id);
    return;
  }
  const msg = u.message || u.channel_post;
  if (!msg || !tgAuthorized(msg.chat, msg.from)) return;
  const text = (msg.text || '').trim();
  if (!text.startsWith('/')) return;
  runCommand(text, msg.chat.id);
}
function runCommand(text, chatId) {
  const parts = text.trim().split(/\s+/);
  const cmd = parts[0].split('@')[0].toLowerCase();
  const reply = (t, o) => tgSend(t, Object.assign({ chatId, isReply: true, silent: true }, o));

  // The morning command. The ring hands the night over when the phone opens it,
  // and until this exists the only answer to "I have just synchronised, why does
  // the site not know" was: wait for the next slot, up to six hours away.
  if (cmd === '/sync') {
    if (STATE.syncing) { reply('Уже спрашиваю, подожди минуту.'); return; }
    reply('Спрашиваю кольцо. Отвечу, когда будет ответ.');
    const before = STATE.lastDataDay;
    sync({ quiet: true }).then((r) => {
      if (!r || !r.ok) { reply(`Не получилось: ${(r && r.reason) || 'нет ответа'}. Следующая попытка сама в ${nextSyncTime()}.`); return; }
      if (r.lastDataDay !== before) {
        reply(`Пришла ночь на ${ruDate(r.lastDataDay)}. Запись — ${ruDays(r.dayCount)}, картина в полном цвете.\n${SITE}/89`, { buttons: menuButtons() });
      } else {
        reply(`Кольцо ответило, нового дня пока нет — последняя ночь всё ещё ${ruDate(r.lastDataDay)}.\n`
          + 'Обычно помогает открыть Oura на телефоне, дождаться, пока приложение допишет ночь, и нажать ещё раз.', { buttons: menuButtons() });
      }
    });
    return;
  }
  if (cmd === '/status') { reply(statusText(), { buttons: menuButtons() }); return; }
  if (cmd === '/89') {
    const m = currentMeta();
    reply(`Проект 89 — вертикальная дневная история.\nПоследняя записанная ночь: ${ruDate(m.lastDataDay)}, всего ${ruDays((STATE.raw || []).length)}.\nСмотреть: ${SITE}/89`);
    return;
  }
  if (cmd === '/deploy') {
    reply(`На проде версия ${BUILD_SHA}, поднята ${ruAgo(Date.now() - BOOT_TIME)}.\nДеплои: dashboard.render.com/web/srv-d7ektha8qa3s73ddeqd0\nКод: github.com/symbioticart/nikolaigrigoriev`);
    return;
  }
  if (cmd === '/apps') {
    const week = OPS.apps.filter(a => Date.now() - Date.parse(a.ts) < 7 * 864e5);
    const lines = week.slice(-20).map(a => `• ${a.ts.slice(0, 16).replace('T', ' ')} — ${a.name} (${a.lang.toUpperCase()})`);
    reply(`Заявки WIT36 за 7 дней: ${week.length}\n${lines.join('\n') || '— пока нет'}\n\nПолные тексты приходят отдельными сообщениями. Считаю с запуска сервера, ${ruAgo(Date.now() - BOOT_TIME)}.`);
    return;
  }
  if (cmd === '/mute') {
    const h = Math.min(Math.max(parseInt(parts[1], 10) || 12, 1), 168);
    OPS.muteUntil = Date.now() + h * 3600e3;
    reply(`Молчу ${h} ч. На команды отвечать продолжу. Вернуть голос: /unmute`);
    return;
  }
  if (cmd === '/unmute') { OPS.muteUntil = 0; reply('Снова на связи.'); return; }
  if (cmd === '/health') { reply(JSON.stringify(healthObj(), null, 1).slice(0, 3800)); return; }
  reply('Что я умею:\n'
    + '/sync — спросить кольцо прямо сейчас\n'
    + '/status — как дела у сайта и у картины\n'
    + '/89 — проект 89\n'
    + '/apps — заявки WIT36\n'
    + '/deploy — что на проде\n'
    + '/health — сырой JSON\n'
    + '/mute [часов] — тишина\n'
    + '/unmute — вернуть голос');
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
// The map above is keyed by caller address and was never emptied: on a process
// that runs for months, every address that ever knocked stayed in memory.
// Sweep the spent ones hourly.
setInterval(() => {
  const now = Date.now();
  for (const ip of Object.keys(wit36Hits)) {
    const live = wit36Hits[ip].filter(t => now - t < 60000);
    if (live.length) wit36Hits[ip] = live; else delete wit36Hits[ip];
  }
}, 3600000).unref?.();
// Deliver each application in full via Telegram — the sole store (reuses the TG_* env).
// Applications are never muted and never dropped: they go straight to the API.
function notifyApplication(rec) {
  const chat = process.env.TG_CHAT_ID;
  if (!chat) return;
  const lang = rec.lang === 'es' ? 'ES' : (rec.lang === 'ca' ? 'CA' : 'EN');
  const text =
    `📨 WITHOUT WITNESS — new application\n` +
    `Name: ${rec.name || '—'}\n` +
    `Email: ${rec.email || '—'}\n` +
    `Link: ${rec.link || '—'}\n` +
    `Language: ${lang}\n` +
    `Consent: ${rec.consent === true ? 'yes' : 'no'}\n` +
    `Submitted: ${rec.ts}\n\n` +
    `Statement:\n${rec.statement || '—'}`;
  tgApi('sendMessage', { chat_id: chat, text, disable_web_page_preview: true });
}

// ---------- upstream HTTP ----------
function apiGet(urlStr) {
  return new Promise((resolve, reject) => {
    const req = https.request(new URL(urlStr),
      { method: 'GET', headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })); });
    req.on('error', reject);
    // Without this a hung connection never settles, sync() never leaves its
    // `finally`, STATE.syncing stays true, and every slot from then on returns
    // "busy" — the record would simply stop advancing and nothing would say why.
    req.setTimeout(60000, () => { req.destroy(new Error('Oura did not answer in 60s')); });
    req.end();
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
  // A page at a time until Oura says there are no more. This used to take the
  // first page only: a window holding more rows than one page lost the rest
  // without a word, and the record was short in a way nothing could see.
  const rows = [];
  let token = null;
  for (let page = 0; page < 200; page++) {
    const url = `https://api.ouraring.com/v2/usercollection/${name}?${qs}` +
                (token ? `&next_token=${encodeURIComponent(token)}` : '');
    const r = await apiGetAuthed(url);
    if (r.status !== 200) throw new Error(`${name} ${r.status}: ${r.body.slice(0,120)}`);
    const j = JSON.parse(r.body);
    if (Array.isArray(j.data)) rows.push(...j.data);
    token = j.next_token;
    if (!token) break;
  }
  return rows;
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

// The record of Variation 91, read from disk once. It is written from the
// archive rather than by the ring sync, which fetches neither activity nor
// stress — so it does not grow, and nothing here has to watch it.
function loadRecord91() {
  if (!STATE.days91) {
    const days = record91Read();
    STATE.days91 = { days, meta: { birth: days[0] && days[0].day, count: days.length,
                                   last: days[days.length - 1] && days[days.length - 1].day, live: false } };
  }
  return STATE.days91;
}

// ---------- raw upstream -> the record of Variation 91 ----------
// That work reads four channels no other one needs: the hour the body fell
// asleep, how far that hour fell from its own, the day's steps, and the seconds
// it spent under strain. Two of them come from collections nothing else here
// asks for, so the record is built and kept apart rather than widening the day
// every other work reads.
function buildDays91(sleepRaw, dailySleep, dailyReady, activityRaw, stressRaw) {
  const dsByDay = Object.fromEntries(dailySleep.map(r => [r.day, r]));
  const rdByDay = Object.fromEntries(dailyReady.map(r => [r.day, r]));
  const acByDay = Object.fromEntries((activityRaw || []).map(r => [r.day, r]));
  const stByDay = Object.fromEntries((stressRaw || []).map(r => [r.day, r]));

  const slByDay = {};
  for (const s of sleepRaw) {
    if (s.type !== 'long_sleep' || !s.day || !s.bedtime_start) continue;
    const cur = slByDay[s.day];
    if (!cur || (s.total_sleep_duration || 0) > (cur.total_sleep_duration || 0)) slByDay[s.day] = s;
  }

  const all = [...new Set([...Object.keys(slByDay), ...Object.keys(dsByDay), ...Object.keys(rdByDay)])].sort();
  const days = [];
  for (const d of all) {
    const sl = slByDay[d], ds = dsByDay[d], rd = rdByDay[d], ac = acByDay[d], st = stByDay[d];
    if (!sl && !rd) continue;
    let bed = null;
    if (sl) {
      // The hour is read where the body slept, not in UTC: falling asleep at one
      // in the morning is one in the morning wherever the ring was. The evening
      // is carried into the negative so that midnight is a continuous point and
      // 23:40 and 00:20 are forty minutes apart, not twenty-three hours.
      const h = +sl.bedtime_start.slice(11, 13) + +sl.bedtime_start.slice(14, 16) / 60;
      bed = +(h >= 12 ? h - 24 : h).toFixed(3);
    }
    days.push({
      day: d,
      hrv:    sl ? sl.average_hrv : null,
      bed,
      timing: ds ? ds.contributors.timing : null,
      steps:  ac ? (ac.steps ?? null) : null,
      stress: st ? (st.stress_high ?? null) : null,
      temp:   rd ? rd.temperature_deviation : null,
    });
  }
  return days;
}

// The growing record lives beside the archive, outside the repository, for the
// same reason the archive does: it is written by the sync, and a file the
// server rewrites has no business in a git history. The copy shipped in the
// repository is the seed — it is what a fresh instance paints from until its
// first sync answers.
// Paths, not constants: ARCHIVE_DIR is settled further down the file, and a
// constant here would read it before it exists.
const record91Path = () => path.join(path.dirname(ARCHIVE_DIR), 'days-91.json');
const seed91Path = () => path.join(__dirname, 'data', 'days-91.json');

function record91Read() {
  for (const f of [record91Path(), seed91Path()]) {
    try { const d = JSON.parse(fs.readFileSync(f, 'utf8')).days; if (d && d.length) return d; }
    catch { /* next */ }
  }
  return [];
}
function record91Write(days, live) {
  try {
    fs.mkdirSync(path.dirname(record91Path()), { recursive: true });
    fs.writeFileSync(record91Path(), JSON.stringify({
      days,
      meta: { birth: days[0] && days[0].day, last: days[days.length - 1] && days[days.length - 1].day,
              live: !!live, count: days.length },
    }));
  } catch (e) { console.warn('[91] write skipped:', e.message); }
}

// ---------- raw upstream -> the night itself ----------
// Archipelago (a third work on this domain) is painted from ONE night, not from
// the day it closed. Every five minutes of sleep becomes a charge whose weight
// is the depth of those minutes and whose radius is the body's recovery in them;
// the painting is the level set of their sum. None of that survives buildDays,
// which reduces a night to fourteen scalars — so the series are kept here
// instead of being thrown away with the rest of the upstream response.
//
// Only the fields the work actually reads are kept. `sleep_phase_30_sec` is not
// among them and is dropped: data the work does not use is not stored.
function buildNights(sleepRaw, spo2Raw, dailyReady) {
  const spo2ByDay = Object.fromEntries((spo2Raw || []).map(r => [r.day, r]));
  const rdByDay = Object.fromEntries((dailyReady || []).map(r => [r.day, r]));

  // Same choice as buildDays: one night per day, the longest sleep of it.
  const slByDay = {};
  for (const s of sleepRaw) {
    if (s.type !== 'long_sleep') continue;
    const cur = slByDay[s.day];
    if (!cur || (s.total_sleep_duration || 0) > (cur.total_sleep_duration || 0)) slByDay[s.day] = s;
  }

  const nights = [];
  for (const day of Object.keys(slByDay).sort()) {
    const s = slByDay[day];
    if (!s.sleep_phase_5_min) continue;         // without the hypnogram there is no painting
    const sp = spo2ByDay[day], rd = rdByDay[day];
    nights.push({
      day,
      bedtime_start: s.bedtime_start, bedtime_end: s.bedtime_end,
      latency: s.latency, efficiency: s.efficiency,
      time_in_bed: s.time_in_bed, tst: s.total_sleep_duration,
      deep: s.deep_sleep_duration, rem: s.rem_sleep_duration,
      light: s.light_sleep_duration, awake: s.awake_time,
      phase5: s.sleep_phase_5_min, move30: s.movement_30_sec || '',
      hrv: (s.hrv && s.hrv.items) || [], hr: (s.heart_rate && s.heart_rate.items) || [],
      hr_int: (s.heart_rate && s.heart_rate.interval) || 300,
      lowest_hr: s.lowest_heart_rate, avg_hrv: s.average_hrv,
      avg_breath: s.average_breath,
      // the ground's grain: how the air of that night behaved
      bdi: sp ? sp.breathing_disturbance_index : null,
      temp_dev: rd ? rd.temperature_deviation : null,   // density of the ink
    });
  }
  return nights;
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

// The nights are their own write-once record, beside the days and under the same
// rule: what was written first stays as written. A night is bulkier than a day —
// two strings and two series — so it lives in its own directory rather than
// swelling every day file of a work that never asked for it.
const NIGHTS_DIR = path.join(path.dirname(ARCHIVE_DIR), 'nights');

function nightsWrite(nights) {
  try {
    fs.mkdirSync(NIGHTS_DIR, { recursive: true });
    for (const n of nights) {
      const f = path.join(NIGHTS_DIR, `${n.day}.json`);
      if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(n));   // write once, never rewrite
    }
  } catch (e) { console.warn('[nights] write skipped:', e.message); }
}

function nightsRead() {
  let written = [];
  try {
    if (fs.existsSync(NIGHTS_DIR)) {
      written = fs.readdirSync(NIGHTS_DIR)
        .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .map(f => JSON.parse(fs.readFileSync(path.join(NIGHTS_DIR, f), 'utf8')))
        .sort((a, b) => a.day < b.day ? -1 : 1);
    }
  } catch (e) { console.warn('[nights] read failed:', e.message); }
  if (written.length) return written;
  // The days had a bundled snapshot to start from and the nights had none, so
  // any instance without the written record — a rehearsal above all — served
  // the work empty and it read as a work that had never begun. A rehearsal
  // that cannot show a work cannot rehearse it.
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'nights.json'), 'utf8'));
    return raw.nights || [];
  } catch (e) { return []; }
}

// Confirmed silence enters the record as DORMANCY, not death (canon, ratified
// 2026-07-23). Every completed calendar day after the last data day, once it is
// clearly past Oura's finalization lag, is written as `<day>.dormant.json`. A
// dormant day is NOT a death: if biometric data later arrives for it, the day
// RESURRECTS — the marker is removed, because the body was alive, the signal was
// only late. The archive of the work holds only true, live-confirmed sleep.
const FINALIZE_LAG_DAYS = 3;   // Oura may take ~2 days to finalize a day; don't call it dormant sooner
function archiveDormancy() {
  if (!STATE.live || !STATE.lastDataDay) return;   // dormancy must be live-confirmed
  try {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    // resurrection sweep: any day that now has real data is alive — drop its dormant marker.
    const alive = new Set((STATE.raw || []).map(d => d.day));
    for (const f of dormantFiles()) {
      const day = f.slice(0, 10);
      if (alive.has(day)) { try { fs.unlinkSync(path.join(ARCHIVE_DIR, f)); console.log('[record] resurrected', day); } catch (e) {} }
    }
    // petrify confirmed dormant days (past the finalization lag, still empty).
    const cutoff = Date.now() - FINALIZE_LAG_DAYS * 864e5;
    for (let t = Date.parse(STATE.lastDataDay) + 864e5; t <= cutoff; t += 864e5) {
      const day = isoDate(new Date(t));
      if (alive.has(day)) continue;
      const fp = path.join(ARCHIVE_DIR, `${day}.dormant.json`);
      if (!fs.existsSync(fp)) fs.writeFileSync(fp, JSON.stringify({ day, dormant: true, recordedAt: new Date().toISOString() }));
    }
  } catch (e) { console.warn('[record] dormancy write skipped:', e.message); }
}
function dormantFiles() {
  try { return fs.readdirSync(ARCHIVE_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.dormant\.json$/.test(f)); }
  catch (e) { return []; }
}

// Before any engine loads, a visitor sees three small paintings — one per work,
// how it stands today — written by the morning job and shipped with the code.
// They can fall behind the record: a deploy that carries the wrong commit, a
// morning job that did not run. For a full day nothing noticed, because the only
// thing that could tell was a browser on GitHub twice a day, and the server
// itself never looked at the file it was serving. Now it does.
let statePaintCache = { at: 0, val: { known: false } };
function statePainting() {
  if (Date.now() - statePaintCache.at < 60000) return statePaintCache.val;
  let val = { known: false, day: null, behind: 0 };
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(dir, 'state', 'index.json'), 'utf8'));
    // The oldest of the three is the honest answer: one stale work is a stale site.
    const painted = Object.values(idx).map(w => w && w.last).filter(Boolean).sort();
    if (painted.length && STATE.lastDataDay) {
      val = { known: true, day: painted[0], behind: Math.max(0, daysBetween(painted[0], STATE.lastDataDay)) };
    }
  } catch (e) { /* no paintings on disk — nothing to judge */ }
  statePaintCache = { at: Date.now(), val };
  return val;
}
// One-time migration: the earlier build wrote `<day>.dead.json`. The work does
// not die — every such marker is a false death; remove them all.
function purgeLegacyDeathMarkers() {
  try {
    for (const f of fs.readdirSync(ARCHIVE_DIR).filter(f => /\.dead\.json$/.test(f))) {
      fs.unlinkSync(path.join(ARCHIVE_DIR, f)); console.log('[record] purged legacy death marker', f);
    }
  } catch (e) { /* nothing to purge */ }
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
  let drift = 0;
  for (const list of sources) {
    for (const d of list) {
      if (!d || !d.day) continue;
      if (!byDay.has(d.day)) byDay.set(d.day, d);
      else if (JSON.stringify(byDay.get(d.day)) !== JSON.stringify(d)) drift++;
    }
  }
  if (drift) console.warn(`[record] upstream drift ignored for ${drift} day(s)`);
  return [...byDay.values()].sort((a, b) => a.day < b.day ? -1 : 1);
}

// ---------- payload ----------
function setDays(rawDays, live) {
  STATE.days = rule.transformDays(rawDays, WORK_OWNER);
  // Variation 89 (a sibling work on this domain, /89) renders from the daily
  // record. Its normalization is now FROZEN causally (rule89) — mirroring 87 —
  // so a past day's painting never drifts as the record grows. The frozen
  // channels are served per-day as day._m at /89/data.json.
  STATE.raw = rawDays;
  // Transported form of 89: {day, _m, _s} per day — no raw metric fields, so the
  // served payload is a fraction of the size and a past day can never drift.
  STATE.days89 = rule89.freezeDays89(rawDays);
  STATE.lastDataDay = rawDays.length ? rawDays[rawDays.length - 1].day : null;
  STATE.live = live;
  // first load sets the baseline silently; only later advances are announced
  if (OPS.lastNotifiedDay === null) OPS.lastNotifiedDay = STATE.lastDataDay;
}

// The clock of silence is true at the moment of the request, not at the
// moment of the last sync.
function currentMeta() {
  const serverDate = isoDate(new Date());
  const gapDays = STATE.lastDataDay ? Math.max(0, daysBetween(STATE.lastDataDay, serverDate)) : 0;
  const status = !STATE.live ? 'record'
    : gapDays <= 1 ? 'fresh'
    : gapDays <= PAUSE_DAYS ? 'paused'
    : gapDays >= DISAPPEAR_DAYS ? 'disappeared'
    : 'dormant';
  return {
    birth: WORK_BIRTH_DATE,
    pauseDays: PAUSE_DAYS,
    disappearDays: DISAPPEAR_DAYS,
    lastDataDay: STATE.lastDataDay, serverDate, gapDays, status,
    live: STATE.live, syncedAt: STATE.lastSync,
    // Where the work's calendar ends today. A silence does not suspend the work
    // — it goes on living through it — so the calendar runs to today. Unless the
    // record is frozen (no confirmed sync): a vendor that has stopped answering
    // must never be painted as a body that has fallen silent. Decided here, in
    // one place, and read by every surface.
    calendarEnd: (STATE.live && STATE.lastDataDay && serverDate > STATE.lastDataDay)
      ? serverDate : STATE.lastDataDay,
  };
}

// Archipelago is fed by the NIGHTS, not by the days, and the two can part ways:
// a ring worn through the day but not through the night keeps the daily record
// advancing while this work has heard nothing. Reporting the daily silence here
// would tell the visitor the work is fresh while it holds a fortnight-old sheet.
// So its clock is its own — same rules, counted from its own last night.
function nightMeta() {
  const m = currentMeta();
  const nights = STATE.nights || [];
  const lastNight = nights.length ? nights[nights.length - 1].day : null;
  if (!lastNight) return Object.assign({}, m, { lastDataDay: null, gapDays: 0, status: 'record' });
  const gapDays = Math.max(0, daysBetween(lastNight, m.serverDate));
  return Object.assign({}, m, {
    birth: nights[0].day,
    lastDataDay: lastNight,
    gapDays,
    status: !STATE.live ? 'record'
      : gapDays <= 1 ? 'fresh'
      : gapDays <= PAUSE_DAYS ? 'paused'
      : gapDays >= DISAPPEAR_DAYS ? 'disappeared'
      : 'dormant',
    calendarEnd: (STATE.live && m.serverDate > lastNight) ? m.serverDate : lastNight,
  });
}

// ---------- sync ----------
// Everything the ring gives, written down raw beside the archive. It runs after
// the record is already served, in the background, and its failures never reach
// the paintings: a work reads the record, not this. What it is for is the days
// that have not happened yet — a signal nobody asks for today cannot be asked
// for retroactively once the day is gone.
const SWEEP_DIR = () => path.join(path.dirname(ARCHIVE_DIR), 'oura');
let sweeping = false;
function sweepLater(full) {
  if (sweeping) return;
  sweeping = true;
  setTimeout(() => {
    sweep({ get: apiGetAuthed, dir: SWEEP_DIR(), birth: WORK_BIRTH_DATE, full,
            log: (m) => console.warn(m) })
      .then((report) => {
        STATE.sweep = { at: new Date().toISOString(), report };
        const added = Object.entries(report).filter(([, v]) => v.added).map(([k, v]) => `${k}+${v.added}`);
        console.log(`[sweep] ${added.length ? added.join(' ') : 'nothing new'}`);
      })
      .catch((e) => { STATE.sweep = { at: new Date().toISOString(), error: e.message }; console.warn('[sweep] failed:', e.message); })
      .finally(() => { sweeping = false; });
  }, 50);
}

async function sync(opts = {}) {
  if (STATE.syncing) return { ok: false, reason: 'busy' };
  if (!ACCESS_TOKEN && !(REFRESH_TOKEN && CLIENT_ID)) { console.warn('[sync] no token configured — serving the record'); return { ok: false, reason: 'no token' }; }
  const full = !!opts.full;
  const before = (STATE.raw || []).length;
  const beforeDay = STATE.lastDataDay;
  STATE.syncing = true;
  try {
    // Full history from the work's birth, pulled in chunks — or just the tail.
    //
    // The tail is one request per collection and it is enough: a day that has
    // been archived is immutable, mergeDays hands it priority over anything
    // fetched, so re-reading four years changes nothing but the bill. The full
    // pull stays for the weekly repair and for every boot, where the archive
    // may be empty and the history has to be rebuilt from Oura.
    const chunks = [];
    const now = new Date();
    let cursor = full
      ? new Date(Date.parse(WORK_BIRTH_DATE))
      : new Date(now.getTime() - (FETCH_CHUNK_DAYS - 1) * 864e5);
    while (cursor < now) {
      const end = new Date(Math.min(now.getTime(), cursor.getTime() + FETCH_CHUNK_DAYS * 864e5));
      chunks.push([isoDate(cursor), isoDate(end)]);
      cursor = new Date(end.getTime() + 864e5);
    }
    console.log(`[sync] ${full ? 'full history' : 'tail'} — ${chunks.length} window(s)`);

    // allSettled per collection: one failing collection (e.g. workout) must
    // not lose the rest of the living record.
    // daily_spo2 joined the list for Archipelago alone: the breathing
    // disturbance index is the amplitude of that work's ground grain. It is the
    // least important collection here — if it fails, allSettled isolates it, the
    // index is null, and the grain sits at its floor. Nothing else notices.
    // daily_activity and daily_stress joined the list for Variation 91 alone:
    // the steps are the area of its daily form, the seconds under strain are its
    // sharp points. Like daily_spo2 they carry one work and nothing else — if
    // they fail, allSettled isolates them and only that work's record waits.
    const COLS = ['sleep', 'daily_sleep', 'daily_readiness', 'workout', 'daily_spo2', 'daily_activity', 'daily_stress'];
    const acc = { sleep: [], daily_sleep: [], daily_readiness: [], workout: [], daily_spo2: [], daily_activity: [], daily_stress: [] };
    const failedCols = new Set();
    let authFailure = null;
    for (const [a, b] of chunks) {
      const qs = `start_date=${a}&end_date=${b}`;
      const settled = await Promise.allSettled(COLS.map(n => fetchCollection(n, qs)));
      settled.forEach((s, i) => {
        if (s.status === 'fulfilled') acc[COLS[i]].push(...s.value);
        else {
          failedCols.add(COLS[i]);
          if (/401|refresh|token/i.test(s.reason && s.reason.message || '')) authFailure = s.reason;
        }
      });
    }
    STATE.perCollection = {};
    COLS.forEach(n => { STATE.perCollection[n] = { ok: !failedCols.has(n), count: acc[n].length }; });
    if (authFailure && failedCols.size === COLS.length) throw authFailure;

    const fetched = buildDays(acc.sleep, acc.daily_sleep, acc.daily_readiness, acc.workout);

    // Priority: the live-written archive is immutable and wins; the live
    // fetch is the source of truth for everything else; the bundled snapshot
    // (which may include locally-converted catalog days with fewer fields)
    // only fills days the living record cannot provide.
    const archived = archiveRead();
    // A tail that comes back empty is a silence, not a failure — the archive
    // still holds the work. Only a pull that finds nothing anywhere is broken,
    // and that is what the full sync at boot is there to catch.
    if (!fetched.length && !archived.length) throw new Error('no days built');
    // But an empty answer from every collection at once is NOT proof of silence,
    // and confirmed silence is what petrifies days as dormant. Oura can answer
    // 200 with nothing in it; treating that as "the body wrote nothing for
    // ninety days" would write ninety false dormant markers into a record whose
    // whole promise is that it holds only true, live-confirmed sleep.
    const emptyAnswer = !fetched.length;
    const rawDays = mergeDays(archived, fetched, snapshotRead());
    // Only live-confirmed days petrify into the immutable archive — and only
    // from a COMPLETE sync: a day fetched while a collection was failing has
    // null fields, and the write-once archive would keep it corrupted forever.
    //
    // Today never petrifies. The morning sync now lands minutes after the ring
    // hands the night over, and Oura keeps writing to a day after it first
    // appears — readiness can post later than sleep. Archived is archived, so a
    // half-written night caught at 09:30 would stay half-written for good. It is
    // still served; it only hardens once the day is behind us.
    const today = isoDate(new Date());
    const fetchedSet = failedCols.size ? new Set() : new Set(fetched.map(d => d.day).filter(d => d < today));
    const alreadySet = new Set(archived.map(d => d.day));
    archiveWrite(rawDays.filter(d => fetchedSet.has(d.day) || alreadySet.has(d.day)));

    // The nights, on the same terms: the written record wins, the live fetch
    // fills what it lacks, and only a night from a complete sleep fetch is
    // allowed to petrify. A night is worthless without its hypnogram, so a
    // failed `sleep` collection bars every write — while a failed daily_spo2
    // only costs the grain, and must not bar them.
    const nightsFetched = buildNights(acc.sleep, acc.daily_spo2, acc.daily_readiness);
    const nightsArchived = nightsRead();
    const nights = mergeDays(nightsArchived, nightsFetched);
    if (!failedCols.has('sleep')) {
      const seen = new Set(nightsArchived.map(n => n.day));
      const fresh = new Set(nightsFetched.map(n => n.day).filter(d => d < today));   // today hardens tomorrow
      nightsWrite(nights.filter(n => fresh.has(n.day) || seen.has(n.day)));
    }
    STATE.nights = nights;

    // The sheet of Variation 91, on the same terms as the nights: what was
    // written first stays as written, the live fetch fills what is missing, and
    // a day is only kept once it is behind us. Nothing is admitted BEFORE the
    // record already begins — a day slipped in under the earliest one would
    // re-cut the silhouette of every day after it, and a day already painted is
    // never repainted.
    const need91 = ['sleep', 'daily_sleep', 'daily_readiness', 'daily_activity', 'daily_stress'];
    if (!need91.some(n => failedCols.has(n))) {
      const written91 = record91Read();
      const floor91 = written91.length ? written91[0].day : null;
      const fetched91 = buildDays91(acc.sleep, acc.daily_sleep, acc.daily_readiness,
                                    acc.daily_activity, acc.daily_stress)
        .filter(d => d.day < today && (!floor91 || d.day >= floor91));
      const merged91 = mergeDays(written91, fetched91);
      if (merged91.length) {
        if (merged91.length !== written91.length) record91Write(merged91, true);
        STATE.days91 = { days: merged91, meta: { birth: merged91[0].day, live: true,
                                                 last: merged91[merged91.length - 1].day, count: merged91.length } };
        if (merged91.length !== written91.length)
          console.log(`[91] record grew ${written91.length} → ${merged91.length} days`);
      }
    }

    setDays(rawDays, emptyAnswer ? STATE.live : true);
    STATE.lastSync = new Date().toISOString();
    sweepLater(full);
    STATE.tokenError = false;
    if (!emptyAnswer) archiveDormancy();   // dormant days petrify; days that got data resurrect (live-confirmed only)

    // self-check: silent degradation is a data malfunction, not slow Oura.
    const reasons = [];
    if (emptyAnswer) reasons.push('Oura answered with no days at all');
    // daily_spo2 is not load-bearing: losing it costs the grain of one work's
    // ground and nothing else. It must not raise an alarm at three in the
    // morning, or the alarm stops meaning anything.
    const SINGLE_WORK_COLS = new Set(['daily_spo2', 'daily_activity', 'daily_stress']);
    const criticalFailed = [...failedCols].filter(n => !SINGLE_WORK_COLS.has(n));
    if (criticalFailed.length) reasons.push('collections failed: ' + criticalFailed.join(','));
    if (rawDays.length < STATE.lastKnownGoodCount) reasons.push(`dayCount ${rawDays.length} < known-good ${STATE.lastKnownGoodCount}`);
    else STATE.lastKnownGoodCount = rawDays.length;
    STATE.degraded = reasons.length > 0;
    STATE.degradedReasons = reasons;

    if (failedCols.size) {
      opsProblem('collections', `Oura отдал не все данные: ${[...failedCols].join(', ')}.\nЧто это значит: сайт работает, картина рисуется, но часть метрик за эти дни могла не записаться.\nЧто делать: ничего, обычно проходит к следующему синку в ${nextSyncTime()}.`);
    } else {
      opsRecovered('collections', 'Данные Oura снова приходят полностью.');
    }
    opsRecovered('sync', 'Связь с Oura восстановилась.');
    opsRecovered('token', 'Авторизация Oura снова работает.');
    if (full) OPS.lastFullSync = STATE.lastSync;

    // A new day in the record is news, and it belongs to the morning frame that
    // carries the painting — not to a second message an hour later saying the
    // same thing in different words. It is announced on its own only when it
    // arrives outside the morning, which means the ring was late.
    const added = rawDays.length - before;
    const advanced = STATE.lastDataDay && beforeDay && STATE.lastDataDay > beforeDay;
    if (advanced && !opts.quiet && barcelonaParts().hour >= 12) {
      tgSend(`Запись догнала себя: ${ruDate(STATE.lastDataDay)} записан, всего ${rawDays.length} дней.\n`
        + `Кольцо отдало этот день позже обычного — утренний кадр его ещё не застал.\n${SITE}/89`, { silent: true });
    }
    if (advanced) OPS.lastNotifiedDay = STATE.lastDataDay;

    const m = currentMeta();
    console.log(`[sync] ${rawDays.length} days (+${added}), last=${m.lastDataDay}, gap=${m.gapDays}d, status=${m.status}${reasons.length ? ' DEGRADED: ' + reasons.join('; ') : ''}`);
    return { ok: true, full, added, advanced, lastDataDay: m.lastDataDay, gapDays: m.gapDays, dayCount: rawDays.length };
  } catch (e) {
    console.error('[sync] failed:', e.message);
    STATE.degraded = true;
    STATE.degradedReasons = ['sync failed: ' + e.message];
    if (/401|refresh|token/i.test(e.message)) {
      STATE.tokenError = true;
      opsProblem('token', 'Oura больше не пускает нас к данным — слетела авторизация.\n'
        + 'Что это значит: новые дни не приходят, сайт показывает сохранённую запись. Картина замерла на последнем записанном дне.\n'
        + 'Что делать: обновить OURA_TOKEN на dashboard.render.com/web/srv-d7ektha8qa3s73ddeqd0 → Environment.', 'broken');
    } else {
      opsProblem('sync', `Не получилось забрать данные из Oura: ${e.message}\n`
        + 'Что это значит: сайт работает и показывает запись, новых дней пока нет.\n'
        + `Что делать: ничего, следующая попытка в ${nextSyncTime()}. Если хочешь раньше — /sync.`);
    }
    if (!STATE.days) loadRecord();
    return { ok: false, reason: e.message };
  } finally {
    STATE.syncing = false;
  }
}

// When the next scheduled sync lands, on Barcelona's clock. Messages used to
// promise "через 6 часов", which stopped being true the moment a deploy moved
// the grid — and it moved on every deploy.
function nextSyncTime() {
  const { hour, minute } = barcelonaParts();
  const nowMinutes = hour * 60 + minute;
  const hh = SYNC_HOURS.find(h => h * 60 + SYNC_MINUTE > nowMinutes);
  return `${String(hh === undefined ? SYNC_HOURS[0] : hh).padStart(2, '0')}:${String(SYNC_MINUTE).padStart(2, '0')}`;
}

// The grid itself: checked every minute against Barcelona, so a restart cannot
// shift it and a daylight-saving change cannot either.
function syncTick() {
  try {
    const { date, hour, minute, weekday } = barcelonaParts();
    // The rest of the hour, not one exact minute: if a sync is already under way
    // at HH:30 — the boot pull, the button, a full history that is taking its
    // time — the slot can still be taken later instead of being lost for six
    // hours. The slot key below makes sure it is taken only once.
    if (!SYNC_HOURS.includes(hour) || minute < SYNC_MINUTE) return;
    const slot = `${date}T${hour}`;
    if (OPS.lastSyncSlot === slot) return;
    if (STATE.syncing) return;   // try again next minute, still inside the window
    OPS.lastSyncSlot = slot;
    const full = weekday === FULL_SYNC_WEEKDAY && hour === SYNC_HOURS[0];
    sync({ full });
  } catch (e) { /* the clock must never take the server down */ }
}

// Everything the outside observer (healthcheck action, /health command) is
// allowed to know: dates, counters, flags. Never the signal itself.
function healthObj() {
  const m = currentMeta();
  const dayCount = (STATE.raw || []).length;
  // `ok` used to be the literal true, so the watcher's first and broadest rule
  // could never fire. It is now earned: the record must be reaching us, the
  // authorisation must hold, nothing may be degraded, and the record must not
  // have shrunk. A server serving a stored record because no token is set is
  // honest but not ok — that is a misconfiguration, and it should say so.
  const hasToken = !!ACCESS_TOKEN;
  const shrunk = dayCount > 0 && dayCount < (STATE.lastKnownGoodCount || 0);
  const ok = hasToken && !!m.live && !STATE.tokenError && !STATE.degraded && !shrunk && dayCount > 0;
  return {
    ok,
    live: m.live,
    status: m.status,
    tokenError: !!STATE.tokenError,
    degraded: !!STATE.degraded,
    degradedReasons: STATE.degradedReasons || [],
    lastDataDay: m.lastDataDay,
    serverDate: m.serverDate,
    gapDays: m.gapDays,
    dayCount,
    lastKnownGoodDayCount: STATE.lastKnownGoodCount || 0,
    dataAdvancing: dayCount > 0 && dayCount >= (STATE.lastKnownGoodCount || 0),
    lastSyncAgeSec: STATE.lastSync ? Math.round((Date.now() - Date.parse(STATE.lastSync)) / 1000) : null,
    syncedAt: STATE.lastSync,
    sweep: STATE.sweep || null,
    perCollection: STATE.perCollection || {},
    dormantDays: dormantFiles().length,
    buildSha: BUILD_SHA,
    uptimeSec: Math.round((Date.now() - BOOT_TIME) / 1000),
    // What a visitor is actually shown before any engine loads, and how far it
    // has fallen behind the record. For a whole day this was the one broken
    // thing on the site and /health had no word for it, so the watcher that
    // reads /health kept reporting green while the site showed the day before
    // yesterday.
    statePaintedDay: statePainting().day,
    stateBehindDays: statePainting().known ? statePainting().behind : null,
    buildCommit: process.env.RENDER_GIT_COMMIT || 'dev',   // the whole hash, so a deploy can prove itself
    nextSyncAt: nextSyncTime(),
    lastFullSyncAt: OPS.lastFullSync,
  };
}

// Cold-start: serve the immutable record, flagged not-live. A silent state is
// NEVER declared from the record alone — silence must be confirmed by a live
// sync, otherwise a sleeping host would show a false death.
function loadRecord() {
  // The nights are read back BEFORE the early return: a live record of days says
  // nothing about the nights, and leaving them null here means the work is
  // served empty on every restart until the next sync — while the site around it
  // looks perfectly healthy. They have no bundled snapshot to fall back on, so
  // if nothing was ever written, Archipelago has nothing to show and says so
  // rather than inventing a night.
  if (!STATE.nights) STATE.nights = nightsRead();
  if (STATE.days && STATE.live) return;
  const rawDays = mergeDays(archiveRead(), snapshotRead());
  if (!rawDays.length) { console.error('[record] empty'); return; }
  setDays(rawDays, false);
  // the on-disk record is trustworthy: seed the shrink self-check so it is
  // not blind right after a restart
  if (rawDays.length > STATE.lastKnownGoodCount) STATE.lastKnownGoodCount = rawDays.length;
  console.log(`[record] loaded (${rawDays.length} days)`);
}

// ---------- HTTP ----------
http.createServer((req, res) => {
  // A rehearsal copy of the site, for looking at a change before it reaches the
  // work. REHEARSAL marks one: it tells every crawler to stay away, so an
  // unfinished state of the work never turns up in a search. Production sets
  // neither and is therefore neither hidden nor gated.
  if (REHEARSAL) res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  // The studio — the artist's own record of every work he has begun, including
  // the ones nobody is meant to see yet and the ones he set aside. It exists
  // only where STUDIO is set, which is his own machine at home. Not behind a
  // password: a door that can be knocked on is a door. Here there is none.
  if (STUDIO && req.url.split('?')[0] === '/studio') { req.url = '/studio.html'; }
  if (/^\/studio(\.html|\.json|\/|$)/.test(req.url.split('?')[0]) && !STUDIO) {
    res.writeHead(404, head({ 'Content-Type': 'text/plain; charset=utf-8' }));
    res.end('Not found');
    return;
  }

  // A password on top of that is optional — set STAGING_AUTH to ask for one.
  // The health report stays open either way, so the watchers can still see it.
  if (STAGING_AUTH) {
    if (req.url.split('?')[0] !== '/health') {
      // The password decides. Set STAGING_AUTH to a bare password and any name
      // opens it; set it as `name:password` and the name is checked too.
      const offered = String(req.headers.authorization || '');
      const given = /^Basic /i.test(offered)
        ? Buffer.from(offered.slice(6), 'base64').toString('utf8') : '';
      const cut = STAGING_AUTH.indexOf(':');
      const wantName = cut === -1 ? null : STAGING_AUTH.slice(0, cut);
      const wantPass = cut === -1 ? STAGING_AUTH : STAGING_AUTH.slice(cut + 1);
      const gcut = given.indexOf(':');
      const gaveName = gcut === -1 ? '' : given.slice(0, gcut);
      const gavePass = gcut === -1 ? given : given.slice(gcut + 1);
      const same = (x, y) => {
        const a = Buffer.from(x), b = Buffer.from(y);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      };
      const ok = same(gavePass, wantPass) && (wantName === null || same(gaveName, wantName));
      if (!ok) {
        res.writeHead(401, head({
          'WWW-Authenticate': 'Basic realm="rehearsal", charset="UTF-8"',
          'Content-Type': 'text/plain; charset=utf-8',
        }));
        res.end('This is the rehearsal copy of the work. It is not for reading.\n');
        return;
      }
    }
  }

  // Telegram webhook — the two-way bot. Guarded by the secret header Telegram
  // echoes back on every delivery; without the env secret the route is dead.
  if (req.method === 'POST' && req.url.split('?')[0] === '/tg/hook') {
    const secret = process.env.TG_WEBHOOK_SECRET;
    const got = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] || ''));
    const want = Buffer.from(secret || '');
    if (!secret || got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
      res.writeHead(403, head({})); res.end(); return;
    }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      res.writeHead(200, head({ 'Content-Type': 'application/json' })); res.end('{"ok":true}');
      try { handleTgUpdate(JSON.parse(body || '{}')); } catch (e) { /* malformed update ignored */ }
    });
    req.on('error', () => {});
    return;
  }

  // Ask the ring now, and answer when it has been asked. The morning painter
  // calls this before it paints: it used to draw from whatever the site happened
  // to hold, and between two sync slots that was always the day before.
  if (req.method === 'POST' && req.url.split('?')[0] === '/ops/sync') {
    const secret = process.env.OPS_SECRET;
    const got = Buffer.from(String(req.headers['x-ops-secret'] || ''));
    const want = Buffer.from(secret || '');
    if (!secret || got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
      res.writeHead(403, head({})); res.end(); return;
    }
    // Asking again a few seconds later cannot tell us anything new, and each ask
    // spends someone else's rate limit. A caller holding the secret is trusted,
    // not licensed to hammer Oura.
    const sinceLast = STATE.lastSync ? Date.now() - Date.parse(STATE.lastSync) : Infinity;
    const answer = (code, obj) => {
      try {
        res.writeHead(code, head({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }));
        res.end(JSON.stringify(obj));
      } catch (e) { /* the caller hung up while we were asking the ring */ }
    };
    if (sinceLast < 60000) { answer(200, { ok: true, skipped: 'asked less than a minute ago', lastDataDay: STATE.lastDataDay }); return; }
    sync({ quiet: true }).then((r) => answer(200, r || { ok: false })).catch(() => answer(500, { ok: false }));
    return;
  }

  // The watchers report here instead of speaking to Telegram themselves.
  //
  // Seven senders wrote into one chat with seven vocabularies and no shared
  // clock: the evening digest said the site was well at 21:00 and a red alarm
  // about the same site arrived at 21:27. Now everything that is not "the site
  // does not answer at all" comes through this door, and one voice decides what
  // is worth saying and when. Uptime keeps its own voice on purpose — it speaks
  // precisely when this door cannot be reached.
  if (req.method === 'POST' && req.url.split('?')[0] === '/ops/report') {
    const secret = process.env.OPS_SECRET;
    const got = Buffer.from(String(req.headers['x-ops-secret'] || ''));
    const want = Buffer.from(secret || '');
    if (!secret || got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
      res.writeHead(403, head({})); res.end(); return;
    }
    // The answer is given AFTER the report has been understood. Answering
    // "ok" first and then dropping a malformed body leaves the sender believing
    // it warned somebody — which is the exact failure this endpoint exists to
    // prevent. Bytes, not characters: a Russian headline is two bytes a letter.
    const chunks = []; let size = 0; let answered = false;
    const say = (code, obj) => {
      if (answered) return;
      answered = true;
      try { res.writeHead(code, head({ 'Content-Type': 'application/json' })); res.end(JSON.stringify(obj)); }
      catch (e) { /* the sender hung up */ }
    };
    req.setTimeout(15000, () => { say(408, { ok: false, error: 'took too long to send' }); req.destroy(); });
    req.on('data', (c) => {
      size += c.length;
      // Say 413 first and only then hang up: destroying the request means `end`
      // never fires, so a refusal written in the end handler would never be sent
      // and the sender would see a dropped connection instead of a reason.
      if (size > 65536) { say(413, { ok: false, error: 'report too large' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (answered) return;
      try {
        const d = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!d || typeof d !== 'object' || Array.isArray(d)) { say(400, { ok: false, error: 'not a report' }); return; }
        if (d.level && !['broken', 'watch', 'ok'].includes(d.level)) { say(400, { ok: false, error: 'unknown level' }); return; }
        if (d.level !== 'ok' && !String(d.headline || '').trim()) { say(400, { ok: false, error: 'a report needs a headline' }); return; }
        const source = String(d.source || 'watcher').slice(0, 40);
        const level = ['broken', 'watch', 'ok'].includes(d.level) ? d.level : 'watch';
        const rec = {
          level,
          headline: String(d.headline || '').slice(0, 400),
          detail: String(d.detail || '').slice(0, 800),
          action: String(d.action || '').slice(0, 400),
          runUrl: String(d.runUrl || '').slice(0, 300),
          at: new Date().toISOString(),
        };
        OPS.reports[source] = rec;
        // There are five watchers. A caller that invents new names — a mistake in
        // a workflow as easily as anything else — must not grow this map forever
        // on a process that runs for months.
        const names = Object.keys(OPS.reports);
        if (names.length > 20) {
          names.sort((a, b) => Date.parse(OPS.reports[a].at) - Date.parse(OPS.reports[b].at));
          for (const stale of names.slice(0, names.length - 20)) {
            delete OPS.reports[stale];
            delete OPS.alerts[`w:${stale}`];
          }
        }
        console.log(`[ops] ${source} → ${level}: ${rec.headline}`);
        if (level === 'ok') opsRecovered(`w:${source}`, rec.headline || 'Проверка снова проходит.');
        else opsProblem(`w:${source}`, troubleBlock({ what: rec.headline, why: rec.detail, act: rec.action }), level);
        // Only now. A watcher that is told "ok" has been told its warning
        // reached somebody, and that has to be true — this endpoint exists
        // because warnings were being lost.
        say(200, { ok: true });
      } catch (e) { say(500, { ok: false, error: 'the report was not filed' }); }
    });
    req.on('error', () => {});
    return;
  }

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
      OPS.apps.push({ ts: rec.ts, name: rec.name, lang: rec.lang });   // /apps counter (in-memory)
      if (OPS.apps.length > 200) OPS.apps.shift();
      res.writeHead(200, head({ 'Content-Type': 'application/json' })); res.end('{"ok":true}');
    });
    req.on('error', () => { try { res.writeHead(400); res.end(); } catch (e) {} });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, head({})); res.end('Method Not Allowed'); return; }

  let url = req.url.split('?')[0];

  // Ops heartbeat (GitHub Action + /health bot command). Dates and counters
  // only — no biometric signal ever leaves.
  if (url === '/health') {
    res.writeHead(200, head({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }));
    res.end(JSON.stringify(healthObj()));
    return;
  }

  // /wit36 — WITHOUT WITNESS (a participatory work; MONOMO). Same origin.
  if (url === '/wit36' || url === '/wit36/') url = '/wit36/index.html';
  if (url === '/wit36/terms' || url === '/wit36/terms/') url = '/wit36/terms.html';
  if (url === '/wit36/es' || url === '/wit36/es/') url = '/wit36/es.html';
  if (url === '/wit36/es/terms' || url === '/wit36/es/terms/') url = '/wit36/es/terms.html';

  // What each work needs to label itself — its birth, where its calendar ends
  // today, which days the body wrote. A few kilobytes, so a visitor gets the
  // dates and the arrows without waiting on a painting engine to announce them.
  if (url === '/state/meta.json') {
    if (!STATE.days) loadRecord();
    const m = currentMeta();
    const alive87 = (STATE.days || []).map(d => d.d);
    const alive89 = (STATE.days89 || []).map(d => d.day);
    const common = { birth: m.birth, last: m.calendarEnd, lastData: m.lastDataDay };
    // The shape of a work is its canvas, and the canvas is described once, in
    // works.json. Repeating the numbers here is how a work ends up a different
    // shape depending on which file you ask.
    const ratio = (id) => {
      const c = (WORKS_REGISTRY[id] || {}).canvas;
      return c ? c.w / c.h : 1;
    };
    // Archipelago is alive only on the nights it actually has — a day the ring
    // recorded without a hypnogram is not a night this work can paint, and must
    // not appear in its calendar as though it were.
    const nights = STATE.nights || [];
    const nm = nightMeta();
    // Variation 91 keeps its own record, so its calendar begins where that
    // record begins, not where the daily one does. The calendar still ends
    // today: otherwise the days of silence never exist and the sheet can never
    // be seen fading.
    const days91 = loadRecord91().days || [];
    serveJSON(req, res, {
      '87': Object.assign({}, common, { ratio: ratio('87'), alive: alive87,
        incomplete: (STATE.days || []).filter(d => d.i === 1).map(d => d.d) }),
      '89': Object.assign({}, common, { ratio: ratio('89'), alive: alive89, incomplete: [] }),
      'archipelago': Object.assign({}, common, {
        ratio: ratio('archipelago'),
        birth: nm.birth,
        last: nm.calendarEnd, lastData: nm.lastDataDay,
        alive: nights.map(n => n.day),
        // an hour of sleep is too little to be a night; it is marked, not hidden
        incomplete: nights.filter(n => (n.tst || 0) < 3600).map(n => n.day),
      }),
      '92': Object.assign({}, common, {
        ratio: ratio('92'),
        birth: days91.length ? days91[0].day : m.birth,
        last: m.calendarEnd,
        lastData: days91.length ? days91[days91.length - 1].day : null,
        alive: days91.map(d => d.day),
        incomplete: [],
      }),
      '91': Object.assign({}, common, {
        ratio: ratio('91'),
        birth: days91.length ? days91[0].day : m.birth,
        last: m.calendarEnd,
        lastData: days91.length ? days91[days91.length - 1].day : null,
        alive: days91.map(d => d.day),
        incomplete: [],
      }),
    });
    return;
  }
  if (url === '/data/days.json') {
    if (!STATE.days) loadRecord();
    serveJSON(req, res, STATE.days
      ? { days: STATE.days, meta: currentMeta() }
      : { days: [], meta: { status: 'record', live: false } });
    return;
  }
  // Only the work's own surfaces are served. The raw record, the rule, the
  // server source, and every working file stay sealed.
  // ── Variation 89 (vertical daily story) — its own data contract ──
  if (url === '/89/data.json') {
    if (!STATE.days) loadRecord();
    // Serve the transported form {day, _m, _s} — the painter renders from a
    // fixed input (no global sort, no drift) and the raw body never leaves.
    serveJSON(req, res, { days: STATE.days89 || [], meta: currentMeta() });
    return;
  }
  // ── Variation 91 — the accumulating sheet, its own record ──
  // Its rule reads four channels no other work needs (the hour of falling
  // asleep, how far that hour fell from its own, the day's steps, the seconds
  // the body spent under strain), so it keeps its own file rather than widening
  // the record every other work reads. The file is written from the archive and
  // does not yet grow: the ring sync fetches neither activity nor stress.
  // Обе работы читают одну запись: у S5-04 то же тело и те же шесть каналов,
  // расходятся они правилом, а не тем, что видят.
  if (url === '/91/data.json' || url === '/92/data.json') {
    serveJSON(req, res, loadRecord91());
    return;
  }
  // ── Archipelago — the night itself, its own data contract ──
  // A night is bulky, so the window is the recent past by default and the whole
  // record only on request: a visitor opening the work should not pay for four
  // years of nights to see one.
  if (url === '/archipelago/data.json') {
    if (!STATE.nights) loadRecord();
    const all = STATE.nights || [];
    const q = new URL(req.url, 'http://x').searchParams;
    const nights = q.get('all') === '1' ? all : all.slice(-NIGHT_WINDOW);
    serveJSON(req, res, { nights, meta: Object.assign({}, nightMeta(), {
      total: all.length, windowed: nights.length < all.length,
    }) });
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
  // ── Portfolio front-end surfaces (the site's new root): stylesheet + shared
  //    JS under /assets, and the isolated painter iframes + shared p5 under /art.
  //    The live paintings still read /data/days.json and /89/data.json above. ──
  // `state/` holds one small ready-made image per work — how it stands today —
  // so a visitor sees the paintings before any engine has loaded.
  // The registry itself, for the painting host and anyone else who asks.
  if (url === '/works.json') {
    serveJSON(req, res, WORKS_REGISTRY);
    return;
  }
  // What the studio knows: who the works are, and where each one stands in the
  // artist's own work. The second half is read fresh on every request, because
  // he edits it by hand while the page is open — and it is never written to,
  // because a record of one's own work is written by the one whose work it is.
  if (url === '/studio.json') {
    let studio = {};
    try { studio = JSON.parse(fs.readFileSync(STUDIO_FILE, 'utf8')); delete studio._; }
    catch (e) { /* no private record yet — the registry alone still says plenty */ }
    const out = {};
    const ids = new Set([...Object.keys(WORKS_REGISTRY), ...Object.keys(studio)]);
    for (const id of ids) {
      const w = WORKS_REGISTRY[id] || {};
      const s = studio[id] || {};
      out[id] = {
        title: w.title || id,
        medium: w.medium || '',
        // A work with no entry in the registry is one that has only just been
        // begun; it stands where the artist says it stands.
        standing: s.standing || (w.selected ? 'selected' : w.listed ? 'shown' : w.title ? 'watched' : 'begun'),
        branch: s.branch || 'main',
        begun: s.begun || '',
        note: s.note || '',
        hasPainter: !!(w.engine && w.engine.painter),
        hasRule: !!(w.rule && (w.rule.seed || w.rule.laws)),
      };
    }
    serveJSON(req, res, out);
    return;
  }
  // The documents that constitute the works. Read by the page that prints them
  // and by each work's own page, which takes its description from the first
  // section rather than keeping a second copy of it.
  if (url === '/certificates.json') {
    serveFile(req, res, path.join(dir, 'certificates.json'),
      'application/json; charset=utf-8', 'no-cache');
    return;
  }
  // The shared script carries the registry inside it, so no page has to wait a
  // round trip to learn which works exist. The validator covers both files:
  // change the registry and the script is re-fetched.
  if (url === '/assets/site.js') {
    const fp = path.join(dir, 'assets/site.js');
    fs.stat(fp, (e, st) => {
      if (e) { res.writeHead(404, head({})); res.end('Not found'); return; }
      const etag = 'W/"' + st.size.toString(36) + '-' + Math.round(st.mtimeMs).toString(36) + '-' + WORKS_STAMP + '"';
      const h = head({ 'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache', 'ETag': etag });
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
      fs.readFile(fp, 'utf8', (err, body) => {
        if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
        res.writeHead(200, h);
        res.end('window.__WORKS=' + WORKS_JSON + ';\n' + body);
      });
    });
    return;
  }
  if (/^\/(assets|art|state)\//.test(url)) {
    const subExt = path.extname(url).toLowerCase();
    const SUB_OK = new Set(['.html', '.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff2', '.json', '.map', '.webp']);
    if (!SUB_OK.has(subExt)) { res.writeHead(404, head({})); res.end('Not found'); return; }
    const fp = path.join(dir, decodeURIComponent(url));
    if (!fp.startsWith(dir)) { res.writeHead(404, head({})); res.end('Not found'); return; }
    // Vendored p5 and the woff2 fonts never change (a swap would carry a new
    // path) → cache them hard. Our own painters / css / render host stay
    // `no-cache` but now revalidate cheaply via the ETag serveFile adds.
    // A painted day under /state/archive/ can never change — the work forbids
    // repainting a day that has ended — so it is cached for a year and served
    // from the edge thereafter. The pointer file and the manifest DO change,
    // daily, and stay on revalidation.
    const immutable = subExt === '.woff2'
      || /^\/art\/lib\/p5\.min\.js(\.map)?$/.test(url)
      || /^\/state\/archive\//.test(url);
    const cache = immutable ? 'public, max-age=31536000, immutable' : 'no-cache';
    serveFile(req, res, fp, mimeTypes[subExt] || 'text/plain', cache);
    return;
  }
  // Plain-text surfaces a crawler expects to find at the root. A rehearsal
  // turns them away at the door as well as in the header — the two ways a
  // crawler asks, answered the same.
  if (REHEARSAL && url === '/robots.txt') {
    res.writeHead(200, head({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }));
    res.end('User-agent: *\nDisallow: /\n');
    return;
  }
  // The map of the site is drawn from the registry, not kept by hand. A work
  // that is listed is on the map the moment it is listed — this was the last
  // place a work's existence had to be typed out a second time.
  if (url === '/sitemap.xml') {
    const home = 'https://nikolaigrigoriev.com';
    const u = (loc, freq) => `  <url><loc>${home}${loc}</loc><changefreq>${freq}</changefreq></url>`;
    const lines = [
      `  <url><loc>${home}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      u('/works.html', 'monthly'),
    ];
    for (const [id, w] of Object.entries(WORKS_REGISTRY)) {
      if (!w.listed) continue;
      const q = encodeURIComponent(id);
      // One page per work: the work, its caption, its every day, its documents.
      lines.push(u(`/archive.html?id=${q}`, 'daily'));
      lines.push(u(`/rule.html?id=${q}`, 'yearly'));
    }
    lines.push(u('/conditions.html', 'yearly'), u('/about.html', 'monthly'));
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + lines.join('\n') + '\n</urlset>\n';
    res.writeHead(200, head({ 'Content-Type': 'application/xml', 'Cache-Control': 'no-cache' }));
    res.end(xml);
    return;
  }
  if (url === '/robots.txt') {
    const f = url.slice(1);
    const mime = f.endsWith('.xml') ? 'application/xml' : 'text/plain; charset=utf-8';
    serveFile(req, res, path.join(dir, f), mime, 'public, max-age=3600');
    return;
  }
  // A mark for the browser tab: the same ink dot the certificate carries.
  if (url === '/favicon.ico' || url === '/favicon.svg') {
    fs.readFile(path.join(dir, 'favicon.svg'), (err, data) => {
      if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
      res.writeHead(200, head({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=604800' }));
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
    '/index.html', '/works.html', '/work.html', '/about.html', '/archive.html',
    '/rule.html', '/conditions.html',
    // Only reachable at all where STUDIO is set — the guard at the top of the
    // router refuses it everywhere else, before this list is ever consulted.
    ...(STUDIO ? ['/studio.html'] : []),
    '/painter.js', '/p5.oil.js', '/p5.oil.js.map',
    '/vendor/p5.min.js',
    '/fonts/manrope-latin.woff2', '/fonts/jetbrainsmono-latin.woff2',
    // The picture a shared link shows. It existed and was unreachable.
    '/og.jpg',
  ]);
  if (!SERVED.has(url)) {
    // A person who mistyped an address deserves a page, not the word "Not
    // found"; anything that is plainly not a page keeps the bare answer.
    if (!path.extname(url) || url.endsWith('.html')) {
      fs.readFile(path.join(dir, '404.html'), (err, page) => {
        if (err) { res.writeHead(404, head({})); res.end('Not found'); return; }
        res.writeHead(404, head({ 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' }));
        res.end(page);
      });
      return;
    }
    res.writeHead(404, head({})); res.end('Not found'); return;
  }
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
  // Legacy cache-buster kept only for the old certificate page. The portfolio
  // pages must NOT clear cache on every load — that would drop the 948 KB p5 lib.
  const extra = (url === '/conditions.html') ? { 'Clear-Site-Data': '"cache"' } : {};
  if (ext === '.html') { servePage(req, res, filePath, cache, extra); return; }
  serveFile(req, res, filePath, mimeTypes[ext] || 'text/plain', cache, extra);
}).listen(port, () => {
  console.log(`Variations 87 — http://localhost:${port}`);
  restoreRefreshToken();
  purgeLegacyDeathMarkers();   // the work does not die — remove any `<day>.dead.json`
  loadRecord();          // serve the record immediately
  // The whole history on boot: the disk may be new, and this is the only moment
  // the archive can be rebuilt from Oura. Every later sync takes the tail.
  sync({ full: true, quiet: true });
  setInterval(syncTick, 60e3);     // 03:30 / 09:30 / 15:30 / 21:30 Barcelona
  // A restart after the digest hour must not re-send today's digest — and a
  // restart inside a sync minute must not re-run the sync it just did on boot.
  const bcn = barcelonaParts();
  if (bcn.hour >= DIGEST_HOUR) OPS.lastDigestDate = bcn.date;
  if (SYNC_HOURS.includes(bcn.hour) && bcn.minute >= SYNC_MINUTE) OPS.lastSyncSlot = `${bcn.date}T${bcn.hour}`;
  setInterval(digestTick, 60e3);   // evening digest, 21:00 Barcelona
  registerBotMenu();
});
