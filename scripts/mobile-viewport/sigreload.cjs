const { open, rotate, BASE } = require("./lib.cjs");
const J = "00000000-0000-4000-8000-000000000017";
(async () => {
  const { browser, page } = await open("iPhone 13");
  await page.goto(BASE + "/profile"); await page.waitForTimeout(300);
  await page.evaluate((id) => { sessionStorage.clear(); localStorage.setItem("axentra.draft.pickup:" + id, JSON.stringify({ savedAt: new Date().toISOString(), data: { odometer: "1", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", driverName: "D", customerName: "C", notes: "n", _currentStep: 5 } })); }, J);
  await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForSelector("canvas");
  const ink = (i) => page.locator("canvas").nth(i).evaluate((cv) => { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k]) n++; return n; });
  for (const i of [0, 1]) {
    const c = page.locator("canvas").nth(i); await c.evaluate((cv) => cv.scrollIntoView({ block: "center" })); await page.waitForTimeout(150);
    const b = await c.boundingBox(); await page.mouse.move(b.x + 30, b.y + 40); await page.mouse.down();
    for (let k = 1; k <= 12; k++) await page.mouse.move(b.x + 30 + k * 15, b.y + 40 + (k % 2) * 35); await page.mouse.up();
  }
  console.log("ink before reload", await ink(0), await ink(1), "signed labels", await page.locator("text=Signed ✓").count());
  await page.reload(); await page.waitForSelector("canvas"); await page.waitForTimeout(600);
  console.log("after same-tab reload: step", await page.textContent("h1"), "ink", await ink(0), await ink(1), "signed labels", await page.locator("text=Signed ✓").count());
  // Next (validates signatures) → Previous → strokes still there
  await page.getByRole("button", { name: /^Next/ }).click(); await page.waitForTimeout(500);
  console.log("after Next:", await page.textContent("h1"));
  await page.getByRole("button", { name: /Previous/ }).click(); await page.waitForSelector("canvas"); await page.waitForTimeout(400);
  console.log("after Previous: ink", await ink(0), await ink(1));
  // Clear removes persisted strokes
  await page.getByRole("button", { name: "Clear" }).first().click();
  await page.reload(); await page.waitForSelector("canvas"); await page.waitForTimeout(500);
  console.log("after Clear + reload: ink", await ink(0), await ink(1), "signed labels", await page.locator("text=Signed ✓").count());
  await browser.close();
})();
