/**
 * The accountant's summary workbook: one tab per question an accountant
 * asks — how much came in, from whom, what went out, and who still owes.
 */
import {
  EXPENSE_HEADERS,
  SALES_HEADERS,
  expenseRows,
  inPeriod,
  salesRows,
  wasIssued,
  type AccountExpense,
  type AccountInvoice,
  type AccountsSummary,
} from "./accountsReports";
import type { XlsxCell, XlsxSheet } from "./xlsxLite";

const money = (n: number): XlsxCell => ({ money: n });

/** Columns of the Sales / Expenses tabs that hold money (by header text). */
const MONEY_HEADERS = new Set([
  "Net (transport)", "Net (recharged expenses)", "Net total", "VAT", "Total",
  "Amount paid (gross)", "VAT on receipt", "Net", "Amount recharged",
]);

function withMoney(headers: string[], rows: unknown[][]): XlsxCell[][] {
  return rows.map((row) =>
    row.map((cell, c) => {
      if (typeof cell === "number" && MONEY_HEADERS.has(headers[c])) return money(cell);
      return cell as XlsxCell;
    }),
  );
}

export function buildAccountsSheets(
  summary: AccountsSummary,
  invoices: AccountInvoice[],
  expenses: AccountExpense[],
  meta: { businessName?: string | null; vatRegistered: boolean; generatedOn: string },
): XlsxSheet[] {
  const period = summary.period;
  const issued = invoices.filter((i) => wasIssued(i) && inPeriod(i.issue_date, period));
  const periodExpenses = expenses.filter((e) => inPeriod(e.date, period));

  const summarySheet: XlsxSheet = {
    name: "Summary",
    headers: ["Item", "Amount (£)", "Notes"],
    widths: [38, 16, 70],
    rows: [
      ["Business", "", meta.businessName ?? ""],
      ["Period", "", `${period.label}: ${period.from} to ${period.to}`],
      ["Prepared on", "", meta.generatedOn],
      ["VAT registered", "", meta.vatRegistered ? "Yes" : "No - no VAT charged on sales"],
      [],
      [{ bold: "Income (sales, excluding VAT)" }, money(summary.income), `${summary.invoiceCount} invoice(s), net of ${summary.creditNoteCount} credit note(s). By invoice date.`],
      ...(meta.vatRegistered || summary.vatCharged !== 0
        ? [["VAT charged on sales", money(summary.vatCharged), ""] as XlsxCell[]]
        : []),
      [{ bold: "Expenses (amount paid)" }, money(summary.expenses), "Every expense logged in the period, by expense date."],
      ["  of which recharged to clients", money(summary.expensesRecharged), "Recovered through invoices - also included in income above."],
      ["  of which own cost", money(summary.expensesOwnCost), "Not recharged to a client."],
      [{ bold: "Income less expenses" }, money(summary.profit), "Before driver pay, vehicle costs and anything not logged in the app."],
      [],
      ["Unpaid invoices (all dates)", money(summary.outstanding), "As at the date prepared. See the Unpaid invoices tab."],
      ...(summary.draftsExcluded > 0
        ? [["Draft invoices NOT included", summary.draftsExcluded, "Drafts have not been issued. Mark them as sent in the app to include them."] as XlsxCell[]]
        : []),
      ...(summary.expensesWithoutReceipt > 0
        ? [["Expenses with no receipt", summary.expensesWithoutReceipt, "Shown as MISSING on the Expenses tab."] as XlsxCell[]]
        : []),
      [],
      [{ bold: "By month" }],
      [{ bold: "Month" }, { bold: "Income" }, { bold: "Expenses / Recharged / Income less expenses" }],
      ...summary.months.map(
        (m): XlsxCell[] => [m.month, money(m.income), `Expenses ${m.expenses.toFixed(2)}  |  recharged ${m.expensesRecharged.toFixed(2)}  |  income less expenses ${m.profit.toFixed(2)}`],
      ),
    ],
  };

  const monthSheet: XlsxSheet = {
    name: "By month",
    headers: ["Month", "Income (ex VAT)", "VAT charged", "Expenses", "Recharged", "Income less expenses"],
    rows: summary.months.map((m) => [m.month, money(m.income), money(m.vatCharged), money(m.expenses), money(m.expensesRecharged), money(m.profit)]),
  };

  const clientSheet: XlsxSheet = {
    name: "Income by client",
    headers: ["Client", "Invoices", "Income (ex VAT)", "Unpaid"],
    rows: summary.clients.map((c) => [c.client, c.invoices, money(c.income), money(c.outstanding)]),
  };

  const agedSheet: XlsxSheet = {
    name: "Unpaid invoices",
    headers: ["Invoice", "Client", "Issued", "Due", "Amount", "Days overdue", "Age"],
    rows: summary.aged.map((a) => [a.invoice_number, a.client, a.issue_date, a.due_date ?? "", money(a.total), a.daysOverdue, a.bucket]),
  };

  return [
    summarySheet,
    monthSheet,
    { name: "Sales", headers: SALES_HEADERS, rows: withMoney(SALES_HEADERS, salesRows(issued)) },
    clientSheet,
    { name: "Expenses", headers: EXPENSE_HEADERS, rows: withMoney(EXPENSE_HEADERS, expenseRows(periodExpenses)) },
    agedSheet,
  ];
}
