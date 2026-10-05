#!/usr/bin/env node
// === Вариация 89 — утренний постер и недельная плёнка ===
//
// Отправляет кадр дня в телеграм БЕЗ ПОТЕРЬ. Это вся суть файла.
//
// Телеграм не хранит то, что ему дают через sendPhoto: он пережимает картинку
// в JPEG и уменьшает её. Кадр 1080×1920, снятый daily-89 прямо с холста,
// доезжает до телефона размытым — и в сторис уходит уже мыло. sendDocument,
// напротив, хранит файл побайтово. Поэтому кадр всегда уходит документом;
// сжатая копия отправляется рядом только затем, чтобы картинку было видно
// в ленте, не открывая файл.
//
// То же с неделей. GIF — 256 цветов, и телеграм всё равно перегоняет его
// в MP4: масло превращается в полосы. Неделя собирается сразу в H.264
// 1080×1920 и уходит документом.
//
// Ноль зависимостей — закон этого репозитория. multipart собирается руками,
// видео собирает ffmpeg, если он есть.
//
// Запуск (ootrohome, systemd):
//   node scripts/story-poster.js daily            — кадр сегодняшнего дня
//   node scripts/story-poster.js weekly           — плёнка за 7 дней
//   node scripts/story-poster.js daily 2026-09-01 — любой день из архива
//
// Окружение:
//   TG_BOT_TOKEN       — обязателен
//   TG_CHAT_ID         — обязателен
//   STORY_RECORD_DIR   — локальная копия 89/record (быстрее и без сети)
//   SITE               — откуда брать кадр, если локальной копии нет
//   STORY_PREVIEW=0    — не слать сжатую копию для превью
//   STORY_FRAME_SECONDS — сколько держать один кадр в плёнке (по умолчанию 2)
//   STORY_DAYS         — сколько дней в плёнке (по умолчанию 7)

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');

const TG_API = process.env.TG_API_BASE || 'https://api.telegram.org';
const TOKEN = process.env.TG_BOT_TOKEN || '';
const CHAT = process.env.TG_CHAT_ID || '';
const SITE = (process.env.SITE || 'https://nikolaigrigoriev.com').replace(/\/+$/, '');
const RECORD_DIR = process.env.STORY_RECORD_DIR || '';
const PREVIEW = process.env.STORY_PREVIEW !== '0';
const FRAME_SECONDS = Number(process.env.STORY_FRAME_SECONDS || 2);
const DAYS = Math.max(1, parseInt(process.env.STORY_DAYS || '7', 10));
const TZ = process.env.TZ_SITE || 'Europe/Madrid';
// ffmpeg берётся из PATH; STORY_FFMPEG — если на машине он лежит не там.
const FFMPEG = process.env.STORY_FFMPEG || 'ffmpeg';

const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Дата так, как её пишет человек: «6 сентября».
function ruDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${RU_MONTHS[m - 1]}`;
}

// Барселонская дата — та же, по которой daily-89 именует кадр в архиве.
// Считается от локального дня, а не от часов, поэтому не спорит сама с собой
// по разные стороны полуночи.
function bcnDate(offsetDays = 0) {
  const s = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (!offsetDays) return s;
  const t = new Date(`${s}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + offsetDays);
  return t.toISOString().slice(0, 10);
}

// ---------- кадр ----------
// Сначала локальная копия архива (домашний сервер держит её рядом), потом сайт.
// Архив write-once: чего нет — того нет, это молчание, а не ошибка.
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('http://') ? http : https;
    const req = mod.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return fetchUrl(new URL(res.headers.location, url).href).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url} → HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error(`${url} → таймаут`)));
  });
}

async function frame(date) {
  if (RECORD_DIR) {
    const fp = path.join(RECORD_DIR, `${date}.png`);
    if (fs.existsSync(fp)) return fs.readFileSync(fp);
  }
  return fetchUrl(`${SITE}/89/record/${date}.png`);
}

// Ширина и высота PNG — из заголовка IHDR. Нужны только для подписи и для
// проверки, что кадр действительно вертикальный 1080×1920, а не что-то мельче.
function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

