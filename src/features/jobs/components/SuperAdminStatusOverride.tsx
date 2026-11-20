/**
 * SuperAdminStatusOverride — lets a super admin put a job into ANY status.
 *
 * Shown only to super admins (and the database function refuses anyone else, so
 * hiding it here is a courtesy, not the protection). Needs a written reason, which
 * is stored in the audit record and the job's activity log. A job on a live invoice
 * is refused by the database with an instruction to cancel the invoice first.
 */
import { useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import { useSuperAdminOverrideStatus } from "@/hooks/useJobs";
import {
  overrideStatusLabel, overrideTargets, overrideWarnings, reasonProblem,
} from "@/lib/jobStatusOverride";

interface Props {
  jobId: string;
  jobStatus: string;
}

export function SuperAdminStatusOverride({ jobId, jobStatus }: Props) {
  const { isSuperAdmin } = useAuth();
  const override = useSuperAdminOverrideStatus();
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);

  if (!isSuperAdmin) return null;

  const problem = reasonProblem(reason);
  const canSubmit = !!target && !problem && !override.isPending;
  const warnings = target ? overrideWarnings(jobStatus, target) : [];

  const submit = async () => {
    try {
      await override.mutateAsync({ jobId, newStatus: target, reason });
      toast({ title: `Status changed to ${overrideStatusLabel(target)}` });
      setTarget("");
      setReason("");
    } catch (e) {
      toast({
        title: "Status change failed",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30"
      data-testid="super-admin-status-override"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <ShieldAlert className="h-4 w-4" />
        Super admin: override status
      </div>
      <p className="text-xs text-amber-900/80 dark:text-amber-200/80">
        Puts this job into any status, for corrections and tests. Every change is recorded with your reason.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="override-status" className="text-xs">New status</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger id="override-status" className="min-h-[44px] rounded-lg bg-background">
            <SelectValue placeholder="Choose a status…" />
          </SelectTrigger>
          <SelectContent>
            {overrideTargets(jobStatus).map((s) => (
              <SelectItem key={s} value={s}>{overrideStatusLabel(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-900 dark:text-amber-200" data-testid="override-warnings">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="override-reason" className="text-xs">Reason (required)</Label>
        <Textarea
          id="override-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Test invoice — return to Ready to invoice"
          className="min-h-[72px] bg-background"
          maxLength={500}
        />
        {reason.length > 0 && problem && (
          <p className="text-xs text-destructive" role="alert">{problem}</p>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full min-h-[44px] rounded-lg border-amber-400"
        disabled={!canSubmit}
        onClick={() => setConfirming(true)}
      >
        {override.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Change status
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change status to {target ? overrideStatusLabel(target) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The job moves from {overrideStatusLabel(jobStatus)} to {target ? overrideStatusLabel(target) : ""}.
              This is recorded with your name and reason.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              Change status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
