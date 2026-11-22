/**
 * Fingertip hit rate for panels narrower than a fingertip, at a 390px phone:
 * aim at each tiny panel's anchor, scatter taps over a 7px-radius disc, count
 * taps that give that panel (directly, or as an option in the chooser).
 *   npx vite-node scripts/damage-art/finger-hit.ts -- [phone=390]
 */
import { BODY_TYPES } from "../../src/features/damage/bodyTypes";
import { getDiagram, VIEW_IDS } from "../../src/features/damage/geometry/views";
import { resolveTap } from "../../src/features/damage/hitTest";

const phone = Number(process.argv[2] ?? 390);
const boxW = phone - 58;
const rates: { k: string; r: number }[] = [];
for (const bt of BODY_TYPES) for (const v of VIEW_IDS) {
  const d = getDiagram(bt, v); const vb = d.viewBox;
  const s = Math.min(boxW / vb.w, ((v === "top" ? 340 : 240) - 20) / vb.h);
  const tol = 14 / s, finger = 7 / s;
  for (const p of d.panels) {
    if (Math.min(p.bbox.w, p.bbox.h) >= tol) continue;
    let ok = 0, n = 0;
    for (let a = 0; a < 24; a++) for (const f of [0.3, 0.65, 1]) {
      const t = (a / 24) * Math.PI * 2; n++;
      const r = resolveTap(d, [p.anchor[0] + Math.cos(t) * finger * f, p.anchor[1] + Math.sin(t) * finger * f], tol);
      if (r.panelId === p.id || r.candidates.includes(p.id)) ok++;
    }
    rates.push({ k: `${bt}/${v}/${p.id}`, r: ok / n });
  }
}
rates.sort((a, b) => a.r - b.r);
const pct = (x: number) => Math.round(x * 100);
console.log(JSON.stringify({ tinyPanels: rates.length, median: pct(rates[rates.length >> 1].r), under50: rates.filter((x) => x.r < 0.5).length, worst5: rates.slice(0, 5).map((x) => `${x.k} ${pct(x.r)}%`) }));
