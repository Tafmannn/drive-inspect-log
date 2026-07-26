// Pure push-payload validation, shared by the service worker and tests.
// The worker must never trust a push payload blindly: notifications and
// click-through destinations are derived only from validated fields, and the
// destination is always an INTERNAL route — never a URL from the payload.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface JobAssignedPayload {
  type: "job-assigned";
  jobId: string;
  title: string;
  body: string;
}

/** Parse + validate a raw push payload; null for anything unexpected. */
export function parsePushPayload(raw: string): JobAssignedPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const p = data as Record<string, unknown>;
  if (
    !p ||
    p.type !== "job-assigned" ||
    typeof p.jobId !== "string" ||
    !UUID_RE.test(p.jobId) ||
    typeof p.title !== "string" ||
    typeof p.body !== "string"
  ) {
    return null;
  }
  return {
    type: "job-assigned",
    jobId: p.jobId,
    // Belt-and-braces length caps for the lock screen.
    title: p.title.slice(0, 80),
    body: p.body.slice(0, 160),
  };
}

/**
 * Click destination for a notification. Only an internal job route derived
 * from a validated jobId — a payload can never steer the app to an external
 * or arbitrary URL.
 */
export function clickUrlFor(jobId: unknown): string {
  if (typeof jobId === "string" && UUID_RE.test(jobId)) {
    return `/jobs/${jobId}`;
  }
  return "/";
}
