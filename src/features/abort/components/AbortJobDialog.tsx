/**
 * Admin: "Abort Collection" — the only way a job becomes Aborted.
 *
 * One required field (the name of the person confirming the Abort) or an explicit, audited
 * no-name exception. The "Abort confirmed at" time is NOT entered: the database stamps it when
 * the confirmation commits, so it is never the time the dialog was opened or a device clock.
 * The dialog stays open on any error and only reports success once the server has committed.
 */
import { useEffect, useId, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { getStatusStyle } from "@/lib/statusConfig";
import { useConfirmAbort } from "../hooks/useAbort";
import {
  CONTACT_NAME_MAX, abortConfirmPayload, abortErrorMessage, abortFormProblem, formatAbortConfirmedAt,
} from "../lib/abortRules";

export interface AbortJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: { id: string; ref: string; vehicleReg: string; status: string };
  /** Shown when the dialog was opened from a driver's request. */
  requestedAt?: string | null;
}

export function AbortJobDialog({ open, onOpenChange, job, requestedAt }: AbortJobDialogProps) {
  const nameId = useId();
  const exceptionId = useId();
  const [name, setName] = useState("");
  const [noName, setNoName] = useState(false);
  const [touched, setTouched] = useState(false);
  const confirm = useConfirmAbort();

  // Fresh form each time it opens; never carry a name over to another job.
  useEffect(() => {
    if (open) {
      setName("");
      setNoName(false);
      setTouched(false);
      confirm.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, job.id]);

  const problem = abortFormProblem({ contactName: name, noNameException: noName });
  const showProblem = touched && !!problem;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (problem || confirm.isPending) return;
    try {
      const res = await confirm.mutateAsync({
        jobId: job.id,
        expectedStatus: job.status,
        ...abortConfirmPayload({ contactName: name, noNameException: noName }),
      });
      toast({
        title: res.alreadyAborted ? "Already aborted" : "Job aborted",
        description: res.alreadyAborted
          ? `Another admin confirmed it at ${formatAbortConfirmedAt(res.confirmedAt)}.`
          : `Abort confirmed at ${formatAbortConfirmedAt(res.confirmedAt)}. The fee is waiting for review.`,
      });
      onOpenChange(false);
    } catch {
      /* shown inline below; the dialog stays open */
    }
  };

  const status = getStatusStyle(job.status);

  return (
    <Dialog open={open} onOpenChange={(o) => !confirm.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-md rounded-xl p-5 sm:p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-lg font-semibold tracking-tight">Abort Collection</DialogTitle>
            <DialogDescription className="text-[13px]">
              Closes the job now and releases the driver. The agreed price is kept; the fee is reviewed separately.
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-[13px]">
            <div className="min-w-0">
              <dt className="text-muted-foreground">Job</dt>
              <dd className="truncate font-medium text-foreground">{job.ref}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Vehicle</dt>
              <dd className="truncate font-mono font-medium tracking-wide text-foreground">{job.vehicleReg || "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{ backgroundColor: status.backgroundColor, color: status.color }}
                >
                  {status.label}
                </span>
              </dd>
            </div>
          </dl>

          {requestedAt && (
            <p className="text-[13px] text-muted-foreground">
              Driver requested this Abort at {formatAbortConfirmedAt(requestedAt)}.
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-medium text-foreground">
              Name of person confirming Abort
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={CONTACT_NAME_MAX + 20}
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="done"
              placeholder="e.g. Sam Patel, site manager"
              aria-invalid={showProblem}
              aria-describedby={showProblem ? `${nameId}-err` : undefined}
              disabled={confirm.isPending}
              className="min-h-[44px] text-base"
            />
            {showProblem && (
              <p id={`${nameId}-err`} className="text-[12px] text-destructive" role="alert">{problem}</p>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id={exceptionId}
              checked={noName}
              onCheckedChange={(v) => setNoName(v === true)}
              disabled={confirm.isPending}
              className="mt-0.5 h-5 w-5"
            />
            <label htmlFor={exceptionId} className="space-y-0.5 text-sm leading-snug">
              <span className="font-medium text-foreground">Authorise without contact name (admin only)</span>
              <span className="block text-[12px] text-muted-foreground">
                Recorded as an exception. The fee will not be approved automatically.
              </span>
            </label>
          </div>

          <p className="text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Abort confirmed at</span> is recorded automatically by the
            server when you confirm (UK time).
          </p>

          {confirm.isError && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{abortErrorMessage(confirm.error)} The job has not been aborted.</span>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] rounded-lg"
              onClick={() => onOpenChange(false)}
              disabled={confirm.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" className="min-h-[44px] rounded-lg" disabled={confirm.isPending} aria-busy={confirm.isPending}>
              {confirm.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
              {confirm.isPending ? "Confirming…" : "Confirm Abort"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
