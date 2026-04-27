/**
 * Attention Queue — exception cards with action hierarchy and age escalation.
 * Primary action is visually dominant. Ack/Snooze are secondary.
 * Age escalation: 0-24h normal, 24-72h escalated border, 72h+ highest urgency.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateForEvent } from "@/lib/mutationEvents";
import { toast } from "@/hooks/use-toast";
import { Check, Clock, Loader2, AlertTriangle } from "lucide-react";
import type { AttentionException } from "../types/exceptionTypes";
import { cn } from "@/lib/utils";

const sevVariant: Record<string, "destructive" | "secondary" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const catEmoji: Record<string, string> = {
  timing: "⏱",
  evidence: "📎",
  sync: "🔄",
  state: "🔒",
};

function humanAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function ageHours(isoDate: string): number {
  return (Date.now() - new Date(isoDate).getTime()) / 3600_000;
}

/** Returns escalation CSS classes based on age thresholds */
function escalationClasses(isoDate: string): string {
  const hrs = ageHours(isoDate);
  if (hrs >= 72) return "border-destructive/60 bg-destructive/5 ring-1 ring-destructive/20";
  if (hrs >= 24) return "border-warning/50 bg-warning/5";
  return "border-border bg-card";
}

function EscalationBadge({ isoDate }: { isoDate: string }) {
  const hrs = ageHours(isoDate);
  if (hrs >= 72) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
        <AlertTriangle className="h-2.5 w-2.5" /> URGENT
      </span>
    );
  }
  if (hrs >= 24) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
        <Clock className="h-2.5 w-2.5" /> ESCALATED
      </span>
    );
  }
  return null;
}

interface Props {
  exceptions: AttentionException[];
  showOrg: boolean;
  loading: boolean;
  acknowledged?: boolean;
}

export function AttentionQueue({ exceptions, showOrg, loading, acknowledged = false }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [ackDialog, setAckDialog] = useState<{ exception: AttentionException; mode: "ack" | "snooze" } | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAcknowledge = async (mode: "ack" | "snooze") => {
    if (!ackDialog || !user) return;
    setSubmitting(true);
    const exId = ackDialog.exception.id;
    try {
      const { error } = await supabase.from("attention_acknowledgements").insert({
        exception_id: exId,
        job_id: ackDialog.exception.jobId ?? null,
        acknowledged_by: user.id,
        note: note || null,
        snoozed_until: mode === "snooze" ? new Date(Date.now() + 24 * 3600_000).toISOString() : null,
      });
      if (error) throw error;
      toast({ title: mode === "snooze" ? "Snoozed for 24h" : "Acknowledged" });
      setAckDialog(null);
      setNote("");
      // Immediately remove from local cache for instant UI feedback
      qc.setQueriesData({ queryKey: ["attention-center"] }, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          exceptions: (old.exceptions ?? []).filter((e: any) => e.id !== exId),
          acknowledgedExceptions: [...(old.acknowledgedExceptions ?? []), ackDialog.exception],
          acknowledgedCount: (old.acknowledgedCount ?? 0) + 1,
        };
      });
      // Then refetch every admin operational surface to ensure consistency
      // — the resolved exception may also affect Needs Action / POD review /
      // operations bucket counts.
      invalidateForEvent(qc, "evidence_resolved", [
        ackDialog.exception.jobId ? ["job", ackDialog.exception.jobId] : ["attention-center"],
      ]);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground text-center py-10">Loading exceptions…</p>;
  }

  if (!exceptions.length) {
    if (acknowledged) return null;
    return (
      <div className="text-center py-10">
        <p className="text-lg font-semibold text-foreground">✅ All clear</p>
        <p className="text-sm text-muted-foreground mt-1">No operational exceptions require attention.</p>
      </div>
    );
  }

  // Sort: 72h+ items within same severity band float to top
  const sorted = [...exceptions].sort((a, b) => {
    const aHrs = ageHours(a.createdAt);
    const bHrs = ageHours(b.createdAt);
    const aEsc = aHrs >= 72 ? 0 : aHrs >= 24 ? 1 : 2;
    const bEsc = bHrs >= 72 ? 0 : bHrs >= 24 ? 1 : 2;
    if (aEsc !== bEsc) return aEsc - bEsc;
    return 0; // preserve existing severity sort from engine
  });

  return (
    <>
      <div className="space-y-2.5">
        {sorted.map(e => (
          <div
            key={e.id}
            className={cn(
              "rounded-xl border p-4 space-y-2.5 transition-colors",
              escalationClasses(e.createdAt),
              acknowledged && "opacity-60"
            )}
          >
            {/* Header: severity + category + age + escalation */}
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center gap-2">
                <Badge variant={sevVariant[e.severity] ?? "secondary"} className="text-xs uppercase">
                  {e.severity}
                </Badge>
                <span className="text-xs text-muted-foreground">{catEmoji[e.category]} {e.category}</span>
                {e.jobNumber && <span className="text-xs font-mono text-muted-foreground">{e.jobNumber}</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <EscalationBadge isoDate={e.createdAt} />
                <span className="text-xs text-muted-foreground">{humanAge(e.createdAt)}</span>
              </div>
            </div>

            {/* Title + detail */}
            <div>
              <p className="text-sm font-semibold text-foreground">{e.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{e.detail}</p>
              {showOrg && e.orgName && <p className="text-xs text-muted-foreground">Org: {e.orgName}</p>}
            </div>

            {/* Actions: Primary dominant, secondary smaller */}
            <div className="flex items-center gap-2">
              {/* PRIMARY ACTION — visually dominant */}
              <Button
                size="sm"
                className="min-h-[40px] text-xs font-medium flex-shrink-0"
                onClick={() => navigate(e.actionRoute)}
              >
                {e.actionLabel}
              </Button>

              {/* SECONDARY: Ack + Snooze — ghost/outline, smaller */}
              {!acknowledged && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[36px] text-xs text-muted-foreground"
                    onClick={() => { setAckDialog({ exception: e, mode: "ack" }); setNote(""); }}
                  >
                    <Check className="w-3 h-3 mr-1" /> Ack
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-[36px] text-xs text-muted-foreground"
                    onClick={() => { setAckDialog({ exception: e, mode: "snooze" }); setNote(""); }}
                  >
                    <Clock className="w-3 h-3 mr-1" /> 24h
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!ackDialog} onOpenChange={(open) => { if (!open) setAckDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {ackDialog?.mode === "snooze" ? "Snooze for 24 hours" : "Acknowledge Exception"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{ackDialog?.exception.title}</p>
            <Textarea
              placeholder="Note (required)…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckDialog(null)}>Cancel</Button>
            <Button onClick={() => handleAcknowledge(ackDialog?.mode ?? "ack")} disabled={submitting || !note.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : ackDialog?.mode === "snooze" ? "Snooze" : "Acknowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
