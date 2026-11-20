const { chromium, devices } = require("playwright");
const { setup, signIn } = require("./mock.cjs");
const B = "http://127.0.0.1:8081";
const J = "00000000-0000-4000-8000-000000000007";
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 });
  await setup(context); await signIn(context);
  const page = await context.newPage();
  const m = () => page.evaluate(() => { const r = document.getElementById("root"); const p = r.style.overflowX; r.style.overflowX = "visible"; const o = { vw: document.documentElement.clientWidth, docW: document.documentElement.scrollWidth }; const off = [...document.querySelectorAll("#root *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > o.vw + 1 || b.left < -1); }).slice(-3).map((e) => e.tagName + "." + String(e.className).slice(0, 50) + " " + (e.textContent || "").slice(0, 30)); r.style.overflowX = p; return { ...o, off, path: location.pathname }; });
  for (const r of ["/portal", "/portal/jobs/" + J, "/portal/invoices"]) {
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto(B + r); await page.waitForTimeout(2000);
    const res = [];
    for (const s of [[390, 664], [844, 390], [390, 664], [844, 390], [390, 664]]) { await page.setViewportSize({ width: s[0], height: s[1] }); await page.waitForTimeout(300); res.push(await m()); }
    console.log(r, res.map((x) => `${x.path} ${x.docW}/${x.vw}${x.off.length ? " ! " + x.off.join(" | ") : ""}`).join("  ;  "));
  }
  await page.screenshot({ path: __dirname + "/shots/portal-invoices.png" });
  // Portal photo viewer in short landscape
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto(B + "/portal/jobs/" + J); await page.waitForTimeout(2500);
  const thumbs = page.locator("button:has(img)");
  console.log("portal thumbs", await thumbs.count());
  if (await thumbs.count()) {
    await thumbs.first().click(); await page.waitForTimeout(500);
    for (const s of [[844, 390], [390, 664], [844, 340]]) {
      await page.setViewportSize({ width: s[0], height: s[1] }); await page.waitForTimeout(300);
      console.log("viewer", s.join("x"), JSON.stringify(await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); const r = d.getBoundingClientRect(); const btns = [...d.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().bottom)); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, maxBtnBottom: Math.max(...btns), scrollH: d.scrollHeight, clientH: d.clientHeight }; })));
    }
    await page.screenshot({ path: __dirname + "/shots/portal-viewer-landscape.png" });
  }
  await browser.close();
})();
