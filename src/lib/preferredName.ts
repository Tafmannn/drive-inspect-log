/**
 * The name the app greets a user by. A profile's own names win over the
 * sign-in metadata, and an email handle ("info", "jsmith1987") is only the
 * last resort.
 *
 * Order: display_name ("Preferred Name" on the profile form) → first_name →
 * full_name → the current fallback (auth metadata name, then email handle).
 */
export function preferredName(
  profile: { display_name?: string | null; first_name?: string | null; full_name?: string | null } | null | undefined,
  fallback: string,
): string {
  for (const v of [profile?.display_name, profile?.first_name, profile?.full_name]) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return fallback;
}
