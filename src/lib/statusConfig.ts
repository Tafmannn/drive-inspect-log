// ─── Central Job Status Constants ────────────────────────────────────

export const JOB_STATUS = {
  DRAFT: "draft",
  PENDING: "pending",
  INCOMPLETE: "incomplete",
  NEW: "new",
  READY_FOR_PICKUP: "ready_for_pickup",
  ASSIGNED: "assigned",
  PICKUP_IN_PROGRESS: "pickup_in_progress",
  PICKUP_COMPLETE: "pickup_complete",
  IN_TRANSIT: "in_transit",
  DELIVERY_IN_PROGRESS: "delivery_in_progress",
  DELIVERY_COMPLETE: "delivery_complete",
  POD_READY: "pod_ready",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
  ARCHIVED: "archived",
} as const;

export type JobStatusValue = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

// Helper groupings
export const ACTIVE_STATUSES: JobStatusValue[] = [
  JOB_STATUS.ASSIGNED,
  JOB_STATUS.READY_FOR_PICKUP,
  JOB_STATUS.PICKUP_IN_PROGRESS,
  JOB_STATUS.PICKUP_COMPLETE,
  JOB_STATUS.IN_TRANSIT,
  JOB_STATUS.DELIVERY_IN_PROGRESS,
];

export const PENDING_STATUSES: JobStatusValue[] = [
  JOB_STATUS.POD_READY,
  JOB_STATUS.DELIVERY_COMPLETE,
];

export const TERMINAL_STATUSES: JobStatusValue[] = [
  JOB_STATUS.COMPLETED,
  JOB_STATUS.FAILED,
  JOB_STATUS.ARCHIVED,
];

// ─── Status Display ──────────────────────────────────────────────────

export interface StatusConfig {
  label: string;
  color: string;
}

export interface StatusStyle {
  backgroundColor: string;
  color: string;
  label: string;
}

// Phase 1a: badge colours only. Each role is dark text on a light tint (every pair
// >= 5.5:1; the previous white-on-saturated pairs measured 2.2-4.0:1 for five of six).
// Status KEYS and LABELS below are unchanged; the label text is always shown, so colour
// is never the only indicator. Used inline (style={{ backgroundColor, color }}) by all
// badge consumers, so this single map restyles every badge.
const TONE = {
  info:     { backgroundColor: '#E8F0FB', color: '#1E4FA8' }, // 6.68:1
  neutral:  { backgroundColor: '#EEF1F5', color: '#475467' }, // 6.79:1
  success:  { backgroundColor: '#E3F4EA', color: '#0F6B3A' }, // 5.78:1
  progress: { backgroundColor: '#FFF1D1', color: '#7A4A00' }, // 6.68:1
  done:     { backgroundColor: '#ECE9FB', color: '#4A3CB0' }, // 6.87:1
  danger:   { backgroundColor: '#FDE7E4', color: '#B42318' }, // 5.55:1
} as const;

const STATUS_MAP: Record<string, StatusStyle> = {
  [JOB_STATUS.NEW]:                    { ...TONE.info,     label: 'NEW' },
  [JOB_STATUS.DRAFT]:                  { ...TONE.neutral,  label: 'DRAFT' },
  [JOB_STATUS.INCOMPLETE]:             { ...TONE.neutral,  label: 'INCOMPLETE' },
  [JOB_STATUS.READY_FOR_PICKUP]:       { ...TONE.success,  label: 'READY' },
  [JOB_STATUS.ASSIGNED]:               { ...TONE.success,  label: 'ASSIGNED' },
  [JOB_STATUS.PICKUP_IN_PROGRESS]:     { ...TONE.progress, label: 'IN PROGRESS' },
  [JOB_STATUS.PICKUP_COMPLETE]:        { ...TONE.progress, label: 'IN PROGRESS' },
  [JOB_STATUS.IN_TRANSIT]:             { ...TONE.progress, label: 'IN PROGRESS' },
  [JOB_STATUS.DELIVERY_IN_PROGRESS]:   { ...TONE.progress, label: 'IN PROGRESS' },
  [JOB_STATUS.DELIVERY_COMPLETE]:      { ...TONE.done,     label: 'COMPLETED' },
  [JOB_STATUS.POD_READY]:              { ...TONE.done,     label: 'COMPLETED' },
  [JOB_STATUS.COMPLETED]:              { ...TONE.done,     label: 'COMPLETED' },
  [JOB_STATUS.CANCELLED]:              { ...TONE.danger,   label: 'CANCELLED' },
};

