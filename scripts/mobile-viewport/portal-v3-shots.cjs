// Customer portal V3 captures across fixture states and widths
// (auth-enabled server on :8081, fixture backend — nothing reaches Supabase).
// Usage: TAG=v3 NODE_PATH=$(npm root -g) node portal-v3-shots.cjs [scenarioFilter]
const { chromium } = require("playwright");
const { setup, signIn } = require("./mock.cjs");
const fs = require("fs");
const B = process.env.BASE || "http://127.0.0.1:8081";
const TAG = process.env.TAG || "v3";
const OUT = `${__dirname}/shots/portal-${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = (process.env.WIDTHS || "375,390,430,768,1024,1440").split(",").map(Number);
const SCENARIOS = (process.env.SCENARIOS || "empty,one,many,long,loading,error").split(",");
const PAGES = [["moves", "/portal"], ["completed", "/portal?tab=completed"], ["invoices", "/portal/invoices"]];
(async () => {
  const filter = process.argv[2];
  const browser = await chromium.launch();
  for (const sc of SCENARIOS) {
    if (filter && !sc.includes(filter)) continue;
    for (const w of WIDTHS) {
      const h = w >= 1024 ? 900 : w >= 768 ? 1024 : w === 375 ? 667 : w === 390 ? 844 : 932;
      const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 1024, hasTouch: w < 1024 });
      await setup(context, { portal: sc });
      await signIn(context);
      const page = await context.newPage();
      for (const [n, r] of PAGES) {
        if (sc === "loading" || sc === "error") { if (n === "completed") continue; }
        await page.goto(B + r);
        await page.waitForTimeout(sc === "error" ? 4500 : 1500);
        const o = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, docH: document.documentElement.scrollHeight }));
        await page.screenshot({ path: `${OUT}/${sc}-${n}-${w}.png`, fullPage: process.env.FULL === "1" });
        console.log(JSON.stringify({ sc, n, w, ...o }));
      }
      await context.close();
    }
  }
  await browser.close();
})();
