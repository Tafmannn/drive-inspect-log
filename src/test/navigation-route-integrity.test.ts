// Guards against dead links: every in-app path literal used as a navigation
// target (navigate(), to=, href=, route:/actionRoute: fields) must resolve to
// a <Route> declared in App.tsx. Previously the attention engine pointed at
// /admin/logs and the workflow brain at /pod-report/:id — neither existed.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SRC = join(__dirname, "..");

function knownRoutes(): RegExp[] {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const routes = new Set<string>(["/control"]);
  for (const m of app.matchAll(/path="([^"]+)"/g)) {
    const p = m[1];
    if (p.startsWith("/")) routes.add(p);
    else if (p !== "*") routes.add(`/control/${p}`); // nested under /control
  }
  return [...routes].map((r) => new RegExp("^" + r.replace(/:[^/]+/g, "[^/]+") + "/?$"));
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== "test") sourceFiles(p, out);
    } else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) {
      out.push(p);
    }
  }
  return out;
}

const PATTERNS = [
  /navigate\(\s*[`"']([^`"']+)[`"']/g,
  /\bto=\{?\s*[`"']([^`"']+)[`"']/g,
  /\bhref=\{?\s*[`"'](\/[^`"']*)[`"']/g,
  /\b(?:path|route|href|to|actionRoute|link|url)\s*:\s*[`"'](\/[^`"']*)[`"']/g,
];

describe("navigation route integrity", () => {
  it("every in-app navigation target resolves to a declared route", () => {
    const routes = knownRoutes();
    const broken: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const pat of PATTERNS) {
          for (const m of line.matchAll(pat)) {
            const raw = m[1];
            if (!raw.startsWith("/") || raw.startsWith("//")) continue;
            const path = raw
              .replace(/\$\{[^}]*\}/g, "X")
              .split("${")[0] // nested template literal — keep the static prefix
              .split(/[?#]/)[0];
            if (!path || path === "/") continue;
            if (/\.(png|jpe?g|svg|webp|ico|json|pdf|js|css)$/i.test(path)) continue;
            if (!routes.some((re) => re.test(path))) {
              broken.push(`${relative(SRC, file)}:${i + 1} -> ${raw}`);
            }
          }
        }
      });
    }

    expect(broken).toEqual([]);
  });
});
