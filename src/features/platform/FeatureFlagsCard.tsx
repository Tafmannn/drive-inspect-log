/**
 * Owner-only feature switches (Super Admin → Settings).
 *
 * Flags live in app_settings, which only a super admin can write (RLS), so
 * the page route guard and the database agree. Each switch saves on its own,
 * re-reads on success and rolls back on failure, so what's shown is always
 * what's stored. Risky flags ask first.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "@/hooks/use-toast";
import { FEATURE_FLAGS, fetchFeatureFlags, setFeatureFlag, type FeatureFlagKey } from "@/lib/featureFlags";

const QUERY_KEY = ["platform", "feature-flags"] as const;

export function FeatureFlagsCard() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [pendingKey, setPendingKey] = useState<FeatureFlagKey | null>(null);

  const { data, isLoading, error, refetch } = useQuery({ queryKey: QUERY_KEY, queryFn: fetchFeatureFlags });

  const mutation = useMutation({
    mutationFn: ({ key, enabled }: { key: FeatureFlagKey; enabled: boolean }) => setFeatureFlag(key, enabled),
    onSuccess: (_d, { key, enabled }) => {
      const def = FEATURE_FLAGS.find((f) => f.key === key);
      toast({ title: `${def?.label ?? key} turned ${enabled ? "on" : "off"}`, description: "Devices pick this up within 5 minutes, or when the app is reopened." });
    },
    onError: (e: Error) => toast({ title: "Couldn't save that setting", description: e.message, variant: "destructive" }),
    onSettled: () => {
      setPendingKey(null);
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const toggle = async (key: FeatureFlagKey, enabled: boolean) => {
    const def = FEATURE_FLAGS.find((f) => f.key === key);
    if (def?.risky) {
      const ok = await confirm({
        title: `Turn ${def.label} ${enabled ? "on" : "off"}?`,
        description: `${def.description} This affects every driver and admin.`,
        confirmLabel: enabled ? "Turn on" : "Turn off",
        tone: "danger",
      });
      if (!ok) return;
    }
    setPendingKey(key);
    mutation.mutate({ key, enabled });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Settings className="w-4 h-4" /> Feature switches
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && (
          <div className="flex justify-center py-4" role="status" aria-label="Loading settings">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="space-y-2 py-2" role="alert">
            <p className="text-xs text-destructive">Couldn't load the switches: {(error as Error).message}</p>
            <Button size="sm" variant="outline" className="h-11 sm:h-8" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        )}
        {data &&
          FEATURE_FLAGS.map((f) => {
            const busy = pendingKey === f.key;
            const labelId = `flag-${f.key}`;
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 min-h-[44px] py-1">
                <div className="min-w-0">
                  <p id={labelId} className="text-sm font-medium">
                    {f.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />}
                  <Switch
                    aria-labelledby={labelId}
                    checked={data[f.key]}
                    disabled={mutation.isPending}
                    onCheckedChange={(v) => void toggle(f.key, v)}
                  />
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
