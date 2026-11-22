// Customer-portal captures (auth-enabled server on :8081, fixture backend).
// Usage: TAG=before NODE_PATH=$(npm root -g) node portal-shots.cjs
const { chromium } = require("playwright");
const { setup, signIn } = require("./mock.cjs");
const fs = require("fs");
const B = process.env.BASE || "http://127.0.0.1:8081";
const TAG = process.env.TAG || "now";
const OUT = `${__dirname}/shots/portal-${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const J = "00000000-0000-4000-8000-000000000007";
(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[375, 667], [390, 844], [430, 932], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 1024, hasTouch: w < 1024 });
    await setup(context); await signIn(context);
    const page = await context.newPage();
    for (const [n, r] of [["home", "/portal"], ["job", "/portal/jobs/" + J], ["invoices", "/portal/invoices"]]) {
      await page.goto(B + r); await page.waitForTimeout(2000);
      const o = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, path: location.pathname }));
      await page.screenshot({ path: `${OUT}/${n}-${w}.png` });
      console.log(JSON.stringify({ n, w, ...o }));
    }
    await context.close();
  }
  await browser.close();
})();
