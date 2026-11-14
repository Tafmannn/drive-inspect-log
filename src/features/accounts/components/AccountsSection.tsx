/**
 * AccountsSection — accountant-ready downloads for a chosen period:
 * the accounts pack (summary workbook, CSVs, invoice PDFs, receipts) and
 * Xero import files, plus a watch on the VAT registration threshold.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, FileDown, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/expenseApi";
import { useOrgInvoiceSettings } from "@/features/invoicing/hooks/useInvoiceSettings";
import { downloadBlob } from "@/features/invoicing/api/receiptExport";
import { buildAccountsPack } from "../api/accountsPack";
import { useAccountsData, useXeroConfig } from "../hooks/useAccounts";
import {
  buildXeroBillsCsv,
  buildXeroSalesCsv,
  inPeriod,
  periodPresets,
  summarise,
  vatThresholdStatus,
  wasIssued,
  xeroImportableInvoices,
  type Period,
} from "../lib/accountsReports";

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function gbp(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const CUSTOM = "custom";

export function AccountsSection() {
  const today = useMemo(todayIso, []);
  const presets = useMemo(() => periodPresets(today), [today]);
  const [presetIndex, setPresetIndex] = useState<string>("0");
  const [customFrom, setCustomFrom] = useState(presets[0].from);
  const [customTo, setCustomTo] = useState(presets[0].to);

  const period: Period | null = useMemo(() => {
    if (presetIndex !== CUSTOM) return presets[Number(presetIndex)] ?? presets[0];
    if (!customFrom || !customTo || customFrom > customTo) return null;
    return { from: customFrom, to: customTo, label: "Custom period" };
  }, [presetIndex, presets, customFrom, customTo]);

  const { data: settings } = useOrgInvoiceSettings();
  const { data, isLoading, error } = useAccountsData(period);
  const [xero, saveXero, resetXero] = useXeroConfig();

  const [includePdfs, setIncludePdfs] = useState(true);
  const [includeReceipts, setIncludeReceipts] = useState(true);
  const [busy, setBusy] = useState<"pack" | "xero-sales" | "xero-bills" | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const summary = useMemo(
    () => (data && period ? summarise(data.invoices, data.expenses, period, today) : null),
    [data, period, today],
  );
  const vat = useMemo(() => (data ? vatThresholdStatus(data.invoices, today) : null), [data, today]);
  const issuedInPeriod = useMemo(
    () => (data && period ? data.invoices.filter((i) => wasIssued(i) && inPeriod(i.issue_date, period)) : []),
    [data, period],
  );
  const ready = !!data && !!period && !!settings;

  const fail = (title: string, err: unknown) =>
    toast({ title, description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });

  const downloadPack = async () => {
    if (!data || !period || !settings) return;
    setBusy("pack");
    try {
      const pack = await buildAccountsPack({
        period,
        data,
        settings,
        xero,
        includeInvoicePdfs: includePdfs,
        includeReceipts,
        today,
        onProgress: (done, total, label) => setProgress({ done, total, label }),
      });
      downloadBlob(pack.blob, pack.fileName);
      toast(
        pack.problems.length
          ? {
              title: `Accounts pack downloaded — ${pack.problems.length} item${pack.problems.length === 1 ? "" : "s"} missing`,
              description: "See PROBLEMS.txt inside the ZIP.",
              variant: "destructive",
            }
          : {
              title: "Accounts pack downloaded",
              description: `${pack.invoicePdfs} invoice PDF${pack.invoicePdfs === 1 ? "" : "s"}, ${pack.receiptFiles} receipt file${pack.receiptFiles === 1 ? "" : "s"}.`,
            },
      );
    } catch (err) {
      fail("Accounts pack failed", err);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  const downloadXeroSales = () => {
    if (!data || !period) return;
    setBusy("xero-sales");
    try {
      const count = xeroImportableInvoices(issuedInPeriod).length;
      if (count === 0) {
        toast({ title: "Nothing to export", description: "No issued invoices in this period. Drafts are not exported." });
        return;
      }
      // No BOM: an importer may read it as part of the first column header.
      downloadBlob(
        new Blob([buildXeroSalesCsv(issuedInPeriod, xero)], { type: "text/csv;charset=utf-8;" }),
        `xero_sales_invoices_${period.from}_to_${period.to}.csv`,
      );
      toast({ title: "Xero sales file downloaded", description: `${count} invoice${count === 1 ? "" : "s"}. Import as Tax Exclusive.` });
    } catch (err) {
      fail("Xero export failed", err);
    } finally {
      setBusy(null);
    }
  };

  const downloadXeroBills = () => {
    if (!data || !period || !settings) return;
    setBusy("xero-bills");
    try {
      if (data.expenses.length === 0) {
        toast({ title: "Nothing to export", description: "No expenses in this period." });
        return;
      }
      downloadBlob(
        new Blob([buildXeroBillsCsv(data.expenses, xero, settings.vatRegistered)], { type: "text/csv;charset=utf-8;" }),
        `xero_bills_${period.from}_to_${period.to}.csv`,
      );
      toast({
        title: "Xero bills file downloaded",
        description: `${data.expenses.length} expense${data.expenses.length === 1 ? "" : "s"}. Import as Tax Inclusive.`,
      });
    } catch (err) {
      fail("Xero export failed", err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Accounts</CardTitle>
        <CardDescription>
          Reports for your accountant and import files for Xero. Income is counted from invoices that have been
          issued (emailed or marked as sent) — drafts are left out.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* VAT registration threshold */}
        {vat && settings && !settings.vatRegistered && (
          <div
            className={cn(
              "rounded-lg border p-3 space-y-2",
              vat.level === "ok" ? "border-border bg-muted/30" : "border-warning/40 bg-warning/5",
              vat.level === "exceeded" && "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">VAT registration threshold</p>
              <p className="text-sm tabular-nums">
                {gbp(vat.turnover)} of {gbp(vat.threshold)} <span className="text-muted-foreground">({vat.percent}%)</span>
              </p>
            </div>
            <Progress value={Math.min(100, vat.percent)} aria-label="Share of the VAT registration threshold used" />
            <p className="text-xs text-muted-foreground">
              Invoiced income in the last 12 months ({vat.from} to {vat.to}), excluding drafts.{" "}
              {vat.level === "exceeded" && (
                <span className="font-medium text-destructive">
                  Over the threshold: you must register for VAT within 30 days of the end of the month you went over.
                  Speak to your accountant now.
                </span>
              )}
              {vat.level === "close" && (
                <span className="font-medium text-warning">
                  Within 5% of the threshold. Speak to your accountant about registering.
                </span>
              )}
              {vat.level === "approaching" && (
                <span className="font-medium text-warning">Over 80% of the threshold. Keep an eye on this each month.</span>
              )}
            </p>
          </div>
        )}

        {/* Period */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="accounts-period">Period</Label>
            <select
              id="accounts-period"
              value={presetIndex}
              onChange={(e) => setPresetIndex(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {presets.map((p, i) => (
                <option key={`${p.from}-${p.to}`} value={String(i)}>
                  {i === 0 ? `This month (${p.label})` : i === 1 ? `Last month (${p.label})` : p.label}
                </option>
              ))}
              <option value={CUSTOM}>Custom dates…</option>
            </select>
          </div>
          {presetIndex === CUSTOM && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="accounts-from">From</Label>
                <Input id="accounts-from" type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="accounts-to">To</Label>
                <Input id="accounts-to" type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
              </div>
            </>
          )}
        </div>
        {presetIndex === CUSTOM && !period && (
          <p className="text-xs text-destructive">Choose a start date that is on or before the end date.</p>
        )}

        {/* Figures */}
        {error ? (
          <p className="text-sm text-destructive">
            Could not load the figures: {error instanceof Error ? error.message : "unknown error"}
          </p>
        ) : isLoading || !summary ? (
          period && <p className="text-sm text-muted-foreground">Loading figures…</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: "Income (ex VAT)", value: gbp(summary.income), note: `${summary.invoiceCount} invoice${summary.invoiceCount === 1 ? "" : "s"}` },
                { label: "Expenses", value: gbp(summary.expenses), note: `${gbp(summary.expensesRecharged)} recharged` },
                { label: "Income less expenses", value: gbp(summary.profit), note: "Logged in the app only" },
                { label: "Unpaid invoices", value: gbp(summary.outstanding), note: `${summary.aged.length} outstanding, all dates` },
              ].map((t) => (
                <div key={t.label} className="rounded-lg border border-border p-3">
                  <dt className="text-xs text-muted-foreground">{t.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{t.value}</dd>
                  <p className="text-[11px] text-muted-foreground">{t.note}</p>
                </div>
              ))}
            </dl>
            {(summary.draftsExcluded > 0 || summary.expensesWithoutReceipt > 0) && (
              <div className="space-y-1.5">
                {summary.draftsExcluded > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {summary.draftsExcluded} draft invoice{summary.draftsExcluded === 1 ? " is" : "s are"} dated in this
                    period and not counted. If {summary.draftsExcluded === 1 ? "it was" : "they were"} sent to the
                    client, mark {summary.draftsExcluded === 1 ? "it" : "them"} as sent in Invoice Prep.
                  </p>
                )}
                {summary.expensesWithoutReceipt > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {summary.expensesWithoutReceipt} expense{summary.expensesWithoutReceipt === 1 ? " has" : "s have"} no
                    receipt on file.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Accounts pack */}
        <div className="space-y-2.5 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Accounts pack</p>
            <p className="text-xs text-muted-foreground">
              One ZIP: summary workbook (Excel), sales and expenses lists, Xero import files, and the supporting
              documents.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includePdfs} onCheckedChange={(v) => setIncludePdfs(v === true)} />
              Include invoice PDFs
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeReceipts} onCheckedChange={(v) => setIncludeReceipts(v === true)} />
              Include receipt files
            </label>
          </div>
          <Button onClick={downloadPack} disabled={!ready || busy !== null}>
            {busy === "pack" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
            Download accounts pack
          </Button>
          {busy === "pack" && progress && progress.total > 0 && (
            <div className="space-y-1">
              <Progress value={(progress.done / progress.total) * 100} aria-label="Building the accounts pack" />
              <p className="text-[11px] text-muted-foreground">
                {progress.done} of {progress.total} files · {progress.label}
              </p>
            </div>
          )}
        </div>

        {/* Xero */}
        <div className="space-y-2.5 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-medium">Xero import files</p>
            <p className="text-xs text-muted-foreground">
              Import each period once — importing a file twice creates duplicates. Invoices arrive in Xero as drafts
              to approve; do not send them again from Xero.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadXeroSales} disabled={!ready || busy !== null}>
              <FileDown className="mr-2 h-4 w-4" /> Sales invoices (CSV)
            </Button>
            <Button variant="outline" onClick={downloadXeroBills} disabled={!ready || busy !== null}>
              <FileDown className="mr-2 h-4 w-4" /> Bills from expenses (CSV)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Bills: if your bank feed is connected to Xero, these purchases also arrive as bank transactions. Match
            them to the bills rather than creating new spend, or ask your accountant whether to import bills at all.
          </p>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                <ChevronDown className="mr-1 h-3.5 w-3.5" /> Xero settings (account codes and tax rates)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                These must match your Xero organisation exactly (Accounting → Chart of accounts, and Tax rates). The
                defaults are Xero's standard UK codes — confirm them with your accountant. Saved in this browser.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <XeroField label="Sales account" value={xero.salesAccount} onChange={(v) => saveXero({ ...xero, salesAccount: v })} />
                <XeroField label="Recharged expenses account" value={xero.rechargeAccount} onChange={(v) => saveXero({ ...xero, rechargeAccount: v })} />
                <XeroField label="Other expenses account" value={xero.expenseAccounts.default ?? ""} onChange={(v) => saveXero({ ...xero, expenseAccounts: { ...xero.expenseAccounts, default: v } })} />
                {EXPENSE_CATEGORIES.filter((c) => c !== "Misc / Other").map((c) => (
                  <XeroField
                    key={c}
                    label={c}
                    value={xero.expenseAccounts[c] ?? ""}
                    onChange={(v) => saveXero({ ...xero, expenseAccounts: { ...xero.expenseAccounts, [c]: v } })}
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <XeroField label="Tax rate: no VAT" value={xero.taxNoVat} onChange={(v) => saveXero({ ...xero, taxNoVat: v })} />
                <XeroField label="Tax rate: sales 20%" value={xero.taxSalesStandard} onChange={(v) => saveXero({ ...xero, taxSalesStandard: v })} />
                <XeroField label="Tax rate: purchases 20%" value={xero.taxPurchasesStandard} onChange={(v) => saveXero({ ...xero, taxPurchasesStandard: v })} />
              </div>
              <Button variant="outline" size="sm" onClick={resetXero}>
                Reset to Xero defaults
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  );
}

function XeroField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = `xero-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" maxLength={60} />
    </div>
  );
}
