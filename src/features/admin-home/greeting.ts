/**
 * Admin home greeting, kept to one line on a phone. Uses the first name,
 * capitalised (an account without a profile name falls back to its email
 * handle, e.g. "jsmith1987"); drops the name when the result would be too long
 * to fit on one line. The avatar still shows the user's initial.
 */
export function adminGreeting(name: string | undefined, hour = new Date().getHours()): string {
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (name?.trim().split(/\s+/)[0] ?? "").replace(/^./, (c) => c.toUpperCase());
  if (!first) return part;
  const full = `${part}, ${first}`;
  return full.length <= 24 ? full : part;
}
