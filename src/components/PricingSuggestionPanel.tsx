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
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Check } from "lucide-react";
import { suggestJobPrice, type PricingInputs, type PricingSuggestion } from "@/lib/pricingBrain";
import { loadPricingDefaults } from "@/lib/pricingDefaults";
import { computePriceDelta } from "@/lib/pricingDelta";
import { getActiveClientRateCard, type ClientRateCard } from "@/lib/clientApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  SectionCard,
  SectionHeader,
  MetricBlock,
  StatusPill,
  WarningCallout,
  AdvisoryNote,
  DeltaBadge,
} from "@/components/ui-kit";

export interface PricingSuggestionPanelProps {
  jobId?: string | null;
  orgId?: string | null;
  clientId?: string | null;
  currentTotalPrice?: number | null;
  inputs: Omit<PricingInputs, "minimumCharge" | "ratePerMile" | "clientRateCard"> & {
    minimumChargeOverride?: number | null;
    ratePerMileOverride?: number | null;
  };
  onSuggestionChange?: (s: PricingSuggestion) => void;
  onAccepted?: (acceptedPrice: number) => void;
}

export function PricingSuggestionPanel(props: PricingSuggestionPanelProps) {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const [suggestion, setSuggestion] = useState<PricingSuggestion | null>(null);
  const [rateCard, setRateCard] = useState<ClientRateCard | null>(null);
  const [computing, setComputing] = useState(false);
  const [saving, setSaving] = useState(false);

  const inputsKey = useMemo(() => JSON.stringify(props.inputs), [props.inputs]);
  const clientId = props.clientId ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!clientId) {
      setRateCard(null);
      return;
    }
    getActiveClientRateCard(clientId)
      .then((rc) => {
        if (!cancelled) setRateCard(rc);
      })
      .catch(() => {
        if (!cancelled) setRateCard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    let cancelled = false;
    setComputing(true);
    loadPricingDefaults()
      .then((defs) => {
        if (cancelled) return;
        const finalInputs: PricingInputs = {
          ...props.inputs,
          minimumCharge: props.inputs.minimumChargeOverride ?? defs.MIN_CHARGE,
          ratePerMile: props.inputs.ratePerMileOverride ?? defs.MIN_RATE_PER_MILE,
          clientRateCard: rateCard
            ? {
                ratePerMile: rateCard.ratePerMile,
                minimumCharge: rateCard.minimumCharge,
                agreedPrice: rateCard.agreedPrice,
              }
            : null,
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
  }, [inputsKey, rateCard]);

  if (!isAdmin && !isSuperAdmin) return null;

  const hasRouteMiles =
    typeof props.inputs.routeMiles === "number" &&
    Number.isFinite(props.inputs.routeMiles) &&
    props.inputs.routeMiles > 0;

  const delta = computePriceDelta(
    props.currentTotalPrice ?? null,
    suggestion?.suggestedPrice ?? null,
  );

  const canSave =
    !!props.jobId &&
    !!props.orgId &&
    typeof suggestion?.suggestedPrice === "number" &&
    hasRouteMiles &&
    !saving;

  const handleAccept = async () => {
    if (!props.jobId || !props.orgId || !suggestion?.suggestedPrice) return;
    setSaving(true);
    try {
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
          inputs: { ...props.inputs, clientId: props.clientId ?? null, clientRateCard: rateCard } as unknown as never,
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

  const confidenceTone =
    suggestion?.confidence === "high"
      ? "success"
      : suggestion?.confidence === "medium"
        ? "info"
        : "warning";

  return (
    <SectionCard>
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        eyebrow="Pricing"
        title="Suggested Price"
        adminOnly
        right={
          <>
            {rateCard?.agreedPrice != null || rateCard?.ratePerMile != null ? (
              <StatusPill tone="info">Rate card</StatusPill>
            ) : null}
            <StatusPill tone="advisory">Advisory</StatusPill>
            {computing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </>
        }
      />

      {suggestion?.suggestedPrice != null ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <MetricBlock
            label="Suggested"
            tone="headline"
            value={`£${suggestion.suggestedPrice.toFixed(2)}`}
            trailing={
              <StatusPill tone={confidenceTone}>{suggestion.confidence}</StatusPill>
            }
          />
          <MetricBlock
            label="Current saved"
            tone="muted"
            value={
              typeof props.currentTotalPrice === "number" && props.currentTotalPrice > 0
                ? `£${props.currentTotalPrice.toFixed(2)}`
                : "—"
            }
            hint={
              delta.direction !== "unknown" ? (
                <DeltaBadge
                  direction={delta.direction}
                  label={delta.label}
                  warn={delta.warn}
                  severity={delta.severity}
                />
              ) : null
            }
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No suggestion available — see missing inputs below.
        </p>
      )}

      {suggestion && suggestion.reasons.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          {suggestion.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      {suggestion && suggestion.warnings.length > 0 && (
        <div className="space-y-1.5">
          {suggestion.warnings.map((w, i) => (
            <WarningCallout key={i} severity="warning">
              {w}
            </WarningCallout>
          ))}
        </div>
      )}

      {suggestion && suggestion.missingInputs.length > 0 && (
        <WarningCallout severity="info">
          Missing inputs: {suggestion.missingInputs.join(", ")}
        </WarningCallout>
      )}

      <div className="flex flex-wrap gap-2 pt-1 items-center">
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={!canSave}
          onClick={handleAccept}
          className="min-h-[40px]"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1.5" />
          )}
          Use suggested price
        </Button>
        {!props.jobId && (
          <span className="text-xs text-muted-foreground">
            Save the job first to apply this suggestion.
          </span>
        )}
        {props.jobId && !hasRouteMiles && (
          <span className="text-xs text-muted-foreground">
            Add a valid route distance to enable this action.
          </span>
        )}
      </div>

      <AdvisoryNote>
        Advisory only — never used as the invoice total. Invoices always use the saved job price.
      </AdvisoryNote>
    </SectionCard>
  );
}
