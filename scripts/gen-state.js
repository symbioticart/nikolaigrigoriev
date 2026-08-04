// Готовые картинки последних состояний каждой работы. Зритель видит их сразу и
// может пролистать несколько дней назад, ни разу не разбудив движок.
const fs=require('fs'), path=require('path');
const puppeteer=require('puppeteer-core');
const CHROME=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SITE=process.argv[2]||'https://nikolaigrigoriev.com';
const OUT=process.argv[3]||'.';
const KEEP=parseInt(process.argv[4]||'5',10);
const SIZES={'87':[1400,1000],'89':[920,1350]};
const addDays=(iso,n)=>new Date(Date.parse(iso+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);

(async()=>{
  const b=await puppeteer.launch({executablePath:CHROME,headless:'new',
    args:['--no-sandbox','--enable-unsafe-swiftshader','--hide-scrollbars']});
  const manifest={};
  for(const work of Object.keys(SIZES)){
    const p=await b.newPage();
    await p.setViewport({width:400,height:400});
    await p.evaluateOnNewDocument(()=>{window.__m=[];window.__ready=null;
      addEventListener('message',e=>{const m=e.data;if(m&&m.__art){window.__m.push(m);if(m.type==='ready')window.__ready=m;}});});
    await p.goto(`${SITE}/art/render.html?work=${work}`,{waitUntil:'networkidle2',timeout:120000});
    await p.waitForFunction('window.__ready!==null',{timeout:180000});
    const ready=await p.evaluate(()=>window.__ready);
    const [w,h]=SIZES[work];
    const dates=[]; for(let k=KEEP-1;k>=0;k--) dates.push(addDays(ready.last,-k));
    let seq=0;
    for(const date of dates){
      const id=++seq;
      const res=await p.evaluate(async(reqId,date,w,h)=>await new Promise(r=>{
        const iv=setInterval(()=>{const hit=window.__m.find(m=>m.type==='render'&&m.reqId===reqId);
          if(hit){clearInterval(iv);r(hit);}},30);
        postMessage({__artcmd:true,type:'render',reqId,date,w,h},'*');
      }),id,date,w,h);
      if(!res||!res.ok){console.log(`  ${work} ${date}: пропуск (${res&&res.err})`);continue;}
      const webp=await p.evaluate(async(url)=>{const im=new Image();im.src=url;await im.decode();
        const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
        c.getContext('2d').drawImage(im,0,0);return c.toDataURL('image/webp',0.92);},res.url);
      const buf=Buffer.from(webp.split(',')[1],'base64');
      fs.writeFileSync(path.join(OUT,`${work}-${date}.webp`),buf);
      if(date===ready.last) fs.writeFileSync(path.join(OUT,`${work}.webp`),buf);  // «сегодня»
      console.log(`  ${work} ${date}: ${(buf.length/1024).toFixed(0)}кб`);
    }
    manifest[work]=dates;
    await p.close();
  }
  fs.writeFileSync(path.join(OUT,'index.json'),JSON.stringify(manifest));
  // подчистить состояния, вышедшие из окна
  const live=new Set(Object.entries(manifest).flatMap(([w,ds])=>ds.map(d=>`${w}-${d}.webp`)).concat(Object.keys(manifest).map(w=>`${w}.webp`),['index.json']));
  for(const f of fs.readdirSync(OUT)) if(!live.has(f)&&/\.(webp|json)$/.test(f)){fs.unlinkSync(path.join(OUT,f));console.log(`  убрано устаревшее: ${f}`);}
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
