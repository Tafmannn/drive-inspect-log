const { open, rotate, BASE } = require("./lib.cjs");
const J = "00000000-0000-4000-8000-000000000017";
(async () => {
  const { browser, page } = await open("iPhone 13");
  await page.goto(BASE + "/profile"); await page.waitForTimeout(300);
  await page.evaluate((id) => { sessionStorage.clear(); localStorage.setItem("axentra.draft.pickup:" + id, JSON.stringify({ savedAt: new Date().toISOString(), data: { odometer: "1", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", _currentStep: 3 } })); }, J);
  await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForSelector("svg[viewBox='0 0 400 300']");
  const svg = page.locator("svg[viewBox='0 0 400 300']").first();
  await svg.evaluate((s) => s.scrollIntoView({ block: "center" }));
  const y0 = await page.evaluate(() => Math.round(scrollY));
  await page.locator("button", { hasText: /Add Damage|Mark Damage|Add/ }).first().click(); await page.waitForTimeout(200);
  const b = await svg.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForSelector("[role=dialog]");
  const fit = () => page.evaluate(() => { const d = document.querySelector("[role=dialog]"); const r = d.getBoundingClientRect(); const last = [...d.querySelectorAll("button")].sort((a, b) => a.offsetTop + a.offsetParent?.offsetTop - (b.offsetTop + b.offsetParent?.offsetTop)).filter((x) => x.getBoundingClientRect().height).reduce((m, x) => (x.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom ? x : m)); d.scrollTop = d.scrollHeight; const lb = last.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, scrollH: d.scrollHeight, clientH: d.clientHeight, lastBtn: last.textContent.trim(), lastBtnBottomAfterScroll: Math.round(lb.bottom), maxH: getComputedStyle(d).maxHeight }; });
  for (const s of [[844, 340], [390, 664], [844, 340], [390, 664]]) { await rotate(page, ...s); console.log(s.join("x"), JSON.stringify(await fit())); }
  await page.screenshot({ path: __dirname + "/shots/damage-dialog-portrait.png" });
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  console.log("after close", JSON.stringify(await page.evaluate(() => ({ scrollY: Math.round(scrollY), bodyStyle: document.body.getAttribute("style"), bodyPE: getComputedStyle(document.body).pointerEvents }))), "y0", y0);
  await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
  console.log("page scrolls after close:", (await page.evaluate(() => Math.round(scrollY))));
  await browser.close();
})();
