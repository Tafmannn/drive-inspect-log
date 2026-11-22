import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { damageClientIds } from "@/features/damage/damageModel";

const dir = join(__dirname, "../../supabase/migrations");
const file = "20261122120000_damage_inspection_v2.sql";
const sql = readFileSync(join(dir, file), "utf8");

describe("damage inspection V2 migration", () => {
  it("is additive only", () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION|POLICY)\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+public\.damage_items\s+SET\s+(panel_id|area|item)/i);
    for (const col of ["panel_id", "view_id", "body_type", "diagram_version", "severity", "panel_position"]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS damage_declaration text/);
  });

  it("is the latest submit_inspection definition and keeps the safety checks", () => {
    const later = readdirSync(dir)
      .filter((f) => f > file)
      .filter((f) => /FUNCTION public\.submit_inspection/.test(readFileSync(join(dir, f), "utf8")));
    expect(later).toEqual([]);
    for (const must of ["NOT_ASSIGNED_DRIVER", "PICKUP_NOT_COMPLETE", "ACTIVE_JOB_LOCK", "INSPECTION_ALREADY_SUBMITTED", "idempotentReplay", "FOR UPDATE"]) {
      expect(sql).toContain(must);
    }
    // payload allowlist: new keys validated, else NULL (never rejects evidence)
    expect(sql).toMatch(/panel_id, view_id, body_type, diagram_version, severity, panel_position/);
    expect(sql).toMatch(/IN \('minor','moderate','severe'\) THEN v_item->>'severity'/);
  });
});

describe("offline queue damage ↔ photo alignment", () => {
  it("one id per damage, so a photo-less first damage can't shift later photos", () => {
    const ids = damageClientIds(3, "S");
    expect(ids).toEqual(["dmg-S-0", "dmg-S-1", "dmg-S-2"]);
    // emulate submitQueue drain: damageClientIdOrder[idx] ↔ damageItemIds[idx]
    const serverIds = ["row-A", "row-B", "row-C"];
    const map = Object.fromEntries(ids.map((c, i) => [c, serverIds[i]]));
    // a photo staged for the 2nd damage (index 1) links to row-B
    expect(map[ids[1]]).toBe("row-B");
  });
});
