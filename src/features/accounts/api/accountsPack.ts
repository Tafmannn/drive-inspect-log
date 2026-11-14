/**
 * The accountant's pack: one ZIP for a period holding the summary workbook,
 * generic CSVs, Xero import files, every invoice PDF and every receipt.
 */
import JSZip from "jszip";
import { invoicePdfFileName } from "@/lib/invoicePdf";
import { getInvoicePdf } from "@/features/invoicing/api/invoiceLifecycle";
import type { OrgInvoiceSettings } from "@/features/invoicing/api/invoiceDocument";
import { fetchReceiptBlob } from "@/features/invoicing/api/receiptImages";
import { guessExtension } from "@/features/invoicing/api/receiptExport";
import {
  buildExpensesCsv,
  buildSalesCsv,
  buildXeroBillsCsv,
  buildXeroSalesCsv,
  expenseReceiptStem,
  inPeriod,
  summarise,
  wasIssued,
  xeroManualDocuments,
  type AccountsSummary,
  type Period,
  type XeroConfig,
} from "../lib/accountsReports";
import { buildAccountsSheets } from "../lib/accountsWorkbook";
import { buildXlsx } from "../lib/xlsxLite";
import type { AccountsData } from "./accountsData";

/** Excel needs a UTF-8 BOM to read "£" correctly from a CSV. */
const BOM = "﻿";

export interface AccountsPackOptions {
  period: Period;
  data: AccountsData;
  settings: OrgInvoiceSettings;
  xero: XeroConfig;
  includeInvoicePdfs: boolean;
  includeReceipts: boolean;
  /** yyyy-mm-dd */
  today: string;
  onProgress?: (done: number, total: number, label: string) => void;
}

export interface AccountsPackResult {
  blob: Blob;
  fileName: string;
  summary: AccountsSummary;
  invoicePdfs: number;
  receiptFiles: number;
  /** Things that could not be included, in plain words. */
  problems: string[];
}

export function xeroReadme(manualDocs: string[], vatRegistered: boolean): string {
  return [
    "IMPORTING INTO XERO",
    "===================",
    "",
    "Xero_Sales_Invoices.csv",
    "  Xero: Business > Invoices > Import.",
    "  Choose 'Tax Exclusive' for the UnitAmount field.",
    "  Invoices arrive as drafts for you to approve. They were already sent to",
    "  the client from the app - do NOT send them again from Xero.",
    "  Payments are not imported: mark invoices as paid in Xero (or let the bank",
    "  feed match them).",
    "",
    "Xero_Bills.csv",
    "  Xero: Business > Bills to pay > Import.",
    "  Choose 'Tax Inclusive' for the UnitAmount field.",
    "  One bill per expense. If your bank feed is connected, these purchases will",
    "  ALSO appear as bank transactions - match each bank line to its bill rather",
    "  than creating a new spend, or the cost is counted twice. Ask your",
    "  accountant which route they prefer before importing bills.",
    "",
    "Before the first import",
    "  - Check the account codes and tax rate names in the file match your Xero",
    "    organisation (Accounting > Chart of accounts, and Tax rates). They can be",
    "    changed in the app under Exports > Xero settings.",
    vatRegistered
      ? "  - The business is VAT registered: sales use the standard sales rate."
      : "  - The business is not VAT registered: every line uses the 'No VAT' rate.",
    "  - Importing the same file twice creates duplicates. Import each period once.",
    "",
    manualDocs.length
      ? "NOT IN THE SALES FILE - enter these in Xero by hand (Xero's import cannot\ntake credit notes, and a cancelled invoice needs its credit note applied):\n" +
        manualDocs.map((d) => `  - ${d}`).join("\n")
      : "Every issued invoice in this period is in the sales file.",
    "",
  ].join("\n");
}

