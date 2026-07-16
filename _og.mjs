import { chromium } from "playwright";
import fs from "node:fs";
const bg = `data:image/jpeg;base64,${fs.readFileSync("public/img/hero.jpg").toString("base64")}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *{margin:0;box-sizing:border-box}body{width:1200px;height:630px;overflow:hidden;position:relative;font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#fff}
 .bg{position:absolute;inset:0;background:url('${bg}') center/cover;filter:saturate(0.92) contrast(1.04)}
 .ov{position:absolute;inset:0;background:linear-gradient(105deg,rgba(7,20,38,0.95) 0%,rgba(11,28,63,0.86) 45%,rgba(7,20,38,0.5) 100%)}
 .pad{position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}
 .brand{display:flex;align-items:center;gap:16px}.brand svg{width:52px;height:52px}.brand span{font-size:30px;font-weight:800;letter-spacing:4px}
 .eyebrow{color:#3B82F6;font-weight:700;letter-spacing:3px;font-size:19px;text-transform:uppercase}
 h1{font-size:72px;line-height:1.02;font-weight:800;letter-spacing:-1.5px;max-width:900px;margin-top:16px}
 .tag{margin-top:20px;color:#AEC0DA;font-size:24px;font-weight:600;letter-spacing:1px}
</style></head><body><div class="bg"></div><div class="ov"></div>
 <div class="pad"><div class="brand">
   <svg viewBox="0 0 64 64" fill="none" stroke-linecap="round">
     <path d="M45 12 A24 24 0 1 0 53 27" stroke="#fff" stroke-width="4.5"/>
     <path d="M14 20 L39 32" stroke="#fff" stroke-width="4"/><path d="M12 32 L39 32" stroke="#fff" stroke-width="4.5"/><path d="M14 44 L39 32" stroke="#fff" stroke-width="4"/>
     <path d="M36 22 L52 32 L36 42" stroke="#3B82F6" stroke-width="4.5"/>
   </svg><span>AXENTRA</span></div>
 <div><div class="eyebrow">UK-wide driven vehicle logistics</div>
   <h1>Vehicle movement without the blind spots.</h1><div class="tag">Precision in every move.</div></div></div>
</body></html>`;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const p=await b.newPage({viewport:{width:1200,height:630}});
await p.setContent(html,{waitUntil:"load"});await p.waitForTimeout(250);
await p.screenshot({path:"public/og/axentra-home.png"});await b.close();console.log("OG done");
