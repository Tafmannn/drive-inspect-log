

## Rollback Invoice PDF to Code-Driven Generator

### What changes

**Replace**: `src/lib/invoicePdf.ts` -- complete rewrite from template-overlay to programmatic jsPDF + jspdf-autotable generation.

**Minor edit**: `src/pages/InvoiceGenerator.tsx` -- update the `InvoiceData` interface usage (the page already passes structured data; only the type shape needs alignment with the new generator).

**No other files change.** The page component already handles form state, line items, and calls `downloadInvoicePdf(data)`. The new generator honours that same entry point.

---

### New `invoicePdf.ts` architecture

Follows the same engineering pattern as `podPdf.ts`: margin constants, `ensureSpace`, `setTextStyle`, `autoTable` for tabular data, flow-layout with a cursor `y` that advances section by section.

**Sections rendered top-to-bottom:**

1. **Header** -- "INVOICE" title (large, right-aligned), "AXENTRA VEHICLE LOGISTICS" + website (left-aligned), optional logo (loaded from `/axentra-logo.png`, gracefully skipped if missing)
2. **Invoice metadata** -- key-value pairs: Invoice No, Issue Date, Due Date, Payment Terms, Job Ref
3. **Bill To** -- client name (bold), company, address lines (split on comma/newline)
4. **Job Details** -- Vehicle, Registration, Route (only rendered if data present)
5. **Charges table** -- `autoTable` with columns: Description, Qty, Unit Price, Amount. Right-aligned numeric columns.
6. **Totals block** -- Subtotal, VAT line, Total Due (bold, larger font)
7. **Notes** -- wrapped text, only if present
8. **Payment Information** -- key-value block: Bank (Monzo Bank), Account Name, Sort Code, Account Number, payment reference note
9. **Footer** -- centered: "Axentra Vehicle Logistics - axentravehicles.com - info@axentravehicles.com"

**Helper functions created:**
- `formatCurrency(n)` -- safe GBP formatting
- `safeText(val, fallback)` -- null-safe string
- `drawSectionTitle(doc, title, y)` -- bold underlined section heading with `ensureSpace`
- `drawKeyValueRows(doc, rows, y)` -- plain autoTable for label/value pairs
- `ensureSpace(doc, y, needed)` -- page-break guard
- `renderLogoIfAvailable(doc, y)` -- async logo load, returns adjusted y
- `buildChargesTable(doc, items, y)` -- striped autoTable
- `buildTotalsBlock(doc, subtotal, vat, total, y)` -- right-aligned totals
- `buildFooter(doc)` -- page-numbered footer on all pages

**Data contract** -- keeps the existing `InvoiceData` and `InvoiceLineItem` interfaces but removes `vatRate` from the top-level (computed from line items or defaulted to 0). Adds optional `logoUrl` field.

**Removed:**
- Template image loading (`/invoice-template.png` dependency)
- All absolute coordinate constants (`POS` object)
- `addTemplateBackground` function
- Pixel-to-mm conversion constants

**No breaking changes to `InvoiceGenerator.tsx`** -- the page calls `downloadInvoicePdf(buildInvoiceData())` which continues to work. The `InvoiceData` shape stays compatible (existing fields preserved, new optional fields added).

---

### Technical notes

- `jspdf-autotable` is already a project dependency (used by `podPdf.ts`)
- Logo handling mirrors `podPdf.ts` pattern (`loadImage` → `drawImageContain`)
- Currency uses `£` prefix with `.toFixed(2)`, no Unicode issues
- Route arrow uses `->` instead of `→` to avoid glyph issues in Helvetica
- Long descriptions wrap inside autoTable cells (overflow: "linebreak")
- Footer rendered last across all pages using `doc.getNumberOfPages()` loop