function packReadme(s: AccountsSummary, businessName: string | null | undefined, today: string): string {
  const gbp = (n: number) => `£${n.toFixed(2)}`;
  return [
    `ACCOUNTS PACK - ${businessName ?? ""}`.trim(),
    `${s.period.label}: ${s.period.from} to ${s.period.to}`,
    `Prepared ${today}`,
    "",
    `Income (ex VAT):        ${gbp(s.income)}   (${s.invoiceCount} invoices, ${s.creditNoteCount} credit notes)`,
    `Expenses (amount paid): ${gbp(s.expenses)}   (${gbp(s.expensesRecharged)} recharged to clients, ${gbp(s.expensesOwnCost)} own cost)`,
    `Unpaid invoices:        ${gbp(s.outstanding)}   (all dates, as at ${today})`,
    ...(s.draftsExcluded ? [`NOT INCLUDED: ${s.draftsExcluded} draft invoice(s) dated in this period that were never marked as sent.`] : []),
    ...(s.expensesWithoutReceipt ? [`NOTE: ${s.expensesWithoutReceipt} expense(s) have no receipt (shown as MISSING in Expenses.csv).`] : []),
    "",
    "CONTENTS",
    "  Accounts_Summary.xlsx   Summary, by month, sales, income by client, expenses, unpaid invoices",
    "  Sales_Invoices.csv      Every invoice and credit note issued in the period",
    "  Expenses.csv            Every expense in the period; 'Receipt file' points into Receipts/",
    "  Xero/                   Import files for Xero, with instructions",
    "  Invoices/               A PDF of each invoice and credit note, exactly as issued",
    "  Receipts/               Receipt images, named <date>_<expense ref>_<category>_<amount>",
    "",
    "BASIS",
    "  Income is counted by invoice date, when the invoice was issued (not when it was paid).",
    "  Expenses are counted by the date on the expense.",
    "  Only what is recorded in the app is included: driver pay, vehicle running costs,",
    "  insurance, bank charges and similar are not.",
    "",
  ].join("\n");
}

export async function buildAccountsPack(opts: AccountsPackOptions): Promise<AccountsPackResult> {
  const { period, data, settings, xero, today } = opts;
  const summary = summarise(data.invoices, data.expenses, period, today);
  const issued = data.invoices.filter((i) => wasIssued(i) && inPeriod(i.issue_date, period));
  const expenses = data.expenses.filter((e) => inPeriod(e.date, period));
  const problems: string[] = [];

  const zip = new JSZip();
  zip.file("README.txt", packReadme(summary, settings.business.name, today));
  zip.file(
    "Accounts_Summary.xlsx",
    await buildXlsx(
      buildAccountsSheets(summary, data.invoices, data.expenses, {
        businessName: settings.business.name,
        vatRegistered: settings.vatRegistered,
        generatedOn: today,
      }),
    ),
  );
  zip.file("Sales_Invoices.csv", BOM + buildSalesCsv(issued));
  zip.file("Expenses.csv", BOM + buildExpensesCsv(expenses));
  // No BOM on the Xero files: an importer may read it as part of the first header.
  zip.file("Xero/Xero_Sales_Invoices.csv", buildXeroSalesCsv(issued, xero));
  zip.file("Xero/Xero_Bills.csv", buildXeroBillsCsv(expenses, xero, settings.vatRegistered));
  zip.file(
    "Xero/README.txt",
    xeroReadme(xeroManualDocuments(issued).map((d) => d.invoice_number), settings.vatRegistered),
  );

  const issuedIds = new Set(issued.map((i) => i.id));
  const records = opts.includeInvoicePdfs ? data.invoiceRecords.filter((r) => issuedIds.has(r.id)) : [];
  const receiptJobs = opts.includeReceipts
    ? expenses.flatMap((e) => (data.receipts.get(e.id) ?? []).map((file, i) => ({ e, file, i })))
    : [];
  const total = records.length + receiptJobs.length;
  let done = 0;

  let invoicePdfs = 0;
  for (const record of records) {
    opts.onProgress?.(done, total, `Invoice ${record.invoice_number}`);
    try {
      zip.file(`Invoices/${invoicePdfFileName(record.invoice_number)}`, await getInvoicePdf(record, settings));
      invoicePdfs++;
    } catch {
      problems.push(`Invoice ${record.invoice_number}: PDF could not be produced`);
    }
    done++;
  }

  let receiptFiles = 0;
  for (const { e, file, i } of receiptJobs) {
    const stem = expenseReceiptStem(e) + (i === 0 ? "" : String.fromCharCode(97 + Math.min(i, 25)));
    opts.onProgress?.(done, total, `Receipt ${stem}`);
    const blob = await fetchReceiptBlob(file);
    if (blob) {
      zip.file(`Receipts/${stem}${guessExtension(file.url, blob.type)}`, blob);
      receiptFiles++;
    } else {
      problems.push(`Receipt ${stem}: file could not be downloaded`);
    }
    done++;
  }
  opts.onProgress?.(total, total, "Finishing");

  if (problems.length) zip.file("PROBLEMS.txt", problems.join("\n") + "\n");

  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    fileName: `accounts_pack_${period.from}_to_${period.to}.zip`,
    summary,
    invoicePdfs,
    receiptFiles,
    problems,
  };
}
