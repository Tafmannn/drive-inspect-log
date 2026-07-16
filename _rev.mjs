import { chromium } from "playwright";
const SS="/tmp/claude-0/-home-user-drive-inspect-log/cac9ae2f-8a68-5bf9-9111-84f2b211dae6/scratchpad";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
for(const [name,route] of [["home","/home"],["services","/services"],["about","/about"],["tech","/technology"]]){
  const ctx=await b.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce"});
  const p=await ctx.newPage();
  await p.goto("http://127.0.0.1:4173"+route,{waitUntil:"networkidle"});
  const h=await p.evaluate(()=>document.body.scrollHeight);
  for(let y=0;y<h;y+=700){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(70);}
  await p.evaluate(()=>window.scrollTo(0,0));await p.waitForTimeout(300);
  await p.screenshot({path:`${SS}/nn-${name}.jpg`,type:"jpeg",quality:75,fullPage:true});
  await ctx.close();console.log(name);
}
await b.close();
