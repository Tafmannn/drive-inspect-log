// Captures current-state screenshots of the app running locally. Review-only; read the README before use.
// 1) Start the app with the backend pointed at an unreachable address so nothing touches a real backend, e.g.:
//      VITE_ENABLE_AUTH=false VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_PUBLISHABLE_KEY=offline npx vite --port 5199
//    (do NOT override VITE_SUPABASE_PROJECT_ID — a build plugin rewrites a tracked file from it)
// 2) NODE_PATH=$(npm root -g) node capture-current.cjs http://127.0.0.1:5199
const { chromium } = require('playwright'); const fs=require('fs'); const path=require('path');
const B=process.argv[2]||'http://127.0.0.1:5199'; const OUT=path.resolve(__dirname,'../screenshots/current-recapture'); fs.mkdirSync(OUT,{recursive:true});
const J='00000000-0000-0000-0000-000000000001';
const R=[['login','/login',''],['driver-home','/',''],['driver-jobs','/jobs',''],['driver-job-detail','/jobs/'+J,''],['driver-inspection','/inspection/'+J+'/pickup',''],['admin-home','/','admin'],['admin-dash','/admin','admin'],['admin-job-new','/jobs/new','admin'],['control-overview','/control','admin'],['control-jobs','/control/jobs','admin'],['super-dash','/super-admin','super'],['control-super','/control/super-admin','super']];
(async()=>{const b=await chromium.launch();
 for(const [vp,v] of [['desktop',{width:1440,height:900,dsf:1}],['mobile',{width:390,height:844,dsf:2,mobile:true}]]){
  const c=await b.newContext({viewport:{width:v.width,height:v.height},deviceScaleFactor:v.dsf,isMobile:!!v.mobile,hasTouch:!!v.mobile});
  for(const [s,p,role] of R){const pg=await c.newPage();const q=role==='admin'?'?admin=1':role==='super'?'?super=1':'';
   try{await pg.goto(B+p+q,{waitUntil:'domcontentloaded',timeout:15000});await pg.waitForTimeout(3000);}catch(e){}
   await pg.screenshot({path:`${OUT}/${vp}-${s}.png`});await pg.close();}
  await c.close();}
 await b.close();console.log('captured to',OUT);})();
