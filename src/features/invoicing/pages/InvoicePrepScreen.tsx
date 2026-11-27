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
import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
import { InvoiceCorrectionQueue } from "../components/InvoiceCorrectionQueue";
import { ReadyToBillPanel } from "../components/ReadyToBillPanel";
import { RecordSelfBillPanel } from "../components/RecordSelfBillPanel";
import { isSelfBilled } from "@/lib/billingMethod";
import { getInvoiceJobIds } from "../api/createInvoice";
import { startPackInBackground, usePackState } from "../api/packPreparation";
import { fuelPolicyInvoiceNote, rechargeCategoriesFor } from "@/lib/fuelPolicy";
import { settingsToPdfFields } from "../api/invoiceDocument";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { useEvidenceOverrides } from "@/hooks/useEvidenceOverrides";
import { toast } from "@/hooks/use-toast";
import {
  FileText,
  ReceiptPoundSterling as Receipt,
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
import { generateInvoicePdf, type InvoiceData } from "@/lib/invoicePdf";
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

/** The date a job became billable: completion, or the Abort confirmation. */
function jobDate(job: EligibleJob): string | null {
  return job.completed_at ?? job.abort_confirmed_at ?? null;
}

/** "Leeds → Bristol" from whatever route ends the job has. */
function routeText(job: EligibleJob): string {
  const from = job.pickup_city || job.pickup_postcode;
  const to = job.delivery_city || job.delivery_postcode;
  return from && to ? `${from} → ${to}` : from || to || "";
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
  const [searchParams] = useSearchParams();
  const correctionClientId = searchParams.get("clientId");
  const correctionJobId = searchParams.get("abortCorrectionJob");
  const correctionAutoSelected = useRef<string | null>(null);
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
  // Only used while VAT registered. Fixed at the UK standard rate — never typed per
  // invoice, so a slip can't put a wrong VAT figure on a legal document.
  const vatRate = DEFAULT_VAT_RATE;

  // Client's PO / reference for this invoice
  const [clientRef, setClientRef] = useState("");

  const createInvoice = useCreateInvoice();
  // The invoice that was just created. Job selection is cleared after
  // creation (the jobs stop being eligible), so the success card works from
  // this record — replaced by the live list row once that has refreshed.
  const [createdInvoice, setCreatedInvoice] = useState<InvoiceRecord | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Every invoice + credit note (re-downloadable at any time)
  const { data: recentInvoices, isLoading: invoicesLoading } = useInvoices(200);
  const { actions, isBusy, dialogs } = useInvoiceActions(settings);

  // Fetch eligible jobs
  const { data: eligibleJobs, isLoading, error: eligibleError } = useEligibleJobs(selectedClient, {
    dateFrom: dateFrom?.toISOString(),
    dateTo: dateTo?.toISOString(),
  });

  const jobs = useMemo(() => eligibleJobs ?? [], [eligibleJobs]);

  // An Abort invoice correction can deep-link back to Invoice Prep.
  // Only preselect a job that is actually returned as eligible for that client.
  useEffect(() => {
    if (!correctionClientId || !allClients?.some((client) => client.id === correctionClientId)) return;
    if (selectedClientId !== correctionClientId) {
      setSelectedClientId(correctionClientId);
      setSelectedJobIds(new Set());
    }
  }, [allClients, correctionClientId, selectedClientId]);

  useEffect(() => {
    if (!correctionJobId || !correctionClientId || selectedClientId !== correctionClientId
        || !eligibleJobs || correctionAutoSelected.current === correctionJobId) return;
    const target = eligibleJobs.find((job) => job.id === correctionJobId);
    if (!target || !target.readiness?.ready || target.readiness?.alreadyInvoiced) return;
    setSelectedJobIds(new Set([correctionJobId]));
    correctionAutoSelected.current = correctionJobId;
  }, [correctionJobId, correctionClientId, selectedClientId, eligibleJobs]);

  // Re-invoicing a cancelled invoice: once that client's eligible jobs load, tick the
  // cancelled invoice's jobs that are invoice-ready and not on another live invoice.
  const [reinvoice, setReinvoice] = useState<{ clientId: string; jobIds: string[]; invoiceNumber: string } | null>(null);
  useEffect(() => {
    if (!reinvoice || selectedClientId !== reinvoice.clientId || !eligibleJobs) return;
    const wanted = new Set(reinvoice.jobIds);
    const ready = eligibleJobs.filter(
      (j) => wanted.has(j.id) && j.readiness?.ready && !j.readiness?.alreadyInvoiced,
    );
    setSelectedJobIds(new Set(ready.map((j) => j.id)));
    const skipped = reinvoice.jobIds.length - ready.length;
    toast({
      title: ready.length > 0 ? `Re-invoicing ${reinvoice.invoiceNumber}` : `Nothing to re-invoice from ${reinvoice.invoiceNumber}`,
      description:
        skipped > 0
          ? `${ready.length} job${ready.length === 1 ? "" : "s"} ticked. ${skipped} could not be: already on another invoice, not invoice-ready, or no longer this client's. Check the list below.`
          : `${ready.length} job${ready.length === 1 ? "" : "s"} ticked. Review the lines and expenses, then create the invoice.`,
      variant: ready.length > 0 ? undefined : "destructive",
    });
    setReinvoice(null);
  }, [reinvoice, selectedClientId, eligibleJobs]);

  const selectedJobs = useMemo(
    () => jobs.filter((j) => selectedJobIds.has(j.id)),
    [jobs, selectedJobIds]
  );
  const selectedJobIdList = useMemo(() => selectedJobs.map((j) => j.id), [selectedJobs]);

  // The link is only a convenience: server-side invoice checks still reverify
  // the approved Abort fee and whether a previous invoice was fully cancelled.
  // Expenses that can be recharged for the selected jobs. Fuel is ticked by
  // default only for clients who pay fuel separately (clients.fuel_policy =
  // 'recharged', the default); an explicit tick/untick by the admin always wins.
  const clientFuelPolicy = selectedClient?.fuel_policy;
  const rechargeDefaults = useMemo(() => rechargeCategoriesFor(clientFuelPolicy), [clientFuelPolicy]);
  const fuelNote = useMemo(
    () => fuelPolicyInvoiceNote(clientFuelPolicy, selectedClient?.company || selectedClient?.name || "this client"),
    [clientFuelPolicy, selectedClient?.company, selectedClient?.name],
  );
  const { data: billableExpenses, isLoading: expensesLoading } = useBillableExpenses(selectedJobIdList);
  const [expenseOverrides, setExpenseOverrides] = useState<Map<string, boolean>>(new Map());
  const expenses = useMemo(() => billableExpenses ?? [], [billableExpenses]);
  const selectedExpenseIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of expenses) {
      const picked = expenseOverrides.get(e.id) ?? rechargeDefaults.includes(e.category);
      if (picked) ids.add(e.id);
    }
    return ids;
  }, [expenses, expenseOverrides, rechargeDefaults]);
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

  // A job with no price can't be invoiced: an unknown amount is never billed as £0.
  const unpricedSelected = useMemo(
    () => selectedJobs.filter((j) => j.status !== "aborted" && !(Number(j.total_price) > 0)),
    [selectedJobs],
  );

  const poMissing = !!selectedClient?.po_required && !clientRef.trim();

  // Admin override (UI-only): allow selecting jobs that are not invoice-ready.
  // Acknowledgements are scoped to this Invoice Prep screen and persist for
  // the session. Already-invoiced rows can never be overridden.
  const invoiceOverrides = useEvidenceOverrides("invoice-prep");
  const isOverridden = (jobId: string) => invoiceOverrides.isAcknowledged(jobId);

  // Self-billing clients (e.g. Movex) invoice themselves: we record their paid invoice
  // against the jobs instead of raising one, so evidence/readiness rules don't apply.
  const selfBilled = isSelfBilled(selectedClient);

  const isJobSelectable = (job: EligibleJob) => {
    if (job.readiness?.alreadyInvoiced) return false;
    if (selfBilled) return true;
    if (job.readiness?.ready) return true;
    // An Abort is billable only once its fee is approved: no override.
    if (job.status === "aborted") return false;
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

  // Already-invoiced jobs are history: hidden unless asked for, and never counted as work.
  const [showInvoiced, setShowInvoiced] = useState(false);
  const isMobile = useIsMobile();
  const billableJobs = useMemo(() => jobs.filter((j) => !j.readiness?.alreadyInvoiced), [jobs]);
  const invoicedCount = jobs.length - billableJobs.length;
  const visibleJobs = showInvoiced ? jobs : billableJobs;
  const selectableJobs = visibleJobs.filter(isJobSelectable);

  const toggleAll = () => {
    if (selectedJobIds.size === selectableJobs.length && selectableJobs.length > 0) {
      setSelectedJobIds(new Set());
    } else {
      setSelectedJobIds(new Set(selectableJobs.map((j) => j.id)));
    }
  };

  // ── Row pieces shared by the phone cards and the desktop table ──
  const renderStatusBadge = (job: EligibleJob) =>
    selfBilled && !job.readiness?.alreadyInvoiced ? (
      <Badge variant="outline" className="text-[9px] text-muted-foreground border-muted-foreground/30">
        Awaiting their invoice
      </Badge>
    ) : (
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
  );

  const renderOverride = (job: EligibleJob) =>
    !selfBilled && !job.readiness?.ready && !job.readiness?.alreadyInvoiced && job.status !== "aborted" ? (
      <RoleScope admin>
        <Button
          type="button"
          size="sm"
          variant={isOverridden(job.id) ? "ghost" : "outline"}
          className="h-7 px-2 text-[11px]"
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
    ) : null;

  const renderPrice = (job: EligibleJob) =>
    job.status === "aborted" ? (
      job.abort_fee != null ? (
        <span className="text-sm font-semibold tabular-nums text-foreground" title="Approved Abort fee">
          {fmtGbp(job.abort_fee)}
          <span className="block text-[11px] font-normal text-muted-foreground">Abort fee</span>
        </span>
      ) : (
        <span className="text-xs text-warning font-medium">Fee not approved</span>
      )
    ) : job.total_price ? (
      <span className="text-sm font-semibold tabular-nums text-foreground">{fmtGbp(job.total_price)}</span>
    ) : (
      <span className="text-xs text-warning font-medium">No price</span>
    );

  // Reset selection when client changes
  const handleClientChange = (id: string | null) => {
    setSelectedClientId(id);
    setSelectedJobIds(new Set());
    setExpenseOverrides(new Map());
    setClientRef("");
    setCreatedInvoice(null);
  };

  const handleReinvoice = async (inv: InvoiceRecord) => {
    if (!inv.client_id || !allClients?.some((c) => c.id === inv.client_id)) {
      toast({
        title: "Pick the client first",
        description: `${inv.invoice_number} is not linked to an active client profile. Select the client below and tick the jobs.`,
        variant: "destructive",
      });
      return;
    }
    try {
      const jobIds = await getInvoiceJobIds(inv.id);
      if (jobIds.length === 0) {
        toast({ title: "No jobs on this invoice", description: `${inv.invoice_number} has no job lines to re-invoice.`, variant: "destructive" });
        return;
      }
      handleClientChange(inv.client_id);
      setReinvoice({ clientId: inv.client_id, jobIds, invoiceNumber: inv.invoice_number });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      toast({ title: "Could not start re-invoice", description: (e as Error).message, variant: "destructive" });
    }
  };

  const createDisabled =
    createInvoice.isPending ||
    selectedJobs.length === 0 ||
    unpricedSelected.length > 0 ||
    expensesLoading ||
    settingsLoading ||
    !settings;

  // Create invoice handler
  const handleCreateInvoice = async (opts?: { thenEmail?: boolean }) => {
    if (!selectedClient || selectedJobs.length === 0 || !settings) return;
    if (unpricedSelected.length > 0) return;
    if (isSelfBilled(selectedClient)) return; // they invoice themselves: record theirs instead
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
      const record = draftToRecord({
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
        });
      setCreatedInvoice(record);
      // Build the send pack (invoice, receipts, PODs) now, while the admin reviews, so
      // Send / Mark as sent only has to reuse it.
      startPackInBackground(record, settings.orgId, settings);
      setSelectedJobIds(new Set());
      setExpenseOverrides(new Map());
      setClientRef("");
      const expenseCount = result.draft.expenseLines.length;
      toast({
        title: "Invoice Created",
        description:
          `${result.invoiceNumber} — ${result.jobCount} job${result.jobCount !== 1 ? "s" : ""}` +
          (expenseCount ? ` + ${expenseCount} expense${expenseCount !== 1 ? "s" : ""}` : "") +
          " invoiced." +
          (opts?.thenEmail ? " Confirm the recipient to send it." : ""),
      });
      // "Create & email": straight into the confirm-recipient step for the new draft.
      if (opts?.thenEmail) actions.email(record);
    } catch (err) {
      toast({
        title: "Invoice Creation Failed",
        description: err instanceof Error && err.message ? err.message : "Something went wrong.",
        variant: "destructive",
      });
    }
  };

  // Preview the clean financial invoice; original receipts are in the pack.
  const handlePreviewPdf = async () => {
    if (!selectedClient || selectedJobs.length === 0) return;
    setIsPreviewing(true);
    try {
      const issueDate = todayIso();
      const jobRefs = new Map(selectedJobs.map((j) => [j.id, jobRef(j)]));
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
        ...settingsToPdfFields(settings),
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
  const createdPack = usePackState(createdRecord?.id);

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
      <ControlSection title="1. Select Client" description="Pick a client with work waiting, or search for any client profile">
        <div className="mb-4">
          <ReadyToBillPanel
            selectedClientId={selectedClientId}
            onSelect={(id) => {
              if (id !== selectedClientId) handleClientChange(id);
            }}
          />
        </div>
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
                {billableJobs.length} {selfBilled ? "not yet recorded" : "to invoice"}
                {invoicedCount > 0 && (
                  <>
                    {" · "}
                    <button
                      type="button"
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => setShowInvoiced((v) => !v)}
                      aria-pressed={showInvoiced}
                    >
                      {showInvoiced ? "Hide" : "Show"} {invoicedCount} already invoiced
                    </button>
                  </>
                )}
              </span>
            </div>
          </FilterBar>

          <ControlSection
            title="2. Select Jobs"
            description={
              selfBilled
                ? "Tick the jobs on their invoice"
                : "Completed moves and approved Abort-fee claims for this client"
            }
            flush
          >
            {selfBilled && (
              <div className="p-3 pb-0">
                <WarningCallout severity="info">
                  {(selectedClient?.company || selectedClient?.name || "This client").trim()} invoices you themselves
                  (self-billing), so you don't raise an invoice. When their paid invoice arrives, tick its jobs
                  and record it below — the income then shows in your accounts.
                </WarningCallout>
              </div>
            )}
            {isLoading && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Loading jobs…
              </div>
            )}
            {!isLoading && eligibleError && (
              <div className="p-6 text-center text-sm text-destructive" role="alert">
                Could not load this client's jobs: {(eligibleError as Error).message}
              </div>
            )}
            {!isLoading && !eligibleError && visibleJobs.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {invoicedCount > 0
                  ? "Everything for this client is already invoiced."
                  : "No jobs to invoice for this client."}
              </div>
            )}
            {!isLoading && visibleJobs.length > 0 && (
              isMobile ? (
                /* Phone: one tappable card per job */
                <ul className="divide-y divide-border">
                  {visibleJobs.map((job) => {
                    const selectable = isJobSelectable(job);
                    const checked = selectedJobIds.has(job.id);
                    return (
                      <li key={job.id}>
                        <div
                          role="checkbox"
                          aria-checked={checked}
                          aria-disabled={!selectable}
                          aria-label={`Select job ${job.external_job_number || job.id.slice(0, 8)}`}
                          tabIndex={selectable ? 0 : -1}
                          onClick={() => toggleJob(job.id)}
                          onKeyDown={(e) => {
                            if (e.key === " " || e.key === "Enter") {
                              e.preventDefault();
                              toggleJob(job.id);
                            }
                          }}
                          className={cn(
                            "flex gap-3 px-4 py-3 transition-colors",
                            selectable ? "cursor-pointer active:bg-muted" : "opacity-60",
                            checked && "bg-primary/5",
                          )}
                        >
                          <Checkbox checked={checked} disabled={!selectable} tabIndex={-1} aria-hidden className="mt-0.5 pointer-events-none" />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {job.external_job_number || job.id.slice(0, 8)}
                              </span>
                              <span className="shrink-0 text-right">{renderPrice(job)}</span>
                            </div>
                            <p className="text-xs text-foreground">
                              {job.vehicle_reg}
                              <span className="text-muted-foreground"> {job.vehicle_make} {job.vehicle_model}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {routeText(job)}
                              {routeText(job) ? " · " : ""}
                              {shortDate(jobDate(job))}
                              {(job.receiptCount ?? 0) > 0 ? ` · ${job.receiptCount} receipt${job.receiptCount === 1 ? "" : "s"}` : ""}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {renderStatusBadge(job)}
                              {renderOverride(job)}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                /* Tablet / desktop: table */
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              selectableJobs.length > 0 &&
                              selectedJobIds.size === selectableJobs.length
                            }
                            onCheckedChange={toggleAll}
                            aria-label="Select all"
                          />
                        </TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider">Job</TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider">Vehicle</TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider">Completed / Aborted</TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">Price</TableHead>
                        <TableHead className="text-[11px] font-medium uppercase tracking-wider text-right">Receipts</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleJobs.map((job) => (
                        <TableRow
                          key={job.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            selectedJobIds.has(job.id) ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50",
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
                              {renderStatusBadge(job)}
                              {renderOverride(job)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-foreground">{job.vehicle_reg}</span>
                            <span className="text-xs text-muted-foreground ml-1.5">
                              {job.vehicle_make} {job.vehicle_model}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{shortDate(jobDate(job))}</span>
                          </TableCell>
                          <TableCell className="text-right">{renderPrice(job)}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-xs tabular-nums text-muted-foreground">{job.receiptCount ?? 0}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            )}
          </ControlSection>
        </>
      )}


      {/* Created-invoice success card — independent of job selection, which
          is cleared on creation. This is where the invoice gets downloaded. */}
      {!!createdRecord && (
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
              {createdRecord.status === "draft" && createdPack && (
                <p
                  role="status"
                  className={cn(
                    "mt-1 flex items-center gap-1.5 text-xs",
                    createdPack.state === "failed" ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {createdPack.state === "building" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                  {createdPack.state === "ready" && <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />}
                  {createdPack.state === "building"
                    ? `Pack: ${createdPack.message.replace(/…$/, "")} — you can carry on; it's ready before you send.`
                    : createdPack.state === "ready"
                    ? "Pack ready (invoice, receipts and PODs) — sending will be quick."
                    : `Pack couldn't be prepared yet (${createdPack.error}). It will be tried again when you send.`}
                </p>
              )}
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

      {selfBilled && selectedJobs.length > 0 && selectedClient && settings && (
        <ControlSection title="3. Record their paid invoice" description="Match it to exactly what they paid">
          <RecordSelfBillPanel
            client={selectedClient}
            jobs={selectedJobs}
            orgId={settings.orgId}
            onRecorded={() => setSelectedJobIds(new Set())}
          />
        </ControlSection>
      )}

      {!selfBilled && selectedJobs.length > 0 && (
        <>
          {/* Step 3: Rechargeable expenses */}
          <ControlSection
            title="3. Rechargeable Expenses"
            description="Tick the expenses to bill on this invoice. Only ticked expenses and their receipts are included."
            flush
          >
            {fuelNote && (
              <div className="p-3 pb-0">
                <WarningCallout severity="info">{fuelNote}</WarningCallout>
              </div>
            )}
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

          {unpricedSelected.length > 0 && (
            <WarningCallout severity="critical">
              {unpricedSelected.map((j) => jobRef(j)).join(", ")}{" "}
              {unpricedSelected.length === 1 ? "has" : "have"} no price. Set the price on the job, or untick it,
              before creating the invoice.
            </WarningCallout>
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
                          {!!line.detail && (
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
                        <span className="text-muted-foreground">VAT ({vatRate}%)</span>
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
                    onClick={() => void handlePreviewPdf()}
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
                    variant="outline"
                    onClick={() => void handleCreateInvoice()}
                    disabled={createDisabled}
                    className="gap-2"
                  >
                    {createInvoice.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Create Draft
                  </Button>
                  <Button
                    onClick={() => void handleCreateInvoice({ thenEmail: true })}
                    disabled={createDisabled}
                    className="gap-2"
                  >
                    {createInvoice.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    Create &amp; Email
                  </Button>
                </div>
              </div>
            </div>
          </ControlSection>
        </>
      )}

      <InvoiceCorrectionQueue onReview={(invoice, reason) => actions.cancel(invoice, reason)} />

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
          onReinvoice={handleReinvoice}
        />
      </ControlSection>

      {dialogs}
    </ControlShell>
  );
}
