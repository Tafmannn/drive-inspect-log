import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Search, Filter, ChevronRight, Archive, RotateCcw, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Job } from "@/lib/types";
import { JOB_STATUS } from "@/lib/statusConfig";
import { archiveJob, restoreJob } from "@/lib/api";

const STATUS_OPTIONS = [
  JOB_STATUS.READY_FOR_PICKUP, JOB_STATUS.PICKUP_COMPLETE,
  JOB_STATUS.IN_TRANSIT, JOB_STATUS.DELIVERY_COMPLETE,
  JOB_STATUS.POD_READY, JOB_STATUS.CANCELLED,
];
const STATUS_LABELS: Record<string, string> = {
  [JOB_STATUS.READY_FOR_PICKUP]: "Booked",
  [JOB_STATUS.PICKUP_IN_PROGRESS]: "Pickup In Progress",
  [JOB_STATUS.PICKUP_COMPLETE]: "Pickup Complete",
  [JOB_STATUS.IN_TRANSIT]: "En Route",
  [JOB_STATUS.DELIVERY_IN_PROGRESS]: "Delivery In Progress",
  [JOB_STATUS.DELIVERY_COMPLETE]: "Completed",
  [JOB_STATUS.POD_READY]: "POD Ready",
  [JOB_STATUS.CANCELLED]: "Cancelled",
};
const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

function statusColor(status: string) {
  switch (status) {
    case JOB_STATUS.READY_FOR_PICKUP: return "bg-primary/10 text-primary";
    case JOB_STATUS.IN_TRANSIT: return "bg-warning/10 text-warning";
    case JOB_STATUS.DELIVERY_COMPLETE: case JOB_STATUS.POD_READY: return "bg-success/10 text-success";
    case JOB_STATUS.CANCELLED: return "bg-destructive/10 text-destructive";
    default: return "bg-muted text-muted-foreground";
  }
}

function priorityColor(priority: string | null) {
  switch (priority) {
    case "Urgent": return "bg-destructive/10 text-destructive";
    case "High": return "bg-warning/10 text-warning";
    default: return "bg-muted text-muted-foreground";
  }
}

