const { open, BASE } = require("./lib.cjs");
const J = "00000000-0000-4000-8000-000000000017";
(async () => {
  const { browser, page } = await open("iPhone 13");
  await page.goto(BASE + "/inspection/" + J + "/pickup");
  await page.waitForSelector("#odometer");
  await page.fill("#odometer", "54321");
  await page.click("[id^=fuel-]");
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.fill("#notes", "Note that must survive");
  await page.waitForTimeout(1200);
  const draft = () => page.evaluate((id) => JSON.parse(localStorage.getItem("axentra.draft.pickup:" + id) || "null")?.data, J);
  const d0 = await draft(); console.log("draft before:", d0 && { odo: d0.odometer, notes: d0.notes, step: d0._currentStep });
  // A) In-app: Back to job, then return to the inspection (PUSH)
  await page.getByRole("button", { name: "Go back" }).click();
  await page.waitForURL(/\/jobs\//); await page.waitForTimeout(500);
  await page.goto(BASE + "/inspection/" + J + "/pickup"); // same tab, sessionStorage kept (like a reload)
  await page.waitForTimeout(1500);
  console.log("after return: title", await page.textContent("h1"), "odometer field:", await page.locator("#odometer").inputValue().catch(() => "(not on step1)"), "notes:", await page.locator("#notes").inputValue().catch(() => "(no notes field)"));
  const d1 = await draft(); console.log("draft after:", d1 && { odo: d1.odometer, notes: d1.notes, step: d1._currentStep });
  await browser.close();
})();
