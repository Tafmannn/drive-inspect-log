import { STATUS, ICON } from "./types.mjs";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function counts(suites) {
  const c = {
    PASS: 0,
    WARNING: 0,
    FAIL: 0,
    NOT_EXECUTED: 0,
    SKIPPED: 0,
    total: 0,
  };
  for (const s of suites)
    for (const ck of s.checks) {
      c[ck.status] = (c[ck.status] || 0) + 1;
      c.total++;
    }
  return c;
}

// ─── Markdown ────────────────────────────────────────────────────────────────
export function toMarkdown(result) {
  const { overall, suites, meta } = result;
  const c = counts(suites);
  const L = [];
  L.push(`# Axentra — Production Release Validation Report`);
  L.push("");
  L.push(`**Overall:** ${ICON[overall]} \`${overall}\``);
  L.push("");
  L.push(`| Field | Value |`);
  L.push(`| --- | --- |`);
  L.push(`| Generated | ${meta.generatedAt} |`);
  L.push(`| Git branch | \`${meta.branch}\` |`);
  L.push(`| Git commit | \`${meta.commit}\` |`);
  L.push(`| Live environment | ${meta.liveEnv ? "connected" : "NOT connected (live suites gated)"} |`);
  L.push(`| Checks | ${c.total} total · ${c.PASS} pass · ${c.WARNING} warn · ${c.FAIL} fail · ${c.NOT_EXECUTED} not-executed · ${c.SKIPPED} skipped |`);
  L.push("");
  L.push(`## Suite summary`);
  L.push("");
  L.push(`| # | Suite | Type | Status | P / W / F / N |`);
  L.push(`| --- | --- | --- | --- | --- |`);
  for (const s of suites) {
    const sc = {
      PASS: 0,
      WARNING: 0,
      FAIL: 0,
      NOT_EXECUTED: 0,
    };
    for (const ck of s.checks) sc[ck.status] = (sc[ck.status] || 0) + 1;
    const type = s.requiresLiveEnv ? "live" : "static";
    const crit = s.critical ? " 🔒" : "";
    L.push(
      `| ${s.id} | ${esc(s.name)}${crit} | ${type} | ${ICON[s.status]} ${s.status} | ${sc.PASS} / ${sc.WARNING} / ${sc.FAIL} / ${sc.NOT_EXECUTED} |`,
    );
  }
  L.push("");
  L.push(`> 🔒 = critical suite (a FAIL here makes \`release:validate\` exit non-zero).`);
  L.push("");
  L.push(`## Detail`);
  for (const s of suites) {
    L.push("");
    L.push(`### ${s.id}. ${esc(s.name)} — ${ICON[s.status]} ${s.status}`);
    if (s.note) L.push(`\n_${esc(s.note)}_`);
    L.push("");
    L.push(`| Check | Status | Detail |`);
    L.push(`| --- | --- | --- |`);
    for (const ck of s.checks) {
      const d = esc(ck.detail).replace(/\n/g, "<br>").slice(0, 600);
      L.push(`| ${esc(ck.name)} | ${ICON[ck.status]} ${ck.status} | ${d} |`);
    }
  }
  L.push("");
  L.push(`---`);
  L.push(
    `_Truth Mode: NOT_EXECUTED entries were never run in this environment and are not counted as passing. Provide staging credentials (see \`release-validation/README.md\`) to execute the live suites._`,
  );
  L.push("");
  return L.join("\n");
}

// ─── HTML ────────────────────────────────────────────────────────────────────
const COLOR = {
  PASS: "#1a7f37",
  WARNING: "#9a6700",
  FAIL: "#cf222e",
  NOT_EXECUTED: "#57606a",
  SKIPPED: "#8c959f",
};

export function toHtml(result) {
  const { overall, suites, meta } = result;
  const c = counts(suites);
  const badge = (s, label) =>
    `<span class="b" style="background:${COLOR[s]}">${ICON[s]} ${label ?? s}</span>`;

  const rows = suites
    .map((s) => {
      const sc = { PASS: 0, WARNING: 0, FAIL: 0, NOT_EXECUTED: 0 };
      for (const ck of s.checks) sc[ck.status] = (sc[ck.status] || 0) + 1;
      const checks = s.checks
        .map(
          (ck) =>
            `<tr><td>${esc(ck.name)}</td><td>${badge(ck.status)}</td><td><pre>${esc(
              ck.detail,
            ).slice(0, 1500)}</pre></td></tr>`,
        )
        .join("");
      return `<section>
        <h3>${s.id}. ${esc(s.name)} ${s.critical ? "🔒" : ""} ${badge(s.status)}
          <small>${s.requiresLiveEnv ? "live" : "static"} · ${sc.PASS}P / ${sc.WARNING}W / ${sc.FAIL}F / ${sc.NOT_EXECUTED}N</small></h3>
        ${s.note ? `<p class="note">${esc(s.note)}</p>` : ""}
        <table class="checks"><thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
        <tbody>${checks}</tbody></table>
      </section>`;
    })
    .join("");

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Axentra Release Validation — ${overall}</title>
<style>
  :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  body{margin:0;background:#f6f8fa;color:#1f2328}
  header{background:${COLOR[overall]};color:#fff;padding:24px 32px}
  header h1{margin:0 0 6px;font-size:20px}
  header .ov{font-size:28px;font-weight:700}
  main{max-width:1100px;margin:0 auto;padding:24px 32px}
  .meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;margin:16px 0}
  .meta div{background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:10px 12px;font-size:13px}
  .meta b{display:block;color:#57606a;font-weight:600;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
  .b{display:inline-block;color:#fff;border-radius:999px;padding:2px 9px;font-size:12px;font-weight:600}
  section{background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:14px 18px;margin:14px 0}
  h3{margin:0 0 8px;font-size:15px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  h3 small{color:#57606a;font-weight:500;font-size:12px}
  table.checks{width:100%;border-collapse:collapse;font-size:13px}
  table.checks th,table.checks td{border-top:1px solid #eaeef2;text-align:left;padding:6px 8px;vertical-align:top}
  table.checks th{color:#57606a;font-size:11px;text-transform:uppercase}
  pre{margin:0;white-space:pre-wrap;word-break:break-word;font-size:12px;color:#3b4149;max-height:220px;overflow:auto}
  .note{color:#57606a;font-style:italic;font-size:13px;margin:0 0 8px}
  footer{max-width:1100px;margin:0 auto;padding:8px 32px 40px;color:#57606a;font-size:12px}
</style></head>
<body>
<header>
  <h1>Axentra — Production Release Validation</h1>
  <div class="ov">${ICON[overall]} ${overall}</div>
</header>
<main>
  <div class="meta">
    <div><b>Generated</b>${esc(meta.generatedAt)}</div>
    <div><b>Branch</b>${esc(meta.branch)}</div>
    <div><b>Commit</b>${esc(meta.commit)}</div>
    <div><b>Live env</b>${meta.liveEnv ? "connected" : "not connected — live suites gated"}</div>
    <div><b>Checks</b>${c.total} total</div>
    <div><b>Breakdown</b>${badge(STATUS.PASS, c.PASS)} ${badge(STATUS.WARNING, c.WARNING)} ${badge(STATUS.FAIL, c.FAIL)} ${badge(STATUS.NOT_EXECUTED, c.NOT_EXECUTED)}</div>
  </div>
  ${rows}
</main>
<footer>Truth Mode — NOT_EXECUTED entries were never run here and are never counted as passing.
Provide staging credentials to execute the live suites. See release-validation/README.md.</footer>
</body></html>`;
}
