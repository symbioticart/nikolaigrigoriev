/* ── Nikolai Grigoriev — portfolio · shared client ────────────────────────── */
(function () {
  'use strict';

  // ── Work registry ───────────────────────────────────────────────────────
  // Order defines Selected Works + Works grid ordering.
  const WORKS = [
    // `ratio` is the work's aspect, known without asking the engine — it lets the
    // plate take its place, and the ready-made state image show, before any
    // painting machinery has loaded.
    { id: '87', title: 'Variation 87', selected: true, ratio: 980 / 700,
      medium: 'Software, lived time written daily by an unchanging rule, screen. Dimensions variable — continuous since 2022.' },
    { id: '89', title: 'Variation 89', selected: true, ratio: 920 / 1350,
      medium: 'Software, lived time written daily by an unchanging rule, screen — in the format of a portrait. Dimensions variable — since 2025.' },
    // Not a Variation. The Variations are the line of the daily record; this one
    // is painted from a single night and from nothing else, so it carries its
    // own name rather than the next number.
    // The rule was written in 2026; the nights it reads begin in 2022, because
    // the body had already been recording them. Both dates are true and the line
    // states both — the work is not older than its rule, and its material is not
    // younger than it is.
    { id: 'archipelago', title: 'Archipelago', selected: true, ratio: 900 / 1200,
      medium: 'Software, one night of a sleeping body written by an unchanging rule, screen. Dimensions variable — the rule since 2026, the nights since 2022.' },
  ];
  const WORK_BY_ID = Object.fromEntries(WORKS.map((w) => [w.id, w]));

  // ── Date helpers ─────────────────────────────────────────────────────────
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; }
  function fmtDate(iso) { const { y, m, d } = parseISO(iso); return `${d} ${MONTHS[m - 1]} ${y}`; }
  function fmtYear(iso) { return iso.slice(0, 4); }
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
  const PRE = Object.create(null);
  const preReady = fetch('/state/index.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j) for (const k of Object.keys(j)) PRE[k] = new Set(j[k]); })
    .catch(() => {});

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

  // Wait for the list of painted-ahead days before deciding. Without this the
  // first request of a page can outrun the manifest and wake the engine for a
  // day that was already waiting on disk — which is what made the works grid
  // slow while the home page, priming from a known filename, stayed fast.
  function render(id, date, w, h) {
    return preReady.then(() => renderNow(id, date, w, h));
  }

  function renderNow(id, date, w, h) {
    // Already painted and waiting on disk — hand it over without the engine.
    if (PRE[id] && PRE[id].has(date)) return `/state/${id}-${date}.webp`;
    const state = getClient(id);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
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
  // opts.minimal — name only, no nav (used on the focused single-state view so
  // the close × owns the top-right corner).
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
      (opts.minimal ? '' :
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
    plate.appendChild(img);
    // Pointer-only paging overlays — hidden from AT/keyboard (the visible ← →
    // buttons are the accessible control) and removed entirely on touch.
    const zPrev = document.createElement('button');
    zPrev.className = 'nav-zone nav-prev'; zPrev.setAttribute('aria-hidden', 'true'); zPrev.tabIndex = -1;
    const zNext = document.createElement('button');
    zNext.className = 'nav-zone nav-next'; zNext.setAttribute('aria-hidden', 'true'); zNext.tabIndex = -1;
    plate.append(zPrev, zNext);
    inner.appendChild(plate);
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
    } else {
      // Living view: the vertical rail riding the plate's right edge — the
      // archive of every state, and the rule that writes them. The rule is
      // reachable from the work itself, the way a wall drawing is shown with
      // its instruction; it states the law and never the meaning.
      rail = document.createElement('div');
      rail.className = 'archive-rail';
      rail.innerHTML =
        `<a href="/archive.html?id=${id}">Archive</a>` +
        `<a href="/rule.html?id=${id}">The rule</a>`;
      // Hung on <main>, not on the plate: the labels ride the window's right
      // edge, while measure() keeps them level with this painting's middle.
      (container.closest('main') || document.body).appendChild(rail);
    }

    const cap = document.createElement('div');
    cap.className = 'caption';
    const titleInner = opts.titleLink
      ? `<a href="/work.html?id=${id}">${work.title}</a>`
      : work.title;
    // The museum line — what the work is made of. It belongs on the work's own
    // page, where a reader has stopped in front of one thing; on the home page,
    // where the works are passed through, it would only be furniture.
    const mediumLine = (!opts.titleLink && work.medium)
      ? `<p class="medium">${work.medium}</p>` : '';
    cap.innerHTML =
      `<h1 class="title">${titleInner}</h1>` +
      mediumLine +
      `<div class="daynav">` +
        `<button class="prev" aria-label="Earlier day">←</button>` +
        `<span class="cur"></span>` +
        `<button class="next" aria-label="Later day">→</button>` +
      `</div>` +
      `<div class="state" role="status"></div>`;
    container.append(inner, cap);

    const curEl = cap.querySelector('.cur');
    const stateEl = cap.querySelector('.state');
    const prevBtn = cap.querySelector('.prev');
    const nextBtn = cap.querySelector('.next');

    const ratio = opts.ratio || work.ratio || 1.4;
    let dims = { w: 0, h: 0 };
    let heldVH = 0, heldForVW = -1;
    measure();

    // The work as it stands today, as a ready-made image of a few tens of
    // kilobytes. It arrives over the network alone: the phone is not asked to
    // paint anything before the page can be looked at. The engine — a megabyte
    // of code and thousands of strokes, seconds of work on a phone — wakes in
    // the background and takes the plate over the moment a day is paged.
    // A dated view (opened from the archive) asks for that day by name; if it
    // falls inside the painted-ahead window it arrives just as fast, and if it
    // does not, the miss costs one quick 404 and the engine takes over.
    const wanted = opts.startDate
      ? `/state/${id}-${opts.startDate}.webp`
      : `/state/${id}.webp`;
    let primed = await new Promise((res) => {
      img.onload = () => res(true);
      img.onerror = () => res(false);
      img.src = wanted;
    });
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
    function gapAt(i) {
      let g = 0;
      for (let j = i; j >= 0 && !meta.alive.has(cal[j]); j--) g++;
      return g;
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
      curEl.textContent = `${fmtDate(meta.birth)} – ${isLast ? 'Today' : fmtDate(date)}`;
      // On a silent day, the count and nothing else. The number does the work;
      // that the painting returns when the days do is stated in the rule.
      const gap = gapAt(i);
      stateEl.textContent = gap > 0 ? `Silence, day ${gap}.` : '';
      prevBtn.disabled = zPrev.disabled = i === 0;
      nextBtn.disabled = zNext.disabled = isLast;
      img.alt = `${work.title} — ${isLast ? 'today' : fmtDate(date)}` +
        (meta.alive.has(date) ? '' : ' — silence, no data recorded this day');
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
      const url = await render(id, date, d.w, d.h);
      if (url) { img.src = url; requestAnimationFrame(() => img.classList.add('in')); }
      plate.classList.remove('loading');
      // Prefetch neighbours (both directions) so the next step is a cache hit.
      for (const j of [idx + 1, idx - 1, idx + 2, idx - 2]) {
        if (j >= 0 && j < cal.length) render(id, cal[j], d.w, d.h);
      }
    }

    const step = (n) => show(idx + n, true);
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
    // Already holding today from the state image: only put the words in place.
    // Nothing is painted until a day is actually paged.
    if (primed) label(idx); else await show(idx, false);

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
    WORKS, WORK_BY_ID,
    ready: (id) => metaOf(id),
    render,
    mountHeader,
    fmtDate, fmtYear, fmtDateLong: (iso) => { const { y, m, d } = parseISO(iso); return `${MONTHS_LONG[m - 1]} ${d}, ${y}`; },
    addDaysISO, daysBetween, parseISO, MONTHS, MONTHS_LONG,
  };
})();
