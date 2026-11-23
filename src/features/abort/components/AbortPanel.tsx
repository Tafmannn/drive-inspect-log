/**
 * Admin: everything about a job's Abort on Job Detail.
 *   - a pending driver request (Abort Job / Dismiss);
 *   - the confirmed Abort: who confirmed it, when (UK time), the agreed price, and the fee
 *     review (approve full / partial / nil, or reject) — separate from the operational Abort;
 *   - optional customer notice, a linked replacement job, reopening (refused once invoiced);
 *   - earlier Aborts of the same job, kept after reopening.
 * Admin-only: render inside <RoleScope admin>. The database enforces the same rules.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, OctagonX, Mail, CopyPlus, RotateCcw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAdminChangeStatus } from "@/hooks/useJobs";
import { JOB_STATUS } from "@/lib/statusConfig";
import type { JobAbort } from "../api/abortApi";
import { AbortFeeReview } from "./AbortFeeReview";
import {
  abortKeys, useCreateReplacementJob, useDismissAbortRequest, useJobAbortState, useNotifyCustomerAborted,
} from "../hooks/useAbort";
import {
  ABORT_STAGE_LABEL, FINANCE_STATUS_LABEL, abortErrorMessage, abortQueueStage,
  formatAbortConfirmedAt,
} from "../lib/abortRules";

const money = (n: number | null | undefined) => (n == null ? "Not set" : `£${Number(n).toFixed(2)}`);

function feeSummary(abort: JobAbort): string {
  const label = FINANCE_STATUS_LABEL[abort.finance_status];
  if (abort.finance_status === "approved") return label + " · " + money(abort.approved_amount) + " · Locked";
  if (abort.finance_status === "rejected") return label + " · Locked";
  return label;
}

interface Props {
  job: { id: string; status: string; client_id?: string | null };
  onAbort: (requestedAt?: string | null) => void;
}

export function AbortPanel({ job, onAbort }: Props) {
  const isAborted = job.status === JOB_STATUS.ABORTED;
  const state = useJobAbortState(job.id, true);
  const dismiss = useDismissAbortRequest(job.id);

  if (state.isLoading) return null;
  if (state.isError) {
    return (
      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
        {abortErrorMessage(state.error)}
      </p>
    );
  }
  const s = state.data!;
  const pending = !isAborted ? s.pendingRequest : null;
  const previous = s.history.filter((a) => a.reopened_at);

  if (!pending && !(isAborted && s.current) && previous.length === 0) return null;

  return (
    <div className="space-y-3">
      {pending && (
        <section className="rounded-xl border border-warning/30 bg-warning/10 p-3 space-y-2.5" aria-label="Abort request">
          <div className="flex items-start gap-2">
            <OctagonX className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Driver requested an Abort</p>
              <p className="text-[13px] text-muted-foreground">
                {formatAbortConfirmedAt(pending.requested_at)} · the job is still active until you confirm.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 min-h-[44px] rounded-lg" onClick={() => onAbort(pending.requested_at)}>
              Abort Job
            </Button>
            <Button
              variant="outline"
              className="flex-1 min-h-[44px] rounded-lg bg-card"
              disabled={dismiss.isPending}
              onClick={async () => {
                try {
                  await dismiss.mutateAsync({ requestId: pending.id });
                  toast({ title: "Request dismissed", description: "The job carries on as normal." });
                } catch (e) {
                  toast({ title: "Not dismissed", description: abortErrorMessage(e), variant: "destructive" });
                }
              }}
            >
              {dismiss.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              Dismiss
            </Button>
          </div>
        </section>
      )}

      {isAborted && s.current && (
        <ConfirmedAbort
          jobId={job.id}
          hasClient={!!job.client_id}
          abort={s.current}
          invoiced={s.invoiced}
          paid={s.paid}
          replacementJobId={s.replacementJobId}
        />
      )}

      {previous.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-3 space-y-1.5" aria-label="Earlier Aborts">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Earlier Aborts (reopened)</p>
          {previous.map((a) => (
            <p key={a.id} className="text-[13px] text-muted-foreground">
              {formatAbortConfirmedAt(a.confirmed_at)} · {a.no_name_exception ? "No-name exception" : a.contact_name} ·
              fee {FINANCE_STATUS_LABEL[a.finance_status].toLowerCase()}
              {a.approved_amount != null ? ` ${money(a.approved_amount)}` : ""} · reopened {formatAbortConfirmedAt(a.reopened_at)}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

function ConfirmedAbort({
  jobId, hasClient, abort, invoiced, paid, replacementJobId,
}: {
  jobId: string;
  hasClient: boolean;
  abort: JobAbort;
  invoiced: boolean;
  paid: boolean;
  replacementJobId: string | null;
}) {
  const notify = useNotifyCustomerAborted(jobId);
  const replace = useCreateReplacementJob(jobId);
  const reopen = useAdminChangeStatus();
  const qc = useQueryClient();
  const [confirmReopen, setConfirmReopen] = useState(false);
  const stage = abortQueueStage(abort, { invoiced, paid });

  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3" aria-label="Abort">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Abort</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground">
          {ABORT_STAGE_LABEL[stage]}
        </span>
      </div>

      <dl className="divide-y divide-border">
        <Row label="Abort confirmed at">{formatAbortConfirmedAt(abort.confirmed_at)}</Row>
        <Row label="Confirmed by (contact)">
          {abort.no_name_exception ? <span className="text-warning">No-name exception</span> : abort.contact_name}
        </Row>
        <Row label="Status when aborted">{abort.from_status.replace(/_/g, " ")}</Row>
        <Row label="Agreed price">{money(abort.agreed_price)}</Row>
        <Row label="Proposed claim">{money(abort.proposed_amount)}</Row>
        <Row label="Fee">
          {feeSummary(abort)}
        </Row>
        {abort.reviewed_at && <Row label="Reviewed at">{formatAbortConfirmedAt(abort.reviewed_at)}</Row>}
        {abort.review_note && <Row label="Review note">{abort.review_note}</Row>}
        {abort.last_amended_at && <Row label="Last fee amendment">{formatAbortConfirmedAt(abort.last_amended_at)}</Row>}
        {abort.last_amendment_reason && <Row label="Amendment reason">{abort.last_amendment_reason}</Row>}
      </dl>

      {abort.no_name_exception && abort.finance_status === "pending_review" && (
        <p className="text-[12px] text-muted-foreground">
          Authorised without a contact name. Approve the fee only if you are satisfied the Abort is chargeable.
        </p>
      )}

      <AbortFeeReview jobId={jobId} abort={abort} invoiced={invoiced} paid={paid} />

      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          variant="outline"
          className="min-h-[44px] rounded-lg"
          disabled={!hasClient || !!abort.customer_notified_at || notify.isPending}
          title={!hasClient ? "Link the job to a client first" : undefined}
          onClick={async () => {
            try {
              const r = await notify.mutateAsync(abort.id);
              toast({ title: r.queued ? "Customer will be notified" : "Already notified" });
            } catch (e) {
              toast({ title: "Not sent", description: abortErrorMessage(e), variant: "destructive" });
            }
          }}
        >
          <Mail className="mr-1.5 h-4 w-4" aria-hidden />
          {abort.customer_notified_at ? "Customer notified" : "Notify customer"}
        </Button>

        {replacementJobId ? (
          <Button asChild variant="outline" className="min-h-[44px] rounded-lg">
            <Link to={`/jobs/${replacementJobId}`}>
              Replacement job <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            className="min-h-[44px] rounded-lg"
            disabled={replace.isPending}
            onClick={async () => {
              try {
                const r = await replace.mutateAsync();
                toast({ title: "Replacement job created", description: r.jobRef ? `Job ${r.jobRef}` : undefined });
              } catch (e) {
                toast({ title: "Not created", description: abortErrorMessage(e), variant: "destructive" });
              }
            }}
          >
            <CopyPlus className="mr-1.5 h-4 w-4" aria-hidden /> Rebook as new job
          </Button>
        )}

        <Button
          variant="outline"
          className="min-h-[44px] rounded-lg"
          disabled={invoiced || reopen.isPending}
          title={invoiced ? "Invoiced Aborts cannot be reopened — rebook as a new job" : undefined}
          onClick={() => setConfirmReopen(true)}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden /> Reopen job
        </Button>
      </div>

      <AlertDialog open={confirmReopen} onOpenChange={setConfirmReopen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen this aborted job?</AlertDialogTitle>
            <AlertDialogDescription>
              The job goes back to Ready for pickup on a new run. This Abort and its fee decision stay in the
              history, and the fee can no longer be invoiced.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep aborted</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await reopen.mutateAsync({ jobId, newStatus: JOB_STATUS.READY_FOR_PICKUP, notes: "Reopened after Abort" });
                  qc.invalidateQueries({ queryKey: abortKeys.all });
                  toast({ title: "Job reopened" });
                } catch (e) {
                  toast({ title: "Not reopened", description: abortErrorMessage(e), variant: "destructive" });
                }
              }}
            >
              Reopen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
