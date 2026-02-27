import type { JobStatus } from './types';

export interface StatusConfig {
  label: string;
  color: 'success' | 'info' | 'warning' | 'destructive' | 'secondary';
}

export const STATUS_CONFIG: Record<string, StatusConfig> = {
  ready_for_pickup: { label: 'Ready', color: 'success' },
  pickup_in_progress: { label: 'In Progress', color: 'info' },
  pickup_complete: { label: 'In Progress', color: 'info' },
  in_transit: { label: 'In Progress', color: 'info' },
  delivery_in_progress: { label: 'In Progress', color: 'info' },
  delivery_complete: { label: 'Completed', color: 'secondary' },
  pod_ready: { label: 'Completed', color: 'secondary' },
  completed: { label: 'Completed', color: 'secondary' },
  cancelled: { label: 'Cancelled', color: 'destructive' },
};

export function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status] ?? { label: status, color: 'secondary' };
}

export function getStatusBadgeClasses(status: string): string {
  const config = getStatusConfig(status);
  switch (config.color) {
    case 'success': return 'bg-success text-success-foreground';
    case 'info': return 'bg-info text-info-foreground';
    case 'destructive': return 'bg-destructive text-destructive-foreground';
    case 'warning': return 'bg-warning text-warning-foreground';
    default: return 'bg-secondary text-secondary-foreground';
  }
}
