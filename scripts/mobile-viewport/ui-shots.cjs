// Before/after screenshots of the real app (fixture backend, auth bypassed).
// Usage: TAG=before NODE_PATH=$(npm root -g) node ui-shots.cjs [routeFilter]
// Writes shots/ui-<TAG>/<route>-<width>.png plus layout probes to stdout.
const { chromium } = require("playwright");
const { setup, JOBS } = require("./mock.cjs");
const fs = require("fs");
const BASE = process.env.BASE || "http://127.0.0.1:8080";
const TAG = process.env.TAG || "now";
const SCALE = Number(process.env.SCALE || 2);
const OUT = `${__dirname}/shots/ui-${TAG}`;
fs.mkdirSync(OUT, { recursive: true });
const J = JOBS[0].id;

let ROUTES = [
  ["driver-home", "/"],
  ["driver-jobs", "/jobs"],
  ["job-detail", `/jobs/${J}`],
  ["pickup-step1", `/inspection/${J}/pickup`],
  ["uploads", "/pending-uploads"],
  ["profile", "/profile"],
  ["admin-home", "/?admin=1"],
  ["admin-jobs-master", "/jobs/master?admin=1"],
  ["control", "/control?admin=1"],
  ["super-home", "/?super=1"],
];
const ADMIN_ROUTES = [
  ["a-jobs-master", "/jobs/master?admin=1"],
  ["a-job-new", "/jobs/new?admin=1"],
  ["a-job-detail", `/jobs/${J}?admin=1`],
  ["c-overview", "/control?admin=1"],
  ["c-jobs", "/control/jobs?admin=1"],
  ["c-pod-review", "/control/pod-review?admin=1"],
  ["c-drivers", "/control/drivers?admin=1"],
  ["c-compliance", "/control/compliance?admin=1"],
  ["c-finance", "/control/finance?admin=1"],
  ["c-clients", "/control/clients?admin=1"],
  ["c-admin", "/control/admin?admin=1"],
  ["c-super", "/control/super-admin?super=1"],
];
const REST_ROUTES = [
  ["r-job-new", "/jobs/new?admin=1"],
  ["r-job-edit", `/jobs/${J}/edit?admin=1`],
  ["r-invoice-new", "/invoice/new?admin=1"],
  ["r-invoice-prep", "/control/invoice-prep?admin=1"],
  ["r-clients", "/control/clients?admin=1"],
  ["r-profitability", "/control/profitability?admin=1"],
  ["r-exports", "/control/exports?admin=1"],
];
const MORE_ROUTES = [
  ["m-pod", `/jobs/${J}/pod`],
  ["m-expenses", "/expenses"],
  ["m-expense-new", "/expenses/new"],
  ["m-digital-id", "/profile/id"],
  ["m-timesheets", "/admin/timesheets?admin=1"],
  ["m-welcome", "/welcome"],
  ["m-completed", "/jobs/completed"],
];
const LAST_ROUTES = [
  ["l-admin-users", "/admin/users?admin=1"],
  ["l-control-admin", "/control/admin?admin=1"],
  ["l-onboarding", "/admin/onboarding?admin=1"],
  ["l-driver-wizard", "/admin/drivers/11111111-1111-4111-8111-111111111111/complete?admin=1"],
];
if (process.env.ROUTESET === "last") ROUTES.splice(0, ROUTES.length, ...LAST_ROUTES);
if (process.env.ROUTESET === "more") ROUTES.splice(0, ROUTES.length, ...MORE_ROUTES);
if (process.env.ROUTESET === "rest") ROUTES.splice(0, ROUTES.length, ...REST_ROUTES);
if (process.env.ROUTESET === "admin") ROUTES.splice(0, ROUTES.length, ...ADMIN_ROUTES);
const WIDTHS = (process.env.WIDTHS || "375,390,430,1440").split(",").map(Number);

(async () => {
  const filter = process.argv[2];
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    const h = w >= 1024 ? 900 : w === 375 ? 667 : w === 390 ? 844 : 932;
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: SCALE,
      isMobile: w < 1024,
      hasTouch: w < 1024,
    });
    await setup(context);
    for (const [name, path] of ROUTES) {
      if (filter && !name.includes(filter)) continue;
      const page = await context.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push(e.message));
      await page.goto(BASE + path, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(900);
      // Where does the first actionable content start? (top of <main> / first card/button below the chrome)
      const probe = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const overflow = document.documentElement.scrollWidth > vw + 1;
        const header = document.querySelector("header");
        const hb = header ? header.getBoundingClientRect() : null;
        const chromeBottom = Math.round(hb ? hb.bottom : 0);
        return { chromeBottom, overflow, docH: document.documentElement.scrollHeight };
      });
      await page.screenshot({ path: `${OUT}/${name}-${w}.png`, fullPage: false });
      console.log(JSON.stringify({ name, w, ...probe, errs: errs.slice(0, 2) }));
      await page.close();
    }
    await context.close();
  }
  await browser.close();
})();
