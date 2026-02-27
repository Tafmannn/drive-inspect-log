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
  new:                    { backgroundColor: '#007AFF', color: '#FFFFFF', label: 'NEW' },
  draft:                  { backgroundColor: '#8E8E93', color: '#FFFFFF', label: 'DRAFT' },
  incomplete:             { backgroundColor: '#8E8E93', color: '#FFFFFF', label: 'INCOMPLETE' },
  ready_for_pickup:       { backgroundColor: '#34C759', color: '#FFFFFF', label: 'READY' },
  assigned:               { backgroundColor: '#34C759', color: '#FFFFFF', label: 'ASSIGNED' },
  pickup_in_progress:     { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  pickup_complete:        { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  in_transit:             { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  delivery_in_progress:   { backgroundColor: '#FF9500', color: '#FFFFFF', label: 'IN PROGRESS' },
  delivery_complete:      { backgroundColor: '#5856D6', color: '#FFFFFF', label: 'COMPLETED' },
  pod_ready:              { backgroundColor: '#5856D6', color: '#FFFFFF', label: 'COMPLETED' },
  completed:              { backgroundColor: '#5856D6', color: '#FFFFFF', label: 'COMPLETED' },
  cancelled:              { backgroundColor: '#FF3B30', color: '#FFFFFF', label: 'CANCELLED' },
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
