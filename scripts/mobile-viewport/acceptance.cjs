// Driver acceptance test, scripted. Rotations happen on the SAME mounted page.
const { open, rotate, probe, BASE } = require("./lib.cjs");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "shots", process.env.TAG || "run");
fs.mkdirSync(OUT, { recursive: true });
const P = [390, 664], L = [844, 390];
const log = (...a) => console.log(...a);
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + ".png") });

function jpeg() {
  // A real (tiny) JPEG so prepareCapturedPhoto/createImageBitmap succeed.
  return Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
}

(async () => {
  const { browser, page } = await open("iPhone 13");
  const results = {};
  await page.goto(BASE + "/jobs");
  await page.waitForSelector("text=AX-1010");
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight / 2));
  await page.waitForTimeout(300);
  const listY = await page.evaluate(() => window.scrollY);
  // Which job card is under the middle of the screen?
  const target = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const card = el && el.closest("[class*=rounded]");
    const m = card && card.textContent.match(/AX-\d+/);
    return m && m[0];
  });
  log("list scrollY", listY, "target", target);
  results.listScrollY = listY;
  results.target = target;

  // Open the job (tap the reference text on the card).
  await page.locator(`text=${target}`).first().click();
  await page.waitForURL(/\/jobs\/[0-9a-f-]+$/);
  await page.waitForTimeout(800);
  results.jobDetailScrollYOnOpen = await page.evaluate(() => window.scrollY);
  await shot(page, "01-job-detail");
  const start = page.getByRole("button", { name: /Start Pickup|Start Inspection|Begin|Continue/i }).first();
  await start.click();
  await page.waitForURL(/\/inspection\//);
  await page.waitForSelector("#odometer");

  // Step 1
  await page.fill("#odometer", "12345");
  await page.click("#fuel-Full, [id^=fuel-]");
  await page.getByRole("button", { name: /Next/ }).click();
  // Step 2: checklist + NOTE
  await page.waitForSelector("#notes");
  await page.click("[id^=vc-]");
  await page.click("[id^=lc-]");
  const keysPlus = page.locator("button").filter({ has: page.locator("svg.lucide-plus") }).first();
  if (await keysPlus.count()) await keysPlus.click();
  const keysInput = page.locator("input[type=number]").last();
  if (!(await keysInput.inputValue())) await keysInput.fill("2");
  await page.fill("#notes", "Scuff on rear bumper, nearside. Customer aware.");

  // Focus → rotate → blur (zoom/size check with keyboard-equivalent focus)
  await page.focus("#notes");
  await probe(page, "notes focused portrait");
  await rotate(page, ...L); results.notesFocusedLandscape = await probe(page, "notes focused landscape");
  await rotate(page, ...P); results.notesFocusedPortrait = await probe(page, "notes focused portrait again");
  await page.evaluate(() => document.activeElement.blur());
  results.notesFontSize = await page.$eval("#notes", (e) => getComputedStyle(e).fontSize);
  results.odoFontSizeLandscapeProbe = null;
  await page.getByRole("button", { name: /Next/ }).click();
  // Step 3 damage: since V2 it needs damage recorded OR "no damage found"
  // confirmed. The fixture vehicle is a generic "car", so pick a shape first.
  const saloon = page.getByRole("button", { name: /^Saloon$/ });
  if (await saloon.count()) await saloon.click();
  await page.getByRole("checkbox", { name: /no damage/i }).click();
  await page.getByRole("button", { name: /Next/ }).click();
  // Step 4 photos
  await page.waitForSelector("input[id^=photo-]", { state: "attached" });
  const inputs = page.locator("input[id^=photo-]");
  await inputs.nth(0).setInputFiles({ name: "front.jpg", mimeType: "image/jpeg", buffer: jpeg() });
  await inputs.nth(1).setInputFiles({ name: "rear.jpg", mimeType: "image/jpeg", buffer: jpeg() });
  await page.waitForTimeout(1200);
  await shot(page, "02-photos-step");

  // Scroll to the gallery and open a photo
  const thumb = page.locator(".grid.grid-cols-4 button").first();
  await thumb.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const yBeforeViewer = await page.evaluate(() => window.scrollY);
  await thumb.click();
  await page.waitForSelector("[role=dialog]");
  await rotate(page, ...L);
  results.viewerLandscape = await probe(page, "viewer open landscape");
  results.viewerBoxL = await page.$eval("[role=dialog]", (d) => { const b = d.getBoundingClientRect(); return { w: b.width, h: b.height, top: b.top, left: b.left }; });
  await shot(page, "03-viewer-landscape");
  await rotate(page, ...P);
  await rotate(page, ...L);
  await rotate(page, ...P);
  results.viewerPortrait = await probe(page, "viewer open portrait after 2 rotations");
  results.viewerBoxP = await page.$eval("[role=dialog]", (d) => { const b = d.getBoundingClientRect(); return { w: b.width, h: b.height, top: b.top, left: b.left }; });
  results.viewerCloseBtn = await page.evaluate(() => { const b = [...document.querySelectorAll("[role=dialog] button")].map((x) => x.getBoundingClientRect()); return b.map((r) => [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]); });
  await shot(page, "04-viewer-portrait");
  // Close
  await page.locator("[role=dialog] button").nth(2).click();
  await page.waitForTimeout(400);
  results.afterViewer = await probe(page, "after viewer closed portrait");
  results.yBeforeViewer = yBeforeViewer;
  results.bodyStyleAfterClose = await page.evaluate(() => ({ body: document.body.getAttribute("style"), html: document.documentElement.getAttribute("style") }));
  await shot(page, "05-after-viewer");

  // Continue: Next → signatures
  await page.getByRole("button", { name: /Next/ }).click();
  await page.waitForSelector("canvas");
  const canvases = page.locator("canvas");
  async function sign(i, dx = 0) {
    const b = await canvases.nth(i).boundingBox();
    await canvases.nth(i).evaluate((c) => c.scrollIntoView({ block: "center" })); await page.waitForTimeout(150);
    const bb = await canvases.nth(i).boundingBox();
    await page.mouse.move(bb.x + 20 + dx, bb.y + 30);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(bb.x + 20 + dx + k * 12, bb.y + 30 + (k % 2) * 40);
    await page.mouse.up();
    return bb;
  }
  async function inkBounds(i) {
    return canvases.nth(i).evaluate((c) => {
      const ctx = c.getContext("2d");
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { if (d[(y * c.width + x) * 4 + 3] > 0) { n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } }
      const r = c.getBoundingClientRect();
      return { n, minX, maxX, minY, maxY, cw: c.width, ch: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height) };
    });
  }
  await page.fill("input[placeholder='Driver full name']", "Fixture Driver");
  await sign(0);
  results.inkBefore = await inkBounds(0);
  await rotate(page, ...L);
  results.inkLandscape = await inkBounds(0);
  await rotate(page, ...P);
  await rotate(page, ...L);
  await rotate(page, ...P);
  results.inkAfter = await inkBounds(0);
  // New stroke after rotation must land under the finger.
  await canvases.nth(0).evaluate((c) => c.scrollIntoView({ block: "center" })); await page.waitForTimeout(150);
  const bb = await canvases.nth(0).boundingBox();
  results.newStrokeHit = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.tagName; }, [bb.x + bb.width - 30, bb.y + bb.height - 20]);
  const before = await inkBounds(0);
  await page.mouse.move(bb.x + bb.width - 30, bb.y + bb.height - 20);
  await page.mouse.down(); await page.mouse.move(bb.x + bb.width - 10, bb.y + bb.height - 10); await page.mouse.up();
  results.newStrokeTarget = { cssX: Math.round(bb.width - 30), cssY: Math.round(bb.height - 20) };
  results.inkWithNewStroke = await inkBounds(0);
  await shot(page, "06-signature-after-rotation");
  results.signatureProbe = await probe(page, "signature step portrait");

  // State survival
  results.state = await page.evaluate(() => {
    const keys = Object.keys(localStorage).filter((k) => /draft|inspection/i.test(k));
    return { title: document.querySelector("h1")?.textContent, drafts: keys.map((k) => [k, localStorage.getItem(k).slice(0, 300)]) };
  });

  // Next action reachable: scroll to bottom; Next button fully visible & above home indicator / bottom
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await page.waitForTimeout(200);
  results.nextBtn = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /Next/.test(x.textContent));
    const r = b.getBoundingClientRect();
    return { bottom: Math.round(r.bottom), innerHeight: innerHeight, gapBelow: Math.round(innerHeight - r.bottom) };
  });

  // Back to job → back to Jobs list
  await page.goBack(); await page.waitForTimeout(600);
  log("after back 1:", page.url());
  await page.goBack(); await page.waitForTimeout(1200);
  log("after back 2:", page.url());
  results.listScrollYAfterBack = await page.evaluate(() => window.scrollY);
  results.targetVisibleAfterBack = await page.evaluate((t) => {
    const el = [...document.querySelectorAll("p,span,div")].find((e) => e.childElementCount === 0 && e.textContent.trim() === t);
    if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), inView: r.top >= 0 && r.bottom <= innerHeight };
  }, target);
  await shot(page, "07-jobs-after-back");

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  log("\nSUMMARY", JSON.stringify({
    listScrollY: results.listScrollY, jobDetailScrollYOnOpen: results.jobDetailScrollYOnOpen,
    notesFontSize: results.notesFontSize, viewerBoxL: results.viewerBoxL, viewerBoxP: results.viewerBoxP,
    afterViewer: { vw: results.afterViewer.vw, docScrollW: results.afterViewer.docScrollW, rootScrollW: results.afterViewer.rootScrollW, offenders: results.afterViewer.offenderCount, scrollY: results.afterViewer.scrollY }, yBeforeViewer: results.yBeforeViewer,
    bodyStyleAfterClose: results.bodyStyleAfterClose,
    inkBefore: results.inkBefore, inkLandscape: results.inkLandscape, inkAfter: results.inkAfter, newStrokeTarget: results.newStrokeTarget, inkWithNewStroke: results.inkWithNewStroke,
    nextBtn: results.nextBtn, listScrollYAfterBack: results.listScrollYAfterBack, targetVisibleAfterBack: results.targetVisibleAfterBack,
  }, null, 1));
  await browser.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
