/**
 * Run Order — admin-only reordering of a driver's active job list.
 *
 * Pick a driver, arrange their active jobs with up/down controls, save.
 * Persists jobs.route_order (1..N); the driver app's ranking treats a set
 * route_order as the top sort criterion, so the driver sees jobs in
 * exactly this order. Jobs UPDATE RLS is already admin-only, so drivers
 * cannot write this column themselves.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { invalidateForEvent } from "@/lib/mutationEvents";
import { ACTIVE_STATUSES } from "@/lib/statusConfig";
import { ArrowDown, ArrowUp, GripVertical, Loader2, ListOrdered } from "lucide-react";

interface RunOrderJob {
  id: string;
  external_job_number: string | null;
  vehicle_reg: string;
  pickup_city: string;
  delivery_city: string;
  status: string;
  route_order: number | null;
  job_date: string | null;
  created_at: string;
}

interface DriverRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
}

export function RunOrderModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<RunOrderJob[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: drivers } = useQuery({
    queryKey: ["run-order-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_profiles")
        .select("id, full_name, display_name")
        .eq("is_active", true)
        .is("archived_at", null)
        .order("full_name", { ascending: true })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as DriverRow[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["run-order-jobs", driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, external_job_number, vehicle_reg, pickup_city, delivery_city, status, route_order, job_date, created_at")
        .eq("is_hidden", false)
        .eq("driver_id", driverId as string)
        .in("status", ACTIVE_STATUSES as string[])
        .order("route_order", { ascending: true, nullsFirst: false })
        .order("job_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RunOrderJob[];
    },
    enabled: open && !!driverId,
  });

  // Seed the editable list whenever a fresh fetch lands.
  useEffect(() => {
    setOrdered(jobs ?? []);
  }, [jobs]);

  const driverLabel = useMemo(() => {
    const d = drivers?.find((d) => d.id === driverId);
    return d?.display_name || d?.full_name || "driver";
  }, [drivers, driverId]);

  const move = (index: number, delta: -1 | 1) => {
    setOrdered((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (!ordered.length) return;
    setSaving(true);
    try {
      // Positions are 1..N in the arranged order. Sequential updates keep
      // this dependency-free; N is small (a driver's active queue).
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase
          .from("jobs")
          .update({ route_order: i + 1 })
          .eq("id", ordered[i].id);
        if (error) throw error;
      }
      invalidateForEvent(queryClient, "job_status_changed");
      queryClient.invalidateQueries({ queryKey: ["run-order-jobs", driverId] });
      toast({
        title: "Run order saved",
        description: `${ordered.length} job${ordered.length !== 1 ? "s" : ""} sequenced for ${driverLabel}.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Couldn't save run order",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Driver Run Order
          </DialogTitle>
          <DialogDescription>
            Arrange the driver's active jobs in the order they should be done.
            The driver's job list follows this order.
          </DialogDescription>
        </DialogHeader>

        <Select value={driverId ?? undefined} onValueChange={(v) => setDriverId(v)}>
          <SelectTrigger className="min-h-[44px]">
            <SelectValue placeholder="Select a driver" />
          </SelectTrigger>
          <SelectContent>
            {(drivers ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.display_name || d.full_name || d.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {driverId && (
          <div className="space-y-2 max-h-[45vh] overflow-y-auto">
            {jobsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : ordered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No active jobs assigned to this driver.
              </p>
            ) : (
              ordered.map((job, i) => (
                <div
                  key={job.id}
                  className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {i + 1}
                  </span>
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {job.external_job_number || job.id.slice(0, 8)} · {job.vehicle_reg}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {job.pickup_city} → {job.delivery_city}
                    </p>
                  </div>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`Move job ${job.external_job_number || job.id.slice(0, 8)} up`}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={i === ordered.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`Move job ${job.external_job_number || job.id.slice(0, 8)} down`}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || ordered.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