export function JobMasterList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<Job | null>(null);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs-master", showArchived],
    queryFn: async () => {
      let query = supabase.from("jobs").select("*");
      if (showArchived) {
        query = query.eq("is_hidden", true);
      } else {
        query = query.eq("is_hidden", false);
      }
      query = query.order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Job[];
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (jobId: string) => archiveJob(jobId),
    onSuccess: () => {
      toast({ title: "Job archived" });
      queryClient.invalidateQueries({ queryKey: ["jobs-master"] });
      setConfirmArchive(null);
    },
    onError: (e: any) => toast({ title: "Archive failed", description: e.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (jobId: string) => restoreJob(jobId),
    onSuccess: () => {
      toast({ title: "Job restored" });
      queryClient.invalidateQueries({ queryKey: ["jobs-master"] });
    },
    onError: (e: any) => toast({ title: "Restore failed", description: e.message, variant: "destructive" }),
  });

  const moveJob = useCallback(async (jobId: string, direction: "up" | "down") => {
    if (!jobs) return;
    const idx = jobs.findIndex(j => j.id === jobId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= jobs.length) return;

    const a = jobs[idx];
    const b = jobs[swapIdx];

    // Swap sort_order values
    const aOrder = (a as any).sort_order ?? 0;
    const bOrder = (b as any).sort_order ?? 0;

    await Promise.all([
      supabase.from("jobs").update({ sort_order: bOrder } as any).eq("id", a.id),
      supabase.from("jobs").update({ sort_order: aOrder } as any).eq("id", b.id),
    ]);

    queryClient.invalidateQueries({ queryKey: ["jobs-master"] });
  }, [jobs, queryClient]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    let result = [...jobs];
    if (statusFilter !== "all") result = result.filter(j => j.status === statusFilter);
    if (typeFilter !== "all") result = result.filter(j => j.job_type?.toLowerCase() === typeFilter.toLowerCase());
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(j =>
        j.client_name?.toLowerCase().includes(q) ||
        j.vehicle_reg?.toLowerCase().includes(q) ||
        j.sheet_job_id?.toLowerCase().includes(q) ||
        j.external_job_number?.toLowerCase().includes(q) ||
        j.pickup_city?.toLowerCase().includes(q) ||
        j.delivery_city?.toLowerCase().includes(q)
      );
    }
    // Sort: sort_order first, then date+priority
    result.sort((a, b) => {
      const so = ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0);
      if (so !== 0) return so;
      const dateA = a.job_date || a.created_at;
      const dateB = b.job_date || b.created_at;
      const dateCmp = dateB.localeCompare(dateA);
      if (dateCmp !== 0) return dateCmp;
      return (PRIORITY_ORDER[a.priority ?? "Normal"] ?? 2) - (PRIORITY_ORDER[b.priority ?? "Normal"] ?? 2);
    });
    return result;
  }, [jobs, statusFilter, typeFilter, search]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Job Master" showBack onBack={() => navigate("/")} />
      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground stroke-[2]" />
            <Input placeholder="Search client, reg, city, job ID..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10 min-h-[44px] rounded-lg" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] min-h-[44px] rounded-lg">
              <Filter className="w-4 h-4 mr-1" /><SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant={showArchived ? "default" : "outline"}
            className="min-h-[44px] gap-1"
            onClick={() => setShowArchived(!showArchived)}
          >
            <Archive className="w-4 h-4" />
            {showArchived ? "Showing Archived" : "View Archived"}
          </Button>
        </div>

        <p className="text-[13px] text-muted-foreground">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</p>

        {isLoading ? <DashboardSkeleton /> : filtered.length === 0 ? (
          <p className="text-center py-12 text-[14px] text-muted-foreground">No jobs found.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[13px] w-[70px]">Order</TableHead>
                  <TableHead className="text-[13px]">Date</TableHead>
                  <TableHead className="text-[13px]">Job ID</TableHead>
                  <TableHead className="text-[13px]">Status</TableHead>
                  <TableHead className="text-[13px]">Priority</TableHead>
                  <TableHead className="text-[13px]">Client</TableHead>
                  <TableHead className="text-[13px]">From</TableHead>
                  <TableHead className="text-[13px]">To</TableHead>
                  <TableHead className="text-[13px] text-right">Price</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((job, idx) => (
                  <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div className="flex gap-0.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); moveJob(job.id, "up"); }}>
                          <ArrowUp className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === filtered.length - 1} onClick={(e) => { e.stopPropagation(); moveJob(job.id, "down"); }}>
                          <ArrowDown className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] whitespace-nowrap" onClick={() => navigate(`/jobs/${job.id}`)}>
                      {job.job_date ? new Date(job.job_date).toLocaleDateString("en-GB") : "—"}
                    </TableCell>
                    <TableCell className="text-[13px] font-mono" onClick={() => navigate(`/jobs/${job.id}`)}>
                      {job.sheet_job_id || job.external_job_number || job.id.slice(0, 8)}
                    </TableCell>
                    <TableCell onClick={() => navigate(`/jobs/${job.id}`)}>
                      <Badge variant="outline" className={`text-[13px] ${statusColor(job.status)}`}>{STATUS_LABELS[job.status] || job.status}</Badge>
                    </TableCell>
                    <TableCell onClick={() => navigate(`/jobs/${job.id}`)}>
                      {job.priority && job.priority !== "Normal" && (
                        <Badge variant="outline" className={`text-[13px] ${priorityColor(job.priority)}`}>{job.priority}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px]" onClick={() => navigate(`/jobs/${job.id}`)}>{job.client_name || job.pickup_company || "—"}</TableCell>
                    <TableCell className="text-[13px]" onClick={() => navigate(`/jobs/${job.id}`)}>{job.pickup_city}</TableCell>
                    <TableCell className="text-[13px]" onClick={() => navigate(`/jobs/${job.id}`)}>{job.delivery_city}</TableCell>
                    <TableCell className="text-[13px] text-right font-medium" onClick={() => navigate(`/jobs/${job.id}`)}>
                      {job.total_price != null ? `£${job.total_price.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      {showArchived ? (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={(e) => { e.stopPropagation(); restoreMutation.mutate(job.id); }}>
                          <RotateCcw className="w-3 h-3" /> Restore
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs text-destructive" onClick={(e) => { e.stopPropagation(); setConfirmArchive(job); }}>
                          <Archive className="w-3 h-3" /> Archive
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Archive confirmation dialog */}
      <Dialog open={!!confirmArchive} onOpenChange={() => setConfirmArchive(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Archive Job?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will hide job <strong>{confirmArchive?.external_job_number || confirmArchive?.id?.slice(0, 8)}</strong> from active lists. You can restore it later from the archived view.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => confirmArchive && archiveMutation.mutate(confirmArchive.id)}>
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
}