const FALLBACK: StatusStyle = { ...TONE.neutral, label: 'UNKNOWN' };

export function getStatusStyle(status: string): StatusStyle {
  return STATUS_MAP[status] ?? { ...FALLBACK, label: status.toUpperCase() };
}

// Legacy compat
export function getStatusConfig(status: string): StatusConfig {
  const s = getStatusStyle(status);
  return { label: s.label, color: 'secondary' };
}

export function getStatusBadgeClasses(_status: string): string {
  return '';
}

// ─── Validation ──────────────────────────────────────────────────────

export function assertValidStatus(status: string): asserts status is JobStatusValue {
  if (!Object.values(JOB_STATUS).includes(status as JobStatusValue)) {
    throw new Error(`Invalid job status: ${status}`);
  }
}

// ─── Admin Status Transitions ────────────────────────────────────────
// Maps current status → allowed target statuses for admin override.

export const ADMIN_ALLOWED_TRANSITIONS: Record<string, JobStatusValue[]> = {
  [JOB_STATUS.DRAFT]:                  [JOB_STATUS.READY_FOR_PICKUP, JOB_STATUS.CANCELLED],
  [JOB_STATUS.NEW]:                    [JOB_STATUS.READY_FOR_PICKUP, JOB_STATUS.ASSIGNED, JOB_STATUS.CANCELLED],
  [JOB_STATUS.INCOMPLETE]:             [JOB_STATUS.READY_FOR_PICKUP, JOB_STATUS.CANCELLED],
  [JOB_STATUS.READY_FOR_PICKUP]:       [JOB_STATUS.ASSIGNED, JOB_STATUS.CANCELLED],
  [JOB_STATUS.ASSIGNED]:               [JOB_STATUS.READY_FOR_PICKUP, JOB_STATUS.PICKUP_IN_PROGRESS, JOB_STATUS.CANCELLED],
  [JOB_STATUS.PICKUP_IN_PROGRESS]:     [JOB_STATUS.PICKUP_COMPLETE, JOB_STATUS.CANCELLED],
  [JOB_STATUS.PICKUP_COMPLETE]:        [JOB_STATUS.IN_TRANSIT, JOB_STATUS.DELIVERY_IN_PROGRESS, JOB_STATUS.CANCELLED],
  [JOB_STATUS.IN_TRANSIT]:             [JOB_STATUS.DELIVERY_IN_PROGRESS, JOB_STATUS.CANCELLED],
  [JOB_STATUS.DELIVERY_IN_PROGRESS]:   [JOB_STATUS.DELIVERY_COMPLETE, JOB_STATUS.POD_READY, JOB_STATUS.CANCELLED],
  [JOB_STATUS.DELIVERY_COMPLETE]:      [JOB_STATUS.POD_READY, JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED],
  [JOB_STATUS.POD_READY]:              [JOB_STATUS.COMPLETED, JOB_STATUS.CANCELLED],
  [JOB_STATUS.COMPLETED]:              [JOB_STATUS.READY_FOR_PICKUP], // Re-open
  [JOB_STATUS.CANCELLED]:              [JOB_STATUS.READY_FOR_PICKUP], // Re-open
  [JOB_STATUS.FAILED]:                 [JOB_STATUS.READY_FOR_PICKUP],
  [JOB_STATUS.PENDING]:                [JOB_STATUS.READY_FOR_PICKUP, JOB_STATUS.CANCELLED],
};
