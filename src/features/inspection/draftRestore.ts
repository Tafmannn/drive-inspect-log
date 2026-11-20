/**
 * What to do with a saved inspection draft when the inspection screen mounts.
 *
 *  - "silent": put the draft back without asking (same-session remount,
 *    a draft saved moments ago, or the app reopened after the OS killed it).
 *  - "prompt": ask "Resume from draft?" (a real earlier session's work).
 *  - "fresh":  nothing worth restoring.
 *
 * `sessionActive` means this tab already had the inspection open (flag kept in
 * sessionStorage). That covers in-app back-and-forth and iOS reloading the tab
 * after the camera or under memory pressure. It used to skip restoring
 * entirely, which started the form empty at step 1 — and the autosave then
 * overwrote the saved draft, losing the driver's notes and current step.
 */
export type DraftRestoreDecision = "silent" | "prompt" | "fresh";

export const RECENT_DRAFT_MS = 10_000;

const MEANINGFUL_FIELDS = [
  "odometer",
  "fuelLevel",
  "notes",
  "customerName",
  "driverName",
  "vehicleCondition",
  "lightCondition",
  "numberOfKeys",
] as const;

export function decideDraftRestore(input: {
  draft: { data?: Record<string, unknown> | null; savedAt?: string | null } | null;
  sessionActive: boolean;
  resumedAfterRestart: boolean;
  now: number;
}): DraftRestoreDecision {
  const data = input.draft?.data;
  if (!data) return "fresh";
  if (input.sessionActive) return "silent";
  const meaningful = MEANINGFUL_FIELDS.some((k) => Boolean(data[k]));
  if (!meaningful) return "fresh";
  const savedAge = input.draft?.savedAt
    ? input.now - new Date(input.draft.savedAt).getTime()
    : Infinity;
  if (savedAge < RECENT_DRAFT_MS || input.resumedAfterRestart) return "silent";
  return "prompt";
}
