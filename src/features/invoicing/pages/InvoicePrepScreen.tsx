/**
 * Control Centre — Invoice Preparation
 *
 * Flow:
 *   1. Select a client profile
 *   2. Tick that client's completed, un-invoiced jobs
 *   3. Tick which of those jobs' expenses to recharge (fuel is pre-ticked)
 *   4. Review the invoice — one line per job (transport + its expenses) —
 *      add the client's PO, preview the PDF, and create it
 *   5. Download, email, mark as sent / paid, or cancel any invoice
 *
 * VAT follows the business-level switch (organisations.vat_registered):
 * while it is off, no VAT is charged and none appears on the invoice.
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
import { Label } from "@/components/ui/label";
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
import { useEligibleJobs, type EligibleJob } from "../hooks/useInvoicePrepData";
import { useCreateInvoice } from "../hooks/useCreateInvoice";
import { useInvoices, type InvoiceRecord } from "../hooks/useInvoices";
import { useBillableExpenses, useOrgInvoiceSettings } from "../hooks/useInvoiceSettings";
import { useInvoiceActions } from "../hooks/useInvoiceActions";
import { ExpensePicker } from "../components/ExpensePicker";
import { InvoiceList, InvoiceStatusBadge } from "../components/InvoiceList";
import { DEFAULT_RECHARGE_CATEGORIES } from "../api/billableExpenses";
import { loadReceiptImage } from "../api/receiptImages";
import { receiptCaption, receiptFileRef } from "../api/invoiceDocument";
import { downloadBlob } from "../api/receiptExport";
import {
  buildInvoiceDraft,
  DEFAULT_VAT_RATE,
  dueDateFor,
  jobRef,
  jobsHeaderSubtitle,
  paymentTermsLabel,
  type InvoiceDraft,
} from "../lib/invoiceMath";
import type { Client } from "@/lib/clientApi";
import { WarningCallout, RoleScope } from "@/components/ui-kit";
import { useClients } from "@/hooks/useClients";
import { useEvidenceOverrides } from "@/hooks/useEvidenceOverrides";
import { toast } from "@/hooks/use-toast";
import {
  FileText,
  Receipt,
  CalendarIcon,
  PoundSterling,
  Hash,
  Truck,
  CheckCircle2,
  Building2,
  Loader2,
  Send,
  Download,
  Package,
  Mail,
  Eye,
} from "lucide-react";
import { generateInvoicePdf, type InvoiceData, type ReceiptImage } from "@/lib/invoicePdf";
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

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The invoice row exactly as createMultiJobInvoice wrote it, without a refetch. */
function draftToRecord(args: {
  invoiceId: string;
  invoiceNumber: string;
  orgId: string;
  client: Client;
  clientRef: string;
  issueDate: string;
  dueDate: string | null;
  paymentTerms: string | null;
  vatRegistered: boolean;
  draft: InvoiceDraft;
}): InvoiceRecord {
  const { client, draft } = args;
  return {
    id: args.invoiceId,
    org_id: args.orgId,
    client_id: client.id,
    invoice_number: args.invoiceNumber,
    client_name: client.name,
    client_company: client.company ?? null,
    client_email: client.billing_email || client.email || null,
    client_address: client.billing_address || client.address || null,
    client_ref: args.clientRef || null,
    issue_date: args.issueDate,
    due_date: args.dueDate,
    payment_terms: args.paymentTerms,
    line_items: draft.lineItems,
    subtotal: draft.subtotal,
    expenses_total: draft.expensesTotal,
    vat_registered: args.vatRegistered,
    vat_rate: draft.vatRate,
    vat_amount: draft.vatAmount,
    total: draft.total,
    notes: null,
    status: "draft",
    document_type: "invoice",
    created_at: new Date().toISOString(),
  };
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

  // Business-level invoice settings: the VAT switch + footer identity.
  const { data: settings, isLoading: settingsLoading } = useOrgInvoiceSettings();
  const vatRegistered = settings?.vatRegistered === true;
  // Only used while VAT registered.
  const [vatRate, setVatRate] = useState(DEFAULT_VAT_RATE);

  // Client's PO / reference for this invoice
  const [clientRef, setClientRef] = useState("");

  const createInvoice = useCreateInvoice();
  // The invoice that was just created. Job selection is cleared after
  // creation (the jobs stop being eligible), so the success card works from
  // this record — replaced by the live list row once that has refreshed.
  const [createdInvoice, setCreatedInvoice] = useState<InvoiceRecord | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Every invoice + credit note (re-downloadable at any time)
  const { data: recentInvoices, isLoading: invoicesLoading } = useInvoices(50);
  const { actions, isBusy, dialogs } = useInvoiceActions(settings);

  // Fetch eligible jobs
  const { data: eligibleJobs, isLoading } = useEligibleJobs(selectedClient, {
    dateFrom: dateFrom?.toISOString(),
    dateTo: dateTo?.toISOString(),
  });

  const jobs = useMemo(() => eligibleJobs ?? [], [eligibleJobs]);

  const selectedJobs = useMemo(
    () => jobs.filter((j) => selectedJobIds.has(j.id)),
    [jobs, selectedJobIds]
  );
  const selectedJobIdList = useMemo(() => selectedJobs.map((j) => j.id), [selectedJobs]);

  // Expenses that can be recharged for the selected jobs. Fuel is ticked by
  // default; an explicit tick/untick by the admin always wins.
  const { data: billableExpenses, isLoading: expensesLoading } = useBillableExpenses(selectedJobIdList);
  const [expenseOverrides, setExpenseOverrides] = useState<Map<string, boolean>>(new Map());
  const expenses = useMemo(() => billableExpenses ?? [], [billableExpenses]);
  const selectedExpenseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of expenses) {
      const picked = expenseOverrides.get(e.id) ?? DEFAULT_RECHARGE_CATEGORIES.includes(e.category);
      if (picked) ids.add(e.id);
    }
    return ids;
  }, [expenses, expenseOverrides]);
  const selectedExpenses = useMemo(
    () => expenses.filter((e) => selectedExpenseIds.has(e.id)),
    [expenses, selectedExpenseIds]
  );
  const setExpensesSelected = (ids: string[], selected: boolean) =>
    setExpenseOverrides((prev) => {
      const next = new Map(prev);
      ids.forEach((id) => next.set(id, selected));
      return next;
    });

  // The invoice as it will be created
  const draft = useMemo(
    () => buildInvoiceDraft({ jobs: selectedJobs, expenses: selectedExpenses, vatRegistered, vatRate }),
    [selectedJobs, selectedExpenses, vatRegistered, vatRate]
  );

  const warnings = useMemo(() => {
    const list: string[] = [];
    const noPrice = selectedJobs.filter((j) => !j.total_price || j.total_price <= 0).length;
    if (noPrice > 0) list.push(`${noPrice} job(s) have no price set — total may be inaccurate.`);
    return list;
  }, [selectedJobs]);

  const poMissing = !!selectedClient?.po_required && !clientRef.trim();

  // Admin override (UI-only): allow selecting jobs that are not invoice-ready.
  // Acknowledgements are scoped to this Invoice Prep screen and persist for
  // the session. Already-invoiced rows can never be overridden.
  const invoiceOverrides = useEvidenceOverrides("invoice-prep");
  const isOverridden = (jobId: string) => invoiceOverrides.isAcknowledged(jobId);

  const isJobSelectable = (job: EligibleJob) => {
    if (job.readiness?.alreadyInvoiced) return false;
    if (job.readiness?.ready) return true;
    return isOverridden(job.id);
  };

  // Toggle helpers
  const toggleJob = (id: string) => {
    const job = jobs.find((j) => j.id === id);
    if (job && !isJobSelectable(job)) return;
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const selectable = jobs.filter(isJobSelectable);
    if (selectedJobIds.size === selectable.length && selectable.length > 0) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(selectable.map((j) => j.id)));
    }
  };

  // Reset selection when client changes
  const handleClientChange = (id: string | null) => {
    setSelectedClientId(id);
    setSelectedJobIds(new Set());
    setExpenseOverrides(new Map());
    setClientRef("");
    setCreatedInvoice(null);
  };

  // Create invoice handler
  const handleCreateInvoice = async () => {
    if (!selectedClient || selectedJobs.length === 0 || !settings) return;
    if (poMissing) {
      toast({
        title: "PO / reference required",
        description: `${selectedClient.company || selectedClient.name} needs a PO or reference on every invoice.`,
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await createInvoice.mutateAsync({
        client: selectedClient,
        jobs: selectedJobs,
        expenses: selectedExpenses,
        vatRegistered,
        vatRate,
        // org_id comes from the authoritative source (app_metadata /
        // user_profiles) via useOrgInvoiceSettings, never user_metadata.
        orgId: settings.orgId,
        clientRef,
      });
      setCreatedInvoice(
        draftToRecord({
          invoiceId: result.invoiceId,
          invoiceNumber: result.invoiceNumber,
          orgId: settings.orgId,
          client: selectedClient,
          clientRef: clientRef.trim(),
          issueDate: result.issueDate,
          dueDate: result.dueDate,
          paymentTerms: result.paymentTerms,
          vatRegistered,
          draft: result.draft,
        })
      );
      setSelectedJobIds(new Set());
      setExpenseOverrides(new Map());
      setClientRef("");
      const expenseCount = result.draft.expenseLines.length;
      toast({
        title: "Invoice Created",
        description:
          `${result.invoiceNumber} — ${result.jobCount} job${result.jobCount !== 1 ? "s" : ""}` +
          (expenseCount ? ` + ${expenseCount} expense${expenseCount !== 1 ? "s" : ""}` : "") +
          " invoiced.",
      });
    } catch (err) {
      toast({
        title: "Invoice Creation Failed",
        description: err instanceof Error && err.message ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  // Preview the invoice PDF (with receipt copies) before creating anything.
  const handlePreviewPdf = async () => {
    if (!selectedClient || selectedJobs.length === 0) return;
    setIsPreviewing(true);
    try {
      const issueDate = todayIso();
      const jobRefs = new Map(selectedJobs.map((j) => [j.id, jobRef(j)]));
      const receipts: ReceiptImage[] = [];
      for (const line of draft.expenseLines) {
        const files = line.receipts.length ? line.receipts : [null];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          receipts.push({
            ref: receiptFileRef(line.ref, i),
            caption: receiptCaption(line, jobRefs.get(line.job_id) ?? ""),
            image: file ? await loadReceiptImage(file) : null,
          });
        }
      }
      const data: InvoiceData = {
        invoiceNumber: "PREVIEW",
        issueDate,
        dueDate: dueDateFor(issueDate, selectedClient.payment_terms) ?? undefined,
        paymentTerms: paymentTermsLabel(selectedClient.payment_terms),
        clientName: selectedClient.name,
        clientCompany: selectedClient.company || undefined,
        clientEmail: selectedClient.billing_email || selectedClient.email || undefined,
        clientAddress: selectedClient.billing_address || selectedClient.address || undefined,
        clientRef: clientRef.trim() || undefined,
        vatRegistered,
        vatRate: draft.vatRate,
        compactFooter: true,
        headerSubtitle: jobsHeaderSubtitle(
          draft.lineItems.map((l) => l.job_date),
          draft.lineItems.length
        ),
        business: settings?.business,
        lineItems: draft.lineItems.map((l) => ({
          description: l.description,
          quantity: 1,
          unitPrice: l.amount,
          ...(l.detail ? { detail: l.detail, expenseAmount: l.expense_amount } : {}),
        })),
        expenseSchedule: draft.expenseLines.map((l) => ({
          ref: l.ref,
          date: l.expense_date,
          jobRef: jobRefs.get(l.job_id) ?? "-",
          vehicleReg: selectedJobs.find((j) => j.id === l.job_id)?.vehicle_reg,
          category: l.category,
          supplier: l.supplier ?? undefined,
          net: l.amount_charged,
          vat: l.amount_vat,
          gross: l.amount_gross,
        })),
        receipts,
        receiptsPerPage: 6,
      };
      downloadBlob(await generateInvoicePdf(data), "invoice_PREVIEW.pdf");
    } catch (err) {
      toast({
        title: "Preview Failed",
        description: err instanceof Error && err.message ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  // The success card follows the live row once the list has it (so its
  // status and actions stay correct after emailing / marking as sent).
  const createdRecord = createdInvoice
    ? recentInvoices?.find((i) => i.id === createdInvoice.id) ?? createdInvoice
    : null;

  // KPIs
  const kpis: KpiItem[] = [
    {
      label: "Selected Jobs",
      value: selectedJobs.length,
      icon: Truck,
      variant: selectedJobs.length > 0 ? "info" : "default",
    },
    {
      label: "Transport",
      value: fmtGbp(draft.transportTotal),
      icon: PoundSterling,
      variant: "default",
    },
    {
      label: "Expenses",
      value: fmtGbp(draft.expensesTotal),
      icon: Receipt,
      variant: draft.expensesTotal > 0 ? "info" : "default",
    },
    ...(vatRegistered
      ? [{ label: `VAT (${draft.vatRate}%)`, value: fmtGbp(draft.vatAmount), icon: Hash, variant: "default" as const }]
      : []),
    {
      label: "Total",
      value: fmtGbp(draft.total),
      icon: PoundSterling,
      variant: draft.total > 0 ? "success" : "default",
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Invoice Preparation"
        subtitle="Select a client, tick jobs and expenses, and raise one invoice"
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
                            jobs.filter(isJobSelectable).length > 0 &&
                            selectedJobIds.size === jobs.filter(isJobSelectable).length
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
                            disabled={!isJobSelectable(job)}
                            onCheckedChange={() => toggleJob(job.id)}
                            aria-label={`Select job ${job.external_job_number || job.id.slice(0, 8)}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="min-w-0 flex items-center flex-wrap gap-1.5">
                            <span className="text-sm font-medium text-foreground">
                              {job.external_job_number || job.id.slice(0, 8)}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px]",
                                job.readiness?.alreadyInvoiced
                                  ? "text-muted-foreground border-muted-foreground/30 bg-muted/40"
                                  : job.readiness?.ready
                                  ? "text-success border-success/30 bg-success/5"
                                  : isOverridden(job.id)
                                  ? "text-primary border-primary/30 bg-primary/5"
                                  : "text-destructive border-destructive/30 bg-destructive/5",
                              )}
                              title={job.readiness?.primaryReason}
                            >
                              {isOverridden(job.id) && !job.readiness?.ready
                                ? `Override · ${job.readiness?.primaryReason ?? "blocked"}`
                                : job.readiness?.primaryReason ?? job.status.replace(/_/g, " ")}
                            </Badge>
                            {!job.readiness?.ready && !job.readiness?.alreadyInvoiced && (
                              <RoleScope admin>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isOverridden(job.id) ? "ghost" : "outline"}
                                  className="h-6 px-2 text-[10px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isOverridden(job.id)) {
                                      invoiceOverrides.unacknowledge(job.id);
                                      setSelectedJobIds((prev) => {
                                        const next = new Set(prev);
                                        next.delete(job.id);
                                        return next;
                                      });
                                    } else {
                                      invoiceOverrides.acknowledge(job.id);
                                    }
                                  }}
                                  aria-label={
                                    isOverridden(job.id)
                                      ? `Remove override for job ${job.external_job_number || job.id.slice(0, 8)}`
                                      : `Override readiness for job ${job.external_job_number || job.id.slice(0, 8)}`
                                  }
                                >
                                  {isOverridden(job.id) ? "Undo override" : "Override"}
                                </Button>
                              </RoleScope>
                            )}
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


      {/* Created-invoice success card — independent of job selection, which
          is cleared on creation. This is where the invoice gets downloaded. */}
      {createdRecord && (
        <div className="p-4 rounded-lg border border-success/30 bg-success/5 space-y-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
            <div>
              <p className="flex flex-wrap items-center gap-2 text-sm text-foreground font-semibold">
                Invoice {createdRecord.invoice_number} created
                <InvoiceStatusBadge invoice={createdRecord} />
              </p>
              <p className="text-xs text-muted-foreground">
                {createdRecord.client_company || createdRecord.client_name} ·{" "}
                {fmtGbp(Number(createdRecord.total ?? 0))}
                {createdRecord.status === "draft" &&
                  " · Email it, or mark it as sent once you have delivered it — that locks the invoice."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => actions.downloadPdf(createdRecord)}
              disabled={isBusy(createdRecord)}
              size="sm"
              className="gap-1.5"
            >
              {isBusy(createdRecord, "pdf") ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download Invoice PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.downloadPack(createdRecord)}
              disabled={isBusy(createdRecord)}
              className="gap-1.5"
            >
              {isBusy(createdRecord, "pack") ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Package className="h-4 w-4" />
              )}
              Download Pack (PDF + Receipt Files)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.email(createdRecord)}
              disabled={isBusy(createdRecord)}
              className="gap-1.5"
            >
              <Mail className="h-4 w-4" />
              Email Invoice
            </Button>
            {createdRecord.status === "draft" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.markSent(createdRecord)}
                disabled={isBusy(createdRecord)}
                className="gap-1.5"
              >
                {isBusy(createdRecord, "sent") ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Mark as Sent
              </Button>
            )}
          </div>
        </div>
      )}

      {selectedJobs.length > 0 && (
        <>
          {/* Step 3: Rechargeable expenses */}
          <ControlSection
            title="3. Rechargeable Expenses"
            description="Tick the expenses to bill on this invoice. Only ticked expenses and their receipts are included."
            flush
          >
            <ExpensePicker
              jobs={selectedJobs}
              expenses={expenses}
              selectedIds={selectedExpenseIds}
              vatRegistered={vatRegistered}
              isLoading={expensesLoading}
              onToggle={(id, selected) => setExpensesSelected([id], selected)}
              onSetMany={setExpensesSelected}
            />
          </ControlSection>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-1.5">
              {warnings.map((w, i) => (
                <WarningCallout key={i} severity="warning">
                  {w}
                </WarningCallout>
              ))}
            </div>
          )}

          <KpiStrip items={kpis} className={vatRegistered ? "grid-cols-2 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4"} />

          {/* Step 4: Invoice preview */}
          <ControlSection title="4. Invoice Preview" description="One line per job: transport plus its ticked expenses">
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider">
                        Job / Description
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">
                        Transport
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">
                        Expenses
                      </TableHead>
                      <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">
                        Total
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draft.lineItems.map((line) => (
                      <TableRow key={line.job_id}>
                        <TableCell>
                          <span className="text-sm text-foreground font-medium">{line.description}</span>
                          {line.detail && (
                            <div className="text-xs text-muted-foreground mt-0.5">{line.detail}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {line.amount ? fmtGbp(line.amount) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                          {line.expense_amount ? fmtGbp(line.expense_amount) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm font-semibold tabular-nums">
                            {fmtGbp(line.amount + (line.expense_amount ?? 0))}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />

              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                {/* Client reference */}
                <div className="w-full max-w-xs space-y-1.5">
                  <Label htmlFor="invoice-client-ref" className="text-xs">
                    Client PO / reference{selectedClient?.po_required ? " (required)" : " (optional)"}
                  </Label>
                  <Input
                    id="invoice-client-ref"
                    value={clientRef}
                    onChange={(e) => setClientRef(e.target.value)}
                    placeholder="e.g. PO-4500123"
                    maxLength={60}
                    aria-invalid={poMissing}
                    className={cn("h-8 text-sm", poMissing && "border-destructive")}
                  />
                  {poMissing && (
                    <p className="text-xs text-destructive">
                      This client needs a PO or reference on every invoice.
                    </p>
                  )}
                </div>

                {/* Totals */}
                <div className="space-y-2 w-full max-w-xs sm:ml-auto">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Transport</span>
                    <span className="tabular-nums">{fmtGbp(draft.transportTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rechargeable expenses</span>
                    <span className="tabular-nums">{fmtGbp(draft.expensesTotal)}</span>
                  </div>
                  {vatRegistered ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-semibold tabular-nums">{fmtGbp(draft.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <label htmlFor="invoice-vat-rate">VAT</label>
                          <Input
                            id="invoice-vat-rate"
                            type="number"
                            min={0}
                            max={100}
                            value={vatRate}
                            onChange={(e) => setVatRate(Math.min(100, Math.max(0, Number(e.target.value))))}
                            className="w-16 h-6 text-xs text-center inline-block"
                          />
                          <span className="text-xs">%</span>
                        </span>
                        <span className="font-semibold tabular-nums">{fmtGbp(draft.vatAmount)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {settingsLoading
                        ? "Checking VAT status…"
                        : "Not VAT registered — no VAT is charged. Turn this on in the organisation profile when you register."}
                    </p>
                  )}
                  <Separator />
                  <div className="flex justify-between text-base font-bold">
                    <span>{vatRegistered ? "Total" : "Total due"}</span>
                    <span className="text-primary tabular-nums">{fmtGbp(draft.total)}</span>
                  </div>
                </div>
              </div>

              {/* Info strip + actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {selectedJobs.length} job{selectedJobs.length !== 1 ? "s" : ""}
                  </div>
                  <div className="flex items-center gap-1">
                    <Receipt className="h-3.5 w-3.5" />
                    {draft.expenseLines.length} expense{draft.expenseLines.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handlePreviewPdf}
                    disabled={isPreviewing || expensesLoading}
                    className="gap-2"
                  >
                    {isPreviewing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Preview PDF
                  </Button>
                  <Button
                    onClick={handleCreateInvoice}
                    disabled={
                      createInvoice.isPending ||
                      selectedJobs.length === 0 ||
                      expensesLoading ||
                      settingsLoading ||
                      !settings
                    }
                    className="gap-2"
                  >
                    {createInvoice.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Create Invoice
                  </Button>
                </div>
              </div>
            </div>
          </ControlSection>
        </>
      )}

      {/* Every invoice and credit note, with status + actions */}
      <ControlSection
        title="Invoices"
        description="Download, email, record payment for, or cancel any invoice"
        flush
      >
        <InvoiceList
          invoices={recentInvoices}
          isLoading={invoicesLoading}
          actions={actions}
          isBusy={isBusy}
        />
      </ControlSection>

      {dialogs}
    </ControlShell>
  );
}
