import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Check, Clock, Loader2 } from "lucide-react";
import type { AttentionException } from "../types/exceptionTypes";

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
    try {
      const { error } = await supabase.from("attention_acknowledgements").insert({
        exception_id: ackDialog.exception.id,
        job_id: ackDialog.exception.jobId ?? null,
        acknowledged_by: user.id,
        note: note || null,
        snoozed_until: mode === "snooze" ? new Date(Date.now() + 24 * 3600_000).toISOString() : null,
      } as any);
      if (error) throw error;
      toast({ title: mode === "snooze" ? "Snoozed for 24h" : "Acknowledged" });
      setAckDialog(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["attention-center"] });
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

  /* ── Mobile card view ─────────────────────────────────── */
  const mobileView = (
    <div className="space-y-3 lg:hidden">
      {exceptions.map(e => (
        <div key={e.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={sevVariant[e.severity] ?? "secondary"} className="text-xs uppercase">
                {e.severity}
              </Badge>
              <span className="text-xs text-muted-foreground">{catEmoji[e.category]} {e.category}</span>
            </div>
            <span className="text-xs text-muted-foreground">{humanAge(e.createdAt)}</span>
          </div>
          {e.jobNumber && <span className="text-xs font-mono text-muted-foreground">{e.jobNumber}</span>}
          <p className="text-sm font-medium text-foreground">{e.title}</p>
          <p className="text-xs text-muted-foreground">{e.detail}</p>
          {showOrg && e.orgName && <p className="text-xs text-muted-foreground">Org: {e.orgName}</p>}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="min-h-[36px] text-xs" onClick={() => navigate(e.actionRoute)}>
              {e.actionLabel}
            </Button>
            {!acknowledged && (
              <>
                <Button size="sm" variant="ghost" className="min-h-[36px] text-xs" onClick={() => { setAckDialog({ exception: e, mode: "ack" }); setNote(""); }}>
                  <Check className="w-3 h-3 mr-1" /> Ack
                </Button>
                <Button size="sm" variant="ghost" className="min-h-[36px] text-xs" onClick={() => { setAckDialog({ exception: e, mode: "snooze" }); setNote(""); }}>
                  <Clock className="w-3 h-3 mr-1" /> 24h
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  /* ── Desktop table view ───────────────────────────────── */
  const desktopView = (
    <div className="hidden lg:block rounded-xl border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-[90px]">Severity</TableHead>
            <TableHead className="text-xs w-[90px]">Category</TableHead>
            <TableHead className="text-xs w-[100px]">Job #</TableHead>
            {showOrg && <TableHead className="text-xs w-[140px]">Organisation</TableHead>}
            <TableHead className="text-xs">Title</TableHead>
            <TableHead className="text-xs">Detail</TableHead>
            <TableHead className="text-xs w-[100px]">Age</TableHead>
            <TableHead className="text-xs w-[200px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {exceptions.map(e => (
            <TableRow key={e.id}>
              <TableCell>
                <Badge variant={sevVariant[e.severity] ?? "secondary"} className="text-xs uppercase">{e.severity}</Badge>
              </TableCell>
              <TableCell className="text-xs">{catEmoji[e.category]} {e.category}</TableCell>
              <TableCell className="text-xs font-mono">{e.jobNumber ?? "—"}</TableCell>
              {showOrg && <TableCell className="text-xs text-muted-foreground">{e.orgName ?? "—"}</TableCell>}
              <TableCell className="text-sm font-medium">{e.title}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{e.detail}</TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{humanAge(e.createdAt)}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="sm" variant="ghost" className="min-h-[36px] text-xs" onClick={() => navigate(e.actionRoute)}>
                  {e.actionLabel}
                </Button>
                {!acknowledged && (
                  <>
                    <Button size="sm" variant="ghost" className="min-h-[36px] text-xs" onClick={() => { setAckDialog({ exception: e, mode: "ack" }); setNote(""); }}>
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="min-h-[36px] text-xs" onClick={() => { setAckDialog({ exception: e, mode: "snooze" }); setNote(""); }}>
                      <Clock className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <>
      {mobileView}
      {desktopView}

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
              placeholder="Optional note…"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAckDialog(null)}>Cancel</Button>
            <Button onClick={() => handleAcknowledge(ackDialog?.mode ?? "ack")} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : ackDialog?.mode === "snooze" ? "Snooze" : "Acknowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
