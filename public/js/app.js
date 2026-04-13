// ═══════════════════════════════════════
// OOTRO — Gallery Controller
// ═══════════════════════════════════════

const WORKS = [
  { id: 'rothko-matisse', script: 'js/painters/rothko-matisse.js' },
  { id: 'chizenkai',      script: 'js/painters/chizenkai.js' },
  { id: 'sleep-form',     script: 'js/painters/sleep-form.js' },
  { id: 'dekeyser',       script: 'js/painters/dekeyser.js' },
  { id: 'vonheyl',        script: 'js/painters/vonheyl.js' },
];

const WORK_META = {
  'rothko-matisse': { title: 'Rothko Matisse', subtitle: 'Daily Portraits', previewW: 380, dates: 'Jan 14 — Jun 13, 2025' },
  'chizenkai':      { title: 'Chizenkai', subtitle: 'Daily Portraits', previewW: 300, dates: 'Jan 14 — Jun 13, 2025' },
  'sleep-form':     { title: 'Sleep Form', subtitle: 'Daily Portraits', previewW: 280, dates: 'Jan 14 — Jun 13, 2025' },
  'dekeyser':       { title: 'De Keyser', subtitle: 'Symbiotic Art', previewW: 340, dates: 'Jan 17 — Jun 13, 2025' },
  'vonheyl':        { title: 'Von Heyl', subtitle: 'Symbiotic Art', previewW: 260, dates: 'Jan 14 — Jun 13, 2025' },
};

const PREVIEW_STYLES = {
  'rothko-matisse': { bg: '#e8e2d4', accent: 'linear-gradient(135deg, #e8e2d4 0%, #d4cfc2 30%, #c8bfaa 60%, #e2ddd0 100%)' },
  'chizenkai':      { bg: '#0e0a08', accent: 'linear-gradient(180deg, #0e0a08 0%, #1a0e0e 40%, #2a1010 70%, #0e0a08 100%)' },
  'sleep-form':     { bg: '#f8f5ee', accent: 'linear-gradient(180deg, #f8f5ee 0%, #f0ede5 50%, #f5f2ea 100%)' },
  'dekeyser':       { bg: '#f5f0e8', accent: 'linear-gradient(180deg, #f5f0e8 0%, #eae5dc 50%, #f0ebe2 100%)' },
  'vonheyl':        { bg: '#e9e4d9', accent: 'linear-gradient(180deg, #e9e4d9 0%, #d8d0c0 40%, #e0dace 100%)' },
};

let DATA = null;
let currentP5 = null;
let currentIdx = 0;
let pendingRepaint = false;
let activeWorkId = null;
let activePainter = null;
let loadedScripts = {};
let painterCache = {};
let firstP5Created = false;

// ═══ DATA ═══
async function loadData() {
  const resp = await fetch('data/daily-metrics.json');
  DATA = await resp.json();
}

