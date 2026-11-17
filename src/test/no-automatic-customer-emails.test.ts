// Owner's decision (2026-11-17): customer emails (POD / POC) are sent by hand
// only. Nothing in the app may call the old automatic sender, and the sender
// itself must not send.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("no automatic customer emails", () => {
  it("no app code invokes notify-customers", () => {
    const offenders = files("src")
      .filter((f) => !f.includes(`${join("src", "test")}`))
      .filter((f) => readFileSync(f, "utf8").includes("notify-customers"));
    expect(offenders).toEqual([]);
  });

  it("the notify-customers function sends nothing", () => {
    const src = readFileSync("supabase/functions/notify-customers/index.ts", "utf8")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(src).not.toMatch(/resend|fetch\(|send-pod-email|createClient/i);
    expect(src).toContain("status: 410");
  });

  it("a migration removes the queueing trigger", () => {
    const sql = readFileSync("supabase/migrations/20261117100000_disable_automatic_customer_emails.sql", "utf8");
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS trg_enqueue_customer_notification/);
  });

  it("the manual POD email still exists and confirms the recipient first", () => {
    const pod = readFileSync("src/pages/PodReport.tsx", "utf8");
    expect(pod).toContain("emailPodPdf");
    expect(pod).toContain("PodEmailConfirmDialog");
  });
});
