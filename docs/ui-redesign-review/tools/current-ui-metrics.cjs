// Measures rendered font sizes + text contrast on the CURRENT app (dev server, offline backend). Usage: node current-ui-metrics.cjs <base-url> <out.json>
const { chromium } = require('playwright'); const fs=require('fs');
const base=process.argv[2]||'http://127.0.0.1:5199'; const out=process.argv[3];
const J='00000000-0000-0000-0000-000000000001';
const R=[['/login',''],['/forgot-password',''],['/',''],['/jobs',''],['/pending-uploads',''],['/profile',''],['/expenses',''],['/',  'admin'],['/admin','admin'],['/jobs/master','admin'],['/jobs/new','admin'],['/admin/users','admin'],['/admin/timesheets','admin'],['/invoice/new','admin'],['/control','admin'],['/control/jobs','admin'],['/control/pod-review','admin'],['/control/drivers','admin'],['/control/compliance','admin'],['/control/finance','admin'],['/control/profitability','admin'],['/control/clients','admin'],['/control/exports','admin'],['/super-admin','super'],['/super-admin/settings','super'],['/super-admin/attention','super'],['/control/super-admin','super']];
(async()=>{ const b=await chromium.launch(); const res=[];
 for(const [vpn,vp] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]){
  const c=await b.newContext({viewport:vp,deviceScaleFactor:1,isMobile:vpn==='mobile'});
  for(const [pth,role] of R){ const p=await c.newPage(); const q=role==='admin'?'?admin=1':role==='super'?'?super=1':'';
   try{await p.goto(base+pth+q,{waitUntil:'domcontentloaded',timeout:15000});await p.waitForTimeout(2800);}catch(e){}
   const r=await p.evaluate(()=>{
    const parse=s=>{const m=s.match(/rgba?\(([^)]+)\)/); if(!m) return {r:0,g:0,b:0,a:0}; const v=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1};};
    const blend=(f,bg)=>({r:f.r*f.a+bg.r*(1-f.a),g:f.g*f.a+bg.g*(1-f.a),b:f.b*f.a+bg.b*(1-f.a),a:1});
    const lum=c=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)};
    const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
    const bgs=el=>{let cands=[{r:255,g:255,b:255,a:1}];const chain=[];for(let e=el;e;e=e.parentElement){const cs=getComputedStyle(e);const bi=cs.backgroundImage;const c=parse(cs.backgroundColor);if(bi&&bi!=='none'&&/gradient/.test(bi)){const cols=[...bi.matchAll(/rgba?\([^)]+\)/g)].map(m=>parse(m[0]));chain.push({grad:cols});if(cols.every(x=>x.a>=1))break;}if(c.a>0){chain.push({c});if(c.a>=1)break;}}for(const L of chain.reverse()){if(L.grad)cands=L.grad.flatMap(g=>cands.map(bg=>blend(g,bg)));else cands=cands.map(bg=>blend(L.c,bg));}return cands;};
    const opac=el=>{let o=1;for(let e=el;e;e=e.parentElement)o*=parseFloat(getComputedStyle(e).opacity);return o;};
    const o={n:0,small:{n:0,bySize:{},samples:[]},fail:[],dev:0};
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let nd;const seen=new Set();
    while(nd=w.nextNode()){const t=nd.textContent.trim();if(!t)continue;const el=nd.parentElement;if(!el||seen.has(el))continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;const rc=el.getBoundingClientRect();if(!rc.width||!rc.height)continue;seen.add(el);
     if(/DEV ROLE OVERRIDE/.test(t)){o.dev++;continue;}
     o.n++;const fs=parseFloat(cs.fontSize);if(fs<12){o.small.n++;const k=Math.round(fs)+'px';o.small.bySize[k]=(o.small.bySize[k]||0)+1;if(o.small.samples.length<6)o.small.samples.push(k+' "'+t.slice(0,26)+'"');}
     const dis=!!el.closest('[disabled],[aria-disabled=true]');if(dis)continue;
     const fg=parse(cs.color);const fgA={...fg,a:fg.a*opac(el)};const fw=parseInt(cs.fontWeight);const need=(fs>=24||(fs>=18.66&&fw>=700))?3:4.5;let worst=99;for(const bg of bgs(el)){const rr=ratio(blend(fgA,bg),bg);if(rr<worst)worst=rr;}
     if(worst<need)o.fail.push({t:t.slice(0,32),ratio:+worst.toFixed(2),need,fs:+fs.toFixed(1)});}
    return o;});
   res.push({vp:vpn,route:pth+(role?' ['+role+']':''),...r}); await p.close(); }
  await c.close(); }
 await b.close(); fs.writeFileSync(out,JSON.stringify(res,null,1));
 const T={d:{n:0,s:0,f:0},m:{n:0,s:0,f:0}}; for(const r of res){const k=r.vp[0];T[k].n+=r.n;T[k].s+=r.small.n;T[k].f+=r.fail.length;}
 console.log(JSON.stringify(T)); })();
