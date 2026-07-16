import { chromium } from "playwright";
import fs from "node:fs";
const OUT = process.argv[2]; // "review" -> scratchpad, else public/img
const SS = "/tmp/claude-0/-home-user-drive-inspect-log/cac9ae2f-8a68-5bf9-9111-84f2b211dae6/scratchpad";
const GRADE = "contrast(1.05) saturate(0.95) brightness(1.01)";
const dataUri = (f) => `data:image/png;base64,${fs.readFileSync("/tmp/imgsrc2/" + f + ".png").toString("base64")}`;
const NAT_W = 1672, NAT_H = 941;

// name, src, [sx,sy,cw,ch] crop box (excludes third-party trademarks)
const jobs = [
  ["n1c", "n1", 20, 120, 1100, 733],
  ["n2c", "n2", 60, 50, 1320, 880],
  ["n3c", "n3", 40, 150, 1050, 700],
  ["n4c", "n4", 260, 200, 1050, 700],
  ["n5c", "n5", 60, 210, 1050, 700],
];
const outW = 1050, outH = 700;

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [name, src, sx, sy, cw, ch] of jobs) {
  const ctx = await browser.newContext({ viewport: { width: outW, height: outH }, deviceScaleFactor: 1.4 });
  const page = await ctx.newPage();
  const scale = outW / cw;
  const dispW = Math.round(NAT_W * scale), dispH = Math.round(NAT_H * scale);
  const offX = Math.round(sx * scale), offY = Math.round(sy * scale);
  const html = `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{overflow:hidden;background:#000}
    img{position:absolute;left:${-offX}px;top:${-offY}px;width:${dispW}px;height:${dispH}px;filter:${GRADE};display:block}
  </style></head><body><img src="${dataUri(src)}"></body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => { const i = document.querySelector("img"); return i && i.complete && i.naturalWidth > 0; }, { timeout: 15000 });
  const dir = OUT === "review" ? SS + "/rev-" : "/home/user/drive-inspect-log/public/img/";
  const path = OUT === "review" ? `${dir}${name}.jpg` : `${dir}${name}.jpg`;
  await page.screenshot({ path, type: "jpeg", quality: 84 });
  await ctx.close();
  console.log("cropped", name);
}
await browser.close();
