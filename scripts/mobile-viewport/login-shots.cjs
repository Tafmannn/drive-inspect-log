// Login screen (auth-enabled server :8081, signed out) at 375/390/430/1440.
const { chromium } = require("playwright");
const { setup } = require("./mock.cjs");
const fs = require("fs");
const OUT = `${__dirname}/shots/login-${process.env.TAG || "now"}`; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[375, 667], [390, 844], [430, 932], [1440, 900]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 1000, hasTouch: w < 1000 }); await setup(c);
    const p = await c.newPage(); await p.goto((process.env.BASE || "http://127.0.0.1:8081") + "/login", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
    const o = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, docH: document.documentElement.scrollHeight, inputs: [...document.querySelectorAll("input")].map(i => getComputedStyle(i).fontSize) }));
    console.log(JSON.stringify({ w, ...o }));
    await p.screenshot({ path: `${OUT}/login-${w}.png` }); await c.close();
  }
  await b.close();
})();
