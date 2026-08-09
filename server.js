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
// Set only on the rehearsal copy: "name:password". Production leaves it unset.
const STAGING_AUTH = process.env.STAGING_AUTH || '';



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

const SYNC_INTERVAL = 6 * 60 * 60 * 1000;   // re-sync every 6h
const NIGHT_WINDOW  = 200;                  // nights served without ?all=1
const FETCH_CHUNK_DAYS = 90;                // API pull window per request

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
  lastDigestDate: null,  // Madrid date of the last evening digest
  lastNotifiedDay: null, // last data day announced to the channel
  apps: [],              // wit36 applications since boot: { ts, name, lang }
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
function menuButtons() {
  return [
    [{ text: '🔄 Статус', callback_data: '/status' }, { text: '🎨 Проект 89', callback_data: '/89' }],
    [{ text: '📨 Заявки', callback_data: '/apps' }, { text: '🚀 Деплой', callback_data: '/deploy' }, { text: '🔇 12ч', callback_data: '/mute' }],
  ];
}
function opsProblem(key, text) {
  const now = Date.now(), a = OPS.alerts[key];
  if (now < OPS.muteUntil) return;   // muted: don't mark as announced — it will fire after unmute
  if (!a) { OPS.alerts[key] = { since: now, lastSent: now }; tgSend(text); return; }
  if (now - a.lastSent > 48 * 3600e3) { a.lastSent = now; tgSend(`${text}\n\n(проблема держится уже ${ruDur(now - a.since)})`); }
}
function opsRecovered(key, text) {
  const a = OPS.alerts[key];
  if (!a) return;
  delete OPS.alerts[key];
  tgSend(`${text} (длилось ${ruDur(Date.now() - a.since)})`);
}

// One honest paragraph about the whole system — reused by /status and the digest.
function statusText() {
  const m = currentMeta();
  const dayCount = (STATE.raw || []).length;
  const stateWord = m.status === 'paused' ? `картина на паузе, замерла (${m.gapDays} дн. без сигнала)`
    : m.status === 'dormant' ? `картина засыхает — ${m.gapDays} дн. без сигнала`
    : m.status === 'disappeared' ? `картина исчезла (${m.gapDays} дн.) — умерла, но не стёрлась: вернётся со швом, как только придут данные`
    : '';
  const gapLine = m.gapDays <= 1
    ? 'данные свежие'
    : `${stateWord}. Открой приложение Oura на телефоне, дай кольцу синхронизироваться — картина возродится`;
  const syncLine = STATE.tokenError ? '🔴 авторизация слетела, нужен новый токен'
    : STATE.lastSync ? `ок, ${ruAgo(Date.now() - Date.parse(STATE.lastSync))}`
    : 'живой синк ещё не проходил' + (STATE.live ? '' : ' — показываю сохранённую запись');
  const probs = Object.keys(OPS.alerts).length;
  return [
    `${probs ? '🟡' : '🟢'} Сайт работает — nikolaigrigoriev.com`,
    `• Запись: ${dayCount} дней, последний — ${ruDate(m.lastDataDay)} (${gapLine})`,
    `• Синк Oura: ${syncLine}`,
    `• Версия: ${BUILD_SHA}, аптайм ${ruDur(Date.now() - BOOT_TIME)}`,
    `• Состояние работы: ${m.status}` + (m.status === 'dormant' ? ` — до полного исчезновения ещё ${DISAPPEAR_DAYS - m.gapDays} дн. (сигнал вернёт её)` : ''),
  ].join('\n');
}

// Evening digest: one quiet message at 21:00 Europe/Madrid instead of noise.
const DIGEST_HOUR = parseInt(process.env.OPS_DIGEST_HOUR || '21', 10);
function madridParts() {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());
  return { date: s.slice(0, 10), hour: +s.slice(11, 13) };
}
function digestTick() {
  try {
    const { date, hour } = madridParts();
    if (hour < DIGEST_HOUR || OPS.lastDigestDate === date) return;
    if (Date.now() < OPS.muteUntil) return;   // deferred: arrives after unmute, not lost
    OPS.lastDigestDate = date;
    const today = new Date().toISOString().slice(0, 10);
    let text = `Вечерняя сводка\n${statusText()}\n• Заявок WIT36 сегодня: ${OPS.apps.filter(a => a.ts.slice(0, 10) === today).length}`;
    if (date.slice(8) === '01') {
      const alive = daysBetween(WORK_BIRTH_DATE, isoDate(new Date()));
      text += `\n\n🕰 Работа живёт ${alive} дней (с ${ruDate(WORK_BIRTH_DATE)}). После ${DISAPPEAR_DAYS} дней тишины подряд картина исчезает — умирает, но не стирается: любой сигнал (твой, потомка, другого человека) возрождает её со швом каждого сна. Сейчас тишина — ${currentMeta().gapDays} дн.`;
    }
    tgSend(text, { silent: true, buttons: menuButtons() });
  } catch (e) { /* the digest must never crash the server */ }
}