// ---------- телеграм ----------
// multipart/form-data руками: sendDocument принимает файл только так, а
// байты обязаны доехать нетронутыми — в этом весь смысл.
function multipart(fields, files) {
  const boundary = '----v89' + Date.now().toString(16) + Math.random().toString(16).slice(2);
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  for (const [name, f] of Object.entries(files)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; ` +
      `filename="${f.filename}"\r\nContent-Type: ${f.type}\r\n\r\n`));
    parts.push(f.data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(parts) };
}

function tgUpload(method, fields, files = {}) {
  return new Promise((resolve, reject) => {
    if (!TOKEN || !CHAT) return reject(new Error('нет TG_BOT_TOKEN или TG_CHAT_ID'));
    const { boundary, body } = multipart(Object.assign({ chat_id: CHAT }, fields), files);
    const mod = TG_API.startsWith('http://') ? http : https;
    const req = mod.request(`${TG_API}/bot${TOKEN}/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        let ok = false;
        try { ok = JSON.parse(text).ok === true; } catch (e) { /* ответ не json */ }
        ok ? resolve() : reject(new Error(`${method}: ${text.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    // Плёнка недели тяжелее кадра — минуты хватает с запасом на оба.
    req.setTimeout(120000, () => req.destroy(new Error(`${method}: таймаут загрузки`)));
    req.write(body); req.end();
  });
}

// ---------- утро ----------
async function daily(date) {
  const png = await frame(date);
  const size = pngSize(png);
  const dim = size ? `${size.w}×${size.h}` : 'полный размер';
  const caption = `Вариация 89 — ${ruDate(date)}.`;

  // Сжатая копия — только чтобы работу было видно в ленте. Смотреть её
  // не нужно: рядом лежит тот же кадр целиком.
  if (PREVIEW) {
    try {
      await tgUpload('sendPhoto', { caption }, {
        photo: { filename: `89-${date}.png`, type: 'image/png', data: png },
      });
    } catch (e) {
      console.warn('[89] превью не ушло:', e.message);   // документ важнее
    }
  }

  await tgUpload('sendDocument', {
    caption: `${caption} PNG ${dim}, без сжатия — для сторис.`,
    disable_content_type_detection: 'true',
  }, {
    document: { filename: `variation-89-${date}.png`, type: 'image/png', data: png },
  });

  console.log(`[89] кадр ${date} отправлен документом (${png.length} байт, ${dim})`);
}

// ---------- неделя ----------
function haveFfmpeg() {
  try { execFileSync(FFMPEG, ['-version'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

async function weekly(endDate) {
  const dates = [];
  for (let i = DAYS - 1; i >= 0; i--) dates.push(bcnDateFrom(endDate, -i));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'v89-week-'));
  const have = [];
  for (const d of dates) {
    try {
      const png = await frame(d);
      const fp = path.join(tmp, `${d}.png`);
      fs.writeFileSync(fp, png);
      have.push({ date: d, file: fp });
    } catch (e) {
      console.warn(`[89] кадра за ${d} нет — пропускаю:`, e.message);
    }
  }
  if (!have.length) throw new Error('за неделю не нашлось ни одного кадра');

  const span = `${ruDate(have[0].date)} — ${ruDate(have[have.length - 1].date)}`;

  // Без ffmpeg плёнку не собрать. Молчать в этом случае хуже, чем отдать
  // неделю по кадрам: каждый из них всё равно полного размера.
  if (!haveFfmpeg()) {
    console.warn('[89] ffmpeg не найден — отправляю неделю отдельными кадрами');
    for (const f of have) {
      await tgUpload('sendDocument', { caption: `Вариация 89 — ${ruDate(f.date)}.` },
        { document: { filename: `variation-89-${f.date}.png`, type: 'image/png', data: fs.readFileSync(f.file) } });
    }
    return;
  }

  // Демуксер concat держит каждый кадр FRAME_SECONDS секунд. Последний файл
  // повторяется без duration — иначе concat обрывает его мгновенно.
  const list = have.map((f) => `file '${f.file}'\nduration ${FRAME_SECONDS}`).join('\n')
    + `\nfile '${have[have.length - 1].file}'\n`;
  const listFile = path.join(tmp, 'list.txt');
  fs.writeFileSync(listFile, list);

  const mp4 = path.join(tmp, `variation-89-${have[have.length - 1].date}-week.mp4`);
  // yuv420p и чётные стороны — иначе инстаграм и половина плееров не откроют.
  // crf 16 — визуально без потерь на масле; faststart, чтобы играло сразу.
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', 'fps=30,scale=1080:1920:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  const video = fs.readFileSync(mp4);
  const caption = `Вариация 89 — неделя: ${span}.`;
  const seconds = Math.round(have.length * FRAME_SECONDS);

  if (PREVIEW) {
    try {
      await tgUpload('sendVideo', {
        caption, width: '1080', height: '1920', duration: String(seconds), supports_streaming: 'true',
      }, { video: { filename: path.basename(mp4), type: 'video/mp4', data: video } });
    } catch (e) {
      console.warn('[89] превью недели не ушло:', e.message);
    }
  }

  await tgUpload('sendDocument', {
    caption: `${caption} MP4 1080×1920, ${seconds} с, без сжатия — для сторис.`,
    disable_content_type_detection: 'true',
  }, { document: { filename: path.basename(mp4), type: 'video/mp4', data: video } });

  console.log(`[89] неделя ${span} отправлена (${have.length} кадров, ${video.length} байт)`);
}

// Дата, сдвинутая на N дней от заданной, а не от «сегодня».
function bcnDateFrom(iso, offsetDays) {
  const t = new Date(`${iso}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + offsetDays);
  return t.toISOString().slice(0, 10);
}

// ---------- запуск ----------
async function main() {
  const mode = process.argv[2] || 'daily';
  const date = process.argv[3] || bcnDate();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`дата должна быть YYYY-MM-DD, а не «${date}»`);
  if (mode === 'daily') return daily(date);
  if (mode === 'weekly') return weekly(date);
  throw new Error(`неизвестная команда «${mode}» — есть daily и weekly`);
}

if (require.main === module) {
  main().catch((e) => { console.error('[89]', e.message); process.exit(1); });
}

module.exports = { bcnDate, bcnDateFrom, ruDate, pngSize, multipart };
