

## Fix Invoice PDF Overlay Coordinates

The user provided exact pixel coordinates on a 794×1123px canvas (A4). jsPDF uses mm on 210×297mm. Conversion: `x_mm = x_px × (210/794)`, `y_mm = y_px × (297/1123)`.

### File: `src/lib/invoicePdf.ts`

**Update `POS` coordinates** (all values converted from user's px to mm):

| Field | User px | Converted mm |
|-------|---------|-------------|
| invoiceNo | 173, 171 | 45.7, 45.2 |
| date | 171, 198 | 45.2, 52.4 |
| billTo line1 | 465, 201 | 123.0, 53.2 |
| billTo line2 | 465, 229 | 123.0, 60.6 |
| billTo line3 | 465, 257 | 123.0, 68.0 |
| billTo line4 | 465, 285 | 123.0, 75.4 |
| table row1 desc | 93, 341, w445 | 24.6, 90.2, maxW 117.7 |
| table qty | 567+34 right-align | 159.0 (right edge) |
| table rate | 642+72 right-align | 188.8 (right edge) |
| table total | 727+58 right-align | 207.7 (right edge) |
| subtotal | 692+92 right-align | 207.3, 130.1 |
| vat | 692+92 right-align | 207.3, 139.1 |
| grand total | 661+123 right-align | 207.3, 149.4 |
| payment bank | labels 70/values 150, top 706 | 18.5/39.7, 186.7 |
| payment acctName | 150, 738 | 39.7, 195.2 |
| payment sortCode | 150, 771 | 39.7, 203.9 |
| payment acctNo | 150, 804 | 39.7, 212.6 |
| payment terms | 70, 838 | 18.5, 221.6 |

**Behavioral changes**:
- Remove `invoiceNoTopRight` (user didn't specify a separate header position)
- Description clamped to single line with ellipsis (already done, verify `maxW` respects column boundary)
- qty/rate/total use `align: "right"` at right edge of their columns
- subtotal/VAT/grand total right-aligned at right edge
- Re-enable `drawPaymentDetails` call in `generateInvoicePdf` (currently missing)
- Payment uses label+value pattern with separate x positions for labels vs values

No other files change. No migrations needed.

