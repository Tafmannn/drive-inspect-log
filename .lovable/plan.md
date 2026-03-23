## Redesign Invoice PDF to Match Branded Reference

The reference image shows a significantly different visual design from the current generator. This is still programmatic jsPDF — no template images — but with a branded layout.

### Key visual differences from current code

1. **Dark navy header banner** — full-width filled rectangle spanning top ~55mm. White logo on left with "AXENTRA VEHICLES" + "Precision in Every Move" tagline. "INVOICE" in large white text on right, invoice number below it in smaller white text.
2. **Two side-by-side bordered boxes** below header — Left box: "Invoice No:" and "Date:" key-value pairs. Right box: dark "BILL TO" header bar with white text, then customer name (bold), company, address lines below.
3. **Charges table** — thin navy header with white text columns: "Description", "Qty", "Rate", "Total". No "Charges" section title. Column headers use "Rate" not "Unit Price", "Total" not "Amount".
4. **Totals block** — right-aligned: "Subtotal" + value, "VAT (0%)" + value, then a dark filled row with "Total:" label and bold amount in navy/accent color.
5. **Payment Information** — bold section title with underline, then "Bank : Lloyds Bank", "Account Name: Terrence Tapfumaneyi trading as Axentra Vehicle Logistics", "Sort Code: 04-00-03", "Account Number: 24861835". Italic note at bottom.
6. **No footer bar** visible in the reference.

### File: `src/lib/invoicePdf.ts` — full rewrite

**Constants updates:**

- `AXENTRA_BANK.bankName` → "Monzo"
- `AXENTRA_BANK.accountName` → "Terrence Tapfumaneyi trading as Axentra Vehicle Logistics"
- Add `THEME.navy` = `[17, 29, 58]` (dark header background)

**New section functions:**

- `drawHeaderBanner(doc, data, logo)` — draws a full-width navy filled rect (~55mm tall). Places white logo (using `axentra-logo-white.png`) on left. Draws "AXENTRA VEHICLES" + tagline in white. "INVOICE" large right-aligned in white, invoice number below.
- `drawMetaAndBillTo(doc, data, y)` — draws two side-by-side bordered boxes. Left box (~half width): Invoice No + Date as label/value rows. Right box: dark "BILL TO" header strip, then client name (bold), company, address lines.
- `buildChargesTable(doc, items, y)` — autoTable with navy header, columns renamed to "Description", "Qty", "Rate", "Total". Right-aligned numeric columns.
- `buildTotalsBlock(doc, data, y)` — right-aligned Subtotal + VAT rows, then a dark filled rectangle row for "Total:" with bold amount.
- `drawPaymentInfo(doc, y)` — "Payment Information" bold title with underline, then label: value pairs rendered as plain text lines (not autoTable), italic reference note at bottom.

**Removed:**

- `drawSectionTitle` underline-only style (replaced with specific per-section styling)
- `drawJobDetails` section (not shown in reference — job info is embedded in line item description)
- `drawNotes` section (not visible in reference, but keep as conditional)
- `buildFooter` (not visible in reference)
- `drawKeyValueRows` generic autoTable for metadata (replaced with custom box layout)

**Logo:** Uses `axentra-logo-white.png` (already exists in `/public/`) for the dark banner header. Falls back gracefully if missing.

### File: `src/pages/InvoiceGenerator.tsx` — no changes needed

The page already builds `InvoiceData` and calls `downloadInvoicePdf()`. The interface stays compatible.