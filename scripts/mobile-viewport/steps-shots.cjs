// Inspection steps 1, 2, 4, 6 (pickup) at 375/390/430, full page.
// Usage: TAG=after NODE_PATH=$(npm root -g) node steps-shots.cjs
const { chromium } = require("playwright");
const { setup } = require("./mock.cjs");
const fs = require("fs");
const BASE = process.env.BASE || "http://127.0.0.1:8080";
const OUT = `${__dirname}/shots/steps-${process.env.TAG || "now"}`;
fs.mkdirSync(OUT, { recursive: true });
const J = "00000000-0000-4000-8000-000000000017";
const data = (step) => ({ odometer: "54321", fuelLevel: "3/4", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", handbook: "Yes", mot: "No", driverName: "Fixture Driver", customerName: "Pat Pickup", damageDeclaration: "none_found", _currentStep: step });
(async () => {
  const b = await chromium.launch();
  for (const [w, h] of [[375, 667], [390, 844], [430, 932]]) {
    const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await setup(c);
    const p = await c.newPage(); await p.goto(BASE + "/profile"); await p.waitForTimeout(300);
    for (const step of [1, 2, 4, 6]) {
      await p.evaluate(([id, d]) => { sessionStorage.clear(); localStorage.setItem("axentra.draft.pickup:" + id, JSON.stringify({ savedAt: new Date().toISOString(), data: d })); }, [J, data(step)]);
      await p.goto(BASE + "/inspection/" + J + "/pickup"); await p.waitForTimeout(1500);
      await p.screenshot({ path: `${OUT}/step${step}-${w}.png`, fullPage: true });
    }
    await c.close();
  }
  await b.close();
})();
