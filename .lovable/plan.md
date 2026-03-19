

## Fix Invoice PDF Overlay Alignment

### Problem Analysis

Comparing the template image against the generated PDF reveals these misalignments:

1. **Left card values too high**: Invoice No value (y:75.6) lands above the "Invoice No:" label; Date value (y:85.2) lands between the two labels instead of next to "Date:"
2. **Bill To lines overlap heading**: First line (y:79.5) collides with the static "BILL TO" text — needs to start ~8mm lower
3. **Table data overlaps header row**: startY:113 places the first data row on top of the "Description | Qty | Rate | Total" header; needs ~124
4. **Totals too high**: Follow-on from table shift
5. **Payment section double-rendered**: The template PNG already contains ALL payment info (Bank, Account Name, Sort Code, Account Number, terms) as static text. The overlay draws it again at wrong coordinates, producing duplicate/overlapping text
6. **Top-right invoice number**: Slightly high at y:30; "INVOICE" heading on template sits around y:42

### Coordinate Corrections (POS object only)

```
invoiceNoTopRight.y:  30.0  →  47.0   (below INVOICE heading)

leftCard.invoiceNo:   x:69, y:75.6  →  x:48, y:77.5  (after "Invoice No:" label)
leftCard.date:        x:69, y:85.2  →  x:34, y:87.5  (after "Date:" label)

rightCard.line1.y:    79.5  →  86.5   (below BILL TO heading + divider)
rightCard.line2.y:    85.7  →  92.5
rightCard.line3.y:    91.9  →  98.5
rightCard.line4.y:    98.1  →  104.5

table.startY:         113.0  →  124.0  (first body row, below header)
table.rowGap:         7.3    →  8.5    (match template row spacing)

totals.subtotal.y:    148.0  →  158.0
totals.vat.y:         156.0  →  166.0
totals.total.y:       167.0  →  178.0

notes.title.y:        227.0  →  260.0  (below payment section)
notes.body.y:         232.0  →  265.0
```

### Payment Section — Remove Overlay

The template PNG **already contains** all payment details as static burned-in text:
- "Payment Information" heading
- "Bank : Monzo Bank"
- "Account Name: Terrence Tapfumaneyi trading as Axentra Vehicle Logistics"
- "Sort Code: 04-00-03"
- "Account Number: 24861835"
- "Payable within 7 days. Please use invoice number as payment reference."

The `drawPaymentDetails()` call in `generateInvoicePdf()` must be **removed** to stop double-rendering. The function itself can stay but simply won't be called.

### Summary of File Changes

**`src/lib/invoicePdf.ts`** — coordinates + one call removal:
1. Update `POS` coordinate values as listed above
2. Remove the `drawPaymentDetails(doc, data);` call from `generateInvoicePdf()`
3. No changes to typography sizes, font family, draw function logic, totals math, VAT logic, or template path

