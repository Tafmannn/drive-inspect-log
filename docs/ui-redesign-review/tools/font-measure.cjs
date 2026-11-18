// Measures string widths, numeral alignment and font payload for the font comparison page.
const { chromium } = require('playwright'); const path=require('path'); const fs=require('fs'); const D=path.resolve(__dirname,'..');
(async()=>{ const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1500,height:900},deviceScaleFactor:1.5}); const p=await c.newPage();
 const fonts=[]; p.on('response',async r=>{const u=r.url(); if(/fonts\.gstatic\.com/.test(u)){try{const buf=await r.body();fonts.push({u:u.split('/').slice(-1)[0].slice(0,40),b:buf.length});}catch(e){}}});
 await p.goto('file://'+D+'/mockups/v2/10-font-comparison.html'); await p.waitForTimeout(2500); await p.evaluate(()=>document.fonts.ready);
 const res=await p.evaluate(()=>{
  const strs={route:'Newcastle-under-Lyme → Stratford-upon-Avon',route2:'Llanfairpwllgwyngyll → Aberystwyth',ref:'AX-10482',status:'IN PROGRESS',client:'Northgate Motors Remarketing & Fleet Services',para:'Collect from Unit 14, Example Park, Leeds LS1 0AA.'};
  const fam={inter:"'Inter'",roboto:"'Roboto'",arimo:"'Arimo'",dejavu:"'DejaVu Sans'"}; const out={};
  for(const [k,f] of Object.entries(fam)){ out[k]={w:{},num:{}};
   const mk=(txt,fs,fw,vn)=>{const s=document.createElement('span');s.style.cssText=`position:absolute;visibility:hidden;white-space:nowrap;font-family:${f},sans-serif;font-size:${fs}px;font-weight:${fw};font-variant-numeric:${vn||'normal'}`;s.textContent=txt;document.body.appendChild(s);const w=s.getBoundingClientRect().width;s.remove();return w;};
   for(const [n,t] of Object.entries(strs)) out[k].w[n]=+mk(t,13,n==='status'?600:(n==='ref'?600:400)).toFixed(1);
   const amts=['£1,111.11','£8,888.88','£1,000.00','£12,345.67'];
   out[k].num.tabular=amts.map(a=>+mk(a,14,400,'tabular-nums').toFixed(1)); out[k].num.proportional=amts.map(a=>+mk(a,14,400,'proportional-nums').toFixed(1));
   const cv=document.createElement('canvas').getContext('2d'); cv.font=`100px ${f}, sans-serif`; const mx=cv.measureText('x'); const mH=cv.measureText('H'); out[k].xheight=+(mx.actualBoundingBoxAscent/mH.actualBoundingBoxAscent).toFixed(3);
   out[k].loaded=document.fonts.check(`14px ${f}`);}
  return out;});
 await p.screenshot({path:D+'/screenshots/proposed-v2/v2-10-font-comparison.png',fullPage:true});
 const spread=a=>+(Math.max(...a)-Math.min(...a)).toFixed(1);
 for(const k of Object.keys(res)){res[k].num.tabularSpread=spread(res[k].num.tabular);res[k].num.proportionalSpread=spread(res[k].num.proportional);}
 const payload={}; fonts.forEach(f=>{payload[f.u]=f.b}); res._fontFiles=fonts;
 fs.writeFileSync(D+'/screenshots/font-measure.json',JSON.stringify(res,null,1));
 const ref=res.inter.w; console.log('Width of strings relative to Inter (13px):');
 for(const k of ['roboto','arimo','dejavu']){console.log(k,Object.fromEntries(Object.keys(ref).map(n=>[n,(res[k].w[n]/ref[n]*100).toFixed(0)+'%'])));}
 console.log('tabular spreads',Object.fromEntries(Object.keys(res).filter(k=>k[0]!=='_').map(k=>[k,res[k].num.tabularSpread])),'proportional',Object.fromEntries(Object.keys(res).filter(k=>k[0]!=='_').map(k=>[k,res[k].num.proportionalSpread])));
 console.log('xheight',Object.fromEntries(Object.keys(res).filter(k=>k[0]!=='_').map(k=>[k,res[k].xheight])),'loaded',Object.fromEntries(Object.keys(res).filter(k=>k[0]!=='_').map(k=>[k,res[k].loaded])));
 console.log('font files',fonts.map(f=>f.u+' '+(f.b/1024).toFixed(1)+'KB').join(' | '));
 await b.close();})();
