/**
 * Touch-target audit for all 45 damage diagrams at a given phone width.
 * Rasterises each view at its on-screen CSS-pixel size (same top-most panel
 * rule and wheel-arch holes as hitTest.resolveTap), then reports, per panel,
 * the radius of the largest circle that fits inside its visible region.
 *
 *   npx vite-node scripts/damage-art/touch-audit.ts -- [phoneWidth=390] [minRadiusPx=7]
 */
import { BODY_TYPES } from "../../src/features/damage/bodyTypes";
import { getDiagram, VIEW_IDS } from "../../src/features/damage/geometry/views";
import { pointInPoly, bbox } from "../../src/features/damage/geometry/poly";

const phone = Number(process.argv[2] ?? 390);
const minR = Number(process.argv[3] ?? 7);
// DamageInspector: page p-4 (32) + card p-3 (24) + borders (2)
const boxW = phone - 58;
const boxH = (v: string) => (v === "top" ? 340 : 240) - 20; // minus pt-5 label strip

type Row = { body: string; view: string; panel: string; r: number; area: number };
const rows: Row[] = [];
for (const bt of BODY_TYPES) {
  for (const v of VIEW_IDS) {
    const d = getDiagram(bt, v);
    const vb = d.viewBox;
    const s = Math.min(boxW / vb.w, boxH(v) / vb.h); // CSS px per unit
    const W = Math.ceil(vb.w * s), H = Math.ceil(vb.h * s);
    const boxes = d.panels.map((p) => p.polys.map(bbox));
    const hb = d.holes.map(bbox);
    const id = new Int16Array(W * H).fill(-1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const pt: [number, number] = [vb.x + (x + 0.5) / s, vb.y + (y + 0.5) / s];
      const inHole = d.holes.some((h, k) => pt[0] >= hb[k].x && pt[0] <= hb[k].x + hb[k].w && pt[1] >= hb[k].y && pt[1] <= hb[k].y + hb[k].h && pointInPoly(pt, h));
      for (let i = d.panels.length - 1; i >= 0; i--) {
        const p = d.panels[i];
        if (inHole && p.material !== "tyre") continue;
        if (p.polys.some((poly, k) => { const b = boxes[i][k]; return pt[0] >= b.x && pt[0] <= b.x + b.w && pt[1] >= b.y && pt[1] <= b.y + b.h && pointInPoly(pt, poly); })) { id[y * W + x] = i; break; }
      }
    }
    // chessboard distance to a different label (two-pass), per pixel
    const D = new Float32Array(W * H);
    const INF = 1e9;
    for (let k = 0; k < W * H; k++) D[k] = id[k] < 0 ? 0 : INF;
    const same = (a: number, b: number) => id[a] === id[b];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = y * W + x; if (!D[k]) continue;
      let m = D[k];
      for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1], [1, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W) { m = Math.min(m, 1); continue; }
        const n = ny * W + nx; m = Math.min(m, same(k, n) ? D[n] + 1 : 1);
      }
      D[k] = m;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const k = y * W + x; if (!D[k]) continue;
      let m = D[k];
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const nx = x + dx, ny = y + dy; if (nx >= W || ny >= H || nx < 0) { m = Math.min(m, 1); continue; }
        const n = ny * W + nx; m = Math.min(m, same(k, n) ? D[n] + 1 : 1);
      }
      D[k] = m;
    }
    const best = new Float32Array(d.panels.length), cnt = new Int32Array(d.panels.length);
    for (let k = 0; k < W * H; k++) if (id[k] >= 0) { cnt[id[k]]++; if (D[k] > best[id[k]]) best[id[k]] = D[k]; }
    d.panels.forEach((p, i) => rows.push({ body: bt, view: v, panel: p.id, r: best[i], area: cnt[i] }));
  }
}
const small = rows.filter((r) => r.r < minR).sort((a, b) => a.r - b.r);
const unreachable = rows.filter((r) => r.area === 0);
console.log(JSON.stringify({ phone, minR, panels: rows.length, belowMin: small.length, unreachable: unreachable.length }));
for (const r of small) console.log(`${r.body.padEnd(11)} ${r.view.padEnd(5)} ${r.panel.padEnd(28)} r=${r.r.toFixed(0)}px area=${r.area}px²`);
