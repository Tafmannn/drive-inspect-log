// Pure push-payload validation, shared by the service worker and tests.
// The worker must never trust a push payload blindly: notifications and
// click-through destinations are derived only from validated fields, and the
// destination is always an INTERNAL route — never a URL from the payload.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Notification kinds the worker will render. Anything else is dropped. */
export const PUSH_TYPES = ["job-assigned", "pod-submitted"] as const;
export type PushType = (typeof PUSH_TYPES)[number];

export interface PushPayload {
  type: PushType;
  jobId: string;
  title: string;
  body: string;
}

/** Parse + validate a raw push payload; null for anything unexpected. */
export function parsePushPayload(raw: string): PushPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const p = data as Record<string, unknown>;
  if (
    !p ||
    typeof p.type !== "string" ||
    !(PUSH_TYPES as readonly string[]).includes(p.type) ||
    typeof p.jobId !== "string" ||
    !UUID_RE.test(p.jobId) ||
    typeof p.title !== "string" ||
    typeof p.body !== "string"
  ) {
    return null;
  }
  return {
    type: p.type as PushType,
    jobId: p.jobId,
    // Belt-and-braces length caps for the lock screen.
    title: p.title.slice(0, 80),
    body: p.body.slice(0, 160),
  };
}

/**
 * Click destination for a notification. Always an internal route derived
 * from a validated jobId — a payload can never steer the app to an external
 * or arbitrary URL. A POD notification opens the report the admin needs to
 * review; a job assignment opens the job itself.
 */
export function clickUrlFor(jobId: unknown, type?: unknown): string {
  if (typeof jobId === "string" && UUID_RE.test(jobId)) {
    return type === "pod-submitted" ? `/jobs/${jobId}/pod` : `/jobs/${jobId}`;
  }
  return "/";
}