// Register the "/" command menu with Telegram (idempotent, refreshed on boot).
function registerBotMenu() {
  tgApi('setMyCommands', { commands: [
    { command: 'status', description: 'Как дела у сайта' },
    { command: '89',     description: 'Проект 89 — последний день' },
    { command: 'deploy', description: 'Какая версия на проде' },
    { command: 'apps',   description: 'Заявки WIT36 за неделю' },
    { command: 'health', description: 'Сырой JSON состояния' },
    { command: 'mute',   description: 'Тишина на N часов (по умолч. 12)' },
    { command: 'unmute', description: 'Включить уведомления' },
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

  if (cmd === '/status') { reply(statusText(), { buttons: menuButtons() }); return; }
  if (cmd === '/89') {
    const m = currentMeta();
    reply(`🎨 Проект 89 — вертикальная дневная история.\nПоследний записанный день: ${ruDate(m.lastDataDay)} (№${(STATE.raw || []).length}).\nСмотреть: ${SITE}/89`);
    return;
  }
  if (cmd === '/deploy') {
    reply(`🚀 На проде версия ${BUILD_SHA}, запущена ${ruAgo(Date.now() - BOOT_TIME)}.\nДеплои: dashboard.render.com/web/srv-d7ektha8qa3s73ddeqd0\nКод: github.com/symbioticart/nikolaigrigoriev`);
    return;
  }
  if (cmd === '/apps') {
    const week = OPS.apps.filter(a => Date.now() - Date.parse(a.ts) < 7 * 864e5);
    const lines = week.slice(-20).map(a => `• ${a.ts.slice(0, 16).replace('T', ' ')} — ${a.name} (${a.lang.toUpperCase()})`);
    reply(`📨 Заявки WIT36 за 7 дней: ${week.length}\n${lines.join('\n') || '— пока нет'}\n\nПолные тексты приходят в канал отдельными сообщениями. Считаю с запуска сервера (${ruAgo(Date.now() - BOOT_TIME)}).`);
    return;
  }
  if (cmd === '/mute') {
    const h = Math.min(Math.max(parseInt(parts[1], 10) || 12, 1), 168);
    OPS.muteUntil = Date.now() + h * 3600e3;
    reply(`🔇 Молчу ${h} ч. Отвечать на команды продолжу. Вернуть голос: /unmute`);
    return;
  }
  if (cmd === '/unmute') { OPS.muteUntil = 0; reply('🔊 Снова на связи — уведомления включены.'); return; }
  if (cmd === '/health') { reply(JSON.stringify(healthObj(), null, 1).slice(0, 3800)); return; }
  reply('Команды:\n/status — как дела у сайта\n/89 — проект 89\n/deploy — что на проде\n/apps — заявки WIT36\n/health — сырой JSON\n/mute [часов] — тишина\n/unmute — включить уведомления');
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
  try {
    if (!fs.existsSync(NIGHTS_DIR)) return [];
    return fs.readdirSync(NIGHTS_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => JSON.parse(fs.readFileSync(path.join(NIGHTS_DIR, f), 'utf8')))
      .sort((a, b) => a.day < b.day ? -1 : 1);
  } catch (e) { console.warn('[nights] read failed:', e.message); return []; }
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

    // allSettled per collection: one failing collection (e.g. workout) must
    // not lose the rest of the living record.
    // daily_spo2 joined the list for Archipelago alone: the breathing
    // disturbance index is the amplitude of that work's ground grain. It is the
    // least important collection here — if it fails, allSettled isolates it, the
    // index is null, and the grain sits at its floor. Nothing else notices.
    const COLS = ['sleep', 'daily_sleep', 'daily_readiness', 'workout', 'daily_spo2'];
    const acc = { sleep: [], daily_sleep: [], daily_readiness: [], workout: [], daily_spo2: [] };
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
    if (!fetched.length) throw new Error('no days built');

    // Priority: the live-written archive is immutable and wins; the live
    // fetch is the source of truth for everything else; the bundled snapshot
    // (which may include locally-converted catalog days with fewer fields)
    // only fills days the living record cannot provide.
    const archived = archiveRead();
    const rawDays = mergeDays(archived, fetched, snapshotRead());
    // Only live-confirmed days petrify into the immutable archive — and only
    // from a COMPLETE sync: a day fetched while a collection was failing has
    // null fields, and the write-once archive would keep it corrupted forever.
    const fetchedSet = failedCols.size ? new Set() : new Set(fetched.map(d => d.day));
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
      const fresh = new Set(nightsFetched.map(n => n.day));
      nightsWrite(nights.filter(n => fresh.has(n.day) || seen.has(n.day)));
    }
    STATE.nights = nights;

    setDays(rawDays, true);
    STATE.lastSync = new Date().toISOString();
    STATE.tokenError = false;
    archiveDormancy();   // dormant days petrify; days that got data resurrect (live-confirmed only)

    // self-check: silent degradation is a data malfunction, not slow Oura.
    const reasons = [];
    // daily_spo2 is not load-bearing: losing it costs the grain of one work's
    // ground and nothing else. It must not raise an alarm at three in the
    // morning, or the alarm stops meaning anything.
    const criticalFailed = [...failedCols].filter(n => n !== 'daily_spo2');
    if (criticalFailed.length) reasons.push('collections failed: ' + criticalFailed.join(','));
    if (rawDays.length < STATE.lastKnownGoodCount) reasons.push(`dayCount ${rawDays.length} < known-good ${STATE.lastKnownGoodCount}`);
    else STATE.lastKnownGoodCount = rawDays.length;
    STATE.degraded = reasons.length > 0;
    STATE.degradedReasons = reasons;

    if (failedCols.size) {
      opsProblem('collections', `🟡 Oura отдал не все данные (${[...failedCols].join(', ')}). Сайт работает, но часть метрик могла не записаться. Обычно чинится само к следующему синку — через 6 часов.`);
    } else {
      opsRecovered('collections', '🟢 Все данные Oura снова приходят полностью.');
    }
    opsRecovered('sync', '🟢 Синхронизация с Oura восстановилась — данные снова идут.');
    opsRecovered('token', '🟢 Авторизация Oura снова работает.');

    // Announce a new recorded day (quiet message — news, not an alarm).
    if (STATE.lastDataDay && OPS.lastNotifiedDay && STATE.lastDataDay > OPS.lastNotifiedDay) {
      OPS.lastNotifiedDay = STATE.lastDataDay;
      tgSend(`🎨 Новый день в записи — ${ruDate(STATE.lastDataDay)} (день №${rawDays.length}).\nКартины обновились: ${SITE} и ${SITE}/89`, { silent: true });
    }

    const m = currentMeta();
    console.log(`[sync] ${rawDays.length} days, last=${m.lastDataDay}, gap=${m.gapDays}d, status=${m.status}${reasons.length ? ' DEGRADED: ' + reasons.join('; ') : ''}`);
  } catch (e) {
    console.error('[sync] failed:', e.message);
    STATE.degraded = true;
    STATE.degradedReasons = ['sync failed: ' + e.message];
    if (/401|refresh|token/i.test(e.message)) {
      STATE.tokenError = true;
      opsProblem('token', '🔴 Слетела авторизация Oura — новые данные не приходят, сайт показывает сохранённую запись.\nЧто делать: обновить OURA_TOKEN — dashboard.render.com/web/srv-d7ektha8qa3s73ddeqd0 → Environment.');
    } else {
      opsProblem('sync', `🟡 Не получилось забрать данные из Oura: ${e.message}\nСайт работает и показывает запись. Следующая попытка — через 6 часов.`);
    }
    if (!STATE.days) loadRecord();
  } finally {
    STATE.syncing = false;
  }
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
    perCollection: STATE.perCollection || {},
    dormantDays: dormantFiles().length,
    buildSha: BUILD_SHA,
    uptimeSec: Math.round((Date.now() - BOOT_TIME) / 1000),
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
  // work. Setting STAGING_AUTH turns any instance into one: it asks for a name
  // and a password, and it tells every crawler to stay away. Production never
  // sets it and is therefore never gated. The health report stays open so the
  // watchers can still see it.
  if (STAGING_AUTH) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    if (req.url.split('?')[0] !== '/health') {
      // A password is enough. Set STAGING_AUTH to a bare password and any name
      // opens it; set it as `name:password` and the name is checked too. The
      // browser asks for both either way — that is its dialog, not our demand.
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
  // Plain-text surfaces a crawler expects to find at the root.
  if (url === '/robots.txt' || url === '/sitemap.xml') {
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
  sync();                // then pull the living history
  setInterval(sync, SYNC_INTERVAL);
  // A restart after the digest hour must not re-send today's digest.
  const mp = madridParts();
  if (mp.hour >= DIGEST_HOUR) OPS.lastDigestDate = mp.date;
  setInterval(digestTick, 60e3);   // evening digest, 21:00 Europe/Madrid
  registerBotMenu();
});
