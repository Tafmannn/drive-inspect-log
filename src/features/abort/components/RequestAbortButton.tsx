/**
 * Driver: one-tap Abort request. No form, photo, signature or location.
 *
 * The request is only shown as sent once the server has stored it (request_job_abort);
 * a repeated tap or a retry after a dropped connection returns the same request, never a
 * second one. The job stays active and assigned until an admin confirms the Abort.
 */
import { Loader2, OctagonX, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useDriverAbortRequest, useRequestAbort } from "../hooks/useAbort";
import { abortErrorMessage, formatAbortConfirmedAt } from "../lib/abortRules";

export function RequestAbortButton({ jobId }: { jobId: string }) {
  const pending = useDriverAbortRequest(jobId, true);
  const request = useRequestAbort(jobId);

  if (pending.data) {
    return (
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3"
      >
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-medium text-foreground">Abort requested</p>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Sent {formatAbortConfirmedAt(pending.data.requested_at)}. The office will confirm. Keep the
            job until they do — you can still call or WhatsApp them.
          </p>
        </div>
      </div>
    );
  }

  const send = async () => {
    if (request.isPending) return;
    try {
      await request.mutateAsync();
      toast({ title: "Abort requested", description: "The office has been told. The job stays with you until they confirm." });
    } catch (e) {
      toast({ title: "Request not sent", description: abortErrorMessage(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        className="w-full min-h-[44px] rounded-lg border-warning/40 text-foreground [touch-action:manipulation]"
        onClick={send}
        disabled={request.isPending || pending.isLoading}
        aria-busy={request.isPending}
      >
        {request.isPending ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <OctagonX className="mr-1.5 h-4 w-4 text-warning" aria-hidden />
        )}
        {request.isPending ? "Sending…" : "Request Abort"}
      </Button>
      {request.isError && (
        <p className="text-[12px] text-destructive" role="alert">
          Not sent. {abortErrorMessage(request.error)}
        </p>
      )}
    </div>
  );
}
