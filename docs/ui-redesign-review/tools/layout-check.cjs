// Layout checker for the static prototypes. Usage: NODE_PATH=$(npm root -g) node layout-check.cjs <out.json>
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const D=path.resolve(__dirname,'..'); const M=D+'/mockups/v2/';
const desktopPages=['01-command-center','02-jobs','02b-jobs-queues','05-admin-dashboard','06a-super-admin-control','06b-super-admin-dashboard','06c-super-admin-settings','08-states','09a-stress-jobs-large-table','09b-stress-dense-dashboard','09d-stress-form-validation','09e-stress-settings'];
const phonePages=['03-job-detail-mobile','04-inspection-mobile','09c-stress-photos','09f-stress-mobile-content'];
const widths=[320,390,768,1024,1440,1920];
(async()=>{
 const b=await chromium.launch(); const res=[];
 for(const name of desktopPages.concat(phonePages)){
  const isPhone=phonePages.includes(name);
  for(const w of (isPhone?[390]:widths)){
   const c=await b.newContext({viewport:{width:isPhone?1600:w,height:900}}); const p=await c.newPage();
   await p.goto('file://'+M+name+'.html'); await p.waitForTimeout(600);
   const r=await p.evaluate(({w,isPhone})=>{
    const out={vw:window.innerWidth,docOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,overflowEls:[],truncated:0,truncatedNoTitle:0,small:{n:0,samples:[]},tap:{lt24:0,lt44:0,total:0,samples:[],s44:[]}};
    const inScroll=el=>{for(let e=el.parentElement;e;e=e.parentElement){const o=getComputedStyle(e);if(/(auto|scroll)/.test(o.overflowX)&&e.scrollWidth>e.clientWidth)return true;}return false;};
    const frames=isPhone?[...document.querySelectorAll('.phone')]:[document.body];
    for(const fr of frames){
     const fb=fr.getBoundingClientRect(); const limitR=isPhone?fb.right:window.innerWidth;
     fr.querySelectorAll('*').forEach(el=>{
      if(el.closest('.note,.ribbon'))return; const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden')return;
      const r=el.getBoundingClientRect(); if(r.width===0||r.height===0)return;
      if((r.right>limitR+1)&&!inScroll(el)&&!el.closest('.t-wrap')){ if(out.overflowEls.length<4) out.overflowEls.push(el.outerHTML.slice(0,90)+' right='+Math.round(r.right)+' limit='+Math.round(limitR)); else out.overflowEls.push('+'); }
      if(cs.textOverflow==='ellipsis'&&el.scrollWidth>el.clientWidth+1){out.truncated++; if(!el.getAttribute('title')&&!el.closest('[title]'))out.truncatedNoTitle++;}
      if(el.scrollWidth>el.clientWidth+1&&cs.overflowX==='visible'&&!el.closest('.t-wrap')&&[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>0)&&cs.display!=='inline'){out.textOverflow=(out.textOverflow||0)+1; (out.textOverflowSamples=out.textOverflowSamples||[]).length<3&&out.textOverflowSamples.push(el.textContent.trim().slice(0,30));}
      const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>0);
      if(hasText){const fs=parseFloat(cs.fontSize); if(fs<12){out.small.n++; if(out.small.samples.length<4)out.small.samples.push(fs+'px "'+el.textContent.trim().slice(0,24)+'"');}}
      if(el.matches('button,a[href],input,select,textarea,[role=radio],[role=switch],.radio,.chip')){
       out.tap.total++; if(r.width<24||r.height<24){out.tap.lt24++; if(out.tap.samples.length<4)out.tap.samples.push(el.tagName.toLowerCase()+' '+Math.round(r.width)+'x'+Math.round(r.height)+' "'+(el.getAttribute('aria-label')||el.textContent.trim()).slice(0,20)+'"');}
       if(r.width<44||r.height<44){out.tap.lt44++; if(w<=768&&out.tap.s44.length<6)out.tap.s44.push(el.tagName.toLowerCase()+'.'+(el.className||'').toString().slice(0,24)+' '+Math.round(r.width)+'x'+Math.round(r.height)+' "'+(el.getAttribute('aria-label')||el.textContent.trim()).slice(0,18)+'"');}}
     });
    }
    out.overflowEls=out.overflowEls.filter(x=>x!=='+').slice(0,4);
    out.tables={n:0,scroll:0,actionsHidden:0};
    document.querySelectorAll('.t-wrap').forEach(wr=>{ if(getComputedStyle(wr).display==='none')return; out.tables.n++; const sc=wr.scrollWidth>wr.clientWidth+1; if(sc)out.tables.scroll++; const last=wr.querySelector('tbody tr td:last-child'); if(last){const lr=last.getBoundingClientRect(), wr2=wr.getBoundingClientRect(); if(lr.right>wr2.right+1||lr.left<wr2.left-1)out.tables.actionsHidden++;}});
    return out;},{w,isPhone});
   res.push({page:name,width:isPhone?390:w,...r}); await c.close();
  }
 }
 await b.close(); fs.writeFileSync(process.argv[2]||D+'/screenshots/layout-check.json',JSON.stringify(res,null,1)); console.log('done',res.length);
})();
