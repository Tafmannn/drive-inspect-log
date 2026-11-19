// Phase 1a before/after measurement against the RUNNING app (dev server, backend deliberately unreachable)
// and against the untracked fixture page that renders REAL components with fixture props.
// usage: NODE_PATH=$(npm root -g) node p1a-measure.cjs <label> <out-dir> [base-url]
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const MODE=process.argv[5]||'all'; const label=process.argv[2]; const OUT=path.resolve(process.argv[3]); const BASE=process.argv[4]||'http://127.0.0.1:5199';
fs.mkdirSync(OUT+'/shots',{recursive:true});
const J='00000000-0000-0000-0000-000000000001';
const ROUTES=[['login','/login',''],['driver-home','/',''],['driver-jobs','/jobs',''],['profile','/profile',''],['expenses','/expenses',''],['admin-home','/','admin'],['admin-dash','/admin','admin'],['admin-job-new','/jobs/new','admin'],['admin-users','/admin/users','admin'],['control-overview','/control','admin'],['control-jobs','/control/jobs','admin'],['control-pod','/control/pod-review','admin'],['control-drivers','/control/drivers','admin'],['control-compliance','/control/compliance','admin'],['control-finance','/control/finance','admin'],['control-clients','/control/clients','admin'],['control-exports','/control/exports','admin'],['super-dash','/super-admin','super'],['super-settings','/super-admin/settings','super'],['control-super','/control/super-admin','super']];
const SHOT=new Set(['login','driver-home','driver-jobs','profile','admin-home','admin-dash','admin-job-new','control-overview','control-jobs','control-super','super-dash','super-settings']);
const WIDTHS=[320,390,768,1024,1440];
const EVAL=`(()=>{
 const parse=s=>{const m=s.match(/rgba?\\(([^)]+)\\)/); if(!m) return {r:0,g:0,b:0,a:0}; const v=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1};};
 const blend=(f,bg)=>({r:f.r*f.a+bg.r*(1-f.a),g:f.g*f.a+bg.g*(1-f.a),b:f.b*f.a+bg.b*(1-f.a),a:1});
 const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
 const bgs=el=>{let cands=[{r:255,g:255,b:255,a:1}];const chain=[];for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);const bi=cs.backgroundImage;const c=parse(cs.backgroundColor);if(bi&&bi!=='none'&&/gradient/.test(bi)){const cols=[...bi.matchAll(/rgba?\\([^)]+\\)/g)].map(m=>parse(m[0]));chain.push({grad:cols});if(cols.every(x=>x.a>=1))break;}if(c.a>0){chain.push({c});if(c.a>=1)break;}}for(const L of chain.reverse()){if(L.grad)cands=L.grad.flatMap(g=>cands.map(bg=>blend(g,bg)));else cands=cands.map(bg=>blend(L.c,bg));}return cands;};
 const opac=el=>{let o=1;for(let e=el;e;e=e.parentElement)o*=parseFloat(getComputedStyle(e).opacity);return o;};
 const o={n:0,small:0,fail:[],dev:0,docOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,nt:[]};
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let nd;const seen=new Set();
 while(nd=w.nextNode()){const t=nd.textContent.trim();if(!t)continue;const el=nd.parentElement;if(!el||seen.has(el))continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;const rc=el.getBoundingClientRect();if(!rc.width||!rc.height)continue;seen.add(el);
  if(/DEV ROLE OVERRIDE/.test(t)){o.dev++;continue;} if(el.closest('[data-fixture-note]'))continue;
  o.n++;const fs=parseFloat(cs.fontSize);if(fs<12)o.small++;
  if(el.closest('[disabled],[aria-disabled=true]'))continue;
  const fg=parse(cs.color);const fgA={...fg,a:fg.a*opac(el)};const fw=parseInt(cs.fontWeight);const need=(fs>=24||(fs>=18.66&&fw>=700))?3:4.5;let worst=99;for(const bg of bgs(el)){const rr=ratio(blend(fgA,bg),bg);if(rr<worst)worst=rr;}
  if(worst<need)o.fail.push({t:t.slice(0,30),ratio:+worst.toFixed(2),need,fs:+fs.toFixed(1)});}
 // control boundaries (3:1 vs the surface they sit on)
 document.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea,select,button[role=combobox],button[role=checkbox],button[role=switch],[data-boundary]').forEach(el=>{const rc=el.getBoundingClientRect();if(!rc.width||el.disabled)return;const cs=getComputedStyle(el);const par=bgs(el.parentElement)[0];
  let c; if(el.matches('[role=switch]')){c=parse(cs.backgroundColor);} else {c=parse(cs.borderTopColor); if(parseFloat(cs.borderTopWidth)===0)return;}
  o.nt.push({k:el.tagName.toLowerCase()+(el.getAttribute('role')?'['+el.getAttribute('role')+']':''),r:+ratio(blend(c,par),par).toFixed(2),cls:(el.className||'').toString().slice(0,60),ph:(el.getAttribute('placeholder')||el.getAttribute('aria-label')||'').slice(0,20)});});
 return o;})()`;
