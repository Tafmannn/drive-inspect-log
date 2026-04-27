/**
 * PricingSuggestionPanel
 *
 * Advisory pricing widget for admin-only surfaces (job create/edit screen
 * and admin job detail).
 *
 * Strict rules:
 *   - Suggested price is NEVER auto-saved.
 *   - Suggested price is NEVER applied to invoice totals.
 *   - Only admins see this panel.
 *   - When admin clicks "Use suggested price":
 *       1. copies suggestedPrice into jobs.total_price
 *       2. saves a row to pricing_snapshots (audit trail)
 *       3. saves pricing metadata onto jobs.pricing_metadata
 *       4. snapshot.is_final_invoice_price stays false
 *
 * If no jobId exists yet (job create), only the suggestion is shown — the
 * "Use" action is disabled, and the parent form can read the current value
 * via onSuggestionChange to seed total_price on creation if it chooses
 * (and only if the admin explicitly accepts).
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, AlertTriangle, Check } from "lucide-react";
import { suggestJobPrice, type PricingInputs, type PricingSuggestion } from "@/lib/pricingBrain";
import { loadPricingDefaults } from "@/lib/pricingDefaults";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";

export interface PricingSuggestionPanelProps {
  /** Job ID — required for the "Use suggested price" save action. */
  jobId?: string | null;
  /** Org ID — required for snapshot insert. */
  orgId?: string | null;
  /** Current persisted total price on the job (advisory display). */
  currentTotalPrice?: number | null;
  /** Pricing inputs (route miles, urgency, rate card, etc.). */
  inputs: Omit<PricingInputs, "minimumCharge" | "ratePerMile"> & {
    /** Optional explicit overrides — usually leave undefined to let
     *  app_settings.pricing_defaults flow through. */
    minimumChargeOverride?: number | null;
    ratePerMileOverride?: number | null;
  };
  /** Called when the suggestion is recomputed. Form can read
   *  `suggestion.suggestedPrice` if it wants to pre-fill on create. */
  onSuggestionChange?: (s: PricingSuggestion) => void;
  /** Called after a successful "Use suggested price". */
  onAccepted?: (acceptedPrice: number) => void;
}

export function PricingSuggestionPanel(props: PricingSuggestionPanelProps) {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const [suggestion, setSuggestion] = useState<PricingSuggestion | null>(null);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Stable JSON key for inputs (so effect re-runs only on real changes)
  const inputsKey = useMemo(() => JSON.stringify(props.inputs), [props.inputs]);

  useEffect(() => {
    let cancelled = false;
    setComputing(true);
    loadPricingDefaults()
      .then((defs) => {
        if (cancelled) return;
        const finalInputs: PricingInputs = {
          ...props.inputs,
          minimumCharge:
            props.inputs.minimumChargeOverride ?? defs.MIN_CHARGE,
          ratePerMile:
            props.inputs.ratePerMileOverride ?? defs.MIN_RATE_PER_MILE,
        };
        const s = suggestJobPrice(finalInputs);
        setSuggestion(s);
        props.onSuggestionChange?.(s);
      })
      .finally(() => {
        if (!cancelled) setComputing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey]);

  if (!isAdmin && !isSuperAdmin) return null;

  const canSave =
    !!props.jobId &&
    !!props.orgId &&
    typeof suggestion?.suggestedPrice === "number" &&
    !saving;

  const handleAccept = async () => {
    if (!props.jobId || !props.orgId || !suggestion?.suggestedPrice) return;
    setSaving(true);
    try {
      // 1. copy suggested into jobs.total_price + metadata
      const metadata = {
        accepted_at: new Date().toISOString(),
        accepted_by: user?.id ?? null,
        suggested_price: suggestion.suggestedPrice,
        confidence: suggestion.confidence,
        reasons: suggestion.reasons,
        warnings: suggestion.warnings,
        breakdown: suggestion.breakdown,
        is_final_invoice_price: false as const,
      };
      const { error: jobErr } = await supabase
        .from("jobs")
        .update({
          total_price: suggestion.suggestedPrice,
          pricing_metadata: metadata,
          pricing_suggestion_used_at: metadata.accepted_at,
          pricing_suggestion_used_by: user?.id ?? null,
        })
        .eq("id", props.jobId);
      if (jobErr) throw jobErr;

      // 2. snapshot for audit
      const { error: snapErr } = await supabase
        .from("pricing_snapshots")
        .insert({
          org_id: props.orgId,
          job_id: props.jobId,
          created_by: user?.id ?? null,
          suggested_price: suggestion.suggestedPrice,
          applied_price: suggestion.suggestedPrice,
          confidence: suggestion.confidence,
          reasons: suggestion.reasons as unknown as never,
          warnings: suggestion.warnings as unknown as never,
          missing_inputs: suggestion.missingInputs as unknown as never,
          breakdown: suggestion.breakdown as unknown as never,
          inputs: props.inputs as unknown as never,
          is_final_invoice_price: false,
          source: "admin_accept",
        });
      if (snapErr) throw snapErr;

      toast({ title: `Suggested price £${suggestion.suggestedPrice.toFixed(2)} applied.` });
      props.onAccepted?.(suggestion.suggestedPrice);
    } catch (err) {
      toast({
        title: "Could not apply suggested price",
        description: String((err as Error)?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Suggested Price (advisory)</h3>
        {computing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {suggestion?.suggestedPrice != null ? (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-2xl font-bold">£{suggestion.suggestedPrice.toFixed(2)}</span>
          <Badge variant="outline" className="capitalize">{suggestion.confidence} confidence</Badge>
          {typeof props.currentTotalPrice === "number" && props.currentTotalPrice > 0 && (
            <span className="text-xs text-muted-foreground">
              Current: £{props.currentTotalPrice.toFixed(2)}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No suggestion available — see missing inputs below.</p>
      )}

      {suggestion && suggestion.reasons.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          {suggestion.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}

      {suggestion && suggestion.warnings.length > 0 && (
        <div className="space-y-1">
          {suggestion.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {suggestion && suggestion.missingInputs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Missing inputs: {suggestion.missingInputs.join(", ")}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={!canSave}
          onClick={handleAccept}
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
          Use suggested price
        </Button>
        {!props.jobId && (
          <span className="text-xs text-muted-foreground self-center">
            Save the job first to apply this suggestion.
          </span>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Advisory only — never used as the invoice total. Invoices always use the saved job price.
      </p>
    </div>
  );
}