// ═══ SCRIPT LOADER ═══
function loadScript(src) {
  if (loadedScripts[src]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => { loadedScripts[src] = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function getPainter(workId) {
  if (painterCache[workId]) return painterCache[workId];
  const work = WORKS.find(w => w.id === workId);
  await loadScript(work.script);
  if (window.WorkPainter) {
    painterCache[workId] = window.WorkPainter;
    window.WorkPainter = null;
  }
  return painterCache[workId];
}

// ═══ GALLERY RENDERING ═══
function renderGallery() {
  const list = document.getElementById('galleryList');

  WORKS.forEach((work, i) => {
    const m = WORK_META[work.id];
    const ps = PREVIEW_STYLES[work.id];
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.workId = work.id;

    item.innerHTML = `
      <div class="gallery-item-left">
        <span class="gallery-item-title">${m.title}</span>
      </div>
      <div class="gallery-item-center" style="width:${m.previewW}px;">
        <div class="gallery-preview-placeholder" id="preview-${work.id}"
             style="background: ${ps.accent}; width:${m.previewW}px;"></div>
      </div>
      <div class="gallery-item-right">
        <span class="gallery-item-dates">${m.dates}</span>
      </div>
    `;

    // Stagger entry animation
    item.style.animationDelay = `${i * 120}ms`;

    item.addEventListener('click', () => openWork(work.id, item));
    list.appendChild(item);
  });

  // After gallery rendered, generate live previews one at a time
  // using a single persistent p5 instance
  generateLivePreviews();
}

// ═══ LIVE PREVIEW GENERATION ═══
// Render one painting at a time using a single p5 instance,
// capture to image, then destroy and move to next.
async function generateLivePreviews() {
  const previewDays = [50, 30, 40, 96, 80];

  for (let i = 0; i < WORKS.length; i++) {
    const work = WORKS[i];
    const dayIdx = previewDays[i];
    const painter = await getPainter(work.id);
    if (!painter) continue;

    const meta = WORK_META[work.id];
    const pw = meta.previewW;
    const ph = Math.round(painter.canvasH * (pw / painter.canvasW));

    const dataURL = await new Promise((resolve) => {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
      document.body.appendChild(container);

      const inst = new p5((p) => {
        p.setup = function() {
          p.createCanvas(pw, ph, p.WEBGL).parent(container);
          p.noLoop();
        };
        p.draw = function() {
          try {
            painter.paintDay(p, DATA.days[dayIdx], DATA.stats, pw, ph);
          } catch(e) { console.warn('Preview error:', work.id, e); }
          setTimeout(() => {
            const canvas = container.querySelector('canvas');
            const url = canvas ? canvas.toDataURL('image/jpeg', 0.88) : null;
            inst.remove();
            container.remove();
            resolve(url);
          }, 200);
        };
      });
    });

    // Replace placeholder with real image
    const placeholder = document.getElementById(`preview-${work.id}`);
    if (placeholder && dataURL) {
      const img = document.createElement('img');
      img.src = dataURL;
      img.className = 'gallery-preview-img';
      img.alt = WORK_META[work.id].title;
      placeholder.replaceWith(img);
    }

    await new Promise(r => setTimeout(r, 100));
  }
}

// ═══ OPEN WORK (Gallery → Detail) ═══
async function openWork(workId, galleryItem) {
  if (activeWorkId) return;
  activeWorkId = workId;

  // Transition animation
  const previewEl = galleryItem.querySelector('img') || galleryItem.querySelector('.gallery-preview-placeholder');
  const transLayer = document.getElementById('transitionLayer');

  if (previewEl) {
    const rect = previewEl.getBoundingClientRect();
    const clone = previewEl.cloneNode(true);
    clone.className = 'transition-clone';
    clone.style.cssText = `
      position: absolute;
      left: ${rect.left}px; top: ${rect.top}px;
      width: ${rect.width}px; height: ${rect.height}px;
      transition: all 0.55s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
    `;
    transLayer.appendChild(clone);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const targetW = Math.min(vw * 0.65, 600);
        const targetH = targetW * (rect.height / rect.width);
        clone.style.left = (vw - targetW) / 2 + 'px';
        clone.style.top = (vh - targetH) / 2 + 'px';
        clone.style.width = targetW + 'px';
        clone.style.height = targetH + 'px';
        clone.style.opacity = '0';
      });
    });
  }

  document.getElementById('galleryView').classList.add('hidden');

  const painter = await getPainter(workId);
  if (!painter) {
    activeWorkId = null;
    document.getElementById('galleryView').classList.remove('hidden');
    transLayer.innerHTML = '';
    return;
  }
  activePainter = painter;

  document.getElementById('aboutContent').innerHTML = painter.aboutHTML;

  // Theme
  const detailView = document.getElementById('detailView');
  const isDark = painter.bgColor === '#0a0a0a';
  detailView.classList.toggle('dark-theme', isDark);

  currentIdx = Math.floor(Math.random() * DATA.days.length);

  const W = painter.canvasW;
  const H = painter.canvasH;
  document.getElementById('canvasFrame').innerHTML = '';

  currentP5 = new p5((p) => {
    p.setup = function() {
      const canvas = p.createCanvas(W, H, p.WEBGL);
      canvas.parent('canvasFrame');
      fitCanvas(W, H);
      p.noLoop();
      pendingRepaint = true;
    };
    p.draw = function() {
      if (!pendingRepaint || !DATA || !activePainter) return;
      pendingRepaint = false;
      try {
        activePainter.paintDay(p, DATA.days[currentIdx], DATA.stats, W, H);
      } catch(e) { console.error('Paint error:', e); }
      renderMetrics();
    };
  });

  updateNavZones();

  setTimeout(() => {
    detailView.classList.add('active');
    transLayer.innerHTML = '';
  }, 350);
}

// ═══ CLOSE WORK ═══
function closeWork() {
  if (!activeWorkId) return;

  document.getElementById('overlay').classList.remove('open');
  document.getElementById('detailView').classList.remove('active');

  if (currentP5) {
    currentP5.remove();
    currentP5 = null;
  }
  document.getElementById('canvasFrame').innerHTML = '';

  activePainter = null;
  activeWorkId = null;

  setTimeout(() => {
    document.getElementById('detailView').classList.remove('dark-theme');
    document.getElementById('galleryView').classList.remove('hidden');
  }, 300);
}

