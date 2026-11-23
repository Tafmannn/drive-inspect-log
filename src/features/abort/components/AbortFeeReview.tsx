/**
 * Abort fee review has two distinct modes:
 * pending_review -> ordinary Admin Approve/Reject (one-time);
 * approved/rejected -> read-only. A Super Admin may exceptionally amend an
 * approved, uninvoiced fee through a separate audited server RPC.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type { JobAbort } from "../api/abortApi";
import { useAmendApprovedAbortClaim, useReviewAbortClaim } from "../hooks/useAbort";
import { abortErrorMessage, approvalAmountProblem, isAbortFeeReviewLocked } from "../lib/abortRules";

const money = (value: number | null | undefined): string =>
  value == null ? "Not set" : "£" + Number(value).toFixed(2);

interface PendingProps {
  jobId: string;
  abort: JobAbort;
}

interface Props extends PendingProps {
  invoiced: boolean;
  paid: boolean;
}

export function AbortFeeReview(props: Readonly<Props>) {
  if (isAbortFeeReviewLocked(props.abort.finance_status, props.invoiced)) {
    return <LockedFeeReview {...props} />;
  }
  return <PendingFeeReview jobId={props.jobId} abort={props.abort} />;
}

function PendingFeeReview({ jobId, abort }: Readonly<PendingProps>) {
  const review = useReviewAbortClaim(jobId);
  const [amount, setAmount] = useState(abort.proposed_amount == null ? "" : abort.proposed_amount.toFixed(2));
  const [note, setNote] = useState("");
  const amountProblem = approvalAmountProblem(amount, abort.agreed_price);

  const decide = async (decision: "approved" | "rejected") => {
    try {
      const chosenAmount = decision === "approved" && amount.trim() ? Number(amount) : null;
      const response = await review.mutateAsync({
        abortId: abort.id,
        decision,
        amount: chosenAmount,
        note: note.trim() || null,
      });

      let description = "Nothing will be invoiced for this Abort.";
      if (decision === "approved") {
        description = Number(response.approvedAmount ?? 0) > 0
          ? money(response.approvedAmount) + " is ready to invoice."
          : "Approved at £0.00 — nothing will be invoiced.";
      }
      toast({ title: decision === "approved" ? "Abort fee approved" : "Abort fee rejected", description });
      setNote("");
    } catch (error) {
      toast({ title: "Not saved", description: abortErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      <p className="text-[13px] font-medium text-foreground">Fee review</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">£</span>
          <Input
            inputMode="decimal" aria-label="Amount to approve" value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="min-h-[44px] pl-7 text-base" disabled={review.isPending}
          />
        </div>
        <Button
          className="min-h-[44px] rounded-lg"
          disabled={!!amountProblem || review.isPending}
          onClick={() => void decide("approved")}
        >
          {review.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
          Approve
        </Button>
      </div>
      {amountProblem && amount.trim() !== "" && (
        <p className="text-[12px] text-destructive" role="alert">{amountProblem}</p>
      )}
      <Input
        aria-label="Review note (optional)" placeholder="Note (optional)"
        value={note} onChange={(event) => setNote(event.target.value)}
        maxLength={500} className="min-h-[44px] text-base" disabled={review.isPending}
      />
      <Button
        variant="outline" className="w-full min-h-[44px] rounded-lg bg-card"
        disabled={review.isPending} onClick={() => void decide("rejected")}
      >
        Reject fee
      </Button>
    </div>
  );
}

function lockedDescription(abort: JobAbort, invoiced: boolean, paid: boolean): string {
  if (invoiced) {
    return "This fee has been invoiced" + (paid ? " and paid" : "") +
      ". Corrections must follow the invoice/credit-note process.";
  }
  if (abort.finance_status === "approved") {
    return money(abort.approved_amount) +
      " has been approved and cannot be changed through normal fee review.";
  }
  return "This fee was rejected. The decision is final.";
}

function LockedFeeReview({ jobId, abort, invoiced, paid }: Readonly<Props>) {
  const { isSuperAdmin } = useAuth();
  const amend = useAmendApprovedAbortClaim(jobId);
  const [isOpen, setIsOpen] = useState(false);
  const [correctedAmount, setCorrectedAmount] = useState("");
  const [reason, setReason] = useState("");

  const canAmend = isSuperAdmin && abort.finance_status === "approved" && !invoiced && !abort.reopened_at;
  const amountProblem = approvalAmountProblem(correctedAmount, abort.agreed_price);
  const correctionValid = reason.trim().length >= 15 &&
    reason.trim().length <= 500 &&
    !amountProblem && correctedAmount.trim() !== "" &&
    Number(correctedAmount) !== abort.approved_amount;

  const openAmendment = () => {
    setCorrectedAmount(abort.approved_amount?.toFixed(2) ?? "");
    setReason("");
    setIsOpen(true);
  };

  const submitAmendment = async () => {
    try {
      const response = await amend.mutateAsync({
        abortId: abort.id,
        newAmount: Number(correctedAmount),
        expectedAmount: Number(abort.approved_amount),
        reason: reason.trim(),
      });
      setIsOpen(false);
      toast({
        title: "Approved fee amended",
        description: "Now " + money(response.approvedAmount) + ". Audit history retained.",
      });
    } catch (error) {
      toast({ title: "Amendment not saved", description: abortErrorMessage(error), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-[13px] font-medium text-foreground">
        {abort.finance_status === "approved" ? "Approved fee locked" : "Fee review closed"}
      </p>
      <p className="text-[12px] text-muted-foreground">
        {lockedDescription(abort, invoiced, paid)}
      </p>
      {canAmend && (
        <>
          <Button variant="outline" className="min-h-[44px] rounded-lg" onClick={openAmendment}>
            Exceptional fee amendment
          </Button>
          <Dialog open={isOpen} onOpenChange={(open) => { if (!amend.isPending) setIsOpen(open); }}>
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
                  inputMode="decimal" value={correctedAmount} disabled={amend.isPending}
                  onChange={(event) => setCorrectedAmount(event.target.value)} />
                {amountProblem && <p role="alert" className="text-xs text-destructive">{amountProblem}</p>}
                <label htmlFor="abort-amend-reason" className="text-sm font-medium">
                  Reason for exceptional amendment (required)
                </label>
                <Textarea id="abort-amend-reason" value={reason}
                  disabled={amend.isPending} maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain the client's revised fee confirmation (at least 15 characters)" />
                <p className="text-xs text-muted-foreground">
                  This records who changed the amount, when, the old amount and the reason.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" disabled={amend.isPending} onClick={() => setIsOpen(false)}>Cancel</Button>
                <Button disabled={!correctionValid || amend.isPending} onClick={() => void submitAmendment()}>
                  {amend.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  Confirm exceptional amendment
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
