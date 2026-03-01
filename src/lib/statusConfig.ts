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

const STATUS_MAP: Record<string, StatusStyle> = {
  [JOB_STATUS.NEW]:                    { backgroundColor: '#007AFF', color: '#FFFFFF', label: 'NEW' },
  [JOB_STATUS.DRAFT]:                  { backgroundColor: '#8E8E93', color: '#FFFFFF', label: 'DRAFT' },
  [JOB_STATUS.INCOMPLETE]:             { backgroundColor: '#8E8E93', color: '#FFFFFF', label: 'INCOMPLETE' },
  [JOB_STATUS.READY_FOR_PICKUP]:       { backgroundColor: '#34C759', color: '#FFFFFF', label: 'READY' },
  [JOB_STATUS.ASSIGNED]:               { backgroundColor: '#34C759', color: '#FFFFFF', label: 'ASSIGNED' },
  [JOB_STATUS.PICKUP_IN_PROGRESS]:     { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  [JOB_STATUS.PICKUP_COMPLETE]:        { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  [JOB_STATUS.IN_TRANSIT]:             { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  [JOB_STATUS.DELIVERY_IN_PROGRESS]:   { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  [JOB_STATUS.DELIVERY_COMPLETE]:      { backgroundColor: '#5856D6', color: '#FFFFFF', label: 'COMPLETED' },
  [JOB_STATUS.POD_READY]:              { backgroundColor: '#5856D6', color: '#FFFFFF', label: 'COMPLETED' },
  [JOB_STATUS.COMPLETED]:              { backgroundColor: '#5856D6', color: '#FFFFFF', label: 'COMPLETED' },
  [JOB_STATUS.CANCELLED]:              { backgroundColor: '#FF3B30', color: '#FFFFFF', label: 'CANCELLED' },
};

const FALLBACK: StatusStyle = { backgroundColor: '#8E8E93', color: '#FFFFFF', label: 'UNKNOWN' };

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
