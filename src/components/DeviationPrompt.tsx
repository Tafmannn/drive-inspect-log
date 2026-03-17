/**
 * Phase 4 — Deviation override prompt.
 * Shown when driver attempts to start a lower-priority job out of sequence.
 */
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEVIATION_REASONS } from "@/lib/deviationApi";
import { AlertTriangle } from "lucide-react";

interface DeviationPromptProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => void;
  currentJobRef: string;
  attemptedJobRef: string;
  reason: string; // why it's a deviation
}

export function DeviationPrompt({
  open, onClose, onConfirm, currentJobRef, attemptedJobRef, reason,
}: DeviationPromptProps) {
  const [selectedReason, setSelectedReason] = useState("");
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    if (!selectedReason) return;
    onConfirm(selectedReason, notes);
    setSelectedReason("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Out-of-sequence action
          </DialogTitle>
          <DialogDescription className="text-xs space-y-1">
            <span className="block">
              Job <strong>{currentJobRef}</strong> is your current recommended job.
            </span>
            <span className="block">
              You are attempting to start <strong>{attemptedJobRef}</strong>: {reason}
            </span>
            <span className="block">Select a reason to continue.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {DEVIATION_REASONS.map(r => (
            <button
              key={r}
              type="button"
              className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                selectedReason === r
                  ? "border-primary bg-primary/5 text-primary font-medium"
                  : "border-border bg-card text-foreground hover:bg-muted/50"
              }`}
              onClick={() => setSelectedReason(r)}
            >
              {r}
            </button>
          ))}
        </div>

        {selectedReason === "Other" && (
          <Textarea
            placeholder="Describe the reason…"
            className="text-xs"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!selectedReason} onClick={handleConfirm}>
            Continue with override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
