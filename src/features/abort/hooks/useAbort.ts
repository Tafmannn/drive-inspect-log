import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { invalidateForEvent } from "@/lib/mutationEvents";
import {
  confirmJobAbort,
  amendApprovedAbortClaim,
  createReplacementJob,
  dismissAbortRequest,
  getJobAbortState,
  getPendingAbortRequest,
  listAbortQueue,
  notifyCustomerAborted,
  requestJobAbort,
  reviewAbortClaim,
} from "../api/abortApi";
import type { JobAbortState } from "../api/abortApi";

export const abortKeys = {
  all: ["aborts"] as const,
  job: (jobId: string) => ["aborts", "job", jobId] as const,
  driverRequest: (jobId: string) => ["aborts", "driver-request", jobId] as const,
  queue: () => ["aborts", "queue"] as const,
};

function refreshAfterAbortChange(qc: QueryClient, jobId: string) {
  qc.invalidateQueries({ queryKey: abortKeys.all });
  invalidateForEvent(qc, "job_status_changed", [["job", jobId], ["invoice-prep-eligible"]]);
}

/** Driver: the pending request on this job. Polls while pending so the screen follows the admin. */
export function useDriverAbortRequest(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: abortKeys.driverRequest(jobId),
    queryFn: () => getPendingAbortRequest(jobId),
    enabled: enabled && !!jobId,
    staleTime: 10_000,
    refetchInterval: (q) => (q.state.data ? 30_000 : false),
  });
}

export function useRequestAbort(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => requestJobAbort(jobId),
    // No automatic retry on top of the user's own taps: the server makes a repeat harmless.
    retry: false,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: abortKeys.driverRequest(jobId) });
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });
}

/** Admin: the Abort, pending request and history of one job. */
export function useJobAbortState(jobId: string, enabled: boolean) {
  return useQuery({
    queryKey: abortKeys.job(jobId),
    queryFn: () => getJobAbortState(jobId),
    enabled: enabled && !!jobId,
    staleTime: 15_000,
  });
}

export function useAbortQueue(enabled = true) {
  return useQuery({
    queryKey: abortKeys.queue(),
    queryFn: listAbortQueue,
    enabled,
    staleTime: 20_000,
  });
}

export function useConfirmAbort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: confirmJobAbort,
    retry: false,
    onSettled: (_d, _e, vars) => refreshAfterAbortChange(qc, vars.jobId),
  });
}

export function useDismissAbortRequest(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, note }: { requestId: string; note?: string }) => dismissAbortRequest(requestId, note),
    onSettled: () => refreshAfterAbortChange(qc, jobId),
  });
}

/** Update the cached record synchronously after confirmation.
 * The UI must lock on success rather than expose an extra tap while refetching. */
function cacheFeeDecision(
  qc: QueryClient, jobId: string, abortId: string,
  status: "approved" | "rejected" | "pending_review",
  amount: number | null, reviewedAt?: string,
) {
  qc.setQueryData<JobAbortState>(abortKeys.job(jobId), (old) => {
    if (!old?.current || old.current.id !== abortId) return old;
    const current = {
      ...old.current,
      finance_status: status,
      approved_amount: amount,
      reviewed_at: reviewedAt ?? old.current.reviewed_at,
    };
    return {
      ...old,
      current,
      history: old.history.map((a) => a.id === abortId ? current : a),
    };
  });
}

export function useReviewAbortClaim(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reviewAbortClaim,
    onSuccess: (result, vars) => cacheFeeDecision(qc, jobId, vars.abortId, result.financeStatus, result.approvedAmount),
    onSettled: () => refreshAfterAbortChange(qc, jobId),
  });
}

export function useAmendApprovedAbortClaim(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: amendApprovedAbortClaim,
    retry: false,
    onSuccess: (result, vars) => {
      qc.setQueryData<JobAbortState>(abortKeys.job(jobId), (old) => {
        if (!old?.current || old.current.id !== vars.abortId) return old;
        const current = {
          ...old.current,
          approved_amount: result.approvedAmount,
          last_amended_at: result.amendedAt,
          last_amendment_reason: vars.reason,
        };
        return { ...old, current, history: old.history.map((a) => a.id === vars.abortId ? current : a) };
      });
    },
    onSettled: () => refreshAfterAbortChange(qc, jobId),
  });
}

export function useNotifyCustomerAborted(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (abortId: string) => notifyCustomerAborted(abortId),
    onSettled: () => qc.invalidateQueries({ queryKey: abortKeys.job(jobId) }),
  });
}

export function useCreateReplacementJob(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => createReplacementJob(jobId),
    onSettled: () => refreshAfterAbortChange(qc, jobId),
  });
}
