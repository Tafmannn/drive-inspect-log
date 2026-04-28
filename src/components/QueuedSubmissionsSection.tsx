import { useEffect, useState } from "react";
import {
  loadAllSubmissions,
  retrySubmission,
  discardSubmission,
  drainSubmitQueue,
  useSubmitQueueVersion,
  type QueuedSubmission,
} from "@/lib/submitQueue";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

/**
 * Surfaces the submitQueue (queued + failed inspection submissions)
 * inside the Pending Uploads screen. Driver can:
 *   • Retry a single entry (works for both transient `failed` and
 *     hard `failed_needs_attention` entries — manual retry is the
 *     escape hatch for the latter).
 *   • Delete a single entry (with confirmation — required because
 *     this is the ONLY destructive path that drops captured evidence).
 *   • Run a global auto-drain to push every transient entry through.
 */
function statusMeta(status: QueuedSubmission["status"]): {
  label: string;
  className: string;
} {
  switch (status) {
    case "queued":
      return {
        label: "Queued",
        className:
          "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
      };
    case "submitting":
      return {
        label: "Submitting…",
        className:
          "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30",
      };
    case "failed":
      return {
        label: "Will retry",
        className:
          "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
      };
    case "failed_needs_attention":
      return {
        label: "Needs attention",
        className:
          "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
      };
  }
}

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const deltaSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  const m = Math.round(deltaSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleString();
}

export function QueuedSubmissionsSection() {
  const version = useSubmitQueueVersion();
  const [items, setItems] = useState<QueuedSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draining, setDraining] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadAllSubmissions();
        if (!cancelled) {
          // Most recent first.
          setItems(
            [...data].sort((a, b) =>
              b.createdAt.localeCompare(a.createdAt),
            ),
          );
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (loading || items.length === 0) return null;

  const transientCount = items.filter(
    (i) => i.status === "queued" || i.status === "failed",
  ).length;

  const handleRetry = async (id: string) => {
    setBusyId(id);
    try {
      await retrySubmission(id);
      toast({ title: "Submission sent." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "Retry failed.",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const confirmDeleteEntry = items.find((i) => i.id === confirmDeleteId) ?? null;

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setBusyId(id);
    try {
      await discardSubmission(id);
      toast({ title: "Queued submission deleted." });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "Couldn't delete submission.",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDrainAll = async () => {
    setDraining(true);
    try {
      const result = await drainSubmitQueue();
      if (result.skipped) {
        if (result.reason === "offline") {
          toast({
            title: "You're offline.",
            description: "Submissions will retry automatically once you're back online.",
          });
        } else {
          toast({ title: "A retry is already running — please wait." });
        }
      } else if (result.succeeded > 0 && result.failed === 0) {
        toast({
          title: `${result.succeeded} submission${result.succeeded !== 1 ? "s" : ""} sent.`,
        });
      } else if (result.failed > 0) {
        toast({
          title: `${result.succeeded} sent, ${result.failed} still failing.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Nothing to retry right now." });
      }
    } finally {
      setDraining(false);
    }
  };

  return (
    <section className="space-y-3" aria-label="Queued inspection submissions">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-foreground">
          Queued Inspection Submissions
        </h2>
        <span className="text-[12px] text-muted-foreground">
          {items.length} total
        </span>
      </div>

      <Button
        onClick={handleDrainAll}
        disabled={draining || transientCount === 0}
        className="w-full min-h-[44px] rounded-lg"
        variant="secondary"
        data-testid="drain-submit-queue-btn"
      >
        {draining ? (
          <Loader2 className="mr-2 w-5 h-5 animate-spin" />
        ) : (
          <Upload className="mr-2 w-5 h-5 stroke-[2]" />
        )}
        Auto-drain queued ({transientCount})
      </Button>

      <ul className="space-y-2">
        {items.map((item) => {
          const meta = statusMeta(item.status);
          const isNeedsAttention = item.status === "failed_needs_attention";
          const isBusy = busyId === item.id || item.status === "submitting";
          const label =
            item.inspectionType === "pickup" ? "Pickup" : "Delivery";
          return (
            <li
              key={item.id}
              className={[
                "p-4 rounded-xl border shadow-sm space-y-3",
                isNeedsAttention
                  ? "bg-red-500/5 border-red-500/40"
                  : "bg-card border-border",
              ].join(" ")}
              data-testid={`queued-submission-${item.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-medium text-foreground truncate">
                    {item.jobNumber || `Job ${item.jobId.slice(0, 8)}`}
                  </p>
                  <p className="text-[13px] text-muted-foreground truncate">
                    {label}
                    {item.vehicleReg ? ` · ${item.vehicleReg}` : ""}
                  </p>
                </div>
                <span
                  className={[
                    "inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap",
                    meta.className,
                  ].join(" ")}
                >
                  {isNeedsAttention && (
                    <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
                  )}
                  {meta.label}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Created {formatRelative(item.createdAt)}
                </span>
                <span>·</span>
                <span>
                  {item.attempts} attempt{item.attempts !== 1 ? "s" : ""}
                </span>
              </div>

              {item.lastError && (
                <div
                  className={[
                    "text-[12px] rounded-md p-2 break-words",
                    isNeedsAttention
                      ? "bg-red-500/10 text-red-800 dark:text-red-200 border border-red-500/30"
                      : "bg-orange-500/10 text-orange-800 dark:text-orange-200 border border-orange-500/30",
                  ].join(" ")}
                >
                  <p className="font-medium mb-0.5">
                    {isNeedsAttention
                      ? "Server rejected this submission:"
                      : "Last error:"}
                  </p>
                  <p className="font-mono text-[11px] leading-snug whitespace-pre-wrap">
                    {item.lastError}
                  </p>
                  {isNeedsAttention && (
                    <p className="mt-1 text-[11px] opacity-80">
                      Auto-retry is paused for this submission. Tap Retry once
                      the underlying issue is fixed.
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleRetry(item.id)}
                  disabled={isBusy}
                  className="flex-1 min-h-[44px] rounded-lg"
                  data-testid={`retry-submission-${item.id}`}
                >
                  {isBusy ? (
                    <Loader2 className="mr-1 w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 w-4 h-4 stroke-[2]" />
                  )}
                  Retry now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDeleteId(item.id)}
                  disabled={isBusy}
                  className="min-h-[44px] rounded-lg text-destructive hover:text-destructive"
                  data-testid={`delete-submission-${item.id}`}
                  aria-label="Delete queued submission"
                >
                  <Trash2 className="w-4 h-4 stroke-[2]" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={!!confirmDeleteId}
        onOpenChange={(o) => !o && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this queued submission?</AlertDialogTitle>
            <AlertDialogDescription>
              The captured inspection data, signatures and any photos staged
              for this submission will be permanently removed from this device.
              This is the only way driver evidence is ever discarded — you
              cannot undo this.
              {confirmDeleteEntry && (
                <span className="block mt-2 font-medium text-foreground">
                  {confirmDeleteEntry.jobNumber ||
                    `Job ${confirmDeleteEntry.jobId.slice(0, 8)}`}{" "}
                  ·{" "}
                  {confirmDeleteEntry.inspectionType === "pickup"
                    ? "Pickup"
                    : "Delivery"}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep submission</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
