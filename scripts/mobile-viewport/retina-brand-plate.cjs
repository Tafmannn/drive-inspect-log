// Real application capture with the existing fixture backend. No live credentials.
const { chromium } = require("playwright");
const { setup, JOBS, signIn } = require("./mock.cjs");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const OUT = process.env.RETINA_OUT || path.join(__dirname, "shots", "retina-brand-plate");
fs.mkdirSync(OUT, { recursive: true });
const J = JOBS[0].id;
const staff = [
  ["driver-home", "/", false], ["driver-jobs", "/jobs", true],
  ["job-detail", "/jobs/" + J, true], ["pickup", "/inspection/" + J + "/pickup", true],
  ["completed", "/jobs/completed", false], ["pending", "/jobs/pending", false],
  ["uploads", "/pending-uploads", false], ["profile", "/profile", false],
  ["digital-id", "/profile/id", false], ["expenses", "/expenses", false],
  ["expense-new", "/expenses/new", false], ["admin-home", "/?admin=1", false],
  ["super-home", "/?super=1", false], ["admin-jobs", "/jobs/master?admin=1", false],
  ["job-new", "/jobs/new?admin=1", false], ["job-edit", "/jobs/" + J + "/edit?admin=1", false],
  ["pod", "/jobs/" + J + "/pod?admin=1", false],
  ["admin-users", "/admin/users?admin=1", false], ["admin-onboarding", "/admin/onboarding?admin=1", false],
  ["timesheets", "/admin/timesheets?admin=1", false], ["invoice-new", "/invoice/new?admin=1", false],
  ["control-overview", "/control?admin=1", false], ["control-jobs", "/control/jobs?admin=1", false],
  ["control-pod", "/control/pod-review?admin=1", false], ["control-drivers", "/control/drivers?admin=1", false],
  ["control-finance", "/control/finance?admin=1", false], ["control-compliance", "/control/compliance?admin=1", false],
  ["control-clients", "/control/clients?admin=1", false], ["control-admin", "/control/admin?admin=1", false],
  ["control-profitability", "/control/profitability?admin=1", false],
  ["control-invoice-prep", "/control/invoice-prep?admin=1", false],
  ["control-exports", "/control/exports?admin=1", false],
  ["super-settings", "/super-admin/settings?super=1", false],
  ["super-users", "/super-admin/users?super=1", false],
  ["super-orgs", "/super-admin/orgs?super=1", false],
  ["super-jobs", "/super-admin/jobs?super=1", false],
  ["super-audit", "/super-admin/audit?super=1", false],
  ["super-errors", "/super-admin/errors?super=1", false],
  ["super-attention", "/super-admin/attention?super=1", false],
  ["vehicle-library", "/super-admin/vehicle-images?super=1", false],
  ["control-super", "/control/super-admin?super=1", false],
];
const portal = [["portal-moves", "/portal", true], ["portal-job", "/portal/jobs/" + J, true], ["portal-invoices", "/portal/invoices", false]];
const viewports = [
  { width: 320, height: 568, dpr: 3 }, { width: 390, height: 844, dpr: 3 },
  { width: 430, height: 932, dpr: 3 }, { width: 1920, height: 1080, dpr: 2 },
];
const primary = new Set(["driver-home", "driver-jobs", "job-detail", "pickup", "admin-home", "super-home", "control-overview", "control-jobs", "portal-moves", "portal-job", "portal-invoices"]);
const results = [];
async function check(browser, v, routes, customer) {
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, isMobile: v.width < 768, hasTouch: v.width < 768, serviceWorkers: "block" });
  await setup(context);
  if (customer) await signIn(context);
  const base = customer ? "http://127.0.0.1:8081" : "http://127.0.0.1:8080";
  for (const [name, url, requiredPlate] of routes) {
    if (v.width !== 390 && !primary.has(name)) continue;
    const page = await context.newPage();
    const row = { name, viewport: v, issues: [], pageErrors: [] };
    page.on("pageerror", e => row.pageErrors.push(e.message));
    // Permit only local app + the existing mocked backend. Never contact real APIs.
    await page.route("**/*", route => {
      const u = new URL(route.request().url());
      return ["127.0.0.1", "fake-supabase.test"].includes(u.hostname) ? route.fallback() : route.abort();
    });
    try {
      await page.goto(base + url, { waitUntil: "domcontentloaded" });
      const header = page.locator("[data-axentra-brand-row]");
      await header.first().waitFor({ timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await page.locator("[data-testid=axentra-uk-plate] img, [data-axentra-brand-row] img").evaluateAll(imgs => Promise.all(imgs.map(img => img.decode().catch(() => {}))));
      if (requiredPlate) await page.locator("[data-testid=axentra-uk-plate]").first().waitFor({ timeout: 12000 });
      const metrics = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-axentra-brand-row]")];
        const row = rows[0], bounds = row.getBoundingClientRect();
        const logo = row.querySelector("img");
        const gradient = getComputedStyle(row.parentElement).backgroundImage;
        const plates = [...document.querySelectorAll("[data-testid=axentra-uk-plate]")].map(el => {
          const r = el.getBoundingClientRect(), img = el.querySelector("img"), svg = el.querySelector("svg");
          return { width: r.width, height: r.height, radius: getComputedStyle(el).borderTopLeftRadius, sourceWidth: img.naturalWidth, sourceHeight: img.naturalHeight, vector: !!svg, registration: el.dataset.registration };
        });
        return { dpr: devicePixelRatio, count: rows.length, width: bounds.width, height: bounds.height, left: bounds.left, right: bounds.right, logo: logo?.naturalWidth, gradient, plates, viewport: document.documentElement.clientWidth };
      });
      row.metrics = metrics;
      assert.equal(metrics.count, 1, "duplicate brand row");
      assert.equal(metrics.dpr, v.dpr);
      assert(metrics.height >= 55 && metrics.height <= 65, "inconsistent header height");
      assert(metrics.left >= -1 && metrics.right <= metrics.viewport + 1, "header overflow");
      assert(metrics.logo > 0, "missing logo");
      assert(metrics.gradient.includes("rgb(23, 62, 128)") && metrics.gradient.includes("rgb(36, 89, 156)"), "incorrect gradient");
      for (const plate of metrics.plates) {
        assert(plate.width > 0 && plate.height > 0, "collapsed plate");
        assert(Math.abs(plate.width / plate.height - 3411 / 672) < 0.1, "distorted plate");
        assert.notEqual(plate.radius, "0px", "missing rounded corners");
        assert.equal(plate.sourceWidth, 3411);
        assert.equal(plate.sourceHeight, 672);
        assert(plate.sourceWidth >= plate.width * v.dpr, "plate asset would upscale");
        if (/^[A-Z0-9 ]+$/.test(plate.registration)) assert(plate.vector, "missing vector lettering");
      }
    } catch (e) { row.issues.push(String(e.message || e)); }
    try {
      const png = await page.screenshot({ path: path.join(OUT, name + "-" + v.width + "-dpr" + v.dpr + ".png") });
      row.capture = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
      assert.equal(row.capture.width, v.width * v.dpr);
      assert.equal(row.capture.height, v.height * v.dpr);
    } catch (e) { row.issues.push(String(e.message || e)); }
    row.issues.push(...row.pageErrors.map(e => "pageerror: " + e));
    results.push(row);
    console.log(JSON.stringify(row));
    await page.close();
  }
  await context.close();
}
(async () => {
  const browser = await chromium.launch();
  try {
    for (const v of viewports) { await check(browser, v, staff, false); await check(browser, v, portal, true); }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(results, null, 2));
  }
  const failed = results.filter(r => r.issues.length);
  console.log("Actual app captures: " + results.length + "; failures: " + failed.length);
  if (failed.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
