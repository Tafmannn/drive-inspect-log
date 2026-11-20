const { open, rotate, BASE } = require("./lib.cjs");
const J = "00000000-0000-4000-8000-000000000017";
const out = {};
async function touch(cdp, type, pts) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
}
async function seedStep(page, step) {
  await page.goto(BASE + "/profile"); await page.waitForTimeout(300);
  await page.evaluate(() => sessionStorage.clear());
  await page.evaluate(([id, step]) => localStorage.setItem("axentra.draft.pickup:" + id, JSON.stringify({ savedAt: new Date().toISOString(), data: { odometer: "1", fuelLevel: "Full", vehicleCondition: "Clean", lightCondition: "Good", numberOfKeys: "2", notes: "keep me", driverName: "D", customerName: "C", _currentStep: step } })), [J, step]);
}
(async () => {
  const { browser, context, page } = await open("iPhone 13");
  const cdp = await context.newCDPSession(page);

  // ── Pull to refresh ──
  await page.goto(BASE + "/jobs");
  await page.waitForSelector("text=AX-1010");
  const ind = () => page.evaluate(() => { const n = document.querySelector("[data-ptr-indicator]"); if (n) { const m = new DOMMatrix(getComputedStyle(n).transform); return { offset: m.m42 + 36, opacity: Number(getComputedStyle(n).opacity) }; } const el = document.querySelector("svg.lucide-arrow-down"); const box = el && el.closest("div[style]"); return box ? box.getBoundingClientRect().height : -1; });
  let reqs = 0; page.on("request", (r) => { if (/rest\/v1\/jobs/.test(r.url())) reqs++; });
  // (1) interrupted gesture: touchstart at top, move down 160px, then touchcancel
  await touch(cdp, "touchStart", [[200, 300]]);
  for (let i = 1; i <= 8; i++) await touch(cdp, "touchMove", [[200, 300 + i * 20]]);
  await touch(cdp, "touchCancel", []);
  await page.waitForTimeout(400);
  out.ptrAfterCancel = await ind();
  // (2) diagonal/horizontal swipe from top
  await page.reload(); await page.waitForSelector("text=AX-1010"); reqs = 0;
  await touch(cdp, "touchStart", [[60, 300]]);
  for (let i = 1; i <= 10; i++) await touch(cdp, "touchMove", [[60 + i * 28, 300 + i * 15]]);
  out.ptrDiagonalDuring = await ind();
  await touch(cdp, "touchEnd", []);
  await page.waitForTimeout(600);
  out.ptrDiagonalRefetches = reqs;
  // (3) two-finger pinch at top
  reqs = 0;
  await touch(cdp, "touchStart", [[150, 300], [250, 320]]);
  for (let i = 1; i <= 8; i++) await touch(cdp, "touchMove", [[150 - i * 5, 300 + i * 20], [250 + i * 5, 320 + i * 25]]);
  out.ptrPinchDuring = await ind();
  await touch(cdp, "touchEnd", []);
  await page.waitForTimeout(600);
  out.ptrPinchRefetches = reqs;
  // (4) pinch-zoom allowed on job cards? (touch-action)
  out.cardTouchAction = await page.evaluate(() => { const el = [...document.querySelectorAll("div")].find((d) => d.style.touchAction); return el && getComputedStyle(el).touchAction; });

  // ── Font sizes by orientation ──
  await page.goto(BASE + "/inspection/" + J + "/pickup");
  await page.waitForSelector("#odometer");
  out.inputFontPortrait = await page.$eval("#odometer", (e) => getComputedStyle(e).fontSize);
  await rotate(page, 844, 390);
  out.inputFontLandscape = await page.$eval("#odometer", (e) => getComputedStyle(e).fontSize);
  await rotate(page, 390, 664);
  await seedStep(page, 2); await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForSelector("#notes");
  out.textareaFontPortrait = await page.$eval("#notes", (e) => getComputedStyle(e).fontSize);
  out.pointerCoarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);

  // ── Step change scroll ──
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await page.getByRole("button", { name: /^Next/ }).click();
  await page.waitForTimeout(300);
  out.scrollYAfterNextStep = await page.evaluate(() => scrollY);
  out.stepTitleTop = await page.evaluate(() => { const h = document.querySelector("h2"); return h && Math.round(h.getBoundingClientRect().top); });

  // ── Wide signature drawn in landscape, then portrait ──
  await seedStep(page, 5); await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForSelector("canvas");
  await rotate(page, 844, 390);
  const c = page.locator("canvas").first();
  await c.evaluate((cv) => cv.scrollIntoView({ block: "center" })); await page.waitForTimeout(200);
  let bb = await c.boundingBox();
  await page.mouse.move(bb.x + 20, bb.y + 60); await page.mouse.down();
  for (let k = 1; k <= 30; k++) await page.mouse.move(bb.x + 20 + k * 24, bb.y + 60 + ((k % 2) ? -30 : 30));
  await page.mouse.up();
  const ink = () => c.evaluate((cv) => { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0, maxX = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) { n++; maxX = Math.max(maxX, ((i - 3) / 4) % cv.width); } return { n, maxX, w: cv.width }; });
  out.sigLandscape = await ink();
  await rotate(page, 390, 664);
  out.sigPortrait = await ink();
  await rotate(page, 844, 390);
  out.sigBackToLandscape = await ink();
  await rotate(page, 390, 664);

  // ── Tall dialog in short landscape (submit confirmation / damage modal) ──
  await seedStep(page, 3); await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForSelector("h2");
  await rotate(page, 844, 340);
  const addDamage = page.getByRole("button", { name: /add damage|record damage|tap|damage/i }).first();
  if (await addDamage.count()) { await addDamage.click().catch(() => {}); }
  await page.waitForTimeout(500);
  out.damageDialog = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); if (!d) return null; const r = d.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight, scrollH: d.scrollHeight, clientH: d.clientHeight, overflowY: getComputedStyle(d).overflowY }; });
  await page.keyboard.press("Escape");
  // Draft prompt dialog (base DialogContent, no max-h) in very short landscape
  await page.evaluate(([id]) => { const k = "axentra.draft.pickup:" + id; const v = JSON.parse(localStorage.getItem(k)); v.savedAt = new Date(Date.now() - 3600e3).toISOString(); localStorage.setItem(k, JSON.stringify(v)); }, [J]);
  await rotate(page, 568, 260);
  await page.goto(BASE + "/profile"); await page.waitForTimeout(300);
  await page.evaluate(() => sessionStorage.clear());
  await page.evaluate(([id]) => { const k = "axentra.draft.pickup:" + id; localStorage.setItem(k, JSON.stringify({ savedAt: new Date(Date.now() - 3600e3).toISOString(), data: { odometer: "1", notes: "x", _currentStep: 2 } })); }, [J]);
  await page.goto(BASE + "/inspection/" + J + "/pickup"); await page.waitForTimeout(1500);
  out.draftPrompt = await page.evaluate(() => { const d = document.querySelector("[role=dialog]"); if (!d) return null; const r = d.getBoundingClientRect(); const btns = [...d.querySelectorAll("button")].map((b) => Math.round(b.getBoundingClientRect().bottom)); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, btnBottoms: btns, overflowY: getComputedStyle(d).overflowY }; });
  await rotate(page, 390, 664);

  // ── Command Center: scroll main, then push a new route ──
  await page.goto(BASE + "/control?admin=1");
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.querySelector("[class*=bg-warning][class*=sticky]")?.remove(); });
  out.controlDocScrollable = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.evaluate(() => { const m = document.querySelector("main"); m.scrollTop = 900; });
  await page.evaluate(() => { window.history.pushState({}, "", "/control/jobs?admin=1"); dispatchEvent(new PopStateEvent("popstate")); });
  await page.waitForTimeout(100);
  // Use a real link click instead (PUSH)
  await page.goto(BASE + "/control?admin=1"); await page.waitForTimeout(1500);
  await page.evaluate(() => { const m = document.querySelector("main"); m.scrollTop = 900; });
  const link = page.locator("main a[href^='/control/']").first();
  out.controlLink = await link.getAttribute("href");
  await link.evaluate((a) => a.click());
  await page.waitForTimeout(800);
  out.controlMainScrollAfterPush = await page.evaluate(() => ({ path: location.pathname, top: document.querySelector("main").scrollTop }));
  await page.goBack(); await page.waitForTimeout(800);
  out.controlMainScrollAfterBack = await page.evaluate(() => ({ path: location.pathname, top: document.querySelector("main").scrollTop }));

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(e); console.log(JSON.stringify(out, null, 1)); process.exit(1); });
