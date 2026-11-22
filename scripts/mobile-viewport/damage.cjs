// Damage step (V2): open the damage editor bottom sheet, rotate the SAME page
// between portrait and a 340px-high landscape, and check the sheet's last
// action (Save damage) is reachable by scrolling inside it; then close it and
// check the page still scrolls (no leftover scroll lock / pointer-events).
const { open, rotate, BASE } = require("./lib.cjs");
const J = "00000000-0000-4000-8000-000000000017";
(async () => {
  const { browser, page } = await open("iPhone 13");
  await page.goto(BASE + "/profile"); await page.waitForTimeout(300);
  // Step 3 = damage; the fixture vehicle is a "car" (no single body type), so pin the diagram.
  await page.evaluate((id) => { sessionStorage.clear(); localStorage.setItem("axentra.draft.pickup:" + id, JSON.stringify({ savedAt: new Date().toISOString(), data: { odometer: "1", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", bodyTypeOverride: "saloon", _currentStep: 3 } })); }, J);
  await page.goto(BASE + "/inspection/" + J + "/pickup");
  const door = page.locator('[data-panel-id="front_left_door"]');
  await door.waitFor();
  await door.evaluate((s) => s.scrollIntoView({ block: "center" }));
  const y0 = await page.evaluate(() => Math.round(scrollY));
  const b = await door.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height * 0.8);
  await page.getByRole("button", { name: /Add damage/ }).click();
  await page.waitForSelector("[role=dialog]");
  await page.waitForTimeout(400);
  const fit = () => page.evaluate(() => {
    const d = document.querySelector("[role=dialog]");
    const r = d.getBoundingClientRect();
    const scroller = [...d.querySelectorAll("*")].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY)) || d;
    scroller.scrollTop = scroller.scrollHeight;
    const save = [...d.querySelectorAll("button")].find((x) => /Save damage/.test(x.textContent));
    const sb = save.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, saveBottom: Math.round(sb.bottom), saveVisible: sb.top >= 0 && sb.bottom <= innerHeight + 1 };
  });
  let ok = true;
  for (const s of [[844, 340], [390, 664], [844, 340], [390, 664]]) {
    await rotate(page, ...s); const f = await fit(); ok = ok && f.saveVisible;
    console.log(s.join("x"), JSON.stringify(f));
  }
  await page.screenshot({ path: __dirname + "/shots/damage-sheet-portrait.png" });
  await page.keyboard.press("Escape"); await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({ scrollY: Math.round(scrollY), dialogs: document.querySelectorAll("[role=dialog]").length, bodyPE: getComputedStyle(document.body).pointerEvents }));
  console.log("after close", JSON.stringify(after), "y0", y0);
  await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
  const scrolled = await page.evaluate(() => Math.round(scrollY));
  console.log("page scrolls after close:", scrolled);
  console.log(ok && after.dialogs === 0 && after.bodyPE !== "none" ? "PASS" : "FAIL");
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
