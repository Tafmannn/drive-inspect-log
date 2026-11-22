/**
 * Tiny 2-D geometry kit for the vehicle diagrams.
 *
 * Every panel in every view is a plain polygon (a dense polyline sampled from
 * lines/Béziers/arcs). That keeps three things trivially consistent:
 *   1. what is drawn (SVG <path d=…>),
 *   2. what the finger hits (the same polygon — native SVG hit-testing and the
 *      pure resolver in hitTest.ts use identical geometry), and
 *   3. what the tests check (point-in-polygon over the exported data).
 */
export type Pt = [number, number];
export type Poly = Pt[];

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Path builder that samples curves into points. */
export class PathBuilder {
  pts: Pt[] = [];
  private get last(): Pt {
    return this.pts[this.pts.length - 1];
  }
  move(x: number, y: number) {
    this.pts.push([x, y]);
    return this;
  }
  line(x: number, y: number) {
    this.pts.push([x, y]);
    return this;
  }
  quad(cx: number, cy: number, x: number, y: number) {
    const [x0, y0] = this.last;
    const n = segs(x0, y0, x, y);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      this.pts.push([a * x0 + b * cx + c * x, a * y0 + b * cy + c * y]);
    }
    return this;
  }
  cubic(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    const [x0, y0] = this.last;
    const n = segs(x0, y0, x, y) + 2;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      this.pts.push([
        u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
        u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y,
      ]);
    }
    return this;
  }
  /** Arc around (cx,cy) from angle a0 to a1 (radians, SVG y-down sense). */
  arc(cx: number, cy: number, r: number, a0: number, a1: number) {
    const n = Math.max(6, Math.ceil((Math.abs(a1 - a0) * r) / 3));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      this.pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return this;
  }
  done(): Poly {
    return dedupe(this.pts);
  }
}

function segs(x0: number, y0: number, x1: number, y1: number) {
  return Math.max(4, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
}

function dedupe(p: Poly): Poly {
  const out: Poly = [];
  for (const q of p) {
    const l = out[out.length - 1];
    if (!l || Math.abs(l[0] - q[0]) > 0.01 || Math.abs(l[1] - q[1]) > 0.01) out.push(q);
  }
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01) out.pop();
  }
  return out;
}

/** Rounded rectangle polygon. */
export function roundRect(x: number, y: number, w: number, h: number, r: number): Poly {
  const rr = Math.min(r, w / 2, h / 2);
  const p = new PathBuilder();
  p.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  p.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  p.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  p.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  return p.done();
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 40): Poly {
  const out: Poly = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/**
 * Sutherland–Hodgman clip against the half-plane f(p) >= 0, f linear.
 * Works for concave subjects (may leave zero-width seams, harmless to render).
 */
export function clipBy(poly: Poly, f: (p: Pt) => number): Poly {
  if (poly.length === 0) return poly;
  const out: Poly = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return dedupe(out);
}

/** A (possibly slanted) cut line given by two points; x varies with y. */
export interface Cut {
  a: Pt;
  b: Pt;
}
export const vcut = (x: number, slant = 0, y0 = 0, y1 = 1000): Cut => ({
  a: [x - slant, y0],
  b: [x + slant, y1],
});
/** Signed horizontal distance from a cut (positive = right of it). */
function cutF(c: Cut) {
  const [x1, y1] = c.a, [x2, y2] = c.b;
  const k = (x2 - x1) / (y2 - y1 || 1e-9);
  return (p: Pt) => p[0] - (x1 + (p[1] - y1) * k);
}
export const rightOf = (poly: Poly, c: Cut) => clipBy(poly, cutF(c));
export const leftOf = (poly: Poly, c: Cut) => {
  const f = cutF(c);
  return clipBy(poly, (p) => -f(p));
};
export const between = (poly: Poly, l: Cut, r: Cut) => leftOf(rightOf(poly, l), r);
export const above = (poly: Poly, y: number) => clipBy(poly, (p) => y - p[1]);
export const below = (poly: Poly, y: number) => clipBy(poly, (p) => p[1] - y);
/** Keep the part above a line through two points (smaller y = above). */
export const aboveLine = (poly: Poly, a: Pt, b: Pt) => {
  const k = (b[1] - a[1]) / (b[0] - a[0] || 1e-9);
  return clipBy(poly, (p) => a[1] + (p[0] - a[0]) * k - p[1]);
};
export const belowLine = (poly: Poly, a: Pt, b: Pt) => {
  const k = (b[1] - a[1]) / (b[0] - a[0] || 1e-9);
  return clipBy(poly, (p) => p[1] - (a[1] + (p[0] - a[0]) * k));
};
export const xRange = (poly: Poly, x0: number, x1: number) =>
  clipBy(clipBy(poly, (p) => p[0] - x0), (p) => x1 - p[0]);
export const yRange = (poly: Poly, y0: number, y1: number) =>
  clipBy(clipBy(poly, (p) => p[1] - y0), (p) => y1 - p[1]);

export function mirrorX(poly: Poly, cx: number): Poly {
  return poly.map(([x, y]) => [2 * cx - x, y] as Pt).reverse();
}

export function area(poly: Poly): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export function bbox(poly: Poly): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function pointInPoly(pt: Pt, poly: Poly): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function distToPoly(pt: Pt, poly: Poly): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1e-9;
    let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/**
 * A point well inside the polygon (approximate pole of inaccessibility):
 * grid search for the interior point farthest from the outline.
 */
export function interiorPoint(poly: Poly): Pt {
  const b = bbox(poly);
  let best: Pt = [b.x + b.w / 2, b.y + b.h / 2];
  let bestD = -1;
  const N = 18;
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const p: Pt = [b.x + (b.w * i) / N, b.y + (b.h * j) / N];
      if (!pointInPoly(p, poly)) continue;
      const d = distToPoly(p, poly);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

export function toPath(poly: Poly): string {
  if (poly.length === 0) return "";
  let d = `M${r1(poly[0][0])} ${r1(poly[0][1])}`;
  for (let i = 1; i < poly.length; i++) d += `L${r1(poly[i][0])} ${r1(poly[i][1])}`;
  return d + "Z";
}

/** Shrink a polygon toward its interior point (cheap inset for highlights/glass). */
export function scaleAbout(poly: Poly, s: number, about?: Pt): Poly {
  const c = about ?? interiorPoint(poly);
  return poly.map(([x, y]) => [c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s] as Pt);
}

/** Intersect any subject with a CONVEX clip polygon. */
export function clipConvex(subject: Poly, clip: Poly): Poly {
  // Orientation of the clip polygon (signed area in screen coords).
  let s = 0;
  for (let i = 0; i < clip.length; i++) {
    const [x1, y1] = clip[i], [x2, y2] = clip[(i + 1) % clip.length];
    s += x1 * y2 - x2 * y1;
  }
  const sign = s >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    out = clipBy(out, (p) => sign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])));
  }
  return out;
}
