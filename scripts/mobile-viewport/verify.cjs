const { open, rotate, BASE } = require("./lib.cjs");
const { chromium, devices } = require("playwright");
const { setup } = require("./mock.cjs");
const J = "00000000-0000-4000-8000-000000000017";
const out = {};
function jpeg() { return Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64"); }

(async () => {
  // 1) Modal over a scrolled page: deviation prompt on Jobs
  {
    const { browser, page } = await open("iPhone 13");
    await page.goto(BASE + "/jobs"); await page.waitForSelector("text=AX-1010");
    await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight / 2)); await page.waitForTimeout(200);
    const y0 = await page.evaluate(() => scrollY);
    // a primary CTA in view that isn't the recommended job → deviation dialog
    const btn = page.locator("button", { hasText: /Start Pickup|Start Delivery|Continue|Collect/ }).filter({ visible: true });
    let opened = false;
    for (let i = 0; i < Math.min(await btn.count(), 6) && !opened; i++) {
      const b = btn.nth(i); const box = await b.boundingBox(); if (!box || box.y < 0 || box.y > 600) continue;
      await b.click(); await page.waitForTimeout(500);
      opened = (await page.locator("[role=dialog], [role=alertdialog]").count()) > 0;
      if (!opened && !/\/jobs$/.test(page.url())) { await page.goBack(); await page.waitForTimeout(800); }
    }
    out.modalOpened = opened;
    if (opened) {
      const fit = () => page.evaluate(() => { const d = document.querySelector("[role=dialog], [role=alertdialog]"); const r = d.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, scrollable: d.scrollHeight > d.clientHeight, overflowY: getComputedStyle(d).overflowY }; });
      out.modal = [];
      for (const s of [[844, 340], [390, 664], [844, 340], [390, 664]]) { await rotate(page, ...s); out.modal.push({ s: s.join("x"), ...(await fit()) }); }
      await page.keyboard.press("Escape"); await page.waitForTimeout(400);
      out.afterModal = await page.evaluate(() => ({ scrollY: Math.round(scrollY), bodyStyle: document.body.getAttribute("style"), htmlOverflow: getComputedStyle(document.documentElement).overflow, bodyOverflow: getComputedStyle(document.body).overflow, bodyPE: getComputedStyle(document.body).pointerEvents }));
      await page.mouse.wheel(0, 400); await page.waitForTimeout(300);
      out.scrollWorksAfterModal = (await page.evaluate(() => scrollY)) !== out.afterModal.scrollY;
    }
    out.y0 = y0;
    await browser.close();
  }

  // 2) Reduced motion
  {
    const browser = await chromium.launch();
    const context = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1, reducedMotion: "reduce" });
    await setup(context); const page = await context.newPage();
    await page.goto(BASE + "/jobs"); await page.waitForSelector("text=AX-1010");
    out.reducedMotion = await page.evaluate(() => ({ pageEnter: getComputedStyle(document.querySelector(".page-enter")).animationName, ptrTransition: document.querySelector("[data-ptr-indicator]").style.transition }));
    await browser.close();
  }

  // 3) Offline inspection draft + rotation: photos/queued state survive
  {
    const { browser, context, page } = await open("iPhone 13");
    await page.goto(BASE + "/profile"); await page.waitForTimeout(300);
    await page.evaluate((id) => { sessionStorage.clear(); localStorage.setItem("axentra.draft.pickup:" + id, JSON.stringify({ savedAt: new Date().toISOString(), data: { odometer: "777", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", notes: "offline note", _currentStep: 4 } })); }, J);
    await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForSelector("input[id^=photo-]", { state: "attached" });
    await context.setOffline(true);
    const inputs = page.locator("input[id^=photo-]");
    await inputs.nth(0).setInputFiles({ name: "a.jpg", mimeType: "image/jpeg", buffer: jpeg() });
    await inputs.nth(2).setInputFiles({ name: "b.jpg", mimeType: "image/jpeg", buffer: jpeg() });
    await page.waitForTimeout(1500);
    const state = () => page.evaluate(async () => {
      const imgs = [...document.querySelectorAll("img")].filter((i) => i.src.startsWith("blob:")).length;
      const dbs = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [];
      const banner = document.body.innerText.match(/offline[^\n]{0,60}/i);
      return { title: document.querySelector("h1")?.textContent, blobImgs: imgs, dbs, banner: banner && banner[0] };
    });
    out.offlineBefore = await state();
    for (const s of [[844, 390], [390, 664], [844, 390], [390, 664]]) await rotate(page, ...s);
    out.offlineAfter = await state();
    out.offlineDraft = await page.evaluate((id) => { const d = JSON.parse(localStorage.getItem("axentra.draft.pickup:" + id)).data; return { notes: d.notes, odo: d.odometer, step: d._currentStep }; }, J);
    await browser.close();
  }

  // 4) Desktop + tablet landscape screenshots of Command Center and inspection
  {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await setup(context); const page = await context.newPage();
    await page.goto(BASE + "/control?admin=1"); await page.waitForTimeout(2000);
    out.desktopControl = await page.evaluate(() => { const a = document.querySelector("aside"); const m = document.querySelector("main"); return { asideH: a && Math.round(a.getBoundingClientRect().height), mainH: Math.round(m.getBoundingClientRect().height), vh: innerHeight, docScroll: document.documentElement.scrollHeight - innerHeight }; });
    await page.screenshot({ path: __dirname + "/shots/desktop-control.png" });
    await page.goto(BASE + "/jobs/00000000-0000-4000-8000-000000000007"); await page.waitForTimeout(1500);
    await page.screenshot({ path: __dirname + "/shots/desktop-job.png" });
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); console.log(JSON.stringify(out, null, 1)); process.exit(1); });
