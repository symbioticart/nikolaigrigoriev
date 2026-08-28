// S5-05 — растение дня.
//
// Один прожитый день выращивает одно фантастическое растение: семенная
// голова, кувшинчик с усиками, раковина-веер, четыре зубчатых листа, рука
// со ступнёй, стебель, корни и река под ними. Каждый орган — отдельная
// сущность, и каждым правит один канал ночной записи. Правило публикуется:
// показатель можно прочитать обратно из листа, и работа этого не скрывает —
// как S5-04.
//
// День взвешен только против предыдущих: каналы _m приходят с сервера уже
// причинно замороженными (rule89.freezeDays89), поэтому прошлый день никогда
// не перерисовывается. Семя дня — _s, оно выращено из самого тела и не
// зависит от даты. Никакого Math.random.
//
// Тишина формы не трогает: молчащий день не выращивает ничего, а увядание
// ложится поверх готового листа хостом (silence: over).
(function (global) {
  'use strict';

  var BASE_W = 700, BASE_H = 1140;
  var INK = '#2b2016';

  function mkCanvas(w, h) {
    var c = (typeof document !== 'undefined')
      ? document.createElement('canvas')
      : global.__V91_CANVAS__(w, h);
    c.width = w; c.height = h; return c;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // ── геометрия ────────────────────────────────────────────────────────────
  function crSample(pts, per) {
    per = per || 14;
    var out = [], P = [pts[0]].concat(pts, [pts[pts.length - 1]]);
    for (var i = 0; i < P.length - 3; i++) {
      var p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
      for (var j = 0; j < per; j++) {
        var t = j / per, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    return out;
  }
  function normalsOf(line) {
    var ns = [];
    for (var i = 0; i < line.length; i++) {
      var a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      ns.push([-dy / L, dx / L]);
    }
    return ns;
  }
  function ribbon(line, wfn) {
    var ns = normalsOf(line), L = [], R = [];
    for (var i = 0; i < line.length; i++) {
      var t = i / (line.length - 1), w = wfn(t) / 2;
      L.push([line[i][0] + ns[i][0] * w, line[i][1] + ns[i][1] * w]);
      R.push([line[i][0] - ns[i][0] * w, line[i][1] - ns[i][1] * w]);
    }
    return L.concat(R.reverse());
  }

  // ── кисть ────────────────────────────────────────────────────────────────
  function makeBrush(ctx, rng) {
    function jitter(poly, amp) {
      var out = [];
      for (var i = 0; i < poly.length; i++)
        out.push([poly[i][0] + (rng() - 0.5) * amp, poly[i][1] + (rng() - 0.5) * amp]);
      return out;
    }
    function trace(poly, close) {
      ctx.beginPath();
      ctx.moveTo(poly[0][0], poly[0][1]);
      for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
      if (close) ctx.closePath();
    }
    return {
      shape: function (poly, fill, lw) {
        trace(jitter(poly, 1.2), true);
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        ctx.strokeStyle = INK; ctx.lineWidth = lw || 2.6;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.stroke();
      },
      line: function (pts, lw) {
        trace(jitter(pts, 1.1), false);
        ctx.strokeStyle = INK; ctx.lineWidth = lw || 2.2;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.stroke();
      }
    };
  }

  // ── палитра ──────────────────────────────────────────────────────────────
  function palette(warm) {
    var sh = Math.round(lerp(-8, 10, warm));
    var h = function (x) { return 'hsl(' + (x[0] + sh) + ' ' + x[1] + '% ' + x[2] + '%)'; };
    return {
      ground: '#f1ebdf',
      maroon: h([12, 42, 24]), redbrown: h([15, 46, 33]), brown: h([24, 45, 42]),
      tan: h([28, 40, 56]), pale: h([38, 30, 74]), rose: h([12, 30, 62]),
      darkleaf: h([16, 38, 22]), steel: '#5d6b8c', bluegray: '#6d7b96',
      teal: '#5e8a80', cream: '#efe8da', beige: h([34, 26, 70])
    };
  }

  // ── органы: каждый — сущность, каждым правит один канал ──────────────────
  function paramsOf(m) {
    return {
      warm:     m.breath,                                   // теплота палитры
      stem:     m.readiness,                                // высота и толщина
      seedHead: m.hrv,                                      // диаметр, извилины
      pod:      clamp((m.temp + 1) / 2, 0, 1),              // наклон, усики
      fanShell: m.sleep,                                    // рёбра, раскрытие
      armFoot:  m.efficiency,                               // размах ступни
      leafML:   m.deepPct,                                  // зубцы
      leafMR:   m.remPct,
      leafLL:   1 - m.restless,                             // полнота (покой)
      leafLR:   clamp((m.workoutIntensity || 0) / 24, 0, 1),
      roots:    m.sleepHours,                               // число и размах
      river:    1 - m.rhr                                   // ширина реки
    };
  }

  function drawRiver(ctx, B, rng, C, v) {
    var w0 = lerp(30, 52, v), i;
    var loop = [], cx = 92, cy = 655, rx = 92, ry = 46, rot = -0.35;
    for (i = 0; i <= 40; i++) {
      var a = i / 40 * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      loop.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    B.shape(ribbon(loop, function () { return w0 * 0.75; }), C.steel, 2.4);
    var line = crSample([[70, 700], [150, 745], [240, 860], [340, 960], [480, 1035], [620, 1090], [720, 1130]], 16);
    B.shape(ribbon(line, function (t) { return lerp(w0 * 0.8, w0 * 1.7, t); }), C.steel, 2.6);
    var ns = normalsOf(line);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
    for (i = 4; i < line.length - 4; i += 5) {
      var t = i / (line.length - 1), w = lerp(w0 * 0.8, w0 * 1.7, t) / 2;
      var p = line[i], n = ns[i];
      ctx.beginPath();
      ctx.moveTo(p[0] + n[0] * w * 0.9, p[1] + n[1] * w * 0.9);
      ctx.lineTo(p[0] + n[0] * (w * 0.9 - 6 - rng() * 5), p[1] + n[1] * (w * 0.9 - 6 - rng() * 5));
      ctx.stroke();
    }
    var line2 = crSample([[210, 1105], [350, 1060], [500, 1005], [640, 985]], 14);
    B.shape(ribbon(line2, function (t) { return lerp(20, 10, t); }), C.teal, 2.2);
  }

  function drawRoots(B, rng, C, v, base) {
    var count = Math.round(lerp(4, 7, v));
    var reach = lerp(130, 210, v);
    var cols = [C.steel, C.maroon, C.teal, C.brown, C.bluegray, C.darkleaf, C.steel];
    for (var i = 0; i < count; i++) {
      var f = count === 1 ? 0.5 : i / (count - 1);
      var tipX = base[0] + lerp(-330, 260, f) + (rng() - 0.5) * 50;
      var tipY = base[1] + reach * (0.7 + rng() * 0.5) - Math.abs(f - 0.5) * 60;
      var mid = [base[0] + (tipX - base[0]) * 0.22 + (rng() - 0.5) * 30,
                 base[1] + (tipY - base[1]) * 0.62 + (rng() - 0.5) * 24];
      var line = crSample([[base[0] + (f - 0.5) * 26, base[1] - 12], mid, [tipX, tipY]], 18);
      var w0 = lerp(22, 34, v);
      B.shape(ribbon(line, function (t) { return lerp(w0, 3.5, Math.pow(t, 0.85)); }), cols[i % cols.length], 2.8);
    }
  }

  function drawStem(ctx, B, rng, C, v) {
    var h = lerp(580, 700, v), w = lerp(24, 38, v);
    var base = [432, 940], top = [398, 940 - h];
    var line = crSample([base, [446, 940 - h * 0.35], [412, 940 - h * 0.72], top], 22);
    var tints = [C.maroon, C.redbrown, C.brown, C.pale, C.tan], segN = tints.length;
    for (var s = 0; s < segN; s++) {
      var a = Math.floor(line.length * s / segN), b = Math.floor(line.length * (s + 1) / segN);
      var seg = line.slice(Math.max(0, a - 1), b + 1);
      if (seg.length < 3) continue;
      (function (a, b) {
        B.shape(ribbon(seg, function (t) {
          var gt = (a + t * (b - a)) / line.length;
          return lerp(w * 1.15, w * 0.75, gt);
        }), tints[s], 2.4);
      })(a, b);
    }
    var ns = normalsOf(line);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    for (var i = 3; i < line.length - 2; i += 3) {
      var gt = i / (line.length - 1), hw = lerp(w * 1.15, w * 0.75, gt) / 2 * 0.85;
      var p = line[i], n = ns[i];
      ctx.beginPath();
      ctx.moveTo(p[0] - n[0] * hw, p[1] - n[1] * hw);
      ctx.quadraticCurveTo(p[0] + (rng() - 0.5) * 2, p[1] + 2, p[0] + n[0] * hw, p[1] + n[1] * hw);
      ctx.stroke();
    }
    return { line: line, top: top };
  }

  function drawSpikyLeaf(ctx, B, rng, C, v, attach, dir, len, col, spikeBase) {
    var spikes = Math.round(lerp(6, 13, v));
    var spikeLen = lerp(14, 30, v) * (spikeBase || 1);
    var tip = [attach[0] + dir * len, attach[1] - len * 0.16 - (rng() - 0.5) * 20];
    var mid = [attach[0] + dir * len * 0.5, attach[1] - len * 0.05 + (rng() - 0.5) * 14];
    var line = crSample([attach, mid, tip], 18);
    var ns = normalsOf(line);
    var bodyW = function (t) { return lerp(38, 10, Math.pow(t, 1.15)); };
    function side(sign) {
      var out = [], N = line.length - 1, toothIdx = [], s;
      for (s = 0; s < spikes; s++)
        toothIdx.push(Math.round(N * lerp(0.12, 0.92, spikes === 1 ? 0.5 : s / (spikes - 1))));
      var i = 0;
      while (i <= N) {
        var t = i / N, w = bodyW(t) / 2;
        var edge = [line[i][0] + ns[i][0] * w * sign, line[i][1] + ns[i][1] * w * sign];
        var isTooth = false;
        for (s = 0; s < toothIdx.length; s++) if (Math.abs(toothIdx[s] - i) <= 1) { isTooth = true; break; }
        if (isTooth && i < N - 2) {
          var sl = spikeLen * (0.65 + 0.5 * Math.sin(t * Math.PI)) * (0.85 + rng() * 0.3);
          var n = ns[i], bx = -dir * 0.45;
          out.push(edge);
          out.push([edge[0] + (n[0] * sign + bx) * sl, edge[1] + (n[1] * sign) * sl - 3]);
          var j = Math.min(i + 3, N), tw = bodyW(j / N) / 2;
          out.push([line[j][0] + ns[j][0] * tw * sign, line[j][1] + ns[j][1] * tw * sign]);
          i = j + 1;
        } else { out.push(edge); i++; }
      }
      return out;
    }
    var up = side(1), down = side(-1).reverse();
    B.shape(up.concat([[tip[0] + dir * 10, tip[1]]], down), col, 2.6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.3;
    for (var i = 4; i < line.length - 4; i += 5) {
      var t = i / (line.length - 1), hw = bodyW(t) / 2 * 0.8;
      var p = line[i], n = ns[i];
      ctx.beginPath();
      ctx.moveTo(p[0] - n[0] * hw, p[1] - n[1] * hw);
      ctx.lineTo(p[0] + n[0] * hw, p[1] + n[1] * hw);
      ctx.stroke();
    }
  }

  function drawSeedHead(ctx, B, rng, C, v, stalkFrom) {
    var R = lerp(62, 96, v), c = [268, 168], i;
    var line = crSample([stalkFrom, [(stalkFrom[0] + c[0]) / 2 + 18, (stalkFrom[1] + c[1]) / 2], [c[0] + R * 0.3, c[1] + R * 0.75]], 14);
    B.shape(ribbon(line, function (t) { return lerp(13, 8, t); }), C.brown, 2.2);
    var teeth = 26, poly = [];
    for (i = 0; i < teeth * 4; i++) {
      var a = i / (teeth * 4) * Math.PI * 2;
      var tooth = (Math.abs(((i % 4) / 4) - 0.5) < 0.25) ? 1.0 : 1.09;
      var rr = R * tooth * (1 + (rng() - 0.5) * 0.02);
      poly.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr * 0.94]);
    }
    B.shape(poly, C.brown, 2.8);
    function ring(rx, ry, col, lw) {
      var q = [];
      for (var k = 0; k < 44; k++) {
        var a = k / 44 * Math.PI * 2;
        q.push([c[0] + Math.cos(a) * rx, c[1] + Math.sin(a) * ry]);
      }
      B.shape(q, col, lw);
    }
    ring(R * 0.8, R * 0.76, C.tan, 2.0);
    ring(R * 0.6, R * 0.56, C.redbrown, 1.8);
    var squiggles = Math.round(lerp(3, 8, v));
    ctx.strokeStyle = C.cream; ctx.lineWidth = 4.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var s = 0; s < squiggles; s++) {
      var x = c[0] + (rng() - 0.5) * R * 0.7, y = c[1] + (rng() - 0.5) * R * 0.6;
      ctx.beginPath(); ctx.moveTo(x, y);
      var a2 = rng() * Math.PI * 2;
      for (var k2 = 0; k2 < 7; k2++) {
        a2 += (rng() - 0.5) * 2.2;
        x += Math.cos(a2) * 9; y += Math.sin(a2) * 9;
        var dx = x - c[0], dy = y - c[1], d = Math.hypot(dx, dy);
        if (d > R * 0.62) { x = c[0] + dx / d * R * 0.55; y = c[1] + dy / d * R * 0.55; }
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawPod(ctx, B, rng, C, v) {
    var tilt = lerp(-0.15, 0.3, v), c = [498, 186];
    ctx.save();
    ctx.translate(c[0], c[1]); ctx.rotate(tilt);
    var body = [[-58, -42], [-48, 36], [-25, 58], [18, 60], [43, 38], [55, -38]];
    B.shape(crSample(body.concat([[58, -48], [-58, -48]]), 8), C.beige, 2.8);
    B.shape(crSample([[-60, -45], [0, -58], [60, -45], [0, -32]], 8), C.tan, 2.4);
    ctx.restore();
    var antN = Math.round(lerp(1, 3, v));
    for (var i = 0; i < antN; i++) {
      var x0 = c[0] - 18 + i * 20, y0 = c[1] - 56;
      var pts = [[x0, y0]], x = x0, y = y0, a = -Math.PI / 2 + (rng() - 0.5) * 0.8;
      for (var k = 0; k < 10; k++) {
        a += (rng() - 0.5) * 1.3 + (k > 5 ? 0.6 : 0);
        x += Math.cos(a) * 11; y += Math.sin(a) * 11;
        pts.push([x, y]);
      }
      B.line(crSample(pts, 6), 4.2);
    }
  }

  function drawFanShell(ctx, B, rng, C, v, attach) {
    var c = [158, 420], i;
    var line = crSample([attach, [(attach[0] + c[0]) / 2, attach[1] - 10], [c[0] + 80, c[1] - 4]], 12);
    B.shape(ribbon(line, function (t) { return lerp(16, 11, t); }), C.brown, 2.4);
    var W = lerp(150, 200, v), H = lerp(110, 150, v), rot = -0.5;
    function px(a, r1, r2) {
      var x = Math.cos(a) * r1, y = Math.sin(a) * r2;
      return [c[0] + x * Math.cos(rot) - y * Math.sin(rot), c[1] + x * Math.sin(rot) + y * Math.cos(rot)];
    }
    var outer = [];
    for (i = 0; i <= 48; i++) outer.push(px(i / 48 * Math.PI * 2, W / 2, H / 2));
    B.shape(outer, C.brown, 3.0);
    var focus = px(0.35, W * 0.30, H * 0.30);
    var ribs = Math.round(lerp(6, 13, v));
    var arc = [];
    for (i = 0; i <= 32; i++) arc.push(px(Math.PI * 0.4 + (i / 32) * Math.PI * 1.25, W * 0.42, H * 0.42));
    B.shape([focus].concat(arc), C.steel, 2.2);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.7;
    for (i = 0; i <= ribs; i++) {
      var e = px(Math.PI * 0.4 + (i / ribs) * Math.PI * 1.25, W * 0.42, H * 0.42);
      ctx.beginPath();
      ctx.moveTo(focus[0], focus[1]);
      ctx.quadraticCurveTo((focus[0] + e[0]) / 2 + (rng() - 0.5) * 6, (focus[1] + e[1]) / 2 + (rng() - 0.5) * 6, e[0], e[1]);
      ctx.stroke();
    }
  }

  function drawArmFoot(ctx, B, rng, C, v, attach) {
    var spread = lerp(42, 72, v);
    var elbow = [attach[0] + 95, attach[1] - 28], end = [634, attach[1] - 78];
    var line = crSample([attach, elbow, [560, attach[1] - 64], end], 16);
    B.shape(ribbon(line, function (t) { return lerp(15, 10, t); }), C.tan, 2.4);
    var ns = normalsOf(line), i;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    for (i = 4; i < line.length - 3; i += 4) {
      var p = line[i], n = ns[i], hw = lerp(15, 10, i / (line.length - 1)) / 2 * 0.8;
      ctx.beginPath();
      ctx.moveTo(p[0] - n[0] * hw, p[1] - n[1] * hw);
      ctx.lineTo(p[0] + n[0] * hw, p[1] + n[1] * hw);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(end[0], end[1]); ctx.rotate(-0.9);
    B.shape(crSample([[0, -8], [spread * 0.9, -spread * 0.9], [spread * 1.15, 0], [spread * 0.9, spread * 0.55], [0, 10]], 8), C.brown, 2.4);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
    for (i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(4, 0);
      ctx.lineTo(spread * (0.85 + 0.2 * (i % 2)), lerp(-spread * 0.7, spread * 0.45, i / 4));
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── день ─────────────────────────────────────────────────────────────────
  function paintDay(p, day, DATA, w, h) {
    var days = DATA.days || DATA, d = null;
    for (var i = 0; i < days.length; i++) if (days[i].day === day.day) { d = days[i]; break; }
    if (!d || !d._m) return null;
    var m = d._m;
    var rng = mulberry32(d._s >>> 0);
    var P = paramsOf(m);
    var C = palette(P.warm);

    var canvas = mkCanvas(w, h);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(w / BASE_W, 0, 0, h / BASE_H, 0, 0);
    var B = makeBrush(ctx, rng);

    ctx.fillStyle = C.ground;
    ctx.fillRect(0, 0, BASE_W, BASE_H);
    ctx.fillStyle = 'rgba(120,100,70,0.04)';
    for (i = 0; i < 900; i++) ctx.fillRect(rng() * BASE_W, rng() * BASE_H, 1.5, 1.5);

    var stemBase = [432, 940];
    drawRiver(ctx, B, rng, C, P.river);
    drawRoots(B, rng, C, P.roots, stemBase);
    var stem = drawStem(ctx, B, rng, C, P.stem);
    var L = stem.line;
    var at = function (f) { return L[Math.floor((L.length - 1) * f)]; };

    drawSpikyLeaf(ctx, B, rng, C, P.leafLL, at(0.18), -1, 175, C.rose, 1.0);
    drawSpikyLeaf(ctx, B, rng, C, P.leafLR, at(0.24), 1, 185, C.darkleaf, 1.05);
    drawSpikyLeaf(ctx, B, rng, C, P.leafML, at(0.46), -1, 190, C.brown, 1.0);
    drawSpikyLeaf(ctx, B, rng, C, P.leafMR, at(0.50), 1, 195, C.darkleaf, 1.1);
    drawArmFoot(ctx, B, rng, C, P.armFoot, at(0.78));
    drawFanShell(ctx, B, rng, C, P.fanShell, at(0.72));
    drawSeedHead(ctx, B, rng, C, P.seedHead, stem.top);
    drawPod(ctx, B, rng, C, P.pod);

    return canvas;
  }

  global.V93Painter = { paintDay: paintDay, paramsOf: paramsOf };
})(typeof self !== 'undefined' ? self : globalThis);
