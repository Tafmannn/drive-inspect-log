/**
 * Where a job came from. Stored in jobs.job_source (free text column; these
 * are the values the app writes). Lets the weekly numbers answer "which
 * platform / customer channel actually pays", which was impossible while the
 * column was always null.
 */
export const JOB_SOURCES = [
  { value: "movex", label: "Movex" },
  { value: "revilo", label: "Revilo / Revillo" },
  { value: "direct", label: "Direct customer" },
  { value: "other_platform", label: "Other platform" },
  { value: "other", label: "Other" },
] as const;

export type JobSource = (typeof JOB_SOURCES)[number]["value"];

export function isJobSource(v: unknown): v is JobSource {
  return JOB_SOURCES.some((s) => s.value === v);
}

/**
 * Value to save from the form. A known source is saved; blank saves null.
 * An unrecognised value is only kept if it is what the job already had
 * (so editing a legacy job never silently rewrites its source); anything
 * else is rejected as null.
 */
export function resolveJobSourceForSave(formValue: string, existing: string | null | undefined): string | null {
  const v = formValue.trim();
  if (!v) return null;
  if (isJobSource(v)) return v;
  return existing && v === existing ? existing : null;
}

/** Options for the picker, including a legacy value the job already has. */
export function jobSourceOptions(existing: string | null | undefined): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = JOB_SOURCES.map((s) => ({ value: s.value, label: s.label }));
  if (existing && !isJobSource(existing)) opts.push({ value: existing, label: `${existing} (legacy)` });
  return opts;
}

export function jobSourceLabel(v: string | null | undefined): string {
  if (!v) return "Not recorded";
  return JOB_SOURCES.find((s) => s.value === v)?.label ?? v;
}
