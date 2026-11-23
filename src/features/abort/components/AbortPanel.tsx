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
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { Loader2, OctagonX, Mail, CopyPlus, RotateCcw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAdminChangeStatus } from "@/hooks/useJobs";
import { JOB_STATUS } from "@/lib/statusConfig";
import type { JobAbort } from "../api/abortApi";
import {
  abortKeys, useAmendApprovedAbortClaim, useCreateReplacementJob, useDismissAbortRequest, useJobAbortState, useNotifyCustomerAborted, useReviewAbortClaim,
} from "../hooks/useAbort";
import {
  ABORT_STAGE_LABEL, FINANCE_STATUS_LABEL, abortErrorMessage, abortQueueStage, approvalAmountProblem,
  formatAbortConfirmedAt,
} from "../lib/abortRules";

const money = (n: number | null | undefined) => (n == null ? "Not set" : `£${Number(n).toFixed(2)}`);

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
  const review = useReviewAbortClaim(jobId);
  const amend = useAmendApprovedAbortClaim(jobId);
  const { isSuperAdmin } = useAuth();
  const notify = useNotifyCustomerAborted(jobId);
  const replace = useCreateReplacementJob(jobId);
  const reopen = useAdminChangeStatus();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(abort.proposed_amount != null ? abort.proposed_amount.toFixed(2) : "");
  const [note, setNote] = useState("");
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendAmount, setAmendAmount] = useState("");
  const [amendReason, setAmendReason] = useState("");

  const stage = abortQueueStage(abort, { invoiced, paid });
  // A fee decision is final immediately, even before invoicing. The server
  // enforces this independently; the only exception is the audited Super Admin RPC.
  const locked = invoiced || abort.finance_status !== "pending_review";
  const amountProblem = approvalAmountProblem(amount, abort.agreed_price);
  const amendmentProblem = approvalAmountProblem(amendAmount, abort.agreed_price);
  const canAmend = isSuperAdmin && abort.finance_status === "approved" && !invoiced && !abort.reopened_at;
  const amendmentValid = amendReason.trim().length >= 15
    && amendReason.trim().length <= 500
    && !amendmentProblem && amendAmount.trim() !== ""
    && Number(amendAmount) !== abort.approved_amount;

  const decide = async (decision: "approved" | "rejected") => {
    try {
      const res = await review.mutateAsync({
        abortId: abort.id,
        decision,
        amount: decision === "approved" && amount.trim() ? Number(amount) : null,
        note: note.trim() || null,
      });
      toast({
        title: decision === "approved" ? "Abort fee approved" : "Abort fee rejected",
        description: decision === "approved"
          ? Number(res.approvedAmount ?? 0) > 0
            ? `${money(res.approvedAmount)} is ready to invoice.`
            : "Approved at £0.00 — nothing will be invoiced."
          : "Nothing will be invoiced for this Abort.",
      });
      setNote("");
    } catch (e) {
      toast({ title: "Not saved", description: abortErrorMessage(e), variant: "destructive" });
    }
  };

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
          {FINANCE_STATUS_LABEL[abort.finance_status]}
          {abort.finance_status === "approved" ? ` · ${money(abort.approved_amount)} · Locked` : abort.finance_status === "rejected" ? " · Locked" : ""}
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

      {!locked ? (
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <p className="text-[13px] font-medium text-foreground">Fee review</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
              <Input
                inputMode="decimal"
                aria-label="Amount to approve"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-h-[44px] pl-7 text-base"
                disabled={review.isPending}
              />
            </div>
            <Button
              className="min-h-[44px] rounded-lg"
              disabled={!!amountProblem || review.isPending}
              onClick={() => decide("approved")}
            >
              {review.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              Approve
            </Button>
          </div>
          {amountProblem && amount.trim() !== "" && (
            <p className="text-[12px] text-destructive" role="alert">{amountProblem}</p>
          )}
          <Input
            aria-label="Review note (optional)"
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            className="min-h-[44px] text-base"
            disabled={review.isPending}
          />
          <Button
            variant="outline"
            className="w-full min-h-[44px] rounded-lg bg-card"
            disabled={review.isPending || abort.finance_status === "rejected"}
            onClick={() => decide("rejected")}
          >
            Reject fee
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[13px] font-medium text-foreground">
            {abort.finance_status === "approved" ? "Approved fee locked" : "Fee review closed"}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {invoiced
              ? `This fee has been invoiced${paid ? " and paid" : ""}. Corrections must follow the invoice/credit-note process.`
              : abort.finance_status === "approved"
                ? `${money(abort.approved_amount)} has been approved and cannot be changed through normal fee review.`
                : "This fee was rejected. The decision is final."}
          </p>
          {canAmend && (
            <Button variant="outline" className="min-h-[44px] rounded-lg"
              onClick={() => {
                setAmendAmount(abort.approved_amount?.toFixed(2) ?? "");
                setAmendReason("");
                setAmendOpen(true);
              }}>
              Exceptional fee amendment
            </Button>
          )}
        </div>
      )}

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

      <Dialog open={amendOpen} onOpenChange={(open) => { if (!amend.isPending) setAmendOpen(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Amend locked Abort fee</DialogTitle>
            <DialogDescription>
              Super Admin exception only. The original approval and amount remain in the audit history.
              An invoiced fee cannot be amended here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-[13px] text-muted-foreground">
              Current approved amount: <strong className="text-foreground">{money(abort.approved_amount)}</strong>
            </p>
            <label htmlFor="abort-amend-amount" className="text-sm font-medium">Corrected amount (£)</label>
            <Input id="abort-amend-amount" aria-label="Corrected Abort fee amount"
              inputMode="decimal" value={amendAmount} disabled={amend.isPending}
              onChange={(e) => setAmendAmount(e.target.value)} />
            {amendmentProblem && <p role="alert" className="text-xs text-destructive">{amendmentProblem}</p>}
            <label htmlFor="abort-amend-reason" className="text-sm font-medium">
              Reason for exceptional amendment (required)
            </label>
            <Textarea id="abort-amend-reason" value={amendReason}
              disabled={amend.isPending} maxLength={500}
              onChange={(e) => setAmendReason(e.target.value)}
              placeholder="Explain the client's revised fee confirmation (at least 15 characters)" />
            <p className="text-xs text-muted-foreground">
              This records who changed the amount, when, the old amount and the reason.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={amend.isPending} onClick={() => setAmendOpen(false)}>Cancel</Button>
            <Button disabled={!amendmentValid || amend.isPending}
              onClick={async () => {
                try {
                  const result = await amend.mutateAsync({
                    abortId: abort.id,
                    newAmount: Number(amendAmount),
                    expectedAmount: Number(abort.approved_amount),
                    reason: amendReason.trim(),
                  });
                  setAmendOpen(false);
                  toast({ title: "Approved fee amended", description: `Now ${money(result.approvedAmount)}. Audit history retained.` });
                } catch (e) {
                  toast({ title: "Amendment not saved", description: abortErrorMessage(e), variant: "destructive" });
                }
              }}>
              {amend.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirm exceptional amendment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
