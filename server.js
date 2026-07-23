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

const dir  = __dirname;
const port = process.env.PORT || 3457;

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
  // record by its own older rule; it is served the record at /89/data.json.
  STATE.raw = rawDays;
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

    // allSettled per collection: one failing collection (e.g. workout) must
    // not lose the rest of the living record.
    const COLS = ['sleep', 'daily_sleep', 'daily_readiness', 'workout'];
    const acc = { sleep: [], daily_sleep: [], daily_readiness: [], workout: [] };
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

    setDays(rawDays, true);
    STATE.lastSync = new Date().toISOString();
    STATE.tokenError = false;
    archiveDormancy();   // dormant days petrify; days that got data resurrect (live-confirmed only)

    // self-check: silent degradation is a data malfunction, not slow Oura.
    const reasons = [];
    if (failedCols.size) reasons.push('collections failed: ' + [...failedCols].join(','));
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
  return {
    ok: true,
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
