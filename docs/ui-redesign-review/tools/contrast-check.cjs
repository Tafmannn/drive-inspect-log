// Rendered-DOM contrast checker (WCAG 2.x relative luminance). Usage: NODE_PATH=$(npm root -g) node contrast-check.cjs <out.json>
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const D=path.resolve(__dirname,'..'); const M=D+'/mockups/v2/';
const pages=['01-command-center','02-jobs','02b-jobs-queues','03-job-detail-mobile','04-inspection-mobile','05-admin-dashboard','06a-super-admin-control','06b-super-admin-dashboard','06c-super-admin-settings','08-states','09a-stress-jobs-large-table','09b-stress-dense-dashboard','09c-stress-photos','09d-stress-form-validation','09e-stress-settings','09f-stress-mobile-content'];
(async()=>{
 const b=await chromium.launch(); const all=[];
 for(const name of pages){
  const c=await b.newContext({viewport:{width:name.match(/^(03|04|09c|09f)/)?2400:1440,height:900}}); const p=await c.newPage();
  await p.goto('file://'+M+name+'.html'); await p.waitForTimeout(500);
  const r=await p.evaluate(()=>{
   const parse=s=>{const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return {r:0,g:0,b:0,a:0}; const v=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1};};
   const blend=(f,bg)=>({r:f.r*f.a+bg.r*(1-f.a),g:f.g*f.a+bg.g*(1-f.a),b:f.b*f.a+bg.b*(1-f.a),a:1});
   const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
   const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
   const bgs=el=>{ // list of candidate opaque backgrounds
     let cands=[{r:255,g:255,b:255,a:1}]; const chain=[];
     for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);const bi=cs.backgroundImage;const c=parse(cs.backgroundColor);
       if(bi&&bi!=='none'&&/gradient/.test(bi)){const cols=[...bi.matchAll(/rgba?\([^)]+\)/g)].map(m=>parse(m[0]));chain.push({grad:cols}); if(cols.every(x=>x.a>=1))break;}
       if(c.a>0){chain.push({c}); if(c.a>=1)break;}}
     for(const L of chain.reverse()){ if(L.grad){cands=L.grad.flatMap(g=>cands.map(bg=>blend(g,bg)));} else {cands=cands.map(bg=>blend(L.c,bg));} }
     return cands;};
   const opac=el=>{let o=1;for(let e=el;e;e=e.parentElement)o*=parseFloat(getComputedStyle(e).opacity);return o;};
   const out={text:{n:0,fail:[],disabled:0,min:99,minSample:''},nontext:[]};
   const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   const seen=new Set(); let n;
   while(n=walker.nextNode()){
     const t=n.textContent.trim(); if(!t)continue; const el=n.parentElement; if(!el||seen.has(el))continue; if(el.closest('.note,.ribbon,script,style'))continue;
     const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')continue; const rc=el.getBoundingClientRect(); if(rc.width===0||rc.height===0)continue;
     seen.add(el);
     const dis=!!el.closest('[disabled],.is-disabled,[aria-disabled=true]');
     const fg=parse(cs.color); const o=opac(el); const fgA={...fg,a:fg.a*(dis?1:o)};
     const fs=parseFloat(cs.fontSize),fw=parseInt(cs.fontWeight); const large=fs>=24||(fs>=18.66&&fw>=700); const need=large?3:4.5;
     let worst=99,wbg=null; const bl=bgs(el); for(const bg of bl){const eff=blend(fgA,bg);const rr=ratio(eff,bg); if(rr<worst){worst=rr;wbg=bg;}}
     if(dis){out.text.disabled++;continue;}
     out.text.n++; if(worst<out.text.min){out.text.min=worst;out.text.minSample=t.slice(0,30);}
     if(worst<need)out.text.fail.push({t:t.slice(0,40),ratio:+worst.toFixed(2),need,fs,color:cs.color,bg:`rgb(${Math.round(wbg.r)},${Math.round(wbg.g)},${Math.round(wbg.b)})`,cls:(el.className||'').toString().slice(0,40)});
   }
   // placeholders
   document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{ if(el.closest('.note,.ribbon')||el.value)return; const rc=el.getBoundingClientRect(); if(!rc.width)return; const ph=parse(getComputedStyle(el,'::placeholder').color); const bg=bgs(el)[0]; const rr=ratio(blend(ph,bg),bg); out.text.n++; if(rr<out.text.min){out.text.min=rr;out.text.minSample='placeholder: '+el.placeholder.slice(0,20)}; if(rr<4.5)out.text.fail.push({t:'placeholder: '+el.placeholder,ratio:+rr.toFixed(2),need:4.5});});
   // non-text: control boundaries (3:1)
   const chk=(sel,label,getC)=>document.querySelectorAll(sel).forEach(el=>{ if(el.closest('.note,.ribbon,[disabled],.is-disabled'))return; const rc=el.getBoundingClientRect(); if(!rc.width)return; const parentBg=bgs(el.parentElement)[0]; const c=getC(el); if(!c)return; const rr=ratio(blend(c,parentBg),parentBg); out.nontext.push({label,ratio:+rr.toFixed(2),pass:rr>=3,cls:(el.className||'').toString().slice(0,40),parent:(el.parentElement.className||'').toString().slice(0,30),txt:el.textContent.trim().slice(0,20)});});
   chk('.input:not(.invalid),.select','input/select border',el=>parse(getComputedStyle(el).borderTopColor));
   chk('.btn:not(.primary):not(.ghost):not(.danger):not(.icon)','outline button border',el=>parse(getComputedStyle(el).borderTopColor));
   chk('.radio:not(.on)','radio card border',el=>parse(getComputedStyle(el).borderTopColor));
   chk('.radio i','radio circle',el=>parse(getComputedStyle(el).borderTopColor));
   chk('.seg','segmented border',el=>parse(getComputedStyle(el).borderTopColor));
   chk('.check:not(.on) i','checkbox border',el=>parse(getComputedStyle(el).borderTopColor));
   chk('.switch:not(.on)','switch track (off)',el=>parse(getComputedStyle(el,'::before').backgroundColor));
   chk('.switch.on','switch track (on)',el=>parse(getComputedStyle(el,'::before').backgroundColor));
   chk('.photo:not(.ok)','empty photo slot border',el=>parse(getComputedStyle(el).borderTopColor));
   return out;});
  all.push({page:name,...r}); await c.close();
 }
 await b.close(); fs.writeFileSync(process.argv[2]||D+'/screenshots/contrast-check.json',JSON.stringify(all,null,1));
 let n=0,f=0,d=0,mn=99,ms=''; const nt={};
 for(const a of all){n+=a.text.n;f+=a.text.fail.length;d+=a.text.disabled; if(a.text.min<mn){mn=a.text.min;ms=a.page+': '+a.text.minSample;} for(const x of a.nontext){const k=x.label;(nt[k]=nt[k]||{n:0,fail:0,min:99});nt[k].n++;if(!x.pass)nt[k].fail++;nt[k].min=Math.min(nt[k].min,x.ratio);}}
 console.log(JSON.stringify({textNodesChecked:n,textFailures:f,disabledExempt:d,minTextRatio:+mn.toFixed(2),minAt:ms,nontext:nt},null,1));
 for(const a of all) for(const x of a.text.fail.slice(0,5)) console.log('FAIL',a.page,JSON.stringify(x));
})();
