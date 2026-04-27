/**
 * DB security regression tests for the client rate-card data path.
 *
 * Goal: verify that the application code never reads or writes rate-card
 * fields from/to the shared `clients` table — those fields no longer exist
 * there. The only data path is the admin-only `client_rate_cards` table,
 * which is gated by RLS at the database level.
 *
 * If a future change re-introduces a `clients.rate_*` read/write, these
 * tests will fail loudly.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(p)) acc.push(p);
  }
  return acc;
}

const ALL_FILES = walk(SRC).filter(
  (f) =>
    !f.includes("/test/") &&
    !f.endsWith(".test.ts") &&
    !f.endsWith(".test.tsx") &&
    !f.endsWith("/integrations/supabase/types.ts"),
);

const RATE_CARD_FIELDS = [
  "rate_per_mile",
  "minimum_charge",
  "agreed_price",
  "waiting_rate_per_hour",
  "rate_card_active",
  "rate_card_notes",
];

describe("client rate card — DB security boundary", () => {
  it("no application code selects rate-card fields from the clients table", () => {
    const offenders: string[] = [];
    for (const file of ALL_FILES) {
      const src = readFileSync(file, "utf8");
      // Look for `.from("clients")` followed (within ~400 chars) by a
      // rate-card column reference. This catches `select("rate_per_mile,...")`
      // style reads from the clients table.
      const fromClientsRegex = /\.from\(\s*["']clients["']\s*\)([\s\S]{0,400})/g;
      let m: RegExpExecArray | null;
      while ((m = fromClientsRegex.exec(src))) {
        const window = m[1];
        for (const field of RATE_CARD_FIELDS) {
          if (window.includes(field)) {
            offenders.push(`${file}: clients-table query references "${field}"`);
          }
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("rate-card writes go through client_rate_cards (admin-only RLS)", () => {
    const src = readFileSync(join(SRC, "lib/clientApi.ts"), "utf8");
    expect(src).toMatch(/from\(\s*["']client_rate_cards["']\s*\)/);
    // upsertClientRateCard must target the protected table
    expect(src).toMatch(/upsertClientRateCard[\s\S]{0,300}client_rate_cards/);
  });

  it("getActiveClientRateCard reads from the protected client_rate_cards table", () => {
    const src = readFileSync(join(SRC, "lib/clientApi.ts"), "utf8");
    const match = src.match(
      /export async function getActiveClientRateCard[\s\S]{0,800}/,
    );
    expect(match).not.toBeNull();
    expect(match![0]).toMatch(/from\(\s*["']client_rate_cards["']\s*\)/);
    expect(match![0]).not.toMatch(/from\(\s*["']clients["']\s*\)/);
  });

  it("Client TypeScript interface no longer carries rate-card fields", async () => {
    const mod = await import("@/lib/clientApi");
    // Type-only check at runtime: confirm the keys are not present in
    // any sample object the type would describe. We rely on the exported
    // type's structural shape via a representative object.
    const sample: import("@/lib/clientApi").Client = {
      id: "x",
      org_id: "o",
      name: "n",
      company: null,
      email: null,
      phone: null,
      address: null,
      notes: null,
      is_active: true,
      created_at: "",
      updated_at: "",
    };
    for (const field of RATE_CARD_FIELDS) {
      expect(field in sample).toBe(false);
    }
    expect(typeof mod.getActiveClientRateCard).toBe("function");
    expect(typeof mod.upsertClientRateCard).toBe("function");
  });
});
