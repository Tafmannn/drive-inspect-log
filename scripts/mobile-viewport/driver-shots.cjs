// Driver-path captures (fixture backend): home, signatures (unsigned/signed), damage step.
// Usage: TAG=after NODE_PATH=$(npm root -g) node driver-shots.cjs
const { chromium } = require("playwright");
const { setup } = require("./mock.cjs");
const fs = require("fs");
const BASE = process.env.BASE || "http://127.0.0.1:8080";
const TAG = process.env.TAG || "now";
const OUT = `${__dirname}/shots/driver-${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const J = "00000000-0000-4000-8000-000000000017";
const seed = (step) => ({ savedAt: new Date().toISOString(), data: { odometer: "1", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", driverName: "Fixture Driver", customerName: "", notes: "", damageDeclaration: "", _currentStep: step } });

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[375, 667], [390, 844], [430, 932]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await setup(ctx);
    const page = await ctx.newPage();
    await page.goto(BASE + "/"); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/home-${w}.png` });
    for (const [name, step] of [["signatures", 5], ["damage", 3]]) {
      await page.evaluate(([id, d]) => { sessionStorage.clear(); localStorage.setItem("axentra.draft.pickup:" + id, JSON.stringify(d)); }, [J, seed(step)]);
      await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: name === "signatures" });
      if (name === "signatures") {
        const c = page.locator("canvas").nth(0); await c.scrollIntoViewIfNeeded(); const b = await c.boundingBox();
        await page.mouse.move(b.x + 30, b.y + 50); await page.mouse.down();
        for (let k = 1; k <= 14; k++) await page.mouse.move(b.x + 30 + k * 14, b.y + 50 + (k % 2) * 30); await page.mouse.up();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/signatures-driver-signed-${w}.png`, fullPage: true });
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
