// Real-browser check: a tap just inside the door, right under the thin roof
// strip (saloon, Left view, iPhone 15), opens the "Which panel?" chooser and
// picking Roof selects it. Needs the dev server on :5199 or BASE.
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8080";
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 15"] });
  const p = await ctx.newPage();
  await p.goto(BASE + "/dev/damage-inspector?vehicleType=Saloon&empty=1", { waitUntil: "networkidle" });
  await p.getByRole("tab", { name: /Left/ }).click();
  await p.waitForTimeout(400);
  const roof = await p.$('[data-panel-id="roof"]');
  const bb = await roof.boundingBox();
  // centre-x of the roof strip, 3px below its bottom edge
  await p.touchscreen.tap(bb.x + bb.width * 0.55, bb.y + bb.height + 3);
  await p.waitForTimeout(300);
  const chooser = p.getByRole("dialog", { name: "Which panel?" });
  const options = (await chooser.locator("button").allTextContents()).map((t) => t.trim());
  console.log("chooser visible:", await chooser.isVisible(), "options:", options);
  await p.screenshot({ path: __dirname + "/shots/chooser-open.png" });
  await chooser.getByRole("button", { name: /Roof/ }).click();
  await p.waitForTimeout(300);
  console.log("selected:", (await p.locator("text=Tap again to move the pin").locator("..").textContent()) || "");
  await p.screenshot({ path: __dirname + "/shots/chooser-picked.png" });
  await b.close();
})();
