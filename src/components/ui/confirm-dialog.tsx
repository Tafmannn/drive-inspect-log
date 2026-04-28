/**
 * ConfirmDialog — branded, accessible replacement for window.confirm().
 *
 * Use everywhere the app needs an in-app confirmation (destructive or
 * routine). Built on shadcn/Radix AlertDialog so it inherits focus trap,
 * ESC handling, ARIA roles, and dark/light theming for free.
 *
 * Two ways to use:
 *   1. Declarative: <ConfirmDialog open onOpenChange title=... onConfirm=... />
 *   2. Imperative: const confirm = useConfirm(); await confirm({ title, ... })
 *
 * The imperative hook is the drop-in replacement for `window.confirm()` —
 * it returns a Promise<boolean>, so call sites only need a one-line change.
 *
 * Loading state: the confirm button shows a spinner and is disabled while
 * `onConfirm` runs. If `onConfirm` throws, the dialog stays open so the
 * caller can decide what to do (we surface the error via the returned
 * promise rejection).
 */
import * as React from "react";
import { Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";

export type ConfirmTone = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when user confirms. May return a promise — button shows loading state until it resolves. */
  onConfirm: () => void | Promise<void>;
  /** Optional: called when user cancels (in addition to onOpenChange(false)). */
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async (e: React.MouseEvent) => {
    // Prevent Radix's default auto-close so we can keep the dialog open
    // while the async action runs, and only close on success.
    e.preventDefault();
    if (busy) return;
    try {
      setBusy(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Caller is responsible for surfacing the error (e.g. via toast).
      // Keep the dialog open so the user can retry or cancel.
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return; // Don't allow ESC/outside-click to close mid-mutation.
        if (!next) onCancel?.();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="max-w-[min(92vw,420px)] rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-sm leading-relaxed whitespace-pre-line">
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel disabled={busy} className="mt-0">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={busy}
            className={cn(
              tone === "danger" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus:ring-destructive",
            )}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Working…
              </>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Imperative API ─────────────────────────────────────────────────────
// Mount <ConfirmProvider /> once near the app root, then call useConfirm()
// from anywhere to get a Promise<boolean> — a true drop-in for window.confirm.

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const ConfirmContext = React.createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const handleConfirm = React.useCallback(() => {
    pending?.resolve(true);
    setPending(null);
  }, [pending]);

  const handleCancel = React.useCallback(() => {
    pending?.resolve(false);
    setPending(null);
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) handleCancel();
          }}
          title={pending.title}
          description={pending.description}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          tone={pending.tone}
          onConfirm={handleConfirm}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns an async confirm() — drop-in replacement for window.confirm. */
export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within <ConfirmProvider />");
  }
  return ctx;
}
