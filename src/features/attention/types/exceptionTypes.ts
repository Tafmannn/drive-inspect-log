/** Attention Center – Exception type definitions */

export type ExceptionSeverity = "critical" | "high" | "medium" | "low";

export type ExceptionCategory = "timing" | "evidence" | "sync" | "state" | "compliance";

export interface AttentionException {
  id: string;
  severity: ExceptionSeverity;
  category: ExceptionCategory;
  jobId?: string;
  jobNumber?: string;
  orgId?: string;
  orgName?: string;
  title: string;
  detail: string;
  createdAt: string;
  actionLabel: string;
  actionRoute: string;
}

export interface AttentionKpiData {
  activeJobs: number;
  highSeverity: number;
  missingSignatures: number;
  uploadFailuresToday: number;
}

export interface AttentionFiltersState {
  severity: ExceptionSeverity | "all";
  category: ExceptionCategory | "all";
  orgId: string | "all";
  dateFrom: string;
  dateTo: string;
}
