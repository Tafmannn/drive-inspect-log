#!/usr/bin/env node
// Axentra — Production Release Validation runner.
//
// Zero runtime dependencies (Node ESM only), so it executes anywhere Node 18+
// is available: a laptop, CI, or this container. Discovers every suite in
// ./suites, runs them in order, writes an HTML + Markdown + JSON report, prints
// a summary, and exits non-zero iff a CRITICAL suite produced a FAIL.
//
// Usage:
//   node release-validation/run.mjs [--fast] [--only=01,02] [--skip=07,08,09]
//                                   [--list] [--out=<dir>]
//   --fast   skip the heavy build/test/typecheck suites (07,08,09)
//   --only   run only the listed suite ids
//   --skip   run all suites except the listed ids
//   --list   print the suite catalogue and exit
//   --out    report output directory (default: release-validation/reports)
import { readdirSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { STATUS, ICON, rollup, fail as failCheck } from "./lib/types.mjs";
import { run as sh } from "./lib/exec.mjs";
import { liveEnv } from "./lib/env.mjs";
import { toHtml, toMarkdown } from "./lib/report.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function parseArgs(argv) {
  const a = { fast: false, only: null, skip: null, list: false, out: null };
  for (const arg of argv) {
    if (arg === "--fast") a.fast = true;
    else if (arg === "--list") a.list = true;
    else if (arg.startsWith("--only=")) a.only = arg.slice(7).split(",").map((s) => s.trim());
    else if (arg.startsWith("--skip=")) a.skip = arg.slice(7).split(",").map((s) => s.trim());
    else if (arg.startsWith("--out=")) a.out = arg.slice(6);
  }
  return a;
}

async function loadSuites() {
  const dir = join(__dirname, "suites");
  const files = readdirSync(dir)
    .filter((f) => /^\d\d-.*\.mjs$/.test(f))
    .sort();
  const suites = [];
  for (const f of files) {
    const mod = await import(join(dir, f));
    if (mod.default) suites.push(mod.default);
  }
  return suites;
}

function gitMeta() {
  const branch = sh("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: ROOT, timeoutMs: 10_000 });
  const commit = sh("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, timeoutMs: 10_000 });
  return {
    branch: branch.ok ? branch.stdout.trim() : "unknown",
    commit: commit.ok ? commit.stdout.trim() : "unknown",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const suites = await loadSuites();

  if (args.list) {
    console.log("Suite catalogue:\n");
    for (const s of suites)
      console.log(
        `  ${s.id}  ${s.requiresLiveEnv ? "[live]  " : "[static]"} ${s.critical ? "🔒" : "  "} ${s.name}`,
      );
    process.exit(0);
  }

  const skipHeavy = args.fast ? ["07", "08", "09"] : [];
  const shouldRun = (id) => {
    if (args.only) return args.only.includes(id);
    if (args.skip && args.skip.includes(id)) return false;
    return true;
  };

  const env = liveEnv();
  const liveConnected = (env.hasDb || env.hasHttp) && !env.pointsAtProd;

  console.log(`\nAxentra — Production Release Validation`);
  console.log(`  live env: ${liveConnected ? "connected (staging)" : "NOT connected — live suites gated"}`);
  console.log(`  running ${suites.filter((s) => shouldRun(s.id)).length}/${suites.length} suites\n`);

  const ctx = { root: ROOT, fast: args.fast };
  const results = [];

  for (const suite of suites) {
    if (!shouldRun(suite.id)) {
      results.push({ ...meta(suite), status: STATUS.SKIPPED, checks: [skippedCheck("filtered out")], note: "skipped (filter)" });
      continue;
    }
    process.stdout.write(`  [${suite.id}] ${suite.name} … `);
    try {
      const out = await suite.run({ ...ctx, fast: ctx.fast || skipHeavy.includes(suite.id) });
      const checks = out.checks || [];
      const status = rollup(checks.map((c) => c.status));
      results.push({ ...meta(suite), status, checks, note: out.note || "" });
      console.log(`${ICON[status]} ${status}`);
    } catch (e) {
      const checks = [failCheck("suite crashed", String(e?.stack || e?.message || e))];
      results.push({ ...meta(suite), status: STATUS.FAIL, checks, note: "suite threw" });
      console.log(`${ICON.FAIL} FAIL (threw)`);
    }
  }

  // Overall status + exit code: a FAIL in any CRITICAL suite is blocking.
  const blocking = results.filter(
    (r) => r.critical && r.checks.some((c) => c.status === STATUS.FAIL),
  );
  const anyWarn = results.some((r) => r.checks.some((c) => c.status === STATUS.WARNING));
  const overall = blocking.length ? STATUS.FAIL : anyWarn ? STATUS.WARNING : STATUS.PASS;

  const result = {
    overall,
    suites: results,
    meta: { ...gitMeta(), generatedAt: new Date().toISOString(), liveEnv: liveConnected },
  };

  const outDir = args.out ? resolve(ROOT, args.out) : join(__dirname, "reports");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "release-validation.html"), toHtml(result));
  writeFileSync(join(outDir, "release-validation.md"), toMarkdown(result));
  writeFileSync(join(outDir, "release-validation.json"), JSON.stringify(result, null, 2));

  // Console summary.
  console.log(`\n${"─".repeat(60)}`);
  for (const r of results)
    console.log(`  ${ICON[r.status]} ${r.id} ${r.name}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`  OVERALL: ${ICON[overall]} ${overall}`);
  console.log(`  reports: ${join(outDir, "release-validation.{html,md,json}")}`);
  if (blocking.length) {
    console.log(`\n  BLOCKING failures in critical suites:`);
    for (const b of blocking)
      for (const c of b.checks.filter((c) => c.status === STATUS.FAIL))
        console.log(`    ❌ [${b.id}] ${c.name}: ${c.detail.split("\n")[0]}`);
  }
  const nonBlockingFails = results.filter(
    (r) => !r.critical && r.checks.some((c) => c.status === STATUS.FAIL),
  );
  if (nonBlockingFails.length) {
    console.log(`\n  Non-blocking failures (informational — suite is not critical):`);
    for (const b of nonBlockingFails)
      for (const c of b.checks.filter((c) => c.status === STATUS.FAIL))
        console.log(`    ⚠️ [${b.id}] ${c.name}: ${c.detail.split("\n")[0]}`);
  }
  console.log("");

  process.exit(blocking.length ? 1 : 0);
}

function meta(suite) {
  return {
    id: suite.id,
    name: suite.name,
    critical: Boolean(suite.critical),
    requiresLiveEnv: Boolean(suite.requiresLiveEnv),
  };
}
function skippedCheck(detail) {
  return { name: "skipped", status: STATUS.SKIPPED, detail };
}

main().catch((e) => {
  console.error("release-validation runner crashed:", e);
  process.exit(2);
});
