/**
 * Control Centre — Invoice Preparation (Read-Only Preview)
 *
 * Flow:
 *   1. Select a client profile
 *   2. View eligible completed/uninvoiced jobs for that client
 *   3. Checkbox multi-select jobs
 *   4. Preview subtotal, VAT, total, receipt count
 *   5. Validation warnings for issues
 *
 * Does NOT create invoice records — read-only preview only.
 */
import { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  ControlShell,
  ControlHeader,
  ControlSection,
} from "../../control/components/shared/ControlShell";
import { KpiStrip, type KpiItem } from "../../control/components/shared/KpiStrip";
import { FilterBar } from "../../control/components/shared/FilterBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientPickerCombobox } from "@/features/clients/components/ClientPickerCombobox";
import {
  useEligibleJobs,
  computePreviewTotals,
  type EligibleJob,
} from "../hooks/useInvoicePrepData";
import { useCreateInvoice } from "../hooks/useCreateInvoice";
import { useClients } from "@/hooks/useClients";
import { useAuth } from "@/context/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  FileText,
  Receipt,
  AlertTriangle,
  CalendarIcon,
  PoundSterling,
  Hash,
  Truck,
  CheckCircle2,
  Building2,
  Loader2,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmtGbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export function InvoicePrepScreen() {
  // Client selection
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { data: allClients } = useClients();
  const selectedClient = useMemo(
    () => allClients?.find((c) => c.id === selectedClientId) ?? null,
    [allClients, selectedClientId]
  );

  // Date filters
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Job selection
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());

  // VAT rate
  const [vatRate, setVatRate] = useState(20);

  // Auth & invoice creation
  const { user } = useAuth();
  const createInvoice = useCreateInvoice();
  const [createdInvoiceNumber, setCreatedInvoiceNumber] = useState<string | null>(null);

  // Fetch eligible jobs
  const { data: eligibleJobs, isLoading } = useEligibleJobs(selectedClient, {
    dateFrom: dateFrom?.toISOString(),
    dateTo: dateTo?.toISOString(),
  });

  const jobs = eligibleJobs ?? [];

  // Selected jobs for preview
  const selectedJobs = useMemo(
    () => jobs.filter((j) => selectedJobIds.has(j.id)),
    [jobs, selectedJobIds]
  );

  // Compute totals
  const preview = useMemo(
    () => computePreviewTotals(selectedJobs, vatRate),
    [selectedJobs, vatRate]
  );

  // Toggle helpers
  const toggleJob = (id: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedJobIds.size === jobs.length) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(jobs.map((j) => j.id)));
    }
  };

  // Reset selection when client changes
  const handleClientChange = (id: string | null) => {
    setSelectedClientId(id);
    setSelectedJobIds(new Set());
    setCreatedInvoiceNumber(null);
  };

  // Create invoice handler
  const handleCreateInvoice = async () => {
    if (!selectedClient || selectedJobs.length === 0) return;
    // Get org_id from the user's metadata
    const { data: { user: authUser } } = await (await import("@/integrations/supabase/client")).supabase.auth.getUser();
    const orgId = authUser?.app_metadata?.org_id || authUser?.user_metadata?.org_id;
    if (!orgId) {
      toast({ title: "Error", description: "Unable to determine organisation.", variant: "destructive" });
      return;
    }

    try {
      const result = await createInvoice.mutateAsync({
        client: selectedClient,
        jobs: selectedJobs,
        vatRate,
        orgId,
      });
      setCreatedInvoiceNumber(result.invoiceNumber);
      setSelectedJobIds(new Set());
      toast({
        title: "Invoice Created",
        description: `${result.invoiceNumber} — ${result.jobCount} job${result.jobCount !== 1 ? "s" : ""} invoiced.`,
      });
    } catch (err: any) {
      toast({
        title: "Invoice Creation Failed",
        description: err.message || "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  // KPIs
  const kpis: KpiItem[] = [
    {
      label: "Selected Jobs",
      value: preview.jobCount,
      icon: Truck,
      variant: preview.jobCount > 0 ? "info" : "default",
    },
    {
      label: "Subtotal",
      value: fmtGbp(preview.subtotal),
      icon: PoundSterling,
      variant: "default",
    },
    {
      label: `VAT (${vatRate}%)`,
      value: fmtGbp(preview.vatAmount),
      icon: Hash,
      variant: "default",
    },
    {
      label: "Total",
      value: fmtGbp(preview.total),
      icon: PoundSterling,
      variant: preview.total > 0 ? "success" : "default",
    },
    {
      label: "Receipts",
      value: preview.receiptCount,
      icon: Receipt,
      variant: preview.receiptCount > 0 ? "info" : "default",
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Invoice Preparation"
        subtitle="Select a client and review eligible jobs for invoicing"
      />

      {/* Step 1: Client selection */}
      <ControlSection title="1. Select Client" description="Choose a billing client profile">
        <div className="max-w-md">
          <ClientPickerCombobox
            value={selectedClientId}
            onSelect={handleClientChange}
          />
        </div>
        {selectedClient && (
          <div className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
            <Building2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-foreground">{selectedClient.name}</p>
              {selectedClient.company && (
                <p className="text-muted-foreground">{selectedClient.company}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                {selectedClient.email && <span>{selectedClient.email}</span>}
                {selectedClient.phone && <span>{selectedClient.phone}</span>}
              </div>
              {selectedClient.address && (
                <p className="text-xs text-muted-foreground mt-1">{selectedClient.address}</p>
              )}
            </div>
          </div>
        )}
      </ControlSection>

      {/* Step 2: Filters & Job list */}
      {selectedClient && (
        <>
          <FilterBar>
            <div className="flex items-center gap-2 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd MMM yy") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd MMM yy") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setDateFrom(undefined);
                    setDateTo(undefined);
                  }}
                >
                  Clear dates
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {jobs.length} eligible job{jobs.length !== 1 ? "s" : ""}
              </span>
            </div>
          </FilterBar>

          <ControlSection
            title="2. Select Jobs"
            description="Completed, uninvoiced jobs for this client"
            flush
          >
            {isLoading ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Loading eligible jobs…
              </div>
            ) : jobs.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No eligible jobs found for this client.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            jobs.length > 0 && selectedJobIds.size === jobs.length
                          }
                          onCheckedChange={toggleAll}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider">
                        Job
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider">
                        Vehicle
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider">
                        Completed
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">
                        Price
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">
                        Receipts
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map((job) => (
                      <TableRow
                        key={job.id}
                        className={cn(
                          "cursor-pointer transition-colors",
                          selectedJobIds.has(job.id)
                            ? "bg-primary/5 hover:bg-primary/10"
                            : "hover:bg-muted/50"
                        )}
                        onClick={() => toggleJob(job.id)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedJobIds.has(job.id)}
                            onCheckedChange={() => toggleJob(job.id)}
                            aria-label={`Select job ${job.external_job_number || job.id.slice(0, 8)}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground">
                              {job.external_job_number || job.id.slice(0, 8)}
                            </span>
                            <Badge
                              variant="outline"
                              className="ml-2 text-[9px] text-success border-success/30 bg-success/5"
                            >
                              {job.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-foreground">
                            {job.vehicle_reg}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1.5">
                            {job.vehicle_make} {job.vehicle_model}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {shortDate(job.completed_at)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {job.total_price ? (
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {fmtGbp(job.total_price)}
                            </span>
                          ) : (
                            <span className="text-xs text-warning font-medium">
                              No price
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {job.receiptCount ?? 0}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </ControlSection>
        </>
      )}

      {/* Step 3: Preview totals */}
      {selectedJobs.length > 0 && (
        <>
          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div className="space-y-2">
              {preview.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-warning/30 bg-warning/5"
                >
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning font-medium">{w}</p>
                </div>
              ))}
            </div>
          )}

          <KpiStrip items={kpis} className="grid-cols-2 lg:grid-cols-5" />

          <ControlSection title="3. Invoice Preview" description="Read-only summary of selected jobs">
            <div className="space-y-3">
              {/* Line items */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider">
                        Description
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">
                        Amount
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedJobs.map((j) => (
                      <TableRow key={j.id}>
                        <TableCell>
                          <div>
                            <span className="text-sm text-foreground font-medium">
                              Vehicle transport — {j.vehicle_reg}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({j.vehicle_make} {j.vehicle_model})
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Job {j.external_job_number || j.id.slice(0, 8)}
                            {j.distance_miles
                              ? ` · ${j.distance_miles} miles`
                              : ""}
                            {j.completed_at
                              ? ` · Completed ${shortDate(j.completed_at)}`
                              : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold tabular-nums">
                            {j.total_price ? fmtGbp(j.total_price) : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-2 max-w-xs ml-auto">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold tabular-nums">{fmtGbp(preview.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    VAT
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={vatRate}
                      onChange={(e) => setVatRate(Math.max(0, Number(e.target.value)))}
                      className="w-16 h-6 text-xs text-center inline-block"
                    />
                    <span className="text-xs">%</span>
                  </span>
                  <span className="font-semibold tabular-nums">{fmtGbp(preview.vatAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary tabular-nums">{fmtGbp(preview.total)}</span>
                </div>
              </div>

              {/* Info strip */}
              <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {preview.jobCount} job{preview.jobCount !== 1 ? "s" : ""}
                </div>
                <div className="flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5" />
                  {preview.receiptCount} receipt{preview.receiptCount !== 1 ? "s" : ""}
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  Read-only preview
                </div>
              </div>
            </div>
          </ControlSection>
        </>
      )}
    </ControlShell>
  );
}
