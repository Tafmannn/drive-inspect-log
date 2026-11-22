/**
 * For each of the 45 views at a 390px phone: share of the vehicle's visible
 * area where a tap opens the "Which panel?" chooser, and which panels can't
 * be reached by any tap (directly or via the chooser).
 *   npx vite-node scripts/damage-art/prompt-rate.ts -- [phone=390]
 */
import { BODY_TYPES } from "../../src/features/damage/bodyTypes";
import { getDiagram, VIEW_IDS } from "../../src/features/damage/geometry/views";
import { resolveTap } from "../../src/features/damage/hitTest";

const phone = Number(process.argv[2] ?? 390);
const boxW = phone - 58;
let worst = 0; const unreached: string[] = []; const rates: number[] = [];
for (const bt of BODY_TYPES) for (const v of VIEW_IDS) {
  const d = getDiagram(bt, v); const vb = d.viewBox;
  const s = Math.min(boxW / vb.w, ((v === "top" ? 340 : 240) - 20) / vb.h);
  const tol = 14 / s;
  let inside = 0, ask = 0; const reached = new Set<string>();
  for (let y = 0; y < vb.h * s; y += 2) for (let x = 0; x < vb.w * s; x += 2) {
    const r = resolveTap(d, [vb.x + x / s, vb.y + y / s], tol);
    if (r.inside) inside++;
    if (r.candidates.length > 1) { if (r.inside) ask++; r.candidates.forEach((c) => reached.add(c)); }
    else if (r.panelId) reached.add(r.panelId);
  }
  const rate = ask / Math.max(1, inside); rates.push(rate); worst = Math.max(worst, rate);
  for (const p of d.panels) if (!reached.has(p.id)) unreached.push(`${bt}/${v}/${p.id}`);
  if (rate > 0.15) console.log(`${bt.padEnd(11)} ${v.padEnd(5)} asks on ${(rate * 100).toFixed(0)}% of body taps`);
}
rates.sort((a, b) => a - b);
console.log(JSON.stringify({ phone, median: +(rates[22] * 100).toFixed(1), worst: +(worst * 100).toFixed(1), unreachable: unreached }));
