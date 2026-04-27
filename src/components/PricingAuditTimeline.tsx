/**
 * PricingAuditTimeline — admin-only read view of pricing_snapshots for a job.
 *
 * Renders a vertical timeline of advisory pricing events. RLS already
 * restricts pricing_snapshots to org members; this component additionally
 * gates rendering on isAdmin/isSuperAdmin so drivers never see it even if
 * they somehow render the component.
 *
 * Read-only. No mutations. Does not affect invoicing.
 */
import { useEffect, useState } from "react";
import { History, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  SectionCard,
  SectionHeader,
  StatusPill,
  WarningCallout,
  AdvisoryNote,
  EmptyHint,
} from "@/components/ui-kit";

interface SnapshotRow {
  id: string;
  created_at: string;
  created_by: string | null;
  suggested_price: number | null;
  applied_price: number | null;
  confidence: string | null;
  reasons: unknown;
  warnings: unknown;
  missing_inputs: unknown;
  source: string;
  is_final_invoice_price: boolean;
}

interface CreatorRow {
  auth_user_id: string;
  email: string;
  display_name: string | null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string") as string[];
  return [];
}

function fmtGbp(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `£${n.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export interface PricingAuditTimelineProps {
  jobId: string;
}

export function PricingAuditTimeline({ jobId }: PricingAuditTimelineProps) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const [creators, setCreators] = useState<Record<string, CreatorRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin && !isSuperAdmin) return;
    if (!jobId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: snapErr } = await supabase
          .from("pricing_snapshots")
          .select(
            "id, created_at, created_by, suggested_price, applied_price, confidence, reasons, warnings, missing_inputs, source, is_final_invoice_price",
          )
          .eq("job_id", jobId)
          .order("created_at", { ascending: false });
        if (snapErr) throw snapErr;
        if (cancelled) return;
        const list = (data ?? []) as SnapshotRow[];
        setRows(list);

        const userIds = Array.from(
          new Set(list.map((r) => r.created_by).filter((x): x is string => !!x)),
        );
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("user_profiles")
            .select("auth_user_id, email, display_name")
            .in("auth_user_id", userIds);
          if (!cancelled && profs) {
            const map: Record<string, CreatorRow> = {};
            (profs as CreatorRow[]).forEach((p) => {
              map[p.auth_user_id] = p;
            });
            setCreators(map);
          }
        }
      } catch (err) {
        if (!cancelled) setError(String((err as Error)?.message ?? err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, isAdmin, isSuperAdmin]);

  if (!isAdmin && !isSuperAdmin) return null;

  return (
    <SectionCard>
      <SectionHeader
        icon={<History className="h-4 w-4" />}
        eyebrow="Audit"
        title="Pricing Audit Timeline"
        adminOnly
        right={
          loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null
        }
      />

      {error && (
        <WarningCallout severity="critical">
          Could not load pricing history: {error}
        </WarningCallout>
      )}

      {!loading && rows && rows.length === 0 && (
        <EmptyHint icon={<Sparkles className="h-3.5 w-3.5" />}>
          No pricing suggestions recorded for this job yet.
        </EmptyHint>
      )}

      {rows && rows.length > 0 && (
        <ol className="relative border-l border-border pl-4 space-y-4">
          {rows.map((r) => {
            const reasons = asStringArray(r.reasons);
            const warnings = asStringArray(r.warnings);
            const missing = asStringArray(r.missing_inputs);
            const creator = r.created_by ? creators[r.created_by] : undefined;
            const creatorLabel = creator
              ? creator.display_name || creator.email
              : r.created_by
                ? "Unknown user"
                : "System";

            const confidenceTone =
              r.confidence === "high"
                ? "success"
                : r.confidence === "medium"
                  ? "info"
                  : "warning";

            return (
              <li key={r.id} className="relative">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-foreground">
                    Applied {fmtGbp(r.applied_price ?? r.suggested_price)}
                  </span>
                  {typeof r.suggested_price === "number" &&
                    typeof r.applied_price === "number" &&
                    r.suggested_price !== r.applied_price && (
                      <span className="text-[11px] text-muted-foreground">
                        (suggested {fmtGbp(r.suggested_price)})
                      </span>
                    )}
                  {r.confidence && (
                    <StatusPill tone={confidenceTone}>{r.confidence}</StatusPill>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {fmtDate(r.created_at)} · {creatorLabel} · {r.source}
                </div>

                {reasons.length > 0 && (
                  <ul className="text-[11px] text-muted-foreground mt-1 list-disc list-inside space-y-0.5">
                    {reasons.slice(0, 4).map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                )}

                {warnings.length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {warnings.map((w, i) => (
                      <WarningCallout key={i} severity="warning">
                        {w}
                      </WarningCallout>
                    ))}
                  </div>
                )}

                {missing.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Missing inputs: {missing.join(", ")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <AdvisoryNote>Audit trail only — never used as the invoice total.</AdvisoryNote>
    </SectionCard>
  );
}
