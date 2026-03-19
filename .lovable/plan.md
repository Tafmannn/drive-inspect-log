## Invoice PDF Overlay Coordinate Tuning

**Confirmed preconditions:**

- Active renderer is the template-overlay path (loads `/invoice-template.png` as background, overlays text via jsPDF).
- Template image contains only static design elements; all dynamic values are overlaid in code.
- Template renders at full A4 (210×297mm) with no scaling drift.
- Keep current bank details

**2. `POS.rightCard` — lower Bill To lines by ~3mm so first line sits below the BILL TO heading/divider**

- line1.y: 76.5 → 79.5
- line2.y: 82.7 → 85.7
- line3.y: 88.9 → 91.9
- line4.y: 95.1 → 98.1

**3. `POS.table.startY` — lower line-item baseline by ~3mm into the body row**

- startY: 109.6 → 113.0

**4. `POS.totals` — shift down proportionally to match lowered table**

- subtotal.y: 145.0 → 148.0
- vat.y: 153.0 → 156.0
- total.y: 164.3 → 167.0

**5. `POS.payment` — shift down to follow adjusted totals and match template lines**

- bank.y: 183.3 → 186.0
- accountName.y: 190.8 → 193.5
- sortCode.y: 198.1 → 200.8
- accountNumber.y: 205.4 → 208.1
- terms.y: 213.3 → 216.0
- accountName.maxW: 132 → 160 (longer name needs more room)

**6. `POS.notes` — shift down to follow payment**

- title.y: 224.0 → 227.0
- body.y: 229.0 → 232.0

**No changes** to typography sizes, font family, draw functions logic, template path, totals math, VAT logic, or rendering pipeline. All existing clipping, alignment, and style rules preserved.