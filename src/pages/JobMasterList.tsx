import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Filter, ChevronRight } from "lucide-react";
import type { Job } from "@/lib/types";

const STATUS_OPTIONS = ["ready_for_pickup", "pickup_complete", "in_transit", "delivery_complete", "pod_ready", "cancelled"];
const STATUS_LABELS: Record<string, string> = {
  ready_for_pickup: "Booked",
  pickup_in_progress: "Pickup In Progress",
  pickup_complete: "Pickup Complete",
  in_transit: "En Route",
  delivery_in_progress: "Delivery In Progress",
  delivery_complete: "Completed",
  pod_ready: "POD Ready",
  cancelled: "Cancelled",
};
const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
const TYPE_OPTIONS = ["Single", "Return", "MultiDrop", "TradePlate"];

function statusColor(status: string) {
  switch (status) {
    case "ready_for_pickup": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "in_transit": return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "delivery_complete": case "pod_ready": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    default: return "bg-muted text-muted-foreground";
  }
}

function priorityColor(priority: string | null) {
  switch (priority) {
    case "Urgent": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "High": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
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

    // Sort: job_date DESC, then priority
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
    <div className="min-h-screen bg-background">
      <AppHeader title="Jobs" showBack onBack={() => navigate("/")} />

      <div className="p-4 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search client, reg, city, job ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-1" />
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
            <SelectTrigger className="w-[140px]">
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

        {/* Results count */}
        <p className="text-xs text-muted-foreground">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</p>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center py-12 text-muted-foreground">No jobs found.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Job ID</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Priority</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">From</TableHead>
                  <TableHead className="text-xs">To</TableHead>
                  <TableHead className="text-xs text-right">Price</TableHead>
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
                    <TableCell className="text-xs whitespace-nowrap">
                      {job.job_date ? new Date(job.job_date).toLocaleDateString("en-GB") : job.created_at ? new Date(job.created_at).toLocaleDateString("en-GB") : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {job.sheet_job_id || job.external_job_number || job.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColor(job.status)}`}>
                        {STATUS_LABELS[job.status] || job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {job.priority && job.priority !== "Normal" && (
                        <Badge variant="outline" className={`text-xs ${priorityColor(job.priority)}`}>
                          {job.priority}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{job.job_type || "—"}</TableCell>
                    <TableCell className="text-xs">{job.client_name || job.pickup_company || "—"}</TableCell>
                    <TableCell className="text-xs">{job.pickup_city}</TableCell>
                    <TableCell className="text-xs">{job.delivery_city}</TableCell>
                    <TableCell className="text-xs text-right font-medium">
                      {job.total_price != null ? `£${job.total_price.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
