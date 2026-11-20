const { chromium, devices } = require("playwright");
const { setup } = require("./mock.cjs");
const BASE = "http://127.0.0.1:8080";

async function open(device = "iPhone 13", extra = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ...devices[device], deviceScaleFactor: 1, ...extra });
  await setup(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  return { browser, context, page };
}

// Rotate the SAME mounted page (no reload).
async function rotate(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(350);
}

// Evidence that separates the four failure classes.
async function probe(page, label) {
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const vw = de.clientWidth;
    const root = document.getElementById("root");
    const vv = window.visualViewport;
    // Elements wider than the layout viewport that are NOT inside an
    // intentional horizontal scroller (overflow-x auto/scroll).
    const offenders = [];
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right <= vw + 1 && b.left >= -1) continue;
      let p = el.parentElement, scrolled = false, hidden = false;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth) { scrolled = true; break; }
        if (cs.position === "fixed" && getComputedStyle(el).position !== "fixed") {}
        if (p.id !== "root" && /(hidden|clip)/.test(cs.overflowX)) { const pb = p.getBoundingClientRect(); if (pb.right <= vw + 1 && pb.left >= -1) { hidden = true; break; } }
        p = p.parentElement;
      }
      if (scrolled || hidden) continue;
      // Skip off-canvas closed things (aria-hidden / transformed away intentionally)
      if (el.closest("[data-state=closed]")) continue;
      offenders.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? el.className : "").toString().slice(0, 80), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), text: (el.textContent || "").trim().slice(0, 40) });
    }
    // innermost offenders only
    const scrollers = [];
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) scrollers.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), scrollTop: Math.round(el.scrollTop), sh: el.scrollHeight, ch: el.clientHeight });
    }
    return {
      vw, innerWidth: window.innerWidth, innerHeight: window.innerHeight,
      docScrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth,
      rootClientW: root.clientWidth, rootScrollW: root.scrollWidth,
      vvW: vv && Math.round(vv.width), vvH: vv && Math.round(vv.height), vvScale: vv && vv.scale, vvOffsetLeft: vv && vv.offsetLeft,
      scrollX: window.scrollX, scrollY: Math.round(window.scrollY),
      scrollingElementH: document.scrollingElement.scrollHeight,
      offenders: offenders.slice(-8), offenderCount: offenders.length,
      innerScrollers: scrollers.slice(0, 6),
      active: document.activeElement && document.activeElement.tagName,
    };
  });
  console.log(`\n=== ${label}`);
  console.log(JSON.stringify(r, null, 1));
  return r;
}

module.exports = { open, rotate, probe, BASE };
