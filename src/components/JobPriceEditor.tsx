/**
 * JobPriceEditor — Admin-only inline editor for the final job price
 * (jobs.total_price) and the per-job rate-per-mile override.
 *
 * - Visible only to admins / super admins.
 * - Writes directly to the `jobs` table (RLS already restricts org).
 * - Invalidates job queries so suggestion panel + dashboards refresh.
 */
import { useEffect, useState } from "react";
import { Loader2, PoundSterling, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  SectionCard,
  SectionHeader,
  AdvisoryNote,
  StatusPill,
} from "@/components/ui-kit";

interface JobPriceEditorProps {
  jobId: string;
  initialTotalPrice: number | null;
  initialRatePerMile: number | null;
}

function parseNumOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function JobPriceEditor({
  jobId,
  initialTotalPrice,
  initialRatePerMile,
}: JobPriceEditorProps) {
  const { isAdmin, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const [price, setPrice] = useState<string>(
    initialTotalPrice != null ? String(initialTotalPrice) : "",
  );
  const [rate, setRate] = useState<string>(
    initialRatePerMile != null ? String(initialRatePerMile) : "",
  );
  const [saving, setSaving] = useState(false);

  // Re-sync when the underlying job changes (e.g. after suggestion accept)
  useEffect(() => {
    setPrice(initialTotalPrice != null ? String(initialTotalPrice) : "");
  }, [initialTotalPrice]);
  useEffect(() => {
    setRate(initialRatePerMile != null ? String(initialRatePerMile) : "");
  }, [initialRatePerMile]);

  if (!isAdmin && !isSuperAdmin) return null;

  const dirty =
    parseNumOrNull(price) !== initialTotalPrice ||
    parseNumOrNull(rate) !== initialRatePerMile;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("jobs")
        .update({
          total_price: parseNumOrNull(price),
          rate_per_mile: parseNumOrNull(rate),
        })
        .eq("id", jobId);
      if (error) throw error;
      toast({ title: "Job price updated." });
      qc.invalidateQueries({ queryKey: ["job", jobId] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      toast({
        title: "Could not update price",
        description: String((err as Error)?.message ?? err),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard className="p-4 space-y-3">
      <SectionHeader
        icon={<PoundSterling className="h-4 w-4" />}
        eyebrow="Pricing"
        title="Job price"
        adminOnly
        right={
          <StatusPill tone={parseNumOrNull(price) ? "success" : "neutral"}>
            {parseNumOrNull(price) ? "Set" : "Not set"}
          </StatusPill>
        }
      />
      <AdvisoryNote>
        This is the saved invoice price. Change it any time — overrides any
        suggestion.
      </AdvisoryNote>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="jpe-price" className="text-xs">
            Job price £ (final)
          </Label>
          <Input
            id="jpe-price"
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 250.00"
          />
        </div>
        <div>
          <Label htmlFor="jpe-rate" className="text-xs">
            Rate £/mile (override)
          </Label>
          <Input
            id="jpe-rate"
            type="number"
            step="0.01"
            min={0}
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="defaults to client/org"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1.5" />
          )}
          Save price
        </Button>
      </div>
    </SectionCard>
  );
}
