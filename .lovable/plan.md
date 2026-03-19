

## Fix Invoice PDF Overlay Alignment

### Problem Analysis (comparing template vs generated PDF)

1. **Top-right invoice number overlaps "INVOICE" heading**: The white `INV-AX26-1003` text at y:47 is rendering directly ON TOP of the template's static "INVOICE" text (~y:36-45). It needs to sit below the underline, around y:52.

2. **Left card "Invoice No:" value misaligned**: The template's "Invoice No:" label baseline is at ~68mm. The value at y:77.5 sits a full line below instead of on the same baseline. Should be ~y:69.

3. **Left card "Date:" value misaligned**: Same issue — the "Date:" label is at ~76mm, value at y:87.5 is too low. Should be ~y:77.

4. **Bill To lines**: With the left card fixes, the right card lines also need to come up slightly. First line at y:86.5 is a touch low below "BILL TO" heading (~y:64). Adjusting to start at ~y:72 with 6mm spacing.

5. **Table startY too low**: Template header row baseline is at ~100mm. With startY:124 the first data row is 24mm below the header — too much gap. Should be ~108-110.

6. **Totals drift**: Follow the table shift upward proportionally.

7. **Payment section**: Template already contains ALL payment text as static pixels. `drawPaymentDetails` is correctly not called. No change needed.

### Coordinate Corrections (POS object only)

```
invoiceNoTopRight.y:    47.0  →  52.0    (below INVOICE underline)

leftCard.invoiceNo:     x:48, y:77.5  →  x:48, y:69.0   (same baseline as label)
leftCard.date:          x:34, y:87.5  →  x:34, y:77.0   (same baseline as label)

rightCard.line1.y:      86.5  →  72.0   (below BILL TO + padding)
rightCard.line2.y:      92.5  →  78.0
rightCard.line3.y:      98.5  →  84.0
rightCard.line4.y:      104.5 →  90.0

table.startY:           124.0  →  109.0  (first body row, just below header)
table.rowGap:           8.5    →  8.0

totals.subtotal.y:      158.0  →  148.0
totals.vat.y:           166.0  →  155.0
totals.total.y:         178.0  →  166.0

notes.title.y:          260.0  →  230.0  (below totals, above payment)
notes.body.y:           265.0  →  235.0
```

### Summary

**File**: `src/lib/invoicePdf.ts`
- Update