// ═══ CANVAS SCALING ═══
function fitCanvas(W, H) {
  const frame = document.getElementById('canvasFrame');
  const mobile = window.innerWidth <= 640;
  const maxH = window.innerHeight - (mobile ? 70 : 120);
  const maxW = window.innerWidth - (mobile ? 16 : 80);
  const s = Math.min(1, maxH / H, maxW / W);
  frame.style.width = W + 'px';
  frame.style.height = H + 'px';
  frame.style.transform = `scale(${s})`;
  const wrap = frame.parentElement;
  wrap.style.width = (W * s) + 'px';
  wrap.style.height = (H * s) + 'px';
}

// ═══ NAVIGATION ═══
function navigate(delta) {
  if (!DATA || !activeWorkId || !activePainter) return;
  const next = currentIdx + delta;
  if (next < 0 || next >= DATA.days.length) return;

  const frame = document.getElementById('canvasFrame');
  frame.classList.add('painting');

  setTimeout(() => {
    currentIdx = next;
    updateNavZones();
    pendingRepaint = true;
    if (currentP5) currentP5.redraw();
    requestAnimationFrame(() => frame.classList.remove('painting'));
  }, 150);
}

function updateNavZones() {
  if (!DATA) return;
  document.getElementById('zonePrev').classList.toggle('disabled', currentIdx <= 0);
  document.getElementById('zoneNext').classList.toggle('disabled', currentIdx >= DATA.days.length - 1);
}

function renderMetrics() {
  if (!DATA) return;
  const day = DATA.days[currentIdx];
  const mobile = window.innerWidth <= 640;
  const parts = [fmtDate(day.day), `${currentIdx + 1}/${DATA.days.length}`];
  if (!mobile) {
    parts.push(
      `RDY ${day.readinessScore ?? '\u2014'}`,
      `SLP ${day.sleepScore ?? '\u2014'}`,
      `HRV ${day.hrv ?? '\u2014'}`,
      `RHR ${day.avgHeartRate?.toFixed(0) ?? '\u2014'}`,
      `DEEP ${day.deepSleepPct ? (day.deepSleepPct*100).toFixed(0)+'%' : '\u2014'}`,
      `REM ${day.remSleepPct ? (day.remSleepPct*100).toFixed(0)+'%' : '\u2014'}`,
      `T ${day.tempDeviation != null ? (day.tempDeviation >= 0 ? '+' : '') + day.tempDeviation.toFixed(2) : '\u2014'}`
    );
  }
  document.getElementById('infoLine').textContent = parts.join(' \u00b7 ');
}

// ═══ EVENT LISTENERS ═══
function setupEvents() {
  document.getElementById('zonePrev').addEventListener('click', () => navigate(-1));
  document.getElementById('zoneNext').addEventListener('click', () => navigate(1));
  document.getElementById('closeBtn').addEventListener('click', closeWork);

  document.getElementById('aboutOpen').addEventListener('click', () => {
    document.getElementById('overlay').classList.add('open');
  });
  document.getElementById('aboutClose').addEventListener('click', () => {
    document.getElementById('overlay').classList.remove('open');
  });
  document.getElementById('overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  // Symbiotic Art overlay
  document.getElementById('symArtBtn').addEventListener('click', () => {
    document.getElementById('symArtOverlay').classList.add('open');
  });
  document.getElementById('symArtClose').addEventListener('click', () => {
    document.getElementById('symArtOverlay').classList.remove('open');
  });
  document.getElementById('symArtOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const symOverlay = document.getElementById('symArtOverlay');
      if (symOverlay.classList.contains('open')) { symOverlay.classList.remove('open'); return; }
    }
    if (!activeWorkId) return;
    if (e.key === 'ArrowLeft') navigate(-1);
    if (e.key === 'ArrowRight') navigate(1);
    if (e.key === 'Escape') {
      const overlay = document.getElementById('overlay');
      if (overlay.classList.contains('open')) overlay.classList.remove('open');
      else closeWork();
    }
  });

  let touchStartX = 0;
  const canvasWrap = document.getElementById('canvasWrap');
  canvasWrap.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  canvasWrap.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) navigate(dx < 0 ? 1 : -1);
  }, { passive: true });

  window.addEventListener('resize', () => {
    if (activePainter) {
      fitCanvas(activePainter.canvasW, activePainter.canvasH);
      renderMetrics();
    }
  });
}

// ═══ BOOT ═══
async function main() {
  await loadData();
  renderGallery();
  setupEvents();
}

main();
