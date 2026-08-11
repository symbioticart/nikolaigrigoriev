/* ── Nikolai Grigoriev — portfolio · shared client ────────────────────────── */
(function () {
  'use strict';

  // ── Work registry ───────────────────────────────────────────────────────
  // Order defines Selected Works + Works grid ordering.
  // Who the works are — one description, in works.json, put here by the server
  // as it serves this file. The fallback below is only what a bare file system
  // would show if that ever failed; the file is the source.
  const REGISTRY = window.__WORKS || null;
  const WORKS = REGISTRY ? Object.keys(REGISTRY).filter((k) => k !== '_').map((id) => {
    const w = REGISTRY[id];
    return {
      id,
      title: w.title,
      medium: w.medium,
      selected: !!w.selected,
      unlisted: w.listed === false,
      // The shape of a work is its canvas, not a number kept beside it.
      ratio: w.canvas.w / w.canvas.h,
      ground: w.ground,
      silence: w.silence,
      // The one size at which a day of this work is ever painted — the same
      // size the site's own painter uses, so a picture made in a browser and
      // the picture kept on the site are the same picture.
      state: w.state ? { w: w.state.w, h: w.state.h } : null,
    };
  }) : [
    // Only enough to keep the plates the right shape if works.json never
    // arrived. No captions here: a caption written in two places is two
    // captions, and this copy had already drifted a whole council's revision
    // behind the one in the registry.
    { id: '87', title: 'Variation 87', selected: true, ratio: 980 / 700, ground: '#eee9dd' },
    { id: '89', title: 'Variation 89', selected: true, ratio: 920 / 1350, ground: '#eee9dd' },
    { id: 'archipelago', title: 'Archipelago', selected: true, ratio: 900 / 1200, ground: '#090909' },
  ];
  const WORK_BY_ID = Object.fromEntries(WORKS.map((w) => [w.id, w]));

  // A page opened for an unlisted work asks not to be indexed. Done here rather
  // than per page, so every surface that takes ?id= — the work, its archive, its
  // rule — is covered by construction and none can be forgotten.
  (function () {
    const w = WORK_BY_ID[new URLSearchParams(location.search).get('id')];
    if (!w || !w.unlisted) return;
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
  })();

  // ── Date helpers ─────────────────────────────────────────────────────────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
  function fmtDate(iso) { const { y, m, d } = parseISO(iso); return `${d} ${MONTHS[m - 1]} ${y}`; }
  function fmtYear(iso) { return iso.slice(0, 4); }
  // The long form, for the one line that says which day "Today" is.
  function fmtDateLong(iso) { const { y, m, d } = parseISO(iso); return `${d} ${MONTHS_LONG[m - 1]} ${y}`; }
  function addDaysISO(iso, n) {
    const t = Date.parse(iso + 'T00:00:00Z') + n * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  // ── Art render client ─────────────────────────────────────────────────────
  // One hidden iframe per work. Promise-based render(date,w,h) with a dataURL cache.
  const clients = new Map();

  // The last few states of each work, painted ahead and kept as small images.
  // Stepping back through them costs a download, not a repaint — so the days a
  // reader actually looks at arrive at once, and the engine is only woken for
  // the deeper past, where waiting is understood.
  // Every day the body wrote, painted once and kept as a small file. A day that
  // has ended is never repainted, so its picture can be final: reading one
  // costs a download, not a repaint, and the engine is woken only when a file
  // is missing.
  const PRE = Object.create(null);      // id -> { last, shown, bakedSilence }
  const pointerUrl = (id) => `/state/${id}.webp`;
  const preReady = fetch('/state/index.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (!j) return;
      for (const k of Object.keys(j)) {
        const v = j[k];
        // Tolerate older manifests, which listed every painted date.
        PRE[k] = Array.isArray(v)
          ? { last: v[v.length - 1] || null, shown: v[v.length - 1] || null, bakedSilence: false }
          : { last: v.last || null, shown: v.shown || v.last || null, bakedSilence: !!v.bakedSilence };
      }
    })
    .catch(() => {});

  // The one curve of silence, loaded from the one file that states it, rather
  // than restated here — two copies of a law are two laws.
  let silenceP = null;
  function silenceParams(gap) {
    if (window.SILENCE) return Promise.resolve(window.SILENCE.params(gap));
    if (!silenceP) {
      silenceP = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = '/art/silence.js';
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });
    }
    return silenceP.then(() => (window.SILENCE
      ? window.SILENCE.params(gap)
      : { gray: 0, fade: 0 }));
  }

  // Can this day be shown from the one ready-made picture? Only if that picture
  // already holds it: the day itself, or — for a work whose silence is laid on
  // live — the written day a silence is still showing.
  //
  // With one exception, and it is the rhythm of the work rather than a
  // concession. The painter runs once a morning; the ring hands a day over when
  // it hands it over. A day that arrives after the morning is unpainted until
  // the next one, and for those hours the newest day of the work is the one
  // painted this morning. The site shows that painting instead of quietly
  // making a second copy of a day in the reader's browser. One day behind is
  // the rhythm; two would be a stall, and the walk fails the site for it.
  function pointerFor(id, date, target) {
    const pre = PRE[id];
    if (!pre || !pre.shown) return null;
    if (pre.bakedSilence) return date === pre.shown ? pointerUrl(id) : null;
    if (target === pre.last) return pointerUrl(id);
    const behind = (Date.parse(target) - Date.parse(pre.last)) / 86400000;
    return behind === 1 ? pointerUrl(id) : null;
  }

  // The engine is a megabyte of code and takes several seconds to come up on a
  // phone, but once it is up a day costs about half a second. So it is started
  // quietly as soon as a page that can page days is opened — by the time a
  // reader reaches for an arrow it is usually waiting. The home page, which
  // shows each work as it stands and nothing else, never starts one.
  function warm(id) { getClient(id); }

  function getClient(id) {
    if (clients.has(id)) return clients.get(id);

    const state = {
      id,
      iframe: null,
      readyResolve: null,
      ready: null,          // resolves to { birth, last, ratio, alive:Set }
      meta: null,
      pending: new Map(),   // reqId -> {resolve}
      cache: new Map(),     // key -> dataURL
      seq: 0,
    };
    state.ready = new Promise((res) => (state.readyResolve = res));

    const iframe = document.createElement('iframe');
    iframe.src = `/art/render.html?work=${id}`;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.tabIndex = -1;
    iframe.style.cssText =
      'position:fixed;width:8px;height:8px;left:-9999px;top:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    state.iframe = iframe;

    clients.set(id, state);
    return state;
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.__art !== true) return;
    // find the client whose iframe sent this
    let state = null;
    for (const s of clients.values()) {
      if (s.iframe && s.iframe.contentWindow === e.source) { state = s; break; }
    }
    if (!state) return;

    if (m.type === 'ready') {
      state.meta = {
        birth: m.birth, last: m.last, lastData: m.lastData || m.last, ratio: m.ratio,
        alive: new Set(m.alive), aliveList: m.alive,
        incomplete: new Set(m.incomplete || []),
      };
      state.readyResolve(state.meta);
    } else if (m.type === 'render') {
      const p = state.pending.get(m.reqId);
      if (p) { state.pending.delete(m.reqId); p.resolve(m.ok ? m.url : null); }
    } else if (m.type === 'error') {
      console.error('[art ' + state.id + ']', m.error);
    }
  });

  // Render one day. w/h are CSS px; we upscale by DPR for crispness. The iframe
  // caps delivery at the full painted buffer, so this stays sharp on retina.
  // What a work needs to label itself, straight from the server: the engine is
  // a megabyte of code and seconds of a phone's time, and none of it is needed
  // to know the dates. If the server has nothing to say, ask the engine.
  let metaAllP = null;
  function metaOf(id) {
    if (!metaAllP) {
      metaAllP = fetch('/state/meta.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    }
    return metaAllP.then((all) => {
      const m = all && all[id];
      if (!m || !m.birth || !m.last) return getClient(id).ready;
      return {
        birth: m.birth, last: m.last, lastData: m.lastData || m.last, ratio: m.ratio,
        alive: new Set(m.alive), aliveList: m.alive,
        incomplete: new Set(m.incomplete || []),
      };
    });
  }

  // How the work stands right now, answered from the one picture the site
  // keeps ready — never by painting a fresh copy.
  //
  // One day, one record, one painting: a page that paints its own copy at its
  // own size gets a DIFFERENT picture of the same day, because the paint is
  // simulated and the simulation is sized. That is how the catalogue came to
  // show a work that did not match the same work on the home page.
  //
  // What comes back is the ready picture, plus how many days the body has been
  // silent, so a page can lay that silence on exactly as the home page does.
  async function standing(id) {
    const meta = await metaOf(id);
    const pre = PRE[id];
    if (!pre || !pre.shown) return null;
    // Works whose silence is painted from within already carry it in the file.
    const gap = pre.bakedSilence || !pre.last || !meta.last
      ? 0 : Math.max(0, daysBetween(pre.last, meta.last));
    return { url: pointerUrl(id), day: pre.shown, gap, ratio: meta.ratio, meta };
  }

  // Wait to hear how each work stands before deciding. Without this the first
  // request of a page can outrun the manifest and start an engine for a day the
  // ready-made picture already holds.
  function render(id, date, w, h) {
    return preReady.then(() => renderNow(id, date, w, h));
  }

  async function renderNow(id, date, w, h) {
    // The day the ready-made picture holds — no engine needed.
    const ready = pointerFor(id, date, date);
    if (ready) return ready;
    const state = getClient(id);
    // Every painting of a day is made at the work's own size, whatever size it
    // will be shown at, and the browser scales it down afterwards. The paint is
    // simulated, and the simulation is sized: asking for a day at the width of
    // a catalogue tile returned a different picture of the same day than the
    // home page showed. One day, one record, one painting — including when the
    // browser has to make it rather than take it ready-made.
    const size = (WORK_BY_ID[id] && WORK_BY_ID[id].state) || null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = size ? size.w : Math.round(w * dpr);
    const ph = size ? size.h : Math.round(h * dpr);
    const key = `${date}@${pw}x${ph}`;
    if (state.cache.has(key)) return Promise.resolve(state.cache.get(key));

    return state.ready.then(() => new Promise((resolve) => {
      const reqId = ++state.seq;
      state.pending.set(reqId, {
        resolve: (url) => { if (url) state.cache.set(key, url); resolve(url); },
      });
      state.iframe.contentWindow.postMessage(
        { __artcmd: true, type: 'render', reqId, date, w: pw, h: ph }, '*');
    }));
  }

  // ── Header ────────────────────────────────────────────────────────────────
  function mountHeader(active, opts) {
    opts = opts || {};
    const nav = [
      { href: '/works.html', label: 'Works', key: 'works' },
      { href: '/wit36', label: 'Without Witness', external: true },
      { href: '/about.html', label: 'About', key: 'about' },
    ];
    const el = document.createElement('header');
    el.className = 'site-head';
    el.innerHTML =
      `<a class="site-name" href="/">Nikolai Grigoriev</a>` +
      (
        `<nav class="site-nav" aria-label="Primary">` +
        nav.map((n) => n.external
          ? `<a href="${n.href}" target="_blank" rel="noopener" aria-label="${n.label} (opens in a new tab)">${n.label}<svg class="ext" viewBox="0 0 12 12" aria-hidden="true"><path d="M3.4 8.6 L8.6 3.4 M4.9 3.4 H8.6 V7.1" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg></a>`
          : `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a>`).join('') +
        `</nav>`);
    document.body.prepend(el);
    const skip = document.createElement('a');
    skip.className = 'skip'; skip.href = '#main'; skip.textContent = 'Skip to content';
    document.body.prepend(skip);
  }

  // ── Reusable art block (plate + archive rail + caption + day arrows) ──────
  function fitPlate(ratio, maxW, maxH) {
    let w = maxW, h = w / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    return { w: Math.round(w), h: Math.round(h) };
  }

  // Full calendar of a work: every date from birth to TODAY. Days the body did
  // not write are days of the work too — it goes on living through them, fading.
  function calendarOf(meta) {
    const out = [];
    for (let d = meta.birth; daysBetween(d, meta.last) >= 0; d = addDaysISO(d, 1)) out.push(d);
    return out;
  }

  // opts: { id, maxW, maxH, titleLink(bool), keys(bool), startDate(ISO) }
  async function mountArtBlock(container, opts) {
    const id = opts.id;
    const work = WORK_BY_ID[id];

    // DOM — plate is a viewer (not a link); left/right zones page through days.
    let rail = null, closeBtn = null;
    const inner = document.createElement('div');
    inner.className = 'stage-inner';
    const plate = document.createElement('div');
    plate.className = 'plate loading';
    const img = document.createElement('img');
    // The ground, held above the painting and brought up as silence deepens.
    const wash = document.createElement('div');
    wash.className = 'wash';
    wash.setAttribute('aria-hidden', 'true');
    plate.append(img, wash);
    // Pointer-only paging overlays — hidden from AT/keyboard (the visible ← →
    // buttons are the accessible control) and removed entirely on touch.
    const zPrev = document.createElement('button');
    zPrev.className = 'nav-zone nav-prev'; zPrev.setAttribute('aria-hidden', 'true'); zPrev.tabIndex = -1;
    const zNext = document.createElement('button');
    zNext.className = 'nav-zone nav-next'; zNext.setAttribute('aria-hidden', 'true'); zNext.tabIndex = -1;
    plate.append(zPrev, zNext);
    inner.appendChild(plate);
    // The rail belongs to the work, not to the mood of the visit: a reader who
    // arrived on one day of it should still be able to reach the whole archive
    // and the rule. Only the way out is added on top, when one is needed.
    //
    // Except on the work's own page, which already holds both further down —
    // a rail pointing at the page it is standing on is furniture.
    if (opts.rail !== null) {
      rail = document.createElement('div');
      rail.className = 'archive-rail';
      rail.innerHTML =
        `<a href="/archive.html?id=${id}">Archive</a>` +
        `<a href="/rule.html?id=${id}">The rule</a>`;
      (container.closest('main') || document.body).appendChild(rail);
    }

    if (opts.rail === 'close') {
      // Single-state view: the close × stands on the page's own right margin,
      // level with the top of the painting — the same margin the rail and the
      // nav use, so it reads as part of the page rather than as something left
      // beside the picture by accident.
      closeBtn = document.createElement('a');
      closeBtn.className = 'close-btn';
      closeBtn.href = `/archive.html?id=${id}`;
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '×';
      (container.closest('main') || document.body).appendChild(closeBtn);
    }

    const cap = document.createElement('div');
    cap.className = 'caption';
    const titleInner = opts.titleLink
      ? `<a href="/archive.html?id=${id}">${work.title}</a>`
      : work.title;
    // The museum line — what the work is made of. It belongs on the work's own
    // page, where a reader has stopped in front of one thing; on the home page,
    // where the works are passed through, it would only be furniture.
    const mediumLine = (!opts.titleLink && work.medium)
      ? `<p class="medium">${work.medium}</p>` : '';
    // Between the arrows stands the day being looked at — nothing else. What
    // used to stand there was the work's whole span, so the eye tied its left
    // end to the left arrow, and the day itself was never named.
    //
    // Under it, one quiet line: the date behind the word "Today", or where the
    // day falls in the record, or — when the body has stopped — the count of
    // the silence, which is the same subject and so takes the same line.
    //
    // Under that, the record drawn as a line, with the day marked on it. It can
    // be taken hold of: a work of nine hundred days is not walked one arrow at
    // a time.
    cap.innerHTML =
      `<h1 class="title">${titleInner}</h1>` +
      mediumLine +
      `<div class="daynav">` +
        `<button class="prev" aria-label="Earlier day">←</button>` +
        `<span class="cur"></span>` +
        `<button class="next" aria-label="Later day">→</button>` +
      `</div>` +
      `<div class="state" role="status"></div>` +
      `<div class="thread" role="slider" tabindex="0" aria-label="Day within the record"` +
        ` aria-valuemin="1" aria-valuenow="1" aria-valuemax="1">` +
        `<div class="thread-line"><span class="thread-mark"></span></div>` +
        `<div class="thread-ends"><span class="from"></span><span class="to">Today</span></div>` +
      `</div>`;
    container.append(inner, cap);

    const curEl = cap.querySelector('.cur');
    const stateEl = cap.querySelector('.state');
    const prevBtn = cap.querySelector('.prev');
    const nextBtn = cap.querySelector('.next');
    const thread = cap.querySelector('.thread');
    const threadLine = cap.querySelector('.thread-line');
    const threadMark = cap.querySelector('.thread-mark');
    const threadFrom = cap.querySelector('.thread .from');

    const ratio = opts.ratio || work.ratio || 1.4;
    let dims = { w: 0, h: 0 };
    let heldVH = 0, heldForVW = -1;
    measure();

    // The work as it stands today, as a ready-made image of a few tens of
    // kilobytes. It arrives over the network alone: the phone is not asked to
    // paint anything before the page can be looked at. The engine — a megabyte
    // of code and thousands of strokes, seconds of work on a phone — wakes in
    // the background and takes the plate over the moment a day is paged.
    // A view opened on a particular past day cannot use it — that day is drawn
    // live — so it waits for the engine instead, with the waiting mark showing.
    let primed = false;
    if (!opts.startDate) {
      primed = await new Promise((res) => {
        img.onload = () => res(true);
        img.onerror = () => res(false);
        img.src = pointerUrl(id);
      });
    }
    if (primed) {
      plate.classList.remove('loading');
      requestAnimationFrame(() => img.classList.add('in'));
    } else {
      img.removeAttribute('src');
    }

    const meta = await metaOf(id);
    const cal = calendarOf(meta);            // every calendar day, ascending
    let idx = cal.length - 1;                // open on today — the work as it stands now
    if (opts.startDate) {
      const i = cal.indexOf(opts.startDate);
      if (i >= 0) idx = i;
    }

    // How many days of silence the viewed day stands in: 0 if the body wrote
    // that day, otherwise the count since the last day it did.
    // How many days the body has been silent, counting back to the last day it
    // wrote. A work with nothing written at all is not silent — it has not
    // begun, and counting back to the start of its calendar would have it
    // claim years of a silence that never happened.
    function gapAt(i) {
      if (!meta.alive.size) return 0;
      let g = 0;
      for (let j = i; j >= 0 && !meta.alive.has(cal[j]); j--) g++;
      return g;
    }
    // Which painting a silent day is still showing: the last one written.
    function targetAt(i) {
      for (let j = i; j >= 0; j--) if (meta.alive.has(cal[j])) return cal[j];
      return null;
    }
    // Silence, laid over the painting rather than baked into it: colour drains,
    // then the ground comes up through the image. Because it is applied here,
    // from the live gap, a stored picture can never carry a stale fade —
    // which is how a fortnight-old state came to be labelled "Today".
    function wither(sil) {
      img.style.filter = sil && sil.gray > 0 ? `grayscale(${sil.gray.toFixed(3)})` : '';
      wash.style.background = work.ground || '#eee9dd';
      wash.style.opacity = sil && sil.fade > 0 ? sil.fade.toFixed(3) : '0';
    }
    function measure() {
      const pad = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pad')) || 26;
      const padX = 2 * pad;
      const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      // A phone's window grows and shrinks by ~100px as its address bar hides
      // and returns while you scroll. Sizing the plate off the live height made
      // the painting change size under the reader's thumb, so the height is
      // taken once per width and held: the picture keeps still.
      if (vw !== heldForVW) { heldForVW = vw; heldVH = window.innerHeight || 720; }
      const vh = heldVH;
      // Close view reserves a right margin for the outside × ; living view
      // reserves the rail gutter on desktop; mobile living view reclaims it.
      // The rail stands on the page's own right margin, so the painting yields
      // it that margin plus its own width. Doubled, because the plate is centred:
      // half of what is taken away comes off the right side, where the rail is.
      // the ×'s 44px tap area is wider than the glyph, so this view yields a
      // little more — a tap meant for closing must never page the work instead
      const gutter = 2 * (pad + (opts.rail === 'close' ? 32 : (vw <= 640 ? 26 : 34)));
      const maxW = Math.max(200, Math.min(opts.maxW, vw - padX - gutter));
      const maxH = Math.max(200, Math.min(opts.maxH, vh * (opts.maxHvh || 0.62)));
      dims = fitPlate(ratio, maxW, maxH);
      plate.style.width = dims.w + 'px';
      img.style.width = dims.w + 'px';
      img.style.height = dims.h + 'px';
      const edge = rail || closeBtn;
      if (edge) {
        const host = edge.offsetParent || document.body;
        const pr = plate.getBoundingClientRect(), hr = host.getBoundingClientRect();
        const top = pr.top - hr.top;
        // the rail rides the painting's middle, the × its top corner
        edge.style.top = Math.round(rail ? top + pr.height / 2 : top) + 'px';
      }
      return dims;
    }

    // The words around the painting: date, state, arrows, alt. Split out so a
    // plate already holding today's image can be labelled without waking the
    // painter for a picture it is already showing.
    function label(i) {
      const date = cal[i];
      const isLast = i === cal.length - 1;
      // The day, and only the day, between the arrows.
      curEl.textContent = isLast ? 'Today' : fmtDate(date);
      // One line beneath, carrying whichever of three things the reader needs
      // most here. A silence outranks the rest: it is the state of the work.
      // Then the date the word "Today" stands for. Then, on any other day,
      // where that day falls in the record.
      const gap = gapAt(i);
      stateEl.textContent = gap > 0 ? `Silence, day ${gap}.`
        : isLast ? fmtDateLong(date)
        : `Day ${i + 1} of ${cal.length}`;
      threadMark.style.left = (cal.length > 1 ? (i / (cal.length - 1)) * 100 : 100) + '%';
      threadFrom.textContent = fmtYear(meta.birth);
      thread.setAttribute('aria-valuemin', '1');
      thread.setAttribute('aria-valuemax', String(cal.length));
      thread.setAttribute('aria-valuenow', String(i + 1));
      thread.setAttribute('aria-valuetext', isLast ? 'Today' : fmtDateLong(date));
      prevBtn.disabled = zPrev.disabled = i === 0;
      nextBtn.disabled = zNext.disabled = isLast;
      img.alt = `${work.title} — ${isLast ? 'today' : fmtDate(date)}` +
        (meta.alive.has(date) ? '' : ' — silence, no data recorded this day');
      // Keep the address on the day being looked at, so a particular day can be
      // sent to someone, kept, or returned to with the back button. Paging is
      // not navigation, so it replaces rather than piles up history.
      if (opts.syncUrl && window.history && history.replaceState) {
        const url = isLast ? `?id=${id}` : `?id=${id}&date=${date}`;
        history.replaceState(null, '', url);
      }
      return date;
    }

    async function show(newIdx, animate) {
      idx = Math.max(0, Math.min(cal.length - 1, newIdx));
      const date = label(idx);
      if (animate) img.classList.remove('in');
      // The waiting text belongs on an empty plate only: on the first mount and
      // while paging, when the painting has been faded out. A silent re-render
      // (a resize) keeps the picture on screen, and printing the text over it
      // reads as a fault.
      if (!img.src || animate) plate.classList.add('loading');
      const d = measure();

      // A silent day is the last written painting, withering. When that painting
      // is the one the ready-made picture holds — which is the case for every
      // day of the silence the work is standing in now — it is shown at once
      // and the silence is laid over it here: one download, no engine, and a
      // fade that is always of today rather than of the day the file was made.
      const gap = gapAt(idx);
      const target = gap > 0 ? targetAt(idx) : date;
      const ready = pointerFor(id, date, target);
      let url = null, sil = null;
      if (ready) {
        url = ready;
        if (gap > 0) sil = await silenceParams(gap);
      } else {
        url = await render(id, date, d.w, d.h);
      }
      wither(sil);
      if (url) { img.src = url; requestAnimationFrame(() => img.classList.add('in')); }
      plate.classList.remove('loading');
    }

    const step = (n) => show(idx + n, true);
    // The record as a line: put a finger anywhere on it and the work goes to
    // that day. Nine hundred days is not a distance to cross one arrow at a
    // time. While the finger is down the day is only labelled, never painted —
    // dragging across a year would otherwise ask for a year of paintings; the
    // painting is fetched once, when the finger lifts.
    let dragging = false;
    function dayAt(clientX) {
      const r = threadLine.getBoundingClientRect();
      if (!r.width) return idx;
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      return Math.round(t * (cal.length - 1));
    }
    function scrub(e, settle) {
      const i = dayAt(e.touches ? e.touches[0].clientX : e.clientX);
      if (settle) { show(i, false); return; }
      if (i === idx) return;
      idx = i;
      label(idx);
    }
    thread.addEventListener('pointerdown', (e) => {
      dragging = true;
      thread.setPointerCapture && thread.setPointerCapture(e.pointerId);
      thread.classList.add('held');
      scrub(e, false);
      e.preventDefault();
    });
    thread.addEventListener('pointermove', (e) => { if (dragging) scrub(e, false); });
    for (const end of ['pointerup', 'pointercancel']) {
      thread.addEventListener(end, (e) => {
        if (!dragging) return;
        dragging = false;
        thread.classList.remove('held');
        scrub(e, true);
      });
    }
    // Reachable without a pointer at all.
    thread.addEventListener('keydown', (e) => {
      const jump = { ArrowLeft: -1, ArrowRight: 1, PageUp: 30, PageDown: -30,
                     Home: -cal.length, End: cal.length }[e.key];
      if (jump === undefined) return;
      e.preventDefault();
      show(idx + jump, false);
    });

    prevBtn.addEventListener('click', (e) => { e.preventDefault(); step(-1); });
    nextBtn.addEventListener('click', (e) => { e.preventDefault(); step(1); });
    zPrev.addEventListener('click', (e) => { e.preventDefault(); step(-1); });
    zNext.addEventListener('click', (e) => { e.preventDefault(); step(1); });

    if (opts.keys) {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      });
    }

    measure();
    // Already holding today from the ready-made picture: only put the words in
    // place. Nothing is painted until a day is actually paged.
    if (primed) label(idx); else await show(idx, false);

    // Then, once the page is quiet, start the engine. It takes several seconds
    // to come up on a phone and about half a second per day afterwards, so it
    // is started here rather than on the first press of an arrow — by the time
    // a reader reaches for one it is usually already waiting. Deliberately
    // after the first paint: a picture the visitor can see comes first.
    const startEngine = () => warm(id);
    if (window.requestIdleCallback) requestIdleCallback(startEngine, { timeout: 4000 });
    else setTimeout(startEngine, 1200);

    // Re-render only when the viewport WIDTH really changed. On a phone the
    // address bar collapses as you scroll, the window loses ~100px of height,
    // and that alone moved a portrait painting's fitted width past the old
    // threshold — so every scroll repainted the second work from scratch. The
    // layout still re-fits on any resize; only the repaint is width-gated.
    let rt, lastVW = window.innerWidth;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const vw = window.innerWidth;
        const widthChanged = vw !== lastVW;
        lastVW = vw;
        const prevW = dims.w;
        measure();
        if (widthChanged && Math.abs(dims.w - prevW) > 40) show(idx, false);
      }, 200);
    });

    return { work, meta };
  }

  // ── Public API ──────────────────────────────────────────────────────────
  window.Site = {
    mountArtBlock,
    warm,
    WORKS, WORK_BY_ID,
    ready: (id) => metaOf(id),
    standing, silenceParams,
    render,
    mountHeader,
    fmtDate, fmtYear, fmtDateLong,
    addDaysISO, daysBetween, parseISO, MONTHS, MONTHS_LONG,
  };
})();