const FOCUS=`(()=>{const e=document.activeElement; if(!e||e===document.body)return null; const cs=getComputedStyle(e);
 const parse=s=>{const m=s.match(/rgba?\\(([^)]+)\\)/); if(!m) return null; const v=m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1};};
 const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
 let bg={r:255,g:255,b:255}; for(let n=e;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor); if(c&&c.a>=0.95){bg=c;break;}}
 const ind=[]; if(cs.outlineStyle!=='none'&&parseFloat(cs.outlineWidth)>0){const c=parse(cs.outlineColor); if(c&&c.a>0.3)ind.push({k:'outline '+cs.outlineStyle+' '+cs.outlineWidth,c});}
 if(cs.boxShadow&&cs.boxShadow!=='none'){for(const m of cs.boxShadow.matchAll(/(rgba?\\([^)]+\\))\\s+(-?[\\d.]+)px\\s+(-?[\\d.]+)px\\s+(-?[\\d.]+)px\\s*(-?[\\d.]+)?px?/g)){const c=parse(m[1]); const spread=parseFloat(m[5]||'0'); if(c&&c.a>0.3&&spread>=1&&parseFloat(m[4])===0)ind.push({k:'ring '+spread+'px',c});}}
 let best=0,how='none'; for(const i of ind){const r=ratio(i.c,bg); if(r>best){best=r;how=i.k;}}
 return {tag:e.tagName.toLowerCase(),txt:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,24),visible:best>=3,ratio:+best.toFixed(2),how};})()`;
async function pool(items,n,fn){const q=[...items];const res=[];await Promise.all(Array.from({length:n},async()=>{while(q.length){const it=q.shift();res.push(await fn(it));}}));return res;}
(async()=>{
 const b=await chromium.launch(); const metrics=[]; const focus=[];
 const mk=async(theme,vp)=>{const c=await b.newContext({viewport:{width:vp.w,height:vp.h},deviceScaleFactor:1,isMobile:vp.w<500});await c.addInitScript(t=>{try{localStorage.setItem('theme',t);localStorage.setItem('axentra-theme-mode',t)}catch(e){}},theme);return c;};
 // 1) app routes: screenshots (5 widths x light/dark) + metrics at 1440 and 390 (light+dark)
 const jobs=[];
 for(const theme of ['light','dark']) for(const [slug,p,role] of ROUTES) for(const w of WIDTHS){ if(MODE==='dark'&&theme!=='dark')continue; if(MODE==='focus')continue; if(!SHOT.has(slug)&&!(w===1440||w===390))continue; jobs.push({theme,slug,p,role,w}); }
 await pool(jobs,4,async j=>{const c=await mk(j.theme,{w:j.w,h:j.w<500?844:900});const pg=await c.newPage();const q=j.role==='admin'?'?admin=1':j.role==='super'?'?super=1':'';
  try{await pg.goto(BASE+j.p+q,{waitUntil:'domcontentloaded',timeout:20000});await pg.waitForTimeout(2200);}catch(e){}
  const m=await pg.evaluate(EVAL); metrics.push({kind:'route',theme:j.theme,slug:j.slug,w:j.w,...m});
  if(SHOT.has(j.slug)) await pg.screenshot({path:`${OUT}/shots/route-${j.theme}-${j.slug}-${j.w}.png`});
  await c.close();});
 // 2) fixture page (real components): screenshots + metrics at 390 and 1440, light/dark
 for(const theme of ['light','dark']) for(const w of [390,1440]){ if(MODE==='focus'||(MODE==='dark'&&theme!=='dark'))continue; const c=await mk(theme,{w,h:900});const pg=await c.newPage();
  await pg.goto(BASE+'/__p1a_fixture.html?theme='+theme,{waitUntil:'load'});await pg.waitForTimeout(1200);
  const m=await pg.evaluate(EVAL); metrics.push({kind:'fixture',theme,slug:'fixture',w,...m});
  await pg.screenshot({path:`${OUT}/shots/fixture-${theme}-${w}.png`,fullPage:true});
  for(const sec of ['fx-status-jobcard','fx-status-admincard','fx-controls']){const el=pg.locator('#'+sec);await el.screenshot({path:`${OUT}/shots/fixture-${theme}-${w}-${sec}.png`});}
  // keyboard focus on real controls
  if(w===1440&&(MODE==='focus'||MODE==='all')){await pg.evaluate(()=>document.activeElement&&document.activeElement.blur());for(let i=0;i<14;i++){await pg.keyboard.press('Tab');const f=await pg.evaluate(FOCUS);if(f)focus.push({kind:'fixture',theme,i,...f});}}
  await c.close();}
 // 3) keyboard focus on real app routes (light, 1440): Tab through first 12 stops
 for(const [slug,p,role] of (MODE==='dark'?[]:ROUTES).filter(r=>['login','driver-jobs','admin-dash','control-overview','control-jobs','super-settings','profile'].includes(r[0]))){const c=await mk('light',{w:1440,h:900});const pg=await c.newPage();const q=role==='admin'?'?admin=1':role==='super'?'?super=1':'';
  try{await pg.goto(BASE+p+q,{waitUntil:'domcontentloaded',timeout:20000});await pg.waitForTimeout(1800);}catch(e){}
  for(let i=0;i<12;i++){await pg.keyboard.press('Tab');const f=await pg.evaluate(FOCUS);if(f)focus.push({kind:'route',theme:'light',slug,i,...f});}
  await c.close();}
 await b.close();
 fs.writeFileSync(`${OUT}/metrics-${label}.json`,JSON.stringify({label,metrics,focus},null,1));
 const sum=(f)=>metrics.filter(f).reduce((a,x)=>({n:a.n+x.n,small:a.small+x.small,fail:a.fail+x.fail.length}),{n:0,small:0,fail:0});
 console.log(label,'routes light 1440',JSON.stringify(sum(x=>x.kind==='route'&&x.theme==='light'&&x.w===1440&&x.slug!=='login')),'fixture light',JSON.stringify(sum(x=>x.kind==='fixture'&&x.theme==='light'&&x.w===1440)));
})();
