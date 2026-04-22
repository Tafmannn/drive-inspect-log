// src/components/StorageFailureCard.tsx
//
// Canonical, single error surface for "photos could not be saved locally"
// failures during inspection submit.
//
// Why one component:
//   The review screen previously rendered TWO destructive surfaces (a toast
//   AND a card) for the same failure, so drivers saw the same red copy
//   twice and didn't know which one to act on. This component is the
//   single visual + interactive surface — pair it with a *suppressed*
//   toast on the failure path so the message appears exactly once.
//
// Recovery model:
//   Primary action: "Try again" — re-runs the staged local save without
//   losing form state, signatures, damage entries, or captured photos.
//   Secondary action: "Show details" — reveals the cause-specific
//   recovery steps and the raw error string for support escalation.
//
// The card never navigates, never reloads, and never claims success. The
// parent owns submit gating; this component only reports + retries.
//
// a11y: role="alert" + aria-live="assertive" so screen readers announce
// the block on first render and again on retry failure.

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StorageFailure } from "@/lib/storageDiagnostics";

interface StorageFailureCardProps {
  failure: StorageFailure;
  /** True while a retry is currently in flight — disables both buttons. */
  retrying: boolean;
  /** Re-run the staged local save. Parent must preserve form state. */
  onRetry: () => void;
  /** Optional dense variant for non-review steps (early warning). */
  dense?: boolean;
}

export function StorageFailureCard({
  failure,
  retrying,
  onRetry,
  dense = false,
}: StorageFailureCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="storage-failure-card"
      data-reason-code={failure.kind}
      className={
        "bg-destructive/10 border border-destructive/30 rounded-lg space-y-2 " +
        (dense ? "p-3" : "p-4")
      }
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={
            "text-destructive shrink-0 " +
            (dense ? "h-4 w-4 mt-0.5" : "h-5 w-5 mt-0.5")
          }
          aria-hidden="true"
        />
        <div className="space-y-1 flex-1 min-w-0">
          <p
            className={
              "font-semibold text-destructive " +
              (dense ? "text-[13px]" : "text-sm")
            }
          >
            {failure.title}
          </p>
          <p
            className={
              "text-foreground " + (dense ? "text-[12px]" : "text-xs")
            }
          >
            {failure.description}
          </p>

          {showDetails && (
            <div className="pt-1 space-y-1">
              <p className="text-xs font-medium text-foreground">How to fix:</p>
              <ul className="text-xs text-foreground list-disc pl-4 space-y-0.5">
                {failure.recovery.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
              {failure.raw && (
                <p className="text-[11px] text-muted-foreground pt-1 break-words">
                  Reason: <span className="font-mono">{failure.kind}</span>
                  {" — "}
                  {failure.raw}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              onClick={onRetry}
              disabled={retrying}
              data-testid="storage-failure-retry"
            >
              {retrying ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Trying again…
                </>
              ) : (
                "Try again"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowDetails((s) => !s)}
              data-testid="storage-failure-details"
            >
              {showDetails ? "Hide details" : "Show details"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
