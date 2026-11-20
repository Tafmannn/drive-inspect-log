// Route sweep: rotate each mounted page P→L→P→L→P (midway scrolled) and
// measure overflow with #root's clip lifted, so hidden oversize children show.
const { open, rotate, BASE } = require("./lib.cjs");
const J = "00000000-0000-4000-8000-000000000007"; // long ref + long address
const routes = (process.env.ROUTES || [
  "/", "/jobs", `/jobs/${J}`, `/inspection/${J}/pickup`, "/jobs/completed", "/jobs/pending", "/pending-uploads", "/profile", "/expenses", "/expenses/new",
  "/admin?admin=1", "/jobs/master?admin=1", "/jobs/new?admin=1", `/jobs/${J}/edit?admin=1`, `/jobs/${J}/pod?admin=1`, "/admin/onboarding?admin=1", "/admin/timesheets?admin=1", "/invoice/new?admin=1",
  "/control?admin=1", "/control/jobs?admin=1", "/control/finance?admin=1", "/control/drivers?admin=1", "/control/clients?admin=1", "/control/invoice-prep?admin=1", "/control/exports?admin=1",
  "/super-admin?super=1", "/super-admin/orgs?super=1", "/super-admin/users?super=1", "/super-admin/settings?super=1", "/control/super-admin?super=1",
].join(",")).split(",");
const sizes = { P: [Number(process.env.PW || 390), Number(process.env.PH || 664)], L: [Number(process.env.PH || 664) + 180, Number(process.env.PW || 390)] };

async function measure(page) {
  return page.evaluate(() => {
    const root = document.getElementById("root");
    const prev = root.style.overflowX;
    root.style.overflowX = "visible";
    const de = document.documentElement;
    const vw = de.clientWidth;
    const docW = de.scrollWidth;
    const offenders = [];
    for (const el of document.querySelectorAll("#root *")) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (b.right <= vw + 1 && b.left >= -1) continue;
      let p = el.parentElement, ok = false;
      while (p && p.id !== "root") {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { const pb = p.getBoundingClientRect(); if (pb.right <= vw + 1 && pb.left >= -1) { ok = true; break; } }
        p = p.parentElement;
      }
      if (ok) continue;
      // keep only innermost-ish: skip if a child is also offending and same right edge
      offenders.push(el);
    }
    const inner = offenders.filter((el) => !offenders.some((o) => o !== el && el.contains(o)));
    const desc = inner.slice(0, 5).map((el) => { const b = el.getBoundingClientRect(); return `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 6).join(".")} [${Math.round(b.left)}→${Math.round(b.right)}] "${(el.textContent || "").trim().slice(0, 30)}"`; });
    root.style.overflowX = prev;
    // Who scrolls?
    const scrollers = [...document.querySelectorAll("#root *")].filter((el) => { const cs = getComputedStyle(el); return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1; }).map((el) => `${el.tagName.toLowerCase()}(${el.scrollTop}/${el.scrollHeight - el.clientHeight})`);
    return { vw, docW, docScrollable: de.scrollHeight - de.clientHeight, winY: Math.round(scrollY), offenders: inner.length, desc, scrollers: scrollers.slice(0, 3), vvScale: visualViewport.scale };
  });
}

(async () => {
  const { browser, page } = await open(process.env.DEVICE || "iPhone 13");
  const summary = [];
  for (const r of routes) {
    await page.setViewportSize({ width: sizes.P[0], height: sizes.P[1] });
    await page.goto(BASE + r);
    await page.waitForTimeout(1800);
    // scroll midway on whatever scrolls
    await page.evaluate(() => {
      window.scrollTo(0, (document.scrollingElement.scrollHeight - innerHeight) / 2);
      const m = document.querySelector("main.overflow-y-auto"); if (m) m.scrollTop = (m.scrollHeight - m.clientHeight) / 2;
    });
    await page.waitForTimeout(150);
    const rows = [];
    rows.push(["P0", await measure(page)]);
    for (const [k, s] of [["L1", sizes.L], ["P1", sizes.P], ["L2", sizes.L], ["P2", sizes.P]]) { await rotate(page, ...s); rows.push([k, await measure(page)]); }
    const bad = rows.filter(([, m]) => m.offenders > 0 || m.docW > m.vw);
    console.log(`${bad.length ? "✗" : "✓"} ${r}  ` + rows.map(([k, m]) => `${k}:${m.docW}/${m.vw}${m.offenders ? "!" + m.offenders : ""}${m.scrollers.length ? " sc=" + m.scrollers.join("|") : ""} y=${m.winY}`).join("  "));
    for (const [k, m] of bad.slice(0, 2)) console.log(`     ${k}: ${m.desc.join("\n          ")}`);
    summary.push({ r, bad: bad.length });
  }
  await browser.close();
})();
