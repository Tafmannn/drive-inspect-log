import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Filter, ChevronRight } from "lucide-react";
import type { Job } from "@/lib/types";
import { JOB_STATUS } from "@/lib/statusConfig";

const STATUS_OPTIONS = [
  JOB_STATUS.READY_FOR_PICKUP,
  JOB_STATUS.PICKUP_COMPLETE,
  JOB_STATUS.IN_TRANSIT,
  JOB_STATUS.DELIVERY_COMPLETE,
  JOB_STATUS.POD_READY,
  JOB_STATUS.CANCELLED,
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
const TYPE_OPTIONS = ["Single", "Return", "MultiDrop", "TradePlate"];

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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["jobs-master"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("is_hidden", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Job[];
    },
  });

  const filtered = useMemo(() => {
    if (!jobs) return [];
    let result = [...jobs];

    if (statusFilter !== "all") {
      result = result.filter(j => j.status === statusFilter);
    }
    if (typeFilter !== "all") {
      result = result.filter(j => j.job_type?.toLowerCase() === typeFilter.toLowerCase());
    }
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

    result.sort((a, b) => {
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
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground stroke-[2]" />
            <Input
              placeholder="Search client, reg, city, job ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 min-h-[44px] rounded-lg"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] min-h-[44px] rounded-lg">
              <Filter className="w-4 h-4 mr-1" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_OPTIONS.map(s => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] min-h-[44px] rounded-lg">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TYPE_OPTIONS.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-[13px] text-muted-foreground">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</p>

        {isLoading ? (
          <DashboardSkeleton />
        ) : filtered.length === 0 ? (
          <p className="text-center py-12 text-[14px] text-muted-foreground">No jobs found.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[13px]">Date</TableHead>
                  <TableHead className="text-[13px]">Job ID</TableHead>
                  <TableHead className="text-[13px]">Status</TableHead>
                  <TableHead className="text-[13px]">Priority</TableHead>
                  <TableHead className="text-[13px]">Type</TableHead>
                  <TableHead className="text-[13px]">Client</TableHead>
                  <TableHead className="text-[13px]">From</TableHead>
                  <TableHead className="text-[13px]">To</TableHead>
                  <TableHead className="text-[13px] text-right">Price</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(job => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    <TableCell className="text-[13px] whitespace-nowrap">
                      {job.job_date ? new Date(job.job_date).toLocaleDateString("en-GB") : job.created_at ? new Date(job.created_at).toLocaleDateString("en-GB") : "—"}
                    </TableCell>
                    <TableCell className="text-[13px] font-mono">
                      {job.sheet_job_id || job.external_job_number || job.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[13px] ${statusColor(job.status)}`}>
                        {STATUS_LABELS[job.status] || job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {job.priority && job.priority !== "Normal" && (
                        <Badge variant="outline" className={`text-[13px] ${priorityColor(job.priority)}`}>
                          {job.priority}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px]">{job.job_type || "—"}</TableCell>
                    <TableCell className="text-[13px]">{job.client_name || job.pickup_company || "—"}</TableCell>
                    <TableCell className="text-[13px]">{job.pickup_city}</TableCell>
                    <TableCell className="text-[13px]">{job.delivery_city}</TableCell>
                    <TableCell className="text-[13px] text-right font-medium">
                      {job.total_price != null ? `£${job.total_price.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
