// S5-04 — накопительный холст, тесная кладка.
//
// Тот же лист и то же правило, что у S5-03, с двумя расхождениями: день
// занимает вчетверо меньше места, и краска уходит из него быстрее на треть.
// Тело то же, шаг мельче и память короче — лист набирается из многих мелких
// дней, а не из немногих крупных, и глубина под свежими днями начинается
// раньше.
//
// Один прожитый день кладёт на лист одну тёмную форму поверх предыдущих.
// Композиция не выбирается: место дня — его час засыпания на суточном
// циферблате и то, насколько сон выпал из своего часа; силуэт дня вырезают
// соседи последних недель — прошлые, но не будущие. Поэтому лист читается как
// археология: последние дни лежат сверху и прорезают в накопленной массе
// кремовые протоки, ранние уходят под них.
//
// Формы ложатся встык и сливаются: между обычными днями зазора нет, и день
// от дня отделяет только край краски. Кремовая протока осталась ровно в одном
// месте — вокруг формы, которой лист вернулся после долгого молчания. Это
// единственная светлая линия на листе, и она означает смерть.
//
// Геометрия унаследована у HOSQ R&D Lab: ячейка, инсет к центроиду, рёбра,
// замещённые дугами и острыми клювами, печатная заливка. Суперэллипс Ламе не
// вычисляется формулой — знаковая амплитуда дуг даёт тот же диапазон, от
// втянутой со всех сторон астроиды до полного скруглённого тела.
//
// Тишина формы не трогает: молчащий день просто не кладёт мазка, а выцветание
// накладывает узел поверх готового листа (art/silence.js, канон C-12). Кроме
// одного места, которое канон называет прямо: возвращение после долгого
// молчания пишется удвоенной протокой — шрамом шва.
(function (global) {
  'use strict';

  var PAPER = '#eee9dd';

  var S = {
    gap: 0, scarGap: 0.14, scarAfter: 14,
    area: 0.024, stepsLo: 0.40, stepsHi: 1.60, scaleLo: 0.10, scaleHi: 4.00,
    window: 50, rMax: 0.40,
    // Выцветание с возрастом: день теряет плотность и в конце остаётся
    // волосяной линией. Ничего не стирается — уходит в глубину.
    fillLife: 42, fillCurve: 2.2, hairMin: 0.04,
    hairAlpha: 0.26, hairWidth: 0.55,
    bowLo: -0.30, bowHi: 0.55, tiltDeg: 40,
    beakMax: 6, beakShare: 0.4, beakHour: 3600, beakMinL: 16, beakOut: 0.55,
    pct: 365, shortHistory: 14,
  };

  var CH = ['hrv', 'bed', 'timing', 'steps', 'stress', 'temp'];

  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  function edgeHash(x0,y0,x1,y1,salt){var a=Math.round(x0)+Math.round(x1),b=Math.round(y0)+Math.round(y1);var h=(a*73856093)^(b*19349663)^(salt*83492791);h>>>=0;return mulberry32(h)();}
  function seedForDay(iso){return (+iso.slice(0,4)*1000 + +iso.slice(5,7)*50 + +iso.slice(8,10))>>>0;}
  function num(v,d){ return (v==null||v!==v) ? d : v; }

  // ── причинные перцентили ──────────────────────────────────────────────────
  // День взвешивается только против предыдущих — доля прошлых дней, которые
  // были ниже, с половинным весом равных. Так же считает rule.js для 87.
  //
  // Здесь это не только закон, но и вся раскладка: ранг распределён по [0,1]
  // равномерно по построению, а прежняя нормировка «размах между p5 и p95»
  // равномерной не была. Тело ложится спать в один и тот же час: восемьдесят
  // процентов ночей укладывались в четыре часа, то есть в шестьдесят градусов
  // циферблата, и лист собирался в один клин. Ранг разворачивает те же ночи на
  // весь круг, не выдумывая ни одной.
  function causalPercentile(values, v){
    if(v==null || v!==v || !values.length) return 0.5;
    var below=0, equal=0, i;
    for(i=0;i<values.length;i++){ if(values[i]<v) below++; else if(values[i]===v) equal++; }
    var p=(below+0.5*equal)/values.length, n=values.length;
    // Короткая история читается тихо, а не истерично: первые дни держатся
    // середины, пока им не с чем себя сравнить.
    return n<S.shortHistory ? 0.5+(p-0.5)*(n/S.shortHistory) : p;
  }
  function normalize(days){
    var out=new Array(days.length), c, i, j, from, hist, v;
    for(i=0;i<days.length;i++){
      var n={}; from=Math.max(0,i-S.pct+1);
      for(c=0;c<CH.length;c++){
        hist=[];
        for(j=from;j<i;j++){ v=days[j][CH[c]]; if(v!=null) hist.push(v); }
        n[CH[c]]=causalPercentile(hist, days[i][CH[c]]);
      }
      out[i]=n;
    }
    return out;
  }

  // ── многоугольники ────────────────────────────────────────────────────────
  function polyCentroid(pts){
    var a=0,cx=0,cy=0,i,n=pts.length,x0,y0,x1,y1,cr;
    for(i=0;i<n;i++){x0=pts[i][0];y0=pts[i][1];x1=pts[(i+1)%n][0];y1=pts[(i+1)%n][1];
      cr=x0*y1-x1*y0;a+=cr;cx+=(x0+x1)*cr;cy+=(y0+y1)*cr;}
    a*=0.5;
    if(Math.abs(a)<1e-6){var mx=0,my=0;for(i=0;i<n;i++){mx+=pts[i][0];my+=pts[i][1];}return[mx/n,my/n,0];}
    return [cx/(6*a), cy/(6*a), Math.abs(a)];
  }
  // Полуплоскость «ближе к c, чем к q» — граница между двумя днями.
  function clipHalf(poly,c,q){
    var mx=(c[0]+q[0])/2, my=(c[1]+q[1])/2, nx=q[0]-c[0], ny=q[1]-c[1];
    var out=[],i,P,Q,sp,sq,t;
    var side=function(p){ return (p[0]-mx)*nx+(p[1]-my)*ny; };   // <0 — сторона c
    for(i=0;i<poly.length;i++){
      P=poly[i]; Q=poly[(i+1)%poly.length]; sp=side(P); sq=side(Q);
      if(sp<=0) out.push(P);
      if((sp<0&&sq>0)||(sp>0&&sq<0)){ t=sp/(sp-sq);
        out.push([P[0]+(Q[0]-P[0])*t, P[1]+(Q[1]-P[1])*t]); }
    }
    return out;
  }
  // Ячейка дня среди соседей: лист, обрезанный серединными перпендикулярами.
  // Соседей десятки, поэтому диаграмма целиком не нужна — и внешняя
  // библиотека в рантайме тоже.
  function cellFor(c,neighbours,W,H){
    var poly=[[0,0],[W,0],[W,H],[0,H]],i;
    for(i=0;i<neighbours.length && poly.length>=3;i++){
      if(neighbours[i][0]===c[0] && neighbours[i][1]===c[1]) continue;
      poly=clipHalf(poly,c,neighbours[i]);
    }
    return poly.length>=3?poly:null;
  }
  function scalePoly(poly,cx,cy,k){var i,o=[];for(i=0;i<poly.length;i++)o.push([cx+(poly[i][0]-cx)*k, cy+(poly[i][1]-cy)*k]);return o;}
  function rotatePoly(poly,cx,cy,a){var c=Math.cos(a),s=Math.sin(a),i,o=[],x,y;
    for(i=0;i<poly.length;i++){x=poly[i][0]-cx;y=poly[i][1]-cy;o.push([cx+x*c-y*s, cy+x*s+y*c]);}return o;}
  function insetPolygon(poly,cx,cy,g){return scalePoly(poly,cx,cy,1-g);}

  // Рёбра → дуги со знаком (наружу при полном контуре, внутрь при втянутом)
  // и острые клювы. Клювы — всегда меньшинство рёбер: иначе форма не колется,
  // а просто раздувается.
  function curvySilhouette(poly,cx,cy,bow,beaks){
    var n=poly.length,i,edges=[],a,b;
    for(i=0;i<n;i++){a=poly[i];b=poly[(i+1)%n];edges.push({i:i,L:Math.hypot(b[0]-a[0],b[1]-a[1])});}
    var cap=Math.min(beaks, Math.floor(n*S.beakShare)), sharp={};
    edges.filter(function(e){return e.L>S.beakMinL;})
         .sort(function(p,q){return q.L-p.L || p.i-q.i;})
         .slice(0,cap).forEach(function(e){ sharp[e.i]=1; });

    var path=new Path2D(), outline=[], x0,y0,x1,y1,dx,dy,L,nx,ny,mx,my,h,amp,qx,qy,k,px,py,t,u,iu;
    path.moveTo(poly[0][0],poly[0][1]);
    for(i=0;i<n;i++){
      x0=poly[i][0];y0=poly[i][1];x1=poly[(i+1)%n][0];y1=poly[(i+1)%n][1];
      dx=x1-x0;dy=y1-y0;L=Math.hypot(dx,dy)||1;
      nx=-dy/L;ny=dx/L;mx=(x0+x1)/2;my=(y0+y1)/2;
      if((mx-cx)*nx+(my-cy)*ny<0){nx=-nx;ny=-ny;}
      if(sharp[i]){
        k=L*S.beakOut; px=mx+nx*k; py=my+ny*k;
        path.lineTo(px,py); path.lineTo(x1,y1); outline.push([px,py],[x1,y1]);
      } else {
        h=edgeHash(x0,y0,x1,y1,1); amp=(0.55+0.9*h)*L*bow;
        qx=mx+nx*amp; qy=my+ny*amp;
        path.quadraticCurveTo(qx,qy,x1,y1);
        for(t=1;t<=5;t++){u=t/5;iu=1-u;
          outline.push([iu*iu*x0+2*iu*u*qx+u*u*x1, iu*iu*y0+2*iu*u*qy+u*u*y1]);}
      }
    }
    path.closePath();
    return {path:path, outline:outline};
  }

  // ── день ──────────────────────────────────────────────────────────────────
  // Место: угол — час засыпания на суточном циферблате (полночь вверху),
  // вынос из середины — насколько сон выпал из своего часа.
  // Место дня — две его собственные меры, обе взятые рангом против прошлых
  // дней. Угол по кругу: насколько поздно тело легло спать по меркам самого
  // себя — самая ранняя из его ночей наверху, дальше по часовой стрелке к
  // самой поздней. Вынос из середины: насколько сон выпал из своего часа —
  // попал в свой час, лёг у середины листа, сбился, ушёл к краю.
  //
  // Вынос берётся корнем: ранг распределён равномерно, но радиус, взятый из
  // него напрямую, сгущал бы дни к центру — плотность росла бы как единица на
  // радиус. Корень раскладывает их по площади ровно. Считается в долях
  // стороны, а не по кругу: иначе углы листа не заполнялись бы никогда.
  function dayCenter(nrm,day,W,H){
    var th=num(nrm.bed,0.5)*Math.PI*2-Math.PI/2;
    var u=Math.sqrt(1-num(nrm.timing,0.5));
    return [W/2+Math.cos(th)*u*S.rMax*W, H/2+Math.sin(th)*u*S.rMax*H];
  }
  function dayForm(day,nrm,centers,W,H,scar){
    var c=dayCenter(nrm,day,W,H);
    var cell=cellFor(c, centers.slice(-S.window), W, H);
    if(!cell) return null;
    var ct=polyCentroid(cell);
    var target=S.area*W*H*(S.stepsLo+(S.stepsHi-S.stepsLo)*num(nrm.steps,0.5));
    var k=Math.max(S.scaleLo, Math.min(S.scaleHi, Math.sqrt(target/Math.max(1,ct[2]))));
    var poly=scalePoly(cell,ct[0],ct[1],k);
    poly=rotatePoly(poly,ct[0],ct[1],(num(nrm.temp,0.5)-0.5)*2*S.tiltDeg*Math.PI/180);
    var bow=S.bowLo+(S.bowHi-S.bowLo)*num(nrm.hrv,0.5);
    var beaks=Math.max(0,Math.min(S.beakMax,Math.round(num(day.stress,0)/S.beakHour)));
    var gap=scar?S.scarGap:S.gap;
    return {
      center:c, scar:!!scar,
      outer:scar?curvySilhouette(poly,ct[0],ct[1],bow,beaks):null,
      inner:curvySilhouette(gap?insetPolygon(poly,ct[0],ct[1],gap):poly,ct[0],ct[1],bow,beaks),
    };
  }

  function daysBetween(a,b){return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);}

  // ── лист ──────────────────────────────────────────────────────────────────
  // Лист переписывается целиком на каждый показанный день: возраст каждой формы
  // меняется вместе с ним, а от возраста зависит, сколько в ней осталось
  // краски. Свежий день лежит плотным телом, дальше плотность уходит, и от
  // старого дня остаётся волосяная линия — контур того, что было. Ничего не
  // стирается: прожитое уходит вглубь, а не исчезает. Новый день ложится сверху
  // и закрывает собой часть старых линий.
  var cache = null;

  function mkCanvas(w,h){
    var c = (typeof document!=='undefined')
      ? document.createElement('canvas')
      : global.__V91_CANVAS__(w,h);
    c.width=w; c.height=h; return c;
  }

  function paintDay(p, day, DATA, w, h) {
    var days = DATA.days || DATA;
    var upto = 0, i;
    for(i=0;i<days.length;i++){ if(days[i].day<=day.day) upto=i; else break; }

    // Тяжёлое здесь — зерно и облака бумаги: они свойство листа, не дня, и
    // пересчитываются только при смене размера или самой записи.
    if(!cache || cache.w!==w || cache.h!==h || cache.n!==days.length){
      cache={ w:w, h:h, n:days.length, nrm:normalize(days),
              tex:global.PrintTexture.create(w,h,seedForDay(days[0].day)),
              canvas:mkCanvas(w,h) };
      cache.ctx=cache.canvas.getContext('2d');
    }

    var ctx=cache.ctx, centers=[];
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha=1;
    ctx.fillStyle=PAPER;
    ctx.fillRect(0,0,w,h);

    for(i=0;i<=upto;i++){
      var d=days[i];
      var prev=i>0?days[i-1].day:null;
      var scar=prev ? daysBetween(prev,d.day)-1 > S.scarAfter : false;
      var f=dayForm(d, cache.nrm[i], centers, w, h, scar);
      if(!f) continue;
      centers.push(f.center);

      var age=daysBetween(d.day, day.day);
      var fill=Math.pow(Math.max(0,1-age/S.fillLife), S.fillCurve);
      if(fill>S.hairMin){
        ctx.globalAlpha=fill;
        if(f.outer){ ctx.fillStyle=PAPER; ctx.fill(f.outer.path); }
        global.PrintTexture.paintForm(ctx, f.inner.path, cache.tex);
      }
      // Волосяная линия остаётся у каждого дня и держит его после того, как
      // краска ушла. У свежих дней она под собственным телом и не видна.
      ctx.globalAlpha=S.hairAlpha*(1-fill*0.75);
      ctx.strokeStyle='#141310';
      ctx.lineWidth=S.hairWidth;
      ctx.stroke(f.inner.path);
    }
    ctx.globalAlpha=1;

    var outC=mkCanvas(w,h), oc=outC.getContext('2d');
    oc.drawImage(cache.canvas,0,0);
    global.PrintTexture.overlayGrain(oc, cache.tex);
    return outC;
  }

  global.V92Painter = { paintDay: paintDay, normalize: normalize, S: S, PAPER: PAPER };
})(typeof self !== 'undefined' ? self : globalThis);
