/*!
 * print-texture.js — generative riso / screen-print ink fill for HTML5 canvas.
 *
 * Reproduces ink on textured paper: fine paper GRAIN + low-frequency CLOUDY
 * tonal variation (ink pooling) + a soft light "bleed" halo along each shape's
 * edge. Deterministic from a seed (same seed → same texture). No dependencies.
 * Works as a <script> tag (global `PrintTexture`) or CommonJS require.
 *
 * ── USAGE (once per rendered frame) ────────────────────────────────────────
 *   const tex = PrintTexture.create(W, H, seed);   // build once per (W,H,seed)
 *   for (const shape of shapes)                     // shape = Path2D
 *     PrintTexture.paintForm(ctx, shape, tex);      // clip + fill each form
 *   PrintTexture.overlayGrain(ctx, tex);            // once, after all forms
 *   // …then draw text / UI on top — it stays crisp, above the grain.
 *
 * Cache `tex` and rebuild it only when W, H or seed change (it is the heavy part).
 *
 * ── OPTIONS ────────────────────────────────────────────────────────────────
 * create(W,H,seed, {
 *   lo:[13,13,12],   hi:[60,58,52],  // ink-dark → dim warm-gray cloud endpoints
 *   grain:46,                        // paper-grain amplitude around mid (0..80)
 *   cloudScale:12,                   // bigger = larger soft blobs
 *   cloudContrast:1.9,               // stretch of the cloud tonal range
 *   cloudBias:0.30,                  // lifts / darkens the clouds
 * })
 * paintForm(ctx, path, tex, { halo, haloColor })
 *   halo      edge-bleed width in px, 0 disables (default ≈1.6% of min side)
 *   haloColor the bleed colour       (default 'rgba(232,230,222,0.12)')
 * overlayGrain(ctx, tex, alpha)      alpha default 0.85
 *
 * For a LIGHTER mid-gray key (photocopy-of-gray look) raise the endpoints, e.g.
 *   PrintTexture.create(W,H,seed, { lo:[40,40,37], hi:[120,118,110] });
 *
 * Provenance: extracted from HOSQ R&D "lab" piece (nikolaigrigoriev.com/lab),
 * built to match a grainy screen-print reference. 2026-07.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PrintTexture = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

  // separable box blur on a Float32 grid — cheap smooth noise for the cloud field
  function smooth(a,w,h,iter){
    var b=new Float32Array(a.length), it,x,y,dx,dy,xx,yy,s,c;
    for(it=0;it<iter;it++){
      for(y=0;y<h;y++)for(x=0;x<w;x++){s=0;c=0;for(dx=-1;dx<=1;dx++){xx=x+dx;if(xx<0||xx>=w)continue;s+=a[y*w+xx];c++;}b[y*w+x]=s/c;}
      for(x=0;x<w;x++)for(y=0;y<h;y++){s=0;c=0;for(dy=-1;dy<=1;dy++){yy=y+dy;if(yy<0||yy>=h)continue;s+=b[yy*w+x];c++;}a[y*w+x]=s/c;}
    }
  }

  // Build reusable texture layers for a canvas size + seed.
  function create(W,H,seed,opts){
    opts=opts||{};
    var o={ lo:opts.lo||[13,13,12], hi:opts.hi||[60,58,52], grain:opts.grain!=null?opts.grain:46,
      cloudScale:opts.cloudScale||12, cloudContrast:opts.cloudContrast||1.9, cloudBias:opts.cloudBias!=null?opts.cloudBias:0.30 };
    var rnd=mulberry32((seed*2246822519)>>>0), i;

    // low-frequency cloud field → warm charcoal palette (soft ink pooling)
    var lw=Math.max(28,Math.round(W/o.cloudScale)), lh=Math.max(28,Math.round(H/o.cloudScale));
    var g1=new Float32Array(lw*lh); for(i=0;i<g1.length;i++) g1[i]=rnd();
    var g2=new Float32Array(lw*lh); for(i=0;i<g2.length;i++) g2[i]=rnd();
    smooth(g1,lw,lh,4); smooth(g2,lw,lh,1);
    var cc=document.createElement('canvas'); cc.width=lw; cc.height=lh;
    var cx=cc.getContext('2d'), cd=cx.createImageData(lw,lh);
    for(i=0;i<lw*lh;i++){ var v=0.72*g1[i]+0.28*g2[i]; v=Math.min(1,Math.max(0,(v-o.cloudBias)*o.cloudContrast));
      cd.data[i*4]  =o.lo[0]+(o.hi[0]-o.lo[0])*v;
      cd.data[i*4+1]=o.lo[1]+(o.hi[1]-o.lo[1])*v;
      cd.data[i*4+2]=o.lo[2]+(o.hi[2]-o.lo[2])*v;
      cd.data[i*4+3]=255;
    }
    cx.putImageData(cd,0,0);

    // high-frequency paper grain (neutral around 128 → use with 'overlay')
    var gc=document.createElement('canvas'); gc.width=W; gc.height=H;
    var gx=gc.getContext('2d'), gd=gx.createImageData(W,H);
    for(i=0;i<W*H;i++){ var n=128+(rnd()*2-1)*o.grain; gd.data[i*4]=gd.data[i*4+1]=gd.data[i*4+2]=n; gd.data[i*4+3]=255; }
    gx.putImageData(gd,0,0);

    return { form:cc, grain:gc, W:W, H:H, seed:seed, opts:o };
  }

  // Paint one clipped Path2D with the cloud texture + a soft edge bleed. Call per shape.
  function paintForm(ctx,path,tex,opts){
    opts=opts||{};
    var halo=opts.halo!=null?opts.halo:Math.max(6,Math.min(20,Math.round(Math.min(tex.W,tex.H)*0.016)));
    ctx.save(); ctx.clip(path); ctx.imageSmoothingEnabled=true;
    ctx.drawImage(tex.form,0,0,tex.W,tex.H);
    if(halo>0){
      ctx.lineWidth=halo; ctx.strokeStyle=opts.haloColor||'rgba(232,230,222,0.12)';
      if(ctx.filter!==undefined) ctx.filter='blur('+Math.round(halo*0.5)+'px)';
      ctx.stroke(path);
      if(ctx.filter!==undefined) ctx.filter='none';
    }
    ctx.restore();
  }

  // Overlay paper grain across the whole sheet (forms + ground). Call once, after all forms.
  function overlayGrain(ctx,tex,alpha){
    if(alpha==null) alpha=0.85;
    ctx.save(); ctx.globalCompositeOperation='overlay'; ctx.globalAlpha=alpha;
    ctx.drawImage(tex.grain,0,0,tex.W,tex.H);
    ctx.globalAlpha=1; ctx.globalCompositeOperation='source-over'; ctx.restore();
  }

  return { create:create, paintForm:paintForm, overlayGrain:overlayGrain };
});
