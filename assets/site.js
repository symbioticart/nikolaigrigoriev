/* ── Nikolai Grigoriev — portfolio · shared client ────────────────────────── */
(function () {
  'use strict';

  // ── Work registry ───────────────────────────────────────────────────────
  // Order defines Selected Works + Works grid ordering.
  const WORKS = [
    { id: '87', title: 'Variation 87', selected: true,
      medium: 'Software, lived time written daily by an unchanging rule, screen. Dimensions variable — continuous since 2022.' },
    { id: '89', title: 'Variation 89', selected: true,
      medium: 'Software, lived time written daily by an unchanging rule, screen — in the format of a portrait. Dimensions variable — since 2025.' },
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
  function render(id, date, w, h) {
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
    const meta = await getClient(id).ready;
    const cal = calendarOf(meta);            // every calendar day, ascending
    let idx = cal.length - 1;                // open on today — the work as it stands now
    if (opts.startDate) {
      const i = cal.indexOf(opts.startDate);
      if (i >= 0) idx = i;
    }

    // DOM — plate is a viewer (not a link); left/right zones page through days.
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
      // Single-state view: a close × just outside the painting's top-right
      // corner (the header stays), returning to the archive it was opened from.
      const close = document.createElement('a');
      close.className = 'close-btn';
      close.href = `/archive.html?id=${id}`;
      close.setAttribute('aria-label', 'Close');
      close.textContent = '×';
      inner.appendChild(close);
    } else {
      // Living view: the vertical rail riding the plate's right edge — the
      // archive of every state, and the rule that writes them. The rule is
      // reachable from the work itself, the way a wall drawing is shown with
      // its instruction; it states the law and never the meaning.
      const rail = document.createElement('div');
      rail.className = 'archive-rail';
      rail.innerHTML =
        `<a href="/archive.html?id=${id}">Archive</a>` +
        `<a href="/rule.html?id=${id}">The rule</a>`;
      inner.appendChild(rail);
    }

    const cap = document.createElement('div');
    cap.className = 'caption';
    const titleInner = opts.titleLink
      ? `<a href="/work.html?id=${id}">${work.title}</a>`
      : work.title;
    cap.innerHTML =
      `<h1 class="title">${titleInner}</h1>` +
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

    // How many days of silence the viewed day stands in: 0 if the body wrote
    // that day, otherwise the count since the last day it did.
    function gapAt(i) {
      let g = 0;
      for (let j = i; j >= 0 && !meta.alive.has(cal[j]); j--) g++;
      return g;
    }

    const ratio = meta.ratio || 1.4;
    let dims = { w: 0, h: 0 };
    function measure() {
      const padX = 2 * (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--pad')) || 26);
      const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
      const vh = window.innerHeight || document.documentElement.clientHeight || 720;
      // Close view reserves a right margin for the outside × ; living view
      // reserves the rail gutter on desktop; mobile living view reclaims it.
      const gutter = opts.rail === 'close' ? 48 : (vw <= 640 ? 0 : (opts.railGutter || 34));
      const maxW = Math.max(200, Math.min(opts.maxW, vw - padX - gutter));
      const maxH = Math.max(200, Math.min(opts.maxH, vh * (opts.maxHvh || 0.62)));
      dims = fitPlate(ratio, maxW, maxH);
      plate.style.width = dims.w + 'px';
      img.style.width = dims.w + 'px';
      img.style.height = dims.h + 'px';
      return dims;
    }

    async function show(newIdx, animate) {
      idx = Math.max(0, Math.min(cal.length - 1, newIdx));
      const date = cal[idx];
      const isLast = idx === cal.length - 1;
      curEl.textContent = `${fmtDate(meta.birth)} – ${isLast ? 'Today' : fmtDate(date)}`;
      // On a silent day, the count and nothing else. The number does the work;
      // that the painting returns when the days do is stated in the rule.
      const gap = gapAt(idx);
      stateEl.textContent = gap > 0 ? `Silence, day ${gap}.` : '';
      prevBtn.disabled = zPrev.disabled = idx === 0;
      nextBtn.disabled = zNext.disabled = isLast;
      img.alt = `${work.title} — ${isLast ? 'today' : fmtDate(date)}` +
        (meta.alive.has(date) ? '' : ' — silence, no data recorded this day');
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
    await show(idx, false);

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
    ready: (id) => getClient(id).ready,
    render,
    mountHeader,
    fmtDate, fmtYear, fmtDateLong: (iso) => { const { y, m, d } = parseISO(iso); return `${MONTHS_LONG[m - 1]} ${d}, ${y}`; },
    addDaysISO, daysBetween, parseISO, MONTHS, MONTHS_LONG,
  };
})();
